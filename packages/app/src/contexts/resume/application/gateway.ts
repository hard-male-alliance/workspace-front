/** @file Resume Authoring 应用端口 / Resume Authoring application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiWorkspaceJobAuthority } from '../../workspace-operations'
import type { UiResumeEditorModel, UiResumeId } from '../domain/document'
import type {
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiResumeTemplateStyleCommand,
  UiStartResumeRenderInput
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

  /**
   * @brief 为精确 Resume revision 启动通用 Render Job / Start a generic Render Job for an exact Resume revision.
   * @param input 幂等 command、Workspace、Resume、revision、mode 与唯一 formats / Idempotent command, Workspace, Resume, revision, mode, and unique formats.
   * @return 已接受且可由 Workspace Operations 继续观察的 Job 权威 / Accepted Job authority observable through Workspace Operations.
   */
  startResumeRender(input: UiStartResumeRenderInput): Promise<UiWorkspaceJobAuthority>

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

  /**
   * @brief 原子选择模板并保存完整语义样式 / Atomically select a Template and save complete semantic style.
   * @param command 可冻结并原样确认重放的用户意图 / User-intent envelope that can be frozen and replayed verbatim for confirmation.
   * @param signal 当前调用生命周期的可选取消信号 / Optional cancellation signal for the current call lifecycle.
   * @return 新强 ETag 与完整 Resume 权威 / New strong ETag and complete Resume authority.
   */
  updateResumeTemplateAndStyle(
    command: UiResumeTemplateStyleCommand,
    signal?: AbortSignal
  ): Promise<UiResumeEditorModel>
}
