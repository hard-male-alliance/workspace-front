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

  it('rejects a KnowledgeSource read whose response belongs to another source', async (): Promise<void> => {
    /** @brief 返回其他知识来源的网络替身 / Network double returning another KnowledgeSource. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(knowledgeSource('ks_other')), {
        headers: { 'Content-Type': 'application/json', ETag: '"knowledge-other"' },
        status: 200
      })
    )
    /** @brief 被测 Knowledge Gateway / Knowledge Gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.getKnowledgeVisibility('ks_example' as never)).rejects.toMatchObject({
      name: 'HttpContractError',
      status: 200
    })
  })

  it('never pairs a stale policy body with the ETag from a newer read', async (): Promise<void> => {
    /** @brief 用户开始编辑的初始策略 / Initial policy the user began editing. */
    const initialSource = knowledgeSource('ks_example')
    /** @brief 另一管理员已经更新的权威策略 / Authoritative policy already updated by another administrator. */
    const newerSource = {
      ...initialSource,
      revision: 2,
      visibility: {
        ...(initialSource.visibility as Readonly<Record<string, unknown>>),
        allow_external_model_processing: true,
        policy_version: 2
      }
    }
    /** @brief 依次返回两个快照并拒绝旧条件令牌的网络替身 / Network double returning two snapshots and rejecting the old conditional token. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(newerSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-2"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'knowledge.precondition_failed',
            detail: null,
            retryable: false,
            status: 412,
            title: 'Knowledge policy changed',
            type: 'about:blank'
          }),
          {
            headers: { 'Content-Type': 'application/problem+json' },
            status: 412
          }
        )
      )
    /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 用户持有的初始权威模型 / Initial authoritative model held by the user. */
    const initial = await gateway.getKnowledgeVisibility('ks_example' as never)
    await gateway.getKnowledgeVisibility(initial.source.id)

    await expect(
      gateway.updateKnowledgeVisibility({
        concurrencyToken: initial.concurrencyToken,
        sourceId: initial.source.id,
        visibility: initial.source.visibility
      })
    ).rejects.toMatchObject({ name: 'HttpProblemError', status: 412 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      headers: { 'If-Match': '"knowledge-1"' },
      method: 'PATCH'
    })
  })

  it.each(['*', 'W/"knowledge-1"', '"knowledge-1", "knowledge-2"'])(
    'rejects an ETag that cannot provide strong single-resource concurrency: %s',
    async (etag): Promise<void> => {
      /** @brief 返回非法并发令牌的网络替身 / Network double returning an invalid concurrency token. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(knowledgeSource('ks_example')), {
          headers: { 'Content-Type': 'application/json', ETag: etag }
        })
      )
      /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
      const gateway = new HttpKnowledgeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )

      await expect(gateway.getKnowledgeVisibility('ks_example' as never)).rejects.toMatchObject({
        name: 'HttpContractError'
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  )

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
      concurrencyToken: initial.concurrencyToken,
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

  it('round-trips a future Agent-scope code without sending the UI unknown marker', async (): Promise<void> => {
    /** @brief 基础知识来源 / Base knowledge source. */
    const base = knowledgeSource('ks_example')
    /** @brief 含未来 Agent scope 的权威来源 / Authoritative source containing a future Agent scope. */
    const futureSource = {
      ...base,
      visibility: {
        ...(base.visibility as Record<string, unknown>),
        agent_grants: [
          {
            agent_scope: 'research_agent',
            allowed_operations: ['retrieve'],
            effect: 'allow'
          }
        ]
      }
    }
    /** @brief 依次完成读取与 PATCH 的网络替身 / Network double completing the read and PATCH. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(futureSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...futureSource, revision: 2 }), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-2"' }
        })
      )
    /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 带安全未知展示值和原始 code 的模型 / Model carrying a safe unknown display value and original code. */
    const model = await gateway.getKnowledgeVisibility('ks_example' as never)

    await gateway.updateKnowledgeVisibility({
      concurrencyToken: model.concurrencyToken,
      sourceId: model.source.id,
      visibility: model.source.visibility
    })

    expect(JSON.parse(fetchBody(fetchImpl, 1))).toMatchObject({
      visibility: { agent_grants: [{ agent_scope: 'research_agent' }] }
    })
    expect(fetchBody(fetchImpl, 1)).not.toContain('unknown:research_agent')
  })

  it('reloads an authoritative token before writing after an unknown PATCH outcome', async (): Promise<void> => {
    /** @brief 初次与重载时返回的权威来源 / Authoritative source returned initially and during reload. */
    const source = knowledgeSource('ks_example')
    /** @brief 更新成功后的来源 / Source returned after the successful update. */
    const updatedSource = {
      ...source,
      revision: 2,
      visibility: {
        ...(source.visibility as Readonly<Record<string, unknown>>),
        policy_version: 2
      }
    }
    /** @brief 依次模拟读取、断线、权威重载和成功更新 / Network double simulating read, disconnect, authority reload, and successful update. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(source), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' }
        })
      )
      .mockRejectedValueOnce(new TypeError('private connection failure'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(source), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(updatedSource), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-2"' }
        })
      )
    /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 初次读取的 UI 模型 / UI model returned by the initial read. */
    const initial = await gateway.getKnowledgeVisibility('ks_example' as never)
    /** @brief 首次结果未知的用户意图 / User intent whose first outcome is unknown. */
    const input = {
      concurrencyToken: initial.concurrencyToken,
      sourceId: initial.source.id,
      visibility: initial.source.visibility
    }

    await expect(gateway.updateKnowledgeVisibility(input)).rejects.toMatchObject({
      name: 'HttpCommandOutcomeUnknownError'
    })
    const authoritative = await gateway.getKnowledgeVisibility(input.sourceId)
    await expect(
      gateway.updateKnowledgeVisibility({
        ...input,
        concurrencyToken: authoritative.concurrencyToken,
        visibility: authoritative.source.visibility
      })
    ).resolves.toMatchObject({ source: { id: 'ks_example', visibility: { policyVersion: 2 } } })

    expect(fetchUrl(fetchImpl, 2)).toBe('http://127.0.0.1:8000/api/v1/knowledge-sources/ks_example')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('marks a successful PATCH response for another source as outcome unknown', async (): Promise<void> => {
    /** @brief 初次目标来源 / Initial target source. */
    const source = knowledgeSource('ks_example')
    /** @brief 返回另一个来源的成功 PATCH 网络替身 / Network double returning another source from a successful PATCH. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(source), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-1"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(knowledgeSource('ks_other')), {
          headers: { 'Content-Type': 'application/json', ETag: '"knowledge-2"' }
        })
      )
    /** @brief 被测 Knowledge gateway / Knowledge gateway under test. */
    const gateway = new HttpKnowledgeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 初次读取的 UI 模型 / UI model returned by the initial read. */
    const initial = await gateway.getKnowledgeVisibility('ks_example' as never)

    await expect(
      gateway.updateKnowledgeVisibility({
        concurrencyToken: initial.concurrencyToken,
        sourceId: initial.source.id,
        visibility: initial.source.visibility
      })
    ).rejects.toMatchObject({
      diagnosticKind: 'contract',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })
})
