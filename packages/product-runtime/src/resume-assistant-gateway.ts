/** @file 真实 API v2 Resume 助手产品流程 / Real API v2 Resume-assistant product process. */

import type {
  KnowledgeGateway,
  ResumeReviewPort,
  ResumeAssistantGateway,
  UiKnowledgeSource,
  UiResumeAssistantCommandRecovery,
  UiResumeAssistantMessage,
  UiResumeAssistantRequest,
  UiResumeAssistantThread,
  UiResumeProposalAuthority
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

const RECOVERY_PREFIX = 'aiws.resume-assistant.run.v1'
const processRecovery = new Map<string, string>()
const processContinuationRecovery = new Map<string, ProposalContinuationRecovery>()

/** @brief 可幂等重放的 Agent Run 创建命令 / Idempotently replayable Agent Run creation command. */
type RecoverableRunCreation = Omit<Parameters<ResumeAssistantAgentApi['createRun']>[0], 'signal'>

/** @brief 已提交 Proposal 的可恢复续答句柄 / Persisted handle for a continuation after a Proposal decision commits. */
interface ProposalContinuationRecovery {
  readonly runId: string
  readonly waitingOutputMessageId: string | null
}

function recoveryKey(input: UiResumeAssistantRequest): string {
  return `${RECOVERY_PREFIX}:${input.workspaceId}:${input.resumeId}`
}

/** @brief 构造已提交 Proposal 的续答恢复键 / Build the recovery key for a committed Proposal continuation. */
function continuationRecoveryKey(input: UiResumeAssistantRequest): string {
  return `${recoveryKey(input)}:proposal-continuation`
}

/** @brief 构造响应丢失前的 Run 创建恢复键 / Build the Run-creation recovery key used before a response is received. */
function runCreationRecoveryKey(input: UiResumeAssistantRequest): string {
  return `${recoveryKey(input)}:creation`
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

/** @brief 校验持久化的 Proposal 续答句柄 / Validate a persisted Proposal-continuation handle. */
function parseContinuationRecovery(value: string): ProposalContinuationRecovery | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Readonly<Record<string, unknown>>
    if (
      typeof record.runId !== 'string' ||
      (record.waitingOutputMessageId !== null && typeof record.waitingOutputMessageId !== 'string')
    ) {
      return null
    }
    return {
      runId: record.runId,
      waitingOutputMessageId: record.waitingOutputMessageId
    }
  } catch {
    return null
  }
}

/** @brief 读取已提交 Proposal 的续答恢复句柄 / Read a committed Proposal-continuation recovery handle. */
function continuationRecoveryRead(key: string): ProposalContinuationRecovery | null {
  try {
    const serialized = globalThis.sessionStorage?.getItem(key)
    if (serialized !== null && serialized !== undefined) {
      const recovered = parseContinuationRecovery(serialized)
      if (recovered !== null) return recovered
    }
  } catch {
    // Process-local recovery remains available in restricted hosts.
  }
  return processContinuationRecovery.get(key) ?? null
}

/** @brief 写入或清除 Proposal 续答恢复句柄 / Write or clear a Proposal-continuation recovery handle. */
function continuationRecoveryWrite(key: string, value: ProposalContinuationRecovery | null): void {
  if (value === null) processContinuationRecovery.delete(key)
  else processContinuationRecovery.set(key, value)
  try {
    if (value === null) globalThis.sessionStorage?.removeItem(key)
    else globalThis.sessionStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Process-local recovery remains available in restricted hosts.
  }
}

/** @brief 清除已知 Run 与 Proposal 续答恢复状态 / Clear known Run and Proposal-continuation recovery state. */
function clearRunRecovery(input: UiResumeAssistantRequest): void {
  recoveryWrite(recoveryKey(input), null)
  continuationRecoveryWrite(continuationRecoveryKey(input), null)
}

/** @brief 校验并读取持久化的 Run 创建命令 / Validate and read a persisted Run creation command. */
function parseRunCreationRecovery(value: string): RecoverableRunCreation | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Readonly<Record<string, unknown>>
    const knowledgeSourceIds = record.knowledgeSourceIds
    const allowedOutputModes = record.allowedOutputModes
    if (
      typeof record.workspaceId !== 'string' ||
      typeof record.conversationId !== 'string' ||
      typeof record.inputMessageId !== 'string' ||
      typeof record.resumeId !== 'string' ||
      !Number.isSafeInteger(record.resumeRevision) ||
      typeof record.locale !== 'string' ||
      typeof record.idempotencyKey !== 'string' ||
      !Array.isArray(knowledgeSourceIds) ||
      !knowledgeSourceIds.every((item) => typeof item === 'string') ||
      !Array.isArray(allowedOutputModes) ||
      !allowedOutputModes.every(
        (item) => item === 'text' || item === 'citations' || item === 'resume_operations'
      )
    ) {
      return null
    }
    return {
      workspaceId: record.workspaceId,
      conversationId: record.conversationId,
      inputMessageId: record.inputMessageId,
      resumeId: record.resumeId,
      resumeRevision: record.resumeRevision as number,
      locale: record.locale,
      knowledgeSourceIds,
      allowedOutputModes,
      idempotencyKey: record.idempotencyKey
    }
  } catch {
    return null
  }
}

/** @brief 持久化可重放的 Run 创建命令 / Persist a replayable Run creation command. */
function runCreationRecoveryWrite(key: string, value: RecoverableRunCreation | null): void {
  recoveryWrite(key, value === null ? null : JSON.stringify(value))
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

async function mapMessages(
  review: ResumeReviewPort,
  input: UiResumeAssistantRequest,
  messages: readonly AgentMessage[]
): Promise<readonly UiResumeAssistantMessage[]> {
  /** @brief 同一 Proposal 只读取一次的权威状态缓存 / Authoritative state cache reading each Proposal only once. */
  const proposalStates = new Map<string, UiResumeAssistantMessage['proposalStates'][number]>()
  await Promise.all(
    [...new Set(messages.flatMap((message) => message.proposalIds))].map(
      async (proposalId): Promise<void> => {
        const authority = await review.getResumeProposal(
          input.workspaceId,
          input.resumeId,
          asUiOpaqueId<'resume-proposal'>(proposalId),
          input.signal ?? new AbortController().signal
        )
        proposalStates.set(proposalId, {
          id: authority.proposal.id,
          status: authority.proposal.status,
          title: authority.proposal.title
        })
      }
    )
  )
  return messages
    .filter((message) => message.text.trim().length > 0 || message.proposalIds.length > 0)
    .map((message) => ({
      id: message.id,
      author:
        message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
      proposalStates: message.proposalIds.flatMap((proposalId) => {
        const state = proposalStates.get(proposalId)
        return state === undefined ? [] : [state]
      }),
      referenceSourceIds: message.citationSourceIds,
      text: message.text
    }))
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const abortError = (): Error =>
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException('Resume assistant request was aborted.', 'AbortError')
    if (signal?.aborted === true) {
      reject(abortError())
      return
    }
    const onAbort = (): void => {
      globalThis.clearTimeout(timer)
      reject(abortError())
    }
    const timer = globalThis.setTimeout((): void => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function waitForRun(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest,
  initial: AgentRun
): Promise<AgentRun> {
  let run = initial
  let interval = 700
  while (run.status === 'queued' || run.status === 'running') {
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
  review: ResumeReviewPort,
  input: UiResumeAssistantRequest,
  conversation: AgentConversation
): Promise<UiResumeAssistantThread> {
  const [thread, recovery] = await Promise.all([
    readThread(api, review, input, conversation),
    recoverCommand(api, review, input, conversation)
  ])
  return {
    ...thread,
    ...recovery
  }
}

/** @brief 仅读取 Conversation 消息，不等待任何 Run 恢复 / Read Conversation messages without awaiting any Run recovery. */
async function readThread(
  api: ResumeAssistantAgentApi,
  review: ResumeReviewPort,
  input: UiResumeAssistantRequest,
  conversation: AgentConversation
): Promise<UiResumeAssistantThread> {
  const messages = await api.listMessages(input.workspaceId, conversation.id, input.signal)
  return {
    pendingProposal: null,
    conversationId: conversation.id,
    messages: await mapMessages(review, input, messages),
    recoveryProblemCode: null
  }
}

/** @brief 独立恢复精确 Run/Proposal 命令状态 / Independently recover exact Run/Proposal command state. */
async function recoverCommand(
  api: ResumeAssistantAgentApi,
  review: ResumeReviewPort,
  input: UiResumeAssistantRequest,
  conversation: AgentConversation
): Promise<UiResumeAssistantCommandRecovery> {
  const key = recoveryKey(input)
  const creationKey = runCreationRecoveryKey(input)
  const continuationKey = continuationRecoveryKey(input)
  const recoveredContinuation = continuationRecoveryRead(continuationKey)
  let recoveredRunId = recoveryRead(key)
  const serializedCreation = recoveryRead(creationKey)
  if (recoveredRunId === null && serializedCreation !== null) {
    const creation = parseRunCreationRecovery(serializedCreation)
    if (
      creation === null ||
      creation.workspaceId !== input.workspaceId ||
      creation.resumeId !== input.resumeId ||
      creation.conversationId !== conversation.id
    ) {
      recoveryWrite(creationKey, null)
    } else {
      const replayed = await api.createRun({
        ...creation,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      })
      recoveredRunId = replayed.id
      recoveryWrite(key, replayed.id)
      recoveryWrite(creationKey, null)
    }
  }
  let pendingProposal: UiResumeProposalAuthority | null = null
  let recoveryProblemCode: string | null = null
  if (recoveredContinuation !== null) {
    const terminalRun = await waitForProposalContinuation(
      api,
      input,
      recoveredContinuation.runId,
      recoveredContinuation.waitingOutputMessageId
    )
    if (terminalRun.status !== 'succeeded') {
      recoveryProblemCode =
        terminalRun.problem?.code ?? `resume.assistant_run_${terminalRun.status}`
    }
    clearRunRecovery(input)
  } else if (recoveredRunId !== null) {
    let run = await api.getRun(input.workspaceId, recoveredRunId, input.signal)
    if (run.status === 'queued' || run.status === 'running') {
      run = await waitForRun(api, input, run)
    }
    if (run.proposalIds.length === 1) {
      const authority = await review.getResumeProposal(
        input.workspaceId,
        input.resumeId,
        asUiOpaqueId<'resume-proposal'>(run.proposalIds[0]!),
        input.signal ?? new AbortController().signal
      )
      if (authority.proposal.status === 'pending') pendingProposal = authority
    }
    if (run.status !== 'succeeded' && run.status !== 'waiting_for_proposal_decision') {
      recoveryProblemCode = run.problem?.code ?? `resume.assistant_run_${run.status}`
    }
    if (pendingProposal === null) recoveryWrite(key, null)
  }
  return {
    pendingProposal,
    recoveryProblemCode
  }
}

async function waitForProposalContinuation(
  api: ResumeAssistantAgentApi,
  input: UiResumeAssistantRequest,
  runId: string,
  waitingOutputMessageId: string | null
): Promise<AgentRun> {
  let run = await api.getRun(input.workspaceId, runId, input.signal)
  let interval = 400
  while (
    run.status === 'queued' ||
    run.status === 'running' ||
    run.status === 'waiting_for_proposal_decision' ||
    (run.status === 'succeeded' && run.outputMessageId === waitingOutputMessageId)
  ) {
    await delay(interval, input.signal)
    run = await api.getRun(input.workspaceId, runId, input.signal)
    interval = Math.min(Math.round(interval * 1.5), 2_500)
  }
  return run
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
      return readThread(api, review, input, conversation)
    },
    async recoverCommand(input): Promise<UiResumeAssistantCommandRecovery> {
      const conversation = await resolveConversation(api, input)
      return recoverCommand(api, review, input, conversation)
    },
    async ask(input): Promise<UiResumeAssistantThread> {
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
      const creationKey = runCreationRecoveryKey(input)
      const runCreation: RecoverableRunCreation = {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        inputMessageId: message.id,
        resumeId: input.resumeId,
        resumeRevision: input.resumeRevision,
        locale: input.locale,
        knowledgeSourceIds,
        allowedOutputModes: [
          'text',
          ...(knowledgeSourceIds.length === 0 ? [] : (['citations'] as const)),
          'resume_operations'
        ],
        idempotencyKey: commandId('resume_assistant_run')
      }
      runCreationRecoveryWrite(creationKey, runCreation)
      let run: AgentRun
      try {
        run = await api.createRun({
          ...runCreation,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        })
      } catch (creationError) {
        if (!(creationError instanceof DOMException && creationError.name === 'AbortError')) {
          recoveryWrite(creationKey, null)
        }
        throw creationError
      }
      continuationRecoveryWrite(continuationRecoveryKey(input), null)
      recoveryWrite(creationKey, null)
      recoveryWrite(key, run.id)
      const terminalRun = await waitForRun(api, input, run)
      if (
        terminalRun.status !== 'succeeded' &&
        terminalRun.status !== 'waiting_for_proposal_decision'
      ) {
        throw new Error(terminalRun.problem?.code ?? `resume.assistant_run_${terminalRun.status}`)
      }
      if (terminalRun.proposalIds.length > 0) recoveryWrite(key, terminalRun.id)
      const thread = await loadThread(api, review, input, conversation)
      if (terminalRun.proposalIds.length === 0) return thread
      if (terminalRun.proposalIds.length !== 1) {
        throw new Error('resume.assistant_proposal_count_invalid')
      }
      const proposalId = asUiOpaqueId<'resume-proposal'>(terminalRun.proposalIds[0]!)
      if (thread.pendingProposal?.proposal.id !== proposalId) {
        throw new Error('resume.assistant_proposal_not_pending')
      }
      return thread
    },
    async decideProposal(input) {
      if (input.authority.proposal.status !== 'pending') {
        throw new Error('resume.assistant_proposal_not_pending')
      }
      const key = recoveryKey(input)
      const runId = recoveryRead(key)
      if (runId === null) throw new Error('resume.assistant_pending_run_missing')
      const waitingRun = await api.getRun(input.workspaceId, runId, input.signal)
      const decision = await review.decideResumeProposal({
        commandId: createUiCommandId(),
        concurrencyToken: input.authority.concurrencyToken,
        decision: input.decision,
        proposal: input.authority.proposal,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      })
      const continuation = {
        runId,
        waitingOutputMessageId: waitingRun.outputMessageId
      }
      continuationRecoveryWrite(continuationRecoveryKey(input), continuation)
      return {
        decision,
        continuation
      }
    },
    async waitForProposalContinuation(input) {
      const terminalRun = await waitForProposalContinuation(
        api,
        input,
        input.continuation.runId,
        input.continuation.waitingOutputMessageId
      )
      clearRunRecovery(input)
      const conversation = await resolveConversation(api, input)
      return {
        problemCode:
          terminalRun.status === 'succeeded'
            ? null
            : (terminalRun.problem?.code ?? `resume.assistant_run_${terminalRun.status}`),
        thread: await loadThread(api, review, input, conversation)
      }
    }
  }
}
