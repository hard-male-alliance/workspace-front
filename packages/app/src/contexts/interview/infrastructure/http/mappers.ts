/** @file Interview transport DTO 到领域模型的映射 / Mapping Interview transport DTOs to domain models. */

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  UiActionPlanPriority,
  UiAvatarOutputMode,
  UiInterviewDifficulty,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRubric,
  UiInterviewRubricDimension,
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

/** @brief 已校验量表与按不透明 ID 建立的维度索引 / Validated rubric and dimension index keyed by opaque ID. */
interface ValidatedInterviewRubric {
  /** @brief 可安全进入领域的量表 / Rubric safe to enter the domain. */
  readonly rubric: UiInterviewRubric
  /** @brief 仅用于同一契约响应内关联的维度索引 / Dimension index used only for correlation within the same contract response. */
  readonly dimensionsById: ReadonlyMap<string, UiInterviewRubricDimension>
}

/**
 * @brief 校验并映射场景内的完整量表 / Validate and map the complete rubric embedded in a scenario.
 * @param dto 已完成结构解码的场景 DTO / Structurally decoded scenario DTO.
 * @return 可消费量表及其维度索引 / Consumable rubric and its dimension index.
 */
function mapValidatedRubric(dto: InterviewScenarioDto): ValidatedInterviewRubric {
  /** @brief 总分范围 / Overall score range. */
  const overallScale = dto.rubric.overall_scale
  if (overallScale.maximum <= overallScale.minimum) {
    throw new HttpContractError('Interview rubric overall scale must have a positive range.', 200)
  }

  /** @brief 已映射且可安全归一化的量表维度 / Mapped rubric dimensions with safely normalizable scales. */
  const dimensions = dto.rubric.dimensions.map((dimension): UiInterviewRubricDimension => {
    if (dimension.scoring_scale.maximum <= dimension.scoring_scale.minimum) {
      throw new HttpContractError(
        'Interview rubric dimension scale must have a positive range.',
        200
      )
    }
    return {
      id: dimension.dimension_id,
      maximumScore: dimension.scoring_scale.maximum,
      minimumScore: dimension.scoring_scale.minimum,
      name: dimension.name,
      observableIndicators: dimension.observable_indicators,
      weight: dimension.weight
    }
  })
  /** @brief 按契约不透明 ID 建立的维度索引 / Dimension index keyed by contract-opaque IDs. */
  const dimensionsById = new Map(dimensions.map((dimension) => [dimension.id, dimension] as const))
  if (dimensionsById.size !== dimensions.length) {
    throw new HttpContractError('Interview rubric contains duplicate dimension IDs.', 200)
  }

  return {
    dimensionsById,
    rubric: {
      dimensions,
      id: dto.rubric.rubric_id,
      maximumScore: overallScale.maximum,
      minimumScore: overallScale.minimum,
      name: dto.rubric.name,
      version: dto.rubric.rubric_version
    }
  }
}

/**
 * @brief 证明报告分数属于场景固定的同一量表 / Prove that report scores belong to the scenario's pinned rubric.
 * @param report 报告 DTO / Report DTO.
 * @param scenario 场景 DTO / Scenario DTO.
 * @return 已校验量表及维度索引 / Validated rubric and dimension index.
 */
function validateReportRubric(
  report: InterviewReportDto,
  scenario: InterviewScenarioDto
): ValidatedInterviewRubric {
  const validated = mapValidatedRubric(scenario)
  if (
    report.rubric_ref.id !== validated.rubric.id ||
    report.rubric_ref.version !== validated.rubric.version
  ) {
    throw new HttpContractError('Interview report references a different rubric.', 200)
  }
  if (
    report.overall_score !== null &&
    (report.overall_score < validated.rubric.minimumScore ||
      report.overall_score > validated.rubric.maximumScore)
  ) {
    throw new HttpContractError('Interview report overall score is outside its rubric scale.', 200)
  }

  /** @brief 报告中已出现的维度 ID / Dimension IDs already observed in the report. */
  const reportedDimensionIds = new Set<string>()
  for (const score of report.rubric_scores) {
    if (reportedDimensionIds.has(score.dimension_id)) {
      throw new HttpContractError(
        'Interview report contains duplicate rubric dimension scores.',
        200
      )
    }
    reportedDimensionIds.add(score.dimension_id)
    /** @brief 当前报告分数对应的场景量表维度 / Scenario-rubric dimension for the current report score. */
    const dimension = validated.dimensionsById.get(score.dimension_id)
    if (dimension === undefined) {
      throw new HttpContractError('Interview report contains an unknown rubric dimension.', 200)
    }
    if (score.score < dimension.minimumScore || score.score > dimension.maximumScore) {
      throw new HttpContractError('Interview report score is outside its dimension scale.', 200)
    }
  }
  return validated
}

/** @brief 映射 Interview 场景 / Map an Interview scenario. */
export function mapInterviewScenarioDto(dto: InterviewScenarioDto): UiInterviewScenario {
  /** @brief 场景携带的权威量表 / Authoritative rubric embedded in the scenario. */
  const { rubric } = mapValidatedRubric(dto)
  return {
    allowBargeIn: dto.allow_barge_in,
    allowFollowups: dto.allow_followups,
    difficulty: enumValue(dto.difficulty, interviewDifficulties, 'difficulty'),
    durationMinutes: dto.duration_minutes,
    focusAreas: dto.focus_areas,
    id: asUiOpaqueId<'interview-scenario'>(dto.id),
    interviewType: enumValue(dto.interview_type, interviewTypes, 'interview_type'),
    name: dto.name,
    rubric,
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

/**
 * @brief 映射并解释 Interview 报告 / Map and interpret an Interview report.
 * @param dto 报告 DTO / Report DTO.
 * @param scenarioDto 报告所属场景 DTO / Scenario DTO owning the report.
 * @return 已按固定量表解释的报告 / Report interpreted through its pinned rubric.
 */
export function mapInterviewReportDto(
  dto: InterviewReportDto,
  scenarioDto: InterviewScenarioDto
): UiInterviewReport {
  /** @brief 与报告引用及分值一致的权威量表 / Authoritative rubric consistent with the report reference and scores. */
  const validatedRubric = validateReportRubric(dto, scenarioDto)
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
    overallMaximumScore: validatedRubric.rubric.maximumScore,
    overallMinimumScore: validatedRubric.rubric.minimumScore,
    overallScore: dto.overall_score,
    reportVersion: dto.report_version,
    rubricScores: dto.rubric_scores.map((score) => {
      /** @brief 已由 validateReportRubric 证明存在的维度 / Dimension proven to exist by validateReportRubric. */
      const dimension = validatedRubric.dimensionsById.get(score.dimension_id)
      if (dimension === undefined) {
        throw new HttpContractError('Interview report dimension mapping is unavailable.', 200)
      }
      return {
        confidence: score.confidence,
        dimensionId: score.dimension_id,
        dimensionName: dimension.name,
        evidence: score.evidence.map((evidence) => ({
          endMs: evidence.end_ms,
          quote: evidence.quote,
          segmentId: evidence.segment_id,
          startMs: evidence.start_ms
        })),
        improvementActions: score.improvement_actions,
        maximumScore: dimension.maximumScore,
        minimumScore: dimension.minimumScore,
        score: score.score,
        summary: score.summary.plain_text
      }
    }),
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
  /** @brief 历史行使用的有效总分量表 / Valid overall scale used by the history row. */
  const { rubric } = mapValidatedRubric(scenarioDto)
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
    validateReportRubric(reportDto, scenarioDto)
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
    overallMaximumScore: rubric.maximumScore,
    overallMinimumScore: rubric.minimumScore,
    overallScore: reportDto?.overall_score ?? null,
    sessionId: asUiOpaqueId<'interview-session'>(sessionDto.id)
  }
}
