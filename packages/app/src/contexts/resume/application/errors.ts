/** @file Resume Authoring 安全应用错误判定 / Safe Resume Authoring application-error classification. */

/** @brief 简历乐观并发冲突状态 / Resume optimistic-concurrency conflict status. */
export type ResumeConflictStatus = 409 | 412

/** @brief 简历操作拒绝的安全稳定投影 / Safe stable projection of a Resume-operation rejection. */
export interface ResumeOperationRejection {
  /** @brief 稳定机器可读错误码 / Stable machine-readable error code. */
  readonly code: string
  /** @brief 服务端声明的可重试语义 / Retry semantics declared by the service. */
  readonly retryable: boolean
  /** @brief 领域拒绝对应的 HTTP 状态 / HTTP status represented by the domain rejection. */
  readonly status: number
}

/**
 * @brief 后端拒绝了语义化简历操作 / Backend rejected a semantic Resume operation.
 * @note 合法的批次响应仍可能包含 rejected；调用方不得把它当作保存成功。
 * A valid batch response may still contain rejected; callers must not report it as a successful save.
 */
export class ResumeOperationRejectedError extends Error {
  /** @brief 稳定机器可读错误码 / Stable machine-readable error code. */
  readonly code: string
  /** @brief 是否可在服务端语义下重试 / Whether retry is allowed by service semantics. */
  readonly retryable: boolean
  /** @brief 拒绝语义对应的 HTTP 状态 / HTTP status represented by the rejection. */
  readonly status: number

  /**
   * @brief 构造不含后端文本的拒绝错误 / Construct a rejection error without backend text.
   * @param rejection 已验证的安全投影；缺失时使用本地稳定默认 / Validated safe projection, or a stable local default when absent.
   */
  constructor(rejection: ResumeOperationRejection | null = null) {
    super('Backend rejected one or more Resume operations.')
    this.name = 'ResumeOperationRejectedError'
    this.code = rejection?.code ?? 'resume.operation_rejected'
    this.retryable = rejection?.retryable ?? false
    this.status = rejection?.status ?? 422
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
 * @brief 判断错误是否来自包含 rejected operation 的已确认批次结果 / Determine whether an error came from a confirmed batch containing a rejected operation.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 必须先重新读取权威 Resume 时为 true / True when the authoritative Resume must be reloaded first.
 */
export function isResumeOperationRejected(error: unknown): boolean {
  return isRecord(error) && error.name === 'ResumeOperationRejectedError'
}

/**
 * @brief 读取简历写操作的并发冲突状态 / Read the concurrency-conflict status of a Resume write.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 已知并发状态，其他错误返回 null / Known concurrency status, or null for other failures.
 * @note 页面只依赖稳定的应用语义，不依赖 HTTP error 类。
 */
export function getResumeConflictStatus(error: unknown): ResumeConflictStatus | null {
  if (!isRecord(error)) return null
  return error.status === 409 || error.status === 412 ? error.status : null
}
