import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client, ApiV2JsonResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { parseWorkspaceList, WorkspaceAccessGateway } from './workspace-access'

/**
 * @brief 构造 WorkspaceAccess 项 / Build one WorkspaceAccess item.
 * @param workspace canonical Workspace payload / canonical Workspace payload.
 * @param suffix 用于区分 ID 的后缀 / Suffix used to distinguish IDs.
 * @return WorkspaceAccess JSON / WorkspaceAccess JSON.
 */
function workspaceAccess(workspace: unknown, suffix = '00000001'): Record<string, unknown> {
  return {
    member_id: `member_${suffix}`,
    role: 'owner',
    workspace
  }
}

/**
 * @brief 构造伪 HTTP 响应 / Build a fake HTTP response.
 * @param data 响应 JSON / Response JSON.
 * @return Gateway 可消费的响应 / Response consumable by a gateway.
 */
function response(data: unknown): ApiV2JsonResponse {
  return { data, headers: new Headers(), status: 200 }
}

describe('API v2 WorkspaceAccess consumer', (): void => {
  it('decodes nested WorkspaceAccess around the canonical Workspace example', async (): Promise<void> => {
    /** @brief 唯一事实来源中的 Workspace payload / Workspace payload from the single source of truth. */
    const workspace = await readCanonicalExample('personal_workspace')
    /** @brief v2 WorkspaceList 页面 / v2 WorkspaceList page. */
    const page = {
      items: [workspaceAccess(workspace)],
      page: { has_more: false, next_cursor: null }
    }

    expect(parseWorkspaceList(page)).toMatchObject({
      items: [
        {
          member_id: 'member_00000001',
          role: 'owner',
          workspace: { data_region: 'cn', plan: 'personal', slug: 'klee-personal' }
        }
      ]
    })
  })

  it('rejects a bare v1 Workspace item instead of treating it as access authority', async (): Promise<void> => {
    /** @brief canonical 裸 Workspace / Canonical bare Workspace. */
    const workspace = await readCanonicalExample('personal_workspace')

    expect(() =>
      parseWorkspaceList({
        items: [workspace],
        page: { has_more: false, next_cursor: null }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('returns one cursor page without eagerly draining the collection', async (): Promise<void> => {
    /** @brief canonical Workspace payload / Canonical Workspace payload. */
    const workspace = await readCanonicalExample('personal_workspace')
    /** @brief 可观察的分页 GET / Observable paginated GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      response({
        items: [workspaceAccess(workspace)],
        page: { has_more: true, next_cursor: 'cursor_page_2' }
      })
    )
    /** @brief 被测 WorkspaceAccess Gateway / WorkspaceAccess gateway under test. */
    const gateway = new WorkspaceAccessGateway({ getJson })

    await expect(gateway.listWorkspaceAccessesPage({ limit: 100 })).resolves.toMatchObject({
      items: [{ role: 'owner' }],
      page: { has_more: true, next_cursor: 'cursor_page_2' }
    })
    expect(getJson).toHaveBeenCalledOnce()
    expect(getJson).toHaveBeenCalledWith('/workspaces', {
      maxResponseBytes: 512 * 1024,
      query: { cursor: null, limit: 100 }
    })
  })

  it('rejects an invalid page limit before issuing a request', async (): Promise<void> => {
    /** @brief 不应调用的 v2 GET / v2 GET that must not be called. */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    /** @brief 被测 WorkspaceAccess Gateway / WorkspaceAccess gateway under test. */
    const gateway = new WorkspaceAccessGateway({ getJson })

    await expect(gateway.listWorkspaceAccessesPage({ limit: 201 })).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(getJson).not.toHaveBeenCalled()
  })
})
