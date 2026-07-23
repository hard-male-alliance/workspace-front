/** @file Resume 的内存 adapter / In-memory adapter for Resume. */

import type { ResumeGateway } from '../../application/gateway'
import type {
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from '../../application/resume-creation'
import type { ResumeReviewPort } from '../../application/review'
import { ResumeSnapshotConflictError } from '../../application/errors'
import { ResumeMutationLane } from '../../application/mutation-lane'
import type {
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiResumeTemplateStyleCommand,
  UiTemplateManifest,
  UiStartResumeRenderInput
} from '../../domain/models'
import { asUiResumeCursor } from '../../domain/models'
import type {
  UiResumeDocument,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeItem,
  UiResumeSection,
  UiTemplateReference
} from '../../domain/document'
import { assertResumeMatchesTemplateManifest } from '../../domain/template-policy'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  asUiResumeTemplateCursor,
  type UiCreateResumeFromTemplateCommand,
  type UiCreatedResume,
  type UiResumeTemplatePage,
  type UiResumeTemplatePageRead
} from '../../domain/creation'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import { asUiConcurrencyToken } from '../../../../shared-kernel/concurrency'
import type { UiConcurrencyToken } from '../../../../shared-kernel/concurrency'
import type { UiCommandId } from '../../../../shared-kernel/command'
import type { UiWorkspaceJobAuthority } from '../../../workspace-operations'
import {
  asUiResumeProposalCursor,
  asUiResumeRevisionCursor,
  groupUiResumeProposalOperations,
  type UiDecideResumeProposalCommand,
  type UiResumeProposal,
  type UiResumeProposalAuthority,
  type UiResumeProposalDecisionResult,
  type UiResumeProposalId,
  type UiResumeProposalOperation,
  type UiResumeProposalOperationId,
  type UiResumeProposalPage,
  type UiResumeProposalPageRead,
  type UiResumeRevision,
  type UiResumeRevisionPage,
  type UiResumeRevisionPageRead,
  type UiStartResumeRestoreInput
} from '../../domain/review'

/** @brief Resume command 内存 adapter 所需的最小 Operations store / Minimal Operations store required by the in-memory Resume-command adapter. */
export interface InMemoryResumeOperationsStore {
  /**
   * @brief 注册一个可由通用 Operations gateway 观察的 Render Job / Register a Render Job observable through a generic Operations gateway.
   * @param input 完整 Render command / Complete Render command.
   * @return 新建或幂等恢复的 Job 权威 / Newly created or idempotently recovered Job authority.
   */
  registerResumeRender(input: UiStartResumeRenderInput): UiWorkspaceJobAuthority

  /**
   * @brief 注册一个可观察且只在 Job 推进时提交的 Restore Job / Register an observable Restore Job committed only when the Job advances.
   * @param input 冻结 restore command 与成功提交回调 / Frozen restore command and successful-commit callback.
   * @return 新建或幂等恢复的 Job 权威 / Newly created or idempotently recovered Job authority.
   */
  registerResumeRestore(
    input: UiStartResumeRestoreInput & {
      readonly complete: () => number
    }
  ): UiWorkspaceJobAuthority
}
import {
  MOCK_RESUME_EDITOR,
  MOCK_RESUME_ID,
  MOCK_RESUME_PROPOSALS,
  MOCK_RESUME_REVISIONS,
  MOCK_RESUME_SUMMARIES,
  MOCK_RESUME_WORKSPACE_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_TEMPLATE_MANIFEST_VERSIONS
} from './data'

/** @brief Resume mutation 必须携带的同一权威快照 / Authority snapshot that every Resume mutation must carry. */
interface ResumeMutationAuthority {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标 Resume / Target Resume. */
  readonly resumeId: UiResumeId
  /** @brief 领域基础 revision / Domain base revision. */
  readonly baseRevision: number
  /** @brief 强 If-Match 令牌 / Strong If-Match token. */
  readonly concurrencyToken: UiConcurrencyToken
}

/** @brief 具备可重放 command identity 的 Resume mutation 权威 / Resume-mutation authority carrying a replayable command identity. */
interface IdempotentResumeMutationAuthority extends ResumeMutationAuthority {
  /** @brief 同一意图与安全重放共享的 command identity / Command identity shared by one intent and its safe replays. */
  readonly commandId: UiCommandId
  /** @brief 可选调用方取消信号 / Optional caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 首次确认结果及其规范请求指纹 / First confirmed result and its canonical request fingerprint. */
interface CachedResumeCommandResult {
  /** @brief 不含 command identity 与运行时 signal 的规范意图指纹 / Canonical intent fingerprint excluding command identity and runtime signal. */
  readonly fingerprint: string
  /** @brief 首次执行确认的完整权威 / Complete authority confirmed by the first execution. */
  readonly result: UiResumeEditorModel
}

/** @brief 首次确认的 Proposal decision 结果与请求指纹 / First confirmed Proposal-decision result and request fingerprint. */
interface CachedResumeProposalDecision {
  /** @brief 不含 signal 与 command identity 的完整冻结意图 / Complete frozen intent excluding signal and command identity. */
  readonly fingerprint: string
  /** @brief 首次确认的原子结果 / First atomically confirmed result. */
  readonly result: UiResumeProposalDecisionResult
}

/** @brief 首次接受的 Restore Job 与冻结请求指纹 / First accepted Restore Job and frozen request fingerprint. */
interface CachedResumeRestoreStart {
  /** @brief 不含 signal 与 command identity 的完整恢复意图 / Complete restore intent excluding signal and command identity. */
  readonly fingerprint: string
  /** @brief 首次 202 接受的 Job 权威 / Job authority first accepted with 202 semantics. */
  readonly result: UiWorkspaceJobAuthority
}

/** @brief Resume 内存 adapter 的组合选项 / Composition options for the in-memory Resume adapter. */
export interface InMemoryResumeGatewayOptions extends InMemoryGatewayOptions {
  /** @brief 与 Workspace Operations adapter 共享的状态 / State shared with the Workspace Operations adapter. */
  readonly operationsStore?: InMemoryResumeOperationsStore
}

/**
 * @brief 递归规范化测试 command 值 / Recursively canonicalize a test-command value.
 * @param value 待规范化值 / Value to canonicalize.
 * @return 对象键已排序且不含 undefined 的 JSON 兼容值 / JSON-compatible value with sorted object keys and no undefined members.
 */
function canonicalizeMemoryCommandValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMemoryCommandValue)
  if (typeof value !== 'object' || value === null) return value
  /** @brief 按键排序后的规范对象 / Canonical object with sorted keys. */
  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    /** @brief 当前原始成员 / Current raw member. */
    const member = (value as Readonly<Record<string, unknown>>)[key]
    if (member !== undefined) normalized[key] = canonicalizeMemoryCommandValue(member)
  }
  return normalized
}

/**
 * @brief 创建与 API v2 幂等请求指纹等价的稳定测试指纹 / Create a stable test fingerprint equivalent to the API v2 idempotent request intent.
 * @param value 不含运行时 signal 的完整意图 / Complete intent without a runtime signal.
 * @return 规范 JSON 指纹 / Canonical JSON fingerprint.
 */
function createMemoryCommandFingerprint(value: unknown): string {
  return JSON.stringify(canonicalizeMemoryCommandValue(value))
}

/**
 * @brief 将实体插到显式同级锚点之后 / Insert an entity after an explicit sibling anchor.
 * @template TValue 带稳定 ID 的实体 / Entity carrying a stable ID.
 * @param values 当前同级实体 / Current sibling entities.
 * @param value 要插入或替换的实体 / Entity to insert or replace.
 * @param afterId null 表示首位，否则为前置同级 ID / Null for first position, otherwise previous-sibling ID.
 * @param readId 读取稳定实体 ID / Read the stable entity ID.
 * @return 不共享数组的最终顺序 / Final order in a non-shared array.
 */
function insertMemoryEntityAfter<TValue>(
  values: readonly TValue[],
  value: TValue,
  afterId: string | null,
  readId: (candidate: TValue) => string
): TValue[] {
  /** @brief 被插入实体的稳定身份 / Stable identity of the inserted entity. */
  const valueId = readId(value)
  if (afterId === valueId) {
    throw new InMemoryGatewayError(
      'memory.conflict',
      'A Mock Proposal cannot anchor an entity after itself.'
    )
  }
  /** @brief 先移除同 ID 旧表示后的同级集合 / Siblings after removing an older representation with the same ID. */
  const remaining = values.filter((candidate) => readId(candidate) !== valueId)
  if (afterId === null) return [value, ...remaining]
  /** @brief 前置同级在移除后集合中的位置 / Position of the previous sibling after removal. */
  const anchorIndex = remaining.findIndex((candidate) => readId(candidate) === afterId)
  if (anchorIndex < 0) return throwMemoryNotFound('proposal operation anchor')
  return [...remaining.slice(0, anchorIndex + 1), value, ...remaining.slice(anchorIndex + 1)]
}

/**
 * @brief 应用内存 fixture 明确定义的一条语义字段路径 / Apply one semantic field path explicitly defined by the memory fixtures.
 * @param document 可变的独立 Resume 副本 / Mutable independent Resume copy.
 * @param operation set-field operation / set-field 操作.
 * @note field_path 是 API v2 开放语义 code，不是 UI 对象属性路径；未知组合必须失败关闭。 / field_path is an open API v2 semantic code, not a UI-object property path; unknown combinations fail closed.
 */
function applyMemorySetField(
  document: UiResumeDocument,
  operation: Extract<UiResumeProposalOperation, { readonly kind: 'set-field' }>
): void {
  if (
    operation.entityId === document.id &&
    operation.fieldPath.length === 1 &&
    operation.fieldPath[0] === 'title' &&
    typeof operation.value === 'string'
  ) {
    ;(document as unknown as { title: string }).title = operation.value
    return
  }
  if (
    operation.entityId === document.id &&
    operation.fieldPath.length === 2 &&
    operation.fieldPath[0] === 'profile' &&
    operation.fieldPath[1] === 'headline' &&
    (typeof operation.value === 'string' || operation.value === null)
  ) {
    ;(
      document.profile as unknown as {
        headline: string | null
      }
    ).headline = operation.value
    return
  }
  if (operation.fieldPath.length === 1 && operation.fieldPath[0] === 'summary') {
    for (const section of document.sections) {
      /** @brief operation 指向的条目 / Item targeted by the operation. */
      const item = section.items.find((candidate) => candidate.id === operation.entityId)
      if (item === undefined) continue
      /** @brief 非 null RichText 候选的只读成员视图 / Read-only member view of a non-null RichText candidate. */
      const richTextCandidate =
        typeof operation.value === 'object' &&
        operation.value !== null &&
        !Array.isArray(operation.value)
          ? (operation.value as Readonly<Record<string, unknown>>)
          : null
      if (
        operation.value !== null &&
        (richTextCandidate === null ||
          typeof richTextCandidate.text !== 'string' ||
          !Array.isArray(richTextCandidate.marks))
      ) {
        throw new InMemoryGatewayError(
          'memory.conflict',
          'The Mock item-summary operation carries an invalid RichText value.'
        )
      }
      ;(
        item as unknown as {
          summary: UiResumeItem['summary']
        }
      ).summary = cloneMemoryValue(operation.value) as UiResumeItem['summary']
      return
    }
  }
  throw new InMemoryGatewayError(
    'memory.conflict',
    'The Mock Proposal uses an unsupported semantic set-field path.'
  )
}

/**
 * @brief 原子计算 Proposal 操作后的 Resume 文档 / Atomically calculate a Resume document after Proposal operations.
 * @param source 当前完整 Resume / Current complete Resume.
 * @param operations 同一 decision 选中的完整 operation-ID 组 / Complete operation-ID groups selected by one decision.
 * @return 尚未推进 revision 的独立最终文档 / Independent final document whose revision has not yet advanced.
 */
function applyMemoryProposalOperations(
  source: UiResumeDocument,
  operations: readonly UiResumeProposalOperation[]
): UiResumeDocument {
  /** @brief 所有变更都只发生在此独立候选上 / Independent candidate that exclusively receives every change. */
  const candidate = cloneMemoryValue(source)
  for (const operation of operations) {
    switch (operation.kind) {
      case 'set-field':
        applyMemorySetField(candidate, operation)
        break
      case 'upsert-section':
        ;(candidate as unknown as { sections: UiResumeSection[] }).sections =
          insertMemoryEntityAfter(
            candidate.sections,
            cloneMemoryValue(operation.section),
            operation.afterSectionId,
            (section) => section.id
          )
        break
      case 'upsert-item': {
        /** @brief 去除同 ID 旧条目后的所有 section / All sections after removing an older item with the same ID. */
        const withoutExisting = candidate.sections.map((section): UiResumeSection => ({
          ...section,
          items: section.items.filter((item) => item.id !== operation.item.id)
        }))
        /** @brief 目标 section / Target section. */
        const target = withoutExisting.find((section) => section.id === operation.sectionId)
        if (target === undefined) return throwMemoryNotFound('proposal target section')
        ;(candidate as unknown as { sections: UiResumeSection[] }).sections = withoutExisting.map(
          (section) =>
            section.id === operation.sectionId
              ? {
                  ...section,
                  items: insertMemoryEntityAfter(
                    section.items,
                    cloneMemoryValue(operation.item),
                    operation.afterItemId,
                    (item) => item.id
                  )
                }
              : section
        )
        break
      }
      case 'remove-entity':
        if (operation.entityKind === 'section') {
          /** @brief 删除后的 section 集合 / Sections after deletion. */
          const sections = candidate.sections.filter((section) => section.id !== operation.entityId)
          if (sections.length === candidate.sections.length)
            return throwMemoryNotFound('proposal section')
          ;(candidate as unknown as { sections: UiResumeSection[] }).sections = sections
          ;(
            candidate.styleIntent as unknown as {
              sectionLayout: UiResumeDocument['styleIntent']['sectionLayout']
            }
          ).sectionLayout = candidate.styleIntent.sectionLayout.filter(
            (layout) => layout.sectionId !== operation.entityId
          )
        } else {
          /** @brief 删除前条目总数 / Total item count before deletion. */
          const before = candidate.sections.reduce(
            (total, section) => total + section.items.length,
            0
          )
          /** @brief 删除后的 sections / Sections after item deletion. */
          const sections = candidate.sections.map((section): UiResumeSection => ({
            ...section,
            items: section.items.filter((item) => item.id !== operation.entityId)
          }))
          if (sections.reduce((total, section) => total + section.items.length, 0) === before) {
            return throwMemoryNotFound('proposal item')
          }
          ;(candidate as unknown as { sections: UiResumeSection[] }).sections = sections
        }
        break
      case 'move-entity':
        if (operation.entityKind === 'section') {
          if (operation.parentId !== null) {
            throw new InMemoryGatewayError(
              'memory.conflict',
              'A Mock top-level Resume section cannot have a parent.'
            )
          }
          /** @brief 被移动的 section / Section being moved. */
          const section = candidate.sections.find((item) => item.id === operation.entityId)
          if (section === undefined) return throwMemoryNotFound('proposal section')
          ;(candidate as unknown as { sections: UiResumeSection[] }).sections =
            insertMemoryEntityAfter(
              candidate.sections,
              section,
              operation.afterId,
              (item) => item.id
            )
        } else {
          if (operation.parentId === null) return throwMemoryNotFound('proposal target section')
          /** @brief 被移动的条目 / Item being moved. */
          let moved: UiResumeItem | undefined
          for (const section of candidate.sections) {
            moved ??= section.items.find((item) => item.id === operation.entityId)
          }
          if (moved === undefined) return throwMemoryNotFound('proposal item')
          /** @brief 移除旧位置后的 sections / Sections after removing the old position. */
          const withoutMoved = candidate.sections.map((section): UiResumeSection => ({
            ...section,
            items: section.items.filter((item) => item.id !== operation.entityId)
          }))
          if (!withoutMoved.some((section) => section.id === operation.parentId)) {
            return throwMemoryNotFound('proposal target section')
          }
          ;(candidate as unknown as { sections: UiResumeSection[] }).sections = withoutMoved.map(
            (section) =>
              section.id === operation.parentId
                ? {
                    ...section,
                    items: insertMemoryEntityAfter(
                      section.items,
                      moved,
                      operation.afterId,
                      (item) => item.id
                    )
                  }
                : section
          )
        }
        break
      case 'set-template':
        ;(candidate as unknown as { template: UiTemplateReference }).template = cloneMemoryValue(
          operation.template
        )
        ;(
          candidate.styleIntent as unknown as {
            templateSettings: Readonly<Record<string, unknown>>
          }
        ).templateSettings = cloneMemoryValue(operation.settings)
        break
    }
  }
  /** @brief 最终固定模板的精确 manifest / Exact manifest pinned by the final candidate. */
  const manifest = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
    (template) =>
      template.id === candidate.template.templateId &&
      template.version === candidate.template.templateVersion
  )
  if (manifest === undefined) return throwMemoryNotFound('resume template')
  assertResumeMatchesTemplateManifest(candidate, manifest)
  return candidate
}

/**
 * @brief Resume 自动化测试内存适配器 / In-memory adapter for automated Resume tests.
 * @note 仅从测试入口导出，不能代替 ResumeOperationBatch 或 Render Job 契约。 / Exported only from the testing entry point and cannot substitute for ResumeOperationBatch or Render Job contracts.
 */
export class InMemoryResumeGateway
  implements ResumeGateway, ResumeCreationPort, ResumeReviewPort, ResumeTemplateCatalogPort
{
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
  /** @brief 当前实例内的简历编辑器投影 / Resume-editor projection owned by this instance. */
  private editor: UiResumeEditorModel

  /** @brief 当前实例拥有的不可变 revision 历史 / Immutable revision history owned by this instance. */
  private readonly revisions: UiResumeRevision[]

  /** @brief 当前实例拥有的 Proposal 生命周期状态 / Proposal lifecycle state owned by this instance. */
  private readonly proposals: UiResumeProposal[]

  /** @brief 独立于领域 revision 的 Mock ETag 单调序号 / Mock ETag sequence independent of the domain revision. */
  private concurrencySequence = 0

  /** @brief 测试 adapter 中按聚合隔离的写通道 / Aggregate-scoped mutation lane in the test adapter. */
  private readonly mutationLane = new ResumeMutationLane()

  /** @brief 与 Workspace Operations adapter 共享的 Job/Artifact 状态 / Job and Artifact state shared with the Workspace Operations adapter. */
  private readonly operationsStore: InMemoryResumeOperationsStore | null

  /** @brief 按创建意图保存的幂等测试结果 / Idempotent test results stored by creation intent. */
  private readonly createdResumes = new Map<string, UiCreatedResume>()

  /** @brief 创建意图到规范输入的测试指纹 / Test fingerprints from creation intents to canonical inputs. */
  private readonly creationFingerprints = new Map<string, string>()

  /** @brief 按 Resume 与 command identity 保存的首次 operation 结果 / First operation results cached by Resume and command identity. */
  private readonly resumeCommandResults = new Map<string, CachedResumeCommandResult>()

  /** @brief Proposal 当前强 ETag，独立于领域 revision / Current strong ETags for Proposals, independent of domain revisions. */
  private readonly proposalConcurrencyTokens = new Map<UiResumeProposalId, UiConcurrencyToken>()

  /** @brief Proposal decision 的首次确认结果 / First confirmed results of Proposal decisions. */
  private readonly proposalDecisionResults = new Map<string, CachedResumeProposalDecision>()

  /** @brief Restore Job 创建意图的首次接受结果 / First accepted results of Restore-Job creation intents. */
  private readonly restoreStartResults = new Map<string, CachedResumeRestoreStart>()

  /**
   * @brief 构造 Resume 内存测试网关 / Construct the Resume in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryResumeGatewayOptions = {}) {
    this.options = options
    this.operationsStore = options.operationsStore ?? null
    this.editor = cloneMemoryValue(MOCK_RESUME_EDITOR)
    this.revisions = [...cloneMemoryValue(MOCK_RESUME_REVISIONS)]
    this.proposals = [...cloneMemoryValue(MOCK_RESUME_PROPOSALS)]
    for (const proposal of this.proposals) {
      this.proposalConcurrencyTokens.set(
        proposal.id,
        asUiConcurrencyToken(`"resume-proposal-${proposal.id}-${proposal.revision}"`)
      )
    }
  }

  /**
   * @brief 读取一页 Mock ResumeSummary / Read one page of Mock Resume summaries.
   * @param input 显式 Workspace、cursor、limit 与取消信号 / Explicit Workspace, cursor, limit, and cancellation signal.
   * @return 符合 API v2 关系约束的 cursor 页 / Cursor page satisfying the API v2 relation constraint.
   */
  async listResumeSummariesPage(input: UiResumeSummaryPageRead): Promise<UiResumeSummaryPage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (mode === 'empty' || input.workspaceId !== MOCK_RESUME_WORKSPACE_ID) {
      return { hasMore: false, items: [], nextCursor: null }
    }

    /** @brief 当前 cursor 对应的起始位置 / Start offset represented by the current cursor. */
    const offset =
      input.cursor === null
        ? 0
        : MOCK_RESUME_SUMMARIES.findIndex(
            (_summary, index) => asUiResumeCursor(`resume_cursor_${index}`) === input.cursor
          )
    if (offset < 0) {
      throw new InMemoryGatewayError('memory.not_found', 'The Mock Resume cursor is not valid.')
    }

    /** @brief 当前页未共享引用的摘要 / Current-page summaries without shared references. */
    const items = cloneMemoryValue(MOCK_RESUME_SUMMARIES.slice(offset, offset + input.limit))
    /** @brief 下一页在固定排序中的起始位置 / Start offset of the next page in the fixed ordering. */
    const nextOffset = offset + items.length
    return nextOffset < MOCK_RESUME_SUMMARIES.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeCursor(`resume_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /**
   * @brief 读取一页 Mock 全局 Template / Read one page of the Mock global Template catalog.
   * @param input cursor、页大小与取消信号 / Cursor, page size, and cancellation signal.
   * @return 保留 cursor 关系的 Template 页 / Template page preserving the cursor relation.
   */
  async listTemplatePage(input: UiResumeTemplatePageRead): Promise<UiResumeTemplatePage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }

    /** @brief 当前 Template cursor 对应的起始位置 / Start offset represented by the current Template cursor. */
    const offset =
      input.cursor === null
        ? 0
        : MOCK_TEMPLATE_MANIFESTS.findIndex(
            (_template, index) =>
              asUiResumeTemplateCursor(`template_cursor_${index}`) === input.cursor
          )
    if (offset < 0) {
      throw new InMemoryGatewayError('memory.not_found', 'The Mock Template cursor is not valid.')
    }

    /** @brief 当前页 Template / Templates in the current page. */
    const items = cloneMemoryValue(MOCK_TEMPLATE_MANIFESTS.slice(offset, offset + input.limit))
    /** @brief 下一页的起始位置 / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < MOCK_TEMPLATE_MANIFESTS.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeTemplateCursor(`template_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /**
   * @brief 读取精确 Mock Template 版本 / Read an exact Mock Template version.
   * @param reference 不可变 Template 引用 / Immutable Template reference.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 精确版本 Template / Exact-version Template.
   */
  async getTemplate(
    reference: UiTemplateReference,
    signal: AbortSignal
  ): Promise<UiTemplateManifest> {
    signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    if (mode === 'empty') return throwMemoryNotFound('resume template')
    /** @brief 由不可变身份命中的 Template / Template matched by immutable identity. */
    const template = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
      (candidate) =>
        candidate.id === reference.templateId && candidate.version === reference.templateVersion
    )
    return template === undefined
      ? throwMemoryNotFound('resume template')
      : cloneMemoryValue(template)
  }

  /**
   * @brief 以幂等测试语义创建 Mock Resume / Create a Mock Resume with idempotent test semantics.
   * @param command 已由应用用例验证的创建命令 / Creation command validated by the application use case.
   * @return 与强 ETag 配对的 Mock Resume / Mock Resume paired with a strong ETag.
   */
  async createResume(command: UiCreateResumeFromTemplateCommand): Promise<UiCreatedResume> {
    command.signal.throwIfAborted()
    await prepareMemoryRead(this.options)
    command.signal.throwIfAborted()
    /** @brief 在闭包外完成判别联合收窄的克隆来源 / Clone source narrowed outside callback boundaries. */
    const cloneResumeId = command.source.kind === 'clone' ? command.source.resumeId : null
    if (
      cloneResumeId !== null &&
      cloneResumeId !== MOCK_RESUME_ID &&
      ![...this.createdResumes.values()].some((created) => created.resource.id === cloneResumeId)
    ) {
      return throwMemoryNotFound('source resume')
    }

    /** @brief 不含运行时 signal 的规范创建指纹 / Canonical creation fingerprint without the runtime signal. */
    const fingerprint = JSON.stringify({
      locale: command.locale,
      source: command.source,
      template: command.template,
      title: command.title,
      workspaceId: command.workspaceId
    })
    /** @brief 相同幂等键的既有指纹 / Existing fingerprint for the same idempotency key. */
    const priorFingerprint = this.creationFingerprints.get(command.creationAttemptId)
    if (priorFingerprint !== undefined && priorFingerprint !== fingerprint) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock creation key was reused with a different command.'
      )
    }
    /** @brief 相同创建意图已经生成的结果 / Result already created for the same intent. */
    const priorResult = this.createdResumes.get(command.creationAttemptId)
    if (priorResult !== undefined) return cloneMemoryValue(priorResult)

    /** @brief 新建结果的单调测试序号 / Monotonic test sequence for the created result. */
    const sequence = this.createdResumes.size + 1
    /** @brief 首次创建并缓存的权威测试结果 / Authoritative test result created and cached once. */
    const result: UiCreatedResume = {
      concurrencyToken: asUiConcurrencyToken(`"resume-created-${sequence}"`),
      resource: {
        createdAt: '2026-07-23T00:00:00.000Z',
        id: asUiOpaqueId<'resume'>(`res_created_${sequence}`),
        locale: command.locale,
        revision: 1,
        template: command.template,
        title: command.title,
        updatedAt: '2026-07-23T00:00:00.000Z',
        workspaceId: command.workspaceId
      }
    }
    this.creationFingerprints.set(command.creationAttemptId, fingerprint)
    this.createdResumes.set(command.creationAttemptId, cloneMemoryValue(result))
    return cloneMemoryValue(result)
  }

  /**
   * @brief 获取 Mock 三栏简历编辑器 / Get the Mock three-pane resume editor.
   * @param workspaceId 授权路径所属 Workspace / Workspace owning the authorization path.
   * @param resumeId 简历 ID / Resume ID.
   * @param signal 资源身份变化或页面卸载时触发的取消信号 / Cancellation signal triggered when resource identity changes or the page unmounts.
   * @return Mock 编辑器数据 / Mock editor data.
   */
  async getResumeEditor(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    signal: AbortSignal
  ): Promise<UiResumeEditorModel> {
    signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    if (
      mode === 'empty' ||
      resumeId !== MOCK_RESUME_ID ||
      workspaceId !== MOCK_RESUME_WORKSPACE_ID
    ) {
      return throwMemoryNotFound('resume editor')
    }

    return cloneMemoryValue(this.editor)
  }

  /** @inheritdoc */
  async listResumeRevisionPage(input: UiResumeRevisionPageRead): Promise<UiResumeRevisionPage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (
      mode === 'empty' ||
      input.workspaceId !== MOCK_RESUME_WORKSPACE_ID ||
      input.resumeId !== MOCK_RESUME_ID
    ) {
      return { hasMore: false, items: [], nextCursor: null }
    }
    /** @brief cursor 所表示的历史起始位置 / History offset represented by the cursor. */
    let offset = input.cursor === null ? 0 : -1
    if (input.cursor !== null) {
      for (let candidate = 0; candidate < this.revisions.length; candidate += 1) {
        if (asUiResumeRevisionCursor(`resume_revision_cursor_${candidate}`) === input.cursor) {
          offset = candidate
          break
        }
      }
    }
    if (offset < 0) {
      throw new InMemoryGatewayError(
        'memory.not_found',
        'The Mock Resume revision cursor is not valid.'
      )
    }
    /** @brief 当前页不可变 revision 摘要 / Immutable revision summaries on the current page. */
    const items = this.revisions.slice(offset, offset + input.limit).map((revision) => ({
      createdAt: revision.createdAt,
      createdBy: cloneMemoryValue(revision.createdBy),
      resumeId: revision.resumeId,
      revision: revision.revision
    }))
    /** @brief 下一页起点 / Next-page offset. */
    const nextOffset = offset + items.length
    return nextOffset < this.revisions.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeRevisionCursor(`resume_revision_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async getResumeRevision(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    revision: number,
    signal: AbortSignal
  ): Promise<UiResumeRevision> {
    signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    if (
      mode === 'empty' ||
      workspaceId !== MOCK_RESUME_WORKSPACE_ID ||
      resumeId !== MOCK_RESUME_ID ||
      !Number.isSafeInteger(revision) ||
      revision < 1
    ) {
      return throwMemoryNotFound('resume revision')
    }
    /** @brief 精确命中的不可变历史表示 / Exact immutable historical representation. */
    const found = this.revisions.find((candidate) => candidate.revision === revision)
    return found === undefined ? throwMemoryNotFound('resume revision') : cloneMemoryValue(found)
  }

  /** @inheritdoc */
  async listResumeProposalPage(input: UiResumeProposalPageRead): Promise<UiResumeProposalPage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (
      mode === 'empty' ||
      input.workspaceId !== MOCK_RESUME_WORKSPACE_ID ||
      input.resumeId !== MOCK_RESUME_ID
    ) {
      return { hasMore: false, items: [], nextCursor: null }
    }
    /** @brief cursor 所表示的 Proposal 起始位置 / Proposal offset represented by the cursor. */
    let offset = input.cursor === null ? 0 : -1
    if (input.cursor !== null) {
      for (let candidate = 0; candidate < this.proposals.length; candidate += 1) {
        if (asUiResumeProposalCursor(`resume_proposal_cursor_${candidate}`) === input.cursor) {
          offset = candidate
          break
        }
      }
    }
    if (offset < 0) {
      throw new InMemoryGatewayError(
        'memory.not_found',
        'The Mock Resume Proposal cursor is not valid.'
      )
    }
    /** @brief 当前页不共享引用的 Proposals / Current-page Proposals sharing no references. */
    const items = cloneMemoryValue(this.proposals.slice(offset, offset + input.limit))
    /** @brief 下一页起点 / Next-page offset. */
    const nextOffset = offset + items.length
    return nextOffset < this.proposals.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeProposalCursor(`resume_proposal_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async getResumeProposal(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId,
    proposalId: UiResumeProposalId,
    signal: AbortSignal
  ): Promise<UiResumeProposalAuthority> {
    signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    if (
      mode === 'empty' ||
      workspaceId !== MOCK_RESUME_WORKSPACE_ID ||
      resumeId !== MOCK_RESUME_ID
    ) {
      return throwMemoryNotFound('resume proposal')
    }
    /** @brief 当前完整 Proposal / Current complete Proposal. */
    const proposal = this.proposals.find((candidate) => candidate.id === proposalId)
    /** @brief 与当前 Proposal 原子配对的强 ETag / Strong ETag atomically paired with the current Proposal. */
    const concurrencyToken = this.proposalConcurrencyTokens.get(proposalId)
    if (proposal === undefined || concurrencyToken === undefined) {
      return throwMemoryNotFound('resume proposal')
    }
    return {
      concurrencyToken,
      proposal: cloneMemoryValue(proposal)
    }
  }

  /** @inheritdoc */
  async decideResumeProposal(
    command: UiDecideResumeProposalCommand
  ): Promise<UiResumeProposalDecisionResult> {
    command.signal?.throwIfAborted()
    return this.mutationLane.run(command.proposal.resumeId, async () => {
      await prepareMemoryRead(this.options)
      command.signal?.throwIfAborted()
      /** @brief 与 canonical Proposal path 绑定的幂等缓存键 / Idempotency cache key bound to the canonical Proposal path. */
      const cacheKey = JSON.stringify([
        command.proposal.workspaceId,
        command.proposal.resumeId,
        command.proposal.id,
        command.commandId
      ])
      /** @brief 冻结命令的规范请求指纹 / Canonical request fingerprint of the frozen command. */
      const fingerprint = createMemoryCommandFingerprint({
        concurrencyToken: command.concurrencyToken,
        decision: command.decision,
        proposal: command.proposal
      })
      /** @brief 同一 command identity 的首次确认结果 / First confirmed result for the same command identity. */
      const cached = this.proposalDecisionResults.get(cacheKey)
      if (cached !== undefined) {
        if (cached.fingerprint !== fingerprint) {
          throw new InMemoryGatewayError(
            'memory.idempotency_key_reused',
            'The Mock Proposal decision key was reused with a different intent.'
          )
        }
        return cloneMemoryValue(cached.result)
      }
      if (
        command.proposal.workspaceId !== MOCK_RESUME_WORKSPACE_ID ||
        command.proposal.resumeId !== MOCK_RESUME_ID
      ) {
        return throwMemoryNotFound('resume proposal')
      }
      /** @brief 当前 Proposal 的数组位置 / Array index of the current Proposal. */
      const proposalIndex = this.proposals.findIndex(
        (candidate) => candidate.id === command.proposal.id
      )
      /** @brief 当前权威 Proposal / Current authoritative Proposal. */
      const current = this.proposals[proposalIndex]
      /** @brief 当前 Proposal ETag / Current Proposal ETag. */
      const currentToken = this.proposalConcurrencyTokens.get(command.proposal.id)
      if (current === undefined || currentToken === undefined) {
        return throwMemoryNotFound('resume proposal')
      }
      if (
        current.status !== 'pending' ||
        currentToken !== command.concurrencyToken ||
        createMemoryCommandFingerprint(current) !== createMemoryCommandFingerprint(command.proposal)
      ) {
        throw new InMemoryGatewayError(
          'memory.conflict',
          'The Mock Proposal decision is based on a stale representation.'
        )
      }
      /** @brief Proposal 操作按 API v2 operation ID 形成的不可拆分组 / Indivisible Proposal operation groups by API v2 operation ID. */
      const groups = groupUiResumeProposalOperations(current.operations)
      /** @brief decision 选择的唯一 operation IDs / Unique operation IDs selected by the decision. */
      let selectedIds: readonly UiResumeProposalOperationId[]
      switch (command.decision.kind) {
        case 'reject':
          selectedIds = []
          break
        case 'accept-all':
          selectedIds = groups.map((group) => group.operationId)
          break
        case 'accept-selected':
          if (
            command.decision.operationIds.length < 1 ||
            command.decision.operationIds.length > 200 ||
            new Set(command.decision.operationIds).size !== command.decision.operationIds.length ||
            command.decision.operationIds.some(
              (operationId) => !groups.some((group) => group.operationId === operationId)
            )
          ) {
            throw new InMemoryGatewayError(
              'memory.conflict',
              'The Mock selective Proposal decision contains an invalid operation-ID group.'
            )
          }
          selectedIds = [...command.decision.operationIds]
          break
      }
      /** @brief reject 只推进 Proposal，不改 Resume 表示或 ETag / A rejection advances only the Proposal, not the Resume representation or ETag. */
      if (command.decision.kind === 'reject') {
        /** @brief reject 后的终态 Proposal / Terminal Proposal after rejection. */
        const rejected: UiResumeProposal = {
          ...current,
          revision: current.revision + 1,
          status: 'rejected',
          updatedAt: '2026-07-18T00:01:00.000Z'
        }
        /** @brief reject 的权威结果 / Authoritative rejection result. */
        const result: UiResumeProposalDecisionResult = {
          appliedOperationIds: [],
          conflicts: [],
          editor: cloneMemoryValue(this.editor)
        }
        this.proposals[proposalIndex] = rejected
        this.proposalConcurrencyTokens.set(
          rejected.id,
          asUiConcurrencyToken(`"resume-proposal-${rejected.id}-${rejected.revision}"`)
        )
        this.proposalDecisionResults.set(cacheKey, {
          fingerprint,
          result: cloneMemoryValue(result)
        })
        return result
      }
      if (this.editor.resume.revision !== current.baseRevision) {
        /** @brief 原子拒绝且不改变 Proposal 状态的冲突结果 / Atomic conflict result that leaves Proposal state unchanged. */
        const result: UiResumeProposalDecisionResult = {
          appliedOperationIds: [],
          conflicts: selectedIds.map((operationId) => ({
            code: 'resume.base_revision_conflict',
            entityId: null,
            fieldPath: [],
            operationId
          })),
          editor: cloneMemoryValue(this.editor)
        }
        this.proposalDecisionResults.set(cacheKey, {
          fingerprint,
          result: cloneMemoryValue(result)
        })
        return result
      }
      /** @brief 选择 ID 对应的全部不可拆分 operations / Every indivisible operation belonging to selected IDs. */
      const selectedOperations = groups
        .filter((group) => selectedIds.includes(group.operationId))
        .flatMap((group) => group.operations)
      /** @brief 在共享状态外完整计算并验证的候选 Resume / Candidate Resume fully calculated and validated before shared-state mutation. */
      const applied = applyMemoryProposalOperations(this.editor.resume, selectedOperations)
      /** @brief decision 后的完整新 Resume / Complete new Resume after the decision. */
      const nextResume: UiResumeDocument = {
        ...applied,
        revision: this.editor.resume.revision + 1,
        updatedAt: '2026-07-18T00:01:00.000Z'
      }
      /** @brief 与新 Resume 原子配对的编辑权威 / Editor authority atomically paired with the new Resume. */
      const nextEditor: UiResumeEditorModel = {
        concurrencyToken: this.nextConcurrencyToken(),
        resume: nextResume
      }
      /** @brief 接受全部或部分组后的终态 Proposal / Terminal Proposal after accepting all or some groups. */
      const decided: UiResumeProposal = {
        ...current,
        revision: current.revision + 1,
        status: selectedIds.length === groups.length ? 'accepted' : 'partially-accepted',
        updatedAt: nextResume.updatedAt
      }
      /** @brief 首次确认的成功结果 / First confirmed successful result. */
      const result: UiResumeProposalDecisionResult = {
        appliedOperationIds: [...selectedIds],
        conflicts: [],
        editor: nextEditor
      }
      this.editor = nextEditor
      this.proposals[proposalIndex] = decided
      this.proposalConcurrencyTokens.set(
        decided.id,
        asUiConcurrencyToken(`"resume-proposal-${decided.id}-${decided.revision}"`)
      )
      this.revisions.unshift({
        createdAt: nextResume.updatedAt,
        createdBy: {
          id: decided.id,
          resourceType: 'resume-proposal',
          revision: decided.revision
        },
        document: cloneMemoryValue(nextResume),
        resumeId: nextResume.id,
        revision: nextResume.revision
      })
      this.proposalDecisionResults.set(cacheKey, {
        fingerprint,
        result: cloneMemoryValue(result)
      })
      return cloneMemoryValue(result)
    })
  }

  /** @inheritdoc */
  async startResumeRestore(input: UiStartResumeRestoreInput): Promise<UiWorkspaceJobAuthority> {
    input.signal?.throwIfAborted()
    await prepareMemoryRead(this.options)
    input.signal?.throwIfAborted()
    if (input.workspaceId !== MOCK_RESUME_WORKSPACE_ID || input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }
    /** @brief 与 canonical restore-jobs path 绑定的缓存键 / Cache key bound to the canonical restore-jobs path. */
    const cacheKey = JSON.stringify([input.workspaceId, input.resumeId, input.commandId])
    /** @brief 冻结 Restore 请求的规范指纹 / Canonical fingerprint of the frozen Restore request. */
    const fingerprint = createMemoryCommandFingerprint({
      concurrencyToken: input.concurrencyToken,
      currentRevision: input.currentRevision,
      resumeId: input.resumeId,
      sourceRevision: input.sourceRevision,
      workspaceId: input.workspaceId
    })
    /** @brief 即使 Restore 已完成仍可确认重放的首次 202 / First 202 result replayable even after Restore completion. */
    const cached = this.restoreStartResults.get(cacheKey)
    if (cached !== undefined) {
      if (cached.fingerprint !== fingerprint) {
        throw new InMemoryGatewayError(
          'memory.idempotency_key_reused',
          'The Mock Restore command key was reused with a different intent.'
        )
      }
      return cloneMemoryValue(cached.result)
    }
    this.assertMutationAuthority({
      baseRevision: input.currentRevision,
      concurrencyToken: input.concurrencyToken,
      resumeId: input.resumeId,
      workspaceId: input.workspaceId
    })
    /** @brief 要恢复的完整不可变历史 SIR / Complete immutable historical SIR to restore. */
    const source = this.revisions.find((revision) => revision.revision === input.sourceRevision)
    if (source === undefined) return throwMemoryNotFound('resume revision')
    if (this.operationsStore === null) {
      throw new InMemoryGatewayError(
        'memory.unavailable',
        'The Mock Resume adapter requires a shared Workspace Operations store for Restore commands.'
      )
    }
    /** @brief 首次接受并可由通用 Operations 观察的 Job / Job accepted once and observable through generic Operations. */
    const result = cloneMemoryValue(
      this.operationsStore.registerResumeRestore({
        ...input,
        complete: (): number => this.completeResumeRestore(input, source)
      })
    )
    this.restoreStartResults.set(cacheKey, {
      fingerprint,
      result: cloneMemoryValue(result)
    })
    return result
  }

  /**
   * @brief 幂等启动一个 Mock Resume Render Job / Idempotently start one Mock Resume Render Job.
   * @param input 完整 Render 意图 / Complete Render intent.
   * @return 可由共享 Workspace Operations store 继续观察的 Job 权威 / Job authority observable through the shared Workspace Operations store.
   */
  async startResumeRender(input: UiStartResumeRenderInput): Promise<UiWorkspaceJobAuthority> {
    await prepareMemoryRead(this.options)
    input.signal?.throwIfAborted()
    if (input.resumeId !== MOCK_RESUME_ID || input.workspaceId !== MOCK_RESUME_WORKSPACE_ID) {
      return throwMemoryNotFound('resume editor')
    }
    if (
      !Number.isSafeInteger(input.resumeRevision) ||
      input.resumeRevision < 1 ||
      input.formats.length < 1 ||
      input.formats.length > 3 ||
      new Set(input.formats).size !== input.formats.length
    ) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock Resume Render request violates the API v2 payload invariants.'
      )
    }
    if (this.operationsStore === null) {
      throw new InMemoryGatewayError(
        'memory.unavailable',
        'The Mock Resume adapter requires a shared Workspace Operations store for Render commands.'
      )
    }
    return cloneMemoryValue(this.operationsStore.registerResumeRender(input))
  }

  /**
   * @brief 更新测试简历板块 / Update a test resume section.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器 / Latest editor.
   */
  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    return this.runIdempotentResumeCommand(
      input,
      input.signal,
      createMemoryCommandFingerprint({
        authority: {
          baseRevision: input.baseRevision,
          concurrencyToken: input.concurrencyToken,
          resumeId: input.resumeId,
          workspaceId: input.workspaceId
        },
        content: input.content,
        kind: 'section-update',
        sectionId: input.sectionId,
        title: input.title
      }),
      (): UiResumeEditorModel => {
        const sectionExists = this.editor.resume.sections.some(
          (section) => section.id === input.sectionId
        )
        if (!sectionExists) {
          return throwMemoryNotFound('resume section')
        }

        this.editor = {
          concurrencyToken: this.nextConcurrencyToken(),
          resume: {
            ...this.editor.resume,
            revision: this.editor.resume.revision + 1,
            sections: this.editor.resume.sections.map((section) =>
              section.id === input.sectionId
                ? {
                    ...section,
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.content === undefined
                      ? {}
                      : { content: cloneMemoryValue(input.content) })
                  }
                : section
            ),
            updatedAt: '2026-07-18T00:00:01.000Z'
          }
        }
        return this.editor
      }
    )
  }

  /** @brief 调整 Mock 简历板块顺序 / Reorder Mock resume sections. */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    return this.runIdempotentResumeCommand(
      input,
      input.signal,
      createMemoryCommandFingerprint({
        authority: {
          baseRevision: input.baseRevision,
          concurrencyToken: input.concurrencyToken,
          resumeId: input.resumeId,
          workspaceId: input.workspaceId
        },
        kind: 'section-reorder',
        orderedSectionIds: input.orderedSectionIds
      }),
      (): UiResumeEditorModel => {
        const sectionById = new Map(
          this.editor.resume.sections.map((section) => [section.id, section])
        )
        const reorderedSections = input.orderedSectionIds.map((sectionId) =>
          sectionById.get(sectionId)
        )
        if (
          reorderedSections.length !== this.editor.resume.sections.length ||
          new Set(input.orderedSectionIds).size !== this.editor.resume.sections.length ||
          reorderedSections.some((section) => section === undefined)
        ) {
          throw new InMemoryGatewayError('memory.conflict', 'The Mock section order is incomplete.')
        }

        this.editor = {
          concurrencyToken: this.nextConcurrencyToken(),
          resume: {
            ...this.editor.resume,
            revision: this.editor.resume.revision + 1,
            sections: reorderedSections.filter((section) => section !== undefined),
            updatedAt: '2026-07-18T00:00:02.000Z'
          }
        }
        return this.editor
      }
    )
  }

  /** @brief 删除 Mock 简历板块 / Delete a Mock resume section. */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    return this.runIdempotentResumeCommand(
      input,
      input.signal,
      createMemoryCommandFingerprint({
        authority: {
          baseRevision: input.baseRevision,
          concurrencyToken: input.concurrencyToken,
          resumeId: input.resumeId,
          workspaceId: input.workspaceId
        },
        kind: 'section-delete',
        sectionId: input.sectionId
      }),
      (): UiResumeEditorModel => {
        const remainingSections = this.editor.resume.sections.filter(
          (section) => section.id !== input.sectionId
        )
        if (remainingSections.length === this.editor.resume.sections.length) {
          return throwMemoryNotFound('resume section')
        }

        this.editor = {
          concurrencyToken: this.nextConcurrencyToken(),
          resume: {
            ...this.editor.resume,
            revision: this.editor.resume.revision + 1,
            sections: remainingSections,
            styleIntent: {
              ...this.editor.resume.styleIntent,
              sectionLayout: this.editor.resume.styleIntent.sectionLayout.filter(
                (layout) => layout.sectionId !== input.sectionId
              )
            },
            updatedAt: '2026-07-18T00:00:03.000Z'
          }
        }
        return this.editor
      }
    )
  }

  /**
   * @brief 在测试 adapter 中原子选择模板并保存样式 / Atomically select a Template and save style in the testing adapter.
   * @param command 可原样重放的模板样式命令 / Template-style command safe to replay verbatim.
   * @param signal 当前调用生命周期的取消信号 / Cancellation signal for the current call lifecycle.
   * @return 新的完整 Resume 权威 / New complete Resume authority.
   */
  async updateResumeTemplateAndStyle(
    command: UiResumeTemplateStyleCommand,
    signal?: AbortSignal
  ): Promise<UiResumeEditorModel> {
    return this.runIdempotentResumeCommand(
      command,
      signal,
      createMemoryCommandFingerprint({
        authority: {
          baseRevision: command.baseRevision,
          concurrencyToken: command.concurrencyToken,
          resumeId: command.resumeId,
          workspaceId: command.workspaceId
        },
        kind: 'template-style',
        styleIntent: command.styleIntent,
        targetTemplate: command.targetTemplate
      }),
      (): UiResumeEditorModel => {
        /** @brief 由精确不可变身份命中的目标模板 / Target Template matched by exact immutable identity. */
        const template = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
          (item) =>
            item.id === command.targetTemplate.templateId &&
            item.version === command.targetTemplate.templateVersion
        )
        if (template === undefined) return throwMemoryNotFound('resume template')
        /** @brief mutation 前构造并验证的完整最终 Resume / Complete final Resume constructed and validated before mutation. */
        const nextResume = {
          ...this.editor.resume,
          revision: this.editor.resume.revision + 1,
          styleIntent: cloneMemoryValue(command.styleIntent),
          template: cloneMemoryValue(command.targetTemplate),
          updatedAt: '2026-07-18T00:00:05.000Z'
        }
        assertResumeMatchesTemplateManifest(nextResume, template)
        this.editor = {
          concurrencyToken: this.nextConcurrencyToken(),
          resume: nextResume
        }
        return this.editor
      }
    )
  }

  /**
   * @brief 在 Restore Job 成功阶段原子提交历史 SIR / Atomically commit a historical SIR when a Restore Job succeeds.
   * @param input Job 接受时冻结的当前权威 / Current authority frozen when the Job was accepted.
   * @param source 要恢复的不可变历史 revision / Immutable historical revision to restore.
   * @return 新创建的当前 Resume revision / Newly created current Resume revision.
   */
  private completeResumeRestore(
    input: UiStartResumeRestoreInput,
    source: UiResumeRevision
  ): number {
    this.assertMutationAuthority({
      baseRevision: input.currentRevision,
      concurrencyToken: input.concurrencyToken,
      resumeId: input.resumeId,
      workspaceId: input.workspaceId
    })
    /** @brief 恢复创建的新 revision，而不是重用历史 revision / New revision created by restore rather than reusing the historical revision. */
    const restoredResume: UiResumeDocument = {
      ...cloneMemoryValue(source.document),
      revision: this.editor.resume.revision + 1,
      updatedAt: '2026-07-18T00:02:00.000Z'
    }
    /** @brief 恢复后固定模板的精确 manifest / Exact pinned Template manifest after restore. */
    const manifest = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
      (template) =>
        template.id === restoredResume.template.templateId &&
        template.version === restoredResume.template.templateVersion
    )
    if (manifest === undefined) return throwMemoryNotFound('resume template')
    assertResumeMatchesTemplateManifest(restoredResume, manifest)
    /** @brief 与恢复结果原子配对的新编辑权威 / New editor authority atomically paired with the restored result. */
    const restoredEditor: UiResumeEditorModel = {
      concurrencyToken: this.nextConcurrencyToken(),
      resume: restoredResume
    }
    this.editor = restoredEditor
    this.revisions.unshift({
      createdAt: restoredResume.updatedAt,
      createdBy: {
        id: restoredResume.id,
        resourceType: 'resume',
        revision: source.revision
      },
      document: cloneMemoryValue(restoredResume),
      resumeId: restoredResume.id,
      revision: restoredResume.revision
    })
    return restoredResume.revision
  }

  /**
   * @brief 执行带 API v2 重放语义的 section command / Execute a section command with API v2 replay semantics.
   * @param authority 完整授权、并发与 command identity / Complete authorization, concurrency, and command identity.
   * @param fingerprint 不含 signal 的规范请求指纹 / Canonical request fingerprint excluding signal.
   * @param mutation 首次执行时应用的原子领域 mutation / Atomic domain mutation applied on first execution.
   * @return 首次结果或其不共享引用的幂等重放 / First result or an idempotent replay sharing no references.
   */
  private async runIdempotentResumeCommand(
    authority: IdempotentResumeMutationAuthority,
    signal: AbortSignal | undefined,
    fingerprint: string,
    mutation: () => UiResumeEditorModel
  ): Promise<UiResumeEditorModel> {
    signal?.throwIfAborted()
    return this.mutationLane.run(authority.resumeId, async () => {
      await prepareMemoryRead(this.options)
      signal?.throwIfAborted()
      /** @brief Resume 与 command identity 的无歧义缓存键 / Unambiguous cache key for Resume and command identity. */
      const cacheKey = JSON.stringify([authority.resumeId, authority.commandId])
      /** @brief 同一 key 的首次确认记录 / First confirmed record for the same key. */
      const cached = this.resumeCommandResults.get(cacheKey)
      if (cached !== undefined) {
        if (cached.fingerprint !== fingerprint) {
          throw new InMemoryGatewayError(
            'memory.idempotency_key_reused',
            'The Mock Resume command key was reused with a different intent.'
          )
        }
        return cloneMemoryValue(cached.result)
      }

      this.assertMutationAuthority(authority)
      /** @brief mutation 前的领域 revision / Domain revision before the mutation. */
      const previousRevision = this.editor.resume.revision
      /** @brief 首次执行产生的新权威 / New authority produced by the first execution. */
      const result = cloneMemoryValue(mutation())
      if (
        result.resume.revision > previousRevision &&
        !this.revisions.some((revision) => revision.revision === result.resume.revision)
      ) {
        this.revisions.unshift({
          createdAt: result.resume.updatedAt,
          createdBy: {
            id: 'user_mock_klee',
            resourceType: 'user',
            revision: 3
          },
          document: cloneMemoryValue(result.resume),
          resumeId: result.resume.id,
          revision: result.resume.revision
        })
      }
      this.resumeCommandResults.set(cacheKey, {
        fingerprint,
        result: cloneMemoryValue(result)
      })
      return result
    })
  }

  /**
   * @brief 保证 mutation 同时绑定显式租户、资源、revision 与 ETag / Ensure a mutation is bound to its explicit tenant, resource, revision, and ETag.
   * @param authority 调用方读取的完整权威身份 / Complete authority identity read by the caller.
   */
  private assertMutationAuthority(authority: ResumeMutationAuthority): void {
    if (
      authority.workspaceId !== this.editor.resume.workspaceId ||
      authority.resumeId !== this.editor.resume.id
    ) {
      return throwMemoryNotFound('resume editor')
    }
    if (
      authority.baseRevision !== this.editor.resume.revision ||
      authority.concurrencyToken !== this.editor.concurrencyToken
    ) {
      throw new ResumeSnapshotConflictError()
    }
  }

  /**
   * @brief 为一次成功写入生成新的 opaque 强 ETag / Generate a new opaque strong ETag for one successful write.
   * @return 不从领域 revision 推导的强并发令牌 / Strong concurrency token not derived from the domain revision.
   */
  private nextConcurrencyToken(): UiConcurrencyToken {
    this.concurrencySequence += 1
    return asUiConcurrencyToken(`"resume-memory-write-${this.concurrencySequence}"`)
  }
}
