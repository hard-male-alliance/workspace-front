/** @file API v2 Knowledge 产品旅程集成测试 / API v2 Knowledge product-journey integration tests. */

import { fireEvent, render, screen } from '@testing-library/react'
import {
  ApiV2ProblemError,
  ApiV2WriteOutcomeUnknownError,
  type ProblemDetails
} from '@ai-job-workspace/product-api-v2'
import { describe, expect, it, vi } from 'vitest'

import {
  InMemoryKnowledgeGateway,
  MOCK_DEFAULT_VISIBILITY_POLICY,
  MOCK_GIT_KNOWLEDGE_SOURCE_ID,
  MOCK_KNOWLEDGE_WORKSPACE_ID
} from '@ai-job-workspace/app/testing'
import type { UiKnowledgeVisibilityPolicy } from '@ai-job-workspace/app/application'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/**
 * @brief 构造结构化 API v2 Problem / Build a structured API v2 Problem.
 * @param code 稳定 Problem code / Stable Problem code.
 * @param status HTTP 状态 / HTTP status.
 * @return 完整 ProblemDetails / Complete ProblemDetails.
 */
function problem(code: string, status: number): ProblemDetails {
  return {
    code,
    detail: 'private backend detail',
    errors: [],
    extensions: null,
    instance: null,
    request_id: 'request_knowledge_dom_12345678',
    retryable: false,
    status,
    title: 'private backend title',
    type: 'https://api.example.test/problems/knowledge'
  }
}

/**
 * @brief 填写手工笔记创建页的最小有效内容 / Fill the minimum valid manual-note creation content.
 * @param name 来源名称 / Source name.
 * @param content 笔记正文 / Note body.
 */
function fillManualNote(name: string, content: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: '来源名称' }), {
    target: { value: name }
  })
  fireEvent.change(screen.getByRole('textbox', { name: '纯文本正文' }), {
    target: { value: content }
  })
}

/** @brief Knowledge API v2 用户行为测试 / Knowledge API v2 user-behaviour tests. */
describe('WorkspaceApp Knowledge API v2 workflow', (): void => {
  it('creates a manual note with the complete visible policy and opens authoritative detail', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 Knowledge gateway / Knowledge gateway owned by this test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 完整创建命令监视器 / Complete creation-command spy. */
    const create = vi.spyOn(knowledge, 'createManualKnowledgeNote')

    render(
      <WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge/new" />
    )
    await screen.findByRole('heading', { name: '新建手工笔记来源' })
    fillManualNote('Distributed systems notes', 'Safety and liveness are different properties.')
    fireEvent.click(screen.getByRole('button', { name: '创建手工笔记来源' }))

    await vi.waitFor((): void => expect(create).toHaveBeenCalledOnce())
    /** @brief 交给 API v2 adapter 的完整创建命令 / Complete creation command passed to the API v2 adapter. */
    const command = create.mock.calls[0]?.[0]
    expect(command).toMatchObject({
      content: 'Safety and liveness are different properties.',
      name: 'Distributed systems notes',
      visibility: {
        agentGrants: [],
        allowExternalModelProcessing: false,
        allowedModelRegions: ['cn'],
        defaultEffect: 'deny',
        policyVersion: 1,
        retentionDays: 365,
        sensitivity: 'confidential',
        sessionOverrideAllowed: false
      },
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })
    expect(command?.commandId).toMatch(/^command_/u)
    expect(await screen.findByRole('heading', { name: 'Distributed systems notes' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '尚未开始' })).toBeVisible()
    expect(
      screen.queryByText('Safety and liveness are different properties.')
    ).not.toBeInTheDocument()
  })

  it('locks an unknown creation and confirms it with the exact same key and payload', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提交后丢失一次响应的测试 gateway / Test gateway losing one response after commit. */
    const knowledge = new InMemoryKnowledgeGateway({ createOutcomeUnknownOnce: true })
    /** @brief 两次精确 dispatch 监视器 / Spy observing both exact dispatches. */
    const create = vi.spyOn(knowledge, 'createManualKnowledgeNote')

    render(
      <WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge/new" />
    )
    await screen.findByRole('heading', { name: '新建手工笔记来源' })
    fillManualNote('Idempotency notes', 'The same intent keeps the same key and body.')
    fireEvent.click(screen.getByRole('button', { name: '创建手工笔记来源' }))

    expect(await screen.findByRole('heading', { name: '上一次创建结果尚未确认' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '来源名称' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '纯文本正文' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '原样确认上次创建' }))

    await vi.waitFor((): void => expect(create).toHaveBeenCalledTimes(2))
    /** @brief 首次未知结果命令 / First command with unknown result. */
    const first = create.mock.calls[0]?.[0]
    /** @brief 原样确认命令 / Exact confirmation command. */
    const confirmation = create.mock.calls[1]?.[0]
    expect(confirmation?.commandId).toBe(first?.commandId)
    expect(confirmation?.workspaceId).toBe(first?.workspaceId)
    expect(confirmation?.name).toBe(first?.name)
    expect(confirmation?.content).toBe(first?.content)
    expect(confirmation?.visibility).toEqual(first?.visibility)
    expect(await screen.findByRole('heading', { name: 'Idempotency notes' })).toBeVisible()
  })

  it('forbids replay of an invalid success response and keeps the old key when rereading fails', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 不可重放成功响应的测试 gateway / Test gateway with an unreplayable success response. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 返回坏 2xx 语义的创建端口 / Creation port returning invalid 2xx semantics. */
    const create = vi
      .spyOn(knowledge, 'createManualKnowledgeNote')
      .mockRejectedValue(
        new ApiV2WriteOutcomeUnknownError('contract', 201, null, 'request_knowledge_dom_12345678')
      )
    /** @brief 放弃阶段失败的权威首页读取 / Authority first-page read failing during abandonment. */
    const list = vi
      .spyOn(knowledge, 'listKnowledgeSourcePage')
      .mockRejectedValueOnce(new TypeError('private network failure'))

    render(
      <WorkspaceApp gateways={createTestGateways({ knowledge })} initialPath="/knowledge/new" />
    )
    await screen.findByRole('heading', { name: '新建手工笔记来源' })
    fillManualNote('Uncertain note', 'The response cannot prove the final outcome.')
    fireEvent.click(screen.getByRole('button', { name: '创建手工笔记来源' }))

    expect(await screen.findByRole('heading', { name: '旧命令不能继续确认' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '原样确认上次创建' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放弃旧命令并重读来源' }))
    expect(screen.getByText(/服务器可能已经创建了该来源/u)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '确认重读并放弃旧 key' }))

    expect(await screen.findByText(/无法连接到服务/u)).toBeVisible()
    expect(screen.getByRole('heading', { name: '旧命令不能继续确认' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '来源名称' })).toBeDisabled()
    expect(create).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledOnce()
  })

  it('saves only the changed name with the strong ETag from authoritative GET', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 Knowledge gateway / Knowledge gateway owned by this test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 编辑页加载前的已知权威 / Known authority before the edit page loads. */
    const initial = await knowledge.getKnowledgeSource({
      signal: new AbortController().signal,
      sourceId: MOCK_GIT_KNOWLEDGE_SOURCE_ID,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })
    /** @brief 条件 PATCH 监视器 / Conditional PATCH spy. */
    const update = vi.spyOn(knowledge, 'updateKnowledgeSource')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath={`/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/edit`}
      />
    )
    await screen.findByRole('heading', { name: '编辑知识来源' })
    fireEvent.change(screen.getByRole('textbox', { name: '来源名称' }), {
      target: { value: 'portfolio-runtime-safety' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledOnce())
    expect(update).toHaveBeenCalledWith({
      concurrencyToken: initial.concurrencyToken,
      patch: { name: 'portfolio-runtime-safety' },
      sourceId: MOCK_GIT_KNOWLEDGE_SOURCE_ID,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })
    expect(await screen.findByText('来源设置已由服务端确认')).toBeVisible()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('absorbs an applied PATCH after an unknown response without sending it again', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 Knowledge gateway / Knowledge gateway owned by this test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 未被 spy 包装的真实内存更新 / Original in-memory update outside the spy. */
    const applyUpdate = knowledge.updateKnowledgeSource.bind(knowledge)
    /** @brief 先提交成功再报告未知结果的 PATCH / PATCH committed before reporting an unknown result. */
    const update = vi
      .spyOn(knowledge, 'updateKnowledgeSource')
      .mockImplementationOnce(async (command): Promise<never> => {
        await applyUpdate(command)
        throw new ApiV2WriteOutcomeUnknownError('network')
      })
    /** @brief 初始与恢复的单项 GET / Single-item GETs for initial load and recovery. */
    const get = vi.spyOn(knowledge, 'getKnowledgeSource')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath={`/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/edit`}
      />
    )
    await screen.findByRole('heading', { name: '编辑知识来源' })
    fireEvent.change(screen.getByRole('textbox', { name: '来源名称' }), {
      target: { value: 'authoritative-after-loss' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('heading', { name: '必须先读取最新权威来源' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '读取最新权威并恢复' }))

    expect(await screen.findByText('来源设置已由服务端确认')).toBeVisible()
    expect(update).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('textbox', { name: '来源名称' })).toHaveValue(
      'authoritative-after-loss'
    )
  })

  it('uses one safe retry when only an untouched field changed remotely', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 Knowledge gateway / Knowledge gateway owned by this test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 未被 spy 包装的真实内存更新 / Original in-memory update outside the spy. */
    const applyUpdate = knowledge.updateKnowledgeSource.bind(knowledge)
    /** @brief 远端仅变化的完整策略 / Complete policy changed only on the remote side. */
    const remoteVisibility: UiKnowledgeVisibilityPolicy = {
      ...MOCK_DEFAULT_VISIBILITY_POLICY,
      retentionDays: 730
    }
    /** @brief 首次模拟并发冲突，第二次接受新 ETag / First simulate a conflict, then accept the new ETag. */
    const update = vi
      .spyOn(knowledge, 'updateKnowledgeSource')
      .mockImplementationOnce(async (command): Promise<never> => {
        await applyUpdate({
          ...command,
          patch: { visibility: remoteVisibility }
        })
        throw new ApiV2ProblemError(problem('knowledge.revision_conflict', 412), null)
      })
      .mockImplementation(applyUpdate)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath={`/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/edit`}
      />
    )
    await screen.findByRole('heading', { name: '编辑知识来源' })
    fireEvent.change(screen.getByRole('textbox', { name: '来源名称' }), {
      target: { value: 'safe-retry-name' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('heading', { name: '必须先读取最新权威来源' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '读取最新权威并恢复' }))

    expect(await screen.findByText('来源设置已由服务端确认')).toBeVisible()
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1]?.[0].concurrencyToken).not.toBe(
      update.mock.calls[0]?.[0].concurrencyToken
    )
    expect(update.mock.calls[1]?.[0].patch).toEqual({ name: 'safe-retry-name' })
  })

  it('preserves the local draft when a touched field changed and requires explicit review', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享 Knowledge gateway / Knowledge gateway owned by this test. */
    const knowledge = new InMemoryKnowledgeGateway()
    /** @brief 未被 spy 包装的真实内存更新 / Original in-memory update outside the spy. */
    const applyUpdate = knowledge.updateKnowledgeSource.bind(knowledge)
    /** @brief 首次把同一名称字段改成远端值并报告 412 / First change the same name remotely and report 412. */
    const update = vi
      .spyOn(knowledge, 'updateKnowledgeSource')
      .mockImplementationOnce(async (command): Promise<never> => {
        await applyUpdate({ ...command, patch: { name: 'remote-name' } })
        throw new ApiV2ProblemError(problem('knowledge.revision_conflict', 412), null)
      })
      .mockImplementation(applyUpdate)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ knowledge })}
        initialPath={`/knowledge/${MOCK_GIT_KNOWLEDGE_SOURCE_ID}/edit`}
      />
    )
    await screen.findByRole('heading', { name: '编辑知识来源' })
    fireEvent.change(screen.getByRole('textbox', { name: '来源名称' }), {
      target: { value: 'local-name' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('heading', { name: '必须先读取最新权威来源' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '读取最新权威并恢复' }))

    expect(
      await screen.findByRole('heading', {
        name: '需要检查服务器版本与本地草稿'
      })
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: '来源名称' })).toHaveValue('local-name')
    expect(screen.getByRole('textbox', { name: '来源名称' })).toBeDisabled()
    expect(update).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '基于最新版本检查我的草稿' }))
    expect(screen.getByRole('textbox', { name: '来源名称' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '来源名称' })).toHaveValue('local-name')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('来源设置已由服务端确认')).toBeVisible()
    expect(update).toHaveBeenCalledTimes(2)
  })
})
