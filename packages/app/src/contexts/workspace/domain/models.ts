/** @file Workspace 限界上下文的 v2 权威模型 / v2 authority models for the Workspace bounded context. */

import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'

/** @brief Workspace 套餐 / Workspace plan. */
export type UiWorkspacePlan = 'personal' | 'team' | 'enterprise'

/** @brief Workspace 数据驻留区域 / Workspace data-residency region. */
export type UiWorkspaceDataRegion = 'cn' | 'global' | 'private_deployment'

/** @brief Workspace 成员角色 / Workspace membership role. */
export type UiWorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

/** @brief Workspace 成员记录 ID / Workspace-membership record ID. */
export type UiWorkspaceMemberId = UiOpaqueId<'workspace-member'>

/** @brief 正整数 Workspace 领域修订号 / Positive Workspace domain revision. */
export type UiWorkspaceRevision = number & {
  /** @brief Workspace 修订号品牌 / Workspace-revision brand. */
  readonly __uiWorkspaceBrand: 'revision'
}

/** @brief RFC 3339 UTC Workspace 时间戳 / RFC-3339 UTC Workspace timestamp. */
export type UiWorkspaceTimestamp = string & {
  /** @brief Workspace 时间戳品牌 / Workspace-timestamp brand. */
  readonly __uiWorkspaceBrand: 'timestamp'
}

/** @brief 符合 v2 格式的 Workspace slug / Workspace slug satisfying the v2 format. */
export type UiWorkspaceSlug = string & {
  /** @brief Workspace slug 品牌 / Workspace-slug brand. */
  readonly __uiWorkspaceBrand: 'slug'
}

/** @brief 绑定 principal 与查询条件的不透明 Workspace cursor / Opaque Workspace cursor bound to principal and query. */
export type UiWorkspaceCursor = string & {
  /** @brief Workspace cursor 品牌 / Workspace-cursor brand. */
  readonly __uiWorkspaceBrand: 'cursor'
}

/** @brief v2 Workspace slug 格式 / v2 Workspace-slug format. */
const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u

/** @brief v2 RFC 3339 UTC 时间戳格式 / v2 RFC-3339 UTC timestamp format. */
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u

/**
 * @brief 将正整数提升为 Workspace revision / Refine a positive integer into a Workspace revision.
 * @param value 领域修订号 / Domain revision.
 * @return 带 Workspace 语义品牌的修订号 / Revision branded with Workspace semantics.
 * @throws {TypeError} 当值不是正安全整数时抛出 / Thrown when the value is not a positive safe integer.
 */
export function asUiWorkspaceRevision(value: number): UiWorkspaceRevision {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError('A Workspace revision must be a positive safe integer.')
  return value as UiWorkspaceRevision
}

/**
 * @brief 将字符串提升为 Workspace UTC 时间戳 / Refine a string into a Workspace UTC timestamp.
 * @param value RFC 3339 UTC 字符串 / RFC-3339 UTC string.
 * @return 带 Workspace 语义品牌的时间戳 / Timestamp branded with Workspace semantics.
 * @throws {TypeError} 当值不符合冻结格式时抛出 / Thrown when the value violates the frozen format.
 */
export function asUiWorkspaceTimestamp(value: string): UiWorkspaceTimestamp {
  if (!UTC_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError('A Workspace timestamp must be a valid RFC 3339 UTC timestamp.')
  }
  return value as UiWorkspaceTimestamp
}

/**
 * @brief 将字符串提升为 Workspace slug / Refine a string into a Workspace slug.
 * @param value slug 字符串 / Slug string.
 * @return 带 Workspace 语义品牌的 slug / Slug branded with Workspace semantics.
 * @throws {TypeError} 当值违反 v2 slug 格式时抛出 / Thrown when the value violates the v2 slug format.
 */
export function asUiWorkspaceSlug(value: string): UiWorkspaceSlug {
  if (!WORKSPACE_SLUG_PATTERN.test(value))
    throw new TypeError('A Workspace slug must match the API v2 slug format.')
  return value as UiWorkspaceSlug
}

/**
 * @brief 将字符串提升为 Workspace cursor / Refine a string into a Workspace cursor.
 * @param value 服务端返回的不透明 cursor / Opaque cursor returned by the server.
 * @return 带 Workspace 语义品牌的 cursor / Cursor branded with Workspace semantics.
 * @throws {TypeError} 当 cursor 为空或超过 v2 上限时抛出 / Thrown when the cursor is empty or exceeds the v2 limit.
 */
export function asUiWorkspaceCursor(value: string): UiWorkspaceCursor {
  if (value.length < 1 || [...value].length > 2048)
    throw new TypeError('A Workspace cursor must contain between 1 and 2048 characters.')
  return value as UiWorkspaceCursor
}

/** @brief Workspace v2 领域资源 / Workspace v2 domain resource. */
export interface UiWorkspace {
  /** @brief Workspace ID / Workspace ID. */
  readonly id: UiWorkspaceId
  /** @brief 正整数领域修订号 / Positive domain revision. */
  readonly revision: UiWorkspaceRevision
  /** @brief 创建时间 / Creation time. */
  readonly createdAt: UiWorkspaceTimestamp
  /** @brief 更新时间 / Update time. */
  readonly updatedAt: UiWorkspaceTimestamp
  /** @brief Workspace 名称 / Workspace name. */
  readonly name: string
  /** @brief 人类可读 slug / Human-readable slug. */
  readonly slug: UiWorkspaceSlug
  /** @brief 产品套餐 / Product plan. */
  readonly plan: UiWorkspacePlan
  /** @brief 数据驻留区域 / Data-residency region. */
  readonly dataRegion: UiWorkspaceDataRegion
}

/** @brief 当前 principal 对单个 Workspace 的访问权威 / Access authority of the current principal for one Workspace. */
export interface UiWorkspaceAccess {
  /** @brief 可访问 Workspace / Accessible Workspace. */
  readonly workspace: UiWorkspace
  /** @brief 当前成员记录 ID / Current membership-record ID. */
  readonly memberId: UiWorkspaceMemberId
  /** @brief 当前成员角色 / Current membership role. */
  readonly role: UiWorkspaceRole
}

/** @brief 有后续项的 WorkspaceAccess 页面 / WorkspaceAccess page with following items. */
export interface UiWorkspaceAccessPageWithMore {
  /** @brief 当前页访问项 / Access items in the current page. */
  readonly items: readonly UiWorkspaceAccess[]
  /** @brief 仍有后续页 / Another page exists. */
  readonly hasMore: true
  /** @brief 读取后续页的不透明 cursor / Opaque cursor for the following page. */
  readonly nextCursor: UiWorkspaceCursor
}

/** @brief 最后一页 WorkspaceAccess / Final WorkspaceAccess page. */
export interface UiWorkspaceAccessFinalPage {
  /** @brief 当前页访问项 / Access items in the current page. */
  readonly items: readonly UiWorkspaceAccess[]
  /** @brief 不再有后续页 / No following page exists. */
  readonly hasMore: false
  /** @brief 末页没有 cursor / A final page has no cursor. */
  readonly nextCursor: null
}

/** @brief 保留 v2 hasMore/cursor 关系不变量的 WorkspaceAccess Page / WorkspaceAccess Page preserving the v2 hasMore/cursor relation invariant. */
export type UiWorkspaceAccessPage = UiWorkspaceAccessPageWithMore | UiWorkspaceAccessFinalPage
