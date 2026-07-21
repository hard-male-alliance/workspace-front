/** @file Interview Practice 应用端口 / Interview Practice application port. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type {
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSessionId,
  UiInterviewSetupModel,
  UiLiveInterviewModel
} from '../domain/models'

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
