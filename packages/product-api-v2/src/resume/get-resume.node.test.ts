import { describe, expect, it, vi } from 'vitest'

import type { ApiV2AuthenticationPort } from '../http/authentication'
import { createApiV2Client, type ApiV2Client, type ApiV2JsonResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { getWorkspaceResume } from './get-resume'

/** @brief 测试 Workspace ID / Workspace ID used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 另一个测试 Workspace ID / Another Workspace ID used by tests. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试 Resume ID / Resume ID used by tests. */
const RESUME_ID = 'resume_01K0EXAMPLE000000000001'

/** @brief 另一个测试 Resume ID / Another Resume ID used by tests. */
const OTHER_RESUME_ID = 'resume_01K0OTHER0000000000001'

/** @brief 测试 Template ID / Template ID used by tests. */
const TEMPLATE_ID = 'template_01K0EXAMPLE00000001'

/** @brief 响应强 ETag / Strong response ETag. */
const ENTITY_TAG = '"opaque-resume-validator-a7"'

/** @brief 服务端响应 request ID / Server response request ID. */
const REQUEST_ID = 'req_resume_read_12345678'

/** @brief 测试 Bearer token / Bearer token used by tests. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/**
 * @brief 构造固定 token 的认证端口 / Build an authentication port with a fixed token.
 * @return 不刷新也不失效 token 的认证端口 / Authentication port that neither refreshes nor invalidates the token.
 */
function fixedAuthentication(): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string => ACCESS_TOKEN,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/**
 * @brief 构造合法 measurement JSON / Build valid measurement JSON.
 * @return 十毫米 measurement / Ten-millimetre measurement.
 */
function measurement(): Record<string, unknown> {
  return { unit: 'mm', value: 10 }
}

/**
 * @brief 构造含完整语义字段的合法 ResumeDocument / Build a valid ResumeDocument carrying complete semantic fields.
 * @param overrides 当前用例覆盖的顶层字段 / Top-level fields overridden by the current case.
 * @return 可验证无损查询的 API v2 ResumeDocument JSON / API v2 ResumeDocument JSON suitable for lossless-query verification.
 */
function resumeDocument(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  /** @brief 测试色值 / Color value used throughout the test style. */
  const color = { space: 'srgb_hex', value: '#112233' }
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: RESUME_ID,
    knowledge_source_id: 'knowledge_01K0EXAMPLE00000001',
    locale: 'zh-CN',
    profile: {
      contacts: [
        {
          id: 'contact_01K0EXAMPLE000000001',
          kind: 'website',
          label: '作品集',
          url: 'https://klee.example.cn/',
          value: 'klee.example.cn'
        }
      ],
      full_name: 'Klee',
      headline: 'Distributed Systems Engineer',
      summary: {
        marks: [{ end: 4, href: 'https://example.cn/work', kind: 'link', start: 0 }],
        text: 'Work sample'
      }
    },
    revision: 37,
    sections: [
      {
        content: { marks: [{ end: 4, kind: 'strong', start: 0 }], text: 'Core systems' },
        id: 'section_01K0EXAMPLE000000001',
        items: [
          {
            date_range: { end: 'present', start: '2024-02' },
            highlights: [
              {
                marks: [{ end: 3, kind: 'emphasis', start: 0 }],
                text: 'SLO ownership'
              }
            ],
            id: 'item_01K0EXAMPLE000000000001',
            kind: 'experience',
            location: 'Shanghai',
            organization: 'HM Alliances',
            skills: ['TypeScript', 'Distributed Systems'],
            subtitle: 'Platform',
            summary: { marks: [], text: 'Built resilient product infrastructure.' },
            tags: ['platform', 'reliability'],
            title: 'Senior Engineer',
            url: 'https://example.cn/role',
            visible: true
          }
        ],
        kind: 'experience',
        title: 'Experience',
        visible: true
      }
    ],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'org.hmalliances.resume': { widows: 2 } },
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement(),
          left: measurement(),
          right: measurement(),
          top: measurement()
        },
        max_pages: 2,
        orientation: 'portrait',
        show_page_numbers: true,
        size: 'A4'
      },
      palette: {
        background: color,
        muted_text: color,
        primary: color,
        secondary: color,
        text: color
      },
      section_layout: [
        {
          compactness: 0.25,
          heading_style_token: 'section.primary',
          keep_together: true,
          page_break_before: false,
          section_id: 'section_01K0EXAMPLE000000001',
          zone: 'main'
        }
      ],
      style_contract_version: '1.0',
      template_settings: { accent: '#112233', show_icons: true },
      typography: {
        base_size_pt: 10,
        font_family_token: 'inter',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.4
      }
    },
    template: { template_id: TEMPLATE_ID, version: '2.4.0' },
    title: 'Klee Resume',
    updated_at: '2026-07-22T12:05:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造结构上合法的严格 GET 响应 / Build a structurally valid strict-GET response.
 * @param data 尚待领域解码的数据 / Data awaiting domain decoding.
 * @param headers 当前用例响应头 / Response headers for the current case.
 * @param status 当前用例状态 / Status for the current case.
 * @return 可由查询消费者读取的 ApiV2JsonResponse / ApiV2JsonResponse readable by the query consumer.
 */
function getResponse(
  data: unknown,
  headers: HeadersInit = { ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID },
  status = 200
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status }
}

describe('API v2 Workspace Resume single-document query', (): void => {
  it('reads the exact protected path and preserves the complete SIR with atomic metadata', async (): Promise<void> => {
    /** @brief transport 观察到的 Request / Request observed by the transport. */
    let observedRequest: Request | null = null
    /** @brief 期待无损返回的完整 SIR / Complete SIR expected to be returned losslessly. */
    const sourceDocument = resumeDocument()
    /** @brief 含完整 SIR 的网络响应 / Network response carrying the complete SIR. */
    const fetchImpl = vi.fn<typeof fetch>((input, init): Promise<Response> => {
      observedRequest = new Request(input, init)
      return Promise.resolve(
        new Response(JSON.stringify(sourceDocument), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ETag: ENTITY_TAG,
            'X-Request-Id': REQUEST_ID
          },
          status: 200
        })
      )
    })
    /** @brief 使用真实严格 transport 的 API v2 client / API v2 client using the real strict transport. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'req_resume_read_outbound_1',
      fetchImpl
    })

    await expect(
      getWorkspaceResume(client, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).resolves.toEqual({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: sourceDocument
    })
    expect(observedRequest).not.toBeNull()
    /** @brief 已确认存在的 transport Request / Transport Request confirmed to exist. */
    const request = observedRequest as unknown as Request
    expect(request.method).toBe('GET')
    expect(request.url).toBe(
      `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}`
    )
    expect(request.headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
  })

  it('pins status and size semantics while forwarding the exact AbortSignal', async (): Promise<void> => {
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()
    /** @brief 可观察的严格 GET / Observable strict GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(getResponse(resumeDocument()))

    await getWorkspaceResume(
      { getJson },
      { resumeId: RESUME_ID, signal: controller.signal, workspaceId: WORKSPACE_ID }
    )

    expect(getJson).toHaveBeenCalledOnce()
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}`, {
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      signal: controller.signal
    })
  })

  it.each([
    ['workspace', { resumeId: RESUME_ID, workspaceId: 'bad/id' }],
    ['resume', { resumeId: '../escape', workspaceId: WORKSPACE_ID }]
  ])('rejects an invalid %s identity before dispatch', async (_label, request): Promise<void> => {
    /** @brief 不应执行的 GET / GET that must not execute. */
    const getJson = vi.fn<ApiV2Client['getJson']>()

    await expect(getWorkspaceResume({ getJson }, request)).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(getJson).not.toHaveBeenCalled()
  })

  it('fails closed when the representation does not match either path identity', async (): Promise<void> => {
    /** @brief 依次返回跨 Workspace 与错误 Resume identity 的 GET / GET returning cross-Workspace and wrong-Resume representations. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(getResponse(resumeDocument({ workspace_id: OTHER_WORKSPACE_ID })))
      .mockResolvedValueOnce(getResponse(resumeDocument({ id: OTHER_RESUME_ID })))

    await expect(
      getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/different Workspace/u)
    await expect(
      getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/identity differs/u)
  })

  it.each([null, 'W/"opaque-resume-validator-a7"'])(
    'rejects a missing or weak ETag (%s)',
    async (etag): Promise<void> => {
      /** @brief 当前用例响应头 / Response headers for the current case. */
      const headers = new Headers({ 'X-Request-Id': REQUEST_ID })
      if (etag !== null) headers.set('ETag', etag)
      /** @brief 返回不合法并发元数据的 GET / GET returning invalid concurrency metadata. */
      const getJson = vi
        .fn<ApiV2Client['getJson']>()
        .mockResolvedValue(getResponse(resumeDocument(), headers))

      await expect(
        getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
      ).rejects.toBeInstanceOf(ApiV2ContractError)
    }
  )

  it('rejects a malformed request ID even when a structural client bypasses transport validation', async (): Promise<void> => {
    /** @brief 返回非法 request ID 的结构型客户端 / Structural client returning an invalid request ID. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse(resumeDocument(), {
        ETag: ENTITY_TAG,
        'X-Request-Id': 'bad request id'
      })
    )

    await expect(
      getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('keeps revision independent from opaque ETag text', async (): Promise<void> => {
    /** @brief 不含 revision 编码的强 ETag / Strong ETag carrying no revision encoding. */
    const opaqueEntityTag = '"sha256-z7fN2x"'
    /** @brief 返回 revision 与 opaque ETag 的 GET / GET returning a revision and an opaque ETag. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse(resumeDocument({ revision: 913 }), {
        ETag: opaqueEntityTag,
        'X-Request-Id': REQUEST_ID
      })
    )

    await expect(
      getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).resolves.toMatchObject({ entityTag: opaqueEntityTag, value: { revision: 913 } })
  })

  it.each([
    ['wrong success status', 201, 'application/json'],
    ['wrong success media type', 200, 'text/plain']
  ])(
    'rejects %s through the shared strict transport',
    async (_label, status, contentType): Promise<void> => {
      /** @brief 返回错误 HTTP 语义的 fetch double / Fetch double returning incorrect HTTP semantics. */
      const fetchImpl = vi.fn<typeof fetch>((): Promise<Response> =>
        Promise.resolve(
          new Response(JSON.stringify(resumeDocument()), {
            headers: {
              'Content-Type': contentType,
              ETag: ENTITY_TAG,
              'X-Request-Id': REQUEST_ID
            },
            status
          })
        )
      )
      /** @brief 使用真实严格 transport 的 API v2 client / API v2 client using the real strict transport. */
      const client = createApiV2Client({
        authentication: fixedAuthentication(),
        createRequestId: (): string => 'req_resume_read_outbound_2',
        fetchImpl
      })

      await expect(
        getWorkspaceResume(client, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
      ).rejects.toBeInstanceOf(ApiV2ContractError)
    }
  )

  it('rejects schema drift instead of returning a lossy projection', async (): Promise<void> => {
    /** @brief 带未发布旧字段的表示 / Representation carrying an unpublished legacy field. */
    const drifted = resumeDocument({ rendered_html: '<main>legacy</main>' })
    /** @brief 返回 schema drift 的 GET / GET returning schema drift. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(getResponse(drifted))

    await expect(
      getWorkspaceResume({ getJson }, { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })
})
