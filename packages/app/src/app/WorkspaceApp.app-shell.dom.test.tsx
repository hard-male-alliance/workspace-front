import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
    /** @brief 工作区列表读取记录 / Workspace-list read record. */
    const listWorkspaces = vi.spyOn(gateways.workspace, 'listWorkspaces')

    render(<WorkspaceApp gateways={gateways} initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    fireEvent.click(screen.getByRole('link', { name: '简历' }))
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('link', { name: '模拟面试' }))
    await screen.findByRole('heading', { name: '模拟面试' })

    expect(listWorkspaces).toHaveBeenCalledTimes(1)
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
    expect(screen.getByRole('heading', { name: '最近活动' })).toBeInTheDocument()

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
