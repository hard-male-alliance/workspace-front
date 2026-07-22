/** @file KnowledgeSource HTTP Gateway / KnowledgeSource HTTP Gateway. */

import type { KnowledgeGateway } from '../../application/gateway'
import type { UiKnowledgeVisibilityUpdateInput } from '../../application/commands'
import type { UiKnowledgeSource, UiKnowledgeVisibilityModel } from '../../domain/models'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import { HttpContractError, HttpProblemError } from '../../../../infrastructure/http/http-client'
import { mapKnowledgeSourceDto } from './mappers'
import { parseKnowledgeSourceDto, parseKnowledgeSourceListDto } from './validators'

/** @brief KnowledgeSource HTTP Gateway / KnowledgeSource HTTP Gateway. */
export class HttpKnowledgeGateway implements KnowledgeGateway {
  readonly #client: HttpClient
  /** @brief 已读取知识来源对应的乐观并发 ETag / Optimistic-concurrency ETags for knowledge sources already read. */
  readonly #etagBySourceId = new Map<UiKnowledgeSourceId, string>()

  constructor(client: HttpClient) {
    this.#client = client
  }

  async listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]> {
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

    return results.filter((source) => source.workspaceId === workspaceId)
  }

  async getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel> {
    const response = await this.#client.getJson(
      `/knowledge-sources/${encodeURIComponent(sourceId)}`
    )
    const source = mapKnowledgeSourceDto(parseKnowledgeSourceDto(response.data))
    /** @brief 服务端返回的当前资源 ETag / Current resource ETag returned by the backend. */
    const etag = response.headers.get('ETag')
    if (etag === null) {
      throw new HttpContractError(
        'Backend KnowledgeSource response is missing the ETag required for updates.',
        response.status
      )
    }
    this.#etagBySourceId.set(source.id, etag)
    return {
      availableAgentScopes: [
        ...new Set(source.visibility.agentGrants.map((grant) => grant.agentScope))
      ],
      source
    }
  }

  /** @inheritdoc */
  async updateKnowledgeVisibility(
    input: UiKnowledgeVisibilityUpdateInput
  ): Promise<UiKnowledgeVisibilityModel> {
    /** @brief 最近读取的权威 ETag / Most recently read authoritative ETag. */
    let etag = this.#etagBySourceId.get(input.sourceId)
    if (etag === undefined) {
      await this.getKnowledgeVisibility(input.sourceId)
      etag = this.#etagBySourceId.get(input.sourceId)
    }
    if (etag === undefined) {
      throw new HttpContractError('KnowledgeSource ETag is unavailable for update.', 200)
    }

    try {
      const response = await this.#client.patchJson(
        `/knowledge-sources/${encodeURIComponent(input.sourceId)}`,
        {
          visibility: {
            agent_grants: input.visibility.agentGrants.map((grant) => ({
              agent_scope: grant.agentScope,
              allowed_operations: grant.allowedOperations,
              effect: grant.effect
            })),
            allow_external_model_processing: input.visibility.allowExternalModelProcessing,
            allowed_model_regions: input.visibility.allowedModelRegions,
            default_effect: input.visibility.defaultEffect,
            policy_version: input.visibility.policyVersion,
            retention_days: input.visibility.retentionDays,
            sensitivity: input.visibility.sensitivity,
            session_override_allowed: input.visibility.sessionOverrideAllowed
          }
        },
        { ifMatch: etag, ...(input.signal === undefined ? {} : { signal: input.signal }) }
      )
      /** @brief 已验证的更新后来源 / Validated source after the update. */
      const source = mapKnowledgeSourceDto(parseKnowledgeSourceDto(response.data))
      /** @brief 更新后资源的新 ETag / New ETag for the updated resource. */
      const nextEtag = response.headers.get('ETag')
      if (nextEtag === null) {
        throw new HttpContractError(
          'Backend KnowledgeSource update response is missing ETag.',
          response.status
        )
      }
      this.#etagBySourceId.set(source.id, nextEtag)
      return {
        availableAgentScopes: [
          ...new Set(source.visibility.agentGrants.map((grant) => grant.agentScope))
        ],
        source
      }
    } catch (error: unknown) {
      if (error instanceof HttpProblemError && error.status === 412) {
        this.#etagBySourceId.delete(input.sourceId)
        await this.getKnowledgeVisibility(input.sourceId).catch(() => undefined)
      }
      throw error
    }
  }
}
