/** @file Workspace Experience 领域投影 / Workspace Experience domain projections. */

import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief 当前用户标识符 / Current-user identifier. */
export type UiCurrentUserId = UiOpaqueId<'user'>

/** @brief 工作区套餐 / Workspace plan. */
export type UiWorkspacePlan = 'free' | 'pro' | 'team' | 'enterprise' | 'unknown'

/**
 * @brief 工作区展示模型 / Workspace display model.
 * @note 字段源自 Workspace 契约语义，但采用 camelCase 供 UI 使用；不是网络 DTO。
 */
export interface UiWorkspace {
  /** @brief 工作区 ID / Workspace ID. */
  readonly id: UiWorkspaceId
  /** @brief 工作区名称 / Workspace name. */
  readonly name: string
  /** @brief 人类可读 slug / Human-readable slug. */
  readonly slug: string
  /** @brief 默认资源语言 / Default resource-content locale. */
  readonly locale: UiContentLocale
  /** @brief 时区 IANA 名称 / IANA timezone name. */
  readonly timezone: string
  /** @brief 产品套餐 / Product plan. */
  readonly plan: UiWorkspacePlan
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

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

/** @brief 当前用户及其可访问工作区的权威投影 / Authoritative projection of the current user and accessible Workspaces. */
export interface UiWorkspaceAccess {
  /** @brief 当前已认证用户 / Current authenticated user. */
  readonly currentUser: UiCurrentUser
  /** @brief 当前用户可访问的工作区 / Workspaces accessible to the current user. */
  readonly workspaces: readonly UiWorkspace[]
}
