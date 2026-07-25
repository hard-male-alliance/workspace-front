/** @file API v2 HTTP 边界的异步认证端口 / Asynchronous authentication port for the API v2 HTTP boundary. */

/** @brief Access Token 刷新请求 / Access-token refresh request. */
export interface ApiV2AccessTokenRefreshRequest {
  /** @brief 触发刷新的已拒绝 token；首次无凭证时为 null / Rejected token that triggered refresh, or null when initially unauthenticated. */
  readonly rejectedAccessToken: string | null
  /** @brief 与整个产品 GET 共享的取消和截止信号 / Cancellation and deadline signal shared with the entire product GET. */
  readonly signal: AbortSignal
}

/**
 * @brief API v2 Access Token 生命周期端口 / API v2 access-token lifecycle port.
 * @note 实现只向该边界暴露内存 Access Token，并对相同 rejected token 的并发刷新执行 single-flight。 / Implementations expose only an in-memory access token to this boundary and single-flight concurrent refreshes for the same rejected token.
 */
export interface ApiV2AuthenticationPort {
  /** @brief 同步读取当前内存 Access Token / Synchronously read the current in-memory access token. */
  readonly getAccessToken: () => string | null
  /**
   * @brief 在 token 缺失或被资源服务器拒绝后恢复会话 / Recover the session after a token is absent or rejected by the resource server.
   * @param request 被拒绝 token 与共享截止信号 / Rejected token and shared deadline signal.
   * @return 刷新完成；调用方随后重新读取内存 token / Refresh completion; the caller then rereads the in-memory token.
   * @note 若当前 token 已不同于 rejectedAccessToken，实现必须直接完成且不得重复刷新。 / If the current token already differs from rejectedAccessToken, the implementation must complete without another refresh.
   */
  readonly refreshAccessToken: (request: ApiV2AccessTokenRefreshRequest) => Promise<void>
  /**
   * @brief 条件失效已被连续拒绝的 Access Token / Conditionally invalidate an access token rejected twice.
   * @param rejectedAccessToken 第二次请求实际发送的 token / Token actually sent by the second request.
   * @note 仅当当前 token 仍等于 rejectedAccessToken 时清理会话，避免迟到的 401 清掉更新会话。 / Clear the session only while the current token still equals rejectedAccessToken, so a late 401 cannot erase a newer session.
   */
  readonly invalidateAccessToken: (rejectedAccessToken: string) => void
}
