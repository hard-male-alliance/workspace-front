/** @file Resume 历史与建议审阅领域模型 / Resume history and proposal-review domain models. */

import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiResourceReference } from '../../../shared-kernel/resource-reference'
import type {
  UiJsonValue,
  UiResumeDocument,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeItem,
  UiResumeSection,
  UiTemplateReference
} from './document'

/** @brief Resume revision cursor / Resume revision cursor. */
export type UiResumeRevisionCursor = UiOpaqueId<'resume-revision-cursor'>

/** @brief Resume Proposal cursor / Resume Proposal cursor. */
export type UiResumeProposalCursor = UiOpaqueId<'resume-proposal-cursor'>

/** @brief Resume Proposal identity / Resume Proposal identity. */
export type UiResumeProposalId = UiOpaqueId<'resume-proposal'>

/** @brief Resume Proposal operation identity / Resume Proposal operation identity. */
export type UiResumeProposalOperationId = UiOpaqueId<'resume-proposal-operation'>

/** @brief Resume 审阅集合单页最大条目数 / Maximum items in one Resume-review collection page. */
export const UI_RESUME_REVIEW_PAGE_LIMIT_MAX = 200

/** @brief 经 API v2 上限约束的 Resume 审阅页大小 / Resume-review page size constrained by API v2. */
export type UiResumeReviewPageLimit = number & {
  /** @brief Resume 审阅页大小品牌 / Resume-review page-limit brand. */
  readonly __uiResumeReviewBrand: 'page-limit'
}

/**
 * @brief 将服务端 revision cursor 提升为不透明领域值 / Refine a server revision cursor into an opaque domain value.
 * @param value 服务端签发的 cursor / Cursor issued by the service.
 * @return 绑定 revision 集合语义的 cursor / Cursor bound to revision-collection semantics.
 */
export function asUiResumeRevisionCursor(value: string): UiResumeRevisionCursor {
  if (value.length < 1 || [...value].length > 2048) {
    throw new TypeError('A Resume revision cursor must contain between 1 and 2048 characters.')
  }
  return value as UiResumeRevisionCursor
}

/**
 * @brief 将服务端 Proposal cursor 提升为不透明领域值 / Refine a server Proposal cursor into an opaque domain value.
 * @param value 服务端签发的 cursor / Cursor issued by the service.
 * @return 绑定 Proposal 集合语义的 cursor / Cursor bound to Proposal-collection semantics.
 */
export function asUiResumeProposalCursor(value: string): UiResumeProposalCursor {
  if (value.length < 1 || [...value].length > 2048) {
    throw new TypeError('A Resume Proposal cursor must contain between 1 and 2048 characters.')
  }
  return value as UiResumeProposalCursor
}

/**
 * @brief 构造受 API v2 上限约束的 Resume 审阅页大小 / Construct a Resume-review page size constrained by the API v2 ceiling.
 * @param value 候选页大小 / Candidate page size.
 * @return 1 至 200 的名义页大小 / Nominal page size from 1 through 200.
 */
export function asUiResumeReviewPageLimit(value: number): UiResumeReviewPageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_RESUME_REVIEW_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `Resume review page limit must be an integer from 1 to ${UI_RESUME_REVIEW_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiResumeReviewPageLimit
}

/** @brief 不可变 Resume revision 摘要 / Immutable Resume revision summary. */
export interface UiResumeRevisionSummary {
  /** @brief 所属 Resume / Owning Resume. */
  readonly resumeId: UiResumeId
  /** @brief 不可变领域 revision / Immutable domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 创建者资源引用 / Creator resource reference. */
  readonly createdBy: UiResourceReference
}

/** @brief 携带完整历史 SIR 的不可变 Resume revision / Immutable Resume revision carrying the complete historical SIR. */
export interface UiResumeRevision extends UiResumeRevisionSummary {
  /** @brief 历史 revision 的完整 ResumeDocument / Complete ResumeDocument at the historical revision. */
  readonly document: UiResumeDocument
}

/** @brief Resume revision cursor page / Resume revision cursor page. */
export type UiResumeRevisionPage =
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeRevisionSummary[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页不透明 cursor / Opaque cursor for the next page. */
      readonly nextCursor: UiResumeRevisionCursor
    }
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeRevisionSummary[]
      /** @brief 已到末页 / Whether the terminal page has been reached. */
      readonly hasMore: false
      /** @brief 末页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }

/** @brief Proposal 的 set_field 操作 / set_field operation in a Proposal. */
export interface UiResumeProposalSetFieldOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'set-field'
  /** @brief 被修改实体 / Modified entity. */
  readonly entityId: string
  /** @brief 不含数组下标的语义字段路径 / Semantic field path without array indexes. */
  readonly fieldPath: readonly string[]
  /** @brief 建议的新字段值 / Proposed new field value. */
  readonly value: UiJsonValue
}

/** @brief Proposal 的 upsert_section 操作 / upsert_section operation in a Proposal. */
export interface UiResumeProposalUpsertSectionOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'upsert-section'
  /** @brief 完整建议 section / Complete proposed section. */
  readonly section: UiResumeSection
  /** @brief 插入锚点；null 表示首位 / Insertion anchor; null means first position. */
  readonly afterSectionId: string | null
}

/** @brief Proposal 的 upsert_item 操作 / upsert_item operation in a Proposal. */
export interface UiResumeProposalUpsertItemOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'upsert-item'
  /** @brief 目标 section / Target section. */
  readonly sectionId: string
  /** @brief 完整建议 item / Complete proposed item. */
  readonly item: UiResumeItem
  /** @brief 插入锚点；null 表示首位 / Insertion anchor; null means first position. */
  readonly afterItemId: string | null
}

/** @brief Proposal 的 remove_entity 操作 / remove_entity operation in a Proposal. */
export interface UiResumeProposalRemoveEntityOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'remove-entity'
  /** @brief 被删除实体种类 / Removed entity kind. */
  readonly entityKind: 'item' | 'section'
  /** @brief 被删除实体身份 / Removed entity identity. */
  readonly entityId: string
}

/** @brief Proposal 的 move_entity 操作 / move_entity operation in a Proposal. */
export interface UiResumeProposalMoveEntityOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'move-entity'
  /** @brief 被移动实体种类 / Moved entity kind. */
  readonly entityKind: 'item' | 'section'
  /** @brief 被移动实体身份 / Moved entity identity. */
  readonly entityId: string
  /** @brief 目标父实体；null 表示无父实体 / Target parent; null means no parent. */
  readonly parentId: string | null
  /** @brief 前置同级锚点；null 表示首位 / Previous sibling anchor; null means first position. */
  readonly afterId: string | null
}

/** @brief Proposal 的 set_template 操作 / set_template operation in a Proposal. */
export interface UiResumeProposalSetTemplateOperation {
  /** @brief 操作身份 / Operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'set-template'
  /** @brief 精确不可变 Template 版本 / Exact immutable Template version. */
  readonly template: UiTemplateReference
  /** @brief 由目标 Template 原子验证的完整 settings / Complete settings atomically validated by the target Template. */
  readonly settings: Readonly<Record<string, UiJsonValue>>
}

/** @brief Proposal 中六类语义 Resume 操作 / Six semantic Resume operation kinds in a Proposal. */
export type UiResumeProposalOperation =
  | UiResumeProposalMoveEntityOperation
  | UiResumeProposalRemoveEntityOperation
  | UiResumeProposalSetFieldOperation
  | UiResumeProposalSetTemplateOperation
  | UiResumeProposalUpsertItemOperation
  | UiResumeProposalUpsertSectionOperation

/** @brief 同一 operation ID 的不可拆分操作组 / Indivisible group of operations sharing one operation ID. */
export interface UiResumeProposalOperationGroup {
  /** @brief decision 中提交的组身份 / Group identity submitted in a decision. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief Schema 合法且共享该 ID 的全部操作 / All Schema-valid operations sharing the ID. */
  readonly operations: readonly UiResumeProposalOperation[]
}

/**
 * @brief 将 Proposal 操作按 operation ID 稳定分组 / Stably group Proposal operations by operation ID.
 * @param operations Proposal 的原始操作序列 / Original Proposal operation sequence.
 * @return 保持首次出现顺序且不可被局部拆分的操作组 / Operation groups preserving first-seen order and preventing partial split.
 * @note API v2 Schema 不保证 operation ID 唯一，因此选择性接受必须以组为最小单位。 / API v2 does not guarantee unique operation IDs, so selective acceptance must use groups as the minimum unit.
 */
export function groupUiResumeProposalOperations(
  operations: readonly UiResumeProposalOperation[]
): readonly UiResumeProposalOperationGroup[] {
  /** @brief 按首次出现顺序维护的可变分组 / Mutable groups maintained in first-seen order. */
  const groups: Array<{
    readonly operationId: UiResumeProposalOperationId
    readonly operations: UiResumeProposalOperation[]
  }> = []
  /** @brief operation ID 到组的索引 / Index from operation ID to group. */
  const byId = new Map<UiResumeProposalOperationId, (typeof groups)[number]>()
  for (const operation of operations) {
    /** @brief 当前 ID 的既有组 / Existing group for the current ID. */
    const existing = byId.get(operation.operationId)
    if (existing !== undefined) {
      existing.operations.push(operation)
      continue
    }
    /** @brief 首次出现 ID 的新组 / New group for a first-seen ID. */
    const group = { operationId: operation.operationId, operations: [operation] }
    groups.push(group)
    byId.set(operation.operationId, group)
  }
  return groups.map((group) => ({
    operationId: group.operationId,
    operations: [...group.operations]
  }))
}

/** @brief Resume Proposal 生命周期状态 / Resume Proposal lifecycle status. */
export type UiResumeProposalStatus =
  'accepted' | 'expired' | 'partially-accepted' | 'pending' | 'rejected'

/** @brief Resume Proposal 的跨状态公共字段 / Fields shared by every Resume Proposal state. */
interface UiResumeProposalFields {
  /** @brief Proposal identity / Proposal identity. */
  readonly id: UiResumeProposalId
  /** @brief Proposal 资源 revision / Proposal resource revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 最近更新时间 / Latest update timestamp. */
  readonly updatedAt: string
  /** @brief 所属 Workspace / Owning Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标 Resume / Target Resume. */
  readonly resumeId: UiResumeId
  /** @brief 建议所依据的 Resume revision / Resume revision on which the proposal is based. */
  readonly baseRevision: number
  /** @brief 面向用户的建议标题 / User-facing proposal title. */
  readonly title: string
  /** @brief 完整语义操作 / Complete semantic operations. */
  readonly operations: readonly UiResumeProposalOperation[]
  /** @brief 支持建议的证据引用 / Evidence references supporting the proposal. */
  readonly evidenceRefs: readonly UiResourceReference[]
}

/** @brief 唯一允许 decision 的 pending Proposal / Pending Proposal that uniquely permits a decision. */
export interface UiPendingResumeProposal extends UiResumeProposalFields {
  /** @brief 可决策状态 / Decidable state. */
  readonly status: 'pending'
}

/** @brief 已进入终态的 Proposal / Proposal that has entered a terminal state. */
export interface UiTerminalResumeProposal extends UiResumeProposalFields {
  /** @brief 不可再次 decision 的状态 / State that does not permit another decision. */
  readonly status: Exclude<UiResumeProposalStatus, 'pending'>
}

/** @brief 状态机封闭的 Resume Proposal / State-machine-closed Resume Proposal. */
export type UiResumeProposal = UiPendingResumeProposal | UiTerminalResumeProposal

/** @brief 带强并发令牌的 Proposal 权威 / Proposal authority carrying a strong concurrency token. */
export interface UiResumeProposalAuthority {
  /** @brief 已读取的完整 Proposal / Complete Proposal representation. */
  readonly proposal: UiResumeProposal
  /** @brief decision 必须原样用于 If-Match 的强 ETag / Strong ETag to replay verbatim as If-Match for a decision. */
  readonly concurrencyToken: UiConcurrencyToken
}

/** @brief Resume Proposal cursor page / Resume Proposal cursor page. */
export type UiResumeProposalPage =
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeProposal[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页不透明 cursor / Opaque cursor for the next page. */
      readonly nextCursor: UiResumeProposalCursor
    }
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeProposal[]
      /** @brief 已到末页 / Whether the terminal page has been reached. */
      readonly hasMore: false
      /** @brief 末页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }

/** @brief 接受全部操作的 decision / Decision accepting every operation. */
export interface UiAcceptAllResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'accept-all'
}

/** @brief 接受一个或多个 operation-ID 组的 decision / Decision accepting one or more operation-ID groups. */
export interface UiAcceptSelectedResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'accept-selected'
  /** @brief 1 至 200 个唯一 operation IDs / One to 200 unique operation IDs. */
  readonly operationIds: readonly UiResumeProposalOperationId[]
}

/** @brief 拒绝全部操作的 decision / Decision rejecting every operation. */
export interface UiRejectResumeProposalDecision {
  /** @brief 固定判别值 / Fixed discriminator. */
  readonly kind: 'reject'
}

/** @brief Schema 封闭的 Proposal decision / Schema-closed Proposal decision. */
export type UiResumeProposalDecision =
  | UiAcceptAllResumeProposalDecision
  | UiAcceptSelectedResumeProposalDecision
  | UiRejectResumeProposalDecision

/** @brief Proposal decision 的安全冲突投影 / Safe conflict projection from a Proposal decision. */
export interface UiResumeProposalConflict {
  /** @brief 冲突 operation identity / Conflicting operation identity. */
  readonly operationId: UiResumeProposalOperationId
  /** @brief 稳定冲突 code / Stable conflict code. */
  readonly code: string
  /** @brief 可选冲突实体 / Optional conflicting entity. */
  readonly entityId: string | null
  /** @brief 可选语义字段路径 / Optional semantic field path. */
  readonly fieldPath: readonly string[]
}

/** @brief Proposal decision 后的权威结果 / Authoritative result after a Proposal decision. */
export interface UiResumeProposalDecisionResult {
  /** @brief decision 后的完整 Resume 与新强 ETag / Complete Resume and new strong ETag after the decision. */
  readonly editor: UiResumeEditorModel
  /** @brief 服务端确认应用的 operation IDs / Operation IDs confirmed as applied by the service. */
  readonly appliedOperationIds: readonly UiResumeProposalOperationId[]
  /** @brief 原子拒绝时的冲突 / Conflicts when application was atomically rejected. */
  readonly conflicts: readonly UiResumeProposalConflict[]
}

/** @brief 一页 revision 历史读取输入 / Input for reading one page of revision history. */
export interface UiResumeRevisionPageRead {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 所属 Resume / Owning Resume. */
  readonly resumeId: UiResumeId
  /** @brief 首页为 null，后续页为服务端 cursor / Null on the first page; server cursor thereafter. */
  readonly cursor: UiResumeRevisionCursor | null
  /** @brief 有界页大小 / Bounded page size. */
  readonly limit: UiResumeReviewPageLimit
  /** @brief 页面身份变化时的取消信号 / Cancellation signal for page-identity changes. */
  readonly signal: AbortSignal
}

/** @brief 一页 Proposal 读取输入 / Input for reading one page of Proposals. */
export interface UiResumeProposalPageRead {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标 Resume / Target Resume. */
  readonly resumeId: UiResumeId
  /** @brief 首页为 null，后续页为服务端 cursor / Null on the first page; server cursor thereafter. */
  readonly cursor: UiResumeProposalCursor | null
  /** @brief 有界页大小 / Bounded page size. */
  readonly limit: UiResumeReviewPageLimit
  /** @brief 页面身份变化时的取消信号 / Cancellation signal for page-identity changes. */
  readonly signal: AbortSignal
}

/** @brief 提交一次 Proposal decision 的冻结命令 / Frozen command for one Proposal decision. */
export interface UiDecideResumeProposalCommand {
  /** @brief 同一用户意图及确认重放中稳定的命令身份 / Command identity stable across one user intent and confirmation replay. */
  readonly commandId: UiCommandId
  /** @brief decision 所依据的完整 pending Proposal / Complete pending Proposal on which the decision is based. */
  readonly proposal: UiPendingResumeProposal
  /** @brief Proposal 表示的强并发令牌 / Strong concurrency token of the Proposal representation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief Schema 封闭的用户决策 / Schema-closed user decision. */
  readonly decision: UiResumeProposalDecision
  /** @brief 当前调用生命周期的取消信号 / Cancellation signal for the current call lifecycle. */
  readonly signal?: AbortSignal
}

/** @brief 启动一次 Resume restore Job 的冻结命令 / Frozen command for starting one Resume restore Job. */
export interface UiStartResumeRestoreInput {
  /** @brief 同一恢复意图及确认重放中稳定的命令身份 / Command identity stable across one restore intent and confirmation replay. */
  readonly commandId: UiCommandId
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 当前 Resume / Current Resume. */
  readonly resumeId: UiResumeId
  /** @brief 当前权威 Resume revision / Current authoritative Resume revision. */
  readonly currentRevision: number
  /** @brief 当前 Resume 表示的强并发令牌 / Strong concurrency token of the current Resume representation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 要恢复的不可变历史 revision / Immutable historical revision to restore. */
  readonly sourceRevision: number
  /** @brief 当前调用生命周期的取消信号 / Cancellation signal for the current call lifecycle. */
  readonly signal?: AbortSignal
}
