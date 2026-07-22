/** @file Resume Authoring 应用端口 / Resume Authoring application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiResumeEditorModel, UiResumeId } from '../domain/document'
import type {
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiResumeTemplateSettingsUpdateInput,
  UiStartResumePdfRenderInput
} from '../domain/models'

/** @brief 简历与模板页面数据端口 / Resume and template page-data port. */
export interface ResumeGateway {
  /**
   * @brief 读取 Workspace 中的一页 ResumeSummary / Read one ResumeSummary page in a Workspace.
   * @param input 显式 Workspace、不透明 cursor、页大小与取消信号 / Explicit Workspace, opaque cursor, page size, and cancellation signal.
   * @return 保持 `hasMore` 与 `nextCursor` 封闭关系的摘要页 / Summary page preserving the closed `hasMore`/`nextCursor` relation.
   */
  listResumeSummariesPage(input: UiResumeSummaryPageRead): Promise<UiResumeSummaryPage>

  /**
   * @brief 获取三栏编辑器数据 / Get three-pane editor data.
   * @param workspaceId 授权路径所属 Workspace / Workspace owning the authorization path.
   * @param resumeId 简历 ID / Resume ID.
   * @param signal 资源身份变化或页面卸载时触发的取消信号 / Cancellation signal triggered when resource identity changes or the page unmounts.
   * @return 编辑器页面展示模型 / Editor-page display model.
   */
  getResumeEditor(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    signal: AbortSignal
  ): Promise<UiResumeEditorModel>

  /** @brief 启动 PDF preview Render Job / Start a PDF preview Render Job. */
  startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob>

  /** @brief 查询 Resume Render Job / Get a Resume Render Job. */
  getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob>

  /**
   * @brief 提交用户对单个板块的编辑 / Submit a user-authored section edit.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器投影 / Latest editor projection.
   */
  updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel>

  /** @brief 调整简历板块顺序 / Reorder resume sections. */
  reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel>

  /** @brief 删除简历板块 / Delete a resume section. */
  deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel>

  /** @brief 原子保存当前固定模板的完整语义样式意图 / Atomically save complete semantic-style intent for the currently pinned template. */
  updateTemplateSettings(input: UiResumeTemplateSettingsUpdateInput): Promise<UiResumeEditorModel>
}
