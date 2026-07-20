/** @file Knowledge HTTP Gateway / Knowledge HTTP gateway. */

import type { KnowledgeGateway } from '../../domain'
import type {
  UiAgentScope,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiWorkspaceId
} from '../../domain'
import type { ApiClient, ApiResponse } from './api-client'
import type { CursorPageResponseDto, KnowledgeSourceDto } from './dto'
import { mapKnowledgeSource } from './mappers'

/** @brief 后端已声明的 Agent 作用域 / Agent scopes declared by the backend contract. */
const AGENT_SCOPES: readonly UiAgentScope[] = [
  'resume_assistant',
  'job_fit_analyst',
  'interview_agent',
  'interview_reporter',
  'general_chat',
  'portfolio_assistant'
]

/** @brief 通过正式 REST API 读取 KnowledgeSource / Read KnowledgeSources via the formal REST API. */
export class HttpKnowledgeGateway implements KnowledgeGateway {
  /** @brief 共享 API 客户端 / Shared API client. */
  private readonly api: ApiClient

  /**
   * @brief 构造 Knowledge HTTP Gateway / Construct a Knowledge HTTP gateway.
   * @param api 共享 API 客户端 / Shared API client.
   */
  constructor(api: ApiClient) {
    this.api = api
  }

  /** @inheritdoc */
  async listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]> {
    void workspaceId
    const items: UiKnowledgeSource[] = []
    let cursor: string | null = null
    do {
      const response: ApiResponse<CursorPageResponseDto<KnowledgeSourceDto>> =
        await this.api.request('/knowledge-sources', { query: { limit: 100, cursor } })
      items.push(...response.data.items.map(mapKnowledgeSource))
      cursor = response.data.page.has_more ? response.data.page.next_cursor : null
    } while (cursor !== null)
    return items
  }

  /** @inheritdoc */
  async getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel> {
    const response = await this.api.request<KnowledgeSourceDto>(
      `/knowledge-sources/${encodeURIComponent(sourceId)}`
    )
    return { source: mapKnowledgeSource(response.data), availableAgentScopes: AGENT_SCOPES }
  }
}
