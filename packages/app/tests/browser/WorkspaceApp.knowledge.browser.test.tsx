import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief Chromium 中的知识库用户旅程 / Knowledge user journey in Chromium. */
describe('WorkspaceApp Knowledge browser behaviour', (): void => {
  it('navigates to Knowledge, filters sources, and reviews the selected authorization policy', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await renderBrowserWorkspace('/')

    await screen.getByRole('link', { name: '知识库', exact: true }).click()
    await expect.element(screen.getByRole('heading', { name: '个人记忆与知识库' })).toBeVisible()

    /** @brief 知识来源筛选框 / Knowledge-source filter. */
    const sourceFilter = screen.getByRole('searchbox', { name: '筛选知识来源' })
    await userEvent.fill(sourceFilter, 'portfolio-engineering')

    await expect
      .element(screen.getByRole('heading', { name: 'portfolio-engineering' }))
      .toBeVisible()
    await screen.getByRole('link', { name: 'portfolio-engineering 的可见性设置' }).click()

    await expect.element(screen.getByRole('heading', { name: 'Agent 可见性' })).toBeVisible()
    await expect.element(screen.getByText('权限概览')).toBeVisible()
  })
})
