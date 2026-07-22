/** @file OAuth Token Endpoint 严格 form exchange 与 Schema decoder / Strict OAuth Token Endpoint form exchange and Schema decoder. */

import { boundedInteger, boundedString, exactRecord } from '../http/contract'
import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import { readBoundedJson } from '../http/bounded-json'
import { claimAuthorizationCodeExchange, type WebAuthorizationTransaction } from './authorization'
import { OAuthTokenResponseError } from './errors'

/** @brief OAuth error code 语法 / OAuth error-code syntax. */
const OAUTH_ERROR_PATTERN = /^[a-z][a-z0-9_]{2,80}$/u

/** @brief OAuth token 最大响应字节数 / Maximum OAuth token response bytes. */
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024

/** @brief 严格 Authorization Code token response / Strict Authorization Code token response. */
export interface AuthorizationCodeTokenResponse {
  /** @brief Access Token / Access Token. */
  readonly accessToken: string
  /** @brief Access Token 生命周期秒数 / Access Token lifetime in seconds. */
  readonly expiresInSeconds: number
  /** @brief ID Token / ID Token. */
  readonly idToken: string
  /** @brief 可选 Refresh Token / Optional Refresh Token. */
  readonly refreshToken: string | null
  /** @brief 授予的 scope 字符串 / Granted scope string. */
  readonly scope: string
}

/**
 * @brief 按 canonical AuthorizationCodeTokenResponse 解码 / Decode against canonical AuthorizationCodeTokenResponse.
 * @param value 未经信任的 JSON / Untrusted JSON.
 * @return 严格 token response / Strict token response.
 */
export function parseAuthorizationCodeTokenResponse(
  value: unknown
): AuthorizationCodeTokenResponse {
  /** @brief 严格字段对象 / Exact field object. */
  const input = exactRecord(value, 'oauth.token', [
    'access_token',
    'token_type',
    'expires_in',
    'scope',
    'id_token',
    'refresh_token'
  ])
  if (input.token_type !== 'Bearer') {
    throw new ApiV2ContractError('OAuth token_type must be Bearer.')
  }
  return {
    accessToken: boundedString(input.access_token, 'oauth.token.access_token', 20, 8192),
    expiresInSeconds: boundedInteger(input.expires_in, 'oauth.token.expires_in', 1, 3600),
    idToken: boundedString(input.id_token, 'oauth.token.id_token', 20, 16_384),
    refreshToken:
      input.refresh_token === undefined
        ? null
        : boundedString(input.refresh_token, 'oauth.token.refresh_token', 20, 8192),
    scope: boundedString(input.scope, 'oauth.token.scope', 1, 2000)
  }
}

/**
 * @brief 解析 canonical OAuthErrorResponse / Parse the canonical OAuthErrorResponse.
 * @param value 未经信任的错误 JSON / Untrusted error JSON.
 * @param status HTTP 状态 / HTTP status.
 * @return 标准 OAuth token error / Standard OAuth token error.
 */
function parseTokenError(value: unknown, status: number): OAuthTokenResponseError {
  /** @brief 严格错误字段 / Exact error fields. */
  const input = exactRecord(value, 'oauth.error', ['error', 'error_description', 'error_uri'])
  /** @brief 稳定 OAuth error / Stable OAuth error. */
  const error = boundedString(input.error, 'oauth.error.error', 3, 81)
  if (!OAUTH_ERROR_PATTERN.test(error)) {
    throw new ApiV2ContractError('OAuth token error code is invalid.', status)
  }
  /** @brief 可选 error_description / Optional error_description. */
  const description =
    input.error_description === undefined
      ? null
      : boundedString(input.error_description, 'oauth.error.error_description', 0, 1000)
  /** @brief 可选 error_uri / Optional error_uri. */
  const errorUri =
    input.error_uri === undefined
      ? null
      : boundedString(input.error_uri, 'oauth.error.error_uri', 1, 2048)
  if (errorUri !== null) {
    try {
      /** @brief 解析后的错误文档 URL / Parsed error-documentation URL. */
      const parsedErrorUri = new URL(errorUri)
      if (
        parsedErrorUri.protocol !== 'https:' ||
        parsedErrorUri.username !== '' ||
        parsedErrorUri.password !== ''
      ) {
        throw new Error()
      }
    } catch {
      throw new ApiV2ContractError('OAuth token error_uri must be HTTPS.', status)
    }
  }
  return new OAuthTokenResponseError(status, error, description, errorUri)
}

/**
 * @brief 校验 token 响应的防缓存头 / Validate token-response anti-caching headers.
 * @param response Token endpoint 响应 / Token endpoint response.
 */
function assertNoStore(response: Response): void {
  /** @brief Cache-Control 指令 / Cache-Control directives. */
  const cacheDirectives =
    response.headers
      .get('Cache-Control')
      ?.split(',')
      .map((value) => value.trim().toLowerCase()) ?? []
  if (
    !cacheDirectives.includes('no-store') ||
    response.headers.get('Pragma')?.toLowerCase() !== 'no-cache'
  ) {
    throw new ApiV2ContractError('OAuth token response must disable caching.', response.status)
  }
}

/**
 * @brief 用 PKCE verifier 交换一次性 authorization code / Exchange a one-time authorization code with its PKCE verifier.
 * @param code 已通过 callback 校验的 code / Code validated by the callback boundary.
 * @param transaction 原授权事务 / Original authorization transaction.
 * @param fetchImpl 可替换 Fetch 实现 / Replaceable Fetch implementation.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 严格 token response；尚未写入 session / Strict token response, not yet installed in a session.
 */
export async function exchangeAuthorizationCode(
  code: string,
  transaction: WebAuthorizationTransaction,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<AuthorizationCodeTokenResponse> {
  if (code.length === 0 || code.length > 2048) {
    throw new ApiV2ContractError('OAuth authorization code is invalid.')
  }
  claimAuthorizationCodeExchange(transaction)
  /** @brief application/x-www-form-urlencoded 请求体 / application/x-www-form-urlencoded request body. */
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('redirect_uri', transaction.redirectUri)
  body.set('client_id', transaction.clientId)
  body.set('code_verifier', transaction.codeVerifier)
  try {
    /** @brief 原始 token response / Raw token response. */
    const response = await fetchImpl(transaction.tokenEndpoint, {
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
    assertNoStore(response)
    /** @brief 响应 media type / Response media type. */
    const mediaType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      throw new ApiV2ContractError(
        'OAuth token response must use application/json.',
        response.status
      )
    }
    /** @brief 尚未验证的有界 JSON / Bounded, unvalidated JSON. */
    const data = await readBoundedJson(response, {
      context: 'OAuth token response',
      maximumBytes: MAX_TOKEN_RESPONSE_BYTES
    })
    if (!response.ok) throw parseTokenError(data, response.status)
    if (response.status !== 200) {
      throw new ApiV2ContractError(
        'OAuth token success response must use status 200.',
        response.status
      )
    }
    return parseAuthorizationCodeTokenResponse(data)
  } catch (error: unknown) {
    if (
      error instanceof ApiV2ContractError ||
      error instanceof OAuthTokenResponseError ||
      error instanceof ApiV2NetworkError
    ) {
      throw error
    }
    if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
    throw new ApiV2NetworkError('network')
  }
}
