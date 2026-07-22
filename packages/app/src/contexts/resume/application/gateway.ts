/** @file Resume Authoring 应用端口 / Resume Authoring application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'
import type {
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSettingsUpdateInput,
  UiStartResumePdfRenderInput,
  UiTemplateManifest,
  UiTemplateSettingsModel
} from '../domain/models'

/** @brief 简历与模板页面数据端口 / Resume and template page-data port. */
export interface ResumeGateway {
  /**
   * @brief 列出工作区的简历卡片 / List resume cards in a workspace.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 简历卡片列表 / Resume-card list.
   */
  listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]>

  /**
   * @brief 获取三栏编辑器数据 / Get three-pane editor data.
   * @param resumeId 简历 ID / Resume ID.
   * @return 编辑器页面展示模型 / Editor-page display model.
   */
  getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel>

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
  updateTemplateSettings(
    input: UiResumeTemplateSettingsUpdateInput
  ): Promise<UiTemplateSettingsModel>

  /**
   * @brief 按界面语言列出模板 / List templates by UI locale.
   * @param locale 资源内容语言 / Resource-content locale.
   * @return 模板展示模型列表 / Template display models.
   */
  listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]>

  /**
   * @brief 读取指定的不可变模板版本 / Read an exact immutable template version.
   * @param templateId 模板 ID / Template ID.
   * @param version 不可变模板版本 / Immutable template version.
   * @return 精确匹配 ID 与版本的模板 / Template matching the exact ID and version.
   */
  getTemplateManifest(
    templateId: UiTemplateManifest['id'],
    version: UiTemplateManifest['version']
  ): Promise<UiTemplateManifest>

  /**
   * @brief 获取模板设置页数据 / Get template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return 模板设置页展示模型 / Template-settings page display model.
   */
  getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel>
}
