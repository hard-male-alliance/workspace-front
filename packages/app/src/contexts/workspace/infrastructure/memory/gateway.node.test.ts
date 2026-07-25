/** @file WorkspaceAccess v2 内存 adapter 测试 / WorkspaceAccess v2 in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { InMemoryWorkspaceGateway } from './gateway'

/** @brief 创建首屏请求 / Create a first-page request. */
function firstPageRequest(signal = new AbortController().signal) {
  return { cursor: null, limit: 200, signal }
}

describe('InMemoryWorkspaceGateway', (): void => {
  it('返回角色完整的有限 v2 Page 防御性副本', async (): Promise<void> => {
    /** @brief Workspace 演示网关 / Workspace demo gateway. */
    const gateway = new InMemoryWorkspaceGateway()
    /** @brief 首次访问页 / First access page. */
    const firstRead = await gateway.listWorkspaceAccessPage(firstPageRequest())
    /** @brief 第二次访问页 / Second access page. */
    const secondRead = await gateway.listWorkspaceAccessPage(firstPageRequest())

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead.items[0]).not.toBe(secondRead.items[0])
    expect(firstRead).toMatchObject({
      hasMore: false,
      items: [
        {
          role: 'owner',
          workspace: {
            dataRegion: 'cn',
            name: 'Klee 的职业实验室',
            plan: 'personal'
          }
        }
      ],
      nextCursor: null
    })
  })

  it('传播调用方取消信号', async (): Promise<void> => {
    /** @brief 已取消控制器 / Already-aborted controller. */
    const controller = new AbortController()
    controller.abort()

    await expect(
      new InMemoryWorkspaceGateway().listWorkspaceAccessPage(firstPageRequest(controller.signal))
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('显式暴露配置的错误状态', async (): Promise<void> => {
    /** @brief 明确失败的 Workspace gateway / Explicitly failing Workspace gateway. */
    const gateway = new InMemoryWorkspaceGateway({ mode: 'error' })

    await expect(gateway.listWorkspaceAccessPage(firstPageRequest())).rejects.toBeInstanceOf(
      InMemoryGatewayError
    )
  })

  it('无访问权威时返回合法空页', async (): Promise<void> => {
    /** @brief 无可访问 Workspace 的 gateway / Gateway without accessible Workspaces. */
    const gateway = new InMemoryWorkspaceGateway({ mode: 'empty' })

    await expect(gateway.listWorkspaceAccessPage(firstPageRequest())).resolves.toEqual({
      hasMore: false,
      items: [],
      nextCursor: null
    })
  })
})
