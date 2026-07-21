/** @file Resume Authoring 应用端口 / Resume Authoring application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'
import type {
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumePdfArtifact,
  UiResumeProposal,
  UiResumeProposalDecisionInput,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
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

  /** @brief 恢复当前简历待审批 Proposal / Recover pending Proposals for a Resume. */
  listResumeProposals(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<readonly UiResumeProposal[]>

  /** @brief 根据自然语言创建待审批 Proposal / Create an approval-gated Proposal from natural language. */
  createResumeProposal(input: UiResumeAssistantMessageInput): Promise<UiResumeProposal>

  /** @brief 接受或拒绝 Proposal / Accept or reject a Proposal. */
  decideResumeProposal(input: UiResumeProposalDecisionInput): Promise<UiResumeProposal>

  /** @brief 启动 PDF preview Render Job / Start a PDF preview Render Job. */
  startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob>

  /** @brief 查询 Resume Render Job / Get a Resume Render Job. */
  getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob>

  /** @brief 恢复 Resume 的 PDF artifacts / Recover PDF artifacts for a Resume. */
  listResumePdfArtifacts(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<readonly UiResumePdfArtifact[]>

  /**
   * @brief 向简历助手发送自然语言 / Send natural language to the resume assistant.
   * @param input 助手消息领域输入 / Assistant-message domain input.
   * @return 助手消息与最新简历投影 / Assistant message and latest resume projection.
   */
  sendAssistantMessage(input: UiResumeAssistantMessageInput): Promise<UiResumeAssistantTurnResult>

  /**
   * @brief 撤销最近一次仍有效的 AI 变更 / Undo the latest still-valid AI change.
   * @param input 撤销领域输入 / Undo domain input.
   * @return 撤销后的编辑器投影 / Editor projection after undo.
   */
  undoAssistantChange(input: UiResumeAssistantUndoInput): Promise<UiResumeAssistantUndoResult>

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

  /** @brief 快速切换简历模板 / Quickly select a resume template. */
  selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel>

  /**
   * @brief 按界面语言列出模板 / List templates by UI locale.
   * @param locale 资源内容语言 / Resource-content locale.
   * @return 模板展示模型列表 / Template display models.
   */
  listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]>

  /**
   * @brief 获取模板设置页数据 / Get template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return 模板设置页展示模型 / Template-settings page display model.
   */
  getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel>
}
