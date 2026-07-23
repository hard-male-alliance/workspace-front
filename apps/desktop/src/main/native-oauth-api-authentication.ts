/** @file Electron main 到 API v2 的 native OAuth 认证适配 / Native OAuth authentication adapter from Electron main to API v2. */

import {
  ApiV2AuthenticationRequiredError,
  ApiV2NetworkError,
  type ApiV2AccessTokenRefreshRequest,
  type ApiV2AuthenticationPort
} from '@ai-job-workspace/product-api-v2'

import type { NativeOAuthSessionProjection } from './native-oauth-session'

/** @brief 主进程 Artifact 请求所需的最小 native OAuth 会话 / Minimal native OAuth session required by main-process Artifact requests. */
export interface NativeArtifactAuthenticationSession {
  /** @brief 读取仍有效的 main-only Access Token / Read the still-live main-only Access Token. */
  readonly getProjection: () => NativeOAuthSessionProjection | null
  /** @brief 条件清除被连续拒绝的当前 Access Token / Conditionally clear the current Access Token after repeated rejection. */
  readonly invalidateAccessToken: (rejectedAccessToken: string) => void
  /** @brief 条件轮换 Access Token / Conditionally rotate the Access Token. */
  readonly refresh: (rejectedAccessToken: string | null, signal?: AbortSignal) => Promise<void>
}

/** @brief main-only API v2 认证适配选项 / Options for the main-only API v2 authentication adapter. */
export interface NativeArtifactAuthenticationOptions {
  /** @brief main-only native OAuth 会话 / Main-only native OAuth session. */
  readonly session: NativeArtifactAuthenticationSession
  /** @brief 新 token 连续被拒绝后的宿主清理动作 / Host cleanup after a newly refreshed token is rejected again. */
  readonly onAuthenticationRejected: () => void
}

/**
 * @brief 让单个 HTTP 观察者可取消等待但不取消共享 native refresh / Let one HTTP observer cancel its wait without cancelling the shared native refresh.
 * @param operation native 会话拥有的共享 refresh / Shared refresh owned by the native session.
 * @param signal 当前 HTTP 生命周期信号 / Current HTTP lifecycle signal.
 * @return 当前观察者的等待结果 / Wait result for the current observer.
 */
function observeRefresh(operation: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new ApiV2NetworkError('aborted'))
  return new Promise<void>((resolve, reject): void => {
    /** @brief 当前观察者的取消回调 / Abort callback for this observer. */
    const abort = (): void => reject(new ApiV2NetworkError('aborted'))
    signal.addEventListener('abort', abort, { once: true })
    void operation.then(
      (): void => {
        signal.removeEventListener('abort', abort)
        resolve()
      },
      (error: unknown): void => {
        signal.removeEventListener('abort', abort)
        reject(error instanceof Error ? error : new ApiV2AuthenticationRequiredError())
      }
    )
  })
}

/**
 * @brief 创建只在 Electron main 暴露 Access Token 的 API v2 认证端口 / Create an API v2 authentication port exposing Access Tokens only inside Electron main.
 * @param options native 会话与安全清理回调 / Native session and safe-cleanup callback.
 * @return 支持到期刷新、401 条件刷新与二次拒绝失效的认证端口 / Authentication port supporting expiry refresh, conditional 401 refresh, and second-rejection invalidation.
 */
export function createNativeArtifactAuthentication(
  options: NativeArtifactAuthenticationOptions
): ApiV2AuthenticationPort {
  /** @brief 已由二次 401 失效、在清理完成前也不得重用的 token / Token invalidated by a second 401 and forbidden from reuse before cleanup completes. */
  let invalidatedAccessToken: string | null = null
  /** @brief 是否已请求本世代宿主清理 / Whether host cleanup was requested for this generation. */
  let cleanupRequested = false

  return Object.freeze({
    getAccessToken(): string | null {
      /** @brief 会话只返回未到期 token 的当前投影 / Current projection containing only a non-expired token. */
      const projection = options.session.getProjection()
      if (projection === null || projection.accessToken === invalidatedAccessToken) return null
      return projection.accessToken
    },
    async refreshAccessToken({
      rejectedAccessToken,
      signal
    }: ApiV2AccessTokenRefreshRequest): Promise<void> {
      /** @brief 由会话实现拥有的 refresh 单飞 / Refresh single flight owned by the session implementation. */
      const operation = options.session.refresh(rejectedAccessToken)
      await observeRefresh(operation, signal)
      /** @brief 刷新后的 live token / Live token after refresh. */
      const projection = options.session.getProjection()
      if (projection === null) throw new ApiV2AuthenticationRequiredError()
      if (projection.accessToken !== invalidatedAccessToken) {
        invalidatedAccessToken = null
        cleanupRequested = false
      }
    },
    invalidateAccessToken(rejectedAccessToken: string): void {
      /** @brief 仅比较当前 live token，避免迟到 401 清理更新会话 / Compare only the current live token so a late 401 cannot clear a newer session. */
      const projection = options.session.getProjection()
      if (projection === null || projection.accessToken !== rejectedAccessToken) return
      invalidatedAccessToken = rejectedAccessToken
      options.session.invalidateAccessToken(rejectedAccessToken)
      if (cleanupRequested) return
      cleanupRequested = true
      options.onAuthenticationRejected()
    }
  })
}
