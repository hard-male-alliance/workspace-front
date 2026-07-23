import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  GripVertical,
  History,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { useUnsavedChanges } from '../../../app/UnsavedChanges'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId, type UiCommandId } from '../../../shared-kernel/command'
import { nextDeadlineTimerDelayMilliseconds } from '../../../shared-kernel/polling'
import {
  getResumeBatchConflict,
  getResumeCommandRetryAfterMilliseconds,
  getResumeConflictStatus,
  getResumeIdempotencyConflict,
  isResumeCommandDefinitivelyRejected,
  isResumeUnreplayableContractResponse,
  ResumeBatchConflictError,
  type ResumeConflictStatus
} from '../application/errors'
import type { ResumeGateway } from '../application/gateway'
import type { ResumeTemplateCatalogPort } from '../application/resume-creation'
import { loadPinnedResumeTemplate } from '../application/template-catalog'
import {
  getUiResumeSectionTextViolation,
  replaceUiResumeRichTextText,
  type UiResumeEditorModel,
  type UiResumeSection,
  type UiResumeSectionId
} from '../domain/document'
import type {
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiTemplateManifest
} from '../domain/models'
import { ResumePreviewPanel } from './ResumePreviewPanel'
import { selectResumePlainText } from './resume-document-selectors'

/** @brief 桌面简历工作台窗口 / Desktop resume-workspace pane. */
type ResumePane = 'assistant' | 'editor' | 'preview'

/** @brief 紧凑布局当前窗口 / Current pane in compact layouts. */
type MobileResumePane = 'edit' | 'preview'

/** @brief 尚未由服务端确认的板块草稿 / Section draft not yet confirmed by the server. */
interface ResumeSectionDraft {
  /** @brief section 被并发删除后仍用于辨认草稿的标签 / Label retained to identify a draft after concurrent section deletion. */
  readonly sectionLabel: string
  /** @brief 用户确实编辑过的草稿正文 / Draft body explicitly edited by the user. */
  readonly content?: string
  /** @brief 用户确实编辑过的草稿标题 / Draft title explicitly edited by the user. */
  readonly title?: string
}

/** @brief 板块保存失败及其恢复目标 / Section-save failure and its recovery target. */
type ResumeSectionSaveFailure =
  | {
      /** @brief 服务端已确认整个 batch 未应用，并已返回最新权威 / The service confirmed the whole batch was not applied and returned latest authority. */
      readonly kind: 'batch-conflict'
      /** @brief 需要用户基于最新权威重新确认的板块 / Section requiring user reconfirmation against latest authority. */
      readonly sectionId: UiResumeSectionId
      /** @brief 未应用的显式字段 / Explicit field that was not applied. */
      readonly field: 'title' | 'content'
    }
  | {
      /** @brief 已在本地识别的 Schema 边界违反 / Schema-boundary violation identified locally. */
      readonly kind: 'validation'
      /** @brief 稳定本地违反 code / Stable local violation code. */
      readonly code: NonNullable<ReturnType<typeof getUiResumeSectionTextViolation>>
      /** @brief 需要修正的板块 / Section that must be corrected. */
      readonly sectionId: UiResumeSectionId
      /** @brief 无效的显式字段 / Explicit field that is invalid. */
      readonly field: 'title' | 'content'
    }
  | {
      /** @brief 端口请求失败 / Port request failure. */
      readonly kind: 'request'
      /** @brief 未向用户直接展示的技术错误 / Technical error not displayed directly to the user. */
      readonly error: unknown
      /** @brief 需要重新保存的板块 / Section that needs to be saved again. */
      readonly sectionId: UiResumeSectionId
      /** @brief 失败的显式字段修改 / Explicit field change that failed. */
      readonly field: 'title' | 'content'
    }

/** @brief 板块结构操作的安全失败状态 / Safe failure state for a section-structure operation. */
interface ResumeStructureFailure {
  /** @brief 未向用户直接展示的技术错误 / Technical error not displayed directly to the user. */
  readonly error: unknown
  /** @brief 保留动作上下文的安全本地化标题 / Safe localized title preserving action context. */
  readonly title: string
}

/** @brief 一次可原样确认的 Resume command envelope / Resume-command envelope confirmable verbatim. */
interface ResumeCommandAttempt<TCommand extends { readonly commandId: UiCommandId }> {
  /** @brief 区分新意图与原命令重试的规范指纹 / Canonical fingerprint distinguishing a new intent from a retry. */
  readonly fingerprint: string
  /** @brief 冻结 authority、payload 与 command identity 的完整应用命令 / Complete application command freezing authority, payload, and command identity. */
  readonly command: TCommand
}

/** @brief 字段编辑 command envelope / Field-edit command envelope. */
type ResumeSectionCommandAttempt = ResumeCommandAttempt<UiResumeSectionUpdateInput>

/** @brief 排序 command envelope / Reorder-command envelope. */
type ResumeReorderCommandAttempt = ResumeCommandAttempt<UiResumeSectionsReorderInput>

/** @brief 删除 command envelope / Delete-command envelope. */
type ResumeDeleteCommandAttempt = ResumeCommandAttempt<UiResumeSectionDeleteInput>

/** @brief 必须确认原命令或重新读取权威后才能继续写入的恢复状态 / Recovery state requiring exact command confirmation or an authoritative read before further writes. */
type ResumeAuthorityRecovery =
  | {
      /** @brief 乐观并发冲突 / Optimistic-concurrency conflict. */
      readonly kind: 'conflict'
      /** @brief 服务端返回的稳定冲突状态 / Stable conflict status returned by the service. */
      readonly status: ResumeConflictStatus
    }
  | {
      /** @brief 服务端是否提交命令无法确认 / Whether the service committed the command cannot be determined. */
      readonly kind: 'outcome-unknown'
      /** @brief 原样重放冻结 command envelope 的确认动作 / Confirmation action replaying the frozen command envelope verbatim. */
      readonly confirm: () => Promise<void>
      /** @brief 明确放弃旧 command identity、但保留用户草稿 / Explicitly abandon the old command identity while retaining user drafts. */
      readonly abandon: () => void
      /** @brief Retry-After 生效时允许下一次确认的时刻 / Earliest next-confirmation time while Retry-After applies. */
      readonly confirmNotBefore: number | null
    }
  | {
      /** @brief 原冻结命令已经终结，只能读取权威状态 / The original frozen command is terminal and only an authoritative read can recover. */
      readonly kind: 'authority-required'
      /** @brief 需要权威读取的稳定原因 / Stable reason why an authoritative read is required. */
      readonly reason:
        | 'abandoned-confirmation'
        | 'idempotency-key-reused'
        | 'invalid-response'
        | 'terminal-rejection'
    }
  | {
      /** @brief 已确认 batch 未应用，且页面已经吸收同一结果中的最新权威 / A confirmed batch was not applied and the page already adopted authority from the same result. */
      readonly kind: 'rejected'
    }

/** @brief Resume 聚合写操作的页面级单通道执行器 / Page-level single-lane runner for Resume aggregate mutations. */
interface RunResumeMutation {
  /**
   * @brief 仅在当前没有 Resume 写入时执行意图 / Run an intent only when no Resume write is active.
   * @template TResult 写操作结果 / Mutation result.
   * @param mutation 延迟执行的写操作 / Deferred mutation.
   * @return 写结果；被当前通道拒绝时为 null / Mutation result, or null when rejected by the active lane.
   */
  <TResult>(mutation: () => Promise<TResult>): Promise<TResult | null>
}

/** @brief Resume mutation 错误对页面状态机的处置 / Disposition of a Resume-mutation error in the page state machine. */
type ResumeMutationErrorDisposition =
  'authority-conflict' | 'batch-conflict' | 'discard-command' | 'outcome-unknown' | null

/** @brief 窗口顺序 / Stable pane order. */
const RESUME_PANES: readonly ResumePane[] = ['assistant', 'editor', 'preview']

/** @brief 初始等宽权重 / Initial equal pane weights. */
const INITIAL_PANE_SIZES: Readonly<Record<ResumePane, number>> = {
  assistant: 1,
  editor: 1,
  preview: 1
}

/**
 * @brief 为新意图冻结 command envelope，为普通安全重试复用它 / Freeze a command envelope for a new intent and reuse it for an ordinary safe retry.
 * @template TCommand 携带稳定 command identity 的应用命令 / Application command carrying a stable command identity.
 * @param current 当前尚未确认的 command attempt / Current unconfirmed command attempt.
 * @param fingerprint 由权威快照与完整用户意图构成的指纹 / Fingerprint composed from the authority snapshot and complete user intent.
 * @param createCommand 使用新 identity 冻结完整命令的工厂 / Factory freezing the complete command with a new identity.
 * @return 可直接提交的稳定 attempt / Stable attempt ready for submission.
 */
function resumeCommandAttempt<TCommand extends { readonly commandId: UiCommandId }>(
  current: ResumeCommandAttempt<TCommand> | null,
  fingerprint: string,
  createCommand: (commandId: UiCommandId) => TCommand
): ResumeCommandAttempt<TCommand> {
  if (current?.fingerprint === fingerprint) return current
  /** @brief 新用户意图的稳定 command identity / Stable command identity for the new user intent. */
  const commandId = createUiCommandId()
  return { command: createCommand(commandId), fingerprint }
}

/**
 * @brief 判断冻结命令是否已不能安全重放 / Determine whether a frozen command can no longer be replayed safely.
 * @param error 写操作错误 / Write-operation error.
 * @return 必须丢弃命令信封并恢复权威状态时为 true / True when the command envelope must be discarded and authority recovered.
 */
function mustDiscardResumeCommand(error: unknown): boolean {
  return (
    getResumeConflictStatus(error) !== null ||
    error instanceof ResumeBatchConflictError ||
    getResumeIdempotencyConflict(error) === 'key-reused' ||
    isResumeCommandDefinitivelyRejected(error) ||
    isResumeUnreplayableContractResponse(error)
  )
}

/** @brief 获取板块可编辑纯文本 / Get editable plain text for a section. */
function getSectionContent(section: UiResumeSection): string {
  return selectResumePlainText(section.content)
}

/**
 * @brief 创建 PDF 预览绑定的简历代际身份 / Create the Resume generation identity bound to a PDF preview.
 * @param editor 当前简历编辑器 / Current Resume editor.
 * @return 包含简历、revision 与模板身份的稳定键 / Stable key containing Resume, revision, and template identity.
 */
function createResumePreviewIdentity(editor: UiResumeEditorModel): string {
  return JSON.stringify([
    editor.resume.id,
    editor.resume.revision,
    editor.resume.template.templateId,
    editor.resume.template.templateVersion
  ])
}

/** @brief 标题栏中的窗口开关 / Pane toggle inside the fixed window title bar. */
function ResumeWindowTitle({
  expanded,
  label,
  onToggle,
  trailing
}: {
  readonly expanded: boolean
  readonly label: string
  readonly onToggle: () => void
  readonly trailing?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={`aw-resume-window-title ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <h2>{label}</h2>
      <div className="aw-resume-window-actions">
        {trailing}
        <button
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t('resume.workspace.collapseWindow', {
                  defaultValue: '收起{{name}}窗口',
                  name: label
                })
              : t('resume.workspace.expandWindow', {
                  defaultValue: '展开{{name}}窗口',
                  name: label
                })
          }
          className="aw-icon-button aw-window-toggle"
          onClick={onToggle}
          type="button"
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" size={15} />
          ) : (
            <ChevronDown aria-hidden="true" size={15} />
          )}
        </button>
      </div>
    </div>
  )
}

/** @brief 可拖动且支持键盘的窗口分隔线 / Pointer- and keyboard-operable pane separator. */
function ResumePaneSeparator({
  leftPane,
  onResize,
  value
}: {
  readonly leftPane: ResumePane
  readonly onResize: (delta: number) => void
  readonly value: number
}): React.JSX.Element {
  const lastPointerX = useRef<number | null>(null)

  const stopPointerResize = (): void => {
    lastPointerX.current = null
    document.body.classList.remove('aw-is-resizing')
  }

  const handlePointerMove = (event: PointerEvent): void => {
    if (lastPointerX.current === null) {
      return
    }
    const delta = (event.clientX - lastPointerX.current) / Math.max(window.innerWidth, 1)
    lastPointerX.current = event.clientX
    onResize(delta * 3)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    lastPointerX.current = event.clientX
    document.body.classList.add('aw-is-resizing')
    const move = (pointerEvent: PointerEvent): void => handlePointerMove(pointerEvent)
    const up = (): void => {
      stopPointerResize()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    onResize(event.key === 'ArrowLeft' ? -0.05 : 0.05)
  }

  return (
    <div
      aria-label={`调整${leftPane}窗口宽度`}
      aria-orientation="vertical"
      aria-valuemax={85}
      aria-valuemin={15}
      aria-valuenow={Math.round(value * 100)}
      className="aw-resume-pane-separator"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
    />
  )
}

/** @brief AI 对话窗口 / Resume-assistant pane. */
function ResumeAssistantPanel({
  onCloseMobile
}: {
  readonly onCloseMobile: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <aside aria-label={t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}>
      <div className="aw-mobile-assistant-header">
        <Bot aria-hidden="true" size={17} />
        <strong>{t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}</strong>
        <button
          aria-label={t('common.close', { defaultValue: '关闭' })}
          className="aw-icon-button"
          onClick={onCloseMobile}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="aw-chat-messages" aria-live="polite">
        <p className="aw-workspace-context">
          <Sparkles aria-hidden="true" size={14} />
          {t('resume.workspace.assistantUnavailable', {
            defaultValue: 'Agent 消息与建议将在正式会话契约接通后开放。'
          })}
        </p>
      </div>
      <form
        aria-label={t('resume.assistantMessageForm', { defaultValue: '简历助手消息' })}
        className="aw-chat-composer"
      >
        <textarea
          aria-label={t('resume.workspace.askAssistantLabel', { defaultValue: '询问简历助手' })}
          className="aw-textarea"
          disabled
          placeholder={t('resume.askAssistant', {
            defaultValue: '简历助手将在 Agent 会话契约接通后开放。'
          })}
          value=""
        />
        <button
          aria-label={t('resume.sendMessage', { defaultValue: '发送消息' })}
          className="aw-icon-button aw-send-button"
          disabled
          type="submit"
        >
          <Send aria-hidden="true" size={16} />
        </button>
      </form>
    </aside>
  )
}

/** @brief 所有语义板块组成的连续编辑器 / Continuous editor for all semantic sections. */
function ResumeSectionsEditor({
  editor,
  gateway,
  isWriteLocked,
  onEditorChange,
  onMutationError,
  runMutation
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  readonly onEditorChange: (editor: UiResumeEditorModel) => void
  readonly onMutationError: (
    error: unknown,
    confirmUnknownOutcome: () => Promise<void>,
    abandonUnknownOutcome: () => void
  ) => ResumeMutationErrorDisposition
  readonly runMutation: RunResumeMutation
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [focusedSectionId, setFocusedSectionId] = useState<UiResumeSectionId | null>(
    editor.resume.sections.at(0)?.id ?? null
  )
  const [deleteCandidate, setDeleteCandidate] = useState<UiResumeSectionId | null>(null)
  const [draggedSectionId, setDraggedSectionId] = useState<UiResumeSectionId | null>(null)
  /** @brief 仅存在于浏览器内、尚未被后端确认的板块草稿 / Browser-local section drafts not yet confirmed by the backend. */
  const [drafts, setDrafts] = useState<ReadonlyMap<UiResumeSectionId, ResumeSectionDraft>>(
    () => new Map()
  )
  /** @brief 当前正在保存的板块 / Section currently being persisted. */
  const [savingSectionId, setSavingSectionId] = useState<UiResumeSectionId | null>(null)
  /** @brief 最近一次板块保存失败 / Latest section-save failure. */
  const [saveFailure, setSaveFailure] = useState<ResumeSectionSaveFailure | null>(null)
  /** @brief 结构操作的安全失败状态 / Safe structural-operation failure state. */
  const [structureFailure, setStructureFailure] = useState<ResumeStructureFailure | null>(null)
  /** @brief 尚未被服务端确认的字段编辑 command / Field-edit command not yet confirmed by the service. */
  const sectionCommandAttemptRef = useRef<ResumeSectionCommandAttempt | null>(null)
  /** @brief 尚未被服务端确认的排序 command / Reorder command not yet confirmed by the service. */
  const reorderCommandAttemptRef = useRef<ResumeReorderCommandAttempt | null>(null)
  /** @brief 尚未被服务端确认的删除 command / Delete command not yet confirmed by the service. */
  const deleteCommandAttemptRef = useRef<ResumeDeleteCommandAttempt | null>(null)

  useUnsavedChanges(
    `resume.section-drafts:${editor.resume.id}`,
    drafts.size > 0 || savingSectionId !== null
  )

  /** @brief 服务端已删除对应 section、但仍须交还用户的本地草稿 / Local drafts whose sections were removed by the server but must still be returned to the user. */
  const orphanedDrafts = [...drafts].filter(
    ([sectionId]) => !editor.resume.sections.some((section) => section.id === sectionId)
  )

  const updateLocalSection = (
    sectionId: UiResumeSectionId,
    field: 'title' | 'content',
    value: string
  ): void => {
    if (isWriteLocked) return
    /** @brief 当前权威板块 / Current authoritative section. */
    const section = editor.resume.sections.find((item) => item.id === sectionId)
    if (section === undefined) return
    setSaveFailure(null)
    setDrafts((current) => {
      /** @brief 只含用户明确编辑字段的已有草稿 / Existing draft containing only explicitly edited fields. */
      const draft = current.get(sectionId) ?? { sectionLabel: section.title || section.kind }
      /** @brief 包含本次本地编辑的新草稿 map / New draft map containing this local edit. */
      const next = new Map(current)
      next.set(sectionId, { ...draft, [field]: value })
      return next
    })
  }

  /**
   * @brief 吸收已确认的字段命令，同时只删除服务端真正确认的草稿字段 / Adopt a confirmed field command while removing only the draft field actually confirmed by the server.
   * @param next 命令返回的新权威投影 / New authoritative projection returned by the command.
   * @param sectionId 已修改板块 / Modified section.
   * @param field 已确认字段 / Confirmed field.
   * @return 无返回值 / No return value.
   */
  const acceptSectionCommand = (
    next: UiResumeEditorModel,
    sectionId: UiResumeSectionId,
    field: 'title' | 'content'
  ): void => {
    onEditorChange(next)
    setSaveFailure(null)
    setStructureFailure(null)
    setDrafts((current) => {
      /** @brief 回包成功响应中的权威板块 / Authoritative section returned in the successful response. */
      const confirmedSection = next.resume.sections.find((item) => item.id === sectionId)
      /** @brief 响应到达时的最新本地草稿 / Latest local draft when the response arrives. */
      const currentDraft = current.get(sectionId)
      if (confirmedSection === undefined || currentDraft === undefined) return current
      /** @brief 删除已确认字段、并吸收恰好等于新权威的其他显式意图 / Remove the confirmed field and absorb other explicit intents already equal to new authority. */
      const reconciled: { content?: string; sectionLabel: string; title?: string } = {
        ...currentDraft
      }
      delete reconciled[field]
      if (reconciled.title === confirmedSection.title) delete reconciled.title
      if (reconciled.content === getSectionContent(confirmedSection)) delete reconciled.content
      /** @brief 只保留仍未确认字段的草稿 map / Draft map retaining only fields that remain unconfirmed. */
      const remaining = new Map(current)
      if (reconciled.title === undefined && reconciled.content === undefined) {
        remaining.delete(sectionId)
      } else remaining.set(sectionId, reconciled)
      return remaining
    })
  }

  /**
   * @brief 发送冻结的字段命令并维护其可重放生命周期 / Dispatch a frozen field command and maintain its replay lifecycle.
   * @param attempt 完整冻结的命令信封 / Fully frozen command envelope.
   * @return 服务端确认的新权威投影 / New authoritative projection confirmed by the server.
   */
  const dispatchSectionCommand = async (
    attempt: ResumeSectionCommandAttempt
  ): Promise<UiResumeEditorModel> => {
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_update', scope: 'resume' },
        () => gateway.updateResumeSection(attempt.command)
      )
      if (sectionCommandAttemptRef.current === attempt) sectionCommandAttemptRef.current = null
      return next
    } catch (error: unknown) {
      if (mustDiscardResumeCommand(error) && sectionCommandAttemptRef.current === attempt) {
        sectionCommandAttemptRef.current = null
      }
      throw error
    }
  }

  /**
   * @brief 发送冻结的排序命令并维护其可重放生命周期 / Dispatch a frozen reorder command and maintain its replay lifecycle.
   * @param attempt 完整冻结的命令信封 / Fully frozen command envelope.
   * @return 服务端确认的新权威投影 / New authoritative projection confirmed by the server.
   */
  const dispatchReorderCommand = async (
    attempt: ResumeReorderCommandAttempt
  ): Promise<UiResumeEditorModel> => {
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_reorder', scope: 'resume' },
        () => gateway.reorderResumeSections(attempt.command)
      )
      if (reorderCommandAttemptRef.current === attempt) reorderCommandAttemptRef.current = null
      return next
    } catch (error: unknown) {
      if (mustDiscardResumeCommand(error) && reorderCommandAttemptRef.current === attempt) {
        reorderCommandAttemptRef.current = null
      }
      throw error
    }
  }

  /**
   * @brief 发送冻结的删除命令并维护其可重放生命周期 / Dispatch a frozen delete command and maintain its replay lifecycle.
   * @param attempt 完整冻结的命令信封 / Fully frozen command envelope.
   * @return 服务端确认的新权威投影 / New authoritative projection confirmed by the server.
   */
  const dispatchDeleteCommand = async (
    attempt: ResumeDeleteCommandAttempt
  ): Promise<UiResumeEditorModel> => {
    try {
      const next = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.section_delete', scope: 'resume' },
        () => gateway.deleteResumeSection(attempt.command)
      )
      if (deleteCommandAttemptRef.current === attempt) deleteCommandAttemptRef.current = null
      return next
    } catch (error: unknown) {
      if (mustDiscardResumeCommand(error) && deleteCommandAttemptRef.current === attempt) {
        deleteCommandAttemptRef.current = null
      }
      throw error
    }
  }

  const persistSection = async (
    section: UiResumeSection,
    field: 'title' | 'content'
  ): Promise<void> => {
    /** @brief 本次需要提交的草稿快照 / Draft snapshot to submit in this attempt. */
    const draft = drafts.get(section.id)
    if (draft === undefined || savingSectionId !== null || isWriteLocked) return
    /** @brief 用户对当前字段的显式意图 / User's explicit intent for the current field. */
    const draftValue = draft[field]
    if (draftValue === undefined) return
    /** @brief 当前权威字段值 / Current authoritative value for the selected field. */
    const authoritativeValue = field === 'title' ? section.title : getSectionContent(section)
    if (draftValue === authoritativeValue) {
      setDrafts((current) => {
        /** @brief 已与权威相等后无需再提交的草稿 / Draft no longer requiring submission after matching authority. */
        const currentDraft = current.get(section.id)
        if (currentDraft === undefined) return current
        /** @brief 删除当前已满足字段后的稀疏草稿 / Sparse draft after removing the already-satisfied field. */
        const remainingDraft: { content?: string; sectionLabel: string; title?: string } = {
          ...currentDraft
        }
        delete remainingDraft[field]
        /** @brief 保留其他显式字段意图的草稿集合 / Draft collection retaining other explicit field intents. */
        const remaining = new Map(current)
        if (remainingDraft.title === undefined && remainingDraft.content === undefined) {
          remaining.delete(section.id)
        } else remaining.set(section.id, remainingDraft)
        return remaining
      })
      return
    }
    /** @brief 与冻结 Schema 一致的本地文本边界违反 / Local text-boundary violation aligned with the frozen Schema. */
    const violation = getUiResumeSectionTextViolation(field, draftValue)
    if (violation !== null) {
      setSaveFailure({ code: violation, field, kind: 'validation', sectionId: section.id })
      return
    }
    /** @brief 正文操作提交的完整 RichText；标题操作不构造正文 / Complete RichText submitted by a content operation; absent for a title operation. */
    const contentValue =
      field === 'content' ? replaceUiResumeRichTextText(section.content, draftValue) : undefined
    /** @brief 提交的完整字段值 / Complete field value being submitted. */
    const fieldValue = contentValue ?? draftValue
    /** @brief 同一权威快照和字段值的稳定指纹 / Stable fingerprint for the same authority snapshot and field value. */
    const commandFingerprint = JSON.stringify([
      'section-update',
      editor.resume.workspaceId,
      editor.resume.id,
      editor.resume.revision,
      editor.concurrencyToken,
      section.id,
      field,
      fieldValue
    ])
    /** @brief 新意图或安全重试复用的 command attempt / Command attempt created for a new intent or reused by a safe retry. */
    const commandAttempt = resumeCommandAttempt(
      sectionCommandAttemptRef.current,
      commandFingerprint,
      (commandId): UiResumeSectionUpdateInput => ({
        baseRevision: editor.resume.revision,
        commandId,
        concurrencyToken: editor.concurrencyToken,
        ...(contentValue === undefined ? { title: draftValue } : { content: contentValue }),
        resumeId: editor.resume.id,
        sectionId: section.id,
        workspaceId: editor.resume.workspaceId
      })
    )
    sectionCommandAttemptRef.current = commandAttempt
    setSavingSectionId(section.id)
    setSaveFailure(null)
    try {
      const next = await runMutation(() => dispatchSectionCommand(commandAttempt))
      if (next === null) return
      acceptSectionCommand(next, section.id, field)
    } catch (reason: unknown) {
      /** @brief 不经新权威重构而原样重放本命令的确认动作 / Confirmation action replaying this command verbatim without rebuilding it from newer authority. */
      const confirmUnknownOutcome = async (): Promise<void> => {
        const next = await dispatchSectionCommand(commandAttempt)
        acceptSectionCommand(next, section.id, field)
      }
      /** @brief 放弃旧命令身份但保留字段草稿 / Abandon the old command identity while retaining the field draft. */
      const abandonUnknownOutcome = (): void => {
        if (sectionCommandAttemptRef.current === commandAttempt) {
          sectionCommandAttemptRef.current = null
        }
      }
      /** @brief 根状态机对本次失败的处置 / Root-state disposition for this failure. */
      const disposition = onMutationError(reason, confirmUnknownOutcome, abandonUnknownOutcome)
      if (disposition === 'batch-conflict') {
        setSaveFailure({ field, kind: 'batch-conflict', sectionId: section.id })
        return
      }
      if (
        disposition === 'authority-conflict' ||
        disposition === 'discard-command' ||
        disposition === 'outcome-unknown'
      ) {
        return
      }
      setSaveFailure({ error: reason, field, kind: 'request', sectionId: section.id })
    } finally {
      setSavingSectionId(null)
    }
  }

  const reorder = async (orderedIds: readonly UiResumeSectionId[]): Promise<void> => {
    if (isWriteLocked) return
    /** @brief 完整目标顺序与权威快照的稳定指纹 / Stable fingerprint of the complete target order and authority snapshot. */
    const commandFingerprint = JSON.stringify([
      'section-reorder',
      editor.resume.workspaceId,
      editor.resume.id,
      editor.resume.revision,
      editor.concurrencyToken,
      orderedIds
    ])
    /** @brief 新排序意图或安全重试的 command attempt / Command attempt for a new reorder intent or its safe retry. */
    const commandAttempt = resumeCommandAttempt(
      reorderCommandAttemptRef.current,
      commandFingerprint,
      (commandId): UiResumeSectionsReorderInput => ({
        baseRevision: editor.resume.revision,
        commandId,
        concurrencyToken: editor.concurrencyToken,
        resumeId: editor.resume.id,
        orderedSectionIds: orderedIds,
        workspaceId: editor.resume.workspaceId
      })
    )
    reorderCommandAttemptRef.current = commandAttempt
    try {
      const next = await runMutation(() => dispatchReorderCommand(commandAttempt))
      if (next === null) return
      onEditorChange(next)
      setStructureFailure(null)
    } catch (reason: unknown) {
      /** @brief 原样重放本排序命令的确认动作 / Confirmation action replaying this reorder command verbatim. */
      const confirmUnknownOutcome = async (): Promise<void> => {
        const next = await dispatchReorderCommand(commandAttempt)
        onEditorChange(next)
        setStructureFailure(null)
      }
      /** @brief 放弃旧排序命令身份 / Abandon the old reorder-command identity. */
      const abandonUnknownOutcome = (): void => {
        if (reorderCommandAttemptRef.current === commandAttempt) {
          reorderCommandAttemptRef.current = null
        }
      }
      /** @brief 根状态机对排序失败的处置 / Root-state disposition for the reorder failure. */
      const disposition = onMutationError(reason, confirmUnknownOutcome, abandonUnknownOutcome)
      if (disposition !== null) {
        return
      }
      setStructureFailure({
        error: reason,
        title: t('resume.workspace.reorderError', { defaultValue: '无法调整板块顺序。' })
      })
    }
  }

  const moveSection = (sectionId: UiResumeSectionId, offset: -1 | 1): void => {
    if (isWriteLocked) return
    const currentIndex = editor.resume.sections.findIndex((section) => section.id === sectionId)
    const targetIndex = currentIndex + offset
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= editor.resume.sections.length) {
      return
    }
    const orderedIds = editor.resume.sections.map((section) => section.id)
    const [movedId] = orderedIds.splice(currentIndex, 1)
    if (movedId === undefined) {
      return
    }
    orderedIds.splice(targetIndex, 0, movedId)
    void reorder(orderedIds)
  }

  const deleteSection = async (sectionId: UiResumeSectionId): Promise<void> => {
    if (isWriteLocked) return
    if (deleteCandidate !== sectionId) {
      setDeleteCandidate(sectionId)
      return
    }
    /** @brief 删除目标与权威快照的稳定指纹 / Stable fingerprint of the delete target and authority snapshot. */
    const commandFingerprint = JSON.stringify([
      'section-delete',
      editor.resume.workspaceId,
      editor.resume.id,
      editor.resume.revision,
      editor.concurrencyToken,
      sectionId
    ])
    /** @brief 新删除意图或安全重试的 command attempt / Command attempt for a new delete intent or its safe retry. */
    const commandAttempt = resumeCommandAttempt(
      deleteCommandAttemptRef.current,
      commandFingerprint,
      (commandId): UiResumeSectionDeleteInput => ({
        baseRevision: editor.resume.revision,
        commandId,
        concurrencyToken: editor.concurrencyToken,
        resumeId: editor.resume.id,
        sectionId,
        workspaceId: editor.resume.workspaceId
      })
    )
    deleteCommandAttemptRef.current = commandAttempt
    try {
      const next = await runMutation(() => dispatchDeleteCommand(commandAttempt))
      if (next === null) return
      onEditorChange(next)
      setStructureFailure(null)
      setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
      setDeleteCandidate(null)
    } catch (reason: unknown) {
      /** @brief 原样重放本删除命令的确认动作 / Confirmation action replaying this delete command verbatim. */
      const confirmUnknownOutcome = async (): Promise<void> => {
        const next = await dispatchDeleteCommand(commandAttempt)
        onEditorChange(next)
        setStructureFailure(null)
        setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
        setDeleteCandidate(null)
      }
      /** @brief 放弃旧删除命令身份 / Abandon the old delete-command identity. */
      const abandonUnknownOutcome = (): void => {
        if (deleteCommandAttemptRef.current === commandAttempt) {
          deleteCommandAttemptRef.current = null
        }
      }
      /** @brief 根状态机对删除失败的处置 / Root-state disposition for the delete failure. */
      const disposition = onMutationError(reason, confirmUnknownOutcome, abandonUnknownOutcome)
      if (disposition !== null) {
        return
      }
      setStructureFailure({
        error: reason,
        title: t('resume.workspace.deleteError', { defaultValue: '无法删除这个板块。' })
      })
    }
  }

  const dropBefore = (targetId: UiResumeSectionId): void => {
    if (isWriteLocked) return
    if (draggedSectionId === null || draggedSectionId === targetId) {
      return
    }
    const orderedIds = editor.resume.sections
      .map((section) => section.id)
      .filter((sectionId) => sectionId !== draggedSectionId)
    const targetIndex = orderedIds.indexOf(targetId)
    orderedIds.splice(targetIndex, 0, draggedSectionId)
    setDraggedSectionId(null)
    void reorder(orderedIds)
  }

  /** @brief 本地 Schema 边界违反的可访问消息 / Accessible message for a local Schema-boundary violation. */
  const validationMessage =
    saveFailure?.kind === 'validation'
      ? {
          'content-too-long': t('resume.editor.contentTooLong', {
            defaultValue: '语义正文不能超过 20,000 个 Unicode 字符。'
          }),
          'title-required': t('resume.editor.titleRequired', {
            defaultValue: '区段标题不能为空。'
          }),
          'title-too-long': t('resume.editor.titleTooLong', {
            defaultValue: '区段标题不能超过 120 个 Unicode 字符。'
          })
        }[saveFailure.code]
      : null

  return (
    <section aria-label={t('resume.workspace.editor', { defaultValue: '内容编辑' })}>
      <div className="aw-resume-editor-intro">
        <div>
          <strong>{editor.resume.title}</strong>
          <span>
            {t('resume.revision', {
              defaultValue: '版本 {{revision}}',
              revision: editor.resume.revision
            })}
          </span>
        </div>
        <p>
          {t('resume.workspace.editorHint', { defaultValue: '浏览全部板块，点击后聚焦编辑。' })}
        </p>
      </div>
      {structureFailure !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>{structureFailure.title}</strong>{' '}
          <ResourceFailureMessage error={structureFailure.error} />
        </div>
      ) : null}
      {orphanedDrafts.length === 0 ? null : (
        <section className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.orphanedDraftTitle', {
              defaultValue: '服务端已删除板块；你的本地草稿仍保留。'
            })}
          </strong>
          <p>
            {t('resume.workspace.orphanedDraftDescription', {
              defaultValue: '请复制需要的文字；只有你明确丢弃后，本页才会删除这份本地草稿。'
            })}
          </p>
          {orphanedDrafts.map(([sectionId, draft]) => (
            <article key={sectionId}>
              <label>
                {t('resume.workspace.orphanedDraftSectionTitle', {
                  defaultValue: '已删除板块的标题'
                })}
                <input className="aw-input" readOnly value={draft.title ?? draft.sectionLabel} />
              </label>
              <label>
                {t('resume.workspace.orphanedDraftSectionContent', {
                  defaultValue: '已删除板块的正文'
                })}
                <textarea className="aw-textarea" readOnly value={draft.content ?? ''} />
              </label>
              <button
                className="aw-quiet-button"
                onClick={(): void => {
                  setDrafts((current) => {
                    /** @brief 用户明确丢弃后留下的其他草稿 / Other drafts retained after explicit discard. */
                    const remaining = new Map(current)
                    remaining.delete(sectionId)
                    return remaining
                  })
                }}
                type="button"
              >
                {t('resume.workspace.discardOrphanedDraft', {
                  defaultValue: '丢弃这份本地草稿'
                })}
              </button>
            </article>
          ))}
        </section>
      )}
      {saveFailure?.kind === 'validation' ? (
        <div className="aw-inline-error" role="alert">
          <strong>{validationMessage}</strong>
        </div>
      ) : saveFailure?.kind === 'batch-conflict' ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.batchConflictNotApplied', {
              defaultValue: '服务端未应用这次修改。'
            })}
          </strong>{' '}
          <span>
            {t('resume.workspace.batchConflictReview', {
              defaultValue: '已加载最新版本；请检查保留的草稿，再重新确认保存。'
            })}
          </span>{' '}
          <button
            className="aw-quiet-button"
            disabled={isWriteLocked}
            onClick={(): void => {
              /** @brief 最新权威中仍存在的冲突板块 / Conflicting section still present in latest authority. */
              const section = editor.resume.sections.find(
                (item) => item.id === saveFailure.sectionId
              )
              if (section !== undefined) void persistSection(section, saveFailure.field)
            }}
            type="button"
          >
            {t('resume.workspace.reviewAndSaveAgain', {
              defaultValue: '检查后重新保存'
            })}
          </button>
        </div>
      ) : saveFailure !== null ? (
        <ResourceErrorState
          error={saveFailure.error}
          onRetry={(): void => {
            /** @brief 仍存在于权威投影中的失败板块 / Failed section still present in the authoritative projection. */
            const section = editor.resume.sections.find((item) => item.id === saveFailure.sectionId)
            if (section !== undefined) void persistSection(section, saveFailure.field)
          }}
          title={t('resume.workspace.sectionError', {
            defaultValue: '板块修改尚未保存；你的输入仍保留在本页。'
          })}
        />
      ) : null}
      <div className="aw-resume-sections">
        {editor.resume.sections.map((section, index) => {
          const isFocused = section.id === focusedSectionId
          /** @brief 当前板块的未保存草稿 / Unsaved draft for the current section. */
          const draft = drafts.get(section.id)
          /** @brief 输入框展示的标题 / Title displayed in the input. */
          const sectionTitle = draft?.title ?? section.title
          /** @brief 输入框展示的正文 / Body displayed in the input. */
          const sectionContent = draft?.content ?? getSectionContent(section)
          /** @brief 当前板块是否正在保存 / Whether the current section is being saved. */
          const isSaving = savingSectionId === section.id
          return (
            <article
              className={`aw-resume-section-editor ${isFocused ? 'is-focused' : ''}`}
              draggable={!isWriteLocked}
              key={section.id}
              onClick={(): void => setFocusedSectionId(section.id)}
              onDragOver={(event): void => event.preventDefault()}
              onDragStart={(): void => setDraggedSectionId(section.id)}
              onDrop={(): void => dropBefore(section.id)}
            >
              <header className="aw-resume-section-heading">
                <span aria-hidden="true" className="aw-section-drag-handle">
                  <GripVertical size={15} />
                </span>
                <div>
                  <h3>{sectionTitle || section.kind}</h3>
                  <span>{section.kind}</span>
                </div>
                <div className="aw-section-actions">
                  <button
                    aria-label={t('resume.workspace.moveUp', {
                      defaultValue: '上移{{name}}',
                      name: sectionTitle
                    })}
                    className="aw-icon-button"
                    disabled={index === 0 || isWriteLocked || savingSectionId !== null}
                    onClick={(event): void => {
                      event.stopPropagation()
                      moveSection(section.id, -1)
                    }}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={t('resume.workspace.moveDown', {
                      defaultValue: '下移{{name}}',
                      name: sectionTitle
                    })}
                    className="aw-icon-button"
                    disabled={
                      index === editor.resume.sections.length - 1 ||
                      isWriteLocked ||
                      savingSectionId !== null
                    }
                    onClick={(event): void => {
                      event.stopPropagation()
                      moveSection(section.id, 1)
                    }}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={t('resume.workspace.deleteSection', {
                      defaultValue: '删除{{name}}',
                      name: sectionTitle
                    })}
                    className={`aw-icon-button ${deleteCandidate === section.id ? 'aw-danger-button' : ''}`}
                    disabled={isWriteLocked || savingSectionId !== null}
                    onClick={(event): void => {
                      event.stopPropagation()
                      void deleteSection(section.id)
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              </header>
              {isFocused ? (
                <div className="aw-section-focus-editor">
                  <label>
                    <span>{t('resume.editor.sectionTitle', { defaultValue: '区段标题' })}</span>
                    <input
                      aria-invalid={
                        saveFailure?.kind === 'validation' &&
                        saveFailure.sectionId === section.id &&
                        saveFailure.field === 'title'
                          ? true
                          : undefined
                      }
                      className="aw-text-input"
                      disabled={isWriteLocked || isSaving}
                      onBlur={(): void => {
                        const current = editor.resume.sections.find(
                          (item) => item.id === section.id
                        )
                        if (current !== undefined) void persistSection(current, 'title')
                      }}
                      onChange={(event): void =>
                        updateLocalSection(section.id, 'title', event.target.value)
                      }
                      value={sectionTitle}
                    />
                  </label>
                  <label>
                    <span>{t('resume.editor.semanticContent', { defaultValue: '语义内容' })}</span>
                    <div className="aw-rich-text-shell">
                      <textarea
                        aria-label={t('resume.editor.semanticContent', {
                          defaultValue: '语义内容'
                        })}
                        aria-invalid={
                          saveFailure?.kind === 'validation' &&
                          saveFailure.sectionId === section.id &&
                          saveFailure.field === 'content'
                            ? true
                            : undefined
                        }
                        className="aw-section-textarea"
                        disabled={isWriteLocked || isSaving}
                        onBlur={(): void => {
                          const current = editor.resume.sections.find(
                            (item) => item.id === section.id
                          )
                          if (current !== undefined) void persistSection(current, 'content')
                        }}
                        onChange={(event): void =>
                          updateLocalSection(section.id, 'content', event.target.value)
                        }
                        value={sectionContent}
                      />
                      {section.content !== null && section.content.marks.length > 0 ? (
                        <p className="aw-muted-copy">
                          {t('resume.editor.richTextPreservation', {
                            defaultValue:
                              '未修改文本的格式会保留；触及已格式化文本时，对应格式和链接会移除。'
                          })}
                        </p>
                      ) : null}
                    </div>
                  </label>
                </div>
              ) : (
                <p className="aw-section-summary">
                  {sectionContent ||
                    t('resume.workspace.structuredItems', {
                      defaultValue: '包含 {{count}} 条结构化经历',
                      count: section.items.length
                    })}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** @brief 已加载的三窗口简历工作台 / Loaded three-window resume workspace. */
export function ResumeWorkspace({
  initialEditor,
  gateway,
  templateCatalog,
  templates
}: {
  readonly initialEditor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly templateCatalog: ResumeTemplateCatalogPort
  readonly templates: readonly UiTemplateManifest[]
}): React.JSX.Element {
  const { t } = useTranslation()
  const diagnostics = useDiagnostics()
  const [editor, setEditor] = useState(initialEditor)
  const [visiblePanes, setVisiblePanes] = useState<Readonly<Record<ResumePane, boolean>>>({
    assistant: true,
    editor: true,
    preview: true
  })
  const [paneSizes, setPaneSizes] = useState(INITIAL_PANE_SIZES)
  const [availableTemplates, setAvailableTemplates] =
    useState<readonly UiTemplateManifest[]>(templates)
  /** @brief 阻止未知或陈旧写入继续扩散的权威恢复状态 / Authority-recovery state preventing unknown or stale writes from spreading. */
  const [authorityRecovery, setAuthorityRecovery] = useState<ResumeAuthorityRecovery | null>(null)
  /** @brief React 提交期间向全部 Resume 写控件广播的执行状态 / In-flight state broadcast to every Resume write control during React commits. */
  const [isMutatingResume, setMutatingResume] = useState(false)
  /** @brief 用于兑现 Retry-After 后重新启用确认动作的时钟 / Clock used to re-enable confirmation after Retry-After. */
  const [confirmationClock, setConfirmationClock] = useState(0)
  /** @brief 在同一事件循环内也能原子拒绝第二个写意图 / Atomic guard rejecting a second write intent within the same event loop. */
  const mutationInFlightRef = useRef(false)
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief 当前权威重读独占的取消控制器 / Abort controller exclusively owned by the current authority reload. */
  const authorityReloadControllerRef = useRef<AbortController | null>(null)
  /** @brief 当前聚合恢复动作的安全错误 / Safe error from the current aggregate-recovery action. */
  const [authorityRecoveryError, setAuthorityRecoveryError] = useState<unknown>(null)
  const [authorityReloadRevision, setAuthorityReloadRevision] = useState(0)
  const [mobilePane, setMobilePane] = useState<MobileResumePane>('preview')
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false)

  const visiblePaneOrder = useMemo(
    () => RESUME_PANES.filter((pane) => visiblePanes[pane]),
    [visiblePanes]
  )
  const selectedTemplate = availableTemplates.find(
    (template) =>
      template.id === editor.resume.template.templateId &&
      template.version === editor.resume.template.templateVersion
  )
  /** @brief 当前 PDF 预览的完整代际键 / Complete generation key for the current PDF preview. */
  const previewGeneration = `${authorityReloadRevision}:${createResumePreviewIdentity(editor)}`
  /** @brief 是否必须完成权威读取后才能继续修改简历 / Whether an authoritative read is required before further Resume writes. */
  const isWriteLocked = authorityRecovery !== null || isMutatingResume
  useUnsavedChanges(
    `resume.aggregate-command:${editor.resume.id}`,
    authorityRecovery !== null || isMutatingResume || isReloadingAuthority
  )
  /** @brief 服务端 Retry-After 是否仍阻止确认同一命令 / Whether server Retry-After still blocks confirmation of the same command. */
  const isConfirmationCoolingDown =
    authorityRecovery?.kind === 'outcome-unknown' &&
    authorityRecovery.confirmNotBefore !== null &&
    confirmationClock < authorityRecovery.confirmNotBefore

  useEffect(
    (): (() => void) => (): void => {
      authorityReloadControllerRef.current?.abort(
        new DOMException('Resume workspace unmounted.', 'AbortError')
      )
      authorityReloadControllerRef.current = null
    },
    []
  )

  useEffect((): (() => void) | undefined => {
    if (
      authorityRecovery?.kind !== 'outcome-unknown' ||
      authorityRecovery.confirmNotBefore === null
    ) {
      return undefined
    }
    /** @brief 受宿主上限约束的下一段恢复等待 / Next recovery wait segment bounded by the host limit. */
    const delayMilliseconds = nextDeadlineTimerDelayMilliseconds(authorityRecovery.confirmNotBefore)
    if (delayMilliseconds === null) return undefined
    /** @brief 受浏览器定时器上限约束的恢复定时器 / Recovery timer bounded by the browser timer limit. */
    const timer = window.setTimeout((): void => setConfirmationClock(Date.now()), delayMilliseconds)
    return (): void => window.clearTimeout(timer)
  }, [authorityRecovery, confirmationClock])

  /**
   * @brief 在页面唯一 Resume mutation lane 中执行用户意图 / Run a user intent in the page's sole Resume mutation lane.
   * @template TResult 写操作结果 / Mutation result.
   * @param mutation 延迟执行的 gateway 写操作 / Deferred gateway mutation.
   * @return 写结果；已有写操作执行中时为 null / Mutation result, or null while another write is active.
   */
  const runResumeMutation: RunResumeMutation = async <TResult,>(
    mutation: () => Promise<TResult>
  ): Promise<TResult | null> => {
    if (mutationInFlightRef.current || authorityRecovery !== null) return null
    mutationInFlightRef.current = true
    setMutatingResume(true)
    try {
      return await mutation()
    } finally {
      mutationInFlightRef.current = false
      setMutatingResume(false)
    }
  }

  /**
   * @brief 把 section command 错误提升为 Resume 聚合恢复状态 / Promote a section-command error into Resume aggregate recovery state.
   * @param error 应用端口返回的错误 / Error returned by the application port.
   * @param confirmUnknownOutcome 原样确认同一冻结命令的动作 / Action confirming the same frozen command verbatim.
   * @param abandonUnknownOutcome 放弃旧命令身份但保留草稿的动作 / Action abandoning the old command identity while retaining drafts.
   * @return 子编辑器用于保留或丢弃局部状态的处置 / Disposition used by the child editor to retain or discard local state.
   */
  const handleMutationError = (
    error: unknown,
    confirmUnknownOutcome: () => Promise<void>,
    abandonUnknownOutcome: () => void
  ): ResumeMutationErrorDisposition => {
    /** @brief 与 Resume revision 无关的 API v2 幂等状态 / API v2 idempotency state unrelated to the Resume revision. */
    const idempotencyConflict = getResumeIdempotencyConflict(error)
    if (idempotencyConflict === 'in-progress') {
      /** @brief API v2 已验证的重试延迟 / Retry delay validated by API v2. */
      const retryAfterMilliseconds = getResumeCommandRetryAfterMilliseconds(error)
      /** @brief 当前错误被处理的单调页面时刻 / Page time at which the current error is handled. */
      const now = Date.now()
      setConfirmationClock(now)
      setAuthorityRecovery({
        abandon: abandonUnknownOutcome,
        confirm: confirmUnknownOutcome,
        confirmNotBefore: retryAfterMilliseconds === null ? null : now + retryAfterMilliseconds,
        kind: 'outcome-unknown'
      })
      return 'outcome-unknown'
    }
    if (idempotencyConflict === 'key-reused') {
      setAuthorityRecovery({ kind: 'authority-required', reason: 'idempotency-key-reused' })
      return 'discard-command'
    }
    if (isResumeUnreplayableContractResponse(error)) {
      abandonUnknownOutcome()
      setAuthorityRecovery({ kind: 'authority-required', reason: 'invalid-response' })
      return 'discard-command'
    }
    const status = getResumeConflictStatus(error)
    if (status !== null) {
      setAuthorityRecovery({ kind: 'conflict', status })
      return 'authority-conflict'
    }
    if (classifyResourceFailure(error).kind === 'outcome-unknown') {
      setConfirmationClock(Date.now())
      setAuthorityRecovery({
        abandon: abandonUnknownOutcome,
        confirm: confirmUnknownOutcome,
        confirmNotBefore: null,
        kind: 'outcome-unknown'
      })
      return 'outcome-unknown'
    }
    /** @brief 合法 200 conflict 已携带可立即吸收的完整权威 / Valid 200 conflict carrying complete authority ready for immediate adoption. */
    const batchConflict = getResumeBatchConflict(error)
    if (batchConflict !== null) {
      setEditor(batchConflict.authoritativeEditor)
      setAuthorityRecovery({ kind: 'rejected' })
      return 'batch-conflict'
    }
    return null
  }

  /**
   * @brief 在页面级 mutation lane 中原样确认未知结果的命令 / Confirm an unknown command outcome verbatim in the page-level mutation lane.
   * @return 命令完成或新的恢复状态建立后结束 / Resolves after the command completes or a new recovery state is established.
   */
  const confirmUnknownResumeCommand = async (): Promise<void> => {
    /** @brief 仅本次确认捕获的冻结恢复状态 / Frozen recovery state captured for this confirmation only. */
    const recovery = authorityRecovery
    if (recovery?.kind !== 'outcome-unknown' || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setMutatingResume(true)
    setAuthorityRecoveryError(null)
    try {
      await recovery.confirm()
      setAuthorityRecovery((current) => (current === recovery ? null : current))
    } catch (error: unknown) {
      /** @brief 重放错误对聚合恢复状态机的处置 / Aggregate recovery disposition for the replay error. */
      const disposition = handleMutationError(error, recovery.confirm, recovery.abandon)
      /** @brief 服务端是否已明确终结原命令 / Whether the server definitively terminated the original command. */
      const terminalRejection = isResumeCommandDefinitivelyRejected(error)
      if (disposition === null && terminalRejection) {
        setAuthorityRecovery({ kind: 'authority-required', reason: 'terminal-rejection' })
      }
      if (disposition === null && !terminalRejection) {
        setAuthorityRecoveryError(error)
      }
    } finally {
      mutationInFlightRef.current = false
      setMutatingResume(false)
    }
  }

  const reloadAuthoritativeWorkspace = async (): Promise<void> => {
    if (authorityReloadControllerRef.current !== null) return
    /** @brief 本次权威重读独占的取消控制器 / Abort controller exclusively owned by this authority reload. */
    const controller = new AbortController()
    authorityReloadControllerRef.current = controller
    setReloadingAuthority(true)
    setAuthorityRecoveryError(null)
    try {
      const { nextEditor, nextTemplates } = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.authority_reload', scope: 'resume' },
        async () => {
          const nextEditor = await gateway.getResumeEditor(
            editor.resume.workspaceId,
            editor.resume.id,
            controller.signal
          )
          controller.signal.throwIfAborted()
          const pinnedTemplate = await loadPinnedResumeTemplate(
            templateCatalog,
            nextEditor.resume.template,
            controller.signal
          )
          controller.signal.throwIfAborted()
          return { nextEditor, nextTemplates: [pinnedTemplate] }
        }
      )
      controller.signal.throwIfAborted()
      setEditor(nextEditor)
      setAvailableTemplates(nextTemplates)
      setAuthorityReloadRevision((current) => current + 1)
      setAuthorityRecovery(null)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      setAuthorityRecoveryError(error)
    } finally {
      if (authorityReloadControllerRef.current === controller) {
        authorityReloadControllerRef.current = null
      }
      if (!controller.signal.aborted) setReloadingAuthority(false)
    }
  }

  /**
   * @brief 放弃无法确认的旧命令并改用权威读取恢复 / Abandon an unconfirmable old command and recover through an authoritative read.
   * @return 无返回值 / No return value.
   */
  const abandonUnknownCommandAndReload = (): void => {
    if (
      authorityRecovery?.kind !== 'outcome-unknown' ||
      isReloadingAuthority ||
      mutationInFlightRef.current
    ) {
      return
    }
    authorityRecovery.abandon()
    setAuthorityRecovery({ kind: 'authority-required', reason: 'abandoned-confirmation' })
    void reloadAuthoritativeWorkspace()
  }

  const togglePane = (pane: ResumePane): void => {
    setVisiblePanes((current) => ({ ...current, [pane]: !current[pane] }))
  }

  const resizeAdjacentPanes = (left: ResumePane, right: ResumePane, delta: number): void => {
    setPaneSizes((current) => {
      const pairTotal = current[left] + current[right]
      const minimum = pairTotal * 0.18
      const nextLeft = Math.min(pairTotal - minimum, Math.max(minimum, current[left] + delta))
      return { ...current, [left]: nextLeft, [right]: pairTotal - nextLeft }
    })
  }

  const panelByKey: Record<ResumePane, React.ReactNode> = {
    assistant: <ResumeAssistantPanel onCloseMobile={(): void => setMobileAssistantOpen(false)} />,
    editor: (
      <ResumeSectionsEditor
        editor={editor}
        gateway={gateway}
        isWriteLocked={isWriteLocked}
        key={editor.resume.id}
        onEditorChange={setEditor}
        onMutationError={handleMutationError}
        runMutation={runResumeMutation}
      />
    ),
    preview: (
      <ResumePreviewPanel
        editor={editor}
        generation={previewGeneration}
        isWriteLocked={isWriteLocked}
        key={previewGeneration}
        pdfSupported={selectedTemplate?.supportedOutputFormats.includes('pdf') === true}
      />
    )
  }

  return (
    <>
      {authorityRecovery === null ? null : (
        <div className="aw-inline-error aw-resume-conflict" role="alert">
          <div>
            <strong>
              {authorityRecovery.kind === 'conflict'
                ? t('resume.workspace.conflictTitle')
                : authorityRecovery.kind === 'rejected'
                  ? t('resume.workspace.operationRejectedTitle')
                  : authorityRecovery.kind === 'authority-required'
                    ? authorityRecovery.reason === 'abandoned-confirmation'
                      ? t('resume.workspace.authorityReadRequiredTitle', {
                          defaultValue: '需要读取服务器版本'
                        })
                      : authorityRecovery.reason === 'invalid-response'
                        ? t('resume.workspace.invalidResponseTitle', {
                            defaultValue: '服务端响应无法确认'
                          })
                        : authorityRecovery.reason === 'idempotency-key-reused'
                          ? t('resume.workspace.idempotencyKeyReusedTitle', {
                              defaultValue: '命令标识发生冲突'
                            })
                          : t('resume.workspace.commandRejectedTitle', {
                              defaultValue: '原操作已被拒绝'
                            })
                    : t('resume.workspace.outcomeUnknownTitle')}
            </strong>
            <p>
              {authorityRecovery.kind === 'conflict'
                ? t('resume.workspace.conflictDescription')
                : authorityRecovery.kind === 'rejected'
                  ? t('resume.workspace.operationRejectedDescription')
                  : authorityRecovery.kind === 'authority-required'
                    ? authorityRecovery.reason === 'abandoned-confirmation'
                      ? t('resume.workspace.abandonedConfirmationDescription', {
                          defaultValue:
                            '已放弃旧命令标识。必须完成权威读取，才能基于保留的草稿创建新操作。'
                        })
                      : authorityRecovery.reason === 'invalid-response'
                        ? t('resume.workspace.outcomeContractDescription', {
                            defaultValue:
                              '服务端成功响应不符合 API v2 契约。请重新读取权威版本；不要重放会返回同一坏响应的命令。'
                          })
                        : authorityRecovery.reason === 'idempotency-key-reused'
                          ? t('resume.workspace.idempotencyKeyReusedDescription', {
                              defaultValue:
                                '服务端拒绝了重复用于不同意图的命令标识。请重新读取权威版本，再创建新操作。'
                            })
                          : t('resume.workspace.commandRejectedDescription', {
                              defaultValue:
                                '服务端已明确拒绝原命令。请重新读取权威版本，再检查保留的本地草稿。'
                            })
                    : t('resume.workspace.outcomeUnknownDescription')}
            </p>
          </div>
          <button
            className="aw-quiet-button"
            disabled={
              authorityRecovery.kind === 'outcome-unknown'
                ? isMutatingResume || isReloadingAuthority || isConfirmationCoolingDown
                : authorityRecovery.kind !== 'rejected' && isReloadingAuthority
            }
            onClick={(): void => {
              if (authorityRecovery.kind === 'rejected') {
                setAuthorityRecovery(null)
                return
              }
              if (authorityRecovery.kind === 'outcome-unknown') {
                void confirmUnknownResumeCommand()
                return
              }
              void reloadAuthoritativeWorkspace()
            }}
            type="button"
          >
            {authorityRecovery.kind === 'rejected'
              ? t('resume.workspace.continueWithLatestAuthority', {
                  defaultValue: '基于最新版本继续'
                })
              : authorityRecovery.kind === 'outcome-unknown'
                ? isMutatingResume
                  ? t('resume.workspace.confirmingCommand', {
                      defaultValue: '正在确认同一命令…'
                    })
                  : isConfirmationCoolingDown
                    ? t('resume.workspace.waitingToConfirm', {
                        defaultValue: '等待服务端允许重试…'
                      })
                    : t('resume.workspace.confirmCommand', {
                        defaultValue: '确认上次操作结果'
                      })
                : isReloadingAuthority
                  ? t('resume.workspace.reloadingAuthority')
                  : t('resume.workspace.reloadAuthority')}
          </button>
          {authorityRecovery.kind === 'outcome-unknown' ? (
            <button
              className="aw-quiet-button"
              disabled={isMutatingResume || isReloadingAuthority}
              onClick={abandonUnknownCommandAndReload}
              type="button"
            >
              {isReloadingAuthority
                ? t('resume.workspace.reloadingAuthority')
                : t('resume.workspace.readAuthorityInstead', {
                    defaultValue: '放弃确认并读取服务器版本'
                  })}
            </button>
          ) : null}
          {authorityRecoveryError !== null ? (
            <span>
              <strong>
                {authorityRecovery.kind === 'outcome-unknown'
                  ? t('resume.workspace.confirmCommandError', {
                      defaultValue: '仍无法确认上次操作结果。'
                    })
                  : t('resume.workspace.reloadAuthorityError')}
              </strong>{' '}
              <ResourceFailureMessage error={authorityRecoveryError} />
            </span>
          ) : null}
        </div>
      )}
      <div
        aria-label={t('resume.mobileTabs', { defaultValue: '移动端面板切换' })}
        className="aw-mobile-tabs"
      >
        <button
          aria-pressed={mobilePane === 'edit'}
          className="aw-tab"
          onClick={(): void => setMobilePane('edit')}
          type="button"
        >
          {t('resume.form', { defaultValue: '内容' })}
        </button>
        <button
          aria-pressed={mobilePane === 'preview'}
          className="aw-tab"
          onClick={(): void => setMobilePane('preview')}
          type="button"
        >
          {t('resume.preview', { defaultValue: '预览' })}
        </button>
        <Link
          aria-disabled={isWriteLocked}
          aria-label={t('resume.workspace.openTemplateSettings', {
            defaultValue: '打开模板与样式设置'
          })}
          className="aw-tab"
          onClick={(event): void => {
            if (isWriteLocked) event.preventDefault()
          }}
          to={`/resumes/${editor.resume.id}/template`}
        >
          <Settings2 aria-hidden="true" size={15} />
          {t('resume.templateSettings', { defaultValue: '模板设置' })}
        </Link>
        <Link className="aw-tab" to={`/resumes/${editor.resume.id}/review?tab=proposals`}>
          <History aria-hidden="true" size={15} />
          {t('resume.review.shortTitle', { defaultValue: '版本与建议' })}
        </Link>
        <button className="aw-tab" onClick={(): void => setMobileAssistantOpen(true)} type="button">
          {t('resume.assistant', { defaultValue: '简历助手' })}
        </button>
      </div>
      <div
        className={`aw-editor-page aw-editor-page--mobile-${mobilePane} ${mobileAssistantOpen ? 'aw-editor-page--mobile-assistant-open' : ''}`}
      >
        <div
          aria-label={t('resume.workspace.windowControls', { defaultValue: '简历窗口控制' })}
          className="aw-resume-window-bar"
          role="toolbar"
        >
          <ResumeWindowTitle
            expanded={visiblePanes.assistant}
            label={t('resume.workspace.assistant', { defaultValue: 'AI 对话' })}
            onToggle={(): void => togglePane('assistant')}
          />
          <ResumeWindowTitle
            expanded={visiblePanes.editor}
            label={t('resume.workspace.editor', { defaultValue: '内容编辑' })}
            onToggle={(): void => togglePane('editor')}
            trailing={<span className="aw-window-meta">{editor.resume.sections.length}</span>}
          />
          <ResumeWindowTitle
            expanded={visiblePanes.preview}
            label={t('resume.workspace.previewWindow', { defaultValue: '预览' })}
            onToggle={(): void => togglePane('preview')}
            trailing={
              <span className="aw-resume-workspace-links">
                <Link
                  className="aw-template-settings-link"
                  to={`/resumes/${editor.resume.id}/review?tab=proposals`}
                >
                  <History aria-hidden="true" size={15} />
                  <span>{t('resume.review.shortTitle', { defaultValue: '版本与建议' })}</span>
                </Link>
                <Link
                  aria-disabled={isWriteLocked}
                  aria-label={t('resume.workspace.openTemplateSettings', {
                    defaultValue: '打开模板与样式设置'
                  })}
                  className="aw-template-settings-link"
                  onClick={(event): void => {
                    if (isWriteLocked) event.preventDefault()
                  }}
                  to={`/resumes/${editor.resume.id}/template`}
                >
                  <Settings2 aria-hidden="true" size={15} />
                  <span>
                    {selectedTemplate === undefined
                      ? t('resume.templateSettings', { defaultValue: '模板设置' })
                      : `${selectedTemplate.name} · v${selectedTemplate.version}`}
                  </span>
                </Link>
              </span>
            }
          />
        </div>
        <div className="aw-resume-workspace-content">
          {RESUME_PANES.map((pane) => {
            /** @brief 当前窗口在可见窗口序列中的位置 / Current pane position in the visible-pane sequence. */
            const visibleIndex = visiblePaneOrder.indexOf(pane)
            /** @brief 当前窗口右侧相邻的可见窗口 / Next visible pane to the right of the current pane. */
            const nextPane = visibleIndex < 0 ? undefined : visiblePaneOrder[visibleIndex + 1]
            const totalVisibleSize = visiblePaneOrder.reduce(
              (total, key) => total + paneSizes[key],
              0
            )
            return (
              <Fragment key={pane}>
                <div
                  className={`aw-resume-workspace-panel aw-resume-workspace-panel--${pane}`}
                  hidden={!visiblePanes[pane]}
                  style={{ flexGrow: paneSizes[pane] }}
                >
                  {panelByKey[pane]}
                </div>
                {visiblePanes[pane] && nextPane !== undefined ? (
                  <ResumePaneSeparator
                    leftPane={pane}
                    onResize={(delta): void => resizeAdjacentPanes(pane, nextPane, delta)}
                    value={paneSizes[pane] / Math.max(totalVisibleSize, 1)}
                  />
                ) : null}
              </Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
