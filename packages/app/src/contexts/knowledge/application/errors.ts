/** @file Knowledge 安全应用错误分类 / Safe Knowledge application-error classification. */

import { KnowledgePollingTimeoutError } from './knowledge-polling'

/** @brief Knowledge 用户动作失败类别 / Knowledge user-action failure category. */
export type KnowledgeFailure =
  | { readonly kind: 'aborted' }
  | { readonly kind: 'polling-timeout' }
  | { readonly kind: 'problem'; readonly code: string; readonly status: number }
  | { readonly kind: 'invalid-response' }
  | { readonly kind: 'network' }

/**
 * @brief 判断未知值是否为对象 / Determine whether an unknown value is an object.
 * @param value 待检查值 / Candidate value.
 * @return 非空对象时为 true / True for a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/**
 * @brief 将 adapter 错误收窄为页面允许处理的安全语义 / Narrow adapter errors to safe page-level semantics.
 * @param error application port 返回的未知错误 / Unknown error returned by the application port.
 * @return 不包含后端 detail、URL、request ID 或文件名的失败类别 / Failure category without backend details, URLs, request IDs, or filenames.
 */
export function classifyKnowledgeFailure(error: unknown): KnowledgeFailure {
  if (isRecord(error) && error.name === 'AbortError') return { kind: 'aborted' }
  if (error instanceof KnowledgePollingTimeoutError) return { kind: 'polling-timeout' }
  if (
    isRecord(error) &&
    error.name === 'HttpProblemError' &&
    typeof error.code === 'string' &&
    typeof error.status === 'number'
  ) {
    return { code: error.code, kind: 'problem', status: error.status }
  }
  if (isRecord(error) && error.name === 'HttpContractError') return { kind: 'invalid-response' }
  return { kind: 'network' }
}
