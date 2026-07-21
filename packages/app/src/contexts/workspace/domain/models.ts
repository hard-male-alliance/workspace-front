/** @file Workspace Experience 领域投影 / Workspace Experience domain projections. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief 工作区套餐 / Workspace plan. */
export type UiWorkspacePlan = 'free' | 'pro' | 'team' | 'enterprise'

/** @brief 工作区成员角色 / Workspace member role. */
export type UiWorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

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
  /** @brief 当前 UI 用户的角色 / Current UI user's role. */
  readonly role: UiWorkspaceRole
  /** @brief 默认资源语言 / Default resource-content locale. */
  readonly locale: UiContentLocale
  /** @brief 时区 IANA 名称 / IANA timezone name. */
  readonly timezone: string
  /** @brief 产品套餐 / Product plan. */
  readonly plan: UiWorkspacePlan
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 首页活动类别 / Workspace-home activity kind. */
export type UiWorkspaceActivityKind =
  'resume_updated' | 'template_changed' | 'interview_completed' | 'knowledge_indexed'

/**
 * @brief 首页近期活动投影 / Recent activity projection for the home page.
 * @note 这是从资源、Job 与审计事件聚合出的前端模型，并非额外后端资源。
 */
export interface UiWorkspaceActivity {
  /** @brief 活动的稳定 UI 标识符 / Stable UI activity identifier. */
  readonly id: string
  /** @brief 活动类别 / Activity kind. */
  readonly kind: UiWorkspaceActivityKind
  /** @brief 活动标题 / Activity title. */
  readonly title: string
  /** @brief 可选的活动说明 / Optional activity description. */
  readonly description: string
  /** @brief 活动发生时间 / Activity occurrence time. */
  readonly occurredAt: string
}

/**
 * @brief 工作区首页展示模型 / Workspace-home display model.
 * @note 统计数字仅用于当前 v0.1.0 展示，不代表服务端聚合 API 的正式返回体。
 */
export interface UiWorkspaceHomeModel {
  /** @brief 当前工作区 / Current workspace. */
  readonly workspace: UiWorkspace
  /** @brief 简历数量 / Resume count. */
  readonly resumeCount: number
  /** @brief 就绪知识来源数量 / Ready knowledge-source count. */
  readonly readyKnowledgeSourceCount: number
  /** @brief 已完成面试数量 / Completed interview count. */
  readonly completedInterviewCount: number
  /** @brief 近期活动 / Recent activities. */
  readonly recentActivities: readonly UiWorkspaceActivity[]
}
