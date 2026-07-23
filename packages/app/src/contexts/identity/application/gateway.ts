/** @file Identity v2 应用端口 / Identity v2 application port. */

import type { UiCurrentUser } from '../domain/models'

/** @brief 当前 OAuth principal 的身份读取端口 / Identity read port for the current OAuth principal. */
export interface IdentityGateway {
  /**
   * @brief 加载当前已认证用户 / Load the current authenticated user.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 当前用户的权威领域投影 / Authoritative domain projection of the current user.
   */
  loadCurrentUser(signal: AbortSignal): Promise<UiCurrentUser>
}
