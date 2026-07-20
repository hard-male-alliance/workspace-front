import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from './http-client'
import { HttpKnowledgeGateway } from './http-knowledge-gateway'
import { HttpResumeGateway } from './http-resume-gateway'

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

function resumeDocument(revision = 4): Record<string, unknown> {
  const measurement = { unit: 'mm', value: 18 }
  const color = (value: string): Record<string, unknown> => ({ space: 'srgb_hex', value })
  return {
    created_at: '2026-07-19T00:00:00Z',
    extensions: {},
    id: 'res_example',
    knowledge_source_id: 'ks_example',
    locale: 'zh-CN',
    profile: {
      contacts: [],
      full_name: '未命名求职者',
      headline: null,
      photo_asset_id: null,
      pronouns: null,
      summary: null
    },
    revision,
    schema_version: '1.0',
    sections: [
      {
        content: null,
        extensions: {},
        items: [],
        kind: 'summary',
        section_id: 'sec_summary',
        title: '简介',
        visible: true
      },
      {
        content: null,
        extensions: {},
        items: [],
        kind: 'projects',
        section_id: 'sec_projects',
        title: '项目',
        visible: true
      }
    ],
    style_intent: {
      bullet_style_token: 'bullet.default',
      date_format_token: 'yyyy_mm',
      density: 0.5,
      extensions: {},
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement,
          left: measurement,
          right: measurement,
          top: measurement
        },
        max_pages: null,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: color('#FFFFFF'),
        muted_text: color('#666666'),
        primary: color('#1F4E79'),
        secondary: color('#4F81BD'),
        text: color('#1A1A1A')
      },
      section_layout: [],
      style_contract_version: '1.0',
      template_settings: {},
      typography: {
        base_size_pt: 10.5,
        font_family_token: 'body.default',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.25
      }
    },
    template: { template_id: 'tpl_default_v1', template_version: '1.0' },
    title: '我的简历',
    updated_at: '2026-07-19T00:00:00Z',
    workspace_id: 'ws_example'
  }
}

function operationResult(normalizedDocument = resumeDocument(5)): Record<string, unknown> {
  return {
    new_revision: 5,
    normalized_document: normalizedDocument,
    previous_revision: 4,
    render_job: null,
    results: [{ operation_id: 'op_result_12345678', problem: null, status: 'applied' }],
    resume_id: 'res_example'
  }
}

function resumeResponse(revision = 4): Response {
  return new Response(JSON.stringify(resumeDocument(revision)), {
    headers: { 'Content-Type': 'application/json', ETag: `"resume-${revision}"` },
    status: 200
  })
}

function resumeProposal(status = 'pending'): Record<string, unknown> {
  return {
    base_revision: 4,
    created_at: '2026-07-19T00:00:00Z',
    expires_at: null,
    extensions: {},
    id: 'proposal_example',
    operations: [
      {
        field_path: ['summary'],
        op: 'set_field',
        operation_id: 'op_proposal_12345678',
        target: { entity_type: 'profile' },
        value: '突出工程结果'
      }
    ],
    resume_id: 'res_example',
    revision: 1,
    source_run_id: 'run_example_12345678',
    status,
    summary: null,
    title: '强化职业摘要',
    updated_at: '2026-07-19T00:00:00Z'
  }
}

function renderArtifact(): Record<string, unknown> {
  return {
    content_type: 'application/pdf',
    created_at: '2026-07-19T00:00:00Z',
    download_url: 'http://127.0.0.1:8000/api/v1/render-artifacts/artifact_example/content',
    expires_at: null,
    extensions: {},
    format: 'pdf',
    id: 'artifact_example',
    page_count: 2,
    resume_id: 'res_example',
    resume_revision: 4,
    revision: 1,
    sha256: 'a'.repeat(64),
    size_bytes: 2048,
    source_map_artifact_id: null,
    updated_at: '2026-07-19T00:00:00Z'
  }
}

function renderJob(
  status = 'queued',
  artifacts: readonly Record<string, unknown>[] = []
): Record<string, unknown> {
  return {
    artifacts,
    created_at: '2026-07-19T00:00:00Z',
    diagnostics: [],
    error: null,
    expires_at: null,
    extensions: {},
    finished_at: status === 'succeeded' ? '2026-07-19T00:00:02Z' : null,
    id: 'job_render_example',
    job_type: 'resume.render',
    progress: {
      completed_units: status === 'succeeded' ? 1 : 0,
      message: null,
      percent: status === 'succeeded' ? 100 : 0,
      phase: status === 'succeeded' ? 'done' : 'queued',
      total_units: 1
    },
    request_id: 'request_render_12345678',
    resume_id: 'res_example',
    resume_revision: 4,
    started_at: null,
    status
  }
}

function templateManifest(id: string): Record<string, unknown> {
  return {
    bullet_style_tokens: ['bullet.default'],
    capabilities: {
      max_columns: 1,
      supports_custom_sections: true,
      supports_photo: false,
      supports_sidebar: false,
      supports_source_map: true
    },
    created_at: '2026-07-19T00:00:00Z',
    date_format_tokens: ['yyyy_mm'],
    description: null,
    extensions: {},
    font_family_tokens: ['body.default'],
    id,
    name: id,
    preview_asset_url: null,
    revision: 1,
    settings: [],
    supported_locales: ['zh-CN'],
    supported_output_formats: ['pdf'],
    supported_page_sizes: ['A4'],
    supported_section_kinds: ['summary'],
    template_version: '1.0',
    updated_at: '2026-07-19T00:00:00Z',
    zones: [
      {
        accepted_section_kinds: ['summary'],
        label_key: 'template.zone.main',
        max_sections: 100,
        zone_id: 'main'
      }
    ]
  }
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

describe('HttpResumeGateway', (): void => {
  it('follows opaque template cursors until the backend page is complete', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_first_v1')],
          page: { has_more: true, next_cursor: 'opaque.next==', total_estimate: 2 }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_second_v1')],
          page: { has_more: false, next_cursor: null, total_estimate: 2 }
        })
      )
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const templates = await gateway.listTemplateManifests('zh-CN')

    expect(templates.map((template) => template.id)).toEqual(['tpl_first_v1', 'tpl_second_v1'])
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates?cursor=opaque.next%3D%3D&limit=20&locale=zh-CN'
    )
  })

  it('maps a section edit to formal set_field operations with ETag and idempotency', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(Response.json(operationResult()))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    const editor = await gateway.updateResumeSection({
      content: '新的摘要',
      resumeId: 'res_example' as never,
      sectionId: 'sec_summary' as never,
      title: '职业摘要'
    })

    const request = fetchImpl.mock.calls[1]
    const init = request?.[1]
    const body = JSON.parse(fetchBody(fetchImpl, 1)) as Record<string, unknown>
    expect(request?.[0]).toBe('http://127.0.0.1:8000/api/v1/resumes/res_example/operations')
    expect(init?.headers).toMatchObject({ 'If-Match': '"resume-4"' })
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^batch_/u)
    expect(body).toMatchObject({ base_revision: 4, conflict_strategy: 'reject' })
    expect(body.operations).toEqual([
      expect.objectContaining({ field_path: ['title'], op: 'set_field', value: '职业摘要' }),
      expect.objectContaining({ field_path: ['content'], op: 'set_field' })
    ])
    expect(editor.resume.revision).toBe(5)
  })

  it('maps a complete section order to ordered move_section operations', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(Response.json(operationResult()))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.reorderResumeSections({
      orderedSectionIds: ['sec_projects', 'sec_summary'] as never,
      resumeId: 'res_example' as never
    })

    const body = JSON.parse(fetchBody(fetchImpl, 1)) as {
      operations: readonly Record<string, unknown>[]
    }
    expect(body.operations).toEqual([
      expect.objectContaining({
        after_section_id: null,
        op: 'move_section',
        section_id: 'sec_projects'
      }),
      expect.objectContaining({
        after_section_id: 'sec_projects',
        op: 'move_section',
        section_id: 'sec_summary'
      })
    ])
  })

  it('maps section deletion to remove_section', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(Response.json(operationResult()))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.deleteResumeSection({
      resumeId: 'res_example' as never,
      sectionId: 'sec_projects' as never
    })

    const body = JSON.parse(fetchBody(fetchImpl, 1)) as {
      operations: readonly Record<string, unknown>[]
    }
    expect(body.operations).toEqual([
      expect.objectContaining({ op: 'remove_section', section_id: 'sec_projects' })
    ])
  })

  it('resolves the selected template version before sending set_template', async (): Promise<void> => {
    const changedDocument = {
      ...resumeDocument(5),
      template: { template_id: 'tpl_focus_v1', template_version: '2.0' }
    }
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(
        Response.json({
          items: [{ ...templateManifest('tpl_focus_v1'), template_version: '2.0' }],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockResolvedValueOnce(Response.json(operationResult(changedDocument)))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.selectResumeTemplate({
      resumeId: 'res_example' as never,
      templateId: 'tpl_focus_v1' as never
    })

    const body = JSON.parse(fetchBody(fetchImpl, 2)) as {
      operations: readonly Record<string, unknown>[]
    }
    expect(body.operations).toEqual([
      expect.objectContaining({
        op: 'set_template',
        template: { template_id: 'tpl_focus_v1', template_version: '2.0' }
      })
    ])
  })

  it('recovers pending Resume proposals from the formal list endpoint', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [resumeProposal()],
        page: { has_more: false, next_cursor: null, total_estimate: 1 }
      })
    )
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const proposals = await gateway.listResumeProposals('res_example' as never)

    expect(proposals).toEqual([
      expect.objectContaining({
        id: 'proposal_example',
        status: 'pending',
        title: '强化职业摘要'
      })
    ])
    const requestUrl = new URL(fetchUrl(fetchImpl, 0))
    expect(requestUrl.pathname).toBe('/api/v1/resumes/res_example/proposals')
    expect(requestUrl.searchParams.get('status')).toBe('pending')
  })

  it('creates a temporary backend proposal without applying it to the Resume', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(resumeProposal()))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const proposal = await gateway.createResumeProposal({
      message: '请强化职业摘要',
      resumeId: 'res_example' as never
    })

    const init = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(fetchBody(fetchImpl, 0)) as Record<string, unknown>
    expect(body).toMatchObject({
      field_path: ['summary'],
      instruction: '请强化职业摘要',
      render_hint: 'preview',
      source_ids: [],
      target: { entity_type: 'profile' }
    })
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^proposal_/u)
    expect(proposal.status).toBe('pending')
  })

  it.each([
    ['accept', 'accept_all'],
    ['reject', 'reject']
  ] as const)(
    'maps the %s action to a formal Proposal decision',
    async (decision, wireDecision) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(resumeProposal(decision === 'accept' ? 'accepted' : 'rejected'))
        )
      const gateway = new HttpResumeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )

      const proposal = await gateway.decideResumeProposal({
        decision,
        proposalId: 'proposal_example' as never
      })

      expect(JSON.parse(fetchBody(fetchImpl, 0))).toEqual({
        comment: null,
        conflict_strategy: 'reject',
        decision: wireDecision,
        operation_ids: []
      })
      expect(proposal.status).toBe(decision === 'accept' ? 'accepted' : 'rejected')
    }
  )

  it('starts a formal PDF preview Render Job', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(renderJob()))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const job = await gateway.startResumePdfRender({
      resumeId: 'res_example' as never,
      resumeRevision: 4
    })

    expect(JSON.parse(fetchBody(fetchImpl, 0))).toEqual({
      formats: ['pdf'],
      include_accessibility_tree: false,
      include_source_map: true,
      locale: null,
      mode: 'preview',
      page_range: null,
      resume_revision: 4
    })
    expect(job).toMatchObject({ id: 'job_render_example', status: 'queued' })
  })

  it('maps a completed Render Job and its trusted PDF artifact', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(renderJob('succeeded', [renderArtifact()])))
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const job = await gateway.getResumeRenderJob('job_render_example' as never)

    expect(job).toMatchObject({ progressPercent: 100, status: 'succeeded' })
    expect(job.artifacts[0]).toMatchObject({
      contentUrl: 'http://127.0.0.1:8000/api/v1/render-artifacts/artifact_example/content',
      pageCount: 2
    })
  })

  it('recovers the latest PDF artifact for a Resume', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [renderArtifact()],
        page: { has_more: false, next_cursor: null, total_estimate: 1 }
      })
    )
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const artifacts = await gateway.listResumePdfArtifacts('res_example' as never)

    expect(artifacts).toEqual([
      expect.objectContaining({ id: 'artifact_example', resumeRevision: 4 })
    ])
  })
})

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
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })

    const result = await gateway.uploadKnowledgeSource({ file, name: 'Study notes' })

    expect(fetchUrl(fetchImpl, 0)).toBe('http://127.0.0.1:8000/api/v1/knowledge-sources/uploads')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^knowledge_upload_/u)
    expect(headers).not.toHaveProperty('Content-Type')
    const body = fetchImpl.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('file')).toBe(file)
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
      file: new File(['new'], 'notes.md', { type: 'text/markdown' }),
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
