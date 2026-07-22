/** @file Identity 限界上下文的领域投影 / Domain projections for the Identity bounded context. */

import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'

/** @brief 当前用户标识符 / Current-user identifier. */
export type UiCurrentUserId = UiOpaqueId<'user'>

/** @brief 当前已认证用户投影 / Current authenticated-user projection. */
export interface UiCurrentUser {
  /** @brief 用户 ID / User ID. */
  readonly id: UiCurrentUserId
  /** @brief 用户选择的显示名称 / User-selected display name. */
  readonly displayName: string
  /** @brief 用户界面语言偏好 / User-interface locale preference. */
  readonly locale: string
  /** @brief 用户时区 IANA 名称 / User IANA timezone name. */
  readonly timezone: string
  /** @brief 默认 Workspace ID / Default Workspace ID. */
  readonly defaultWorkspaceId: UiWorkspaceId | null
}
