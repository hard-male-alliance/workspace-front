/** @file KnowledgeSource 只读 HTTP Gateway / Read-only KnowledgeSource HTTP Gateway. */

import type { KnowledgeGateway } from '../../application/gateway'
import type {
  UiKnowledgeSearchInput,
  UiKnowledgeUploadInput,
  UiKnowledgeVersionUploadInput
} from '../../application/commands'
import type {
  UiKnowledgeIngestionJob,
  UiKnowledgeIngestionJobId,
  UiKnowledgeSearchResult,
  UiKnowledgeSource,
  UiKnowledgeUploadResult,
  UiKnowledgeVisibilityModel
} from '../../domain/models'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import {
  mapKnowledgeIngestionJobDto,
  mapKnowledgeSearchResultDto,
  mapKnowledgeSourceDto
} from './mappers'
import {
  parseKnowledgeFileUploadResponseDto,
  parseKnowledgeIngestionJobDto,
  parseKnowledgeSearchResponseDto,
  parseKnowledgeSourceDto,
  parseKnowledgeSourceListDto
} from './validators'

/** @brief KnowledgeSource HTTP Gateway / KnowledgeSource HTTP Gateway. */
export class HttpKnowledgeGateway implements KnowledgeGateway {
  readonly #client: HttpClient

  constructor(client: HttpClient) {
    this.#client = client
  }

  async listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]> {
    void workspaceId
    const results: UiKnowledgeSource[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    do {
      const response = await this.#client.getJson('/knowledge-sources', {
        query: { cursor, limit: 20 }
      })
      const page = parseKnowledgeSourceListDto(response.data)
      results.push(...page.items.map(mapKnowledgeSourceDto))
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new Error('Backend repeated a KnowledgeSource pagination cursor.')
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)

    return results
  }

  /** @inheritdoc */
  async uploadKnowledgeSource(input: UiKnowledgeUploadInput): Promise<UiKnowledgeUploadResult> {
    const body = new FormData()
    body.append(
      'file',
      new Blob([await input.file.arrayBuffer()], { type: input.file.type }),
      input.file.name
    )
    if (input.name !== undefined && input.name.trim().length > 0) {
      body.append('name', input.name.trim())
    }
    return this.#upload('/knowledge-sources/uploads', body, 'knowledge_upload', input.signal)
  }

  /** @inheritdoc */
  async uploadKnowledgeSourceVersion(
    input: UiKnowledgeVersionUploadInput
  ): Promise<UiKnowledgeUploadResult> {
    const body = new FormData()
    body.append(
      'file',
      new Blob([await input.file.arrayBuffer()], { type: input.file.type }),
      input.file.name
    )
    return this.#upload(
      `/knowledge-sources/${encodeURIComponent(input.sourceId)}/versions`,
      body,
      'knowledge_version',
      input.signal
    )
  }

  /** @inheritdoc */
  async getKnowledgeIngestionJob(
    jobId: UiKnowledgeIngestionJobId,
    signal?: AbortSignal
  ): Promise<UiKnowledgeIngestionJob> {
    const response = await this.#client.getJson(
      `/knowledge-ingestion-jobs/${encodeURIComponent(jobId)}`,
      {
        diagnostics: 'suppress',
        ...(signal === undefined ? {} : { signal })
      }
    )
    return mapKnowledgeIngestionJobDto(parseKnowledgeIngestionJobDto(response.data))
  }

  /** @inheritdoc */
  async searchKnowledge(
    input: UiKnowledgeSearchInput
  ): Promise<readonly UiKnowledgeSearchResult[]> {
    const response = await this.#client.postJson(
      '/knowledge-searches',
      {
        filters: {},
        include_quotes: true,
        query: input.query,
        selection: {
          agent_scope: 'general_chat',
          exclude_source_ids: [],
          include_source_ids: input.sourceIds,
          mode: 'explicit',
          pinned_versions: []
        },
        top_k: 20
      },
      input.signal === undefined ? {} : { signal: input.signal }
    )
    return parseKnowledgeSearchResponseDto(response.data).items.map(mapKnowledgeSearchResultDto)
  }

  async getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel> {
    const response = await this.#client.getJson(
      `/knowledge-sources/${encodeURIComponent(sourceId)}`
    )
    const source = mapKnowledgeSourceDto(parseKnowledgeSourceDto(response.data))
    return {
      availableAgentScopes: [
        ...new Set(source.visibility.agentGrants.map((grant) => grant.agentScope))
      ],
      source
    }
  }

  /** @brief 发送临时直接上传请求 / Send a temporary direct-upload request. */
  async #upload(
    path: string,
    body: FormData,
    idempotencyPrefix: string,
    signal?: AbortSignal
  ): Promise<UiKnowledgeUploadResult> {
    const response = await this.#client.postForm(path, body, {
      idempotencyKey: `${idempotencyPrefix}_${globalThis.crypto.randomUUID()}`,
      ...(signal === undefined ? {} : { signal })
    })
    if (response.status !== 202) {
      throw new HttpContractError('Backend did not accept the Knowledge upload.', response.status)
    }
    const dto = parseKnowledgeFileUploadResponseDto(response.data)
    return {
      ingestionJob: mapKnowledgeIngestionJobDto(dto.ingestion_job),
      source: mapKnowledgeSourceDto(dto.source)
    }
  }
}
