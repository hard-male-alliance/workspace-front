import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import { HttpKnowledgeGateway } from './gateway'

/** @brief 读取指定 JSON 请求体 / Read a JSON request body at the given call index. */
function fetchBody(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  /** @brief 请求体 / Request body. */
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

function knowledgeSource(id: string, workspaceId = 'ws_example'): Record<string, unknown> {
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
    workspace_id: workspaceId
  }
}

describe('HttpKnowledgeGateway', (): void => {
  it('maps formal KnowledgeSource pages without sending browser identity headers', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [knowledgeSource('ks_example'), knowledgeSource('ks_other', 'ws_other')],
        page: { has_more: false, next_cursor: null, total_estimate: 2 }
      })
    )
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const sources = await gateway.listKnowledgeSources('ws_example' as never)

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ id: 'ks_example', ingestionStatus: 'ready' })
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('headers.X-Mock-Workspace-Id')
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('headers.X-AIWS-Workspace-Id')
  })

  it('persists visibility through conditional Merge Patch and returns the authoritative policy', async (): Promise<void> => {
    /** @brief 初次读取的来源 DTO / Source DTO returned by the initial read. */
    const initialSource = knowledgeSource('ks_example')
    /** @brief 服务端确认更新后的来源 DTO / Source DTO confirmed by the backend after the update. */
    const updatedSource = {
      ...initialSource,
      revision: 2,
      visibility: {
        ...(initialSource.visibility as Record<string, unknown>),
        allow_external_model_processing: true,
        policy_version: 2,
        session_override_allowed: true
      }
    }
    /** @brief 依次响应读取和更新的网络替身 / Network double responding to the read and update in order. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updatedSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-2"' },
          status: 200
        })
      )
    /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 初次读取并获得 ETag 的页面模型 / Initial page model whose read obtains the ETag. */
    const initial = await gateway.getKnowledgeVisibility('ks_example' as never)

    const updated = await gateway.updateKnowledgeVisibility({
      sourceId: initial.source.id,
      visibility: {
        ...initial.source.visibility,
        allowExternalModelProcessing: true,
        policyVersion: 2,
        sessionOverrideAllowed: true
      }
    })

    expect(fetchUrl(fetchImpl, 1)).toBe('http://127.0.0.1:8000/api/v1/knowledge-sources/ks_example')
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        'Content-Type': 'application/merge-patch+json',
        'If-Match': '"knowledge-1"'
      },
      method: 'PATCH'
    })
    expect(JSON.parse(fetchBody(fetchImpl, 1))).toMatchObject({
      visibility: {
        allow_external_model_processing: true,
        policy_version: 2,
        session_override_allowed: true
      }
    })
    expect(updated.source).toMatchObject({
      id: 'ks_example',
      visibility: {
        allowExternalModelProcessing: true,
        policyVersion: 2,
        sessionOverrideAllowed: true
      }
    })
  })
})
