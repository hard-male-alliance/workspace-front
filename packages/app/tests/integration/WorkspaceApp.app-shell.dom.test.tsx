import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryWorkspaceGateway } from '@ai-job-workspace/app/testing'

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
    /** @brief 内存 authority 原始读取 / Original in-memory authority read. */
    const readDemoAccess = gateways.workspace.loadAccess.bind(gateways.workspace)
    /** @brief 非固定姓名与工作区的访问读取 / Access read with a non-hardcoded name and Workspace. */
    const loadWorkspaceAccess = vi
      .spyOn(gateways.workspace, 'loadAccess')
      .mockImplementation(async () => {
        /** @brief 原始测试访问权威 / Original test-access authority. */
        const access = await readDemoAccess()
        return {
          currentUser: { ...access.currentUser, displayName: 'Ada Lovelace' },
          workspaces: access.workspaces.map((workspace, index) =>
            index === 0 ? { ...workspace, name: 'Production Workspace' } : workspace
          )
        }
      })
    /** @brief Workspace 访问读取记录 / Workspace-access read record. */

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
    expect(loadWorkspaceAccess).toHaveBeenCalledTimes(1)
  })

  it('does not invent an account while the Workspace authority is loading', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 永不完成的 Workspace 启动读取 / Workspace bootstrap read that never settles. */
    const pendingAccess = new Promise<never>(() => undefined)

    render(
      <WorkspaceApp
        gateways={createTestGateways({
          workspace: { loadAccess: (): Promise<never> => pendingAccess }
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

    /** @brief 明确失败的 Workspace gateway / Explicitly failing Workspace gateway. */
    const workspace = new InMemoryWorkspaceGateway({ mode: 'error' })
    /** @brief 启动读取观察 / Bootstrap-read observation. */
    const loadWorkspaceAccess = vi.spyOn(workspace, 'loadAccess')

    render(<WorkspaceApp gateways={createTestGateways({ workspace })} initialPath="/" />)

    expect(await screen.findByText('账户信息暂时不可用')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '无法加载工作区' })).toBeInTheDocument()
    expect(screen.queryByText('In-memory gateway is configured to fail.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(loadWorkspaceAccess).toHaveBeenCalledTimes(2)
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
