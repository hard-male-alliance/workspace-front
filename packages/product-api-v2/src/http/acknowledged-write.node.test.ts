import { describe, expect, it } from 'vitest'

import { decodeAcknowledgedWrite } from './acknowledged-write'
import { ApiV2ContractError, ApiV2WriteOutcomeUnknownError } from './errors'

/** @brief 可独立验证的测试 request ID / Independently verifiable test request ID. */
const REQUEST_ID = 'request_acknowledged_write_0001'

describe('API v2 acknowledged write decoding', (): void => {
  it('maps a post-acknowledgement contract failure to the exact status and request ID', (): void => {
    /** @brief 已确认 202 的结构响应 / Structural response with an acknowledged 202. */
    const response = { metadata: { requestId: REQUEST_ID } }

    expect(() =>
      decodeAcknowledgedWrite(response, 202, (): never => {
        throw new ApiV2ContractError('Malformed accepted Job.')
      })
    ).toThrowError(
      expect.objectContaining({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        problemCode: null,
        requestId: REQUEST_ID,
        status: 202
      })
    )
  })

  it('does not retain an invalid response request ID', (): void => {
    expect(() =>
      decodeAcknowledgedWrite({ metadata: { requestId: 'short' } }, 201, (): never => {
        throw new ApiV2ContractError('Malformed created resource.')
      })
    ).toThrowError(expect.objectContaining({ requestId: null, status: 201 }))
  })

  it('preserves an existing unknown outcome without wrapping it again', (): void => {
    /** @brief 已投影的未知写结果 / Already projected unknown write outcome. */
    const original = new ApiV2WriteOutcomeUnknownError('server', 503, 'service.unavailable')

    expect(() =>
      decodeAcknowledgedWrite({ metadata: { requestId: REQUEST_ID } }, 200, (): never => {
        throw original
      })
    ).toThrow(original)
  })

  it('does not disguise a non-contract programmer error', (): void => {
    /** @brief 非契约实现错误 / Non-contract implementation error. */
    const original = new TypeError('Unexpected decoder implementation failure.')

    expect(() =>
      decodeAcknowledgedWrite({ metadata: { requestId: REQUEST_ID } }, 200, (): never => {
        throw original
      })
    ).toThrow(original)
  })
})
