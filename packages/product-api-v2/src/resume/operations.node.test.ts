import { describe, expect, it, vi } from 'vitest'

import type { ApiV2AuthenticationPort } from '../http/authentication'
import { createApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import {
  applyResumeOperations,
  encodeResumeOperationBatch,
  parseResumeOperation,
  parseResumeOperationResult,
  type ResumeOperationBatch,
  type ResumeOperationsHttpClient
} from './operations'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'workspace_01K0OPERATIONS00000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0OPERATIONS0000000001'

/** @brief 测试 section identity / Test section identity. */
const SECTION_ID = 'section_01K0OPERATIONS000000001'

/** @brief 测试 item identity / Test item identity. */
const ITEM_ID = 'item_01K0OPERATIONS000000000001'

/** @brief 测试 Template identity / Test Template identity. */
const TEMPLATE_ID = 'template_01K0OPERATIONS00000001'

/** @brief 测试强 ETag / Test strong ETag. */
const ENTITY_TAG = '"resume-operation-result-b"'

/** @brief 测试 request ID / Test request ID. */
const REQUEST_ID = 'request_resume_operations_0001'

/** @brief 测试 Idempotency-Key / Test Idempotency-Key. */
const IDEMPOTENCY_KEY = 'resume_batch_intent_01K0OPERATIONS'

/** @brief 测试 Access Token / Test access token. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/** @brief 六项测试 operation IDs / Six test operation identities. */
const OPERATION_IDS = Object.freeze([
  'operation_set_field_00000001',
  'operation_upsert_section_001',
  'operation_upsert_item_0000001',
  'operation_remove_entity_00001',
  'operation_move_entity_0000001',
  'operation_set_template_000001'
])

/**
 * @brief 构造固定 token 认证端口 / Build an authentication port with a fixed token.
 * @return 不执行刷新副作用的认证端口 / Authentication port without refresh side effects.
 */
function fixedAuthentication(): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string => ACCESS_TOKEN,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/**
 * @brief 构造完整 Resume item JSON / Build a complete Resume item JSON.
 * @return 无损 operation payload item / Lossless operation-payload item.
 */
function resumeItem(): Readonly<Record<string, unknown>> {
  return {
    date_range: { end: 'present', start: '2024-02' },
    highlights: [{ marks: [{ end: 3, kind: 'strong', start: 0 }], text: 'SLO ownership' }],
    id: ITEM_ID,
    kind: 'experience',
    location: 'Singapore',
    organization: 'HM Alliances',
    skills: ['TypeScript', 'Distributed Systems'],
    subtitle: 'Platform',
    summary: { marks: [], text: 'Built resilient systems.' },
    tags: ['reliability'],
    title: 'Senior Engineer',
    url: 'https://example.com/role',
    visible: true
  }
}

/**
 * @brief 构造完整 Resume section JSON / Build a complete Resume section JSON.
 * @return 无损 operation payload section / Lossless operation-payload section.
 */
function resumeSection(): Readonly<Record<string, unknown>> {
  return {
    content: { marks: [{ end: 4, kind: 'emphasis', start: 0 }], text: 'Core systems' },
    id: SECTION_ID,
    items: [resumeItem()],
    kind: 'experience',
    title: 'Experience',
    visible: true
  }
}

/**
 * @brief 构造合法 Resume operation batch / Build a valid Resume operation batch.
 * @param overrides 当前测试覆盖字段 / Fields overridden by the current test.
 * @return 包含六类 operation 的 batch / Batch containing all six operation kinds.
 */
function operationBatch(overrides: Readonly<Record<string, unknown>> = {}): ResumeOperationBatch {
  return {
    base_revision: 17,
    client_batch_id: 'batch_01K0OPERATIONS0000000001',
    conflict_strategy: 'rebase_if_safe',
    operations: [
      {
        entity_id: ITEM_ID,
        field_path: ['title'],
        op: 'set_field',
        operation_id: OPERATION_IDS[0] ?? '',
        value: 'Staff Platform Engineer'
      },
      {
        after_section_id: null,
        op: 'upsert_section',
        operation_id: OPERATION_IDS[1] ?? '',
        section: resumeSection()
      },
      {
        after_item_id: null,
        item: resumeItem(),
        op: 'upsert_item',
        operation_id: OPERATION_IDS[2] ?? '',
        section_id: SECTION_ID
      },
      {
        entity_id: ITEM_ID,
        entity_kind: 'item',
        op: 'remove_entity',
        operation_id: OPERATION_IDS[3] ?? ''
      },
      {
        after_id: null,
        entity_id: ITEM_ID,
        entity_kind: 'item',
        op: 'move_entity',
        operation_id: OPERATION_IDS[4] ?? '',
        parent_id: SECTION_ID
      },
      {
        op: 'set_template',
        operation_id: OPERATION_IDS[5] ?? '',
        settings: { accent: '#112233', show_icons: true },
        template: { template_id: TEMPLATE_ID, version: '2.0.0' }
      }
    ],
    render_hint: 'preview',
    ...overrides
  } as ResumeOperationBatch
}

/**
 * @brief 构造权威 ResumeDocument JSON / Build authoritative ResumeDocument JSON.
 * @param overrides 顶层覆盖字段 / Top-level overrides.
 * @return 满足完整 SIR 的 Resume document / Resume document satisfying the complete SIR.
 */
function resumeDocument(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  /** @brief 测试 style color / Test style color. */
  const color = { space: 'srgb_hex', value: '#112233' }
  /** @brief 测试 style measurement / Test style measurement. */
  const measurement = { unit: 'mm', value: 16 }
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: RESUME_ID,
    knowledge_source_id: null,
    locale: 'en-US',
    profile: {
      contacts: [
        {
          id: 'contact_01K0OPERATIONS00000001',
          kind: 'email',
          label: 'Email',
          url: 'mailto:klee@example.com',
          value: 'klee@example.com'
        }
      ],
      full_name: 'Klee',
      headline: 'Platform Engineer',
      summary: { marks: [], text: 'Reliable systems.' }
    },
    revision: 18,
    sections: [resumeSection()],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'org.hmalliances.resume': { widows: 2 } },
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement,
          left: measurement,
          right: measurement,
          top: measurement
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
          compactness: 0.5,
          heading_style_token: 'section.primary',
          keep_together: false,
          page_break_before: false,
          section_id: SECTION_ID,
          zone: 'main'
        }
      ],
      style_contract_version: '1.0',
      template_settings: { accent: '#112233' },
      typography: {
        base_size_pt: 10,
        font_family_token: 'inter',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.4
      }
    },
    template: { template_id: TEMPLATE_ID, version: '2.0.0' },
    title: 'Klee Resume',
    updated_at: '2026-07-22T12:01:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造 ResumeOperationResult JSON / Build ResumeOperationResult JSON.
 * @param overrides 结果覆盖字段 / Result fields to override.
 * @return 默认完整成功结果 / Complete successful result by default.
 */
function operationResult(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    applied_operation_ids: OPERATION_IDS,
    conflicts: [],
    render_job_ref: {
      id: 'job_01K0OPERATIONS000000000001',
      resource_type: 'job',
      revision: 1
    },
    resume: resumeDocument(),
    ...overrides
  }
}

/**
 * @brief 构造固定成功的 operations HTTP port / Build an operations HTTP port with a fixed success.
 * @param data 返回 body / Response body.
 * @param entityTag 返回 ETag / Response ETag.
 * @param requestId 返回 request ID / Response request ID.
 * @return 可观察的固定 200 port / Observable fixed-200 port.
 */
function operationsClient(
  data: unknown = operationResult(),
  entityTag = ENTITY_TAG,
  requestId = REQUEST_ID
): ResumeOperationsHttpClient {
  return {
    postJson: vi.fn<ResumeOperationsHttpClient['postJson']>(() =>
      Promise.resolve({
        data,
        metadata: { entityTag, location: null, requestId },
        status: 200
      })
    )
  }
}

describe('API v2 Resume semantic operation batches', (): void => {
  it('encodes all six operation kinds without lossy field projection', (): void => {
    /** @brief 原 batch / Original batch. */
    const source = operationBatch()
    /** @brief 严格编码 batch / Strictly encoded batch. */
    const encoded = encodeResumeOperationBatch(source)
    expect(encoded).toEqual(source)
    expect(encoded.operations.map((operation) => operation.op)).toEqual([
      'set_field',
      'upsert_section',
      'upsert_item',
      'remove_entity',
      'move_entity',
      'set_template'
    ])
    expect(encoded.operations[1]).toMatchObject({
      section: {
        content: { marks: [{ end: 4, kind: 'emphasis', start: 0 }], text: 'Core systems' }
      }
    })
    expect(encoded.operations[2]).toMatchObject({
      item: {
        date_range: { end: 'present', start: '2024-02' },
        organization: 'HM Alliances',
        skills: ['TypeScript', 'Distributed Systems']
      }
    })
  })

  it('shares the exact single-operation decoder with proposal consumers', (): void => {
    /** @brief 六种 operation 的原始 wire 值 / Raw wire values for all six operation kinds. */
    const operations = operationBatch().operations

    expect(
      operations.map((operation, index) =>
        parseResumeOperation(operation, `proposal.operations[${index}]`)
      )
    ).toEqual(operations)
  })

  it('submits the exact path, stable command keys, strong validator, and fixed transport policy', async (): Promise<void> => {
    /** @brief 调用方取消控制器 / Caller abort controller. */
    const controller = new AbortController()
    /** @brief 可观察 operations client / Observable operations client. */
    const client = operationsClient()
    /** @brief 完整 batch / Complete batch. */
    const batch = operationBatch()

    await expect(
      applyResumeOperations(client, {
        batch,
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        signal: controller.signal,
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toEqual({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: operationResult()
    })

    expect(client.postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/operations`,
      batch,
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        maxRequestBytes: 16 * 1024 * 1024,
        maxResponseBytes: 16 * 1024 * 1024,
        signal: controller.signal,
        successKind: 'updated-result'
      }
    )
  })

  it('uses the real Bearer transport without cookies and emits command headers verbatim', async (): Promise<void> => {
    /** @brief transport 观察到的请求 / Request observed by the transport. */
    let observed: Request | null = null
    /** @brief 返回 operation result 的 fetch / Fetch returning an operation result. */
    const fetchImpl = vi.fn<typeof fetch>((input, init): Promise<Response> => {
      observed = new Request(input, init)
      return Promise.resolve(
        new Response(JSON.stringify(operationResult()), {
          headers: {
            'Content-Type': 'application/json',
            ETag: ENTITY_TAG,
            'X-Request-Id': REQUEST_ID
          },
          status: 200
        })
      )
    })
    /** @brief 真实严格 API v2 client / Real strict API v2 client. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'request_resume_operations_out_1',
      fetchImpl
    })

    await applyResumeOperations(client, {
      batch: operationBatch(),
      idempotencyKey: IDEMPOTENCY_KEY,
      ifMatch: '"resume-17"',
      resumeId: RESUME_ID,
      workspaceId: WORKSPACE_ID
    })

    expect(observed).not.toBeNull()
    /** @brief 已确认的请求 / Confirmed request. */
    const request = observed as unknown as Request
    expect(request.method).toBe('POST')
    expect(request.credentials).toBe('omit')
    expect(request.headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(request.headers.get('Idempotency-Key')).toBe(IDEMPOTENCY_KEY)
    expect(request.headers.get('If-Match')).toBe('"resume-17"')
  })

  it('rejects duplicate operation identities before dispatch', async (): Promise<void> => {
    /** @brief 重复首项 identity 的 operations / Operations duplicating the first identity. */
    const operations = [...operationBatch().operations]
    /** @brief 用作重复 identity 来源的首项 / First operation used as the duplicate-identity source. */
    const firstOperation = operations[0]
    /** @brief 将被赋予重复 identity 的次项 / Second operation that will receive the duplicate identity. */
    const secondOperation = operations[1]
    if (firstOperation === undefined || secondOperation === undefined) {
      throw new Error('The operation fixture must contain at least two operations.')
    }
    operations[1] = { ...secondOperation, operation_id: firstOperation.operation_id }
    /** @brief 不应被调用的 HTTP port / HTTP port that must not be called. */
    const client = operationsClient()

    await expect(
      applyResumeOperations(client, {
        batch: operationBatch({ operations }),
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(client.postJson).not.toHaveBeenCalled()
  })

  it('rejects invalid command headers before a structural transport can dispatch', async (): Promise<void> => {
    /** @brief 不应收到无效 command 的结构化 HTTP port / Structural HTTP port that must not receive an invalid command. */
    const client = operationsClient()

    await expect(
      applyResumeOperations(client, {
        batch: operationBatch(),
        idempotencyKey: 'too-short',
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      applyResumeOperations(client, {
        batch: operationBatch(),
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: 'W/"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(client.postJson).not.toHaveBeenCalled()
  })

  it.each([
    ['an array index field path', { ...operationBatch().operations[0], field_path: ['0'] }],
    ['an unknown operation kind', { ...operationBatch().operations[0], op: 'legacy_patch' }],
    ['a non-JSON field value', { ...operationBatch().operations[0], value: undefined }],
    [
      'an invalid upsert item date',
      {
        ...operationBatch().operations[2],
        item: { ...resumeItem(), date_range: { end: '2024-01', start: '2024-13' } }
      }
    ],
    ['an undeclared operation property', { ...operationBatch().operations[3], legacy_index: 0 }]
  ])('rejects %s', (_label, invalidOperation): void => {
    expect(() =>
      encodeResumeOperationBatch(operationBatch({ operations: [invalidOperation] }))
    ).toThrow(ApiV2ContractError)
  })

  it('allows an atomically rejected conflict-only result without pretending it was applied', async (): Promise<void> => {
    /** @brief 首项操作对应的 conflict / Conflict for the first operation. */
    const conflict = {
      code: 'resume.field_conflict',
      entity_id: ITEM_ID,
      field_path: ['title'],
      operation_id: OPERATION_IDS[0]
    }
    /** @brief 仅含首项的 batch / Batch containing only the first operation. */
    const batch = operationBatch({ operations: [operationBatch().operations[0]] })
    /** @brief 原子拒绝结果 / Atomically rejected result. */
    const result = operationResult({
      applied_operation_ids: [],
      conflicts: [conflict],
      render_job_ref: null,
      resume: resumeDocument({ revision: 17 })
    })

    await expect(
      applyResumeOperations(operationsClient(result), {
        batch,
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toMatchObject({ value: result })
  })

  it('does not invent schema ceilings for conflict count or conflict-code length', (): void => {
    /** @brief 发布 Schema 允许的长稳定 code / Long stable code permitted by the published schema. */
    const code = `resume.${'field_conflict.'.repeat(40)}terminal`
    /** @brief 同一 operation 可报告的多项字段冲突 / Multiple field conflicts that one operation may report. */
    const conflicts = Array.from({ length: 201 }, (_value, index) => ({
      code,
      entity_id: ITEM_ID,
      field_path: [`field_${index}`],
      operation_id: OPERATION_IDS[0]
    }))

    expect(
      parseResumeOperationResult(
        operationResult({ applied_operation_ids: [], conflicts, render_job_ref: null })
      ).conflicts
    ).toHaveLength(201)
  })

  it.each([
    [
      'cross-resource identity',
      operationResult({ resume: resumeDocument({ id: 'resume_01K0OTHER00000000000001' }) })
    ],
    [
      'an unknown applied operation',
      operationResult({ applied_operation_ids: ['operation_unknown_000000001'] })
    ],
    [
      'a partial success',
      operationResult({
        applied_operation_ids: [OPERATION_IDS[0]],
        conflicts: [
          {
            code: 'resume.field_conflict',
            entity_id: ITEM_ID,
            field_path: ['title'],
            operation_id: OPERATION_IDS[1]
          }
        ]
      })
    ],
    [
      'a success that omits submitted operations',
      operationResult({ applied_operation_ids: [OPERATION_IDS[0]] })
    ],
    [
      'a successful batch without a revision advance',
      operationResult({ resume: resumeDocument({ revision: 17 }) })
    ],
    [
      'an outcome with neither applied operations nor conflicts',
      operationResult({ applied_operation_ids: [], conflicts: [] })
    ]
  ])('marks %s as an unknown 200 write outcome', async (_label, result): Promise<void> => {
    await expect(
      applyResumeOperations(operationsClient(result), {
        batch: operationBatch(),
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: REQUEST_ID,
      status: 200
    })
  })

  it('keeps the pure result decoder definitive before dispatch', (): void => {
    expect(() =>
      parseResumeOperationResult({ ...operationResult(), legacy_html: '<main />' })
    ).toThrow(ApiV2ContractError)
  })

  it.each([
    ['result schema drift', { ...operationResult(), legacy_html: '<main />' }, ENTITY_TAG],
    [
      'nested decoder failure',
      operationResult({ resume: resumeDocument({ title: null }) }),
      ENTITY_TAG
    ],
    ['a weak next validator', operationResult(), 'W/"resume-18"']
  ])(
    'marks %s after the 200 boundary as unknown while retaining the trusted request ID',
    async (_label, result, entityTag): Promise<void> => {
      await expect(
        applyResumeOperations(operationsClient(result, entityTag), {
          batch: operationBatch(),
          idempotencyKey: IDEMPOTENCY_KEY,
          ifMatch: '"resume-17"',
          resumeId: RESUME_ID,
          workspaceId: WORKSPACE_ID
        })
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        problemCode: null,
        requestId: REQUEST_ID,
        status: 200
      })
    }
  )

  it('does not retain an invalid response request ID in the unknown outcome', async (): Promise<void> => {
    await expect(
      applyResumeOperations(operationsClient(operationResult(), ENTITY_TAG, 'invalid'), {
        batch: operationBatch(),
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-17"',
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: null,
      status: 200
    })
  })
})
