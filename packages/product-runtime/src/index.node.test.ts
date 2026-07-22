import { afterEach, describe, expect, it, vi } from 'vitest'
import { asUiOpaqueId, asUiResumePageLimit } from '@ai-job-workspace/app/application'
import type {
  ApiV2Client,
  ApiV2GetOptions,
  ApiV2JsonResponse
} from '@ai-job-workspace/product-api-v2'

import {
  ApiV2CapabilityUnavailableError,
  createApiV2ResumeGateway,
  createApiV2WorkspaceGateway,
  mapResumeSummaryPage,
  mapWorkspaceAccessPage
} from './api-v2-gateways'
import { createProductGateways } from './index'

/** @brief 测试专用非真实 Bearer token / Non-real Bearer token used only by tests. */
const ACCESS_TOKEN = 'access_product_runtime_example_only_7Yw8N2'

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
      getAccessToken: (): string | null => currentAccessToken,
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
      getAccessToken: (): string => ACCESS_TOKEN,
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
