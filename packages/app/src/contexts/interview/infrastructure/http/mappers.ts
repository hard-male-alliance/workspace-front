/** @file Interview transport DTO 到领域模型的映射 / Mapping Interview transport DTOs to domain models. */

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  UiActionPlanPriority,
  UiAvatarOutputMode,
  UiInterviewDifficulty,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewScenario,
  UiInterviewSession,
  UiInterviewSessionDetails,
  UiInterviewSessionStatus,
  UiInterviewType
} from '../../domain/models'
import type {
  InterviewReportDto,
  InterviewScenarioDto,
  InterviewSessionDto
} from './transport-types'

/** @brief 将外部字符串约束到领域枚举 / Constrain an external string to a domain enum. */
function enumValue<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  path: string
): TValue {
  if (!allowed.includes(value as TValue)) {
    throw new HttpContractError(`Backend field ${path} has an unsupported value.`, 200)
  }
  return value as TValue
}

/** @brief 已冻结的 Interview 类型 / Confirmed Interview types. */
const interviewTypes: readonly UiInterviewType[] = [
  'behavioral',
  'technical',
  'system_design',
  'coding',
  'case',
  'hr',
  'mixed'
]

/** @brief 已冻结的 Interview 难度 / Confirmed Interview difficulties. */
const interviewDifficulties: readonly UiInterviewDifficulty[] = [
  'introductory',
  'standard',
  'advanced',
  'expert'
]

/** @brief 已冻结的 Interview 会话状态 / Confirmed Interview-session statuses. */
const interviewStatuses: readonly UiInterviewSessionStatus[] = [
  'created',
  'preparing',
  'ready',
  'connecting',
  'in_progress',
  'ending',
  'processing_report',
  'completed',
  'aborted',
  'failed',
  'expired'
]

/** @brief 已冻结的数字人输出模式 / Confirmed avatar-output modes. */
const avatarModes: readonly UiAvatarOutputMode[] = ['server_video', 'client_render', 'audio_only']

/** @brief 已冻结的媒体降级模式 / Confirmed media-fallback modes. */
const fallbackTransports = ['websocket_binary', 'audio_only', 'none'] as const

/** @brief 已冻结的行动优先级 / Confirmed action-plan priorities. */
const actionPriorities: readonly UiActionPlanPriority[] = ['high', 'medium', 'low']

/** @brief 映射 Interview 场景 / Map an Interview scenario. */
export function mapInterviewScenarioDto(dto: InterviewScenarioDto): UiInterviewScenario {
  return {
    allowBargeIn: dto.allow_barge_in,
    allowFollowups: dto.allow_followups,
    difficulty: enumValue(dto.difficulty, interviewDifficulties, 'difficulty'),
    durationMinutes: dto.duration_minutes,
    focusAreas: dto.focus_areas,
    id: asUiOpaqueId<'interview-scenario'>(dto.id),
    interviewType: enumValue(dto.interview_type, interviewTypes, 'interview_type'),
    name: dto.name,
    rubric: {
      dimensions: dto.rubric.dimensions.map((dimension) => ({
        id: dimension.dimension_id,
        name: dimension.name,
        observableIndicators: dimension.observable_indicators,
        weight: dimension.weight
      })),
      id: dto.rubric.rubric_id,
      maximumScore: dto.rubric.overall_scale.maximum,
      minimumScore: dto.rubric.overall_scale.minimum,
      name: dto.rubric.name,
      version: dto.rubric.rubric_version
    },
    targetQuestionCount: dto.target_question_count
  }
}

/** @brief 映射 Interview 会话 / Map an Interview session. */
export function mapInterviewSessionDto(dto: InterviewSessionDto): UiInterviewSession {
  return {
    endedAt: dto.ended_at,
    id: asUiOpaqueId<'interview-session'>(dto.id),
    jobTarget: {
      company: dto.job_target.company,
      location: dto.job_target.location,
      seniority: dto.job_target.seniority,
      skills: dto.job_target.skills,
      title: dto.job_target.title
    },
    locale: dto.locale,
    media: {
      avatarOutputMode: enumValue(
        dto.media.avatar.output_mode,
        avatarModes,
        'media.avatar.output_mode'
      ),
      fallbackTransport: enumValue(
        dto.media.fallback_transport,
        fallbackTransports,
        'media.fallback_transport'
      ),
      userAudio: dto.media.user_audio,
      userVideo: dto.media.user_video
    },
    reportId: dto.report_id === null ? null : asUiOpaqueId<'interview-report'>(dto.report_id),
    scenarioId:
      dto.scenario_id === null ? null : asUiOpaqueId<'interview-scenario'>(dto.scenario_id),
    startedAt: dto.started_at,
    status: enumValue(dto.status, interviewStatuses, 'status'),
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id)
  }
}

/** @brief 从会话与场景资源构造 REST 会话详情 / Build REST session details from session and scenario resources. */
export function mapInterviewSessionDetails(
  sessionDto: InterviewSessionDto,
  scenarioDto: InterviewScenarioDto
): UiInterviewSessionDetails {
  if (
    sessionDto.scenario_id !== scenarioDto.id ||
    sessionDto.workspace_id !== scenarioDto.workspace_id
  ) {
    throw new HttpContractError(
      'Interview scenario does not belong to the requested session and workspace.',
      200
    )
  }
  if (sessionDto.started_at === null || sessionDto.ended_at === null) {
    throw new HttpContractError(
      'Completed Interview details require started_at and ended_at timestamps.',
      200
    )
  }
  const startedAt = Date.parse(sessionDto.started_at)
  const endedAt = Date.parse(sessionDto.ended_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    throw new HttpContractError('Interview session contains an invalid time range.', 200)
  }
  return {
    durationMinutes: Math.round((endedAt - startedAt) / 60_000),
    scenario: mapInterviewScenarioDto(scenarioDto),
    session: mapInterviewSessionDto(sessionDto)
  }
}

/** @brief 映射 Interview 报告 / Map an Interview report. */
export function mapInterviewReportDto(dto: InterviewReportDto): UiInterviewReport {
  return {
    actionPlan: dto.action_plan.map((item) => ({
      practice: item.practice,
      priority: enumValue(item.priority, actionPriorities, 'action_plan.priority'),
      successCriterion: item.success_criterion,
      title: item.title,
      why: item.why
    })),
    communicationMetrics: {
      averageAnswerLengthMs: dto.communication_metrics.average_answer_length_ms,
      fillerWordCount: dto.communication_metrics.filler_word_count,
      interruptionCount: dto.communication_metrics.interruption_count,
      longPauseCount: dto.communication_metrics.long_pause_count,
      notes: dto.communication_metrics.notes,
      speakingTimeMs: dto.communication_metrics.speaking_time_ms,
      wordsPerMinute: dto.communication_metrics.words_per_minute
    },
    createdAt: dto.created_at,
    executiveSummary: dto.executive_summary.plain_text,
    id: asUiOpaqueId<'interview-report'>(dto.id),
    improvements: dto.improvements.map((item) => item.plain_text),
    limitations: dto.limitations,
    overallConfidence: dto.overall_confidence,
    overallScore: dto.overall_score,
    reportVersion: dto.report_version,
    rubricScores: dto.rubric_scores.map((score) => ({
      confidence: score.confidence,
      dimensionId: score.dimension_id,
      evidence: score.evidence.map((evidence) => ({
        endMs: evidence.end_ms,
        quote: evidence.quote,
        segmentId: evidence.segment_id,
        startMs: evidence.start_ms
      })),
      improvementActions: score.improvement_actions,
      score: score.score,
      summary: score.summary.plain_text
    })),
    sessionId: asUiOpaqueId<'interview-session'>(dto.session_id),
    strengths: dto.strengths.map((item) => item.plain_text)
  }
}

/** @brief 从会话、场景与可选报告构造历史投影 / Build history from a session, scenario, and optional report. */
export function mapInterviewHistoryItem(
  sessionDto: InterviewSessionDto,
  scenarioDto: InterviewScenarioDto,
  reportDto: InterviewReportDto | null
): UiInterviewHistoryItem {
  if (sessionDto.status !== 'completed') {
    throw new HttpContractError('Interview history requires a completed session.', 200)
  }
  if (sessionDto.started_at === null || sessionDto.ended_at === null) {
    throw new HttpContractError(
      'Completed Interview session is missing its started_at or ended_at timestamp.',
      200
    )
  }
  if (
    sessionDto.scenario_id !== scenarioDto.id ||
    sessionDto.workspace_id !== scenarioDto.workspace_id
  ) {
    throw new HttpContractError(
      'Interview scenario does not belong to the completed session and workspace.',
      200
    )
  }
  if (reportDto === null) {
    if (sessionDto.report_id !== null) {
      throw new HttpContractError('Interview history is missing its referenced report.', 200)
    }
  } else {
    if (sessionDto.report_id !== reportDto.id) {
      throw new HttpContractError('Interview session references a different report.', 200)
    }
    if (reportDto.session_id !== sessionDto.id) {
      throw new HttpContractError('Interview report belongs to a different session.', 200)
    }
  }
  const startedAt = Date.parse(sessionDto.started_at)
  const endedAt = Date.parse(sessionDto.ended_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    throw new HttpContractError('Interview session contains an invalid time range.', 200)
  }
  return {
    completedAt: sessionDto.ended_at,
    difficulty: enumValue(scenarioDto.difficulty, interviewDifficulties, 'difficulty'),
    durationMinutes: Math.round((endedAt - startedAt) / 60_000),
    interviewType: enumValue(scenarioDto.interview_type, interviewTypes, 'interview_type'),
    jobTarget: {
      company: sessionDto.job_target.company,
      location: sessionDto.job_target.location,
      seniority: sessionDto.job_target.seniority,
      skills: sessionDto.job_target.skills,
      title: sessionDto.job_target.title
    },
    overallScore: reportDto?.overall_score ?? null,
    sessionId: asUiOpaqueId<'interview-session'>(sessionDto.id)
  }
}
