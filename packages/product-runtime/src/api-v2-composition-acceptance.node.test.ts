/** @file 产品 API v2 组合根运行时验收基线 / Product API v2 composition-root runtime acceptance baseline. */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  asUiOpaqueId,
  createUiCommandId,
  type UiCreateManualKnowledgeNoteCommand
} from '@ai-job-workspace/app/application'
import {
  API_V2_PRODUCTION_ORIGIN,
  type ApiV2AuthenticationPort
} from '@ai-job-workspace/product-api-v2'

import { createProductGateways } from './index'

/** @brief 测试专用但符合 OAuth Bearer 语法的内存令牌 / Test-only in-memory token satisfying OAuth Bearer syntax. */
const ACCESS_TOKEN = 'access_product_gateway_composition_7Yw8N2'

/** @brief 显式授权的测试 Workspace identity / Explicitly authorized Workspace identity used by the test. */
const WORKSPACE_ID = 'ws_01K0COMPOSITION000000000001'

/** @brief 创建后的 KnowledgeSource identity / Identity of the created KnowledgeSource. */
const KNOWLEDGE_SOURCE_ID = 'knowledge_01K0COMPOSITION0000001'

/** @brief `/me` 权威表示的强 ETag / Strong ETag for the authoritative `/me` representation. */
const CURRENT_USER_ETAG = '"current-user-composition-3"'

/** @brief 创建来源权威表示的强 ETag / Strong ETag for the created source authority. */
const CREATED_SOURCE_ETAG = '"knowledge-source-composition-1"'

/** @brief `/me` 响应关联 ID / Correlation ID returned by the `/me` response. */
const CURRENT_USER_RESPONSE_REQUEST_ID = 'request_composition_current_user_000001'

/** @brief 创建响应关联 ID / Correlation ID returned by the creation response. */
const CREATED_SOURCE_RESPONSE_REQUEST_ID = 'request_composition_created_source_000001'

/** @brief 服务端返回的新来源规范绝对 Location / Canonical absolute Location returned for the new source. */
const CREATED_SOURCE_LOCATION =
  `${API_V2_PRODUCTION_ORIGIN}/api/v2/workspaces/${WORKSPACE_ID}` +
  `/knowledge-sources/${KNOWLEDGE_SOURCE_ID}`

/** @brief 严格 API v2 解码所需的当前用户 JSON / Current-user JSON required by the strict API v2 decoder. */
const CURRENT_USER_RESPONSE = {
  created_at: '2026-07-23T12:00:00Z',
  default_workspace_id: WORKSPACE_ID,
  display_name: 'Klee',
  email: 'klee@example.cn',
  email_verified: true,
  id: 'usr_01K0COMPOSITION00000000001',
  locale: 'zh-CN',
  revision: 3,
  scopes: ['knowledge.write', 'workspace.read'],
  subject: 'oidc-subject-01K0COMPOSITION0001',
  updated_at: '2026-07-23T12:05:00Z'
} as const

/** @brief 严格 API v2 解码所需的创建来源 JSON / Created-source JSON required by the strict API v2 decoder. */
const CREATED_SOURCE_RESPONSE = {
  created_at: '2026-07-23T12:10:00Z',
  current_version_id: null,
  enabled: true,
  id: KNOWLEDGE_SOURCE_ID,
  ingestion: {
    chunk_count: 0,
    document_count: 0,
    last_problem: null,
    last_success_at: null,
    status: 'not_started'
  },
  name: '分布式系统手工笔记',
  public_config: {},
  revision: 1,
  source_type: 'manual_note',
  updated_at: '2026-07-23T12:10:00Z',
  visibility: {
    agent_grants: [
      {
        agent_scope: 'interview_agent',
        allowed_operations: ['retrieve', 'summarize'],
        effect: 'allow'
      }
    ],
    allow_external_model_processing: false,
    allowed_model_regions: ['cn'],
    default_effect: 'deny',
    policy_version: 1,
    retention_days: 365,
    sensitivity: 'confidential',
    session_override_allowed: false
  },
  workspace_id: WORKSPACE_ID
} as const

/** @brief 一次全局 fetch 调用的可断言投影 / Assertable projection of one global fetch invocation. */
interface FetchObservation {
  /** @brief 请求体；无 body 时为 null / Request body, or null when absent. */
  readonly body: string | null
  /** @brief 传给 fetch 的凭证策略 / Credentials policy passed to fetch. */
  readonly credentials: RequestCredentials | undefined
  /** @brief 请求头的独立快照 / Independent snapshot of request headers. */
  readonly headers: Headers
  /** @brief 实际 HTTP 方法 / Effective HTTP method. */
  readonly method: string
  /** @brief 实际绝对请求地址 / Effective absolute request URL. */
  readonly url: string
}

/**
 * @brief 构造不会刷新网络凭证的固定认证端口 / Build a fixed authentication port that performs no credential refresh.
 * @return 只提供当前内存 Bearer token 的完整认证端口 / Complete authentication port providing only the current in-memory Bearer token.
 */
function fixedAuthenticationPort(): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string => ACCESS_TOKEN,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/**
 * @brief 构造一条稳定的手工笔记创建命令 / Build one stable manual-note creation command.
 * @return 可经应用 Gateway 发送的完整命令 / Complete command sendable through the application gateway.
 */
function manualNoteCommand(): UiCreateManualKnowledgeNoteCommand {
  return {
    commandId: createUiCommandId(),
    content: 'Safety and liveness are separate proof obligations in distributed systems.',
    name: CREATED_SOURCE_RESPONSE.name,
    visibility: {
      agentGrants: [
        {
          agentScope: 'interview_agent',
          allowedOperations: ['retrieve', 'summarize'],
          effect: 'allow'
        }
      ],
      allowExternalModelProcessing: false,
      allowedModelRegions: ['cn'],
      defaultEffect: 'deny',
      policyVersion: 1,
      retentionDays: 365,
      sensitivity: 'confidential',
      sessionOverrideAllowed: false
    },
    workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
  }
}

afterEach((): void => {
  /** @brief 释放本文件替换的全局 fetch / Release the global fetch replacement installed by this file. */
  vi.unstubAllGlobals()
})

describe('Product API v2 composition acceptance baseline', (): void => {
  it('以 Bearer 读取 /me 后，仅经 v2 Workspace 路径创建手工 Knowledge 笔记', async (): Promise<void> => {
    /** @brief 真实 transport 发出的全部请求投影 / Projection of every request emitted by the real transport. */
    const observations: FetchObservation[] = []
    /** @brief 全局 fetch 的协议级替身 / Protocol-level replacement for global fetch. */
    const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      /** @brief transport 实际给出的绝对 URL / Absolute URL actually supplied by the transport. */
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      /** @brief 当前调用的不可变请求头快照 / Immutable request-header snapshot for this invocation. */
      const headers = new Headers(init?.headers)
      /** @brief 仅产品 JSON transport 可发送的串行化 body / Serialized body that the product JSON transport may send. */
      const body = typeof init?.body === 'string' ? init.body : null
      /** @brief 供后续端到端断言使用的请求投影 / Request projection retained for later end-to-end assertions. */
      const observation: FetchObservation = {
        body,
        credentials: init?.credentials,
        headers,
        method: init?.method ?? 'GET',
        url
      }
      observations.push(observation)

      if (url === `${API_V2_PRODUCTION_ORIGIN}/api/v2/me` && observation.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify(CURRENT_USER_RESPONSE), {
            headers: {
              'Content-Type': 'application/json',
              ETag: CURRENT_USER_ETAG,
              'X-Request-Id': CURRENT_USER_RESPONSE_REQUEST_ID
            },
            status: 200
          })
        )
      }
      if (
        url === `${API_V2_PRODUCTION_ORIGIN}/api/v2/workspaces/${WORKSPACE_ID}/knowledge-sources` &&
        observation.method === 'POST'
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(CREATED_SOURCE_RESPONSE), {
            headers: {
              'Content-Type': 'application/json',
              ETag: CREATED_SOURCE_ETAG,
              Location: CREATED_SOURCE_LOCATION,
              'X-Request-Id': CREATED_SOURCE_RESPONSE_REQUEST_ID
            },
            status: 201
          })
        )
      }
      return Promise.reject(
        new Error(`Unexpected Product API v2 request: ${observation.method} ${url}`)
      )
    })
    vi.stubGlobal('fetch', fetchStub)
    /** @brief 真实 v2-only 组合根生成的应用 Gateway 集合 / Application gateway set built by the real v2-only composition root. */
    const gateways = createProductGateways({
      authentication: fixedAuthenticationPort(),
      locale: 'zh-CN'
    })
    /** @brief 当前用户读取生命周期的取消控制器 / Cancellation controller for the current-user read lifecycle. */
    const currentUserController = new AbortController()
    /** @brief 保持同一用户意图的幂等创建命令 / Idempotent creation command for one user intent. */
    const command = manualNoteCommand()

    await expect(
      gateways.identity.loadCurrentUser(currentUserController.signal)
    ).resolves.toMatchObject({
      defaultWorkspaceId: WORKSPACE_ID,
      id: CURRENT_USER_RESPONSE.id,
      subject: CURRENT_USER_RESPONSE.subject
    })
    /** @brief 由创建 201 响应严格解码并映射的应用权威 / Application authority decoded and mapped from the creation 201 response. */
    const authority = await gateways.knowledge.createManualKnowledgeNote(command)

    expect(authority).toMatchObject({
      concurrencyToken: CREATED_SOURCE_ETAG,
      source: {
        id: KNOWLEDGE_SOURCE_ID,
        ingestion: { status: 'not_started' },
        name: command.name,
        sourceType: 'manual_note',
        visibility: {
          agentGrants: [
            {
              agentScope: 'interview_agent',
              allowedOperations: ['retrieve', 'summarize'],
              effect: 'allow'
            }
          ],
          allowedModelRegions: ['cn']
        },
        workspaceId: WORKSPACE_ID
      }
    })
    expect(fetchStub).toHaveBeenCalledTimes(2)
    expect(observations).toHaveLength(2)
    expect(observations.map((observation) => observation.url)).toEqual([
      `${API_V2_PRODUCTION_ORIGIN}/api/v2/me`,
      `${API_V2_PRODUCTION_ORIGIN}/api/v2/workspaces/${WORKSPACE_ID}/knowledge-sources`
    ])
    expect(
      observations.every((observation) => {
        /** @brief 当前调用已解析的 API URL / Parsed API URL for the current invocation. */
        const parsed = new URL(observation.url)
        return parsed.origin === API_V2_PRODUCTION_ORIGIN && parsed.pathname.startsWith('/api/v2/')
      })
    ).toBe(true)

    /** @brief 认证后的 `/me` 请求 / Authenticated `/me` request. */
    const currentUserRequest = observations[0]
    /** @brief Workspace-scoped Knowledge 创建请求 / Workspace-scoped Knowledge creation request. */
    const creationRequest = observations[1]
    if (currentUserRequest === undefined || creationRequest === undefined) {
      throw new Error(
        'Expected exactly one /me request followed by one Knowledge creation request.'
      )
    }

    expect(currentUserRequest).toMatchObject({
      body: null,
      credentials: 'omit',
      method: 'GET'
    })
    expect(currentUserRequest.headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(currentUserRequest.headers.get('Idempotency-Key')).toBeNull()
    expect(currentUserRequest.headers.get('X-Request-Id')).toMatch(/^req_[A-Za-z0-9_]+$/u)
    expect(creationRequest).toMatchObject({
      credentials: 'omit',
      method: 'POST',
      url: `${API_V2_PRODUCTION_ORIGIN}/api/v2/workspaces/${WORKSPACE_ID}/knowledge-sources`
    })
    expect(creationRequest.headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(creationRequest.headers.get('Content-Type')).toBe('application/json')
    expect(creationRequest.headers.get('Idempotency-Key')).toBe(command.commandId)
    expect(creationRequest.headers.get('X-Request-Id')).toMatch(/^req_[A-Za-z0-9_]+$/u)
    expect(creationRequest.headers.get('X-Request-Id')).not.toBe(
      currentUserRequest.headers.get('X-Request-Id')
    )
    expect(creationRequest.body).not.toBeNull()
    expect(JSON.parse(creationRequest.body ?? '')).toEqual({
      input: { content: command.content, source_type: 'manual_note' },
      name: command.name,
      visibility: {
        agent_grants: [
          {
            agent_scope: 'interview_agent',
            allowed_operations: ['retrieve', 'summarize'],
            effect: 'allow'
          }
        ],
        allow_external_model_processing: false,
        allowed_model_regions: ['cn'],
        default_effect: 'deny',
        policy_version: 1,
        retention_days: 365,
        sensitivity: 'confidential',
        session_override_allowed: false
      }
    })
  })
})
