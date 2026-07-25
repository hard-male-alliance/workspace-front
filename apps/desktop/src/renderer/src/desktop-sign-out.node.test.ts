import { describe, expect, it, vi } from 'vitest'
import type { DesktopAuthenticationResult } from '@ai-job-workspace/platform'

import { beginDesktopSignOut } from './desktop-sign-out'
import type { DesktopSignOutBoundaryMode } from './desktop-sign-out'

/**
 * @brief 创建可手动兑现的 Promise / Create a manually resolvable Promise.
 * @return promise 与 resolver / Promise and resolver.
 */
function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  /** @brief Promise resolver / Promise 兑现器. */
  let resolvePromise: ((value: T) => void) | undefined
  /** @brief 待兑现 Promise / Promise awaiting resolution. */
  const promise = new Promise<T>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value: T): void => {
      if (resolvePromise === undefined) throw new Error('Deferred resolver is unavailable.')
      resolvePromise(value)
    }
  }
}

describe('beginDesktopSignOut', (): void => {
  it('联系 main 前同步清 token 与卸载 Workspace，失败后只进入锁定恢复', async (): Promise<void> => {
    /** @brief 可手动兑现的 main 结果 / Manually resolvable main-process result. */
    const hostResult = deferred<DesktopAuthenticationResult>()
    /** @brief 可观察的同步顺序 / Observable synchronous order. */
    const order: string[] = []
    /** @brief 呈现的边界阶段 / Rendered boundary phases. */
    const boundaries: Array<{
      readonly mode: DesktopSignOutBoundaryMode
      readonly onRetry?: () => void
    }> = []
    /** @brief 认证入口呈现 spy / Authentication-entry render spy. */
    const showAuthentication = vi.fn()

    /** @brief 待测登出任务 / Sign-out operation under test. */
    const signOut = beginDesktopSignOut({
      clearAccessToken: (): void => {
        order.push('clear-token')
      },
      requestHostSignOut: (): Promise<DesktopAuthenticationResult> => {
        order.push('request-main')
        return hostResult.promise
      },
      showAuthentication,
      showBoundary: (mode, onRetry): void => {
        order.push(`boundary-${mode}`)
        boundaries.push({ mode, onRetry })
      }
    })

    expect(order).toEqual(['clear-token', 'boundary-clearing', 'request-main'])
    expect(showAuthentication).not.toHaveBeenCalled()

    hostResult.resolve({ kind: 'failure', reason: 'failed' })
    await expect(signOut).resolves.toBeUndefined()
    expect(boundaries.at(-1)?.mode).toBe('locked')
    expect(boundaries.at(-1)?.onRetry).toBeTypeOf('function')
    expect(showAuthentication).not.toHaveBeenCalled()
  })

  it('锁定页重试成功后才呈现匿名认证入口', async (): Promise<void> => {
    /** @brief 锁定页捕获的重试 / Retry captured by the lock screen. */
    let retry: (() => void) | undefined
    /** @brief 首次失败、第二次成功的 main / Main sign-out failing once and then succeeding. */
    const requestHostSignOut = vi
      .fn<() => Promise<DesktopAuthenticationResult>>()
      .mockResolvedValueOnce({ kind: 'failure', reason: 'failed' })
      .mockResolvedValueOnce({ kind: 'success', session: { kind: 'anonymous' } })
    /** @brief 认证入口呈现 spy / Authentication-entry render spy. */
    const showAuthentication = vi.fn()

    await beginDesktopSignOut({
      clearAccessToken: vi.fn(),
      requestHostSignOut,
      showAuthentication,
      showBoundary: (mode, onRetry): void => {
        if (mode === 'locked') retry = onRetry
      }
    })
    expect(showAuthentication).not.toHaveBeenCalled()
    if (retry === undefined) throw new Error('The lock screen did not expose retry.')

    retry()
    await vi.waitFor((): void => expect(showAuthentication).toHaveBeenCalledOnce())
    expect(requestHostSignOut).toHaveBeenCalledTimes(2)
  })
})
