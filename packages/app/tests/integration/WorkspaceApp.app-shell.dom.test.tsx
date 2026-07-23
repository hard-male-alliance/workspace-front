import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryIdentityGateway, InMemoryWorkspaceGateway } from '@ai-job-workspace/app/testing'
import { HttpProblemError } from '@ai-job-workspace/app/http'
import { asUiWorkspaceCursor, asUiWorkspaceSlug } from '../../src/contexts/workspace'
import { asUiOpaqueId } from '../../src/shared-kernel/identity'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/**
 * @brief 读取确定性的 Identity 与 WorkspaceAccess fixture / Read deterministic Identity and WorkspaceAccess fixtures.
 * @return 当前用户与首个访问权威 / Current user and first access authority.
 */
async function readDemoAuthority(): Promise<{
  readonly currentUser: Awaited<ReturnType<InMemoryIdentityGateway['loadCurrentUser']>>
  readonly firstAccess: Awaited<
    ReturnType<InMemoryWorkspaceGateway['listWorkspaceAccessPage']>
  >['items'][number]
}> {
  /** @brief fixture 读取共享的取消信号 / Shared cancellation signal for fixture reads. */
  const signal = new AbortController().signal
  /** @brief 并行读取的 Identity 与访问页 / Concurrently read Identity and access page. */
  const [currentUser, page] = await Promise.all([
    new InMemoryIdentityGateway().loadCurrentUser(signal),
    new InMemoryWorkspaceGateway().listWorkspaceAccessPage({ cursor: null, limit: 200, signal })
  ])
  /** @brief 首个 fixture 访问权威 / First fixture access authority. */
  const firstAccess = page.items[0]
  if (firstAccess === undefined) throw new Error('WorkspaceAccess fixture is missing.')
  return { currentUser, firstAccess }
}

/** @brief 应用外壳与工作台用户行为测试 / App-shell and workspace user-behaviour tests. */
describe('WorkspaceApp app shell', (): void => {
  it('仅在宿主提供能力时呈现并调用退出登录', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 宿主登出 spy / Host sign-out spy. */
    const onSignOut = vi.fn((): Promise<void> => Promise.resolve())

    render(<WorkspaceApp initialPath="/" onSignOut={onSignOut} />)
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }))

    await waitFor((): void => expect(onSignOut).toHaveBeenCalledOnce())
  })

  it('keeps one current workspace selection while navigating across contexts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 跨路由复用的测试 Gateway / Test gateways reused across routes. */
    const gateways = createTestGateways()
    /** @brief 内存 Identity 原始读取 / Original in-memory Identity read. */
    const readDemoUser = gateways.identity.loadCurrentUser.bind(gateways.identity)
    /** @brief 内存 Workspace 原始读取 / Original in-memory Workspace read. */
    const readDemoWorkspacePage = gateways.workspace.listWorkspaceAccessPage.bind(
      gateways.workspace
    )
    /** @brief 非固定姓名的 Identity 读取 / Identity read with a non-hardcoded name. */
    const loadCurrentUser = vi
      .spyOn(gateways.identity, 'loadCurrentUser')
      .mockImplementation(async (signal) => ({
        ...(await readDemoUser(signal)),
        displayName: 'Ada Lovelace'
      }))
    /** @brief 非固定工作区名称的 Workspace 读取 / Workspace read with a non-hardcoded name. */
    const listWorkspaceAccessPage = vi
      .spyOn(gateways.workspace, 'listWorkspaceAccessPage')
      .mockImplementation(async (request) => {
        /** @brief 原始访问页 / Original access page. */
        const page = await readDemoWorkspacePage(request)
        return {
          ...page,
          items: page.items.map((access, index) =>
            index === 0
              ? { ...access, workspace: { ...access.workspace, name: 'Production Workspace' } }
              : access
          )
        }
      })

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('link', { name: '简历' }))
    await screen.findByRole('heading', { name: '简历库' })
    fireEvent.click(screen.getByRole('link', { name: '模拟面试' }))
    await screen.findByRole('heading', { name: '模拟面试' })

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.aw-avatar' })).toBeInTheDocument()
    expect(screen.getAllByText('Production Workspace').length).toBeGreaterThan(0)
    expect(screen.queryByText('Klee')).not.toBeInTheDocument()
    expect(loadCurrentUser).toHaveBeenCalledTimes(1)
    expect(listWorkspaceAccessPage).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit selection when authority has no valid default Workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 无默认 Workspace 的身份权威 / Identity authority without a default Workspace. */
    const { currentUser, firstAccess } = await readDemoAuthority()
    /** @brief 测试 Identity gateway / Test Identity gateway. */
    const identity = {
      loadCurrentUser: vi.fn().mockResolvedValue({ ...currentUser, defaultWorkspaceId: null })
    }

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '选择工作区' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '今日工作台' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '当前工作区' }), {
      target: { value: firstAccess.workspace.id }
    })

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
  })

  it('switches Workspace explicitly and reloads Workspace-scoped route data', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试身份权威 / Test Identity authority. */
    const { currentUser, firstAccess } = await readDemoAuthority()
    /** @brief 第二个测试 WorkspaceAccess / Second test WorkspaceAccess. */
    const secondAccess = {
      ...firstAccess,
      memberId: asUiOpaqueId<'workspace-member'>('member_second_editor'),
      role: 'editor' as const,
      workspace: {
        ...firstAccess.workspace,
        id: asUiOpaqueId<'workspace'>('ws_second'),
        name: 'Second Workspace',
        slug: asUiWorkspaceSlug('second-workspace')
      }
    }
    const gateways = createTestGateways({
      identity: {
        loadCurrentUser: vi
          .fn()
          .mockResolvedValue({ ...currentUser, defaultWorkspaceId: firstAccess.workspace.id })
      },
      workspace: {
        listWorkspaceAccessPage: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [firstAccess, secondAccess],
          nextCursor: null
        })
      }
    })
    const listResumeSummariesPage = vi.spyOn(gateways.resume, 'listResumeSummariesPage')
    const listKnowledgeSourcePage = vi.spyOn(gateways.knowledge, 'listKnowledgeSourcePage')
    const listInterviewSessionPage = vi.spyOn(gateways.interview, 'listInterviewSessionPage')

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.change(screen.getByRole('combobox', { name: '当前工作区' }), {
      target: { value: secondAccess.workspace.id }
    })

    await waitFor((): void => {
      expect(screen.getByRole('combobox', { name: '当前工作区' })).toHaveValue(
        secondAccess.workspace.id
      )
      expect(listResumeSummariesPage).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: secondAccess.workspace.id })
      )
      expect(listKnowledgeSourcePage).not.toHaveBeenCalled()
      expect(listInterviewSessionPage).not.toHaveBeenCalled()
    })
  })

  it('shows the selected WorkspaceAccess role, plan, and data region', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    /** @brief 首页中的访问权威定义列表 / Access-authority definition list on the home page. */
    const authority = screen.getByLabelText('工作区访问权限')
    expect(within(authority).getByText('所有者')).toBeInTheDocument()
    expect(within(authority).getByText('个人版')).toBeInTheDocument()
    expect(within(authority).getByText('中国大陆')).toBeInTheDocument()
    expect(within(authority).queryByText('member_mock_klee_owner')).not.toBeInTheDocument()
  })

  it('appends WorkspaceAccess pages with the opaque cursor and keeps the new access selectable', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 默认 Identity 与首个 WorkspaceAccess / Default Identity and first WorkspaceAccess. */
    const { firstAccess } = await readDemoAuthority()
    /** @brief 服务端签发的后续页 cursor / Server-issued cursor for the next page. */
    const nextCursor = asUiWorkspaceCursor('workspace_cursor_second_page')
    /** @brief 第二页返回的访问权威 / Access authority returned by the second page. */
    const secondAccess = {
      ...firstAccess,
      memberId: asUiOpaqueId<'workspace-member'>('member_second_viewer'),
      role: 'viewer' as const,
      workspace: {
        ...firstAccess.workspace,
        dataRegion: 'global' as const,
        id: asUiOpaqueId<'workspace'>('ws_second_page'),
        name: 'Second Page Workspace',
        plan: 'team' as const,
        slug: asUiWorkspaceSlug('second-page-workspace')
      }
    }
    /** @brief 按 cursor 返回固定页面的 Workspace gateway / Workspace gateway returning fixed pages by cursor. */
    const listWorkspaceAccessPage = vi.fn(
      (request: Parameters<InMemoryWorkspaceGateway['listWorkspaceAccessPage']>[0]) => {
        request.signal.throwIfAborted()
        return Promise.resolve(
          request.cursor === null
            ? { hasMore: true as const, items: [firstAccess], nextCursor }
            : { hasMore: false as const, items: [secondAccess], nextCursor: null }
        )
      }
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ workspace: { listWorkspaceAccessPage } })}
        initialPath="/"
      />
    )

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('button', { name: '加载更多工作区' }))

    expect(await screen.findByRole('option', { name: 'Second Page Workspace' })).toBeInTheDocument()
    /** @brief 实际发出的第二页请求 / Actual second-page request. */
    const secondPageRequest = listWorkspaceAccessPage.mock.calls[1]?.[0]
    expect(secondPageRequest).toMatchObject({ cursor: nextCursor, limit: 200 })
    expect(secondPageRequest?.signal).toBeInstanceOf(AbortSignal)
    expect(screen.queryByRole('button', { name: '加载更多工作区' })).not.toBeInTheDocument()
  })

  it('keeps a failed WorkspaceAccess page retryable with the same opaque cursor', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 默认首个 WorkspaceAccess / Default first WorkspaceAccess. */
    const { firstAccess } = await readDemoAuthority()
    /** @brief 重试必须复用的服务端 cursor / Server cursor that the retry must reuse. */
    const nextCursor = asUiWorkspaceCursor('workspace_cursor_retry')
    /** @brief 下一页读取次数 / Number of next-page reads. */
    let nextPageAttempts = 0
    /** @brief 首次失败、重试成功的 Workspace gateway / Workspace gateway failing once and succeeding on retry. */
    const listWorkspaceAccessPage = vi.fn(
      (request: Parameters<InMemoryWorkspaceGateway['listWorkspaceAccessPage']>[0]) => {
        request.signal.throwIfAborted()
        if (request.cursor === null) {
          return Promise.resolve({ hasMore: true as const, items: [firstAccess], nextCursor })
        }
        nextPageAttempts += 1
        if (nextPageAttempts === 1) return Promise.reject(new Error('private adapter detail'))
        return Promise.resolve({ hasMore: false as const, items: [], nextCursor: null })
      }
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ workspace: { listWorkspaceAccessPage } })}
        initialPath="/"
      />
    )

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('button', { name: '加载更多工作区' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载更多工作区，请重试。')
    expect(document.body).not.toHaveTextContent('private adapter detail')

    fireEvent.click(screen.getByRole('button', { name: '重试加载工作区' }))
    await waitFor((): void => expect(nextPageAttempts).toBe(2))
    expect(listWorkspaceAccessPage.mock.calls.slice(1).map(([request]) => request.cursor)).toEqual([
      nextCursor,
      nextCursor
    ])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('aborts an in-flight WorkspaceAccess page when the shell unmounts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 默认首个 WorkspaceAccess / Default first WorkspaceAccess. */
    const { firstAccess } = await readDemoAuthority()
    /** @brief 后续页 cursor / Next-page cursor. */
    const nextCursor = asUiWorkspaceCursor('workspace_cursor_pending')
    /** @brief 被页面请求拥有的取消信号 / Cancellation signal owned by the page request. */
    let pageSignal: AbortSignal | undefined
    /** @brief 第二页保持 pending 的 Workspace gateway / Workspace gateway keeping its second page pending. */
    const listWorkspaceAccessPage = vi.fn(
      (request: Parameters<InMemoryWorkspaceGateway['listWorkspaceAccessPage']>[0]) => {
        if (request.cursor === null) {
          return Promise.resolve({ hasMore: true as const, items: [firstAccess], nextCursor })
        }
        pageSignal = request.signal
        return new Promise<never>(() => undefined)
      }
    )
    /** @brief 被测应用卸载动作 / Unmount action for the tested app. */
    const { unmount } = render(
      <WorkspaceApp
        gateways={createTestGateways({ workspace: { listWorkspaceAccessPage } })}
        initialPath="/"
      />
    )

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('button', { name: '加载更多工作区' }))
    await waitFor((): void => expect(pageSignal).toBeDefined())
    unmount()

    expect(pageSignal?.aborted).toBe(true)
  })

  it('shows a safe error when the Workspace picker rejects a stale selection', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试身份权威 / Test Identity authority. */
    const { currentUser } = await readDemoAuthority()

    render(<WorkspaceApp gateways={createTestGateways()} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.change(screen.getByRole('combobox', { name: '当前工作区' }), {
      target: { value: '' }
    })

    expect(await screen.findByText('无法切换工作区，请刷新访问权限后重试。')).toHaveAttribute(
      'role',
      'alert'
    )
    expect(screen.getByRole('combobox', { name: '当前工作区' })).toHaveValue(
      currentUser.defaultWorkspaceId
    )
  })

  it('does not invent an account while the Workspace authority is loading', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 永不完成的 Identity 启动读取 / Identity bootstrap read that never settles. */
    const pendingIdentity = new Promise<never>(() => undefined)

    render(
      <WorkspaceApp
        gateways={createTestGateways({
          identity: { loadCurrentUser: (): Promise<never> => pendingIdentity }
        })}
        initialPath="/"
      />
    )

    expect(screen.getByText('正在加载账户…')).toBeInTheDocument()
    expect(screen.getByText('正在加载工作区…')).toBeInTheDocument()
    expect(screen.queryByText('Klee')).not.toBeInTheDocument()
  })

  it('shows a safe retryable shell error without leaking adapter details', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 明确失败的 Identity gateway / Explicitly failing Identity gateway. */
    const identity = new InMemoryIdentityGateway({ mode: 'error' })
    /** @brief 启动读取观察 / Bootstrap-read observation. */
    const loadCurrentUser = vi.spyOn(identity, 'loadCurrentUser')

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    expect(await screen.findByText('账户信息暂时不可用')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '无法加载工作区' })).toBeInTheDocument()
    expect(screen.queryByText('In-memory gateway is configured to fail.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor((): void => expect(loadCurrentUser).toHaveBeenCalledTimes(2))
  })

  it('turns a Workspace 401 into localized guidance without exposing ProblemDetails text', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 返回真实 HTTP 身份失败语义的 Identity 端口 / Identity port returning real HTTP authentication-failure semantics. */
    const identity = {
      loadCurrentUser: vi.fn().mockRejectedValue(
        new HttpProblemError({
          code: 'auth.token_expired',
          detail: 'private auth detail at https://internal.example.test/oidc',
          requestId: 'req_auth_12345678',
          retryable: false,
          retryAfterMs: null,
          status: 401,
          title: 'private authentication title'
        })
      )
    }

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This content requires sign-in')
    expect(alert).toHaveTextContent('Support reference: req_auth_12345678')
    expect(alert).not.toHaveTextContent(/private|internal\.example/u)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('renders only the runtime identity injected by its host composition root', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 显式注入的 Electron 测试运行时 / Explicitly injected Electron test runtime. */
    const { container } = render(
      <WorkspaceApp
        initialPath="/"
        runtimeInfo={{
          apiBaseUrl: 'https://api.example.test',
          appVersion: '9.9.9-test',
          platform: 'electron'
        }}
      />
    )

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-runtime-platform', 'electron')
    expect(container.firstElementChild).toHaveAttribute('data-runtime-version', '9.9.9-test')
  })

  it('renders the shared workspace home through Mock gateways', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续编辑简历' })).toHaveAttribute(
      'href',
      '/resumes/res_mock_ai_platform/edit'
    )
  })

  it('starts in dark mode and lets the student switch to the light theme locally', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    fireEvent.click(screen.getByRole('button', { name: '切换为浅色主题' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('inkwell-theme')).toBe('light')
  })

  it('presents the action-first dashboard and keeps every existing workspace area reachable', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日最重要的事' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '继续处理' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近更新' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: '模拟面试' })).toHaveAttribute('href', '/interviews')
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.queryByRole('link', { name: '可见性' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '状态' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '反馈' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '反馈' })).toHaveAccessibleDescription(
      '反馈功能正在准备中，目前无法提交。'
    )
  })

  it('renders English chrome and retains accessible names for compact navigation', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: "Today's workspace" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: 'Mock interview' })).toHaveAttribute(
      'href',
      '/interviews'
    )
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('Career Workspace')
  })
})
