import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  asUiConcurrencyToken,
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
  type ResumeCreationHttpClient,
  type ResumeJobCommandHttpClient,
  type ResumeOperationBatch,
  type ResumeOperationsHttpClient
} from '@ai-job-workspace/product-api-v2'

import {
  ApiV2CapabilityUnavailableError,
  createApiV2ResumeCreationGateway,
  createApiV2ResumeGateway,
  createApiV2ResumeTemplateCatalog,
  createApiV2WorkspaceGateway,
  mapResumeDocument,
  mapUiResumeRichTextToApiV2,
  mapUiResumeStyleIntentToApiV2,
  mapResumeSummaryPage,
  mapResumeTemplatePage,
  mapCreatedResumeResource,
  mapTemplateManifest,
  mapWorkspaceAccessPage
} from './api-v2-gateways'
import { createProductGateways } from './index'

/** @brief 测试专用非真实 Bearer token / Non-real Bearer token used only by tests. */
const ACCESS_TOKEN = 'access_product_runtime_example_only_7Yw8N2'

/** @brief 只读 Resume ACL 测试不会调用的写端口 / Write port never called by read-only Resume ACL tests. */
const UNUSED_RESUME_OPERATIONS: ResumeOperationsHttpClient = {
  postJson: (): Promise<never> =>
    Promise.reject(new Error('A read-only Resume ACL test attempted an operation write.'))
}

/** @brief 非 Render 测试不会调用的 Resume Job command 端口 / Resume Job-command port never called by non-Render tests. */
const UNUSED_RESUME_JOBS: ResumeJobCommandHttpClient = {
  postJson: (): Promise<never> =>
    Promise.reject(new Error('A non-Render Resume ACL test attempted a Job command.'))
}

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
 * @brief 构造覆盖全部 SIR 结构的 ResumeDocument / Build a ResumeDocument covering the complete SIR structure.
 * @return 可由严格 decoder 消费的 API v2 SIR / API v2 SIR consumable by the strict decoder.
 */
function createdResumeDocument(): Readonly<Record<string, unknown>> {
  return {
    created_at: '2026-07-23T12:00:00Z',
    id: 'resume_01K0CREATED000000000001',
    knowledge_source_id: 'knowledge_01K0CREATED00000001',
    locale: 'zh-CN',
    profile: {
      contacts: [
        {
          id: 'contact_01K0CREATED0000000001',
          kind: 'custom',
          label: 'Research profile',
          url: 'https://example.com/klee',
          value: 'example.com/klee'
        },
        {
          id: 'contact_01K0CREATED0000000002',
          kind: 'location',
          label: null,
          url: null,
          value: 'Singapore'
        }
      ],
      full_name: 'Klee',
      headline: 'AI Platform Engineer',
      summary: {
        marks: [
          { end: 5, kind: 'strong', start: 0 },
          { end: 14, href: 'https://example.com/work', kind: 'link', start: 6 }
        ],
        text: 'Build reliable systems'
      }
    },
    revision: 1,
    sections: [
      {
        content: {
          marks: [{ end: 8, href: null, kind: 'emphasis', start: 0 }],
          text: 'Selected work'
        },
        id: 'section_01K0CREATED000000001',
        items: [
          {
            date_range: { end: 'present', start: '2024-02-29' },
            highlights: [
              {
                marks: [
                  {
                    end: 8,
                    href: 'https://example.com/platform',
                    kind: 'link',
                    start: 0
                  }
                ],
                text: 'Platform ownership'
              }
            ],
            id: 'item_01K0CREATED00000000001',
            kind: 'experience',
            location: 'Singapore',
            organization: 'Arcadia Systems',
            skills: ['TypeScript', 'Distributed Systems'],
            subtitle: 'Infrastructure',
            summary: {
              marks: [{ end: 7, href: null, kind: 'strong', start: 0 }],
              text: 'Shipped a reliable multi-tenant runtime'
            },
            tags: ['platform', 'production'],
            title: 'Staff Engineer',
            url: 'https://example.com/roles/staff-engineer',
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
      extensions: {
        'com.example.resume': {
          rendererHints: { orphanControl: true },
          weights: [1, 0.75, null]
        }
      },
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
      section_layout: [
        {
          compactness: 0.65,
          heading_style_token: 'heading.primary',
          keep_together: true,
          page_break_before: false,
          section_id: 'section_01K0CREATED000000001',
          zone: 'main'
        }
      ],
      style_contract_version: '1.0',
      template_settings: {
        accent: { space: 'srgb_hex', value: '#336699' },
        columns: 1,
        flags: [true, false]
      },
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
 * @brief 构造 operation 结果中的新权威 Resume / Build the new authoritative Resume in an operation result.
 * @param revision operation 后的领域 revision / Domain revision after the operation.
 * @param sectionPatch 首个 section 的可选 wire patch / Optional wire patch for the first section.
 * @return 保持完整 SIR 的新协议文档 / New protocol document retaining the complete SIR.
 */
function operatedResumeDocument(
  revision: number,
  sectionPatch: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  /** @brief 初始完整 SIR / Initial complete SIR. */
  const source = createdResumeDocument()
  /** @brief 测试文档中的首个 section / First section in the test document. */
  const section = (source.sections as readonly Readonly<Record<string, unknown>>[])[0]
  if (section === undefined) throw new Error('Expected the operation fixture to contain a section.')
  return {
    ...source,
    revision,
    sections: [{ ...section, ...sectionPatch }],
    updated_at: `2026-07-23T12:00:0${revision}Z`
  }
}

/**
 * @brief 构造删除唯一 section 后仍自洽的权威 SIR / Build an authoritative SIR that remains coherent after deleting its sole section.
 * @param revision 删除后的领域 revision / Domain revision after deletion.
 * @return sections 与 section layout 均已清理的完整文档 / Complete document with both sections and section layout cleared.
 */
function resumeDocumentWithoutSections(revision: number): Readonly<Record<string, unknown>> {
  /** @brief 删除前的完整文档 / Complete document before deletion. */
  const source = createdResumeDocument()
  /** @brief 删除前的完整 style intent / Complete style intent before deletion. */
  const style = source.style as Readonly<Record<string, unknown>>
  return {
    ...source,
    revision,
    sections: [],
    style: { ...style, section_layout: [] },
    updated_at: `2026-07-23T12:00:0${revision}Z`
  }
}

/**
 * @brief 构造具有指定完整 section 顺序的权威 SIR / Build an authoritative SIR with the specified complete section order.
 * @param revision 排序后的领域 revision / Domain revision after reordering.
 * @param sectionIds 排序后的全部 section IDs / Every section ID after reordering.
 * @return section 与 layout 顺序一致的完整文档 / Complete document whose section and layout orders agree.
 */
function resumeDocumentWithSectionOrder(
  revision: number,
  sectionIds: readonly string[]
): Readonly<Record<string, unknown>> {
  /** @brief 排序前的完整文档 / Complete document before reordering. */
  const source = createdResumeDocument()
  /** @brief 用于构造同构测试 sections 的基础 section / Base section used to build isomorphic test sections. */
  const section = (source.sections as readonly Readonly<Record<string, unknown>>[])[0]
  /** @brief 排序前的完整 style intent / Complete style intent before reordering. */
  const style = source.style as Readonly<Record<string, unknown>>
  /** @brief 用于保持布局引用自洽的基础 layout / Base layout used to keep layout references coherent. */
  const layout = (style.section_layout as readonly Readonly<Record<string, unknown>>[])[0]
  if (section === undefined || layout === undefined) {
    throw new Error('Expected the reorder fixture to contain one section and layout.')
  }
  return {
    ...source,
    revision,
    sections: sectionIds.map((sectionId) => ({ ...section, id: sectionId, items: [] })),
    style: {
      ...style,
      section_layout: sectionIds.map((sectionId) => ({ ...layout, section_id: sectionId }))
    },
    updated_at: `2026-07-23T12:00:0${revision}Z`
  }
}

/**
 * @brief 构造确认全部 operation IDs、但由测试指定权威 SIR 的 200 写端口 / Build a 200 write port acknowledging every operation ID with test-supplied authoritative SIR.
 * @param resume 服务端返回的完整权威 SIR / Complete authoritative SIR returned by the service.
 * @param requestId 可信响应 request ID / Trusted response request ID.
 * @return 可用于验证 ACL 写后条件的 operations 端口 / Operations port for validating ACL postconditions.
 */
function acknowledgedResumeOperationsClient(
  resume: Readonly<Record<string, unknown>>,
  requestId: string
): ResumeOperationsHttpClient {
  return {
    postJson(_path, body) {
      /** @brief 当前测试收到的 operation batch / Operation batch received by the current test. */
      const batch = body as ResumeOperationBatch
      return Promise.resolve({
        data: {
          applied_operation_ids: batch.operations.map((operation) => operation.operation_id),
          conflicts: [],
          render_job_ref: null,
          resume
        },
        metadata: {
          entityTag: '"resume-postcondition-etag-2"',
          location: null,
          requestId
        },
        status: 200
      })
    }
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
  it('读取完整 SIR，并把同一响应的强 ETag 与 camelCase 文档原子配对', async (): Promise<void> => {
    /** @brief 被单文档读取观察到的路径 / Path observed by the single-document read. */
    let observedPath: string | undefined
    /** @brief 被单文档读取观察到的受限响应选项 / Bounded-response options observed by the read. */
    let observedOptions: ApiV2GetOptions | undefined
    /** @brief 完整 Resume SIR 测试载荷 / Complete Resume SIR test payload. */
    const payload = createdResumeDocument()
    /** @brief 返回权威 Resume 与不透明强 ETag 的协议客户端 / Protocol client returning the authoritative Resume and an opaque strong ETag. */
    const client: ApiV2Client = {
      getJson(path, options): Promise<ApiV2JsonResponse> {
        observedPath = path
        observedOptions = options
        return Promise.resolve({
          data: payload,
          headers: new Headers({
            ETag: '"opaque-editor-etag"',
            'X-Request-Id': 'req_runtime_resume_read_12345678'
          }),
          status: 200
        })
      }
    }
    /** @brief Resume 应用适配器 / Resume application adapter. */
    const gateway = createApiV2ResumeGateway(client, UNUSED_RESUME_OPERATIONS, UNUSED_RESUME_JOBS)
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const controller = new AbortController()

    await expect(
      gateway.getResumeEditor(
        asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id),
        asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
        controller.signal
      )
    ).resolves.toEqual({
      concurrencyToken: '"opaque-editor-etag"',
      resume: {
        createdAt: '2026-07-23T12:00:00Z',
        id: 'resume_01K0CREATED000000000001',
        knowledgeSourceId: 'knowledge_01K0CREATED00000001',
        locale: 'zh-CN',
        profile: {
          contacts: [
            {
              id: 'contact_01K0CREATED0000000001',
              kind: 'custom',
              label: 'Research profile',
              url: 'https://example.com/klee',
              value: 'example.com/klee'
            },
            {
              id: 'contact_01K0CREATED0000000002',
              kind: 'location',
              label: null,
              url: null,
              value: 'Singapore'
            }
          ],
          fullName: 'Klee',
          headline: 'AI Platform Engineer',
          summary: {
            marks: [
              { end: 5, kind: 'strong', start: 0 },
              { end: 14, href: 'https://example.com/work', kind: 'link', start: 6 }
            ],
            text: 'Build reliable systems'
          }
        },
        revision: 1,
        sections: [
          {
            content: {
              marks: [{ end: 8, href: null, kind: 'emphasis', start: 0 }],
              text: 'Selected work'
            },
            id: 'section_01K0CREATED000000001',
            items: [
              {
                dateRange: { end: 'present', start: '2024-02-29' },
                highlights: [
                  {
                    marks: [
                      {
                        end: 8,
                        href: 'https://example.com/platform',
                        kind: 'link',
                        start: 0
                      }
                    ],
                    text: 'Platform ownership'
                  }
                ],
                id: 'item_01K0CREATED00000000001',
                kind: 'experience',
                location: 'Singapore',
                organization: 'Arcadia Systems',
                skills: ['TypeScript', 'Distributed Systems'],
                subtitle: 'Infrastructure',
                summary: {
                  marks: [{ end: 7, href: null, kind: 'strong', start: 0 }],
                  text: 'Shipped a reliable multi-tenant runtime'
                },
                tags: ['platform', 'production'],
                title: 'Staff Engineer',
                url: 'https://example.com/roles/staff-engineer',
                visible: true
              }
            ],
            kind: 'experience',
            title: 'Experience',
            visible: true
          }
        ],
        styleIntent: {
          bulletStyleToken: 'disc',
          dateFormatToken: 'iso',
          density: 0.5,
          extensions: {
            'com.example.resume': {
              rendererHints: { orphanControl: true },
              weights: [1, 0.75, null]
            }
          },
          page: {
            customHeight: null,
            customWidth: null,
            margins: {
              bottom: { unit: 'mm', value: 15 },
              left: { unit: 'mm', value: 15 },
              right: { unit: 'mm', value: 15 },
              top: { unit: 'mm', value: 15 }
            },
            maxPages: null,
            orientation: 'portrait',
            showPageNumbers: false,
            size: 'A4'
          },
          palette: {
            background: { space: 'srgb_hex', value: '#ffffff' },
            mutedText: { space: 'srgb_hex', value: '#666666' },
            primary: { space: 'srgb_hex', value: '#336699' },
            secondary: { space: 'srgb_hex', value: '#99aabb' },
            text: { space: 'srgb_hex', value: '#111111' }
          },
          sectionLayout: [
            {
              compactness: 0.65,
              headingStyleToken: 'heading.primary',
              keepTogether: true,
              pageBreakBefore: false,
              sectionId: 'section_01K0CREATED000000001',
              zone: 'main'
            }
          ],
          styleContractVersion: '1.0',
          templateSettings: {
            accent: { space: 'srgb_hex', value: '#336699' },
            columns: 1,
            flags: [true, false]
          },
          typography: {
            baseSizePt: 10,
            fontFamilyToken: 'inter',
            headingScale: 1.2,
            letterSpacingEm: 0,
            lineHeight: 1.4
          }
        },
        template: {
          templateId: RESUME_TEMPLATE.id,
          templateVersion: RESUME_TEMPLATE.version
        },
        title: 'Created Resume',
        updatedAt: '2026-07-23T12:00:00Z',
        workspaceId: RESUME_SUMMARY.workspace_id
      }
    })
    expect(observedPath).toBe(
      `/workspaces/${RESUME_SUMMARY.workspace_id}/resumes/resume_01K0CREATED000000000001`
    )
    expect(observedOptions).toEqual({
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      signal: controller.signal
    })
  })

  it('深复制全部可变嵌套值并保留 mark href 的省略与 null 差异', (): void => {
    /** @brief 严格协议 decoder 输出 / Output of the strict protocol decoder. */
    const source = parseResumeDocument(createdResumeDocument())
    /** @brief 映射后的完整领域文档 / Complete mapped domain document. */
    const mapped = mapResumeDocument(source)
    /** @brief 用于逐层检查引用隔离的协议 section / Protocol section used for reference-isolation checks. */
    const sourceSection = source.sections[0]
    /** @brief 用于逐层检查引用隔离的领域 section / Domain section used for reference-isolation checks. */
    const mappedSection = mapped.sections[0]
    /** @brief 用于逐层检查引用隔离的协议 item / Protocol item used for reference-isolation checks. */
    const sourceItem = sourceSection?.items[0]
    /** @brief 用于逐层检查引用隔离的领域 item / Domain item used for reference-isolation checks. */
    const mappedItem = mappedSection?.items[0]
    if (
      sourceSection === undefined ||
      mappedSection === undefined ||
      sourceItem === undefined ||
      mappedItem === undefined
    ) {
      throw new Error('Expected the complete Resume fixture to contain one section and item.')
    }

    expect(mapped).not.toBe(source)
    expect(mapped.profile).not.toBe(source.profile)
    expect(mapped.profile.contacts).not.toBe(source.profile.contacts)
    expect(mapped.profile.contacts[0]).not.toBe(source.profile.contacts[0])
    expect(mapped.profile.summary).not.toBe(source.profile.summary)
    expect(mapped.profile.summary?.marks).not.toBe(source.profile.summary?.marks)
    expect(mapped.profile.summary?.marks[0]).not.toBe(source.profile.summary?.marks[0])
    expect(mapped.sections).not.toBe(source.sections)
    expect(mappedSection).not.toBe(sourceSection)
    expect(mappedSection.content).not.toBe(sourceSection.content)
    expect(mappedSection.content?.marks).not.toBe(sourceSection.content?.marks)
    expect(mappedSection.items).not.toBe(sourceSection.items)
    expect(mappedItem).not.toBe(sourceItem)
    expect(mappedItem.dateRange).not.toBe(sourceItem.date_range)
    expect(mappedItem.summary).not.toBe(sourceItem.summary)
    expect(mappedItem.summary?.marks).not.toBe(sourceItem.summary?.marks)
    expect(mappedItem.highlights).not.toBe(sourceItem.highlights)
    expect(mappedItem.highlights[0]).not.toBe(sourceItem.highlights[0])
    expect(mappedItem.highlights[0]?.marks).not.toBe(sourceItem.highlights[0]?.marks)
    expect(mappedItem.skills).not.toBe(sourceItem.skills)
    expect(mappedItem.tags).not.toBe(sourceItem.tags)
    expect(mapped.styleIntent).not.toBe(source.style)
    expect(mapped.styleIntent.extensions).not.toBe(source.style.extensions)
    expect(mapped.styleIntent.extensions['com.example.resume']).not.toBe(
      source.style.extensions['com.example.resume']
    )
    expect(mapped.styleIntent.page).not.toBe(source.style.page)
    expect(mapped.styleIntent.page.margins).not.toBe(source.style.page.margins)
    expect(mapped.styleIntent.page.margins.top).not.toBe(source.style.page.margins.top)
    expect(mapped.styleIntent.palette).not.toBe(source.style.palette)
    expect(mapped.styleIntent.palette.primary).not.toBe(source.style.palette.primary)
    expect(mapped.styleIntent.sectionLayout).not.toBe(source.style.section_layout)
    expect(mapped.styleIntent.sectionLayout[0]).not.toBe(source.style.section_layout[0])
    expect(mapped.styleIntent.templateSettings).not.toBe(source.style.template_settings)
    expect(mapped.styleIntent.templateSettings.accent).not.toBe(
      source.style.template_settings.accent
    )
    expect(mapped.styleIntent.templateSettings.flags).not.toBe(source.style.template_settings.flags)
    expect(mapped.styleIntent.typography).not.toBe(source.style.typography)
    expect(mapped.template).not.toBe(source.template)
    expect(mapped.profile.summary?.marks).toEqual([
      { end: 5, kind: 'strong', start: 0 },
      { end: 14, href: 'https://example.com/work', kind: 'link', start: 6 }
    ])
    expect(mappedSection.content?.marks).toEqual([
      { end: 8, href: null, kind: 'emphasis', start: 0 }
    ])
  })

  it('无损反向映射 Unicode RichText、marks、link 与 href omission', (): void => {
    /** @brief 含 surrogate pair、嵌套样式和链接的领域富文本 / Domain rich text with a surrogate pair, nested styles, and a link. */
    const source = {
      marks: [
        { end: 3, kind: 'strong' as const, start: 0 },
        { end: 2, href: null, kind: 'emphasis' as const, start: 0 },
        {
          end: 8,
          href: 'https://example.com/klee?lang=zh',
          kind: 'link' as const,
          start: 4
        }
      ],
      text: '你好🧨 Klee'
    }

    /** @brief 反向映射后的 wire DTO / Wire DTO after reverse mapping. */
    const wire = mapUiResumeRichTextToApiV2(source)

    expect(wire).toEqual(source)
    expect([...wire.text]).toHaveLength(8)
    expect(wire).not.toBe(source)
    expect(wire.marks).not.toBe(source.marks)
    expect(wire.marks[0]).not.toBe(source.marks[0])
    expect(Object.hasOwn(wire.marks[0] ?? {}, 'href')).toBe(false)
    expect(Object.hasOwn(wire.marks[1] ?? {}, 'href')).toBe(true)
  })

  it('用同一 command identity 原子提交 title 与完整 RichText，并在安全重试时保持 wire 不变', async (): Promise<void> => {
    /** @brief 用户编辑的完整 Unicode 富文本 / Complete Unicode rich text edited by the user. */
    const content = {
      marks: [
        { end: 3, kind: 'strong' as const, start: 0 },
        {
          end: 8,
          href: 'https://example.com/klee',
          kind: 'link' as const,
          start: 4
        }
      ],
      text: '你好🧨 Klee'
    }
    /** @brief 同一用户意图内复用的命令身份 / Command identity reused within one user intent. */
    const commandId = createUiCommandId()
    /** @brief transport 观察到的请求 bodies / Request bodies observed by the transport. */
    const observedBodies: unknown[] = []
    /** @brief transport 观察到的请求选项 / Request options observed by the transport. */
    const observedOptions: Parameters<ResumeOperationsHttpClient['postJson']>[2][] = []
    /** @brief transport 观察到的路径 / Path observed by the transport. */
    const observedPaths: string[] = []
    /** @brief 固定返回同一幂等结果的 operations 端口 / Operations port returning the same idempotent result. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson(path, body, options) {
        observedPaths.push(path)
        observedBodies.push(body)
        observedOptions.push(options)
        return Promise.resolve({
          data: {
            applied_operation_ids: [`${commandId}_title`, `${commandId}_content`],
            conflicts: [],
            render_job_ref: null,
            resume: operatedResumeDocument(2, {
              content: mapUiResumeRichTextToApiV2(content),
              title: 'Unicode 标题 🧨'
            })
          },
          metadata: {
            entityTag: '"resume-operation-etag-2"',
            location: null,
            requestId: 'request_resume_operation_update_0001'
          },
          status: 200
        })
      }
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The operation test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )
    /** @brief 一次编辑意图的完整领域输入 / Complete domain input for one edit intent. */
    const input = {
      baseRevision: 1,
      commandId,
      concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
      content,
      resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
      sectionId: asUiOpaqueId<'resume-section'>('section_01K0CREATED000000001'),
      title: 'Unicode 标题 🧨',
      workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
    }

    await expect(gateway.updateResumeSection(input)).resolves.toMatchObject({
      concurrencyToken: '"resume-operation-etag-2"',
      resume: {
        revision: 2,
        sections: [{ content, title: 'Unicode 标题 🧨' }]
      }
    })
    await expect(gateway.updateResumeSection(input)).resolves.toMatchObject({
      concurrencyToken: '"resume-operation-etag-2"'
    })

    expect(observedPaths).toEqual([
      `/workspaces/${RESUME_SUMMARY.workspace_id}/resumes/resume_01K0CREATED000000000001/operations`,
      `/workspaces/${RESUME_SUMMARY.workspace_id}/resumes/resume_01K0CREATED000000000001/operations`
    ])
    expect(observedBodies).toHaveLength(2)
    expect(observedBodies[1]).toEqual(observedBodies[0])
    expect(observedBodies[0]).toEqual({
      base_revision: 1,
      client_batch_id: commandId,
      conflict_strategy: 'rebase_if_safe',
      operations: [
        {
          entity_id: 'section_01K0CREATED000000001',
          field_path: ['title'],
          op: 'set_field',
          operation_id: `${commandId}_title`,
          value: 'Unicode 标题 🧨'
        },
        {
          entity_id: 'section_01K0CREATED000000001',
          field_path: ['content'],
          op: 'set_field',
          operation_id: `${commandId}_content`,
          value: content
        }
      ],
      render_hint: 'none'
    })
    expect(observedOptions).toHaveLength(2)
    expect(observedOptions[0]).toMatchObject({
      idempotencyKey: commandId,
      ifMatch: '"resume-operation-etag-1"',
      successKind: 'updated-result'
    })
    expect(observedOptions[1]?.idempotencyKey).toBe(observedOptions[0]?.idempotencyKey)
  })

  it('用完整目标顺序生成唯一 move_entity 链，并用 reject 保护结构意图', async (): Promise<void> => {
    /** @brief 本次完整排序意图 / Complete ordering intent. */
    const orderedSectionIds = [
      asUiOpaqueId<'resume-section'>('section_order_target_00000003'),
      asUiOpaqueId<'resume-section'>('section_order_target_00000001'),
      asUiOpaqueId<'resume-section'>('section_order_target_00000002')
    ] as const
    /** @brief 排序命令身份 / Reorder command identity. */
    const commandId = createUiCommandId()
    /** @brief transport 观察到的 batch / Batch observed by the transport. */
    let observedBatch: ResumeOperationBatch | undefined
    /** @brief 固定成功的排序 operations 端口 / Reorder operations port with a fixed successful result. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson(_path, body) {
        observedBatch = body as ResumeOperationBatch
        return Promise.resolve({
          data: {
            applied_operation_ids: observedBatch.operations.map(
              (operation) => operation.operation_id
            ),
            conflicts: [],
            render_job_ref: null,
            resume: resumeDocumentWithSectionOrder(2, orderedSectionIds)
          },
          metadata: {
            entityTag: '"resume-reorder-etag-2"',
            location: null,
            requestId: 'request_resume_operation_reorder_0001'
          },
          status: 200
        })
      }
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The reorder test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await gateway.reorderResumeSections({
      baseRevision: 1,
      commandId,
      concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
      orderedSectionIds,
      resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
      workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
    })

    expect(observedBatch).toEqual({
      base_revision: 1,
      client_batch_id: commandId,
      conflict_strategy: 'reject',
      operations: orderedSectionIds.map((sectionId, index) => ({
        after_id: orderedSectionIds[index - 1] ?? null,
        entity_id: sectionId,
        entity_kind: 'section',
        op: 'move_entity',
        operation_id: `${commandId}_move_${index}`,
        parent_id: null
      })),
      render_hint: 'none'
    })
    expect(new Set(observedBatch?.operations.map((operation) => operation.operation_id)).size).toBe(
      orderedSectionIds.length
    )
  })

  it('用 remove_entity 与 reject 提交 destructive section 删除', async (): Promise<void> => {
    /** @brief 删除命令身份 / Delete command identity. */
    const commandId = createUiCommandId()
    /** @brief transport 观察到的 batch / Batch observed by the transport. */
    let observedBatch: ResumeOperationBatch | undefined
    /** @brief 固定成功的删除 operations 端口 / Delete operations port with a fixed successful result. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson(_path, body) {
        observedBatch = body as ResumeOperationBatch
        return Promise.resolve({
          data: {
            applied_operation_ids: [`${commandId}_remove`],
            conflicts: [],
            render_job_ref: null,
            resume: resumeDocumentWithoutSections(2)
          },
          metadata: {
            entityTag: '"resume-delete-etag-2"',
            location: null,
            requestId: 'request_resume_operation_delete_0001'
          },
          status: 200
        })
      }
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The delete test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await gateway.deleteResumeSection({
      baseRevision: 1,
      commandId,
      concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
      resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
      sectionId: asUiOpaqueId<'resume-section'>('section_01K0CREATED000000001'),
      workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
    })

    expect(observedBatch).toEqual({
      base_revision: 1,
      client_batch_id: commandId,
      conflict_strategy: 'reject',
      operations: [
        {
          entity_id: 'section_01K0CREATED000000001',
          entity_kind: 'section',
          op: 'remove_entity',
          operation_id: `${commandId}_remove`
        }
      ],
      render_hint: 'none'
    })
  })

  it('把已确认但未反映 title/content 的 update 结果标记为未知', async (): Promise<void> => {
    /** @brief 当前命令的可信响应 request ID / Trusted response request ID for the command. */
    const requestId = 'request_resume_update_postcondition_1'
    /** @brief 返回未修改 section 的 operations 端口 / Operations port returning an unchanged section. */
    const operationsClient = acknowledgedResumeOperationsClient(
      operatedResumeDocument(2),
      requestId
    )
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The update postcondition test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await expect(
      gateway.updateResumeSection({
        baseRevision: 1,
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
        content: { marks: [], text: 'Expected authoritative content' },
        resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
        sectionId: asUiOpaqueId<'resume-section'>('section_01K0CREATED000000001'),
        title: 'Expected authoritative title',
        workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      problemCode: null,
      requestId,
      status: 200
    })
  })

  it('把已确认但未反映完整目标顺序的 reorder 结果标记为未知', async (): Promise<void> => {
    /** @brief 用户要求的完整目标顺序 / Complete target order requested by the user. */
    const orderedSectionIds = [
      asUiOpaqueId<'resume-section'>('section_order_postcondition_003'),
      asUiOpaqueId<'resume-section'>('section_order_postcondition_001'),
      asUiOpaqueId<'resume-section'>('section_order_postcondition_002')
    ] as const
    /** @brief 与目标顺序不同的服务端权威顺序 / Authoritative server order differing from the target. */
    const returnedSectionIds = [
      orderedSectionIds[1],
      orderedSectionIds[2],
      orderedSectionIds[0]
    ] as const
    /** @brief 当前命令的可信响应 request ID / Trusted response request ID for the command. */
    const requestId = 'request_resume_reorder_postcondition_1'
    /** @brief 返回错误顺序的 operations 端口 / Operations port returning the wrong order. */
    const operationsClient = acknowledgedResumeOperationsClient(
      resumeDocumentWithSectionOrder(2, returnedSectionIds),
      requestId
    )
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The reorder postcondition test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await expect(
      gateway.reorderResumeSections({
        baseRevision: 1,
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
        orderedSectionIds,
        resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
        workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      problemCode: null,
      requestId,
      status: 200
    })
  })

  it('把已确认但仍保留目标 section 的 delete 结果标记为未知', async (): Promise<void> => {
    /** @brief 当前命令的可信响应 request ID / Trusted response request ID for the command. */
    const requestId = 'request_resume_delete_postcondition_1'
    /** @brief 返回仍含目标 section 的 operations 端口 / Operations port still returning the target section. */
    const operationsClient = acknowledgedResumeOperationsClient(
      operatedResumeDocument(2),
      requestId
    )
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The delete postcondition test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await expect(
      gateway.deleteResumeSection({
        baseRevision: 1,
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
        resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
        sectionId: asUiOpaqueId<'resume-section'>('section_01K0CREATED000000001'),
        workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      problemCode: null,
      requestId,
      status: 200
    })
  })

  it('原子提交 set_template 与完整确定性 style leaves，并让不同 signal 共享冻结信封', async (): Promise<void> => {
    /** @brief 用户模板样式命令基于的完整领域文档 / Complete domain document on which the user's Template-style command is based. */
    const initialDocument = mapResumeDocument(parseResumeDocument(createdResumeDocument()))
    /** @brief 用户为目标模板确认的完整最终样式 / Complete final style confirmed by the user for the target Template. */
    const styleIntent = {
      ...initialDocument.styleIntent,
      density: 0.73,
      page: {
        ...initialDocument.styleIntent.page,
        showPageNumbers: true
      },
      templateSettings: {
        'accent.color': { space: 'srgb_hex' as const, value: '#445566' },
        'show.photo': true
      }
    }
    /** @brief 精确目标 wire 样式 / Exact target wire style. */
    const expectedStyle = mapUiResumeStyleIntentToApiV2(styleIntent)
    /** @brief 目标不可变模板 / Target immutable Template. */
    const targetTemplate = {
      templateId: asUiOpaqueId<'template'>('template_target_atomic_000001'),
      templateVersion: '3.0.0'
    }
    /** @brief 同一用户意图保持稳定的 command identity / Command identity stable for the same user intent. */
    const commandId = createUiCommandId()
    /** @brief transport 观察到的冻结 batches / Frozen batches observed by the transport. */
    const observedBatches: ResumeOperationBatch[] = []
    /** @brief transport 观察到的调用选项 / Call options observed by the transport. */
    const observedOptions: Parameters<ResumeOperationsHttpClient['postJson']>[2][] = []
    /** @brief 返回同一已确认结果的 operation 端口 / Operations port returning the same confirmed result. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson(_path, body, options) {
        /** @brief 当前严格 batch / Current strict batch. */
        const batch = body as ResumeOperationBatch
        observedBatches.push(batch)
        observedOptions.push(options)
        return Promise.resolve({
          data: {
            applied_operation_ids: batch.operations.map((operation) => operation.operation_id),
            conflicts: [],
            render_job_ref: null,
            resume: {
              ...createdResumeDocument(),
              revision: 2,
              style: expectedStyle,
              template: {
                template_id: targetTemplate.templateId,
                version: targetTemplate.templateVersion
              },
              updated_at: '2026-07-23T12:00:02Z'
            }
          },
          metadata: {
            entityTag: '"resume-template-style-etag-2"',
            location: null,
            requestId: 'request_resume_template_style_0001'
          },
          status: 200
        })
      }
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The Template-style test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )
    /** @brief 不包含调用生命周期 signal 的冻结命令 / Frozen command excluding call-lifecycle signals. */
    const command = {
      baseRevision: 1,
      commandId,
      concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
      resumeId: initialDocument.id,
      styleIntent,
      targetTemplate,
      workspaceId: initialDocument.workspaceId
    }
    /** @brief 首次提交的调用生命周期 / Call lifecycle of the first submission. */
    const firstSignal = new AbortController().signal
    /** @brief 结果确认重放的独立调用生命周期 / Independent call lifecycle for confirmation replay. */
    const replaySignal = new AbortController().signal

    await expect(gateway.updateResumeTemplateAndStyle(command, firstSignal)).resolves.toMatchObject(
      {
        concurrencyToken: '"resume-template-style-etag-2"',
        resume: {
          revision: 2,
          styleIntent,
          template: targetTemplate
        }
      }
    )
    await expect(
      gateway.updateResumeTemplateAndStyle(command, replaySignal)
    ).resolves.toMatchObject({
      concurrencyToken: '"resume-template-style-etag-2"'
    })

    expect(observedBatches).toHaveLength(2)
    expect(observedBatches[1]).toEqual(observedBatches[0])
    expect(observedOptions[0]?.signal).toBe(firstSignal)
    expect(observedOptions[1]?.signal).toBe(replaySignal)
    expect(observedOptions.map((options) => options.idempotencyKey)).toEqual([commandId, commandId])
    /** @brief 首次传输的确定性 batch / Deterministic batch sent on the first attempt. */
    const batch = observedBatches[0]
    if (batch === undefined) throw new Error('Expected a Template-style operation batch.')
    expect(batch).toMatchObject({
      base_revision: 1,
      client_batch_id: commandId,
      conflict_strategy: 'reject',
      render_hint: 'none'
    })
    expect(batch.operations).toHaveLength(26)
    expect(batch.operations[0]).toEqual({
      op: 'set_template',
      operation_id: `${commandId}_template`,
      settings: expectedStyle.template_settings,
      template: {
        template_id: targetTemplate.templateId,
        version: targetTemplate.templateVersion
      }
    })
    /** @brief 全部 style set_field paths / Every style set_field path. */
    const fieldPaths = batch.operations.flatMap((operation) =>
      operation.op === 'set_field' ? [operation.field_path.join('.')] : []
    )
    expect(fieldPaths).toHaveLength(25)
    expect(fieldPaths).not.toContain('style.style_contract_version')
    expect(fieldPaths).not.toContain('style.template_settings')
    expect(new Set(batch.operations.map((operation) => operation.operation_id)).size).toBe(26)
  })

  it('把不满足完整模板样式 postcondition 的 200 视为 outcome unknown', async (): Promise<void> => {
    /** @brief 初始完整领域文档 / Initial complete domain document. */
    const initialDocument = mapResumeDocument(parseResumeDocument(createdResumeDocument()))
    /** @brief 用户要求的目标样式 / Target style required by the user. */
    const styleIntent = { ...initialDocument.styleIntent, density: 0.77 }
    /** @brief 故意返回不同 density 的 200 operation 端口 / 200 operations port intentionally returning a different density. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson(_path, body) {
        /** @brief transport 接收的严格 batch / Strict batch received by the transport. */
        const batch = body as ResumeOperationBatch
        /** @brief 与命令不一致的服务端样式 / Server style inconsistent with the command. */
        const wrongStyle = {
          ...mapUiResumeStyleIntentToApiV2(styleIntent),
          density: 0.12
        }
        return Promise.resolve({
          data: {
            applied_operation_ids: batch.operations.map((operation) => operation.operation_id),
            conflicts: [],
            render_job_ref: null,
            resume: {
              ...createdResumeDocument(),
              revision: 2,
              style: wrongStyle,
              updated_at: '2026-07-23T12:00:02Z'
            }
          },
          metadata: {
            entityTag: '"resume-template-style-etag-bad"',
            location: null,
            requestId: 'request_resume_template_style_bad_0001'
          },
          status: 200
        })
      }
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The Template-style test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )

    await expect(
      gateway.updateResumeTemplateAndStyle({
        baseRevision: 1,
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
        resumeId: initialDocument.id,
        styleIntent,
        targetTemplate: initialDocument.template,
        workspaceId: initialDocument.workspaceId
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      status: 200
    })
  })

  it('把 200 ResumeOperationResult conflicts 映射为不伪造 HTTP 语义的领域错误', async (): Promise<void> => {
    /** @brief 冲突命令身份 / Conflicting command identity. */
    const commandId = createUiCommandId()
    /** @brief 返回已确认原子冲突的 operations 端口 / Operations port returning a confirmed atomic conflict. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson: () =>
        Promise.resolve({
          data: {
            applied_operation_ids: [],
            conflicts: [
              {
                code: 'resume.field_conflict',
                entity_id: 'section_01K0CREATED000000001',
                field_path: ['title'],
                operation_id: `${commandId}_title`
              }
            ],
            render_job_ref: null,
            resume: operatedResumeDocument(3, { title: 'Authoritative server title' })
          },
          metadata: {
            entityTag: '"resume-authoritative-etag-3"',
            location: null,
            requestId: 'request_resume_operation_conflict_0001'
          },
          status: 200
        })
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      {
        getJson: (): Promise<never> =>
          Promise.reject(new Error('The conflict test unexpectedly performed a read.'))
      },
      operationsClient,
      UNUSED_RESUME_JOBS
    )
    /** @brief 捕获的应用领域错误 / Captured application-domain error. */
    let captured: unknown

    try {
      await gateway.updateResumeSection({
        baseRevision: 1,
        commandId,
        concurrencyToken: asUiConcurrencyToken('"resume-operation-etag-1"'),
        resumeId: asUiOpaqueId<'resume'>('resume_01K0CREATED000000000001'),
        sectionId: asUiOpaqueId<'resume-section'>('section_01K0CREATED000000001'),
        title: 'Local title',
        workspaceId: asUiOpaqueId<'workspace'>(RESUME_SUMMARY.workspace_id)
      })
    } catch (error: unknown) {
      captured = error
    }

    expect(captured).toMatchObject({
      authoritativeEditor: {
        concurrencyToken: '"resume-authoritative-etag-3"',
        resume: {
          revision: 3,
          sections: [{ title: 'Authoritative server title' }]
        }
      },
      conflicts: [
        {
          code: 'resume.field_conflict',
          entityId: 'section_01K0CREATED000000001',
          fieldPath: ['title'],
          operationId: `${commandId}_title`
        }
      ],
      name: 'ResumeBatchConflictError'
    })
    expect(captured).not.toHaveProperty('status')
    expect(captured).not.toHaveProperty('retryable')
  })

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
    const gateway = createApiV2ResumeGateway(client, UNUSED_RESUME_OPERATIONS, UNUSED_RESUME_JOBS)
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
