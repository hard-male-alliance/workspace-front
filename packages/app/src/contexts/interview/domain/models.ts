/** @file Interview Practice 领域投影 / Interview Practice domain projections. */

import type {
  UiKnowledgeSourceId,
  UiOpaqueId,
  UiWorkspaceId
} from '../../../shared-kernel/identity'
import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief 面试场景标识符 / Interview scenario identifier. */
export type UiInterviewScenarioId = UiOpaqueId<'interview-scenario'>

/** @brief 面试会话标识符 / Interview session identifier. */
export type UiInterviewSessionId = UiOpaqueId<'interview-session'>

/** @brief 面试报告标识符 / Interview report identifier. */
export type UiInterviewReportId = UiOpaqueId<'interview-report'>

/** @brief 面试类型 / Interview type. */
export type UiInterviewType =
  'behavioral' | 'technical' | 'system_design' | 'coding' | 'case' | 'hr' | 'mixed'

/** @brief 面试难度 / Interview difficulty. */
export type UiInterviewDifficulty = 'introductory' | 'standard' | 'advanced' | 'expert'

/** @brief 数字人输出模式 / Avatar output mode. */
export type UiAvatarOutputMode = 'server_video' | 'client_render' | 'audio_only'

/** @brief 面试会话状态 / Interview session status. */
export type UiInterviewSessionStatus =
  | 'created'
  | 'preparing'
  | 'ready'
  | 'connecting'
  | 'in_progress'
  | 'ending'
  | 'processing_report'
  | 'completed'
  | 'aborted'
  | 'failed'
  | 'expired'

/** @brief 面试评分维度 / Interview rubric dimension. */
export interface UiInterviewRubricDimension {
  /** @brief 维度 ID / Dimension ID. */
  readonly id: string
  /** @brief 维度名称 / Dimension name. */
  readonly name: string
  /** @brief 权重 / Weight. */
  readonly weight: number
  /** @brief 可观察指标 / Observable indicators. */
  readonly observableIndicators: readonly string[]
}

/** @brief 面试评分量表 / Interview evaluation rubric. */
export interface UiInterviewRubric {
  /** @brief 量表 ID / Rubric ID. */
  readonly id: string
  /** @brief 不可变版本 / Immutable version. */
  readonly version: string
  /** @brief 名称 / Name. */
  readonly name: string
  /** @brief 评分维度 / Dimensions. */
  readonly dimensions: readonly UiInterviewRubricDimension[]
  /** @brief 最低总分 / Overall minimum score. */
  readonly minimumScore: number
  /** @brief 最高总分 / Overall maximum score. */
  readonly maximumScore: number
}

/** @brief 面试场景展示模型 / Interview-scenario display model. */
export interface UiInterviewScenario {
  /** @brief 场景 ID / Scenario ID. */
  readonly id: UiInterviewScenarioId
  /** @brief 名称 / Name. */
  readonly name: string
  /** @brief 面试类型 / Interview type. */
  readonly interviewType: UiInterviewType
  /** @brief 难度 / Difficulty. */
  readonly difficulty: UiInterviewDifficulty
  /** @brief 时长（分钟）/ Duration in minutes. */
  readonly durationMinutes: number
  /** @brief 目标问题数 / Target question count. */
  readonly targetQuestionCount: number
  /** @brief 关注领域 / Focus areas. */
  readonly focusAreas: readonly string[]
  /** @brief 是否允许追问 / Whether follow-ups are allowed. */
  readonly allowFollowups: boolean
  /** @brief 是否允许打断 / Whether barge-in is allowed. */
  readonly allowBargeIn: boolean
  /** @brief 评估量表 / Evaluation rubric. */
  readonly rubric: UiInterviewRubric
}

/** @brief 职位目标展示模型 / Job-target display model. */
export interface UiJobTarget {
  /** @brief 职位名称 / Job title. */
  readonly title: string
  /** @brief 公司名称 / Company name. */
  readonly company: string | null
  /** @brief 工作地点 / Location. */
  readonly location: string | null
  /** @brief 级别 / Seniority. */
  readonly seniority: string | null
  /** @brief 目标技能 / Target skills. */
  readonly skills: readonly string[]
}

/** @brief 面试媒体偏好展示模型 / Interview-media preference display model. */
export interface UiInterviewMediaPreferences {
  /** @brief 是否采集用户音频 / Whether user audio is captured. */
  readonly userAudio: boolean
  /** @brief 是否采集用户视频 / Whether user video is captured. */
  readonly userVideo: boolean
  /** @brief 数字人输出模式 / Avatar output mode. */
  readonly avatarOutputMode: UiAvatarOutputMode
  /** @brief 媒体传输降级模式 / Fallback transport mode. */
  readonly fallbackTransport: 'websocket_binary' | 'audio_only' | 'none'
}

/** @brief 面试会话展示模型 / Interview-session display model. */
export interface UiInterviewSession {
  /** @brief 会话 ID / Session ID. */
  readonly id: UiInterviewSessionId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 面试场景 ID / Interview scenario ID. */
  readonly scenarioId: UiInterviewScenarioId | null
  /** @brief 会话状态 / Session status. */
  readonly status: UiInterviewSessionStatus
  /** @brief 目标职位 / Job target. */
  readonly jobTarget: UiJobTarget
  /** @brief 面试内容语言 / Interview-content locale. */
  readonly locale: UiContentLocale
  /** @brief 媒体偏好 / Media preferences. */
  readonly media: UiInterviewMediaPreferences
  /** @brief 开始时间 / Start time. */
  readonly startedAt: string | null
  /** @brief 结束时间 / End time. */
  readonly endedAt: string | null
  /** @brief 报告 ID / Report ID. */
  readonly reportId: UiInterviewReportId | null
}

/** @brief 转录说话人 / Transcript speaker. */
export type UiTranscriptSpeaker = 'candidate' | 'interviewer'

/** @brief 实时转录展示模型 / Realtime-transcript display model. */
export interface UiTranscriptEntry {
  /** @brief 转录片段 ID / Transcript-segment ID. */
  readonly id: string
  /** @brief 说话人 / Speaker. */
  readonly speaker: UiTranscriptSpeaker
  /** @brief 文本 / Text. */
  readonly text: string
  /** @brief 是否是最终转录 / Whether final. */
  readonly isFinal: boolean
  /** @brief 起始毫秒 / Start time in milliseconds. */
  readonly startMs: number
  /** @brief 结束毫秒 / End time in milliseconds. */
  readonly endMs: number
}

/** @brief 已完成面试的历史列表投影 / Completed-interview history projection. */
export interface UiInterviewHistoryItem {
  /** @brief 面试会话 / Interview session. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 目标岗位 / Target job. */
  readonly jobTarget: UiJobTarget
  /** @brief 面试类型 / Interview type. */
  readonly interviewType: UiInterviewType
  /** @brief 面试难度 / Interview difficulty. */
  readonly difficulty: UiInterviewDifficulty
  /** @brief 完成时间 / Completion time. */
  readonly completedAt: string
  /** @brief 实际时长（分钟）/ Actual duration in minutes. */
  readonly durationMinutes: number
  /** @brief 总评分；未形成权威分数时为空 / Overall score, or null without an authoritative score. */
  readonly overallScore: number | null
}

/** @brief 新面试配置页投影 / New-interview setup projection. */
export interface UiInterviewSetupModel {
  /** @brief 可用场景 / Available scenarios. */
  readonly scenarios: readonly UiInterviewScenario[]
  /** @brief 已保存岗位目标 / Saved job targets. */
  readonly jobTargets: readonly UiJobTarget[]
  /** @brief 当前宿主是否已实现可用 realtime 传输 / Whether this host implements a usable realtime transport. */
  readonly realtimeAvailable: boolean
}

/** @brief 可由正式 REST 资源还原的面试会话详情 / Interview-session details reconstructable from formal REST resources. */
export interface UiInterviewSessionDetails {
  /** @brief 权威会话资源 / Authoritative session resource. */
  readonly session: UiInterviewSession
  /** @brief 权威场景资源 / Authoritative scenario resource. */
  readonly scenario: UiInterviewScenario
  /** @brief 由会话起止时间计算的实际分钟数 / Actual minutes derived from session timestamps. */
  readonly durationMinutes: number
}

/** @brief 创建面试的领域输入 / Domain input for creating an interview. */
export interface UiCreateInterviewInput {
  /** @brief 本次创建意图的稳定命令身份 / Stable command identity for this creation intent. */
  readonly commandId: UiCommandId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 用户从真实场景目录选择的场景 ID / Scenario ID selected from the real scenario catalog. */
  readonly scenarioId: UiInterviewScenarioId
  /** @brief 本次目标岗位 / Job target for this session. */
  readonly jobTarget: UiJobTarget
  /** @brief 明确选入本会话的知识来源 / Knowledge sources explicitly selected for this session. */
  readonly knowledgeSourceIds: readonly UiKnowledgeSourceId[]
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 创建面试的领域结果 / Domain result for creating an interview. */
export interface UiCreateInterviewResult {
  readonly sessionId: UiInterviewSessionId
}

/** @brief 正式面试页面阶段 / Live interview page phase. */
export type UiInterviewRuntimePhase =
  | 'interviewer_streaming'
  | 'listening'
  | 'submitting_answer'
  | 'thinking'
  | 'completion_ready'
  | 'connection_failed'

/** @brief 正式面试运行投影 / Live interview runtime projection. */
export interface UiInterviewRuntimeModel {
  readonly session: UiInterviewSession
  readonly scenario: UiInterviewScenario
  readonly phase: UiInterviewRuntimePhase
  readonly transcript: readonly UiTranscriptEntry[]
  readonly currentTranscript: string
  readonly elapsedSeconds: number
  readonly estimatedDurationMinutes: number
}

/** @brief 面试证据引用 / Interview evidence reference. */
export interface UiInterviewEvidence {
  /** @brief 转录片段 ID / Transcript-segment ID. */
  readonly segmentId: string
  /** @brief 起始毫秒 / Start time in milliseconds. */
  readonly startMs: number
  /** @brief 结束毫秒 / End time in milliseconds. */
  readonly endMs: number
  /** @brief 可选引文 / Optional quote. */
  readonly quote: string | null
}

/** @brief 面试评分结果 / Interview rubric-score result. */
export interface UiInterviewRubricScore {
  /** @brief 维度 ID / Dimension ID. */
  readonly dimensionId: string
  /** @brief 得分 / Score. */
  readonly score: number
  /** @brief 置信度 / Confidence. */
  readonly confidence: number
  /** @brief 摘要 / Summary. */
  readonly summary: string
  /** @brief 证据 / Evidence. */
  readonly evidence: readonly UiInterviewEvidence[]
  /** @brief 改进行动 / Improvement actions. */
  readonly improvementActions: readonly string[]
}

/** @brief 面试行动计划优先级 / Interview action-plan priority. */
export type UiActionPlanPriority = 'high' | 'medium' | 'low'

/** @brief 面试行动计划项 / Interview action-plan item. */
export interface UiInterviewActionPlanItem {
  /** @brief 优先级 / Priority. */
  readonly priority: UiActionPlanPriority
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 原因 / Why it matters. */
  readonly why: string
  /** @brief 练习方法 / Practice method. */
  readonly practice: string
  /** @brief 成功标准 / Success criterion. */
  readonly successCriterion: string
}

/** @brief 可观察沟通指标 / Observable communication metrics. */
export interface UiCommunicationMetrics {
  /** @brief 发言时长（毫秒）/ Speaking time in milliseconds. */
  readonly speakingTimeMs: number | null
  /** @brief 平均回答时长（毫秒）/ Average answer length in milliseconds. */
  readonly averageAnswerLengthMs: number | null
  /** @brief 每分钟词数 / Words per minute. */
  readonly wordsPerMinute: number | null
  /** @brief 填充词计数 / Filler-word count. */
  readonly fillerWordCount: number | null
  /** @brief 长停顿次数 / Long-pause count. */
  readonly longPauseCount: number | null
  /** @brief 打断次数 / Interruption count. */
  readonly interruptionCount: number | null
  /** @brief 仅基于可观察行为的备注 / Notes based only on observable behavior. */
  readonly notes: readonly string[]
}

/**
 * @brief 面试总结展示模型 / Interview-summary display model.
 * @note 严格限制为量表、转录证据与可观察沟通行为；不含受保护属性或人格推断。
 */
export interface UiInterviewReport {
  /** @brief 报告 ID / Report ID. */
  readonly id: UiInterviewReportId
  /** @brief 会话 ID / Session ID. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 报告版本 / Report version. */
  readonly reportVersion: string
  /** @brief 总分 / Overall score. */
  readonly overallScore: number | null
  /** @brief 总体置信度 / Overall confidence. */
  readonly overallConfidence: number
  /** @brief 执行摘要 / Executive summary. */
  readonly executiveSummary: string
  /** @brief 优势 / Strengths. */
  readonly strengths: readonly string[]
  /** @brief 改进方向 / Improvements. */
  readonly improvements: readonly string[]
  /** @brief 量表结果 / Rubric scores. */
  readonly rubricScores: readonly UiInterviewRubricScore[]
  /** @brief 可观察沟通指标 / Observable communication metrics. */
  readonly communicationMetrics: UiCommunicationMetrics
  /** @brief 行动计划 / Action plan. */
  readonly actionPlan: readonly UiInterviewActionPlanItem[]
  /** @brief 局限与低置信度声明 / Limitations and low-confidence statements. */
  readonly limitations: readonly string[]
  /** @brief 报告生成时间 / Report creation time. */
  readonly createdAt: string
}
