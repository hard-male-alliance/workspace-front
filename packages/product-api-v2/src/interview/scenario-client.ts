/** @file Workspace-scoped InterviewScenario API v2 消费者 / Workspace-scoped InterviewScenario API v2 consumers. */

import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import type {
  ApiV2Client,
  ApiV2CreatedResourceResponse,
  ApiV2PatchJsonOptions,
  ApiV2PostJsonOptions,
  ApiV2UpdatedWriteJsonResponse
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
  encodeCreateInterviewScenarioRequest,
  encodeUpdateInterviewScenarioRequest,
  parseInterviewScenario,
  parseInterviewScenarioList,
  type CreateInterviewScenarioRequest,
  type InterviewScenario,
  type InterviewScenarioInput,
  type UpdateInterviewScenarioRequest
} from './scenario'
import { exactResourceLocation, wireValuesEqual } from './wire'

/** @brief 单个 Scenario 响应上限 / Response ceiling for one Scenario. */
const INTERVIEW_SCENARIO_MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/** @brief 一页 Scenario 响应上限 / Response ceiling for one Scenario page. */
const INTERVIEW_SCENARIO_LIST_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Scenario 创建请求上限 / Request ceiling for Scenario creation. */
const CREATE_INTERVIEW_SCENARIO_MAX_REQUEST_BYTES = 8 * 1024 * 1024

/** @brief Scenario 更新请求上限 / Request ceiling for Scenario updates. */
const UPDATE_INTERVIEW_SCENARIO_MAX_REQUEST_BYTES = 8 * 1024 * 1024

/** @brief Scenario 分页请求 / Scenario page request. */
export interface InterviewScenarioPageRequest {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 页大小，默认 50 / Page size, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 单个 Scenario 读取请求 / Request to read one Scenario. */
export interface InterviewScenarioReadRequest {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Scenario identity / Scenario identity. */
  readonly scenarioId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带 HTTP 并发元数据的 Scenario 表示 / Scenario representation carrying HTTP concurrency metadata. */
export interface InterviewScenarioRepresentation {
  /** @brief 权威 Scenario / Authoritative Scenario. */
  readonly value: InterviewScenario
  /** @brief 后续修改所需强 ETag / Strong ETag required by later mutation. */
  readonly entityTag: string
  /** @brief 服务端 request ID / Server request ID. */
  readonly requestId: string
}

/** @brief 已确认创建的 Scenario 表示 / Confirmed created Scenario representation. */
export interface CreatedInterviewScenarioRepresentation extends InterviewScenarioRepresentation {
  /** @brief 新 Scenario 的绝对规范 Location / Absolute canonical Location of the new Scenario. */
  readonly location: string
}

/** @brief Scenario 创建端点的最小 HTTP port / Minimal HTTP port for Scenario creation. */
export interface InterviewScenarioCreationHttpClient {
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

/** @brief Scenario 更新端点的最小 HTTP port / Minimal HTTP port for Scenario updates. */
export interface InterviewScenarioUpdateHttpClient {
  /**
   * @brief 发送带 If-Match 的 JSON Merge Patch / Send a JSON Merge Patch with If-Match.
   * @param path v2 产品路径 / v2 product path.
   * @param body 严格非空 patch / Strict non-empty patch.
   * @param options 并发、大小与取消策略 / Concurrency, size, and cancellation policy.
   * @return 更新后的 200 表示 / Updated 200 representation.
   */
  readonly patchJson: (
    path: string,
    body: unknown,
    options: ApiV2PatchJsonOptions
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
}

/** @brief 创建 Scenario command / Command to create a Scenario. */
export interface CreateWorkspaceInterviewScenarioCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief 同一创建意图内稳定的幂等键 / Stable idempotency key for one creation intent. */
  readonly idempotencyKey: string
  /** @brief canonical 创建请求 / Canonical creation request. */
  readonly request: CreateInterviewScenarioRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 更新 Scenario command / Command to update a Scenario. */
export interface UpdateWorkspaceInterviewScenarioCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Scenario identity / Scenario identity. */
  readonly scenarioId: string
  /** @brief 当前表示的强 ETag / Strong ETag of the current representation. */
  readonly ifMatch: string
  /** @brief canonical 非空 patch / Canonical non-empty patch. */
  readonly request: UpdateInterviewScenarioRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 投影 Scenario 的可创建字段 / Project the creatable fields of a Scenario.
 * @param value 权威 Scenario / Authoritative Scenario.
 * @return 不含资源元数据和状态的字段 / Fields excluding resource metadata and status.
 */
function scenarioInput(value: InterviewScenario): InterviewScenarioInput {
  return {
    allow_barge_in: value.allow_barge_in,
    allow_followups: value.allow_followups,
    description: value.description,
    difficulty: value.difficulty,
    duration_minutes: value.duration_minutes,
    focus_areas: value.focus_areas,
    interview_type: value.interview_type,
    locale: value.locale,
    name: value.name,
    rubric: value.rubric,
    target_question_count: value.target_question_count
  }
}

/**
 * @brief 校验 Scenario 与授权路径 identities 一致 / Validate Scenario identities against the authorization path.
 * @param value 权威 Scenario / Authoritative Scenario.
 * @param workspaceId 路径 Workspace / Workspace in the path.
 * @param scenarioId 可选路径 Scenario / Optional Scenario in the path.
 */
function assertScenarioMatchesPath(
  value: InterviewScenario,
  workspaceId: string,
  scenarioId?: string
): void {
  if (value.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewScenario outside the requested Workspace.'
    )
  }
  if (scenarioId !== undefined && value.id !== scenarioId) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewScenario whose identity differs from the request path.'
    )
  }
}

/**
 * @brief 校验创建响应保留 command 字段 / Validate that a creation response preserves command fields.
 * @param value 权威 Scenario / Authoritative Scenario.
 * @param request 严格创建请求 / Strict creation request.
 */
function assertScenarioMatchesCreate(
  value: InterviewScenario,
  request: CreateInterviewScenarioRequest
): void {
  if (!wireValuesEqual(scenarioInput(value), request)) {
    throw new ApiV2ContractError(
      'API v2 InterviewScenario creation response does not match the submitted fields.'
    )
  }
}

/**
 * @brief 校验更新响应反映每个 patch 字段 / Validate that an update response reflects every patch field.
 * @param value 更新后 Scenario / Updated Scenario.
 * @param request 严格 patch / Strict patch.
 */
function assertScenarioMatchesUpdate(
  value: InterviewScenario,
  request: UpdateInterviewScenarioRequest
): void {
  /** @brief 用于字段读取的权威表示 / Authoritative representation used for field lookup. */
  const representation = value as unknown as Readonly<Record<string, unknown>>
  /** @brief 用于字段读取的 patch / Patch used for field lookup. */
  const patch = request as unknown as Readonly<Record<string, unknown>>
  if (Object.keys(patch).some((key) => !wireValuesEqual(representation[key], patch[key]))) {
    throw new ApiV2ContractError(
      'API v2 InterviewScenario update response does not reflect the submitted patch.'
    )
  }
}

/**
 * @brief 读取一页 Workspace Scenario / Read one page of Workspace Scenarios.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、cursor、limit 与取消信号 / Workspace, cursor, limit, and cancellation signal.
 * @return 与路径 Workspace 一致的 cursor 页 / Cursor page matching the path Workspace.
 */
export async function listWorkspaceInterviewScenarioPage(
  client: ApiV2Client,
  request: InterviewScenarioPageRequest
): Promise<CursorCollection<InterviewScenario>> {
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
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-scenarios`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_SCENARIO_LIST_MAX_RESPONSE_BYTES,
      query: { cursor, limit },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已解码页 / Decoded page. */
  const page = parseInterviewScenarioList(response.data)
  if (page.items.some((scenario) => scenario.workspace_id !== workspaceId)) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewScenario outside the requested Workspace collection.'
    )
  }
  return page
}

/**
 * @brief 读取一个权威 Scenario / Read one authoritative Scenario.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、Scenario 与取消信号 / Workspace, Scenario, and cancellation signal.
 * @return Scenario、同响应强 ETag 与 request ID / Scenario, co-response strong ETag, and request ID.
 */
export async function getWorkspaceInterviewScenario(
  client: ApiV2Client,
  request: InterviewScenarioReadRequest
): Promise<InterviewScenarioRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Scenario / Validated Scenario. */
  const scenarioId = opaqueId(request.scenarioId, 'request.scenario_id')
  /** @brief 严格 200 响应 / Strict 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-scenarios/${encodeURIComponent(scenarioId)}`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_SCENARIO_MAX_RESPONSE_BYTES,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已解码 Scenario / Decoded Scenario. */
  const value = parseInterviewScenario(response.data)
  assertScenarioMatchesPath(value, workspaceId, scenarioId)
  return {
    entityTag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
    requestId: opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id'),
    value
  }
}

/**
 * @brief 幂等创建一个 Scenario / Idempotently create one Scenario.
 * @param client 固定 201 的 Scenario 创建 port / Scenario creation port fixed to 201.
 * @param command Workspace、幂等键、payload 与取消信号 / Workspace, idempotency key, payload, and cancellation signal.
 * @return 已确认创建的权威 Scenario / Confirmed authoritative created Scenario.
 */
export async function createWorkspaceInterviewScenario(
  client: InterviewScenarioCreationHttpClient,
  command: CreateWorkspaceInterviewScenarioCommand
): Promise<CreatedInterviewScenarioRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 严格请求 / Strict request. */
  const request = encodeCreateInterviewScenarioRequest(command.request)
  /** @brief 稳定幂等键 / Stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 201 transport 响应 / Transport response fixed to 201. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-scenarios`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: CREATE_INTERVIEW_SCENARIO_MAX_REQUEST_BYTES,
      maxResponseBytes: INTERVIEW_SCENARIO_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'created-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 201, (): CreatedInterviewScenarioRepresentation => {
    /** @brief 已解码 Scenario / Decoded Scenario. */
    const value = parseInterviewScenario(response.data)
    assertScenarioMatchesPath(value, workspaceId)
    assertScenarioMatchesCreate(value, request)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      location: exactResourceLocation(
        response.metadata.location,
        `/api/v2/workspaces/${workspaceId}/interview-scenarios/${value.id}`
      ),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}

/**
 * @brief 以强 If-Match 更新 Scenario / Update a Scenario using strong If-Match.
 * @param client 固定 200 的 Scenario 更新 port / Scenario update port fixed to 200.
 * @param command Workspace、Scenario、patch、ETag 与取消信号 / Workspace, Scenario, patch, ETag, and cancellation signal.
 * @return 更新后权威 Scenario / Updated authoritative Scenario.
 */
export async function updateWorkspaceInterviewScenario(
  client: InterviewScenarioUpdateHttpClient,
  command: UpdateWorkspaceInterviewScenarioCommand
): Promise<InterviewScenarioRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Scenario / Validated Scenario. */
  const scenarioId = opaqueId(command.scenarioId, 'request.scenario_id')
  /** @brief 严格 patch / Strict patch. */
  const request = encodeUpdateInterviewScenarioRequest(command.request)
  /** @brief 强前置条件 / Strong precondition. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 200 transport 响应 / Transport response fixed to 200. */
  const response = await client.patchJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-scenarios/${encodeURIComponent(scenarioId)}`,
    request,
    {
      ifMatch,
      maxRequestBytes: UPDATE_INTERVIEW_SCENARIO_MAX_REQUEST_BYTES,
      maxResponseBytes: INTERVIEW_SCENARIO_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal })
    }
  )
  return decodeAcknowledgedWrite(response, 200, (): InterviewScenarioRepresentation => {
    /** @brief 已解码 Scenario / Decoded Scenario. */
    const value = parseInterviewScenario(response.data)
    assertScenarioMatchesPath(value, workspaceId, scenarioId)
    assertScenarioMatchesUpdate(value, request)
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}
