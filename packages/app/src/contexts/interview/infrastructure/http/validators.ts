/** @file Interview HTTP JSON 的运行时校验 / Runtime validation for Interview HTTP JSON. */

import {
  array,
  boolean,
  exactRecord,
  nullableNumber,
  nullableString,
  number,
  parseCursorPage,
  record,
  string,
  stringArray,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  InterviewJobTargetDto,
  InterviewMediaPreferencesDto,
  InterviewReportDto,
  InterviewRichTextDto,
  InterviewRubricDto,
  InterviewScenarioDto,
  InterviewSessionDto
} from './transport-types'

/** @brief 校验协议常量 / Validate a protocol constant. */
function constant(value: unknown, expected: string, path: string): void {
  if (string(value, path) !== expected) {
    throw new HttpContractError(`Backend field ${path} uses an unsupported version.`, 200)
  }
}

/** @brief 校验资源的公共元数据 / Validate common resource metadata. */
function parseResourceMetadata(input: Record<string, unknown>, path: string): void {
  string(input.id, `${path}.id`)
  string(input.created_at, `${path}.created_at`)
  string(input.updated_at, `${path}.updated_at`)
  number(input.revision, `${path}.revision`)
}

/** @brief 校验富文本 span 并提取文本 / Validate rich-text spans and extract text. */
function parseSpans(value: unknown, path: string): string {
  return array(value, path)
    .map((item, index) => {
      const spanPath = `${path}[${index}]`
      const span = exactRecord(item, spanPath, ['text', 'marks'])
      array(span.marks ?? [], `${spanPath}.marks`).forEach((markValue, markIndex) => {
        const markPath = `${spanPath}.marks[${markIndex}]`
        const mark = exactRecord(markValue, markPath, ['type', 'href'])
        string(mark.type, `${markPath}.type`)
        nullableString(mark.href, `${markPath}.href`)
      })
      return string(span.text, `${spanPath}.text`)
    })
    .join('')
}

/** @brief 校验列表项并递归提取文本 / Validate a list item and recursively extract text. */
function parseListItem(value: unknown, path: string): string {
  const input = exactRecord(value, path, ['item_id', 'spans', 'children'])
  string(input.item_id, `${path}.item_id`)
  const ownText = parseSpans(input.spans, `${path}.spans`)
  const children = array(input.children ?? [], `${path}.children`).map((child, index) =>
    parseListItem(child, `${path}.children[${index}]`)
  )
  return [ownText, ...children].filter((text) => text.length > 0).join('\n')
}

/** @brief 校验 RichText 并生成无损纯文本投影 / Validate RichText and create a lossless plain-text projection. */
function parseRichText(value: unknown, path: string): InterviewRichTextDto {
  const input = exactRecord(value, path, ['schema_version', 'blocks', 'plain_text'])
  constant(input.schema_version, '1.0', `${path}.schema_version`)
  const blockText = array(input.blocks, `${path}.blocks`).map((blockValue, index) => {
    const blockPath = `${path}.blocks[${index}]`
    const block = record(blockValue, blockPath)
    const type = string(block.type, `${blockPath}.type`)
    if (type === 'paragraph') {
      const paragraph = exactRecord(blockValue, blockPath, ['block_id', 'type', 'align', 'spans'])
      string(paragraph.block_id, `${blockPath}.block_id`)
      return parseSpans(paragraph.spans, `${blockPath}.spans`)
    }
    if (type === 'list') {
      const list = exactRecord(blockValue, blockPath, ['block_id', 'type', 'ordered', 'items'])
      string(list.block_id, `${blockPath}.block_id`)
      boolean(list.ordered, `${blockPath}.ordered`)
      return array(list.items, `${blockPath}.items`)
        .map((item, itemIndex) => parseListItem(item, `${blockPath}.items[${itemIndex}]`))
        .join('\n')
    }
    throw new HttpContractError(`Backend field ${blockPath}.type is unsupported.`, 200)
  })
  return {
    plain_text: nullableString(input.plain_text, `${path}.plain_text`) ?? blockText.join('\n')
  }
}

/** @brief 校验目标岗位 / Validate a job target. */
function parseJobTarget(value: unknown, path: string): InterviewJobTargetDto {
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
    parseRichText(input.description, `${path}.description`)
  }
  nullableString(input.source_url, `${path}.source_url`)
  return {
    company: nullableString(input.company, `${path}.company`),
    location: nullableString(input.location, `${path}.location`),
    seniority: nullableString(input.seniority, `${path}.seniority`),
    skills: stringArray(input.skills, `${path}.skills`),
    title: string(input.title, `${path}.title`)
  }
}

/** @brief 校验评估量表 / Validate an evaluation rubric. */
function parseRubric(value: unknown, path: string): InterviewRubricDto {
  const input = exactRecord(value, path, [
    'rubric_id',
    'rubric_version',
    'name',
    'dimensions',
    'overall_scale'
  ])
  const overallScale = exactRecord(input.overall_scale, `${path}.overall_scale`, [
    'minimum',
    'maximum'
  ])
  return {
    dimensions: array(input.dimensions, `${path}.dimensions`).map((item, index) => {
      const dimensionPath = `${path}.dimensions[${index}]`
      const dimension = exactRecord(item, dimensionPath, [
        'dimension_id',
        'name',
        'description',
        'weight',
        'observable_indicators',
        'scoring_scale'
      ])
      nullableString(dimension.description, `${dimensionPath}.description`)
      const scoringScale = exactRecord(dimension.scoring_scale, `${dimensionPath}.scoring_scale`, [
        'minimum',
        'maximum',
        'labels'
      ])
      number(scoringScale.minimum, `${dimensionPath}.scoring_scale.minimum`)
      number(scoringScale.maximum, `${dimensionPath}.scoring_scale.maximum`)
      record(scoringScale.labels, `${dimensionPath}.scoring_scale.labels`)
      return {
        dimension_id: string(dimension.dimension_id, `${dimensionPath}.dimension_id`),
        name: string(dimension.name, `${dimensionPath}.name`),
        observable_indicators: stringArray(
          dimension.observable_indicators,
          `${dimensionPath}.observable_indicators`
        ),
        weight: number(dimension.weight, `${dimensionPath}.weight`)
      }
    }),
    name: string(input.name, `${path}.name`),
    overall_scale: {
      maximum: number(overallScale.maximum, `${path}.overall_scale.maximum`),
      minimum: number(overallScale.minimum, `${path}.overall_scale.minimum`)
    },
    rubric_id: string(input.rubric_id, `${path}.rubric_id`),
    rubric_version: string(input.rubric_version, `${path}.rubric_version`)
  }
}

/** @brief 校验 Interview 场景 / Validate an Interview scenario. */
function parseScenario(value: unknown, path: string): InterviewScenarioDto {
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
  parseResourceMetadata(input, path)
  nullableString(input.interviewer_persona, `${path}.interviewer_persona`)
  if (input.extensions !== undefined) record(input.extensions, `${path}.extensions`)
  return {
    allow_barge_in: boolean(input.allow_barge_in, `${path}.allow_barge_in`),
    allow_followups: boolean(input.allow_followups, `${path}.allow_followups`),
    difficulty: string(input.difficulty, `${path}.difficulty`),
    duration_minutes: number(input.duration_minutes, `${path}.duration_minutes`),
    focus_areas: stringArray(input.focus_areas, `${path}.focus_areas`),
    id: string(input.id, `${path}.id`),
    interview_type: string(input.interview_type, `${path}.interview_type`),
    name: string(input.name, `${path}.name`),
    rubric: parseRubric(input.rubric, `${path}.rubric`),
    target_question_count: number(input.target_question_count, `${path}.target_question_count`),
    workspace_id: string(input.workspace_id, `${path}.workspace_id`)
  }
}

/** @brief 校验 Interview 媒体偏好 / Validate Interview media preferences. */
function parseMedia(value: unknown, path: string): InterviewMediaPreferencesDto {
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
      avatar_id: nullableString(avatar.avatar_id, `${path}.avatar.avatar_id`),
      include_expression_cues: boolean(
        avatar.include_expression_cues,
        `${path}.avatar.include_expression_cues`
      ),
      include_visemes: boolean(avatar.include_visemes, `${path}.avatar.include_visemes`),
      output_mode: string(avatar.output_mode, `${path}.avatar.output_mode`),
      preferred_audio_codecs: stringArray(
        avatar.preferred_audio_codecs,
        `${path}.avatar.preferred_audio_codecs`
      ),
      preferred_video_codecs: stringArray(
        avatar.preferred_video_codecs,
        `${path}.avatar.preferred_video_codecs`
      ),
      voice_id: nullableString(avatar.voice_id, `${path}.avatar.voice_id`)
    },
    fallback_transport: string(input.fallback_transport, `${path}.fallback_transport`),
    max_video_fps: number(input.max_video_fps, `${path}.max_video_fps`),
    max_video_height: number(input.max_video_height, `${path}.max_video_height`),
    max_video_width: number(input.max_video_width, `${path}.max_video_width`),
    screen_share: boolean(input.screen_share, `${path}.screen_share`),
    user_audio: boolean(input.user_audio, `${path}.user_audio`),
    user_video: boolean(input.user_video, `${path}.user_video`)
  }
}

/** @brief 校验 Interview 会话 / Validate an Interview session. */
function parseSession(value: unknown, path: string): InterviewSessionDto {
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
  parseResourceMetadata(input, path)
  const recording = record(input.recording, `${path}.recording`)
  boolean(recording.record_audio, `${path}.recording.record_audio`)
  boolean(recording.record_video, `${path}.recording.record_video`)
  boolean(recording.store_transcript, `${path}.recording.store_transcript`)
  number(recording.retention_days, `${path}.recording.retention_days`)
  if (input.resume_ref !== undefined && input.resume_ref !== null) {
    record(input.resume_ref, `${path}.resume_ref`)
  }
  if (input.problem !== undefined && input.problem !== null)
    record(input.problem, `${path}.problem`)
  if (input.extensions !== undefined) record(input.extensions, `${path}.extensions`)
  return {
    ended_at: nullableString(input.ended_at, `${path}.ended_at`),
    id: string(input.id, `${path}.id`),
    job_target: parseJobTarget(input.job_target, `${path}.job_target`),
    locale: string(input.locale, `${path}.locale`),
    media: parseMedia(input.media, `${path}.media`),
    report_id: nullableString(input.report_id, `${path}.report_id`),
    scenario_id: nullableString(input.scenario_id, `${path}.scenario_id`),
    started_at: nullableString(input.started_at, `${path}.started_at`),
    status: string(input.status, `${path}.status`),
    workspace_id: string(input.workspace_id, `${path}.workspace_id`)
  }
}

/** @brief 校验单个 Interview 场景 / Validate one Interview scenario. */
export function parseInterviewScenarioDto(value: unknown): InterviewScenarioDto {
  return parseScenario(value, 'interviewScenario')
}

/** @brief 校验 Interview 场景列表 / Validate an Interview-scenario list. */
export function parseInterviewScenarioListDto(value: unknown): PaginatedDto<InterviewScenarioDto> {
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
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) => parseSession(item, `items[${index}]`)),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验 Interview 报告 / Validate an Interview report. */
export function parseInterviewReportDto(value: unknown): InterviewReportDto {
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
  parseResourceMetadata(input, 'interviewReport')
  const rubricRef = record(input.rubric_ref, 'interviewReport.rubric_ref')
  string(rubricRef.id, 'interviewReport.rubric_ref.id')
  string(rubricRef.version, 'interviewReport.rubric_ref.version')
  array(input.question_evaluations, 'interviewReport.question_evaluations')
  nullableString(input.transcript_artifact_id, 'interviewReport.transcript_artifact_id')
  stringArray(input.recording_artifact_ids, 'interviewReport.recording_artifact_ids')
  if (input.extensions !== undefined) record(input.extensions, 'interviewReport.extensions')
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
    action_plan: array(input.action_plan, 'interviewReport.action_plan').map((item, index) => {
      const path = `interviewReport.action_plan[${index}]`
      const action = exactRecord(item, path, [
        'priority',
        'title',
        'why',
        'practice',
        'success_criterion'
      ])
      return {
        practice: string(action.practice, `${path}.practice`),
        priority: string(action.priority, `${path}.priority`),
        success_criterion: string(action.success_criterion, `${path}.success_criterion`),
        title: string(action.title, `${path}.title`),
        why: string(action.why, `${path}.why`)
      }
    }),
    communication_metrics: {
      average_answer_length_ms: nullableNumber(
        communication.average_answer_length_ms,
        'interviewReport.communication_metrics.average_answer_length_ms'
      ),
      filler_word_count: nullableNumber(
        communication.filler_word_count,
        'interviewReport.communication_metrics.filler_word_count'
      ),
      interruption_count: nullableNumber(
        communication.interruption_count,
        'interviewReport.communication_metrics.interruption_count'
      ),
      long_pause_count: nullableNumber(
        communication.long_pause_count,
        'interviewReport.communication_metrics.long_pause_count'
      ),
      notes: stringArray(communication.notes ?? [], 'interviewReport.communication_metrics.notes'),
      speaking_time_ms: nullableNumber(
        communication.speaking_time_ms,
        'interviewReport.communication_metrics.speaking_time_ms'
      ),
      words_per_minute: nullableNumber(
        communication.words_per_minute,
        'interviewReport.communication_metrics.words_per_minute'
      )
    },
    created_at: string(input.created_at, 'interviewReport.created_at'),
    executive_summary: parseRichText(input.executive_summary, 'interviewReport.executive_summary'),
    id: string(input.id, 'interviewReport.id'),
    improvements: array(input.improvements, 'interviewReport.improvements').map((item, index) =>
      parseRichText(item, `interviewReport.improvements[${index}]`)
    ),
    limitations: stringArray(input.limitations, 'interviewReport.limitations'),
    overall_confidence: number(input.overall_confidence, 'interviewReport.overall_confidence'),
    overall_score: nullableNumber(input.overall_score, 'interviewReport.overall_score'),
    report_version: string(input.report_version, 'interviewReport.report_version'),
    rubric_scores: array(input.rubric_scores, 'interviewReport.rubric_scores').map(
      (item, index) => {
        const path = `interviewReport.rubric_scores[${index}]`
        const score = exactRecord(item, path, [
          'dimension_id',
          'score',
          'confidence',
          'summary',
          'evidence',
          'improvement_actions'
        ])
        return {
          confidence: number(score.confidence, `${path}.confidence`),
          dimension_id: string(score.dimension_id, `${path}.dimension_id`),
          evidence: array(score.evidence, `${path}.evidence`).map(
            (evidenceValue, evidenceIndex) => {
              const evidencePath = `${path}.evidence[${evidenceIndex}]`
              const evidence = exactRecord(evidenceValue, evidencePath, [
                'segment_id',
                'start_ms',
                'end_ms',
                'quote'
              ])
              return {
                end_ms: number(evidence.end_ms, `${evidencePath}.end_ms`),
                quote: nullableString(evidence.quote, `${evidencePath}.quote`),
                segment_id: string(evidence.segment_id, `${evidencePath}.segment_id`),
                start_ms: number(evidence.start_ms, `${evidencePath}.start_ms`)
              }
            }
          ),
          improvement_actions: stringArray(
            score.improvement_actions,
            `${path}.improvement_actions`
          ),
          score: number(score.score, `${path}.score`),
          summary: parseRichText(score.summary, `${path}.summary`)
        }
      }
    ),
    session_id: string(input.session_id, 'interviewReport.session_id'),
    strengths: array(input.strengths, 'interviewReport.strengths').map((item, index) =>
      parseRichText(item, `interviewReport.strengths[${index}]`)
    )
  }
}
