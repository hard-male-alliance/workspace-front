/** @file KnowledgeSource 应用端口 / KnowledgeSource application port. */

import type {
  UiCreateManualKnowledgeNoteCommand,
  UiIngestKnowledgeFileCommand,
  UiKnowledgeSourcePageRead,
  UiKnowledgeSourceRead,
  UiSearchKnowledgeCommand,
  UiUpdateKnowledgeSourceCommand
} from './commands'
import type {
  UiKnowledgeSearchResult,
  UiKnowledgeSourceAuthority,
  UiKnowledgeSourcePage
} from '../domain/models'

/** @brief Workspace-scoped KnowledgeSource 查询与命令端口 / Workspace-scoped KnowledgeSource query and command port. */
export interface KnowledgeGateway {
  /**
   * @brief 读取一页 KnowledgeSource / Read one page of KnowledgeSources.
   * @param input Workspace、cursor、页大小与取消信号 / Workspace, cursor, page limit, and cancellation signal.
   * @return 保留服务端 cursor 关系的单页 / One page preserving the server cursor relation.
   */
  listKnowledgeSourcePage(input: UiKnowledgeSourcePageRead): Promise<UiKnowledgeSourcePage>

  /**
   * @brief 读取带强 ETag 的单个 KnowledgeSource / Read one KnowledgeSource carrying a strong ETag.
   * @param input Workspace、source identity 与取消信号 / Workspace, source identity, and cancellation signal.
   * @return 来源与同一响应的强并发令牌 / Source and strong concurrency token from the same response.
   */
  getKnowledgeSource(input: UiKnowledgeSourceRead): Promise<UiKnowledgeSourceAuthority>

  /**
   * @brief 创建手工笔记来源 / Create a manual-note source.
   * @param command 稳定幂等命令 / Stable idempotent command.
   * @return 新来源与创建响应的强 ETag / New source and strong ETag from the creation response.
   */
  createManualKnowledgeNote(
    command: UiCreateManualKnowledgeNoteCommand
  ): Promise<UiKnowledgeSourceAuthority>

  /**
   * @brief 以强 If-Match 更新名称和/或完整策略 / Update the name and/or complete policy with strong If-Match.
   * @param command Workspace-scoped conditional command / Workspace-scoped conditional command.
   * @return 更新后来源与下一强 ETag / Updated source and next strong ETag.
   */
  updateKnowledgeSource(
    command: UiUpdateKnowledgeSourceCommand
  ): Promise<UiKnowledgeSourceAuthority>

  /** @brief 上传本地文件并等待后端摄取完成 / Upload a local file and await backend ingestion. */
  ingestKnowledgeFile(command: UiIngestKnowledgeFileCommand): Promise<UiKnowledgeSourceAuthority>

  /** @brief 对明确选择的当前有效 Source 执行真实混合搜索 / Execute real hybrid search over selected active Sources. */
  searchKnowledge(command: UiSearchKnowledgeCommand): Promise<UiKnowledgeSearchResult>
}
