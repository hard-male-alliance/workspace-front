/** @file 知识工作流的安全错误文案映射 / Safe error-copy mapping for Knowledge workflows. */

import { HttpContractError, HttpProblemError } from '../../infrastructure/http/http-client'
import { KnowledgePollingTimeoutError } from './knowledge-polling'

/** @brief 错误文案翻译器的最小边界 / Minimal translator boundary for error copy. */
export type KnowledgeErrorTranslator = (key: string) => string

const PROBLEM_CODE_KEYS: Readonly<Record<string, string>> = {
  'knowledge.file_too_large': 'knowledge.errors.fileTooLarge',
  'knowledge.file_type_unsupported': 'knowledge.errors.fileTypeUnsupported',
  'knowledge.file_type_mismatch': 'knowledge.errors.fileTypeMismatch'
}

const STATUS_KEYS: Readonly<Record<number, string>> = {
  409: 'knowledge.errors.conflict',
  412: 'knowledge.errors.preconditionFailed',
  413: 'knowledge.errors.fileTooLarge',
  422: 'knowledge.errors.validation'
}

/** @brief 判断未知错误是否为平台取消错误 / Determine whether an unknown error is an abort error. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

/**
 * @brief 将技术错误映射为不泄漏细节的用户文案 / Map technical errors to non-leaking user copy.
 * @note 不插入后端 detail、request ID、URL、文件名或响应正文。
 */
export function getKnowledgeErrorMessage(
  error: unknown,
  translate: KnowledgeErrorTranslator
): string {
  if (isAbortError(error)) {
    return translate('knowledge.errors.cancelled')
  }
  if (error instanceof KnowledgePollingTimeoutError) {
    return translate('knowledge.errors.pollingTimeout')
  }
  if (error instanceof HttpProblemError) {
    const problemKey = PROBLEM_CODE_KEYS[error.code]
    if (problemKey !== undefined) {
      return translate(problemKey)
    }
    if (error.code.startsWith('idempotency.')) {
      return translate('knowledge.errors.duplicateRequest')
    }
    return translate(STATUS_KEYS[error.status] ?? 'knowledge.errors.requestFailed')
  }
  if (error instanceof HttpContractError) {
    return translate('knowledge.errors.invalidResponse')
  }
  return translate('knowledge.errors.network')
}
