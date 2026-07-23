import { describe, expect, it, vi } from 'vitest'

import { createSecureBeforeQuitHandler } from './before-quit'

/**
 * @brief 创建可手动兑现的 Promise / Create a manually resolvable Promise.
 * @return promise 与 resolve / Promise and resolver.
 */
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  /** @brief 测试 resolver / Test resolver. */
  let resolvePromise: (() => void) | undefined
  /** @brief 待手动兑现的 Promise / Promise awaiting manual resolution. */
  const promise = new Promise<void>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (): void => {
      if (resolvePromise === undefined) throw new Error('Deferred resolver is unavailable.')
      resolvePromise()
    }
  }
}

describe('createSecureBeforeQuitHandler', (): void => {
  it('阻止退出直到 dispose 完成，并只执行一次静止任务', async (): Promise<void> => {
    /** @brief 手动控制的静止任务 / Manually controlled quiescence task. */
    const quiescence = deferred()
    /** @brief Electron quit 替身 / Electron quit substitute. */
    const quit = vi.fn()
    /** @brief preventDefault 替身 / preventDefault substitute. */
    const preventDefault = vi.fn()
    /** @brief 待测 handler / Handler under test. */
    const handler = createSecureBeforeQuitHandler({
      dispose: vi.fn(() => quiescence.promise),
      quit,
      reportFailure: vi.fn()
    })

    handler({ preventDefault })
    handler({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(quit).not.toHaveBeenCalled()

    quiescence.resolve()
    await quiescence.promise
    await Promise.resolve()
    expect(quit).toHaveBeenCalledTimes(1)

    handler({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('静止失败时保持退出拦截并允许显式重试', async (): Promise<void> => {
    /** @brief 失败后成功的 dispose / Dispose failing once before succeeding. */
    const dispose = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('injected failure'))
      .mockResolvedValueOnce(undefined)
    /** @brief 失败报告 / Failure reporter. */
    const reportFailure = vi.fn()
    /** @brief Electron quit 替身 / Electron quit substitute. */
    const quit = vi.fn()
    /** @brief 待测 handler / Handler under test. */
    const handler = createSecureBeforeQuitHandler({ dispose, quit, reportFailure })

    handler({ preventDefault: vi.fn() })
    await vi.waitFor((): void => expect(reportFailure).toHaveBeenCalledTimes(1))
    expect(quit).not.toHaveBeenCalled()

    handler({ preventDefault: vi.fn() })
    await vi.waitFor((): void => expect(quit).toHaveBeenCalledTimes(1))
  })
})
