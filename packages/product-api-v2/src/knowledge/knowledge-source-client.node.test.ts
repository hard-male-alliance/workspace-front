import { describe, expect, it, vi } from 'vitest'

import type {
  ApiV2Client,
  ApiV2CreatedResourceResponse,
  ApiV2JsonResponse,
  ApiV2UpdatedWriteJsonResponse
} from '../http/client'
import { ApiV2ContractError, ApiV2WriteOutcomeUnknownError } from '../http/errors'
import type { CreateKnowledgeSourceRequest, KnowledgeVisibilityPolicy } from './knowledge-source'
import {
  createWorkspaceKnowledgeSource,
  getWorkspaceKnowledgeSource,
  listWorkspaceKnowledgeSourcePage,
  updateWorkspaceKnowledgeSource,
  type KnowledgeSourceCreationHttpClient,
  type KnowledgeSourceUpdateHttpClient
} from './knowledge-source-client'

/** @brief 测试 Workspace identity / Workspace identity used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 另一个 Workspace identity / Another Workspace identity used by tests. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试 KnowledgeSource identity / KnowledgeSource identity used by tests. */
const SOURCE_ID = 'knowledge_01K0EXAMPLE00000001'

/** @brief 创建意图的稳定幂等键 / Stable idempotency key of the creation intent. */
const IDEMPOTENCY_KEY = 'create_knowledge_source_000001'

/** @brief 响应 request ID / Response request ID. */
const REQUEST_ID = 'req_knowledge_source_123456'

/** @brief 当前来源强 ETag / Strong ETag of the current source. */
const ENTITY_TAG = '"knowledge-source-revision-1"'

/** @brief 下一来源强 ETag / Strong ETag of the next source. */
const NEXT_ENTITY_TAG = '"knowledge-source-revision-2"'

/** @brief 新来源规范 Location / Canonical Location of the new source. */
const SOURCE_LOCATION =
  `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}` +
  `/knowledge-sources/${SOURCE_ID}`

/**
 * @brief 构造完整合法可见性策略 / Build a complete valid visibility policy.
 * @return canonical KnowledgeVisibilityPolicy / Canonical KnowledgeVisibilityPolicy.
 */
function visibilityPolicy(): KnowledgeVisibilityPolicy {
  return {
    agent_grants: [
      {
        agent_scope: 'interview_agent',
        allowed_operations: ['retrieve', 'quote', 'summarize'],
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
}

/**
 * @brief 构造合法 KnowledgeSource JSON / Build valid KnowledgeSource JSON.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return canonical KnowledgeSource JSON / Canonical KnowledgeSource JSON.
 */
function knowledgeSource(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    created_at: '2026-07-22T12:00:00Z',
    current_version_id: null,
    enabled: true,
    id: SOURCE_ID,
    ingestion: {
      chunk_count: 0,
      document_count: 0,
      last_problem: null,
      last_success_at: null,
      status: 'not_started'
    },
    name: 'Distributed systems interview notes',
    public_config: {},
    revision: 1,
    source_type: 'manual_note',
    updated_at: '2026-07-22T12:00:00Z',
    visibility: visibilityPolicy(),
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造默认创建请求 / Build the default creation request.
 * @return canonical manual-note creation request / Canonical manual-note creation request.
 */
function createRequest(): CreateKnowledgeSourceRequest {
  return {
    input: {
      content: 'Consensus separates safety from liveness.',
      source_type: 'manual_note'
    },
    name: 'Distributed systems interview notes',
    visibility: visibilityPolicy()
  }
}

/**
 * @brief 构造严格 GET 响应 / Build a strict GET response.
 * @param data 尚待领域解码的数据 / Data awaiting domain decoding.
 * @param headers 当前用例响应头 / Response headers for the current case.
 * @return ApiV2JsonResponse / ApiV2JsonResponse.
 */
function getResponse(
  data: unknown,
  headers: HeadersInit = { ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status: 200 }
}

/**
 * @brief 构造固定创建响应 / Build a fixed creation response.
 * @param data 创建响应 body / Creation-response body.
 * @param metadata 当前用例元数据覆盖 / Metadata overrides for the current case.
 * @return 固定 201 响应 / Fixed 201 response.
 */
function createdResponse(
  data: unknown,
  metadata: Partial<ApiV2CreatedResourceResponse['metadata']> = {}
): ApiV2CreatedResourceResponse {
  return {
    data,
    metadata: {
      entityTag: ENTITY_TAG,
      location: SOURCE_LOCATION,
      requestId: REQUEST_ID,
      ...metadata
    },
    status: 201
  }
}

/**
 * @brief 构造固定更新响应 / Build a fixed update response.
 * @param data 更新响应 body / Update-response body.
 * @return 固定 200 更新响应 / Fixed 200 update response.
 */
function updatedResponse(data: unknown): ApiV2UpdatedWriteJsonResponse {
  return {
    data,
    metadata: {
      entityTag: NEXT_ENTITY_TAG,
      location: null,
      requestId: REQUEST_ID
    },
    status: 200
  }
}

describe('API v2 Workspace KnowledgeSource reads', (): void => {
  it('reads one exact tenant page without client-side authorization filtering', async (): Promise<void> => {
    /** @brief 可观察 GET / Observable GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse({
        items: [knowledgeSource()],
        page: { has_more: true, next_cursor: 'next-source-page' }
      })
    )

    await expect(
      listWorkspaceKnowledgeSourcePage(
        { getJson },
        { cursor: 'opaque cursor', limit: 17, workspaceId: WORKSPACE_ID }
      )
    ).resolves.toMatchObject({
      items: [{ id: SOURCE_ID, workspace_id: WORKSPACE_ID }],
      page: { has_more: true, next_cursor: 'next-source-page' }
    })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/knowledge-sources`, {
      expectedStatus: 200,
      maxResponseBytes: 4 * 1024 * 1024,
      query: { cursor: 'opaque cursor', limit: 17 }
    })
  })

  it('fails closed when a collection leaks a different Workspace', async (): Promise<void> => {
    /** @brief 返回跨 Workspace 来源的 GET / GET returning a cross-Workspace source. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse({
        items: [knowledgeSource({ workspace_id: OTHER_WORKSPACE_ID })],
        page: { has_more: false, next_cursor: null }
      })
    )

    await expect(
      listWorkspaceKnowledgeSourcePage({ getJson }, { workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/outside the requested Workspace/u)
  })

  it('returns the source with the ETag from the same response', async (): Promise<void> => {
    /** @brief 返回单个来源的 GET / GET returning one source. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(knowledgeSource()))

    await expect(
      getWorkspaceKnowledgeSource({ getJson }, { sourceId: SOURCE_ID, workspaceId: WORKSPACE_ID })
    ).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: { id: SOURCE_ID, workspace_id: WORKSPACE_ID }
    })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/knowledge-sources/${SOURCE_ID}`,
      {
        expectedStatus: 200,
        maxResponseBytes: 1024 * 1024
      }
    )
  })

  it('rejects missing concurrency metadata and path identity mismatches', async (): Promise<void> => {
    /** @brief 依次返回缺失 ETag 与错误 identity 的 GET / GET returning a missing ETag and then a wrong identity. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(getResponse(knowledgeSource(), { 'X-Request-Id': REQUEST_ID }))
      .mockResolvedValueOnce(getResponse(knowledgeSource({ id: 'knowledge_01K0OTHER0000000001' })))

    await expect(
      getWorkspaceKnowledgeSource({ getJson }, { sourceId: SOURCE_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      getWorkspaceKnowledgeSource({ getJson }, { sourceId: SOURCE_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toThrow(/identity differs/u)
  })
})

describe('API v2 Workspace KnowledgeSource writes', (): void => {
  it('creates with stable idempotency and validates the authoritative response', async (): Promise<void> => {
    /** @brief 可观察创建端口 / Observable creation port. */
    const postJson = vi
      .fn<KnowledgeSourceCreationHttpClient['postJson']>()
      .mockResolvedValue(createdResponse(knowledgeSource()))

    await expect(
      createWorkspaceKnowledgeSource(
        { postJson },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          request: createRequest(),
          workspaceId: WORKSPACE_ID
        }
      )
    ).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      location: SOURCE_LOCATION,
      requestId: REQUEST_ID,
      value: { id: SOURCE_ID }
    })
    expect(postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/knowledge-sources`,
      createRequest(),
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        maxRequestBytes: 1024 * 1024,
        maxResponseBytes: 1024 * 1024,
        successKind: 'created-resource'
      }
    )
  })

  it('marks a schema-valid but cross-Workspace creation result as outcome unknown', async (): Promise<void> => {
    /** @brief 返回错误 Workspace 的创建端口 / Creation port returning the wrong Workspace. */
    const postJson = vi
      .fn<KnowledgeSourceCreationHttpClient['postJson']>()
      .mockResolvedValue(createdResponse(knowledgeSource({ workspace_id: OTHER_WORKSPACE_ID })))

    await expect(
      createWorkspaceKnowledgeSource(
        { postJson },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          request: createRequest(),
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })

  it('marks a 201 whose Location identifies another source as outcome unknown', async (): Promise<void> => {
    /** @brief 返回错配 Location 的创建端口 / Creation port returning a mismatched Location. */
    const postJson = vi.fn<KnowledgeSourceCreationHttpClient['postJson']>().mockResolvedValue(
      createdResponse(knowledgeSource(), {
        location:
          `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}` +
          '/knowledge-sources/knowledge_01K0OTHER0000000001'
      })
    )

    await expect(
      createWorkspaceKnowledgeSource(
        { postJson },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          request: createRequest(),
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })

  it('updates with strong If-Match and returns the next validator', async (): Promise<void> => {
    /** @brief 提交后的策略，集合顺序与服务端返回可不同 / Submitted policy whose set order may differ in the server response. */
    const visibility: KnowledgeVisibilityPolicy = {
      ...visibilityPolicy(),
      allowed_model_regions: ['global', 'cn'],
      policy_version: 2
    }
    /** @brief 服务端语义相同但集合重排的策略 / Semantically equal server policy with reordered sets. */
    const returnedVisibility: KnowledgeVisibilityPolicy = {
      ...visibility,
      allowed_model_regions: ['cn', 'global']
    }
    /** @brief 可观察更新端口 / Observable update port. */
    const patchJson = vi.fn<KnowledgeSourceUpdateHttpClient['patchJson']>().mockResolvedValue(
      updatedResponse(
        knowledgeSource({
          name: 'Renamed notes',
          revision: 2,
          updated_at: '2026-07-22T12:10:00Z',
          visibility: returnedVisibility
        })
      )
    )

    await expect(
      updateWorkspaceKnowledgeSource(
        { patchJson },
        {
          ifMatch: ENTITY_TAG,
          request: { name: 'Renamed notes', visibility },
          sourceId: SOURCE_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).resolves.toMatchObject({
      entityTag: NEXT_ENTITY_TAG,
      value: { name: 'Renamed notes', revision: 2 }
    })
    expect(patchJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/knowledge-sources/${SOURCE_ID}`,
      { name: 'Renamed notes', visibility },
      {
        ifMatch: ENTITY_TAG,
        maxRequestBytes: 256 * 1024,
        maxResponseBytes: 1024 * 1024
      }
    )
  })

  it('does not normalize a reordered sequence of potentially conflicting grants', async (): Promise<void> => {
    /** @brief 顺序具有未冻结冲突语义的提交策略 / Submitted policy whose conflict ordering is not frozen. */
    const visibility: KnowledgeVisibilityPolicy = {
      ...visibilityPolicy(),
      agent_grants: [
        {
          agent_scope: 'interview_agent',
          allowed_operations: ['retrieve'],
          effect: 'allow'
        },
        {
          agent_scope: 'interview_agent',
          allowed_operations: ['retrieve'],
          effect: 'deny'
        }
      ],
      policy_version: 2
    }
    /** @brief 把冲突 grant 调换顺序的成功响应 / Success response reversing the conflicting grants. */
    const returnedVisibility: KnowledgeVisibilityPolicy = {
      ...visibility,
      agent_grants: [...visibility.agent_grants].reverse()
    }
    /** @brief 返回被重排策略的更新端口 / Update port returning the reordered policy. */
    const patchJson = vi.fn<KnowledgeSourceUpdateHttpClient['patchJson']>().mockResolvedValue(
      updatedResponse(
        knowledgeSource({
          revision: 2,
          updated_at: '2026-07-22T12:10:00Z',
          visibility: returnedVisibility
        })
      )
    )

    await expect(
      updateWorkspaceKnowledgeSource(
        { patchJson },
        {
          ifMatch: ENTITY_TAG,
          request: { visibility },
          sourceId: SOURCE_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2WriteOutcomeUnknownError)
  })

  it('rejects invalid preconditions and empty patches before dispatch', async (): Promise<void> => {
    /** @brief 不应执行的更新端口 / Update port that must not execute. */
    const patchJson = vi.fn<KnowledgeSourceUpdateHttpClient['patchJson']>()

    await expect(
      updateWorkspaceKnowledgeSource(
        { patchJson },
        {
          ifMatch: 'W/"weak"',
          request: { name: 'Renamed notes' },
          sourceId: SOURCE_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      updateWorkspaceKnowledgeSource({ patchJson }, {
        ifMatch: ENTITY_TAG,
        request: {},
        sourceId: SOURCE_ID,
        workspaceId: WORKSPACE_ID
      } as Parameters<typeof updateWorkspaceKnowledgeSource>[1])
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(patchJson).not.toHaveBeenCalled()
  })
})
