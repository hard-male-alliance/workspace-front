/** @file WorkspaceAccess v2 的确定性内存数据 / Deterministic in-memory data for WorkspaceAccess v2. */

import {
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  type UiWorkspaceAccess
} from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Demo Workspace ID / Demo Workspace ID. */
export const DEMO_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Demo WorkspaceAccess 权威 / Demo WorkspaceAccess authority. */
export const DEMO_WORKSPACE_ACCESSES: readonly UiWorkspaceAccess[] = [
  {
    memberId: asUiOpaqueId<'workspace-member'>('member_mock_klee_owner'),
    role: 'owner',
    workspace: {
      createdAt: asUiWorkspaceTimestamp('2026-07-15T03:55:00.000Z'),
      dataRegion: 'cn',
      id: DEMO_WORKSPACE_ID,
      name: 'Klee 的职业实验室',
      plan: 'personal',
      revision: asUiWorkspaceRevision(1),
      slug: asUiWorkspaceSlug('klee-career-lab'),
      updatedAt: asUiWorkspaceTimestamp('2026-07-15T03:56:00.000Z')
    }
  }
]
