import { describe, expect, it, vi } from 'vitest'

import {
  HOST_TIMER_MAXIMUM_DELAY_MILLISECONDS,
  nextDeadlineTimerDelayMilliseconds,
  nextPollDelayMilliseconds,
  POLL_DELAY_MAXIMUM_MILLISECONDS,
  POLL_DELAY_MINIMUM_MILLISECONDS,
  waitForPollDelay,
  waitForVisiblePollDelay,
  type PollTimer,
  type PollVisibilitySource
} from './polling'

/** @brief 可取消轮询时间策略 / Abortable polling timing policy. */
describe('polling timing policy', (): void => {
  it('segments absolute deadlines at the JavaScript host timer limit', (): void => {
    expect(
      nextDeadlineTimerDelayMilliseconds(HOST_TIMER_MAXIMUM_DELAY_MILLISECONDS + 60_000, 0)
    ).toBe(HOST_TIMER_MAXIMUM_DELAY_MILLISECONDS)
    expect(nextDeadlineTimerDelayMilliseconds(1_000, 250)).toBe(750)
    expect(nextDeadlineTimerDelayMilliseconds(250, 250)).toBeNull()
    expect(nextDeadlineTimerDelayMilliseconds(Number.NaN, 0)).toBeNull()
  })

  it('uses bounded decorrelated jitter and resets after progress', (): void => {
    expect(nextPollDelayMilliseconds(null, () => 0)).toBe(POLL_DELAY_MINIMUM_MILLISECONDS)
    expect(nextPollDelayMilliseconds(null, () => 1)).toBe(POLL_DELAY_MINIMUM_MILLISECONDS * 3)
    expect(nextPollDelayMilliseconds(POLL_DELAY_MAXIMUM_MILLISECONDS, () => 1)).toBe(
      POLL_DELAY_MAXIMUM_MILLISECONDS
    )
    expect(nextPollDelayMilliseconds(Number.NaN, () => 0)).toBe(POLL_DELAY_MINIMUM_MILLISECONDS)
  })

  it('rejects an invalid random source instead of creating an invalid timer', (): void => {
    expect(() => nextPollDelayMilliseconds(null, () => Number.NaN)).toThrow(TypeError)
    expect(() => nextPollDelayMilliseconds(null, () => -0.1)).toThrow(TypeError)
    expect(() => nextPollDelayMilliseconds(null, () => 1.1)).toThrow(TypeError)
  })

  it('removes the abort listener when the timer wins', async (): Promise<void> => {
    /** @brief 当前测试使用的取消控制器 / Abort controller used by this test. */
    const controller = new AbortController()
    /** @brief AbortSignal listener 移除观测器 / Observer for AbortSignal listener removal. */
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    /** @brief 当前测试捕获的 timeout 回调 / Timeout callback captured by this test. */
    let timeoutCallback: (() => void) | undefined
    /** @brief 不依赖真实时间的测试 timer / Test timer independent of wall-clock time. */
    const timer: PollTimer = {
      clearTimeout: vi.fn(),
      setTimeout: (callback) => {
        timeoutCallback = callback
        return 1 as unknown as ReturnType<typeof globalThis.setTimeout>
      }
    }
    /** @brief 待测试等待 / Wait under test. */
    const waiting = waitForPollDelay(50, controller.signal, timer)
    timeoutCallback?.()

    await expect(waiting).resolves.toBeUndefined()
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('clears the timer and propagates the reason when abort wins', async (): Promise<void> => {
    /** @brief 当前测试使用的取消控制器 / Abort controller used by this test. */
    const controller = new AbortController()
    /** @brief timeout 清理观测器 / Timeout-clear observer. */
    const clearTimeout = vi.fn()
    /** @brief 不触发 timeout 的测试 timer / Test timer whose timeout never fires. */
    const timer: PollTimer = {
      clearTimeout,
      setTimeout: () => 7 as unknown as ReturnType<typeof globalThis.setTimeout>
    }
    /** @brief 明确的取消原因 / Explicit abort reason. */
    const reason = new Error('cancelled by test')
    /** @brief 待测试等待 / Wait under test. */
    const waiting = waitForPollDelay(50, controller.signal, timer)
    controller.abort(reason)

    await expect(waiting).rejects.toBe(reason)
    expect(clearTimeout).toHaveBeenCalledWith(7)
  })

  it('pauses without a timer while hidden and resumes with an immediate authority read', async (): Promise<void> => {
    /** @brief 可主动派发 visibilitychange 的测试宿主 / Test host that can dispatch visibilitychange. */
    const events = new EventTarget()
    /** @brief 可变的测试页面状态 / Mutable test-page state. */
    let visibilityState: DocumentVisibilityState = 'hidden'
    /** @brief 最小页面可见性适配器 / Minimal page-visibility adapter. */
    const visibility: PollVisibilitySource = {
      addEventListener: (type, listener): void => events.addEventListener(type, listener),
      get visibilityState(): DocumentVisibilityState {
        return visibilityState
      },
      removeEventListener: (type, listener): void => events.removeEventListener(type, listener)
    }
    /** @brief 不应在后台启动的 timer / Timer that must not start in the background. */
    const timer: PollTimer = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 1 as unknown as ReturnType<typeof globalThis.setTimeout>)
    }
    /** @brief 后台开始的等待 / Wait started while hidden. */
    const waiting = waitForVisiblePollDelay(1_000, new AbortController().signal, visibility, timer)
    expect(timer.setTimeout).not.toHaveBeenCalled()

    visibilityState = 'visible'
    events.dispatchEvent(new Event('visibilitychange'))

    await expect(waiting).resolves.toBeUndefined()
    expect(timer.setTimeout).not.toHaveBeenCalled()
  })

  it('stops a visible timer when hidden and removes every listener after abort', async (): Promise<void> => {
    /** @brief 可主动派发 visibilitychange 的测试宿主 / Test host that can dispatch visibilitychange. */
    const events = new EventTarget()
    /** @brief 可变的测试页面状态 / Mutable test-page state. */
    let visibilityState: DocumentVisibilityState = 'visible'
    /** @brief 最小页面可见性适配器 / Minimal page-visibility adapter. */
    const visibility: PollVisibilitySource = {
      addEventListener: (type, listener): void => events.addEventListener(type, listener),
      get visibilityState(): DocumentVisibilityState {
        return visibilityState
      },
      removeEventListener: (type, listener): void => events.removeEventListener(type, listener)
    }
    /** @brief timeout 清理观测器 / Timeout-clear observer. */
    const clearTimeout = vi.fn()
    /** @brief 不自动到期的测试 timer / Test timer that does not expire automatically. */
    const timer: PollTimer = {
      clearTimeout,
      setTimeout: () => 11 as unknown as ReturnType<typeof globalThis.setTimeout>
    }
    /** @brief 当前测试使用的取消控制器 / Abort controller used by this test. */
    const controller = new AbortController()
    /** @brief 可见页面开始的等待 / Wait started while visible. */
    const waiting = waitForVisiblePollDelay(1_000, controller.signal, visibility, timer)

    visibilityState = 'hidden'
    events.dispatchEvent(new Event('visibilitychange'))
    expect(clearTimeout).toHaveBeenCalledWith(11)
    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  })
})
