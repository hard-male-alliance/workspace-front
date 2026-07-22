import { describe, expect, it } from 'vitest'

import { HttpCommandOutcomeUnknownError, HttpContractError, HttpProblemError } from '../http'
import { classifyResourceFailure } from './resource-errors'

describe('classifyResourceFailure', (): void => {
  it.each([
    [401, 'authentication-required'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [400, 'invalid-request'],
    [413, 'invalid-request'],
    [415, 'invalid-request'],
    [422, 'invalid-request'],
    [409, 'conflict'],
    [412, 'conflict'],
    [408, 'service-unavailable'],
    [429, 'rate-limited'],
    [503, 'service-unavailable']
  ] as const)('maps HTTP %i without exposing backend text', (status, kind): void => {
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
      retryable: false
    })
  })

  it.each([
    [400, true],
    [409, false],
    [429, false],
    [503, false]
  ] as const)('keeps the HTTP %i kind while respecting retryable=%s', (status, retryable): void => {
    /** @brief 带显式重试语义的后端 Problem / Backend Problem with explicit retry semantics. */
    const error = new HttpProblemError({
      code: 'domain.explicit_retry_policy',
      detail: null,
      requestId: null,
      retryable,
      retryAfterMs: null,
      status,
      title: 'private title'
    })

    expect(classifyResourceFailure(error).retryable).toBe(retryable)
  })

  it('honours the ProblemDetails retryable flag for otherwise unknown statuses', (): void => {
    /** @brief 未专门映射但后端允许重试的 Problem / Unmapped Problem that the backend marks retryable. */
    const error = new HttpProblemError({
      code: 'domain.retry_later',
      detail: null,
      requestId: null,
      retryable: true,
      retryAfterMs: 250,
      status: 423,
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

  it('prevents direct retry when a write command outcome is unknown', (): void => {
    expect(classifyResourceFailure(new HttpCommandOutcomeUnknownError())).toEqual({
      kind: 'outcome-unknown',
      referenceId: null,
      retryable: false
    })
  })

  it('allows a timed-out read to be retried', (): void => {
    expect(
      classifyResourceFailure(new DOMException('private read deadline', 'TimeoutError'))
    ).toEqual({
      kind: 'service-unavailable',
      referenceId: null,
      retryable: true
    })
  })

  it('presents a rejected Resume operation as a non-retryable input failure', (): void => {
    /** @brief 已通过 transport 但被领域规则拒绝的写入 / Write accepted by transport but rejected by domain rules. */
    const error = new Error('private operation problem')
    error.name = 'ResumeOperationRejectedError'

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'invalid-request',
      referenceId: null,
      retryable: false
    })
  })

  it('preserves conflict recovery semantics from a rejected Resume operation', (): void => {
    /** @brief operation result 携带的安全冲突错误 / Safe conflict error carried by an operation result. */
    const error = Object.assign(new Error('private operation problem'), {
      name: 'ResumeOperationRejectedError',
      retryable: true,
      status: 412
    })

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'conflict',
      referenceId: null,
      retryable: true
    })
  })
})
