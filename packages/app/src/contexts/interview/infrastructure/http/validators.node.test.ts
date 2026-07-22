import { describe, expect, it } from 'vitest'

import {
  parseInterviewReportDto,
  parseInterviewScenarioDto,
  parseInterviewSessionDto
} from './validators'

/**
 * @brief 构造 Schema 合法的 RichText / Build schema-valid RichText.
 * @param text 文本 / Text.
 * @return RichText JSON / RichText JSON.
 */
function richText(text = '清晰表达'): Record<string, unknown> {
  return {
    blocks: [
      {
        align: 'start',
        block_id: 'block_test_1',
        spans: [{ marks: [], text }],
        type: 'paragraph'
      }
    ],
    plain_text: null,
    schema_version: '1.0'
  }
}

/**
 * @brief 构造 Schema 合法的 InterviewScenario / Build a schema-valid InterviewScenario.
 * @param overrides 顶层覆盖 / Top-level overrides.
 * @return 场景 JSON / Scenario JSON.
 */
function scenario(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    allow_barge_in: true,
    allow_followups: true,
    created_at: '2026-07-20T00:00:00Z',
    difficulty: 'standard',
    duration_minutes: 30,
    extensions: {},
    focus_areas: ['系统设计'],
    id: 'scenario_one',
    interview_type: 'mixed',
    interviewer_persona: null,
    name: '综合面试',
    revision: 1,
    rubric: {
      dimensions: [
        {
          description: null,
          dimension_id: 'dimension_clarity',
          name: '表达清晰度',
          observable_indicators: ['结构清晰'],
          scoring_scale: { labels: { '5': '优秀' }, maximum: 5, minimum: 1 },
          weight: 1
        }
      ],
      name: '标准量表',
      overall_scale: { maximum: 100, minimum: 0 },
      rubric_id: 'rubric_standard',
      rubric_version: '1.0'
    },
    target_question_count: 5,
    updated_at: '2026-07-20T00:00:00Z',
    workspace_id: 'workspace_one',
    ...overrides
  }
}

/**
 * @brief 构造 Schema 合法的 InterviewSession / Build a schema-valid InterviewSession.
 * @param overrides 顶层覆盖 / Top-level overrides.
 * @return 会话 JSON / Session JSON.
 */
function session(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    created_at: '2026-07-20T00:00:00Z',
    ended_at: null,
    extensions: {},
    id: 'session_one',
    job_target: {
      company: 'Example',
      description: null,
      location: 'Shanghai',
      seniority: 'senior',
      skills: ['TypeScript'],
      source_url: null,
      title: 'Frontend Engineer'
    },
    locale: 'zh-CN',
    media: {
      avatar: {
        avatar_id: null,
        include_expression_cues: true,
        include_visemes: true,
        output_mode: 'audio_only',
        preferred_audio_codecs: ['opus'],
        preferred_video_codecs: [],
        voice_id: null
      },
      fallback_transport: 'audio_only',
      max_video_fps: 30,
      max_video_height: 720,
      max_video_width: 1280,
      screen_share: false,
      user_audio: true,
      user_video: false
    },
    problem: null,
    recording: {
      consent_version: null,
      record_audio: false,
      record_video: false,
      retention_days: 30,
      store_transcript: true,
      user_consent_at: null
    },
    report_id: null,
    resume_ref: null,
    revision: 1,
    scenario_id: 'scenario_one',
    started_at: null,
    status: 'created',
    updated_at: '2026-07-20T00:00:00Z',
    workspace_id: 'workspace_one',
    ...overrides
  }
}

/**
 * @brief 构造 Schema 合法的 InterviewReport / Build a schema-valid InterviewReport.
 * @param overrides 顶层覆盖 / Top-level overrides.
 * @return 报告 JSON / Report JSON.
 */
function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action_plan: [
      {
        practice: '每天练习一次',
        priority: 'high',
        success_criterion: '两分钟内完成',
        title: '先给结论',
        why: '提高可理解性'
      }
    ],
    communication_metrics: {
      average_answer_length_ms: 60_000,
      filler_word_count: 2,
      interruption_count: 0,
      long_pause_count: 1,
      notes: ['回答结构可观察'],
      speaking_time_ms: 600_000,
      words_per_minute: 120
    },
    created_at: '2026-07-20T00:31:00Z',
    executive_summary: richText('整体表现稳定'),
    extensions: {},
    id: 'report_one',
    improvements: [richText('补充权衡')],
    limitations: ['仅根据本次转录评估'],
    overall_confidence: 0.9,
    overall_score: 82,
    question_evaluations: [],
    recording_artifact_ids: [],
    report_version: '1.0',
    revision: 1,
    rubric_ref: { id: 'rubric_standard', version: '1.0' },
    rubric_scores: [
      {
        confidence: 0.9,
        dimension_id: 'dimension_clarity',
        evidence: [{ end_ms: 20_000, quote: '先给结论', segment_id: 'segment_one', start_ms: 0 }],
        improvement_actions: ['补充约束'],
        score: 4,
        summary: richText('结构清晰')
      }
    ],
    session_id: 'session_one',
    strengths: [richText('表达清晰')],
    transcript_artifact_id: null,
    updated_at: '2026-07-20T00:31:00Z',
    ...overrides
  }
}

describe('Interview response validators', (): void => {
  it('accepts complete scenario, session, and report resources', (): void => {
    expect(parseInterviewScenarioDto(scenario())).toMatchObject({ id: 'scenario_one' })
    expect(parseInterviewSessionDto(session())).toMatchObject({ id: 'session_one' })
    expect(parseInterviewReportDto(report())).toMatchObject({ id: 'report_one' })
  })

  it.each([
    ['an undeclared scenario property', scenario({ internal_prompt: 'private' })],
    ['a malformed opaque ID', scenario({ id: 'short' })],
    ['an invalid timestamp', scenario({ created_at: 'today' })],
    ['a fractional duration', scenario({ duration_minutes: 30.5 })],
    ['an out-of-range question count', scenario({ target_question_count: 201 })],
    ['an invalid extension key', scenario({ extensions: { '?private': true } })]
  ])('rejects %s', (_label, candidate): void => {
    expect(() => parseInterviewScenarioDto(candidate)).toThrowError()
  })

  it('rejects nested extras and array constraints in an InterviewScenario', (): void => {
    /** @brief 基础场景 / Base scenario. */
    const base = scenario()
    /** @brief 基础量表 / Base rubric. */
    const rubric = base.rubric as Record<string, unknown>
    expect(() =>
      parseInterviewScenarioDto({
        ...base,
        rubric: {
          ...rubric,
          overall_scale: { maximum: 100, minimum: 0, secret: true }
        }
      })
    ).toThrowError()
    expect(() =>
      parseInterviewScenarioDto({
        ...base,
        focus_areas: Array.from({ length: 101 }, (_unused, index) => `area-${index}`)
      })
    ).toThrowError()
    expect(() =>
      parseInterviewScenarioDto({ ...base, focus_areas: ['same', 'same'] })
    ).toThrowError()
  })

  it('accepts a future ResourceRef code but rejects future values of closed enums', (): void => {
    expect(() =>
      parseInterviewSessionDto(
        session({
          resume_ref: { id: 'resource_one', resource_type: 'future_resource', revision: 1 }
        })
      )
    ).not.toThrow()
    expect(() => parseInterviewSessionDto(session({ status: 'paused' }))).toThrowError()
    expect(() =>
      parseInterviewSessionDto(
        session({
          media: {
            ...(session().media as Record<string, unknown>),
            max_video_fps: 30.5
          }
        })
      )
    ).toThrowError()
  })

  it('validates ignored QuestionEvaluation fields instead of trusting their envelope', (): void => {
    /** @brief 合法问题评价 / Valid question evaluation. */
    const evaluation = {
      answer_segment_ids: ['segment_one'],
      better_answer_outline: richText('更好的回答'),
      confidence: 0.8,
      question_id: 'question_one',
      question_text: '请说明权衡。',
      score: null,
      what_to_improve: ['补充约束'],
      what_worked: ['先给结论']
    }
    expect(() =>
      parseInterviewReportDto(report({ question_evaluations: [{ ...evaluation, private: true }] }))
    ).toThrowError()
    expect(() =>
      parseInterviewReportDto(
        report({ question_evaluations: [{ ...evaluation, confidence: 1.1 }] })
      )
    ).toThrowError()
  })

  it('rejects malformed RichText, report bounds, and fractional observable counters', (): void => {
    /** @brief 含相对链接的非法 RichText / Invalid RichText containing a relative link. */
    const invalidRichText = richText()
    const blocks = invalidRichText.blocks as Record<string, unknown>[]
    const firstBlock = blocks[0] as Record<string, unknown>
    const spans = firstBlock.spans as Record<string, unknown>[]
    spans[0] = { marks: [{ href: '/private', type: 'link' }], text: 'bad' }
    expect(() =>
      parseInterviewReportDto(report({ executive_summary: invalidRichText }))
    ).toThrowError()
    expect(() => parseInterviewReportDto(report({ rubric_scores: [] }))).toThrowError()
    expect(() =>
      parseInterviewReportDto(
        report({
          communication_metrics: {
            ...(report().communication_metrics as Record<string, unknown>),
            filler_word_count: 1.5
          }
        })
      )
    ).toThrowError()
  })
})
