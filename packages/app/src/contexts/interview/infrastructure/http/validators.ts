/** @file Interview HTTP JSON 的运行时校验 / Runtime validation for Interview HTTP JSON. */

import {
  absoluteUri,
  array,
  boolean,
  boundedArray,
  boundedInteger,
  boundedNumber,
  boundedString,
  exactRecord,
  extensions,
  nonNegativeInteger,
  number,
  opaqueId,
  parseCursorPage,
  positiveInteger,
  record,
  stableCode,
  string,
  timestamp,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError, parseProblemDetails } from '../../../../infrastructure/http/http-client'
import { validateRichText } from '../../../../infrastructure/http/rich-text-validator'
import type {
  InterviewJobTargetDto,
  InterviewMediaPreferencesDto,
  InterviewReportDto,
  InterviewRichTextDto,
  InterviewRubricDto,
  InterviewScenarioDto,
  InterviewSessionDto
} from './transport-types'

/** @brief Locale 的冻结结构格式 / Frozen structural Locale format. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u

/** @brief Interview 场景类型的封闭枚举 / Closed Interview-scenario type enum. */
const INTERVIEW_TYPES = [
  'behavioral',
  'technical',
  'system_design',
  'coding',
  'case',
  'hr',
  'mixed'
] as const

/** @brief Interview 会话状态的封闭枚举 / Closed Interview-session status enum. */
const INTERVIEW_STATUSES = [
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
] as const

/**
 * @brief 断言字符串属于封闭枚举 / Assert that a string belongs to a closed enum.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowed 冻结枚举值 / Frozen enum values.
 * @return 已验证字符串 / Validated string.
 */
function closedEnum(value: unknown, path: string, allowed: readonly string[]): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!allowed.includes(decoded)) {
    throw new HttpContractError(`Backend field ${path} contains an unsupported value.`, 200)
  }
  return decoded
}

/**
 * @brief 校验 Locale / Validate a Locale.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Locale / Validated Locale.
 */
function locale(value: unknown, path: string): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!LOCALE_PATTERN.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be a locale code.`, 200)
  }
  return decoded
}

/**
 * @brief 校验字符串数组的唯一性 / Validate string-array uniqueness.
 * @param values 已验证字符串 / Validated strings.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function requireUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new HttpContractError(`Backend field ${path} must contain unique items.`, 200)
  }
}

/**
 * @brief 校验有界字符串数组 / Validate an array of bounded strings.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目 / Minimum item count.
 * @param maximumItems 最大条目；null 表示无上限 / Maximum item count, or null without a limit.
 * @param maximumLength 单条最大长度 / Maximum item length.
 * @param unique 是否要求唯一 / Whether values must be unique.
 * @return 已验证字符串数组 / Validated string array.
 */
function boundedStrings(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number | null,
  maximumLength: number,
  unique: boolean
): readonly string[] {
  /** @brief 已解码数组 / Decoded array. */
  const input = array(value, path)
  if (input.length < minimumItems || (maximumItems !== null && input.length > maximumItems)) {
    throw new HttpContractError(`Backend field ${path} contains an invalid number of items.`, 200)
  }
  /** @brief 已验证字符串 / Validated strings. */
  const values = input.map((item, index): string =>
    boundedString(item, `${path}[${index}]`, 0, maximumLength)
  )
  if (unique) requireUnique(values, path)
  return values
}

/**
 * @brief 校验封闭枚举数组 / Validate an array of closed-enum values.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目 / Minimum item count.
 * @param allowed 冻结枚举 / Frozen enum.
 * @return 已验证字符串数组 / Validated string array.
 */
function enumArray(
  value: unknown,
  path: string,
  minimumItems: number,
  allowed: readonly string[]
): readonly string[] {
  /** @brief 已解码数组 / Decoded array. */
  const input = array(value, path)
  if (input.length < minimumItems) {
    throw new HttpContractError(`Backend field ${path} contains too few items.`, 200)
  }
  /** @brief 已验证枚举值 / Validated enum values. */
  const values = input.map((item, index): string => closedEnum(item, `${path}[${index}]`, allowed))
  requireUnique(values, path)
  return values
}

/**
 * @brief 校验可选可空 OpaqueId / Validate an optional nullable OpaqueId.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return OpaqueId 或 null / OpaqueId or null.
 */
function nullableOpaqueId(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : opaqueId(value, path)
}

/**
 * @brief 校验可选可空时间戳 / Validate an optional nullable timestamp.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 时间戳或 null / Timestamp or null.
 */
function nullableTimestamp(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : timestamp(value, path)
}

/**
 * @brief 校验可选可空有界字符串 / Validate an optional nullable bounded string.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumLength 最大长度 / Maximum length.
 * @return 字符串或 null / String or null.
 */
function nullableBoundedString(value: unknown, path: string, maximumLength: number): string | null {
  return value === undefined || value === null ? null : boundedString(value, path, 0, maximumLength)
}

/**
 * @brief 校验资源公共元数据 / Validate common resource metadata.
 * @param input 资源对象 / Resource object.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateResourceMetadata(input: Record<string, unknown>, path: string): void {
  opaqueId(input.id, `${path}.id`)
  timestamp(input.created_at, `${path}.created_at`)
  timestamp(input.updated_at, `${path}.updated_at`)
  positiveInteger(input.revision, `${path}.revision`)
}

/**
 * @brief 校验 RichText 并生成 DTO / Validate RichText and build its DTO.
 * @param value 未知 RichText / Unknown RichText.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 纯文本投影 DTO / Plain-text projection DTO.
 */
function parseRichText(value: unknown, path: string): InterviewRichTextDto {
  return { plain_text: validateRichText(value, path) }
}

/**
 * @brief 校验 JobTarget / Validate a JobTarget.
 * @param value 未知岗位目标 / Unknown job target.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证岗位目标 DTO / Validated job-target DTO.
 */
function parseJobTarget(value: unknown, path: string): InterviewJobTargetDto {
  /** @brief 精确岗位目标 / Exact job target. */
  const input = exactRecord(value, path, [
    'title',
    'company',
    'location',
    'description',
    'source_url',
    'seniority',
    'skills'
  ])
  if (input.description !== undefined && input.description !== null) {
    validateRichText(input.description, `${path}.description`)
  }
  if (input.source_url !== undefined && input.source_url !== null) {
    absoluteUri(input.source_url, `${path}.source_url`)
  }
  /** @brief 可选资历级别 / Optional seniority. */
  const seniority =
    input.seniority === undefined || input.seniority === null
      ? null
      : closedEnum(input.seniority, `${path}.seniority`, [
          'intern',
          'entry',
          'mid',
          'senior',
          'staff',
          'principal',
          'manager',
          'director',
          'executive'
        ])
  return {
    company: nullableBoundedString(input.company, `${path}.company`, 300),
    location: nullableBoundedString(input.location, `${path}.location`, 300),
    seniority,
    skills: boundedStrings(input.skills, `${path}.skills`, 0, 200, 100, true),
    title: boundedString(input.title, `${path}.title`, 1, 300)
  }
}

/**
 * @brief 校验评估量表 / Validate an evaluation rubric.
 * @param value 未知量表 / Unknown rubric.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证量表 DTO / Validated rubric DTO.
 */
function parseRubric(value: unknown, path: string): InterviewRubricDto {
  /** @brief 精确量表 / Exact rubric. */
  const input = exactRecord(value, path, [
    'rubric_id',
    'rubric_version',
    'name',
    'dimensions',
    'overall_scale'
  ])
  /** @brief 精确总分范围 / Exact overall scale. */
  const overallScale = exactRecord(input.overall_scale, `${path}.overall_scale`, [
    'minimum',
    'maximum'
  ])
  return {
    dimensions: boundedArray(input.dimensions, `${path}.dimensions`, 1, 100).map((item, index) => {
      /** @brief 当前维度路径 / Current dimension path. */
      const dimensionPath = `${path}.dimensions[${index}]`
      /** @brief 精确量表维度 / Exact rubric dimension. */
      const dimension = exactRecord(item, dimensionPath, [
        'dimension_id',
        'name',
        'description',
        'weight',
        'observable_indicators',
        'scoring_scale'
      ])
      nullableBoundedString(dimension.description, `${dimensionPath}.description`, 2_000)
      /** @brief 精确评分范围 / Exact scoring scale. */
      const scoringScale = exactRecord(dimension.scoring_scale, `${dimensionPath}.scoring_scale`, [
        'minimum',
        'maximum',
        'labels'
      ])
      number(scoringScale.minimum, `${dimensionPath}.scoring_scale.minimum`)
      number(scoringScale.maximum, `${dimensionPath}.scoring_scale.maximum`)
      /** @brief 评分标签映射 / Scoring-label map. */
      const labels = record(scoringScale.labels, `${dimensionPath}.scoring_scale.labels`)
      Object.values(labels).forEach((label, labelIndex): void => {
        string(label, `${dimensionPath}.scoring_scale.labels[${labelIndex}]`)
      })
      return {
        dimension_id: opaqueId(dimension.dimension_id, `${dimensionPath}.dimension_id`),
        name: boundedString(dimension.name, `${dimensionPath}.name`, 1, 200),
        observable_indicators: boundedStrings(
          dimension.observable_indicators,
          `${dimensionPath}.observable_indicators`,
          1,
          100,
          1_000,
          false
        ),
        scoring_scale: {
          labels: Object.fromEntries(
            Object.entries(labels).map(([labelKey, label], labelIndex) => [
              labelKey,
              string(label, `${dimensionPath}.scoring_scale.labels[${labelIndex}]`)
            ])
          ),
          maximum: number(scoringScale.maximum, `${dimensionPath}.scoring_scale.maximum`),
          minimum: number(scoringScale.minimum, `${dimensionPath}.scoring_scale.minimum`)
        },
        weight: boundedNumber(dimension.weight, `${dimensionPath}.weight`, 0, 1)
      }
    }),
    name: boundedString(input.name, `${path}.name`, 1, 300),
    overall_scale: {
      maximum: number(overallScale.maximum, `${path}.overall_scale.maximum`),
      minimum: number(overallScale.minimum, `${path}.overall_scale.minimum`)
    },
    rubric_id: opaqueId(input.rubric_id, `${path}.rubric_id`),
    rubric_version: boundedString(input.rubric_version, `${path}.rubric_version`, 1, 128)
  }
}

/**
 * @brief 校验 Interview 场景 / Validate an Interview scenario.
 * @param value 未知场景 / Unknown scenario.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证场景 DTO / Validated scenario DTO.
 */
function parseScenario(value: unknown, path: string): InterviewScenarioDto {
  /** @brief 精确场景对象 / Exact scenario object. */
  const input = exactRecord(value, path, [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'workspace_id',
    'name',
    'interview_type',
    'difficulty',
    'duration_minutes',
    'target_question_count',
    'focus_areas',
    'interviewer_persona',
    'allow_followups',
    'allow_barge_in',
    'rubric',
    'extensions'
  ])
  validateResourceMetadata(input, path)
  nullableBoundedString(input.interviewer_persona, `${path}.interviewer_persona`, 2_000)
  if (input.extensions !== undefined) extensions(input.extensions, `${path}.extensions`)
  return {
    allow_barge_in: boolean(input.allow_barge_in, `${path}.allow_barge_in`),
    allow_followups: boolean(input.allow_followups, `${path}.allow_followups`),
    difficulty: closedEnum(input.difficulty, `${path}.difficulty`, [
      'introductory',
      'standard',
      'advanced',
      'expert'
    ]),
    duration_minutes: boundedInteger(input.duration_minutes, `${path}.duration_minutes`, 5, 480),
    focus_areas: boundedStrings(input.focus_areas, `${path}.focus_areas`, 0, 100, 200, true),
    id: opaqueId(input.id, `${path}.id`),
    interview_type: closedEnum(input.interview_type, `${path}.interview_type`, INTERVIEW_TYPES),
    name: boundedString(input.name, `${path}.name`, 1, 300),
    rubric: parseRubric(input.rubric, `${path}.rubric`),
    target_question_count: boundedInteger(
      input.target_question_count,
      `${path}.target_question_count`,
      1,
      200
    ),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/**
 * @brief 校验 Interview 媒体偏好 / Validate Interview media preferences.
 * @param value 未知媒体偏好 / Unknown media preferences.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证媒体 DTO / Validated media DTO.
 */
function parseMedia(value: unknown, path: string): InterviewMediaPreferencesDto {
  /** @brief 精确媒体偏好 / Exact media preferences. */
  const input = exactRecord(value, path, [
    'user_audio',
    'user_video',
    'screen_share',
    'max_video_width',
    'max_video_height',
    'max_video_fps',
    'avatar',
    'fallback_transport'
  ])
  /** @brief 精确 Avatar profile / Exact Avatar profile. */
  const avatar = exactRecord(input.avatar, `${path}.avatar`, [
    'output_mode',
    'avatar_id',
    'voice_id',
    'preferred_audio_codecs',
    'preferred_video_codecs',
    'include_visemes',
    'include_expression_cues'
  ])
  return {
    avatar: {
      avatar_id: nullableOpaqueId(avatar.avatar_id, `${path}.avatar.avatar_id`),
      include_expression_cues: boolean(
        avatar.include_expression_cues,
        `${path}.avatar.include_expression_cues`
      ),
      include_visemes: boolean(avatar.include_visemes, `${path}.avatar.include_visemes`),
      output_mode: closedEnum(avatar.output_mode, `${path}.avatar.output_mode`, [
        'server_video',
        'client_render',
        'audio_only'
      ]),
      preferred_audio_codecs: enumArray(
        avatar.preferred_audio_codecs,
        `${path}.avatar.preferred_audio_codecs`,
        1,
        ['opus', 'aac', 'pcm_s16le']
      ),
      preferred_video_codecs: enumArray(
        avatar.preferred_video_codecs,
        `${path}.avatar.preferred_video_codecs`,
        0,
        ['h264', 'vp8', 'vp9', 'av1']
      ),
      voice_id: nullableOpaqueId(avatar.voice_id, `${path}.avatar.voice_id`)
    },
    fallback_transport: closedEnum(input.fallback_transport, `${path}.fallback_transport`, [
      'websocket_binary',
      'audio_only',
      'none'
    ]),
    max_video_fps: boundedInteger(input.max_video_fps, `${path}.max_video_fps`, 1, 120),
    max_video_height: boundedInteger(
      input.max_video_height,
      `${path}.max_video_height`,
      120,
      4_320
    ),
    max_video_width: boundedInteger(input.max_video_width, `${path}.max_video_width`, 160, 7_680),
    screen_share: boolean(input.screen_share, `${path}.screen_share`),
    user_audio: boolean(input.user_audio, `${path}.user_audio`),
    user_video: boolean(input.user_video, `${path}.user_video`)
  }
}

/**
 * @brief 校验可选 ResourceRef / Validate an optional ResourceRef.
 * @param value 未知资源引用 / Unknown resource reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateNullableResourceRef(value: unknown, path: string): void {
  if (value === undefined || value === null) return
  /** @brief 精确资源引用 / Exact resource reference. */
  const input = exactRecord(value, path, ['resource_type', 'id', 'revision'])
  stableCode(input.resource_type, `${path}.resource_type`)
  opaqueId(input.id, `${path}.id`)
  if (input.revision !== undefined && input.revision !== null) {
    positiveInteger(input.revision, `${path}.revision`)
  }
}

/**
 * @brief 校验 RecordingPolicy / Validate a RecordingPolicy.
 * @param value 未知录制策略 / Unknown recording policy.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateRecording(value: unknown, path: string): void {
  /** @brief 精确录制策略 / Exact recording policy. */
  const input = exactRecord(value, path, [
    'record_audio',
    'record_video',
    'store_transcript',
    'retention_days',
    'user_consent_at',
    'consent_version'
  ])
  boolean(input.record_audio, `${path}.record_audio`)
  boolean(input.record_video, `${path}.record_video`)
  boolean(input.store_transcript, `${path}.store_transcript`)
  boundedInteger(input.retention_days, `${path}.retention_days`, 0, 36_500)
  nullableTimestamp(input.user_consent_at, `${path}.user_consent_at`)
  nullableBoundedString(input.consent_version, `${path}.consent_version`, 128)
}

/**
 * @brief 校验 Interview 会话 / Validate an Interview session.
 * @param value 未知会话 / Unknown session.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证会话 DTO / Validated session DTO.
 */
function parseSession(value: unknown, path: string): InterviewSessionDto {
  /** @brief 精确会话对象 / Exact session object. */
  const input = exactRecord(value, path, [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'workspace_id',
    'scenario_id',
    'status',
    'resume_ref',
    'job_target',
    'locale',
    'media',
    'recording',
    'started_at',
    'ended_at',
    'report_id',
    'problem',
    'extensions'
  ])
  validateResourceMetadata(input, path)
  validateNullableResourceRef(input.resume_ref, `${path}.resume_ref`)
  validateRecording(input.recording, `${path}.recording`)
  if (
    input.problem !== undefined &&
    input.problem !== null &&
    parseProblemDetails(input.problem) === null
  ) {
    throw new HttpContractError(`Backend field ${path}.problem must match ProblemDetails.`, 200)
  }
  if (input.extensions !== undefined) extensions(input.extensions, `${path}.extensions`)
  return {
    ended_at: nullableTimestamp(input.ended_at, `${path}.ended_at`),
    id: opaqueId(input.id, `${path}.id`),
    job_target: parseJobTarget(input.job_target, `${path}.job_target`),
    locale: locale(input.locale, `${path}.locale`),
    media: parseMedia(input.media, `${path}.media`),
    report_id: nullableOpaqueId(input.report_id, `${path}.report_id`),
    scenario_id: nullableOpaqueId(input.scenario_id, `${path}.scenario_id`),
    started_at: nullableTimestamp(input.started_at, `${path}.started_at`),
    status: closedEnum(input.status, `${path}.status`, INTERVIEW_STATUSES),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/**
 * @brief 校验 QuestionEvaluation；当前 UI 不保留该完整投影 / Validate a QuestionEvaluation not retained by the current UI.
 * @param value 未知评价 / Unknown evaluation.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateQuestionEvaluation(value: unknown, path: string): void {
  /** @brief 精确问题评价 / Exact question evaluation. */
  const input = exactRecord(value, path, [
    'question_id',
    'question_text',
    'answer_segment_ids',
    'score',
    'confidence',
    'what_worked',
    'what_to_improve',
    'better_answer_outline'
  ])
  opaqueId(input.question_id, `${path}.question_id`)
  boundedString(input.question_text, `${path}.question_text`, 0, 10_000)
  boundedArray(input.answer_segment_ids, `${path}.answer_segment_ids`, 0, 100).forEach(
    (segmentId, index): void => {
      opaqueId(segmentId, `${path}.answer_segment_ids[${index}]`)
    }
  )
  if (input.score !== undefined && input.score !== null) number(input.score, `${path}.score`)
  boundedNumber(input.confidence, `${path}.confidence`, 0, 1)
  boundedStrings(input.what_worked, `${path}.what_worked`, 0, 50, 2_000, false)
  boundedStrings(input.what_to_improve, `${path}.what_to_improve`, 0, 50, 2_000, false)
  if (input.better_answer_outline !== undefined && input.better_answer_outline !== null) {
    validateRichText(input.better_answer_outline, `${path}.better_answer_outline`)
  }
}

/**
 * @brief 校验可空非负整数 / Validate a nullable non-negative integer.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 非负整数或 null / Non-negative integer or null.
 */
function nullableNonNegativeInteger(value: unknown, path: string): number | null {
  return value === undefined || value === null ? null : nonNegativeInteger(value, path)
}

/**
 * @brief 校验可空非负数字 / Validate a nullable non-negative number.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 非负数字或 null / Non-negative number or null.
 */
function nullableNonNegativeNumber(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null
  /** @brief 已解码数字 / Decoded number. */
  const decoded = number(value, path)
  if (decoded < 0) {
    throw new HttpContractError(`Backend field ${path} must be at least 0.`, 200)
  }
  return decoded
}

/** @brief 校验单个 Interview 场景 / Validate one Interview scenario. */
export function parseInterviewScenarioDto(value: unknown): InterviewScenarioDto {
  return parseScenario(value, 'interviewScenario')
}

/** @brief 校验 Interview 场景列表 / Validate an Interview-scenario list. */
export function parseInterviewScenarioListDto(value: unknown): PaginatedDto<InterviewScenarioDto> {
  /** @brief 精确列表响应 / Exact list response. */
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) => parseScenario(item, `items[${index}]`)),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验单个 Interview 会话 / Validate one Interview session. */
export function parseInterviewSessionDto(value: unknown): InterviewSessionDto {
  return parseSession(value, 'interviewSession')
}

/** @brief 校验 Interview 会话列表 / Validate an Interview-session list. */
export function parseInterviewSessionListDto(value: unknown): PaginatedDto<InterviewSessionDto> {
  /** @brief 精确列表响应 / Exact list response. */
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) => parseSession(item, `items[${index}]`)),
    page: parseCursorPage(input.page)
  }
}

/**
 * @brief 校验 Interview 报告 / Validate an Interview report.
 * @param value 未知报告 / Unknown report.
 * @return 已验证报告 DTO / Validated report DTO.
 */
export function parseInterviewReportDto(value: unknown): InterviewReportDto {
  /** @brief 精确报告对象 / Exact report object. */
  const input = exactRecord(value, 'interviewReport', [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'session_id',
    'report_version',
    'rubric_ref',
    'overall_score',
    'overall_confidence',
    'executive_summary',
    'strengths',
    'improvements',
    'rubric_scores',
    'question_evaluations',
    'communication_metrics',
    'action_plan',
    'limitations',
    'transcript_artifact_id',
    'recording_artifact_ids',
    'extensions'
  ])
  validateResourceMetadata(input, 'interviewReport')
  /** @brief 精确 Rubric 引用 / Exact Rubric reference. */
  const rubricRef = exactRecord(input.rubric_ref, 'interviewReport.rubric_ref', ['id', 'version'])
  opaqueId(rubricRef.id, 'interviewReport.rubric_ref.id')
  boundedString(rubricRef.version, 'interviewReport.rubric_ref.version', 1, 128)
  boundedArray(input.question_evaluations, 'interviewReport.question_evaluations', 0, 500).forEach(
    (evaluation, index): void => {
      validateQuestionEvaluation(evaluation, `interviewReport.question_evaluations[${index}]`)
    }
  )
  nullableOpaqueId(input.transcript_artifact_id, 'interviewReport.transcript_artifact_id')
  boundedArray(
    input.recording_artifact_ids,
    'interviewReport.recording_artifact_ids',
    0,
    20
  ).forEach((artifactId, index): void => {
    opaqueId(artifactId, `interviewReport.recording_artifact_ids[${index}]`)
  })
  if (input.extensions !== undefined) extensions(input.extensions, 'interviewReport.extensions')
  /** @brief 精确沟通指标 / Exact communication metrics. */
  const communication = exactRecord(
    input.communication_metrics,
    'interviewReport.communication_metrics',
    [
      'speaking_time_ms',
      'average_answer_length_ms',
      'words_per_minute',
      'filler_word_count',
      'long_pause_count',
      'interruption_count',
      'notes'
    ]
  )
  return {
    action_plan: boundedArray(input.action_plan, 'interviewReport.action_plan', 0, 100).map(
      (item, index) => {
        /** @brief 当前行动项路径 / Current action-item path. */
        const path = `interviewReport.action_plan[${index}]`
        /** @brief 精确行动项 / Exact action item. */
        const action = exactRecord(item, path, [
          'priority',
          'title',
          'why',
          'practice',
          'success_criterion'
        ])
        return {
          practice: boundedString(action.practice, `${path}.practice`, 1, 4_000),
          priority: closedEnum(action.priority, `${path}.priority`, ['high', 'medium', 'low']),
          success_criterion: boundedString(
            action.success_criterion,
            `${path}.success_criterion`,
            1,
            2_000
          ),
          title: boundedString(action.title, `${path}.title`, 1, 300),
          why: boundedString(action.why, `${path}.why`, 1, 2_000)
        }
      }
    ),
    communication_metrics: {
      average_answer_length_ms: nullableNonNegativeInteger(
        communication.average_answer_length_ms,
        'interviewReport.communication_metrics.average_answer_length_ms'
      ),
      filler_word_count: nullableNonNegativeInteger(
        communication.filler_word_count,
        'interviewReport.communication_metrics.filler_word_count'
      ),
      interruption_count: nullableNonNegativeInteger(
        communication.interruption_count,
        'interviewReport.communication_metrics.interruption_count'
      ),
      long_pause_count: nullableNonNegativeInteger(
        communication.long_pause_count,
        'interviewReport.communication_metrics.long_pause_count'
      ),
      notes: boundedStrings(
        communication.notes ?? [],
        'interviewReport.communication_metrics.notes',
        0,
        100,
        2_000,
        false
      ),
      speaking_time_ms: nullableNonNegativeInteger(
        communication.speaking_time_ms,
        'interviewReport.communication_metrics.speaking_time_ms'
      ),
      words_per_minute: nullableNonNegativeNumber(
        communication.words_per_minute,
        'interviewReport.communication_metrics.words_per_minute'
      )
    },
    created_at: timestamp(input.created_at, 'interviewReport.created_at'),
    executive_summary: parseRichText(input.executive_summary, 'interviewReport.executive_summary'),
    id: opaqueId(input.id, 'interviewReport.id'),
    improvements: boundedArray(input.improvements, 'interviewReport.improvements', 0, 100).map(
      (item, index) => parseRichText(item, `interviewReport.improvements[${index}]`)
    ),
    limitations: boundedStrings(
      input.limitations,
      'interviewReport.limitations',
      0,
      100,
      2_000,
      false
    ),
    overall_confidence: boundedNumber(
      input.overall_confidence,
      'interviewReport.overall_confidence',
      0,
      1
    ),
    overall_score:
      input.overall_score === undefined || input.overall_score === null
        ? null
        : number(input.overall_score, 'interviewReport.overall_score'),
    report_version: boundedString(input.report_version, 'interviewReport.report_version', 1, 128),
    rubric_ref: {
      id: opaqueId(rubricRef.id, 'interviewReport.rubric_ref.id'),
      version: boundedString(rubricRef.version, 'interviewReport.rubric_ref.version', 1, 128)
    },
    rubric_scores: boundedArray(input.rubric_scores, 'interviewReport.rubric_scores', 1, 100).map(
      (item, index) => {
        /** @brief 当前量表得分路径 / Current rubric-score path. */
        const path = `interviewReport.rubric_scores[${index}]`
        /** @brief 精确量表得分 / Exact rubric score. */
        const score = exactRecord(item, path, [
          'dimension_id',
          'score',
          'confidence',
          'summary',
          'evidence',
          'improvement_actions'
        ])
        return {
          confidence: boundedNumber(score.confidence, `${path}.confidence`, 0, 1),
          dimension_id: opaqueId(score.dimension_id, `${path}.dimension_id`),
          evidence: boundedArray(score.evidence, `${path}.evidence`, 0, 100).map(
            (evidenceValue, evidenceIndex) => {
              /** @brief 当前证据路径 / Current evidence path. */
              const evidencePath = `${path}.evidence[${evidenceIndex}]`
              /** @brief 精确证据引用 / Exact evidence reference. */
              const evidence = exactRecord(evidenceValue, evidencePath, [
                'segment_id',
                'start_ms',
                'end_ms',
                'quote'
              ])
              return {
                end_ms: nonNegativeInteger(evidence.end_ms, `${evidencePath}.end_ms`),
                quote: nullableBoundedString(evidence.quote, `${evidencePath}.quote`, 2_000),
                segment_id: opaqueId(evidence.segment_id, `${evidencePath}.segment_id`),
                start_ms: nonNegativeInteger(evidence.start_ms, `${evidencePath}.start_ms`)
              }
            }
          ),
          improvement_actions: boundedStrings(
            score.improvement_actions,
            `${path}.improvement_actions`,
            0,
            50,
            2_000,
            false
          ),
          score: number(score.score, `${path}.score`),
          summary: parseRichText(score.summary, `${path}.summary`)
        }
      }
    ),
    session_id: opaqueId(input.session_id, 'interviewReport.session_id'),
    strengths: boundedArray(input.strengths, 'interviewReport.strengths', 0, 100).map(
      (item, index) => parseRichText(item, `interviewReport.strengths[${index}]`)
    )
  }
}
