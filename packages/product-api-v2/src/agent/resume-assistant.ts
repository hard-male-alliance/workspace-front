/** @file Resume 只读助手所需的 API v2 Agent 消费者 / API v2 Agent consumer for the read-only Resume assistant. */

import type { ApiV2Client, ApiV2WriteClient } from '../http/client'
import {
  arrayBetween,
  boundedInteger,
  boundedString,
  exactRecord,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  record,
  strongEntityTag
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseProblemDetails, type ProblemDetails } from '../http/problem'
import { parseResourceReference } from '../resources/resource-reference'

export type AgentRole = 'user' | 'assistant' | 'system_notice'
export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_proposal_decision'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface AgentConversation {
  readonly id: string
  readonly revision: number
  readonly workspaceId: string
  readonly title: string | null
  readonly capability: 'general' | 'resume_edit' | 'knowledge_query' | 'interview_coach'
  readonly status: 'active' | 'archived'
}

export interface AgentMessage {
  readonly id: string
  readonly conversationId: string
  readonly role: AgentRole
  readonly text: string
  readonly citationSourceIds: readonly string[]
  /** @brief 消息正文引用的简历建议标识 / Resume Proposal identities referenced by the message body. */
  readonly proposalIds: readonly string[]
}

export interface AgentRun {
  readonly id: string
  readonly conversationId: string
  readonly inputMessageId: string
  readonly status: AgentRunStatus
  readonly outputMessageId: string | null
  readonly proposalIds: readonly string[]
  readonly problem: ProblemDetails | null
}

export interface VersionedAgentConversation {
  readonly value: AgentConversation
  readonly entityTag: string
}

export interface ResumeAssistantAgentApi {
  listConversations(
    workspaceId: string,
    signal?: AbortSignal
  ): Promise<readonly AgentConversation[]>
  createConversation(
    workspaceId: string,
    title: string,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<VersionedAgentConversation>
  getConversation(
    workspaceId: string,
    conversationId: string,
    signal?: AbortSignal
  ): Promise<VersionedAgentConversation>
  listMessages(
    workspaceId: string,
    conversationId: string,
    signal?: AbortSignal
  ): Promise<readonly AgentMessage[]>
  createMessage(
    workspaceId: string,
    conversationId: string,
    entityTag: string,
    text: string,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<AgentMessage>
  createRun(input: {
    readonly workspaceId: string
    readonly conversationId: string
    readonly inputMessageId: string
    readonly resumeId: string
    readonly resumeRevision: number
    readonly locale: string
    readonly knowledgeSourceIds: readonly string[]
    readonly allowedOutputModes: readonly AgentOutputMode[]
    readonly idempotencyKey: string
    readonly signal?: AbortSignal
  }): Promise<AgentRun>
  getRun(workspaceId: string, runId: string, signal?: AbortSignal): Promise<AgentRun>
}

export type AgentOutputMode = 'citations' | 'resume_operations' | 'text'

function parseConversation(value: unknown, path = 'conversation'): AgentConversation {
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'title',
    'capability',
    'status'
  ])
  const resource = parseResourceFields(input, path)
  const capability = boundedString(input.capability, `${path}.capability`, 1, 30)
  if (
    capability !== 'general' &&
    capability !== 'resume_edit' &&
    capability !== 'knowledge_query' &&
    capability !== 'interview_coach'
  ) {
    throw new ApiV2ContractError(`API v2 field ${path}.capability is invalid.`)
  }
  const status = boundedString(input.status, `${path}.status`, 1, 20)
  if (status !== 'active' && status !== 'archived') {
    throw new ApiV2ContractError(`API v2 field ${path}.status is invalid.`)
  }
  return {
    id: resource.id,
    revision: resource.revision,
    workspaceId: opaqueId(input.workspace_id, `${path}.workspace_id`),
    title: input.title === null ? null : boundedString(input.title, `${path}.title`, 0, 300),
    capability,
    status
  }
}

function parseMessage(value: unknown, path = 'message'): AgentMessage {
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'conversation_id',
    'role',
    'parent_message_id',
    'content'
  ])
  const resource = parseResourceFields(input, path)
  opaqueId(input.workspace_id, `${path}.workspace_id`)
  const role = boundedString(input.role, `${path}.role`, 1, 20)
  if (role !== 'user' && role !== 'assistant' && role !== 'system_notice') {
    throw new ApiV2ContractError(`API v2 field ${path}.role is invalid.`)
  }
  const parts = arrayBetween(input.content, `${path}.content`, 1, 100)
  const decodedParts = parts.map((part, index) =>
    exactRecord(part, `${path}.content[${index}]`, ['type', 'text', 'citation', 'proposal_ref'])
  )
  const text = decodedParts
    .map((content, index): string => {
      if (content.type !== 'text') return ''
      return boundedString(content.text, `${path}.content[${index}].text`, 1, 200_000)
    })
    .filter(Boolean)
    .join('\n')
  return {
    citationSourceIds: decodedParts.flatMap((content, index) => {
      if (content.type !== 'citation') return []
      const citation = exactRecord(content.citation, `${path}.content[${index}].citation`, [
        'source_id',
        'version_id',
        'locator',
        'quote',
        'score'
      ])
      opaqueId(citation.version_id, `${path}.content[${index}].citation.version_id`)
      boundedString(citation.locator, `${path}.content[${index}].citation.locator`, 0, 4000)
      boundedString(citation.quote, `${path}.content[${index}].citation.quote`, 1, 20_000)
      if (typeof citation.score !== 'number' || !Number.isFinite(citation.score)) {
        throw new ApiV2ContractError(
          `API v2 field ${path}.content[${index}].citation.score is invalid.`
        )
      }
      return [opaqueId(citation.source_id, `${path}.content[${index}].citation.source_id`)]
    }),
    proposalIds: decodedParts.flatMap((content, index) => {
      if (content.type !== 'proposal_ref') return []
      const proposal = parseResourceReference(
        content.proposal_ref,
        `${path}.content[${index}].proposal_ref`
      )
      if (proposal.resource_type !== 'resume_proposal') {
        throw new ApiV2ContractError(
          `API v2 field ${path}.content[${index}].proposal_ref must reference a Resume Proposal.`
        )
      }
      return [proposal.id]
    }),
    id: resource.id,
    conversationId: opaqueId(input.conversation_id, `${path}.conversation_id`),
    role,
    text
  }
}

function parseRun(value: unknown, path = 'agent_run'): AgentRun {
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'conversation_id',
    'input_message_id',
    'capability',
    'status',
    'output_message_id',
    'proposal_refs',
    'pending_approval_id',
    'usage',
    'problem'
  ])
  const resource = parseResourceFields(input, path)
  opaqueId(input.workspace_id, `${path}.workspace_id`)
  if (input.capability !== 'resume_edit') {
    throw new ApiV2ContractError(`API v2 field ${path}.capability must be resume_edit.`)
  }
  const status = boundedString(input.status, `${path}.status`, 1, 30)
  if (
    status !== 'queued' &&
    status !== 'running' &&
    status !== 'waiting_for_approval' &&
    status !== 'waiting_for_proposal_decision' &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'cancelled'
  ) {
    throw new ApiV2ContractError(`API v2 field ${path}.status is invalid.`)
  }
  return {
    id: resource.id,
    conversationId: opaqueId(input.conversation_id, `${path}.conversation_id`),
    inputMessageId: opaqueId(input.input_message_id, `${path}.input_message_id`),
    status,
    outputMessageId:
      input.output_message_id === null
        ? null
        : opaqueId(input.output_message_id, `${path}.output_message_id`),
    proposalIds: arrayBetween(input.proposal_refs, `${path}.proposal_refs`, 0, 200).map(
      (reference, index) => {
        const parsed = parseResourceReference(reference, `${path}.proposal_refs[${index}]`)
        if (parsed.resource_type !== 'resume_proposal') {
          throw new ApiV2ContractError(
            `API v2 field ${path}.proposal_refs[${index}] must reference a Resume Proposal.`
          )
        }
        return parsed.id
      }
    ),
    problem:
      input.problem === null
        ? null
        : parseProblemDetails(
            input.problem,
            boundedInteger(
              record(input.problem, `${path}.problem`).status,
              `${path}.problem.status`,
              400,
              599
            )
          )
  }
}

function entityTag(headers: Headers, path: string): string {
  return strongEntityTag(headers.get('etag'), path)
}

/** @brief 创建只读 Resume Agent 的严格 API v2 消费者 / Create the strict API v2 consumer for the read-only Resume Agent. */
export function createResumeAssistantAgentApi(
  client: ApiV2Client & ApiV2WriteClient
): ResumeAssistantAgentApi {
  return {
    async listConversations(workspaceId, signal) {
      const validatedWorkspaceId = opaqueId(workspaceId, 'request.workspace_id')
      const response = await client.getJson(
        `/workspaces/${encodeURIComponent(validatedWorkspaceId)}/conversations`,
        { query: { limit: 200 }, ...(signal === undefined ? {} : { signal }) }
      )
      const body = exactRecord(response.data, 'conversation_list', ['items', 'page'])
      parseCursorPage(body.page, 'conversation_list.page')
      return arrayBetween(body.items, 'conversation_list.items', 0, 200).map((item, index) =>
        parseConversation(item, `conversation_list.items[${index}]`)
      )
    },
    async createConversation(workspaceId, title, key, signal) {
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(workspaceId, 'request.workspace_id'))}/conversations`,
        { capability: 'resume_edit', title: boundedString(title, 'request.title', 1, 300) },
        {
          idempotencyKey: key,
          maxRequestBytes: 4096,
          maxResponseBytes: 64 * 1024,
          ...(signal === undefined ? {} : { signal }),
          successKind: 'created-resource'
        }
      )
      return {
        value: parseConversation(response.data),
        entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag')
      }
    },
    async getConversation(workspaceId, conversationId, signal) {
      const response = await client.getJson(
        `/workspaces/${encodeURIComponent(opaqueId(workspaceId, 'request.workspace_id'))}/conversations/${encodeURIComponent(opaqueId(conversationId, 'request.conversation_id'))}`,
        signal === undefined ? undefined : { signal }
      )
      return {
        value: parseConversation(response.data),
        entityTag: entityTag(response.headers, 'response.headers.ETag')
      }
    },
    async listMessages(workspaceId, conversationId, signal) {
      const response = await client.getJson(
        `/workspaces/${encodeURIComponent(opaqueId(workspaceId, 'request.workspace_id'))}/conversations/${encodeURIComponent(opaqueId(conversationId, 'request.conversation_id'))}/messages`,
        { query: { limit: 200 }, ...(signal === undefined ? {} : { signal }) }
      )
      const body = exactRecord(response.data, 'message_list', ['items', 'page'])
      parseCursorPage(body.page, 'message_list.page')
      return arrayBetween(body.items, 'message_list.items', 0, 200).map((item, index) =>
        parseMessage(item, `message_list.items[${index}]`)
      )
    },
    async createMessage(workspaceId, conversationId, etag, text, key, signal) {
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(workspaceId, 'request.workspace_id'))}/conversations/${encodeURIComponent(opaqueId(conversationId, 'request.conversation_id'))}/messages`,
        {
          parent_message_id: null,
          content: [{ type: 'text', text: boundedString(text, 'request.text', 1, 2000) }]
        },
        {
          idempotencyKey: key,
          ifMatch: strongEntityTag(etag, 'request.headers.If-Match'),
          maxRequestBytes: 16 * 1024,
          maxResponseBytes: 256 * 1024,
          ...(signal === undefined ? {} : { signal }),
          successKind: 'created-resource'
        }
      )
      return parseMessage(response.data)
    },
    async createRun(input) {
      const knowledgeSourceIds = input.knowledgeSourceIds.map((sourceId, index) =>
        opaqueId(sourceId, `request.knowledge_source_ids[${index}]`)
      )
      if (
        knowledgeSourceIds.length > 200 ||
        new Set(knowledgeSourceIds).size !== knowledgeSourceIds.length
      ) {
        throw new ApiV2ContractError(
          'Resume assistant Knowledge sources must be unique and at most 200.'
        )
      }
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(input.workspaceId, 'request.workspace_id'))}/agent-runs`,
        {
          conversation_id: opaqueId(input.conversationId, 'request.conversation_id'),
          input_message_id: opaqueId(input.inputMessageId, 'request.input_message_id'),
          capability: 'resume_edit',
          context_refs: [
            {
              resource_type: 'resume',
              id: opaqueId(input.resumeId, 'request.resume_id'),
              revision: input.resumeRevision
            }
          ],
          knowledge: {
            mode: knowledgeSourceIds.length === 0 ? 'none' : 'explicit',
            include_source_ids: knowledgeSourceIds,
            exclude_source_ids: [],
            pinned_versions: [],
            agent_scope: 'resume_assistant'
          },
          inference: {
            quality_tier: 'balanced',
            latency_budget_ms: 60_000,
            cost_tier: 'standard',
            data_region: 'global',
            allow_provider_fallback: false,
            allow_external_model_processing: true
          },
          output_modes: input.allowedOutputModes,
          response_locale: input.locale
        },
        {
          idempotencyKey: input.idempotencyKey,
          maxRequestBytes: 32 * 1024,
          maxResponseBytes: 256 * 1024,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          successKind: 'created-resource'
        }
      )
      return parseRun(response.data)
    },
    async getRun(workspaceId, runId, signal) {
      const response = await client.getJson(
        `/workspaces/${encodeURIComponent(opaqueId(workspaceId, 'request.workspace_id'))}/agent-runs/${encodeURIComponent(opaqueId(runId, 'request.run_id'))}`,
        signal === undefined ? undefined : { signal }
      )
      return parseRun(response.data)
    }
  }
}
