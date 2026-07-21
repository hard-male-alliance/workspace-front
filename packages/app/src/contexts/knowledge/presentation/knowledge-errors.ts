/** @file 知识工作流的安全错误文案映射 / Safe error-copy mapping for Knowledge workflows. */

import { classifyKnowledgeFailure } from '../application/errors'

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

/**
 * @brief 将技术错误映射为不泄漏细节的用户文案 / Map technical errors to non-leaking user copy.
 * @note 不插入后端 detail、request ID、URL、文件名或响应正文。
 */
export function getKnowledgeErrorMessage(
  error: unknown,
  translate: KnowledgeErrorTranslator
): string {
  const failure = classifyKnowledgeFailure(error)
  if (failure.kind === 'aborted') return translate('knowledge.errors.cancelled')
  if (failure.kind === 'polling-timeout') return translate('knowledge.errors.pollingTimeout')
  if (failure.kind === 'problem') {
    const problemKey = PROBLEM_CODE_KEYS[failure.code]
    if (problemKey !== undefined) {
      return translate(problemKey)
    }
    if (failure.code.startsWith('idempotency.')) {
      return translate('knowledge.errors.duplicateRequest')
    }
    return translate(STATUS_KEYS[failure.status] ?? 'knowledge.errors.requestFailed')
  }
  if (failure.kind === 'invalid-response') return translate('knowledge.errors.invalidResponse')
  return translate('knowledge.errors.network')
}
