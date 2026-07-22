/** @file Workspace-scoped API v2 ResumeSummary 集合消费者 / Workspace-scoped API v2 ResumeSummary collection consumer. */

import type { ApiV2Client } from '../http/client'
import {
  boundedArray,
  boundedInteger,
  boundedString,
  exactRecord,
  locale,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  type CursorCollection,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

/** @brief Resume 固定的不可变模板引用 / Immutable template reference pinned by a Resume. */
export interface ResumeTemplateReference {
  /** @brief 模板资源 ID / Template-resource ID. */
  readonly template_id: string
  /** @brief 不可变模板版本 / Immutable template version. */
  readonly version: string
}

/** @brief API v2 Resume 列表摘要 / API v2 Resume-list summary. */
export interface ResumeSummary extends ResourceFields {
  /** @brief 授权路径对应的 Workspace ID / Workspace ID corresponding to the authorization path. */
  readonly workspace_id: string
  /** @brief Resume 标题 / Resume title. */
  readonly title: string
  /** @brief Resume 内容 Locale / Resume-content locale. */
  readonly locale: string
  /** @brief 固定模板版本 / Pinned template version. */
  readonly template: ResumeTemplateReference
}

/** @brief ResumeSummary 单页查询 / One-page ResumeSummary query. */
export interface ResumeListPageRequest {
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 严格解码模板引用 / Strictly decode a template reference.
 * @param value 未知模板引用 / Unknown template reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证模板引用 / Validated template reference.
 */
function parseTemplateReference(value: unknown, path: string): ResumeTemplateReference {
  /** @brief 精确模板引用对象 / Exact template-reference object. */
  const input = exactRecord(value, path, ['template_id', 'version'])
  return {
    template_id: opaqueId(input.template_id, `${path}.template_id`),
    version: boundedString(input.version, `${path}.version`, 1, 80)
  }
}

/**
 * @brief 严格解码 ResumeSummary / Strictly decode ResumeSummary.
 * @param value 未知摘要 / Unknown summary.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证摘要 / Validated summary.
 */
function parseResumeSummary(value: unknown, path: string): ResumeSummary {
  /** @brief 精确 ResumeSummary 对象 / Exact ResumeSummary object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'title',
    'locale',
    'template'
  ])
  return {
    ...parseResourceFields(input, path),
    locale: locale(input.locale, `${path}.locale`),
    template: parseTemplateReference(input.template, `${path}.template`),
    title: boundedString(input.title, `${path}.title`, 1, 300),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/**
 * @brief 严格解码 ResumeList / Strictly decode ResumeList.
 * @param value 未知列表响应 / Unknown list response.
 * @return 已验证摘要页 / Validated summary page.
 */
export function parseResumeList(value: unknown): CursorCollection<ResumeSummary> {
  /** @brief 精确集合对象 / Exact collection object. */
  const input = exactRecord(value, 'resume_list', ['items', 'page'])
  /** @brief 未映射摘要 / Unmapped summaries. */
  const items = boundedArray(input.items, 'resume_list.items', 200)
  return {
    items: items.map((item, index) => parseResumeSummary(item, `resume_list.items[${index}]`)),
    page: parseCursorPage(input.page, 'resume_list.page')
  }
}

/** @brief API v2 Workspace-scoped Resume 列表 Gateway / API v2 Workspace-scoped Resume-list gateway. */
export class ResumeListGateway {
  /** @brief API v2 HTTP 边界 / API v2 HTTP boundary. */
  readonly #client: ApiV2Client

  /**
   * @brief 构造 ResumeList Gateway / Construct the ResumeList gateway.
   * @param client v2-only Bearer 客户端 / v2-only Bearer client.
   */
  constructor(client: ApiV2Client) {
    this.#client = client
  }

  /**
   * @brief 读取一个 Workspace 的一页 ResumeSummary / Read one ResumeSummary page in one Workspace.
   * @param workspaceId 显式授权上下文 / Explicit authorization context.
   * @param request opaque cursor、limit 与取消信号 / Opaque cursor, limit, and cancellation signal.
   * @return 与路径 Workspace 一致的摘要页 / Summary page matching the path Workspace.
   */
  async listResumesPage(
    workspaceId: string,
    request: ResumeListPageRequest = {}
  ): Promise<CursorCollection<ResumeSummary>> {
    /** @brief 已验证 Workspace ID / Validated Workspace ID. */
    const validatedWorkspaceId = opaqueId(workspaceId, 'request.workspace_id')
    /** @brief Workspace-scoped Resume collection path / Workspace-scoped Resume collection path. */
    const path = `/workspaces/${encodeURIComponent(validatedWorkspaceId)}/resumes`
    /** @brief 已验证页大小 / Validated page size. */
    const limit =
      request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
    /** @brief 已验证 cursor / Validated cursor. */
    const cursor =
      request.cursor === undefined || request.cursor === null
        ? null
        : boundedString(request.cursor, 'request.cursor', 1, 2048)
    /** @brief 当前 ResumeList 页响应 / Current ResumeList page response. */
    const response = await this.#client.getJson(path, {
      maxResponseBytes: 512 * 1024,
      query: { cursor, limit },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    })
    /** @brief 当前已验证 ResumeList 页 / Current validated ResumeList page. */
    const page = parseResumeList(response.data)
    if (page.items.some((summary) => summary.workspace_id !== validatedWorkspaceId)) {
      throw new ApiV2ContractError(
        'API v2 returned a ResumeSummary from a different Workspace than the request path.'
      )
    }
    return page
  }
}
