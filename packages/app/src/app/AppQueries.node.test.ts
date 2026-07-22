import { describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../application'
import { asUiOpaqueId } from '../shared-kernel/identity'
import {
  InMemoryIdentityGateway,
  InMemoryInterviewGateway,
  InMemoryWorkspaceGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway
} from '../testing'
import { createAppQueries } from './AppQueries'
import { createWorkspaceSession } from './session/workspace-session'

/**
 * @brief 创建覆盖全部限界上下文的测试端口 / Create test ports spanning every bounded context.
 * @param workspace 可覆盖的 Workspace gateway / Optional Workspace gateway override.
 * @return 可供应用查询组合的 gateway 集合 / Gateway collection for application-query composition.
 */
function createGateways(workspace = new InMemoryWorkspaceGateway()): AppGateways {
  /** @brief 同时承载 Resume 各端口的独享测试适配器 / Isolated test adapter serving each Resume port. */
  const resume = new InMemoryResumeGateway()
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeCreation: resume,
    resumeTemplates: resume,
    workspace
  }
}

describe('createAppQueries', (): void => {
  it('仅以已接通的 v2 能力构造 Workspace 首页', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Interview 历史调用观察 / Interview-history call observation. */
    const listCompletedInterviews = vi
      .spyOn(gateways.interview, 'listCompletedInterviews')
      .mockRejectedValue(new Error('Interview capability is not connected.'))
    /** @brief Resume 摘要页调用观察 / Resume-summary page call observation. */
    const listResumeSummariesPage = vi.spyOn(gateways.resume, 'listResumeSummariesPage')
    /** @brief KnowledgeSource 调用观察 / KnowledgeSource call observation. */
    const listKnowledgeSources = vi
      .spyOn(gateways.knowledge, 'listKnowledgeSources')
      .mockRejectedValue(new Error('Knowledge capability is not connected.'))
    /** @brief Identity 读取观察 / Identity-read observation. */
    const loadCurrentUser = vi.spyOn(gateways.identity, 'loadCurrentUser')
    /** @brief Workspace 列表读取观察 / Workspace-list read observation. */
    const listWorkspaceAccessPage = vi.spyOn(gateways.workspace, 'listWorkspaceAccessPage')
    /** @brief 聚合后的首页结果 / Aggregated home result. */
    const result = await createAppQueries(
      gateways,
      createWorkspaceSession(gateways.identity, gateways.workspace)
    ).workspaceHome.load(new AbortController().signal)

    expect(result.home).toMatchObject({
      resumeCount: { certainty: 'exact', value: 2 }
    })
    expect(result.home.recentUpdates.map((update) => update.title)).toContain(
      'AI 平台工程师 · 中文简历'
    )
    expect(loadCurrentUser).toHaveBeenCalledTimes(1)
    expect(listWorkspaceAccessPage).toHaveBeenCalledTimes(1)
    expect(listCompletedInterviews).not.toHaveBeenCalled()
    expect(listResumeSummariesPage).toHaveBeenCalledTimes(1)
    expect(listResumeSummariesPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 200 })
    )
    expect(listKnowledgeSources).not.toHaveBeenCalled()
  })

  it('在应用层聚合公开投影并复用单一工作区会话', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Identity 读取观察 / Observation of Identity reads. */
    const loadCurrentUser = vi.spyOn(gateways.identity, 'loadCurrentUser')
    /** @brief Workspace 列表读取观察 / Observation of Workspace-list reads. */
    const listWorkspaceAccessPage = vi.spyOn(gateways.workspace, 'listWorkspaceAccessPage')
    /** @brief realtime runtime 不应被报告页查询 / Realtime runtime must not be requested by the report query. */
    const getInterviewRuntime = vi.spyOn(gateways.interview, 'getInterviewRuntime')
    /** @brief 当前应用会话 / Current application session. */
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, session)

    const [access, home, setup, summary] = await Promise.all([
      session.getAccess(),
      queries.workspaceHome.load(new AbortController().signal),
      queries.interviewSetup.load(),
      queries.interviewSummary.load(asUiOpaqueId<'interview-session'>('int_mock_system_design'))
    ])

    expect(access.currentUser.displayName).toBe('Klee')
    expect(access.currentWorkspaceAccess?.workspace.id).toBe(home.home.workspaceAccess.workspace.id)
    expect(home.resumeSummary?.id).toBe('res_mock_ai_platform')
    expect(setup.workspaceId).toBe(home.home.workspaceAccess.workspace.id)
    expect(setup.knowledgeSources.length).toBeGreaterThan(0)
    expect(summary.details.session.id).toBe('int_mock_system_design')
    expect(summary.knowledgeSources.length).toBeGreaterThan(0)
    expect(getInterviewRuntime).not.toHaveBeenCalled()
    expect(loadCurrentUser).toHaveBeenCalledTimes(1)
    expect(listWorkspaceAccessPage).toHaveBeenCalledTimes(1)
  })

  it('没有可访问工作区时让聚合查询显式失败', async (): Promise<void> => {
    /** @brief 空 Workspace gateway / Empty Workspace gateway. */
    const workspace = new InMemoryWorkspaceGateway({ mode: 'empty' })
    /** @brief 空工作区场景的 gateway / Gateways for an empty-workspace scenario. */
    const gateways = createGateways(workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, createWorkspaceSession(gateways.identity, workspace))

    await expect(queries.workspaceHome.load(new AbortController().signal)).rejects.toThrow(
      'No workspace is available'
    )
    await expect(queries.interviewSetup.load()).rejects.toThrow('No workspace is available')
  })
})
