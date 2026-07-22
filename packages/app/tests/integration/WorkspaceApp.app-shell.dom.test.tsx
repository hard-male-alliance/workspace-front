import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryIdentityGateway, InMemoryWorkspaceGateway } from '@ai-job-workspace/app/testing'
import { HttpProblemError } from '@ai-job-workspace/app/http'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 应用外壳与工作台用户行为测试 / App-shell and workspace user-behaviour tests. */
describe('WorkspaceApp app shell', (): void => {
  it('keeps one current workspace selection while navigating across contexts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 跨路由复用的测试 Gateway / Test gateways reused across routes. */
    const gateways = createTestGateways()
    /** @brief 内存 Identity 原始读取 / Original in-memory Identity read. */
    const readDemoUser = gateways.identity.loadCurrentUser.bind(gateways.identity)
    /** @brief 内存 Workspace 原始读取 / Original in-memory Workspace read. */
    const readDemoWorkspaces = gateways.workspace.listAccessibleWorkspaces.bind(gateways.workspace)
    /** @brief 非固定姓名的 Identity 读取 / Identity read with a non-hardcoded name. */
    const loadCurrentUser = vi
      .spyOn(gateways.identity, 'loadCurrentUser')
      .mockImplementation(async () => ({
        ...(await readDemoUser()),
        displayName: 'Ada Lovelace'
      }))
    /** @brief 非固定工作区名称的 Workspace 读取 / Workspace read with a non-hardcoded name. */
    const listAccessibleWorkspaces = vi
      .spyOn(gateways.workspace, 'listAccessibleWorkspaces')
      .mockImplementation(async () =>
        (await readDemoWorkspaces()).map((workspace, index) =>
          index === 0 ? { ...workspace, name: 'Production Workspace' } : workspace
        )
      )

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('link', { name: '简历' }))
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('link', { name: '模拟面试' }))
    await screen.findByRole('heading', { name: '模拟面试' })

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.aw-avatar' })).toBeInTheDocument()
    expect(screen.getByText('Production Workspace')).toBeInTheDocument()
    expect(screen.queryByText('Klee')).not.toBeInTheDocument()
    expect(loadCurrentUser).toHaveBeenCalledTimes(1)
    expect(listAccessibleWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit selection when authority has no valid default Workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 无默认 Workspace 的身份权威 / Identity authority without a default Workspace. */
    const currentUser = await new InMemoryIdentityGateway().loadCurrentUser()
    /** @brief 可访问 Workspace 列表 / Accessible Workspace list. */
    const workspaces = await new InMemoryWorkspaceGateway().listAccessibleWorkspaces()
    /** @brief 测试 Identity gateway / Test Identity gateway. */
    const identity = {
      loadCurrentUser: vi.fn().mockResolvedValue({ ...currentUser, defaultWorkspaceId: null })
    }

    render(<WorkspaceApp gateways={createTestGateways({ identity })} initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '选择工作区' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '今日工作台' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '当前工作区' }), {
      target: { value: workspaces[0]?.id }
    })

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
  })

  it('switches Workspace explicitly and reloads Workspace-scoped route data', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试身份权威 / Test Identity authority. */
    const currentUser = await new InMemoryIdentityGateway().loadCurrentUser()
    /** @brief 测试 Workspace 权威 / Test Workspace authority. */
    const workspaces = await new InMemoryWorkspaceGateway().listAccessibleWorkspaces()
    const firstWorkspace = workspaces[0]
    if (firstWorkspace === undefined) throw new Error('Workspace fixture is missing.')
    const secondWorkspace = {
      ...firstWorkspace,
      id: 'ws_second' as typeof firstWorkspace.id,
      name: 'Second Workspace',
      slug: 'second-workspace'
    }
    const gateways = createTestGateways({
      identity: {
        loadCurrentUser: vi
          .fn()
          .mockResolvedValue({ ...currentUser, defaultWorkspaceId: firstWorkspace.id })
      },
      workspace: {
        listAccessibleWorkspaces: vi.fn().mockResolvedValue([firstWorkspace, secondWorkspace])
      }
    })
    const listResumeCards = vi.spyOn(gateways.resume, 'listResumeCards')
    const listKnowledgeSources = vi.spyOn(gateways.knowledge, 'listKnowledgeSources')
    const listCompletedInterviews = vi.spyOn(gateways.interview, 'listCompletedInterviews')

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.change(screen.getByRole('combobox', { name: '当前工作区' }), {
      target: { value: secondWorkspace.id }
    })

    await waitFor((): void => {
      expect(screen.getByRole('combobox', { name: '当前工作区' })).toHaveValue(secondWorkspace.id)
      expect(listResumeCards).toHaveBeenCalledWith(secondWorkspace.id)
      expect(listKnowledgeSources).toHaveBeenCalledWith(secondWorkspace.id)
      expect(listCompletedInterviews).toHaveBeenCalledWith(secondWorkspace.id)
    })
  })

  it('shows a safe error when the Workspace picker rejects a stale selection', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试身份权威 / Test Identity authority. */
    const currentUser = await new InMemoryIdentityGateway().loadCurrentUser()

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
    expect(loadCurrentUser).toHaveBeenCalledTimes(2)
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
