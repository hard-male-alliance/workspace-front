/** @file 真实 Resume 助手运行时编排测试 / Real Resume-assistant runtime orchestration tests. */
/* eslint-disable @typescript-eslint/unbound-method -- Vitest spies intentionally inspect interface methods. */

import { describe, expect, it, vi } from 'vitest'

import { asUiOpaqueId } from '@ai-job-workspace/app/application'
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
    problem: null,
    status: 'succeeded',
    ...overrides
  }
}

function message(role: AgentMessage['role'], text: string): AgentMessage {
  return { conversationId: CONVERSATION_ID, id: `${MESSAGE_ID}_${role}`, role, text }
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
    const thread = await createApiV2ResumeAssistantGateway(api).ask(request())

    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        inputMessageId: `${MESSAGE_ID}_user`,
        resumeId: RESUME_ID,
        resumeRevision: 7,
        workspaceId: WORKSPACE_ID
      })
    )
    expect(thread.messages.map((item) => item.text)).toEqual([
      '请检查项目经历',
      '项目成果需要补充量化指标。'
    ])
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

    await createApiV2ResumeAssistantGateway(api).ask(request())

    expect(api.createMessage).toHaveBeenCalledTimes(1)
    expect(api.createRun).toHaveBeenCalledTimes(2)
  })

  it('recovers an in-flight run after a refresh-like gateway recreation', async () => {
    const api = apiDouble()
    vi.mocked(api.createRun).mockResolvedValue(run({ status: 'running' }))
    vi.mocked(api.getRun).mockRejectedValueOnce(new Error('page closed'))
    const firstGateway = createApiV2ResumeAssistantGateway(api)

    await expect(firstGateway.ask(request())).rejects.toThrow('page closed')

    vi.mocked(api.getRun).mockResolvedValue(run({ outputMessageId: `${MESSAGE_ID}_assistant` }))
    const restored = await createApiV2ResumeAssistantGateway(api).load(request(''))

    expect(api.getRun).toHaveBeenLastCalledWith(WORKSPACE_ID, RUN_ID, undefined)
    expect(restored.messages.at(-1)?.text).toBe('项目成果需要补充量化指标。')
  })
})
