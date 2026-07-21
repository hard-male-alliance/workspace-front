/** @file Knowledge 应用端口 / Knowledge application port. */

import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type {
  UiKnowledgeSearchInput,
  UiKnowledgeUploadInput,
  UiKnowledgeVersionUploadInput
} from './commands'
import type {
  UiKnowledgeIngestionJob,
  UiKnowledgeIngestionJobId,
  UiKnowledgeSearchResult,
  UiKnowledgeSource,
  UiKnowledgeUploadResult,
  UiKnowledgeVisibilityModel
} from '../domain/models'

/** @brief 知识库与可见性页面数据端口 / Knowledge and visibility page-data port. */
export interface KnowledgeGateway {
  /**
   * @brief 列出工作区知识来源 / List workspace knowledge sources.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 知识来源展示模型列表 / Knowledge-source display models.
   */
  listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]>

  /** @brief 上传新的文件知识来源 / Upload a new file knowledge source. */
  uploadKnowledgeSource(input: UiKnowledgeUploadInput): Promise<UiKnowledgeUploadResult>

  /** @brief 为已有文件来源上传新版本 / Upload a new version for an existing file source. */
  uploadKnowledgeSourceVersion(
    input: UiKnowledgeVersionUploadInput
  ): Promise<UiKnowledgeUploadResult>

  /** @brief 查询知识摄取任务 / Get a Knowledge ingestion Job. */
  getKnowledgeIngestionJob(
    jobId: UiKnowledgeIngestionJobId,
    signal?: AbortSignal
  ): Promise<UiKnowledgeIngestionJob>

  /** @brief 执行知识搜索 / Search indexed knowledge. */
  searchKnowledge(input: UiKnowledgeSearchInput): Promise<readonly UiKnowledgeSearchResult[]>

  /**
   * @brief 获取知识可见性设置页数据 / Get knowledge-visibility settings page data.
   * @param sourceId 知识来源 ID / Knowledge source ID.
   * @return 知识可见性页面模型 / Knowledge-visibility page model.
   */
  getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel>
}
