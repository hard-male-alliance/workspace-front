/** @file 可取消轮询的共享时间策略 / Shared timing policy for abortable polling. */

/** @brief 自动轮询的最短等待毫秒数 / Minimum automatic-poll delay in milliseconds. */
export const POLL_DELAY_MINIMUM_MILLISECONDS = 750

/** @brief 自动轮询的最长等待毫秒数 / Maximum automatic-poll delay in milliseconds. */
export const POLL_DELAY_MAXIMUM_MILLISECONDS = 10_000

/** @brief JavaScript 宿主 timer 可可靠表达的最大延迟 / Largest delay reliably representable by JavaScript host timers. */
export const HOST_TIMER_MAXIMUM_DELAY_MILLISECONDS = 2_147_483_647

/** @brief 可替换的零到一随机数源 / Replaceable random source from zero through one. */
export type PollRandomSource = () => number

/** @brief 可替换的 timeout 调度器 / Replaceable timeout scheduler. */
export interface PollTimer {
  /**
   * @brief 清除一个尚未触发的 timeout / Clear a timeout that has not fired.
   * @param handle setTimeout 返回的不透明句柄 / Opaque handle returned by setTimeout.
   */
  readonly clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void
  /**
   * @brief 安排一次 timeout / Schedule one timeout.
   * @param callback 到期回调 / Callback invoked on expiry.
   * @param delayMilliseconds 等待毫秒数 / Delay in milliseconds.
   * @return 可用于取消的句柄 / Handle usable for cancellation.
   */
  readonly setTimeout: (
    callback: () => void,
    delayMilliseconds: number
  ) => ReturnType<typeof globalThis.setTimeout>
}

/** @brief 轮询所需的最小页面可见性端口 / Minimal page-visibility port required by polling. */
export interface PollVisibilitySource {
  /** @brief 当前页面可见性 / Current page visibility. */
  readonly visibilityState: DocumentVisibilityState
  /**
   * @brief 订阅可见性变化 / Subscribe to visibility changes.
   * @param type 固定为 visibilitychange / Always visibilitychange.
   * @param listener 变化监听器 / Change listener.
   */
  readonly addEventListener: (type: 'visibilitychange', listener: EventListener) => void
  /**
   * @brief 移除可见性订阅 / Remove a visibility subscription.
   * @param type 固定为 visibilitychange / Always visibilitychange.
   * @param listener 原监听器 / Original listener.
   */
  readonly removeEventListener: (type: 'visibilitychange', listener: EventListener) => void
}

/** @brief 默认使用当前 JavaScript 宿主 timer / Default timer backed by the current JavaScript host. */
const DEFAULT_POLL_TIMER: PollTimer = Object.freeze({
  clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>): void =>
    globalThis.clearTimeout(handle),
  setTimeout: (callback: () => void, delayMilliseconds: number) =>
    globalThis.setTimeout(callback, delayMilliseconds)
})

/**
 * @brief 计算绝对截止时间的下一段安全 timer 延迟 / Compute the next safe timer segment for an absolute deadline.
 * @param deadlineMilliseconds Unix epoch 毫秒截止时间 / Deadline in Unix-epoch milliseconds.
 * @param nowMilliseconds 当前 Unix epoch 毫秒 / Current time in Unix-epoch milliseconds.
 * @return 截止时间有效且尚未到达时的正延迟；否则为 null / Positive delay while a valid deadline remains, otherwise null.
 * @note 超过宿主上限的截止时间必须在本段结束后重新调用，以抵抗系统休眠和时钟漂移 / Deadlines beyond the host limit must call this again after each segment to resist sleep and clock drift.
 */
export function nextDeadlineTimerDelayMilliseconds(
  deadlineMilliseconds: number,
  nowMilliseconds: number = Date.now()
): number | null {
  /** @brief 当前剩余毫秒 / Milliseconds currently remaining. */
  const remainingMilliseconds = deadlineMilliseconds - nowMilliseconds
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) return null
  return Math.min(remainingMilliseconds, HOST_TIMER_MAXIMUM_DELAY_MILLISECONDS)
}

/**
 * @brief 将任意 AbortSignal reason 收敛为可安全拒绝的 Error / Normalize any AbortSignal reason into a safe rejection Error.
 * @param signal 已取消的信号 / Aborted signal.
 * @return 原始 Error，或不泄露非 Error 数据的标准 AbortError / Original Error, or a standard AbortError that does not expose non-Error data.
 */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * @brief 取得当前 DOM 的最小可见性端口 / Obtain the current DOM's minimal visibility port.
 * @return 浏览器 Document；无 DOM 的宿主返回 undefined / Browser Document, or undefined for hosts without a DOM.
 */
function currentVisibilitySource(): PollVisibilitySource | undefined {
  if (typeof document === 'undefined') return undefined
  return document
}

/**
 * @brief 计算有上限的 decorrelated-jitter 下一次轮询延迟 / Compute the next capped decorrelated-jitter polling delay.
 * @param previousDelayMilliseconds 上一次延迟；新阶段为 null / Previous delay, or null for a new phase.
 * @param random 零到一的可替换随机源 / Replaceable random source from zero through one.
 * @return 位于固定生产边界内的整数毫秒数 / Integer milliseconds within fixed production bounds.
 * @note 权威 Job 有实质进展时调用方应传 null，以恢复快速反馈 / Callers should pass null after authoritative Job progress so feedback becomes prompt again.
 */
export function nextPollDelayMilliseconds(
  previousDelayMilliseconds: number | null,
  random: PollRandomSource = Math.random
): number {
  /** @brief 经失败关闭处理的前一延迟 / Previous delay normalized with fail-closed bounds. */
  const previous =
    previousDelayMilliseconds === null ||
    !Number.isFinite(previousDelayMilliseconds) ||
    previousDelayMilliseconds < POLL_DELAY_MINIMUM_MILLISECONDS
      ? POLL_DELAY_MINIMUM_MILLISECONDS
      : Math.min(Math.floor(previousDelayMilliseconds), POLL_DELAY_MAXIMUM_MILLISECONDS)
  /** @brief decorrelated jitter 的开放上界 / Exclusive upper bound for decorrelated jitter. */
  const upper = Math.min(previous * 3, POLL_DELAY_MAXIMUM_MILLISECONDS)
  /** @brief 拒绝宿主或测试注入的非法随机值 / Random value rejecting malformed host or test input. */
  const randomValue = random()
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue > 1) {
    throw new TypeError('The polling random source must return a finite value between 0 and 1.')
  }
  return Math.floor(
    POLL_DELAY_MINIMUM_MILLISECONDS + (upper - POLL_DELAY_MINIMUM_MILLISECONDS) * randomValue
  )
}

/**
 * @brief 等待一段可由 AbortSignal 立即终止的时间 / Wait for a duration that an AbortSignal can terminate immediately.
 * @param delayMilliseconds 非负有限等待时间 / Non-negative finite delay.
 * @param signal 当前轮询生命周期的取消信号 / Abort signal for the current polling lifecycle.
 * @param timer 可替换 timer，用于确定性测试 / Replaceable timer for deterministic tests.
 * @return timeout 到期时兑现的 Promise / Promise fulfilled when the timeout expires.
 * @note 无论 timeout 或 abort 先发生，都会移除另一路监听，避免长轮询累积 listener / Whichever settles first removes the other listener so long polling does not accumulate listeners.
 */
export function waitForPollDelay(
  delayMilliseconds: number,
  signal: AbortSignal,
  timer: PollTimer = DEFAULT_POLL_TIMER
): Promise<void> {
  if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) {
    return Promise.reject(new TypeError('A polling delay must be a non-negative finite number.'))
  }
  if (signal.aborted) {
    return Promise.reject(abortError(signal))
  }

  return new Promise<void>((resolve, reject): void => {
    /** @brief 防止 timeout 与 abort 双重兑现的 settled 标志 / Settled flag preventing timeout and abort from resolving twice. */
    let settled = false
    /** @brief 当前等待的 timeout 句柄 / Timeout handle for the current wait. */
    /**
     * @brief 仅由第一个完成方执行公共清理 / Perform shared cleanup only for the first settling side.
     * @return 当前调用是否取得完成权 / Whether this call acquired settlement ownership.
     */
    const settle = (): boolean => {
      if (settled) return false
      settled = true
      signal.removeEventListener('abort', abort)
      return true
    }

    /**
     * @brief 取消等待并传播安全的 abort error / Cancel the wait and propagate a safe abort error.
     */
    const abort = (): void => {
      if (!settle()) return
      timer.clearTimeout(handle)
      reject(abortError(signal))
    }

    /** @brief 当前等待的 timeout 句柄 / Timeout handle for the current wait. */
    const handle = timer.setTimeout((): void => {
      if (!settle()) return
      resolve()
    }, delayMilliseconds)
    signal.addEventListener('abort', abort, { once: true })

    if (signal.aborted) abort()
  })
}

/**
 * @brief 仅在页面可见时等待轮询，并在重新可见后立即继续 / Wait for polling only while visible and continue immediately after visibility returns.
 * @param delayMilliseconds 可见页面中的非负有限等待时间 / Non-negative finite delay while the page is visible.
 * @param signal 当前轮询生命周期的取消信号 / Abort signal for the current polling lifecycle.
 * @param visibility 可替换页面可见性端口 / Replaceable page-visibility port.
 * @param timer 可替换 timer，用于确定性测试 / Replaceable timer for deterministic tests.
 * @return 可见等待结束或页面从后台恢复时兑现的 Promise / Promise fulfilled after a visible delay or when a hidden page becomes visible.
 * @note 后台期间不运行轮询 timer；恢复后由调用方立即重读权威状态 / No poll timer runs in the background; the caller rereads authority immediately on return.
 */
export function waitForVisiblePollDelay(
  delayMilliseconds: number,
  signal: AbortSignal,
  visibility: PollVisibilitySource | undefined = currentVisibilitySource(),
  timer: PollTimer = DEFAULT_POLL_TIMER
): Promise<void> {
  if (visibility === undefined) return waitForPollDelay(delayMilliseconds, signal, timer)
  if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) {
    return Promise.reject(new TypeError('A polling delay must be a non-negative finite number.'))
  }
  if (signal.aborted) return Promise.reject(abortError(signal))

  return new Promise<void>((resolve, reject): void => {
    /** @brief 当前可见等待的 timer；后台时为 null / Timer for the current visible wait, or null while hidden. */
    let handle: ReturnType<typeof globalThis.setTimeout> | null = null
    /** @brief 防止 visibility、timeout 与 abort 重复完成 / Prevent visibility, timeout, and abort from settling more than once. */
    let settled = false

    /** @brief 移除所有宿主资源 / Release every host resource. */
    const cleanup = (): void => {
      if (handle !== null) timer.clearTimeout(handle)
      signal.removeEventListener('abort', abort)
      visibility.removeEventListener('visibilitychange', visibilityChanged)
    }

    /** @brief 成功完成当前等待 / Fulfil the current wait. */
    const finish = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    /** @brief 以安全 AbortError 终止等待 / Reject the wait with a safe AbortError. */
    const abort = (): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(abortError(signal))
    }

    /** @brief 页面恢复可见时立即触发权威重读，转入后台时停止 timer / Reread authority immediately on visibility return and stop the timer while hidden. */
    const visibilityChanged: EventListener = (): void => {
      if (visibility.visibilityState === 'visible') {
        finish()
        return
      }
      if (handle !== null) {
        timer.clearTimeout(handle)
        handle = null
      }
    }

    signal.addEventListener('abort', abort, { once: true })
    visibility.addEventListener('visibilitychange', visibilityChanged)
    if (signal.aborted) {
      abort()
    } else if (visibility.visibilityState === 'visible') {
      handle = timer.setTimeout(finish, delayMilliseconds)
    }
  })
}
