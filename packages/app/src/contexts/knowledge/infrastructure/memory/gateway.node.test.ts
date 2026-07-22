/** @file Knowledge 内存 adapter 测试 / Knowledge in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { MOCK_KNOWLEDGE_SOURCES, MOCK_KNOWLEDGE_WORKSPACE_ID } from './data'
import { InMemoryKnowledgeGateway } from './gateway'

describe('InMemoryKnowledgeGateway', () => {
  it('serves a visibility projection for every linked Mock knowledge source', async () => {
    /** @brief 知识 Mock 网关 / Knowledge Mock gateway. */
    const knowledgeGateway = new InMemoryKnowledgeGateway()
    /** @brief 各来源的可见性投影 / Visibility projections for all sources. */
    const visibilityModels = await Promise.all(
      MOCK_KNOWLEDGE_SOURCES.map((source) => knowledgeGateway.getKnowledgeVisibility(source.id))
    )

    expect(visibilityModels.map((model) => model.source.id)).toEqual(
      MOCK_KNOWLEDGE_SOURCES.map((source) => source.id)
    )
  })

  it('lists only sources owned by the requested workspace', async () => {
    const knowledgeGateway = new InMemoryKnowledgeGateway()

    await expect(
      knowledgeGateway.listKnowledgeSources(MOCK_KNOWLEDGE_WORKSPACE_ID)
    ).resolves.toEqual(MOCK_KNOWLEDGE_SOURCES)
    await expect(knowledgeGateway.listKnowledgeSources('ws_other' as never)).resolves.toEqual([])
  })
})
