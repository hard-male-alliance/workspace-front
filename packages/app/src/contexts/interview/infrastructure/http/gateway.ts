/** @file Interview 已冻结 REST 能力的 HTTP Gateway / HTTP Gateway for confirmed Interview REST capabilities. */

import type { InterviewGateway } from '../../application/gateway'
import type {
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSessionId,
  UiInterviewSessionDetails,
  UiInterviewSetupModel
} from '../../domain/models'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import {
  mapInterviewHistoryItem,
  mapInterviewReportDto,
  mapInterviewScenarioDto,
  mapInterviewSessionDetails
} from './mappers'
import type {
  InterviewScenarioDto,
  InterviewSessionCreateRequestDto,
  InterviewSessionDto
} from './transport-types'
import {
  parseInterviewReportDto,
  parseInterviewScenarioDto,
  parseInterviewScenarioListDto,
  parseInterviewSessionDto,
  parseInterviewSessionListDto
} from './validators'

/** @brief Interview HTTP adapter 无法诚实实现的能力 / Capability the Interview HTTP adapter cannot implement honestly. */
export type InterviewCapability =
  'scenario-selection' | 'realtime-connection' | 'session-end' | 'report-not-ready'

/** @brief 已冻结协议不支持当前用户动作 / The confirmed protocol cannot support the current user action. */
export class InterviewCapabilityError extends Error {
  override readonly name = 'InterviewCapabilityError'
  /** @brief 稳定错误码 / Stable error code. */
  readonly code = 'interview.capability_unavailable'
  /** @brief 缺失的领域能力 / Missing domain capability. */
  readonly capability: InterviewCapability
  /** @brief 该错误不能通过原请求盲目重试解决 / This error is not resolved by blindly retrying the same request. */
  readonly retryable = false

  /**
   * @brief 构造能力不可用错误 / Construct a capability-unavailable error.
   * @param capability 缺失能力 / Missing capability.
   * @param message 供开发诊断的说明 / Developer-facing diagnostic message.
   */
  constructor(capability: InterviewCapability, message: string) {
    super(message)
    this.capability = capability
  }
}

/** @brief Interview 会话创建所需的显式宿主策略 / Explicit host policy required to create Interview sessions. */
export interface HttpInterviewGatewayOptions {
  /** @brief 内容语言，不从 DOM 或进程全局推断 / Content locale, never inferred from DOM or process globals. */
  readonly locale: string
  /** @brief 宿主明确支持的媒体能力与偏好 / Media capabilities and preferences explicitly supported by the host. */
  readonly media: {
    readonly userAudio: boolean
    readonly userVideo: boolean
    readonly screenShare: boolean
    readonly maxVideoWidth: number
    readonly maxVideoHeight: number
    readonly maxVideoFps: number
    readonly avatar: {
      readonly outputMode: string
      readonly avatarId: string | null
      readonly voiceId: string | null
      readonly preferredAudioCodecs: readonly string[]
      readonly preferredVideoCodecs: readonly string[]
      readonly includeVisemes: boolean
      readonly includeExpressionCues: boolean
    }
    readonly fallbackTransport: string
  }
  /** @brief 录制、转录与保留策略 / Recording, transcript, and retention policy. */
  readonly recording: {
    readonly recordAudio: boolean
    readonly recordVideo: boolean
    readonly storeTranscript: boolean
    readonly retentionDays: number
    readonly userConsentAt: string | null
    readonly consentVersion: string | null
  }
  /** @brief 服务端无关的推理意图 / Provider-independent inference intent. */
  readonly inference: {
    readonly qualityTier: 'fast' | 'balanced' | 'deep'
    readonly latencyBudgetMs: number | null
    readonly costTier: 'economy' | 'standard' | 'premium'
    readonly dataRegion: 'cn' | 'global' | 'private_deployment'
    readonly allowProviderFallback: boolean
    readonly allowExternalModelProcessing: boolean
  }
  /** @brief Web 或 Electron 的真实客户端能力 / Actual Web or Electron client capabilities. */
  readonly clientCapabilities: {
    readonly platform: 'web' | 'electron'
    readonly webrtc: boolean
    readonly websocketBinary: boolean
    readonly supportedAudioCodecs: readonly string[]
    readonly supportedVideoCodecs: readonly string[]
  }
  /** @brief 可替换的幂等键生成器 / Replaceable idempotency-key factory. */
  readonly createIdempotencyKey?: (() => string) | undefined
}

/** @brief Interview REST HTTP Gateway / Interview REST HTTP Gateway. */
export class HttpInterviewGateway implements InterviewGateway {
  /** @brief 统一产品 HTTP client / Unified product HTTP client. */
  readonly #client: HttpClient
  /** @brief 创建会话所需的宿主策略 / Host policy required for session creation. */
  readonly #options: HttpInterviewGatewayOptions

  /**
   * @brief 构造 Interview HTTP adapter / Construct the Interview HTTP adapter.
   * @param client 统一产品 HTTP client / Unified product HTTP client.
   * @param options 显式宿主能力和数据策略 / Explicit host capabilities and data policy.
   */
  constructor(client: HttpClient, options: HttpInterviewGatewayOptions) {
    this.#client = client
    this.#options = options
  }

  /** @inheritdoc */
  async listCompletedInterviews(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewHistoryItem[]> {
    const sessions = (await this.#listSessions()).filter(
      (session) => session.workspace_id === workspaceId && session.status === 'completed'
    )
    /** @brief 当前列表请求内按 ID 去重的场景读取 / Scenario reads deduplicated by ID within this list request. */
    const scenarios = new Map<string, Promise<InterviewScenarioDto>>()
    /** @brief 当前列表请求内按 ID 去重的报告读取 / Report reads deduplicated by ID within this list request. */
    const reports = new Map<string, Promise<ReturnType<typeof parseInterviewReportDto>>>()
    return Promise.all(
      sessions.map(async (session): Promise<UiInterviewHistoryItem> => {
        if (session.scenario_id === null) {
          throw new HttpContractError(
            'Completed Interview history cannot be projected without scenario_id.',
            200
          )
        }
        scenarios.set(
          session.scenario_id,
          scenarios.get(session.scenario_id) ??
            this.#client
              .getJson(`/interview-scenarios/${encodeURIComponent(session.scenario_id)}`)
              .then((response) => parseInterviewScenarioDto(response.data))
        )
        if (session.report_id !== null) {
          reports.set(
            session.report_id,
            reports.get(session.report_id) ??
              this.#client
                .getJson(`/interview-reports/${encodeURIComponent(session.report_id)}`)
                .then((response) => parseInterviewReportDto(response.data))
          )
        }
        const [scenario, report] = await Promise.all([
          scenarios.get(session.scenario_id),
          session.report_id === null ? Promise.resolve(null) : reports.get(session.report_id)
        ])
        if (scenario === undefined || report === undefined) {
          throw new HttpContractError('Interview history resource lookup was not scheduled.', 200)
        }
        return mapInterviewHistoryItem(session, scenario, report)
      })
    )
  }

  /** @inheritdoc */
  async getInterviewSetup(workspaceId: UiWorkspaceId): Promise<UiInterviewSetupModel> {
    const [scenarios, sessions] = await Promise.all([
      this.listInterviewScenarios(workspaceId),
      this.#listSessions()
    ])
    /** @brief 已按可见字段去重的真实历史岗位 / Real historical job targets deduplicated by visible fields. */
    const jobTargets = new Map<string, UiInterviewSetupModel['jobTargets'][number]>()
    sessions
      .filter((session) => session.workspace_id === workspaceId)
      .forEach((session) => {
        const target = session.job_target
        const key = JSON.stringify([
          target.title,
          target.company,
          target.location,
          target.seniority,
          target.skills
        ])
        jobTargets.set(key, {
          company: target.company,
          location: target.location,
          seniority: target.seniority,
          skills: target.skills,
          title: target.title
        })
      })
    return {
      jobTargets: [...jobTargets.values()],
      realtimeAvailable:
        this.#options.clientCapabilities.webrtc || this.#options.clientCapabilities.websocketBinary,
      scenarios
    }
  }

  /** @inheritdoc */
  async createInterview(input: UiCreateInterviewInput): Promise<UiCreateInterviewResult> {
    input.signal?.throwIfAborted()
    if (
      !this.#options.clientCapabilities.webrtc &&
      !this.#options.clientCapabilities.websocketBinary
    ) {
      throw new InterviewCapabilityError(
        'realtime-connection',
        'This host has no implemented realtime transport, so no unusable Interview session was created.'
      )
    }
    const matchingScenarios = (await this.#listScenarioDtos()).filter(
      (scenario) => scenario.workspace_id === input.workspaceId && scenario.id === input.scenarioId
    )
    if (matchingScenarios.length !== 1) {
      throw new InterviewCapabilityError(
        'scenario-selection',
        matchingScenarios.length === 0
          ? 'The selected backend InterviewScenario is not available in this workspace.'
          : 'The backend returned the selected InterviewScenario more than once.'
      )
    }
    const scenario = matchingScenarios[0]
    if (scenario === undefined) {
      throw new InterviewCapabilityError(
        'scenario-selection',
        'No backend InterviewScenario can be selected.'
      )
    }
    const body: InterviewSessionCreateRequestDto = {
      client_capabilities: {
        platform: this.#options.clientCapabilities.platform,
        supported_audio_codecs: this.#options.clientCapabilities.supportedAudioCodecs,
        supported_video_codecs: this.#options.clientCapabilities.supportedVideoCodecs,
        webrtc: this.#options.clientCapabilities.webrtc,
        websocket_binary: this.#options.clientCapabilities.websocketBinary
      },
      extensions: {},
      inference: {
        allow_external_model_processing: this.#options.inference.allowExternalModelProcessing,
        allow_provider_fallback: this.#options.inference.allowProviderFallback,
        cost_tier: this.#options.inference.costTier,
        data_region: this.#options.inference.dataRegion,
        latency_budget_ms: this.#options.inference.latencyBudgetMs,
        quality_tier: this.#options.inference.qualityTier
      },
      job_target: {
        company: input.jobTarget.company,
        description: null,
        location: input.jobTarget.location,
        seniority: input.jobTarget.seniority,
        skills: input.jobTarget.skills,
        source_url: null,
        title: input.jobTarget.title
      },
      knowledge: {
        agent_scope: 'interview_agent',
        exclude_source_ids: [],
        include_source_ids: input.knowledgeSourceIds,
        mode: input.knowledgeSourceIds.length === 0 ? 'none' : 'explicit',
        pinned_versions: []
      },
      locale: this.#options.locale,
      media: {
        avatar: {
          avatar_id: this.#options.media.avatar.avatarId,
          include_expression_cues: this.#options.media.avatar.includeExpressionCues,
          include_visemes: this.#options.media.avatar.includeVisemes,
          output_mode: this.#options.media.avatar.outputMode,
          preferred_audio_codecs: this.#options.media.avatar.preferredAudioCodecs,
          preferred_video_codecs: this.#options.media.avatar.preferredVideoCodecs,
          voice_id: this.#options.media.avatar.voiceId
        },
        fallback_transport: this.#options.media.fallbackTransport,
        max_video_fps: this.#options.media.maxVideoFps,
        max_video_height: this.#options.media.maxVideoHeight,
        max_video_width: this.#options.media.maxVideoWidth,
        screen_share: this.#options.media.screenShare,
        user_audio: this.#options.media.userAudio,
        user_video: this.#options.media.userVideo
      },
      recording: {
        consent_version: this.#options.recording.consentVersion,
        record_audio: this.#options.recording.recordAudio,
        record_video: this.#options.recording.recordVideo,
        retention_days: this.#options.recording.retentionDays,
        store_transcript: this.#options.recording.storeTranscript,
        user_consent_at: this.#options.recording.userConsentAt
      },
      resume_ref: null,
      scenario_id: scenario.id,
      workspace_id: input.workspaceId
    }
    const response = await this.#client.postJson('/interview-sessions', body, {
      expectedStatus: 201,
      idempotencyKey:
        this.#options.createIdempotencyKey?.() ??
        `interview_session_${globalThis.crypto.randomUUID()}`,
      ...(input.signal === undefined ? {} : { signal: input.signal })
    })
    const session = parseInterviewSessionDto(response.data)
    if (session.workspace_id !== input.workspaceId || session.scenario_id !== scenario.id) {
      throw new HttpContractError(
        'Created Interview session does not belong to the requested workspace and scenario.',
        response.status
      )
    }
    this.#client.assertResourceLocation(
      response,
      `/interview-sessions/${encodeURIComponent(session.id)}`
    )
    return { sessionId: asUiOpaqueId<'interview-session'>(session.id) }
  }

  /** @inheritdoc */
  async listInterviewScenarios(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewScenario[]> {
    return (await this.#listScenarioDtos())
      .filter((scenario) => scenario.workspace_id === workspaceId)
      .map(mapInterviewScenarioDto)
  }

  /** @inheritdoc */
  async getInterviewSessionDetails(
    sessionId: UiInterviewSessionId
  ): Promise<UiInterviewSessionDetails> {
    const sessionResponse = await this.#client.getJson(
      `/interview-sessions/${encodeURIComponent(sessionId)}`
    )
    const session = parseInterviewSessionDto(sessionResponse.data)
    if (session.id !== sessionId) {
      throw new HttpContractError('Backend returned a different Interview session.', 200)
    }
    if (session.scenario_id === null) {
      throw new HttpContractError(
        'Interview session has no scenario required by the summary projection.',
        200
      )
    }
    const scenarioResponse = await this.#client.getJson(
      `/interview-scenarios/${encodeURIComponent(session.scenario_id)}`
    )
    return mapInterviewSessionDetails(session, parseInterviewScenarioDto(scenarioResponse.data))
  }

  /** @inheritdoc */
  getInterviewRuntime(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    void sessionId
    return Promise.reject(this.#realtimeUnavailable())
  }

  /** @inheritdoc */
  submitInterviewAnswer(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    void sessionId
    return Promise.reject(this.#realtimeUnavailable())
  }

  /** @inheritdoc */
  endInterview(sessionId: UiInterviewSessionId): Promise<void> {
    void sessionId
    return Promise.reject(
      new InterviewCapabilityError(
        'session-end',
        'The end-request response contract is not frozen, so the UI cannot report a successful exit.'
      )
    )
  }

  /** @inheritdoc */
  async getInterviewReport(sessionId: UiInterviewSessionId): Promise<UiInterviewReport> {
    const sessionResponse = await this.#client.getJson(
      `/interview-sessions/${encodeURIComponent(sessionId)}`
    )
    const session = parseInterviewSessionDto(sessionResponse.data)
    if (session.id !== sessionId) {
      throw new HttpContractError('Backend returned a different Interview session.', 200)
    }
    if (session.report_id === null) {
      throw new InterviewCapabilityError(
        'report-not-ready',
        'The Interview session has no completed report yet.'
      )
    }
    const reportResponse = await this.#client.getJson(
      `/interview-reports/${encodeURIComponent(session.report_id)}`
    )
    const report = parseInterviewReportDto(reportResponse.data)
    if (report.session_id !== session.id) {
      throw new HttpContractError(
        'Backend returned a report for a different Interview session.',
        200
      )
    }
    return mapInterviewReportDto(report)
  }

  /** @brief 列出全部可访问场景 DTO / List all accessible scenario DTOs. */
  async #listScenarioDtos(): Promise<readonly InterviewScenarioDto[]> {
    return this.#paginate('/interview-scenarios', parseInterviewScenarioListDto)
  }

  /** @brief 列出全部可访问会话 DTO / List all accessible session DTOs. */
  async #listSessions(): Promise<readonly InterviewSessionDto[]> {
    return this.#paginate('/interview-sessions', parseInterviewSessionListDto)
  }

  /** @brief 遍历已冻结的游标分页资源 / Traverse a confirmed cursor-paginated resource. */
  async #paginate<TItem>(
    path: string,
    parsePage: (value: unknown) => {
      readonly items: readonly TItem[]
      readonly page: { readonly next_cursor: string | null }
    }
  ): Promise<readonly TItem[]> {
    /** @brief 已累计的真实资源 / Accumulated real resources. */
    const results: TItem[] = []
    /** @brief 防止服务端游标循环 / Guard against backend cursor loops. */
    const seenCursors = new Set<string>()
    /** @brief 当前不透明游标 / Current opaque cursor. */
    let cursor: string | null = null
    do {
      const response = await this.#client.getJson(path, { query: { cursor, limit: 50 } })
      const page = parsePage(response.data)
      results.push(...page.items)
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new HttpContractError('Backend repeated an Interview pagination cursor.', 200)
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)
    return results
  }

  /** @brief 构造不伪装的 realtime 能力错误 / Construct an honest realtime-capability error. */
  #realtimeUnavailable(): InterviewCapabilityError {
    return new InterviewCapabilityError(
      'realtime-connection',
      'The REST contract is connected, but realtime signaling and media require a dedicated connection lifecycle port.'
    )
  }
}
