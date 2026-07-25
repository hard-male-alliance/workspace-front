/** @file RFC 7009 Refresh Token 撤销请求 / RFC 7009 Refresh Token revocation request. */

import { boundedString } from '../http/contract'
import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import { API_V2_OAUTH_REVOCATION_ENDPOINT } from './discovery'

/**
 * @brief 撤销一个私有 Refresh Token / Revoke one private Refresh Token.
 * @param refreshToken 只从内存会话取得的 token / Token obtained only from the in-memory session.
 * @param clientId public client ID / Public client ID.
 * @param fetchImpl 可替换 Fetch 实现 / Replaceable Fetch implementation.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return RFC 7009 成功完成 / Successful RFC 7009 completion.
 * @note 本函数只供会话模块调用，不从 package 公共入口导出。 / This function is session-internal and is not exported from the package entrypoint.
 */
export async function revokeRefreshToken(
  refreshToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  /** @brief application/x-www-form-urlencoded 撤销体 / Form-encoded revocation body. */
  const body = new URLSearchParams()
  body.set('token', boundedString(refreshToken, 'oauth.revoke.token', 20, 8192))
  body.set('token_type_hint', 'refresh_token')
  body.set('client_id', boundedString(clientId, 'oauth.revoke.client_id', 1, 255))
  try {
    /** @brief 原始撤销响应 / Raw revocation response. */
    const response = await fetchImpl(API_V2_OAUTH_REVOCATION_ENDPOINT, {
      body,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST',
      redirect: 'error',
      signal: signal ?? null
    })
    if (response.status !== 200) {
      throw new ApiV2ContractError(
        'OAuth revocation response must use status 200.',
        response.status
      )
    }
    await response.body?.cancel().catch(() => undefined)
  } catch (error: unknown) {
    if (error instanceof ApiV2ContractError || error instanceof ApiV2NetworkError) throw error
    if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
    throw new ApiV2NetworkError('network')
  }
}
