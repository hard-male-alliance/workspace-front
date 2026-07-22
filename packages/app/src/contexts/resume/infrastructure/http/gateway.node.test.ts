import { describe, expect, it, vi } from 'vitest'

import { getResumeConflictStatus, ResumeOperationRejectedError } from '../../application/errors'
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

function operationResult(
  normalizedDocument: Record<string, unknown> | null = resumeDocument(5),
  operationIds: readonly string[] = ['op_result_12345678']
): Record<string, unknown> {
  return {
    new_revision: 5,
    normalized_document: normalizedDocument,
    previous_revision: 4,
    render_job: null,
    results: operationIds.map((operationId) => ({
      operation_id: operationId,
      problem: null,
      status: 'applied'
    })),
    resume_id: 'res_example'
  }
}

/**
 * @brief 从实际请求中回显 operation ID 的后端响应 / Backend response echoing operation IDs from the actual request.
 * @param normalizedDocument 可选权威归一化简历 / Optional authoritative normalized Resume.
 * @param override 可选结果改写器 / Optional result override.
 * @return 可作为 fetch mock implementation 的响应函数 / Response function usable as a fetch mock implementation.
 */
function operationResponse(
  normalizedDocument: Record<string, unknown> | null = resumeDocument(5),
  override?: (operationIds: readonly string[]) => Readonly<Record<string, unknown>>
): (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response> {
  return (_input, init): Promise<Response> => {
    /** @brief 被测 Gateway 发送的 JSON body / JSON body sent by the Gateway under test. */
    const requestBody = init?.body
    if (typeof requestBody !== 'string') {
      return Promise.reject(new Error('Expected an operation request JSON body.'))
    }
    const body = JSON.parse(requestBody) as {
      readonly operations: readonly { readonly operation_id: string }[]
    }
    const operationIds = body.operations.map((operation) => operation.operation_id)
    const result = operationResult(normalizedDocument, operationIds)
    return Promise.resolve(
      Response.json(override === undefined ? result : { ...result, ...override(operationIds) })
    )
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
    sha256: 'A'.repeat(64),
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

function templateManifest(id: string, version = '1.0'): Record<string, unknown> {
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
    template_version: version,
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
  it.each(['*', 'W/"resume-4"', '"resume-4", "resume-5"'])(
    'rejects an ETag that cannot safely guard Resume operations: %s',
    async (etag): Promise<void> => {
      /** @brief 返回非法并发令牌的网络替身 / Network double returning an invalid concurrency token. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(resumeDocument()), {
          headers: { 'Content-Type': 'application/json', ETag: etag }
        })
      )
      /** @brief 被测 Resume gateway / Resume gateway under test. */
      const gateway = new HttpResumeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )

      await expect(gateway.getResumeEditor('res_example' as never)).rejects.toMatchObject({
        name: 'HttpContractError'
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  )

  it('resolves a Resume card pinned to a historical template through the exact version route', async (): Promise<void> => {
    /** @brief 固定历史模板版本的 Resume 列表 / Resume list pinned to a historical template version. */
    const pinnedResume = {
      ...resumeDocument(),
      template: { template_id: 'tpl_default_v1', template_version: '0.9.0' }
    }
    /** @brief 返回 Resume、最新目录和历史清单的网络替身 / Network double returning the Resume, latest catalog, and historical manifest. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [pinnedResume],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_default_v1', '2.0.0')],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          ...templateManifest('tpl_default_v1', '0.9.0'),
          name: 'Dawn historical'
        })
      )
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.listResumeCards('ws_example' as never)).resolves.toMatchObject([
      { templateName: 'Dawn historical' }
    ])
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates/tpl_default_v1?version=0.9.0'
    )
  })

  it.each([409, 412] as const)(
    'preserves rejected operation status %i as a Resume conflict',
    (status): void => {
      /** @brief 携带安全冲突投影的应用错误 / Application error carrying a safe conflict projection. */
      const error = new ResumeOperationRejectedError({
        code: 'resume.revision_conflict',
        retryable: true,
        status
      })

      expect(getResumeConflictStatus(error)).toBe(status)
    }
  )

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

  it('reads an exact immutable template version through the contract route', async (): Promise<void> => {
    /** @brief 返回指定历史版本的网络替身 / Network double returning the requested historical version. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(templateManifest('tpl_default_v1', '0.9.0')))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(
      gateway.getTemplateManifest('tpl_default_v1' as never, '0.9.0')
    ).resolves.toMatchObject({ id: 'tpl_default_v1', version: '0.9.0' })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates/tpl_default_v1?version=0.9.0'
    )
  })

  it.each([
    ['id', templateManifest('tpl_other_v1', '0.9.0')],
    ['version', templateManifest('tpl_default_v1', '2.0.0')]
  ] as const)(
    'rejects an exact template response with a mismatched %s',
    async (_field, responseBody): Promise<void> => {
      /** @brief 返回串错模板资源的网络替身 / Network double returning a mismatched template resource. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(responseBody))
      /** @brief 被测 Resume Gateway / Resume Gateway under test. */
      const gateway = new HttpResumeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )

      await expect(
        gateway.getTemplateManifest('tpl_default_v1' as never, '0.9.0')
      ).rejects.toMatchObject({ name: 'HttpContractError', status: 200 })
    }
  )

  it('merges a Resume pinned historical version when the latest catalog omits it', async (): Promise<void> => {
    /** @brief 固定在历史模板版本的 Resume / Resume pinned to a historical template version. */
    const pinnedResume = {
      ...resumeDocument(),
      template: { template_id: 'tpl_default_v1', template_version: '0.9.0' }
    }
    /** @brief 依次返回 Resume、最新目录与历史精确版本的网络替身 / Network double returning the Resume, latest catalog, and exact historical version. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pinnedResume), {
          headers: { 'Content-Type': 'application/json', ETag: '"resume-4"' },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_default_v1', '2.0.0')],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockResolvedValueOnce(Response.json(templateManifest('tpl_default_v1', '0.9.0')))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    const settings = await gateway.getTemplateSettings('res_example' as never)

    expect(settings.availableTemplates.map(({ id, version }) => [id, version])).toEqual([
      ['tpl_default_v1', '2.0.0'],
      ['tpl_default_v1', '0.9.0']
    ])
    expect(settings.selectedTemplate).toMatchObject({
      id: 'tpl_default_v1',
      version: '0.9.0'
    })
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates/tpl_default_v1?version=0.9.0'
    )
  })

  it('rejects a Resume read whose response belongs to another resource', async (): Promise<void> => {
    /** @brief 返回其他 Resume 的网络替身 / Network double returning another Resume. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...resumeDocument(), id: 'res_other' }), {
        headers: { 'Content-Type': 'application/json', ETag: '"resume-other"' },
        status: 200
      })
    )
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.getResumeEditor('res_example' as never)).rejects.toMatchObject({
      name: 'HttpContractError',
      status: 200
    })
  })

  it('clears a cached ETag when a newer Resume read omits it', async (): Promise<void> => {
    /** @brief 先返回 ETag、随后两次省略 ETag 的网络替身 / Network double returning an ETag first and omitting it on the next two reads. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(Response.json(resumeDocument()))
      .mockResolvedValueOnce(Response.json(resumeDocument()))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await gateway.getResumeEditor('res_example' as never)
    await gateway.getResumeEditor('res_example' as never)
    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
    ).rejects.toThrow('require an ETag')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true)
  })

  it('maps a section edit to formal set_field operations with ETag and idempotency', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(operationResponse())
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    const editor = await gateway.updateResumeSection({
      baseRevision: 4,
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

  it('updates only the title without reconstructing an authoritative RichText body', async (): Promise<void> => {
    /** @brief 省略 plain_text 且保留结构块的权威简历 / Authoritative Resume omitting plain_text while retaining structured blocks. */
    const document = resumeDocument()
    const sections = document.sections as Record<string, unknown>[]
    sections[0] = {
      ...sections[0],
      content: {
        blocks: [
          {
            block_id: 'block_existing_12345678',
            spans: [{ marks: [{ type: 'bold' }], text: '不应被标题修改覆盖' }],
            type: 'paragraph'
          }
        ],
        schema_version: '1.0'
      }
    }
    /** @brief 依次返回富文本快照与成功 operation 的网络替身 / Network double returning the RichText snapshot and a successful operation. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(document), {
          headers: { 'Content-Type': 'application/json', ETag: '"resume-4"' },
          status: 200
        })
      )
      .mockImplementationOnce(operationResponse())
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.updateResumeSection({
      baseRevision: 4,
      resumeId: 'res_example' as never,
      sectionId: 'sec_summary' as never,
      title: '新标题'
    })

    /** @brief 发往后端的字段 operations / Field operations sent to the backend. */
    const body = JSON.parse(fetchBody(fetchImpl, 1)) as {
      readonly operations: readonly Readonly<Record<string, unknown>>[]
    }
    expect(body.operations).toEqual([
      expect.objectContaining({ field_path: ['title'], op: 'set_field', value: '新标题' })
    ])
  })

  it('does not report a rejected operation batch as a successful save', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(
        operationResponse(null, (operationIds) => ({
          new_revision: 4,
          results: operationIds.map((operationId) => ({
            operation_id: operationId,
            problem: {
              code: 'resume.revision_conflict',
              detail: 'private rejected value',
              retryable: true,
              status: 412,
              title: 'private title',
              type: 'urn:aiws:error:resume:revision_conflict'
            },
            status: 'rejected'
          }))
        }))
      )
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(operationResponse())
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    const rejection: unknown = await gateway
      .updateResumeSection({
        baseRevision: 4,
        content: '新的摘要',
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
      .catch((error: unknown): unknown => error)

    expect(rejection).toBeInstanceOf(ResumeOperationRejectedError)
    expect(rejection).toMatchObject({
      code: 'resume.revision_conflict',
      retryable: true,
      status: 412
    })
    expect(getResumeConflictStatus(rejection)).toBe(412)
    expect(JSON.stringify(rejection)).not.toContain('private')

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        content: '修正后的摘要',
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
    ).resolves.toMatchObject({ resume: { revision: 5 } })
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('http://127.0.0.1:8000/api/v1/resumes/res_example')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('reloads authority before writing again after an outcome-unknown command', async (): Promise<void> => {
    /** @brief 首次写入无法确认、随后允许权威重载的网络替身 / Network double whose first write is unconfirmed before an authority reload. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockRejectedValueOnce(
        Object.assign(new Error('private command state'), {
          name: 'HttpCommandOutcomeUnknownError'
        })
      )
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(operationResponse())
    /** @brief 使用真实 HTTP client 的 Resume Gateway / Resume Gateway using the real HTTP client. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        content: '结果未知的摘要',
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
    ).rejects.toMatchObject({ name: 'HttpCommandOutcomeUnknownError' })

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        content: '权威重载后的摘要',
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
    ).resolves.toMatchObject({ resume: { revision: 5 } })
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('http://127.0.0.1:8000/api/v1/resumes/res_example')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('refuses to replay an old draft when authority advanced after an unknown outcome', async (): Promise<void> => {
    /** @brief 初次写入未知且权威 revision 已前进的网络替身 / Network double whose first write is unknown and whose authoritative revision then advances. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse(4))
      .mockRejectedValueOnce(new TypeError('private connection failure'))
      .mockResolvedValueOnce(resumeResponse(5))
    /** @brief 使用真实 HTTP client 的 Resume Gateway / Resume Gateway using the real HTTP client. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '旧版本草稿'
      })
    ).rejects.toMatchObject({ name: 'HttpCommandOutcomeUnknownError' })
    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '旧版本草稿'
      })
    ).rejects.toMatchObject({ name: 'ResumeSnapshotConflictError', status: 412 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[2]?.[1]?.method).toBe('GET')
  })

  it('keeps the original ETag after a deterministic top-level rejection', async (): Promise<void> => {
    /** @brief 明确拒绝首个命令、随后接受同版本修正的网络替身 / Network double definitively rejecting the first command and accepting a correction on the same version. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse(4))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'resume.invalid_field',
            detail: null,
            retryable: false,
            status: 422,
            title: 'Resume field is invalid',
            type: 'about:blank'
          }),
          {
            headers: { 'Content-Type': 'application/problem+json' },
            status: 422
          }
        )
      )
      .mockImplementationOnce(operationResponse())
    /** @brief 使用真实 HTTP client 的 Resume Gateway / Resume Gateway using the real HTTP client. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '无效输入'
      })
    ).rejects.toMatchObject({ name: 'HttpProblemError', status: 422 })
    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '修正输入'
      })
    ).resolves.toMatchObject({ resume: { revision: 5 } })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      headers: { 'If-Match': '"resume-4"' },
      method: 'POST'
    })
  })

  it('prioritizes a conflict when one operation batch contains multiple rejections', async (): Promise<void> => {
    /** @brief 返回混合领域拒绝的网络替身 / Network double returning mixed domain rejections. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(
        operationResponse(null, (operationIds) => ({
          new_revision: 4,
          results: operationIds.map((operationId, index) => ({
            operation_id: operationId,
            problem: {
              code: index === 0 ? 'resume.invalid_field' : 'resume.revision_conflict',
              retryable: index !== 0,
              status: index === 0 ? 422 : 412,
              title: 'private title',
              type:
                index === 0
                  ? 'urn:aiws:error:resume:invalid_field'
                  : 'urn:aiws:error:resume:revision_conflict'
            },
            status: 'rejected'
          }))
        }))
      )
    /** @brief 使用真实 HTTP client 的 Resume Gateway / Resume Gateway using the real HTTP client. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateResumeSection({
        baseRevision: 4,
        content: '混合拒绝摘要',
        resumeId: 'res_example' as never,
        sectionId: 'sec_summary' as never,
        title: '职业摘要'
      })
    ).rejects.toMatchObject({
      code: 'resume.revision_conflict',
      name: 'ResumeOperationRejectedError',
      status: 412
    })
  })

  it.each([
    [
      'missing operation result',
      (operationIds: readonly string[]): Readonly<Record<string, unknown>> => ({
        results: operationIds.slice(0, 1).map((operationId) => ({
          operation_id: operationId,
          problem: null,
          status: 'applied'
        }))
      })
    ],
    [
      'duplicate operation result',
      (operationIds: readonly string[]): Readonly<Record<string, unknown>> => ({
        results: [operationIds[0], operationIds[0]].map((operationId) => ({
          operation_id: operationId,
          problem: null,
          status: 'applied'
        }))
      })
    ],
    [
      'extra operation result',
      (operationIds: readonly string[]): Readonly<Record<string, unknown>> => ({
        results: [...operationIds, 'op_unrequested_12345678'].map((operationId) => ({
          operation_id: operationId,
          problem: null,
          status: 'applied'
        }))
      })
    ],
    [
      'malformed operation result',
      (operationIds: readonly string[]): Readonly<Record<string, unknown>> => ({
        results: operationIds.map((operationId) => ({
          operation_id: operationId,
          problem: null,
          status: 'invented'
        }))
      })
    ],
    [
      'normalized Resume identity mismatch',
      (): Readonly<Record<string, unknown>> => ({
        normalized_document: { ...resumeDocument(5), id: 'res_other_12345678' }
      })
    ],
    [
      'normalized Resume revision mismatch',
      (): Readonly<Record<string, unknown>> => ({
        normalized_document: resumeDocument(6)
      })
    ],
    [
      'batch Resume identity mismatch',
      (): Readonly<Record<string, unknown>> => ({
        resume_id: 'res_other_12345678'
      })
    ],
    [
      'batch previous revision mismatch',
      (): Readonly<Record<string, unknown>> => ({
        previous_revision: 3
      })
    ]
  ] as const)(
    'rejects a contract-invalid %s and reloads authority before the next write',
    async (_caseName, override): Promise<void> => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(resumeResponse())
        .mockImplementationOnce(operationResponse(resumeDocument(5), override))
        .mockResolvedValueOnce(resumeResponse())
        .mockImplementationOnce(operationResponse())
      const gateway = new HttpResumeGateway(
        createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
      )
      await gateway.getResumeEditor('res_example' as never)

      await expect(
        gateway.updateResumeSection({
          baseRevision: 4,
          content: '不应接受的摘要',
          resumeId: 'res_example' as never,
          sectionId: 'sec_summary' as never,
          title: '职业摘要'
        })
      ).rejects.toMatchObject({ name: 'HttpCommandOutcomeUnknownError' })

      await expect(
        gateway.updateResumeSection({
          baseRevision: 4,
          content: '重载后的摘要',
          resumeId: 'res_example' as never,
          sectionId: 'sec_summary' as never,
          title: '职业摘要'
        })
      ).resolves.toMatchObject({ resume: { revision: 5 } })
      expect(fetchImpl.mock.calls[2]?.[0]).toBe('http://127.0.0.1:8000/api/v1/resumes/res_example')
    }
  )

  it('maps a complete section order to ordered move_section operations', async (): Promise<void> => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(operationResponse())
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.reorderResumeSections({
      baseRevision: 4,
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
      .mockImplementationOnce(operationResponse())
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    await gateway.getResumeEditor('res_example' as never)

    await gateway.deleteResumeSection({
      baseRevision: 4,
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

  it('uses one aggregate lane for structure and template-setting mutations', async (): Promise<void> => {
    /** @brief 释放首个 operation 响应的闸门 / Gate releasing the first operation response. */
    let releaseResponse = (): void => {
      throw new Error('The operation response gate was not initialized.')
    }
    /** @brief 保持首个结构写执行中的闸门 / Gate keeping the first structural write in flight. */
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    /** @brief 首个 operation 的标准响应实现 / Standard response implementation for the first operation. */
    const respondToOperation = operationResponse()
    /** @brief 一个 GET 后保持 POST 待定的网络替身 / Network double with one GET followed by a pending POST. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockImplementationOnce(async (request, init) => {
        await responseGate
        return respondToOperation(request, init)
      })
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    const editor = await gateway.getResumeEditor('res_example' as never)

    /** @brief 占用聚合写通道的板块修改 / Section update occupying the aggregate mutation lane. */
    const sectionUpdate = gateway.updateResumeSection({
      baseRevision: editor.resume.revision,
      content: '新的摘要',
      resumeId: editor.resume.id,
      sectionId: 'sec_summary' as never
    })
    await vi.waitFor((): void => expect(fetchImpl).toHaveBeenCalledTimes(2))

    await expect(
      gateway.updateTemplateSettings({
        baseRevision: editor.resume.revision,
        resumeId: editor.resume.id,
        styleIntent: editor.resume.styleIntent,
        templateId: editor.resume.template.templateId,
        templateVersion: editor.resume.template.templateVersion
      })
    ).rejects.toMatchObject({ name: 'ResumeMutationInProgressError' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    releaseResponse()
    await expect(sectionUpdate).resolves.toMatchObject({ resume: { revision: 5 } })
  })

  it('refuses cross-template writes before any migration or operation request', async (): Promise<void> => {
    /** @brief 只允许读取当前权威 Resume 的网络替身 / Network double allowing only the authoritative Resume read. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(resumeResponse())
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 当前固定模板下的权威编辑器 / Authoritative editor under the currently pinned template. */
    const editor = await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateTemplateSettings({
        baseRevision: editor.resume.revision,
        resumeId: editor.resume.id,
        styleIntent: editor.resume.styleIntent,
        templateId: 'tpl_focus_v1' as never,
        templateVersion: '2.0'
      })
    ).rejects.toMatchObject({ name: 'ResumeTemplateMigrationCapabilityError' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
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
      .mockImplementationOnce(operationResponse(changedDocument))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 作为编辑基线的权威简历 / Authoritative Resume used as the edit baseline. */
    const editor = await gateway.getResumeEditor('res_example' as never)

    const saved = await gateway.updateTemplateSettings({
      baseRevision: editor.resume.revision,
      resumeId: 'res_example' as never,
      styleIntent: { ...editor.resume.styleIntent, density: 0.75 },
      templateId: 'tpl_default_v1' as never,
      templateVersion: '1.0'
    })

    /** @brief 发往 operation endpoint 的 JSON body / JSON body sent to the operation endpoint. */
    const body = JSON.parse(fetchBody(fetchImpl, 2)) as {
      readonly operations: readonly Record<string, unknown>[]
    }
    expect(body.operations).toHaveLength(1)
    expect(body.operations[0]).toMatchObject({
      op: 'set_style_intent'
    })
    expect(Object.keys(body.operations[0] ?? {}).sort()).toEqual([
      'op',
      'operation_id',
      'style_intent'
    ])
    expect(body.operations[0]?.style_intent).toMatchObject({
      density: 0.75,
      page: { size: 'A4' },
      typography: { font_family_token: 'body.default' }
    })
    expect(saved.styleIntent.density).toBe(0.75)
  })

  it('marks template-settings persistence unknown when the normalized Resume names another template', async (): Promise<void> => {
    /** @brief 串错到其他模板的归一化简历 / Normalized Resume correlated to a different template. */
    const wrongTemplateDocument = {
      ...resumeDocument(5),
      template: { template_id: 'tpl_other_v1', template_version: '9.0' }
    }
    /** @brief 依次返回简历、模板目录与串错 operation 结果的网络替身 / Network double returning Resume, catalog, and a mismatched operation result. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resumeResponse())
      .mockResolvedValueOnce(
        Response.json({
          items: [templateManifest('tpl_default_v1')],
          page: { has_more: false, next_cursor: null, total_estimate: 1 }
        })
      )
      .mockImplementationOnce(operationResponse(wrongTemplateDocument))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )
    /** @brief 作为编辑基线的权威简历 / Authoritative Resume used as the edit baseline. */
    const editor = await gateway.getResumeEditor('res_example' as never)

    await expect(
      gateway.updateTemplateSettings({
        baseRevision: editor.resume.revision,
        resumeId: 'res_example' as never,
        styleIntent: editor.resume.styleIntent,
        templateId: 'tpl_default_v1' as never,
        templateVersion: '1.0'
      })
    ).rejects.toMatchObject({
      diagnosticKind: 'contract',
      name: 'HttpCommandOutcomeUnknownError'
    })
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
      commandId: 'command_render_gateway_test' as never,
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
    expect(
      (fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']
    ).toBe('command_render_gateway_test')
    expect(job).toMatchObject({ id: 'job_render_example', status: 'queued' })
  })

  it.each([
    [200, '/api/v1/resume-render-jobs/job_render_example'],
    [202, null],
    [202, '/api/v1/resume-render-jobs/job_other']
  ] as const)(
    'marks Render Job creation status %s and Location %s as outcome unknown when success cannot be verified',
    async (status, location): Promise<void> => {
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
          commandId: 'command_render_invalid_response' as never,
          resumeId: 'res_example' as never,
          resumeRevision: 4
        })
      ).rejects.toMatchObject({
        diagnosticKind: 'contract',
        name: 'HttpCommandOutcomeUnknownError'
      })
    }
  )

  it('marks a successful Render Job response for another Resume revision as outcome unknown', async (): Promise<void> => {
    /** @brief 返回错误 Resume revision 的成功创建响应 / Successful creation response for the wrong Resume revision. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ...renderJob(), resume_revision: 5 },
        {
          headers: { Location: '/api/v1/resume-render-jobs/job_render_example' },
          status: 202
        }
      )
    )
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(
      gateway.startResumePdfRender({
        commandId: 'command_render_wrong_revision' as never,
        resumeId: 'res_example' as never,
        resumeRevision: 4
      })
    ).rejects.toMatchObject({ name: 'HttpCommandOutcomeUnknownError' })
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

  it('maps a future contract-valid Render Job status to a safe unknown UI state', async (): Promise<void> => {
    /** @brief 返回未来开放枚举状态的轮询响应 / Polling response returning a future open-enum status. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(renderJob('awaiting_capacity')))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.getResumeRenderJob('job_render_example' as never)).resolves.toMatchObject({
      status: 'unknown'
    })
  })

  it('rejects a polling response for a different Render Job', async (): Promise<void> => {
    /** @brief 返回错误 Job ID 的轮询响应 / Polling response returning the wrong Job ID. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...renderJob(), id: 'job_render_other' }))
    /** @brief 被测 Resume Gateway / Resume Gateway under test. */
    const gateway = new HttpResumeGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.getResumeRenderJob('job_render_example' as never)).rejects.toMatchObject({
      name: 'HttpContractError'
    })
  })
})
