import { describe, expect, it, vi } from 'vitest'

import type { AppGateways } from '../application'
import type { UiAgentScopeGrant, UiKnowledgeSource } from '../contexts/knowledge'
import { asUiOpaqueId } from '../shared-kernel/identity'
import {
  InMemoryIdentityGateway,
  InMemoryInterviewGateway,
  InMemoryWorkspaceGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '../testing'
import { createAppQueries } from './AppQueries'
import { createWorkspaceSession } from './session/workspace-session'

/**
 * @brief 创建覆盖全部限界上下文的测试端口 / Create test ports spanning every bounded context.
 * @param workspace 可覆盖的 Workspace gateway / Optional Workspace gateway override.
 * @return 可供应用查询组合的 gateway 集合 / Gateway collection for application-query composition.
 */
function createGateways(workspace = new InMemoryWorkspaceGateway()): AppGateways {
  /** @brief Resume 与 Operations 共享的异步资源状态 / Asynchronous-resource state shared by Resume and Operations. */
  const operationsStore = new InMemoryWorkspaceOperationsStore()
  /** @brief 同时承载 Resume 各端口的独享测试适配器 / Isolated test adapter serving each Resume port. */
  const resume = new InMemoryResumeGateway({ operationsStore })
  return {
    identity: new InMemoryIdentityGateway(),
    interview: new InMemoryInterviewGateway(),
    knowledge: new InMemoryKnowledgeGateway(),
    resume,
    resumeReview: resume,
    resumeCreation: resume,
    resumeTemplates: resume,
    workspace,
    workspaceOperations: new InMemoryWorkspaceOperationsGateway({}, operationsStore)
  }
}

/**
 * @brief 构造面试材料筛选测试来源 / Build a KnowledgeSource for Interview-material filtering tests.
 * @param suffix 来源 identity 与标题后缀 / Source identity and title suffix.
 * @param grants 可见性授权规则 / Visibility grant rules.
 * @param defaultEffect 无匹配规则时的默认效果 / Default effect when no rule matches.
 * @return 可直接由 Knowledge gateway 返回的 ready 来源 / Ready source returnable by the Knowledge gateway.
 */
function interviewKnowledgeSource(
  suffix: string,
  grants: readonly UiAgentScopeGrant[],
  defaultEffect: 'allow' | 'deny' = 'deny'
): UiKnowledgeSource {
  return {
    createdAt: '2026-07-29T00:00:00.000Z',
    currentVersionId: asUiOpaqueId<'knowledge-source-version'>(`version_interview_${suffix}`),
    enabled: true,
    id: asUiOpaqueId<'knowledge-source'>(`source_interview_${suffix}`),
    ingestion: {
      chunkCount: 1,
      documentCount: 1,
      lastProblem: null,
      lastSuccessAt: '2026-07-29T00:00:00.000Z',
      status: 'ready'
    },
    name: `面试材料 ${suffix}`,
    publicConfig: {},
    revision: 1,
    sourceType: 'manual_note',
    updatedAt: '2026-07-29T00:00:00.000Z',
    visibility: {
      agentGrants: grants,
      allowExternalModelProcessing: true,
      allowedModelRegions: ['global'],
      defaultEffect,
      policyVersion: 1,
      retentionDays: 30,
      sensitivity: 'normal',
      sessionOverrideAllowed: false
    },
    workspaceId: asUiOpaqueId<'workspace'>('workspace_interview_query')
  }
}

describe('createAppQueries', (): void => {
  it('仅以已接通的 v2 能力构造 Workspace 首页', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Interview Session 集合调用观察 / Interview Session collection-call observation. */
    const listInterviewSessionPage = vi.spyOn(gateways.interview, 'listInterviewSessionPage')
    /** @brief Resume 摘要页调用观察 / Resume-summary page call observation. */
    const listResumeSummariesPage = vi.spyOn(gateways.resume, 'listResumeSummariesPage')
    /** @brief KnowledgeSource 单页调用观察 / KnowledgeSource page-call observation. */
    const listKnowledgeSourcePage = vi
      .spyOn(gateways.knowledge, 'listKnowledgeSourcePage')
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
    expect(listInterviewSessionPage).not.toHaveBeenCalled()
    expect(listResumeSummariesPage).toHaveBeenCalledTimes(1)
    expect(listResumeSummariesPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 200 })
    )
    expect(listKnowledgeSourcePage).not.toHaveBeenCalled()
  })

  it('复用单一工作区会话且不跨上下文读取 Interview 或 Knowledge', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief Identity 读取观察 / Observation of Identity reads. */
    const loadCurrentUser = vi.spyOn(gateways.identity, 'loadCurrentUser')
    /** @brief Workspace 列表读取观察 / Observation of Workspace-list reads. */
    const listWorkspaceAccessPage = vi.spyOn(gateways.workspace, 'listWorkspaceAccessPage')
    /** @brief Interview 与 Knowledge 不属于首页投影 / Interview and Knowledge do not belong to the home projection. */
    const listInterviewSessionPage = vi.spyOn(gateways.interview, 'listInterviewSessionPage')
    const listKnowledgeSourcePage = vi.spyOn(gateways.knowledge, 'listKnowledgeSourcePage')
    /** @brief 当前应用会话 / Current application session. */
    const session = createWorkspaceSession(gateways.identity, gateways.workspace)
    /** @brief 被测命名查询 / Named queries under test. */
    const queries = createAppQueries(gateways, session)

    const [access, home] = await Promise.all([
      session.getAccess(),
      queries.workspaceHome.load(new AbortController().signal)
    ])

    expect(access.currentUser.displayName).toBe('Klee')
    expect(access.currentWorkspaceAccess?.workspace.id).toBe(home.home.workspaceAccess.workspace.id)
    expect(home.resumeSummary?.id).toBe('res_mock_ai_platform')
    expect(listInterviewSessionPage).not.toHaveBeenCalled()
    expect(listKnowledgeSourcePage).not.toHaveBeenCalled()
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
  })

  it('仅向面试设置页返回具有有效 retrieve 权限的材料', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief 当前 interview_coach 的 retrieve allow 来源 / Current-scope retrieve-allowed source. */
    const current = interviewKnowledgeSource('current01', [
      {
        agentScope: 'interview_coach',
        allowedOperations: ['retrieve'],
        effect: 'allow'
      }
    ])
    /** @brief 只有 derive、不可检索的来源 / Derive-only source that cannot be retrieved. */
    const deriveOnly = interviewKnowledgeSource('derive01', [
      {
        agentScope: 'interview_coach',
        allowedOperations: ['derive'],
        effect: 'allow'
      }
    ])
    /** @brief retrieve deny 必须覆盖 allow 的来源 / Source where retrieve deny must override allow. */
    const denied = interviewKnowledgeSource('denied01', [
      {
        agentScope: 'interview_coach',
        allowedOperations: ['retrieve'],
        effect: 'allow'
      },
      {
        agentScope: 'interview_coach',
        allowedOperations: ['retrieve'],
        effect: 'deny'
      }
    ])
    /** @brief 旧 interview_agent scope 的兼容来源 / Legacy interview_agent compatibility source. */
    const legacy = interviewKnowledgeSource('legacy01', [
      {
        agentScope: 'interview_agent',
        allowedOperations: ['retrieve'],
        effect: 'allow'
      }
    ])
    vi.spyOn(gateways.knowledge, 'listKnowledgeSourcePage').mockResolvedValue({
      hasMore: false,
      items: [current, deriveOnly, denied, legacy],
      nextCursor: null
    })

    /** @brief 面试设置页最终可选择材料 / Materials ultimately selectable by Interview setup. */
    const materials = await createAppQueries(
      gateways,
      createWorkspaceSession(gateways.identity, gateways.workspace)
    ).interviewSetup.listKnowledgeMaterials(
      asUiOpaqueId<'workspace'>('workspace_interview_query'),
      new AbortController().signal
    )

    expect(materials.map((material) => material.id)).toEqual([current.id, legacy.id])
  })

  it('仅在没有面试 scope 规则时继承 allow 默认策略', async (): Promise<void> => {
    /** @brief 当前测试 gateway / Gateways used by this test. */
    const gateways = createGateways()
    /** @brief 没有面试规则、可继承默认 allow 的来源 / Source with no Interview rule inheriting default allow. */
    const inherited = interviewKnowledgeSource('default01', [], 'allow')
    /** @brief 已有 derive-only 面试规则、不得继承默认 allow 的来源 / Source with a derive-only Interview rule that cannot inherit default allow. */
    const shadowed = interviewKnowledgeSource(
      'shadowed01',
      [
        {
          agentScope: 'interview_coach',
          allowedOperations: ['derive'],
          effect: 'allow'
        }
      ],
      'allow'
    )
    vi.spyOn(gateways.knowledge, 'listKnowledgeSourcePage').mockResolvedValue({
      hasMore: false,
      items: [inherited, shadowed],
      nextCursor: null
    })

    /** @brief 默认策略解析后的材料 / Materials after default-policy evaluation. */
    const materials = await createAppQueries(
      gateways,
      createWorkspaceSession(gateways.identity, gateways.workspace)
    ).interviewSetup.listKnowledgeMaterials(
      asUiOpaqueId<'workspace'>('workspace_interview_query'),
      new AbortController().signal
    )

    expect(materials.map((material) => material.id)).toEqual([inherited.id])
  })
})
