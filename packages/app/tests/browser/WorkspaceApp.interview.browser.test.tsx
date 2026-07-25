import { describe, expect, it } from 'vitest'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief Chromium 中的模拟面试用户旅程 / Interview user journey in Chromium. */
describe('WorkspaceApp Interview browser behaviour', (): void => {
  it('creates a v2 session and reads the unified report with transcript evidence', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await renderBrowserWorkspace('/')

    await screen.getByRole('link', { name: '模拟面试', exact: true }).click()
    await expect
      .element(screen.getByRole('heading', { name: '模拟面试', exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText('报告可查看')).toBeVisible()
    await screen.getByRole('link', { name: '创建练习会话' }).click()

    await expect.element(screen.getByRole('heading', { name: '创建练习会话' })).toBeVisible()
    await screen.getByRole('textbox', { name: '目标岗位' }).fill('Frontend Platform Engineer')
    await screen.getByRole('textbox', { name: '目标公司（可选）' }).fill('InkWell Labs')
    await screen.getByRole('checkbox', { name: /保存文字转录 30 天/ }).click()
    await screen.getByRole('button', { name: '创建练习会话' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Frontend Platform Engineer' }))
      .toBeVisible()
    await expect.element(screen.getByText('已创建', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: '会话尚未完成' })).toBeVisible()
    await expect.element(screen.getByText('保存 30 天')).toBeVisible()

    await screen.getByRole('link', { name: '返回会话记录' }).click()
    await expect.element(screen.getByText('Frontend Platform Engineer')).toBeVisible()
    await screen.getByText('报告可查看').click()

    await expect
      .element(screen.getByRole('heading', { name: 'AI Platform Engineer' }))
      .toBeVisible()
    await expect.element(screen.getByText('总评分')).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: '评分证据' })).toBeVisible()
    await screen.getByText('问题界定', { exact: true }).last().click()
    await expect
      .element(screen.getByRole('button', { name: '已在转录中定位' }).first())
      .toBeVisible()
    await expect.element(screen.getByRole('heading', { name: '面试转录' })).toBeVisible()
    await expect.element(screen.getByText('已加载完整转录', { exact: true })).toBeVisible()
  })
})
