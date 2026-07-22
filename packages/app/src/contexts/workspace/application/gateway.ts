/** @file Workspace Experience 应用端口 / Workspace Experience application port. */

import type { UiWorkspaceAccess } from '../domain/models'

/** @brief 工作区页面数据端口 / Workspace page-data port. */
export interface WorkspaceGateway {
  /**
   * @brief 加载当前用户与可访问工作区的启动权威 / Load bootstrap authority for the current user and accessible Workspaces.
   * @return 当前 Workspace 访问投影 / Current Workspace-access projection.
   */
  loadAccess(): Promise<UiWorkspaceAccess>
}
