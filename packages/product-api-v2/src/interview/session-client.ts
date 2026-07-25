/** @file Workspace-scoped InterviewSession API v2 消费者 / Workspace-scoped InterviewSession API v2 consumers. */

import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import type {
  ApiV2AcceptedResourceResponse,
  ApiV2Client,
  ApiV2CreatedResourceResponse,
  ApiV2PostJsonOptions
} from '../http/client'
import {
  boundedInteger,
  boundedString,
  idempotencyKey,
  opaqueId,
  strongEntityTag,
  type CursorCollection
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  parseAcceptedWorkspaceJob,
  type AcceptedWorkspaceJobRepresentation
} from '../jobs/accepted-job'
import { JOB_MAX_RESPONSE_BYTES } from '../jobs/job'
import {
  encodeCreateInterviewSessionRequest,
  encodeCreateRealtimeConnectionRequest,
  encodeEndInterviewSessionRequest,
  parseInterviewSession,
  parseInterviewSessionList,
  parseInterviewTranscriptPage,
  parseRealtimeConnection,
  type CreateInterviewSessionRequest,
  type CreateRealtimeConnectionRequest,
  type EndInterviewSessionRequest,
  type InterviewSession,
  type InterviewTranscriptSegment,
  type RealtimeConnection
} from './session'
import { exactResourceLocation, wireValuesEqual } from './wire'

/** @brief 单个 Session 响应上限 / Response ceiling for one Session. */
const INTERVIEW_SESSION_MAX_RESPONSE_BYTES = 512 * 1024

/** @brief 一页 Session 响应上限 / Response ceiling for one Session page. */
const INTERVIEW_SESSION_LIST_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Session 创建请求上限 / Request ceiling for Session creation. */
const CREATE_INTERVIEW_SESSION_MAX_REQUEST_BYTES = 1024 * 1024

/** @brief RealtimeConnection 请求上限 / Request ceiling for RealtimeConnection creation. */
const CREATE_REALTIME_CONNECTION_MAX_REQUEST_BYTES = 64 * 1024

/** @brief RealtimeConnection 响应上限 / Response ceiling for one RealtimeConnection. */
const REALTIME_CONNECTION_MAX_RESPONSE_BYTES = 512 * 1024

/** @brief EndRequest 请求上限 / Request ceiling for an EndRequest. */
const END_INTERVIEW_SESSION_MAX_REQUEST_BYTES = 4 * 1024

/** @brief 一页 Transcript 响应上限 / Response ceiling for one Transcript page. */
const INTERVIEW_TRANSCRIPT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/** @brief Session 分页请求 / Session page request. */
export interface InterviewSessionPageRequest {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 页大小，默认 50 / Page size, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 单个 Session 读取请求 / Request to read one Session. */
export interface InterviewSessionReadRequest {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Session identity / Session identity. */
  readonly sessionId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief Transcript 分页请求 / Transcript page request. */
export interface InterviewTranscriptPageRequest extends InterviewSessionReadRequest {
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 页大小，默认 50 / Page size, defaulting to 50. */
  readonly limit?: number
}

/** @brief 带 HTTP 并发元数据的 Session 表示 / Session representation carrying HTTP concurrency metadata. */
export interface InterviewSessionRepresentation {
  /** @brief 权威 Session / Authoritative Session. */
  readonly value: InterviewSession
  /** @brief 后续 EndRequest 所需强 ETag / Strong ETag required by a later EndRequest. */
  readonly entityTag: string
  /** @brief 服务端 request ID / Server request ID. */
  readonly requestId: string
}

/** @brief 已确认创建的 Session 表示 / Confirmed created Session representation. */
export interface CreatedInterviewSessionRepresentation extends InterviewSessionRepresentation {
  /** @brief 新 Session 的规范 Location / Canonical Location of the new Session. */
  readonly location: string
}

/** @brief 已确认签发的 RealtimeConnection 表示 / Confirmed issued RealtimeConnection representation. */
export interface RealtimeConnectionRepresentation {
  /** @brief 权威短期描述 / Authoritative short-lived descriptor. */
  readonly value: RealtimeConnection
  /** @brief 创建响应强 ETag / Strong ETag from the creation response. */
  readonly entityTag: string
  /** @brief 短期 Connection 的规范 Location / Canonical Location of the short-lived Connection. */
  readonly location: string
  /** @brief 服务端 request ID / Server request ID. */
  readonly requestId: string
}

/** @brief Session 创建端点的最小 HTTP port / Minimal HTTP port for Session creation. */
export interface InterviewSessionCreationHttpClient {
  /**
   * @brief 发送固定 201 创建请求 / Send a request fixed to 201 creation semantics.
   * @param path v2 产品路径 / v2 product path.
   * @param body 严格 payload / Strict payload.
   * @param options 幂等、大小、取消与成功策略 / Idempotency, size, cancellation, and success policy.
   * @return 带 ETag 与 Location 的 201 响应 / 201 response carrying ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'created-resource'>
  ) => Promise<ApiV2CreatedResourceResponse>
}

/** @brief RealtimeConnection 创建端点的最小 HTTP port / Minimal HTTP port for RealtimeConnection creation. */
export interface InterviewRealtimeConnectionHttpClient {
  /**
   * @brief 签发固定 201 的短期 Connection / Issue a short-lived Connection with fixed 201 semantics.
   * @param path v2 产品路径 / v2 product path.
   * @param body 严格 capability payload / Strict capability payload.
   * @param options 幂等、大小、取消与成功策略 / Idempotency, size, cancellation, and success policy.
   * @return 带 ETag 与 Location 的 201 Connection / 201 Connection carrying ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'created-resource'>
  ) => Promise<ApiV2CreatedResourceResponse>
}

/** @brief EndRequest 的最小异步 Job HTTP port / Minimal asynchronous Job HTTP port for EndRequest. */
export interface InterviewEndRequestHttpClient {
  /**
   * @brief 提交固定 202 的 EndRequest / Submit an EndRequest fixed to 202 semantics.
   * @param path v2 产品路径 / v2 product path.
   * @param body 严格 EndRequest / Strict EndRequest.
   * @param options 幂等、If-Match、大小与取消策略 / Idempotency, If-Match, size, and cancellation policy.
   * @return 带 ETag 与 Location 的 202 Job / 202 Job carrying ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'accepted-resource'>
  ) => Promise<ApiV2AcceptedResourceResponse>
}

/** @brief 创建 Session command / Command to create a Session. */
export interface CreateWorkspaceInterviewSessionCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief 同一创建意图内稳定的幂等键 / Stable idempotency key for one creation intent. */
  readonly idempotencyKey: string
  /** @brief canonical 创建请求 / Canonical creation request. */
  readonly request: CreateInterviewSessionRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 创建短期 RealtimeConnection command / Command to create a short-lived RealtimeConnection. */
export interface CreateWorkspaceInterviewRealtimeConnectionCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Session identity / Session identity. */
  readonly sessionId: string
  /** @brief 同一签发意图内稳定的幂等键 / Stable idempotency key for one issuance intent. */
  readonly idempotencyKey: string
  /** @brief canonical capability 请求 / Canonical capability request. */
  readonly request: CreateRealtimeConnectionRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 结束 Session command / Command to end a Session. */
export interface EndWorkspaceInterviewSessionCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Session identity / Session identity. */
  readonly sessionId: string
  /** @brief 当前 Session 的强 ETag / Strong ETag of the current Session. */
  readonly ifMatch: string
  /** @brief 同一结束意图内稳定的幂等键 / Stable idempotency key for one end intent. */
  readonly idempotencyKey: string
  /** @brief canonical EndRequest / Canonical EndRequest. */
  readonly request: EndInterviewSessionRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 校验 Session 与授权路径 identities 一致 / Validate Session identities against the authorization path.
 * @param value 权威 Session / Authoritative Session.
 * @param workspaceId 路径 Workspace / Workspace in the path.
 * @param sessionId 可选路径 Session / Optional Session in the path.
 */
function assertSessionMatchesPath(
  value: InterviewSession,
  workspaceId: string,
  sessionId?: string
): void {
  if (value.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewSession outside the requested Workspace.'
    )
  }
  if (sessionId !== undefined && value.id !== sessionId) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewSession whose identity differs from the request path.'
    )
  }
}

/**
 * @brief 校验 Session 创建结果对应提交快照且尚未启动 / Validate that a created Session matches the submitted snapshot and has not started.
 * @param value 权威 Session / Authoritative Session.
 * @param request 严格创建请求 / Strict creation request.
 */
function assertSessionMatchesCreate(
  value: InterviewSession,
  request: CreateInterviewSessionRequest
): void {
  /** @brief 响应中应冻结的创建字段 / Creation fields expected to be frozen in the response. */
  const persisted = {
    job_target: value.job_target,
    locale: value.locale,
    media: value.media,
    recording: value.recording,
    resume_ref: value.resume_ref,
    scenario_id: value.scenario_id
  }
  /** @brief 请求中可由 Session 表示证明的字段 / Request fields provable from the Session representation. */
  const expected = {
    job_target: request.job_target,
    locale: request.locale,
    media: request.media,
    recording: request.recording,
    resume_ref: request.resume_ref,
    scenario_id: request.scenario_id
  }
  if (!wireValuesEqual(persisted, expected)) {
    throw new ApiV2ContractError(
      'API v2 InterviewSession creation response does not match the submitted fields.'
    )
  }
  if (
    value.status !== 'created' ||
    value.started_at !== null ||
    value.ended_at !== null ||
    value.report_id !== null
  ) {
    throw new ApiV2ContractError(
      'API v2 InterviewSession creation returned a Session that had already advanced.'
    )
  }
}

/**
 * @brief 校验异步 Job 指向被操作 Session / Validate that an asynchronous Job targets the operated Session.
 * @param representation 已接受 Job / Accepted Job.
 * @param sessionId command Session identity / Session identity from the command.
 */
function assertInterviewJobSubject(
  representation: AcceptedWorkspaceJobRepresentation,
  sessionId: string
): void {
  if (
    representation.value.subject.resource_type !== 'interview_session' ||
    representation.value.subject.id !== sessionId
  ) {
    throw new ApiV2ContractError(
      'API v2 accepted an Interview Job for a different or non-Session subject.'
    )
  }
}

/**
 * @brief 读取一页 Workspace Session / Read one page of Workspace Sessions.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、cursor、limit 与取消信号 / Workspace, cursor, limit, and cancellation signal.
 * @return 与路径 Workspace 一致的 cursor 页 / Cursor page matching the path Workspace.
 */
export async function listWorkspaceInterviewSessionPage(
  client: ApiV2Client,
  request: InterviewSessionPageRequest
): Promise<CursorCollection<InterviewSession>> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 limit / Validated limit. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 cursor / Validated cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief 严格 200 响应 / Strict 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_SESSION_LIST_MAX_RESPONSE_BYTES,
      query: { cursor, limit },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已解码页 / Decoded page. */
  const page = parseInterviewSessionList(response.data)
  if (page.items.some((session) => session.workspace_id !== workspaceId)) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewSession outside the requested Workspace collection.'
    )
  }
  return page
}

/**
 * @brief 读取一个权威 Session / Read one authoritative Session.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、Session 与取消信号 / Workspace, Session, and cancellation signal.
 * @return Session、同响应强 ETag 与 request ID / Session, co-response strong ETag, and request ID.
 */
export async function getWorkspaceInterviewSession(
  client: ApiV2Client,
  request: InterviewSessionReadRequest
): Promise<InterviewSessionRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Session / Validated Session. */
  const sessionId = opaqueId(request.sessionId, 'request.session_id')
  /** @brief 严格 200 响应 / Strict 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions/${encodeURIComponent(sessionId)}`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_SESSION_MAX_RESPONSE_BYTES,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已解码 Session / Decoded Session. */
  const value = parseInterviewSession(response.data)
  assertSessionMatchesPath(value, workspaceId, sessionId)
  return {
    entityTag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
    requestId: opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id'),
    value
  }
}

/**
 * @brief 幂等创建一个持久 Session / Idempotently create one persistent Session.
 * @param client 固定 201 的 Session 创建 port / Session creation port fixed to 201.
 * @param command Workspace、幂等键、payload 与取消信号 / Workspace, idempotency key, payload, and cancellation signal.
 * @return 已确认创建的权威 Session / Confirmed authoritative created Session.
 */
export async function createWorkspaceInterviewSession(
  client: InterviewSessionCreationHttpClient,
  command: CreateWorkspaceInterviewSessionCommand
): Promise<CreatedInterviewSessionRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 严格请求 / Strict request. */
  const request = encodeCreateInterviewSessionRequest(command.request)
  /** @brief 稳定幂等键 / Stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 201 transport 响应 / Transport response fixed to 201. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: CREATE_INTERVIEW_SESSION_MAX_REQUEST_BYTES,
      maxResponseBytes: INTERVIEW_SESSION_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'created-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 201, (): CreatedInterviewSessionRepresentation => {
    /** @brief 已解码 Session / Decoded Session. */
    const value = parseInterviewSession(response.data)
    assertSessionMatchesPath(value, workspaceId)
    assertSessionMatchesCreate(value, request)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      location: exactResourceLocation(
        response.metadata.location,
        `/api/v2/workspaces/${workspaceId}/interview-sessions/${value.id}`
      ),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}

/**
 * @brief 幂等签发短期 RealtimeConnection / Idempotently issue a short-lived RealtimeConnection.
 * @param client 固定 201 的 Realtime 创建 port / Realtime creation port fixed to 201.
 * @param command Workspace、Session、capability、幂等键与取消信号 / Workspace, Session, capability, idempotency key, and cancellation signal.
 * @return 已确认的短期连接描述 / Confirmed short-lived connection descriptor.
 */
export async function createWorkspaceInterviewRealtimeConnection(
  client: InterviewRealtimeConnectionHttpClient,
  command: CreateWorkspaceInterviewRealtimeConnectionCommand
): Promise<RealtimeConnectionRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Session / Validated Session. */
  const sessionId = opaqueId(command.sessionId, 'request.session_id')
  /** @brief 严格 capability 请求 / Strict capability request. */
  const request = encodeCreateRealtimeConnectionRequest(command.request)
  /** @brief 稳定幂等键 / Stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 201 transport 响应 / Transport response fixed to 201. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions/${encodeURIComponent(sessionId)}/connections`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: CREATE_REALTIME_CONNECTION_MAX_REQUEST_BYTES,
      maxResponseBytes: REALTIME_CONNECTION_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'created-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 201, (): RealtimeConnectionRepresentation => {
    /** @brief 已解码 Connection / Decoded Connection. */
    const value = parseRealtimeConnection(response.data)
    if (value.session_id !== sessionId || !request.supported_transports.includes(value.transport)) {
      throw new ApiV2ContractError(
        'API v2 returned a RealtimeConnection outside the requested Session or capabilities.'
      )
    }
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      location: exactResourceLocation(
        response.metadata.location,
        `/api/v2/workspaces/${workspaceId}/interview-sessions/${sessionId}/connections/${value.id}`
      ),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}

/**
 * @brief 以强 If-Match 请求结束 Session / Request Session termination using strong If-Match.
 * @param client 固定 202 的 EndRequest port / EndRequest port fixed to 202.
 * @param command Workspace、Session、原因、ETag、幂等键与取消信号 / Workspace, Session, reason, ETag, idempotency key, and cancellation signal.
 * @return 可继续观察或取消的权威 Job / Authoritative Job that can be observed or cancelled.
 */
export async function endWorkspaceInterviewSession(
  client: InterviewEndRequestHttpClient,
  command: EndWorkspaceInterviewSessionCommand
): Promise<AcceptedWorkspaceJobRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Session / Validated Session. */
  const sessionId = opaqueId(command.sessionId, 'request.session_id')
  /** @brief 严格 EndRequest / Strict EndRequest. */
  const request = encodeEndInterviewSessionRequest(command.request)
  /** @brief 强前置条件 / Strong precondition. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 稳定幂等键 / Stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 202 transport 响应 / Transport response fixed to 202. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions/${encodeURIComponent(sessionId)}/end-requests`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      ifMatch,
      maxRequestBytes: END_INTERVIEW_SESSION_MAX_REQUEST_BYTES,
      maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'accepted-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 202, (): AcceptedWorkspaceJobRepresentation => {
    /** @brief 已接受 Job / Accepted Job. */
    const representation = parseAcceptedWorkspaceJob(response, workspaceId)
    assertInterviewJobSubject(representation, sessionId)
    return representation
  })
}

/**
 * @brief 读取一页 Session Transcript / Read one page of a Session Transcript.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、Session、cursor、limit 与取消信号 / Workspace, Session, cursor, limit, and cancellation signal.
 * @return 权威 transcript cursor 页 / Authoritative transcript cursor page.
 */
export async function listWorkspaceInterviewTranscriptPage(
  client: ApiV2Client,
  request: InterviewTranscriptPageRequest
): Promise<CursorCollection<InterviewTranscriptSegment>> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Session / Validated Session. */
  const sessionId = opaqueId(request.sessionId, 'request.session_id')
  /** @brief 已验证 limit / Validated limit. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 cursor / Validated cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief 严格 200 响应 / Strict 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions/${encodeURIComponent(sessionId)}/transcript`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_TRANSCRIPT_MAX_RESPONSE_BYTES,
      query: { cursor, limit },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  return parseInterviewTranscriptPage(response.data)
}
