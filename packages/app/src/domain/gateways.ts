/**
 * @file 页面数据端口 / Page-data ports.
 * @remarks
 * 这些端口是前端内部的 dependency inversion boundary，不是 REST/HTTP DTO 或正式 API 定义。
 */

import type {
  UiContentLocale,
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSetupModel,
  UiInterviewSessionId,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiLiveInterviewModel,
  UiResumeCard,
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeProposal,
  UiResumeProposalDecisionInput,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiStartResumePdfRenderInput,
  UiWorkspace,
  UiWorkspaceHomeModel,
  UiWorkspaceId
} from './models'

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

/** @brief 模拟面试页面数据端口 / Mock-interview page-data port. */
export interface InterviewGateway {
  /** @brief 列出已完成且报告可用的面试 / List completed interviews with available reports. */
  listCompletedInterviews(workspaceId: UiWorkspaceId): Promise<readonly UiInterviewHistoryItem[]>

  /** @brief 获取新面试配置页数据 / Get new-interview setup data. */
  getInterviewSetup(workspaceId: UiWorkspaceId): Promise<UiInterviewSetupModel>

  /** @brief 创建一次面试练习 / Create an interview practice session. */
  createInterview(input: UiCreateInterviewInput): Promise<UiCreateInterviewResult>

  /**
   * @brief 列出可用的面试场景 / List available interview scenarios.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 面试场景列表 / Interview-scenario list.
   */
  listInterviewScenarios(workspaceId: UiWorkspaceId): Promise<readonly UiInterviewScenario[]>

  /**
   * @brief 获取实时面试展示数据 / Get live-interview display data.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return 实时面试页面模型 / Live-interview page model.
   */
  getLiveInterview(sessionId: UiInterviewSessionId): Promise<UiLiveInterviewModel>

  /** @brief 获取正式面试运行状态 / Get the live interview runtime state. */
  getInterviewRuntime(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel>

  /** @brief 结束当前录音并提交回答 / Finish and submit the current spoken answer. */
  submitInterviewAnswer(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel>

  /**
   * @brief 获取面试总结 / Get an interview summary.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return 面试报告展示模型 / Interview-report display model.
   */
  getInterviewReport(sessionId: UiInterviewSessionId): Promise<UiInterviewReport>
}

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
}
