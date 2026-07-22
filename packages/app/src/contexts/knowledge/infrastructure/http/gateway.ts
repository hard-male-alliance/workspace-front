/** @file KnowledgeSource HTTP Gateway / KnowledgeSource HTTP Gateway. */

import type { KnowledgeGateway } from '../../application/gateway'
import type { UiKnowledgeVisibilityUpdateInput } from '../../application/commands'
import type { UiKnowledgeSource, UiKnowledgeVisibilityModel } from '../../domain/models'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import {
  HttpContractError,
  parseStrongEntityTag,
  toHttpCommandOutcomeUnknownError
} from '../../../../infrastructure/http/http-client'
import { mapKnowledgeSourceDto } from './mappers'
import { parseKnowledgeSourceDto, parseKnowledgeSourceListDto } from './validators'

/** @brief KnowledgeSource HTTP Gateway / KnowledgeSource HTTP Gateway. */
export class HttpKnowledgeGateway implements KnowledgeGateway {
  readonly #client: HttpClient

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
    if (source.id !== sourceId) {
      throw new HttpContractError(
        'Backend returned a different KnowledgeSource than requested.',
        response.status
      )
    }
    /** @brief 服务端返回的当前资源 ETag / Current resource ETag returned by the backend. */
    const etag = response.headers.get('ETag')
    if (etag === null) {
      throw new HttpContractError(
        'Backend KnowledgeSource response is missing the ETag required for updates.',
        response.status
      )
    }
    return {
      availableAgentScopes: [
        ...new Set(source.visibility.agentGrants.map((grant) => grant.agentScope))
      ],
      concurrencyToken: parseStrongEntityTag(etag, 'response.headers.ETag', response.status),
      source
    }
  }

  /** @inheritdoc */
  async updateKnowledgeVisibility(
    input: UiKnowledgeVisibilityUpdateInput
  ): Promise<UiKnowledgeVisibilityModel> {
    /** @brief 是否已经收到服务端的成功更新响应 / Whether a successful update response has already arrived. */
    let responseReceived = false
    try {
      const response = await this.#client.patchJson(
        `/knowledge-sources/${encodeURIComponent(input.sourceId)}`,
        {
          visibility: {
            agent_grants: input.visibility.agentGrants.map((grant) => ({
              agent_scope: grant.agentScopeCode,
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
        {
          ifMatch: input.concurrencyToken,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        }
      )
      responseReceived = true
      /** @brief 已验证的更新后来源 / Validated source after the update. */
      const source = mapKnowledgeSourceDto(parseKnowledgeSourceDto(response.data))
      if (source.id !== input.sourceId) {
        throw new HttpContractError(
          'Backend updated a different KnowledgeSource than requested.',
          response.status
        )
      }
      /** @brief 更新后资源的新 ETag / New ETag for the updated resource. */
      const nextEtag = response.headers.get('ETag')
      if (nextEtag === null) {
        throw new HttpContractError(
          'Backend KnowledgeSource update response is missing ETag.',
          response.status
        )
      }
      return {
        availableAgentScopes: [
          ...new Set(source.visibility.agentGrants.map((grant) => grant.agentScope))
        ],
        concurrencyToken: parseStrongEntityTag(nextEtag, 'response.headers.ETag', response.status),
        source
      }
    } catch (error: unknown) {
      if (responseReceived) throw toHttpCommandOutcomeUnknownError(error)
      throw error
    }
  }
}
