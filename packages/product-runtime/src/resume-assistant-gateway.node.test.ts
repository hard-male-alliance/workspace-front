/** @file 真实 Resume 助手运行时编排测试 / Real Resume-assistant runtime orchestration tests. */
/* eslint-disable @typescript-eslint/unbound-method -- Vitest spies intentionally inspect interface methods. */

import { describe, expect, it, vi } from 'vitest'

import {
  asUiOpaqueId,
  type KnowledgeGateway,
  type ResumeReviewPort,
  type UiKnowledgeSource,
  type UiResumeEditorModel,
  type UiResumeProposalAuthority
} from '@ai-job-workspace/app/application'
import type {
  AgentConversation,
  AgentMessage,
  AgentRun,
  ResumeAssistantAgentApi
} from '@ai-job-workspace/product-api-v2'

import { createApiV2ResumeAssistantGateway } from './resume-assistant-gateway'

const WORKSPACE_ID = 'workspace_01K0ASSISTANT000001'
const RESUME_ID = 'resume_01K0ASSISTANT00000001'
const CONVERSATION_ID = 'conversation_01K0ASSISTANT001'
const MESSAGE_ID = 'message_01K0ASSISTANT000001'
const RUN_ID = 'run_01K0ASSISTANT00000000001'
const PROPOSAL_ID = 'proposal_01K0ASSISTANT0000001'

function conversation(): AgentConversation {
  return {
    capability: 'resume_edit',
    id: CONVERSATION_ID,
    revision: 1,
    status: 'active',
    title: `resume-assistant:${RESUME_ID}`,
    workspaceId: WORKSPACE_ID
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    conversationId: CONVERSATION_ID,
    id: RUN_ID,
    inputMessageId: MESSAGE_ID,
    outputMessageId: null,
    proposalIds: [],
    problem: null,
    status: 'succeeded',
    ...overrides
  }
}

function reviewDouble(): ResumeReviewPort {
  const unavailable = () => vi.fn(() => Promise.reject(new Error('unexpected Resume review call')))
  return {
    decideResumeProposal: unavailable(),
    getResumeProposal: unavailable(),
    getResumeRevision: unavailable(),
    listResumeProposalPage: unavailable(),
    listResumeRevisionPage: unavailable(),
    startResumeRestore: unavailable()
  }
}

function knowledgeDouble(items: readonly UiKnowledgeSource[] = []): KnowledgeGateway {
  const unavailable = () => vi.fn(() => Promise.reject(new Error('unexpected Knowledge call')))
  return {
    createManualKnowledgeNote: unavailable(),
    getKnowledgeSource: unavailable(),
    ingestKnowledgeFile: unavailable(),
    listKnowledgeSourcePage: vi.fn(() =>
      Promise.resolve({ hasMore: false as const, items, nextCursor: null })
    ),
    searchKnowledge: unavailable(),
    updateKnowledgeSource: unavailable()
  }
}

function eligibleKnowledgeSource(): UiKnowledgeSource {
  return {
    currentVersionId: asUiOpaqueId<'knowledge-source-version'>('version_assistant_eligible_01'),
    enabled: true,
    id: asUiOpaqueId<'knowledge-source'>('source_assistant_eligible_01'),
    ingestion: { status: 'ready' },
    visibility: {
      agentGrants: [
        {
          agentScope: 'resume_assistant',
          allowedOperations: ['derive'],
          effect: 'allow'
        }
      ],
      allowExternalModelProcessing: true,
      allowedModelRegions: ['global']
    }
  } as unknown as UiKnowledgeSource
}

function message(
  role: AgentMessage['role'],
  text: string,
  proposalIds: readonly string[] = []
): AgentMessage {
  return {
    citationSourceIds: [],
    conversationId: CONVERSATION_ID,
    id: `${MESSAGE_ID}_${role}`,
    proposalIds,
    role,
    text
  }
}

function request(question = '请检查项目经历') {
  return {
    locale: 'zh-CN',
    question,
    resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
    resumeRevision: 7,
    resumeTitle: '前端工程师简历',
    workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
  }
}

function apiDouble(): ResumeAssistantAgentApi {
  return {
    createConversation: vi.fn(() =>
      Promise.resolve({
        entityTag: '"conversation-1"',
        value: conversation()
      })
    ),
    createMessage: vi.fn(() => Promise.resolve(message('user', '请检查项目经历'))),
    createRun: vi.fn(() => Promise.resolve(run())),
    getConversation: vi.fn(() =>
      Promise.resolve({
        entityTag: '"conversation-1"',
        value: conversation()
      })
    ),
    getRun: vi.fn(() => Promise.resolve(run())),
    listConversations: vi.fn(() => Promise.resolve([conversation()])),
    listMessages: vi.fn(() =>
      Promise.resolve([
        message('user', '请检查项目经历'),
        message('assistant', '项目成果需要补充量化指标。')
      ])
    )
  }
}

describe('Resume assistant gateway', () => {
  it('binds every run to the exact Resume revision and returns persisted messages', async () => {
    const api = apiDouble()
    const thread = await createApiV2ResumeAssistantGateway(
      api,
      reviewDouble(),
      knowledgeDouble()
    ).ask(request())

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        inputMessageId: `${MESSAGE_ID}_user`,
        knowledgeSourceIds: [],
        resumeId: RESUME_ID,
        allowedOutputModes: ['text', 'resume_operations'],
        resumeRevision: 7,
        workspaceId: WORKSPACE_ID
      })
    )
    expect(thread.messages.map((item) => item.text)).toEqual([
      '请检查项目经历',
      '项目成果需要补充量化指标。'
    ])
  })

  it('selects only ready explicitly authorized Knowledge sources for the Resume run', async () => {
    const api = apiDouble()
    const source = eligibleKnowledgeSource()

    await createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble([source])).ask(
      request()
    )

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeSourceIds: [source.id] })
    )
  })

  it('exposes the generated Proposal and waits for a user decision', async () => {
    const api = apiDouble()
    const review = reviewDouble()
    const authority = {
      concurrencyToken: '"proposal-1"',
      proposal: {
        id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        status: 'pending'
      }
    } as UiResumeProposalAuthority
    vi.mocked(api.createRun).mockResolvedValue(
      run({
        outputMessageId: 'message_waiting_01',
        proposalIds: [PROPOSAL_ID],
        status: 'waiting_for_proposal_decision'
      })
    )
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(
        run({
          outputMessageId: 'message_waiting_01',
          proposalIds: [PROPOSAL_ID],
          status: 'waiting_for_proposal_decision'
        })
      )
      .mockResolvedValue(run())
    vi.mocked(review.getResumeProposal).mockResolvedValue(authority)
    const thread = await createApiV2ResumeAssistantGateway(api, review, knowledgeDouble()).ask(
      request('请帮我修改这份简历的项目经历')
    )

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOutputModes: ['text', 'resume_operations'] })
    )
    expect(review.decideResumeProposal).not.toHaveBeenCalled()
    expect(thread.pendingProposal).toBe(authority)
  })

  it('maps message proposal references to authoritative terminal proposal states', async () => {
    const api = apiDouble()
    const review = reviewDouble()
    const authority = {
      concurrencyToken: '"proposal-accepted-1"',
      proposal: {
        id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        status: 'accepted',
        title: '更新职业标题'
      }
    } as UiResumeProposalAuthority
    vi.mocked(api.listMessages).mockResolvedValue([
      message('assistant', '我准备了一组简历修改，正在等待你的决定。', [PROPOSAL_ID])
    ])
    vi.mocked(review.getResumeProposal).mockResolvedValue(authority)

    const thread = await createApiV2ResumeAssistantGateway(api, review, knowledgeDouble()).load(
      request()
    )

    expect(thread.messages).toEqual([
      expect.objectContaining({
        proposalStates: [
          {
            id: authority.proposal.id,
            status: 'accepted',
            title: '更新职业标题'
          }
        ]
      })
    ])
  })

  it('returns the committed editor before waiting for proposal continuation', async () => {
    const api = apiDouble()
    const review = reviewDouble()
    const authority = {
      concurrencyToken: '"proposal-generation-1"',
      proposal: {
        id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        status: 'pending'
      }
    } as UiResumeProposalAuthority
    vi.mocked(api.createRun).mockResolvedValue(
      run({
        outputMessageId: 'message_waiting_01',
        proposalIds: [PROPOSAL_ID],
        status: 'waiting_for_proposal_decision'
      })
    )
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(
        run({
          outputMessageId: 'message_waiting_01',
          proposalIds: [PROPOSAL_ID],
          status: 'waiting_for_proposal_decision'
        })
      )
      .mockResolvedValueOnce(
        run({
          outputMessageId: 'message_waiting_01',
          proposalIds: [PROPOSAL_ID],
          status: 'waiting_for_proposal_decision'
        })
      )
      .mockResolvedValue(run({ outputMessageId: 'message_final_01', proposalIds: [PROPOSAL_ID] }))
    vi.mocked(review.getResumeProposal).mockResolvedValue(authority)
    const result = {
      appliedOperationIds: [],
      conflicts: [],
      editor: { resume: { revision: 8 } } as UiResumeEditorModel
    }
    vi.mocked(review.decideResumeProposal).mockResolvedValue(result)

    const gateway = createApiV2ResumeAssistantGateway(api, review, knowledgeDouble())
    const thread = await gateway.ask(request('根据目前的信息生成简历'))
    const committed = await gateway.decideProposal({
      ...request(''),
      authority: thread.pendingProposal!,
      decision: { kind: 'accept-all' }
    })

    expect(review.decideResumeProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: { kind: 'accept-all' },
        proposal: authority.proposal
      })
    )
    expect(committed.decision).toBe(result)
    expect(committed.continuation).toEqual({
      runId: RUN_ID,
      waitingOutputMessageId: 'message_waiting_01'
    })
    expect(api.getRun).toHaveBeenCalledTimes(2)

    const continuation = await gateway.waitForProposalContinuation({
      ...request(''),
      continuation: committed.continuation
    })

    expect(api.getRun).toHaveBeenCalledTimes(3)
    expect(continuation.problemCode).toBeNull()
    expect(continuation.thread.messages).toHaveLength(2)
  })

  it('recovers an accepted Proposal continuation after an aborted wait and reload', async () => {
    vi.useFakeTimers()
    try {
      const api = apiDouble()
      const review = reviewDouble()
      const pendingAuthority = {
        concurrencyToken: '"proposal-recovery-1"',
        proposal: {
          id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
          status: 'pending'
        }
      } as UiResumeProposalAuthority
      const acceptedAuthority = {
        ...pendingAuthority,
        proposal: { ...pendingAuthority.proposal, status: 'accepted' }
      } as UiResumeProposalAuthority
      const decision = {
        appliedOperationIds: [],
        conflicts: [],
        editor: { resume: { revision: 8 } } as UiResumeEditorModel
      }
      let getRunCalls = 0
      vi.mocked(api.createRun).mockResolvedValue(
        run({
          outputMessageId: 'message_waiting_01',
          proposalIds: [PROPOSAL_ID],
          status: 'waiting_for_proposal_decision'
        })
      )
      vi.mocked(api.getRun).mockImplementation(() => {
        getRunCalls += 1
        const completed = getRunCalls >= 5
        return Promise.resolve(
          run({
            outputMessageId: completed ? 'message_final_01' : 'message_waiting_01',
            proposalIds: [PROPOSAL_ID],
            status: completed ? 'succeeded' : 'waiting_for_proposal_decision'
          })
        )
      })
      vi.mocked(api.listMessages).mockImplementation(() =>
        Promise.resolve(
          getRunCalls >= 5
            ? [
                message('user', '请帮我修改简历。'),
                message('assistant', 'The Resume edit is complete.')
              ]
            : [
                message('user', '请帮我修改简历。'),
                message('assistant', 'The Resume edit is still being applied.')
              ]
        )
      )
      vi.mocked(review.getResumeProposal)
        .mockResolvedValueOnce(pendingAuthority)
        .mockResolvedValue(acceptedAuthority)
      vi.mocked(review.decideResumeProposal).mockResolvedValue(decision)

      const gateway = createApiV2ResumeAssistantGateway(api, review, knowledgeDouble())
      const thread = await gateway.ask(request('请帮我修改简历。'))
      const committed = await gateway.decideProposal({
        ...request(''),
        authority: thread.pendingProposal!,
        decision: { kind: 'accept-all' }
      })
      const aborted = new AbortController()
      aborted.abort(new DOMException('Resume page reloaded.', 'AbortError'))

      await expect(
        gateway.waitForProposalContinuation({
          ...request(''),
          continuation: committed.continuation,
          signal: aborted.signal
        })
      ).rejects.toThrow('Resume page reloaded.')

      const recoveredGateway = createApiV2ResumeAssistantGateway(api, review, knowledgeDouble())
      const recovery = recoveredGateway.recoverCommand(request(''))
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(recovery).resolves.toEqual({
        pendingProposal: null,
        recoveryProblemCode: null
      })
      const recovered = recoveredGateway.load(request(''))

      await expect(recovered).resolves.toEqual(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ text: 'The Resume edit is complete.' })
          ]) as unknown
        })
      )
      expect(api.getRun).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves retry ownership to the backend and creates exactly one Run', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValueOnce(
      run({
        problem: {
          code: 'agent.provider_timeout',
          detail: null,
          errors: [],
          extensions: null,
          instance: null,
          request_id: RUN_ID,
          retryable: true,
          status: 504,
          title: 'Model provider timed out',
          type: 'https://api.hmalliances.org/problems/agent/provider_timeout'
        },
        status: 'failed'
      })
    )

    await expect(
      createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble()).ask(request())
    ).rejects.toThrow('agent.provider_timeout')

    expect(api.createMessage).toHaveBeenCalledTimes(1)
    expect(api.createRun).toHaveBeenCalledTimes(1)
  })

  it('recovers an in-flight run after a refresh-like gateway recreation', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
    vi.mocked(api.getRun).mockRejectedValueOnce(new Error('page closed'))
    const firstGateway = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble())

    await expect(firstGateway.ask(request())).rejects.toThrow('page closed')

    vi.mocked(api.getRun).mockResolvedValue(run({ outputMessageId: `${MESSAGE_ID}_assistant` }))
    const restoredGateway = createApiV2ResumeAssistantGateway(
      api,
      reviewDouble(),
      knowledgeDouble()
    )
    await restoredGateway.recoverCommand(request(''))
    const restored = await restoredGateway.load(request(''))

    expect(api.getRun).toHaveBeenLastCalledWith(WORKSPACE_ID, RUN_ID, undefined)
    expect(restored.messages.at(-1)?.text).toBe('项目成果需要补充量化指标。')
  })

  it('replays the exact Run creation after a refresh loses its committed response', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun)
      .mockRejectedValueOnce(new DOMException('Resume page reloaded.', 'AbortError'))
      .mockResolvedValueOnce(run())
    const firstGateway = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble())

    await expect(firstGateway.ask(request('我是 2026 年毕业。'))).rejects.toThrow(
      'Resume page reloaded.'
    )

    await createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble()).recoverCommand(
      request('')
    )

    expect(api.createRun).toHaveBeenCalledTimes(2)
    const firstCreation = vi.mocked(api.createRun).mock.calls[0]![0]
    const replayedCreation = vi.mocked(api.createRun).mock.calls[1]![0]
    expect(replayedCreation).toEqual({
      ...firstCreation,
      signal: undefined
    })
  })

  it('keeps messages and exposes a recovered terminal Run failure after refresh', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
    vi.mocked(api.getRun)
      .mockRejectedValueOnce(new Error('page closed'))
      .mockResolvedValueOnce(
        run({
          problem: {
            code: 'agent.provider_timeout',
            detail: null,
            errors: [],
            extensions: null,
            instance: null,
            request_id: RUN_ID,
            retryable: true,
            status: 504,
            title: 'Model provider timed out',
            type: 'https://api.hmalliances.org/problems/agent/provider_timeout'
          },
          status: 'failed'
        })
      )
    const firstGateway = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble())

    await expect(firstGateway.ask(request())).rejects.toThrow('page closed')

    const restoredGateway = createApiV2ResumeAssistantGateway(
      api,
      reviewDouble(),
      knowledgeDouble()
    )
    const recovery = await restoredGateway.recoverCommand(request(''))
    const restored = await restoredGateway.load(request(''))

    expect(restored.messages).toHaveLength(2)
    expect(recovery.recoveryProblemCode).toBe('agent.provider_timeout')
  })

  it('hydrates conversation messages even when command recovery fails', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
    vi.mocked(api.getRun).mockRejectedValueOnce(new Error('page closed'))
    const firstGateway = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble())
    await expect(firstGateway.ask(request())).rejects.toThrow('page closed')

    vi.mocked(api.getRun).mockRejectedValueOnce(new Error('private recovery transport detail'))
    const restoredGateway = createApiV2ResumeAssistantGateway(
      api,
      reviewDouble(),
      knowledgeDouble()
    )

    const restoredThread = await restoredGateway.load(request(''))
    expect(restoredThread.messages).toHaveLength(2)
    await expect(restoredGateway.recoverCommand(request(''))).rejects.toThrow(
      'private recovery transport detail'
    )
  })

  it('keeps polling beyond the former 90-second client deadline', async () => {
    vi.useFakeTimers()
    try {
      const api = apiDouble()
      let polls = 0
      vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
      vi.mocked(api.getRun).mockImplementation(() =>
        Promise.resolve(run({ status: ++polls <= 38 ? 'running' : 'succeeded' }))
      )

      const result = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble()).ask(
        request()
      )

      await vi.advanceTimersByTimeAsync(100_000)

      await expect(result).resolves.toEqual(
        expect.objectContaining({
          messages: expect.any(Array) as unknown
        })
      )
      expect(polls).toBe(40)
    } finally {
      vi.useRealTimers()
    }
  })
})
