/** @file Interview 的内存 adapter / In-memory adapter for Interview. */

import type { InterviewGateway } from '../../application/gateway'
import type {
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSetupModel,
  UiInterviewSessionId,
  UiLiveInterviewModel
} from '../../domain/models'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  type DemoGatewayOptions,
  prepareMemoryRead,
  throwMemoryNotFound
} from '../../../../infrastructure/memory'
import {
  DEMO_INTERVIEW_HISTORY,
  DEMO_INTERVIEW_REPORT,
  DEMO_INTERVIEW_RUNTIME,
  DEMO_INTERVIEW_SCENARIOS,
  DEMO_INTERVIEW_SESSION_ID,
  DEMO_INTERVIEW_WORKSPACE_ID,
  DEMO_LIVE_INTERVIEW
} from './data'

/**
 * @brief 模拟面试的本地演示适配器 / Local-demo adapter for interview practice.
 * @note 数据仅存在于当前 renderer 进程生命周期；它不持久化、不与后端同步，也不建立 RealtimeConnectionDescriptor、WebRTC、SSE 或 WebSocket realtime transport。 / Data lives only for the current renderer-process lifetime; it is not persisted or synchronized with a backend and establishes no realtime transport such as RealtimeConnectionDescriptor, WebRTC, SSE, or WebSocket.
 */
export class DemoInterviewGateway implements InterviewGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: DemoGatewayOptions
  /** @inheritdoc */
  async listCompletedInterviews(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewHistoryItem[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID) {
      return []
    }

    return cloneMemoryValue(DEMO_INTERVIEW_HISTORY)
  }

  /** @inheritdoc */
  async getInterviewSetup(workspaceId: UiWorkspaceId): Promise<UiInterviewSetupModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID) {
      return { scenarios: [], jobTargets: [] }
    }

    return cloneMemoryValue({
      scenarios: DEMO_INTERVIEW_SCENARIOS,
      jobTargets: [DEMO_INTERVIEW_RUNTIME.session.jobTarget]
    })
  }

  /** @inheritdoc */
  async createInterview(input: UiCreateInterviewInput): Promise<UiCreateInterviewResult> {
    input.signal?.throwIfAborted()
    await prepareMemoryRead(this.options)
    if (
      input.workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID ||
      input.jobTarget.title.trim().length === 0
    ) {
      return throwMemoryNotFound('interview setup')
    }

    return { sessionId: DEMO_INTERVIEW_SESSION_ID }
  }

  /**
   * @brief 构造面试演示网关 / Construct the interview demo gateway.
   * @param options 演示行为选项 / Demo behavior options.
   */
  constructor(options: DemoGatewayOptions = {}) {
    this.options = options
  }

  /**
   * @brief 列出演示面试场景 / List demo interview scenarios.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 演示面试场景 / Demo interview scenarios.
   */
  async listInterviewScenarios(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewScenario[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID) {
      return []
    }

    return cloneMemoryValue(DEMO_INTERVIEW_SCENARIOS)
  }

  /**
   * @brief 获取演示实时面试页数据 / Get demo live-interview page data.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return 演示实时面试数据 / Demo live-interview data.
   */
  async getLiveInterview(sessionId: UiInterviewSessionId): Promise<UiLiveInterviewModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || sessionId !== DEMO_INTERVIEW_SESSION_ID) {
      return throwMemoryNotFound('interview session')
    }

    return cloneMemoryValue(DEMO_LIVE_INTERVIEW)
  }

  /** @inheritdoc */
  async getInterviewRuntime(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || sessionId !== DEMO_INTERVIEW_SESSION_ID) {
      return throwMemoryNotFound('interview runtime')
    }

    return cloneMemoryValue(DEMO_INTERVIEW_RUNTIME)
  }

  /** @inheritdoc */
  async submitInterviewAnswer(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    const runtime = await this.getInterviewRuntime(sessionId)
    const submittedEntry = {
      id: 'seg_mock_candidate_submitted',
      speaker: 'candidate' as const,
      text: runtime.currentTranscript,
      isFinal: true,
      startMs: 15000,
      endMs: 22000
    }
    const closingEntry = {
      id: 'seg_mock_interviewer_close',
      speaker: 'interviewer' as const,
      text: '本次面试的问题已经覆盖完成，可以结束面试并查看分析。',
      isFinal: true,
      startMs: 23000,
      endMs: 26000
    }

    return cloneMemoryValue({
      ...runtime,
      phase: 'completion_ready' as const,
      currentTranscript: '',
      transcript: [...runtime.transcript, submittedEntry, closingEntry]
    })
  }

  /**
   * @brief 获取演示面试总结 / Get the demo interview report.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return 演示面试报告 / Demo interview report.
   */
  async getInterviewReport(sessionId: UiInterviewSessionId): Promise<UiInterviewReport> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || sessionId !== DEMO_INTERVIEW_SESSION_ID) {
      return throwMemoryNotFound('interview report')
    }

    return cloneMemoryValue(DEMO_INTERVIEW_REPORT)
  }
}
