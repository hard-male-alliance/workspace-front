import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'

import type { AppGateways } from '../application'
import { createDiagnostics } from '../diagnostics'
import { appI18n, appI18nReady } from '../i18n'
import {
  DemoInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  DemoWorkspaceGateway
} from '../testing'
import { WorkspaceApp } from './WorkspaceApp'

/**
 * @brief 为真实浏览器测试创建独享 Gateway / Create per-test gateways for real-browser tests.
 * @return 不共享可变状态的 Gateway 集合 / Gateway collection without shared mutable state.
 */
function createBrowserTestGateways(): AppGateways {
  return {
    interview: new DemoInterviewGateway(),
    knowledge: new MockKnowledgeGateway(),
    resume: new MockResumeGateway(),
    workspace: new DemoWorkspaceGateway()
  }
}

/**
 * @brief 在 Chromium 中渲染独享的工作区应用 / Render an isolated workspace application in Chromium.
 * @param initialPath 用户旅程的初始路由 / Initial route for the user journey.
 * @return 可通过可访问语义查询的浏览器渲染结果 / Browser render result queryable by accessible semantics.
 */
async function renderBrowserWorkspace(
  initialPath: string
): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <WorkspaceApp
      artifactSave={{ saveArtifact: () => Promise.resolve({ status: 'saved' }) }}
      diagnostics={createDiagnostics({ sinks: [] })}
      gateways={createBrowserTestGateways()}
      initialPath={initialPath}
      runtimeInfo={{ appVersion: APPLICATION_VERSION, platform: 'web' }}
    />
  )
}

beforeEach(async (): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

/** @brief Chromium 中的关键用户行为测试 / Critical user behaviours in Chromium. */
describe('WorkspaceApp browser behaviour', (): void => {
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
    await userEvent.selectOptions(template, 'tpl_mock_editorial')

    await expect.element(template).toHaveValue('tpl_mock_editorial')
  })

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
    await screen.getByRole('link', { name: /结束面试并查看分析/u }).click()

    await expect.element(screen.getByRole('heading', { name: '面试分析' })).toBeVisible()
    await expect.element(screen.getByRole('img', { name: '面试能力维度评分' })).toBeVisible()
  })
})
