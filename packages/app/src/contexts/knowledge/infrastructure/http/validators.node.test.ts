import { describe, expect, it } from 'vitest'

import { HttpContractError } from '../../../../infrastructure/http/http-client'
import {
  parseKnowledgeFileUploadResponseDto,
  parseKnowledgeIngestionJobDto,
  parseKnowledgeSearchResponseDto,
  parseKnowledgeSourceListDto
} from './validators'

const knowledgeSource = {
  config: { filename: 'notes.md', source_type: 'file' },
  created_at: '2026-07-20T00:00:00Z',
  enabled: true,
  extensions: {},
  id: 'source_knowledge_12345678',
  ingestion: {
    active_job_id: 'job_knowledge_12345678',
    chunk_count: 0,
    document_count: 0,
    indexed_version_id: null,
    last_error: null,
    last_success_at: null,
    status: 'queued'
  },
  name: 'notes.md',
  revision: 1,
  source_type: 'file',
  sync_schedule: null,
  updated_at: '2026-07-20T00:00:00Z',
  visibility: {
    agent_grants: [],
    allow_external_model_processing: false,
    allowed_model_regions: ['cn'],
    default_effect: 'deny',
    policy_version: 1,
    retention_days: null,
    sensitivity: 'normal',
    session_override_allowed: false
  },
  workspace_id: 'workspace_knowledge_12345678'
} as const

const knowledgeIngestionJob = {
  created_at: '2026-07-20T00:00:00Z',
  error: null,
  expires_at: null,
  extensions: {},
  finished_at: null,
  id: 'job_knowledge_12345678',
  job_type: 'knowledge.ingest',
  progress: {
    completed_units: 0,
    message: null,
    percent: 0,
    phase: 'queued',
    total_units: 1
  },
  request_id: 'request_12345678',
  source_id: 'source_knowledge_12345678',
  source_version_id: 'version_knowledge_12345678',
  started_at: null,
  stats: { chunks: 0, documents: 0, embedded_tokens: 0, skipped: 0 },
  status: 'queued'
} as const

describe('parseKnowledgeSourceListDto', (): void => {
  it('accepts a Resume-derived KnowledgeSource envelope', (): void => {
    const result = parseKnowledgeSourceListDto({
      items: [
        {
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
          workspace_id: 'ws_example'
        }
      ],
      page: { has_more: false, next_cursor: null, total_estimate: 1 }
    })

    expect(result.items[0]?.source_type).toBe('resume')
    expect(result.items[0]?.ingestion.chunk_count).toBe(3)
    expect(result.items[0]?.visibility.agent_grants[0]?.agent_scope).toBe('resume_assistant')
  })
})

describe('Knowledge ingestion transport validation', (): void => {
  it('accepts the temporary 202 upload response', (): void => {
    const result = parseKnowledgeFileUploadResponseDto({
      ingestion_job: knowledgeIngestionJob,
      source: knowledgeSource
    })

    expect(result.source.id).toBe('source_knowledge_12345678')
    expect(result.ingestion_job.status).toBe('queued')
  })

  it('rejects missing job source identity and unknown job status', (): void => {
    const withoutSourceId: Record<string, unknown> = { ...knowledgeIngestionJob }
    Reflect.deleteProperty(withoutSourceId, 'source_id')
    expect(() => parseKnowledgeIngestionJobDto(withoutSourceId)).toThrowError(HttpContractError)
    expect(() =>
      parseKnowledgeIngestionJobDto({ ...knowledgeIngestionJob, status: 'mysterious' })
    ).toThrowError(HttpContractError)
  })

  it('rejects extra fields in the temporary upload response wrapper', (): void => {
    expect(() =>
      parseKnowledgeFileUploadResponseDto({
        extra: true,
        ingestion_job: knowledgeIngestionJob,
        source: knowledgeSource
      })
    ).toThrowError(HttpContractError)
  })
})

describe('parseKnowledgeSearchResponseDto', (): void => {
  it('accepts a cited search result wrapper', (): void => {
    const result = parseKnowledgeSearchResponseDto({
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

    expect(result.items[0]?.citation.locator.line_start).toBe(12)
  })

  it('rejects a result without a citation locator', (): void => {
    expect(() =>
      parseKnowledgeSearchResponseDto({
        items: [
          {
            citation: {
              citation_id: 'citation_knowledge_12345678',
              source_id: 'source_knowledge_12345678',
              source_version_id: 'version_knowledge_12345678',
              title: 'notes.md'
            },
            metadata: {},
            result_id: 'result_knowledge_12345678',
            score: 0.9,
            text: 'A grounded result.'
          }
        ]
      })
    ).toThrowError(HttpContractError)
  })
})
