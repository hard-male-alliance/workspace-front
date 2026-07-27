/** @file 真实 API v2 Resume 助手产品流程 / Real API v2 Resume-assistant product process. */

import type {
  KnowledgeGateway,
  ResumeReviewPort,
  ResumeAssistantGateway,
  UiKnowledgeSource,
  UiResumeAssistantMessage,
  UiResumeAssistantRequest,
  UiResumeAssistantThread
} from '@ai-job-workspace/app/application'
import {
  asUiKnowledgeSourcePageLimit,
  asUiOpaqueId,
  createUiCommandId
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

/** @brief 简历助手的三个产品意图 / Three product intents understood by the Resume assistant. */
export type ResumeAssistantIntent = 'advice' | 'edit_resume' | 'generate_resume'

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

function allowsResumeAssistant(source: UiKnowledgeSource): boolean {
  if (
    !source.enabled ||
    source.ingestion.status !== 'ready' ||
    source.currentVersionId === null ||
    !source.visibility.allowedModelRegions.includes('global') ||
    !source.visibility.allowExternalModelProcessing
  ) {
    return false
  }
  const grants = source.visibility.agentGrants.filter(
    (grant) => grant.agentScope === 'resume_assistant' && grant.allowedOperations.includes('derive')
  )
  return (
    grants.some((grant) => grant.effect === 'allow') &&
    !grants.some((grant) => grant.effect === 'deny')
  )
}

async function resumeKnowledgeSourceIds(
  knowledge: KnowledgeGateway,
  input: UiResumeAssistantRequest
): Promise<readonly string[]> {
  const result: string[] = []
  let cursor = null
  for (;;) {
    const page = await knowledge.listKnowledgeSourcePage({
      cursor,
      limit: asUiKnowledgeSourcePageLimit(200),
      signal: input.signal ?? new AbortController().signal,
      workspaceId: input.workspaceId
    })
    result.push(...page.items.filter(allowsResumeAssistant).map((source) => source.id))
    if (!page.hasMore) return result
    cursor = page.nextCursor
  }
}

/** @brief 将多种自然表达收敛为单一生成意图，同时保留修改与只读咨询 / Map natural wording to one generation intent while retaining edits and advice. */
export function classifyResumeAssistantIntent(question: string): ResumeAssistantIntent {
  const normalized = question.trim().replace(/\s+/g, ' ')
  if (normalized.length === 0) return 'advice'
  const chineseGeneration =
    /(?:生成|创建|制作|撰写|写)(?:一份|一个|这份|我的|完整的|基础版|初版)?[^，。！？]{0,20}简历|简历[^，。！？]{0,12}(?:生成|创建|制作|撰写)/u
  const englishGeneration =
    /^(?:please\s+)?(?:create|generate|draft|write|build)\b[\s\S]{0,60}\b(?:resume|cv)\b/iu
  if (chineseGeneration.test(normalized) || englishGeneration.test(normalized)) {
    return 'generate_resume'
  }
  const chineseExplicit =
    /(?:请|帮我|替我|直接|现在)(?:根据[^，。！？]{0,40})?(?:修改|改写|重写|优化|调整|更新)(?:这份|我的|一下|简历|项目|经历|内容|表述|整份)/u
  const chineseTransform =
    /(?:把|将)(?:这份|我的)?[^，。！？]{0,60}(?:改成|改写(?:成|得)?|修改为|调整为|替换为|优化成)/u
  const englishExplicit =
    /^(?:please\s+)?(?:edit|rewrite|revise|update|optimi[sz]e|modify)\b[\s\S]{0,80}\b(?:resume|cv|section|experience|project|summary)\b/iu
  return chineseExplicit.test(normalized) ||
    chineseTransform.test(normalized) ||
    englishExplicit.test(normalized)
    ? 'edit_resume'
    : 'advice'
}

/** @brief 判断当前意图是否需要安全 Resume Proposal / Test whether an intent requires a safe Resume Proposal. */
export function requestsResumeModification(question: string): boolean {
  return classifyResumeAssistantIntent(question) !== 'advice'
}

function mapMessages(messages: readonly AgentMessage[]): readonly UiResumeAssistantMessage[] {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      id: message.id,
      author:
        message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
      referenceSourceIds: message.citationSourceIds,
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
  return {
    appliedEditor: null,
    appliedProposalId: null,
    conversationId: conversation.id,
    messages: mapMessages(messages),
    previousRevision: null
  }
}

/** @brief 将真实 Agent API 与 Proposal decision 编排成读写分离的 Resume 助手 / Compose Agent API and Proposal decisions into a read/write-separated Resume assistant. */
export function createApiV2ResumeAssistantGateway(
  api: ResumeAssistantAgentApi,
  review: ResumeReviewPort,
  knowledge: KnowledgeGateway
): ResumeAssistantGateway {
  return {
    async load(input): Promise<UiResumeAssistantThread> {
      const conversation = await resolveConversation(api, input)
      return loadThread(api, input, conversation)
    },
    async ask(input): Promise<UiResumeAssistantThread> {
      const requestResumeOperations = requestsResumeModification(input.question)
      const knowledgeSourceIds = await resumeKnowledgeSourceIds(knowledge, input)
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
          knowledgeSourceIds,
          requestResumeOperations,
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
      const thread = await loadThread(api, input, conversation)
      if (!requestResumeOperations || terminalRun.proposalIds.length === 0) return thread
      if (terminalRun.proposalIds.length !== 1) {
        throw new Error('resume.assistant_proposal_count_invalid')
      }
      const proposalId = asUiOpaqueId<'resume-proposal'>(terminalRun.proposalIds[0]!)
      const signal = input.signal ?? new AbortController().signal
      const authority = await review.getResumeProposal(
        input.workspaceId,
        input.resumeId,
        proposalId,
        signal
      )
      if (authority.proposal.status !== 'pending') {
        throw new Error('resume.assistant_proposal_not_pending')
      }
      const decision = await review.decideResumeProposal({
        commandId: createUiCommandId(),
        concurrencyToken: authority.concurrencyToken,
        decision: { kind: 'accept-all' },
        proposal: authority.proposal,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      })
      if (decision.conflicts.length > 0) {
        throw new Error('resume.assistant_proposal_conflict')
      }
      return {
        ...thread,
        appliedEditor: decision.editor,
        appliedProposalId: proposalId,
        previousRevision: input.resumeRevision
      }
    }
  }
}
