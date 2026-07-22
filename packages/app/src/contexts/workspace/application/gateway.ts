/** @file Workspace Experience 应用端口 / Workspace Experience application port. */

import type { UiWorkspace } from '../domain/models'

/** @brief 工作区页面数据端口 / Workspace page-data port. */
export interface WorkspaceGateway {
  /**
   * @brief 列出当前主体可访问的 Workspace / List Workspaces accessible to the current principal.
   * @return 可访问 Workspace 的权威投影 / Authoritative projections of accessible Workspaces.
   */
  listAccessibleWorkspaces(): Promise<readonly UiWorkspace[]>
}
