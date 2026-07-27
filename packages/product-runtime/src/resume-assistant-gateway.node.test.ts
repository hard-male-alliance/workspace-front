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

import {
  classifyResumeAssistantIntent,
  createApiV2ResumeAssistantGateway,
  requestsResumeModification
} from './resume-assistant-gateway'

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

function message(role: AgentMessage['role'], text: string): AgentMessage {
  return {
    citationSourceIds: [],
    conversationId: CONVERSATION_ID,
    id: `${MESSAGE_ID}_${role}`,
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
        requestResumeOperations: false,
        resumeRevision: 7,
        workspaceId: WORKSPACE_ID
      })
    )
    expect(thread.messages.map((item) => item.text)).toEqual([
      '请检查项目经历',
      '项目成果需要补充量化指标。'
    ])
  })

  it('keeps advice questions read-only and recognizes only explicit edit commands', () => {
    expect(requestsResumeModification('这份简历有什么需要修改的地方？')).toBe(false)
    expect(requestsResumeModification('请检查项目经历并给我建议')).toBe(false)
    expect(requestsResumeModification('请帮我修改这份简历的项目经历')).toBe(true)
    expect(requestsResumeModification('把项目经历改写成更专业的表达')).toBe(true)
    expect(requestsResumeModification('Please rewrite my resume summary')).toBe(true)
  })

  it('maps natural generation wording to one generate_resume intent', () => {
    expect(classifyResumeAssistantIntent('现在开始生成简历')).toBe('generate_resume')
    expect(classifyResumeAssistantIntent('请根据以上内容帮我写一份简历')).toBe('generate_resume')
    expect(classifyResumeAssistantIntent('Please create a resume from this information')).toBe(
      'generate_resume'
    )
    expect(classifyResumeAssistantIntent('把项目经历改写得更专业')).toBe('edit_resume')
    expect(classifyResumeAssistantIntent('先检查一下结构')).toBe('advice')
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

  it('requests operations and atomically accepts the single generated Proposal', async () => {
    const api = apiDouble()
    const review = reviewDouble()
    const editor = { resume: { revision: 8 } } as UiResumeEditorModel
    const authority = {
      concurrencyToken: '"proposal-1"',
      proposal: {
        id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        status: 'pending'
      }
    } as UiResumeProposalAuthority
    vi.mocked(api.createRun).mockResolvedValue(run({ proposalIds: [PROPOSAL_ID] }))
    vi.mocked(review.getResumeProposal).mockResolvedValue(authority)
    vi.mocked(review.decideResumeProposal).mockResolvedValue({
      appliedOperationIds: [],
      conflicts: [],
      editor
    })

    const thread = await createApiV2ResumeAssistantGateway(api, review, knowledgeDouble()).ask(
      request('请帮我修改这份简历的项目经历')
    )

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestResumeOperations: true })
    )
    expect(review.decideResumeProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: { kind: 'accept-all' },
        proposal: authority.proposal
      })
    )
    expect(thread.appliedEditor).toBe(editor)
    expect(thread.appliedProposalId).toBe(PROPOSAL_ID)
    expect(thread.previousRevision).toBe(7)
  })

  it('requests the same safe Proposal flow for whole-resume generation', async () => {
    const api = apiDouble()
    const review = reviewDouble()
    const authority = {
      concurrencyToken: '"proposal-generation-1"',
      proposal: {
        id: asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        status: 'pending'
      }
    } as UiResumeProposalAuthority
    vi.mocked(api.createRun).mockResolvedValue(run({ proposalIds: [PROPOSAL_ID] }))
    vi.mocked(review.getResumeProposal).mockResolvedValue(authority)
    vi.mocked(review.decideResumeProposal).mockResolvedValue({
      appliedOperationIds: [],
      conflicts: [],
      editor: { resume: { revision: 8 } } as UiResumeEditorModel
    })

    await createApiV2ResumeAssistantGateway(api, review, knowledgeDouble()).ask(
      request('根据目前的信息生成简历')
    )

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestResumeOperations: true })
    )
  })

  it('retries one retryable provider failure without creating a duplicate user message', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun)
      .mockResolvedValueOnce(
        run({
          problem: {
            code: 'agent.provider_empty',
            detail: null,
            errors: [],
            extensions: null,
            instance: null,
            request_id: RUN_ID,
            retryable: true,
            status: 502,
            title: 'Model provider returned no usable output',
            type: 'https://api.hmalliances.org/problems/agent/provider_empty'
          },
          status: 'failed'
        })
      )
      .mockResolvedValueOnce(run({ id: `${RUN_ID}_retry` }))

    await createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble()).ask(request())

    expect(api.createMessage).toHaveBeenCalledTimes(1)
    expect(api.createRun).toHaveBeenCalledTimes(2)
  })

  it('recovers an in-flight run after a refresh-like gateway recreation', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
    vi.mocked(api.getRun).mockRejectedValueOnce(new Error('page closed'))
    const firstGateway = createApiV2ResumeAssistantGateway(api, reviewDouble(), knowledgeDouble())

    await expect(firstGateway.ask(request())).rejects.toThrow('page closed')

    vi.mocked(api.getRun).mockResolvedValue(run({ outputMessageId: `${MESSAGE_ID}_assistant` }))
    const restored = await createApiV2ResumeAssistantGateway(
      api,
      reviewDouble(),
      knowledgeDouble()
    ).load(request(''))

    expect(api.getRun).toHaveBeenLastCalledWith(WORKSPACE_ID, RUN_ID, undefined)
    expect(restored.messages.at(-1)?.text).toBe('项目成果需要补充量化指标。')
  })
})
