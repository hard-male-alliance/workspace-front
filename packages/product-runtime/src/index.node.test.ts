import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  asUiOpaqueId,
  asUiResumePageLimit,
  asUiResumeTemplatePageLimit,
  createUiCommandId
} from '@ai-job-workspace/app/application'
import {
  parseResumeDocument,
  type ApiV2AuthenticationPort,
  type ApiV2Client,
  type ApiV2GetOptions,
  type ApiV2JsonResponse,
  type ResumeCreationHttpClient
} from '@ai-job-workspace/product-api-v2'

import {
  ApiV2CapabilityUnavailableError,
  createApiV2ResumeCreationGateway,
  createApiV2ResumeGateway,
  createApiV2ResumeTemplateCatalog,
  createApiV2WorkspaceGateway,
  mapResumeSummaryPage,
  mapResumeTemplatePage,
  mapCreatedResumeResource,
  mapTemplateManifest,
  mapWorkspaceAccessPage
} from './api-v2-gateways'
import { createProductGateways } from './index'

/** @brief 测试专用非真实 Bearer token / Non-real Bearer token used only by tests. */
const ACCESS_TOKEN = 'access_product_runtime_example_only_7Yw8N2'

/**
 * @brief 构造 runtime 测试的认证生命周期端口 / Build an authentication lifecycle port for runtime tests.
 * @param getAccessToken 当前内存 token 读取器 / Current in-memory token reader.
 * @return 不执行网络刷新的完整端口 / Complete port that performs no network refresh.
 */
function authenticationPort(getAccessToken: () => string | null): ApiV2AuthenticationPort {
  return {
    getAccessToken,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/** @brief 当前用户的 API v2 测试载荷 / API v2 test payload for the current user. */
const CURRENT_USER = {
  created_at: '2026-07-22T12:00:00Z',
  default_workspace_id: 'ws_01K0EXAMPLE00000000000001',
  display_name: 'Klee',
  email: 'klee@example.cn',
  email_verified: true,
  id: 'usr_01K0EXAMPLE0000000000001',
  locale: 'zh-CN',
  revision: 3,
  scopes: ['workspace.read', 'resume.read'],
  subject: 'oidc-subject-01K0EXAMPLE0001',
  updated_at: '2026-07-22T12:05:00Z'
} as const

/** @brief WorkspaceAccess 的 API v2 测试载荷 / API v2 test payload for WorkspaceAccess. */
const WORKSPACE_ACCESS = {
  member_id: 'wsm_01K0EXAMPLE0000000000001',
  role: 'owner',
  workspace: {
    created_at: '2026-07-22T12:00:00Z',
    data_region: 'cn',
    id: 'ws_01K0EXAMPLE00000000000001',
    name: "Klee's Workspace",
    plan: 'personal',
    revision: 1,
    slug: 'klee-personal',
    updated_at: '2026-07-22T12:00:00Z'
  }
} as const

/** @brief ResumeSummary 的 API v2 测试载荷 / API v2 test payload for ResumeSummary. */
const RESUME_SUMMARY = {
  created_at: '2026-07-22T12:00:00Z',
  id: 'res_01K0EXAMPLE0000000000001',
  locale: 'zh-CN',
  revision: 17,
  template: {
    template_id: 'tpl_01K0EXAMPLE0000000000001',
    version: '2.1.0'
  },
  title: 'AI Platform Engineer',
  updated_at: '2026-07-23T08:30:00Z',
  workspace_id: 'ws_01K0EXAMPLE00000000000001'
} as const

/** @brief Resume Template 的 API v2 测试载荷 / API v2 test payload for a Resume Template. */
const RESUME_TEMPLATE = {
  bullet_style_tokens: ['disc'],
  capabilities: {
    max_columns: 2,
    supports_custom_sections: true,
    supports_photo: true,
    supports_sidebar: false,
    supports_source_map: true
  },
  date_format_tokens: ['iso'],
  description: 'A production template.',
  font_family_tokens: ['inter'],
  id: 'template_01K0EXAMPLE00000001',
  name: 'Dawn',
  preview_url: 'https://cdn.example.com/templates/dawn.png',
  published_at: '2026-07-22T12:00:00Z',
  settings: [
    {
      choices: [],
      control: 'switch',
      default: true,
      description_key: null,
      group_key: 'profile',
      key: 'show.photo',
      label_key: 'template.show_photo',
      maximum: null,
      minimum: null,
      value_type: 'boolean',
      visible_when: null
    },
    {
      choices: [],
      control: 'color',
      default: { space: 'srgb_hex', value: '#336699' },
      description_key: null,
      group_key: 'colors',
      key: 'accent.color',
      label_key: 'template.accent_color',
      maximum: null,
      minimum: null,
      value_type: 'color',
      visible_when: { equals: true, key: 'show.photo' }
    }
  ],
  supported_locales: ['en-US', 'zh-CN'],
  supported_output_formats: ['pdf', 'png'],
  supported_page_sizes: ['A4', 'LETTER'],
  supported_section_kinds: ['experience', 'custom'],
  version: '2.4.0',
  zones: [
    {
      accepted_section_kinds: ['experience', 'custom'],
      id: 'main',
      label_key: 'template.zone.main',
      max_sections: 8
    }
  ]
} as const

/**
 * @brief 构造 runtime 创建测试使用的 measurement / Build a measurement used by runtime creation tests.
 * @param value measurement 数值 / Measurement value.
 * @return API v2 Measurement JSON / API v2 Measurement JSON.
 */
function measurement(value: number): Readonly<Record<string, unknown>> {
  return { unit: 'mm', value }
}

/**
 * @brief 构造完整且最小的已创建 ResumeDocument / Build a complete minimal created ResumeDocument.
 * @return 可由严格 decoder 消费的 API v2 SIR / API v2 SIR consumable by the strict decoder.
 */
function createdResumeDocument(): Readonly<Record<string, unknown>> {
  return {
    created_at: '2026-07-23T12:00:00Z',
    id: 'resume_01K0CREATED000000000001',
    knowledge_source_id: null,
    locale: 'zh-CN',
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
          bottom: measurement(15),
          left: measurement(15),
          right: measurement(15),
          top: measurement(15)
        },
        max_pages: null,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: { space: 'srgb_hex', value: '#ffffff' },
        muted_text: { space: 'srgb_hex', value: '#666666' },
        primary: { space: 'srgb_hex', value: '#336699' },
        secondary: { space: 'srgb_hex', value: '#99aabb' },
        text: { space: 'srgb_hex', value: '#111111' }
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
    template: {
      template_id: RESUME_TEMPLATE.id,
      version: RESUME_TEMPLATE.version
    },
    title: 'Created Resume',
    updated_at: '2026-07-23T12:00:00Z',
    workspace_id: RESUME_SUMMARY.workspace_id
  }
}

/**
 * @brief 构造协议客户端可消费的 JSON 响应 / Construct a JSON response consumable by protocol clients.
 * @param data 未经协议 decoder 验证的数据 / Data not yet validated by a protocol decoder.
 * @return API v2 JSON 响应 / API v2 JSON response.
 */
function apiJson(data: unknown): ApiV2JsonResponse {
  return { data, headers: new Headers(), status: 200 }
}

afterEach((): void => {
  vi.unstubAllGlobals()
})

describe('createProductGateways', (): void => {
  it('从内存读取 Bearer token 并只访问固定的生产 API v2 origin', async (): Promise<void> => {
    /** @brief fetch 观察记录 / Observation captured from fetch. */
    let observation:
      | {
          readonly authorization: string | null
          readonly credentials: RequestCredentials | undefined
          readonly signal: AbortSignal | null | undefined
          readonly url: string
        }
      | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        /** @brief 当前请求头 / Current request headers. */
        const headers = new Headers(init?.headers)
        observation = {
          authorization: headers.get('Authorization'),
          credentials: init?.credentials,
          signal: init?.signal,
          url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        }
        /** @brief 客户端请求 ID / Client request ID. */
        const requestId = headers.get('X-Request-Id')
        if (requestId === null) throw new Error('The test request omitted X-Request-Id.')
        return Promise.resolve(
          new Response(JSON.stringify(CURRENT_USER), {
            headers: {
              'Content-Type': 'application/json',
              ETag: '"me-3"',
              'X-Request-Id': requestId
            }
          })
        )
      })
    )
    /** @brief 尚未建立会话时的内存 token / In-memory token before a session is established. */
    let currentAccessToken: string | null = null
    /** @brief v2-only 产品网关 / v2-only product gateways. */
    const gateways = createProductGateways({
      authentication: authenticationPort((): string | null => currentAccessToken),
      locale: 'zh-CN'
    })
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()
    currentAccessToken = ACCESS_TOKEN

    await expect(gateways.identity.loadCurrentUser(controller.signal)).resolves.toMatchObject({
      defaultWorkspaceId: CURRENT_USER.default_workspace_id,
      displayName: 'Klee',
      id: CURRENT_USER.id,
      subject: CURRENT_USER.subject
    })
    expect(observation).toMatchObject({
      authorization: `Bearer ${ACCESS_TOKEN}`,
      credentials: 'omit',
      url: 'https://api.hmalliances.org:8022/api/v2/me'
    })
    expect(observation?.signal).toBeInstanceOf(AbortSignal)
  })

  it('对未接入能力显式失败且不创建 v1 fallback', async (): Promise<void> => {
    /** @brief v2-only 产品网关 / v2-only product gateways. */
    const gateways = createProductGateways({
      authentication: authenticationPort((): string => ACCESS_TOKEN),
      locale: 'zh-CN'
    })

    await expect(
      gateways.interview.listInterviewScenarios(
        asUiOpaqueId<'workspace'>('ws_01K0EXAMPLE00000000000001')
      )
    ).rejects.toMatchObject({
      capability: 'interview-scenarios.list',
      name: 'ApiV2CapabilityUnavailableError'
    })
    await expect(
      gateways.knowledge.listKnowledgeSources(
        asUiOpaqueId<'workspace'>('ws_01K0EXAMPLE00000000000001')
      )
    ).rejects.toBeInstanceOf(ApiV2CapabilityUnavailableError)
  })
})

describe('API v2 Workspace ACL', (): void => {
  it('保留访问权威、分页关系与调用方 AbortSignal', async (): Promise<void> => {
    /** @brief 被协议调用观察到的路径 / Path observed by the protocol call. */
    let observedPath: string | undefined
    /** @brief 被协议调用观察到的选项 / Options observed by the protocol call. */
    let observedOptions: ApiV2GetOptions | undefined
    /** @brief 测试协议客户端 / Test protocol client. */
    const client: ApiV2Client = {
      getJson(path, options): Promise<ApiV2JsonResponse> {
        observedPath = path
        observedOptions = options
        return Promise.resolve(
          apiJson({
            items: [WORKSPACE_ACCESS],
            page: { has_more: true, next_cursor: 'workspace_cursor_page_2' }
          })
        )
      }
    }
    /** @brief Workspace 应用适配器 / Workspace application adapter. */
    const gateway = createApiV2WorkspaceGateway(client)
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    await expect(
      gateway.listWorkspaceAccessPage({ cursor: null, limit: 25, signal: controller.signal })
    ).resolves.toEqual({
      hasMore: true,
      items: [
        {
          memberId: WORKSPACE_ACCESS.member_id,
          role: 'owner',
          workspace: {
            createdAt: WORKSPACE_ACCESS.workspace.created_at,
            dataRegion: 'cn',
            id: WORKSPACE_ACCESS.workspace.id,
            name: "Klee's Workspace",
            plan: 'personal',
            revision: 1,
            slug: 'klee-personal',
            updatedAt: WORKSPACE_ACCESS.workspace.updated_at
          }
        }
      ],
      nextCursor: 'workspace_cursor_page_2'
    })
    expect(observedPath).toBe('/workspaces')
    expect(observedOptions?.query).toEqual({ cursor: null, limit: 25 })
    expect(observedOptions?.signal).toBe(controller.signal)
  })

  it('拒绝在 ACL 中构造没有 cursor 的非末页', (): void => {
    expect(() =>
      mapWorkspaceAccessPage({
        items: [],
        page: { has_more: true, next_cursor: null }
      })
    ).toThrow('must carry a cursor')
  })
})

describe('API v2 Resume ACL', (): void => {
  it('直接映射摘要页并传播 Workspace、cursor、limit 与 AbortSignal', async (): Promise<void> => {
    /** @brief 被协议调用观察到的路径 / Path observed by the protocol call. */
    let observedPath: string | undefined
    /** @brief 被协议调用观察到的选项 / Options observed by the protocol call. */
    let observedOptions: ApiV2GetOptions | undefined
    /** @brief 测试协议客户端 / Test protocol client. */
    const client: ApiV2Client = {
      getJson(path, options): Promise<ApiV2JsonResponse> {
        observedPath = path
        observedOptions = options
        return Promise.resolve(
          apiJson({
            items: [RESUME_SUMMARY],
            page: { has_more: false, next_cursor: null }
          })
        )
      }
    }
    /** @brief Resume 应用适配器 / Resume application adapter. */
    const gateway = createApiV2ResumeGateway(client)
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    await expect(
      gateway.listResumeSummariesPage({
        cursor: null,
        limit: asUiResumePageLimit(40),
        signal: controller.signal,
        workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
      })
    ).resolves.toEqual({
      hasMore: false,
      items: [
        {
          createdAt: RESUME_SUMMARY.created_at,
          id: RESUME_SUMMARY.id,
          locale: 'zh-CN',
          revision: 17,
          templateId: RESUME_SUMMARY.template.template_id,
          templateVersion: '2.1.0',
          title: 'AI Platform Engineer',
          updatedAt: RESUME_SUMMARY.updated_at,
          workspaceId: RESUME_SUMMARY.workspace_id
        }
      ],
      nextCursor: null
    })
    expect(observedPath).toBe(`/workspaces/${RESUME_SUMMARY.workspace_id}/resumes`)
    expect(observedOptions?.query).toEqual({ cursor: null, limit: 40 })
    expect(observedOptions?.signal).toBe(controller.signal)
  })

  it('拒绝在 ACL 中构造没有 cursor 的非末页', (): void => {
    expect(() =>
      mapResumeSummaryPage({ items: [], page: { has_more: true, next_cursor: null } })
    ).toThrow('must carry a cursor')
  })
})

describe('API v2 Resume Template ACL', (): void => {
  it('maps the immutable manifest without transport naming or shared mutable values', (): void => {
    /** @brief 映射后的领域 Template / Mapped domain Template. */
    const template = mapTemplateManifest(RESUME_TEMPLATE)

    expect(template).toMatchObject({
      capabilities: {
        maxColumns: 2,
        supportsCustomSections: true,
        supportsPhoto: true,
        supportsSidebar: false,
        supportsSourceMap: true
      },
      id: RESUME_TEMPLATE.id,
      previewUrl: RESUME_TEMPLATE.preview_url,
      settings: [
        { defaultValue: true, key: 'show.photo', visibleWhen: null },
        {
          defaultValue: { space: 'srgb_hex', value: '#336699' },
          key: 'accent.color',
          visibleWhen: { equals: true, key: 'show.photo' }
        }
      ],
      supportedLocales: ['en-US', 'zh-CN'],
      version: '2.4.0',
      zones: [
        {
          acceptedSectionKinds: ['experience', 'custom'],
          id: 'main',
          labelKey: 'template.zone.main',
          maxSections: 8
        }
      ]
    })
    expect(template.settings[1]?.defaultValue).not.toBe(RESUME_TEMPLATE.settings[1]?.default)
  })

  it('preserves catalog cursor semantics and propagates one public read', async (): Promise<void> => {
    /** @brief 被协议调用观察到的路径 / Path observed by the protocol call. */
    let observedPath: string | undefined
    /** @brief 被协议调用观察到的选项 / Options observed by the protocol call. */
    let observedOptions: ApiV2GetOptions | undefined
    /** @brief 测试公开协议客户端 / Test public protocol client. */
    const client: ApiV2Client = {
      getJson(path, options): Promise<ApiV2JsonResponse> {
        observedPath = path
        observedOptions = options
        return Promise.resolve(
          apiJson({
            items: [RESUME_TEMPLATE],
            page: { has_more: true, next_cursor: 'template_cursor_page_2' }
          })
        )
      }
    }
    /** @brief Template 目录应用适配器 / Template-catalog application adapter. */
    const gateway = createApiV2ResumeTemplateCatalog(client)
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    await expect(
      gateway.listTemplatePage({
        cursor: null,
        limit: asUiResumeTemplatePageLimit(24),
        signal: controller.signal
      })
    ).resolves.toMatchObject({
      hasMore: true,
      items: [{ id: RESUME_TEMPLATE.id, version: RESUME_TEMPLATE.version }],
      nextCursor: 'template_cursor_page_2'
    })
    expect(observedPath).toBe('/resume-templates')
    expect(observedOptions?.query).toEqual({ cursor: null, limit: 24 })
    expect(observedOptions?.signal).toBe(controller.signal)
  })

  it('reads an exact immutable version and rejects an impossible open page', async (): Promise<void> => {
    /** @brief 测试公开协议客户端 / Test public protocol client. */
    const client: ApiV2Client = {
      getJson(path, options): Promise<ApiV2JsonResponse> {
        expect(path).toBe(`/resume-templates/${RESUME_TEMPLATE.id}`)
        expect(options?.query).toEqual({ version: RESUME_TEMPLATE.version })
        return Promise.resolve(apiJson(RESUME_TEMPLATE))
      }
    }
    /** @brief Template 目录应用适配器 / Template-catalog application adapter. */
    const gateway = createApiV2ResumeTemplateCatalog(client)
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    await expect(
      gateway.getTemplate(
        {
          templateId: asUiOpaqueId<'template'>(RESUME_TEMPLATE.id),
          templateVersion: RESUME_TEMPLATE.version
        },
        controller.signal
      )
    ).resolves.toMatchObject({ id: RESUME_TEMPLATE.id, version: RESUME_TEMPLATE.version })
    expect(() =>
      mapResumeTemplatePage({ items: [], page: { has_more: true, next_cursor: null } })
    ).toThrow('must carry a cursor')
  })
})

describe('API v2 Resume creation ACL', (): void => {
  it('maps one stable creation intent to exact v2 wire semantics and a narrow result', async (): Promise<void> => {
    /** @brief 被创建端点观察到的路径 / Path observed by the creation endpoint. */
    let observedPath: string | undefined
    /** @brief 被创建端点观察到的 JSON body / JSON body observed by the creation endpoint. */
    let observedBody: unknown
    /** @brief 被创建端点观察到的 201 策略 / 201 policy observed by the creation endpoint. */
    let observedOptions: Parameters<ResumeCreationHttpClient['postJson']>[2] | undefined
    /** @brief 最小固定 201 transport / Minimal transport fixed to 201 semantics. */
    const client: ResumeCreationHttpClient = {
      postJson(path, body, options) {
        observedPath = path
        observedBody = body
        observedOptions = options
        return Promise.resolve({
          data: createdResumeDocument(),
          metadata: {
            entityTag: '"resume-created-1"',
            location: `https://api.hmalliances.org:8022/api/v2/workspaces/${RESUME_SUMMARY.workspace_id}/resumes/resume_01K0CREATED000000000001`,
            requestId: 'req_runtime_create_12345678'
          },
          status: 201
        })
      }
    }
    /** @brief Resume 创建应用适配器 / Resume-creation application adapter. */
    const gateway = createApiV2ResumeCreationGateway(client)
    /** @brief 本次用户创建意图 / Current user creation intent. */
    const creationAttemptId = createUiCommandId()
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    /** @brief 已确认的新 Resume 资源 / Confirmed new Resume resource. */
    const result = await gateway.createResume({
      creationAttemptId,
      locale: 'zh-CN',
      signal: controller.signal,
      source: { kind: 'new' },
      template: {
        templateId: asUiOpaqueId<'template'>(RESUME_TEMPLATE.id),
        templateVersion: RESUME_TEMPLATE.version
      },
      title: 'Created Resume',
      workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
    })

    expect(observedPath).toBe(`/workspaces/${RESUME_SUMMARY.workspace_id}/resumes`)
    expect(observedBody).toEqual({
      locale: 'zh-CN',
      template: {
        template_id: RESUME_TEMPLATE.id,
        version: RESUME_TEMPLATE.version
      },
      title: 'Created Resume'
    })
    expect(Object.hasOwn(observedBody as object, 'clone_from_resume_id')).toBe(false)
    expect(observedOptions).toMatchObject({
      idempotencyKey: creationAttemptId,
      signal: controller.signal,
      successKind: 'created-resource'
    })
    expect(result).toEqual({
      concurrencyToken: '"resume-created-1"',
      resource: {
        createdAt: '2026-07-23T12:00:00Z',
        id: 'resume_01K0CREATED000000000001',
        locale: 'zh-CN',
        revision: 1,
        template: {
          templateId: RESUME_TEMPLATE.id,
          templateVersion: RESUME_TEMPLATE.version
        },
        title: 'Created Resume',
        updatedAt: '2026-07-23T12:00:00Z',
        workspaceId: RESUME_SUMMARY.workspace_id
      }
    })
    expect(result.resource).not.toHaveProperty('profile')
  })

  it('keeps clone source explicit while the new resource identity stays independent', async (): Promise<void> => {
    /** @brief 被创建端点观察到的 JSON body / JSON body observed by the creation endpoint. */
    let observedBody: unknown
    /** @brief 最小固定 201 transport / Minimal transport fixed to 201 semantics. */
    const client: ResumeCreationHttpClient = {
      postJson(_path, body) {
        observedBody = body
        return Promise.resolve({
          data: createdResumeDocument(),
          metadata: {
            entityTag: '"resume-created-1"',
            location: `https://api.hmalliances.org:8022/api/v2/workspaces/${RESUME_SUMMARY.workspace_id}/resumes/resume_01K0CREATED000000000001`,
            requestId: 'req_runtime_create_12345678'
          },
          status: 201
        })
      }
    }
    /** @brief Resume 创建应用适配器 / Resume-creation application adapter. */
    const gateway = createApiV2ResumeCreationGateway(client)

    await gateway.createResume({
      creationAttemptId: createUiCommandId(),
      locale: 'zh-CN',
      signal: new AbortController().signal,
      source: {
        kind: 'clone',
        resumeId: asUiOpaqueId<'resume'>('resume_01K0SOURCE000000000001')
      },
      template: {
        templateId: asUiOpaqueId<'template'>(RESUME_TEMPLATE.id),
        templateVersion: RESUME_TEMPLATE.version
      },
      title: 'Created Resume',
      workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
    })

    expect(observedBody).toMatchObject({
      clone_from_resume_id: 'resume_01K0SOURCE000000000001'
    })
  })

  it('projects only creation facts from a full decoded SIR', (): void => {
    /** @brief 已严格解码的创建 SIR / Strictly decoded creation SIR. */
    const source = parseResumeDocument(createdResumeDocument())
    expect(mapCreatedResumeResource(source)).toEqual({
      createdAt: '2026-07-23T12:00:00Z',
      id: 'resume_01K0CREATED000000000001',
      locale: 'zh-CN',
      revision: 1,
      template: {
        templateId: RESUME_TEMPLATE.id,
        templateVersion: RESUME_TEMPLATE.version
      },
      title: 'Created Resume',
      updatedAt: '2026-07-23T12:00:00Z',
      workspaceId: RESUME_SUMMARY.workspace_id
    })
  })
})
