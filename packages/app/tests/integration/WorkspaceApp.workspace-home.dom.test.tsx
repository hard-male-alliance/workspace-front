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
 * @brief 使用指定简历卡片渲染工作台 / Render the workspace with the provided Resume cards.
 * @param cards 服务端权威简历卡片 / Authoritative Resume cards from the service.
 * @return 渲染完成 Promise / Promise fulfilled after rendering starts.
 */
async function renderHomeWithResumeCards(
  cards: Awaited<ReturnType<InMemoryResumeGateway['listResumeCards']>>
): Promise<void> {
  await setWorkspaceAppTestLocale('zh-SG')
  /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
  const resume = new InMemoryResumeGateway()
  vi.spyOn(resume, 'listResumeCards').mockResolvedValue(cards)

  render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/" />)
}

/** @brief 工作区首页简历导航用户行为 / Workspace-home Resume navigation behaviours. */
describe('WorkspaceApp workspace-home Resume navigation', (): void => {
  it('links both continue actions to the most recently updated real Resume', async (): Promise<void> => {
    await renderHomeWithResumeCards([
      {
        id: asUiOpaqueId<'resume'>('res_backend_older'),
        revision: 2,
        templateName: 'Dawn',
        title: '旧简历',
        updatedAt: '2026-07-18T00:00:00.000Z'
      },
      {
        id: asUiOpaqueId<'resume'>('res_backend_latest'),
        revision: 5,
        templateName: 'Focus',
        title: '后端最新简历',
        updatedAt: '2026-07-19T00:00:00.000Z'
      }
    ])

    const links = await screen.findAllByRole('link', { name: /继续编辑简历|后端最新简历/u })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/resumes/res_backend_latest/edit')
    }
  })

  it('renders an honest empty state without a fabricated Resume link', async (): Promise<void> => {
    await renderHomeWithResumeCards([])

    expect(await screen.findByRole('heading', { name: '还没有可编辑的简历' })).toBeInTheDocument()
    expect(
      screen.getByText('当前工作区还没有简历。创建功能开放前，你可以先查看其他内容。')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '继续编辑简历' })).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="res_mock"]')).not.toBeInTheDocument()
    expect(screen.getByText('数据来自当前工作区，操作结果以服务端确认为准。')).toBeInTheDocument()
    expect(screen.getAllByText('Klee 的职业实验室')).toHaveLength(2)
    expect(screen.getByText('最近更新')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/Mock|Demo|演示工作区|本地工作区/u)
    expect(document.body).not.toHaveTextContent(/后端|创建协议/u)
  })

  it('uses a stable Resume entry route in the application navigation', async (): Promise<void> => {
    await renderHomeWithResumeCards([])

    expect(await screen.findByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
  })

  it('resolves the stable Resume entry route to the latest Resume editor', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 简历编辑器读取监视器 / Resume-editor read spy. */
    const getResumeEditor = vi.spyOn(resume, 'getResumeEditor')

    render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/resumes" />)

    await vi.waitFor((): void => {
      expect(getResumeEditor).toHaveBeenCalledWith(asUiOpaqueId<'resume'>('res_mock_ai_platform'))
    })
  })

  it('keeps the empty Resume entry honest and returns to the workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listResumeCards').mockResolvedValue([])

    render(<WorkspaceApp gateways={createTestGateways({ resume })} initialPath="/resumes" />)

    expect(await screen.findByRole('heading', { name: '还没有可编辑的简历' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/')
    expect(document.body).not.toHaveTextContent(/后端|创建协议/u)
  })
})
