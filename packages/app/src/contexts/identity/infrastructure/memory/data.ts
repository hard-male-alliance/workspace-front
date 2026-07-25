/** @file Identity v2 的确定性内存数据 / Deterministic in-memory data for Identity v2. */

import {
  asUiEmailAddress,
  asUiOAuthScope,
  asUiPrincipalSubject,
  asUiUserLocale,
  type UiCurrentUser
} from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Demo 当前用户 / Demo current user. */
export const DEMO_CURRENT_USER: UiCurrentUser = {
  defaultWorkspaceId: asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab'),
  displayName: 'Klee',
  email: asUiEmailAddress('klee@example.com'),
  emailVerified: true,
  id: asUiOpaqueId<'user'>('user_mock_klee'),
  locale: asUiUserLocale('zh-SG'),
  scopes: new Set([
    asUiOAuthScope('workspace.read'),
    asUiOAuthScope('resume.read'),
    asUiOAuthScope('resume.write')
  ]),
  subject: asUiPrincipalSubject('oidc-subject-klee')
}
