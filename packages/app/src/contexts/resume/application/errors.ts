/** @file Resume Authoring 安全应用错误判定 / Safe Resume Authoring application-error classification. */

import { ConfirmedCommandConflictError } from '../../../shared-kernel/application-error'
import type { UiResumeEditorModel } from '../domain/document'

/** @brief 简历乐观并发冲突状态 / Resume optimistic-concurrency conflict status. */
export type ResumeConflictStatus = 409 | 412

/** @brief Resume command 的已验证幂等冲突类别 / Validated idempotency-conflict kind for a Resume command. */
export type ResumeIdempotencyConflict = 'in-progress' | 'key-reused'

/** @brief 已确认原子批次中的一项领域冲突 / One domain conflict in a confirmed atomic batch. */
export interface ResumeBatchConflict {
  /** @brief 冲突对应的 operation identity / Operation identity associated with the conflict. */
  readonly operationId: string
  /** @brief 服务端稳定冲突 code / Stable service conflict code. */
  readonly code: string
  /** @brief 可选冲突实体 identity / Optional conflicting entity identity. */
  readonly entityId: string | null
  /** @brief 可选语义字段路径 / Optional semantic field path. */
  readonly fieldPath: readonly string[]
}

/** @brief 可安全交给 UI 的已确认批次冲突恢复事实 / Confirmed batch-conflict recovery facts safe for UI consumption. */
export interface ResumeBatchConflictRecovery {
  /** @brief 与冲突结果原子配对的完整权威编辑器 / Complete authoritative editor atomically paired with the conflict result. */
  readonly authoritativeEditor: UiResumeEditorModel
  /** @brief 服务端确认且属于提交批次的冲突 / Server-confirmed conflicts belonging to the submitted batch. */
  readonly conflicts: readonly ResumeBatchConflict[]
}

/**
 * @brief 已确认 Resume 批次因领域冲突而原子拒绝 / Confirmed Resume batch atomically rejected by domain conflicts.
 * @note 该错误携带同一 200 响应中的完整权威 SIR 与新强 ETag，不伪造 HTTP status 或 retryable。
 * This error carries the complete authoritative SIR and new strong ETag from the same 200 response; it invents neither HTTP status nor retryability.
 */
export class ResumeBatchConflictError extends ConfirmedCommandConflictError {
  /** @brief 稳定错误名称 / Stable error name. */
  override readonly name = 'ResumeBatchConflictError'
  /** @brief 与 conflicts 原子配对的权威编辑器 / Authoritative editor atomically paired with the conflicts. */
  readonly authoritativeEditor: UiResumeEditorModel
  /** @brief 服务端确认的冲突投影 / Conflict projections confirmed by the service. */
  readonly conflicts: readonly ResumeBatchConflict[]

  /**
   * @brief 构造不共享 transport 引用的批次冲突 / Construct a batch conflict sharing no transport references.
   * @param authoritativeEditor 新强 ETag 与完整权威 Resume / New strong ETag and complete authoritative Resume.
   * @param conflicts 已验证且属于提交批次的冲突 / Validated conflicts belonging to the submitted batch.
   */
  constructor(authoritativeEditor: UiResumeEditorModel, conflicts: readonly ResumeBatchConflict[]) {
    super('The Resume operation batch was atomically rejected by confirmed conflicts.')
    this.authoritativeEditor = structuredClone(authoritativeEditor)
    this.conflicts = structuredClone(conflicts)
  }
}

/**
 * @brief 本地快照已不能代表用户原始编辑版本 / Local snapshot no longer represents the user's original edit version.
 * @note 该错误不包含后端内容，只要求调用方重新读取权威 Resume。 / This error contains no backend content and only requires callers to reload the authoritative Resume.
 */
export class ResumeSnapshotConflictError extends Error {
  override readonly name = 'ResumeSnapshotConflictError'
  /** @brief 与服务端 precondition failure 对齐的稳定状态 / Stable status aligned with a service precondition failure. */
  readonly status = 412

  constructor() {
    super('The authoritative Resume revision no longer matches the edited snapshot.')
  }
}

/**
 * @brief 判断未知值是否为对象 / Determine whether an unknown value is an object.
 * @param value 待检查值 / Candidate value.
 * @return 非空对象时为 true / True for a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/**
 * @brief 提取可信来源的已确认原子批次冲突 / Extract a confirmed atomic-batch conflict from a trusted source.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 可直接吸收的权威恢复事实；其他错误为 null / Authoritative recovery facts ready for direct adoption, or null for any other error.
 * @note 只接受本应用边界创建的 class 实例；不为重复 bundle 增加可伪造的全局品牌兼容层。 / Only class instances created at this application boundary are accepted; no forgeable global-brand compatibility layer is added for duplicated bundles.
 */
export function getResumeBatchConflict(error: unknown): ResumeBatchConflictRecovery | null {
  if (!(error instanceof ResumeBatchConflictError)) return null
  /** @brief 候选权威编辑器 / Candidate authoritative editor. */
  const authoritativeEditor = error.authoritativeEditor
  /** @brief 候选冲突数组 / Candidate conflicts. */
  const conflicts = error.conflicts
  if (
    !isRecord(authoritativeEditor) ||
    typeof authoritativeEditor.concurrencyToken !== 'string' ||
    !isRecord(authoritativeEditor.resume) ||
    !Array.isArray(conflicts)
  ) {
    return null
  }
  /** @brief 经字段级校验的冲突投影 / Conflict projections validated field by field. */
  const validatedConflicts: ResumeBatchConflict[] = []
  for (const conflict of conflicts) {
    if (
      !isRecord(conflict) ||
      typeof conflict.operationId !== 'string' ||
      typeof conflict.code !== 'string' ||
      (conflict.entityId !== null && typeof conflict.entityId !== 'string') ||
      !Array.isArray(conflict.fieldPath) ||
      !conflict.fieldPath.every((segment) => typeof segment === 'string')
    ) {
      return null
    }
    validatedConflicts.push({
      code: conflict.code,
      entityId: conflict.entityId,
      fieldPath: [...conflict.fieldPath],
      operationId: conflict.operationId
    })
  }
  return {
    authoritativeEditor: structuredClone(authoritativeEditor as unknown as UiResumeEditorModel),
    conflicts: validatedConflicts
  }
}

/**
 * @brief 读取简历写操作的并发冲突状态 / Read the concurrency-conflict status of a Resume write.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 已知并发状态，其他错误返回 null / Known concurrency status, or null for other failures.
 * @note 页面只依赖稳定的应用语义，不依赖 HTTP error 类。
 */
export function getResumeConflictStatus(error: unknown): ResumeConflictStatus | null {
  if (!isRecord(error)) return null
  if (error.name === 'ApiV2WriteOutcomeUnknownError') {
    return error.kind === 'contract' && (error.status === 409 || error.status === 412)
      ? error.status
      : null
  }
  if (error.name === 'ApiV2ProblemError' && isRecord(error.problem)) {
    /** @brief 已由 API v2 transport 验证的 Problem status / Problem status validated by the API v2 transport. */
    const problemStatus = error.problem.status
    /** @brief 已由 API v2 transport 验证的稳定 Problem code / Stable Problem code validated by the API v2 transport. */
    const problemCode = error.problem.code
    if (
      problemStatus === 409 &&
      (problemCode === 'idempotency.in_progress' || problemCode === 'idempotency.key_reused')
    ) {
      return null
    }
    return problemStatus === 409 || problemStatus === 412 ? problemStatus : null
  }
  return error.status === 409 || error.status === 412 ? error.status : null
}

/**
 * @brief 读取 Resume command 的 API v2 幂等冲突 / Read an API v2 idempotency conflict for a Resume command.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 正在执行、key 被异意图复用，或 null / In-progress, key-reused, or null.
 * @note `in-progress` 必须以同一请求和 key 确认；`key-reused` 必须丢弃本地错误 key，且两者都不是 Resume revision conflict。 / `in-progress` must be confirmed with the same request and key; `key-reused` must discard the faulty local key, and neither is a Resume revision conflict.
 */
export function getResumeIdempotencyConflict(error: unknown): ResumeIdempotencyConflict | null {
  if (
    !isRecord(error) ||
    error.name !== 'ApiV2ProblemError' ||
    !isRecord(error.problem) ||
    error.problem.status !== 409
  ) {
    return null
  }
  if (error.problem.code === 'idempotency.in_progress') return 'in-progress'
  return error.problem.code === 'idempotency.key_reused' ? 'key-reused' : null
}

/**
 * @brief 读取 API v2 Problem 已验证的 Retry-After 毫秒数 / Read validated Retry-After milliseconds from an API v2 Problem.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 非负有限延迟；未提供或不可信时为 null / Non-negative finite delay, or null when absent or untrusted.
 */
export function getResumeCommandRetryAfterMilliseconds(error: unknown): number | null {
  if (
    !isRecord(error) ||
    error.name !== 'ApiV2ProblemError' ||
    (typeof error.retryAfterMilliseconds !== 'number' && error.retryAfterMilliseconds !== null)
  ) {
    return null
  }
  return error.retryAfterMilliseconds !== null &&
    Number.isFinite(error.retryAfterMilliseconds) &&
    error.retryAfterMilliseconds >= 0
    ? error.retryAfterMilliseconds
    : null
}

/**
 * @brief 判断 API v2 是否已明确拒绝 Resume command / Determine whether API v2 definitively rejected a Resume command.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 已验证 4xx Problem 明确表示本次命令终结时为 true / True when a validated 4xx Problem definitively terminates this command.
 * @note `idempotency.in_progress` 仍须原样确认；其他 4xx 即使允许创建后续重试，也已经给当前冻结信封一个确定答案。409/412 冲突由并发恢复分支处理。 / `idempotency.in_progress` still requires exact confirmation; every other 4xx gives the current frozen envelope a definitive answer even when a later new attempt is allowed. 409/412 conflicts are handled by concurrency recovery.
 */
export function isResumeCommandDefinitivelyRejected(error: unknown): boolean {
  if (
    !isRecord(error) ||
    error.name !== 'ApiV2ProblemError' ||
    !isRecord(error.problem) ||
    typeof error.problem.status !== 'number' ||
    error.problem.status < 400 ||
    error.problem.status >= 500
  ) {
    return false
  }
  return error.problem.code !== 'idempotency.in_progress'
}

/**
 * @brief 判断未知写结果是否来自已收到 HTTP 响应的契约失败 / Determine whether an unknown write outcome came from a received but non-conforming HTTP response.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 原 key 的已缓存坏响应不可再用于确认时为 true / True when the malformed response cached for the original key cannot confirm the outcome again.
 * @note 该情形应先 GET 权威，但不得继续重放会稳定返回同一坏响应的 key；network、timeout、abort 与无可信 HTTP 响应的 server unknown 仍保留原 key。 / Authority must be read first, but the key that deterministically replays the same invalid response must not be retried; network, timeout, abort, and server unknowns without a trustworthy HTTP response retain the original key.
 */
export function isResumeUnreplayableContractResponse(error: unknown): boolean {
  return (
    isRecord(error) &&
    error.name === 'ApiV2WriteOutcomeUnknownError' &&
    error.kind === 'contract' &&
    typeof error.status === 'number'
  )
}
