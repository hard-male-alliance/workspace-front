import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 待验收路由与标题 / Acceptance routes and headings. */
const routeCases: readonly { readonly path: string; readonly heading: string }[] = [
  { path: '/resumes/res_mock_ai_platform/template', heading: '模板与版式' },
  { path: '/interviews/int_mock_system_design', heading: '模拟面试进行中' },
  { path: '/interviews/int_mock_system_design/summary', heading: '面试分析' },
  { path: '/knowledge', heading: '个人记忆与知识库' },
  { path: '/knowledge/ks_mock_git/visibility', heading: 'Agent 可见性' }
]

/** @brief 所有可见性卡片会链接到的来源 ID / Source IDs linked from visibility cards. */
const sourceIds = ['ks_mock_resume', 'ks_mock_git', 'ks_mock_blog', 'ks_mock_file'] as const

/** @brief 并行套件中懒加载路由的最大装配时间 / Maximum lazy-route composition time in the parallel suite. */
const routeCompositionTimeout = 5_000

/** @brief 应用级路由可达性测试 / Application-level route reachability tests. */
describe('WorkspaceApp routing', (): void => {
  it.each(routeCases)(
    'renders $path as the $heading route',
    async ({ heading, path }): Promise<void> => {
      await setWorkspaceAppTestLocale('zh-SG')

      render(<WorkspaceApp initialPath={path} />)

      expect(
        await screen.findByRole('heading', { name: heading }, { timeout: routeCompositionTimeout })
      ).toBeInTheDocument()
    }
  )

  it.each(sourceIds)(
    'keeps the Mock knowledge-source visibility route for %s reachable',
    async (sourceId): Promise<void> => {
      await setWorkspaceAppTestLocale('zh-SG')

      render(<WorkspaceApp initialPath={`/knowledge/${sourceId}/visibility`} />)
      expect(
        await screen.findByRole(
          'heading',
          { name: 'Agent 可见性' },
          { timeout: routeCompositionTimeout }
        )
      ).toBeInTheDocument()
    }
  )

  it.each(['/resumes/unknown/path', '/interviews/unknown/path', '/knowledge/unknown/path'])(
    '将域内未知路由 %s 退回工作区首页',
    async (initialPath): Promise<void> => {
      await setWorkspaceAppTestLocale('zh-SG')

      render(<WorkspaceApp initialPath={initialPath} />)

      expect(
        await screen.findByRole(
          'heading',
          { name: '今日工作台' },
          { timeout: routeCompositionTimeout }
        )
      ).toBeInTheDocument()
    }
  )
})
