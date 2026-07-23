import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import {
  asUiConcurrencyToken,
  asUiKnowledgeSourceCursor,
  asUiOpaqueId,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  type KnowledgeGateway,
  type UiKnowledgeSource,
  type UiKnowledgeSourcePage,
  type UiWorkspaceId
} from '../../../application'
import { AppDataProvider, useWorkspaceSession } from '../../../app/AppData'
import { DiagnosticsProvider } from '../../../app/Diagnostics'
import { createDiagnostics } from '../../../diagnostics'
import { appI18n, appI18nReady } from '../../../i18n'
import {
  DEMO_WORKSPACE_ACCESSES,
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_WORKSPACE_ID
} from '../../../testing'
import { createTestGateways } from '../../../../tests/integration/WorkspaceApp.dom-test-harness'
import { KnowledgePage } from './KnowledgePage'
import { KnowledgeSourceDetailPage } from './KnowledgeSourceDetailPage'

/** @brief 测试可精确兑现的 Promise / Promise settled precisely by a test. */
interface Deferred<TValue> {
  /** @brief 受控 Promise / Controlled promise. */
  readonly promise: Promise<TValue>
  /** @brief 兑现函数 / Fulfilment function. */
  readonly resolve: (value: TValue) => void
}

/**
 * @brief 创建受测试控制的异步结果 / Create an asynchronous result controlled by a test.
 * @template TValue 结果类型 / Result type.
 * @return Promise 与唯一兑现函数 / Promise and its sole fulfilment function.
 */
function createDeferred<TValue>(): Deferred<TValue> {
  /** @brief 底层兑现函数 / Underlying fulfilment function. */
  let resolvePromise: ((value: TValue) => void) | undefined
  /** @brief 等待测试兑现的 Promise / Promise awaiting the test. */
  const promise = new Promise<TValue>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value): void => {
      resolvePromise?.(value)
    }
  }
}

/**
 * @brief 创建可局部覆盖的 Knowledge 端口 / Create a Knowledge port with local overrides.
 * @param overrides 当前测试关注的方法 / Methods exercised by the current test.
 * @return 未声明调用会失败关闭的完整端口 / Complete port whose undeclared calls fail closed.
 */
function createKnowledgeGateway(overrides: Partial<KnowledgeGateway>): KnowledgeGateway {
  /** @brief 非预期调用的统一失败 / Shared failure for unexpected calls. */
  const unexpected = (): Promise<never> =>
    Promise.reject(new Error('Unexpected KnowledgeGateway call.'))
  return {
    createManualKnowledgeNote: unexpected,
    getKnowledgeSource: unexpected,
    listKnowledgeSourcePage: unexpected,
    updateKnowledgeSource: unexpected,
    ...overrides
  }
}

/**
 * @brief 从合法 fixture 创建独立 KnowledgeSource / Create an independent KnowledgeSource from a valid fixture.
 * @param name 用户可见名称 / User-visible name.
 * @param id 不透明来源 identity / Opaque source identity.
 * @param workspaceId 所属 Workspace / Owning Workspace.
 * @param overrides 测试需要替换的权威字段 / Authoritative fields overridden by the test.
 * @return 不共享可变子对象的来源 / Source sharing no mutable child objects.
 */
function createSource(
  name: string,
  id: string,
  workspaceId: UiWorkspaceId = MOCK_KNOWLEDGE_WORKSPACE_ID,
  overrides: Partial<UiKnowledgeSource> = {}
): UiKnowledgeSource {
  /** @brief 已通过领域约束的基础来源 / Base source already satisfying domain constraints. */
  const base = MOCK_KNOWLEDGE_SOURCES[0]!
  return {
    ...base,
    ...overrides,
    id: asUiOpaqueId<'knowledge-source'>(id),
    ingestion: overrides.ingestion ?? { ...base.ingestion },
    name,
    publicConfig: overrides.publicConfig ?? { ...base.publicConfig },
    visibility: overrides.visibility ?? {
      ...base.visibility,
      agentGrants: base.visibility.agentGrants.map((grant) => ({
        ...grant,
        allowedOperations: [...grant.allowedOperations]
      })),
      allowedModelRegions: [...base.visibility.allowedModelRegions]
    },
    workspaceId
  }
}

/**
 * @brief 创建有后续 cursor 的来源页 / Create a source page with a continuation cursor.
 * @param items 当前页来源 / Current-page sources.
 * @param cursor 服务端不透明 cursor / Opaque server cursor.
 * @return 保持 Page 关系不变量的后续页 / Continuable page preserving Page invariants.
 */
function continuationPage(
  items: readonly UiKnowledgeSource[],
  cursor: string
): UiKnowledgeSourcePage {
  return {
    hasMore: true,
    items,
    nextCursor: asUiKnowledgeSourceCursor(cursor)
  }
}

/**
 * @brief 创建来源末页 / Create a terminal source page.
 * @param items 当前页来源 / Current-page sources.
 * @return next_cursor 为 null 的末页 / Terminal page whose next_cursor is null.
 */
function terminalPage(items: readonly UiKnowledgeSource[]): UiKnowledgeSourcePage {
  return { hasMore: false, items, nextCursor: null }
}

/**
 * @brief 在真实应用依赖上下文中渲染 Knowledge 路由 / Render a Knowledge route in real app dependency contexts.
 * @param element 被测页面元素 / Page element under test.
 * @param path 初始路径 / Initial path.
 * @param gateways 测试隔离的应用端口 / Test-isolated application ports.
 * @return Testing Library 渲染结果 / Testing Library render result.
 */
function renderKnowledgeRoute(
  element: React.JSX.Element,
  path: string,
  gateways: ReturnType<typeof createTestGateways>
): ReturnType<typeof render> {
  return render(
    <DiagnosticsProvider diagnostics={createDiagnostics({ sinks: [] })}>
      <AppDataProvider gateways={gateways}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={element} path="/knowledge" />
            <Route element={element} path="/knowledge/:sourceId" />
          </Routes>
        </MemoryRouter>
      </AppDataProvider>
    </DiagnosticsProvider>
  )
}

/**
 * @brief 暴露测试专用 Workspace 切换动作 / Expose a test-only Workspace-selection action.
 * @param props 目标 Workspace / Target Workspace.
 * @return 调用真实会话端口的按钮 / Button invoking the real session port.
 */
function WorkspaceSwitchControl({
  workspaceId
}: {
  /** @brief 目标 Workspace identity / Target Workspace identity. */
  readonly workspaceId: UiWorkspaceId
}): React.JSX.Element {
  /** @brief 真实 Workspace 会话 / Real Workspace session. */
  const session = useWorkspaceSession()
  return (
    <button
      onClick={(): void => {
        void session.selectWorkspace(workspaceId)
      }}
      type="button"
    >
      切换工作区
    </button>
  )
}

beforeEach(async (): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
})

afterEach((): void => {
  cleanup()
})

/** @brief Knowledge API v2 列表与详情产品行为 / Knowledge API v2 list and detail product behaviour. */
describe('Knowledge API v2 presentation', (): void => {
  it('keeps accepted items and retries a rejected duplicate page with the identical cursor', async (): Promise<void> => {
    /** @brief 首页来源 / First-page source. */
    const sourceA = createSource('第一页来源', 'source-a')
    /** @brief 重试成功后的来源 / Source accepted after retry. */
    const sourceB = createSource('第二页来源', 'source-b')
    /** @brief 服务端签发的唯一下一页 cursor / Sole next-page cursor issued by the service. */
    const cursor = asUiKnowledgeSourceCursor('cursor-page-two')
    /** @brief 当前分页调用序号 / Current pagination invocation. */
    let invocation = 0
    /** @brief 分页读取 Mock / Paginated-read mock. */
    const list = vi.fn<KnowledgeGateway['listKnowledgeSourcePage']>((request) => {
      invocation += 1
      if (request.cursor === null) {
        return Promise.resolve(continuationPage([sourceA], cursor))
      }
      if (invocation === 2) {
        return Promise.resolve(continuationPage([sourceA], 'cursor-after-invalid-page'))
      }
      return Promise.resolve(terminalPage([sourceB]))
    })
    /** @brief 被测 Knowledge 端口 / Knowledge port under test. */
    const knowledge = createKnowledgeGateway({ listKnowledgeSourcePage: list })

    renderKnowledgeRoute(<KnowledgePage />, '/knowledge', createTestGateways({ knowledge }))

    expect(await screen.findByRole('heading', { name: sourceA.name })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('已保留当前列表')
    expect(screen.getAllByRole('heading', { name: sourceA.name })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: sourceB.name })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: sourceB.name })).toBeVisible()
    expect(list.mock.calls.map(([request]) => request.cursor)).toEqual([null, cursor, cursor])
  })

  it('rejects a continuation cursor cycle before exposing that page', async (): Promise<void> => {
    /** @brief 已接受首页来源 / Accepted first-page source. */
    const sourceA = createSource('稳定来源', 'stable-source')
    /** @brief 周期页中的候选来源 / Candidate source on the cyclic page. */
    const sourceB = createSource('不应出现的来源', 'cyclic-source')
    /** @brief 被服务端错误重复的 cursor / Cursor incorrectly repeated by the service. */
    const cursor = asUiKnowledgeSourceCursor('cursor-cycle')
    /** @brief 返回 cursor 环的分页读取 / Paginated read returning a cursor cycle. */
    const list = vi.fn<KnowledgeGateway['listKnowledgeSourcePage']>((request) =>
      Promise.resolve(
        request.cursor === null
          ? continuationPage([sourceA], cursor)
          : continuationPage([sourceB], cursor)
      )
    )

    renderKnowledgeRoute(
      <KnowledgePage />,
      '/knowledge',
      createTestGateways({
        knowledge: createKnowledgeGateway({ listKnowledgeSourcePage: list })
      })
    )

    expect(await screen.findByRole('heading', { name: sourceA.name })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('已保留当前列表')
    expect(screen.queryByRole('heading', { name: sourceB.name })).not.toBeInTheDocument()
  })

  it('retains the accepted list until a refreshed first page is fully authoritative', async (): Promise<void> => {
    /** @brief 刷新前来源 / Source before refresh. */
    const sourceA = createSource('刷新前来源', 'refresh-old')
    /** @brief 刷新后来源 / Source after refresh. */
    const sourceB = createSource('刷新后来源', 'refresh-new')
    /** @brief 尚未完成的新首页 / Pending new first page. */
    const refreshedPage = createDeferred<UiKnowledgeSourcePage>()
    /** @brief 当前首页读取序号 / Current first-page read invocation. */
    let invocation = 0
    /** @brief 首次立即返回、刷新延迟返回的列表读取 / List read resolving initially and delaying refresh. */
    const list = vi.fn<KnowledgeGateway['listKnowledgeSourcePage']>(() => {
      invocation += 1
      return invocation === 1 ? Promise.resolve(terminalPage([sourceA])) : refreshedPage.promise
    })

    renderKnowledgeRoute(
      <KnowledgePage />,
      '/knowledge',
      createTestGateways({
        knowledge: createKnowledgeGateway({ listKnowledgeSourcePage: list })
      })
    )

    expect(await screen.findByRole('heading', { name: sourceA.name })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新加载来源' }))
    expect(await screen.findByRole('button', { name: '正在刷新…' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: sourceA.name })).toBeVisible()

    await act(async (): Promise<void> => {
      refreshedPage.resolve(terminalPage([sourceB]))
      await refreshedPage.promise
    })

    expect(await screen.findByRole('heading', { name: sourceB.name })).toBeVisible()
    expect(screen.queryByRole('heading', { name: sourceA.name })).not.toBeInTheDocument()
    expect(list.mock.calls.map(([request]) => request.cursor)).toEqual([null, null])
  })

  it('clears the previous Workspace list while the new authority is pending', async (): Promise<void> => {
    /** @brief 第二个 Workspace identity / Second Workspace identity. */
    const workspaceBId = asUiOpaqueId<'workspace'>('workspace-b')
    /** @brief 第二个合法 WorkspaceAccess / Second valid WorkspaceAccess. */
    const workspaceBAccess = {
      memberId: asUiOpaqueId<'workspace-member'>('workspace-member-b'),
      role: 'editor',
      workspace: {
        createdAt: asUiWorkspaceTimestamp('2026-07-20T00:00:00.000Z'),
        dataRegion: 'cn',
        id: workspaceBId,
        name: '工作区 B',
        plan: 'team',
        revision: asUiWorkspaceRevision(1),
        slug: asUiWorkspaceSlug('workspace-b'),
        updatedAt: asUiWorkspaceTimestamp('2026-07-20T00:00:00.000Z')
      }
    } as const
    /** @brief Workspace A 来源 / Workspace-A source. */
    const sourceA = createSource('工作区 A 来源', 'workspace-a-source')
    /** @brief Workspace B 来源 / Workspace-B source. */
    const sourceB = createSource('工作区 B 来源', 'workspace-b-source', workspaceBId)
    /** @brief 延迟的 Workspace B 首页 / Deferred Workspace-B first page. */
    const workspaceBPage = createDeferred<UiKnowledgeSourcePage>()
    /** @brief 按显式 Workspace path 返回来源的端口 / Port returning sources by explicit Workspace path. */
    const list = vi.fn<KnowledgeGateway['listKnowledgeSourcePage']>((request) =>
      request.workspaceId === workspaceBId
        ? workspaceBPage.promise
        : Promise.resolve(terminalPage([sourceA]))
    )
    /** @brief 同时暴露两个访问权威的 Workspace 端口 / Workspace port exposing both access authorities. */
    const workspace: ReturnType<typeof createTestGateways>['workspace'] = {
      listWorkspaceAccessPage: (request) => {
        request.signal.throwIfAborted()
        return Promise.resolve({
          hasMore: false,
          items: [DEMO_WORKSPACE_ACCESSES[0]!, workspaceBAccess],
          nextCursor: null
        })
      }
    }

    renderKnowledgeRoute(
      <>
        <WorkspaceSwitchControl workspaceId={workspaceBId} />
        <KnowledgePage />
      </>,
      '/knowledge',
      createTestGateways({
        knowledge: createKnowledgeGateway({ listKnowledgeSourcePage: list }),
        workspace
      })
    )

    expect(await screen.findByRole('heading', { name: sourceA.name })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '切换工作区' }))

    await waitFor((): void => {
      expect(screen.queryByRole('heading', { name: sourceA.name })).not.toBeInTheDocument()
    })
    expect(screen.getByText('正在加载知识来源…')).toBeVisible()

    await act(async (): Promise<void> => {
      workspaceBPage.resolve(terminalPage([sourceB]))
      await workspaceBPage.promise
    })

    expect(await screen.findByRole('heading', { name: sourceB.name })).toBeVisible()
    expect(list.mock.calls.at(-1)?.[0].workspaceId).toBe(workspaceBId)
  })

  it('fails closed when a detail authority does not match the requested Source path', async (): Promise<void> => {
    /** @brief 服务端错误返回的其他来源 / Different source incorrectly returned by the service. */
    const mismatchedSource = createSource('跨路径来源不应展示', 'other-source')
    /** @brief 返回跨路径权威的详情读取 / Detail read returning cross-path authority. */
    const get = vi.fn<KnowledgeGateway['getKnowledgeSource']>(() =>
      Promise.resolve({
        concurrencyToken: asUiConcurrencyToken('"etag-other-source"'),
        source: mismatchedSource
      })
    )

    renderKnowledgeRoute(
      <KnowledgeSourceDetailPage />,
      '/knowledge/requested-source',
      createTestGateways({
        knowledge: createKnowledgeGateway({ getKnowledgeSource: get })
      })
    )

    expect(await screen.findByRole('heading', { name: '无法加载知识来源详情' })).toBeVisible()
    expect(screen.queryByText(mismatchedSource.name)).not.toBeInTheDocument()
  })

  it('renders literal deleting-source facts while suppressing untrusted Problem text', async (): Promise<void> => {
    /** @brief 必须永不进入 DOM 的服务端文本 / Server text that must never enter the DOM. */
    const secrets = {
      detail: 'SECRET problem detail',
      extension: 'SECRET problem extension',
      instance: 'SECRET problem instance',
      param: 'SECRET field parameter',
      sourceExtension: 'SECRET source extension',
      title: 'SECRET problem title',
      type: 'https://secret.example/problem'
    }
    /** @brief 带完整公开策略与不可信 Problem 的删除中来源 / Deleting source with a literal policy and untrusted Problem. */
    const source = createSource('只读删除中来源', 'deleting-source', MOCK_KNOWLEDGE_WORKSPACE_ID, {
      extensions: { 'secret:source': secrets.sourceExtension },
      ingestion: {
        chunkCount: 19,
        documentCount: 3,
        lastProblem: {
          code: 'knowledge.source_unavailable',
          detail: secrets.detail,
          errors: [
            {
              code: 'secret_code',
              messageKey: null,
              params: { secret: secrets.param },
              pointer: '/secret'
            }
          ],
          extensions: { 'secret:problem': secrets.extension },
          instance: secrets.instance,
          requestId: asUiOpaqueId<'request'>('request-safe-reference'),
          retryable: true,
          status: 503,
          title: secrets.title,
          type: secrets.type
        },
        lastSuccessAt: null,
        status: 'deleting'
      },
      publicConfig: {
        cloneUrl: 'https://public.example/repository.git',
        ref: null
      },
      visibility: {
        agentGrants: [
          {
            agentScope: 'resume_assistant',
            allowedOperations: ['retrieve', 'quote'],
            effect: 'allow'
          },
          {
            agentScope: 'resume_assistant',
            allowedOperations: ['write_back'],
            effect: 'deny'
          }
        ],
        allowExternalModelProcessing: false,
        allowedModelRegions: ['cn', 'private_deployment'],
        defaultEffect: 'deny',
        policyVersion: 9,
        retentionDays: 30,
        sensitivity: 'highly_confidential',
        sessionOverrideAllowed: false
      }
    })
    /** @brief 权威详情读取 / Authoritative detail read. */
    const get = vi.fn<KnowledgeGateway['getKnowledgeSource']>(() =>
      Promise.resolve({
        concurrencyToken: asUiConcurrencyToken('"etag-deleting-source"'),
        source
      })
    )

    renderKnowledgeRoute(
      <KnowledgeSourceDetailPage />,
      `/knowledge/${source.id}`,
      createTestGateways({
        knowledge: createKnowledgeGateway({ getKnowledgeSource: get })
      })
    )

    expect(await screen.findByRole('heading', { name: source.name })).toBeVisible()
    expect(screen.getByText('删除生命周期中，只读')).toBeVisible()
    expect(screen.queryByRole('link', { name: '编辑名称与策略' })).not.toBeInTheDocument()
    expect(screen.getByText('https://public.example/repository.git')).toBeVisible()
    expect(screen.getByText('未固定')).toBeVisible()
    expect(screen.getByText('request-safe-reference')).toBeVisible()
    expect(screen.getByText('knowledge.source_unavailable')).toBeVisible()
    expect(screen.getByText('503')).toBeVisible()
    expect(screen.getAllByText('resume_assistant')).toHaveLength(2)
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: source.id,
        workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
      })
    )
    for (const secret of Object.values(secrets)) {
      expect(screen.queryByText(secret)).not.toBeInTheDocument()
    }
  })
})
