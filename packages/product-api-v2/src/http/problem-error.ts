/** @file API v2 Problem 的错误投影 / Error projection for an API v2 Problem. */

import type { ProblemDetails } from './problem'

/**
 * @brief 服务端返回的 RFC 9457 API v2 Problem / RFC 9457 API v2 Problem returned by the server.
 */
export class ApiV2ProblemError extends Error {
  override readonly name = 'ApiV2ProblemError'
  /** @brief 已完整校验的 Problem / Fully validated Problem. */
  readonly problem: ProblemDetails
  /** @brief Retry-After 解析后的非负毫秒数 / Non-negative milliseconds parsed from Retry-After. */
  readonly retryAfterMilliseconds: number | null

  /**
   * @brief 构造结构化服务端错误 / Construct a structured server error.
   * @param problem 已完整校验的 Problem / Fully validated Problem.
   * @param retryAfterMilliseconds Retry-After 的客户端投影 / Client projection of Retry-After.
   */
  constructor(problem: ProblemDetails, retryAfterMilliseconds: number | null) {
    super(problem.title)
    this.problem = problem
    this.retryAfterMilliseconds = retryAfterMilliseconds
  }
}
