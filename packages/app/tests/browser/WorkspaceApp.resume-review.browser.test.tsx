/** @file Chromium 中的 Resume 历史恢复旅程 / Resume history-restore journey in Chromium. */

import { describe, expect, it } from 'vitest'

import {
  installBrowserWorkspaceTestSetup,
  renderBrowserWorkspace
} from './WorkspaceApp.browser-test-harness'

installBrowserWorkspaceTestSetup()

/** @brief 桌面与移动 Chromium 共用的 Resume 历史恢复旅程 / Resume history-restore journey shared by desktop and mobile Chromium. */
describe('WorkspaceApp Resume review browser journey', (): void => {
  it('deep-links to history and restores an immutable revision as a new current revision', async (): Promise<void> => {
    /** @brief 以明确 history 页签深链渲染的真实浏览器页面 / Real-browser page rendered from an explicit history-tab deep link. */
    const screen = await renderBrowserWorkspace('/resumes/res_mock_ai_platform/review?tab=history')

    await expect.element(screen.getByRole('heading', { name: '版本与建议' })).toBeVisible()
    /** @brief 可寻址 Review 页签导航 / Addressable Review-tab navigation. */
    const tabs = screen.getByRole('navigation', { name: '版本与建议视图' })
    await expect
      .element(tabs.getByRole('button', { name: '版本历史' }))
      .toHaveAttribute('aria-current', 'page')
    await expect.element(screen.getByText('当前 Resume 版本 18')).toBeVisible()

    /** @brief 服务端顺序呈现的版本时间线 / Revision timeline rendered in server order. */
    const timeline = screen.getByRole('region', { name: '版本时间线' })
    await timeline.getByRole('button', { name: /^版本 17/u }).click()
    await expect
      .element(
        screen.getByRole('article', {
          name: '历史版本 17 的语义预览'
        })
      )
      .toBeVisible()

    await screen.getByRole('button', { name: '恢复到版本 17' }).click()
    await expect.element(screen.getByText('确认从版本 17 创建新的当前版本？')).toBeVisible()
    await screen.getByRole('button', { name: '确认恢复' }).click()
    await expect.element(screen.getByText('恢复任务正在排队。')).toBeVisible()

    /** @brief 以生产可见性恢复语义触发 queued-to-running 权威重读 / Authoritative queued-to-running reread triggered through production visibility-resume semantics. */
    document.dispatchEvent(new Event('visibilitychange'))
    await expect.element(screen.getByText('正在创建新的当前版本。')).toBeVisible()

    /** @brief 以第二次权威重读完成 running-to-succeeded 与 Resume 重读 / Second authoritative reread completing running-to-succeeded and the Resume reread. */
    document.dispatchEvent(new Event('visibilitychange'))
    await expect.element(screen.getByText('恢复已确认；新的当前 Resume 是版本 19。')).toBeVisible()
    await expect.element(screen.getByText('当前 Resume 版本 19')).toBeVisible()
  })
})
