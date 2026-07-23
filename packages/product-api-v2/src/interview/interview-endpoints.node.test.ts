import { describe, expect, it, vi } from 'vitest'

import type {
  ApiV2AcceptedResourceResponse,
  ApiV2Client,
  ApiV2CreatedResourceResponse,
  ApiV2JsonResponse,
  ApiV2UpdatedWriteJsonResponse
} from '../http/client'
import { ApiV2ContractError, ApiV2WriteOutcomeUnknownError } from '../http/errors'
import type { CreateInterviewScenarioRequest } from './scenario'
import {
  createWorkspaceInterviewScenario,
  getWorkspaceInterviewScenario,
  listWorkspaceInterviewScenarioPage,
  updateWorkspaceInterviewScenario,
  type InterviewScenarioCreationHttpClient,
  type InterviewScenarioUpdateHttpClient
} from './scenario-client'
import type { CreateInterviewSessionRequest } from './session'
import {
  createWorkspaceInterviewRealtimeConnection,
  createWorkspaceInterviewSession,
  endWorkspaceInterviewSession,
  getWorkspaceInterviewSession,
  listWorkspaceInterviewSessionPage,
  listWorkspaceInterviewTranscriptPage,
  type InterviewEndRequestHttpClient,
  type InterviewRealtimeConnectionHttpClient,
  type InterviewSessionCreationHttpClient
} from './session-client'
import {
  createWorkspaceInterviewReportJob,
  getWorkspaceInterviewReport,
  type InterviewReportJobHttpClient
} from './report-client'

/** @brief 测试 Workspace identity / Workspace identity used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 另一个 Workspace identity / Other Workspace identity used by tests. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试 Scenario identity / Scenario identity used by tests. */
const SCENARIO_ID = 'scenario_01K0EXAMPLE00000001'

/** @brief 测试 Session identity / Session identity used by tests. */
const SESSION_ID = 'session_01K0EXAMPLE000000001'

/** @brief 测试 Connection identity / Connection identity used by tests. */
const CONNECTION_ID = 'connection_01K0EXAMPLE000001'

/** @brief 测试 Report identity / Report identity used by tests. */
const REPORT_ID = 'report_01K0EXAMPLE0000000001'

/** @brief 测试 Job identity / Job identity used by tests. */
const JOB_ID = 'job_01K0EXAMPLE000000000001'

/** @brief 测试 request ID / Request ID used by tests. */
const REQUEST_ID = 'req_interview_example_123456'

/** @brief 测试幂等键 / Idempotency key used by tests. */
const IDEMPOTENCY_KEY = 'interview_intent_000000000001'

/** @brief 当前强 ETag / Current strong ETag. */
const ENTITY_TAG = '"interview-revision-1"'

/** @brief 下一强 ETag / Next strong ETag. */
const NEXT_ENTITY_TAG = '"interview-revision-2"'

/**
 * @brief 构造合法 Scenario request / Build a valid Scenario request.
 * @return canonical Scenario request / Canonical Scenario request.
 */
function scenarioRequest(): CreateInterviewScenarioRequest {
  return {
    allow_barge_in: true,
    allow_followups: true,
    description: 'Systems reasoning.',
    difficulty: 'advanced',
    duration_minutes: 45,
    focus_areas: ['consensus'],
    interview_type: 'technical_system_design',
    locale: 'zh-CN',
    name: 'Systems',
    rubric: {
      dimensions: [
        {
          description: 'Reasoning quality.',
          dimension_id: 'dimension_01K0EXAMPLE0000001',
          name: 'Reasoning',
          observable_indicators: [],
          scoring_scale: { maximum: 100, minimum: 0 },
          weight: 1
        }
      ],
      name: 'Systems rubric',
      overall_scale: { maximum: 100, minimum: 0 },
      rubric_id: 'rubric_01K0EXAMPLE0000000001',
      rubric_version: '2026-07'
    },
    target_question_count: 8
  }
}

/**
 * @brief 构造合法 Scenario JSON / Build valid Scenario JSON.
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
 * @brief 构造合法 Session request / Build a valid Session request.
 * @return canonical Session request / Canonical Session request.
 */
function sessionRequest(): CreateInterviewSessionRequest {
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
      company: null,
      description: null,
      location: null,
      seniority: null,
      skills: [],
      source_url: null,
      title: 'Engineer'
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
        avatar_id: null,
        include_expression_cues: false,
        include_visemes: false,
        output_mode: 'audio_only',
        preferred_audio_codecs: ['opus'],
        preferred_video_codecs: [],
        voice_id: null
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
      consented_at: '2026-07-22T12:00:00Z',
      record_audio: true,
      record_video: false,
      retention_days: 30,
      store_transcript: true
    },
    resume_ref: null,
    scenario_id: SCENARIO_ID
  }
}

/**
 * @brief 构造合法 Session JSON / Build valid Session JSON.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical Session JSON / Canonical Session JSON.
 */
function session(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  /** @brief 创建请求 / Creation request. */
  const request = sessionRequest()
  return {
    created_at: '2026-07-22T12:00:00Z',
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
    updated_at: '2026-07-22T12:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造合法 Job JSON / Build valid Job JSON.
 * @param subjectId Job subject identity / Job subject identity.
 * @return queued Workspace Job / Queued Workspace Job.
 */
function job(subjectId = SESSION_ID): Record<string, unknown> {
  return {
    created_at: '2026-07-22T12:00:00Z',
    finished_at: null,
    id: JOB_ID,
    kind: 'interview.report',
    problem: null,
    progress: null,
    result_refs: [],
    revision: 1,
    started_at: null,
    status: 'queued',
    subject: { id: subjectId, resource_type: 'interview_session' },
    updated_at: '2026-07-22T12:00:00Z',
    workspace_id: WORKSPACE_ID
  }
}

/**
 * @brief 构造合法 Report JSON / Build valid Report JSON.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical Report JSON / Canonical Report JSON.
 */
function report(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    action_plan: [],
    communication_metrics: {
      average_answer_length_ms: null,
      filler_word_count: null,
      interruption_count: null,
      long_pause_count: null,
      notes: [],
      speaking_time_ms: null,
      words_per_minute: null
    },
    created_at: '2026-07-22T13:00:00Z',
    engine_version: 'engine-2',
    executive_summary: { plain_text: 'Summary' },
    generated_at: '2026-07-22T13:00:00Z',
    id: REPORT_ID,
    improvements: [],
    limitations: [],
    overall_confidence: 0.8,
    overall_score: 80,
    report_version: '2.0',
    revision: 1,
    rubric_ref: { id: 'rubric_01K0EXAMPLE0000000001', version: '2026-07' },
    rubric_scores: [],
    session_id: SESSION_ID,
    strengths: [],
    updated_at: '2026-07-22T13:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造严格 GET 响应 / Build a strict GET response.
 * @param data 待领域解码数据 / Data awaiting domain decoding.
 * @param headers 响应头 / Response headers.
 * @return ApiV2JsonResponse / ApiV2JsonResponse.
 */
function getResponse(
  data: unknown,
  headers: HeadersInit = { ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status: 200 }
}

/**
 * @brief 构造固定 201 响应 / Build a fixed 201 response.
 * @param data 响应 body / Response body.
 * @param location 资源 Location / Resource Location.
 * @return created-resource response / created-resource response.
 */
function createdResponse(data: unknown, location: string): ApiV2CreatedResourceResponse {
  return {
    data,
    metadata: { entityTag: ENTITY_TAG, location, requestId: REQUEST_ID },
    status: 201
  }
}

/**
 * @brief 构造固定 202 Job 响应 / Build a fixed 202 Job response.
 * @param data Job body / Job body.
 * @return accepted-resource response / accepted-resource response.
 */
function acceptedResponse(data: unknown): ApiV2AcceptedResourceResponse {
  return {
    data,
    metadata: {
      entityTag: ENTITY_TAG,
      location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
      requestId: REQUEST_ID
    },
    status: 202
  }
}

/**
 * @brief 构造固定 200 更新响应 / Build a fixed 200 update response.
 * @param data 更新后 body / Updated body.
 * @return updated-resource response / updated-resource response.
 */
function updatedResponse(data: unknown): ApiV2UpdatedWriteJsonResponse {
  return {
    data,
    metadata: { entityTag: NEXT_ENTITY_TAG, location: null, requestId: REQUEST_ID },
    status: 200
  }
}

describe('API v2 InterviewScenario endpoints', (): void => {
  it('uses the exact four Scenario routes, cursor, ETag, Location, idempotency, and AbortSignal', async (): Promise<void> => {
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const controller = new AbortController()
    /** @brief 可观察 GET port / Observable GET port. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(
        getResponse({ items: [scenario()], page: { has_more: false, next_cursor: null } })
      )
      .mockResolvedValueOnce(getResponse(scenario()))

    await listWorkspaceInterviewScenarioPage(
      { getJson },
      { cursor: 'next page', limit: 17, signal: controller.signal, workspaceId: WORKSPACE_ID }
    )
    await expect(
      getWorkspaceInterviewScenario(
        { getJson },
        { scenarioId: SCENARIO_ID, workspaceId: WORKSPACE_ID }
      )
    ).resolves.toMatchObject({ entityTag: ENTITY_TAG, value: { id: SCENARIO_ID } })
    expect(getJson).toHaveBeenNthCalledWith(1, `/workspaces/${WORKSPACE_ID}/interview-scenarios`, {
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      query: { cursor: 'next page', limit: 17 },
      signal: controller.signal
    })

    /** @brief Scenario 创建 port / Scenario creation port. */
    const createPost = vi
      .fn<InterviewScenarioCreationHttpClient['postJson']>()
      .mockResolvedValue(
        createdResponse(
          scenario(),
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-scenarios/${SCENARIO_ID}`
        )
      )
    await createWorkspaceInterviewScenario(
      { postJson: createPost },
      { idempotencyKey: IDEMPOTENCY_KEY, request: scenarioRequest(), workspaceId: WORKSPACE_ID }
    )
    expect(createPost).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-scenarios`,
      scenarioRequest(),
      expect.objectContaining({
        idempotencyKey: IDEMPOTENCY_KEY,
        successKind: 'created-resource'
      })
    )

    /** @brief Scenario PATCH port / Scenario PATCH port. */
    const patchJson = vi
      .fn<InterviewScenarioUpdateHttpClient['patchJson']>()
      .mockResolvedValue(updatedResponse(scenario({ name: 'Updated Systems' })))
    await updateWorkspaceInterviewScenario(
      { patchJson },
      {
        ifMatch: ENTITY_TAG,
        request: { name: 'Updated Systems' },
        scenarioId: SCENARIO_ID,
        workspaceId: WORKSPACE_ID
      }
    )
    expect(patchJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-scenarios/${SCENARIO_ID}`,
      { name: 'Updated Systems' },
      expect.objectContaining({ ifMatch: ENTITY_TAG })
    )
  })

  it('fails closed on cross-Workspace reads, missing ETag, and untrustworthy successful writes', async (): Promise<void> => {
    /** @brief 依次返回越权与缺头表示的 GET / GET returning cross-tenant and missing-header representations. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(
        getResponse({
          items: [scenario({ workspace_id: OTHER_WORKSPACE_ID })],
          page: { has_more: false, next_cursor: null }
        })
      )
      .mockResolvedValueOnce(getResponse(scenario(), { 'X-Request-Id': REQUEST_ID }))
    await expect(
      listWorkspaceInterviewScenarioPage({ getJson }, { workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/outside the requested Workspace/u)
    await expect(
      getWorkspaceInterviewScenario(
        { getJson },
        { scenarioId: SCENARIO_ID, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    /** @brief 返回错误 Workspace 的 201 / 201 returning the wrong Workspace. */
    const postJson = vi
      .fn<InterviewScenarioCreationHttpClient['postJson']>()
      .mockResolvedValue(
        createdResponse(
          scenario({ workspace_id: OTHER_WORKSPACE_ID }),
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-scenarios/${SCENARIO_ID}`
        )
      )
    await expect(
      createWorkspaceInterviewScenario(
        { postJson },
        { idempotencyKey: IDEMPOTENCY_KEY, request: scenarioRequest(), workspaceId: WORKSPACE_ID }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })
})

describe('API v2 InterviewSession, Connection, EndRequest, and Transcript endpoints', (): void => {
  it('uses the exact Session reads, creation, and Transcript cursor route', async (): Promise<void> => {
    /** @brief 可观察 GET port / Observable GET port. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(
        getResponse({ items: [session()], page: { has_more: false, next_cursor: null } })
      )
      .mockResolvedValueOnce(getResponse(session()))
      .mockResolvedValueOnce(
        getResponse({
          items: [
            {
              end_ms: 1000,
              id: 'segment_01K0EXAMPLE00000001',
              speaker: 'candidate',
              start_ms: 0,
              text: 'Answer'
            }
          ],
          page: { has_more: true, next_cursor: 'next-transcript-page' }
        })
      )
    await listWorkspaceInterviewSessionPage({ getJson }, { workspaceId: WORKSPACE_ID })
    await getWorkspaceInterviewSession(
      { getJson },
      { sessionId: SESSION_ID, workspaceId: WORKSPACE_ID }
    )
    await listWorkspaceInterviewTranscriptPage(
      { getJson },
      { cursor: 'current', limit: 25, sessionId: SESSION_ID, workspaceId: WORKSPACE_ID }
    )
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      `/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/transcript`,
      {
        expectedStatus: 200,
        maxResponseBytes: 8 * 1024 * 1024,
        query: { cursor: 'current', limit: 25 }
      }
    )

    /** @brief Session 创建 port / Session creation port. */
    const postJson = vi
      .fn<InterviewSessionCreationHttpClient['postJson']>()
      .mockResolvedValue(
        createdResponse(
          session(),
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}`
        )
      )
    await createWorkspaceInterviewSession(
      { postJson },
      { idempotencyKey: IDEMPOTENCY_KEY, request: sessionRequest(), workspaceId: WORKSPACE_ID }
    )
    expect(postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-sessions`,
      sessionRequest(),
      expect.objectContaining({
        idempotencyKey: IDEMPOTENCY_KEY,
        successKind: 'created-resource'
      })
    )
  })

  it('issues one short-lived Connection and ends a Session with strong If-Match', async (): Promise<void> => {
    /** @brief Connection JSON / Connection JSON. */
    const connection = {
      ephemeral_token: 'ephemeral_token_0123456789_example',
      expires_at: '2026-07-22T12:20:00Z',
      heartbeat_interval_ms: 10_000,
      ice_servers: [],
      id: CONNECTION_ID,
      session_id: SESSION_ID,
      signaling_url: 'wss://realtime.example.com/interview',
      transport: 'webrtc'
    }
    /** @brief Connection 创建 port / Connection creation port. */
    const connectionPost = vi
      .fn<InterviewRealtimeConnectionHttpClient['postJson']>()
      .mockResolvedValue(
        createdResponse(
          connection,
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/connections/${CONNECTION_ID}`
        )
      )
    await createWorkspaceInterviewRealtimeConnection(
      { postJson: connectionPost },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        request: {
          audio_codecs: ['opus'],
          supported_transports: ['webrtc'],
          video_codecs: []
        },
        sessionId: SESSION_ID,
        workspaceId: WORKSPACE_ID
      }
    )
    expect(connectionPost).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/connections`,
      {
        audio_codecs: ['opus'],
        supported_transports: ['webrtc'],
        video_codecs: []
      },
      expect.objectContaining({ successKind: 'created-resource' })
    )

    /** @brief EndRequest port / EndRequest port. */
    const endPost = vi
      .fn<InterviewEndRequestHttpClient['postJson']>()
      .mockResolvedValue(acceptedResponse(job()))
    await endWorkspaceInterviewSession(
      { postJson: endPost },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: ENTITY_TAG,
        request: { reason: 'completed' },
        sessionId: SESSION_ID,
        workspaceId: WORKSPACE_ID
      }
    )
    expect(endPost).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/end-requests`,
      { reason: 'completed' },
      expect.objectContaining({
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: ENTITY_TAG,
        successKind: 'accepted-resource'
      })
    )
  })

  it('marks mismatched successful Session, Connection, and EndRequest bodies as outcome unknown', async (): Promise<void> => {
    /** @brief 已推进的 Session 创建响应 / Session creation response that already advanced. */
    const sessionPost = vi.fn<InterviewSessionCreationHttpClient['postJson']>().mockResolvedValue(
      createdResponse(
        session({
          started_at: '2026-07-22T12:01:00Z',
          status: 'active'
        }),
        `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}`
      )
    )
    await expect(
      createWorkspaceInterviewSession(
        { postJson: sessionPost },
        { idempotencyKey: IDEMPOTENCY_KEY, request: sessionRequest(), workspaceId: WORKSPACE_ID }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)

    /** @brief 错误 Session 的 Connection / Connection for the wrong Session. */
    const connectionPost = vi
      .fn<InterviewRealtimeConnectionHttpClient['postJson']>()
      .mockResolvedValue(
        createdResponse(
          {
            ephemeral_token: 'ephemeral_token_0123456789_example',
            expires_at: '2026-07-22T12:20:00Z',
            heartbeat_interval_ms: 10_000,
            ice_servers: [],
            id: CONNECTION_ID,
            session_id: 'session_01K0OTHER00000000001',
            signaling_url: 'wss://realtime.example.com/interview',
            transport: 'webrtc'
          },
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/connections/${CONNECTION_ID}`
        )
      )
    await expect(
      createWorkspaceInterviewRealtimeConnection(
        { postJson: connectionPost },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          request: { audio_codecs: [], supported_transports: ['webrtc'], video_codecs: [] },
          sessionId: SESSION_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)

    /** @brief 错误 subject 的 Job / Job with the wrong subject. */
    const endPost = vi
      .fn<InterviewEndRequestHttpClient['postJson']>()
      .mockResolvedValue(acceptedResponse(job('session_01K0OTHER00000000001')))
    await expect(
      endWorkspaceInterviewSession(
        { postJson: endPost },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          ifMatch: ENTITY_TAG,
          request: { reason: 'completed' },
          sessionId: SESSION_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })
})

describe('API v2 Interview ReportJob and Report endpoints', (): void => {
  it('creates a 202 ReportJob and reads the authoritative Report with ETag', async (): Promise<void> => {
    /** @brief ReportJob port / ReportJob port. */
    const postJson = vi
      .fn<InterviewReportJobHttpClient['postJson']>()
      .mockResolvedValue(acceptedResponse(job()))
    await createWorkspaceInterviewReportJob(
      { postJson },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        request: { rubric_version: '2026-07' },
        sessionId: SESSION_ID,
        workspaceId: WORKSPACE_ID
      }
    )
    expect(postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-sessions/${SESSION_ID}/report-jobs`,
      { rubric_version: '2026-07' },
      expect.objectContaining({
        idempotencyKey: IDEMPOTENCY_KEY,
        successKind: 'accepted-resource'
      })
    )

    /** @brief Report GET port / Report GET port. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(getResponse(report()))
    await expect(
      getWorkspaceInterviewReport({ getJson }, { reportId: REPORT_ID, workspaceId: WORKSPACE_ID })
    ).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: { id: REPORT_ID, session_id: SESSION_ID }
    })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/interview-reports/${REPORT_ID}`,
      { expectedStatus: 200, maxResponseBytes: 16 * 1024 * 1024 }
    )
  })

  it('fails closed on a Report path mismatch and an accepted Job for another Session', async (): Promise<void> => {
    /** @brief 错误 Report identity 的 GET / GET returning the wrong Report identity. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(report({ id: 'report_01K0OTHER00000000001' })))
    await expect(
      getWorkspaceInterviewReport({ getJson }, { reportId: REPORT_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/identity path/u)

    /** @brief 错误 subject 的 ReportJob / ReportJob with the wrong subject. */
    const postJson = vi
      .fn<InterviewReportJobHttpClient['postJson']>()
      .mockResolvedValue(acceptedResponse(job('session_01K0OTHER00000000001')))
    await expect(
      createWorkspaceInterviewReportJob(
        { postJson },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          request: {},
          sessionId: SESSION_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })
})
