/** @file Electron native OAuth 的应用控制器与可信 IPC handlers / Application controller and trusted IPC handlers for Electron native OAuth. */

import { ipcMain } from 'electron'
import {
  DESKTOP_AUTH_AUTHORIZE_CHANNEL,
  DESKTOP_AUTH_GET_SESSION_CHANNEL,
  DESKTOP_AUTH_REFRESH_CHANNEL,
  DESKTOP_AUTH_SIGN_OUT_CHANNEL
} from '@ai-job-workspace/platform'
import type {
  DesktopAuthenticatedSession,
  DesktopAuthenticationFailureReason,
  DesktopAuthenticationResult,
  HostedIdentityScreenHint
} from '@ai-job-workspace/platform'
import {
  fetchOidcDiscovery,
  type OidcDiscoveryDocument
} from '@ai-job-workspace/product-api-v2/native-oauth'

import { isTrustedMainFrameRequest } from './ipc-sender'
import type { IpcSenderEvent, TrustedRendererResolver } from './ipc-sender'
import { authorizeNativeOAuth } from './native-oauth-authorization'
import type {
  NativeOAuthAuthorizationCommand,
  NativeOAuthGrantInstaller
} from './native-oauth-authorization'
import { NativeOAuthLoopbackCancelledError } from './native-oauth-loopback'
import type { NativeOAuthSessionProjection } from './native-oauth-session'
import { NativeSecureStorageUnavailableError } from './native-oauth-secure-store'
import type { DesktopOAuthConfiguration } from './native-oauth-config'

/** @brief 控制器依赖的 native 会话端口 / Native-session port required by the controller. */
export interface NativeOAuthControllerSession {
  /** @brief 开始新授权 / Begin a new authorization. */
  readonly beginAuthorization: (signal?: AbortSignal) => Promise<NativeOAuthGrantInstaller>
  /** @brief 放弃未完成授权 / Abandon an incomplete authorization. */
  readonly cancelAuthorization: () => Promise<void>
  /** @brief 获取当前短期会话 / Get the current short-lived session. */
  readonly getProjection: () => NativeOAuthSessionProjection | null
  /** @brief 条件刷新 / Refresh conditionally. */
  readonly refresh: (rejectedAccessToken: string | null, signal?: AbortSignal) => Promise<void>
  /** @brief 本地登出与尽力撤销 / Local logout and best-effort revocation. */
  readonly signOut: () => Promise<void>
  /** @brief 应用退出前等待轮换静止并清 access token 内存 / Quiesce rotations and clear access-token memory before app exit. */
  readonly shutdown: () => Promise<void>
}

/** @brief native OAuth 控制器的可替换协议依赖 / Replaceable protocol dependencies of the native OAuth controller. */
export interface NativeOAuthControllerDependencies {
  /** @brief 已验证 public-client 配置 / Validated public-client configuration. */
  readonly configuration: DesktopOAuthConfiguration
  /** @brief main-only 会话 / Main-only session. */
  readonly session: NativeOAuthControllerSession
  /** @brief 可替换 discovery fetch / Replaceable discovery fetch. */
  readonly fetchDiscovery?: ((signal?: AbortSignal) => Promise<OidcDiscoveryDocument>) | undefined
  /** @brief 可替换 native authorization 编排 / Replaceable native-authorization orchestration. */
  readonly authorize?: (
    command: NativeOAuthAuthorizationCommand,
    installer: NativeOAuthGrantInstaller,
    signal?: AbortSignal
  ) => Promise<void>
  /** @brief 整轮授权的总硬截止；测试可缩短 / Total hard deadline for one authorization round, replaceable in tests. */
  readonly authorizationTimeoutMilliseconds?: number | undefined
  /** @brief 启动恢复期间的低基数失败 / Low-cardinality failure observed during startup restoration. */
  readonly initialFailureReason?: DesktopAuthenticationFailureReason | undefined
  /** @brief 测试可替换的总截止调度器 / Total-deadline scheduler replaceable in tests. */
  readonly scheduleAuthorizationDeadline?:
    ((expire: () => void, timeoutMilliseconds: number) => () => void) | undefined
}

/** @brief 完整系统浏览器授权的默认总截止 / Default total deadline for complete system-browser authorization. */
const AUTHORIZATION_TIMEOUT_MILLISECONDS = 6 * 60 * 1000

/** @brief 可配置授权总截止的最大值 / Maximum configurable total authorization deadline. */
const MAX_AUTHORIZATION_TIMEOUT_MILLISECONDS = 10 * 60 * 1000

/**
 * @brief 把 main 私有会话投影为 renderer 允许的短期形状 / Project a main-private session into the renderer's allowed short-lived shape.
 * @param projection main 私有投影 / Main-private projection.
 * @return renderer-safe 已认证会话 / Renderer-safe authenticated session.
 */
function projectAuthenticatedSession(
  projection: NativeOAuthSessionProjection
): DesktopAuthenticatedSession {
  return Object.freeze({
    accessToken: projection.accessToken,
    expiresAtEpochSeconds: projection.expiresAtEpochSeconds,
    kind: 'authenticated',
    scopes: Object.freeze([...projection.scopes]),
    subject: projection.subject
  })
}

/**
 * @brief 返回当前会话的成功 envelope / Return a success envelope for the current session.
 * @param projection 当前 main 投影 / Current main projection.
 * @return renderer-safe 成功结果 / Renderer-safe success result.
 */
function successfulSession(
  projection: NativeOAuthSessionProjection | null
): DesktopAuthenticationResult {
  return Object.freeze({
    kind: 'success',
    session:
      projection === null
        ? Object.freeze({ kind: 'anonymous' as const })
        : projectAuthenticatedSession(projection)
  })
}

/**
 * @brief 把任意 main 错误压缩为低基数失败 / Collapse any main-process error into a low-cardinality failure.
 * @param error 未知错误 / Unknown error.
 * @return 不泄漏协议或文件细节的失败结果 / Failure result leaking no protocol or file details.
 */
function safeFailure(error: unknown): DesktopAuthenticationResult {
  return Object.freeze({
    kind: 'failure',
    reason:
      error instanceof NativeOAuthLoopbackCancelledError ||
      (error instanceof Error && error.name === 'AbortError')
        ? 'cancelled'
        : error instanceof NativeSecureStorageUnavailableError
          ? error.reason === 'persistent-login-unsupported'
            ? 'persistent-login-unsupported'
            : 'secure-storage-unavailable'
          : 'failed'
  })
}

/**
 * @brief 以宿主 AbortSignal 强制界定不可信异步依赖的等待时间 / Bound waiting on an untrusted asynchronous dependency with a host AbortSignal.
 * @param operation 被观察的异步任务 / Asynchronous operation being observed.
 * @param boundary 由宿主拥有的取消/截止拒绝任务 / Host-owned cancellation/deadline rejection.
 * @return 任务结果，或宿主边界失败 / Operation result, or the host-boundary failure.
 * @note 原任务的终态仍被观察，避免忽略 signal 的 adapter 产生游离 rejection / The underlying terminal state remains observed so adapters ignoring the signal cannot create detached rejections.
 */
function observeAuthorizationDeadline<T>(
  operation: Promise<T>,
  boundary: Promise<never>
): Promise<T> {
  return Promise.race([operation, boundary])
}

/**
 * @brief 默认执行完整 native authorization / Run the complete native authorization by default.
 * @param command OAuth command / OAuth 命令.
 * @param installer main grant installer / Main grant 安装端口.
 * @param signal 取消信号 / Cancellation signal.
 */
async function runNativeAuthorization(
  command: NativeOAuthAuthorizationCommand,
  installer: NativeOAuthGrantInstaller,
  signal?: AbortSignal
): Promise<void> {
  await authorizeNativeOAuth(command, { grantInstaller: installer }, signal)
}

/** @brief Electron native OAuth 应用控制器 / Electron native OAuth application controller. */
export class NativeOAuthController {
  /** @brief 已验证配置 / Validated configuration. */
  private readonly configuration: DesktopOAuthConfiguration
  /** @brief main-only 会话 / Main-only session. */
  private readonly session: NativeOAuthControllerSession
  /** @brief discovery fetch / Discovery fetch. */
  private readonly fetchDiscovery: (signal?: AbortSignal) => Promise<OidcDiscoveryDocument>
  /** @brief native authorization runner / Native-authorization runner. */
  private readonly authorizeOperation: NonNullable<NativeOAuthControllerDependencies['authorize']>
  /** @brief 整轮授权的总截止 / Total deadline for one authorization round. */
  private readonly authorizationTimeoutMilliseconds: number
  /** @brief 总截止调度器 / Total-deadline scheduler. */
  private readonly scheduleAuthorizationDeadline: (
    expire: () => void,
    timeoutMilliseconds: number
  ) => () => void
  /** @brief 当前授权取消器 / Current authorization abort controller. */
  private authorizationAbort: AbortController | null = null
  /** @brief 当前授权单飞结果 / Current authorization single-flight result. */
  private authorizationFlight: Promise<DesktopAuthenticationResult> | null = null
  /** @brief 尚未真正静止的底层授权任务 / Underlying authorization tasks that have not genuinely quiesced. */
  private readonly authorizationWork = new Set<Promise<unknown>>()
  /** @brief 启动恢复失败；首次显式授权尝试后清除 / Startup-restoration failure cleared by the first explicit authorization attempt. */
  private initialFailureReason: DesktopAuthenticationFailureReason | null
  /** @brief 幂等控制器关闭任务 / Idempotent controller-disposal operation. */
  private disposalFlight: Promise<void> | null = null
  /** @brief 当前登出单飞任务 / Current sign-out single flight. */
  private signOutFlight: Promise<DesktopAuthenticationResult> | null = null

  /**
   * @brief 创建 native OAuth 控制器 / Construct the native OAuth controller.
   * @param dependencies 配置、会话与可替换协议操作 / Configuration, session, and replaceable protocol operations.
   */
  constructor(dependencies: NativeOAuthControllerDependencies) {
    this.configuration = dependencies.configuration
    this.session = dependencies.session
    this.fetchDiscovery =
      dependencies.fetchDiscovery ?? ((signal) => fetchOidcDiscovery(fetch, signal))
    this.authorizeOperation = dependencies.authorize ?? runNativeAuthorization
    this.authorizationTimeoutMilliseconds =
      dependencies.authorizationTimeoutMilliseconds ?? AUTHORIZATION_TIMEOUT_MILLISECONDS
    if (
      !Number.isSafeInteger(this.authorizationTimeoutMilliseconds) ||
      this.authorizationTimeoutMilliseconds < 1 ||
      this.authorizationTimeoutMilliseconds > MAX_AUTHORIZATION_TIMEOUT_MILLISECONDS
    ) {
      throw new TypeError('The native OAuth authorization deadline is invalid.')
    }
    this.initialFailureReason = dependencies.initialFailureReason ?? null
    this.scheduleAuthorizationDeadline =
      dependencies.scheduleAuthorizationDeadline ??
      ((expire, timeoutMilliseconds): (() => void) => {
        /** @brief 默认 Node/Electron 总截止 timer / Default Node/Electron total-deadline timer. */
        const timer = setTimeout(expire, timeoutMilliseconds)
        return (): void => clearTimeout(timer)
      })
  }

  /**
   * @brief 读取当前会话 / Read the current session.
   * @return renderer-safe 成功结果 / Renderer-safe success result.
   */
  getSession(): DesktopAuthenticationResult {
    if (this.initialFailureReason !== null) {
      return Object.freeze({ kind: 'failure', reason: this.initialFailureReason })
    }
    return successfulSession(this.session.getProjection())
  }

  /**
   * @brief 单飞执行系统浏览器授权 / Run system-browser authorization as a single flight.
   * @param screenHint hosted identity 页面提示 / Hosted-identity screen hint.
   * @return 授权结果 / Authorization result.
   */
  authorize(screenHint: HostedIdentityScreenHint): Promise<DesktopAuthenticationResult> {
    if (this.disposalFlight !== null || this.signOutFlight !== null) {
      return Promise.resolve(Object.freeze({ kind: 'failure', reason: 'failed' }))
    }
    if (this.authorizationFlight !== null) return this.authorizationFlight
    if (this.authorizationWork.size > 0) {
      return Promise.resolve(Object.freeze({ kind: 'failure', reason: 'failed' }))
    }
    this.initialFailureReason = null
    /** @brief 本次授权的取消器 / Abort controller for this authorization. */
    const abort = new AbortController()
    this.authorizationAbort = abort
    /** @brief 由强引用 timer 驱动的总截止取消器 / Total-deadline controller driven by a strongly referenced timer. */
    const deadline = new AbortController()
    /** @brief 取消与截止触发的单一拒绝器 / Sole rejection function for cancellation and deadline. */
    let rejectBoundary: ((error: unknown) => void) | undefined
    /** @brief 即使依赖忽略 signal 也能终止宿主等待的边界任务 / Boundary task terminating host waiting even when a dependency ignores its signal. */
    const boundary = new Promise<never>((_resolve, reject): void => {
      rejectBoundary = reject
    })
    /** @brief 取消整轮授权总截止 timer 的动作 / Action cancelling the complete authorization-deadline timer. */
    const cancelDeadline = this.scheduleAuthorizationDeadline((): void => {
      deadline.abort(new DOMException('Native OAuth authorization timed out.', 'TimeoutError'))
    }, this.authorizationTimeoutMilliseconds)
    /** @brief 用户/退出取消与授权总截止的组合信号 / Signal combining user or shutdown cancellation with the total authorization deadline. */
    const signal = AbortSignal.any([abort.signal, deadline.signal])
    /** @brief 将组合 signal 传播到强制 Promise 边界 / Propagate the combined signal into the mandatory Promise boundary. */
    const abortBoundary = (): void => {
      rejectBoundary?.(signal.reason ?? new NativeOAuthLoopbackCancelledError())
    }
    signal.addEventListener('abort', abortBoundary, { once: true })
    /** @brief 完整授权任务 / Complete authorization operation. */
    const operation = this.performAuthorization(screenHint, signal, boundary)
    this.authorizationFlight = operation
    /** @brief 仅清除当前任务的终态回调 / Terminal callback clearing only the current operation. */
    const clear = (): void => {
      cancelDeadline()
      signal.removeEventListener('abort', abortBoundary)
      rejectBoundary = undefined
      if (this.authorizationFlight === operation) this.authorizationFlight = null
      if (this.authorizationAbort === abort) this.authorizationAbort = null
    }
    void operation.then(clear, clear)
    return operation
  }

  /**
   * @brief 跟踪一个底层授权任务直到真正终态 / Track an underlying authorization task until its genuine terminal state.
   * @param operation 底层任务 / Underlying operation.
   * @return 同一任务 / The same operation.
   */
  private trackAuthorizationWork<T>(operation: Promise<T>): Promise<T> {
    this.authorizationWork.add(operation)
    /** @brief 只移除当前任务的终态回调 / Terminal callback removing only the current task. */
    const clear = (): void => {
      this.authorizationWork.delete(operation)
    }
    void operation.then(clear, clear)
    return operation
  }

  /**
   * @brief 在忽略 signal 的任务终止后再次废弃授权世代 / Abandon the authorization generation again after a signal-ignoring task terminates.
   * @return 后台清理任务 / Background cleanup operation, or null when unnecessary.
   */
  private scheduleAuthorizationCleanup(): Promise<void> | null {
    /** @brief 失败时尚未静止的快照 / Snapshot of work still active when the failure occurred. */
    const pending = [...this.authorizationWork]
    if (pending.length === 0) return null
    /** @brief 等待快照静止后的二次清理 / Second cleanup after the snapshot quiesces. */
    const cleanup = Promise.allSettled(pending).then(async (): Promise<void> => {
      await this.session.cancelAuthorization().catch(() => undefined)
    })
    return this.trackAuthorizationWork(cleanup)
  }

  /**
   * @brief 等待所有底层授权与后台清理真正静止 / Wait for all underlying authorization and cleanup work to genuinely quiesce.
   * @return 静止完成 / Resolves after quiescence.
   */
  private async awaitAuthorizationQuiescence(): Promise<void> {
    while (this.authorizationWork.size > 0) {
      await Promise.allSettled([...this.authorizationWork])
    }
  }

  /**
   * @brief 完成一轮 discovery、loopback 与 grant 安装 / Complete one discovery, loopback, and grant-installation round.
   * @param screenHint hosted 页面提示 / Hosted-page hint.
   * @param signal 本轮取消信号 / Cancellation signal for this round.
   * @param boundary 不可信依赖无法延长的宿主总截止 / Host total deadline that untrusted dependencies cannot extend.
   * @return renderer-safe 结果 / Renderer-safe result.
   */
  private async performAuthorization(
    screenHint: HostedIdentityScreenHint,
    signal: AbortSignal,
    boundary: Promise<never>
  ): Promise<DesktopAuthenticationResult> {
    try {
      /** @brief 在任何网络动作前占有的新授权世代 / New authorization generation owned before network activity. */
      const installer = await observeAuthorizationDeadline(
        this.trackAuthorizationWork(this.session.beginAuthorization(signal)),
        boundary
      )
      /** @brief 从固定 URL 获取并严格验证的 discovery / Discovery fetched from a fixed URL and strictly validated. */
      const discovery = await observeAuthorizationDeadline(
        this.trackAuthorizationWork(this.fetchDiscovery(signal)),
        boundary
      )
      await observeAuthorizationDeadline(
        this.trackAuthorizationWork(
          this.authorizeOperation(
            {
              clientId: this.configuration.clientId,
              discovery,
              offlineAccessConsent: 'request',
              scopes: this.configuration.scopes,
              screenHint
            },
            installer,
            signal
          )
        ),
        boundary
      )
      /** @brief grant 安装后的当前投影 / Current projection after grant installation. */
      const projection = this.session.getProjection()
      if (projection === null) throw new Error('Native OAuth completed without a live session.')
      return successfulSession(projection)
    } catch (error: unknown) {
      await this.session.cancelAuthorization().catch(() => undefined)
      void this.scheduleAuthorizationCleanup()
      return safeFailure(error)
    }
  }

  /**
   * @brief 条件刷新并返回新短期会话 / Refresh conditionally and return the new short-lived session.
   * @param rejectedAccessToken 被拒绝 token 或 null / Rejected token or null.
   * @return renderer-safe 结果 / Renderer-safe result.
   */
  async refresh(rejectedAccessToken: string | null): Promise<DesktopAuthenticationResult> {
    if (
      this.initialFailureReason !== null ||
      this.disposalFlight !== null ||
      this.signOutFlight !== null
    ) {
      return Object.freeze({
        kind: 'failure',
        reason: this.initialFailureReason ?? 'failed'
      })
    }
    try {
      await this.session.refresh(rejectedAccessToken)
      /** @brief refresh 后投影 / Projection after refresh. */
      const projection = this.session.getProjection()
      if (projection === null) throw new Error('Native OAuth refresh produced no live session.')
      return successfulSession(projection)
    } catch (error: unknown) {
      return safeFailure(error)
    }
  }

  /**
   * @brief 取消授权、清本地并尽力撤销 / Cancel authorization, clear locally, and revoke best effort.
   * @return renderer-safe 匿名结果或本地清理失败 / Renderer-safe anonymous result or local-clearing failure.
   */
  async signOut(): Promise<DesktopAuthenticationResult> {
    if (this.disposalFlight !== null) {
      return Object.freeze({ kind: 'failure', reason: 'failed' })
    }
    if (this.signOutFlight !== null) return this.signOutFlight
    this.authorizationAbort?.abort()
    /** @brief 授权终态之后执行的唯一登出任务 / Sole sign-out task running after authorization reaches a terminal state. */
    const operation = (async (): Promise<DesktopAuthenticationResult> => {
      try {
        await this.authorizationFlight?.catch(() => undefined)
        await this.awaitAuthorizationQuiescence()
        await this.session.signOut()
        return successfulSession(null)
      } catch (error: unknown) {
        return safeFailure(error)
      }
    })()
    this.signOutFlight = operation
    /** @brief 只清理当前登出任务的终态回调 / Terminal callback clearing only the current sign-out task. */
    const clear = (): void => {
      if (this.signOutFlight === operation) this.signOutFlight = null
    }
    void operation.then(clear, clear)
    return operation
  }

  /**
   * @brief 应用退出前停止授权并清 access token 内存 / Stop authorization and clear access-token memory before app exit.
   */
  dispose(): Promise<void> {
    if (this.disposalFlight !== null) return this.disposalFlight
    this.authorizationAbort?.abort()
    /** @brief 授权任务退出后再等待 session 静止的关闭任务 / Disposal waiting for authorization completion before session quiesce. */
    const operation = (async (): Promise<void> => {
      await this.authorizationFlight?.catch(() => undefined)
      await this.awaitAuthorizationQuiescence()
      await this.signOutFlight?.catch(() => undefined)
      await this.session.shutdown()
    })()
    this.disposalFlight = operation
    /** @brief 失败时释放单飞槽以允许显式重试 / Release the single-flight slot on failure so an explicit retry is possible. */
    const releaseRejectedDisposal = (): void => {
      if (this.disposalFlight === operation) this.disposalFlight = null
    }
    void operation.then(undefined, releaseRejectedDisposal)
    return operation
  }
}

/**
 * @brief 校验 IPC sender 与精确参数个数 / Validate an IPC sender and exact argument count.
 * @param event IPC event 最小身份 / Minimal identity of the IPC event.
 * @param arguments_ renderer 参数 / Renderer arguments.
 * @param expectedCount 预期参数数 / Expected argument count.
 * @param resolveTrustedRenderer 当前可信 renderer 解析器 / Current trusted-renderer resolver.
 */
function assertTrustedInvocation(
  event: IpcSenderEvent,
  arguments_: readonly unknown[],
  expectedCount: number,
  resolveTrustedRenderer: TrustedRendererResolver
): void {
  if (
    arguments_.length !== expectedCount ||
    !isTrustedMainFrameRequest(event, resolveTrustedRenderer)
  ) {
    throw new Error('Rejected authentication request from an untrusted renderer.')
  }
}

/**
 * @brief 注册四个封闭 authentication IPC handlers / Register four closed authentication IPC handlers.
 * @param controller native OAuth 控制器 / Native OAuth controller.
 * @param resolveTrustedRenderer 当前可信主窗口身份 / Current trusted main-window identity.
 */
export function registerNativeOAuthHandlers(
  controller: NativeOAuthController,
  resolveTrustedRenderer: TrustedRendererResolver
): void {
  /** @brief 所有认证通道 / All authentication channels. */
  const channels = [
    DESKTOP_AUTH_GET_SESSION_CHANNEL,
    DESKTOP_AUTH_AUTHORIZE_CHANNEL,
    DESKTOP_AUTH_REFRESH_CHANNEL,
    DESKTOP_AUTH_SIGN_OUT_CHANNEL
  ] as const
  for (const channel of channels) ipcMain.removeHandler(channel)

  ipcMain.handle(DESKTOP_AUTH_GET_SESSION_CHANNEL, (event, ...arguments_: unknown[]) => {
    assertTrustedInvocation(event, arguments_, 0, resolveTrustedRenderer)
    return controller.getSession()
  })
  ipcMain.handle(DESKTOP_AUTH_AUTHORIZE_CHANNEL, (event, ...arguments_: unknown[]) => {
    assertTrustedInvocation(event, arguments_, 1, resolveTrustedRenderer)
    /** @brief 未经信任的 screen hint / Untrusted screen hint. */
    const screenHint = arguments_[0]
    if (screenHint !== 'login' && screenHint !== 'signup' && screenHint !== 'recovery') {
      throw new Error('Rejected invalid native OAuth screen hint.')
    }
    return controller.authorize(screenHint)
  })
  ipcMain.handle(DESKTOP_AUTH_REFRESH_CHANNEL, (event, ...arguments_: unknown[]) => {
    assertTrustedInvocation(event, arguments_, 1, resolveTrustedRenderer)
    /** @brief 未经信任的 rejected token / Untrusted rejected token. */
    const rejectedAccessToken = arguments_[0]
    if (rejectedAccessToken !== null && typeof rejectedAccessToken !== 'string') {
      throw new Error('Rejected invalid Access Token observation.')
    }
    return controller.refresh(rejectedAccessToken)
  })
  ipcMain.handle(DESKTOP_AUTH_SIGN_OUT_CHANNEL, (event, ...arguments_: unknown[]) => {
    assertTrustedInvocation(event, arguments_, 0, resolveTrustedRenderer)
    return controller.signOut()
  })
}
