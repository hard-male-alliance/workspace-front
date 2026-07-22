/** @file Interview 的内存 adapter / In-memory adapter for Interview. */

import type { InterviewGateway } from '../../application/gateway'
import type {
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSummaryModel,
  UiInterviewSetupModel,
  UiInterviewSessionId
} from '../../domain/models'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  type InMemoryGatewayOptions,
  prepareMemoryRead,
  throwMemoryNotFound
} from '../../../../infrastructure/memory'
import {
  DEMO_INTERVIEW_HISTORY,
  DEMO_INTERVIEW_REPORT,
  DEMO_INTERVIEW_RUNTIME,
  DEMO_INTERVIEW_SCENARIOS,
  DEMO_INTERVIEW_SESSION,
  DEMO_INTERVIEW_SESSION_ID,
  DEMO_INTERVIEW_WORKSPACE_ID,
  DEMO_SYSTEM_DESIGN_SCENARIO
} from './data'

/**
 * @brief Interview 自动化测试内存适配器 / In-memory adapter for automated Interview tests.
 * @note 仅从测试入口导出，不模拟产品 realtime transport。 / Exported only from the testing entry point and does not emulate product realtime transport.
 */
export class InMemoryInterviewGateway implements InterviewGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
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
      return { scenarios: [], jobTargets: [], realtimeAvailable: true }
    }

    return cloneMemoryValue({
      scenarios: DEMO_INTERVIEW_SCENARIOS,
      jobTargets: [DEMO_INTERVIEW_RUNTIME.session.jobTarget],
      realtimeAvailable: true
    })
  }

  /** @inheritdoc */
  async createInterview(input: UiCreateInterviewInput): Promise<UiCreateInterviewResult> {
    input.signal?.throwIfAborted()
    await prepareMemoryRead(this.options)
    if (
      input.workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID ||
      !DEMO_INTERVIEW_SCENARIOS.some((scenario) => scenario.id === input.scenarioId) ||
      input.jobTarget.title.trim().length === 0
    ) {
      return throwMemoryNotFound('interview setup')
    }

    return { sessionId: DEMO_INTERVIEW_SESSION_ID }
  }

  /**
   * @brief 构造 Interview 内存测试网关 / Construct the Interview in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
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

  /** @inheritdoc */
  async getInterviewSummary(sessionId: UiInterviewSessionId): Promise<UiInterviewSummaryModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || sessionId !== DEMO_INTERVIEW_SESSION_ID) {
      return throwMemoryNotFound('interview summary')
    }
    return cloneMemoryValue({
      details: {
        durationMinutes: 38,
        scenario: DEMO_SYSTEM_DESIGN_SCENARIO,
        session: {
          ...DEMO_INTERVIEW_SESSION,
          endedAt: '2026-07-15T03:58:00.000Z',
          status: 'completed' as const
        }
      },
      report: DEMO_INTERVIEW_REPORT
    })
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

  /** @inheritdoc */
  async endInterview(sessionId: UiInterviewSessionId): Promise<void> {
    await this.getInterviewRuntime(sessionId)
  }
}
