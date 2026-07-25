/** @file API v2 Resume 历史与建议审阅运行时防腐层 / API v2 runtime ACL for Resume history and proposal review. */

import {
  ApiV2ContractError,
  createWorkspaceResumeRestoreJob,
  decideResumeProposal,
  getWorkspaceResumeProposal,
  getWorkspaceResumeRevision,
  listWorkspaceResumeProposalPage,
  listWorkspaceResumeRevisionPage,
  parseResumeProposal,
  type ApiV2Client,
  type PendingResumeProposal,
  type ProposalDecisionRequest,
  type ResourceReference,
  type ResumeItem,
  type ResumeJobCommandHttpClient,
  type ResumeOperation,
  type ResumeProposal,
  type ResumeProposalDecisionHttpClient,
  type ResumeRevision,
  type ResumeRevisionSummary,
  type ResumeSection,
  type RichText
} from '@ai-job-workspace/product-api-v2'
import {
  asUiConcurrencyToken,
  asUiOpaqueId,
  asUiResumePartialDate,
  asUiResumeProposalCursor,
  asUiResumeRevisionCursor,
  cloneUiJsonValue,
  groupUiResumeProposalOperations,
  type ResumeReviewPort,
  type UiPendingResumeProposal,
  type UiResourceReference,
  type UiResumeProposal,
  type UiResumeProposalDecision,
  type UiResumeProposalOperation,
  type UiResumeProposalPage,
  type UiResumeRevision,
  type UiResumeRevisionPage,
  type UiResumeRevisionSummary,
  type UiResumeRichText
} from '@ai-job-workspace/app/application'

import {
  mapResumeDocument,
  mapUiResumeRichTextToApiV2,
  mapWorkspaceJobAuthority
} from './api-v2-gateways'

/** @brief Proposal operation 联合中携带的领域 item / Domain item carried by the Proposal-operation union. */
type UiResumeReviewItem = Extract<
  UiResumeProposalOperation,
  { readonly kind: 'upsert-item' }
>['item']

/** @brief Proposal operation 联合中携带的领域 section / Domain section carried by the Proposal-operation union. */
type UiResumeReviewSection = Extract<
  UiResumeProposalOperation,
  { readonly kind: 'upsert-section' }
>['section']

/**
 * @brief 把 API v2 ResourceRef 无损映射为共享领域引用 / Losslessly map an API v2 ResourceRef into a shared domain reference.
 * @param source 已严格解码的 wire 引用 / Strictly decoded wire reference.
 * @return 保留 revision 缺失、null 与整数区别的新引用 / New reference preserving absent, null, and integer revision states.
 */
export function mapResumeReviewResourceReference(source: ResourceReference): UiResourceReference {
  /** @brief 不含可选 revision 的公共字段 / Common fields without the optional revision. */
  const required = { id: source.id, resourceType: source.resource_type }
  if (!Object.hasOwn(source, 'revision')) return required
  /** @brief 已在 wire 上显式出现的 revision / Revision explicitly present on the wire. */
  const revision = source.revision
  if (revision === undefined) {
    throw new ApiV2ContractError('An API v2 ResourceRef cannot own an undefined revision.')
  }
  return { ...required, revision }
}

/**
 * @brief 把共享领域引用还原为 API v2 ResourceRef / Restore a shared domain reference into an API v2 ResourceRef.
 * @param source 冻结 Proposal 中的领域引用 / Domain reference in a frozen Proposal.
 * @return 保留可选字段存在性的 wire 引用 / Wire reference preserving optional-field presence.
 */
function mapUiResourceReferenceToApiV2(source: UiResourceReference): ResourceReference {
  /** @brief 不含可选 revision 的公共字段 / Common fields without the optional revision. */
  const required = { id: source.id, resource_type: source.resourceType }
  if (!Object.hasOwn(source, 'revision')) return required
  /** @brief 在冻结领域快照中显式存在的 revision / Revision explicitly present in the frozen domain snapshot. */
  const revision = source.revision
  if (revision === undefined) {
    throw new ApiV2ContractError('A frozen Resume Proposal ResourceRef cannot own undefined.')
  }
  return { ...required, revision }
}

/**
 * @brief 映射完整 RichText 且保留样式 mark 的 href 存在性 / Map complete RichText while preserving href presence on style marks.
 * @param source 已严格解码的 wire RichText / Strictly decoded wire RichText.
 * @return 不共享数组的领域 RichText / Domain RichText sharing no arrays.
 */
function mapResumeReviewRichText(source: RichText): UiResumeRichText {
  return {
    marks: source.marks.map((mark) => {
      if (mark.kind === 'link') {
        return { end: mark.end, href: mark.href, kind: mark.kind, start: mark.start }
      }
      /** @brief 非 link mark 的公共区间 / Common range of a non-link mark. */
      const range = { end: mark.end, kind: mark.kind, start: mark.start }
      return Object.hasOwn(mark, 'href') ? { ...range, href: null } : range
    }),
    text: source.text
  }
}

/**
 * @brief 把 API v2 Resume item 无损映射为领域 item / Losslessly map an API v2 Resume item into a domain item.
 * @param source 已严格解码的 wire item / Strictly decoded wire item.
 * @return 不共享数组且保留 partial-date 精度的领域 item / Domain item sharing no arrays and preserving partial-date precision.
 */
function mapResumeReviewItem(source: ResumeItem): UiResumeReviewItem {
  return {
    dateRange:
      source.date_range === null
        ? null
        : {
            end:
              source.date_range.end === null || source.date_range.end === 'present'
                ? source.date_range.end
                : asUiResumePartialDate(source.date_range.end),
            start:
              source.date_range.start === null
                ? null
                : asUiResumePartialDate(source.date_range.start)
          },
    highlights: source.highlights.map(mapResumeReviewRichText),
    id: asUiOpaqueId<'resume-item'>(source.id),
    kind: source.kind,
    location: source.location,
    organization: source.organization,
    skills: [...source.skills],
    subtitle: source.subtitle,
    summary: source.summary === null ? null : mapResumeReviewRichText(source.summary),
    tags: [...source.tags],
    title: source.title,
    url: source.url,
    visible: source.visible
  }
}

/**
 * @brief 把 API v2 Resume section 无损映射为领域 section / Losslessly map an API v2 Resume section into a domain section.
 * @param source 已严格解码的 wire section / Strictly decoded wire section.
 * @return 不共享嵌套数组的领域 section / Domain section sharing no nested arrays.
 */
function mapResumeReviewSection(source: ResumeSection): UiResumeReviewSection {
  return {
    content: source.content === null ? null : mapResumeReviewRichText(source.content),
    id: asUiOpaqueId<'resume-section'>(source.id),
    items: source.items.map(mapResumeReviewItem),
    kind: source.kind,
    title: source.title,
    visible: source.visible
  }
}

/**
 * @brief 把领域 item 还原为冻结 Proposal 的 wire item / Restore a domain item into a wire item for a frozen Proposal.
 * @param source 冻结领域 item / Frozen domain item.
 * @return 不共享数组的 API v2 item / API v2 item sharing no arrays.
 */
function mapUiResumeItemToApiV2(source: UiResumeReviewItem): ResumeItem {
  return {
    date_range:
      source.dateRange === null
        ? null
        : { end: source.dateRange.end, start: source.dateRange.start },
    highlights: source.highlights.map(mapUiResumeRichTextToApiV2),
    id: source.id,
    kind: source.kind,
    location: source.location,
    organization: source.organization,
    skills: [...source.skills],
    subtitle: source.subtitle,
    summary: source.summary === null ? null : mapUiResumeRichTextToApiV2(source.summary),
    tags: [...source.tags],
    title: source.title,
    url: source.url,
    visible: source.visible
  }
}

/**
 * @brief 把领域 section 还原为冻结 Proposal 的 wire section / Restore a domain section into a wire section for a frozen Proposal.
 * @param source 冻结领域 section / Frozen domain section.
 * @return 不共享嵌套数组的 API v2 section / API v2 section sharing no nested arrays.
 */
function mapUiResumeSectionToApiV2(source: UiResumeReviewSection): ResumeSection {
  return {
    content: source.content === null ? null : mapUiResumeRichTextToApiV2(source.content),
    id: source.id,
    items: source.items.map(mapUiResumeItemToApiV2),
    kind: source.kind,
    title: source.title,
    visible: source.visible
  }
}

/**
 * @brief 把六类 wire Resume operation 无损映射为领域 operation / Losslessly map all six wire Resume operation kinds into domain operations.
 * @param source 已严格解码的 wire operation / Strictly decoded wire operation.
 * @return camelCase 且不共享容器的 operation / camelCase operation sharing no containers.
 */
export function mapResumeProposalOperation(source: ResumeOperation): UiResumeProposalOperation {
  /** @brief 品牌化 operation identity / Branded operation identity. */
  const operationId = asUiOpaqueId<'resume-proposal-operation'>(source.operation_id)
  switch (source.op) {
    case 'set_field':
      return {
        entityId: source.entity_id,
        fieldPath: [...source.field_path],
        kind: 'set-field',
        operationId,
        value: cloneUiJsonValue(source.value)
      }
    case 'upsert_section':
      return {
        afterSectionId: source.after_section_id,
        kind: 'upsert-section',
        operationId,
        section: mapResumeReviewSection(source.section)
      }
    case 'upsert_item':
      return {
        afterItemId: source.after_item_id,
        item: mapResumeReviewItem(source.item),
        kind: 'upsert-item',
        operationId,
        sectionId: source.section_id
      }
    case 'remove_entity':
      return {
        entityId: source.entity_id,
        entityKind: source.entity_kind,
        kind: 'remove-entity',
        operationId
      }
    case 'move_entity':
      return {
        afterId: source.after_id,
        entityId: source.entity_id,
        entityKind: source.entity_kind,
        kind: 'move-entity',
        operationId,
        parentId: source.parent_id
      }
    case 'set_template':
      return {
        kind: 'set-template',
        operationId,
        settings: cloneUiJsonValue(source.settings),
        template: {
          templateId: asUiOpaqueId<'template'>(source.template.template_id),
          templateVersion: source.template.version
        }
      }
  }
}

/**
 * @brief 把领域 operation 还原为冻结 decision 使用的 wire operation / Restore a domain operation into the wire operation used by a frozen decision.
 * @param source 冻结领域 operation / Frozen domain operation.
 * @return 字段与值无损的 API v2 operation / API v2 operation preserving all fields and values.
 */
function mapUiResumeProposalOperationToApiV2(source: UiResumeProposalOperation): ResumeOperation {
  switch (source.kind) {
    case 'set-field':
      return {
        entity_id: source.entityId,
        field_path: [...source.fieldPath],
        op: 'set_field',
        operation_id: source.operationId,
        value: cloneUiJsonValue(source.value)
      }
    case 'upsert-section':
      return {
        after_section_id: source.afterSectionId,
        op: 'upsert_section',
        operation_id: source.operationId,
        section: mapUiResumeSectionToApiV2(source.section)
      }
    case 'upsert-item':
      return {
        after_item_id: source.afterItemId,
        item: mapUiResumeItemToApiV2(source.item),
        op: 'upsert_item',
        operation_id: source.operationId,
        section_id: source.sectionId
      }
    case 'remove-entity':
      return {
        entity_id: source.entityId,
        entity_kind: source.entityKind,
        op: 'remove_entity',
        operation_id: source.operationId
      }
    case 'move-entity':
      return {
        after_id: source.afterId,
        entity_id: source.entityId,
        entity_kind: source.entityKind,
        op: 'move_entity',
        operation_id: source.operationId,
        parent_id: source.parentId
      }
    case 'set-template':
      return {
        op: 'set_template',
        operation_id: source.operationId,
        settings: cloneUiJsonValue(source.settings),
        template: {
          template_id: source.template.templateId,
          version: source.template.templateVersion
        }
      }
  }
}

/**
 * @brief 把协议 Proposal 生命周期状态映射为领域状态 / Map a protocol Proposal lifecycle state into a domain state.
 * @param status wire 状态 / Wire status.
 * @return 展示无下划线泄漏的领域状态 / Domain status without underscore leakage.
 */
function mapResumeProposalStatus(status: ResumeProposal['status']): UiResumeProposal['status'] {
  return status === 'partially_accepted' ? 'partially-accepted' : status
}

/**
 * @brief 把 API v2 Proposal 无损映射为封闭领域状态 / Losslessly map an API v2 Proposal into a closed domain state.
 * @param source 已严格解码的 Proposal / Strictly decoded Proposal.
 * @return 不共享嵌套容器的领域 Proposal / Domain Proposal sharing no nested containers.
 */
export function mapResumeProposal(source: ResumeProposal): UiResumeProposal {
  /** @brief 跨状态公共字段 / Fields shared across lifecycle states. */
  const fields = {
    baseRevision: source.base_revision,
    createdAt: source.created_at,
    evidenceRefs: source.evidence_refs.map(mapResumeReviewResourceReference),
    id: asUiOpaqueId<'resume-proposal'>(source.id),
    operations: source.operations.map(mapResumeProposalOperation),
    resumeId: asUiOpaqueId<'resume'>(source.resume_id),
    revision: source.revision,
    title: source.title,
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
  /** @brief 已转换为领域拼写的封闭状态 / Closed status converted to domain spelling. */
  const status = mapResumeProposalStatus(source.status)
  if (status === 'pending') return { ...fields, status }
  return { ...fields, status }
}

/**
 * @brief 把冻结 pending Proposal 重建并重新校验为 wire 快照 / Rebuild and revalidate a frozen pending Proposal as a wire snapshot.
 * @param source decision 命令冻结的完整 Proposal / Complete Proposal frozen by the decision command.
 * @return 可交给协议 decision 层的独立 pending 快照 / Independent pending snapshot consumable by the protocol decision layer.
 */
function mapUiPendingResumeProposalToApiV2(source: UiPendingResumeProposal): PendingResumeProposal {
  /** @brief 由严格协议 decoder 重新验证的快照 / Snapshot revalidated by the strict protocol decoder. */
  const proposal = parseResumeProposal(
    {
      base_revision: source.baseRevision,
      created_at: source.createdAt,
      evidence_refs: source.evidenceRefs.map(mapUiResourceReferenceToApiV2),
      id: source.id,
      operations: source.operations.map(mapUiResumeProposalOperationToApiV2),
      resume_id: source.resumeId,
      revision: source.revision,
      status: 'pending',
      title: source.title,
      updated_at: source.updatedAt,
      workspace_id: source.workspaceId
    },
    'resume_review_command.proposal'
  )
  if (proposal.status !== 'pending') {
    throw new ApiV2ContractError('A frozen Resume Proposal decision must target pending state.')
  }
  return proposal
}

/**
 * @brief 映射一个不可变 Resume revision 摘要 / Map one immutable Resume revision summary.
 * @param source 已严格解码的 wire 摘要 / Strictly decoded wire summary.
 * @return 保留创建者完整引用的领域摘要 / Domain summary preserving the complete creator reference.
 */
export function mapResumeRevisionSummary(source: ResumeRevisionSummary): UiResumeRevisionSummary {
  return {
    createdAt: source.created_at,
    createdBy: mapResumeReviewResourceReference(source.created_by),
    resumeId: asUiOpaqueId<'resume'>(source.resume_id),
    revision: source.revision
  }
}

/**
 * @brief 映射含完整历史 SIR 的不可变 Resume revision / Map an immutable Resume revision carrying the complete historical SIR.
 * @param source 已严格解码的 wire revision / Strictly decoded wire revision.
 * @return 不共享 SIR 容器的领域 revision / Domain revision sharing no SIR containers.
 */
export function mapResumeRevision(source: ResumeRevision): UiResumeRevision {
  return { ...mapResumeRevisionSummary(source), document: mapResumeDocument(source.document) }
}

/**
 * @brief 把协议 revision cursor 页映射为封闭领域页 / Map a protocol revision cursor page into a closed domain page.
 * @param source 已严格解码的协议页 / Strictly decoded protocol page.
 * @return hasMore 与 cursor 关系封闭的领域页 / Domain page with a closed hasMore/cursor relation.
 */
export function mapResumeRevisionPage(
  source: Awaited<ReturnType<typeof listWorkspaceResumeRevisionPage>>
): UiResumeRevisionPage {
  /** @brief 当前页领域摘要 / Domain summaries on the current page. */
  const items = source.items.map(mapResumeRevisionSummary)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError(
      'An API v2 Resume revision page with more items must carry a cursor.'
    )
  }
  return { hasMore: true, items, nextCursor: asUiResumeRevisionCursor(source.page.next_cursor) }
}

/**
 * @brief 把协议 Proposal cursor 页映射为封闭领域页 / Map a protocol Proposal cursor page into a closed domain page.
 * @param source 已严格解码的协议页 / Strictly decoded protocol page.
 * @return hasMore 与 cursor 关系封闭的领域页 / Domain page with a closed hasMore/cursor relation.
 */
export function mapResumeProposalPage(
  source: Awaited<ReturnType<typeof listWorkspaceResumeProposalPage>>
): UiResumeProposalPage {
  /** @brief 当前页领域 Proposals / Domain Proposals on the current page. */
  const items = source.items.map(mapResumeProposal)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError(
      'An API v2 Resume Proposal page with more items must carry a cursor.'
    )
  }
  return { hasMore: true, items, nextCursor: asUiResumeProposalCursor(source.page.next_cursor) }
}

/**
 * @brief 校验并编码领域 Proposal decision / Validate and encode a domain Proposal decision.
 * @param proposal 冻结的完整 pending Proposal / Complete frozen pending Proposal.
 * @param decision 用户冻结的领域 decision / User's frozen domain decision.
 * @return Schema 封闭且选择范围合法的 wire decision / Schema-closed wire decision with a valid selection scope.
 */
function encodeResumeProposalDecision(
  proposal: UiPendingResumeProposal,
  decision: UiResumeProposalDecision
): ProposalDecisionRequest {
  switch (decision.kind) {
    case 'accept-all':
      return { accepted_operation_ids: [], decision: 'accept' }
    case 'reject':
      return { accepted_operation_ids: [], decision: 'reject' }
    case 'accept-selected': {
      /** @brief 选择性接受的 operation IDs / Operation IDs selected for acceptance. */
      const operationIds = [...decision.operationIds]
      if (operationIds.length < 1 || operationIds.length > 200) {
        throw new ApiV2ContractError(
          'A selective Resume Proposal decision must contain between 1 and 200 operation IDs.'
        )
      }
      /** @brief 用户选择中的唯一 IDs / Unique IDs in the user's selection. */
      const selected = new Set(operationIds)
      if (selected.size !== operationIds.length) {
        throw new ApiV2ContractError(
          'A selective Resume Proposal decision must not repeat an operation ID.'
        )
      }
      /** @brief Proposal 按 operation ID 形成的不可拆分组 / Indivisible Proposal groups keyed by operation ID. */
      const available = new Set(
        groupUiResumeProposalOperations(proposal.operations).map((group) => group.operationId)
      )
      if (operationIds.some((operationId) => !available.has(operationId))) {
        throw new ApiV2ContractError(
          'A selective Resume Proposal decision references an operation group absent from the frozen Proposal.'
        )
      }
      return { accepted_operation_ids: operationIds, decision: 'accept_selected' }
    }
  }
}

/**
 * @brief 创建 API v2 Resume Review 应用适配器 / Create the API v2 Resume Review application adapter.
 * @param client v2-only revision 与 Proposal 读取客户端 / v2-only client for revision and Proposal reads.
 * @param proposalClient 固定 updated-result 的 Proposal decision 写端口 / Proposal-decision write port fixed to updated-result semantics.
 * @param jobClient 固定 accepted-resource 的 Resume restore 写端口 / Resume-restore write port fixed to accepted-resource semantics.
 * @return 历史、审阅、decision 与 restore 的产品应用端口 / Product application port for history, review, decisions, and restore.
 */
export function createApiV2ResumeReviewGateway(
  client: ApiV2Client,
  proposalClient: ResumeProposalDecisionHttpClient,
  jobClient: ResumeJobCommandHttpClient
): ResumeReviewPort {
  return {
    async decideResumeProposal(command) {
      /** @brief 同步冻结并重新验证的 wire Proposal / Wire Proposal synchronously frozen and revalidated from the command. */
      const proposal = mapUiPendingResumeProposalToApiV2(command.proposal)
      /** @brief 同步冻结且按 operation-ID 组校验的 wire decision / Wire decision synchronously frozen and validated by operation-ID group. */
      const decision = encodeResumeProposalDecision(command.proposal, command.decision)
      /** @brief 原样使用快照、ETag 与 command ID 的 decision 结果 / Decision result using the snapshot, ETag, and command ID verbatim. */
      const representation = await decideResumeProposal(proposalClient, {
        decision,
        idempotencyKey: command.commandId,
        ifMatch: command.concurrencyToken,
        proposal,
        proposalId: proposal.id,
        resumeId: proposal.resume_id,
        ...(command.signal === undefined ? {} : { signal: command.signal }),
        workspaceId: proposal.workspace_id
      })
      return {
        appliedOperationIds: representation.value.applied_operation_ids.map((operationId) =>
          asUiOpaqueId<'resume-proposal-operation'>(operationId)
        ),
        conflicts: representation.value.conflicts.map((conflict) => ({
          code: conflict.code,
          entityId: conflict.entity_id,
          fieldPath: [...conflict.field_path],
          operationId: asUiOpaqueId<'resume-proposal-operation'>(conflict.operation_id)
        })),
        editor: {
          concurrencyToken: asUiConcurrencyToken(representation.entityTag),
          resume: mapResumeDocument(representation.value.resume)
        }
      }
    },

    async getResumeProposal(workspaceId, resumeId, proposalId, signal) {
      /** @brief 带强 ETag 的权威 Proposal 表示 / Authoritative Proposal representation carrying a strong ETag. */
      const representation = await getWorkspaceResumeProposal(client, {
        proposalId,
        resumeId,
        signal,
        workspaceId
      })
      return {
        concurrencyToken: asUiConcurrencyToken(representation.entityTag),
        proposal: mapResumeProposal(representation.value)
      }
    },

    async getResumeRevision(workspaceId, resumeId, revision, signal) {
      /** @brief 含完整历史 SIR 的不可变 revision / Immutable revision carrying the complete historical SIR. */
      const result = await getWorkspaceResumeRevision(client, {
        resumeId,
        revision,
        signal,
        workspaceId
      })
      return mapResumeRevision(result)
    },

    async listResumeProposalPage(request) {
      /** @brief 当前 Proposal wire 页 / Current wire Proposal page. */
      const page = await listWorkspaceResumeProposalPage(client, {
        cursor: request.cursor,
        limit: request.limit,
        resumeId: request.resumeId,
        signal: request.signal,
        workspaceId: request.workspaceId
      })
      return mapResumeProposalPage(page)
    },

    async listResumeRevisionPage(request) {
      /** @brief 当前 revision wire 页 / Current wire revision page. */
      const page = await listWorkspaceResumeRevisionPage(
        client,
        request.workspaceId,
        request.resumeId,
        {
          cursor: request.cursor,
          limit: request.limit,
          signal: request.signal
        }
      )
      return mapResumeRevisionPage(page)
    },

    async startResumeRestore(input) {
      if (!Number.isSafeInteger(input.currentRevision) || input.currentRevision < 1) {
        throw new ApiV2ContractError(
          'The current Resume revision for a restore must be a positive safe integer.'
        )
      }
      /** @brief API v2 已接受的 restore Job 权威 / Restore Job authority accepted by API v2. */
      const authority = await createWorkspaceResumeRestoreJob(jobClient, {
        idempotencyKey: input.commandId,
        ifMatch: input.concurrencyToken,
        request: { source_revision: input.sourceRevision },
        resumeId: input.resumeId,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        workspaceId: input.workspaceId
      })
      if (
        authority.value.workspace_id !== input.workspaceId ||
        authority.value.subject.resource_type !== 'resume' ||
        authority.value.subject.id !== input.resumeId
      ) {
        throw new ApiV2ContractError(
          'An API v2 Resume restore Job must remain inside the requested Workspace and Resume.'
        )
      }
      return mapWorkspaceJobAuthority(authority)
    }
  }
}
