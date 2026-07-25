/** @file API v2 Resume Proposal 查询与原子决策防腐层 / API v2 Resume Proposal queries and atomic-decision anti-corruption layer. */

import type {
  ApiV2Client,
  ApiV2PostJsonOptions,
  ApiV2UpdatedWriteJsonResponse
} from '../http/client'
import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import {
  arrayBetween,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  idempotencyKey,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  strongEntityTag,
  stringValue,
  type CursorCollection,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'
import {
  parseResumeOperation,
  parseResumeOperationResult,
  type ResumeOperation,
  type ResumeOperationResult
} from './operations'
import { assertUniqueStrings } from './wire-decoding'

/** @brief Proposal 列表页的逐路由响应字节上限 / Per-route response-byte ceiling for a Proposal list page. */
const RESUME_PROPOSAL_LIST_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 单个 Proposal 的逐路由响应字节上限 / Per-route response-byte ceiling for one Proposal. */
const RESUME_PROPOSAL_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Proposal decision 请求的逐路由字节上限 / Per-route request-byte ceiling for a Proposal decision. */
const RESUME_PROPOSAL_DECISION_MAX_REQUEST_BYTES = 64 * 1024

/** @brief Proposal decision 结果的逐路由响应字节上限 / Per-route response-byte ceiling for a Proposal decision result. */
const RESUME_PROPOSAL_DECISION_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Resume Proposal 生命周期状态 / Resume Proposal lifecycle status. */
export type ResumeProposalStatus =
  'accepted' | 'expired' | 'partially_accepted' | 'pending' | 'rejected'

/** @brief 已结束、不可再次 decision 的 Proposal 状态 / Terminal Proposal states that cannot be decided again. */
export type TerminalResumeProposalStatus = Exclude<ResumeProposalStatus, 'pending'>

/** @brief Resume Proposal 跨状态公共字段 / Fields shared by every Resume Proposal state. */
interface ResumeProposalFields extends ResourceFields {
  /** @brief Proposal 所属 Workspace identity / Workspace identity owning the Proposal. */
  readonly workspace_id: string
  /** @brief Proposal 目标 Resume identity / Resume identity targeted by the Proposal. */
  readonly resume_id: string
  /** @brief Proposal 基于的 Resume 领域 revision / Resume domain revision on which the Proposal is based. */
  readonly base_revision: number
  /** @brief 面向用户的 Proposal 标题 / User-facing Proposal title. */
  readonly title: string
  /** @brief Agent 建议的完整六类语义操作 / Complete six-kind semantic operations proposed by the agent. */
  readonly operations: readonly ResumeOperation[]
  /** @brief 支持 Proposal 的证据资源引用 / Resource references supporting the Proposal. */
  readonly evidence_refs: readonly ResourceReference[]
}

/** @brief 唯一允许提交 decision 的 pending Proposal / Pending Proposal that uniquely permits a decision. */
export interface PendingResumeProposal extends ResumeProposalFields {
  /** @brief 可决策的固定 pending 状态 / Fixed pending state that permits a decision. */
  readonly status: 'pending'
}

/** @brief 已进入不可逆终态的 Proposal / Proposal that has entered an irreversible terminal state. */
export interface TerminalResumeProposal extends ResumeProposalFields {
  /** @brief 不可再次 decision 的终态 / Terminal state that cannot be decided again. */
  readonly status: TerminalResumeProposalStatus
}

/** @brief 状态机封闭的 Resume Proposal 判别联合 / State-machine-closed Resume Proposal discriminated union. */
export type ResumeProposal = PendingResumeProposal | TerminalResumeProposal

/** @brief Proposal 列表单页查询 / One-page Proposal-list query. */
export interface ResumeProposalListRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 列出 Proposal 的 Resume identity / Resume identity whose Proposals are listed. */
  readonly resumeId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 单个 Proposal 读取参数 / Parameters for reading one Proposal. */
export interface ResumeProposalReadRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 调用方预期的目标 Resume identity / Target Resume identity expected by the caller. */
  readonly resumeId: string
  /** @brief 路径中的 Proposal identity / Proposal identity in the path. */
  readonly proposalId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带并发校验器的权威 Proposal 表示 / Authoritative Proposal representation carrying its concurrency validator. */
export interface ResumeProposalRepresentation {
  /** @brief 已严格解码的 Proposal / Strictly decoded Proposal. */
  readonly value: ResumeProposal
  /** @brief 后续 decision 所需的强 If-Match 校验器 / Strong validator required by a later decision. */
  readonly entityTag: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/** @brief 接受 Proposal 全部操作的 decision / Decision accepting every Proposal operation. */
export interface AcceptResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly decision: 'accept'
  /** @brief accept 变体必须为空 / The accept variant must be empty. */
  readonly accepted_operation_ids: readonly []
}

/** @brief 只接受显式操作子集的 decision / Decision accepting only an explicit operation subset. */
export interface AcceptSelectedResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly decision: 'accept_selected'
  /** @brief 1 至 200 个唯一 Proposal operation IDs / One to 200 unique Proposal operation IDs. */
  readonly accepted_operation_ids: readonly string[]
}

/** @brief 拒绝 Proposal 的 decision / Decision rejecting a Proposal. */
export interface RejectResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly decision: 'reject'
  /** @brief reject 变体必须为空 / The reject variant must be empty. */
  readonly accepted_operation_ids: readonly []
}

/** @brief Schema 封闭的 ProposalDecisionRequest 判别联合 / Schema-closed ProposalDecisionRequest discriminated union. */
export type ProposalDecisionRequest =
  AcceptResumeProposalDecision | AcceptSelectedResumeProposalDecision | RejectResumeProposalDecision

/** @brief 提交 Proposal decision 的完整 command / Complete command for submitting a Proposal decision. */
export interface DecideResumeProposalCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief Proposal 目标 Resume identity / Resume identity targeted by the Proposal. */
  readonly resumeId: string
  /** @brief 路径中的 Proposal identity / Proposal identity in the path. */
  readonly proposalId: string
  /** @brief decision 所依据的权威 Proposal 快照 / Authoritative Proposal snapshot on which the decision is based. */
  readonly proposal: PendingResumeProposal
  /** @brief Schema 封闭的 decision / Schema-closed decision. */
  readonly decision: ProposalDecisionRequest
  /** @brief 同一用户意图内稳定的幂等键 / Idempotency key stable within the same user intent. */
  readonly idempotencyKey: string
  /** @brief Proposal 表示的强 ETag / Strong ETag of the Proposal representation. */
  readonly ifMatch: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief Proposal decision 后的权威 Resume 结果 / Authoritative Resume result after a Proposal decision. */
export interface ResumeProposalDecisionRepresentation {
  /** @brief 已按 Proposal 与 decision 校验的原子 operation 结果 / Atomic operation result validated against the Proposal and decision. */
  readonly value: ResumeOperationResult
  /** @brief 服务端返回的下一强表示校验器 / Next strong representation validator returned by the service. */
  readonly entityTag: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/** @brief Proposal decision 端点所需的最小写端口 / Minimal write port required by the Proposal-decision endpoint. */
export interface ResumeProposalDecisionHttpClient {
  /**
   * @brief 提交固定为 updated-result 的 decision / Submit a decision fixed to updated-result semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 严格 ProposalDecisionRequest / Strict ProposalDecisionRequest.
   * @param options 幂等、并发、字节与取消策略 / Idempotency, concurrency, byte, and cancellation policy.
   * @return 带强 ETag 的 200 ResumeOperationResult / 200 ResumeOperationResult carrying a strong ETag.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'updated-result'>
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
}

/**
 * @brief 严格解码 ResumeProposal / Strictly decode a ResumeProposal.
 * @param value 未知 Proposal / Unknown Proposal.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无损且状态封闭的 Proposal / Lossless Proposal with a closed lifecycle state.
 */
export function parseResumeProposal(value: unknown, path = 'resume_proposal'): ResumeProposal {
  /** @brief 精确 Proposal 对象 / Exact Proposal object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'resume_id',
    'base_revision',
    'title',
    'status',
    'operations',
    'evidence_refs'
  ])
  /** @brief 跨状态 Proposal 字段 / Proposal fields shared across states. */
  const fields: ResumeProposalFields = {
    ...parseResourceFields(input, path),
    base_revision: boundedInteger(
      input.base_revision,
      `${path}.base_revision`,
      1,
      Number.MAX_SAFE_INTEGER
    ),
    evidence_refs: arrayBetween(input.evidence_refs, `${path}.evidence_refs`, 0, 200).map(
      (reference, index) => parseResourceReference(reference, `${path}.evidence_refs[${index}]`)
    ),
    operations: arrayBetween(input.operations, `${path}.operations`, 1, 200).map(
      (operation, index) => parseResumeOperation(operation, `${path}.operations[${index}]`)
    ),
    resume_id: opaqueId(input.resume_id, `${path}.resume_id`),
    title: boundedString(input.title, `${path}.title`, 1, 300),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
  /** @brief 已验证 Proposal 生命周期状态 / Validated Proposal lifecycle state. */
  const status = closedStringEnum(input.status, `${path}.status`, [
    'pending',
    'accepted',
    'partially_accepted',
    'rejected',
    'expired'
  ])
  if (status === 'pending') return { ...fields, status }
  return { ...fields, status }
}

/**
 * @brief 严格解码 ResumeProposalList / Strictly decode a ResumeProposalList.
 * @param value 未知列表 / Unknown list.
 * @return 无总数的权威 cursor page / Authoritative cursor page without an invented total.
 */
export function parseResumeProposalList(value: unknown): CursorCollection<ResumeProposal> {
  /** @brief 精确 Proposal 列表 / Exact Proposal list. */
  const input = exactRecord(value, 'resume_proposal_list', ['items', 'page'])
  return {
    items: arrayBetween(input.items, 'resume_proposal_list.items', 0, 200).map((item, index) =>
      parseResumeProposal(item, `resume_proposal_list.items[${index}]`)
    ),
    page: parseCursorPage(input.page, 'resume_proposal_list.page')
  }
}

/**
 * @brief 严格编码 ProposalDecisionRequest / Strictly encode a ProposalDecisionRequest.
 * @param value 未经边界校验的 decision / Decision not yet validated at the boundary.
 * @return 只含 canonical v2 字段的 decision / Decision containing only canonical v2 fields.
 */
export function encodeProposalDecisionRequest(
  value: ProposalDecisionRequest
): ProposalDecisionRequest {
  /** @brief 精确 decision 对象 / Exact decision object. */
  const input = exactRecord(value, 'proposal_decision', ['decision', 'accepted_operation_ids'])
  /** @brief 已读取的 decision 判别值 / Read decision discriminator. */
  const decision = stringValue(input.decision, 'proposal_decision.decision')
  switch (decision) {
    case 'accept':
    case 'reject': {
      /** @brief Schema 要求为空的 accepted ID 数组 / Accepted-ID array required by the schema to be empty. */
      const acceptedOperationIds = arrayBetween(
        input.accepted_operation_ids,
        'proposal_decision.accepted_operation_ids',
        0,
        0
      )
      return { accepted_operation_ids: acceptedOperationIds as readonly [], decision }
    }
    case 'accept_selected': {
      /** @brief 已严格解码的唯一 accepted operation IDs / Strictly decoded unique accepted operation IDs. */
      const acceptedOperationIds = arrayBetween(
        input.accepted_operation_ids,
        'proposal_decision.accepted_operation_ids',
        1,
        200
      ).map((operationId, index) =>
        opaqueId(operationId, `proposal_decision.accepted_operation_ids[${index}]`)
      )
      assertUniqueStrings(acceptedOperationIds, 'proposal_decision.accepted_operation_ids')
      return { accepted_operation_ids: acceptedOperationIds, decision }
    }
    default:
      throw new ApiV2ContractError('API v2 field proposal_decision.decision is not supported.')
  }
}

/**
 * @brief 校验 Proposal 与显式调用 identity 一致且仍可决策 / Validate that a Proposal matches explicit call identities and remains decidable.
 * @param proposal 已严格解码的 Proposal / Strictly decoded Proposal.
 * @param workspaceId 显式 Workspace identity / Explicit Workspace identity.
 * @param resumeId 显式 Resume identity / Explicit Resume identity.
 * @param proposalId 显式 Proposal identity / Explicit Proposal identity.
 */
function assertProposalMatchesDecisionPath(
  proposal: ResumeProposal,
  workspaceId: string,
  resumeId: string,
  proposalId: string
): asserts proposal is PendingResumeProposal {
  if (
    proposal.workspace_id !== workspaceId ||
    proposal.resume_id !== resumeId ||
    proposal.id !== proposalId
  ) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision snapshot identities differ from the requested resource path.'
    )
  }
  if (proposal.status !== 'pending') {
    throw new ApiV2ContractError('API v2 only permits a decision for a pending Resume Proposal.')
  }
}

/**
 * @brief 将 decision 映射为服务端允许应用的 operation identity 集合 / Map a decision to the operation identities the server may apply.
 * @param proposal decision 所依据的 Proposal / Proposal on which the decision is based.
 * @param decision 已严格编码的 decision / Strictly encoded decision.
 * @return 允许应用的 operation IDs / Operation IDs allowed to be applied.
 */
function selectedOperationIds(
  proposal: ResumeProposal,
  decision: ProposalDecisionRequest
): ReadonlySet<string> {
  /** @brief Proposal 中存在的 operation identity 集合 / Operation identities present in the Proposal. */
  const proposed = new Set(proposal.operations.map((operation) => operation.operation_id))
  if (decision.decision === 'reject') return new Set()
  if (decision.decision === 'accept') return proposed
  if (decision.accepted_operation_ids.some((operationId) => !proposed.has(operationId))) {
    throw new ApiV2ContractError(
      'API v2 accept_selected decision references an operation absent from the Proposal.'
    )
  }
  return new Set(decision.accepted_operation_ids)
}

/**
 * @brief 校验 decision 结果的身份、选择范围与原子性 / Validate decision-result identity, selection scope, and atomicity.
 * @param result 已严格解码的 ResumeOperationResult / Strictly decoded ResumeOperationResult.
 * @param proposal decision 所依据的 Proposal / Proposal on which the decision is based.
 * @param decision 已严格编码的 decision / Strictly encoded decision.
 * @param selected 已在发送前验证的选择集合 / Selection set validated before dispatch.
 * @param workspaceId 显式 Workspace identity / Explicit Workspace identity.
 * @param resumeId 显式 Resume identity / Explicit Resume identity.
 */
function assertProposalDecisionResult(
  result: ResumeOperationResult,
  proposal: ResumeProposal,
  decision: ProposalDecisionRequest,
  selected: ReadonlySet<string>,
  workspaceId: string,
  resumeId: string
): void {
  if (result.resume.workspace_id !== workspaceId || result.resume.id !== resumeId) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision returned a Resume outside the requested resource identities.'
    )
  }
  if (result.applied_operation_ids.some((operationId) => !selected.has(operationId))) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision reported an applied operation outside the selected set.'
    )
  }
  if (result.conflicts.some((conflict) => !selected.has(conflict.operation_id))) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision reported a conflict outside the selected set.'
    )
  }
  if (result.applied_operation_ids.length > 0 && result.conflicts.length > 0) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision must not report partial application and conflicts together.'
    )
  }
  if (result.resume.revision < proposal.base_revision) {
    throw new ApiV2ContractError(
      'API v2 Proposal decision returned a Resume below the Proposal base revision.'
    )
  }
  if (decision.decision === 'reject') {
    if (
      result.applied_operation_ids.length !== 0 ||
      result.conflicts.length !== 0 ||
      result.render_job_ref !== null
    ) {
      throw new ApiV2ContractError(
        'API v2 rejected Proposal decision must not apply, conflict, or render Resume operations.'
      )
    }
    return
  }
  if (result.conflicts.length > 0) {
    if (result.render_job_ref !== null) {
      throw new ApiV2ContractError(
        'API v2 atomically conflicted Proposal decision must not schedule a render.'
      )
    }
    return
  }
  if (
    result.applied_operation_ids.length !== selected.size ||
    result.applied_operation_ids.some((operationId) => !selected.has(operationId))
  ) {
    throw new ApiV2ContractError(
      'API v2 successful Proposal decision must acknowledge every selected operation.'
    )
  }
  if (result.resume.revision <= proposal.base_revision) {
    throw new ApiV2ContractError(
      'API v2 successful Proposal decision did not advance the Resume revision.'
    )
  }
}

/**
 * @brief 读取一个 Resume 的一页 Proposal / Read one page of Proposals for a Resume.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Resume、cursor 与 limit / Explicit Workspace, Resume, cursor, and limit.
 * @return 所有 identity 均与路径一致的 cursor page / Cursor page whose identities all match the path.
 */
export async function listWorkspaceResumeProposalPage(
  client: ApiV2Client,
  request: ResumeProposalListRequest
): Promise<CursorCollection<ResumeProposal>> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(request.resumeId, 'request.resume_id')
  /** @brief 已验证 page size / Validated page size. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 opaque cursor / Validated opaque cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief 显式 Workspace 与 Resume scoped collection path / Explicit Workspace- and Resume-scoped collection path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resumes/${encodeURIComponent(resumeId)}/proposals`
  /** @brief transport 严格返回的 200 JSON / 200 JSON strictly returned by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: RESUME_PROPOSAL_LIST_MAX_RESPONSE_BYTES,
    query: { cursor, limit },
    ...(request.signal === undefined ? {} : { signal: request.signal })
  })
  /** @brief 已验证 Proposal page / Validated Proposal page. */
  const result = parseResumeProposalList(response.data)
  if (
    result.items.some(
      (proposal) => proposal.workspace_id !== workspaceId || proposal.resume_id !== resumeId
    )
  ) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeProposal outside the requested Workspace or Resume path.'
    )
  }
  return result
}

/**
 * @brief 读取一个可变 Resume Proposal 及其强校验器 / Read one mutable Resume Proposal with its strong validator.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Resume 与 Proposal identities / Explicit Workspace, Resume, and Proposal identities.
 * @return 与路径和预期 Resume 一致的权威 Proposal 表示 / Authoritative Proposal representation matching the path and expected Resume.
 */
export async function getWorkspaceResumeProposal(
  client: ApiV2Client,
  request: ResumeProposalReadRequest
): Promise<ResumeProposalRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(request.resumeId, 'request.resume_id')
  /** @brief 已验证 Proposal identity / Validated Proposal identity. */
  const proposalId = opaqueId(request.proposalId, 'request.proposal_id')
  /** @brief Proposal 单项 path / Single-Proposal path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resume-proposals/${encodeURIComponent(proposalId)}`
  /** @brief transport 严格返回的 200 JSON / 200 JSON strictly returned by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: RESUME_PROPOSAL_MAX_RESPONSE_BYTES,
    ...(request.signal === undefined ? {} : { signal: request.signal })
  })
  /** @brief 已严格解码的 Proposal / Strictly decoded Proposal. */
  const value = parseResumeProposal(response.data)
  if (
    value.workspace_id !== workspaceId ||
    value.resume_id !== resumeId ||
    value.id !== proposalId
  ) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeProposal whose identities differ from the requested resource.'
    )
  }
  return {
    entityTag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
    requestId: opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id'),
    value
  }
}

/**
 * @brief 对 pending Proposal 提交一次并发安全、幂等的原子 decision / Submit one concurrency-safe, idempotent atomic decision for a pending Proposal.
 * @param client 固定 updated-result 语义的写端口 / Write port fixed to updated-result semantics.
 * @param command Proposal 快照、显式 identities、decision 与写入前置条件 / Proposal snapshot, explicit identities, decision, and write preconditions.
 * @return 严格核对选择集合后的权威 ResumeOperationResult / Authoritative ResumeOperationResult checked against the selected set.
 */
export async function decideResumeProposal(
  client: ResumeProposalDecisionHttpClient,
  command: DecideResumeProposalCommand
): Promise<ResumeProposalDecisionRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(command.resumeId, 'request.resume_id')
  /** @brief 已验证 Proposal identity / Validated Proposal identity. */
  const proposalId = opaqueId(command.proposalId, 'request.proposal_id')
  /** @brief 重新经过 wire decoder 的 Proposal 快照 / Proposal snapshot revalidated through the wire decoder. */
  const proposal = parseResumeProposal(command.proposal, 'request.proposal')
  assertProposalMatchesDecisionPath(proposal, workspaceId, resumeId, proposalId)
  /** @brief 严格编码的 decision body / Strictly encoded decision body. */
  const decision = encodeProposalDecisionRequest(command.decision)
  /** @brief 发送前固定的合法选择集合 / Valid selection set fixed before dispatch. */
  const selected = selectedOperationIds(proposal, decision)
  /** @brief 已验证的强并发前置条件 / Validated strong concurrency precondition. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 已验证且稳定的幂等键 / Validated stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 精确 Workspace-scoped decision path / Exact Workspace-scoped decision path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resume-proposals/${encodeURIComponent(proposalId)}/decisions`
  /** @brief transport 严格返回的 200 updated-result / 200 updated-result strictly returned by the transport. */
  const response = await client.postJson(path, decision, {
    idempotencyKey: validatedIdempotencyKey,
    ifMatch,
    maxRequestBytes: RESUME_PROPOSAL_DECISION_MAX_REQUEST_BYTES,
    maxResponseBytes: RESUME_PROPOSAL_DECISION_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal }),
    successKind: 'updated-result'
  })
  return decodeAcknowledgedWrite(response, 200, (): ResumeProposalDecisionRepresentation => {
    /** @brief 无损解码的 Resume operation result / Losslessly decoded Resume operation result. */
    const value = parseResumeOperationResult(response.data, 'proposal_decision_result')
    assertProposalDecisionResult(value, proposal, decision, selected, workspaceId, resumeId)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}
