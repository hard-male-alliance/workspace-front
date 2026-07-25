/** @file API v2 Resume Review 运行时 ACL 测试 / API v2 Resume Review runtime ACL tests. */

import { describe, expect, it, vi } from 'vitest'

import {
  asUiConcurrencyToken,
  asUiOpaqueId,
  asUiResumeReviewPageLimit,
  createUiCommandId,
  type UiPendingResumeProposal
} from '@ai-job-workspace/app/application'
import {
  ApiV2ContractError,
  ApiV2WriteOutcomeUnknownError,
  parseResumeProposal,
  type ApiV2AcceptedResourceResponse,
  type ApiV2Client,
  type ApiV2JsonResponse,
  type ApiV2UpdatedWriteJsonResponse,
  type ResumeJobCommandHttpClient,
  type ResumeProposalDecisionHttpClient
} from '@ai-job-workspace/product-api-v2'

import { createApiV2ResumeReviewGateway, mapResumeProposal } from './resume-review-gateway'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'workspace_01K0REVIEW0000000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0REVIEW000000000001'

/** @brief 另一 Resume identity / Another Resume identity. */
const OTHER_RESUME_ID = 'resume_01K0REVIEWOTHER00000001'

/** @brief 测试 Proposal identity / Test Proposal identity. */
const PROPOSAL_ID = 'proposal_01K0REVIEW0000000001'

/** @brief 测试 Template identity / Test Template identity. */
const TEMPLATE_ID = 'template_01K0REVIEW0000000001'

/** @brief 测试 Job identity / Test Job identity. */
const JOB_ID = 'job_01K0REVIEW00000000000001'

/** @brief Proposal operation identities / Proposal operation identities. */
const OPERATION_IDS = [
  'operation_01K0REVIEW000000001',
  'operation_01K0REVIEW000000002',
  'operation_01K0REVIEW000000003',
  'operation_01K0REVIEW000000004',
  'operation_01K0REVIEW000000005',
  'operation_01K0REVIEW000000006'
] as const

/** @brief Proposal 强 ETag / Strong Proposal ETag. */
const PROPOSAL_ETAG = '"proposal-review-revision-3"'

/** @brief Resume 结果强 ETag / Strong result Resume ETag. */
const RESULT_ETAG = '"resume-review-revision-8"'

/** @brief Resume 当前强 ETag / Strong current Resume ETag. */
const RESUME_ETAG = '"resume-review-revision-7"'

/** @brief 测试 request ID / Test request ID. */
const REQUEST_ID = 'request_resume_review_000001'

/**
 * @brief 构造合法 Resume item / Build a valid Resume item.
 * @return 覆盖 partial date 与富文本的 wire item / Wire item covering partial dates and rich text.
 */
function resumeItem(): Readonly<Record<string, unknown>> {
  return {
    date_range: { end: 'present', start: '2025-02' },
    highlights: [{ marks: [], text: 'Reduced tail latency.' }],
    id: 'item_01K0REVIEW000000000001',
    kind: 'experience',
    location: 'Shanghai',
    organization: 'HM Alliances',
    skills: ['TypeScript'],
    subtitle: 'Platform',
    summary: { marks: [{ end: 10, href: null, kind: 'strong', start: 0 }], text: 'Production' },
    tags: ['reliability'],
    title: 'Engineer',
    url: 'https://example.cn/role',
    visible: true
  }
}

/**
 * @brief 构造合法 Resume section / Build a valid Resume section.
 * @return 含完整 item 的 wire section / Wire section carrying a complete item.
 */
function resumeSection(): Readonly<Record<string, unknown>> {
  return {
    content: { marks: [], text: 'Selected work' },
    id: 'section_01K0REVIEW000000001',
    items: [resumeItem()],
    kind: 'experience',
    title: 'Experience',
    visible: true
  }
}

/**
 * @brief 构造六类合法 Proposal operations / Build all six valid Proposal operation kinds.
 * @return 固定顺序的完整 wire operations / Complete wire operations in a stable order.
 */
function resumeOperations(): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      entity_id: RESUME_ID,
      field_path: ['profile', 'headline'],
      op: 'set_field',
      operation_id: OPERATION_IDS[0],
      value: { headline: 'Staff Engineer', signals: [true, 7, null] }
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
      section_id: 'section_01K0REVIEW000000001'
    },
    {
      entity_id: 'item_01K0REVIEW000000000002',
      entity_kind: 'item',
      op: 'remove_entity',
      operation_id: OPERATION_IDS[3]
    },
    {
      after_id: null,
      entity_id: 'section_01K0REVIEW000000002',
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
 * @brief 构造合法 Resume Proposal / Build a valid Resume Proposal.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 完整 wire Proposal / Complete wire Proposal.
 */
function proposalResource(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    base_revision: 7,
    created_at: '2026-07-22T10:00:00Z',
    evidence_refs: [
      { id: 'message_01K0REVIEW000000001', resource_type: 'message' },
      { id: 'fact_01K0REVIEW00000000001', resource_type: 'knowledge_fact', revision: null }
    ],
    id: PROPOSAL_ID,
    operations: resumeOperations(),
    resume_id: RESUME_ID,
    revision: 3,
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
 * @return 完整且自洽的 wire SIR / Complete and coherent wire SIR.
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
    revision: 8,
    sections: [resumeSection()],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'org.hmalliances.review': { accepted: true } },
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
          section_id: 'section_01K0REVIEW000000001',
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
 * @brief 构造 Resume operation result / Build a Resume operation result.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return 完整 wire operation result / Complete wire operation result.
 */
function operationResult(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    applied_operation_ids: [...OPERATION_IDS],
    conflicts: [],
    render_job_ref: null,
    resume: resumeDocument(),
    ...overrides
  }
}

/**
 * @brief 构造严格 JSON response / Build a strict JSON response.
 * @param data 响应 payload / Response payload.
 * @param headers 当前用例 headers / Headers for the current case.
 * @return 固定 200 response / Fixed 200 response.
 */
function getResponse(
  data: unknown,
  headers: HeadersInit = { ETag: PROPOSAL_ETAG, 'X-Request-Id': REQUEST_ID }
): ApiV2JsonResponse {
  return { data, headers: new Headers(headers), status: 200 }
}

/**
 * @brief 构造固定 200 updated-result response / Build a fixed 200 updated-result response.
 * @param data operation result payload / Operation-result payload.
 * @return 带新强 ETag 的 response / Response carrying the next strong ETag.
 */
function decisionResponse(data: unknown): ApiV2UpdatedWriteJsonResponse {
  return {
    data,
    metadata: { entityTag: RESULT_ETAG, location: null, requestId: REQUEST_ID },
    status: 200
  }
}

/**
 * @brief 构造 queued restore Job / Build a queued restore Job.
 * @param subjectRevision Job subject 可选 revision / Optional Job-subject revision.
 * @param kind 服务端开放 Job kind / Open server Job kind.
 * @return 满足 queued 不变量的 wire Job / Wire Job satisfying queued-state invariants.
 */
function restoreJob(
  subjectRevision?: number,
  kind = 'resume.restore'
): Readonly<Record<string, unknown>> {
  return {
    created_at: '2026-07-23T01:00:00Z',
    finished_at: null,
    id: JOB_ID,
    kind,
    problem: null,
    progress: null,
    result_refs: [],
    revision: 1,
    started_at: null,
    status: 'queued',
    subject: {
      id: RESUME_ID,
      resource_type: 'resume',
      ...(subjectRevision === undefined ? {} : { revision: subjectRevision })
    },
    updated_at: '2026-07-23T01:00:00Z',
    workspace_id: WORKSPACE_ID
  }
}

/**
 * @brief 构造固定 202 accepted-resource response / Build a fixed 202 accepted-resource response.
 * @param data Job payload / Job payload.
 * @return 带原子 Job metadata 的 response / Response carrying atomic Job metadata.
 */
function acceptedResponse(data: unknown): ApiV2AcceptedResourceResponse {
  return {
    data,
    metadata: {
      entityTag: '"restore-job-revision-1"',
      location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
      requestId: REQUEST_ID
    },
    status: 202
  }
}

/**
 * @brief 把 wire Proposal 收窄为领域 pending 快照 / Narrow a wire Proposal into a domain pending snapshot.
 * @param operations 可选 operations 覆盖 / Optional operations override.
 * @return 可冻结到 decision command 的领域 Proposal / Domain Proposal suitable for freezing into a decision command.
 */
function pendingProposal(
  operations: readonly Readonly<Record<string, unknown>>[] = resumeOperations()
): UiPendingResumeProposal {
  /** @brief 完整领域 Proposal / Complete domain Proposal. */
  const proposal = mapResumeProposal(parseResumeProposal(proposalResource({ operations })))
  if (proposal.status !== 'pending') {
    throw new Error('Expected a pending Proposal test fixture.')
  }
  return proposal
}

describe('API v2 Resume Review runtime ACL', (): void => {
  it('无损映射 revision/Proposal 页和详情，并保留强 Proposal ETag', async (): Promise<void> => {
    /** @brief 按资源 path 返回结果的 GET mock / GET mock returning results by resource path. */
    const getJson = vi.fn<ApiV2Client['getJson']>((path) => {
      if (path.endsWith('/revisions')) {
        return Promise.resolve(
          getResponse({
            items: [
              {
                created_at: '2026-07-20T10:00:00Z',
                created_by: {
                  id: 'user_01K0REVIEW000000000001',
                  resource_type: 'user',
                  revision: null
                },
                resume_id: RESUME_ID,
                revision: 7
              }
            ],
            page: { has_more: true, next_cursor: 'cursor_revision_review_next' }
          })
        )
      }
      if (path.endsWith('/revisions/7')) {
        return Promise.resolve(
          getResponse({
            created_at: '2026-07-20T10:00:00Z',
            created_by: { id: 'user_01K0REVIEW000000000001', resource_type: 'user' },
            document: resumeDocument({ revision: 7 }),
            resume_id: RESUME_ID,
            revision: 7
          })
        )
      }
      if (path.endsWith('/proposals')) {
        return Promise.resolve(
          getResponse({
            items: [proposalResource({ status: 'partially_accepted' })],
            page: { has_more: false, next_cursor: null }
          })
        )
      }
      if (path.endsWith(`/resume-proposals/${PROPOSAL_ID}`)) {
        return Promise.resolve(getResponse(proposalResource()))
      }
      return Promise.reject(new Error(`Unexpected GET path: ${path}`))
    })
    /** @brief 当前用例不会执行的 Proposal 写端口 / Proposal write port unused by this case. */
    const proposalClient = {
      postJson: vi.fn<ResumeProposalDecisionHttpClient['postJson']>()
    }
    /** @brief 当前用例不会执行的 Job 写端口 / Job write port unused by this case. */
    const jobClient = { postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>() }
    /** @brief Resume Review runtime gateway / Resume Review runtime gateway. */
    const gateway = createApiV2ResumeReviewGateway({ getJson }, proposalClient, jobClient)
    /** @brief 显式品牌 identities / Explicit branded identities. */
    const workspaceId = asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    const resumeId = asUiOpaqueId<'resume'>(RESUME_ID)
    const proposalId = asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID)
    const signal = new AbortController().signal

    const revisions = await gateway.listResumeRevisionPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(25),
      resumeId,
      signal,
      workspaceId
    })
    const revision = await gateway.getResumeRevision(workspaceId, resumeId, 7, signal)
    const proposals = await gateway.listResumeProposalPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(25),
      resumeId,
      signal,
      workspaceId
    })
    const proposal = await gateway.getResumeProposal(workspaceId, resumeId, proposalId, signal)

    expect(revisions).toEqual({
      hasMore: true,
      items: [
        {
          createdAt: '2026-07-20T10:00:00Z',
          createdBy: {
            id: 'user_01K0REVIEW000000000001',
            resourceType: 'user',
            revision: null
          },
          resumeId: RESUME_ID,
          revision: 7
        }
      ],
      nextCursor: 'cursor_revision_review_next'
    })
    expect(revision).toMatchObject({
      createdBy: { id: 'user_01K0REVIEW000000000001', resourceType: 'user' },
      document: { id: RESUME_ID, revision: 7 },
      revision: 7
    })
    expect(proposals).toMatchObject({
      hasMore: false,
      items: [
        {
          evidenceRefs: [
            { id: 'message_01K0REVIEW000000001', resourceType: 'message' },
            { id: 'fact_01K0REVIEW00000000001', resourceType: 'knowledge_fact', revision: null }
          ],
          operations: [
            { kind: 'set-field', value: { headline: 'Staff Engineer', signals: [true, 7, null] } },
            { kind: 'upsert-section', section: { items: [{ dateRange: { start: '2025-02' } }] } },
            { kind: 'upsert-item' },
            { kind: 'remove-entity' },
            { kind: 'move-entity' },
            { kind: 'set-template', settings: { accent: '#112233', show_icons: true } }
          ],
          status: 'partially-accepted'
        }
      ],
      nextCursor: null
    })
    expect(proposal).toMatchObject({
      concurrencyToken: PROPOSAL_ETAG,
      proposal: { id: PROPOSAL_ID, status: 'pending' }
    })
  })

  it('把重复 operation_id 作为不可拆分组选择，并拒绝重复或外部组 ID', async (): Promise<void> => {
    /** @brief 两个共享同一 ID 的 Schema 合法 operations / Two Schema-valid operations sharing one ID. */
    const duplicateGroup = [resumeOperations()[0], resumeOperations()[0]]
    /** @brief 冻结 Proposal 快照 / Frozen Proposal snapshot. */
    const proposal = pendingProposal(duplicateGroup as readonly Readonly<Record<string, unknown>>[])
    /** @brief 被选择的单一 operation-ID 组 / Single selected operation-ID group. */
    const selectedId = asUiOpaqueId<'resume-proposal-operation'>(OPERATION_IDS[0])
    /** @brief 成功 result 的 POST mock / POST mock for a successful result. */
    const postJson = vi.fn<ResumeProposalDecisionHttpClient['postJson']>().mockResolvedValue(
      decisionResponse(
        operationResult({
          applied_operation_ids: [OPERATION_IDS[0]],
          resume: resumeDocument({ revision: 8 })
        })
      )
    )
    /** @brief 不应由 decision 隐式调用的 GET mock / GET mock that decision must not call implicitly. */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    /** @brief 当前用例不会执行的 Job 写端口 / Job write port unused by this case. */
    const jobClient = { postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>() }
    const gateway = createApiV2ResumeReviewGateway({ getJson }, { postJson }, jobClient)
    /** @brief 一次稳定用户意图 / One stable user intent. */
    const commandId = createUiCommandId()

    await expect(
      gateway.decideResumeProposal({
        commandId,
        concurrencyToken: asUiConcurrencyToken(PROPOSAL_ETAG),
        decision: { kind: 'accept-selected', operationIds: [selectedId] },
        proposal
      })
    ).resolves.toMatchObject({
      appliedOperationIds: [OPERATION_IDS[0]],
      conflicts: [],
      editor: { concurrencyToken: RESULT_ETAG, resume: { id: RESUME_ID, revision: 8 } }
    })
    expect(postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resume-proposals/${PROPOSAL_ID}/decisions`,
      { accepted_operation_ids: [OPERATION_IDS[0]], decision: 'accept_selected' },
      expect.objectContaining({
        idempotencyKey: commandId,
        ifMatch: PROPOSAL_ETAG
      })
    )
    expect(getJson).not.toHaveBeenCalled()

    await expect(
      gateway.decideResumeProposal({
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken(PROPOSAL_ETAG),
        decision: { kind: 'accept-selected', operationIds: [selectedId, selectedId] },
        proposal
      })
    ).rejects.toThrow(/must not repeat/u)
    await expect(
      gateway.decideResumeProposal({
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken(PROPOSAL_ETAG),
        decision: {
          kind: 'accept-selected',
          operationIds: [
            asUiOpaqueId<'resume-proposal-operation'>('operation_01K0REVIEWOUTSIDE0001')
          ]
        },
        proposal
      })
    ).rejects.toThrow(/absent from the frozen Proposal/u)
    expect(postJson).toHaveBeenCalledTimes(1)
  })

  it('原样透传 unknown outcome，确认重放不 GET 且保持请求指纹', async (): Promise<void> => {
    /** @brief 冻结 Proposal 与 command / Frozen Proposal and command. */
    const proposal = pendingProposal()
    const command = {
      commandId: createUiCommandId(),
      concurrencyToken: asUiConcurrencyToken(PROPOSAL_ETAG),
      decision: { kind: 'accept-all' as const },
      proposal
    }
    /** @brief transport 报告的未知写入结果 / Unknown write outcome reported by transport. */
    const unknownOutcome = new ApiV2WriteOutcomeUnknownError('network')
    /** @brief 每次都返回相同未知结果的 POST / POST returning the same unknown result on every attempt. */
    const postJson = vi
      .fn<ResumeProposalDecisionHttpClient['postJson']>()
      .mockRejectedValue(unknownOutcome)
    /** @brief 禁止 decision 重新读取的 GET / GET forbidden during a decision.
     */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    const gateway = createApiV2ResumeReviewGateway(
      { getJson },
      { postJson },
      { postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>() }
    )

    await expect(gateway.decideResumeProposal(command)).rejects.toBe(unknownOutcome)
    await expect(gateway.decideResumeProposal(command)).rejects.toBe(unknownOutcome)

    expect(getJson).not.toHaveBeenCalled()
    expect(postJson).toHaveBeenCalledTimes(2)
    expect(postJson.mock.calls[1]).toEqual(postJson.mock.calls[0])
  })

  it('映射原子冲突且保留新的 Resume ETag', async (): Promise<void> => {
    /** @brief 冲突的已选择 operation / Selected operation that conflicts. */
    const selectedId = asUiOpaqueId<'resume-proposal-operation'>(OPERATION_IDS[0])
    /** @brief 返回原子冲突的 Proposal 写端口 / Proposal write port returning an atomic conflict. */
    const postJson = vi.fn<ResumeProposalDecisionHttpClient['postJson']>().mockResolvedValue(
      decisionResponse(
        operationResult({
          applied_operation_ids: [],
          conflicts: [
            {
              code: 'resume.concurrent_field',
              entity_id: RESUME_ID,
              field_path: ['profile', 'headline'],
              operation_id: OPERATION_IDS[0]
            }
          ]
        })
      )
    )
    const gateway = createApiV2ResumeReviewGateway(
      { getJson: vi.fn<ApiV2Client['getJson']>() },
      { postJson },
      { postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>() }
    )

    /** @brief 映射后的领域冲突结果 / Mapped domain conflict result. */
    const result = await gateway.decideResumeProposal({
      commandId: createUiCommandId(),
      concurrencyToken: asUiConcurrencyToken(PROPOSAL_ETAG),
      decision: { kind: 'accept-selected', operationIds: [selectedId] },
      proposal: pendingProposal()
    })

    expect(result.appliedOperationIds).toEqual([])
    expect(result.conflicts).toEqual([
      {
        code: 'resume.concurrent_field',
        entityId: RESUME_ID,
        fieldPath: ['profile', 'headline'],
        operationId: OPERATION_IDS[0]
      }
    ])
    expect(result.editor).toMatchObject({
      concurrencyToken: RESULT_ETAG,
      resume: { id: RESUME_ID, revision: 8 }
    })
  })

  it('读取时拒绝身份错配，不把跨 Resume Proposal 投影进产品状态', async (): Promise<void> => {
    /** @brief 返回跨 Resume Proposal 的 GET / GET returning a cross-Resume Proposal. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(proposalResource({ resume_id: OTHER_RESUME_ID })))
    const gateway = createApiV2ResumeReviewGateway(
      { getJson },
      { postJson: vi.fn<ResumeProposalDecisionHttpClient['postJson']>() },
      { postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>() }
    )

    await expect(
      gateway.getResumeProposal(
        asUiOpaqueId<'workspace'>(WORKSPACE_ID),
        asUiOpaqueId<'resume'>(RESUME_ID),
        asUiOpaqueId<'resume-proposal'>(PROPOSAL_ID),
        new AbortController().signal
      )
    ).rejects.toThrow(/identities differ/u)
  })

  it('restore 使用当前 Resume ETag，但不猜测开放 Job kind 或 subject revision 语义', async (): Promise<void> => {
    /** @brief 返回开放 kind 与不同可选 revision 的 restore Job POST / Restore-Job POST returning an open kind and a different optional revision. */
    const postJson = vi
      .fn<ResumeJobCommandHttpClient['postJson']>()
      .mockResolvedValueOnce(acceptedResponse(restoreJob(7)))
      .mockResolvedValueOnce(acceptedResponse(restoreJob(6, 'resume.history.restore')))
    const gateway = createApiV2ResumeReviewGateway(
      { getJson: vi.fn<ApiV2Client['getJson']>() },
      { postJson: vi.fn<ResumeProposalDecisionHttpClient['postJson']>() },
      { postJson }
    )
    /** @brief 可原样确认重放的 restore command / Restore command suitable for exact confirmation replay. */
    const command = {
      commandId: createUiCommandId(),
      concurrencyToken: asUiConcurrencyToken(RESUME_ETAG),
      currentRevision: 7,
      resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
      sourceRevision: 4,
      workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    }

    await expect(gateway.startResumeRestore(command)).resolves.toMatchObject({
      concurrencyToken: '"restore-job-revision-1"',
      job: {
        kind: 'resume.restore',
        subject: { id: RESUME_ID, resourceType: 'resume', revision: 7 }
      },
      requestId: REQUEST_ID
    })
    expect(postJson).toHaveBeenNthCalledWith(
      1,
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/restore-jobs`,
      { source_revision: 4 },
      expect.objectContaining({
        idempotencyKey: command.commandId,
        ifMatch: RESUME_ETAG,
        successKind: 'accepted-resource'
      })
    )

    await expect(gateway.startResumeRestore(command)).resolves.toMatchObject({
      job: {
        kind: 'resume.history.restore',
        subject: { id: RESUME_ID, resourceType: 'resume', revision: 6 }
      }
    })
  })

  it('restore 在发送前拒绝非法 current revision', async (): Promise<void> => {
    /** @brief 不应被调用的 Job POST / Job POST that must not be called. */
    const postJson = vi.fn<ResumeJobCommandHttpClient['postJson']>()
    const gateway = createApiV2ResumeReviewGateway(
      { getJson: vi.fn<ApiV2Client['getJson']>() },
      { postJson: vi.fn<ResumeProposalDecisionHttpClient['postJson']>() },
      { postJson }
    )

    await expect(
      gateway.startResumeRestore({
        commandId: createUiCommandId(),
        concurrencyToken: asUiConcurrencyToken(RESUME_ETAG),
        currentRevision: 0,
        resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
        sourceRevision: 4,
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(postJson).not.toHaveBeenCalled()
  })
})
