/** @file Identity 与 Workspace 会话组合测试 / Identity and Workspace session-composition tests. */

import { describe, expect, it, vi } from 'vitest'

import type { IdentityGateway, UiCurrentUser } from '../../contexts/identity'
import type { UiWorkspace, WorkspaceGateway } from '../../contexts/workspace'
import { asUiOpaqueId } from '../../shared-kernel/identity'
import { createWorkspaceSession } from './workspace-session'

/** @brief 测试用 Identity 与 Workspace 权威 / Identity and Workspace authorities used by tests. */
interface TestAuthority {
  /** @brief 当前用户权威 / Current-user authority. */
  readonly currentUser: UiCurrentUser
  /** @brief 可访问 Workspace 权威 / Accessible-Workspace authority. */
  readonly workspaces: readonly UiWorkspace[]
}

/**
 * @brief 创建可控的 Identity 与 Workspace 权威 / Create controllable Identity and Workspace authorities.
 * @param input 当前用户与 Workspace 覆盖 / Current-user and Workspace overrides.
 * @return 两个限界上下文各自拥有的测试权威 / Test authorities owned by the two bounded contexts.
 */
function testAuthority(input?: {
  readonly defaultWorkspaceId?: string | null
  readonly userId?: string
  readonly workspaceIds?: readonly string[]
}): TestAuthority {
  /** @brief 当前测试可访问的 Workspace ID / Workspace IDs accessible in this test. */
  const workspaceIds = input?.workspaceIds ?? ['ws_one', 'ws_two']
  return {
    currentUser: {
      defaultWorkspaceId:
        input?.defaultWorkspaceId === undefined || input.defaultWorkspaceId === null
          ? null
          : asUiOpaqueId<'workspace'>(input.defaultWorkspaceId),
      displayName: 'Workspace Tester',
      id: asUiOpaqueId<'user'>(input?.userId ?? 'user_one'),
      locale: 'zh-SG',
      timezone: 'Asia/Shanghai'
    },
    workspaces: workspaceIds.map((id, index) => ({
      id: asUiOpaqueId<'workspace'>(id),
      locale: 'zh-SG' as const,
      name: `Workspace ${index + 1}`,
      plan: 'pro' as const,
      slug: `workspace-${index + 1}`,
      timezone: 'Asia/Shanghai',
      updatedAt: '2026-07-22T00:00:00.000Z'
    }))
  }
}

/**
 * @brief 创建可在测试中原子替换的独立 Gateway / Create independent Gateways backed by an atomically replaceable test authority.
 * @param initial 初始测试权威 / Initial test authority.
 * @return 独立 Identity、Workspace 端口及权威替换函数 / Separate Identity and Workspace ports plus an authority replacement function.
 */
function controllableGateways(initial: TestAuthority): {
  readonly identity: IdentityGateway
  readonly setAuthority: (authority: TestAuthority) => void
  readonly workspace: WorkspaceGateway
} {
  /** @brief 两个测试端口当前读取的权威 / Authority currently read by both test ports. */
  let authority = initial
  return {
    identity: {
      loadCurrentUser: (): Promise<UiCurrentUser> => Promise.resolve(authority.currentUser)
    },
    setAuthority(next): void {
      authority = next
    },
    workspace: {
      listAccessibleWorkspaces: (): Promise<readonly UiWorkspace[]> =>
        Promise.resolve(authority.workspaces)
    }
  }
}

describe('createWorkspaceSession', (): void => {
  it('并行启动 Identity 与 Workspace 权威读取', async (): Promise<void> => {
    /** @brief 被两个未完成读取共享的初始权威 / Initial authority shared by two pending reads. */
    const authority = testAuthority({ defaultWorkspaceId: 'ws_one' })
    /** @brief 已启动端口的顺序记录 / Ordered record of started ports. */
    const started: string[] = []
    /** @brief 完成 Identity 读取的控制器 / Controller that completes the Identity read. */
    let resolveIdentity: ((user: UiCurrentUser) => void) | undefined
    /** @brief 完成 Workspace 读取的控制器 / Controller that completes the Workspace read. */
    let resolveWorkspaces: ((workspaces: readonly UiWorkspace[]) => void) | undefined
    /** @brief 可控 Identity 端口 / Controllable Identity port. */
    const identity: IdentityGateway = {
      loadCurrentUser: () => {
        started.push('identity')
        return new Promise<UiCurrentUser>((resolve) => {
          resolveIdentity = resolve
        })
      }
    }
    /** @brief 可控 Workspace 端口 / Controllable Workspace port. */
    const workspace: WorkspaceGateway = {
      listAccessibleWorkspaces: () => {
        started.push('workspace')
        return new Promise<readonly UiWorkspace[]>((resolve) => {
          resolveWorkspaces = resolve
        })
      }
    }
    /** @brief 尚未完成的组合读取 / Pending composed read. */
    const access = createWorkspaceSession(identity, workspace).getAccess()

    expect(started).toEqual(['identity', 'workspace'])
    resolveIdentity?.(authority.currentUser)
    resolveWorkspaces?.(authority.workspaces)
    await expect(access).resolves.toMatchObject({ currentWorkspace: { id: 'ws_one' } })
  })

  it('没有有效默认值时不把列表第一项当作隐式 Workspace', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority())
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.getCurrentWorkspace()).resolves.toBeUndefined()
    await expect(session.getAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
  })

  it('只把可访问的服务端默认 Workspace 用作初始界面偏好并保持 v1 展示顺序', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority({ defaultWorkspaceId: 'ws_two' }))
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.getAccess()).resolves.toMatchObject({
      currentWorkspace: { id: 'ws_two' },
      workspaces: [{ id: 'ws_two' }, { id: 'ws_one' }]
    })
  })

  it('忽略不在可访问 Workspace 集合中的服务端默认值', async (): Promise<void> => {
    const gateways = controllableGateways(
      testAuthority({ defaultWorkspaceId: 'ws_not_accessible' })
    )
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(session.getCurrentWorkspace()).resolves.toBeUndefined()
    await expect(session.getAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
  })

  it('允许显式选择可访问 Workspace 并通知订阅者', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority({ defaultWorkspaceId: 'ws_one' }))
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))

    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_two' })
    expect(session.getSelectionRevision()).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('拒绝选择不在访问权威中的 Workspace', async (): Promise<void> => {
    const gateways = controllableGateways(testAuthority({ defaultWorkspaceId: 'ws_one' }))
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)

    await expect(
      session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_forbidden'))
    ).rejects.toThrow('not accessible')
    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_one' })
  })

  it('刷新权威后清除新主体不可继承的 Workspace 选择', async (): Promise<void> => {
    const gateways = controllableGateways(
      testAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_one' })
    )
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))
    gateways.setAuthority(
      testAuthority({
        defaultWorkspaceId: null,
        userId: 'user_two',
        workspaceIds: ['ws_three']
      })
    )

    await expect(session.refreshAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
    expect(session.getSelectionRevision()).toBe(2)
  })

  it('主体变化但 Workspace ID 相同时仍失效 Workspace 范围资源', async (): Promise<void> => {
    const gateways = controllableGateways(
      testAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_one' })
    )
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    const listener = vi.fn()
    session.subscribe(listener)
    await session.getAccess()
    gateways.setAuthority(testAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_two' }))

    await expect(session.refreshAccess()).resolves.toMatchObject({
      currentUser: { id: 'user_two' },
      currentWorkspace: { id: 'ws_one' }
    })
    expect(session.getSelectionRevision()).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
  })
})
