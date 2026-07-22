/** @file API v2 Workspace Job cursor 集合查询 / API v2 Workspace Job cursor-collection query. */

import type { ApiV2Client } from '../http/client'
import {
  boundedArray,
  boundedInteger,
  boundedString,
  exactRecord,
  opaqueId,
  parseCursorPage,
  type CursorCollection
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { resourceType } from '../resources/resource-reference'
import { parseJob, type Job } from './job'

/** @brief JobList 最多包含的 Job 数 / Maximum number of Jobs in one JobList. */
const JOB_LIST_MAXIMUM_ITEMS = 200

/** @brief JobList 页的解码前字节上限 / Pre-decoding byte ceiling for one JobList page. */
const JOB_LIST_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 一页 Workspace Job 查询 / Query for one page of Workspace Jobs. */
export interface JobListPageRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 可选 Job kind 过滤器 / Optional Job-kind filter. */
  readonly kind?: string | null
  /** @brief 可选 subject 资源类型过滤器 / Optional subject-resource-type filter. */
  readonly subjectType?: string | null
  /** @brief 可选 subject 资源 ID 过滤器 / Optional subject-resource-ID filter. */
  readonly subjectId?: string | null
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 严格解码 JobList 与 cursor 关联约束 / Strictly decode a JobList and its cursor relation.
 * @param value 未知列表响应 / Unknown list response.
 * @return 已验证 Job cursor 页 / Validated Job cursor page.
 */
export function parseJobList(value: unknown): CursorCollection<Job> {
  /** @brief 精确 JobList 对象 / Exact JobList object. */
  const input = exactRecord(value, 'job_list', ['items', 'page'])
  /** @brief 未映射 Job 条目 / Unmapped Job items. */
  const items = boundedArray(input.items, 'job_list.items', JOB_LIST_MAXIMUM_ITEMS)
  return {
    items: items.map((item) => parseJob(item)),
    page: parseCursorPage(input.page, 'job_list.page')
  }
}

/**
 * @brief 按 canonical filters 读取一页 Workspace Job / Read one Workspace Job page with canonical filters.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request Workspace、opaque cursor、limit 与服务端过滤器 / Workspace, opaque cursor, limit, and server-side filters.
 * @return 所有 Job 均属于路径 Workspace 的 cursor 页 / Cursor page whose Jobs all belong to the path Workspace.
 * @note cursor 绑定 principal、Workspace 与 filters；调用方变更过滤器后不得复用旧 cursor / A cursor is bound to its principal, Workspace, and filters; callers must not reuse it after changing filters.
 */
export async function listWorkspaceJobPage(
  client: ApiV2Client,
  request: JobListPageRequest
): Promise<CursorCollection<Job>> {
  /** @brief 只读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 只读取一次的 cursor / Cursor read exactly once. */
  const cursorCandidate = request.cursor
  /** @brief 只读取一次的 limit / Limit read exactly once. */
  const limitCandidate = request.limit
  /** @brief 只读取一次的 Job kind / Job kind read exactly once. */
  const kindCandidate = request.kind
  /** @brief 只读取一次的 subject type / Subject type read exactly once. */
  const subjectTypeCandidate = request.subjectType
  /** @brief 只读取一次的 subject ID / Subject ID read exactly once. */
  const subjectIdCandidate = request.subjectId
  /** @brief 只读取一次的取消信号 / Abort signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 opaque cursor / Validated opaque cursor. */
  const cursor =
    cursorCandidate === undefined || cursorCandidate === null
      ? null
      : boundedString(cursorCandidate, 'request.cursor', 1, 2048)
  /** @brief 已验证 page size / Validated page size. */
  const limit =
    limitCandidate === undefined
      ? 50
      : boundedInteger(limitCandidate, 'request.limit', 1, JOB_LIST_MAXIMUM_ITEMS)
  /** @brief 已验证可选 Job kind / Validated optional Job kind. */
  const kind =
    kindCandidate === undefined || kindCandidate === null
      ? null
      : resourceType(kindCandidate, 'request.kind')
  /** @brief 已验证可选 subject type / Validated optional subject type. */
  const subjectType =
    subjectTypeCandidate === undefined || subjectTypeCandidate === null
      ? null
      : resourceType(subjectTypeCandidate, 'request.subject_type')
  /** @brief 已验证可选 subject ID / Validated optional subject ID. */
  const subjectId =
    subjectIdCandidate === undefined || subjectIdCandidate === null
      ? null
      : opaqueId(subjectIdCandidate, 'request.subject_id')
  /** @brief Workspace-scoped Job collection path / Workspace-scoped Job collection path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/jobs`
  /** @brief transport 严格返回的 200 JSON 页 / 200 JSON page strictly returned by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: JOB_LIST_MAX_RESPONSE_BYTES,
    query: {
      cursor,
      kind,
      limit,
      subject_id: subjectId,
      subject_type: subjectType
    },
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已验证 Job 页 / Validated Job page. */
  const page = parseJobList(response.data)
  if (page.items.some((job) => job.workspace_id !== workspaceId)) {
    throw new ApiV2ContractError(
      'API v2 returned a Job outside the requested Workspace collection.'
    )
  }
  return page
}
