/** @file API v2 Workspace Resume 单文档查询消费者 / API v2 Workspace Resume single-document query consumer. */

import type { ApiV2Client } from '../http/client'
import { opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseResumeDocument, type ResumeDocument } from './resume-document'

/** @brief 完整 ResumeDocument 查询响应的字节上限 / Response byte ceiling for a complete ResumeDocument query. */
const RESUME_DOCUMENT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief Workspace Resume 单文档读取参数 / Parameters for reading one Workspace Resume document. */
export interface ResumeDocumentReadRequest {
  /** @brief 授权路径所属 Workspace / Workspace owning the authorization path. */
  readonly workspaceId: string
  /** @brief 要读取的不透明 Resume ID / Opaque Resume ID to read. */
  readonly resumeId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带并发校验器的权威 Resume 表示 / Authoritative Resume representation with its concurrency validator. */
export interface ResumeRepresentation {
  /** @brief 已严格解码且无损的权威 ResumeDocument / Strictly decoded, lossless authoritative ResumeDocument. */
  readonly value: ResumeDocument
  /** @brief 后续写入使用的强 If-Match 校验器 / Strong validator for a subsequent If-Match. */
  readonly entityTag: string
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/**
 * @brief 校验响应 identity 与请求路径精确一致 / Validate that response identity exactly matches the request path.
 * @param document 已严格解码的 ResumeDocument / Strictly decoded ResumeDocument.
 * @param workspaceId 请求路径中的 Workspace ID / Workspace ID in the request path.
 * @param resumeId 请求路径中的 Resume ID / Resume ID in the request path.
 */
function assertResumeMatchesPath(
  document: ResumeDocument,
  workspaceId: string,
  resumeId: string
): void {
  if (document.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeDocument from a different Workspace than the request path.'
    )
  }
  if (document.id !== resumeId) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeDocument whose identity differs from the request path.'
    )
  }
}

/**
 * @brief 读取一个 Workspace 中的权威 ResumeDocument / Read one authoritative ResumeDocument in a Workspace.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Resume identity 与取消信号 / Explicit Workspace and Resume identities plus cancellation signal.
 * @return 同一 200 响应中的无损 Resume、强 ETag 与 request ID / Lossless Resume, strong ETag, and request ID from the same 200 response.
 * @note revision 是领域版本，entityTag 是表示校验器；调用方不得从 ETag 文本推断 revision / revision is a domain version while entityTag is a representation validator; callers must not infer revision from ETag text.
 */
export async function getWorkspaceResume(
  client: ApiV2Client,
  request: ResumeDocumentReadRequest
): Promise<ResumeRepresentation> {
  /** @brief 仅读取一次的 Workspace ID 候选值 / Workspace-ID candidate read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 仅读取一次的 Resume ID 候选值 / Resume-ID candidate read exactly once. */
  const resumeIdCandidate = request.resumeId
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 Resume ID / Validated Resume ID. */
  const resumeId = opaqueId(resumeIdCandidate, 'request.resume_id')
  /** @brief Workspace-scoped Resume resource path / Workspace-scoped Resume resource path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resumes/${encodeURIComponent(resumeId)}`
  /** @brief transport 严格验证后的 200 JSON 响应 / 200 JSON response strictly validated by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: RESUME_DOCUMENT_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 无损解码的权威 ResumeDocument / Losslessly decoded authoritative ResumeDocument. */
  const value = parseResumeDocument(response.data)
  assertResumeMatchesPath(value, workspaceId, resumeId)
  /** @brief 与 value 同一响应中的强 ETag / Strong ETag from the same response as value. */
  const entityTag = strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag')
  /** @brief transport 已验证、此处再次收窄的响应请求 ID / Transport-validated response request ID narrowed again here. */
  const requestId = opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id')
  return { entityTag, requestId, value }
}
