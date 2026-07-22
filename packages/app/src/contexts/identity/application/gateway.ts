/** @file Identity 应用端口 / Identity application port. */

import type { UiCurrentUser } from '../domain/models'

/** @brief 当前主体身份读取端口 / Current-principal identity port. */
export interface IdentityGateway {
  /**
   * @brief 加载当前已认证用户 / Load the current authenticated user.
   * @return 当前用户的权威投影 / Authoritative projection of the current user.
   */
  loadCurrentUser(): Promise<UiCurrentUser>
}
