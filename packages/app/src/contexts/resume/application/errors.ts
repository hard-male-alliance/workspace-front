/** @file Resume Authoring 安全应用错误判定 / Safe Resume Authoring application-error classification. */

/** @brief 简历乐观并发冲突状态 / Resume optimistic-concurrency conflict status. */
export type ResumeConflictStatus = 409 | 412

/**
 * @brief 判断未知值是否为对象 / Determine whether an unknown value is an object.
 * @param value 待检查值 / Candidate value.
 * @return 非空对象时为 true / True for a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
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
