/** @file 已确认 HTTP 成功后的写响应契约边界 / Contract boundary for write responses after acknowledged HTTP success. */

import { opaqueId } from './contract'
import { ApiV2ContractError, ApiV2WriteOutcomeUnknownError } from './errors'

/** @brief 会产生权威写结果表示的成功状态 / Success statuses that carry authoritative write-result representations. */
export type ApiV2AcknowledgedWriteStatus = 200 | 201 | 202

/**
 * @brief 从写响应中提取可独立信任的 request ID / Extract an independently trustworthy request ID from a write response.
 * @param response 已返回但尚未完成领域校验的响应 / Returned response not yet fully validated by the domain boundary.
 * @return 合法 request ID；缺失或非法时为 null / Valid request ID, or null when missing or invalid.
 */
function trustedAcknowledgedWriteRequestId(response: unknown): string | null {
  try {
    if (response === null || typeof response !== 'object' || Array.isArray(response)) return null
    /** @brief 未验证的响应 metadata / Unvalidated response metadata. */
    const metadata = (response as Readonly<Record<string, unknown>>).metadata
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    return opaqueId(
      (metadata as Readonly<Record<string, unknown>>).requestId,
      'response.headers.X-Request-Id'
    )
  } catch {
    return null
  }
}

/**
 * @brief 在 HTTP 已确认成功后解码写结果并保留不确定性 / Decode a write result after acknowledged HTTP success while preserving uncertainty.
 * @param response 已确认成功的 transport 响应 / Transport response with acknowledged success.
 * @param status 端点唯一允许的精确成功状态 / Exact success status uniquely allowed by the endpoint.
 * @param decode body、metadata 与 command 后置条件解码 / Decoder for body, metadata, and command postconditions.
 * @return 完成契约校验的权威写结果 / Authoritative write result that passed contract validation.
 * @note 仅把解码期契约错误转换为结果未知；dispatch 前校验必须在调用本函数前完成。 / Only decoding-time contract errors become unknown outcomes; pre-dispatch validation must finish before calling this function.
 */
export function decodeAcknowledgedWrite<T>(
  response: unknown,
  status: ApiV2AcknowledgedWriteStatus,
  decode: () => T
): T {
  /** @brief 可在其余响应非法时独立保留的 request ID / Request ID independently retainable when the rest of the response is invalid. */
  const requestId = trustedAcknowledgedWriteRequestId(response)
  try {
    return decode()
  } catch (error: unknown) {
    if (error instanceof ApiV2WriteOutcomeUnknownError) throw error
    if (error instanceof ApiV2ContractError) {
      throw new ApiV2WriteOutcomeUnknownError('contract', status, null, requestId)
    }
    throw error
  }
}
