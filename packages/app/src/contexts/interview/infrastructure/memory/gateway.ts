/** @file Interview API v2 的可信内存 adapter / Trustworthy in-memory adapter for Interview API v2. */

import type { InterviewGateway } from '../../application/gateway'
import type {
  UiCreateInterviewReportJobCommand,
  UiCreateInterviewScenarioCommand,
  UiCreateInterviewSessionCommand,
  UiCreateRealtimeConnectionCommand,
  UiEndInterviewSessionCommand,
  UiInterviewReportRead,
  UiInterviewScenarioPageRead,
  UiInterviewScenarioRead,
  UiInterviewSessionPageRead,
  UiInterviewSessionRead,
  UiInterviewTranscriptPageRead,
  UiUpdateInterviewScenarioCommand
} from '../../application/requests'
import {
  asUiInterviewScenarioCursor,
  asUiInterviewSessionCursor,
  asUiInterviewTranscriptCursor,
  type UiInterviewReport,
  type UiInterviewScenario,
  type UiInterviewScenarioAuthority,
  type UiInterviewScenarioId,
  type UiInterviewScenarioPage,
  type UiInterviewSession,
  type UiInterviewSessionAuthority,
  type UiInterviewSessionId,
  type UiInterviewSessionPage,
  type UiInterviewTranscriptPage,
  type UiRealtimeConnection
} from '../../domain/models'
import type { UiWorkspaceJobAuthority } from '../../../workspace-operations'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import {
  asUiConcurrencyToken,
  type UiConcurrencyToken
} from '../../../../shared-kernel/concurrency'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  DEMO_INTERVIEW_REPORT,
  DEMO_INTERVIEW_SCENARIOS,
  DEMO_INTERVIEW_SESSIONS,
  DEMO_INTERVIEW_TRANSCRIPT,
  DEMO_INTERVIEW_WORKSPACE_ID
} from './data'

/** @brief 已缓存幂等命令 / Cached idempotent command. */
interface CachedCommand<TResult> {
  /** @brief canonical path 与 body 的稳定指纹 / Stable fingerprint of canonical path and body. */
  readonly fingerprint: string
  /** @brief 首次确认结果 / Initially confirmed result. */
  readonly result: TResult
}

/**
 * @brief 从 path-aware 幂等缓存读取既有结果 / Read an existing result from a path-aware idempotency cache.
 * @template TResult 命令结果 / Command result.
 * @param cache 当前命令类型的缓存 / Cache for the current command type.
 * @param key principal 之外的 Workspace、path 与 command identity / Workspace, path, and command identity outside the principal.
 * @param fingerprint 当前请求指纹 / Current request fingerprint.
 * @return 既有结果或 undefined / Existing result or undefined.
 */
function replayCachedCommand<TResult>(
  cache: ReadonlyMap<string, CachedCommand<TResult>>,
  key: string,
  fingerprint: string
): TResult | undefined {
  /** @brief 同 key 的既有命令 / Existing command under the same key. */
  const existing = cache.get(key)
  if (existing === undefined) return undefined
  if (existing.fingerprint !== fingerprint) {
    throw new InMemoryGatewayError(
      'memory.idempotency_key_reused',
      'The Mock Interview command identity was reused with a different request.'
    )
  }
  return cloneMemoryValue(existing.result)
}

/**
 * @brief 构造资源强 ETag / Construct a strong ETag for a resource.
 * @param kind 资源类型 / Resource kind.
 * @param id 不透明资源身份 / Opaque resource identity.
 * @param revision 领域 revision / Domain revision.
 * @return 不能由消费者推导、仅供内存测试的强 ETag / Strong ETag only for memory tests and not derivable by consumers.
 */
function memoryEntityTag(kind: string, id: string, revision: number): UiConcurrencyToken {
  return asUiConcurrencyToken(`"memory-${kind}-${id}-r${revision}"`)
}

/**
 * @brief 确认强 If-Match 与当前权威完全一致 / Confirm strong If-Match exactly matches current authority.
 * @param expected 当前权威令牌 / Current authoritative token.
 * @param received 命令冻结的令牌 / Token frozen by the command.
 */
function requireMatchingEntityTag(
  expected: UiConcurrencyToken,
  received: UiConcurrencyToken
): void {
  if (expected !== received) {
    throw new InMemoryGatewayError(
      'memory.conflict',
      'The Mock Interview resource changed after the caller read it.'
    )
  }
}

/**
 * @brief 创建单调且确定的内存时间 / Create a monotonic deterministic memory timestamp.
 * @param ordinal 单调序号 / Monotonic ordinal.
 * @return UTC RFC 3339 时间 / UTC RFC 3339 timestamp.
 */
function memoryTimestamp(ordinal: number): string {
  return new Date(Date.UTC(2026, 7, 1, 0, 0, ordinal)).toISOString()
}

/**
 * @brief 为 Workspace Job 构造 canonical Location / Construct a canonical Location for a Workspace Job.
 * @param workspaceId 显式 Workspace / Explicit Workspace.
 * @param jobId Job 身份 / Job identity.
 * @return 公开 API v2 Location / Public API v2 Location.
 */
function jobLocation(workspaceId: UiWorkspaceId, jobId: string): string {
  return `https://api.hmalliances.org:8022/api/v2/workspaces/${workspaceId}/jobs/${jobId}`
}

/**
 * @brief Interview 自动化测试内存网关 / In-memory Interview gateway for automated tests.
 * @note 它实现 Workspace/path identity、opaque cursor、强 ETag 与 path-aware 幂等；不模拟 realtime 帧 / It implements Workspace/path identity, opaque cursors, strong ETags, and path-aware idempotency; it does not emulate realtime frames.
 */
export class InMemoryInterviewGateway implements InterviewGateway {
  /** @brief 确定性读取行为 / Deterministic read behavior. */
  readonly #options: InMemoryGatewayOptions

  /** @brief 当前场景资源 / Current scenario resources. */
  readonly #scenarios: UiInterviewScenario[]

  /** @brief 当前会话资源 / Current session resources. */
  readonly #sessions: UiInterviewSession[]

  /** @brief 当前报告资源 / Current report resources. */
  readonly #reports: UiInterviewReport[]

  /** @brief 场景强 ETag / Strong ETags for scenarios. */
  readonly #scenarioEntityTags = new Map<UiInterviewScenarioId, UiConcurrencyToken>()

  /** @brief 会话强 ETag / Strong ETags for sessions. */
  readonly #sessionEntityTags = new Map<UiInterviewSessionId, UiConcurrencyToken>()

  /** @brief 场景创建幂等缓存 / Scenario-creation idempotency cache. */
  readonly #scenarioCreations = new Map<string, CachedCommand<UiInterviewScenarioAuthority>>()

  /** @brief 会话创建幂等缓存 / Session-creation idempotency cache. */
  readonly #sessionCreations = new Map<string, CachedCommand<UiInterviewSessionAuthority>>()

  /** @brief realtime 描述符幂等缓存 / Realtime-descriptor idempotency cache. */
  readonly #connectionCreations = new Map<string, CachedCommand<UiRealtimeConnection>>()

  /** @brief 会话结束 Job 幂等缓存 / Session-end Job idempotency cache. */
  readonly #endRequests = new Map<string, CachedCommand<UiWorkspaceJobAuthority>>()

  /** @brief 报告 Job 幂等缓存 / Report-Job idempotency cache. */
  readonly #reportJobs = new Map<string, CachedCommand<UiWorkspaceJobAuthority>>()

  /** @brief 新资源与 Job 共用的单调序号 / Monotonic sequence shared by new resources and Jobs. */
  #nextOrdinal = 1

  /**
   * @brief 构造 Interview 内存 adapter / Construct the Interview in-memory adapter.
   * @param options 确定性测试行为 / Deterministic test behavior.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.#options = options
    this.#scenarios = cloneMemoryValue([...DEMO_INTERVIEW_SCENARIOS])
    this.#sessions = cloneMemoryValue([...DEMO_INTERVIEW_SESSIONS])
    this.#reports = cloneMemoryValue([DEMO_INTERVIEW_REPORT])
    for (const scenario of this.#scenarios) {
      this.#scenarioEntityTags.set(
        scenario.id,
        memoryEntityTag('interview-scenario', scenario.id, scenario.revision)
      )
    }
    for (const session of this.#sessions) {
      this.#sessionEntityTags.set(
        session.id,
        memoryEntityTag('interview-session', session.id, session.revision)
      )
    }
  }

  /** @inheritdoc */
  async listInterviewScenarioPage(
    request: UiInterviewScenarioPageRead
  ): Promise<UiInterviewScenarioPage> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }
    this.#requireWorkspace(request.workspaceId)
    /** @brief 当前 cursor 绑定的 offset / Offset bound to the current cursor. */
    const offset = this.#scenarioCursorOffset(request.workspaceId, request.cursor)
    /** @brief 当前页的独立资源副本 / Independent resource copies for the current page. */
    const items = cloneMemoryValue(this.#scenarios.slice(offset, offset + request.limit))
    /** @brief 下一页起始 offset / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < this.#scenarios.length
      ? {
          items,
          hasMore: true,
          nextCursor: asUiInterviewScenarioCursor(
            `interview-scenarios:${request.workspaceId}:${nextOffset}`
          )
        }
      : { items, hasMore: false, nextCursor: null }
  }

  /** @inheritdoc */
  async createInterviewScenario(
    command: UiCreateInterviewScenarioCommand
  ): Promise<UiInterviewScenarioAuthority> {
    await this.#prepare(command.signal)
    this.#requireWorkspace(command.workspaceId)
    this.#assertScenarioInput(command.input)
    /** @brief 与 Workspace 集合 path 绑定的 cache key / Cache key bound to the Workspace collection path. */
    const cacheKey = `${command.workspaceId}:interview-scenarios:${command.commandId}`
    /** @brief 完整创建 body 的稳定指纹 / Stable fingerprint of the complete creation body. */
    const fingerprint = JSON.stringify({
      input: command.input,
      workspaceId: command.workspaceId
    })
    /** @brief 同一意图的既有结果 / Existing result for the same intent. */
    const replay = replayCachedCommand(this.#scenarioCreations, cacheKey, fingerprint)
    if (replay !== undefined) return replay
    /** @brief 当前创建的单调序号 / Monotonic ordinal of this creation. */
    const ordinal = this.#claimOrdinal()
    /** @brief 新建场景 / Newly created scenario. */
    const scenario: UiInterviewScenario = {
      ...cloneMemoryValue(command.input),
      id: asUiOpaqueId<'interview-scenario'>(`scn_memory_created_${ordinal}`),
      workspaceId: command.workspaceId,
      revision: 1,
      createdAt: memoryTimestamp(ordinal),
      updatedAt: memoryTimestamp(ordinal),
      status: 'draft'
    }
    /** @brief 创建响应权威 / Authority returned by creation. */
    const authority: UiInterviewScenarioAuthority = {
      scenario,
      concurrencyToken: memoryEntityTag('interview-scenario', scenario.id, scenario.revision)
    }
    this.#scenarios.push(scenario)
    this.#scenarioEntityTags.set(scenario.id, authority.concurrencyToken)
    this.#scenarioCreations.set(cacheKey, {
      fingerprint,
      result: cloneMemoryValue(authority)
    })
    return cloneMemoryValue(authority)
  }

  /** @inheritdoc */
  async getInterviewScenario(
    request: UiInterviewScenarioRead
  ): Promise<UiInterviewScenarioAuthority> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return throwMemoryNotFound('InterviewScenario')
    return cloneMemoryValue(this.#scenarioAuthority(request.workspaceId, request.scenarioId))
  }

  /** @inheritdoc */
  async updateInterviewScenario(
    command: UiUpdateInterviewScenarioCommand
  ): Promise<UiInterviewScenarioAuthority> {
    await this.#prepare(command.signal)
    if (Object.keys(command.patch).length === 0) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'A Mock InterviewScenario patch must contain at least one field.'
      )
    }
    /** @brief 更新前权威 / Authority before the update. */
    const current = this.#scenarioAuthority(command.workspaceId, command.scenarioId)
    requireMatchingEntityTag(current.concurrencyToken, command.concurrencyToken)
    /** @brief 应用最小 patch 后的场景 / Scenario after applying the minimal patch. */
    const updated: UiInterviewScenario = {
      ...current.scenario,
      ...cloneMemoryValue(command.patch),
      revision: current.scenario.revision + 1,
      updatedAt: memoryTimestamp(this.#claimOrdinal())
    }
    this.#assertScenarioInput(updated)
    /** @brief 当前场景在集合中的位置 / Position of the current scenario in the collection. */
    const index = this.#scenarios.findIndex((scenario) => scenario.id === updated.id)
    if (index < 0) return throwMemoryNotFound('InterviewScenario')
    this.#scenarios[index] = updated
    /** @brief 更新后的强 ETag / Strong ETag after the update. */
    const concurrencyToken = memoryEntityTag('interview-scenario', updated.id, updated.revision)
    this.#scenarioEntityTags.set(updated.id, concurrencyToken)
    return cloneMemoryValue({ scenario: updated, concurrencyToken })
  }

  /** @inheritdoc */
  async listInterviewSessionPage(
    request: UiInterviewSessionPageRead
  ): Promise<UiInterviewSessionPage> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }
    this.#requireWorkspace(request.workspaceId)
    /** @brief 当前 cursor 绑定的 offset / Offset bound to the current cursor. */
    const offset = this.#sessionCursorOffset(request.workspaceId, request.cursor)
    /** @brief 当前页的独立资源副本 / Independent resource copies for the current page. */
    const items = cloneMemoryValue(this.#sessions.slice(offset, offset + request.limit))
    /** @brief 下一页起始 offset / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < this.#sessions.length
      ? {
          items,
          hasMore: true,
          nextCursor: asUiInterviewSessionCursor(
            `interview-sessions:${request.workspaceId}:${nextOffset}`
          )
        }
      : { items, hasMore: false, nextCursor: null }
  }

  /** @inheritdoc */
  async createInterviewSession(
    command: UiCreateInterviewSessionCommand
  ): Promise<UiInterviewSessionAuthority> {
    await this.#prepare(command.signal)
    this.#requireWorkspace(command.workspaceId)
    /** @brief 被选择场景的权威 / Authority of the selected scenario. */
    const scenario = this.#scenarioAuthority(command.workspaceId, command.input.scenarioId).scenario
    if (scenario.status !== 'active') {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'A Mock InterviewSession can be created only from an active scenario.'
      )
    }
    this.#assertSessionInput(command)
    /** @brief 与 Workspace collection path 绑定的 cache key / Cache key bound to the Workspace collection path. */
    const cacheKey = `${command.workspaceId}:interview-sessions:${command.commandId}`
    /** @brief 完整 Session body 的稳定指纹 / Stable fingerprint of the complete Session body. */
    const fingerprint = JSON.stringify({
      input: command.input,
      workspaceId: command.workspaceId
    })
    /** @brief 同一意图的既有结果 / Existing result for the same intent. */
    const replay = replayCachedCommand(this.#sessionCreations, cacheKey, fingerprint)
    if (replay !== undefined) return replay
    /** @brief 当前创建的单调序号 / Monotonic ordinal of this creation. */
    const ordinal = this.#claimOrdinal()
    /** @brief 新建持久会话 / Newly created persistent session. */
    const session: UiInterviewSession = {
      id: asUiOpaqueId<'interview-session'>(`int_memory_created_${ordinal}`),
      workspaceId: command.workspaceId,
      revision: 1,
      createdAt: memoryTimestamp(ordinal),
      updatedAt: memoryTimestamp(ordinal),
      scenarioId: command.input.scenarioId,
      resumeRef: cloneMemoryValue(command.input.resumeRef),
      jobTarget: cloneMemoryValue(command.input.jobTarget),
      status: 'created',
      locale: command.input.locale,
      media: cloneMemoryValue(command.input.media),
      recording: cloneMemoryValue(command.input.recording),
      startedAt: null,
      endedAt: null,
      reportId: null
    }
    /** @brief 创建响应权威 / Authority returned by creation. */
    const authority: UiInterviewSessionAuthority = {
      session,
      concurrencyToken: memoryEntityTag('interview-session', session.id, session.revision)
    }
    this.#sessions.push(session)
    this.#sessionEntityTags.set(session.id, authority.concurrencyToken)
    this.#sessionCreations.set(cacheKey, {
      fingerprint,
      result: cloneMemoryValue(authority)
    })
    return cloneMemoryValue(authority)
  }

  /** @inheritdoc */
  async getInterviewSession(request: UiInterviewSessionRead): Promise<UiInterviewSessionAuthority> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return throwMemoryNotFound('InterviewSession')
    return cloneMemoryValue(this.#sessionAuthority(request.workspaceId, request.sessionId))
  }

  /** @inheritdoc */
  async createRealtimeConnection(
    command: UiCreateRealtimeConnectionCommand
  ): Promise<UiRealtimeConnection> {
    await this.#prepare(command.signal)
    /** @brief 连接所属会话 / Session owning the connection. */
    const session = this.#sessionAuthority(command.workspaceId, command.sessionId).session
    if (!['created', 'connecting', 'active'].includes(session.status)) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock InterviewSession cannot accept a realtime connection in its current state.'
      )
    }
    this.#assertConnectionInput(command)
    /** @brief 与单 Session connections path 绑定的 cache key / Cache key bound to the single-Session connections path. */
    const cacheKey =
      `${command.workspaceId}:interview-sessions:${command.sessionId}:connections:` +
      command.commandId
    /** @brief 完整 Connection body 的稳定指纹 / Stable fingerprint of the complete Connection body. */
    const fingerprint = JSON.stringify({
      audioCodecs: command.audioCodecs,
      sessionId: command.sessionId,
      supportedTransports: command.supportedTransports,
      videoCodecs: command.videoCodecs,
      workspaceId: command.workspaceId
    })
    /** @brief 同一意图的既有短期凭据 / Existing short-lived credentials for the same intent. */
    const replay = replayCachedCommand(this.#connectionCreations, cacheKey, fingerprint)
    if (replay !== undefined) return replay
    /** @brief 当前创建的单调序号 / Monotonic ordinal of this creation. */
    const ordinal = this.#claimOrdinal()
    /** @brief 内存 adapter 按客户端顺序选择的传输 / Transport selected by the memory adapter in client order. */
    const transport = command.supportedTransports[0]
    if (transport === undefined) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'At least one realtime transport is required.'
      )
    }
    /** @brief 新签发的短期连接描述符 / Newly issued short-lived connection descriptor. */
    const connection: UiRealtimeConnection = {
      id: asUiOpaqueId<'interview-realtime-connection'>(`conn_memory_${ordinal}`),
      sessionId: command.sessionId,
      transport,
      signalingUrl:
        `wss://api.hmalliances.org:8022/realtime/interview/` +
        `${command.sessionId}/connections/${ordinal}`,
      ephemeralToken: `memory_ephemeral_connection_token_${ordinal}_not_a_real_secret`,
      iceServers:
        transport === 'webrtc'
          ? [
              {
                urls: ['turns:turn.example.invalid:5349'],
                username: `memory-user-${ordinal}`,
                credential: `memory-credential-${ordinal}`
              }
            ]
          : [],
      expiresAt: new Date(Date.UTC(2026, 7, 1, 0, 10, ordinal)).toISOString(),
      heartbeatIntervalMs: 15_000
    }
    this.#connectionCreations.set(cacheKey, {
      fingerprint,
      result: cloneMemoryValue(connection)
    })
    return cloneMemoryValue(connection)
  }

  /** @inheritdoc */
  async requestInterviewSessionEnd(
    command: UiEndInterviewSessionCommand
  ): Promise<UiWorkspaceJobAuthority> {
    await this.#prepare(command.signal)
    /** @brief 与单 Session end-requests path 绑定的 cache key / Cache key bound to the single-Session end-requests path. */
    const cacheKey =
      `${command.workspaceId}:interview-sessions:${command.sessionId}:end-requests:` +
      command.commandId
    /** @brief 完整 end request 的稳定指纹 / Stable fingerprint of the complete end request. */
    const fingerprint = JSON.stringify({
      concurrencyToken: command.concurrencyToken,
      reason: command.reason,
      sessionId: command.sessionId,
      workspaceId: command.workspaceId
    })
    /** @brief 同一意图的既有 Job / Existing Job for the same intent. */
    const replay = replayCachedCommand(this.#endRequests, cacheKey, fingerprint)
    if (replay !== undefined) return replay
    /** @brief 结束前会话权威 / Session authority before ending. */
    const current = this.#sessionAuthority(command.workspaceId, command.sessionId)
    requireMatchingEntityTag(current.concurrencyToken, command.concurrencyToken)
    if (!['created', 'connecting', 'active'].includes(current.session.status)) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock InterviewSession cannot enter ending from its current state.'
      )
    }
    /** @brief 结束请求产生的单调序号 / Monotonic ordinal produced by the end request. */
    const ordinal = this.#claimOrdinal()
    /** @brief 进入 ending 的新会话权威 / New session authority entering ending. */
    const updatedSession: UiInterviewSession = {
      ...current.session,
      revision: current.session.revision + 1,
      updatedAt: memoryTimestamp(ordinal),
      status: 'ending'
    }
    this.#replaceSession(updatedSession)
    /** @brief 通用 Workspace Job 创建结果 / Generic Workspace Job creation result. */
    const job = this.#createQueuedJob(
      command.workspaceId,
      command.sessionId,
      updatedSession.revision,
      'interview.session.end',
      ordinal,
      command.commandId
    )
    this.#endRequests.set(cacheKey, { fingerprint, result: cloneMemoryValue(job) })
    return cloneMemoryValue(job)
  }

  /** @inheritdoc */
  async listInterviewTranscriptPage(
    request: UiInterviewTranscriptPageRead
  ): Promise<UiInterviewTranscriptPage> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }
    this.#sessionAuthority(request.workspaceId, request.sessionId)
    /** @brief 当前 fixture 会话的 transcript / Transcript for the current fixture session. */
    const transcript = this.#reports.some((report) => report.sessionId === request.sessionId)
      ? DEMO_INTERVIEW_TRANSCRIPT
      : []
    /** @brief 当前 cursor 绑定的 offset / Offset bound to the current cursor. */
    const offset = this.#transcriptCursorOffset(
      request.workspaceId,
      request.sessionId,
      request.cursor,
      transcript.length
    )
    /** @brief 当前页的独立片段副本 / Independent segment copies for the current page. */
    const items = cloneMemoryValue(transcript.slice(offset, offset + request.limit))
    /** @brief 下一页起始 offset / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < transcript.length
      ? {
          items,
          hasMore: true,
          nextCursor: asUiInterviewTranscriptCursor(
            `interview-transcript:${request.workspaceId}:${request.sessionId}:${nextOffset}`
          )
        }
      : { items, hasMore: false, nextCursor: null }
  }

  /** @inheritdoc */
  async createInterviewReportJob(
    command: UiCreateInterviewReportJobCommand
  ): Promise<UiWorkspaceJobAuthority> {
    await this.#prepare(command.signal)
    /** @brief 报告生成主体会话 / Session that is the subject of report generation. */
    const session = this.#sessionAuthority(command.workspaceId, command.sessionId).session
    if (session.status !== 'completed') {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'A Mock Interview report can be requested only for a completed session.'
      )
    }
    /** @brief 与单 Session report-jobs path 绑定的 cache key / Cache key bound to the single-Session report-jobs path. */
    const cacheKey =
      `${command.workspaceId}:interview-sessions:${command.sessionId}:report-jobs:` +
      command.commandId
    /** @brief 保持 rubricVersion 缺失语义的请求指纹 / Request fingerprint preserving omitted rubricVersion semantics. */
    const fingerprint = JSON.stringify({
      ...(command.rubricVersion === undefined ? {} : { rubricVersion: command.rubricVersion }),
      sessionId: command.sessionId,
      workspaceId: command.workspaceId
    })
    /** @brief 同一意图的既有 Job / Existing Job for the same intent. */
    const replay = replayCachedCommand(this.#reportJobs, cacheKey, fingerprint)
    if (replay !== undefined) return replay
    /** @brief 新报告 Job 的单调序号 / Monotonic ordinal of the new report Job. */
    const ordinal = this.#claimOrdinal()
    /** @brief 通用 Workspace Job 创建结果 / Generic Workspace Job creation result. */
    const job = this.#createQueuedJob(
      command.workspaceId,
      command.sessionId,
      session.revision,
      'interview.report.generate',
      ordinal,
      command.commandId
    )
    this.#reportJobs.set(cacheKey, { fingerprint, result: cloneMemoryValue(job) })
    return cloneMemoryValue(job)
  }

  /** @inheritdoc */
  async getInterviewReport(request: UiInterviewReportRead): Promise<UiInterviewReport> {
    /** @brief 当前读取模式 / Current read mode. */
    const mode = await this.#prepare(request.signal)
    if (mode === 'empty') return throwMemoryNotFound('InterviewReport')
    /** @brief path identity 匹配的报告 / Report matching the path identity. */
    const report = this.#reports.find((candidate) => candidate.id === request.reportId)
    if (report === undefined || report.workspaceId !== request.workspaceId) {
      return throwMemoryNotFound('InterviewReport')
    }
    return cloneMemoryValue(report)
  }

  /**
   * @brief 应用取消信号与确定性读取模式 / Apply cancellation and deterministic read behavior.
   * @param signal 可选取消信号 / Optional cancellation signal.
   * @return 当前内存模式 / Current memory mode.
   */
  async #prepare(signal?: AbortSignal): Promise<'ready' | 'empty' | 'error'> {
    signal?.throwIfAborted()
    /** @brief adapter 当前模式 / Current adapter mode. */
    const mode = await prepareMemoryRead(this.#options)
    signal?.throwIfAborted()
    return mode
  }

  /**
   * @brief 确认 Workspace 属于此测试 fixture / Confirm the Workspace belongs to this test fixture.
   * @param workspaceId path 中的 Workspace / Workspace in the path.
   */
  #requireWorkspace(workspaceId: UiWorkspaceId): void {
    if (workspaceId !== DEMO_INTERVIEW_WORKSPACE_ID) {
      return throwMemoryNotFound('Interview Workspace')
    }
  }

  /**
   * @brief 读取一个场景权威并核对 Workspace / Read one scenario authority and verify its Workspace.
   * @param workspaceId path 中的 Workspace / Workspace in the path.
   * @param scenarioId path 中的场景身份 / Scenario identity in the path.
   * @return 场景与当前强 ETag / Scenario and current strong ETag.
   */
  #scenarioAuthority(
    workspaceId: UiWorkspaceId,
    scenarioId: UiInterviewScenarioId
  ): UiInterviewScenarioAuthority {
    this.#requireWorkspace(workspaceId)
    /** @brief 匹配 path identity 的场景 / Scenario matching the path identity. */
    const scenario = this.#scenarios.find((candidate) => candidate.id === scenarioId)
    /** @brief 场景当前强 ETag / Current strong ETag for the scenario. */
    const concurrencyToken = this.#scenarioEntityTags.get(scenarioId)
    if (
      scenario === undefined ||
      concurrencyToken === undefined ||
      scenario.workspaceId !== workspaceId
    ) {
      return throwMemoryNotFound('InterviewScenario')
    }
    return { scenario, concurrencyToken }
  }

  /**
   * @brief 读取一个会话权威并核对 Workspace / Read one session authority and verify its Workspace.
   * @param workspaceId path 中的 Workspace / Workspace in the path.
   * @param sessionId path 中的会话身份 / Session identity in the path.
   * @return 会话与当前强 ETag / Session and current strong ETag.
   */
  #sessionAuthority(
    workspaceId: UiWorkspaceId,
    sessionId: UiInterviewSessionId
  ): UiInterviewSessionAuthority {
    this.#requireWorkspace(workspaceId)
    /** @brief 匹配 path identity 的会话 / Session matching the path identity. */
    const session = this.#sessions.find((candidate) => candidate.id === sessionId)
    /** @brief 会话当前强 ETag / Current strong ETag for the session. */
    const concurrencyToken = this.#sessionEntityTags.get(sessionId)
    if (
      session === undefined ||
      concurrencyToken === undefined ||
      session.workspaceId !== workspaceId
    ) {
      return throwMemoryNotFound('InterviewSession')
    }
    return { session, concurrencyToken }
  }

  /**
   * @brief 原子替换一个会话与其强 ETag / Atomically replace one session and its strong ETag.
   * @param session 新会话表示 / New session representation.
   */
  #replaceSession(session: UiInterviewSession): void {
    /** @brief 当前会话集合位置 / Current session position in the collection. */
    const index = this.#sessions.findIndex((candidate) => candidate.id === session.id)
    if (index < 0) return throwMemoryNotFound('InterviewSession')
    this.#sessions[index] = session
    this.#sessionEntityTags.set(
      session.id,
      memoryEntityTag('interview-session', session.id, session.revision)
    )
  }

  /**
   * @brief 解析 Workspace-bound scenario cursor / Resolve a Workspace-bound scenario cursor.
   * @param workspaceId 当前 Workspace / Current Workspace.
   * @param cursor 首页 null 或服务端 cursor / Null for the first page or a server cursor.
   * @return 集合 offset / Collection offset.
   */
  #scenarioCursorOffset(
    workspaceId: UiWorkspaceId,
    cursor: UiInterviewScenarioPageRead['cursor']
  ): number {
    if (cursor === null) return 0
    for (let offset = 1; offset < this.#scenarios.length; offset += 1) {
      if (`interview-scenarios:${workspaceId}:${offset}` === cursor) return offset
    }
    return throwMemoryNotFound('InterviewScenario cursor')
  }

  /**
   * @brief 解析 Workspace-bound session cursor / Resolve a Workspace-bound session cursor.
   * @param workspaceId 当前 Workspace / Current Workspace.
   * @param cursor 首页 null 或服务端 cursor / Null for the first page or a server cursor.
   * @return 集合 offset / Collection offset.
   */
  #sessionCursorOffset(
    workspaceId: UiWorkspaceId,
    cursor: UiInterviewSessionPageRead['cursor']
  ): number {
    if (cursor === null) return 0
    for (let offset = 1; offset < this.#sessions.length; offset += 1) {
      if (`interview-sessions:${workspaceId}:${offset}` === cursor) return offset
    }
    return throwMemoryNotFound('InterviewSession cursor')
  }

  /**
   * @brief 解析 Workspace/Session-bound transcript cursor / Resolve a Workspace/Session-bound transcript cursor.
   * @param workspaceId 当前 Workspace / Current Workspace.
   * @param sessionId 当前 Session / Current Session.
   * @param cursor 首页 null 或服务端 cursor / Null for the first page or a server cursor.
   * @param length 当前 transcript 长度 / Current transcript length.
   * @return transcript offset / Transcript offset.
   */
  #transcriptCursorOffset(
    workspaceId: UiWorkspaceId,
    sessionId: UiInterviewSessionId,
    cursor: UiInterviewTranscriptPageRead['cursor'],
    length: number
  ): number {
    if (cursor === null) return 0
    for (let offset = 1; offset < length; offset += 1) {
      if (`interview-transcript:${workspaceId}:${sessionId}:${offset}` === cursor) return offset
    }
    return throwMemoryNotFound('InterviewTranscript cursor')
  }

  /**
   * @brief 验证场景核心不变量 / Validate core scenario invariants.
   * @param input 完整场景输入 / Complete scenario input.
   */
  #assertScenarioInput(
    input: UiCreateInterviewScenarioCommand['input'] | UiInterviewScenario
  ): void {
    /** @brief rubric dimension identity 集合 / Set of rubric-dimension identities. */
    const dimensionIds = new Set(input.rubric.dimensions.map((dimension) => dimension.dimensionId))
    /** @brief rubric 权重总和 / Sum of rubric weights. */
    const weightSum = input.rubric.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
    if (
      input.name.trim().length === 0 ||
      input.durationMinutes < 5 ||
      input.durationMinutes > 240 ||
      input.targetQuestionCount < 1 ||
      input.rubric.dimensions.length === 0 ||
      dimensionIds.size !== input.rubric.dimensions.length ||
      Math.abs(weightSum - 1) > Number.EPSILON * 16
    ) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock InterviewScenario violates a canonical domain invariant.'
      )
    }
  }

  /**
   * @brief 验证 Session 创建的同意与 Knowledge 不变量 / Validate consent and Knowledge invariants for Session creation.
   * @param command 完整 Session 创建命令 / Complete Session-creation command.
   */
  #assertSessionInput(command: UiCreateInterviewSessionCommand): void {
    /** @brief 是否请求任何持久采集 / Whether any persistent capture is requested. */
    const needsConsent =
      command.input.recording.recordAudio ||
      command.input.recording.recordVideo ||
      command.input.recording.storeTranscript
    /** @brief Knowledge 选择的所有来源身份 / All source identities in the Knowledge selection. */
    const selectedSourceIds = [
      ...command.input.knowledge.includeSourceIds,
      ...command.input.knowledge.excludeSourceIds
    ]
    if (
      command.input.jobTarget.title.trim().length === 0 ||
      (command.input.recording.recordAudio && !command.input.media.userAudio) ||
      (command.input.recording.recordVideo && !command.input.media.userVideo) ||
      (needsConsent &&
        (command.input.recording.consentedAt === null ||
          command.input.recording.consentVersion === null ||
          command.input.recording.consentVersion.length === 0)) ||
      (command.input.knowledge.mode === 'none' &&
        (selectedSourceIds.length > 0 || command.input.knowledge.pinnedVersions.length > 0)) ||
      (command.input.knowledge.mode === 'explicit' &&
        command.input.knowledge.includeSourceIds.length === 0) ||
      new Set(command.input.knowledge.includeSourceIds).size !==
        command.input.knowledge.includeSourceIds.length ||
      new Set(command.input.knowledge.excludeSourceIds).size !==
        command.input.knowledge.excludeSourceIds.length
    ) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock InterviewSession request violates a canonical domain invariant.'
      )
    }
  }

  /**
   * @brief 验证 realtime descriptor 请求 / Validate a realtime-descriptor request.
   * @param command 完整连接命令 / Complete connection command.
   */
  #assertConnectionInput(command: UiCreateRealtimeConnectionCommand): void {
    if (
      command.supportedTransports.length === 0 ||
      new Set(command.supportedTransports).size !== command.supportedTransports.length ||
      new Set(command.audioCodecs).size !== command.audioCodecs.length ||
      new Set(command.videoCodecs).size !== command.videoCodecs.length
    ) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock RealtimeConnection request violates a canonical domain invariant.'
      )
    }
  }

  /**
   * @brief 构造 queued Workspace Job 权威 / Construct a queued Workspace Job authority.
   * @param workspaceId 显式 Workspace / Explicit Workspace.
   * @param sessionId subject Session / Subject Session.
   * @param sessionRevision subject revision / Subject revision.
   * @param kind 开放 Job kind / Open Job kind.
   * @param ordinal 唯一序号 / Unique ordinal.
   * @param commandId 原始命令身份 / Original command identity.
   * @return canonical queued Job 权威 / Canonical queued Job authority.
   */
  #createQueuedJob(
    workspaceId: UiWorkspaceId,
    sessionId: UiInterviewSessionId,
    sessionRevision: number,
    kind: string,
    ordinal: number,
    commandId: string
  ): UiWorkspaceJobAuthority {
    /** @brief 新 Job 身份 / New Job identity. */
    const jobId = asUiOpaqueId<'workspace-job'>(`job_interview_memory_${ordinal}`)
    return {
      job: {
        id: jobId,
        workspaceId,
        revision: 1,
        createdAt: memoryTimestamp(ordinal),
        updatedAt: memoryTimestamp(ordinal),
        kind,
        subject: {
          resourceType: 'interview_session',
          id: sessionId,
          revision: sessionRevision
        },
        status: 'queued',
        progress: {
          phase: 'queued',
          completed: 0,
          total: 1,
          unit: 'steps'
        },
        resultRefs: [],
        problem: null,
        startedAt: null,
        finishedAt: null
      },
      concurrencyToken: memoryEntityTag('workspace-job', jobId, 1),
      requestId: `request_${commandId}`,
      location: jobLocation(workspaceId, jobId)
    }
  }

  /**
   * @brief 领取一个唯一单调序号 / Claim one unique monotonic ordinal.
   * @return 当前序号 / Current ordinal.
   */
  #claimOrdinal(): number {
    /** @brief 当前待返回序号 / Current ordinal to return. */
    const ordinal = this.#nextOrdinal
    this.#nextOrdinal += 1
    return ordinal
  }
}
