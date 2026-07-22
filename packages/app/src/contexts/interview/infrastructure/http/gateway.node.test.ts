import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import {
  HttpInterviewGateway,
  InterviewCapabilityError,
  type HttpInterviewGatewayOptions
} from './gateway'

/** @brief 构造契约有效的量表维度 / Build a contract-valid rubric dimension. */
function rubricDimension(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: null,
    dimension_id: 'dimension_clarity',
    name: '表达清晰度',
    observable_indicators: ['结构清晰'],
    scoring_scale: { labels: { '5': '优秀' }, maximum: 5, minimum: 1 },
    weight: 1,
    ...overrides
  }
}

/** @brief 构造契约有效的场景响应 / Build a contract-valid scenario response. */
function scenario(
  id = 'scenario_one',
  rubricOverrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    allow_barge_in: true,
    allow_followups: true,
    created_at: '2026-07-20T00:00:00Z',
    difficulty: 'standard',
    duration_minutes: 30,
    extensions: {},
    focus_areas: ['系统设计'],
    id,
    interview_type: 'mixed',
    interviewer_persona: null,
    name: '综合面试',
    revision: 1,
    rubric: {
      dimensions: [rubricDimension()],
      name: '标准量表',
      overall_scale: { maximum: 100, minimum: 0 },
      rubric_id: 'rubric_standard',
      rubric_version: '1.0',
      ...rubricOverrides
    },
    target_question_count: 5,
    updated_at: '2026-07-20T00:00:00Z',
    workspace_id: 'workspace_one'
  }
}

/** @brief 构造契约有效的量表维度分数 / Build a contract-valid rubric-dimension score. */
function rubricScore(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    confidence: 0.9,
    dimension_id: 'dimension_clarity',
    evidence: [{ end_ms: 20_000, quote: '先给结论', segment_id: 'segment_one', start_ms: 0 }],
    improvement_actions: ['补充约束'],
    score: 4,
    summary: richText('结构清晰'),
    ...overrides
  }
}

/** @brief 构造契约有效的会话响应 / Build a contract-valid session response. */
function session(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    created_at: '2026-07-20T00:00:00Z',
    ended_at: '2026-07-20T00:30:00Z',
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
    report_id: 'report_one',
    resume_ref: null,
    revision: 1,
    scenario_id: 'scenario_one',
    started_at: '2026-07-20T00:00:00Z',
    status: 'completed',
    updated_at: '2026-07-20T00:30:00Z',
    workspace_id: 'workspace_one',
    ...overrides
  }
}

/** @brief 构造简单 RichText / Build simple RichText. */
function richText(text: string): Record<string, unknown> {
  return {
    blocks: [
      {
        align: 'start',
        block_id: `block_${text.length}_id`,
        spans: [{ marks: [], text }],
        type: 'paragraph'
      }
    ],
    plain_text: null,
    schema_version: '1.0'
  }
}

/** @brief 构造契约有效的报告响应 / Build a contract-valid report response. */
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
    rubric_scores: [rubricScore()],
    session_id: 'session_one',
    strengths: [richText('表达清晰')],
    transcript_artifact_id: null,
    updated_at: '2026-07-20T00:31:00Z',
    ...overrides
  }
}

/**
 * @brief 构造总结聚合的三次权威读取 / Build the three authoritative reads for a summary aggregate.
 * @param scenarioPayload 场景响应 / Scenario response.
 * @param reportPayload 报告响应 / Report response.
 * @return 按会话、场景、报告顺序响应的 fetch 替身 / Fetch double responding with session, scenario, and report in order.
 */
function summaryFetch(
  scenarioPayload: Record<string, unknown>,
  reportPayload: Record<string, unknown>
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(session()))
    .mockResolvedValueOnce(Response.json(scenarioPayload))
    .mockResolvedValueOnce(Response.json(reportPayload))
}

/** @brief 构造游标列表响应 / Build a cursor-list response. */
function page(items: readonly unknown[]): Response {
  return Response.json({
    items,
    page: { has_more: false, next_cursor: null, total_estimate: items.length }
  })
}

/** @brief 测试使用的显式宿主策略 / Explicit host policy used by tests. */
const options: HttpInterviewGatewayOptions = {
  clientCapabilities: {
    platform: 'web',
    supportedAudioCodecs: ['opus'],
    supportedVideoCodecs: [],
    webrtc: true,
    websocketBinary: true
  },
  inference: {
    allowExternalModelProcessing: false,
    allowProviderFallback: true,
    costTier: 'standard',
    dataRegion: 'cn',
    latencyBudgetMs: 2_000,
    qualityTier: 'balanced'
  },
  locale: 'zh-CN',
  media: {
    avatar: {
      avatarId: null,
      includeExpressionCues: true,
      includeVisemes: true,
      outputMode: 'audio_only',
      preferredAudioCodecs: ['opus'],
      preferredVideoCodecs: [],
      voiceId: null
    },
    fallbackTransport: 'audio_only',
    maxVideoFps: 30,
    maxVideoHeight: 720,
    maxVideoWidth: 1280,
    screenShare: false,
    userAudio: true,
    userVideo: false
  },
  recording: {
    consentVersion: null,
    recordAudio: false,
    recordVideo: false,
    retentionDays: 30,
    storeTranscript: true,
    userConsentAt: null
  }
}

/** @brief 从 fetch 调用读取请求 URL / Read a request URL from a fetch call. */
function fetchUrl(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const input = fetchImpl.mock.calls[callIndex]?.[0]
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  throw new Error('Expected a fetch request URL.')
}

describe('HttpInterviewGateway', (): void => {
  it('lists and maps real scenarios while filtering the requested workspace locally', async (): Promise<void> => {
    const otherScenario = { ...scenario('scenario_other'), workspace_id: 'workspace_other' }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(page([scenario(), otherScenario]))
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const scenarios = await gateway.listInterviewScenarios('workspace_one' as never)

    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]).toMatchObject({
      difficulty: 'standard',
      interviewType: 'mixed',
      name: '综合面试'
    })
    expect(fetchUrl(fetchImpl, 0)).toBe('http://127.0.0.1:8000/api/v1/interview-scenarios?limit=50')
  })

  it('creates a session from one exact backend scenario using the confirmed request shape', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url.includes('/interview-scenarios')) return Promise.resolve(page([scenario()]))
      expect(init?.headers).toMatchObject({ 'Idempotency-Key': 'interview_session_request_one' })
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body.')
      const body = JSON.parse(init.body) as Record<string, unknown>
      expect(body).toMatchObject({
        client_capabilities: { platform: 'web', webrtc: true },
        knowledge: {
          agent_scope: 'interview_agent',
          include_source_ids: ['knowledge_one'],
          mode: 'explicit'
        },
        locale: 'zh-CN',
        scenario_id: 'scenario_one',
        workspace_id: 'workspace_one'
      })
      expect(body).not.toHaveProperty('focus_prompt')
      return Promise.resolve(
        Response.json(
          session({ ended_at: null, report_id: null, started_at: null, status: 'created' }),
          {
            headers: { Location: '/api/v1/interview-sessions/session_one' },
            status: 201
          }
        )
      )
    })
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const result = await gateway.createInterview({
      commandId: 'interview_session_request_one' as never,
      jobTarget: {
        company: 'Example',
        location: 'Shanghai',
        seniority: 'senior',
        skills: ['TypeScript'],
        title: 'Frontend Engineer'
      },
      knowledgeSourceIds: ['knowledge_one' as never],
      scenarioId: 'scenario_one' as never,
      workspaceId: 'workspace_one' as never
    })

    expect(result.sessionId).toBe('session_one')
    expect(fetchUrl(fetchImpl, 1)).toBe('http://127.0.0.1:8000/api/v1/interview-sessions')
  })

  it('confirms an unknown creation by replaying the frozen envelope without another preflight read', async (): Promise<void> => {
    /** @brief 场景读取、未知 POST 与同键确认响应组成的网络替身 / Network double providing scenario preflight, an unknown POST, and same-key confirmation. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([scenario()]))
      .mockRejectedValueOnce(new TypeError('private connection reset'))
      .mockResolvedValueOnce(
        Response.json(
          session({ ended_at: null, report_id: null, started_at: null, status: 'created' }),
          {
            headers: { Location: '/api/v1/interview-sessions/session_one' },
            status: 201
          }
        )
      )
    /** @brief 被测 Interview Gateway / Interview Gateway under test. */
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )
    /** @brief 两次确认必须复用的创建输入 / Creation input that both confirmation attempts must reuse. */
    const input = {
      commandId: 'interview_session_request_confirm' as never,
      jobTarget: {
        company: 'Example',
        location: 'Shanghai',
        seniority: 'senior',
        skills: ['TypeScript'],
        title: 'Frontend Engineer'
      },
      knowledgeSourceIds: ['knowledge_one' as never],
      scenarioId: 'scenario_one' as never,
      workspaceId: 'workspace_one' as never
    }

    await expect(gateway.createInterview(input)).rejects.toMatchObject({
      name: 'HttpCommandOutcomeUnknownError'
    })
    await expect(gateway.createInterview(input)).resolves.toEqual({ sessionId: 'session_one' })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchUrl(fetchImpl, 0)).toContain('/interview-scenarios')
    expect(fetchUrl(fetchImpl, 1)).toContain('/interview-sessions')
    expect(fetchUrl(fetchImpl, 2)).toContain('/interview-sessions')
    expect(fetchImpl.mock.calls[2]?.[1]?.body).toBe(fetchImpl.mock.calls[1]?.[1]?.body)
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'interview_session_request_confirm'
    })
    expect(fetchImpl.mock.calls[2]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'interview_session_request_confirm'
    })
  })

  it('marks an Interview creation with a different Location as outcome unknown', async (): Promise<void> => {
    /** @brief 依次返回场景列表和错误 Location 的网络替身 / Network double returning scenarios and a wrong Location. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([scenario()]))
      .mockResolvedValueOnce(
        Response.json(
          session({ ended_at: null, report_id: null, started_at: null, status: 'created' }),
          {
            headers: { Location: '/api/v1/interview-sessions/session_other' },
            status: 201
          }
        )
      )
    /** @brief 被测 Interview Gateway / Interview Gateway under test. */
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    await expect(
      gateway.createInterview({
        commandId: 'interview_session_request_one' as never,
        jobTarget: {
          company: null,
          location: null,
          seniority: null,
          skills: [],
          title: 'Frontend Engineer'
        },
        knowledgeSourceIds: [],
        scenarioId: 'scenario_one' as never,
        workspaceId: 'workspace_one' as never
      })
    ).rejects.toMatchObject({
      diagnosticKind: 'contract',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it('aggregates scored completed history from session, scenario, and report resources', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url.includes('/interview-sessions?')) return Promise.resolve(page([session()]))
      if (url.includes('/interview-scenarios/')) return Promise.resolve(Response.json(scenario()))
      if (url.includes('/interview-reports/')) return Promise.resolve(Response.json(report()))
      throw new Error(`Unexpected URL: ${url}`)
    })
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const history = await gateway.listCompletedInterviews('workspace_one' as never)

    expect(history).toEqual([
      expect.objectContaining({ durationMinutes: 30, overallScore: 82, sessionId: 'session_one' })
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('keeps a completed session in history before its report is available', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url.includes('/interview-sessions?')) {
        return Promise.resolve(page([session({ report_id: null })]))
      }
      if (url.includes('/interview-scenarios/')) return Promise.resolve(Response.json(scenario()))
      throw new Error(`Unexpected URL: ${url}`)
    })
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const history = await gateway.listCompletedInterviews('workspace_one' as never)

    expect(history).toEqual([
      expect.objectContaining({ overallScore: null, sessionId: 'session_one' })
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('maps a report and derives RichText when plain_text is absent', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session()))
      .mockResolvedValueOnce(Response.json(scenario()))
      .mockResolvedValueOnce(Response.json(report()))
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const result = await gateway.getInterviewSummary('session_one' as never)

    expect(result.report).toMatchObject({
      executiveSummary: '整体表现稳定',
      improvements: ['补充权衡'],
      strengths: ['表达清晰']
    })
  })

  it('interprets a non-percent report through the exact scenario rubric from one session snapshot', async (): Promise<void> => {
    /** @brief 使用 1..5 总分量表的场景响应 / Scenario response using a 1..5 overall scale. */
    const scenarioPayload = scenario('scenario_one', {
      dimensions: [
        rubricDimension(),
        rubricDimension({
          dimension_id: 'dimension_systems',
          name: '系统性'
        })
      ],
      overall_scale: { maximum: 5, minimum: 1 }
    })
    /** @brief 与该场景量表一致的报告响应 / Report response consistent with that scenario rubric. */
    const reportPayload = report({ overall_score: 4 })
    /** @brief 可观察总结聚合读取次数与地址的网络替身 / Network double exposing summary read count and URLs. */
    const fetchImpl = summaryFetch(scenarioPayload, reportPayload)
    /** @brief 被测 Interview Gateway / Interview Gateway under test. */
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const result = await gateway.getInterviewSummary('session_one' as never)

    expect(result.report).toMatchObject({
      overallMaximumScore: 5,
      overallMinimumScore: 1,
      overallScore: 4,
      rubricScores: [
        expect.objectContaining({
          dimensionId: 'dimension_clarity',
          dimensionName: '表达清晰度',
          maximumScore: 5,
          minimumScore: 1,
          score: 4
        })
      ]
    })
    expect(result.details.scenario.rubric.dimensions).toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchUrl(fetchImpl, 0)).toBe(
      'http://127.0.0.1:8000/api/v1/interview-sessions/session_one'
    )
    expect(fetchUrl(fetchImpl, 1)).toBe(
      'http://127.0.0.1:8000/api/v1/interview-scenarios/scenario_one'
    )
    expect(fetchUrl(fetchImpl, 2)).toBe('http://127.0.0.1:8000/api/v1/interview-reports/report_one')
  })

  it.each([
    {
      caseName: 'a different rubric ID',
      reportPayload: report({ rubric_ref: { id: 'rubric_other', version: '1.0' } }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'a different rubric version',
      reportPayload: report({ rubric_ref: { id: 'rubric_standard', version: '2.0' } }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'an overall score above its scale',
      reportPayload: report({ overall_score: 6 }),
      scenarioPayload: scenario('scenario_one', {
        overall_scale: { maximum: 5, minimum: 1 }
      })
    },
    {
      caseName: 'a dimension score above its scale',
      reportPayload: report({ rubric_scores: [rubricScore({ score: 6 })] }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'an unknown dimension ID',
      reportPayload: report({
        rubric_scores: [rubricScore({ dimension_id: 'dimension_unknown' })]
      }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'a duplicate dimension score',
      reportPayload: report({ rubric_scores: [rubricScore(), rubricScore()] }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'a non-positive overall scale',
      reportPayload: report(),
      scenarioPayload: scenario('scenario_one', {
        overall_scale: { maximum: 1, minimum: 1 }
      })
    },
    {
      caseName: 'a non-positive dimension scale',
      reportPayload: report(),
      scenarioPayload: scenario('scenario_one', {
        dimensions: [
          rubricDimension({
            scoring_scale: { labels: {}, maximum: 5, minimum: 5 }
          })
        ]
      })
    }
  ])(
    'fails closed when the summary combines $caseName',
    async ({ reportPayload, scenarioPayload }): Promise<void> => {
      /** @brief 当前无效组合对应的网络替身 / Network double for the current invalid combination. */
      const fetchImpl = summaryFetch(scenarioPayload, reportPayload)
      /** @brief 被测 Interview Gateway / Interview Gateway under test. */
      const gateway = new HttpInterviewGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
        options
      )

      await expect(gateway.getInterviewSummary('session_one' as never)).rejects.toMatchObject({
        name: 'HttpContractError'
      })
    }
  )

  it.each([
    {
      caseName: 'references another rubric',
      reportPayload: report({ rubric_ref: { id: 'rubric_other', version: '1.0' } }),
      scenarioPayload: scenario()
    },
    {
      caseName: 'contains an out-of-range score',
      reportPayload: report({ rubric_scores: [rubricScore({ score: 6 })] }),
      scenarioPayload: scenario()
    }
  ])(
    'fails closed when completed history $caseName',
    async ({ reportPayload, scenarioPayload }): Promise<void> => {
      /** @brief 返回一条完成会话及其关联资源的网络替身 / Network double returning one completed session and its related resources. */
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input.toString()
        if (url.includes('/interview-sessions?')) return Promise.resolve(page([session()]))
        if (url.includes('/interview-scenarios/')) {
          return Promise.resolve(Response.json(scenarioPayload))
        }
        if (url.includes('/interview-reports/')) {
          return Promise.resolve(Response.json(reportPayload))
        }
        throw new Error(`Unexpected URL: ${url}`)
      })
      /** @brief 被测 Interview Gateway / Interview Gateway under test. */
      const gateway = new HttpInterviewGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
        options
      )

      await expect(gateway.listCompletedInterviews('workspace_one' as never)).rejects.toMatchObject(
        {
          name: 'HttpContractError'
        }
      )
    }
  )

  it('derives summary session duration from authoritative REST timestamps', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session()))
      .mockResolvedValueOnce(Response.json(scenario()))
      .mockResolvedValueOnce(Response.json(report()))
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    const { details } = await gateway.getInterviewSummary('session_one' as never)

    expect(details).toMatchObject({
      durationMinutes: 30,
      scenario: { id: 'scenario_one' },
      session: { id: 'session_one' }
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('rejects an unusable session before POST and never returns fake realtime state', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>()
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      {
        ...options,
        clientCapabilities: {
          ...options.clientCapabilities,
          webrtc: false,
          websocketBinary: false
        }
      }
    )

    await expect(
      gateway.createInterview({
        commandId: 'interview_session_request_one' as never,
        jobTarget: {
          company: null,
          location: null,
          seniority: null,
          skills: [],
          title: 'Frontend Engineer'
        },
        knowledgeSourceIds: [],
        scenarioId: 'scenario_one' as never,
        workspaceId: 'workspace_one' as never
      })
    ).rejects.toMatchObject({
      capability: 'realtime-connection',
      name: 'InterviewCapabilityError'
    })
    await expect(gateway.getInterviewRuntime('session_one' as never)).rejects.toBeInstanceOf(
      InterviewCapabilityError
    )
    await expect(gateway.submitInterviewAnswer('session_one' as never)).rejects.toMatchObject({
      capability: 'realtime-connection'
    })
    await expect(gateway.endInterview('session_one' as never)).rejects.toMatchObject({
      capability: 'session-end'
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects contract-invalid response fields before they reach the domain', async (): Promise<void> => {
    const invalidScenario = { ...scenario(), unexpected_demo_field: true }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(page([invalidScenario]))
    const gateway = new HttpInterviewGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl }),
      options
    )

    await expect(gateway.listInterviewScenarios('workspace_one' as never)).rejects.toMatchObject({
      name: 'HttpContractError'
    })
  })
})
