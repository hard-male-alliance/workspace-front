/** @file API v2 消费者的封闭错误模型 / Closed error model for API v2 consumers. */

/**
 * @brief 当前内存会话没有可发送的 Access Token / The current in-memory session has no access token to send.
 * @note 该错误在网络调用前失败关闭，调用方应重新发起授权流程。 / This error fails closed before network I/O; callers should restart authorization.
 */
export class ApiV2AuthenticationRequiredError extends Error {
  override readonly name = 'ApiV2AuthenticationRequiredError'

  /** @brief 构造认证缺失错误 / Construct an authentication-required error. */
  constructor() {
    super('API v2 requires an in-memory access token.')
  }
}

/**
 * @brief 外部响应或客户端输入不符合 API v2 契约 / External data or client input violates the API v2 contract.
 */
export class ApiV2ContractError extends Error {
  override readonly name = 'ApiV2ContractError'
  /** @brief 已知 HTTP 状态；请求发出前为 null / Known HTTP status, or null before a request is sent. */
  readonly status: number | null

  /**
   * @brief 构造契约错误 / Construct a contract error.
   * @param message 不包含敏感 payload 的诊断 / Diagnostic without sensitive payload data.
   * @param status 已知 HTTP 状态 / Known HTTP status.
   */
  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

/** @brief API v2 网络失败类别 / API v2 network-failure kind. */
export type ApiV2NetworkErrorKind = 'aborted' | 'network' | 'timeout'

/**
 * @brief 未收到可验证 HTTP 响应的 API v2 网络错误 / API v2 network error without a verifiable HTTP response.
 */
export class ApiV2NetworkError extends Error {
  override readonly name = 'ApiV2NetworkError'
  /** @brief 低基数网络失败类别 / Low-cardinality network failure kind. */
  readonly kind: ApiV2NetworkErrorKind

  /**
   * @brief 构造脱敏网络错误 / Construct a sanitized network error.
   * @param kind 网络失败类别 / Network failure kind.
   */
  constructor(kind: ApiV2NetworkErrorKind) {
    super(`API v2 request failed before a verifiable response (${kind}).`)
    this.kind = kind
  }
}
