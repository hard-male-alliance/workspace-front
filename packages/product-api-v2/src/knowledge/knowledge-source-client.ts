/** @file Workspace-scoped KnowledgeSource API v2 查询与写入消费者 / Workspace-scoped KnowledgeSource API v2 query and write consumers. */

import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import type {
  ApiV2Client,
  ApiV2CreatedResourceResponse,
  ApiV2PatchJsonOptions,
  ApiV2PostJsonOptions,
  ApiV2UpdatedWriteJsonResponse
} from '../http/client'
import {
  boundedInteger,
  boundedString,
  idempotencyKey,
  opaqueId,
  strongEntityTag,
  type CursorCollection
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  encodeCreateKnowledgeSourceRequest,
  encodeUpdateKnowledgeSourceRequest,
  parseKnowledgeSource,
  parseKnowledgeSourceList,
  type CreateKnowledgeSourceRequest,
  type KnowledgeSource,
  type KnowledgeVisibilityPolicy,
  type UpdateKnowledgeSourceRequest
} from './knowledge-source'

/** @brief 一页 KnowledgeSource 响应的字节上限 / Response-byte ceiling for one KnowledgeSource page. */
const KNOWLEDGE_SOURCE_LIST_MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** @brief 单个 KnowledgeSource 响应的字节上限 / Response-byte ceiling for one KnowledgeSource. */
const KNOWLEDGE_SOURCE_MAX_RESPONSE_BYTES = 1024 * 1024

/** @brief 创建 KnowledgeSource 请求的字节上限 / Request-byte ceiling for KnowledgeSource creation. */
const CREATE_KNOWLEDGE_SOURCE_MAX_REQUEST_BYTES = 1024 * 1024

/** @brief 更新 KnowledgeSource 请求的字节上限 / Request-byte ceiling for KnowledgeSource updates. */
const UPDATE_KNOWLEDGE_SOURCE_MAX_REQUEST_BYTES = 256 * 1024

/** @brief KnowledgeSource 单页查询 / One-page KnowledgeSource query. */
export interface KnowledgeSourcePageRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 单个 KnowledgeSource 读取参数 / Parameters for reading one KnowledgeSource. */
export interface KnowledgeSourceReadRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 路径中的来源 identity / Source identity in the path. */
  readonly sourceId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带并发校验器的权威 KnowledgeSource / Authoritative KnowledgeSource carrying a concurrency validator. */
export interface KnowledgeSourceRepresentation {
  /** @brief 已严格解码的来源 / Strictly decoded source. */
  readonly value: KnowledgeSource
  /** @brief 后续 PATCH/DELETE 使用的强校验器 / Strong validator for a later PATCH or DELETE. */
  readonly entityTag: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the server. */
  readonly requestId: string
}

/** @brief 已确认创建的 KnowledgeSource / Confirmed created KnowledgeSource. */
export interface CreatedKnowledgeSourceRepresentation extends KnowledgeSourceRepresentation {
  /** @brief 新资源的规范绝对 Location / Canonical absolute Location of the new resource. */
  readonly location: string
}

/** @brief 创建 KnowledgeSource 端点所需的最小 201 HTTP 能力 / Minimal 201 HTTP capability required by KnowledgeSource creation. */
export interface KnowledgeSourceCreationHttpClient {
  /**
   * @brief 发送固定 created-resource 语义的请求 / Send a request fixed to created-resource semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 严格创建 payload / Strict creation payload.
   * @param options 幂等、大小、取消与固定 201 策略 / Idempotency, size, cancellation, and fixed 201 policy.
   * @return 带强 ETag 与 Location 的 201 表示 / 201 representation carrying a strong ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'created-resource'>
  ) => Promise<ApiV2CreatedResourceResponse>
}

/** @brief 更新 KnowledgeSource 端点所需的最小 PATCH 能力 / Minimal PATCH capability required by KnowledgeSource updates. */
export interface KnowledgeSourceUpdateHttpClient {
  /**
   * @brief 发送带 If-Match 的 JSON Merge Patch / Send a JSON Merge Patch carrying If-Match.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 严格非空 patch / Strict non-empty patch.
   * @param options 强并发校验器、大小与取消策略 / Strong concurrency validator, sizes, and cancellation policy.
   * @return 更新后的 200 表示与新强 ETag / Updated 200 representation with a new strong ETag.
   */
  readonly patchJson: (
    path: string,
    body: unknown,
    options: ApiV2PatchJsonOptions
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
}

/** @brief 创建一个 Workspace KnowledgeSource 的 command / Command for creating one Workspace KnowledgeSource. */
export interface CreateWorkspaceKnowledgeSourceCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 同一用户创建意图内稳定的幂等键 / Idempotency key stable within one user creation intent. */
  readonly idempotencyKey: string
  /** @brief canonical v2 创建请求 / Canonical v2 creation request. */
  readonly request: CreateKnowledgeSourceRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 并发安全更新一个 KnowledgeSource 的 command / Command for concurrency-safe KnowledgeSource update. */
export interface UpdateWorkspaceKnowledgeSourceCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 路径中的来源 identity / Source identity in the path. */
  readonly sourceId: string
  /** @brief 当前权威表示的强 ETag / Strong ETag of the current authoritative representation. */
  readonly ifMatch: string
  /** @brief canonical v2 非空 merge patch / Canonical v2 non-empty merge patch. */
  readonly request: UpdateKnowledgeSourceRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 比较同一序位的两个 Agent grant / Compare two Agent grants at the same sequence position.
 * @param left 左 grant / Left grant.
 * @param right 右 grant / Right grant.
 * @return scope、effect 与明确为集合的操作完全一致时为 true / True when scope, effect, and the explicitly set-like operations are equal.
 * @note canonical Schema 未声明 `agent_grants` 可重排；冲突 grant 的顺序不能由客户端擅自归一化 / The canonical Schema does not declare `agent_grants` reorderable, so the client must not normalize the order of conflicting grants.
 */
function sameAgentScopeGrant(
  left: KnowledgeVisibilityPolicy['agent_grants'][number],
  right: KnowledgeVisibilityPolicy['agent_grants'][number]
): boolean {
  /** @brief 左侧唯一操作集合 / Left unique operation set. */
  const leftOperations = [...left.allowed_operations].sort()
  /** @brief 右侧唯一操作集合 / Right unique operation set. */
  const rightOperations = [...right.allowed_operations].sort()
  return (
    left.agent_scope === right.agent_scope &&
    left.effect === right.effect &&
    leftOperations.length === rightOperations.length &&
    leftOperations.every((operation, index) => operation === rightOperations[index])
  )
}

/**
 * @brief 比较两个可见性策略的产品语义 / Compare the product semantics of two visibility policies.
 * @param left 左策略 / Left policy.
 * @param right 右策略 / Right policy.
 * @return 仅忽略 Schema 明确唯一集合的顺序后完全一致时为 true / True when fully equal after ignoring order only for Schema-declared unique sets.
 */
function sameVisibilityPolicy(
  left: KnowledgeVisibilityPolicy,
  right: KnowledgeVisibilityPolicy
): boolean {
  /** @brief 左侧模型区域集合 / Left model-region set. */
  const leftRegions = [...left.allowed_model_regions].sort()
  /** @brief 右侧模型区域集合 / Right model-region set. */
  const rightRegions = [...right.allowed_model_regions].sort()
  return (
    left.sensitivity === right.sensitivity &&
    left.default_effect === right.default_effect &&
    left.session_override_allowed === right.session_override_allowed &&
    left.allow_external_model_processing === right.allow_external_model_processing &&
    left.retention_days === right.retention_days &&
    left.policy_version === right.policy_version &&
    leftRegions.length === rightRegions.length &&
    leftRegions.every((region, index) => region === rightRegions[index]) &&
    left.agent_grants.length === right.agent_grants.length &&
    left.agent_grants.every((grant, index) => {
      /** @brief 右侧同一序位 grant / Right-side grant at the same sequence position. */
      const other = right.agent_grants[index]
      return other !== undefined && sameAgentScopeGrant(grant, other)
    })
  )
}

/**
 * @brief 校验来源 identity 与请求授权路径一致 / Validate source identity against the request authorization path.
 * @param source 已严格解码来源 / Strictly decoded source.
 * @param workspaceId 请求路径 Workspace / Workspace in the request path.
 * @param sourceId 可选请求路径来源 identity / Optional source identity in the request path.
 */
function assertKnowledgeSourceMatchesPath(
  source: KnowledgeSource,
  workspaceId: string,
  sourceId?: string
): void {
  if (source.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 returned a KnowledgeSource from a different Workspace than the request path.'
    )
  }
  if (sourceId !== undefined && source.id !== sourceId) {
    throw new ApiV2ContractError(
      'API v2 returned a KnowledgeSource whose identity differs from the request path.'
    )
  }
}

/**
 * @brief 校验创建响应兑现提交的产品字段 / Validate that a creation response fulfills the submitted product fields.
 * @param source 已严格解码创建结果 / Strictly decoded creation result.
 * @param request 已严格编码创建请求 / Strictly encoded creation request.
 */
function assertKnowledgeSourceMatchesCreate(
  source: KnowledgeSource,
  request: CreateKnowledgeSourceRequest
): void {
  if (source.name !== request.name || source.source_type !== request.input.source_type) {
    throw new ApiV2ContractError(
      'API v2 returned a created KnowledgeSource with different identity-defining product fields.'
    )
  }
  if (!sameVisibilityPolicy(source.visibility, request.visibility)) {
    throw new ApiV2ContractError(
      'API v2 returned a created KnowledgeSource with a different visibility policy.'
    )
  }
}

/**
 * @brief 校验更新响应实际反映已提交 patch / Validate that an update response reflects the submitted patch.
 * @param source 已严格解码更新结果 / Strictly decoded update result.
 * @param request 已严格编码 patch / Strictly encoded patch.
 */
function assertKnowledgeSourceMatchesUpdate(
  source: KnowledgeSource,
  request: UpdateKnowledgeSourceRequest
): void {
  if ('name' in request && request.name !== undefined && source.name !== request.name) {
    throw new ApiV2ContractError(
      'API v2 returned an updated KnowledgeSource without the submitted name.'
    )
  }
  if (
    'visibility' in request &&
    request.visibility !== undefined &&
    !sameVisibilityPolicy(source.visibility, request.visibility)
  ) {
    throw new ApiV2ContractError(
      'API v2 returned an updated KnowledgeSource without the submitted visibility policy.'
    )
  }
}

/**
 * @brief 校验创建 Location 精确指向响应来源 / Validate that a creation Location points exactly to the response source.
 * @param location transport 已验证的同源绝对 Location / Same-origin absolute Location validated by the transport.
 * @param workspaceId 请求路径 Workspace / Workspace in the request path.
 * @param sourceId 响应来源 identity / Source identity in the response.
 * @return 未改写的规范 Location / Unmodified canonical Location.
 */
function createdKnowledgeSourceLocation(
  location: string,
  workspaceId: string,
  sourceId: string
): string {
  /** @brief 已解析绝对 Location / Parsed absolute Location. */
  let parsed: URL
  try {
    parsed = new URL(location)
  } catch {
    throw new ApiV2ContractError(
      'API v2 KnowledgeSource creation returned an invalid absolute Location.'
    )
  }
  /** @brief 响应 identities 唯一决定的规范路径 / Canonical path uniquely determined by response identities. */
  const expectedPath = `/api/v2/workspaces/${workspaceId}/knowledge-sources/${sourceId}`
  if (parsed.pathname !== expectedPath || parsed.search !== '' || parsed.hash !== '') {
    throw new ApiV2ContractError(
      'API v2 KnowledgeSource creation Location does not identify the created source exactly.'
    )
  }
  return location
}

/**
 * @brief 读取一个 Workspace 的一页 KnowledgeSource / Read one page of KnowledgeSources in a Workspace.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request 显式 Workspace、cursor、limit 与取消信号 / Explicit Workspace, cursor, limit, and cancellation signal.
 * @return 与授权路径一致的权威 cursor 页 / Authoritative cursor page matching the authorization path.
 */
export async function listWorkspaceKnowledgeSourcePage(
  client: ApiV2Client,
  request: KnowledgeSourcePageRequest
): Promise<CursorCollection<KnowledgeSource>> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证页大小 / Validated page size. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 cursor / Validated cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief transport 已严格验证的 200 响应 / Transport-validated 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-sources`,
    {
      expectedStatus: 200,
      maxResponseBytes: KNOWLEDGE_SOURCE_LIST_MAX_RESPONSE_BYTES,
      query: { cursor, limit },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已严格解码列表 / Strictly decoded list. */
  const page = parseKnowledgeSourceList(response.data)
  if (page.items.some((source) => source.workspace_id !== workspaceId)) {
    throw new ApiV2ContractError(
      'API v2 returned a KnowledgeSource outside the requested Workspace collection.'
    )
  }
  return page
}

/**
 * @brief 读取单个权威 KnowledgeSource / Read one authoritative KnowledgeSource.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request 显式 Workspace、source identity 与取消信号 / Explicit Workspace, source identity, and cancellation signal.
 * @return 来源、同响应强 ETag 与 request ID / Source, co-response strong ETag, and request ID.
 */
export async function getWorkspaceKnowledgeSource(
  client: ApiV2Client,
  request: KnowledgeSourceReadRequest
): Promise<KnowledgeSourceRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证来源 identity / Validated source identity. */
  const sourceId = opaqueId(request.sourceId, 'request.source_id')
  /** @brief transport 已严格验证的 200 响应 / Transport-validated 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-sources/${encodeURIComponent(sourceId)}`,
    {
      expectedStatus: 200,
      maxResponseBytes: KNOWLEDGE_SOURCE_MAX_RESPONSE_BYTES,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已严格解码来源 / Strictly decoded source. */
  const value = parseKnowledgeSource(response.data)
  assertKnowledgeSourceMatchesPath(value, workspaceId, sourceId)
  return {
    entityTag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
    requestId: opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id'),
    value
  }
}

/**
 * @brief 以稳定幂等 command 创建 KnowledgeSource / Create a KnowledgeSource with a stable idempotent command.
 * @param client 固定 201 的创建端口 / Creation port fixed to 201.
 * @param command Workspace、payload、幂等键与取消信号 / Workspace, payload, idempotency key, and cancellation signal.
 * @return 权威来源及强 ETag、Location、request ID / Authoritative source with strong ETag, Location, and request ID.
 */
export async function createWorkspaceKnowledgeSource(
  client: KnowledgeSourceCreationHttpClient,
  command: CreateWorkspaceKnowledgeSourceCommand
): Promise<CreatedKnowledgeSourceRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已严格编码创建请求 / Strictly encoded creation request. */
  const request = encodeCreateKnowledgeSourceRequest(command.request)
  /** @brief 已验证稳定幂等键 / Validated stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 201 语义的 transport 响应 / Transport response with fixed 201 semantics. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-sources`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: CREATE_KNOWLEDGE_SOURCE_MAX_REQUEST_BYTES,
      maxResponseBytes: KNOWLEDGE_SOURCE_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'created-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 201, (): CreatedKnowledgeSourceRepresentation => {
    /** @brief 已严格解码创建结果 / Strictly decoded creation result. */
    const value = parseKnowledgeSource(response.data)
    assertKnowledgeSourceMatchesPath(value, workspaceId)
    assertKnowledgeSourceMatchesCreate(value, request)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      location: createdKnowledgeSourceLocation(response.metadata.location, workspaceId, value.id),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}

/**
 * @brief 以强 If-Match 更新 KnowledgeSource / Update a KnowledgeSource using strong If-Match.
 * @param client 固定 200 updated-resource 的 PATCH 端口 / PATCH port fixed to 200 updated-resource semantics.
 * @param command Workspace、source、非空 patch 与并发校验器 / Workspace, source, non-empty patch, and concurrency validator.
 * @return 更新后权威来源与下一强 ETag / Updated authoritative source and next strong ETag.
 */
export async function updateWorkspaceKnowledgeSource(
  client: KnowledgeSourceUpdateHttpClient,
  command: UpdateWorkspaceKnowledgeSourceCommand
): Promise<KnowledgeSourceRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证来源 identity / Validated source identity. */
  const sourceId = opaqueId(command.sourceId, 'request.source_id')
  /** @brief 已严格编码非空 patch / Strictly encoded non-empty patch. */
  const request = encodeUpdateKnowledgeSourceRequest(command.request)
  /** @brief 已验证强并发校验器 / Validated strong concurrency validator. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 200 更新语义的 transport 响应 / Transport response with fixed 200 update semantics. */
  const response = await client.patchJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-sources/${encodeURIComponent(sourceId)}`,
    request,
    {
      ifMatch,
      maxRequestBytes: UPDATE_KNOWLEDGE_SOURCE_MAX_REQUEST_BYTES,
      maxResponseBytes: KNOWLEDGE_SOURCE_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal })
    }
  )
  return decodeAcknowledgedWrite(response, 200, (): KnowledgeSourceRepresentation => {
    /** @brief 已严格解码更新结果 / Strictly decoded update result. */
    const value = parseKnowledgeSource(response.data)
    assertKnowledgeSourceMatchesPath(value, workspaceId, sourceId)
    assertKnowledgeSourceMatchesUpdate(value, request)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}
