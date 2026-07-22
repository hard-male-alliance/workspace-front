import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import { HttpResumeGateway } from './gateway'

function fetchBody(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const body = fetchImpl.mock.calls[callIndex]?.[1]?.body
  if (typeof body !== 'string') throw new Error('Expected a string request body.')
  return body
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

  it('atomically persists template settings as a formal semantic style intent', async (): Promise<void> => {
    /** @brief 后端归一化后的简历 / Resume normalized by the backend. */
    const changedDocument = {
      ...resumeDocument(5),
      style_intent: {
        ...(resumeDocument(5).style_intent as Record<string, unknown>),
        density: 0.75
      }
    }
    /** @brief 依次返回简历、模板目录与 operation 结果的网络替身 / Network double returning Resume, template catalog, and operation result. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_default_v1')],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockResolvedValueOnce(Response.json(operationResult(changedDocument)))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 作为编辑基线的权威简历 / Authoritative Resume used as the edit baseline. */
    const editor = await gateway.getResumeEditor('res_example' as never)

    const saved = await gateway.updateTemplateSettings({
      resumeId: 'res_example' as never,
      styleIntent: { ...editor.resume.styleIntent, density: 0.75 },
      templateId: 'tpl_default_v1' as never
    })

    /** @brief 发往 operation endpoint 的 JSON body / JSON body sent to the operation endpoint. */
    const body = JSON.parse(fetchBody(fetchImpl, 2)) as {
      readonly operations: readonly Record<string, unknown>[]
    }
    expect(body.operations).toHaveLength(1)
    expect(body.operations[0]).toMatchObject({
      op: 'set_template',
      template: { template_id: 'tpl_default_v1', template_version: '1.0' }
    })
    expect(body.operations[0]?.style_intent).toMatchObject({
      density: 0.75,
      page: { size: 'A4' },
      typography: { font_family_token: 'body.default' }
    })
    expect(saved.styleIntent.density).toBe(0.75)
  })

  it('starts a formal PDF preview Render Job', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(renderJob(), {
        headers: { Location: '/api/v1/resume-render-jobs/job_render_example' },
        status: 202
      })
    )
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

  it.each([
    [
      200,
      '/api/v1/resume-render-jobs/job_render_example',
      'Backend returned an unexpected success status; expected 202.'
    ],
    [202, null, 'Backend creation response is missing Location.'],
    [
      202,
      '/api/v1/resume-render-jobs/job_other',
      'Backend creation response Location does not identify the created resource.'
    ]
  ] as const)(
    'rejects Render Job creation status %s and Location %s when the creation contract is violated',
    async (status, location, expectedMessage): Promise<void> => {
      /** @brief 当前非法创建响应的响应头 / Headers for the current invalid creation response. */
      const headers = location === null ? undefined : { Location: location }
      /** @brief 返回当前非法创建响应的网络替身 / Network double returning this invalid creation response. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(renderJob(), {
          ...(headers === undefined ? {} : { headers }),
          status
        })
      )
      /** @brief 被测 Resume Gateway / Resume Gateway under test. */
      const gateway = new HttpResumeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )

      await expect(
        gateway.startResumePdfRender({
          resumeId: 'res_example' as never,
          resumeRevision: 4
        })
      ).rejects.toMatchObject({
        message: expectedMessage,
        name: 'HttpContractError',
        status
      })
    }
  )

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
})
