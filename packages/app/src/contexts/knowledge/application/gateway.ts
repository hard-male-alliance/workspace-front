/** @file Knowledge 应用端口 / Knowledge application port. */

import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiKnowledgeVisibilityUpdateInput } from './commands'
import type { UiKnowledgeSource, UiKnowledgeVisibilityModel } from '../domain/models'

/** @brief 知识库与可见性页面数据端口 / Knowledge and visibility page-data port. */
export interface KnowledgeGateway {
  /**
   * @brief 列出工作区知识来源 / List workspace knowledge sources.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 知识来源展示模型列表 / Knowledge-source display models.
   */
  listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]>

  /**
   * @brief 获取知识可见性设置页数据 / Get knowledge-visibility settings page data.
   * @param sourceId 知识来源 ID / Knowledge source ID.
   * @return 知识可见性页面模型 / Knowledge-visibility page model.
   */
  getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel>

  /** @brief 以乐观并发控制保存知识可见性策略 / Save a knowledge-visibility policy with optimistic concurrency control. */
  updateKnowledgeVisibility(
    input: UiKnowledgeVisibilityUpdateInput
  ): Promise<UiKnowledgeVisibilityModel>
}
