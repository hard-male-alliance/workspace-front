/** @file KnowledgeSource 只读 HTTP Gateway / Read-only KnowledgeSource HTTP Gateway. */

import type {
  KnowledgeGateway,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiWorkspaceId
} from '../../domain'
import type { HttpClient } from './http-client'
import { mapKnowledgeSourceDto } from './mappers'
import { parseKnowledgeSourceDto, parseKnowledgeSourceListDto } from './validators'

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
}
