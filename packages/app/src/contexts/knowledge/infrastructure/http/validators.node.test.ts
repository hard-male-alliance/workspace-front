import { describe, expect, it } from 'vitest'

import { mapKnowledgeSourceDto } from './mappers'
import { parseKnowledgeSourceDto, parseKnowledgeSourceListDto } from './validators'

/**
 * @brief 构造 Schema 合法的 KnowledgeSource / Build a schema-valid KnowledgeSource.
 * @param overrides 顶层覆盖 / Top-level overrides.
 * @return KnowledgeSource JSON / KnowledgeSource JSON.
 */
function knowledgeSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    config: {
      pinned_revision: null,
      resume_id: 'res_example',
      revision_mode: 'latest',
      source_type: 'resume'
    },
    created_at: '2026-07-19T00:00:00Z',
    enabled: true,
    extensions: {},
    id: 'ks_example',
    ingestion: {
      active_job_id: null,
      chunk_count: 3,
      document_count: 1,
      indexed_version_id: 'ksv_example',
      last_error: null,
      last_success_at: '2026-07-19T00:01:00Z',
      status: 'ready'
    },
    name: '我的简历',
    revision: 1,
    source_type: 'resume',
    sync_schedule: null,
    updated_at: '2026-07-19T00:01:00Z',
    visibility: {
      agent_grants: [
        {
          agent_scope: 'resume_assistant',
          allowed_operations: ['retrieve', 'derive'],
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
    workspace_id: 'ws_example',
    ...overrides
  }
}

/**
 * @brief 构造单页列表响应 / Build a single-page list response.
 * @param item KnowledgeSource JSON / KnowledgeSource JSON.
 * @return 分页 JSON / Paginated JSON.
 */
function page(item: unknown): Record<string, unknown> {
  return {
    items: [item],
    page: { has_more: false, next_cursor: null, total_estimate: 1 }
  }
}

describe('KnowledgeSource response validators', (): void => {
  it('accepts a Resume-derived KnowledgeSource envelope', (): void => {
    /** @brief 已验证页面 / Validated page. */
    const result = parseKnowledgeSourceListDto(page(knowledgeSource()))

    expect(result.items[0]?.source_type).toBe('resume')
    expect(result.items[0]?.ingestion.chunk_count).toBe(3)
    expect(result.items[0]?.visibility.agent_grants[0]?.agent_scope).toBe('resume_assistant')
  })

  it('accepts future open-enum codes and maps them to stable safe UI identities', (): void => {
    /** @brief 基础可见性策略 / Base visibility policy. */
    const visibility = knowledgeSource().visibility as Record<string, unknown>
    /** @brief 带未来开放枚举值的 DTO / DTO carrying future open-enum values. */
    const dto = parseKnowledgeSourceDto(
      knowledgeSource({
        source_type: 'vector_database',
        visibility: {
          ...visibility,
          agent_grants: [
            {
              agent_scope: 'research_agent',
              allowed_operations: ['retrieve'],
              effect: 'allow'
            }
          ]
        }
      })
    )

    expect(mapKnowledgeSourceDto(dto)).toMatchObject({
      sourceType: 'unknown',
      visibility: {
        agentGrants: [
          {
            agentScope: 'unknown:research_agent',
            agentScopeCode: 'research_agent'
          }
        ]
      }
    })
  })

  it.each([
    ['a top-level undeclared property', knowledgeSource({ internal: true })],
    ['a malformed opaque ID', knowledgeSource({ id: 'short' })],
    ['a non-positive revision', knowledgeSource({ revision: 0 })],
    ['an invalid timestamp', knowledgeSource({ updated_at: 'now' })],
    ['an invalid open-enum code', knowledgeSource({ source_type: 'Vector Database' })],
    ['an invalid extension key', knowledgeSource({ extensions: { '?private': true } })]
  ])('rejects %s', (_label, candidate): void => {
    expect(() => parseKnowledgeSourceDto(candidate)).toThrowError()
  })

  it('rejects undeclared config and visibility properties', (): void => {
    /** @brief 基础来源 / Base source. */
    const source = knowledgeSource()
    expect(() =>
      parseKnowledgeSourceDto({
        ...source,
        config: { ...(source.config as Record<string, unknown>), password: 'private' }
      })
    ).toThrowError()
    expect(() =>
      parseKnowledgeSourceDto({
        ...source,
        visibility: { ...(source.visibility as Record<string, unknown>), inherited: true }
      })
    ).toThrowError()
  })

  it('rejects fractional counters, duplicate closed-enum values, and oversized grant arrays', (): void => {
    /** @brief 基础来源 / Base source. */
    const source = knowledgeSource()
    expect(() =>
      parseKnowledgeSourceDto({
        ...source,
        ingestion: { ...(source.ingestion as Record<string, unknown>), document_count: 1.5 }
      })
    ).toThrowError()
    expect(() =>
      parseKnowledgeSourceDto({
        ...source,
        visibility: {
          ...(source.visibility as Record<string, unknown>),
          allowed_model_regions: ['cn', 'cn']
        }
      })
    ).toThrowError()
    expect(() =>
      parseKnowledgeSourceDto({
        ...source,
        visibility: {
          ...(source.visibility as Record<string, unknown>),
          agent_grants: Array.from({ length: 101 }, () => ({
            agent_scope: 'resume_assistant',
            allowed_operations: ['retrieve'],
            effect: 'allow'
          }))
        }
      })
    ).toThrowError()
  })

  it('rejects malformed CursorPage metadata', (): void => {
    expect(() =>
      parseKnowledgeSourceListDto({
        items: [],
        page: { has_more: true, next_cursor: '' }
      })
    ).toThrowError()
    expect(() =>
      parseKnowledgeSourceListDto({
        items: [],
        page: { has_more: false, next_cursor: null, total_estimate: -1 }
      })
    ).toThrowError()
  })
})
