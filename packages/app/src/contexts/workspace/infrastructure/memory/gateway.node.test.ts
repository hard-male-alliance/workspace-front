/** @file Workspace 内存 adapter 测试 / Workspace in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { InMemoryWorkspaceGateway } from './gateway'

describe('InMemoryWorkspaceGateway', () => {
  it('returns defensive copies instead of fixture references', async () => {
    /** @brief 工作区演示网关 / Workspace demo gateway. */
    const workspaceGateway = new InMemoryWorkspaceGateway()
    /** @brief 首次工作区列表 / First workspace list. */
    const firstRead = await workspaceGateway.listAccessibleWorkspaces()
    /** @brief 第二次工作区列表 / Second workspace list. */
    const secondRead = await workspaceGateway.listAccessibleWorkspaces()

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead[0]).not.toBe(secondRead[0])
    expect(firstRead[0]?.name).toBe('Klee 的职业实验室')
  })

  it('makes the configured error state explicit', async () => {
    const gateway = new InMemoryWorkspaceGateway({ mode: 'error' })

    await expect(gateway.listAccessibleWorkspaces()).rejects.toBeInstanceOf(InMemoryGatewayError)
  })

  it('returns an empty list when no Workspace is accessible', async () => {
    /** @brief 无可访问 Workspace 的测试 gateway / Test gateway without an accessible Workspace. */
    const gateway = new InMemoryWorkspaceGateway({ mode: 'empty' })

    await expect(gateway.listAccessibleWorkspaces()).resolves.toEqual([])
  })
})
