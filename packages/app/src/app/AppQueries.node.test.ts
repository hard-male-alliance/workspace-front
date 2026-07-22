import { describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../application'
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
