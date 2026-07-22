/** @file Workspace Experience 领域投影 / Workspace Experience domain projections. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'

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
