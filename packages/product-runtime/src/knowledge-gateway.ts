/** @file API v2 KnowledgeSource 生产防腐层 / Production anti-corruption layer for API v2 KnowledgeSource. */

import {
  cancelWorkspaceJob,
  createKnowledgeWorkflowApi,
  createWorkspaceKnowledgeSource,
  getWorkspaceKnowledgeSource,
  listWorkspaceKnowledgeSourcePage,
  updateWorkspaceKnowledgeSource,
  type ApiV2HttpClient,
  type Job,
  type KnowledgeWorkflowApi,
  type KnowledgeSource,
  type KnowledgeSourceRepresentation,
  type KnowledgeVisibilityPolicy,
  type ProblemDetails,
  type PublicKnowledgeSourceConfig,
  type UpdateKnowledgeSourceRequest
} from '@ai-job-workspace/product-api-v2'

import {
  asUiConcurrencyToken,
  asUiKnowledgeSourceCursor,
  asUiOpaqueId,
  cloneUiJsonValue,
  type KnowledgeGateway,
  type UiCreateManualKnowledgeNoteCommand,
  type UiIngestKnowledgeFileCommand,
  type UiKnowledgeSearchResult,
  type UiKnowledgeSourcePageRead,
  type UiKnowledgeSourceRead,
  type UiKnowledgeSourcePatch,
  type UiUpdateKnowledgeSourceCommand,
  type UiJsonObject,
  type UiKnowledgeProblem,
  type UiKnowledgeSource,
  type UiKnowledgeSourceAuthority,
  type UiKnowledgeSourcePage,
  type UiSearchKnowledgeCommand,
  type UiKnowledgeVisibilityPolicy,
  type UiOpaqueId,
  type UiPublicKnowledgeSourceConfig
} from '@ai-job-workspace/app/application'

const MAXIMUM_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024
const MAXIMUM_INGESTION_WAIT_MILLISECONDS = 120_000

function knowledgeCommandId(kind: string): string {
  return `${kind}_${globalThis.crypto.randomUUID()}`
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_KNOWLEDGE_FILE_BYTES) {
    throw new RangeError('Knowledge files must contain between 1 byte and 10 MiB.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function uploadBytes(
  session: Awaited<ReturnType<KnowledgeWorkflowApi['createUploadSession']>>,
  bytes: ArrayBuffer,
  signal?: AbortSignal
): Promise<void> {
  const headers = new Headers()
  for (const [name, value] of Object.entries(session.requiredHeaders)) {
    if (name.toLowerCase() !== 'content-length') headers.set(name, value)
  }
  const response = await globalThis.fetch(session.uploadUrl, {
    body: bytes,
    headers,
    method: 'PUT',
    ...(signal === undefined ? {} : { signal })
  })
  if (response.status !== 204) {
    throw new Error(`knowledge.upload_failed.${response.status}`)
  }
}

async function ingestionDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      (): void => {
        globalThis.clearTimeout(timer)
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Knowledge ingestion was cancelled.', 'AbortError')
        )
      },
      { once: true }
    )
  })
}

function uploadVisibility(): KnowledgeVisibilityPolicy {
  return {
    agent_grants: [
      {
        agent_scope: 'general_chat',
        allowed_operations: ['retrieve', 'quote', 'summarize'],
        effect: 'allow'
      },
      {
        agent_scope: 'resume_assistant',
        allowed_operations: ['retrieve', 'quote', 'summarize', 'derive'],
        effect: 'allow'
      },
      {
        agent_scope: 'interview_coach',
        allowed_operations: ['retrieve', 'quote', 'summarize', 'derive'],
        effect: 'allow'
      }
    ],
    allow_external_model_processing: true,
    allowed_model_regions: ['global'],
    default_effect: 'deny',
    policy_version: 1,
    retention_days: 365,
    sensitivity: 'normal',
    session_override_allowed: false
  }
}

/**
 * @brief 将已严格解码的 extensions 映射到 UI JSON / Map strictly decoded extensions into UI JSON.
 * @param value product-api-v2 已验证的 JSON object / JSON object validated by product-api-v2.
 * @return 不共享容器的 UI JSON object / UI JSON object sharing no containers.
 */
function mapExtensions(value: Readonly<Record<string, unknown>>): UiJsonObject {
  return cloneUiJsonValue(value as UiJsonObject)
}

/**
 * @brief 映射完整 RFC 9457 Problem / Map a complete RFC 9457 Problem.
 * @param problem product-api-v2 已验证 Problem / Problem validated by product-api-v2.
 * @return Knowledge 领域内的无损问题投影 / Lossless problem projection in the Knowledge domain.
 */
function mapProblem(problem: ProblemDetails): UiKnowledgeProblem {
  return {
    code: problem.code,
    detail: problem.detail,
    errors: problem.errors.map((error) => ({
      code: error.code,
      messageKey: error.message_key,
      params: error.params === null ? null : { ...error.params },
      pointer: error.pointer
    })),
    extensions: problem.extensions === null ? null : mapExtensions(problem.extensions),
    instance: problem.instance,
    requestId: asUiOpaqueId<'request'>(problem.request_id),
    retryable: problem.retryable,
    status: problem.status,
    title: problem.title,
    type: problem.type
  }
}

/**
 * @brief 映射不含 secret 的来源配置并保留 ref 三态 / Map secret-free source configuration while preserving ref tri-state.
 * @param config product-api-v2 已验证配置 / Configuration validated by product-api-v2.
 * @return 领域公开配置 / Domain public configuration.
 */
function mapPublicConfig(config: PublicKnowledgeSourceConfig): UiPublicKnowledgeSourceConfig {
  /** @brief 按字段存在性构造的配置 / Configuration constructed by field presence. */
  const mapped: {
    filename?: string
    mediaType?: string
    url?: string
    cloneUrl?: string
    ref?: string | null
    resumeId?: UiOpaqueId<'resume'>
  } = {}
  if (config.filename !== undefined) mapped.filename = config.filename
  if (config.media_type !== undefined) mapped.mediaType = config.media_type
  if (config.url !== undefined) mapped.url = config.url
  if (config.clone_url !== undefined) mapped.cloneUrl = config.clone_url
  if (config.ref !== undefined) mapped.ref = config.ref
  if (Object.hasOwn(config, 'resume_id') && config.resume_id !== undefined) {
    mapped.resumeId = asUiOpaqueId<'resume'>(config.resume_id)
  }
  return mapped
}

/**
 * @brief 从 canonical 策略映射完整领域策略 / Map a complete domain policy from the canonical policy.
 * @param policy product-api-v2 已验证策略 / Policy validated by product-api-v2.
 * @return 不增加 effective-access 推断的领域策略 / Domain policy without inferred effective access.
 */
function mapVisibility(policy: KnowledgeVisibilityPolicy): UiKnowledgeVisibilityPolicy {
  return {
    agentGrants: policy.agent_grants.map((grant) => ({
      agentScope: grant.agent_scope,
      allowedOperations: [...grant.allowed_operations],
      effect: grant.effect
    })),
    allowExternalModelProcessing: policy.allow_external_model_processing,
    allowedModelRegions: [...policy.allowed_model_regions],
    defaultEffect: policy.default_effect,
    policyVersion: policy.policy_version,
    retentionDays: policy.retention_days,
    sensitivity: policy.sensitivity,
    sessionOverrideAllowed: policy.session_override_allowed
  }
}

/**
 * @brief 将领域策略映射回 canonical 完整策略 / Map a domain policy back to the complete canonical policy.
 * @param policy 用户确认的完整领域策略 / Complete domain policy confirmed by the user.
 * @return product-api-v2 将再次严格编码的策略 / Policy to be strictly encoded again by product-api-v2.
 */
function mapVisibilityRequest(policy: UiKnowledgeVisibilityPolicy): KnowledgeVisibilityPolicy {
  return {
    agent_grants: policy.agentGrants.map((grant) => ({
      agent_scope: grant.agentScope,
      allowed_operations: [...grant.allowedOperations],
      effect: grant.effect
    })),
    allow_external_model_processing: policy.allowExternalModelProcessing,
    allowed_model_regions: [...policy.allowedModelRegions],
    default_effect: policy.defaultEffect,
    policy_version: policy.policyVersion,
    retention_days: policy.retentionDays,
    sensitivity: policy.sensitivity,
    session_override_allowed: policy.sessionOverrideAllowed
  }
}

/**
 * @brief 映射 product-api-v2 KnowledgeSource / Map a product-api-v2 KnowledgeSource.
 * @param source 严格解码的权威来源 / Strictly decoded authoritative source.
 * @return 无损领域表示 / Lossless domain representation.
 */
export function mapApiV2KnowledgeSource(source: KnowledgeSource): UiKnowledgeSource {
  /** @brief extensions 以外的必需领域字段 / Required domain fields excluding extensions. */
  const mapped = {
    createdAt: source.created_at,
    currentVersionId:
      source.current_version_id === null
        ? null
        : asUiOpaqueId<'knowledge-source-version'>(source.current_version_id),
    enabled: source.enabled,
    id: asUiOpaqueId<'knowledge-source'>(source.id),
    ingestion: {
      chunkCount: source.ingestion.chunk_count,
      documentCount: source.ingestion.document_count,
      lastProblem:
        source.ingestion.last_problem === null ? null : mapProblem(source.ingestion.last_problem),
      lastSuccessAt: source.ingestion.last_success_at,
      status: source.ingestion.status
    },
    name: source.name,
    publicConfig: mapPublicConfig(source.public_config),
    revision: source.revision,
    sourceType: source.source_type,
    updatedAt: source.updated_at,
    visibility: mapVisibility(source.visibility),
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
  return source.extensions === undefined
    ? mapped
    : { ...mapped, extensions: mapExtensions(source.extensions) }
}

/**
 * @brief 映射与强 ETag 原子配对的表示 / Map a representation atomically paired with a strong ETag.
 * @param representation product-api-v2 权威表示 / Authoritative product-api-v2 representation.
 * @return Knowledge 领域权威 / Knowledge domain authority.
 */
function mapAuthority(representation: KnowledgeSourceRepresentation): UiKnowledgeSourceAuthority {
  return {
    concurrencyToken: asUiConcurrencyToken(representation.entityTag),
    source: mapApiV2KnowledgeSource(representation.value)
  }
}

/**
 * @brief 映射非空领域 patch / Map a non-empty domain patch.
 * @param patch 名称和/或完整策略 patch / Name and/or complete-policy patch.
 * @return canonical JSON Merge Patch / Canonical JSON Merge Patch.
 */
function mapUpdateRequest(patch: UiKnowledgeSourcePatch): UpdateKnowledgeSourceRequest {
  if (patch.name !== undefined) {
    return {
      name: patch.name,
      ...(patch.visibility === undefined
        ? {}
        : { visibility: mapVisibilityRequest(patch.visibility) })
    }
  }
  return { visibility: mapVisibilityRequest(patch.visibility) }
}

/**
 * @brief API v2 KnowledgeSource 防腐层 / API v2 KnowledgeSource anti-corruption layer.
 * @note 所有 wire 解码、请求编码、租户路径校验与成功后不确定性均委托给 product-api-v2 / All wire decoding, request encoding, tenant-path validation, and post-success uncertainty are delegated to product-api-v2.
 */
export class ApiV2KnowledgeGateway implements KnowledgeGateway {
  /** @brief 由产品组合根注入的完整 v2 HTTP client / Complete v2 HTTP client injected by the product composition root. */
  readonly #client: ApiV2HttpClient
  readonly #workflow: KnowledgeWorkflowApi

  /**
   * @brief 构造正式 Knowledge Gateway / Construct the production Knowledge gateway.
   * @param client 带当前内存 Bearer session 的 API v2 client / API v2 client carrying the current in-memory Bearer session.
   */
  constructor(client: ApiV2HttpClient) {
    this.#client = client
    this.#workflow = createKnowledgeWorkflowApi(client)
  }

  /** @inheritdoc */
  async listKnowledgeSourcePage(input: UiKnowledgeSourcePageRead): Promise<UiKnowledgeSourcePage> {
    const page = await listWorkspaceKnowledgeSourcePage(this.#client, {
      cursor: input.cursor,
      limit: input.limit,
      signal: input.signal,
      workspaceId: input.workspaceId
    })
    const items = page.items.map(mapApiV2KnowledgeSource)
    return page.page.has_more
      ? {
          hasMore: true,
          items,
          nextCursor: asUiKnowledgeSourceCursor(page.page.next_cursor!)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async getKnowledgeSource(input: UiKnowledgeSourceRead): Promise<UiKnowledgeSourceAuthority> {
    return mapAuthority(
      await getWorkspaceKnowledgeSource(this.#client, {
        signal: input.signal,
        sourceId: input.sourceId,
        workspaceId: input.workspaceId
      })
    )
  }

  /** @inheritdoc */
  async createManualKnowledgeNote(
    command: UiCreateManualKnowledgeNoteCommand
  ): Promise<UiKnowledgeSourceAuthority> {
    return mapAuthority(
      await createWorkspaceKnowledgeSource(this.#client, {
        idempotencyKey: command.commandId,
        request: {
          input: {
            content: command.content,
            source_type: 'manual_note'
          },
          name: command.name,
          visibility: mapVisibilityRequest(command.visibility)
        },
        ...(command.signal === undefined ? {} : { signal: command.signal }),
        workspaceId: command.workspaceId
      })
    )
  }

  /** @inheritdoc */
  async updateKnowledgeSource(
    command: UiUpdateKnowledgeSourceCommand
  ): Promise<UiKnowledgeSourceAuthority> {
    return mapAuthority(
      await updateWorkspaceKnowledgeSource(this.#client, {
        ifMatch: command.concurrencyToken,
        request: mapUpdateRequest(command.patch),
        sourceId: command.sourceId,
        ...(command.signal === undefined ? {} : { signal: command.signal }),
        workspaceId: command.workspaceId
      })
    )
  }

  /** @inheritdoc */
  async ingestKnowledgeFile(
    command: UiIngestKnowledgeFileCommand
  ): Promise<UiKnowledgeSourceAuthority> {
    command.onProgress?.('hashing')
    const digest = await sha256Hex(command.bytes)
    command.signal?.throwIfAborted()
    command.onProgress?.('creating-upload')
    const upload = await this.#workflow.createUploadSession({
      filename: command.filename,
      idempotencyKey: knowledgeCommandId('knowledge_upload'),
      mediaType: command.mediaType,
      sha256: digest,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      sizeBytes: command.bytes.byteLength,
      workspaceId: command.workspaceId
    })
    if (upload.workspaceId !== command.workspaceId || upload.status !== 'created') {
      throw new Error('knowledge.upload_session_invalid')
    }
    command.onProgress?.('uploading')
    await uploadBytes(upload, command.bytes, command.signal)
    command.onProgress?.('verifying')
    const completed = await this.#workflow.completeUploadSession({
      idempotencyKey: knowledgeCommandId('knowledge_upload_complete'),
      sha256: digest,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      sizeBytes: command.bytes.byteLength,
      uploadId: upload.id,
      workspaceId: command.workspaceId
    })
    if (completed.status !== 'completed' || completed.artifactRef === null) {
      throw new Error('knowledge.upload_verification_failed')
    }
    command.onProgress?.('creating-source')
    const source = await this.#workflow.createFileSource({
      idempotencyKey: knowledgeCommandId('knowledge_source'),
      name: command.name,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      uploadId: upload.id,
      visibility: uploadVisibility(),
      workspaceId: command.workspaceId
    })
    command.onProgress?.('queued')
    let current = await this.#workflow.createIngestionJob({
      idempotencyKey: knowledgeCommandId('knowledge_ingestion'),
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      sourceId: source.value.id,
      workspaceId: command.workspaceId
    })
    const deadline = Date.now() + MAXIMUM_INGESTION_WAIT_MILLISECONDS
    let interval = 800
    try {
      while (current.job.status === 'queued' || current.job.status === 'running') {
        command.onProgress?.(current.job.status === 'queued' ? 'queued' : 'processing')
        if (Date.now() >= deadline) throw new Error('knowledge.ingestion_timeout')
        await ingestionDelay(interval, command.signal)
        current = await this.#workflow.getJob(command.workspaceId, current.job.id, command.signal)
        interval = Math.min(Math.round(interval * 1.5), 3_000)
      }
    } catch (error: unknown) {
      if (command.signal?.aborted === true) {
        await cancelWorkspaceJob(this.#client, {
          idempotencyKey: knowledgeCommandId('knowledge_ingestion_cancel'),
          ifMatch: current.entityTag,
          jobId: current.job.id,
          workspaceId: command.workspaceId
        }).catch((): void => undefined)
      }
      throw error
    }
    assertKnowledgeJobSucceeded(current.job)
    command.onProgress?.('completed')
    return this.getKnowledgeSource({
      signal: new AbortController().signal,
      sourceId: asUiOpaqueId<'knowledge-source'>(source.value.id),
      workspaceId: command.workspaceId
    })
  }

  /** @inheritdoc */
  async searchKnowledge(command: UiSearchKnowledgeCommand): Promise<UiKnowledgeSearchResult> {
    const result = await this.#workflow.search({
      query: command.query,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      sourceIds: command.sourceIds,
      workspaceId: command.workspaceId
    })
    return {
      hits: result.citations.map((citation) => ({
        locator: citation.locator,
        quote: citation.quote,
        score: citation.score,
        sourceId: asUiOpaqueId<'knowledge-source'>(citation.sourceId),
        versionId: asUiOpaqueId<'knowledge-source-version'>(citation.versionId)
      })),
      policyVersion: result.policyVersion,
      query: result.query
    }
  }
}

function assertKnowledgeJobSucceeded(job: Job): void {
  if (job.status === 'succeeded') return
  if (job.status === 'failed') throw new Error(job.problem.code)
  throw new Error(`knowledge.ingestion_${job.status}`)
}
