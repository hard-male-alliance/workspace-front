/** @file API v2 Resume 不可变修订历史查询 / API v2 immutable Resume revision-history queries. */

import type { ApiV2Client } from '../http/client'
import {
  arrayBetween,
  boundedInteger,
  boundedString,
  exactRecord,
  opaqueId,
  parseCursorPage,
  timestamp,
  type CursorCollection
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'
import { parseResumeDocument, type ResumeDocument } from './resume-document'

/** @brief Revision 摘要页的响应字节上限 / Response-byte ceiling for a page of revision summaries. */
const RESUME_REVISION_LIST_MAX_RESPONSE_BYTES = 512 * 1024

/** @brief 含完整历史 SIR 的 Revision 响应字节上限 / Response-byte ceiling for a revision containing a complete historical SIR. */
const RESUME_REVISION_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 一个不可变 Resume revision 摘要 / Summary of one immutable Resume revision. */
export interface ResumeRevisionSummary {
  /** @brief 所属 Resume identity / Owning Resume identity. */
  readonly resume_id: string
  /** @brief 领域 revision / Domain revision. */
  readonly revision: number
  /** @brief Revision 创建时间 / Revision creation time. */
  readonly created_at: string
  /** @brief 创建者资源引用 / Creator resource reference. */
  readonly created_by: ResourceReference
}

/** @brief 一个含完整历史 SIR 的不可变 Resume revision / One immutable Resume revision carrying the complete historical SIR. */
export interface ResumeRevision extends ResumeRevisionSummary {
  /** @brief 该 revision 的完整无损 ResumeDocument / Complete lossless ResumeDocument for this revision. */
  readonly document: ResumeDocument
}

/** @brief Resume revision 摘要单页查询 / One-page Resume revision-summary query. */
export interface ResumeRevisionListPageRequest {
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 单个 Resume revision 查询 / Query for one Resume revision. */
export interface ResumeRevisionReadRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 所属 Resume identity / Owning Resume identity. */
  readonly resumeId: string
  /** @brief 要读取的正整数 revision / Positive revision to read. */
  readonly revision: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 严格解码 ResumeRevisionSummary / Strictly decode a ResumeRevisionSummary.
 * @param value 未知摘要 / Unknown summary.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证且无损的摘要 / Validated lossless summary.
 */
export function parseResumeRevisionSummary(
  value: unknown,
  path = 'resume_revision_summary'
): ResumeRevisionSummary {
  /** @brief 精确摘要对象 / Exact summary object. */
  const input = exactRecord(value, path, ['resume_id', 'revision', 'created_at', 'created_by'])
  return {
    created_at: timestamp(input.created_at, `${path}.created_at`),
    created_by: parseResourceReference(input.created_by, `${path}.created_by`),
    resume_id: opaqueId(input.resume_id, `${path}.resume_id`),
    revision: boundedInteger(input.revision, `${path}.revision`, 1, Number.MAX_SAFE_INTEGER)
  }
}

/**
 * @brief 严格解码 ResumeRevision / Strictly decode a ResumeRevision.
 * @param value 未知 revision / Unknown revision.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 含完整历史 SIR 的 revision / Revision carrying its complete historical SIR.
 */
export function parseResumeRevision(value: unknown, path = 'resume_revision'): ResumeRevision {
  /** @brief 精确 revision 对象 / Exact revision object. */
  const input = exactRecord(value, path, [
    'resume_id',
    'revision',
    'created_at',
    'created_by',
    'document'
  ])
  /** @brief 摘要字段投影 / Projection of summary fields. */
  const summary = parseResumeRevisionSummary(
    {
      created_at: input.created_at,
      created_by: input.created_by,
      resume_id: input.resume_id,
      revision: input.revision
    },
    path
  )
  return { ...summary, document: parseResumeDocument(input.document, `${path}.document`) }
}

/**
 * @brief 严格解码 ResumeRevisionList / Strictly decode a ResumeRevisionList.
 * @param value 未知列表 / Unknown list.
 * @return 已验证的 cursor page / Validated cursor page.
 */
export function parseResumeRevisionList(value: unknown): CursorCollection<ResumeRevisionSummary> {
  /** @brief 精确列表对象 / Exact list object. */
  const input = exactRecord(value, 'resume_revision_list', ['items', 'page'])
  /** @brief 已解码 revision 摘要 / Decoded revision summaries. */
  const items = arrayBetween(input.items, 'resume_revision_list.items', 0, 200).map((item, index) =>
    parseResumeRevisionSummary(item, `resume_revision_list.items[${index}]`)
  )
  /** @brief 当前页 revision identity 集合 / Revision identities on the current page. */
  const revisions = new Set(items.map((item) => item.revision))
  if (revisions.size !== items.length) {
    throw new ApiV2ContractError('API v2 returned duplicate Resume revisions in one page.')
  }
  return { items, page: parseCursorPage(input.page, 'resume_revision_list.page') }
}

/**
 * @brief 读取一个 Resume 的一页不可变 revision 摘要 / Read one page of immutable revision summaries for a Resume.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param workspaceId 显式授权 Workspace / Explicit authorization Workspace.
 * @param resumeId 路径中的 Resume identity / Resume identity in the path.
 * @param request cursor、limit 与取消信号 / Cursor, limit, and cancellation signal.
 * @return 身份均与路径一致的 revision page / Revision page whose identities all match the path.
 */
export async function listWorkspaceResumeRevisionPage(
  client: ApiV2Client,
  workspaceId: string,
  resumeId: string,
  request: ResumeRevisionListPageRequest = {}
): Promise<CursorCollection<ResumeRevisionSummary>> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const validatedWorkspaceId = opaqueId(workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const validatedResumeId = opaqueId(resumeId, 'request.resume_id')
  /** @brief 已验证 page size / Validated page size. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 opaque cursor / Validated opaque cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief revision collection 的显式租户路径 / Explicit-tenant path for the revision collection. */
  const path = `/workspaces/${encodeURIComponent(validatedWorkspaceId)}/resumes/${encodeURIComponent(validatedResumeId)}/revisions`
  /** @brief 严格 transport 返回的 200 JSON / 200 JSON returned by the strict transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: RESUME_REVISION_LIST_MAX_RESPONSE_BYTES,
    query: { cursor, limit },
    ...(request.signal === undefined ? {} : { signal: request.signal })
  })
  /** @brief 已验证 revision page / Validated revision page. */
  const page = parseResumeRevisionList(response.data)
  if (page.items.some((item) => item.resume_id !== validatedResumeId)) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeRevisionSummary outside the requested Resume path.'
    )
  }
  return page
}

/**
 * @brief 读取一个不可变 Resume revision 的完整历史 SIR / Read the complete historical SIR of one immutable Resume revision.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Resume、revision 与取消信号 / Explicit Workspace, Resume, revision, and cancellation signal.
 * @return 与路径 identity 完全一致的 revision / Revision exactly matching every path identity.
 */
export async function getWorkspaceResumeRevision(
  client: ApiV2Client,
  request: ResumeRevisionReadRequest
): Promise<ResumeRevision> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(request.resumeId, 'request.resume_id')
  /** @brief 已验证正整数 revision / Validated positive revision. */
  const revision = boundedInteger(request.revision, 'request.revision', 1, Number.MAX_SAFE_INTEGER)
  /** @brief 不可变 revision resource path / Immutable revision resource path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/resumes/${encodeURIComponent(resumeId)}/revisions/${revision}`
  /** @brief 严格 transport 返回的 200 JSON / 200 JSON returned by the strict transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: RESUME_REVISION_MAX_RESPONSE_BYTES,
    ...(request.signal === undefined ? {} : { signal: request.signal })
  })
  /** @brief 已解码完整 revision / Decoded complete revision. */
  const result = parseResumeRevision(response.data)
  if (
    result.resume_id !== resumeId ||
    result.revision !== revision ||
    result.document.workspace_id !== workspaceId ||
    result.document.id !== resumeId ||
    result.document.revision !== revision
  ) {
    throw new ApiV2ContractError(
      'API v2 returned a ResumeRevision whose identities differ from the requested path.'
    )
  }
  return result
}
