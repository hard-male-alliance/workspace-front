/** @file Knowledge 文件摄取与混合搜索 API v2 消费者 / API v2 consumer for Knowledge file ingestion and hybrid search. */

import type { ApiV2Client, ApiV2WriteClient } from '../http/client'
import {
  arrayBetween,
  boundedInteger,
  boundedString,
  exactRecord,
  networkUrl,
  opaqueId,
  record,
  timestamp
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseAcceptedWorkspaceJob } from '../jobs/accepted-job'
import { getWorkspaceJob, type Job } from '../jobs/job'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'
import {
  createWorkspaceKnowledgeSource,
  type CreatedKnowledgeSourceRepresentation
} from './knowledge-source-client'
import type { KnowledgeVisibilityPolicy } from './knowledge-source'

function sha256Digest(value: unknown, path: string): string {
  const digest = boundedString(value, path, 64, 64)
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a lowercase SHA-256 digest.`)
  }
  return digest
}

export interface KnowledgeUploadSession {
  readonly id: string
  readonly workspaceId: string
  readonly status: 'created' | 'uploaded' | 'verifying' | 'completed' | 'failed' | 'expired'
  readonly method: 'PUT'
  readonly uploadUrl: string
  readonly requiredHeaders: Readonly<Record<string, string>>
  readonly expiresAt: string
  readonly artifactRef: ResourceReference | null
}

export interface KnowledgeCitationResult {
  readonly sourceId: string
  readonly versionId: string
  readonly locator: string
  readonly quote: string
  readonly score: number
}

export interface KnowledgeSearchResult {
  readonly query: string
  readonly citations: readonly KnowledgeCitationResult[]
  readonly policyVersion: number
}

export interface KnowledgeWorkflowApi {
  createUploadSession(input: {
    readonly workspaceId: string
    readonly filename: string
    readonly mediaType: string
    readonly sizeBytes: number
    readonly sha256: string
    readonly idempotencyKey: string
    readonly signal?: AbortSignal
  }): Promise<KnowledgeUploadSession>
  completeUploadSession(input: {
    readonly workspaceId: string
    readonly uploadId: string
    readonly sizeBytes: number
    readonly sha256: string
    readonly idempotencyKey: string
    readonly signal?: AbortSignal
  }): Promise<KnowledgeUploadSession>
  createFileSource(input: {
    readonly workspaceId: string
    readonly uploadId: string
    readonly name: string
    readonly visibility: KnowledgeVisibilityPolicy
    readonly idempotencyKey: string
    readonly signal?: AbortSignal
  }): Promise<CreatedKnowledgeSourceRepresentation>
  createIngestionJob(input: {
    readonly workspaceId: string
    readonly sourceId: string
    readonly idempotencyKey: string
    readonly signal?: AbortSignal
  }): Promise<{ readonly job: Job; readonly entityTag: string }>
  getJob(
    workspaceId: string,
    jobId: string,
    signal?: AbortSignal
  ): Promise<{ readonly job: Job; readonly entityTag: string }>
  search(input: {
    readonly workspaceId: string
    readonly query: string
    readonly sourceIds: readonly string[]
    readonly signal?: AbortSignal
  }): Promise<KnowledgeSearchResult>
}

function parseUploadSession(value: unknown): KnowledgeUploadSession {
  const input = exactRecord(value, 'upload_session', [
    'id',
    'workspace_id',
    'status',
    'method',
    'upload_url',
    'required_headers',
    'expires_at',
    'artifact_ref'
  ])
  const status = boundedString(input.status, 'upload_session.status', 1, 20)
  if (
    status !== 'created' &&
    status !== 'uploaded' &&
    status !== 'verifying' &&
    status !== 'completed' &&
    status !== 'failed' &&
    status !== 'expired'
  ) {
    throw new ApiV2ContractError('API v2 field upload_session.status is invalid.')
  }
  if (input.method !== 'PUT') {
    throw new ApiV2ContractError('API v2 field upload_session.method must be PUT.')
  }
  const rawHeaders = record(input.required_headers, 'upload_session.required_headers')
  if (Object.keys(rawHeaders).length > 20) {
    throw new ApiV2ContractError('API v2 upload_session.required_headers exceeds 20 entries.')
  }
  const requiredHeaders = Object.fromEntries(
    Object.entries(rawHeaders).map(([key, headerValue]) => [
      boundedString(key, 'upload_session.required_headers.key', 1, 200),
      boundedString(headerValue, `upload_session.required_headers.${key}`, 0, 2000)
    ])
  )
  return {
    artifactRef:
      input.artifact_ref === null
        ? null
        : parseResourceReference(input.artifact_ref, 'upload_session.artifact_ref'),
    expiresAt: timestamp(input.expires_at, 'upload_session.expires_at'),
    id: opaqueId(input.id, 'upload_session.id'),
    method: 'PUT',
    requiredHeaders,
    status,
    uploadUrl: networkUrl(input.upload_url, 'upload_session.upload_url'),
    workspaceId: opaqueId(input.workspace_id, 'upload_session.workspace_id')
  }
}

function parseSearchResult(value: unknown): KnowledgeSearchResult {
  const input = exactRecord(value, 'knowledge_search_result', [
    'query',
    'citations',
    'policy_version'
  ])
  return {
    citations: arrayBetween(input.citations, 'knowledge_search_result.citations', 0, 100).map(
      (item, index) => {
        const citation = exactRecord(item, `knowledge_search_result.citations[${index}]`, [
          'source_id',
          'version_id',
          'locator',
          'quote',
          'score'
        ])
        const score = citation.score
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
          throw new ApiV2ContractError(
            `API v2 field knowledge_search_result.citations[${index}].score is invalid.`
          )
        }
        return {
          locator: boundedString(
            citation.locator,
            `knowledge_search_result.citations[${index}].locator`,
            1,
            1000
          ),
          quote: boundedString(
            citation.quote,
            `knowledge_search_result.citations[${index}].quote`,
            0,
            4000
          ),
          score,
          sourceId: opaqueId(
            citation.source_id,
            `knowledge_search_result.citations[${index}].source_id`
          ),
          versionId: opaqueId(
            citation.version_id,
            `knowledge_search_result.citations[${index}].version_id`
          )
        }
      }
    ),
    policyVersion: boundedInteger(
      input.policy_version,
      'knowledge_search_result.policy_version',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    query: boundedString(input.query, 'knowledge_search_result.query', 1, 8000)
  }
}

/** @brief 创建阶段 3 Knowledge 工作流的严格 API v2 消费者 / Create the strict Stage-3 Knowledge workflow consumer. */
export function createKnowledgeWorkflowApi(
  client: ApiV2Client & ApiV2WriteClient
): KnowledgeWorkflowApi {
  return {
    async createUploadSession(input) {
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(input.workspaceId, 'request.workspace_id'))}/upload-sessions`,
        {
          filename: boundedString(input.filename, 'request.filename', 1, 300),
          media_type: boundedString(input.mediaType, 'request.media_type', 3, 200),
          sha256: sha256Digest(input.sha256, 'request.sha256'),
          size_bytes: boundedInteger(input.sizeBytes, 'request.size_bytes', 1, 10 * 1024 * 1024)
        },
        {
          idempotencyKey: input.idempotencyKey,
          maxRequestBytes: 4096,
          maxResponseBytes: 64 * 1024,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          successKind: 'created-resource'
        }
      )
      return parseUploadSession(response.data)
    },
    async completeUploadSession(input) {
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(input.workspaceId, 'request.workspace_id'))}/upload-sessions/${encodeURIComponent(opaqueId(input.uploadId, 'request.upload_id'))}/completions`,
        {
          sha256: sha256Digest(input.sha256, 'request.sha256'),
          size_bytes: boundedInteger(input.sizeBytes, 'request.size_bytes', 1, 10 * 1024 * 1024)
        },
        {
          idempotencyKey: input.idempotencyKey,
          maxRequestBytes: 4096,
          maxResponseBytes: 64 * 1024,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          successKind: 'query-result'
        }
      )
      return parseUploadSession(response.data)
    },
    async createFileSource(input) {
      return createWorkspaceKnowledgeSource(client, {
        idempotencyKey: input.idempotencyKey,
        request: {
          input: { source_type: 'file', upload_session_id: input.uploadId },
          name: input.name,
          visibility: input.visibility
        },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        workspaceId: input.workspaceId
      })
    },
    async createIngestionJob(input) {
      const workspaceId = opaqueId(input.workspaceId, 'request.workspace_id')
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-sources/${encodeURIComponent(opaqueId(input.sourceId, 'request.source_id'))}/ingestion-jobs`,
        { force: false },
        {
          idempotencyKey: input.idempotencyKey,
          maxRequestBytes: 4096,
          maxResponseBytes: 256 * 1024,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          successKind: 'accepted-resource'
        }
      )
      const parsed = parseAcceptedWorkspaceJob(response, workspaceId)
      return { entityTag: parsed.entityTag, job: parsed.value }
    },
    async getJob(workspaceId, jobId, signal) {
      const representation = await getWorkspaceJob(client, {
        jobId,
        ...(signal === undefined ? {} : { signal }),
        workspaceId
      })
      return { entityTag: representation.entityTag, job: representation.value }
    },
    async search(input) {
      const includeSourceIds = input.sourceIds.map((sourceId, index) =>
        opaqueId(sourceId, `request.source_ids[${index}]`)
      )
      if (includeSourceIds.length < 1 || includeSourceIds.length > 200) {
        throw new ApiV2ContractError('Knowledge search requires between 1 and 200 sources.')
      }
      const response = await client.postJson(
        `/workspaces/${encodeURIComponent(opaqueId(input.workspaceId, 'request.workspace_id'))}/knowledge-searches`,
        {
          query: boundedString(input.query, 'request.query', 1, 8000),
          selection: {
            agent_scope: 'general_chat',
            exclude_source_ids: [],
            include_source_ids: includeSourceIds,
            mode: 'explicit',
            pinned_versions: []
          },
          top_k: 20
        },
        {
          idempotencyKey: `knowledge_search_${globalThis.crypto.randomUUID()}`,
          maxRequestBytes: 64 * 1024,
          maxResponseBytes: 512 * 1024,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          successKind: 'query-result'
        }
      )
      return parseSearchResult(response.data)
    }
  }
}
