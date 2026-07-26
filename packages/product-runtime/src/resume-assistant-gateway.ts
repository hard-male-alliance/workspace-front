/** @file 真实 API v2 Resume 助手产品流程 / Real API v2 Resume-assistant product process. */

import type {
  ResumeAssistantGateway,
  UiResumeAssistantMessage,
  UiResumeAssistantRequest,
  UiResumeAssistantThread
} from '@ai-job-workspace/app/application'
import type {
  AgentConversation,
  AgentMessage,
  AgentRun,
  ResumeAssistantAgentApi
} from '@ai-job-workspace/product-api-v2'

const MAXIMUM_RUN_WAIT_MILLISECONDS = 90_000
const RECOVERY_PREFIX = 'aiws.resume-assistant.run.v1'
const processRecovery = new Map<string, string>()

function recoveryKey(input: UiResumeAssistantRequest): string {
  return `${RECOVERY_PREFIX}:${input.workspaceId}:${input.resumeId}`
}

function recoveryRead(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? processRecovery.get(key) ?? null
  } catch {
    return processRecovery.get(key) ?? null
  }
}

function recoveryWrite(key: string, value: string | null): void {
  if (value === null) processRecovery.delete(key)
  else processRecovery.set(key, value)
  try {
    if (value === null) globalThis.sessionStorage?.removeItem(key)
    else globalThis.sessionStorage?.setItem(key, value)
  } catch {
    // Process-local recovery remains available in restricted hosts.
  }
}

function commandId(kind: string): string {
  return `${kind}_${globalThis.crypto.randomUUID()}`
}

function conversationTitle(resumeId: string): string {
  return `resume-assistant:${resumeId}`
}

function mapMessages(messages: readonly AgentMessage[]): readonly UiResumeAssistantMessage[] {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      id: message.id,
      author:
        message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
      text: message.text
    }))
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      (): void => {
        globalThis.clearTimeout(timer)
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Resume assistant request was aborted.', 'AbortError')
        )
      },
      { once: true }
    )
  })
}

async function waitForRun(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest,
  initial: AgentRun
): Promise<AgentRun> {
  let run = initial
  let interval = 700
  const deadline = Date.now() + MAXIMUM_RUN_WAIT_MILLISECONDS
  while (run.status === 'queued' || run.status === 'running') {
    if (Date.now() >= deadline) throw new Error('resume.assistant_run_timeout')
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    await delay(hidden ? Math.max(interval, 4_000) : interval, input.signal)
    run = await api.getRun(input.workspaceId, run.id, input.signal)
    interval = Math.min(Math.round(interval * 1.5), 2_500)
  }
  return run
}

async function resolveConversation(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest
): Promise<AgentConversation> {
  const title = conversationTitle(input.resumeId)
  const conversations = await api.listConversations(input.workspaceId, input.signal)
  const current = conversations.find(
    (conversation) =>
      conversation.capability === 'resume_edit' &&
      conversation.status === 'active' &&
      conversation.title === title
  )
  if (current !== undefined) return current
  return (
    await api.createConversation(
      input.workspaceId,
      title,
      commandId('resume_assistant_conversation'),
      input.signal
    )
  ).value
}

async function loadThread(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest,
  conversation: AgentConversation
): Promise<UiResumeAssistantThread> {
  const key = recoveryKey(input)
  const recoveredRunId = recoveryRead(key)
  if (recoveredRunId !== null) {
    const run = await api.getRun(input.workspaceId, recoveredRunId, input.signal)
    if (run.status === 'queued' || run.status === 'running') {
      await waitForRun(api, input, run)
    }
    recoveryWrite(key, null)
  }
  const messages = await api.listMessages(input.workspaceId, conversation.id, input.signal)
  return { conversationId: conversation.id, messages: mapMessages(messages) }
}

/** @brief 将真实 Agent API 编排成 Resume 页面的只读助手 / Compose the real Agent API into the Resume page's read-only assistant. */
export function createApiV2ResumeAssistantGateway(
  api: ResumeAssistantAgentApi
): ResumeAssistantGateway {
  return {
    async load(input): Promise<UiResumeAssistantThread> {
      const conversation = await resolveConversation(api, input)
      return loadThread(api, input, conversation)
    },
    async ask(input): Promise<UiResumeAssistantThread> {
      const conversation = await resolveConversation(api, input)
      const current = await api.getConversation(input.workspaceId, conversation.id, input.signal)
      const message = await api.createMessage(
        input.workspaceId,
        conversation.id,
        current.entityTag,
        input.question,
        commandId('resume_assistant_message'),
        input.signal
      )
      const key = recoveryKey(input)
      let terminalRun: AgentRun | null = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const run = await api.createRun({
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          inputMessageId: message.id,
          resumeId: input.resumeId,
          resumeRevision: input.resumeRevision,
          locale: input.locale,
          idempotencyKey: commandId('resume_assistant_run'),
          ...(input.signal === undefined ? {} : { signal: input.signal })
        })
        recoveryWrite(key, run.id)
        terminalRun = await waitForRun(api, input, run)
        recoveryWrite(key, null)
        if (terminalRun.status === 'succeeded') break
        if (attempt === 0 && terminalRun.problem?.retryable === true) continue
        throw new Error(terminalRun.problem?.code ?? `resume.assistant_run_${terminalRun.status}`)
      }
      if (terminalRun?.status !== 'succeeded') {
        throw new Error('resume.assistant_run_failed')
      }
      return loadThread(api, input, conversation)
    }
  }
}
