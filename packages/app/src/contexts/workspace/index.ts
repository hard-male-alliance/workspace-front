/** @file Workspace 限界上下文公共入口 / Workspace bounded-context public entry. */

export type { UiWorkspaceId } from '../../shared-kernel/identity'
export type { UiWorkspaceAccessPageRequest, WorkspaceGateway } from './application/gateway'
export {
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp
} from './domain/models'
export type {
  UiWorkspace,
  UiWorkspaceAccess,
  UiWorkspaceAccessFinalPage,
  UiWorkspaceAccessPage,
  UiWorkspaceAccessPageWithMore,
  UiWorkspaceCursor,
  UiWorkspaceDataRegion,
  UiWorkspaceMemberId,
  UiWorkspacePlan,
  UiWorkspaceRevision,
  UiWorkspaceRole,
  UiWorkspaceSlug,
  UiWorkspaceTimestamp
} from './domain/models'
