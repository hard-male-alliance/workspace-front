/** @file Interview 限界上下文的确定性内存数据 / Deterministic in-memory data for the Interview bounded context. */

import type {
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSession,
  UiLiveInterviewModel
} from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Interview fixture 所属工作区 ID / Workspace ID owned by Interview fixtures. */
export const DEMO_INTERVIEW_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Demo 面试场景 ID / Demo interview scenario ID. */
export const DEMO_INTERVIEW_SCENARIO_ID =
  asUiOpaqueId<'interview-scenario'>('scn_mock_system_design')

/** @brief Demo 面试会话 ID / Demo interview session ID. */
export const DEMO_INTERVIEW_SESSION_ID = asUiOpaqueId<'interview-session'>('int_mock_system_design')

/** @brief Demo 面试报告 ID / Demo interview report ID. */
export const DEMO_INTERVIEW_REPORT_ID = asUiOpaqueId<'interview-report'>('rpt_mock_system_design')
/** @brief Demo 系统设计面试场景 / Demo system-design interview scenario. */
export const DEMO_SYSTEM_DESIGN_SCENARIO: UiInterviewScenario = {
  id: DEMO_INTERVIEW_SCENARIO_ID,
  name: 'AI 平台系统设计',
  interviewType: 'system_design',
  difficulty: 'advanced',
  durationMinutes: 45,
  targetQuestionCount: 5,
  focusAreas: ['需求澄清', '架构取舍', '可靠性', '可观测性'],
  allowFollowups: true,
  allowBargeIn: true,
  rubric: {
    id: 'rub_mock_system_design',
    version: '2026.07',
    name: '系统设计表现量表',
    dimensions: [
      {
        id: 'rub_dim_problem_framing',
        name: '问题界定',
        weight: 0.25,
        observableIndicators: ['主动澄清负载、用户与约束', '将目标转化为可验证的需求']
      },
      {
        id: 'rub_dim_architecture',
        name: '架构取舍',
        weight: 0.35,
        observableIndicators: ['解释关键组件职责', '明确一致性、成本与延迟取舍']
      },
      {
        id: 'rub_dim_communication',
        name: '表达与协作',
        weight: 0.2,
        observableIndicators: ['回答结构清晰', '及时校准面试官理解']
      },
      {
        id: 'rub_dim_reliability',
        name: '可靠性与演进',
        weight: 0.15,
        observableIndicators: ['覆盖故障场景', '提出可观测性和渐进迁移路径']
      },
      {
        id: 'rub_dim_evidence',
        name: '案例与证据',
        weight: 0.05,
        observableIndicators: ['使用具体经历支持判断', '提供可验证的结果或指标']
      }
    ],
    minimumScore: 0,
    maximumScore: 100
  }
}

/** @brief 所有 Demo 面试场景 / All Demo interview scenarios. */
export const DEMO_INTERVIEW_SCENARIOS: readonly UiInterviewScenario[] = [
  DEMO_SYSTEM_DESIGN_SCENARIO,
  {
    id: asUiOpaqueId<'interview-scenario'>('scn_mock_behavioral'),
    name: '行为面试：影响力与协作',
    interviewType: 'behavioral',
    difficulty: 'standard',
    durationMinutes: 30,
    targetQuestionCount: 4,
    focusAreas: ['STAR 叙事', '利益相关方协作', '复盘'],
    allowFollowups: true,
    allowBargeIn: true,
    rubric: DEMO_SYSTEM_DESIGN_SCENARIO.rubric
  }
]

/** @brief Demo 面试会话 / Demo interview session. */
export const DEMO_INTERVIEW_SESSION: UiInterviewSession = {
  id: DEMO_INTERVIEW_SESSION_ID,
  workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
  scenarioId: DEMO_INTERVIEW_SCENARIO_ID,
  status: 'in_progress',
  jobTarget: {
    title: 'AI Platform Engineer',
    company: 'Northstar AI',
    location: 'Singapore',
    seniority: 'senior',
    skills: ['Python', 'LLM', 'Distributed Systems']
  },
  locale: 'zh-SG',
  media: {
    userAudio: true,
    userVideo: true,
    avatarOutputMode: 'client_render',
    fallbackTransport: 'audio_only'
  },
  startedAt: '2026-07-15T03:20:00.000Z',
  endedAt: null,
  reportId: DEMO_INTERVIEW_REPORT_ID
}

/** @brief Demo 实时面试数据 / Demo live-interview data. */
export const DEMO_LIVE_INTERVIEW: UiLiveInterviewModel = {
  session: DEMO_INTERVIEW_SESSION,
  scenario: DEMO_SYSTEM_DESIGN_SCENARIO,
  connectionState: 'connected',
  interviewerText: '请从需求澄清开始，设计一个支持多团队协作的 Agent 评估平台。',
  transcript: [
    {
      id: 'seg_mock_interviewer_1',
      speaker: 'interviewer',
      text: '请从需求澄清开始，设计一个支持多团队协作的 Agent 评估平台。',
      isFinal: true,
      startMs: 0,
      endMs: 6200
    },
    {
      id: 'seg_mock_candidate_1',
      speaker: 'candidate',
      text: '我会先确认评估对象、并发规模、数据保留与可审计要求，然后从控制面和数据面拆分。',
      isFinal: true,
      startMs: 7200,
      endMs: 14600
    },
    {
      id: 'seg_mock_candidate_partial',
      speaker: 'candidate',
      text: '对于执行数据，我倾向于使用异步任务……',
      isFinal: false,
      startMs: 15000,
      endMs: 18200
    }
  ]
}

/** @brief Demo 已完成面试历史 / Demo completed-interview history. */
export const DEMO_INTERVIEW_HISTORY: readonly UiInterviewHistoryItem[] = [
  {
    sessionId: DEMO_INTERVIEW_SESSION_ID,
    jobTarget: DEMO_INTERVIEW_SESSION.jobTarget,
    interviewType: DEMO_SYSTEM_DESIGN_SCENARIO.interviewType,
    difficulty: DEMO_SYSTEM_DESIGN_SCENARIO.difficulty,
    completedAt: '2026-07-14T14:30:00.000Z',
    durationMinutes: 38,
    overallScore: 82
  }
]

/** @brief Demo 面试初始运行状态 / Initial Demo interview runtime state. */
export const DEMO_INTERVIEW_RUNTIME: UiInterviewRuntimeModel = {
  session: DEMO_INTERVIEW_SESSION,
  scenario: DEMO_SYSTEM_DESIGN_SCENARIO,
  phase: 'listening',
  transcript: DEMO_LIVE_INTERVIEW.transcript.filter((entry) => entry.isFinal),
  currentTranscript: DEMO_LIVE_INTERVIEW.transcript.find((entry) => !entry.isFinal)?.text ?? '',
  elapsedSeconds: 18 * 60 + 42,
  estimatedDurationMinutes: 45,
  isMock: true
}

/** @brief Demo 面试总结 / Demo interview report. */
export const DEMO_INTERVIEW_REPORT: UiInterviewReport = {
  id: DEMO_INTERVIEW_REPORT_ID,
  sessionId: DEMO_INTERVIEW_SESSION_ID,
  reportVersion: '1.0.0-mock',
  overallScore: 82,
  overallConfidence: 0.78,
  executiveSummary:
    '你以需求澄清和控制面/数据面分层建立了稳健的答题骨架；下一步应更早量化容量假设，并把关键一致性取舍落到具体故障路径。',
  strengths: ['在回答开始阶段主动确认目标与约束。', '能将可观测性作为架构的一等需求。'],
  improvements: ['为关键容量假设给出数量级估算。', '用更明确的顺序说明降级、重试与幂等策略。'],
  rubricScores: [
    {
      dimensionId: 'rub_dim_problem_framing',
      score: 88,
      confidence: 0.85,
      summary: '需求澄清覆盖了用户、并发和数据保留约束。',
      evidence: [
        {
          segmentId: 'seg_mock_candidate_1',
          startMs: 7200,
          endMs: 11200,
          quote: '我会先确认评估对象、并发规模、数据保留与可审计要求。'
        }
      ],
      improvementActions: ['在澄清后立即写出 2–3 个可量化的 SLO。']
    },
    {
      dimensionId: 'rub_dim_architecture',
      score: 79,
      confidence: 0.73,
      summary: '分层方向正确，但容量、队列边界和一致性策略还可更具体。',
      evidence: [
        {
          segmentId: 'seg_mock_candidate_1',
          startMs: 11200,
          endMs: 14600,
          quote: '然后从控制面和数据面拆分。'
        }
      ],
      improvementActions: ['将异步任务、幂等键和重试边界明确画进架构图。']
    },
    {
      dimensionId: 'rub_dim_communication',
      score: 84,
      confidence: 0.76,
      summary: '表达有清晰结构，术语使用准确。',
      evidence: [],
      improvementActions: ['每完成一个模块后，用一句话确认面试官是否希望继续展开。']
    },
    {
      dimensionId: 'rub_dim_reliability',
      score: 77,
      confidence: 0.69,
      summary: '提到了可观测性，但还未完整覆盖背压和降级路径。',
      evidence: [],
      improvementActions: ['为每条关键链路列出超时、重试、降级与告警。']
    },
    {
      dimensionId: 'rub_dim_evidence',
      score: 74,
      confidence: 0.7,
      summary: '使用了具体架构动作，但缺少量化结果支撑关键取舍。',
      evidence: [
        {
          segmentId: 'seg_mock_candidate_1',
          startMs: 7200,
          endMs: 14600,
          quote: '我会先确认评估对象、并发规模、数据保留与可审计要求。'
        }
      ],
      improvementActions: ['为每个关键取舍补充一个数量级、指标或真实项目结果。']
    }
  ],
  communicationMetrics: {
    speakingTimeMs: 121000,
    averageAnswerLengthMs: 18400,
    wordsPerMinute: 168,
    fillerWordCount: 5,
    longPauseCount: 2,
    interruptionCount: 0,
    notes: ['指标仅描述已转录的面试行为，不推断人格、情绪或受保护属性。']
  },
  actionPlan: [
    {
      priority: 'high',
      title: '练习容量估算开场',
      why: '容量假设决定存储、队列和成本取舍是否可信。',
      practice: '为三个常见系统设计题各写 5 分钟容量估算，并在白板上复述。',
      successCriterion: '能在 90 秒内讲清楚 QPS、数据量和一个峰值假设。'
    },
    {
      priority: 'medium',
      title: '把故障路径讲成闭环',
      why: '可靠性回答需要可执行的检测、缓解和恢复链路。',
      practice: '为异步任务系统画出超时、幂等、死信队列和告警流。',
      successCriterion: '每个故障点都有明确 owner、监控信号与降级方式。'
    }
  ],
  limitations: [
    '该报告基于已确认的转录片段与量表，不应被视为对能力、人格或就业结果的确定性判断。',
    '部分实时回答仍处于 Mock 流式状态，相关结论置信度应保守解读。'
  ],
  createdAt: '2026-07-14T14:30:00.000Z'
}
