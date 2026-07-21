import { describe, expect, it } from 'vitest'

import { HttpContractError, HttpProblemError } from '../../infrastructure/http/http-client'
import { KnowledgePollingTimeoutError } from './knowledge-polling'
import { getKnowledgeErrorMessage } from './knowledge-errors'

const translate = (key: string): string => key

describe('getKnowledgeErrorMessage', () => {
  it.each([
    ['knowledge.file_too_large', 413, 'knowledge.errors.fileTooLarge'],
    ['knowledge.file_type_unsupported', 422, 'knowledge.errors.fileTypeUnsupported'],
    ['knowledge.file_type_mismatch', 422, 'knowledge.errors.fileTypeMismatch'],
    ['idempotency.conflict', 409, 'knowledge.errors.duplicateRequest']
  ])('maps safe problem code %s', (code, status, expected) => {
    const error = new HttpProblemError({
      code,
      detail: 'sensitive backend detail',
      requestId: 'request-sensitive',
      status,
      title: 'backend title'
    })

    expect(getKnowledgeErrorMessage(error, translate)).toBe(expected)
  })

  it.each([
    [409, 'knowledge.errors.conflict'],
    [412, 'knowledge.errors.preconditionFailed'],
    [413, 'knowledge.errors.fileTooLarge'],
    [422, 'knowledge.errors.validation']
  ])('maps safe HTTP status %i', (status, expected) => {
    const error = new HttpProblemError({
      code: 'unknown.code',
      detail: null,
      requestId: null,
      status,
      title: 'backend title'
    })

    expect(getKnowledgeErrorMessage(error, translate)).toBe(expected)
  })

  it('maps timeout, abort, contract, and generic failures without leaking details', () => {
    expect(getKnowledgeErrorMessage(new KnowledgePollingTimeoutError(), translate)).toBe(
      'knowledge.errors.pollingTimeout'
    )
    expect(
      getKnowledgeErrorMessage(new DOMException('private filename', 'AbortError'), translate)
    ).toBe('knowledge.errors.cancelled')
    expect(
      getKnowledgeErrorMessage(new HttpContractError('private response', 200), translate)
    ).toBe('knowledge.errors.invalidResponse')
    expect(getKnowledgeErrorMessage(new Error('private URL'), translate)).toBe(
      'knowledge.errors.network'
    )
  })
})
