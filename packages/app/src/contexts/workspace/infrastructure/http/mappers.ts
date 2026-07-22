/** @file Workspace HTTP DTO 到领域投影的映射 / Mapping from Workspace HTTP DTOs to domain projections. */

import type { UiCurrentUser, UiWorkspace } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import type { CurrentUserDto, WorkspaceDto } from './transport-types'

/** @brief Workspace 套餐的当前已知值 / Currently known Workspace-plan values. */
const KNOWN_WORKSPACE_PLANS = ['free', 'pro', 'team', 'enterprise'] as const

/**
 * @brief 将开放套餐 code 映射为安全 UI 值 / Map an open plan code to a safe UI value.
 * @param plan 已验证的稳定套餐 code / Validated stable plan code.
 * @return 已知套餐或 unknown / Known plan or unknown.
 */
function mapWorkspacePlan(plan: string): UiWorkspace['plan'] {
  return KNOWN_WORKSPACE_PLANS.includes(plan as (typeof KNOWN_WORKSPACE_PLANS)[number])
    ? (plan as (typeof KNOWN_WORKSPACE_PLANS)[number])
    : 'unknown'
}

/**
 * @brief 映射当前用户资源 / Map the current-user resource.
 * @param currentUser 当前用户 DTO / Current-user DTO.
 * @return 当前用户领域投影 / Current-user domain projection.
 */
export function mapCurrentUserDto(currentUser: CurrentUserDto): UiCurrentUser {
  return {
    defaultWorkspaceId:
      currentUser.default_workspace_id === null
        ? null
        : asUiOpaqueId<'workspace'>(currentUser.default_workspace_id),
    displayName: currentUser.display_name,
    id: asUiOpaqueId<'user'>(currentUser.id),
    locale: currentUser.locale,
    timezone: currentUser.timezone
  }
}

/**
 * @brief 映射 Workspace 资源 / Map a Workspace resource.
 * @param workspace Workspace DTO / Workspace DTO.
 * @return UI Workspace 投影 / UI Workspace projection.
 */
export function mapWorkspaceDto(workspace: WorkspaceDto): UiWorkspace {
  return {
    id: asUiOpaqueId<'workspace'>(workspace.id),
    locale: workspace.default_locale,
    name: workspace.name,
    plan: mapWorkspacePlan(workspace.plan),
    slug: workspace.slug,
    timezone: workspace.timezone,
    updatedAt: workspace.updated_at
  }
}
