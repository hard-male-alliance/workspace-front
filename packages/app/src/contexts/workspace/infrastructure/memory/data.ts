/** @file Workspace 限界上下文的确定性内存数据 / Deterministic in-memory data for the Workspace bounded context. */

import type { UiCurrentUser, UiWorkspace, UiWorkspaceAccess } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Demo 工作区 ID / Demo workspace ID. */
export const DEMO_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Demo 当前用户 / Demo current user. */
export const DEMO_CURRENT_USER: UiCurrentUser = {
  defaultWorkspaceId: DEMO_WORKSPACE_ID,
  displayName: 'Klee',
  id: asUiOpaqueId<'user'>('user_mock_klee'),
  locale: 'zh-SG',
  timezone: 'Asia/Singapore'
}

/** @brief Demo 工作区列表 / Demo workspace list. */
export const DEMO_WORKSPACES: readonly UiWorkspace[] = [
  {
    id: DEMO_WORKSPACE_ID,
    name: 'Klee 的职业实验室',
    slug: 'klee-career-lab',
    locale: 'zh-SG',
    timezone: 'Asia/Singapore',
    plan: 'pro',
    updatedAt: '2026-07-15T03:56:00.000Z'
  }
]

/** @brief Demo Workspace 访问权威 / Demo Workspace-access authority. */
export const DEMO_WORKSPACE_ACCESS: UiWorkspaceAccess = {
  currentUser: DEMO_CURRENT_USER,
  workspaces: DEMO_WORKSPACES
}
