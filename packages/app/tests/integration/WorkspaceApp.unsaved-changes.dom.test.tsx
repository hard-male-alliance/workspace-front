import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
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
    expect(await screen.findByRole('heading', { level: 1, name: '知识来源' })).toBeInTheDocument()
  })

  it('does not intercept navigation when every source is clean', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    render(<WorkspaceApp initialPath="/resumes" />)
    await screen.findByRole('heading', { name: 'Unsaved changes fixture' })

    fireEvent.click(screen.getByRole('link', { name: '知识库' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: '知识来源' })).toBeInTheDocument()
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
