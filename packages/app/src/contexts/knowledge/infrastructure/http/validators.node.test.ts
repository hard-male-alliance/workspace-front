import { describe, expect, it } from 'vitest'

import { parseKnowledgeSourceListDto } from './validators'

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
