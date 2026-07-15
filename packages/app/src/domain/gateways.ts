/**
 * @file 页面数据端口 / Page-data ports.
 * @remarks
 * 这些端口是前端内部的 dependency inversion boundary，不是 REST/HTTP DTO 或正式 API 定义。
 */

import type {
  AppLocale,
  UiInterviewReport,
  UiInterviewScenario,
  UiInterviewSessionId,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiLiveInterviewModel,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiTemplateManifest,
  UiTemplateSettingsModel,
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

  /**
   * @brief 按界面语言列出模板 / List templates by UI locale.
   * @param locale 界面语言 / UI locale.
   * @return 模板展示模型列表 / Template display models.
   */
  listTemplateManifests(locale: AppLocale): Promise<readonly UiTemplateManifest[]>

  /**
   * @brief 获取模板设置页数据 / Get template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return 模板设置页展示模型 / Template-settings page display model.
   */
  getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel>
}

/** @brief 模拟面试页面数据端口 / Mock-interview page-data port. */
export interface InterviewGateway {
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
