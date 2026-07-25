/** @file Web 宿主到 API v2 认证生命周期的组合边界 / Web-host composition boundary for the API v2 authentication lifecycle. */

import {
  ApiV2AuthenticationRequiredError,
  invalidateWebTokenSessionAccessToken,
  refreshWebTokenSessionIfCurrent,
  type ApiV2AuthenticationPort,
  type InMemoryWebTokenSession
} from '@ai-job-workspace/product-api-v2'

/** @brief Web API v2 认证端口的宿主依赖 / Host dependencies of the Web API v2 authentication port. */
export interface WebApiV2AuthenticationOptions {
  /** @brief 当前页面唯一的内存 token 会话 / Sole in-memory token session of the current page. */
  readonly session: InMemoryWebTokenSession
  /** @brief 会话不可恢复后的宿主状态切换 / Host-state transition after the session becomes unrecoverable. */
  readonly onAuthenticationLost: (error: unknown) => void
  /** @brief 测试可替换的网络实现 / Network implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch | undefined
}

/**
 * @brief 把私有 Web token session 组合成资源服务器认证端口 / Compose a private Web token session into the resource-server authentication port.
 * @param options 内存会话、失效回调与可替换网络实现 / In-memory session, loss callback, and replaceable network implementation.
 * @return 使用私有原子 compare-and-refresh/clear 的认证端口 / Authentication port using private atomic compare-and-refresh/clear operations.
 */
export function createWebApiV2Authentication(
  options: WebApiV2AuthenticationOptions
): ApiV2AuthenticationPort {
  /** @brief 本页面是否已经报告不可恢复的身份丢失 / Whether unrecoverable identity loss was already reported on this page. */
  let authenticationLossReported = false

  /**
   * @brief 至多一次切换到重新授权界面 / Transition to reauthorization at most once.
   * @param error 触发身份丢失的结构化错误 / Structured error that caused identity loss.
   */
  function reportAuthenticationLoss(error: unknown): void {
    if (authenticationLossReported) return
    authenticationLossReported = true
    options.onAuthenticationLost(error)
  }

  /** @brief 由宿主会话实现的认证端口 / Authentication port implemented by the host session. */
  const authentication: ApiV2AuthenticationPort = {
    getAccessToken: (): string | null => options.session.getAccessToken(),
    async refreshAccessToken({ rejectedAccessToken, signal }): Promise<void> {
      try {
        await refreshWebTokenSessionIfCurrent({
          fetchImpl: options.fetchImpl,
          rejectedAccessToken,
          session: options.session,
          signal
        })
      } catch (error: unknown) {
        if (options.session.getProjection() === null) reportAuthenticationLoss(error)
        throw error
      }
    },
    invalidateAccessToken(rejectedAccessToken): void {
      invalidateWebTokenSessionAccessToken(options.session, rejectedAccessToken)
      if (options.session.getProjection() === null) {
        reportAuthenticationLoss(new ApiV2AuthenticationRequiredError())
      }
    }
  }
  return Object.freeze(authentication)
}
