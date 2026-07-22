/** @file API v2 Resume 语义操作批次 command 与结果 / API v2 Resume semantic-operation batch command and result. */

import type { ApiV2PostJsonOptions, ApiV2UpdatedWriteJsonResponse } from '../http/client'
import {
  arrayBetween,
  boundedInteger,
  closedStringEnum,
  exactRecord,
  idempotencyKey,
  opaqueId,
  patternedString,
  strongEntityTag,
  stringValue
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'
import {
  parseResumeDocument,
  parseResumeItem,
  parseResumeSection,
  type ResumeDocument,
  type ResumeItem,
  type ResumeSection
} from './resume-document'
import { parseTemplateRef, type TemplateRef } from './template'
import {
  assertUniqueStrings,
  parseJsonMap,
  parseResumeJsonValue,
  type ResumeJsonValue
} from './wire-decoding'

/** @brief ResumeOperationBatch 最大请求字节数 / Maximum ResumeOperationBatch request bytes. */
const RESUME_OPERATION_MAX_REQUEST_BYTES = 16 * 1024 * 1024

/** @brief ResumeOperationResult 最大响应字节数 / Maximum ResumeOperationResult response bytes. */
const RESUME_OPERATION_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Schema 未规定 conflicts 条目上限；实际容量由逐路由响应字节上限约束 / The schema does not cap conflict items; the per-route response-byte ceiling provides the actual bound. */
const UNBOUNDED_SCHEMA_ARRAY_MAXIMUM = Number.MAX_SAFE_INTEGER

/** @brief Resume operation field path segment 语法 / Resume-operation field-path segment syntax. */
const FIELD_PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9_]{0,79}$/u

/** @brief Resume conflict code 语法 / Resume-conflict code syntax. */
const CONFLICT_CODE_PATTERN = /^[a-z][a-z0-9_.-]+$/u

/** @brief Resume batch 的并发策略 / Concurrency strategy for a Resume batch. */
export type ResumeConflictStrategy = 'rebase_if_safe' | 'reject'

/** @brief Resume batch 的渲染提示 / Render hint for a Resume batch. */
export type ResumeRenderHint = 'final' | 'none' | 'preview'

/** @brief set_field 语义操作 / set_field semantic operation. */
export interface SetResumeFieldOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'set_field'
  /** @brief 被修改的稳定实体身份 / Stable entity identity being modified. */
  readonly entity_id: string
  /** @brief 不含数组下标的语义字段路径 / Semantic field path without array indexes. */
  readonly field_path: readonly string[]
  /** @brief 严格 JSON 字段值 / Strict JSON field value. */
  readonly value: ResumeJsonValue
}

/** @brief upsert_section 语义操作 / upsert_section semantic operation. */
export interface UpsertResumeSectionOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'upsert_section'
  /** @brief 完整且无损的 section / Complete lossless section. */
  readonly section: ResumeSection
  /** @brief 插入锚点；null 表示首位 / Insertion anchor; null means first position. */
  readonly after_section_id: string | null
}

/** @brief upsert_item 语义操作 / upsert_item semantic operation. */
export interface UpsertResumeItemOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'upsert_item'
  /** @brief 目标 section identity / Target section identity. */
  readonly section_id: string
  /** @brief 完整且无损的 item / Complete lossless item. */
  readonly item: ResumeItem
  /** @brief 插入锚点；null 表示首位 / Insertion anchor; null means first position. */
  readonly after_item_id: string | null
}

/** @brief 可删除 Resume entity 的种类 / Kinds of removable Resume entities. */
export type ResumeEntityKind = 'item' | 'section'

/** @brief remove_entity 语义操作 / remove_entity semantic operation. */
export interface RemoveResumeEntityOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'remove_entity'
  /** @brief 被删除实体种类 / Kind of entity being removed. */
  readonly entity_kind: ResumeEntityKind
  /** @brief 被删除实体身份 / Identity of the entity being removed. */
  readonly entity_id: string
}

/** @brief move_entity 语义操作 / move_entity semantic operation. */
export interface MoveResumeEntityOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'move_entity'
  /** @brief 被移动实体种类 / Kind of entity being moved. */
  readonly entity_kind: ResumeEntityKind
  /** @brief 被移动实体身份 / Identity of the entity being moved. */
  readonly entity_id: string
  /** @brief 目标 parent identity；null 表示无 parent / Target parent identity; null denotes no parent. */
  readonly parent_id: string | null
  /** @brief 同层前置锚点；null 表示首位 / Previous sibling anchor; null means first position. */
  readonly after_id: string | null
}

/** @brief set_template 语义操作 / set_template semantic operation. */
export interface SetResumeTemplateOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operation_id: string
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly op: 'set_template'
  /** @brief 精确不可变 Template 版本 / Exact immutable Template version. */
  readonly template: TemplateRef
  /** @brief 由目标 Template 原子校验的完整 settings / Complete settings atomically validated against the target Template. */
  readonly settings: Readonly<Record<string, ResumeJsonValue>>
}

/** @brief API v2 六类 Resume 语义操作 / The six API v2 Resume semantic operations. */
export type ResumeOperation =
  | MoveResumeEntityOperation
  | RemoveResumeEntityOperation
  | SetResumeFieldOperation
  | SetResumeTemplateOperation
  | UpsertResumeItemOperation
  | UpsertResumeSectionOperation

/** @brief 原子 Resume operation batch / Atomic Resume operation batch. */
export interface ResumeOperationBatch {
  /** @brief 客户端批次身份 / Client batch identity. */
  readonly client_batch_id: string
  /** @brief 用户意图基于的领域 revision / Domain revision on which the user intent is based. */
  readonly base_revision: number
  /** @brief 显式冲突策略 / Explicit conflict strategy. */
  readonly conflict_strategy: ResumeConflictStrategy
  /** @brief 1 至 200 个唯一操作 / One to 200 unique operations. */
  readonly operations: readonly ResumeOperation[]
  /** @brief 提交后的渲染提示 / Post-commit render hint. */
  readonly render_hint: ResumeRenderHint
}

/** @brief Resume operation conflict / Resume operation conflict. */
export interface ResumeConflict {
  /** @brief 发生冲突的操作身份 / Identity of the conflicting operation. */
  readonly operation_id: string
  /** @brief 稳定冲突 code / Stable conflict code. */
  readonly code: string
  /** @brief 可选冲突实体 / Optional conflicting entity. */
  readonly entity_id: string | null
  /** @brief 可选语义字段路径 / Optional semantic field path. */
  readonly field_path: readonly string[]
}

/** @brief Resume operation 的权威结果 / Authoritative result of a Resume operation batch. */
export interface ResumeOperationResult {
  /** @brief 批次结束后的完整权威 SIR / Complete authoritative SIR after the batch. */
  readonly resume: ResumeDocument
  /** @brief 已应用的唯一 operation IDs / Unique operation IDs that were applied. */
  readonly applied_operation_ids: readonly string[]
  /** @brief 原子拒绝时的冲突 / Conflicts when the batch was atomically rejected. */
  readonly conflicts: readonly ResumeConflict[]
  /** @brief 可选通用 Job 引用 / Optional generic Job reference. */
  readonly render_job_ref: ResourceReference | null
}

/** @brief 提交一个 Resume operation batch 的 command / Command for submitting one Resume operation batch. */
export interface ApplyResumeOperationsCommand {
  /** @brief 授权路径所属 Workspace / Workspace owning the authorization path. */
  readonly workspaceId: string
  /** @brief 路径中的 Resume identity / Resume identity in the path. */
  readonly resumeId: string
  /** @brief 同一用户批次意图内稳定的幂等键 / Idempotency key stable within the same user batch intent. */
  readonly idempotencyKey: string
  /** @brief 当前读取表示的强 ETag / Strong ETag of the representation currently held. */
  readonly ifMatch: string
  /** @brief 原子语义操作批次 / Atomic semantic-operation batch. */
  readonly batch: ResumeOperationBatch
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带新并发校验器的 Resume operation 表示 / Resume-operation representation carrying the new concurrency validator. */
export interface ResumeOperationRepresentation {
  /** @brief 严格解码并核对 command 的 operation 结果 / Strictly decoded operation result checked against the command. */
  readonly value: ResumeOperationResult
  /** @brief 后续写入必须使用的新强 ETag / New strong ETag required for a subsequent write. */
  readonly entityTag: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/** @brief Resume operations 端点所需的固定 200 updated-result HTTP 能力 / Fixed 200 updated-result HTTP capability required by the Resume operations endpoint. */
export interface ResumeOperationsHttpClient {
  /**
   * @brief 提交固定为 updated-result 的 JSON command / Submit a JSON command fixed to updated-result semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 严格 operation batch / Strict operation batch.
   * @param options 幂等、并发、字节与取消策略 / Idempotency, concurrency, byte, and cancellation policy.
   * @return 带强 ETag 的 200 operation result / 200 operation result carrying a strong ETag.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'updated-result'>
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
}

/**
 * @brief 解码可空 opaque ID / Decode a nullable opaque ID.
 * @param value 未知值 / Unknown value.
 * @param path 诊断路径 / Diagnostic path.
 * @return null 或已验证 ID / Null or a validated ID.
 */
function nullableOpaqueId(value: unknown, path: string): string | null {
  return value === null ? null : opaqueId(value, path)
}

/**
 * @brief 严格解码 operation field path / Strictly decode an operation field path.
 * @param value 未知 path / Unknown path.
 * @param path 诊断路径 / Diagnostic path.
 * @return 1 至 20 个受限 segment / One to 20 constrained segments.
 */
function parseOperationFieldPath(value: unknown, path: string): readonly string[] {
  return arrayBetween(value, path, 1, 20).map((segment, index) =>
    patternedString(segment, `${path}[${index}]`, 1, 80, FIELD_PATH_SEGMENT_PATTERN)
  )
}

/**
 * @brief 严格解码一项 Resume operation / Strictly decode one Resume operation.
 * @param value 未知 operation / Unknown operation.
 * @param path 诊断路径 / Diagnostic path.
 * @return 六类操作之一 / One of the six operation kinds.
 */
export function parseResumeOperation(value: unknown, path = 'resume_operation'): ResumeOperation {
  /** @brief 只用于读取判别字段的候选对象 / Candidate object used only to read the discriminator. */
  const candidate = exactRecord(value, path, [
    'operation_id',
    'op',
    'entity_id',
    'field_path',
    'value',
    'section',
    'after_section_id',
    'section_id',
    'item',
    'after_item_id',
    'entity_kind',
    'parent_id',
    'after_id',
    'template',
    'settings'
  ])
  /** @brief 已确认的 operation discriminator / Confirmed operation discriminator. */
  const operationKind = stringValue(candidate.op, `${path}.op`)
  /** @brief 公共 operation identity / Shared operation identity. */
  const operationId = opaqueId(candidate.operation_id, `${path}.operation_id`)
  switch (operationKind) {
    case 'set_field': {
      const input = exactRecord(value, path, [
        'operation_id',
        'op',
        'entity_id',
        'field_path',
        'value'
      ])
      return {
        entity_id: opaqueId(input.entity_id, `${path}.entity_id`),
        field_path: parseOperationFieldPath(input.field_path, `${path}.field_path`),
        op: operationKind,
        operation_id: operationId,
        value: parseResumeJsonValue(input.value, `${path}.value`)
      }
    }
    case 'upsert_section': {
      const input = exactRecord(value, path, ['operation_id', 'op', 'section', 'after_section_id'])
      return {
        after_section_id: nullableOpaqueId(input.after_section_id, `${path}.after_section_id`),
        op: operationKind,
        operation_id: operationId,
        section: parseResumeSection(input.section, `${path}.section`)
      }
    }
    case 'upsert_item': {
      const input = exactRecord(value, path, [
        'operation_id',
        'op',
        'section_id',
        'item',
        'after_item_id'
      ])
      return {
        after_item_id: nullableOpaqueId(input.after_item_id, `${path}.after_item_id`),
        item: parseResumeItem(input.item, `${path}.item`),
        op: operationKind,
        operation_id: operationId,
        section_id: opaqueId(input.section_id, `${path}.section_id`)
      }
    }
    case 'remove_entity': {
      const input = exactRecord(value, path, ['operation_id', 'op', 'entity_kind', 'entity_id'])
      return {
        entity_id: opaqueId(input.entity_id, `${path}.entity_id`),
        entity_kind: closedStringEnum(input.entity_kind, `${path}.entity_kind`, [
          'section',
          'item'
        ]),
        op: operationKind,
        operation_id: operationId
      }
    }
    case 'move_entity': {
      const input = exactRecord(value, path, [
        'operation_id',
        'op',
        'entity_kind',
        'entity_id',
        'parent_id',
        'after_id'
      ])
      /** @brief 已验证 entity kind / Validated entity kind. */
      const entityKind = closedStringEnum(input.entity_kind, `${path}.entity_kind`, [
        'section',
        'item'
      ])
      /** @brief 已验证 parent identity / Validated parent identity. */
      const parentId = nullableOpaqueId(input.parent_id, `${path}.parent_id`)
      return {
        after_id: nullableOpaqueId(input.after_id, `${path}.after_id`),
        entity_id: opaqueId(input.entity_id, `${path}.entity_id`),
        entity_kind: entityKind,
        op: operationKind,
        operation_id: operationId,
        parent_id: parentId
      }
    }
    case 'set_template': {
      const input = exactRecord(value, path, ['operation_id', 'op', 'template', 'settings'])
      return {
        op: operationKind,
        operation_id: operationId,
        settings: parseJsonMap(input.settings, `${path}.settings`, 100),
        template: parseTemplateRef(input.template, `${path}.template`)
      }
    }
    default:
      throw new ApiV2ContractError(`API v2 field ${path}.op is not a supported Resume operation.`)
  }
}

/**
 * @brief 严格编码并复制 ResumeOperationBatch / Strictly encode and copy a ResumeOperationBatch.
 * @param value 未经边界校验的 batch / Batch not yet validated at the boundary.
 * @return 仅含 canonical v2 字段的 batch / Batch containing only canonical v2 fields.
 */
export function encodeResumeOperationBatch(value: ResumeOperationBatch): ResumeOperationBatch {
  /** @brief 精确 batch 对象 / Exact batch object. */
  const input = exactRecord(value, 'resume_operation_batch', [
    'client_batch_id',
    'base_revision',
    'conflict_strategy',
    'operations',
    'render_hint'
  ])
  /** @brief 已严格解码的 operations / Strictly decoded operations. */
  const operations = arrayBetween(
    input.operations,
    'resume_operation_batch.operations',
    1,
    200
  ).map((operation, index) =>
    parseResumeOperation(operation, `resume_operation_batch.operations[${index}]`)
  )
  assertUniqueStrings(
    operations.map((operation) => operation.operation_id),
    'resume_operation_batch.operations.operation_id'
  )
  return {
    base_revision: boundedInteger(
      input.base_revision,
      'resume_operation_batch.base_revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    client_batch_id: opaqueId(input.client_batch_id, 'resume_operation_batch.client_batch_id'),
    conflict_strategy: closedStringEnum(
      input.conflict_strategy,
      'resume_operation_batch.conflict_strategy',
      ['reject', 'rebase_if_safe']
    ),
    operations,
    render_hint: closedStringEnum(input.render_hint, 'resume_operation_batch.render_hint', [
      'none',
      'preview',
      'final'
    ])
  }
}

/**
 * @brief 严格解码 ResumeConflict / Strictly decode a ResumeConflict.
 * @param value 未知 conflict / Unknown conflict.
 * @param path 诊断路径 / Diagnostic path.
 * @return 已验证 conflict / Validated conflict.
 */
function parseResumeConflict(value: unknown, path: string): ResumeConflict {
  /** @brief 精确 conflict 对象 / Exact conflict object. */
  const input = exactRecord(value, path, ['operation_id', 'code', 'entity_id', 'field_path'])
  /** @brief 仅按发布 Schema 格式约束的稳定 conflict code / Stable conflict code constrained only by the published schema format. */
  const code = stringValue(input.code, `${path}.code`)
  if (!CONFLICT_CODE_PATTERN.test(code)) {
    throw new ApiV2ContractError(`API v2 field ${path}.code has an invalid format.`)
  }
  return {
    code,
    entity_id: nullableOpaqueId(input.entity_id, `${path}.entity_id`),
    field_path: arrayBetween(input.field_path, `${path}.field_path`, 0, 20).map((segment, index) =>
      stringValue(segment, `${path}.field_path[${index}]`)
    ),
    operation_id: opaqueId(input.operation_id, `${path}.operation_id`)
  }
}

/**
 * @brief 严格解码 ResumeOperationResult / Strictly decode a ResumeOperationResult.
 * @param value 未知结果 / Unknown result.
 * @param path 诊断路径 / Diagnostic path.
 * @return 无损 operation 结果 / Lossless operation result.
 */
export function parseResumeOperationResult(
  value: unknown,
  path = 'resume_operation_result'
): ResumeOperationResult {
  /** @brief 精确结果对象 / Exact result object. */
  const input = exactRecord(value, path, [
    'resume',
    'applied_operation_ids',
    'conflicts',
    'render_job_ref'
  ])
  /** @brief 已应用 operation IDs / Applied operation IDs. */
  const appliedOperationIds = arrayBetween(
    input.applied_operation_ids,
    `${path}.applied_operation_ids`,
    0,
    200
  ).map((operationId, index) => opaqueId(operationId, `${path}.applied_operation_ids[${index}]`))
  assertUniqueStrings(appliedOperationIds, `${path}.applied_operation_ids`)
  return {
    applied_operation_ids: appliedOperationIds,
    conflicts: arrayBetween(
      input.conflicts,
      `${path}.conflicts`,
      0,
      UNBOUNDED_SCHEMA_ARRAY_MAXIMUM
    ).map((conflict, index) => parseResumeConflict(conflict, `${path}.conflicts[${index}]`)),
    render_job_ref:
      input.render_job_ref === null
        ? null
        : parseResourceReference(input.render_job_ref, `${path}.render_job_ref`),
    resume: parseResumeDocument(input.resume, `${path}.resume`)
  }
}

/**
 * @brief 校验 operation result 与请求 path/batch 的原子关系 / Validate atomic relationships between an operation result and its path/batch.
 * @param result 已严格解码结果 / Strictly decoded result.
 * @param workspaceId 请求 Workspace / Requested Workspace.
 * @param resumeId 请求 Resume / Requested Resume.
 * @param batch 已严格编码 batch / Strictly encoded batch.
 */
function assertOperationResultMatchesCommand(
  result: ResumeOperationResult,
  workspaceId: string,
  resumeId: string,
  batch: ResumeOperationBatch
): void {
  if (result.resume.workspace_id !== workspaceId || result.resume.id !== resumeId) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeOperationResult outside the requested Resume resource path.'
    )
  }
  /** @brief 提交的 operation identity 集合 / Set of submitted operation identities. */
  const submitted = new Set(batch.operations.map((operation) => operation.operation_id))
  if (result.applied_operation_ids.some((operationId) => !submitted.has(operationId))) {
    throw new ApiV2ContractError('API v2 reported an applied operation absent from the batch.')
  }
  if (result.conflicts.some((conflict) => !submitted.has(conflict.operation_id))) {
    throw new ApiV2ContractError(
      'API v2 reported a conflict for an operation absent from the batch.'
    )
  }
  if (result.applied_operation_ids.length > 0 && result.conflicts.length > 0) {
    throw new ApiV2ContractError(
      'API v2 must not report a partially applied Resume operation batch as a 200 result.'
    )
  }
  if (
    result.conflicts.length === 0 &&
    (result.applied_operation_ids.length !== submitted.size ||
      result.applied_operation_ids.some((operationId) => !submitted.has(operationId)))
  ) {
    throw new ApiV2ContractError(
      'API v2 successful Resume operation result must acknowledge every submitted operation.'
    )
  }
  if (result.applied_operation_ids.length === 0 && result.conflicts.length === 0) {
    throw new ApiV2ContractError('API v2 Resume operation result has no terminal batch outcome.')
  }
  if (result.resume.revision < batch.base_revision) {
    throw new ApiV2ContractError(
      'API v2 Resume operation result regressed below the submitted base revision.'
    )
  }
  if (
    result.applied_operation_ids.length === submitted.size &&
    result.resume.revision <= batch.base_revision
  ) {
    throw new ApiV2ContractError(
      'API v2 applied Resume operation batch did not advance the Resume revision.'
    )
  }
}

/**
 * @brief 原子提交六类 Resume 语义操作 / Atomically submit the six Resume semantic operation kinds.
 * @param client 固定 updated-result 语义的写端口 / Write port fixed to updated-result semantics.
 * @param command Workspace、Resume、并发校验器与 batch / Workspace, Resume, concurrency validator, and batch.
 * @return 权威结果与下一次写入的强 ETag / Authoritative result and the strong ETag for the next write.
 */
export async function applyResumeOperations(
  client: ResumeOperationsHttpClient,
  command: ApplyResumeOperationsCommand
): Promise<ResumeOperationRepresentation> {
  /** @brief 仅读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 仅读取一次的 Resume ID / Resume ID read exactly once. */
  const resumeId = opaqueId(command.resumeId, 'request.resume_id')
  /** @brief 仅读取一次并严格编码的 batch / Batch read once and strictly encoded. */
  const batch = encodeResumeOperationBatch(command.batch)
  /** @brief 仅读取一次的稳定幂等键 / Stable idempotency key read exactly once. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 仅读取一次的强并发前置条件 / Strong concurrency precondition read exactly once. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 仅读取一次的取消信号 / Abort signal read exactly once. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 精确 Workspace-scoped operations path / Exact Workspace-scoped operations path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resumes/${encodeURIComponent(resumeId)}/operations`
  /** @brief 固定 200 updated-result transport 响应 / Transport response fixed to 200 updated-result semantics. */
  const response = await client.postJson(path, batch, {
    idempotencyKey: validatedIdempotencyKey,
    ifMatch,
    maxRequestBytes: RESUME_OPERATION_MAX_REQUEST_BYTES,
    maxResponseBytes: RESUME_OPERATION_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal }),
    successKind: 'updated-result'
  })
  /** @brief 无损解码的 operation result / Losslessly decoded operation result. */
  const value = parseResumeOperationResult(response.data)
  assertOperationResultMatchesCommand(value, workspaceId, resumeId, batch)
  /** @brief 与结果原子配对的下一强 ETag / Next strong ETag atomically paired with the result. */
  const entityTag = strongEntityTag(response.metadata.entityTag, 'response.headers.ETag')
  /** @brief 已验证服务端 request ID / Validated server request ID. */
  const requestId = opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id')
  return { entityTag, requestId, value }
}
