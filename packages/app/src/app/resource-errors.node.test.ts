import { describe, expect, it } from 'vitest'
import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError,
  ApiV2ProblemError,
  ApiV2WriteOutcomeUnknownError
} from '@ai-job-workspace/product-api-v2'

import { ConfirmedCommandConflictError } from '../shared-kernel/application-error'
import { classifyResourceFailure, requiresAuthorityReload } from './resource-errors'

/**
 * @brief 构造已验证的 API v2 Problem 错误 / Construct a validated API v2 Problem error.
 * @param status HTTP 状态码 / HTTP status code.
 * @param retryable 服务端声明的可重试性 / Retryability declared by the server.
 * @param requestId 请求关联编号 / Request correlation identifier.
 * @param code 稳定机器错误码 / Stable machine error code.
 * @return API v2 Problem 错误 / API v2 Problem error.
 */
function createProblem(
  status: number,
  retryable = false,
  requestId = 'req_safe_12345678',
  code = 'private.code'
): ApiV2ProblemError {
  return new ApiV2ProblemError(
    {
      code,
      detail: 'private detail',
      errors: [],
      extensions: null,
      instance: null,
      request_id: requestId,
      retryable,
      status,
      title: 'private title',
      type: 'https://api.hmalliances.org/problems/test-problem'
    },
    null
  )
}

/** @brief 分类器测试使用的已确认命令冲突 / Confirmed command conflict used by classifier tests. */
class TestConfirmedCommandConflictError extends ConfirmedCommandConflictError {}

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
    const error = createProblem(status, false, 'req_12345678')

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
    const error = createProblem(status, retryable, 'req_retry_policy_12345678')

    expect(classifyResourceFailure(error).retryable).toBe(retryable)
  })

  it('honours the ProblemDetails retryable flag for otherwise unknown statuses', (): void => {
    /** @brief 未专门映射但后端允许重试的 Problem / Unmapped Problem that the backend marks retryable. */
    const error = createProblem(423, true)

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'unknown',
      referenceId: 'req_safe_12345678',
      retryable: true
    })
  })

  it('rejects unsafe request identifiers and classifies transport failures', (): void => {
    /** @brief 含控制字符的无效关联编号 / Invalid correlation identifier containing a control character. */
    const problem = createProblem(503, true, 'private\nheader', 'service.failed')

    expect(classifyResourceFailure(problem).referenceId).toBeNull()
    expect(classifyResourceFailure(new TypeError('private URL'))).toMatchObject({
      kind: 'network',
      retryable: true
    })
    expect(classifyResourceFailure(new ApiV2ContractError('private response', 200))).toMatchObject({
      kind: 'invalid-response',
      retryable: false
    })
    expect(
      classifyResourceFailure(new ApiV2ContractError('private upstream body', 503))
    ).toMatchObject({
      kind: 'service-unavailable',
      retryable: true
    })
  })

  it.each([409, 412] as const)(
    'keeps a malformed HTTP %i response invalid while requiring authority reload',
    (status): void => {
      /** @brief 状态可信但正文违反 ProblemDetails 的响应错误 / Response error with a trusted status and invalid ProblemDetails body. */
      const error = new ApiV2ContractError('private malformed conflict body', status)

      expect(classifyResourceFailure(error)).toEqual({
        kind: 'invalid-response',
        referenceId: null,
        retryable: false
      })
      expect(requiresAuthorityReload(error)).toBe(true)
    }
  )

  it('does not require authority reload for a malformed non-conflict response', (): void => {
    /** @brief 普通请求错误的违约响应 / Contract-invalid response for an ordinary request error. */
    const error = new ApiV2ContractError('private malformed request body', 422)

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'invalid-response',
      referenceId: null,
      retryable: false
    })
    expect(requiresAuthorityReload(error)).toBe(false)
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
    expect(classifyResourceFailure(new ApiV2WriteOutcomeUnknownError('network'))).toEqual({
      kind: 'outcome-unknown',
      referenceId: null,
      retryable: false
    })
  })

  it('classifies the closed API v2 transport error family without exposing its messages', (): void => {
    /** @brief 已验证的 API v2 Problem 错误投影 / Validated API v2 Problem error projection. */
    const problem = createProblem(429, true, 'req_api_v2_1234')
    /** @brief 已发出但结果未知的 API v2 写入 / API v2 write dispatched with an unknown outcome. */
    const unknownWrite = new ApiV2WriteOutcomeUnknownError('network', null, null, 'req_api_v2_5678')

    expect(classifyResourceFailure(problem)).toEqual({
      kind: 'rate-limited',
      referenceId: 'req_api_v2_1234',
      retryable: true
    })
    expect(classifyResourceFailure(unknownWrite)).toEqual({
      kind: 'outcome-unknown',
      referenceId: 'req_api_v2_5678',
      retryable: false
    })
    expect(requiresAuthorityReload(unknownWrite)).toBe(true)
    /** @brief 已收到但无法验证成功响应的未知写入 / Unknown write with a received but invalid success response. */
    const invalidSuccess = new ApiV2WriteOutcomeUnknownError(
      'contract',
      200,
      null,
      'req_api_v2_bad_response'
    )
    expect(classifyResourceFailure(invalidSuccess)).toEqual({
      kind: 'invalid-response',
      referenceId: 'req_api_v2_bad_response',
      retryable: false
    })
    expect(requiresAuthorityReload(invalidSuccess)).toBe(true)
    expect(classifyResourceFailure(new ApiV2NetworkError('timeout'))).toEqual({
      kind: 'service-unavailable',
      referenceId: null,
      retryable: true
    })
    expect(classifyResourceFailure(new ApiV2AuthenticationRequiredError())).toEqual({
      kind: 'authentication-required',
      referenceId: null,
      retryable: false
    })
    expect(classifyResourceFailure(new ApiV2ContractError('private request', null))).toEqual({
      kind: 'invalid-request',
      referenceId: null,
      retryable: false
    })
    expect(classifyResourceFailure(new ApiV2ContractError('private response', 200))).toEqual({
      kind: 'invalid-response',
      referenceId: null,
      retryable: false
    })
  })

  it('distinguishes local creation input from a creation-port contract violation', (): void => {
    expect(
      classifyResourceFailure({
        failure: { kind: 'unsupported-template-locale' },
        name: 'ResumeCreationError'
      })
    ).toMatchObject({ kind: 'invalid-request' })
    expect(
      classifyResourceFailure({
        failure: { kind: 'invalid-creation-result' },
        name: 'ResumeCreationError'
      })
    ).toMatchObject({ kind: 'invalid-response' })
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

  it('classifies a confirmed Resume batch conflict without invented retry semantics', (): void => {
    /** @brief 不依赖具体限界上下文载荷的已确认冲突 / Confirmed conflict independent of a bounded-context payload. */
    const error = new TestConfirmedCommandConflictError('Confirmed command conflict.')

    expect(classifyResourceFailure(error)).toEqual({
      kind: 'conflict',
      referenceId: null,
      retryable: false
    })
    expect(requiresAuthorityReload(error)).toBe(false)
  })

  it('does not trust a forged Resume batch-conflict name', (): void => {
    expect(classifyResourceFailure({ name: 'ResumeBatchConflictError' })).toEqual({
      kind: 'unknown',
      referenceId: null,
      retryable: true
    })
  })

  it.each(['idempotency.in_progress', 'idempotency.key_reused'] as const)(
    'does not mistake %s for a Resume authority conflict',
    (code): void => {
      /** @brief API v2 transport 已验证的幂等 Problem / Idempotency Problem validated by the API v2 transport. */
      const error = createProblem(
        409,
        code === 'idempotency.in_progress',
        'req_idempotency_12345678',
        code
      )

      expect(requiresAuthorityReload(error)).toBe(false)
    }
  )

  it('classifies Render and host Artifact failures by their stable application codes', (): void => {
    expect(
      classifyResourceFailure({ code: 'preview-too-large', name: 'ResumeRenderProcessError' })
    ).toMatchObject({ kind: 'capability-unavailable', retryable: false })
    expect(
      classifyResourceFailure({ code: 'content-length-mismatch', name: 'ResumePdfPreviewError' })
    ).toMatchObject({ kind: 'invalid-response', retryable: false })
    expect(
      classifyResourceFailure({ code: 'artifact-too-large', name: 'WebArtifactSaveError' })
    ).toMatchObject({ kind: 'capability-unavailable', retryable: false })
  })
})
