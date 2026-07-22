import { describe, expect, it } from 'vitest'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief Chromium 中的模拟面试用户旅程 / Interview user journey in Chromium. */
describe('WorkspaceApp Interview browser behaviour', (): void => {
  it('creates an Interview from navigation and reaches its user-facing analysis', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await renderBrowserWorkspace('/')

    await screen.getByRole('link', { name: '模拟面试', exact: true }).click()
    await expect
      .element(screen.getByRole('heading', { name: '模拟面试', exact: true }))
      .toBeVisible()
    await screen.getByRole('link', { name: '开始新面试' }).click()

    await expect.element(screen.getByRole('heading', { name: '配置模拟面试' })).toBeVisible()
    await screen.getByRole('button', { name: '开始面试' }).click()

    await expect.element(screen.getByRole('heading', { name: '模拟面试进行中' })).toBeVisible()
    await expect.element(screen.getByText('持续监听中；转写只读，无法编辑或撤回。')).toBeVisible()
    await screen.getByRole('button', { name: '结束录音并提交' }).click()

    await expect.element(screen.getByText('AI 已完成本次面试')).toBeVisible()
    await screen.getByRole('link', { name: '查看面试分析' }).click()

    await expect.element(screen.getByRole('heading', { name: '面试分析' })).toBeVisible()
    await expect.element(screen.getByRole('img', { name: '面试能力维度评分' })).toBeVisible()
  })
})
