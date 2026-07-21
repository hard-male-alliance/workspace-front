/** @file Knowledge 内存 adapter 测试 / Knowledge in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import type { KnowledgeUploadFile } from '../../application/commands'
import { MOCK_KNOWLEDGE_SOURCES, MOCK_KNOWLEDGE_WORKSPACE_ID } from './data'
import { MockKnowledgeGateway } from './gateway'

/**
 * @brief 构造内存 adapter 使用的结构化文件 / Build a structured file for the memory adapter.
 * @param contents 文件文本 / File text.
 * @param name 文件名 / Filename.
 * @param type MIME 类型 / MIME type.
 * @return 结构化上传文件 / Structured upload file.
 */
function uploadFile(contents: string, name: string, type: string): KnowledgeUploadFile {
  const bytes = new TextEncoder().encode(contents)
  return {
    arrayBuffer: (): Promise<ArrayBuffer> =>
      Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    name,
    size: bytes.byteLength,
    type
  }
}

describe('MockKnowledgeGateway', () => {
  it('serves a visibility projection for every linked Mock knowledge source', async () => {
    /** @brief 知识 Mock 网关 / Knowledge Mock gateway. */
    const knowledgeGateway = new MockKnowledgeGateway()
    /** @brief 各来源的可见性投影 / Visibility projections for all sources. */
    const visibilityModels = await Promise.all(
      MOCK_KNOWLEDGE_SOURCES.map((source) => knowledgeGateway.getKnowledgeVisibility(source.id))
    )

    expect(visibilityModels.map((model) => model.source.id)).toEqual(
      MOCK_KNOWLEDGE_SOURCES.map((source) => source.id)
    )
  })

  it('uploads and completes a deterministic Mock knowledge file', async () => {
    const knowledgeGateway = new MockKnowledgeGateway()

    const accepted = await knowledgeGateway.uploadKnowledgeSource({
      file: uploadFile('knowledge', 'notes.md', 'text/markdown'),
      name: 'Project notes'
    })

    expect(accepted.source).toMatchObject({
      name: 'Project notes',
      originLabel: 'notes.md',
      ingestionStatus: 'queued'
    })
    expect(accepted.ingestionJob.status).toBe('queued')

    const completed = await knowledgeGateway.getKnowledgeIngestionJob(accepted.ingestionJob.id)
    const sources = await knowledgeGateway.listKnowledgeSources(MOCK_KNOWLEDGE_WORKSPACE_ID)

    expect(completed.status).toBe('succeeded')
    expect(sources.find((source) => source.id === accepted.source.id)?.ingestionStatus).toBe(
      'ready'
    )
  })

  it('keeps a source ID stable when uploading a Mock knowledge version', async () => {
    const knowledgeGateway = new MockKnowledgeGateway()
    const source = MOCK_KNOWLEDGE_SOURCES[0]

    if (source === undefined) {
      throw new Error('Expected a Mock knowledge source.')
    }

    const accepted = await knowledgeGateway.uploadKnowledgeSourceVersion({
      sourceId: source.id,
      file: uploadFile('updated', 'resume-v2.md', 'text/markdown')
    })

    expect(accepted.source.id).toBe(source.id)
    expect(accepted.ingestionJob.sourceId).toBe(source.id)
  })

  it('returns source-linked Mock knowledge search results', async () => {
    const knowledgeGateway = new MockKnowledgeGateway()
    const source = MOCK_KNOWLEDGE_SOURCES[0]

    if (source === undefined) {
      throw new Error('Expected a Mock knowledge source.')
    }

    const results = await knowledgeGateway.searchKnowledge({
      query: 'platform engineering',
      sourceIds: [source.id]
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ sourceId: source.id, title: source.name })
  })

  it('honors an aborted signal for Mock knowledge jobs', async () => {
    const knowledgeGateway = new MockKnowledgeGateway()
    const controller = new AbortController()
    controller.abort()

    await expect(
      knowledgeGateway.getKnowledgeIngestionJob(
        'mock-job' as Parameters<MockKnowledgeGateway['getKnowledgeIngestionJob']>[0],
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
