import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import type { KnowledgeUploadFile } from '../../application/commands'
import { HttpKnowledgeGateway } from './gateway'

/**
 * @brief 构造不依赖 DOM File 的上传值 / Build an upload value without depending on DOM File.
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

function fetchBody(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const body = fetchImpl.mock.calls[callIndex]?.[1]?.body
  if (typeof body !== 'string') throw new Error('Expected a string request body.')
  return body
}

function fetchUrl(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const input = fetchImpl.mock.calls[callIndex]?.[0]
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  throw new Error('Expected a fetch request URL.')
}

function knowledgeSource(id: string): Record<string, unknown> {
  return {
    config: { resume_id: 'res_example', revision_mode: 'latest', source_type: 'resume' },
    created_at: '2026-07-19T00:00:00Z',
    enabled: true,
    extensions: {},
    id,
    ingestion: {
      active_job_id: null,
      chunk_count: 3,
      document_count: 1,
      indexed_version_id: 'ksv_example',
      last_error: null,
      last_success_at: '2026-07-19T00:01:00Z',
      status: 'ready'
    },
    name: id,
    revision: 1,
    source_type: 'resume',
    sync_schedule: null,
    updated_at: '2026-07-19T00:01:00Z',
    visibility: {
      agent_grants: [
        {
          agent_scope: 'resume_assistant',
          allowed_operations: ['retrieve'],
          effect: 'allow'
        }
      ],
      allow_external_model_processing: false,
      allowed_model_regions: ['cn'],
      default_effect: 'deny',
      policy_version: 1,
      retention_days: null,
      sensitivity: 'confidential',
      session_override_allowed: false
    },
    workspace_id: 'ws_example'
  }
}

function knowledgeJob(status = 'queued'): Record<string, unknown> {
  return {
    created_at: '2026-07-20T00:00:00Z',
    error: null,
    expires_at: null,
    extensions: {},
    finished_at: null,
    id: 'job_knowledge_12345678',
    job_type: 'knowledge.ingest',
    progress: {
      completed_units: status === 'succeeded' ? 1 : 0,
      message: null,
      percent: status === 'succeeded' ? 100 : 0,
      phase: status === 'succeeded' ? 'done' : 'queued',
      total_units: 1
    },
    request_id: 'request_12345678',
    source_id: 'source_knowledge_12345678',
    source_version_id: 'version_knowledge_12345678',
    started_at: null,
    stats: { chunks: 0, documents: 0, embedded_tokens: 0, skipped: 0 },
    status
  }
}

describe('HttpKnowledgeGateway', (): void => {
  it('maps formal KnowledgeSource pages without sending browser identity headers', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [knowledgeSource('ks_example')],
        page: { has_more: false, next_cursor: null, total_estimate: 1 }
      })
    )
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const sources = await gateway.listKnowledgeSources('ws_example' as never)

    expect(sources[0]).toMatchObject({ id: 'ks_example', ingestionStatus: 'ready' })
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('headers.X-Mock-Workspace-Id')
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('headers.X-AIWS-Workspace-Id')
  })

  it('uploads a new file source with multipart and an idempotency key', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ingestion_job: knowledgeJob(),
          source: {
            ...knowledgeSource('source_knowledge_12345678'),
            config: { filename: 'notes.md', source_type: 'file' },
            source_type: 'file'
          }
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 }
      )
    )
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    const file = uploadFile('hello', 'notes.md', 'text/markdown')

    const result = await gateway.uploadKnowledgeSource({ file, name: 'Study notes' })

    expect(fetchUrl(fetchImpl, 0)).toBe('http://127.0.0.1:8000/api/v1/knowledge-sources/uploads')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^knowledge_upload_/u)
    expect(headers).not.toHaveProperty('Content-Type')
    const body = fetchImpl.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('file')).toMatchObject({
      name: file.name,
      size: file.size,
      type: file.type
    })
    expect(body.get('name')).toBe('Study notes')
    expect(result).toMatchObject({
      ingestionJob: { status: 'queued' },
      source: { id: 'source_knowledge_12345678', sourceType: 'file' }
    })
  })

  it('uploads a new version using the real encoded source id', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ingestion_job: knowledgeJob(),
          source: {
            ...knowledgeSource('source / knowledge'),
            config: { filename: 'notes.md', source_type: 'file' },
            source_type: 'file'
          }
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 }
      )
    )
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await gateway.uploadKnowledgeSourceVersion({
      file: uploadFile('new', 'notes.md', 'text/markdown'),
      sourceId: 'source / knowledge' as never
    })

    expect(fetchUrl(fetchImpl, 0)).toBe(
      'http://127.0.0.1:8000/api/v1/knowledge-sources/source%20%2F%20knowledge/versions'
    )
    expect((fetchImpl.mock.calls[0]?.[1]?.body as FormData).has('name')).toBe(false)
  })

  it('reads an ingestion Job with the supplied cancellation signal', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(knowledgeJob()))
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    const controller = new AbortController()

    const job = await gateway.getKnowledgeIngestionJob(
      'job_knowledge_12345678' as never,
      controller.signal
    )

    expect(fetchUrl(fetchImpl, 0)).toBe(
      'http://127.0.0.1:8000/api/v1/knowledge-ingestion-jobs/job_knowledge_12345678'
    )
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal })
    expect(job).toMatchObject({ sourceId: 'source_knowledge_12345678', status: 'queued' })
  })

  it('posts the formal KnowledgeSearchRequest and maps citations', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [
          {
            citation: {
              citation_id: 'citation_knowledge_12345678',
              locator: {
                line_end: 18,
                line_start: 12,
                page: null,
                path: 'notes.md',
                symbol: null,
                time_end_ms: null,
                time_start_ms: null
              },
              quote: 'A grounded result.',
              score: 0.9,
              source_id: 'source_knowledge_12345678',
              source_version_id: 'version_knowledge_12345678',
              title: 'notes.md',
              uri: null
            },
            metadata: {},
            result_id: 'result_knowledge_12345678',
            score: 0.9,
            text: 'A grounded result.'
          }
        ]
      })
    )
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const results = await gateway.searchKnowledge({
      query: 'vector database',
      sourceIds: ['source_knowledge_12345678' as never]
    })

    expect(fetchUrl(fetchImpl, 0)).toBe('http://127.0.0.1:8000/api/v1/knowledge-searches')
    expect(JSON.parse(fetchBody(fetchImpl, 0))).toEqual({
      filters: {},
      include_quotes: true,
      query: 'vector database',
      selection: {
        agent_scope: 'general_chat',
        exclude_source_ids: [],
        include_source_ids: ['source_knowledge_12345678'],
        mode: 'explicit',
        pinned_versions: []
      },
      top_k: 20
    })
    expect(results[0]).toMatchObject({ locatorLabel: 'notes.md · lines 12–18' })
  })
})
