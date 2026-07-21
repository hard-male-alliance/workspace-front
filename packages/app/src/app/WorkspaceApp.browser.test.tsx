import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'

import type { AppGateways } from '../application'
import { createDiagnostics } from '../diagnostics'
import { appI18n, appI18nReady } from '../i18n'
import {
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from '../testing'
import { WorkspaceApp } from './WorkspaceApp'

/**
 * @brief 为真实浏览器测试创建独享 Gateway / Create per-test gateways for real-browser tests.
 * @return 不共享可变状态的 Gateway 集合 / Gateway collection without shared mutable state.
 */
function createBrowserTestGateways(): AppGateways {
  return {
    interview: new MockInterviewGateway(),
    knowledge: new MockKnowledgeGateway(),
    resume: new MockResumeGateway(),
    workspace: new MockWorkspaceGateway()
  }
}

beforeEach(async (): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

/** @brief Chromium 中的关键用户行为测试 / Critical user behaviours in Chromium. */
describe('WorkspaceApp browser behaviour', (): void => {
  it('persists a theme change triggered by a real browser click', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await render(
      <WorkspaceApp
        diagnostics={createDiagnostics({ sinks: [] })}
        gateways={createBrowserTestGateways()}
        initialPath="/"
      />
    )

    await expect.element(screen.getByRole('heading', { name: '今日工作台' })).toBeVisible()
    expect(document.documentElement.dataset['theme']).toBe('dark')

    await screen.getByRole('button', { name: '切换为浅色主题' }).click()

    expect(document.documentElement.dataset['theme']).toBe('light')
    expect(window.localStorage.getItem('inkwell-theme')).toBe('light')
  })

  it('accepts a custom interview role through native select and input events', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await render(
      <WorkspaceApp
        diagnostics={createDiagnostics({ sinks: [] })}
        gateways={createBrowserTestGateways()}
        initialPath="/interviews/new"
      />
    )
    /** @brief 已保存岗位选择器 / Saved-role selector. */
    const targetRole = screen.getByRole('combobox', { name: '目标岗位' })

    await expect.element(targetRole).toBeVisible()
    await userEvent.selectOptions(targetRole, '__custom__')

    /** @brief 自定义岗位输入框 / Custom-role input. */
    const customRole = screen.getByRole('textbox', { name: '手动输入目标岗位' })
    await userEvent.fill(customRole, '前端开发实习生')

    await expect.element(customRole).toHaveValue('前端开发实习生')
    await expect.element(screen.getByRole('button', { name: '开始面试' })).toBeEnabled()
  })
})
