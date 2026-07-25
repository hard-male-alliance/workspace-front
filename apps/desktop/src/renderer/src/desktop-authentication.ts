/** @file Electron renderer 到 API v2 的短期 Access Token 认证端口 / Short-lived Access Token authentication port from Electron renderer to API v2. */

import type {
  DesktopAuthenticatedSession,
  DesktopAuthenticationBridge,
  DesktopAuthenticationResult
} from '@ai-job-workspace/platform'
import {
  ApiV2AuthenticationRequiredError,
  ApiV2NetworkError,
  type ApiV2AuthenticationPort
} from '@ai-job-workspace/product-api-v2'

/** @brief Electron renderer 认证端口构造选项 / Construction options for the Electron renderer authentication port. */
export interface DesktopApiV2AuthenticationOptions {
  /** @brief preload 暴露的封闭认证 bridge / Closed authentication bridge exposed by preload. */
  readonly bridge: DesktopAuthenticationBridge
  /** @brief 启动恢复或授权返回的初始短期会话 / Initial short-lived session returned by startup recovery or authorization. */
  readonly initialSession: DesktopAuthenticatedSession
  /** @brief 会话不可恢复后的 UI 状态切换 / UI transition after the session becomes unrecoverable. */
  readonly onAuthenticationLost: (error: unknown) => void
  /** @brief 可替换 epoch 秒时钟 / Replaceable epoch-seconds clock. */
  readonly nowEpochSeconds?: (() => number) | undefined
}

/** @brief 允许 renderer 登出边界立即清除内存凭据的 API v2 认证端口 / API v2 authentication port allowing the renderer sign-out boundary to clear its in-memory credential immediately. */
export interface DesktopApiV2AuthenticationPort extends ApiV2AuthenticationPort {
  /** @brief 同步清除 renderer 内存中的 Access Token / Synchronously clear the Access Token from renderer memory. */
  readonly clearAccessToken: () => void
}

/** @brief 单个 renderer 会话世代的 refresh 单飞 / Refresh single flight for one renderer-session generation. */
interface RendererRefreshFlight {
  /** @brief 发起刷新时的会话引用 / Session reference at refresh start. */
  readonly source: DesktopAuthenticatedSession
  /** @brief 所有资源请求共享的 refresh 任务 / Refresh task shared by all resource requests. */
  readonly promise: Promise<void>
}

/**
 * @brief 严格读取成功的已认证 IPC 结果 / Strictly read a successful authenticated IPC result.
 * @param result main 返回的认证结果 / Authentication result returned by main.
 * @return 冻结的短期会话 / Frozen short-lived session.
 */
export function requireDesktopAuthenticatedSession(
  result: DesktopAuthenticationResult
): DesktopAuthenticatedSession {
  if (result.kind !== 'success' || result.session.kind !== 'authenticated') {
    throw new ApiV2AuthenticationRequiredError()
  }
  /** @brief main 返回的候选会话 / Candidate session returned by main. */
  const session = result.session
  if (
    session.accessToken.length < 20 ||
    session.accessToken.length > 8192 ||
    !Number.isFinite(session.expiresAtEpochSeconds) ||
    session.expiresAtEpochSeconds < 0 ||
    session.subject.length === 0 ||
    session.subject.length > 2048 ||
    session.scopes.length === 0 ||
    new Set(session.scopes).size !== session.scopes.length
  ) {
    throw new ApiV2AuthenticationRequiredError()
  }
  return Object.freeze({
    ...session,
    scopes: Object.freeze([...session.scopes])
  })
}

/**
 * @brief 让单个 HTTP 调用可取消等待但不取消共享 IPC refresh / Let one HTTP call cancel its wait without cancelling the shared IPC refresh.
 * @param operation 共享 refresh / Shared refresh.
 * @param signal 当前 HTTP 调用信号 / Current HTTP-call signal.
 * @return 当前观察者等待 / Wait belonging to the current observer.
 */
function observeWithSignal(operation: Promise<void>, signal: AbortSignal): Promise<void> {
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
 * @brief 创建 Electron renderer 的 API v2 authentication port / Create the API v2 authentication port for Electron renderer.
 * @param options bridge、初始会话与身份丢失回调 / Bridge, initial session, and authentication-loss callback.
 * @return 逐请求读内存 token 且单飞刷新 IPC 的端口 / Port reading an in-memory token per request and single-flighting refresh IPC.
 */
export function createDesktopApiV2Authentication(
  options: DesktopApiV2AuthenticationOptions
): DesktopApiV2AuthenticationPort {
  /** @brief 当前 renderer 内存短期会话 / Current short-lived session in renderer memory. */
  let current: DesktopAuthenticatedSession | null = requireDesktopAuthenticatedSession({
    kind: 'success',
    session: options.initialSession
  })
  /** @brief renderer 单飞 refresh / Renderer refresh single flight. */
  let refreshFlight: RendererRefreshFlight | null = null
  /** @brief 是否已通知 UI 身份丢失 / Whether authentication loss has already been reported to the UI. */
  let lossReported = false
  /** @brief renderer 会话时钟 / Renderer-session clock. */
  const nowEpochSeconds = options.nowEpochSeconds ?? ((): number => Date.now() / 1000)

  /**
   * @brief 至多一次清会话并通知登录页 / Clear the session and notify the sign-in UI at most once.
   * @param error 触发身份丢失的安全错误 / Safe error causing authentication loss.
   */
  function loseAuthentication(error: unknown): void {
    current = null
    refreshFlight = null
    if (lossReported) return
    lossReported = true
    options.onAuthenticationLost(error)
  }

  /** @brief 认证端口实现 / Authentication-port implementation. */
  const authentication: DesktopApiV2AuthenticationPort = {
    clearAccessToken(): void {
      current = null
      refreshFlight = null
    },
    getAccessToken(): string | null {
      /** @brief 当前会话快照 / Current session snapshot. */
      const session = current
      if (session === null || session.expiresAtEpochSeconds <= nowEpochSeconds()) return null
      return session.accessToken
    },
    async refreshAccessToken({ rejectedAccessToken, signal }): Promise<void> {
      /** @brief 条件刷新决策的当前会话 / Current session used for the conditional-refresh decision. */
      const source = current
      if (source === null) throw new ApiV2AuthenticationRequiredError()
      if (rejectedAccessToken === null) {
        if (source.expiresAtEpochSeconds > nowEpochSeconds()) return
      } else if (source.accessToken !== rejectedAccessToken) {
        return
      }
      /** @brief 相同会话已有的单飞任务 / Existing single flight for the same session. */
      const existing = refreshFlight
      if (existing !== null && existing.source === source) {
        await observeWithSignal(existing.promise, signal)
        return
      }
      /** @brief 由首个调用者创建、但不由任一观察者取消的 IPC refresh / IPC refresh created by the first caller and cancelled by no individual observer. */
      const operation = options.bridge
        .refresh(rejectedAccessToken)
        .then((result): void => {
          if (current !== source) return
          current = requireDesktopAuthenticatedSession(result)
        })
        .catch((error: unknown): never => {
          if (current === source) loseAuthentication(error)
          throw error
        })
      refreshFlight = { promise: operation, source }
      /** @brief 只清理仍指向当前任务的回调 / Callback clearing only the current flight. */
      const clear = (): void => {
        if (refreshFlight?.promise === operation) refreshFlight = null
      }
      void operation.then(clear, clear)
      await observeWithSignal(operation, signal)
    },
    invalidateAccessToken(rejectedAccessToken): void {
      /** @brief 失效决策的当前会话 / Current session used for invalidation. */
      const source = current
      if (source === null || source.accessToken !== rejectedAccessToken) return
      /** @brief second-401 后统一展示的认证缺失错误 / Authentication-required error shown after a second 401. */
      const error = new ApiV2AuthenticationRequiredError()
      loseAuthentication(error)
      void options.bridge.signOut().catch(() => undefined)
    }
  }
  return Object.freeze(authentication)
}
