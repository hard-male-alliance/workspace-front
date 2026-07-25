/** @file Electron 退出前等待安全生命周期静止的协调器 / Coordinator that quiesces security-sensitive lifecycle work before Electron quits. */

/** @brief Electron before-quit 事件的最小端口 / Minimal Electron before-quit event port. */
export interface BeforeQuitEventPort {
  /** @brief 阻止当前退出请求 / Prevent the current quit request. */
  readonly preventDefault: () => void
}

/** @brief 安全退出协调器依赖 / Secure-quit coordinator dependencies. */
export interface SecureBeforeQuitDependencies {
  /** @brief 等待认证生命周期静止 / Quiesce the authentication lifecycle. */
  readonly dispose: () => Promise<void>
  /** @brief 静止后重新发起 Electron 退出 / Re-enter Electron quit after quiescence. */
  readonly quit: () => void
  /** @brief 报告失败关闭的退出错误 / Report a fail-closed quit error. */
  readonly reportFailure: (error: unknown) => void
}

/**
 * @brief 创建幂等且失败关闭的 before-quit handler / Create an idempotent, fail-closed before-quit handler.
 * @param dependencies dispose、quit 与错误报告端口 / Dispose, quit, and error-reporting ports.
 * @return 可直接注册到 Electron 的 handler / Handler ready for Electron registration.
 * @note 第一次事件总会被拦截；只有 dispose 成功后，下一次 app.quit 才会放行 / The first event is always intercepted; a re-entered app.quit is allowed only after disposal succeeds.
 */
export function createSecureBeforeQuitHandler(
  dependencies: SecureBeforeQuitDependencies
): (event: BeforeQuitEventPort) => void {
  /** @brief 是否已安全静止并允许退出 / Whether quiescence completed and quit may proceed. */
  let allowQuit = false
  /** @brief 当前唯一静止任务 / Sole in-flight quiescence task. */
  let disposal: Promise<void> | null = null

  return (event: BeforeQuitEventPort): void => {
    if (allowQuit) return
    event.preventDefault()
    if (disposal !== null) return
    disposal = dependencies.dispose()
    void disposal.then(
      (): void => {
        allowQuit = true
        dependencies.quit()
      },
      (error: unknown): void => {
        disposal = null
        dependencies.reportFailure(error)
      }
    )
  }
}
