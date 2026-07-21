/** @file workspace 限界上下文公共入口 / workspace bounded-context public entry. */

export type { UiWorkspaceId } from '../../shared-kernel/identity'
export type {
  UiWorkspacePlan,
  UiWorkspaceRole,
  UiWorkspace,
  UiWorkspaceActivityKind,
  UiWorkspaceActivity,
  UiWorkspaceHomeModel
} from './domain/models'
export type { WorkspaceGateway } from './application/gateway'
export { WorkspaceHomePage } from './presentation/WorkspaceHomePage'
