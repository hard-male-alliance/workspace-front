/** @file Workspace 正式 HTTP Gateway / Production HTTP Gateway for Workspace. */

import type { WorkspaceGateway } from '../../application/gateway'
import type { UiWorkspace } from '../../domain/models'
import type { PaginatedDto } from '../../../../infrastructure/http/decoder'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import { mapWorkspaceDto } from './mappers'
import { parseWorkspaceListDto } from './validators'

/** @brief 分页响应解析器 / Paginated-response parser. */
type PageParser<TItem> = (value: unknown) => PaginatedDto<TItem>

/** @brief Workspace HTTP Gateway / Workspace HTTP Gateway. */
export class HttpWorkspaceGateway implements WorkspaceGateway {
  /** @brief 共享 HTTP client / Shared HTTP client. */
  readonly #client: HttpClient

  /**
   * @brief 构造 Workspace HTTP Gateway / Construct a Workspace HTTP Gateway.
   * @param client 共享产品 HTTP client / Shared product HTTP client.
   */
  constructor(client: HttpClient) {
    this.#client = client
  }

  /** @inheritdoc */
  async listAccessibleWorkspaces(): Promise<readonly UiWorkspace[]> {
    /** @brief 已验证的 Workspace DTO 列表 / Validated Workspace DTO list. */
    const workspaceDtos = await this.#readAll('/workspaces', parseWorkspaceListDto)
    return workspaceDtos.map(mapWorkspaceDto)
  }

  /**
   * @brief 读取全部游标分页 / Read every cursor page.
   * @template TItem 条目类型 / Item type.
   * @param path 已冻结列表路径 / Frozen list path.
   * @param parsePage 页面解析器 / Page parser.
   * @return 所有已验证条目 / All validated items.
   */
  async #readAll<TItem>(path: string, parsePage: PageParser<TItem>): Promise<readonly TItem[]> {
    /** @brief 聚合后的条目 / Aggregated items. */
    const items: TItem[] = []
    /** @brief 已见游标，用于拒绝服务端分页循环 / Seen cursors used to reject backend pagination loops. */
    const seenCursors = new Set<string>()
    /** @brief 下一页游标 / Next-page cursor. */
    let cursor: string | null = null

    do {
      /** @brief 当前 HTTP 响应 / Current HTTP response. */
      const response = await this.#client.getJson(path, { query: { cursor, limit: 200 } })
      /** @brief 已验证当前页 / Validated current page. */
      const page = parsePage(response.data)
      items.push(...page.items)
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new HttpContractError('Backend repeated a Workspace pagination cursor.', 200)
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)

    return items
  }
}
