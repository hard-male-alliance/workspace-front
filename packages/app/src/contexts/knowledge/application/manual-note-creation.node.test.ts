/** @file 手工笔记 KnowledgeSource 创建恢复测试 / Manual-note KnowledgeSource creation-recovery tests. */

import {
  ApiV2ProblemError,
  ApiV2WriteOutcomeUnknownError,
  type ProblemDetails
} from '@ai-job-workspace/product-api-v2'
import { describe, expect, it, vi } from 'vitest'

import { asUiPrincipalSubject } from '../../identity'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import type { UiKnowledgeSourceAuthority, UiKnowledgeVisibilityPolicy } from '../domain/models'
import type { KnowledgeGateway } from './gateway'
import {
  createKnowledgeManualNoteCreationProcess,
  KnowledgeManualNoteCreationProcessError,
  type UiKnowledgeCreationScope,
  type UiManualKnowledgeNoteDraft
} from './manual-note-creation'

/** @brief 测试 Workspace / Workspace used by tests. */
const WORKSPACE_ID = asUiOpaqueId<'workspace'>('workspace_knowledge_creation_test')

/** @brief 测试 principal 与 Workspace scope / Principal-and-Workspace scope used by tests. */
const SCOPE: UiKnowledgeCreationScope = {
  principalSubject: asUiPrincipalSubject('principal-klee'),
  workspaceId: WORKSPACE_ID
}

/** @brief 测试安全策略 / Safe policy used by tests. */
const VISIBILITY: UiKnowledgeVisibilityPolicy = {
  agentGrants: [
    {
      agentScope: 'resume_assistant',
      allowedOperations: ['retrieve', 'summarize'],
      effect: 'allow'
    },
    {
      agentScope: 'resume_assistant',
      allowedOperations: ['quote'],
      effect: 'deny'
    }
  ],
  allowExternalModelProcessing: false,
  allowedModelRegions: ['cn'],
  defaultEffect: 'deny',
  policyVersion: 1,
  retentionDays: 365,
  sensitivity: 'confidential',
  sessionOverrideAllowed: false
}

/** @brief 测试手工笔记草稿 / Manual-note draft used by tests. */
const DRAFT: UiManualKnowledgeNoteDraft = {
  content: 'Safety preserves invariants across uncertain delivery outcomes.',
  name: 'Runtime safety notes',
  visibility: VISIBILITY
}

/** @brief 对测试不重要的已确认权威 / Confirmed authority whose content is irrelevant to these tests. */
const CONFIRMED_AUTHORITY = Object.freeze({}) as UiKnowledgeSourceAuthority

/**
 * @brief 构造结构化 API v2 Problem / Build a structured API v2 Problem.
 * @param code 稳定 Problem code / Stable Problem code.
 * @param status HTTP 状态 / HTTP status.
 * @return 完整 ProblemDetails / Complete ProblemDetails.
 */
function problem(code: string, status: number): ProblemDetails {
  return {
    code,
    detail: 'private server detail',
    errors: [],
    extensions: null,
    instance: null,
    request_id: 'request_knowledge_12345678',
    retryable: code === 'idempotency.in_progress',
    status,
    title: 'private server title',
    type: 'https://api.example.test/problems/knowledge'
  }
}

/**
 * @brief 构造仅精确模拟创建与列表的 Knowledge port / Build a Knowledge port simulating only creation and listing.
 * @param create 创建方法实现 / Creation-method implementation.
 * @param list 列表方法实现 / List-method implementation.
 * @return 完整静态类型的测试端口 / Test port satisfying the complete static type.
 */
function gateway(
  create: KnowledgeGateway['createManualKnowledgeNote'],
  list: KnowledgeGateway['listKnowledgeSourcePage'] = vi.fn().mockResolvedValue({
    hasMore: false,
    items: [],
    nextCursor: null
  })
): KnowledgeGateway {
  return {
    createManualKnowledgeNote: create,
    getKnowledgeSource: vi.fn(),
    listKnowledgeSourcePage: list,
    updateKnowledgeSource: vi.fn()
  }
}

describe('createKnowledgeManualNoteCreationProcess', (): void => {
  it('replays the exact command identity and payload after an unknown outcome', async (): Promise<void> => {
    /** @brief 两次 dispatch 的可观察创建端口 / Observable creation port for two dispatches. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValueOnce(new ApiV2WriteOutcomeUnknownError('network'))
      .mockResolvedValueOnce(CONFIRMED_AUTHORITY)
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create))

    await expect(process.create(SCOPE, DRAFT)).rejects.toMatchObject({
      name: 'ApiV2WriteOutcomeUnknownError'
    })
    expect(process.getPending(SCOPE)).toMatchObject({ mode: 'exact-replay' })

    await expect(process.confirm(SCOPE)).resolves.toBe(CONFIRMED_AUTHORITY)
    expect(create).toHaveBeenCalledTimes(2)
    /** @brief 首次发送命令 / First dispatched command. */
    const first = create.mock.calls[0]?.[0]
    /** @brief 精确确认命令 / Exact confirmation command. */
    const confirmation = create.mock.calls[1]?.[0]
    expect(confirmation?.commandId).toBe(first?.commandId)
    expect(confirmation?.workspaceId).toBe(first?.workspaceId)
    expect(confirmation?.name).toBe(first?.name)
    expect(confirmation?.content).toBe(first?.content)
    expect(confirmation?.visibility).toEqual(first?.visibility)
    expect(process.getPending(SCOPE)).toBeNull()
  })

  it('honours Retry-After before confirming an in-progress command', async (): Promise<void> => {
    /** @brief 可控 epoch 毫秒时钟 / Controllable epoch-millisecond clock. */
    let now = 10_000
    /** @brief 首次返回 in-progress、随后确认成功的端口 / Port returning in-progress before a successful confirmation. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValueOnce(new ApiV2ProblemError(problem('idempotency.in_progress', 409), 5_000))
      .mockResolvedValueOnce(CONFIRMED_AUTHORITY)
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create), () => now)

    await expect(process.create(SCOPE, DRAFT)).rejects.toMatchObject({
      name: 'ApiV2ProblemError'
    })
    expect(process.getPending(SCOPE)).toMatchObject({
      confirmAfterMilliseconds: 15_000,
      mode: 'exact-replay',
      referenceId: 'request_knowledge_12345678'
    })
    await expect(process.confirm(SCOPE)).rejects.toEqual(
      new KnowledgeManualNoteCreationProcessError('confirmation-cooldown-active')
    )
    expect(create).toHaveBeenCalledTimes(1)

    now = 15_000
    await expect(process.confirm(SCOPE)).resolves.toBe(CONFIRMED_AUTHORITY)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it.each([
    [new ApiV2ProblemError(problem('idempotency.key_reused', 409), null), 'idempotency-key-reused'],
    [
      new ApiV2WriteOutcomeUnknownError('contract', 201, null, 'request_knowledge_12345678'),
      'invalid-success-response'
    ]
  ] as const)(
    'forbids replay after an unreplayable response',
    async (failure, reason): Promise<void> => {
      /** @brief 返回不可重放错误的创建端口 / Creation port returning an unreplayable failure. */
      const create = vi
        .fn<KnowledgeGateway['createManualKnowledgeNote']>()
        .mockRejectedValue(failure)
      /** @brief 被测创建流程 / Creation process under test. */
      const process = createKnowledgeManualNoteCreationProcess(gateway(create))

      await expect(process.create(SCOPE, DRAFT)).rejects.toBe(failure)
      expect(process.getPending(SCOPE)).toMatchObject({
        mode: 'authority-review',
        reason
      })
      await expect(process.confirm(SCOPE)).rejects.toEqual(
        new KnowledgeManualNoteCreationProcessError('replay-forbidden')
      )
      expect(create).toHaveBeenCalledOnce()
    }
  )

  it('keeps the frozen command when abandon authority reading fails', async (): Promise<void> => {
    /** @brief 结果未知的创建端口 / Creation port with an unknown result. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValue(new ApiV2WriteOutcomeUnknownError('timeout'))
    /** @brief 失败的权威列表读取 / Failed authoritative-list read. */
    const list = vi
      .fn<KnowledgeGateway['listKnowledgeSourcePage']>()
      .mockRejectedValue(new TypeError('private network failure'))
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create, list))

    await expect(process.create(SCOPE, DRAFT)).rejects.toMatchObject({
      name: 'ApiV2WriteOutcomeUnknownError'
    })
    /** @brief 放弃前的唯一冻结 command ID / Sole frozen command ID before abandonment. */
    const commandId = process.getPending(SCOPE)?.command.commandId
    await expect(
      process.abandonAfterAuthorityRead(SCOPE, new AbortController().signal)
    ).rejects.toBeInstanceOf(TypeError)
    expect(process.getPending(SCOPE)?.command.commandId).toBe(commandId)
  })

  it('clears the old key only after a successful first-page authority read', async (): Promise<void> => {
    /** @brief 结果未知的创建端口 / Creation port with an unknown result. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValue(new ApiV2WriteOutcomeUnknownError('server', 503))
    /** @brief 成功的权威列表读取 / Successful authoritative-list read. */
    const list = vi.fn<KnowledgeGateway['listKnowledgeSourcePage']>().mockResolvedValue({
      hasMore: false,
      items: [],
      nextCursor: null
    })
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create, list))

    await expect(process.create(SCOPE, DRAFT)).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
    await expect(
      process.abandonAfterAuthorityRead(SCOPE, new AbortController().signal)
    ).resolves.toMatchObject({ items: [] })
    expect(list).toHaveBeenCalledOnce()
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      cursor: null,
      limit: 50,
      workspaceId: WORKSPACE_ID
    })
    expect(list.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal)
    expect(process.getPending(SCOPE)).toBeNull()
  })

  it('retires a definitively rejected key while allowing a later new intent', async (): Promise<void> => {
    /** @brief 先明确拒绝、再成功的创建端口 / Creation port rejecting definitively before succeeding. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValueOnce(new ApiV2ProblemError(problem('knowledge.invalid_input', 422), null))
      .mockResolvedValueOnce(CONFIRMED_AUTHORITY)
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create))

    await expect(process.create(SCOPE, DRAFT)).rejects.toMatchObject({
      name: 'ApiV2ProblemError'
    })
    expect(process.getPending(SCOPE)).toBeNull()
    await expect(process.create(SCOPE, DRAFT)).resolves.toBe(CONFIRMED_AUTHORITY)
    expect(create.mock.calls[1]?.[0].commandId).not.toBe(create.mock.calls[0]?.[0].commandId)
  })

  it('clears sensitive pending content when the principal changes', async (): Promise<void> => {
    /** @brief 永远报告结果未知的创建端口 / Creation port always reporting an unknown result. */
    const create = vi
      .fn<KnowledgeGateway['createManualKnowledgeNote']>()
      .mockRejectedValue(new ApiV2WriteOutcomeUnknownError('network'))
    /** @brief 被测创建流程 / Creation process under test. */
    const process = createKnowledgeManualNoteCreationProcess(gateway(create))

    await expect(process.create(SCOPE, DRAFT)).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
    expect(process.getPending(SCOPE)?.command.content).toBe(DRAFT.content)

    /** @brief 新 principal 的相同 Workspace scope / Same Workspace scope for a new principal. */
    const otherPrincipalScope: UiKnowledgeCreationScope = {
      ...SCOPE,
      principalSubject: asUiPrincipalSubject('principal-alice')
    }
    expect(process.getPending(otherPrincipalScope)).toBeNull()
    expect(process.getPending(SCOPE)).toBeNull()
  })
})
