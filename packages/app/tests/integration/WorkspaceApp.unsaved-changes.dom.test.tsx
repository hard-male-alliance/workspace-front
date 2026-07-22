import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryIdentityGateway, InMemoryWorkspaceGateway } from '@ai-job-workspace/app/testing'
import { asUiWorkspaceSlug } from '../../src/contexts/workspace'
import { asUiOpaqueId } from '../../src/shared-kernel/identity'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

vi.mock('../../src/app/routes/ResumeRoutes', async () => {
  /** @brief 测试 fixture 使用的 React API / React API used by the test fixture. */
  const { useState } = await import('react')
  /** @brief 测试 fixture 使用的嵌套路由 API / Nested routing API used by the test fixture. */
  const { Route, Routes } = await import('react-router-dom')
  /** @brief 被页面接入的未保存更改 hook / Unsaved-change hook integrated by the page. */
  const { useUnsavedChanges } = await import('../../src/app/UnsavedChanges')

  /**
   * @brief 提供两个独立 dirty 来源的测试页 / Test page exposing two independent dirty sources.
   * @return 可以驱动草稿状态的路由内容 / Route content that can drive draft state.
   */
  function UnsavedChangesFixture(): React.JSX.Element {
    /** @brief 用户输入的主草稿 / Primary draft entered by the user. */
    const [draft, setDraft] = useState('')
    /** @brief 独立的第二 dirty 来源 / Independent secondary dirty source. */
    const [secondaryDirty, setSecondaryDirty] = useState(false)
    useUnsavedChanges('test.resume-draft', draft.length > 0)
    useUnsavedChanges('test.resume-secondary', secondaryDirty)

    return (
      <div className="aw-page">
        <h1>Unsaved changes fixture</h1>
        <label>
          Draft
          <input
            aria-label="Draft"
            onChange={(event): void => setDraft(event.currentTarget.value)}
            value={draft}
          />
        </label>
        <button onClick={(): void => setSecondaryDirty(true)} type="button">
          Make secondary dirty
        </button>
        <button onClick={(): void => setSecondaryDirty(false)} type="button">
          Clean secondary
        </button>
      </div>
    )
  }

  /**
   * @brief 用未保存更改 fixture 替代 Resume 布线的测试路由 / Test route replacing Resume wiring with the unsaved-change fixture.
   * @return 只有索引页的 Resume 子路由 / Resume child router containing only the index fixture.
   */
  function TestResumeRoutes(): React.JSX.Element {
    return (
      <Routes>
        <Route element={<UnsavedChangesFixture />} index />
      </Routes>
    )
  }

  return { default: TestResumeRoutes }
})

installWorkspaceAppTestCleanup()

/**
 * @brief 创建含两个可选 Workspace 的测试依赖 / Create test dependencies with two selectable Workspaces.
 * @return 工作区 gateway 与两个访问权威 / App gateways and both access authorities.
 */
async function createTwoWorkspaceFixture(): Promise<{
  readonly firstWorkspaceId: string
  readonly gateways: ReturnType<typeof createTestGateways>
  readonly secondWorkspaceId: string
}> {
  /** @brief fixture 权威读取的取消信号 / Cancellation signal for fixture authority reads. */
  const signal = new AbortController().signal
  /** @brief 并行读取的默认身份与 WorkspaceAccess 页 / Default Identity and WorkspaceAccess page read in parallel. */
  const [currentUser, page] = await Promise.all([
    new InMemoryIdentityGateway().loadCurrentUser(signal),
    new InMemoryWorkspaceGateway().listWorkspaceAccessPage({ cursor: null, limit: 200, signal })
  ])
  /** @brief 默认 WorkspaceAccess / Default WorkspaceAccess. */
  const firstAccess = page.items[0]
  if (firstAccess === undefined) throw new Error('WorkspaceAccess fixture is missing.')
  /** @brief 第二个可选 WorkspaceAccess / Second selectable WorkspaceAccess. */
  const secondAccess = {
    ...firstAccess,
    memberId: asUiOpaqueId<'workspace-member'>('member_unsaved_editor'),
    role: 'editor' as const,
    workspace: {
      ...firstAccess.workspace,
      id: asUiOpaqueId<'workspace'>('ws_unsaved_second'),
      name: 'Unsaved Second Workspace',
      slug: asUiWorkspaceSlug('unsaved-second-workspace')
    }
  }
  /** @brief 返回两个工作区权威的测试 gateway / Test gateways returning both Workspace authorities. */
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
  return {
    firstWorkspaceId: firstAccess.workspace.id,
    gateways,
    secondWorkspaceId: secondAccess.workspace.id
  }
}

/** @brief 应用级未保存更改防丢失测试 / Application-level unsaved-change loss-prevention tests. */
describe('WorkspaceApp unsaved changes', (): void => {
  it('initializes the Data Router at the explicit memory path', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes" />)

    expect(
      await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('blocks internal links, traps focus, restores focus on stay, and proceeds on leave', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    render(<WorkspaceApp initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'keep this draft' }
    })
    /** @brief 触发被拦截导航的主导航链接 / Primary-navigation link triggering the blocked navigation. */
    const knowledgeLink = screen.getByRole('link', { name: '知识库' })
    knowledgeLink.focus()
    fireEvent.click(knowledgeLink)

    /** @brief 拦截后呈现的可访问确认框 / Accessible confirmation shown after blocking. */
    const dialog = await screen.findByRole('alertdialog', { name: '放弃未保存的更改？' })
    /** @brief 安全默认的继续编辑按钮 / Safe-default keep-editing button. */
    const stay = screen.getByRole('button', { name: '继续编辑' })
    /** @brief 确认放弃更改的按钮 / Button confirming discarded changes. */
    const leave = screen.getByRole('button', { name: '放弃更改并继续' })
    expect(stay).toHaveFocus()
    fireEvent.keyDown(stay, { key: 'Tab', shiftKey: true })
    expect(leave).toHaveFocus()
    fireEvent.keyDown(leave, { key: 'Tab' })
    expect(stay).toHaveFocus()

    fireEvent.click(stay)
    expect(dialog).not.toBeInTheDocument()
    expect(knowledgeLink).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('keep this draft')

    fireEvent.click(knowledgeLink)
    fireEvent.click(await screen.findByRole('button', { name: '放弃更改并继续' }))
    expect(await screen.findByRole('heading', { name: '个人记忆与知识库' })).toBeInTheDocument()
  })

  it('does not intercept navigation when every source is clean', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    render(<WorkspaceApp initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })

    fireEvent.click(screen.getByRole('link', { name: '知识库' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '个人记忆与知识库' })).toBeInTheDocument()
  })

  it('confirms a Workspace switch before replacing the route subtree', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 双 Workspace 测试权威 / Two-Workspace test authority. */
    const { firstWorkspaceId, gateways, secondWorkspaceId } = await createTwoWorkspaceFixture()
    render(<WorkspaceApp gateways={gateways} initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'workspace-bound draft' }
    })
    /** @brief 受控的 Workspace 选择器 / Controlled Workspace selector. */
    const selector = screen.getByRole('combobox', { name: '当前工作区' })
    fireEvent.change(selector, { target: { value: secondWorkspaceId } })

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(selector).toHaveValue(firstWorkspaceId)
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('workspace-bound draft')

    fireEvent.click(screen.getByRole('button', { name: '放弃更改并继续' }))
    await waitFor((): void => {
      expect(screen.getByRole('combobox', { name: '当前工作区' })).toHaveValue(secondWorkspaceId)
    })
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('')
  })

  it('keeps the current page and draft when a confirmed Workspace switch fails', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    render(<WorkspaceApp initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'must survive failure' }
    })
    /** @brief 当前有效 Workspace 选择 / Current valid Workspace selection. */
    const selector = screen.getByRole('combobox', { name: '当前工作区' })
    /** @brief 尝试失败前的权威 Workspace ID / Authoritative Workspace ID before the failed attempt. */
    const currentWorkspaceId = (selector as HTMLSelectElement).value
    fireEvent.change(selector, { target: { value: '' } })
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByText('无法切换工作区，请刷新访问权限后重试。')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '放弃更改并继续' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法切换工作区，请刷新访问权限后重试。'
    )
    expect(selector).toHaveValue(currentWorkspaceId)
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('must survive failure')
  })

  it('confirms sign-out before invoking the host capability', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 宿主登出能力 spy / Host sign-out capability spy. */
    const onSignOut = vi.fn((): Promise<void> => Promise.resolve())
    render(<WorkspaceApp initialPath="/resumes" onSignOut={onSignOut} />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'sign-out draft' }
    })

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(onSignOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(onSignOut).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    fireEvent.click(await screen.findByRole('button', { name: '放弃更改并继续' }))
    await waitFor((): void => expect(onSignOut).toHaveBeenCalledOnce())
  })

  it('registers beforeunload only while at least one dirty source remains', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief window 事件注册观察 / Window event-registration observation. */
    const addEventListener = vi.spyOn(window, 'addEventListener')
    /** @brief window 事件取消观察 / Window event-removal observation. */
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    render(<WorkspaceApp initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })
    expect(addEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0)

    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'primary dirty' }
    })
    await waitFor((): void =>
      expect(addEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(
        1
      )
    )
    /** @brief 唯一的 beforeunload 监听器 / The sole beforeunload listener. */
    const unloadListener = addEventListener.mock.calls.find(
      ([type]) => type === 'beforeunload'
    )?.[1]
    /** @brief dirty 期间的可取消卸载事件 / Cancelable unload event while dirty. */
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    expect(window.dispatchEvent(dirtyUnload)).toBe(false)
    expect(dirtyUnload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Make secondary dirty' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: '' } })
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(
      0
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clean secondary' }))
    await waitFor((): void =>
      expect(
        removeEventListener.mock.calls.filter(
          ([type, listener]) => type === 'beforeunload' && listener === unloadListener
        )
      ).toHaveLength(1)
    )
    /** @brief 所有来源恢复 clean 后的卸载事件 / Unload event after every source returns clean. */
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    expect(window.dispatchEvent(cleanUnload)).toBe(true)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })
})
