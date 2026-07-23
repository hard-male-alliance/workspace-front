/** @file Workspace Operations 限界上下文公共入口 / Public entrypoint for the Workspace Operations bounded context. */

export type {
  UiWorkspaceArtifactAuthority,
  UiWorkspaceArtifactContent,
  UiWorkspaceArtifactId,
  UiWorkspaceArtifactKind,
  UiWorkspaceArtifactPage,
  UiWorkspaceArtifact,
  UiWorkspaceJob,
  UiWorkspaceJobAuthority,
  UiWorkspaceJobId,
  UiWorkspaceJobPage,
  UiWorkspaceJobProgress,
  UiWorkspaceJobProgressUnit,
  UiWorkspaceOperationProblem,
  UiWorkspaceOperationProblemFieldError,
  UiWorkspaceOperationsCursor,
  UiWorkspaceOperationsPageLimit,
  UiWorkspaceResourceRef
} from './domain/models'
export {
  asUiWorkspaceOperationsCursor,
  asUiWorkspaceOperationsPageLimit,
  uiWorkspaceArtifactsEqual,
  UI_WORKSPACE_OPERATIONS_PAGE_LIMIT_MAX
} from './domain/models'
export type {
  UiWorkspaceArtifactPageRead,
  UiWorkspaceArtifactRead,
  UiWorkspaceJobCancellation,
  UiWorkspaceJobPageRead,
  UiWorkspaceJobRead,
  WorkspaceOperationsGateway
} from './application/gateway'
