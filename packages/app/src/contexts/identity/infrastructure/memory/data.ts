/** @file Identity 限界上下文的确定性内存数据 / Deterministic in-memory data for the Identity bounded context. */

import type { UiCurrentUser } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Demo 当前用户 / Demo current user. */
export const DEMO_CURRENT_USER: UiCurrentUser = {
  defaultWorkspaceId: asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab'),
  displayName: 'Klee',
  id: asUiOpaqueId<'user'>('user_mock_klee'),
  locale: 'zh-SG',
  timezone: 'Asia/Singapore'
}
