import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief Chromium 中的 API v2 Knowledge 用户旅程 / API v2 Knowledge user journeys in Chromium. */
describe('WorkspaceApp Knowledge browser behaviour', (): void => {
  it('filters loaded sources, reads authority, and conditionally edits the selected source', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await renderBrowserWorkspace('/')

    await screen.getByRole('link', { name: '知识库', exact: true }).click()
    await expect
      .element(screen.getByRole('heading', { level: 1, name: '知识来源' }))
      .toBeVisible()

    /** @brief 只作用于已加载页的来源筛选框 / Source filter scoped to the loaded page. */
    const sourceFilter = screen.getByRole('searchbox', { name: '筛选已加载来源' })
    await userEvent.fill(sourceFilter, 'portfolio-engineering')

    await expect
      .element(screen.getByRole('heading', { name: 'portfolio-engineering' }))
      .toBeVisible()
    await screen
      .getByRole('link', { name: '查看 portfolio-engineering 的权威详情' })
      .click()

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'portfolio-engineering' }))
      .toBeVisible()
    await expect.element(screen.getByRole('heading', { name: '已保存的访问策略' })).toBeVisible()
    await expect.element(screen.getByText('私有部署')).toBeVisible()
    await screen.getByRole('link', { name: '编辑名称与策略' }).click()
    await expect
      .element(screen.getByRole('heading', { level: 1, name: '编辑知识来源' }))
      .toBeVisible()

    /** @brief 使用强 ETag 保存的名称字段 / Name field saved with a strong ETag. */
    const sourceName = screen.getByRole('textbox', { name: '来源名称' })
    await userEvent.fill(sourceName, 'portfolio-runtime-safety')
    await screen.getByRole('button', { name: '保存' }).click()
    await expect.element(screen.getByText('来源设置已由服务端确认')).toBeVisible()
    await expect.element(sourceName).toHaveValue('portfolio-runtime-safety')
  })

  it('creates a manual note and reaches its authoritative detail without a false draft prompt', async (): Promise<void> => {
    /** @brief 真实 Chromium 渲染结果 / Real Chromium render result. */
    const screen = await renderBrowserWorkspace('/knowledge')

    await screen.getByRole('link', { name: '新建手工笔记' }).click()
    await expect
      .element(screen.getByRole('heading', { level: 1, name: '新建手工笔记来源' }))
      .toBeVisible()

    await userEvent.fill(
      screen.getByRole('textbox', { name: '来源名称' }),
      'Browser runtime safety notes'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: '纯文本正文' }),
      'The browser journey verifies safe navigation after a confirmed write.'
    )
    await screen.getByRole('button', { name: '创建手工笔记来源' }).click()

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Browser runtime safety notes' }))
      .toBeVisible()
    await expect.element(screen.getByRole('heading', { name: '尚未开始' })).toBeVisible()
  })
})
