import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  MOCK_BLOG_KNOWLEDGE_SOURCE_ID,
  MOCK_FILE_KNOWLEDGE_SOURCE_ID,
  MOCK_GIT_KNOWLEDGE_SOURCE_ID,
  MOCK_RESUME_KNOWLEDGE_SOURCE_ID
} from '@ai-job-workspace/app/testing'
import {
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 待验收路由与标题 / Acceptance routes and headings. */
const routeCases: readonly { readonly path: string; readonly heading: string }[] = [
  { path: '/resumes/res_mock_ai_platform/template', heading: '模板与版式' },
  { path: '/interviews/int_mock_system_design', heading: 'AI Platform Engineer' },
  { path: '/knowledge', heading: '知识来源' },
  { path: '/knowledge/new', heading: '新建手工笔记来源' },
  { path: `/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}`, heading: 'portfolio-engineering' },
  { path: `/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/edit`, heading: '编辑知识来源' }
]

/** @brief 所有 fixture 详情都应可达的来源 ID / Source IDs whose fixture details must be reachable. */
const sourceIds = [
  MOCK_RESUME_KNOWLEDGE_SOURCE_ID,
  MOCK_GIT_KNOWLEDGE_SOURCE_ID,
  MOCK_BLOG_KNOWLEDGE_SOURCE_ID,
  MOCK_FILE_KNOWLEDGE_SOURCE_ID
] as const

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
        await screen.findByRole(
          'heading',
          { level: 1, name: heading },
          { timeout: routeCompositionTimeout }
        )
      ).toBeInTheDocument()
    }
  )

  it.each(sourceIds)(
    'keeps the API v2 knowledge-source detail route for %s reachable',
    async (sourceId): Promise<void> => {
      await setWorkspaceAppTestLocale('zh-SG')

      render(<WorkspaceApp initialPath={`/knowledge/${sourceId}`} />)
      expect(
        await screen.findByRole(
          'link',
          { name: '编辑名称与策略' },
          {
            timeout: routeCompositionTimeout
          }
        )
      ).toBeInTheDocument()
    }
  )

  it.each([
    '/resumes/unknown/path',
    '/interviews/unknown/path',
    '/interviews/int_mock_system_design/summary',
    '/knowledge/unknown/path'
  ])('将域内未知路由 %s 退回工作区首页', async (initialPath): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath={initialPath} />)

    expect(
      await screen.findByRole(
        'heading',
        { name: '今日工作台' },
        { timeout: routeCompositionTimeout }
      )
    ).toBeInTheDocument()
  })
})
