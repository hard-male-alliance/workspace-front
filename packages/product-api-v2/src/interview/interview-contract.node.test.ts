import { describe, expect, it } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import {
  encodeCreateInterviewScenarioRequest,
  parseInterviewScenario,
  type CreateInterviewScenarioRequest
} from './scenario'
import {
  encodeCreateInterviewSessionRequest,
  encodeCreateRealtimeConnectionRequest,
  parseInterviewSession,
  parseInterviewTranscriptPage,
  parseRealtimeConnection
} from './session'
import { parseInterviewReport } from './report'
import { parseKnowledgeSelection } from './wire'

/** @brief 测试 Workspace identity / Workspace identity used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 测试 Scenario identity / Scenario identity used by tests. */
const SCENARIO_ID = 'scenario_01K0EXAMPLE00000001'

/** @brief 测试 Session identity / Session identity used by tests. */
const SESSION_ID = 'session_01K0EXAMPLE000000001'

/** @brief 测试 Report identity / Report identity used by tests. */
const REPORT_ID = 'report_01K0EXAMPLE0000000001'

/** @brief 测试 Rubric identity / Rubric identity used by tests. */
const RUBRIC_ID = 'rubric_01K0EXAMPLE0000000001'

/** @brief 测试维度 identity / Rubric-dimension identity used by tests. */
const DIMENSION_ID = 'dimension_01K0EXAMPLE0000001'

/** @brief 测试 Segment identity / Transcript-segment identity used by tests. */
const SEGMENT_ID = 'segment_01K0EXAMPLE00000001'

/**
 * @brief 构造合法 Scenario 创建请求 / Build a valid Scenario creation request.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical Scenario request / Canonical Scenario request.
 */
function scenarioRequest(
  overrides: Partial<CreateInterviewScenarioRequest> = {}
): CreateInterviewScenarioRequest {
  return {
    allow_barge_in: true,
    allow_followups: true,
    description: 'Evaluate distributed-systems reasoning.',
    difficulty: 'advanced',
    duration_minutes: 45,
    focus_areas: ['consensus', 'availability'],
    interview_type: 'technical_system_design',
    locale: 'zh-CN',
    name: 'Distributed Systems',
    rubric: {
      dimensions: [
        {
          description: 'Separates safety and liveness.',
          dimension_id: DIMENSION_ID,
          name: 'Reasoning',
          observable_indicators: ['States assumptions'],
          scoring_scale: {
            labels: { '0': 'Missing', '100': 'Excellent' },
            maximum: 100,
            minimum: 0
          },
          weight: 1
        }
      ],
      name: 'Systems rubric',
      overall_scale: { maximum: 100, minimum: 0 },
      rubric_id: RUBRIC_ID,
      rubric_version: '2026-07'
    },
    target_question_count: 8,
    ...overrides
  }
}

/**
 * @brief 构造合法 Scenario 响应 / Build a valid Scenario response.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical Scenario JSON / Canonical Scenario JSON.
 */
function scenario(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: SCENARIO_ID,
    revision: 1,
    status: 'active',
    updated_at: '2026-07-22T12:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...scenarioRequest(),
    ...overrides
  }
}

/**
 * @brief 构造合法 Session 创建请求 / Build a valid Session creation request.
 * @return canonical Session request / Canonical Session request.
 */
function sessionRequest(): Record<string, unknown> {
  return {
    inference: {
      allow_external_model_processing: false,
      allow_provider_fallback: true,
      cost_tier: 'standard',
      data_region: 'cn',
      latency_budget_ms: 2000,
      quality_tier: 'balanced'
    },
    job_target: {
      company: 'Example',
      description: null,
      location: 'Shanghai',
      seniority: 'senior',
      skills: ['Distributed Systems'],
      source_url: null,
      title: 'AI Platform Engineer'
    },
    knowledge: {
      agent_scope: 'interview_agent',
      exclude_source_ids: [],
      include_source_ids: [],
      mode: 'policy_default',
      pinned_versions: []
    },
    locale: 'zh-CN',
    media: {
      avatar: {
        avatar_id: 'avatar_klee_01',
        include_expression_cues: true,
        include_visemes: true,
        output_mode: 'client_render',
        preferred_audio_codecs: ['opus'],
        preferred_video_codecs: ['vp9'],
        voice_id: 'voice_zh_01'
      },
      fallback_transport: 'audio_only',
      max_video_fps: 30,
      max_video_height: 1080,
      max_video_width: 1920,
      screen_share: false,
      user_audio: true,
      user_video: false
    },
    recording: {
      consent_version: '2026-07',
      consented_at: '2026-07-22T12:10:00Z',
      record_audio: true,
      record_video: false,
      retention_days: 30,
      store_transcript: true
    },
    resume_ref: {
      id: 'resume_01K0EXAMPLE0000000001',
      resource_type: 'resume',
      revision: 18
    },
    scenario_id: SCENARIO_ID
  }
}

/**
 * @brief 构造合法 Session 响应 / Build a valid Session response.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical Session JSON / Canonical Session JSON.
 */
function session(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  /** @brief 创建请求快照 / Creation-request snapshot. */
  const request = sessionRequest()
  return {
    created_at: '2026-07-22T12:10:00Z',
    ended_at: null,
    id: SESSION_ID,
    job_target: request.job_target,
    locale: request.locale,
    media: request.media,
    recording: request.recording,
    report_id: null,
    resume_ref: request.resume_ref,
    revision: 1,
    scenario_id: request.scenario_id,
    started_at: null,
    status: 'created',
    updated_at: '2026-07-22T12:10:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造合法 RealtimeConnection / Build a valid RealtimeConnection.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical RealtimeConnection JSON / Canonical RealtimeConnection JSON.
 */
function realtimeConnection(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    ephemeral_token: 'ephemeral_token_0123456789_example',
    expires_at: '2026-07-22T12:20:00Z',
    heartbeat_interval_ms: 10_000,
    ice_servers: [
      {
        credential: 'temporary-secret',
        urls: ['turn:turn.example.com:3478?transport=udp'],
        username: 'temporary-user'
      }
    ],
    id: 'connection_01K0EXAMPLE000001',
    session_id: SESSION_ID,
    signaling_url: 'wss://realtime.example.com/interview',
    transport: 'webrtc',
    ...overrides
  }
}

/**
 * @brief 构造合法 InterviewReport / Build a valid InterviewReport.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical InterviewReport JSON / Canonical InterviewReport JSON.
 */
function report(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    action_plan: [
      {
        practice: 'State failure assumptions before selecting a protocol.',
        priority: 'high',
        success_criterion: 'Explains safety and liveness separately.',
        title: 'Structure trade-offs',
        why: 'Makes reasoning auditable.'
      }
    ],
    communication_metrics: {
      average_answer_length_ms: 30_000,
      filler_word_count: 3,
      interruption_count: 0,
      long_pause_count: 1,
      notes: [],
      speaking_time_ms: 180_000,
      words_per_minute: 132.5
    },
    created_at: '2026-07-22T13:00:00Z',
    engine_version: 'interview-evaluator-2.1',
    executive_summary: { plain_text: 'Strong systems reasoning.' },
    generated_at: '2026-07-22T13:00:00Z',
    id: REPORT_ID,
    improvements: [{ plain_text: 'Quantify operational costs.' }],
    limitations: ['No production incident simulation.'],
    overall_confidence: 0.9,
    overall_score: 86,
    report_version: '2.0',
    revision: 1,
    rubric_ref: { id: RUBRIC_ID, version: '2026-07' },
    rubric_scores: [
      {
        confidence: 0.9,
        dimension_id: DIMENSION_ID,
        evidence: [
          {
            end_ms: 12_000,
            quote: 'Safety prevents two leaders in one term.',
            segment_id: SEGMENT_ID,
            start_ms: 8_000
          }
        ],
        improvement_actions: ['Discuss joint consensus.'],
        score: 86,
        summary: { plain_text: 'Clear distinction between guarantees.' }
      }
    ],
    session_id: SESSION_ID,
    strengths: [{ plain_text: 'Explicit assumptions.' }],
    updated_at: '2026-07-22T13:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

describe('API v2 InterviewScenario contract', (): void => {
  it('round-trips a complete strict Scenario request and representation', (): void => {
    expect(encodeCreateInterviewScenarioRequest(scenarioRequest())).toEqual(scenarioRequest())
    expect(parseInterviewScenario(scenario())).toMatchObject({
      id: SCENARIO_ID,
      rubric: { dimensions: [{ dimension_id: DIMENSION_ID }] },
      workspace_id: WORKSPACE_ID
    })
  })

  it('rejects unknown nested fields, duplicate dimensions, invalid scales, and non-unit weights', (): void => {
    /** @brief 带未知字段的 rubric / Rubric carrying an unknown field. */
    const unknownRubric = { ...scenarioRequest().rubric, leaked_prompt: 'secret' }
    expect(() =>
      encodeCreateInterviewScenarioRequest(scenarioRequest({ rubric: unknownRubric }))
    ).toThrow(ApiV2ContractError)

    /** @brief 重复维度的 rubric / Rubric with a duplicate dimension. */
    const firstDimension = scenarioRequest().rubric.dimensions[0]
    if (firstDimension === undefined)
      throw new Error('The Scenario fixture requires one dimension.')
    const duplicateRubric = {
      ...scenarioRequest().rubric,
      dimensions: [firstDimension, firstDimension]
    }
    expect(() =>
      encodeCreateInterviewScenarioRequest(scenarioRequest({ rubric: duplicateRubric }))
    ).toThrow(/duplicate identity/u)

    /** @brief 无效范围的 rubric / Rubric with an invalid scale. */
    const invalidScaleRubric = {
      ...scenarioRequest().rubric,
      overall_scale: { maximum: 0, minimum: 0 }
    }
    expect(() =>
      encodeCreateInterviewScenarioRequest(scenarioRequest({ rubric: invalidScaleRubric }))
    ).toThrow(/minimum must be lower/u)

    /** @brief 权重不合计为一的 rubric / Rubric whose weights do not sum to one. */
    const invalidWeightRubric = {
      ...scenarioRequest().rubric,
      dimensions: [{ ...firstDimension, weight: 0.8 }]
    }
    expect(() =>
      encodeCreateInterviewScenarioRequest(scenarioRequest({ rubric: invalidWeightRubric }))
    ).toThrow(/weights must sum to one/u)
  })
})

describe('API v2 InterviewSession and Realtime contract', (): void => {
  it('accepts the canonical published Interview Session example', async (): Promise<void> => {
    /** @brief 唯一事实来源中的官方样例 / Official example from the single source of truth. */
    const canonical = await readCanonicalExample('interview_session_request')
    expect(encodeCreateInterviewSessionRequest(canonical as never)).toEqual(canonical)
  })

  it('rejects recording without consent or a corresponding enabled media input', (): void => {
    /** @brief 缺少同意的请求 / Request missing consent. */
    const withoutConsent = sessionRequest()
    withoutConsent.recording = {
      ...(withoutConsent.recording as Record<string, unknown>),
      consent_version: null,
      consented_at: null
    }
    expect(() => encodeCreateInterviewSessionRequest(withoutConsent as never)).toThrow(
      /requires consented_at/u
    )

    /** @brief 录音输入关闭的请求 / Request whose audio input is disabled. */
    const withoutAudio = sessionRequest()
    withoutAudio.media = {
      ...(withoutAudio.media as Record<string, unknown>),
      user_audio: false
    }
    expect(() => encodeCreateInterviewSessionRequest(withoutAudio as never)).toThrow(
      /user_audio must be enabled/u
    )
  })

  it('rejects contradictory Knowledge selection and duplicate pinned sources', (): void => {
    expect(() =>
      parseKnowledgeSelection({
        agent_scope: 'interview_agent',
        exclude_source_ids: ['knowledge_01K0EXAMPLE0000001'],
        include_source_ids: ['knowledge_01K0EXAMPLE0000001'],
        mode: 'explicit',
        pinned_versions: []
      })
    ).toThrow(/must be disjoint/u)

    expect(() =>
      parseKnowledgeSelection({
        agent_scope: 'interview_agent',
        exclude_source_ids: [],
        include_source_ids: ['knowledge_01K0EXAMPLE0000001'],
        mode: 'explicit',
        pinned_versions: [
          {
            source_id: 'knowledge_01K0EXAMPLE0000001',
            version_id: 'version_01K0EXAMPLE000000001'
          },
          {
            source_id: 'knowledge_01K0EXAMPLE0000001',
            version_id: 'version_01K0EXAMPLE000000002'
          }
        ]
      })
    ).toThrow(/duplicate identity/u)
  })

  it('enforces Session lifecycle associations and rejects unknown fields', (): void => {
    expect(parseInterviewSession(session())).toMatchObject({
      id: SESSION_ID,
      status: 'created'
    })
    expect(() => parseInterviewSession(session({ started_at: '2026-07-22T12:11:00Z' }))).toThrow(
      /before becoming active/u
    )
    expect(() => parseInterviewSession(session({ secret: 'leak' }))).toThrow(ApiV2ContractError)
  })

  it('strictly validates Realtime capabilities, URL policy, and secret-bearing responses', (): void => {
    expect(
      encodeCreateRealtimeConnectionRequest({
        audio_codecs: ['opus'],
        supported_transports: ['webrtc', 'websocket'],
        video_codecs: ['vp9']
      })
    ).toEqual({
      audio_codecs: ['opus'],
      supported_transports: ['webrtc', 'websocket'],
      video_codecs: ['vp9']
    })
    expect(parseRealtimeConnection(realtimeConnection())).toMatchObject({
      session_id: SESSION_ID,
      transport: 'webrtc'
    })
    expect(() =>
      parseRealtimeConnection(
        realtimeConnection({ signaling_url: 'ws://realtime.example.com/interview' })
      )
    ).toThrow(/permitted Realtime URL/u)
    expect(() =>
      parseRealtimeConnection(realtimeConnection({ ephemeral_token: 'too-short' }))
    ).toThrow(ApiV2ContractError)
  })
})

describe('API v2 Transcript and Report contract', (): void => {
  it('rejects reversed Transcript intervals, duplicate segment identities, and unknown fields', (): void => {
    /** @brief 合法 transcript 页 / Valid transcript page. */
    const transcript = {
      items: [
        {
          end_ms: 2000,
          id: SEGMENT_ID,
          speaker: 'candidate',
          start_ms: 1000,
          text: 'Safety and liveness are separate properties.'
        }
      ],
      page: { has_more: false, next_cursor: null }
    }
    expect(parseInterviewTranscriptPage(transcript)).toMatchObject({
      items: [{ id: SEGMENT_ID }]
    })
    expect(() =>
      parseInterviewTranscriptPage({
        ...transcript,
        items: [{ ...transcript.items[0], end_ms: 500 }]
      })
    ).toThrow(/start_ms cannot exceed/u)
    expect(() =>
      parseInterviewTranscriptPage({
        ...transcript,
        items: [transcript.items[0], transcript.items[0]]
      })
    ).toThrow(/duplicate identity/u)
    expect(() =>
      parseInterviewTranscriptPage({
        ...transcript,
        items: [{ ...transcript.items[0], internal_confidence: 0.9 }]
      })
    ).toThrow(ApiV2ContractError)
  })

  it('decodes evidence-rich reports and fails closed on unverifiable local structure', (): void => {
    expect(parseInterviewReport(report())).toMatchObject({
      id: REPORT_ID,
      rubric_scores: [{ dimension_id: DIMENSION_ID }],
      session_id: SESSION_ID,
      workspace_id: WORKSPACE_ID
    })

    /** @brief 证据区间反转的评分 / Score whose evidence interval is reversed. */
    const score = (report().rubric_scores as readonly Record<string, unknown>[])[0]
    /** @brief 原始证据 / Original evidence. */
    const evidence = (score?.evidence as readonly Record<string, unknown>[])[0]
    expect(() =>
      parseInterviewReport(
        report({
          rubric_scores: [
            {
              ...score,
              evidence: [{ ...evidence, end_ms: 1000, start_ms: 2000 }]
            }
          ]
        })
      )
    ).toThrow(/start_ms cannot exceed/u)

    expect(() =>
      parseInterviewReport(
        report({
          rubric_scores: [
            (report().rubric_scores as readonly unknown[])[0],
            (report().rubric_scores as readonly unknown[])[0]
          ]
        })
      )
    ).toThrow(/duplicate identity/u)
    expect(() => parseInterviewReport(report({ chain_of_thought: 'hidden' }))).toThrow(
      ApiV2ContractError
    )
  })
})
