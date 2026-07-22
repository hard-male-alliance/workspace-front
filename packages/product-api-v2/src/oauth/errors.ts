/** @file OAuth/OIDC 浏览器协议边界的封闭错误模型 / Closed error model for the browser OAuth/OIDC protocol boundary. */

/**
 * @brief Authorization Server 返回的标准 OAuth 授权错误 / Standard OAuth authorization error returned by the Authorization Server.
 * @note 调用方只应根据 error 采取动作，不应解析描述文本。 / Callers should act on error only and must not parse description text.
 */
export class OAuthAuthorizationResponseError extends Error {
  override readonly name = 'OAuthAuthorizationResponseError'
  /** @brief OAuth 稳定错误码 / Stable OAuth error code. */
  readonly error: string
  /** @brief 面向人的可选诊断 / Optional human-facing diagnostic. */
  readonly errorDescription: string | null
  /** @brief 可选公开 HTTPS 错误文档 / Optional public HTTPS error documentation. */
  readonly errorUri: string | null

  /**
   * @brief 构造脱敏的授权错误 / Construct a sanitized authorization error.
   * @param error OAuth 错误码 / OAuth error code.
   * @param errorDescription 可选描述 / Optional description.
   * @param errorUri 可选公开文档 URI / Optional public documentation URI.
   */
  constructor(error: string, errorDescription: string | null, errorUri: string | null) {
    super(`OAuth authorization failed (${error}).`)
    this.error = error
    this.errorDescription = errorDescription
    this.errorUri = errorUri
  }
}

/**
 * @brief Token Endpoint 返回的标准 OAuth 错误 / Standard OAuth error returned by the Token Endpoint.
 * @note 此对象从不包含请求中的 code、verifier 或 token。 / This object never includes the request code, verifier, or token.
 */
export class OAuthTokenResponseError extends Error {
  override readonly name = 'OAuthTokenResponseError'
  /** @brief HTTP 状态 / HTTP status. */
  readonly status: number
  /** @brief OAuth 稳定错误码 / Stable OAuth error code. */
  readonly error: string
  /** @brief 面向人的可选诊断 / Optional human-facing diagnostic. */
  readonly errorDescription: string | null
  /** @brief 可选公开 HTTPS 错误文档 / Optional public HTTPS error documentation. */
  readonly errorUri: string | null

  /**
   * @brief 构造脱敏的 token 错误 / Construct a sanitized token error.
   * @param status HTTP 状态 / HTTP status.
   * @param error OAuth 错误码 / OAuth error code.
   * @param errorDescription 可选描述 / Optional description.
   * @param errorUri 可选公开文档 URI / Optional public documentation URI.
   */
  constructor(
    status: number,
    error: string,
    errorDescription: string | null,
    errorUri: string | null
  ) {
    super(`OAuth token exchange failed (${error}).`)
    this.status = status
    this.error = error
    this.errorDescription = errorDescription
    this.errorUri = errorUri
  }
}
