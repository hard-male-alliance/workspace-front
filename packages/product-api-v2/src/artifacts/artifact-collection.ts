/** @file API v2 Workspace Artifact cursor 集合查询 / API v2 Workspace Artifact cursor-collection query. */

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
import { artifactKind, parseArtifact, type Artifact, type ArtifactKind } from './artifact'

/** @brief ArtifactList 最多包含的 Artifact 数 / Maximum number of Artifacts in one ArtifactList. */
const ARTIFACT_LIST_MAXIMUM_ITEMS = 200

/** @brief ArtifactList 页的解码前字节上限 / Pre-decoding byte ceiling for one ArtifactList page. */
const ARTIFACT_LIST_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 一页 Workspace Artifact 查询 / Query for one page of Workspace Artifacts. */
export interface ArtifactListPageRequest {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 可选 Artifact kind 过滤器 / Optional Artifact-kind filter. */
  readonly kind?: ArtifactKind | null
  /** @brief 可选 subject 资源类型过滤器 / Optional subject-resource-type filter. */
  readonly subjectType?: string | null
  /** @brief 可选 subject 资源 ID 过滤器 / Optional subject-resource-ID filter. */
  readonly subjectId?: string | null
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 拒绝非 JSON 稀疏 Artifact items 数组 / Reject a non-JSON sparse Artifact items array.
 * @param value 未知 items / Unknown items.
 * @return 最多 200 个条目的稠密数组 / Dense array containing at most 200 items.
 */
function artifactListItems(value: unknown): readonly unknown[] {
  /** @brief 已验证长度上限的数组 / Array validated against the length ceiling. */
  const items = boundedArray(value, 'artifact_list.items', ARTIFACT_LIST_MAXIMUM_ITEMS)
  for (let index = 0; index < items.length; index += 1) {
    if (!Object.hasOwn(items, index)) {
      throw new ApiV2ContractError('API v2 field artifact_list.items must be a dense JSON array.')
    }
  }
  return items
}

/**
 * @brief 严格解码 ArtifactList 与 cursor 关联约束 / Strictly decode an ArtifactList and its cursor relation.
 * @param value 未知列表响应 / Unknown list response.
 * @return 已验证 Artifact cursor 页 / Validated Artifact cursor page.
 */
export function parseArtifactList(value: unknown): CursorCollection<Artifact> {
  /** @brief 精确 ArtifactList 对象 / Exact ArtifactList object. */
  const input = exactRecord(value, 'artifact_list', ['items', 'page'])
  /** @brief 未映射 Artifact 条目 / Unmapped Artifact items. */
  const items = artifactListItems(input.items)
  return {
    items: items.map((item) => parseArtifact(item)),
    page: parseCursorPage(input.page, 'artifact_list.page')
  }
}

/**
 * @brief 按 canonical filters 读取一页 Workspace Artifact / Read one Workspace Artifact page with canonical filters.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request Workspace、opaque cursor、limit 与服务端过滤器 / Workspace, opaque cursor, limit, and server-side filters.
 * @return 所有 Artifact 均属于路径 Workspace 的 cursor 页 / Cursor page whose Artifacts all belong to the path Workspace.
 * @note cursor 绑定 principal、Workspace 与 filters；调用方变更过滤器后不得复用旧 cursor / A cursor is bound to its principal, Workspace, and filters; callers must not reuse it after changing filters.
 */
export async function listWorkspaceArtifactPage(
  client: ApiV2Client,
  request: ArtifactListPageRequest
): Promise<CursorCollection<Artifact>> {
  /** @brief 只读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 只读取一次的 cursor / Cursor read exactly once. */
  const cursorCandidate = request.cursor
  /** @brief 只读取一次的 limit / Limit read exactly once. */
  const limitCandidate = request.limit
  /** @brief 只读取一次的 Artifact kind / Artifact kind read exactly once. */
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
      : boundedInteger(limitCandidate, 'request.limit', 1, ARTIFACT_LIST_MAXIMUM_ITEMS)
  /** @brief 已验证可选 Artifact kind / Validated optional Artifact kind. */
  const kind =
    kindCandidate === undefined || kindCandidate === null
      ? null
      : artifactKind(kindCandidate, 'request.kind')
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
  /** @brief Workspace-scoped Artifact collection path / Workspace-scoped Artifact collection path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/artifacts`
  /** @brief transport 严格返回的 200 JSON 页 / 200 JSON page strictly returned by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: ARTIFACT_LIST_MAX_RESPONSE_BYTES,
    query: {
      cursor,
      kind,
      limit,
      subject_id: subjectId,
      subject_type: subjectType
    },
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已验证 Artifact 页 / Validated Artifact page. */
  const page = parseArtifactList(response.data)
  if (page.items.some((artifact) => artifact.workspace_id !== workspaceId)) {
    throw new ApiV2ContractError(
      'API v2 returned an Artifact outside the requested Workspace collection.'
    )
  }
  return page
}
