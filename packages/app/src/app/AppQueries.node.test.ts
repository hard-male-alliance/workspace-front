import { describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../application'
import { asUiOpaqueId } from '../shared-kernel/identity'
import {
  DemoInterviewGateway,
  DemoWorkspaceGateway,
  MockKnowledgeGateway,
  MockResumeGateway
} from '../testing'
import { createAppQueries, createWorkspaceSession } from './AppQueries'

/**
 * @brief 创建覆盖全部限界上下文的测试端口 / Create test ports spanning every bounded context.
 * @param workspace 可覆盖的 Workspace gateway / Optional Workspace gateway override.
 * @return 可供应用查询组合的 gateway 集合 / Gateway collection for application-query composition.
 */
function createGateways(workspace = new DemoWorkspaceGateway()): AppGateways {
  return {
    interview: new DemoInterviewGateway(),
    knowledge: new MockKnowledgeGateway(),
    resume: new MockResumeGateway(),
    workspace
  }
}

describe('createAppQueries', (): void => {
  it('在应用层聚合公开投影并复用单一工作区会话', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Workspace 列表调用观察 / Observation of Workspace-list calls. */
    const listWorkspaces = vi.spyOn(gateways.workspace, 'listWorkspaces')
    /** @brief 当前应用会话 / Current application session. */
    const session = createWorkspaceSession(gateways.workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, session)

    const [home, setup, summary] = await Promise.all([
      queries.workspaceHome.load(),
      queries.interviewSetup.load(),
      queries.interviewSummary.load(asUiOpaqueId<'interview-session'>('int_mock_system_design'))
    ])

    expect(home.resumeCard?.id).toBe('res_mock_ai_platform')
    expect(home.interviewSessionId).toBe('int_mock_system_design')
    expect(setup.workspaceId).toBe(home.home.workspace.id)
    expect(setup.knowledgeSources.length).toBeGreaterThan(0)
    expect(summary.runtime.session.id).toBe('int_mock_system_design')
    expect(summary.knowledgeSources.length).toBeGreaterThan(0)
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('没有可访问工作区时让聚合查询显式失败', async (): Promise<void> => {
    /** @brief 空 Workspace gateway / Empty Workspace gateway. */
    const workspace = new DemoWorkspaceGateway({ mode: 'empty' })
    /** @brief 空工作区场景的 gateway / Gateways for an empty-workspace scenario. */
    const gateways = createGateways(workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, createWorkspaceSession(workspace))

    await expect(queries.workspaceHome.load()).rejects.toThrow('No workspace is available')
    await expect(queries.interviewSetup.load()).rejects.toThrow('No workspace is available')
  })
})
