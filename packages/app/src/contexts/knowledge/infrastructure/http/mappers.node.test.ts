import { describe, expect, it } from 'vitest'

import type {
  KnowledgeIngestionJobDto,
  KnowledgeSearchResultDto,
  KnowledgeSourceDto
} from './transport-types'
import {
  mapKnowledgeIngestionJobDto,
  mapKnowledgeSearchResultDto,
  mapKnowledgeSourceDto
} from './mappers'

describe('mapKnowledgeSourceDto', (): void => {
  it('maps ingestion counts, visibility and a safe origin label', (): void => {
    const dto: KnowledgeSourceDto = {
      config: { resume_id: 'res_example', revision_mode: 'latest', source_type: 'resume' },
      created_at: '2026-07-19T00:00:00Z',
      enabled: true,
      id: 'ks_example',
      ingestion: {
        chunk_count: 3,
        document_count: 1,
        last_success_at: '2026-07-19T00:01:00Z',
        status: 'ready'
      },
      name: '我的简历',
      revision: 1,
      source_type: 'resume',
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
      workspace_id: 'ws_example'
    }

    const result = mapKnowledgeSourceDto(dto)

    expect(result).toMatchObject({
      chunkCount: 3,
      documentCount: 1,
      id: 'ks_example',
      ingestionStatus: 'ready',
      originLabel: 'res_example',
      sourceType: 'resume',
      workspaceId: 'ws_example'
    })
    expect(result.visibility.agentGrants[0]).toEqual({
      agentScope: 'resume_assistant',
      allowedOperations: ['retrieve', 'derive'],
      effect: 'allow'
    })
  })
})

describe('Knowledge ingestion and search mappings', (): void => {
  it('maps a failed ingestion Job into a safe domain status', (): void => {
    const dto: KnowledgeIngestionJobDto = {
      created_at: '2026-07-20T00:00:00Z',
      error: {
        code: 'knowledge.file_encoding_invalid',
        detail: 'The file is not valid UTF-8.',
        status: 422,
        title: 'Knowledge file encoding is invalid'
      },
      expires_at: null,
      finished_at: '2026-07-20T00:01:00Z',
      id: 'job_knowledge_12345678',
      job_type: 'knowledge.ingest',
      progress: { completed_units: 0, percent: null, phase: 'processing', total_units: 1 },
      request_id: 'request_12345678',
      source_id: 'source_knowledge_12345678',
      source_version_id: 'version_knowledge_12345678',
      started_at: '2026-07-20T00:00:10Z',
      stats: { chunks: 0, documents: 0, embedded_tokens: 0, skipped: 1 },
      status: 'failed'
    }

    expect(mapKnowledgeIngestionJobDto(dto)).toMatchObject({
      errorCode: 'knowledge.file_encoding_invalid',
      id: 'job_knowledge_12345678',
      progressPercent: null,
      sourceId: 'source_knowledge_12345678',
      status: 'failed'
    })
  })

  it('formats a safe line locator for a Knowledge search result', (): void => {
    const dto: KnowledgeSearchResultDto = {
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

    expect(mapKnowledgeSearchResultDto(dto)).toEqual({
      id: 'result_knowledge_12345678',
      locatorLabel: 'notes.md · lines 12–18',
      quote: 'A grounded result.',
      score: 0.9,
      sourceId: 'source_knowledge_12345678',
      title: 'notes.md'
    })
  })
})
