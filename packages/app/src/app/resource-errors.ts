/** @file 页面资源失败的安全用户语义 / Safe user semantics for page-resource failures. */

/** @brief 页面可恢复失败类别 / Recoverable page-failure categories. */
export type ResourceFailureKind =
  | 'authentication-required'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'service-unavailable'
  | 'invalid-response'
  | 'network'
  | 'capability-unavailable'
  | 'unknown'

/** @brief 页面允许显示的安全失败投影 / Safe failure projection displayable by pages. */
export interface ResourceFailure {
  /** @brief 用户文案对应的稳定类别 / Stable category used for user copy. */
  readonly kind: ResourceFailureKind
  /** @brief 是否应向用户提供原地重试 / Whether an in-place retry should be offered. */
  readonly retryable: boolean
  /** @brief 可安全展示的后端关联编号 / Backend correlation identifier safe to display. */
  readonly referenceId: string | null
}

/**
 * @brief 判断未知值是否为只读对象 / Determine whether an unknown value is a read-only object.
 * @param value 待检查的未知值 / Unknown value to inspect.
 * @return 非空且非数组对象时为 true / True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @brief 只接受适合显示和检索的关联编号 / Accept only correlation identifiers safe for display and lookup.
 * @param value 未受信任的 request_id / Untrusted request_id value.
 * @return 规范关联编号；不安全时为 null / Normalized correlation identifier, or null when unsafe.
 */
function readReferenceId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/u.test(value) ? value : null
}

/**
 * @brief 将 HTTP 状态映射为用户可行动的资源失败 / Map an HTTP status to an actionable resource failure.
 * @param status 合法 HTTP 状态码 / Valid HTTP status code.
 * @param retryable 后端明确给出的重试语义 / Retry semantics explicitly supplied by the backend.
 * @param referenceId 可选关联编号 / Optional correlation identifier.
 * @return 不包含后端内部文本的失败投影 / Failure projection without backend-internal text.
 */
function classifyHttpStatus(
  status: number,
  retryable: boolean,
  referenceId: string | null
): ResourceFailure {
  if (status === 401) return { kind: 'authentication-required', referenceId, retryable: false }
  if (status === 403) return { kind: 'forbidden', referenceId, retryable: false }
  if (status === 404) return { kind: 'not-found', referenceId, retryable: false }
  if (status === 409 || status === 412) {
    return { kind: 'conflict', referenceId, retryable: true }
  }
  if (status === 429) return { kind: 'rate-limited', referenceId, retryable: true }
  if (status >= 500) return { kind: 'service-unavailable', referenceId, retryable: true }
  return { kind: 'unknown', referenceId, retryable }
}

/**
 * @brief 将未知技术错误收敛为安全且可行动的页面语义 / Narrow an unknown technical error to safe, actionable page semantics.
 * @param error 应用端口返回的未知错误 / Unknown error returned by an application port.
 * @return 页面可以安全呈现的失败投影 / Failure projection safe for page presentation.
 * @note 后端 title、detail、URL、字段值和响应正文均不会进入此投影 / Backend titles, details, URLs, field values, and response bodies never enter this projection.
 */
export function classifyResourceFailure(error: unknown): ResourceFailure {
  if (isRecord(error)) {
    /** @brief 技术错误的稳定名称 / Stable technical error name. */
    const name = typeof error.name === 'string' ? error.name : ''

    if (name === 'HttpProblemError' && typeof error.status === 'number') {
      return classifyHttpStatus(
        error.status,
        typeof error.retryable === 'boolean' ? error.retryable : false,
        readReferenceId(error.requestId)
      )
    }
    if (name === 'HttpContractError') {
      if (typeof error.status === 'number' && error.status >= 500) {
        return { kind: 'service-unavailable', referenceId: null, retryable: true }
      }
      return { kind: 'invalid-response', referenceId: null, retryable: true }
    }
    if (name.endsWith('CapabilityError')) {
      return { kind: 'capability-unavailable', referenceId: null, retryable: false }
    }
    if (name === 'TimeoutError') {
      return { kind: 'service-unavailable', referenceId: null, retryable: true }
    }
  }

  if (error instanceof TypeError) {
    return { kind: 'network', referenceId: null, retryable: true }
  }

  return { kind: 'unknown', referenceId: null, retryable: true }
}
