import { describe, expect, it } from 'vitest'

import { HttpContractError, HttpProblemError } from '../http'
import { classifyResourceFailure } from './resource-errors'

describe('classifyResourceFailure', (): void => {
  it.each([
    [401, 'authentication-required', false],
    [403, 'forbidden', false],
    [404, 'not-found', false],
    [409, 'conflict', true],
    [412, 'conflict', true],
    [429, 'rate-limited', true],
    [503, 'service-unavailable', true]
  ] as const)('maps HTTP %i without exposing backend text', (status, kind, retryable): void => {
    /** @brief 包含不应显示文本的后端 Problem / Backend Problem containing text that must not be displayed. */
    const error = new HttpProblemError({
      code: 'private.code',
      detail: 'private detail',
      requestId: 'req_12345678',
      retryable: false,
      retryAfterMs: null,
      status,
      title: 'private title'
    })

    expect(classifyResourceFailure(error)).toEqual({
      kind,
      referenceId: 'req_12345678',
      retryable
    })
  })

  it('honours the ProblemDetails retryable flag for otherwise unknown statuses', (): void => {
    /** @brief 可重试的领域校验 Problem / Retryable domain-validation Problem. */
    const error = new HttpProblemError({
      code: 'domain.retry_later',
      detail: null,
      requestId: null,
      retryable: true,
      retryAfterMs: 250,
      status: 422,
      title: 'private title'
    })

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'unknown',
      referenceId: null,
      retryable: true
    })
  })

  it('rejects unsafe request identifiers and classifies transport failures', (): void => {
    /** @brief 含控制字符的无效关联编号 / Invalid correlation identifier containing a control character. */
    const problem = new HttpProblemError({
      code: 'service.failed',
      detail: null,
      requestId: 'private\nheader',
      retryable: true,
      retryAfterMs: null,
      status: 503,
      title: 'private title'
    })

    expect(classifyResourceFailure(problem).referenceId).toBeNull()
    expect(classifyResourceFailure(new TypeError('private URL'))).toMatchObject({
      kind: 'network',
      retryable: true
    })
    expect(classifyResourceFailure(new HttpContractError('private response', 200))).toMatchObject({
      kind: 'invalid-response',
      retryable: true
    })
    expect(
      classifyResourceFailure(new HttpContractError('private upstream body', 503))
    ).toMatchObject({
      kind: 'service-unavailable',
      retryable: true
    })
  })

  it('keeps unavailable capabilities honest and non-retryable', (): void => {
    /** @brief 未冻结能力的明确错误 / Explicit error for an unfrozen capability. */
    const error = new Error('private capability detail')
    error.name = 'InterviewRealtimeCapabilityError'

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'capability-unavailable',
      referenceId: null,
      retryable: false
    })
  })
})
