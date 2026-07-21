/** @file Workspace Experience 应用端口 / Workspace Experience application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiWorkspace, UiWorkspaceHomeModel } from '../domain/models'

/** @brief 工作区页面数据端口 / Workspace page-data port. */
export interface WorkspaceGateway {
  /**
   * @brief 列出当前用户可访问的工作区 / List workspaces accessible to the current user.
   * @return 工作区展示模型列表 / Workspace display models.
   */
  listWorkspaces(): Promise<readonly UiWorkspace[]>

  /**
   * @brief 获取工作区首页投影 / Get a workspace-home projection.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 首页展示模型 / Home-page display model.
   */
  getWorkspaceHome(workspaceId: UiWorkspaceId): Promise<UiWorkspaceHomeModel>
}
