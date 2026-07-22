import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MOCK_EDITORIAL_TEMPLATE } from '@ai-job-workspace/app/testing'

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

    /** @brief 简历模板选择器 / Resume-template selector. */
    const template = screen.getByRole('combobox', { name: '快速切换简历模板' })
    /** @brief 同时锁定 ID 与不可变版本的 Editorial 选项 / Editorial option pinning both ID and immutable version. */
    const editorialIdentity = JSON.stringify([
      MOCK_EDITORIAL_TEMPLATE.id,
      MOCK_EDITORIAL_TEMPLATE.version
    ])
    await userEvent.selectOptions(template, editorialIdentity)

    await expect.element(template).toHaveValue(editorialIdentity)
  })
})
