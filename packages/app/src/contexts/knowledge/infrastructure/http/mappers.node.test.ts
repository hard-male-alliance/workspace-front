import { describe, expect, it } from 'vitest'

import type { KnowledgeSourceDto } from './transport-types'
import { mapKnowledgeSourceDto } from './mappers'

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
      agentScopeCode: 'resume_assistant',
      allowedOperations: ['retrieve', 'derive'],
      effect: 'allow'
    })
  })
})
