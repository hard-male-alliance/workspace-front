import { describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../application'
import type { UiWorkspaceAccess, WorkspaceGateway } from '../contexts/workspace'
import { asUiOpaqueId } from '../shared-kernel/identity'
import {
  InMemoryInterviewGateway,
  InMemoryWorkspaceGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway
} from '../testing'
import { createAppQueries, createWorkspaceSession } from './AppQueries'

/**
 * @brief 创建覆盖全部限界上下文的测试端口 / Create test ports spanning every bounded context.
 * @param workspace 可覆盖的 Workspace gateway / Optional Workspace gateway override.
 * @return 可供应用查询组合的 gateway 集合 / Gateway collection for application-query composition.
 */
function createGateways(workspace = new InMemoryWorkspaceGateway()): AppGateways {
  return {
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume: new InMemoryResumeGateway(),
    workspace
  }
}

/** @brief 创建可控的 Workspace 访问权威 / Create controllable Workspace-access authority. */
function workspaceAuthority(input?: {
  readonly defaultWorkspaceId?: string | null
  readonly userId?: string
  readonly workspaceIds?: readonly string[]
}): UiWorkspaceAccess {
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

/** @brief 创建可在测试中替换权威快照的 Gateway / Create a Gateway whose authority can be replaced in tests. */
function controllableWorkspaceGateway(initial: UiWorkspaceAccess): {
  readonly gateway: WorkspaceGateway
  readonly setAuthority: (authority: UiWorkspaceAccess) => void
} {
  let authority = initial
  return {
    gateway: {
      loadAccess: (): Promise<UiWorkspaceAccess> => Promise.resolve(authority)
    },
    setAuthority(next): void {
      authority = next
    }
  }
}

describe('createWorkspaceSession', (): void => {
  it('没有有效默认值时不把列表第一项当作隐式 Workspace', async (): Promise<void> => {
    const { gateway } = controllableWorkspaceGateway(workspaceAuthority())
    const session = createWorkspaceSession(gateway)

    await expect(session.getCurrentWorkspace()).resolves.toBeUndefined()
    await expect(session.getAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
  })

  it('只把可访问的服务端默认 Workspace 用作初始界面偏好', async (): Promise<void> => {
    const { gateway } = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_two' })
    )
    const session = createWorkspaceSession(gateway)

    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_two' })
  })

  it('ignores a server default that is outside the accessible Workspace set', async (): Promise<void> => {
    const { gateway } = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_not_accessible' })
    )
    const session = createWorkspaceSession(gateway)

    await expect(session.getCurrentWorkspace()).resolves.toBeUndefined()
    await expect(session.getAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
  })

  it('允许显式选择可访问 Workspace 并通知订阅者', async (): Promise<void> => {
    const { gateway } = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_one' })
    )
    const session = createWorkspaceSession(gateway)
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))

    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_two' })
    expect(session.getSelectionRevision()).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('拒绝选择不在访问权威中的 Workspace', async (): Promise<void> => {
    const { gateway } = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_one' })
    )
    const session = createWorkspaceSession(gateway)

    await expect(
      session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_forbidden'))
    ).rejects.toThrow('not accessible')
    await expect(session.getCurrentWorkspace()).resolves.toMatchObject({ id: 'ws_one' })
  })

  it('刷新权威后清除新主体不可继承的 Workspace 选择', async (): Promise<void> => {
    const controlled = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_one' })
    )
    const session = createWorkspaceSession(controlled.gateway)
    await session.selectWorkspace(asUiOpaqueId<'workspace'>('ws_two'))
    controlled.setAuthority(
      workspaceAuthority({
        defaultWorkspaceId: null,
        userId: 'user_two',
        workspaceIds: ['ws_three']
      })
    )

    await expect(session.refreshAccess()).resolves.toMatchObject({ currentWorkspace: undefined })
    expect(session.getSelectionRevision()).toBe(2)
  })

  it('invalidates Workspace-scoped resources when the principal changes but the ID stays equal', async (): Promise<void> => {
    const controlled = controllableWorkspaceGateway(
      workspaceAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_one' })
    )
    const session = createWorkspaceSession(controlled.gateway)
    const listener = vi.fn()
    session.subscribe(listener)
    await session.getAccess()
    controlled.setAuthority(
      workspaceAuthority({ defaultWorkspaceId: 'ws_one', userId: 'user_two' })
    )

    await expect(session.refreshAccess()).resolves.toMatchObject({
      currentUser: { id: 'user_two' },
      currentWorkspace: { id: 'ws_one' }
    })
    expect(session.getSelectionRevision()).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('createAppQueries', (): void => {
  it('在应用层仅调用每个上下文一次来构造 Workspace 首页', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Interview 历史调用观察 / Interview-history call observation. */
    const listCompletedInterviews = vi.spyOn(gateways.interview, 'listCompletedInterviews')
    /** @brief Resume 卡片调用观察 / Resume-card call observation. */
    const listResumeCards = vi.spyOn(gateways.resume, 'listResumeCards')
    /** @brief KnowledgeSource 调用观察 / KnowledgeSource call observation. */
    const listKnowledgeSources = vi.spyOn(gateways.knowledge, 'listKnowledgeSources')
    /** @brief Workspace 访问读取观察 / Workspace-access read observation. */
    const loadWorkspaceAccess = vi.spyOn(gateways.workspace, 'loadAccess')
    /** @brief 聚合后的首页结果 / Aggregated home result. */
    const result = await createAppQueries(
      gateways,
      createWorkspaceSession(gateways.workspace)
    ).workspaceHome.load()

    expect(result.home).toMatchObject({
      completedInterviewCount: 1,
      readyKnowledgeSourceCount: 2,
      resumeCount: 2
    })
    expect(result.home.recentUpdates.map((update) => update.kind)).toEqual(
      expect.arrayContaining(['resume', 'interview', 'knowledge'])
    )
    expect(loadWorkspaceAccess).toHaveBeenCalledTimes(1)
    expect(listCompletedInterviews).toHaveBeenCalledTimes(1)
    expect(listResumeCards).toHaveBeenCalledTimes(1)
    expect(listKnowledgeSources).toHaveBeenCalledTimes(1)
  })

  it('在应用层聚合公开投影并复用单一工作区会话', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Workspace 访问读取观察 / Observation of Workspace-access reads. */
    const loadWorkspaceAccess = vi.spyOn(gateways.workspace, 'loadAccess')
    /** @brief realtime runtime 不应被报告页查询 / Realtime runtime must not be requested by the report query. */
    const getInterviewRuntime = vi.spyOn(gateways.interview, 'getInterviewRuntime')
    /** @brief 当前应用会话 / Current application session. */
    const session = createWorkspaceSession(gateways.workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, session)

    const [access, home, setup, summary] = await Promise.all([
      session.getAccess(),
      queries.workspaceHome.load(),
      queries.interviewSetup.load(),
      queries.interviewSummary.load(asUiOpaqueId<'interview-session'>('int_mock_system_design'))
    ])

    expect(access.currentUser.displayName).toBe('Klee')
    expect(access.currentWorkspace?.id).toBe(home.home.workspace.id)
    expect(home.resumeCard?.id).toBe('res_mock_ai_platform')
    expect(home.recentInterview?.sessionId).toBe('int_mock_system_design')
    expect(setup.workspaceId).toBe(home.home.workspace.id)
    expect(setup.knowledgeSources.length).toBeGreaterThan(0)
    expect(summary.details.session.id).toBe('int_mock_system_design')
    expect(summary.knowledgeSources.length).toBeGreaterThan(0)
    expect(getInterviewRuntime).not.toHaveBeenCalled()
    expect(loadWorkspaceAccess).toHaveBeenCalledTimes(1)
  })

  it('没有可访问工作区时让聚合查询显式失败', async (): Promise<void> => {
    /** @brief 空 Workspace gateway / Empty Workspace gateway. */
    const workspace = new InMemoryWorkspaceGateway({ mode: 'empty' })
    /** @brief 空工作区场景的 gateway / Gateways for an empty-workspace scenario. */
    const gateways = createGateways(workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, createWorkspaceSession(workspace))

    await expect(queries.workspaceHome.load()).rejects.toThrow('No workspace is available')
    await expect(queries.interviewSetup.load()).rejects.toThrow('No workspace is available')
  })
})
