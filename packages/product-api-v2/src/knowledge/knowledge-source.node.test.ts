import { describe, expect, it } from 'vitest'

import { record } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import {
  encodeCreateKnowledgeSourceRequest,
  encodeKnowledgeSourceInput,
  encodeUpdateKnowledgeSourceRequest,
  parseKnowledgeSource,
  parsePublicKnowledgeSourceConfig,
  type CreateKnowledgeSourceRequest,
  type KnowledgeSourceInput,
  type KnowledgeVisibilityPolicy,
  type UpdateKnowledgeSourceRequest
} from './knowledge-source'

/** @brief 测试 Workspace identity / Workspace identity used by tests. */
const WORKSPACE_ID = 'workspace_01K0EXAMPLE0000001'

/** @brief 测试 KnowledgeSource identity / KnowledgeSource identity used by tests. */
const SOURCE_ID = 'knowledge_01K0EXAMPLE00000001'

/**
 * @brief 构造完整合法 Knowledge 可见性策略 / Build a complete valid Knowledge visibility policy.
 * @return canonical v2 KnowledgeVisibilityPolicy / Canonical v2 KnowledgeVisibilityPolicy.
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
 * @brief 构造完整合法 KnowledgeSource JSON / Build a complete valid KnowledgeSource JSON.
 * @param overrides 当前用例覆盖的顶层字段 / Top-level fields overridden by the current case.
 * @return canonical v2 KnowledgeSource 表示 / Canonical v2 KnowledgeSource representation.
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

describe('API v2 KnowledgeSource request codecs', (): void => {
  it('encodes the canonical manual-note example without adding legacy fields', async (): Promise<void> => {
    /** @brief canonical 发布样例 / Canonical published example. */
    const example = (await readCanonicalExample(
      'manual_knowledge_source_request'
    )) as CreateKnowledgeSourceRequest

    expect(encodeCreateKnowledgeSourceRequest(example)).toEqual(example)
    expect(encodeCreateKnowledgeSourceRequest(example)).not.toHaveProperty('config')
  })

  it.each([
    {
      source_type: 'file',
      upload_session_id: 'upload_01K0EXAMPLE0000000001'
    },
    {
      source_type: 'url',
      url: 'http://public.example.test/article'
    },
    {
      clone_url: 'https://git.example.test/team/repo.git',
      connection_id: null,
      exclude_paths: ['vendor/'],
      include_paths: ['docs/'],
      ref: null,
      source_type: 'git_repository'
    },
    {
      resume_id: 'resume_01K0EXAMPLE000000000001',
      source_type: 'resume'
    },
    {
      connection_id: 'connection_01K0EXAMPLE000001',
      remote_id: 'folder/root',
      source_type: 'cloud_drive'
    }
  ] as const)('encodes the closed $source_type input variant', (input): void => {
    expect(encodeKnowledgeSourceInput(input as KnowledgeSourceInput)).toEqual(input)
  })

  it('fails closed on secret-bearing URLs, unknown input fields, and empty updates', (): void => {
    expect(() =>
      encodeKnowledgeSourceInput({
        source_type: 'url',
        url: 'https://user:secret@example.test/private'
      })
    ).toThrow(ApiV2ContractError)

    expect(() =>
      encodeKnowledgeSourceInput({
        content: 'note',
        source_type: 'manual_note',
        token: 'must-not-pass'
      } as KnowledgeSourceInput)
    ).toThrow(/token is not allowed/u)

    expect(() => encodeUpdateKnowledgeSourceRequest({} as UpdateKnowledgeSourceRequest)).toThrow(
      /at least one property/u
    )
  })

  it('preserves update omission instead of materializing undefined fields', (): void => {
    /** @brief 只修改名称的 patch / Name-only patch. */
    const nameOnly = encodeUpdateKnowledgeSourceRequest({ name: 'Renamed note' })
    /** @brief 只修改策略的 patch / Visibility-only patch. */
    const visibilityOnly = encodeUpdateKnowledgeSourceRequest({
      visibility: visibilityPolicy()
    })

    expect(Object.hasOwn(nameOnly, 'visibility')).toBe(false)
    expect(Object.hasOwn(visibilityOnly, 'name')).toBe(false)
  })
})

describe('API v2 KnowledgeSource response decoder', (): void => {
  it('decodes deleting and structured last_problem without collapsing lifecycle state', (): void => {
    /** @brief 删除中的摄取状态 / Deleting ingestion state. */
    const ingestion = {
      chunk_count: 24,
      document_count: 3,
      last_problem: {
        code: 'knowledge.delete_delayed',
        errors: [],
        request_id: 'req_knowledge_problem_1234',
        retryable: true,
        status: 503,
        title: 'Delete delayed',
        type: 'https://api.hmalliances.org/problems/knowledge-delete-delayed'
      },
      last_success_at: '2026-07-22T12:05:00Z',
      status: 'deleting'
    }

    expect(parseKnowledgeSource(knowledgeSource({ ingestion }))).toMatchObject({
      current_version_id: null,
      ingestion: {
        last_problem: { code: 'knowledge.delete_delayed', status: 503 },
        status: 'deleting'
      }
    })
  })

  it('preserves public_config.ref absent, explicit null, and value as three states', (): void => {
    /** @brief 省略 ref 的配置 / Configuration omitting ref. */
    const absent = parsePublicKnowledgeSourceConfig({ clone_url: 'https://git.example.test/repo' })
    /** @brief 显式 null ref 的配置 / Configuration with an explicit null ref. */
    const explicitNull = parsePublicKnowledgeSourceConfig({
      clone_url: 'https://git.example.test/repo',
      ref: null
    })
    /** @brief 含 ref 值的配置 / Configuration carrying a ref value. */
    const value = parsePublicKnowledgeSourceConfig({
      clone_url: 'https://git.example.test/repo',
      ref: 'main'
    })

    expect(Object.hasOwn(absent, 'ref')).toBe(false)
    expect(Object.hasOwn(explicitNull, 'ref')).toBe(true)
    expect(explicitNull.ref).toBeNull()
    expect(value.ref).toBe('main')
  })

  it('rejects the legacy config/sync_schedule shape and missing v2 authority fields', (): void => {
    /** @brief 带 legacy config 的来源 / Source carrying legacy config. */
    const legacy = knowledgeSource()
    delete legacy.public_config
    legacy.config = { source_type: 'manual_note' }
    legacy.sync_schedule = null
    expect(() => parseKnowledgeSource(legacy)).toThrow(/config is not allowed/u)

    /** @brief 缺失 current_version_id 的来源 / Source missing current_version_id. */
    const missingVersionAuthority = knowledgeSource()
    delete missingVersionAuthority.current_version_id
    expect(() => parseKnowledgeSource(missingVersionAuthority)).toThrow(ApiV2ContractError)

    /** @brief 缺失 last_problem 的摄取状态 / Ingestion state missing last_problem. */
    const missingProblem = knowledgeSource()
    delete record(missingProblem.ingestion, 'fixture.ingestion').last_problem
    expect(() => parseKnowledgeSource(missingProblem)).toThrow(ApiV2ContractError)
  })

  it('rejects unknown lifecycle values and duplicate policy set members', (): void => {
    /** @brief 含未知状态的来源 / Source carrying an unknown status. */
    const unknownStatus = knowledgeSource()
    record(unknownStatus.ingestion, 'fixture.ingestion').status = 'processing'
    expect(() => parseKnowledgeSource(unknownStatus)).toThrow(/not a supported value/u)

    /** @brief 含重复区域的来源 / Source carrying duplicate regions. */
    const duplicateRegion = knowledgeSource()
    record(duplicateRegion.visibility, 'fixture.visibility').allowed_model_regions = ['cn', 'cn']
    expect(() => parseKnowledgeSource(duplicateRegion)).toThrow(/unique items/u)
  })
})
