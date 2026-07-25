/** @file Interview 限界上下文的 canonical v2 内存事实 / Canonical v2 in-memory facts for the Interview bounded context. */

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import {
  asUiInterviewType,
  type UiInterviewMediaPreferences,
  type UiInterviewRecordingConsent,
  type UiInterviewReport,
  type UiInterviewScenario,
  type UiInterviewSession,
  type UiInterviewTranscriptSegment
} from '../../domain/models'

/** @brief Interview fixture 的授权 Workspace / Authorization Workspace for Interview fixtures. */
export const DEMO_INTERVIEW_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief 系统设计场景身份 / System-design scenario identity. */
export const DEMO_INTERVIEW_SCENARIO_ID =
  asUiOpaqueId<'interview-scenario'>('scn_mock_system_design')

/** @brief 行为面试场景身份 / Behavioral-interview scenario identity. */
export const DEMO_BEHAVIORAL_SCENARIO_ID = asUiOpaqueId<'interview-scenario'>('scn_mock_behavioral')

/** @brief 已完成会话身份 / Completed-session identity. */
export const DEMO_INTERVIEW_SESSION_ID = asUiOpaqueId<'interview-session'>('int_mock_system_design')

/** @brief 进行中会话身份 / Active-session identity. */
export const DEMO_LIVE_INTERVIEW_SESSION_ID = asUiOpaqueId<'interview-session'>(
  'int_mock_live_behavioral'
)

/** @brief 已完成报告身份 / Completed-report identity. */
export const DEMO_INTERVIEW_REPORT_ID = asUiOpaqueId<'interview-report'>('rpt_mock_system_design')

/** @brief 系统设计 rubric 身份 / System-design rubric identity. */
const SYSTEM_DESIGN_RUBRIC_ID = asUiOpaqueId<'interview-rubric'>('rub_mock_system_design')

/** @brief 问题界定维度身份 / Problem-framing dimension identity. */
const PROBLEM_FRAMING_DIMENSION_ID =
  asUiOpaqueId<'interview-rubric-dimension'>('rub_dim_problem_framing')

/** @brief 架构取舍维度身份 / Architecture-tradeoff dimension identity. */
const ARCHITECTURE_DIMENSION_ID = asUiOpaqueId<'interview-rubric-dimension'>('rub_dim_architecture')

/** @brief Demo 会话统一媒体偏好 / Shared media preferences for Demo sessions. */
export const DEMO_INTERVIEW_MEDIA: UiInterviewMediaPreferences = {
  userAudio: true,
  userVideo: true,
  screenShare: false,
  maxVideoWidth: 1920,
  maxVideoHeight: 1080,
  maxVideoFps: 30,
  avatar: {
    outputMode: 'client_render',
    avatarId: 'avatar_interviewer_neutral',
    voiceId: 'voice_zh_sg_clear',
    preferredAudioCodecs: ['opus'],
    preferredVideoCodecs: ['VP9', 'VP8'],
    includeVisemes: true,
    includeExpressionCues: true
  },
  fallbackTransport: 'audio_only'
}

/** @brief Demo 会话的独立录制同意事实 / Independent recording-consent facts for Demo sessions. */
export const DEMO_INTERVIEW_RECORDING: UiInterviewRecordingConsent = {
  recordAudio: true,
  recordVideo: false,
  storeTranscript: true,
  retentionDays: 30,
  consentedAt: '2026-07-15T03:18:00.000Z',
  consentVersion: 'interview-recording-2026-07'
}

/** @brief 系统设计面试场景 / System-design InterviewScenario. */
export const DEMO_SYSTEM_DESIGN_SCENARIO: UiInterviewScenario = {
  id: DEMO_INTERVIEW_SCENARIO_ID,
  workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
  revision: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-12T08:00:00.000Z',
  name: 'AI 平台系统设计',
  description: '围绕多租户 Agent 评估平台讨论需求、架构、可靠性与演进。',
  locale: 'zh-SG',
  interviewType: asUiInterviewType('system_design'),
  difficulty: 'advanced',
  durationMinutes: 45,
  targetQuestionCount: 5,
  focusAreas: ['需求澄清', '架构取舍', '可靠性', '可观测性'],
  allowFollowups: true,
  allowBargeIn: true,
  status: 'active',
  rubric: {
    rubricId: SYSTEM_DESIGN_RUBRIC_ID,
    rubricVersion: '2026.07',
    name: '系统设计表现量表',
    overallScale: {
      minimum: 0,
      maximum: 100,
      labels: {
        '60': '达到基线',
        '80': '表现良好'
      }
    },
    dimensions: [
      {
        dimensionId: PROBLEM_FRAMING_DIMENSION_ID,
        name: '问题界定',
        description: '能否把模糊题目转化为明确、可验证的约束。',
        weight: 0.4,
        observableIndicators: ['主动澄清负载、用户与约束', '将目标转化为可验证需求'],
        scoringScale: { minimum: 0, maximum: 100 }
      },
      {
        dimensionId: ARCHITECTURE_DIMENSION_ID,
        name: '架构取舍',
        description: '能否解释组件边界及一致性、成本和延迟取舍。',
        weight: 0.6,
        observableIndicators: ['解释关键组件职责', '覆盖故障、恢复与演进'],
        scoringScale: { minimum: 0, maximum: 100 }
      }
    ]
  }
}

/** @brief 行为面试场景 / Behavioral InterviewScenario. */
export const DEMO_BEHAVIORAL_SCENARIO: UiInterviewScenario = {
  ...DEMO_SYSTEM_DESIGN_SCENARIO,
  id: DEMO_BEHAVIORAL_SCENARIO_ID,
  revision: 1,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  name: '行为面试：影响力与协作',
  description: '使用可验证的经历练习跨团队协作和影响力题目。',
  interviewType: asUiInterviewType('behavioral'),
  difficulty: 'intermediate',
  durationMinutes: 30,
  targetQuestionCount: 4,
  focusAreas: ['STAR 叙事', '利益相关方协作', '复盘']
}

/** @brief 稳定排序的 Demo 场景集合 / Stably ordered collection of Demo scenarios. */
export const DEMO_INTERVIEW_SCENARIOS: readonly UiInterviewScenario[] = [
  DEMO_SYSTEM_DESIGN_SCENARIO,
  DEMO_BEHAVIORAL_SCENARIO
]

/** @brief 已完成的 Demo InterviewSession / Completed Demo InterviewSession. */
export const DEMO_INTERVIEW_SESSION: UiInterviewSession = {
  id: DEMO_INTERVIEW_SESSION_ID,
  workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
  revision: 5,
  createdAt: '2026-07-15T03:18:00.000Z',
  updatedAt: '2026-07-15T03:58:00.000Z',
  scenarioId: DEMO_INTERVIEW_SCENARIO_ID,
  resumeRef: {
    resourceType: 'resume',
    id: 'res_mock_ai_platform',
    revision: 7
  },
  jobTarget: {
    title: 'AI Platform Engineer',
    company: 'Northstar AI',
    location: 'Singapore',
    description: 'Build and operate reliable multi-tenant AI platforms.',
    sourceUrl: 'https://jobs.example.com/ai-platform-engineer',
    seniority: 'senior',
    skills: ['Python', 'LLM', 'Distributed Systems']
  },
  status: 'completed',
  locale: 'zh-SG',
  media: DEMO_INTERVIEW_MEDIA,
  recording: DEMO_INTERVIEW_RECORDING,
  startedAt: '2026-07-15T03:20:00.000Z',
  endedAt: '2026-07-15T03:58:00.000Z',
  reportId: DEMO_INTERVIEW_REPORT_ID
}

/** @brief 正在进行的 Demo InterviewSession / Active Demo InterviewSession. */
export const DEMO_LIVE_INTERVIEW_SESSION: UiInterviewSession = {
  ...DEMO_INTERVIEW_SESSION,
  id: DEMO_LIVE_INTERVIEW_SESSION_ID,
  revision: 2,
  createdAt: '2026-07-20T09:00:00.000Z',
  updatedAt: '2026-07-20T09:01:00.000Z',
  scenarioId: DEMO_BEHAVIORAL_SCENARIO_ID,
  status: 'active',
  startedAt: '2026-07-20T09:01:00.000Z',
  endedAt: null,
  reportId: null
}

/** @brief 稳定排序的 Demo 会话集合 / Stably ordered collection of Demo sessions. */
export const DEMO_INTERVIEW_SESSIONS: readonly UiInterviewSession[] = [
  DEMO_LIVE_INTERVIEW_SESSION,
  DEMO_INTERVIEW_SESSION
]

/** @brief 系统状态转录片段身份 / System-status transcript-segment identity. */
const SYSTEM_SEGMENT_ID = asUiOpaqueId<'interview-transcript-segment'>('seg_mock_system_ready')

/** @brief 面试官转录片段身份 / Interviewer transcript-segment identity. */
const INTERVIEWER_SEGMENT_ID =
  asUiOpaqueId<'interview-transcript-segment'>('seg_mock_interviewer_1')

/** @brief 候选人转录片段身份 / Candidate transcript-segment identity. */
export const DEMO_CANDIDATE_SEGMENT_ID =
  asUiOpaqueId<'interview-transcript-segment'>('seg_mock_candidate_1')

/** @brief 已完成会话的权威持久转录 / Authoritative persisted transcript for the completed session. */
export const DEMO_INTERVIEW_TRANSCRIPT: readonly UiInterviewTranscriptSegment[] = [
  {
    id: SYSTEM_SEGMENT_ID,
    speaker: 'system',
    startMs: 0,
    endMs: 0,
    text: '面试会话已开始，录音和转录同意版本已记录。'
  },
  {
    id: INTERVIEWER_SEGMENT_ID,
    speaker: 'interviewer',
    startMs: 500,
    endMs: 6200,
    text: '请从需求澄清开始，设计一个支持多团队协作的 Agent 评估平台。'
  },
  {
    id: DEMO_CANDIDATE_SEGMENT_ID,
    speaker: 'candidate',
    startMs: 7200,
    endMs: 14600,
    text: '我会先确认评估对象、并发规模、数据保留与可审计要求，然后从控制面和数据面拆分。'
  }
]

/**
 * @brief Demo InterviewReport / Demo InterviewReport.
 * @note Evidence 是报告声明的引用，消费者仍需用 transcript 交叉核对后才能称为已验证 / Evidence is a report-claimed reference; consumers must cross-check the transcript before calling it verified.
 */
export const DEMO_INTERVIEW_REPORT: UiInterviewReport = {
  id: DEMO_INTERVIEW_REPORT_ID,
  workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
  revision: 1,
  createdAt: '2026-07-15T04:02:00.000Z',
  updatedAt: '2026-07-15T04:02:00.000Z',
  sessionId: DEMO_INTERVIEW_SESSION_ID,
  reportVersion: '1.0.0',
  rubricRef: {
    id: SYSTEM_DESIGN_RUBRIC_ID,
    version: '2026.07'
  },
  engineVersion: 'interview-evaluator-2026.07.1',
  overallScore: 82,
  overallConfidence: 0.78,
  executiveSummary: {
    plainText: '候选人以需求澄清和控制面/数据面分层建立了清晰骨架；仍需更早量化容量假设。'
  },
  rubricScores: [
    {
      dimensionId: PROBLEM_FRAMING_DIMENSION_ID,
      score: 88,
      confidence: 0.85,
      summary: {
        plainText: '需求澄清覆盖了用户、并发和数据保留约束。'
      },
      evidence: [
        {
          segmentId: DEMO_CANDIDATE_SEGMENT_ID,
          startMs: 7200,
          endMs: 14600,
          quote: '我会先确认评估对象、并发规模、数据保留与可审计要求。'
        }
      ],
      improvementActions: ['在澄清后立即给出可量化的 SLO。']
    },
    {
      dimensionId: ARCHITECTURE_DIMENSION_ID,
      score: 78,
      confidence: 0.72,
      summary: {
        plainText: '分层方向正确，但容量、队列边界和一致性策略仍可更具体。'
      },
      evidence: [
        {
          segmentId: DEMO_CANDIDATE_SEGMENT_ID,
          startMs: 7200,
          endMs: 14600,
          quote: '然后从控制面和数据面拆分。'
        }
      ],
      improvementActions: ['把异步任务、幂等键和重试边界明确画进架构图。']
    }
  ],
  strengths: [
    { plainText: '在回答开始阶段主动确认目标与约束。' },
    { plainText: '把可观测性视为架构的一等需求。' }
  ],
  improvements: [
    { plainText: '为关键容量假设给出数量级估算。' },
    { plainText: '用明确顺序说明降级、重试和幂等策略。' }
  ],
  communicationMetrics: {
    speakingTimeMs: 121000,
    averageAnswerLengthMs: 18400,
    wordsPerMinute: 168,
    fillerWordCount: 5,
    longPauseCount: 2,
    interruptionCount: 0,
    notes: ['指标仅描述已转录行为，不推断人格、情绪或受保护属性。']
  },
  actionPlan: [
    {
      priority: 'high',
      title: '练习容量估算开场',
      why: '容量假设决定存储、队列和成本取舍是否可信。',
      practice: '为三个系统设计题各写一份五分钟容量估算并复述。',
      successCriterion: '能在 90 秒内讲清 QPS、数据量和一个峰值假设。'
    }
  ],
  limitations: [
    '该报告基于已持久化的转录片段与固定量表，不是就业结果或人格判断。',
    '报告中的证据引用必须由消费者和该 Session 的权威 transcript 交叉核对。'
  ],
  generatedAt: '2026-07-15T04:02:00.000Z'
}
