import { describe, expect, it, vi } from 'vitest'

import type { ApiV2AuthenticationPort } from '../http/authentication'
import {
  createApiV2Client,
  type ApiV2Client,
  type ApiV2CreatedResourceResponse,
  type ApiV2JsonResponse
} from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import {
  createWorkspaceResume,
  type CreateWorkspaceResumeCommand,
  type ResumeCreationHttpClient
} from './create-resume'
import type { CreateResumeRequest } from './resume-document'
import { getResumeTemplate, listResumeTemplatePage } from './template-catalog'

/** @brief 测试 Workspace ID / Workspace ID used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 另一个测试 Workspace ID / Another Workspace ID used by tests. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试 Template ID / Template ID used by tests. */
const TEMPLATE_ID = 'template_01K0EXAMPLE00000001'

/** @brief 测试 Template version / Template version used by tests. */
const TEMPLATE_VERSION = '2.4.0'

/** @brief 新建 Resume ID / ID of the created Resume. */
const RESUME_ID = 'resume_01K0EXAMPLE000000000001'

/** @brief 克隆来源 Resume ID / ID of the source Resume for cloning. */
const CLONE_SOURCE_ID = 'resume_01K0SOURCE0000000000001'

/** @brief 创建意图的稳定 Idempotency-Key / Stable Idempotency-Key for the creation intent. */
const IDEMPOTENCY_KEY = 'create_resume_attempt_00000001'

/** @brief 测试 Bearer token / Bearer token used by tests. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/** @brief 服务端响应请求 ID / Server response request ID. */
const REQUEST_ID = 'req_create_resume_12345678'

/** @brief 创建结果强 ETag / Strong ETag of the creation result. */
const ENTITY_TAG = '"resume-revision-1"'

/** @brief 新建 Resume 的规范 Location / Canonical Location of the created Resume. */
const RESUME_LOCATION = `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}`

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
 * @brief 提取 fetch 输入的规范 URL / Extract the canonical URL from a fetch input.
 * @param input fetch 的 URL、字符串或 Request / URL, string, or Request passed to fetch.
 * @return 不依赖默认对象字符串化的 URL / URL without relying on default object stringification.
 */
function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

/**
 * @brief 构造带 Product API 公共头的 JSON Response / Build a JSON Response with common Product API headers.
 * @param body JSON body / JSON body.
 * @param init Response 初始化参数 / Response initialization.
 * @return 可由严格 HTTP client 消费的响应 / Response consumable by the strict HTTP client.
 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  /** @brief 合并后的响应头 / Merged response headers. */
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-Id', REQUEST_ID)
  return new Response(JSON.stringify(body), { ...init, headers })
}

/**
 * @brief 构造最小合法 TemplateManifest / Build a minimal valid TemplateManifest.
 * @param version 不可变模板版本 / Immutable template version.
 * @return 完整 API v2 TemplateManifest JSON / Complete API v2 TemplateManifest JSON.
 */
function templateManifest(version = TEMPLATE_VERSION): Record<string, unknown> {
  return {
    bullet_style_tokens: ['disc'],
    capabilities: {
      max_columns: 1,
      supports_custom_sections: false,
      supports_photo: false,
      supports_sidebar: false,
      supports_source_map: false
    },
    date_format_tokens: ['iso'],
    description: null,
    font_family_tokens: ['inter'],
    id: TEMPLATE_ID,
    name: 'Dawn',
    preview_url: null,
    published_at: '2026-07-22T12:00:00Z',
    settings: [],
    supported_locales: ['zh-CN', 'en-US'],
    supported_output_formats: ['pdf'],
    supported_page_sizes: ['A4'],
    supported_section_kinds: [],
    version,
    zones: [
      {
        accepted_section_kinds: [],
        id: 'main',
        label_key: 'template.zone.main',
        max_sections: null
      }
    ]
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
 * @brief 构造最小合法 ResumeDocument / Build a minimal valid ResumeDocument.
 * @param overrides 当前用例覆盖的顶层字段 / Top-level fields overridden by the current case.
 * @return 完整 API v2 ResumeDocument JSON / Complete API v2 ResumeDocument JSON.
 */
function resumeDocument(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  /** @brief 测试色值 / Color value used throughout the test style. */
  const color = { space: 'srgb_hex', value: '#111111' }
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: RESUME_ID,
    knowledge_source_id: null,
    locale: 'ZH-cn',
    profile: {
      contacts: [],
      full_name: 'Klee',
      headline: null,
      summary: null
    },
    revision: 1,
    sections: [],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: {},
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement(),
          left: measurement(),
          right: measurement(),
          top: measurement()
        },
        max_pages: null,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: color,
        muted_text: color,
        primary: color,
        secondary: color,
        text: color
      },
      section_layout: [],
      style_contract_version: '1.0',
      template_settings: {},
      typography: {
        base_size_pt: 10,
        font_family_token: 'inter',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.4
      }
    },
    template: { template_id: TEMPLATE_ID, version: TEMPLATE_VERSION },
    title: 'Klee Resume',
    updated_at: '2026-07-22T12:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造默认 CreateResumeRequest / Build the default CreateResumeRequest.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 严格创建 payload / Strict creation payload.
 */
function createRequest(overrides: Partial<CreateResumeRequest> = {}): CreateResumeRequest {
  return {
    locale: 'zh-CN',
    template: { template_id: TEMPLATE_ID, version: TEMPLATE_VERSION },
    title: 'Klee Resume',
    ...overrides
  }
}

/**
 * @brief 构造默认 Workspace 创建 command / Build the default Workspace creation command.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 可提交的创建 command / Creation command ready for submission.
 */
function createCommand(
  overrides: Partial<CreateWorkspaceResumeCommand> = {}
): CreateWorkspaceResumeCommand {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    request: createRequest(),
    workspaceId: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造仅读取 data 的伪 GET 响应 / Build a fake GET response carrying only relevant data.
 * @param data 未经领域解码的 JSON / JSON awaiting domain decoding.
 * @return 结构上合法的 ApiV2JsonResponse / Structurally valid ApiV2JsonResponse.
 */
function getResponse(data: unknown): ApiV2JsonResponse {
  return {
    data,
    headers: new Headers({ 'X-Request-Id': REQUEST_ID }),
    status: 200
  }
}

/**
 * @brief 构造固定创建响应的最小写客户端 / Build a minimal write client returning a fixed creation response.
 * @param data ResumeDocument JSON / ResumeDocument JSON.
 * @param metadataOverrides 当前用例覆盖的写元数据 / Write metadata overridden by the current case.
 * @return 只实现 postJson 的创建客户端 / Creation client implementing only postJson.
 */
function fixedCreationClient(
  data: unknown,
  metadataOverrides: Partial<ApiV2CreatedResourceResponse['metadata']> = {}
): ResumeCreationHttpClient {
  /** @brief 固定 201 创建响应 / Fixed 201 creation response. */
  const response: ApiV2CreatedResourceResponse = {
    data,
    metadata: {
      entityTag: ENTITY_TAG,
      location: RESUME_LOCATION,
      requestId: REQUEST_ID,
      ...metadataOverrides
    },
    status: 201
  }
  /** @brief 符合端点最小依赖的 postJson double / postJson double satisfying the endpoint's minimal dependency. */
  const postJson = ((): Promise<ApiV2CreatedResourceResponse> =>
    Promise.resolve(response)) as ResumeCreationHttpClient['postJson']
  return { postJson }
}

describe('API v2 Resume Template catalog endpoints', (): void => {
  it('requests an exact encoded global page and preserves the cursor-page union', async (): Promise<void> => {
    /** @brief 被 transport 观察到的 URL / URL observed by the transport. */
    let observedUrl = ''
    /** @brief 返回一页 TemplateList 的 fetch double / Fetch double returning one TemplateList page. */
    const fetchImpl = vi.fn<typeof fetch>((input): Promise<Response> => {
      observedUrl = fetchInputUrl(input)
      return Promise.resolve(
        jsonResponse({
          items: [templateManifest()],
          page: { has_more: true, next_cursor: 'next-template-page' }
        })
      )
    })
    /** @brief 使用真实 transport 组装的 API v2 client / API v2 client composed with the real transport. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'req_template_list_outbound_1',
      fetchImpl
    })

    await expect(
      listResumeTemplatePage(client, { cursor: 'opaque /+', limit: 17 })
    ).resolves.toMatchObject({
      items: [{ id: TEMPLATE_ID, version: TEMPLATE_VERSION }],
      page: { has_more: true, next_cursor: 'next-template-page' }
    })
    expect(observedUrl).toBe(
      'https://api.hmalliances.org:8022/api/v2/resume-templates?cursor=opaque+%2F%2B&limit=17'
    )
  })

  it('uses default pagination and forwards the exact caller AbortSignal', async (): Promise<void> => {
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()
    /** @brief 可观察的 GET / Observable GET. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse({ items: [], page: { has_more: false, next_cursor: null } }))

    await listResumeTemplatePage({ getJson }, { signal: controller.signal })
    expect(getJson).toHaveBeenCalledWith('/resume-templates', {
      maxResponseBytes: 4 * 1024 * 1024,
      query: { cursor: null, limit: 50 },
      signal: controller.signal
    })
  })

  it('encodes the immutable version query and verifies the exact response identity', async (): Promise<void> => {
    /** @brief 含保留字符的合法不可变版本 / Valid immutable version containing reserved characters. */
    const version = '2026/07 + beta?'
    /** @brief 被 transport 观察到的 URL / URL observed by the transport. */
    let observedUrl = ''
    /** @brief 返回精确 TemplateManifest 的 fetch double / Fetch double returning the exact TemplateManifest. */
    const fetchImpl = vi.fn<typeof fetch>((input): Promise<Response> => {
      observedUrl = fetchInputUrl(input)
      return Promise.resolve(jsonResponse(templateManifest(version)))
    })
    /** @brief 使用真实 transport 组装的 API v2 client / API v2 client composed with the real transport. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'req_template_read_outbound_1',
      fetchImpl
    })

    await expect(
      getResumeTemplate(client, { template_id: TEMPLATE_ID, version })
    ).resolves.toMatchObject({ id: TEMPLATE_ID, version })
    expect(observedUrl).toBe(
      `https://api.hmalliances.org:8022/api/v2/resume-templates/${TEMPLATE_ID}?version=2026%2F07+%2B+beta%3F`
    )
  })

  it('fails closed when an immutable Template identity differs from the request', async (): Promise<void> => {
    /** @brief 含错误 Template ID 的 manifest / Manifest carrying the wrong Template ID. */
    const wrongId = templateManifest()
    wrongId.id = 'template_01K0OTHER00000000001'
    /** @brief 依次返回错误版本和错误 ID 的 GET / GET returning a wrong version and then a wrong ID. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(getResponse(templateManifest('2.4.1')))
      .mockResolvedValueOnce(getResponse(wrongId))

    await expect(
      getResumeTemplate({ getJson }, { template_id: TEMPLATE_ID, version: TEMPLATE_VERSION })
    ).rejects.toThrow(/immutable identity/u)
    await expect(
      getResumeTemplate({ getJson }, { template_id: TEMPLATE_ID, version: TEMPLATE_VERSION })
    ).rejects.toThrow(/immutable identity/u)
  })

  it('rejects invalid pagination before dispatch', async (): Promise<void> => {
    /** @brief 不应执行的 GET / GET that must not execute. */
    const getJson = vi.fn<ApiV2Client['getJson']>()

    await expect(listResumeTemplatePage({ getJson }, { limit: 201 })).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    await expect(
      listResumeTemplatePage({ getJson }, { cursor: 'x'.repeat(2049) })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getJson).not.toHaveBeenCalled()
  })
})

describe('API v2 Workspace Resume creation endpoint', (): void => {
  it('uses the strict created-resource transport call and returns validated metadata', async (): Promise<void> => {
    /** @brief transport 观察到的 Request / Request observed by the transport. */
    let observedRequest: Request | null = null
    /** @brief 返回固定 201 ResumeDocument 的 fetch double / Fetch double returning a fixed 201 ResumeDocument. */
    const fetchImpl = vi.fn<typeof fetch>((input, init): Promise<Response> => {
      observedRequest = new Request(input, init)
      return Promise.resolve(
        jsonResponse(resumeDocument(), {
          headers: { ETag: ENTITY_TAG, Location: RESUME_LOCATION },
          status: 201
        })
      )
    })
    /** @brief 使用真实严格写 transport 的 API v2 client / API v2 client using the real strict write transport. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'req_create_outbound_12345678',
      fetchImpl
    })

    await expect(createWorkspaceResume(client, createCommand())).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      location: RESUME_LOCATION,
      requestId: REQUEST_ID,
      value: { id: RESUME_ID, locale: 'ZH-cn', workspace_id: WORKSPACE_ID }
    })
    expect(observedRequest).not.toBeNull()
    /** @brief 已确认存在的 transport Request / Transport Request confirmed to exist. */
    const request = observedRequest as unknown as Request
    expect(request.method).toBe('POST')
    expect(request.url).toBe(
      `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/resumes`
    )
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(request.headers.get('Idempotency-Key')).toBe(IDEMPOTENCY_KEY)
    /** @brief transport 实际发送的 JSON body / JSON body actually sent by the transport. */
    const body = (await request.json()) as Record<string, unknown>
    expect(body).toEqual(createRequest())
    expect(Object.hasOwn(body, 'clone_from_resume_id')).toBe(false)
  })

  it('reuses the caller idempotency key and preserves a present clone identity', async (): Promise<void> => {
    /** @brief transport 观察到的幂等键 / Idempotency keys observed by the transport. */
    const observedKeys: Array<string | null> = []
    /** @brief transport 观察到的 JSON bodies / JSON bodies observed by the transport. */
    const observedBodies: unknown[] = []
    /** @brief 接收可重试 clone command 的 fetch double / Fetch double accepting a retryable clone command. */
    const fetchImpl = vi.fn<typeof fetch>(async (input, init): Promise<Response> => {
      /** @brief 当前 transport Request / Current transport Request. */
      const request = new Request(input, init)
      observedKeys.push(request.headers.get('Idempotency-Key'))
      observedBodies.push(await request.json())
      return jsonResponse(resumeDocument(), {
        headers: { ETag: ENTITY_TAG, Location: RESUME_LOCATION },
        status: 201
      })
    })
    /** @brief 使用真实严格写 transport 的 API v2 client / API v2 client using the real strict write transport. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => `req_clone_outbound_${observedKeys.length + 1}_12345678`,
      fetchImpl
    })
    /** @brief 具有非 null clone source 的创建 command / Creation command with a non-null clone source. */
    const command = createCommand({
      request: createRequest({ clone_from_resume_id: CLONE_SOURCE_ID })
    })

    await createWorkspaceResume(client, command)
    await createWorkspaceResume(client, command)
    expect(observedKeys).toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY])
    expect(observedBodies).toEqual([
      { ...createRequest(), clone_from_resume_id: CLONE_SOURCE_ID },
      { ...createRequest(), clone_from_resume_id: CLONE_SOURCE_ID }
    ])
  })

  it.each([
    ['malformed body', { unexpected: true }],
    ['cross-Workspace body', resumeDocument({ workspace_id: OTHER_WORKSPACE_ID })],
    ['mismatched title', resumeDocument({ title: 'Different title' })],
    ['mismatched locale', resumeDocument({ locale: 'en-US' })],
    [
      'mismatched Template',
      resumeDocument({ template: { template_id: TEMPLATE_ID, version: '2.5.0' } })
    ]
  ])('preserves an unknown 201 outcome for a %s', async (_label, responseBody): Promise<void> => {
    await expect(
      createWorkspaceResume(fixedCreationClient(responseBody), createCommand())
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      problemCode: null,
      requestId: REQUEST_ID,
      status: 201
    })
  })

  it('preserves an unknown 201 outcome when Location does not identify the decoded Resume', async (): Promise<void> => {
    await expect(
      createWorkspaceResume(
        fixedCreationClient(resumeDocument(), {
          location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/resumes/resume_01K0OTHER00000000000001`
        }),
        createCommand()
      )
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: REQUEST_ID,
      status: 201
    })
  })

  it('preserves an unknown 201 outcome when clone creation reuses its source identity', async (): Promise<void> => {
    /** @brief 指向来源 Resume 的 clone command / Clone command pointing to the source Resume. */
    const command = createCommand({
      request: createRequest({ clone_from_resume_id: CLONE_SOURCE_ID })
    })

    await expect(
      createWorkspaceResume(
        fixedCreationClient(resumeDocument({ id: CLONE_SOURCE_ID }), {
          location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/resumes/${CLONE_SOURCE_ID}`
        }),
        command
      )
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: REQUEST_ID,
      status: 201
    })
  })

  it('rejects a pre-aborted command without dispatching the POST', async (): Promise<void> => {
    /** @brief 已取消的调用方控制器 / Already-aborted caller controller. */
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled by test.', 'AbortError'))
    /** @brief 不应执行的 postJson / postJson that must not execute. */
    const postJson = vi.fn()
    /** @brief 只含可观察 POST 的最小客户端 / Minimal client carrying only the observable POST. */
    const client = { postJson: postJson as ResumeCreationHttpClient['postJson'] }

    await expect(
      createWorkspaceResume(client, createCommand({ signal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(postJson).not.toHaveBeenCalled()
  })

  it('keeps invalid creation commands as pre-dispatch contract errors', async (): Promise<void> => {
    /** @brief 不应接收非法创建 command 的 POST / POST that must not receive an invalid creation command. */
    const postJson = vi.fn<ResumeCreationHttpClient['postJson']>()

    await expect(
      createWorkspaceResume(
        { postJson },
        createCommand({ idempotencyKey: 'short', request: createRequest({ title: '' }) })
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(postJson).not.toHaveBeenCalled()
  })

  it('preserves an unknown 201 outcome for an invalid response ETag', async (): Promise<void> => {
    await expect(
      createWorkspaceResume(
        fixedCreationClient(resumeDocument(), { entityTag: 'W/"resume-revision-1"' }),
        createCommand()
      )
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: REQUEST_ID,
      status: 201
    })
  })
})
