/** @file API v2 KnowledgeSource Gateway 运行时测试 / Runtime tests for the API v2 KnowledgeSource gateway. */

import { describe, expect, it, vi } from 'vitest'

import {
  ApiV2ContractError,
  type ApiV2CreatedResourceResponse,
  type ApiV2HttpClient,
  type ApiV2JsonResponse,
  type ApiV2UpdatedWriteJsonResponse,
  type KnowledgeVisibilityPolicy
} from '@ai-job-workspace/product-api-v2'

import {
  asUiConcurrencyToken,
  asUiKnowledgeSourcePageLimit,
  asUiOpaqueId,
  type UiCreateManualKnowledgeNoteCommand,
  type UiKnowledgeVisibilityPolicy
} from '@ai-job-workspace/app/application'

import { ApiV2KnowledgeGateway } from './knowledge-gateway'

/** @brief 测试 Workspace identity / Workspace identity used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 另一 Workspace identity / Another Workspace identity. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试来源 identity / KnowledgeSource identity used by tests. */
const SOURCE_ID = 'knowledge_01K0EXAMPLE00000001'

/** @brief 响应 request identity / Response request identity. */
const REQUEST_ID = 'request_knowledge_source_123456'

/** @brief 当前强 ETag / Current strong ETag. */
const ENTITY_TAG = '"knowledge-source-revision-1"'

/** @brief 下一强 ETag / Next strong ETag. */
const NEXT_ENTITY_TAG = '"knowledge-source-revision-2"'

/** @brief 新资源规范 Location / Canonical Location of the created source. */
const SOURCE_LOCATION =
  `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}` +
  `/knowledge-sources/${SOURCE_ID}`

/** @brief 构造 canonical 可见性策略 / Build a canonical visibility policy. */
function apiVisibility(): KnowledgeVisibilityPolicy {
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

/** @brief 构造领域可见性策略 / Build a domain visibility policy. */
function uiVisibility(): UiKnowledgeVisibilityPolicy {
  return {
    agentGrants: [
      {
        agentScope: 'interview_agent',
        allowedOperations: ['retrieve', 'quote', 'summarize'],
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
  }
}

/**
 * @brief 构造合法 KnowledgeSource JSON / Build valid KnowledgeSource JSON.
 * @param overrides 当前测试覆盖 / Overrides for the current test.
 * @return 尚待 canonical codec 解码的 JSON / JSON awaiting canonical codec decoding.
 */
function knowledgeSource(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
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
    visibility: apiVisibility(),
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造读取响应 / Build a read response.
 * @param data 待领域解码 body / Body awaiting domain decoding.
 * @param headers 响应头 / Response headers.
 * @return API v2 JSON response / API v2 JSON response.
 */
function readResponse(
  data: unknown,
  headers: HeadersInit = { ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status: 200 }
}

/**
 * @brief 构造 201 创建响应 / Build a 201 creation response.
 * @param data 待领域解码 body / Body awaiting domain decoding.
 * @return 带强 ETag 与 Location 的响应 / Response carrying a strong ETag and Location.
 */
function createdResponse(data: unknown): ApiV2CreatedResourceResponse {
  return {
    data,
    metadata: {
      entityTag: ENTITY_TAG,
      location: SOURCE_LOCATION,
      requestId: REQUEST_ID
    },
    status: 201
  }
}

/**
 * @brief 构造 200 更新响应 / Build a 200 update response.
 * @param data 待领域解码 body / Body awaiting domain decoding.
 * @return 带下一强 ETag 的响应 / Response carrying the next strong ETag.
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

/** @brief 构造稳定手工笔记命令 / Build a stable manual-note command. */
function createCommand(): UiCreateManualKnowledgeNoteCommand {
  return {
    commandId: asUiOpaqueId<'command'>('command_knowledge_source_000001'),
    content: 'Consensus separates safety from liveness.',
    name: 'Distributed systems interview notes',
    visibility: uiVisibility(),
    workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
  }
}

describe('ApiV2KnowledgeGateway API v2 runtime boundary', (): void => {
  it('maps one Workspace cursor page without flattening canonical lifecycle facts', async (): Promise<void> => {
    const getJson = vi.fn().mockResolvedValue(
      readResponse({
        items: [
          knowledgeSource({
            current_version_id: 'knowledge_version_01K0EXAMPLE001',
            ingestion: {
              chunk_count: 8,
              document_count: 2,
              last_problem: null,
              last_success_at: '2026-07-22T12:30:00Z',
              status: 'deleting'
            },
            public_config: { clone_url: 'https://example.com/repo.git', ref: null },
            source_type: 'git_repository'
          })
        ],
        page: { has_more: true, next_cursor: 'knowledge-source-next-cursor' }
      })
    )
    const gateway = new ApiV2KnowledgeGateway({ getJson } as unknown as ApiV2HttpClient)
    const signal = new AbortController().signal

    const page = await gateway.listKnowledgeSourcePage({
      cursor: null,
      limit: asUiKnowledgeSourcePageLimit(25),
      signal,
      workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    })

    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/knowledge-sources`, {
      expectedStatus: 200,
      maxResponseBytes: 4 * 1024 * 1024,
      query: { cursor: null, limit: 25 },
      signal
    })
    expect(page).toMatchObject({
      hasMore: true,
      items: [
        {
          currentVersionId: 'knowledge_version_01K0EXAMPLE001',
          ingestion: {
            chunkCount: 8,
            documentCount: 2,
            status: 'deleting'
          },
          publicConfig: {
            cloneUrl: 'https://example.com/repo.git',
            ref: null
          },
          sourceType: 'git_repository',
          workspaceId: WORKSPACE_ID
        }
      ],
      nextCursor: 'knowledge-source-next-cursor'
    })
  })

  it('returns a source only with its same-response strong ETag and fails closed cross-Workspace', async (): Promise<void> => {
    const strongGet = vi.fn().mockResolvedValue(readResponse(knowledgeSource()))
    const strongGateway = new ApiV2KnowledgeGateway({
      getJson: strongGet
    } as unknown as ApiV2HttpClient)

    await expect(
      strongGateway.getKnowledgeSource({
        signal: new AbortController().signal,
        sourceId: asUiOpaqueId<'knowledge-source'>(SOURCE_ID),
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).resolves.toMatchObject({
      concurrencyToken: ENTITY_TAG,
      source: { id: SOURCE_ID, workspaceId: WORKSPACE_ID }
    })

    const crossWorkspaceGateway = new ApiV2KnowledgeGateway({
      getJson: vi
        .fn()
        .mockResolvedValue(readResponse(knowledgeSource({ workspace_id: OTHER_WORKSPACE_ID })))
    } as unknown as ApiV2HttpClient)
    await expect(
      crossWorkspaceGateway.getKnowledgeSource({
        signal: new AbortController().signal,
        sourceId: asUiOpaqueId<'knowledge-source'>(SOURCE_ID),
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    const weakEtagGateway = new ApiV2KnowledgeGateway({
      getJson: vi.fn().mockResolvedValue(
        readResponse(knowledgeSource(), {
          ETag: `W/${ENTITY_TAG}`,
          'X-Request-Id': REQUEST_ID
        })
      )
    } as unknown as ApiV2HttpClient)
    await expect(
      weakEtagGateway.getKnowledgeSource({
        signal: new AbortController().signal,
        sourceId: asUiOpaqueId<'knowledge-source'>(SOURCE_ID),
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('preserves an unknown create command for byte-equivalent exact replay', async (): Promise<void> => {
    let attempt = 0
    const postJson = vi.fn((path: string, body: unknown, options: unknown): Promise<unknown> => {
      void path
      void body
      void options
      attempt += 1
      return Promise.resolve(
        attempt === 1
          ? createdResponse(knowledgeSource({ name: 'A response violating the submitted command' }))
          : createdResponse(knowledgeSource())
      )
    })
    const gateway = new ApiV2KnowledgeGateway({ postJson } as unknown as ApiV2HttpClient)
    const command = createCommand()

    await expect(gateway.createManualKnowledgeNote(command)).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      status: 201
    })
    await expect(gateway.createManualKnowledgeNote(command)).resolves.toMatchObject({
      concurrencyToken: ENTITY_TAG,
      source: {
        name: command.name,
        sourceType: 'manual_note',
        workspaceId: command.workspaceId
      }
    })

    expect(postJson).toHaveBeenCalledTimes(2)
    const firstCall = postJson.mock.calls[0]!
    const replayCall = postJson.mock.calls[1]!
    expect(firstCall[0]).toBe(`/workspaces/${WORKSPACE_ID}/knowledge-sources`)
    expect(firstCall[0]).toBe(replayCall[0])
    expect(firstCall[1]).toEqual(replayCall[1])
    expect(firstCall[2]).toEqual(replayCall[2])
    expect(firstCall[2]).toMatchObject({
      idempotencyKey: command.commandId,
      successKind: 'created-resource'
    })
  })

  it('uses the authoritative strong ETag for a complete name-and-visibility update', async (): Promise<void> => {
    const patchJson = vi.fn().mockResolvedValue(
      updatedResponse(
        knowledgeSource({
          name: 'Renamed note',
          revision: 2,
          visibility: {
            ...apiVisibility(),
            session_override_allowed: true
          }
        })
      )
    )
    const gateway = new ApiV2KnowledgeGateway({ patchJson } as unknown as ApiV2HttpClient)
    const concurrencyToken = asUiConcurrencyToken(ENTITY_TAG)
    const visibility = { ...uiVisibility(), sessionOverrideAllowed: true }

    const authority = await gateway.updateKnowledgeSource({
      concurrencyToken,
      patch: { name: 'Renamed note', visibility },
      sourceId: asUiOpaqueId<'knowledge-source'>(SOURCE_ID),
      workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    })

    expect(patchJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/knowledge-sources/${SOURCE_ID}`,
      {
        name: 'Renamed note',
        visibility: {
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
          session_override_allowed: true
        }
      },
      {
        ifMatch: ENTITY_TAG,
        maxRequestBytes: 256 * 1024,
        maxResponseBytes: 1024 * 1024
      }
    )
    expect(authority).toMatchObject({
      concurrencyToken: NEXT_ENTITY_TAG,
      source: {
        name: 'Renamed note',
        revision: 2,
        visibility: { sessionOverrideAllowed: true }
      }
    })
  })
})
