import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief Chromium 中的简历用户旅程 / Resume user journey in Chromium. */
describe('WorkspaceApp Resume browser behaviour', (): void => {
  it('continues from the workspace and performs a viewport-appropriate Resume edit', async (): Promise<void> => {
    /** @brief 真实浏览器渲染结果 / Real-browser render result. */
    const screen = await renderBrowserWorkspace('/')

    await expect.element(screen.getByRole('heading', { name: '今日工作台' })).toBeVisible()
    await screen.getByRole('link', { name: '继续编辑简历' }).click()

    await expect.element(screen.getByRole('heading', { name: 'Klee Chen' })).toBeVisible()
    /** @brief API v2 模板与语义样式产品入口 / Product entry for API v2 Template and semantic style. */
    const templateSettings = screen.getByRole('link', { name: '打开模板与样式设置' })
    await expect.element(templateSettings).toBeVisible()
    await templateSettings.click()
    await expect.element(screen.getByRole('heading', { name: '模板与版式' })).toBeVisible()
    await screen.getByRole('link', { name: '返回' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Klee Chen' })).toBeVisible()

    if (window.matchMedia('(max-width: 900px)').matches) {
      await screen.getByRole('button', { name: '内容', exact: true }).click()
      await expect.element(screen.getByRole('region', { name: '内容编辑' })).toBeVisible()

      /** @brief 移动端当前区段的语义内容编辑器 / Semantic-content editor for the current mobile section. */
      const semanticContent = screen.getByRole('textbox', { name: '语义内容' })
      await userEvent.fill(semanticContent, '面向生产环境构建可靠的 AI 平台。')
      await expect.element(semanticContent).toHaveValue('面向生产环境构建可靠的 AI 平台。')
      return
    }
    await expect.element(screen.getByRole('heading', { name: '内容编辑' })).toBeVisible()

    /** @brief 桌面端直接可见的语义内容编辑器 / Semantic-content editor directly visible on desktop. */
    const semanticContent = screen.getByRole('textbox', { name: '语义内容' })
    await userEvent.fill(semanticContent, '面向生产环境构建可靠的桌面与 Web 产品。')
    await expect.element(semanticContent).toHaveValue('面向生产环境构建可靠的桌面与 Web 产品。')
  })
})
