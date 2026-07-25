/** @file API v2 Workspace Resume 创建 command 消费者 / API v2 Workspace Resume creation-command consumer. */

import type { ApiV2CreatedResourceResponse, ApiV2PostJsonOptions } from '../http/client'
import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import { idempotencyKey, opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  encodeCreateResumeRequest,
  parseResumeDocument,
  type CreateResumeRequest,
  type ResumeDocument
} from './resume-document'

/** @brief CreateResumeRequest 的请求字节上限 / Request byte ceiling for CreateResumeRequest. */
const CREATE_RESUME_MAX_REQUEST_BYTES = 64 * 1024

/** @brief 完整 ResumeDocument 创建响应的字节上限 / Response byte ceiling for a complete created ResumeDocument. */
const CREATE_RESUME_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Resume 创建端点所需的最小且固定 201 的 HTTP 能力 / Minimal HTTP capability fixed to the Resume endpoint's 201 semantics. */
export interface ResumeCreationHttpClient {
  /**
   * @brief 发送固定为 created-resource 的 JSON command / Send a JSON command fixed to created-resource semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 严格 JSON 请求 / Strict JSON request.
   * @param options 稳定幂等键、大小、取消与固定 201 策略 / Stable idempotency key, sizes, cancellation, and fixed 201 policy.
   * @return 带强 ETag 与 Location 的 201 表示 / 201 representation carrying a strong ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'created-resource'>
  ) => Promise<ApiV2CreatedResourceResponse>
}

/** @brief 在显式 Workspace 中创建 Resume 的 command / Command for creating a Resume in an explicit Workspace. */
export interface CreateWorkspaceResumeCommand {
  /** @brief 授权路径所属 Workspace / Workspace owning the authorization path. */
  readonly workspaceId: string
  /** @brief 一次用户创建意图内稳定的幂等键 / Idempotency key stable within one user creation intent. */
  readonly idempotencyKey: string
  /** @brief 严格的 API v2 创建 payload / Strict API v2 creation payload. */
  readonly request: CreateResumeRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 已确认创建的 Resume 表示 / Representation of a confirmed created Resume. */
export interface CreatedResumeRepresentation {
  /** @brief 已严格解码的权威 ResumeDocument / Strictly decoded authoritative ResumeDocument. */
  readonly value: ResumeDocument
  /** @brief 与 value 原子配对的强 ETag / Strong ETag atomically paired with value. */
  readonly entityTag: string
  /** @brief 新资源的规范绝对 Location / Canonical absolute Location of the new resource. */
  readonly location: string
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/**
 * @brief 比较两个 BCP 47 Locale 的 ASCII 大小写无关身份 / Compare two BCP 47 Locale identities with ASCII case insensitivity.
 * @param left 左侧已验证 Locale / Left validated Locale.
 * @param right 右侧已验证 Locale / Right validated Locale.
 * @return 大小写差异外精确一致时为 true / True when exactly equal except for ASCII casing.
 */
function sameLocale(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

/**
 * @brief 校验创建结果与提交 command 的权威字段一致 / Validate that a creation result matches authoritative fields of the submitted command.
 * @param document 已严格解码的创建结果 / Strictly decoded creation result.
 * @param workspaceId 请求路径中的 Workspace / Workspace in the request path.
 * @param request 已严格编码的创建请求 / Strictly encoded creation request.
 */
function assertCreatedResumeMatchesCommand(
  document: ResumeDocument,
  workspaceId: string,
  request: CreateResumeRequest
): void {
  if (document.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 returned a created Resume from a different Workspace than the request path.'
    )
  }
  if (document.title !== request.title) {
    throw new ApiV2ContractError('API v2 returned a created Resume with a different title.')
  }
  if (!sameLocale(document.locale, request.locale)) {
    throw new ApiV2ContractError('API v2 returned a created Resume with a different locale.')
  }
  if (
    document.template.template_id !== request.template.template_id ||
    document.template.version !== request.template.version
  ) {
    throw new ApiV2ContractError(
      'API v2 returned a created Resume with a different immutable Template identity.'
    )
  }
  if (
    request.clone_from_resume_id !== undefined &&
    request.clone_from_resume_id !== null &&
    document.id === request.clone_from_resume_id
  ) {
    throw new ApiV2ContractError(
      'API v2 clone creation returned the source Resume identity instead of a new identity.'
    )
  }
}

/**
 * @brief 校验创建 Location 精确指向响应 Resume / Validate that a creation Location points exactly to the response Resume.
 * @param location Transport 已验证的同源绝对 Location / Same-origin absolute Location validated by the transport.
 * @param workspaceId 请求路径中的 Workspace / Workspace in the request path.
 * @param resumeId 响应 Resume ID / Resume ID in the response.
 * @return 未改写的规范绝对 Location / Unmodified canonical absolute Location.
 */
function createdResumeLocation(location: string, workspaceId: string, resumeId: string): string {
  /** @brief 已解析绝对 Location / Parsed absolute Location. */
  let parsed: URL
  try {
    parsed = new URL(location)
  } catch {
    throw new ApiV2ContractError('API v2 Resume creation returned an invalid absolute Location.')
  }
  /** @brief 由响应 identity 决定的唯一规范路径 / Unique canonical path determined by the response identity. */
  const expectedPath = `/api/v2/workspaces/${workspaceId}/resumes/${resumeId}`
  if (parsed.pathname !== expectedPath || parsed.search !== '' || parsed.hash !== '') {
    throw new ApiV2ContractError(
      'API v2 Resume creation Location does not identify the created Resume exactly.'
    )
  }
  return location
}

/**
 * @brief 以稳定幂等 command 创建一个 Workspace Resume / Create one Workspace Resume with a stable idempotent command.
 * @param client 具备严格 POST 语义的 API v2 HTTP client / API v2 HTTP client with strict POST semantics.
 * @param command Workspace、payload、幂等键与取消信号 / Workspace, payload, idempotency key, and cancellation signal.
 * @return 权威 Resume 与强 ETag、Location、request ID / Authoritative Resume with its strong ETag, Location, and request ID.
 */
export async function createWorkspaceResume(
  client: ResumeCreationHttpClient,
  command: CreateWorkspaceResumeCommand
): Promise<CreatedResumeRepresentation> {
  /** @brief 仅读取一次的 Workspace ID 候选值 / Workspace-ID candidate read exactly once. */
  const workspaceIdCandidate = command.workspaceId
  /** @brief 仅读取一次的幂等键 / Idempotency key read exactly once. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 仅读取一次的 wire payload / Wire payload read exactly once. */
  const requestCandidate = command.request
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证且精确保留 clone omission 的 payload / Validated payload preserving clone omission exactly. */
  const request = encodeCreateResumeRequest(requestCandidate)
  /** @brief Workspace-scoped Resume collection path / Workspace-scoped Resume collection path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resumes`
  /** @brief 固定 201 创建语义的 transport 响应 / Transport response with fixed 201 creation semantics. */
  const response = await client.postJson(path, request, {
    idempotencyKey: validatedIdempotencyKey,
    maxRequestBytes: CREATE_RESUME_MAX_REQUEST_BYTES,
    maxResponseBytes: CREATE_RESUME_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal }),
    successKind: 'created-resource'
  })
  return decodeAcknowledgedWrite(response, 201, (): CreatedResumeRepresentation => {
    /** @brief 已严格解码的权威 Resume / Strictly decoded authoritative Resume. */
    const value = parseResumeDocument(response.data)
    assertCreatedResumeMatchesCommand(value, workspaceId, request)
    /** @brief 与权威 Resume 配对的强 ETag / Strong ETag paired with the authoritative Resume. */
    const entityTag = strongEntityTag(response.metadata.entityTag, 'response.headers.ETag')
    /** @brief 已验证服务端请求 ID / Validated server request ID. */
    const requestId = opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id')
    /** @brief 精确指向响应 Resume 的绝对 Location / Absolute Location pointing exactly to the response Resume. */
    const location = createdResumeLocation(response.metadata.location, workspaceId, value.id)
    return { entityTag, location, requestId, value }
  })
}
