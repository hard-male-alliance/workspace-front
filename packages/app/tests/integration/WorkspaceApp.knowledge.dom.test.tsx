import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HttpCommandOutcomeUnknownError } from '@ai-job-workspace/app/http'
import {
  InMemoryKnowledgeGateway,
  MOCK_BLOG_KNOWLEDGE_SOURCE_ID,
  MOCK_GIT_KNOWLEDGE_SOURCE_ID
} from '@ai-job-workspace/app/testing'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  navigateWorkspaceApp,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 知识库用户行为测试 / Knowledge-workflow user-behaviour tests. */
describe('WorkspaceApp knowledge workflow', (): void => {
  it('drops source-local drafts while switching to another authoritative source', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的知识 Gateway / Knowledge Gateway owned by the current test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 原始内存读取绑定 / Bound original in-memory read. */
    const readVisibility = knowledge.getKnowledgeVisibility.bind(knowledge)
    /** @brief A 来源权威策略 / Authoritative policy for source A. */
    const visibilityA = await readVisibility(MOCK_GIT_KNOWLEDGE_SOURCE_ID)
    /** @brief B 来源权威策略 / Authoritative policy for source B. */
    const visibilityB = await readVisibility(MOCK_BLOG_KNOWLEDGE_SOURCE_ID)
    /** @brief 兑现 B 来源读取的函数 / Resolver for the source B read. */
    let resolveVisibilityB: ((model: typeof visibilityB) => void) | undefined
    /** @brief 保持 B 来源读取待定的 Promise / Promise keeping the source B read pending. */
    const pendingVisibilityB = new Promise<typeof visibilityB>((resolve): void => {
      resolveVisibilityB = resolve
    })
    vi.spyOn(knowledge, 'getKnowledgeVisibility').mockImplementation((sourceId) => {
      if (sourceId === MOCK_GIT_KNOWLEDGE_SOURCE_ID) return Promise.resolve(visibilityA)
      if (sourceId === MOCK_BLOG_KNOWLEDGE_SOURCE_ID) return pendingVisibilityB
      return Promise.reject(new Error('Unexpected knowledge-source ID.'))
    })
    window.history.replaceState(null, '', `/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/visibility`)

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} />)
    await screen.findByRole('heading', { name: 'Agent 可见性' })
    /** @brief A 来源尚未提交的本地开关草稿 / Unsaved source-A toggle draft. */
    const sourceAToggle = screen.getByRole('switch', { name: '允许会话级选择' })
    fireEvent.click(sourceAToggle)
    expect(sourceAToggle).toHaveAttribute('aria-checked', 'false')

    navigateWorkspaceApp(`/knowledge/${MOCK_BLOG_KNOWLEDGE_SOURCE_ID}/visibility`)

    expect(screen.getByText('正在加载知识可见性…')).toBeInTheDocument()
    expect(screen.queryByText('portfolio-engineering')).not.toBeInTheDocument()

    await act(async (): Promise<void> => {
      resolveVisibilityB?.(visibilityB)
      await pendingVisibilityB
    })

    expect((await screen.findAllByText('技术博客')).length).toBeGreaterThan(0)
    expect(screen.getByRole('switch', { name: '允许会话级选择' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

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

    fireEvent.change(screen.getByRole('searchbox', { name: '筛选知识来源' }), {
      target: { value: 'definitely-missing-source' }
    })
    expect(screen.getByRole('heading', { name: '没有匹配结果' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByRole('searchbox', { name: '筛选知识来源' })).toHaveValue('')
    expect(screen.getByRole('heading', { level: 3, name: 'portfolio-engineering' })).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 3, name: 'AI 平台工程师 · 中文简历' })
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: '没有匹配结果' })).not.toBeInTheDocument()
  })

  it('does not expose upload or search actions before their response contracts are frozen', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    render(<WorkspaceApp initialPath="/knowledge" />)

    await screen.findByRole('heading', { name: 'Personal memory & knowledge' })
    expect(screen.getByRole('button', { name: 'Add source' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Add source' })).toHaveAccessibleDescription(
      'Adding knowledge sources is being prepared; file upload is not available yet.'
    )
    expect(
      screen.getByText(
        'Knowledge search is being prepared. For now, you can browse the existing sources.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search knowledge' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Knowledge file')).not.toBeInTheDocument()
  })

  it('distinguishes an empty source collection from a filter with no matches', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 返回空权威集合的知识 Gateway / Knowledge gateway returning an empty authoritative collection. */
    const knowledge = new InMemoryKnowledgeGateway()
    vi.spyOn(knowledge, 'listKnowledgeSources').mockResolvedValue([])

    render(<WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge" />)

    expect(
      await screen.findByRole('heading', { name: 'No knowledge sources yet' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'This workspace has no material to browse yet. You can upload it here once adding sources is available.'
      )
    ).toBeInTheDocument()
    /** @brief 页头与空状态中均可发现但不会伪造动作的入口 / Discoverable entries in both the header and empty state that never fabricate an action. */
    const unavailableAddSourceButtons = screen.getAllByRole('button', { name: 'Add source' })
    expect(unavailableAddSourceButtons).toHaveLength(2)
    for (const button of unavailableAddSourceButtons) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription(
        'Adding knowledge sources is being prepared; file upload is not available yet.'
      )
    }
    expect(screen.queryByText('No knowledge sources match this filter.')).not.toBeInTheDocument()
  })

  it('localizes visibility policy enums instead of rendering transport values', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/knowledge/ks_mock_git/visibility" />)

    await screen.findByRole('heading', { name: 'Agent 可见性' })
    expect(screen.getByText('权限概览')).toBeInTheDocument()
    expect(screen.getByText('机密')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(screen.getByText('私有部署')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '授权如何生效' })).toBeInTheDocument()
    expect(screen.queryByText('confidential')).not.toBeInTheDocument()
    expect(screen.queryByText('private_deployment')).not.toBeInTheDocument()
    expect(screen.queryByText(/PATCH|EffectiveAccess/u)).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(updateVisibility).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/本地演示/u)).not.toBeInTheDocument()
  })

  it('可见性写入结果未知时先读取权威策略并保留本地开关草稿', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回未知写结果的知识 Gateway / Knowledge gateway returning an unknown write outcome. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 只发送一次的可见性写命令 / Visibility command sent exactly once. */
    const update = vi
      .spyOn(knowledge, 'updateKnowledgeVisibility')
      .mockRejectedValue(new HttpCommandOutcomeUnknownError('network'))
    /** @brief 初始与恢复阶段的权威读取 / Authoritative reads during initial load and recovery. */
    const reload = vi.spyOn(knowledge, 'getKnowledgeVisibility')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath="/knowledge/ks_mock_git/visibility"
      />
    )
    await screen.findByRole('heading', { name: 'Agent 可见性' })
    /** @brief 用户当前未确认的本地开关草稿 / User's current unconfirmed local switch draft. */
    const sessionOverride = screen.getByRole('switch', { name: '允许会话级选择' })
    fireEvent.click(sessionOverride)
    expect(sessionOverride).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(sessionOverride).toBeDisabled()
    expect(screen.getByRole('switch', { name: '允许外部模型处理' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新加载最新数据' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
    expect(sessionOverride).toHaveAttribute('aria-checked', 'false')
    await vi.waitFor((): void => {
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
    })
  })

  it('未知结果的策略已由服务端应用时吸收权威值且不重复提交', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 模拟服务端先提交成功、响应后丢失的 Knowledge Gateway / Knowledge gateway simulating commit-before-response-loss. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 未被 spy 包装的真实内存更新 / Original in-memory update outside the spy wrapper. */
    const applyUpdate = knowledge.updateKnowledgeVisibility.bind(knowledge)
    /** @brief 允许测试观察保存中冻结状态的响应闸门 / Response gate allowing the test to observe the saving lock. */
    let releaseResponse = (): void => {
      throw new Error('The response gate was released before initialization.')
    }
    /** @brief 写响应保持待定的 Promise / Promise keeping the write response pending. */
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    /** @brief 已应用但最终报告未知结果的策略更新 / Policy update applied before reporting an unknown outcome. */
    const update = vi
      .spyOn(knowledge, 'updateKnowledgeVisibility')
      .mockImplementationOnce(async (input) => {
        await applyUpdate(input)
        await responseGate
        throw new HttpCommandOutcomeUnknownError('network')
      })
    /** @brief 初始与恢复阶段的权威读取 / Authoritative reads during initial load and recovery. */
    const reload = vi.spyOn(knowledge, 'getKnowledgeVisibility')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath="/knowledge/ks_mock_git/visibility"
      />
    )
    await screen.findByRole('heading', { name: 'Agent 可见性' })
    /** @brief 待提交的会话选择开关 / Session-selection switch being submitted. */
    const sessionOverride = screen.getByRole('switch', { name: '允许会话级选择' })
    /** @brief 未参与本次提交但同样必须冻结的外部模型开关 / External-model switch not edited but still required to freeze. */
    const externalModel = screen.getByRole('switch', { name: '允许外部模型处理' })
    fireEvent.click(sessionOverride)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(sessionOverride).toBeDisabled()
    expect(externalModel).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    fireEvent.click(externalModel)
    expect(externalModel).toHaveAttribute('aria-checked', 'false')

    releaseResponse()
    expect(await screen.findByRole('alert')).toHaveTextContent('请先重新加载权威数据')
    fireEvent.click(screen.getByRole('button', { name: '重新加载最新数据' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('可见性策略已保存')).toBeInTheDocument()
    expect(sessionOverride).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
