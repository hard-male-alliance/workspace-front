/** @file HTTP 响应体的共享生命周期策略 / Shared lifecycle policy for HTTP response bodies. */

/**
 * @brief 在协议校验失败后尽力终止未锁定响应体 / Best-effort terminate an unlocked response body after protocol validation fails.
 * @param response 不再向调用方暴露的响应 / Response that will no longer be exposed to the caller.
 * @return 无返回值；清理失败不会掩盖主错误 / No value; cleanup failure never masks the primary error.
 */
export function cancelResponseBodyBestEffort(response: Response): void {
  /** @brief 尚可由当前层取消的响应流 / Response stream still cancellable by this layer. */
  const body = response.body
  if (body === null || response.bodyUsed || body.locked) return
  try {
    void body.cancel().catch((): undefined => undefined)
  } catch {
    // Structural ports can provide custom streams; cleanup remains deliberately best effort.
  }
}
