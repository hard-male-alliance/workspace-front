/** @file Knowledge 的内存 adapter / In-memory adapter for Knowledge. */

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
import {
  asUiOpaqueId,
  type UiKnowledgeSourceId,
  type UiWorkspaceId
} from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  prepareMemoryRead,
  throwMemoryNotFound,
  type MockGatewayOptions
} from '../../../../infrastructure/memory'
import {
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_VISIBILITY,
  MOCK_KNOWLEDGE_WORKSPACE_ID
} from './data'

/**
 * @brief 知识库数据的 Mock 适配器 / Mock adapter for knowledge data.
 * @note 它只展示 KnowledgeSource 与 VisibilityPolicy 投影，不模拟上传、索引或 PATCH。
 */
export class MockKnowledgeGateway implements KnowledgeGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: MockGatewayOptions
  /** @brief 当前实例拥有的可变知识来源投影 / Mutable knowledge-source projection owned by this instance. */
  private knowledgeSources: UiKnowledgeSource[] = cloneMemoryValue([...MOCK_KNOWLEDGE_SOURCES])

  /** @brief 当前实例的摄取任务 / Ingestion Jobs owned by this instance. */
  private readonly ingestionJobs = new Map<UiKnowledgeIngestionJobId, UiKnowledgeIngestionJob>()

  /** @brief 确定性的上传序号 / Deterministic upload sequence. */
  private uploadSequence = 0

  /**
   * @brief 构造知识库 Mock 网关 / Construct the knowledge Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
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

  /** @brief 上传一个 Mock 文件知识来源 / Upload a Mock file knowledge source. */
  async uploadKnowledgeSource(input: UiKnowledgeUploadInput): Promise<UiKnowledgeUploadResult> {
    this.throwIfAborted(input.signal)
    await prepareMemoryRead(this.options)
    this.throwIfAborted(input.signal)

    const sequence = ++this.uploadSequence
    const sourceId = asUiOpaqueId<'knowledge-source'>(`mock-knowledge-source-${sequence}`)
    const source: UiKnowledgeSource = {
      id: sourceId,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID,
      name: input.name?.trim() || input.file.name,
      sourceType: 'file',
      originLabel: input.file.name,
      ingestionStatus: 'queued',
      documentCount: 0,
      chunkCount: 0,
      enabled: true,
      visibility: cloneMemoryValue(MOCK_KNOWLEDGE_SOURCES[0]!.visibility),
      lastSuccessAt: null,
      updatedAt: '2026-07-20T00:00:00.000Z'
    }
    const ingestionJob = this.createIngestionJob(sourceId, sequence)

    this.knowledgeSources = [...this.knowledgeSources, source]
    this.ingestionJobs.set(ingestionJob.id, ingestionJob)
    return cloneMemoryValue({ source, ingestionJob })
  }

  /** @brief 为已有来源上传一个 Mock 新版本 / Upload a Mock version for an existing source. */
  async uploadKnowledgeSourceVersion(
    input: UiKnowledgeVersionUploadInput
  ): Promise<UiKnowledgeUploadResult> {
    this.throwIfAborted(input.signal)
    await prepareMemoryRead(this.options)
    this.throwIfAborted(input.signal)

    const sourceIndex = this.knowledgeSources.findIndex((source) => source.id === input.sourceId)
    const current = this.knowledgeSources[sourceIndex]
    if (current === undefined) {
      return throwMemoryNotFound('knowledge source')
    }

    const sequence = ++this.uploadSequence
    const source: UiKnowledgeSource = {
      ...current,
      originLabel: input.file.name,
      ingestionStatus: 'queued',
      updatedAt: '2026-07-20T00:00:00.000Z'
    }
    const ingestionJob = this.createIngestionJob(source.id, sequence)

    this.knowledgeSources[sourceIndex] = source
    this.ingestionJobs.set(ingestionJob.id, ingestionJob)
    return cloneMemoryValue({ source, ingestionJob })
  }

  /** @brief 查询并完成一个 Mock 摄取任务 / Get and complete a Mock ingestion Job. */
  async getKnowledgeIngestionJob(
    jobId: UiKnowledgeIngestionJobId,
    signal?: AbortSignal
  ): Promise<UiKnowledgeIngestionJob> {
    this.throwIfAborted(signal)
    await prepareMemoryRead(this.options)
    this.throwIfAborted(signal)

    const current = this.ingestionJobs.get(jobId)
    if (current === undefined) {
      return throwMemoryNotFound('knowledge ingestion job')
    }

    const completed: UiKnowledgeIngestionJob = {
      ...current,
      status: 'succeeded',
      progressPercent: 100
    }
    this.ingestionJobs.set(jobId, completed)
    this.knowledgeSources = this.knowledgeSources.map((source) =>
      source.id === completed.sourceId
        ? {
            ...source,
            ingestionStatus: 'ready',
            documentCount: Math.max(source.documentCount, 1),
            chunkCount: Math.max(source.chunkCount, 1),
            lastSuccessAt: '2026-07-20T00:00:01.000Z',
            updatedAt: '2026-07-20T00:00:01.000Z'
          }
        : source
    )
    return cloneMemoryValue(completed)
  }

  /** @brief 搜索已就绪的 Mock 知识来源 / Search ready Mock knowledge sources. */
  async searchKnowledge(
    input: UiKnowledgeSearchInput
  ): Promise<readonly UiKnowledgeSearchResult[]> {
    this.throwIfAborted(input.signal)
    const mode = await prepareMemoryRead(this.options)
    this.throwIfAborted(input.signal)
    if (mode === 'empty') {
      return []
    }

    const selectedSourceIds = new Set(input.sourceIds)
    const sources = this.knowledgeSources.filter(
      (source) => selectedSourceIds.size === 0 || selectedSourceIds.has(source.id)
    )
    return cloneMemoryValue(
      sources.slice(0, 3).map((source, index) => ({
        id: `mock-search-result-${index + 1}`,
        sourceId: source.id,
        title: source.name,
        locatorLabel: source.originLabel,
        quote: `Mock result for “${input.query}” from ${source.name}.`,
        score: 1 - index * 0.1
      }))
    )
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

  /** @brief 创建确定性的排队摄取任务 / Create a deterministic queued ingestion Job. */
  private createIngestionJob(
    sourceId: UiKnowledgeSourceId,
    sequence: number
  ): UiKnowledgeIngestionJob {
    return {
      id: asUiOpaqueId<'knowledge-ingestion-job'>(`mock-knowledge-job-${sequence}`),
      sourceId,
      status: 'queued',
      progressPercent: 0,
      errorCode: null,
      errorDetail: null
    }
  }

  /** @brief 在 Mock 边界遵守请求取消 / Honor request cancellation at the Mock boundary. */
  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted === true) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  }
}
