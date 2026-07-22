/** @file Knowledge 的内存 adapter / In-memory adapter for Knowledge. */

import type { KnowledgeGateway } from '../../application/gateway'
import type { UiKnowledgeVisibilityUpdateInput } from '../../application/commands'
import type { UiKnowledgeSource, UiKnowledgeVisibilityModel } from '../../domain/models'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import {
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_VISIBILITY,
  MOCK_KNOWLEDGE_WORKSPACE_ID
} from './data'

/**
 * @brief Knowledge 自动化测试内存适配器 / In-memory adapter for automated Knowledge tests.
 * @note 仅从测试入口导出，不模拟上传或索引能力。 / Exported only from the testing entry point and does not emulate upload or indexing capabilities.
 */
export class InMemoryKnowledgeGateway implements KnowledgeGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
  /** @brief 当前实例拥有的可变知识来源投影 / Mutable knowledge-source projection owned by this instance. */
  private knowledgeSources: UiKnowledgeSource[] = cloneMemoryValue([...MOCK_KNOWLEDGE_SOURCES])

  /**
   * @brief 构造 Knowledge 内存测试网关 / Construct the Knowledge in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.options = options
  }

  /**
   * @brief 列出 Mock 知识来源 / List Mock knowledge sources.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 知识来源 / Mock knowledge sources.
   */
  async listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== MOCK_KNOWLEDGE_WORKSPACE_ID) {
      return []
    }

    return cloneMemoryValue(this.knowledgeSources)
  }

  /**
   * @brief 获取 Mock 知识可见性设置 / Get Mock knowledge-visibility settings.
   * @param sourceId 知识来源 ID / Knowledge source ID.
   * @return Mock 可见性页面数据 / Mock visibility-page data.
   */
  async getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel> {
    const mode = await prepareMemoryRead(this.options)
    /** @brief 与路由来源 ID 匹配的 Mock 来源 / Mock source matching the route source ID. */
    const source = this.knowledgeSources.find((candidate) => candidate.id === sourceId)

    if (mode === 'empty' || source === undefined) {
      return throwMemoryNotFound('knowledge visibility')
    }

    return cloneMemoryValue({
      source,
      availableAgentScopes: MOCK_KNOWLEDGE_VISIBILITY.availableAgentScopes
    })
  }

  /**
   * @brief 为测试更新内存中的知识可见性策略 / Update the in-memory knowledge visibility policy for tests.
   * @param input 可见性更新输入 / Visibility update input.
   * @return 更新后的可见性页面模型 / Updated visibility-page model.
   */
  updateKnowledgeVisibility(
    input: UiKnowledgeVisibilityUpdateInput
  ): Promise<UiKnowledgeVisibilityModel> {
    this.throwIfAborted(input.signal)
    /** @brief 目标来源在内存集合中的位置 / Target source position in the memory collection. */
    const sourceIndex = this.knowledgeSources.findIndex(
      (candidate) => candidate.id === input.sourceId
    )
    if (sourceIndex < 0) return throwMemoryNotFound('knowledge visibility')
    /** @brief 当前测试来源 / Current test source. */
    const source = this.knowledgeSources[sourceIndex]!
    /** @brief 更新后的测试来源 / Updated test source. */
    const updatedSource: UiKnowledgeSource = {
      ...source,
      visibility: cloneMemoryValue(input.visibility)
    }
    this.knowledgeSources[sourceIndex] = updatedSource
    return Promise.resolve(
      cloneMemoryValue({
        availableAgentScopes: MOCK_KNOWLEDGE_VISIBILITY.availableAgentScopes,
        source: updatedSource
      })
    )
  }

  /** @brief 在 Mock 边界遵守请求取消 / Honor request cancellation at the Mock boundary. */
  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted === true) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  }
}
