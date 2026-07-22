import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client, ApiV2JsonResponse, ApiV2UpdatedWriteJsonResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import {
  decideResumeProposal,
  encodeProposalDecisionRequest,
  getWorkspaceResumeProposal,
  listWorkspaceResumeProposalPage,
  parseResumeProposal,
  parseResumeProposalList,
  type PendingResumeProposal,
  type ProposalDecisionRequest,
  type ResumeProposal,
  type ResumeProposalDecisionHttpClient
} from './proposals'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'workspace_01K0PROPOSAL00000001'

/** @brief 另一个 Workspace identity / Another Workspace identity. */
const OTHER_WORKSPACE_ID = 'workspace_01K0OTHER0000000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0PROPOSAL00000000001'

/** @brief 另一个 Resume identity / Another Resume identity. */
const OTHER_RESUME_ID = 'resume_01K0OTHER0000000000001'

/** @brief 测试 Proposal identity / Test Proposal identity. */
const PROPOSAL_ID = 'proposal_01K0PROPOSAL000000001'

/** @brief 另一个 Proposal identity / Another Proposal identity. */
const OTHER_PROPOSAL_ID = 'proposal_01K0OTHER00000000001'

/** @brief 测试 Template identity / Test Template identity. */
const TEMPLATE_ID = 'template_01K0PROPOSAL00000001'

/** @brief Proposal 基础 Resume revision / Proposal base Resume revision. */
const BASE_REVISION = 7

/** @brief Proposal 资源自身 revision / Proposal resource's own revision. */
const PROPOSAL_REVISION = 3

/** @brief Proposal 强 ETag / Strong Proposal ETag. */
const PROPOSAL_ETAG = '"proposal-validator-3"'

/** @brief Decision 结果强 ETag / Strong decision-result ETag. */
const RESULT_ETAG = '"resume-validator-8"'

/** @brief 服务端 request ID / Server request ID. */
const REQUEST_ID = 'req_proposal_12345678'

/** @brief 稳定幂等键 / Stable idempotency key. */
const IDEMPOTENCY_KEY = 'proposal-decision-intent-0001'

/** @brief 六类 operation IDs / IDs for the six operation kinds. */
const OPERATION_IDS = [
  'operation_01K0PROPOSAL00000001',
  'operation_01K0PROPOSAL00000002',
  'operation_01K0PROPOSAL00000003',
  'operation_01K0PROPOSAL00000004',
  'operation_01K0PROPOSAL00000005',
  'operation_01K0PROPOSAL00000006'
] as const

/**
 * @brief 构造合法 Resume item / Build a valid Resume item.
 * @return 含完整必需字段的 item JSON / Item JSON carrying every required field.
 */
function resumeItem(): Readonly<Record<string, unknown>> {
  return {
    date_range: { end: 'present', start: '2025-02' },
    highlights: [{ marks: [], text: 'Reduced tail latency.' }],
    id: 'item_01K0PROPOSAL00000000001',
    kind: 'experience',
    location: 'Shanghai',
    organization: 'HM Alliances',
    skills: ['TypeScript'],
    subtitle: 'Platform',
    summary: { marks: [], text: 'Production systems.' },
    tags: ['reliability'],
    title: 'Engineer',
    url: 'https://example.cn/role',
    visible: true
  }
}

/**
 * @brief 构造合法 Resume section / Build a valid Resume section.
 * @return 含无损 item 的 section JSON / Section JSON carrying a lossless item.
 */
function resumeSection(): Readonly<Record<string, unknown>> {
  return {
    content: { marks: [], text: 'Selected work' },
    id: 'section_01K0PROPOSAL000000001',
    items: [resumeItem()],
    kind: 'experience',
    title: 'Experience',
    visible: true
  }
}

/**
 * @brief 构造六类合法 Resume operations / Build all six valid Resume operation kinds.
 * @return 按固定顺序排列的六类 operation JSON / Six operation JSON values in a fixed order.
 */
function resumeOperations(): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      entity_id: RESUME_ID,
      field_path: ['profile', 'headline'],
      op: 'set_field',
      operation_id: OPERATION_IDS[0],
      value: 'Staff Engineer'
    },
    {
      after_section_id: null,
      op: 'upsert_section',
      operation_id: OPERATION_IDS[1],
      section: resumeSection()
    },
    {
      after_item_id: null,
      item: resumeItem(),
      op: 'upsert_item',
      operation_id: OPERATION_IDS[2],
      section_id: 'section_01K0PROPOSAL000000001'
    },
    {
      entity_id: 'item_01K0PROPOSAL00000000002',
      entity_kind: 'item',
      op: 'remove_entity',
      operation_id: OPERATION_IDS[3]
    },
    {
      after_id: null,
      entity_id: 'section_01K0PROPOSAL000000002',
      entity_kind: 'section',
      op: 'move_entity',
      operation_id: OPERATION_IDS[4],
      parent_id: null
    },
    {
      op: 'set_template',
      operation_id: OPERATION_IDS[5],
      settings: { accent: '#112233', show_icons: true },
      template: { template_id: TEMPLATE_ID, version: '2.4.0' }
    }
  ]
}

/**
 * @brief 构造合法 ResumeProposal JSON / Build valid ResumeProposal JSON.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 完整 Proposal JSON / Complete Proposal JSON.
 */
function proposalResource(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    base_revision: BASE_REVISION,
    created_at: '2026-07-22T10:00:00Z',
    evidence_refs: [
      {
        id: 'message_01K0PROPOSAL000000001',
        resource_type: 'message',
        revision: 2
      }
    ],
    id: PROPOSAL_ID,
    operations: resumeOperations(),
    resume_id: RESUME_ID,
    revision: PROPOSAL_REVISION,
    status: 'pending',
    title: 'Strengthen the platform experience',
    updated_at: '2026-07-22T10:01:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造合法权威 ResumeDocument / Build a valid authoritative ResumeDocument.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 完整 SIR JSON / Complete SIR JSON.
 */
function resumeDocument(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  /** @brief 测试 measurement / Test measurement. */
  const measurement = { unit: 'mm', value: 12 }
  /** @brief 测试 color / Test color. */
  const color = { space: 'srgb_hex', value: '#112233' }
  return {
    created_at: '2026-07-20T10:00:00Z',
    id: RESUME_ID,
    knowledge_source_id: null,
    locale: 'zh-CN',
    profile: {
      contacts: [],
      full_name: 'Klee',
      headline: 'Staff Engineer',
      summary: { marks: [], text: 'Authoritative SIR' }
    },
    revision: BASE_REVISION + 1,
    sections: [resumeSection()],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'org.hmalliances.proposal': { accepted: true } },
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement,
          left: measurement,
          right: measurement,
          top: measurement
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
      section_layout: [
        {
          compactness: 0.5,
          heading_style_token: 'section.primary',
          keep_together: true,
          page_break_before: false,
          section_id: 'section_01K0PROPOSAL000000001',
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
    template: { template_id: TEMPLATE_ID, version: '2.4.0' },
    title: 'Klee Resume',
    updated_at: '2026-07-22T10:02:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造 ResumeOperationResult JSON / Build ResumeOperationResult JSON.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 完整 operation result JSON / Complete operation-result JSON.
 */
function operationResult(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    applied_operation_ids: [...OPERATION_IDS],
    conflicts: [],
    render_job_ref: {
      id: 'job_01K0PROPOSAL000000000001',
      resource_type: 'job',
      revision: 1
    },
    resume: resumeDocument(),
    ...overrides
  }
}

/**
 * @brief 构造结构型 GET response / Build a structural GET response.
 * @param data 待领域解码的数据 / Data awaiting domain decoding.
 * @param headers 当前用例响应头 / Response headers for the current case.
 * @return 固定 200 JSON response / Fixed 200 JSON response.
 */
function getResponse(
  data: unknown,
  headers: HeadersInit = { ETag: PROPOSAL_ETAG, 'X-Request-Id': REQUEST_ID }
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status: 200 }
}

/**
 * @brief 构造结构型 updated-result response / Build a structural updated-result response.
 * @param data 待领域解码的数据 / Data awaiting domain decoding.
 * @return 带强 ETag 的固定 200 response / Fixed 200 response carrying a strong ETag.
 */
function decisionResponse(data: unknown): ApiV2UpdatedWriteJsonResponse {
  return {
    data,
    metadata: { entityTag: RESULT_ETAG, location: null, requestId: REQUEST_ID },
    status: 200
  }
}

/**
 * @brief 将合法 wire Proposal 解码为 command 快照 / Decode a valid wire Proposal into a command snapshot.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 已严格解码的 Proposal / Strictly decoded Proposal.
 */
function proposalSnapshot(overrides: Readonly<Record<string, unknown>> = {}): ResumeProposal {
  return parseResumeProposal(proposalResource(overrides))
}

/**
 * @brief 构造并通过显式状态 guard 收窄 pending Proposal / Build and narrow a pending Proposal through an explicit state guard.
 * @return 编译期与运行时均为 pending 的 Proposal / Proposal that is pending at compile time and runtime.
 */
function pendingProposalSnapshot(): PendingResumeProposal {
  /** @brief 尚未按状态收窄的 Proposal / Proposal not yet narrowed by state. */
  const proposal = proposalSnapshot()
  if (proposal.status !== 'pending') {
    throw new Error('The pending Proposal test fixture entered a terminal state.')
  }
  return proposal
}

/**
 * @brief 以固定结构 client 执行一个 decision / Execute one decision through a fixed structural client.
 * @param result 服务端返回的 operation result / Operation result returned by the service.
 * @param decision 要提交的 decision / Decision to submit.
 * @param proposal decision 所依据的 Proposal / Proposal on which the decision is based.
 * @return decision Promise 与可观测 POST mock / Decision promise and observable POST mock.
 */
function executeDecision(
  result: unknown,
  decision: ProposalDecisionRequest,
  proposal: PendingResumeProposal = pendingProposalSnapshot()
): {
  readonly promise: ReturnType<typeof decideResumeProposal>
  readonly postJson: ReturnType<typeof vi.fn<ResumeProposalDecisionHttpClient['postJson']>>
} {
  /** @brief 返回固定结果的 POST mock / POST mock returning the fixed result. */
  const postJson = vi
    .fn<ResumeProposalDecisionHttpClient['postJson']>()
    .mockResolvedValue(decisionResponse(result))
  return {
    postJson,
    promise: decideResumeProposal(
      { postJson },
      {
        decision,
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: PROPOSAL_ETAG,
        proposal,
        proposalId: PROPOSAL_ID,
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      }
    )
  }
}

describe('API v2 Resume Proposals', (): void => {
  it('strictly decodes all six lossless ResumeOperation kinds and evidence refs', (): void => {
    /** @brief 已解码 Proposal / Decoded Proposal. */
    const decoded = parseResumeProposal(proposalResource())

    expect(decoded.operations.map((operation) => operation.op)).toEqual([
      'set_field',
      'upsert_section',
      'upsert_item',
      'remove_entity',
      'move_entity',
      'set_template'
    ])
    expect(decoded.operations[1]).toMatchObject({ section: resumeSection() })
    expect(decoded.operations[2]).toMatchObject({ item: resumeItem() })
    expect(decoded.operations[5]).toMatchObject({
      settings: { accent: '#112233', show_icons: true },
      template: { template_id: TEMPLATE_ID, version: '2.4.0' }
    })
    expect(decoded.evidence_refs).toEqual([
      {
        id: 'message_01K0PROPOSAL000000001',
        resource_type: 'message',
        revision: 2
      }
    ])
  })

  it('does not invent Proposal-level operation-ID uniqueness absent from the schema', (): void => {
    /** @brief 两个 Schema 合法但 ID 相同的 operations / Two schema-valid operations sharing an ID. */
    const duplicateOperations = [resumeOperations()[0], resumeOperations()[0]]

    expect(
      parseResumeProposal(proposalResource({ operations: duplicateOperations })).operations
    ).toHaveLength(2)
  })

  it('rejects unknown stable fields, lifecycle states, and operation variants', (): void => {
    expect(() => parseResumeProposal({ ...proposalResource(), legacy_patch: [] })).toThrow(
      ApiV2ContractError
    )
    expect(() => parseResumeProposal(proposalResource({ status: 'approved' }))).toThrow(
      ApiV2ContractError
    )
    expect(() =>
      parseResumeProposal(
        proposalResource({
          operations: [
            {
              operation_id: OPERATION_IDS[0],
              op: 'json_patch',
              patch: []
            }
          ]
        })
      )
    ).toThrow(ApiV2ContractError)
  })

  it('reads the exact explicit-Workspace Resume collection with opaque pagination', async (): Promise<void> => {
    /** @brief 返回下一页的结构型 client / Structural client returning a next page. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse({
        items: [proposalResource()],
        page: { has_more: true, next_cursor: 'cursor_proposal_next' }
      })
    )
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const controller = new AbortController()

    await expect(
      listWorkspaceResumeProposalPage(
        { getJson },
        {
          cursor: 'cursor_proposal_current',
          limit: 25,
          resumeId: RESUME_ID,
          signal: controller.signal,
          workspaceId: WORKSPACE_ID
        }
      )
    ).resolves.toMatchObject({
      items: [{ id: PROPOSAL_ID, resume_id: RESUME_ID, workspace_id: WORKSPACE_ID }],
      page: { has_more: true, next_cursor: 'cursor_proposal_next' }
    })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/proposals`,
      {
        expectedStatus: 200,
        maxResponseBytes: 16 * 1024 * 1024,
        query: { cursor: 'cursor_proposal_current', limit: 25 },
        signal: controller.signal
      }
    )
  })

  it('uses frozen pagination defaults and fails closed for cross-path list identities', async (): Promise<void> => {
    /** @brief 依次返回空页与跨 Workspace Proposal 的 client / Client returning an empty page then a cross-Workspace Proposal. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(
        getResponse({ items: [], page: { has_more: false, next_cursor: null } })
      )
      .mockResolvedValueOnce(
        getResponse({
          items: [proposalResource({ workspace_id: OTHER_WORKSPACE_ID })],
          page: { has_more: false, next_cursor: null }
        })
      )

    await listWorkspaceResumeProposalPage(
      { getJson },
      { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID }
    )
    expect(getJson).toHaveBeenNthCalledWith(
      1,
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/proposals`,
      {
        expectedStatus: 200,
        maxResponseBytes: 16 * 1024 * 1024,
        query: { cursor: null, limit: 50 }
      }
    )
    await expect(
      listWorkspaceResumeProposalPage(
        { getJson },
        { resumeId: RESUME_ID, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toThrow(/outside the requested Workspace or Resume/u)
  })

  it('reads one Proposal with its strong ETag and validates all three identities', async (): Promise<void> => {
    /** @brief 返回单个 Proposal 的 client / Client returning one Proposal. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(proposalResource()))

    await expect(
      getWorkspaceResumeProposal(
        { getJson },
        { proposalId: PROPOSAL_ID, resumeId: RESUME_ID, workspaceId: WORKSPACE_ID }
      )
    ).resolves.toMatchObject({
      entityTag: PROPOSAL_ETAG,
      requestId: REQUEST_ID,
      value: { id: PROPOSAL_ID, resume_id: RESUME_ID, workspace_id: WORKSPACE_ID }
    })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resume-proposals/${PROPOSAL_ID}`,
      { expectedStatus: 200, maxResponseBytes: 16 * 1024 * 1024 }
    )
  })

  it.each([
    ['Workspace', proposalResource({ workspace_id: OTHER_WORKSPACE_ID })],
    ['Resume', proposalResource({ resume_id: OTHER_RESUME_ID })],
    ['Proposal', proposalResource({ id: OTHER_PROPOSAL_ID })]
  ])('rejects a single Proposal with a mismatched %s identity', async (_label, payload) => {
    /** @brief 返回身份错配 Proposal 的 client / Client returning an identity-mismatched Proposal. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(getResponse(payload))

    await expect(
      getWorkspaceResumeProposal(
        { getJson },
        { proposalId: PROPOSAL_ID, resumeId: RESUME_ID, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toThrow(/identities differ/u)
  })

  it('encodes the three closed decision variants and rejects malformed selections', (): void => {
    expect(
      encodeProposalDecisionRequest({ decision: 'accept', accepted_operation_ids: [] })
    ).toEqual({ decision: 'accept', accepted_operation_ids: [] })
    expect(
      encodeProposalDecisionRequest({
        accepted_operation_ids: [OPERATION_IDS[0], OPERATION_IDS[1]],
        decision: 'accept_selected'
      })
    ).toEqual({
      accepted_operation_ids: [OPERATION_IDS[0], OPERATION_IDS[1]],
      decision: 'accept_selected'
    })
    expect(
      encodeProposalDecisionRequest({ decision: 'reject', accepted_operation_ids: [] })
    ).toEqual({ decision: 'reject', accepted_operation_ids: [] })
    expect(() =>
      encodeProposalDecisionRequest({
        accepted_operation_ids: [OPERATION_IDS[0], OPERATION_IDS[0]],
        decision: 'accept_selected'
      })
    ).toThrow(/unique/u)
    expect(() =>
      encodeProposalDecisionRequest({
        accepted_operation_ids: [OPERATION_IDS[0]]
      } as unknown as ProposalDecisionRequest)
    ).toThrow(ApiV2ContractError)
  })

  it('atomically accepts every Proposal operation with idempotency and strong If-Match', async (): Promise<void> => {
    /** @brief accept decision 的执行结果 / Execution result for the accept decision. */
    const execution = executeDecision(operationResult(), {
      accepted_operation_ids: [],
      decision: 'accept'
    })

    await expect(execution.promise).resolves.toMatchObject({
      entityTag: RESULT_ETAG,
      requestId: REQUEST_ID,
      value: {
        applied_operation_ids: [...OPERATION_IDS],
        resume: { id: RESUME_ID, revision: BASE_REVISION + 1, workspace_id: WORKSPACE_ID }
      }
    })
    expect(execution.postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resume-proposals/${PROPOSAL_ID}/decisions`,
      { accepted_operation_ids: [], decision: 'accept' },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: PROPOSAL_ETAG,
        maxRequestBytes: 64 * 1024,
        maxResponseBytes: 16 * 1024 * 1024,
        successKind: 'updated-result'
      }
    )
  })

  it('accepts only the explicitly selected subset and rejects unknown selections', async (): Promise<void> => {
    /** @brief 被用户选择的 operations / Operations selected by the user. */
    const selected = [OPERATION_IDS[1], OPERATION_IDS[4]]
    /** @brief accept_selected decision 的执行结果 / Execution result for the accept_selected decision. */
    const execution = executeDecision(operationResult({ applied_operation_ids: selected }), {
      accepted_operation_ids: selected,
      decision: 'accept_selected'
    })

    await expect(execution.promise).resolves.toMatchObject({
      value: { applied_operation_ids: selected }
    })
    expect(execution.postJson).toHaveBeenCalledTimes(1)

    /** @brief 不应发送未知选择的 POST / POST that must not send an unknown selection. */
    const unknownSelection = executeDecision(operationResult(), {
      accepted_operation_ids: ['operation_01K0UNKNOWN000000001'],
      decision: 'accept_selected'
    })
    await expect(unknownSelection.promise).rejects.toThrow(/absent from the Proposal/u)
    expect(unknownSelection.postJson).not.toHaveBeenCalled()
  })

  it('models reject as a terminal Proposal transition without a Resume mutation', async (): Promise<void> => {
    /** @brief reject decision 的空 operation 结果 / Empty operation result for the reject decision. */
    const execution = executeDecision(
      operationResult({ applied_operation_ids: [], conflicts: [], render_job_ref: null }),
      { accepted_operation_ids: [], decision: 'reject' }
    )

    await expect(execution.promise).resolves.toMatchObject({
      value: { applied_operation_ids: [], conflicts: [], render_job_ref: null }
    })
  })

  it('allows an atomic conflict result only for selected operations and without a render', async (): Promise<void> => {
    /** @brief 冲突的选中 operation / Selected operation that conflicts. */
    const selectedOperationId = OPERATION_IDS[0]
    /** @brief 原子冲突 result / Atomic conflict result. */
    const execution = executeDecision(
      operationResult({
        applied_operation_ids: [],
        conflicts: [
          {
            code: 'resume.concurrent_field',
            entity_id: RESUME_ID,
            field_path: ['profile', 'headline'],
            operation_id: selectedOperationId
          }
        ],
        render_job_ref: null
      }),
      { accepted_operation_ids: [selectedOperationId], decision: 'accept_selected' }
    )

    await expect(execution.promise).resolves.toMatchObject({
      value: {
        applied_operation_ids: [],
        conflicts: [{ operation_id: selectedOperationId }],
        render_job_ref: null
      }
    })
  })

  it.each([
    [
      'cross-Workspace Resume',
      operationResult({ resume: resumeDocument({ workspace_id: OTHER_WORKSPACE_ID }) })
    ],
    [
      'unselected applied operation',
      operationResult({ applied_operation_ids: [OPERATION_IDS[1]] })
    ],
    [
      'partial success plus conflict',
      operationResult({
        applied_operation_ids: [OPERATION_IDS[0]],
        conflicts: [
          {
            code: 'resume.concurrent_field',
            entity_id: RESUME_ID,
            field_path: [],
            operation_id: OPERATION_IDS[0]
          }
        ],
        render_job_ref: null
      })
    ],
    [
      'missing terminal outcome',
      operationResult({ applied_operation_ids: [], render_job_ref: null })
    ],
    [
      'unselected conflict',
      operationResult({
        applied_operation_ids: [],
        conflicts: [
          {
            code: 'resume.concurrent_field',
            entity_id: RESUME_ID,
            field_path: [],
            operation_id: OPERATION_IDS[1]
          }
        ],
        render_job_ref: null
      })
    ],
    [
      'non-advancing success',
      operationResult({
        applied_operation_ids: [OPERATION_IDS[0]],
        resume: resumeDocument({ revision: BASE_REVISION })
      })
    ]
  ])('rejects a non-atomic accept_selected result: %s', async (_label, result) => {
    /** @brief 只选择首个 operation 的 decision / Decision selecting only the first operation. */
    const execution = executeDecision(result, {
      accepted_operation_ids: [OPERATION_IDS[0]],
      decision: 'accept_selected'
    })

    await expect(execution.promise).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects terminal Proposal snapshots and invalid strong preconditions before dispatch', async (): Promise<void> => {
    /** @brief 编译期 pending、运行时模拟非 TypeScript 调用方篡改的 Proposal / Compile-time pending Proposal mutated at runtime to simulate a non-TypeScript caller. */
    const terminalProposal = pendingProposalSnapshot()
    Object.defineProperty(terminalProposal, 'status', { enumerable: true, value: 'expired' })
    /** @brief terminal Proposal 的 decision / Decision attempted against a terminal Proposal. */
    const terminalExecution = executeDecision(
      operationResult(),
      { accepted_operation_ids: [], decision: 'accept' },
      terminalProposal
    )
    await expect(terminalExecution.promise).rejects.toThrow(/pending/u)
    expect(terminalExecution.postJson).not.toHaveBeenCalled()

    /** @brief 不应收到弱 ETag 的 POST / POST that must not receive a weak ETag. */
    const postJson = vi.fn<ResumeProposalDecisionHttpClient['postJson']>()
    await expect(
      decideResumeProposal(
        { postJson },
        {
          decision: { accepted_operation_ids: [], decision: 'accept' },
          idempotencyKey: IDEMPOTENCY_KEY,
          ifMatch: 'W/"proposal-validator-3"',
          proposal: pendingProposalSnapshot(),
          proposalId: PROPOSAL_ID,
          resumeId: RESUME_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toThrow(/strong ETag/u)

    await expect(
      decideResumeProposal(
        { postJson },
        {
          decision: { accepted_operation_ids: [], decision: 'accept' },
          idempotencyKey: 'too-short',
          ifMatch: PROPOSAL_ETAG,
          proposal: pendingProposalSnapshot(),
          proposalId: PROPOSAL_ID,
          resumeId: RESUME_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toThrow(/Idempotency-Key/u)
    expect(postJson).not.toHaveBeenCalled()
  })

  it('rejects malformed pagination and missing single-resource validators', async (): Promise<void> => {
    expect(() =>
      parseResumeProposalList({
        items: [],
        page: { has_more: false, next_cursor: 'must-be-null' }
      })
    ).toThrow(ApiV2ContractError)

    /** @brief 不带 ETag 的单项响应 client / Single-resource response client without an ETag. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(proposalResource(), { 'X-Request-Id': REQUEST_ID }))
    await expect(
      getWorkspaceResumeProposal(
        { getJson },
        { proposalId: PROPOSAL_ID, resumeId: RESUME_ID, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toThrow(/strong ETag/u)
  })
})
