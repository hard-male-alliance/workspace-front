import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryResumeGateway } from '@ai-job-workspace/app/testing'

import { asUiOpaqueId } from '../../src/shared-kernel/identity'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/**
 * @brief 使用指定 ResumeSummary 渲染工作台 / Render the workspace with the provided Resume summaries.
 * @param summaries 服务端权威 ResumeSummary / Authoritative Resume summaries from the service.
 * @return 渲染完成 Promise / Promise fulfilled after rendering starts.
 */
async function renderHomeWithResumeSummaries(
  summaries: Awaited<ReturnType<InMemoryResumeGateway['listResumeSummariesPage']>>['items']
): Promise<void> {
  await setWorkspaceAppTestLocale('zh-SG')
  /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
  const resume = new InMemoryResumeGateway()
  vi.spyOn(resume, 'listResumeSummariesPage').mockResolvedValue({
    hasMore: false,
    items: summaries,
    nextCursor: null
  })

  render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/" />)
}

/** @brief 工作区首页简历导航用户行为 / Workspace-home Resume navigation behaviours. */
describe('WorkspaceApp workspace-home Resume navigation', (): void => {
  it('links both continue actions to the most recently updated real Resume', async (): Promise<void> => {
    await renderHomeWithResumeSummaries([
      {
        createdAt: '2026-07-01T00:00:00.000Z',
        id: asUiOpaqueId<'resume'>('res_backend_older'),
        locale: 'zh-SG',
        revision: 2,
        templateId: asUiOpaqueId<'template'>('tpl_dawn'),
        templateVersion: '1.0.0',
        title: '旧简历',
        updatedAt: '2026-07-18T00:00:00.000Z',
        workspaceId: asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')
      },
      {
        createdAt: '2026-07-02T00:00:00.000Z',
        id: asUiOpaqueId<'resume'>('res_backend_latest'),
        locale: 'zh-SG',
        revision: 5,
        templateId: asUiOpaqueId<'template'>('tpl_focus'),
        templateVersion: '2.0.0',
        title: '后端最新简历',
        updatedAt: '2026-07-19T00:00:00.000Z',
        workspaceId: asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')
      }
    ])

    const links = await screen.findAllByRole('link', { name: /继续编辑简历|后端最新简历/u })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/resumes/res_backend_latest/edit')
    }
  })

  it('renders an honest empty state without a fabricated Resume link', async (): Promise<void> => {
    await renderHomeWithResumeSummaries([])

    expect(await screen.findByRole('heading', { name: '还没有可编辑的简历' })).toBeInTheDocument()
    expect(
      screen.getByText('当前工作区还没有简历。创建功能开放前，你可以先查看其他内容。')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '继续编辑简历' })).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="res_mock"]')).not.toBeInTheDocument()
    expect(screen.getByText('数据来自当前工作区，操作结果以服务端确认为准。')).toBeInTheDocument()
    expect(screen.getAllByText('Klee 的职业实验室').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('最近更新')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/Mock|Demo|演示工作区|本地工作区/u)
    expect(document.body).not.toHaveTextContent(/后端|创建协议/u)
  })

  it('uses a stable Resume entry route in the application navigation', async (): Promise<void> => {
    await renderHomeWithResumeSummaries([])

    expect(await screen.findByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
  })

  it('resolves the stable Resume entry route to the API v2 Resume library', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief ResumeSummary 首页读取监视器 / ResumeSummary first-page read spy. */
    const listResumeSummariesPage = vi.spyOn(resume, 'listResumeSummariesPage')

    render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/resumes" />)

    expect(await screen.findByRole('heading', { name: '简历库' })).toBeInTheDocument()
    expect(listResumeSummariesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: null,
        workspaceId: asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')
      })
    )
  })

  it('keeps the empty Resume entry honest and returns to the workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listResumeSummariesPage').mockResolvedValue({
      hasMore: false,
      items: [],
      nextCursor: null
    })

    render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/resumes" />)

    expect(await screen.findByRole('heading', { name: '还没有简历' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '返回工作台' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/后端|创建协议/u)
  })
})
