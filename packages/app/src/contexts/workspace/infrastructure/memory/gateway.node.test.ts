/** @file Workspace 内存 adapter 测试 / Workspace in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { DEMO_WORKSPACE_ID } from './data'
import { DemoWorkspaceGateway } from './gateway'

describe('DemoWorkspaceGateway', () => {
  it('returns defensive copies instead of fixture references', async () => {
    /** @brief 工作区演示网关 / Workspace demo gateway. */
    const workspaceGateway = new DemoWorkspaceGateway()
    /** @brief 首次工作区列表 / First workspace list. */
    const firstRead = await workspaceGateway.listWorkspaces()
    /** @brief 第二次工作区列表 / Second workspace list. */
    const secondRead = await workspaceGateway.listWorkspaces()

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead[0]).not.toBe(secondRead[0])
  })

  it('makes the configured error state explicit', async () => {
    const gateway = new DemoWorkspaceGateway({ mode: 'error' })

    await expect(gateway.getWorkspaceHome(DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(
      InMemoryGatewayError
    )
  })
})
