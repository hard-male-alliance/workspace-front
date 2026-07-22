import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InMemoryKnowledgeGateway } from '@ai-job-workspace/app/testing'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 知识库用户行为测试 / Knowledge-workflow user-behaviour tests. */
describe('WorkspaceApp knowledge workflow', (): void => {
  it('filters authoritative sources and renders the selected source policy', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 权威来源读取监视器 / Authoritative-source read spy. */
    const listSources = vi.spyOn(knowledge, 'listKnowledgeSources')

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)

    await screen.findByRole('heading', { name: '个人记忆与知识库' })
    expect(screen.getByRole('heading', { name: '来源详情' })).toBeInTheDocument()
    expect(screen.getByText('默认策略')).toBeInTheDocument()
    expect(screen.getByText('外部模型处理')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重新加载来源' }))
    await vi.waitFor((): void => expect(listSources).toHaveBeenCalledTimes(2))

    fireEvent.change(screen.getByRole('searchbox', { name: '筛选知识来源' }), {
      target: { value: 'portfolio-engineering' }
    })

    expect(screen.getAllByText('portfolio-engineering')).toHaveLength(2)
    expect(screen.queryByText('AI 平台工程师 · 中文简历')).not.toBeInTheDocument()
  })

  it('does not expose upload or search actions before their response contracts are frozen', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    render(<WorkspaceApp initialPath="/knowledge" />)

    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    expect(screen.getByRole('button', { name: 'Add source' })).toBeDisabled()
    expect(
      screen.getByText('Knowledge search will be enabled after its response contract is confirmed.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search knowledge' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Knowledge file')).not.toBeInTheDocument()
  })

  it('localizes visibility policy enums instead of rendering transport values', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/knowledge/ks_mock_git/visibility" />)

    await screen.findByRole('heading', { name: 'Agent 可见性' })
    expect(screen.getByText('权限概览')).toBeInTheDocument()
    expect(screen.getByText('机密')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(screen.getByText('私有部署')).toBeInTheDocument()
    expect(screen.queryByText('confidential')).not.toBeInTheDocument()
    expect(screen.queryByText('private_deployment')).not.toBeInTheDocument()
  })

  it('persists visibility settings through the gateway instead of reporting a local save', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 可见性更新命令监视器 / Visibility-update command spy. */
    const updateVisibility = vi.spyOn(knowledge, 'updateKnowledgeVisibility')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath="/knowledge/ks_mock_git/visibility"
      />
    )
    await screen.findByRole('heading', { name: 'Agent 可见性' })

    fireEvent.click(screen.getByRole('switch', { name: '允许会话级选择' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor((): void => expect(updateVisibility).toHaveBeenCalledOnce())
    /** @brief 交给 Gateway 的策略更新 / Policy update passed to the gateway. */
    const update = updateVisibility.mock.calls[0]?.[0]
    expect(update?.sourceId).toBe('ks_mock_git')
    expect(update?.visibility.sessionOverrideAllowed).toBe(false)
    expect(await screen.findByText('可见性策略已保存')).toBeInTheDocument()
    expect(screen.queryByText(/本地演示/u)).not.toBeInTheDocument()
  })
})
