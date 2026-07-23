/** @file InterviewReport API v2 wire 模型与严格 codec / InterviewReport API v2 wire models and strict codecs. */

import {
  arrayBetween,
  boundedInteger,
  boundedNumber,
  boundedString,
  closedStringEnum,
  exactRecord,
  opaqueId,
  parseResourceFields,
  timestamp,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  assertUniqueBy,
  parseNullableNonNegativeInteger,
  parseNullableNonNegativeNumber,
  parseNullableString,
  parseStringArray,
  parseVersionedReference,
  type VersionedReference
} from './wire'

/** @brief 改进计划优先级 / Improvement-plan priority. */
export type InterviewActionPlanPriority = 'high' | 'low' | 'medium'

/** @brief 只公开 plain text 的 Interview rich text / Interview rich text exposing plain text only. */
export interface InterviewRichText {
  /** @brief 用户可见纯文本 / User-visible plain text. */
  readonly plain_text: string
}

/** @brief Report 评分引用的一段 transcript 证据 / Transcript evidence referenced by a report score. */
export interface InterviewEvidence {
  /** @brief Transcript segment identity / Transcript segment identity. */
  readonly segment_id: string
  /** @brief 引用开始偏移毫秒数 / Evidence start offset in milliseconds. */
  readonly start_ms: number
  /** @brief 引用结束偏移毫秒数 / Evidence end offset in milliseconds. */
  readonly end_ms: number
  /** @brief 可选引用文本 / Optional quoted text. */
  readonly quote: string | null
}

/** @brief 一个 rubric 维度的评分结果 / Score result for one rubric dimension. */
export interface InterviewRubricScore {
  /** @brief 对应 rubric dimension identity / Corresponding rubric-dimension identity. */
  readonly dimension_id: string
  /** @brief 0–100 分数 / Score from 0 to 100. */
  readonly score: number
  /** @brief 0–1 置信度 / Confidence from 0 to 1. */
  readonly confidence: number
  /** @brief 评分摘要 / Score summary. */
  readonly summary: InterviewRichText
  /** @brief 支撑证据 / Supporting evidence. */
  readonly evidence: readonly InterviewEvidence[]
  /** @brief 可执行改进行动 / Actionable improvements. */
  readonly improvement_actions: readonly string[]
}

/** @brief Interview 沟通指标 / Interview communication metrics. */
export interface InterviewCommunicationMetrics {
  /** @brief 总发言时间 / Total speaking time. */
  readonly speaking_time_ms: number | null
  /** @brief 平均回答长度 / Average answer length. */
  readonly average_answer_length_ms: number | null
  /** @brief 每分钟词数 / Words per minute. */
  readonly words_per_minute: number | null
  /** @brief 填充词数量 / Filler-word count. */
  readonly filler_word_count: number | null
  /** @brief 长停顿数量 / Long-pause count. */
  readonly long_pause_count: number | null
  /** @brief 打断数量 / Interruption count. */
  readonly interruption_count: number | null
  /** @brief 指标解释 / Metric notes. */
  readonly notes: readonly string[]
}

/** @brief 一项 Interview 改进计划 / One Interview improvement-plan item. */
export interface InterviewActionPlanItem {
  /** @brief 优先级 / Priority. */
  readonly priority: InterviewActionPlanPriority
  /** @brief 行动标题 / Action title. */
  readonly title: string
  /** @brief 为什么重要 / Why it matters. */
  readonly why: string
  /** @brief 练习方法 / Practice method. */
  readonly practice: string
  /** @brief 成功标准 / Success criterion. */
  readonly success_criterion: string
}

/** @brief 创建 InterviewReport Job 的请求 / Request to create an InterviewReport Job. */
export interface CreateInterviewReportJobRequest {
  /** @brief 可选固定 rubric 版本 / Optional pinned rubric version. */
  readonly rubric_version?: string
}

/** @brief API v2 InterviewReport 权威表示 / Authoritative API v2 InterviewReport representation. */
export interface InterviewReport extends ResourceFields {
  /** @brief 所属 Workspace identity / Owning Workspace identity. */
  readonly workspace_id: string
  /** @brief 对应 Session identity / Corresponding Session identity. */
  readonly session_id: string
  /** @brief 报告格式版本 / Report-format version. */
  readonly report_version: string
  /** @brief 冻结 rubric 引用 / Frozen rubric reference. */
  readonly rubric_ref: VersionedReference
  /** @brief 生成引擎版本 / Generation-engine version. */
  readonly engine_version: string
  /** @brief 总分；无法评分时为 null / Overall score, or null when not scoreable. */
  readonly overall_score: number | null
  /** @brief 总体置信度 / Overall confidence. */
  readonly overall_confidence: number
  /** @brief 执行摘要 / Executive summary. */
  readonly executive_summary: InterviewRichText
  /** @brief 各维度评分 / Scores by rubric dimension. */
  readonly rubric_scores: readonly InterviewRubricScore[]
  /** @brief 优势 / Strengths. */
  readonly strengths: readonly InterviewRichText[]
  /** @brief 改进点 / Improvement areas. */
  readonly improvements: readonly InterviewRichText[]
  /** @brief 沟通指标 / Communication metrics. */
  readonly communication_metrics: InterviewCommunicationMetrics
  /** @brief 行动计划 / Action plan. */
  readonly action_plan: readonly InterviewActionPlanItem[]
  /** @brief 分析局限 / Analysis limitations. */
  readonly limitations: readonly string[]
  /** @brief 生成时间 / Generation time. */
  readonly generated_at: string
}

/**
 * @brief 严格解码 InterviewRichText / Strictly decode InterviewRichText.
 * @param value 未知 rich text / Unknown rich text.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 rich text / Validated rich text.
 */
export function parseInterviewRichText(value: unknown, path: string): InterviewRichText {
  /** @brief 精确 rich text / Exact rich text. */
  const input = exactRecord(value, path, ['plain_text'])
  return {
    plain_text: boundedString(input.plain_text, `${path}.plain_text`, 0, 10_000)
  }
}

/**
 * @brief 严格解码 InterviewEvidence 并校验时间区间 / Strictly decode InterviewEvidence and validate its time interval.
 * @param value 未知证据 / Unknown evidence.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证证据 / Validated evidence.
 */
export function parseInterviewEvidence(value: unknown, path: string): InterviewEvidence {
  /** @brief 精确证据对象 / Exact evidence object. */
  const input = exactRecord(value, path, ['segment_id', 'start_ms', 'end_ms', 'quote'])
  /** @brief 开始偏移 / Start offset. */
  const startMs = boundedInteger(input.start_ms, `${path}.start_ms`, 0, Number.MAX_SAFE_INTEGER)
  /** @brief 结束偏移 / End offset. */
  const endMs = boundedInteger(input.end_ms, `${path}.end_ms`, 0, Number.MAX_SAFE_INTEGER)
  if (startMs > endMs) {
    throw new ApiV2ContractError(`API v2 field ${path}.start_ms cannot exceed ${path}.end_ms.`)
  }
  return {
    end_ms: endMs,
    quote: parseNullableString(input.quote, `${path}.quote`, 0, 4000),
    segment_id: opaqueId(input.segment_id, `${path}.segment_id`),
    start_ms: startMs
  }
}

/**
 * @brief 严格解码 RubricScore / Strictly decode a RubricScore.
 * @param value 未知评分 / Unknown score.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证评分 / Validated score.
 */
function parseInterviewRubricScore(value: unknown, path: string): InterviewRubricScore {
  /** @brief 精确评分对象 / Exact score object. */
  const input = exactRecord(value, path, [
    'dimension_id',
    'score',
    'confidence',
    'summary',
    'evidence',
    'improvement_actions'
  ])
  return {
    confidence: boundedNumber(input.confidence, `${path}.confidence`, 0, 1),
    dimension_id: opaqueId(input.dimension_id, `${path}.dimension_id`),
    evidence: arrayBetween(input.evidence, `${path}.evidence`, 0, 50).map((item, index) =>
      parseInterviewEvidence(item, `${path}.evidence[${index}]`)
    ),
    improvement_actions: parseStringArray(
      input.improvement_actions,
      `${path}.improvement_actions`,
      0,
      50,
      0,
      1000,
      false
    ),
    score: boundedNumber(input.score, `${path}.score`, 0, 100),
    summary: parseInterviewRichText(input.summary, `${path}.summary`)
  }
}

/**
 * @brief 严格解码 InterviewCommunicationMetrics / Strictly decode InterviewCommunicationMetrics.
 * @param value 未知指标 / Unknown metrics.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证指标 / Validated metrics.
 */
function parseInterviewCommunicationMetrics(
  value: unknown,
  path: string
): InterviewCommunicationMetrics {
  /** @brief 精确指标对象 / Exact metrics object. */
  const input = exactRecord(value, path, [
    'speaking_time_ms',
    'average_answer_length_ms',
    'words_per_minute',
    'filler_word_count',
    'long_pause_count',
    'interruption_count',
    'notes'
  ])
  return {
    average_answer_length_ms: parseNullableNonNegativeInteger(
      input.average_answer_length_ms,
      `${path}.average_answer_length_ms`
    ),
    filler_word_count: parseNullableNonNegativeInteger(
      input.filler_word_count,
      `${path}.filler_word_count`
    ),
    interruption_count: parseNullableNonNegativeInteger(
      input.interruption_count,
      `${path}.interruption_count`
    ),
    long_pause_count: parseNullableNonNegativeInteger(
      input.long_pause_count,
      `${path}.long_pause_count`
    ),
    notes: parseStringArray(input.notes, `${path}.notes`, 0, 50, 0, 1000, false),
    speaking_time_ms: parseNullableNonNegativeInteger(
      input.speaking_time_ms,
      `${path}.speaking_time_ms`
    ),
    words_per_minute: parseNullableNonNegativeNumber(
      input.words_per_minute,
      `${path}.words_per_minute`
    )
  }
}

/**
 * @brief 严格解码 InterviewActionPlanItem / Strictly decode an InterviewActionPlanItem.
 * @param value 未知行动项 / Unknown action item.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证行动项 / Validated action item.
 */
function parseInterviewActionPlanItem(value: unknown, path: string): InterviewActionPlanItem {
  /** @brief 精确行动项 / Exact action item. */
  const input = exactRecord(value, path, [
    'priority',
    'title',
    'why',
    'practice',
    'success_criterion'
  ])
  return {
    practice: boundedString(input.practice, `${path}.practice`, 0, 4000),
    priority: closedStringEnum(input.priority, `${path}.priority`, ['high', 'medium', 'low']),
    success_criterion: boundedString(input.success_criterion, `${path}.success_criterion`, 0, 2000),
    title: boundedString(input.title, `${path}.title`, 1, 300),
    why: boundedString(input.why, `${path}.why`, 0, 2000)
  }
}

/**
 * @brief 严格编码 CreateInterviewReportJobRequest / Strictly encode a CreateInterviewReportJobRequest.
 * @param value 未验证请求 / Unvalidated request.
 * @return 保留 rubric_version 省略语义的 canonical 请求 / Canonical request preserving rubric_version omission.
 */
export function encodeCreateInterviewReportJobRequest(
  value: CreateInterviewReportJobRequest
): CreateInterviewReportJobRequest {
  /** @brief 精确请求 / Exact request. */
  const input = exactRecord(value, 'create_interview_report_job', ['rubric_version'])
  return Object.hasOwn(input, 'rubric_version')
    ? {
        rubric_version: boundedString(
          input.rubric_version,
          'create_interview_report_job.rubric_version',
          1,
          80
        )
      }
    : {}
}

/**
 * @brief 严格解码 InterviewReport / Strictly decode an InterviewReport.
 * @param value 未知 Report / Unknown Report.
 * @return 已验证 Report / Validated Report.
 * @note Report 只能在同时提供冻结 Scenario rubric 与完整 Transcript 时验证 score scale 和证据归属；单资源 GET 边界只验证本负载可证明的不变量 / Score-scale and evidence-membership validation requires the frozen Scenario rubric and complete Transcript; this single-resource GET boundary validates only invariants provable from this payload.
 */
export function parseInterviewReport(value: unknown): InterviewReport {
  /** @brief 精确 Report / Exact Report. */
  const input = exactRecord(value, 'interview_report', [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'session_id',
    'report_version',
    'rubric_ref',
    'engine_version',
    'overall_score',
    'overall_confidence',
    'executive_summary',
    'rubric_scores',
    'strengths',
    'improvements',
    'communication_metrics',
    'action_plan',
    'limitations',
    'generated_at'
  ])
  /** @brief 已解码维度评分 / Decoded rubric scores. */
  const rubricScores = arrayBetween(
    input.rubric_scores,
    'interview_report.rubric_scores',
    0,
    50
  ).map((item, index) =>
    parseInterviewRubricScore(item, `interview_report.rubric_scores[${index}]`)
  )
  assertUniqueBy(rubricScores, (score) => score.dimension_id, 'interview_report.rubric_scores')
  return {
    ...parseResourceFields(input, 'interview_report'),
    action_plan: arrayBetween(input.action_plan, 'interview_report.action_plan', 0, 50).map(
      (item, index) => parseInterviewActionPlanItem(item, `interview_report.action_plan[${index}]`)
    ),
    communication_metrics: parseInterviewCommunicationMetrics(
      input.communication_metrics,
      'interview_report.communication_metrics'
    ),
    engine_version: boundedString(input.engine_version, 'interview_report.engine_version', 1, 120),
    executive_summary: parseInterviewRichText(
      input.executive_summary,
      'interview_report.executive_summary'
    ),
    generated_at: timestamp(input.generated_at, 'interview_report.generated_at'),
    improvements: arrayBetween(input.improvements, 'interview_report.improvements', 0, 50).map(
      (item, index) => parseInterviewRichText(item, `interview_report.improvements[${index}]`)
    ),
    limitations: parseStringArray(
      input.limitations,
      'interview_report.limitations',
      0,
      50,
      0,
      1000,
      false
    ),
    overall_confidence: boundedNumber(
      input.overall_confidence,
      'interview_report.overall_confidence',
      0,
      1
    ),
    overall_score:
      input.overall_score === null
        ? null
        : boundedNumber(input.overall_score, 'interview_report.overall_score', 0, 100),
    report_version: boundedString(input.report_version, 'interview_report.report_version', 1, 80),
    rubric_ref: parseVersionedReference(input.rubric_ref, 'interview_report.rubric_ref'),
    rubric_scores: rubricScores,
    session_id: opaqueId(input.session_id, 'interview_report.session_id'),
    strengths: arrayBetween(input.strengths, 'interview_report.strengths', 0, 50).map(
      (item, index) => parseInterviewRichText(item, `interview_report.strengths[${index}]`)
    ),
    workspace_id: opaqueId(input.workspace_id, 'interview_report.workspace_id')
  }
}
