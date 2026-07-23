/** @file Electron renderer 的 local-first 登出应用服务 / Local-first sign-out application service for the Electron renderer. */

import type { DesktopAuthenticationResult } from '@ai-job-workspace/platform'

/** @brief 登出边界阶段 / Sign-out boundary phase. */
export type DesktopSignOutBoundaryMode = 'clearing' | 'locked'

/** @brief Local-first 登出编排依赖 / Dependencies for local-first sign-out orchestration. */
export interface DesktopSignOutOptions {
  /** @brief 同步清除 renderer Access Token / Synchronously clear the renderer Access Token. */
  readonly clearAccessToken: () => void
  /** @brief 请求 main 持久清理与尽力 revoke / Request main-process durable cleanup and best-effort revocation. */
  readonly requestHostSignOut: () => Promise<DesktopAuthenticationResult>
  /** @brief 只在 main 确认匿名后呈现认证入口 / Show the authentication entry only after main confirms anonymity. */
  readonly showAuthentication: () => void
  /** @brief 同步呈现已卸载 Workspace 的安全边界 / Synchronously show a security boundary with the Workspace unmounted. */
  readonly showBoundary: (mode: DesktopSignOutBoundaryMode, onRetry?: () => void) => void
}

/**
 * @brief 在 renderer 已锁定时完成一次 main 登出尝试 / Complete one main-process sign-out attempt while the renderer is locked.
 * @param options 封闭的登出端口 / Closed sign-out ports.
 * @return 宿主尝试已投影到 UI 后兑现 / Resolves after the host attempt is projected into the UI.
 */
async function attemptHostSignOut(options: DesktopSignOutOptions): Promise<void> {
  options.showBoundary('clearing')
  try {
    /** @brief main 先清本地、再尽力 revoke 的结果 / Result after main clears locally first and then attempts revocation. */
    const result = await options.requestHostSignOut()
    if (result.kind === 'success' && result.session.kind === 'anonymous') {
      options.showAuthentication()
      return
    }
  } catch {
    // A transport failure cannot prove that durable local deletion completed.
  }
  /** @brief 只在锁定页可见的显式重试 / Explicit retry exposed only by the lock screen. */
  const retry = (): void => {
    void attemptHostSignOut(options)
  }
  options.showBoundary('locked', retry)
}

/**
 * @brief 先同步清凭据与卸载 Workspace，再联系 main / Clear credentials and unmount the Workspace synchronously before contacting main.
 * @param options 封闭的登出端口 / Closed sign-out ports.
 * @return main 登出尝试终态 / Terminal state of the main-process sign-out attempt.
 */
export function beginDesktopSignOut(options: DesktopSignOutOptions): Promise<void> {
  options.clearAccessToken()
  return attemptHostSignOut(options)
}
