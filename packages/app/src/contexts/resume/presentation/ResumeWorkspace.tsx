import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  History,
  Send,
  Settings2,
  Trash2,
  X
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useResumeRestoreProcess } from '../../../app/AppData'
import type { ResumeRestoreTarget } from '../../../app/AppProcesses'
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
import type { ResumeGateway, UiResumeAssistantMessage } from '../application/gateway'
import type { ResumeTemplateCatalogPort } from '../application/resume-creation'
import { loadPinnedResumeTemplate } from '../application/template-catalog'
import { resumeAssistantFailureMessage } from './resume-assistant-failure'
import {
  asUiResumePartialDate,
  getUiResumeSectionTextViolation,
  replaceUiResumeRichTextText,
  type UiResumeContact,
  type UiResumeContactId,
  type UiResumeDateRange,
  type UiResumeEditorModel,
  type UiResumeItem,
  type UiResumeItemId,
  type UiResumeSection,
  type UiResumeSectionId
} from '../domain/document'
import type {
  UiResumeContactUpdateInput,
  UiResumeItemEditableField,
  UiResumeItemTextField,
  UiResumeItemUpdateInput,
  UiResumeProfileUpdateInput,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiTemplateManifest
} from '../domain/models'
import { ResumePreviewPanel } from './ResumePreviewPanel'
import {
  initialResumeAssistantCommandState,
  resumeAssistantTransition
} from './resume-assistant-machine'
import { selectResumePlainText } from './resume-document-selectors'

/** @brief 桌面简历工作台窗口 / Desktop resume-workspace pane. */
type ResumePane = 'assistant' | 'editor' | 'preview'

/** @brief 紧凑布局当前窗口 / Current pane in compact layouts. */
type MobileResumePane = 'edit' | 'preview'

/** @brief 最近一次 AI 修改可恢复的 revision 对 / Revision pair for the latest undoable AI edit. */
interface ResumeAiUndoState {
  readonly previousRevision: number
  readonly currentRevision: number
}

function aiUndoStorageKey(resumeId: string): string {
  return `aiws.resume-ai-undo.v1:${resumeId}`
}

function readAiUndoState(editor: UiResumeEditorModel): ResumeAiUndoState | null {
  try {
    const encoded = globalThis.sessionStorage?.getItem(aiUndoStorageKey(editor.resume.id))
    if (encoded === null || encoded === undefined) return null
    const value = JSON.parse(encoded) as Partial<ResumeAiUndoState>
    const previousRevision = value.previousRevision
    const currentRevision = value.currentRevision
    if (
      typeof previousRevision === 'number' &&
      typeof currentRevision === 'number' &&
      Number.isSafeInteger(previousRevision) &&
      Number.isSafeInteger(currentRevision) &&
      previousRevision > 0 &&
      currentRevision === editor.resume.revision &&
      previousRevision < currentRevision
    ) {
      return { currentRevision, previousRevision }
    }
  } catch {
    // A stale or unavailable session store never grants a restore action.
  }
  return null
}

function writeAiUndoState(resumeId: string, state: ResumeAiUndoState | null): void {
  try {
    if (state === null) globalThis.sessionStorage?.removeItem(aiUndoStorageKey(resumeId))
    else globalThis.sessionStorage?.setItem(aiUndoStorageKey(resumeId), JSON.stringify(state))
  } catch {
    // The current page still retains the safe revision pair in memory.
  }
}

/** @brief 尚未由服务端确认的板块草稿 / Section draft not yet confirmed by the server. */
interface ResumeSectionDraft {
  /** @brief section 被并发删除后仍用于辨认草稿的标签 / Label retained to identify a draft after concurrent section deletion. */
  readonly sectionLabel: string
  /** @brief 用户确实编辑过的草稿正文 / Draft body explicitly edited by the user. */
  readonly content?: string
  /** @brief 用户确实编辑过的草稿标题 / Draft title explicitly edited by the user. */
  readonly title?: string
}

/** @brief 规范化条目在中间编辑器中的文本字段顺序 / Text-field order for normalized items in the center editor. */
const RESUME_ITEM_TEXT_FIELDS = [
  { field: 'title', label: '条目标题' },
  { field: 'subtitle', label: '副标题' },
  { field: 'organization', label: '组织或院校' },
  { field: 'location', label: '地点' },
  { field: 'url', label: '条目链接' }
] as const satisfies readonly {
  readonly field: UiResumeItemTextField
  readonly label: string
}[]

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
   * @param onSuccess 在释放单写通道前吸收新权威的回调 / Callback adopting new authority before the single-write lane is released.
   * @return 写结果；被当前通道拒绝时为 null / Mutation result, or null when rejected by the active lane.
   */
  <TResult>(
    mutation: () => Promise<TResult>,
    onSuccess?: (result: TResult) => void
  ): Promise<TResult | null>
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
  editor,
  gateway,
  onContinuationAuthorityChanged,
  onEditorChange,
  onCloseMobile
}: {
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  /** @brief 已确认 Proposal 的续答发现更新权威时锁住后续写入 / Locks future writes when a committed Proposal continuation finds a newer authority. */
  readonly onContinuationAuthorityChanged: () => void
  readonly onEditorChange: (editor: UiResumeEditorModel, previousRevision: number) => void
  readonly onCloseMobile: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<readonly UiResumeAssistantMessage[]>([])
  const [commandState, dispatchCommand] = useReducer(
    resumeAssistantTransition,
    initialResumeAssistantCommandState
  )
  /** @brief Conversation 消息读取独立于命令恢复 / Conversation-message read state independent from command recovery. */
  const [threadState, setThreadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<unknown>(null)
  /** @brief 仅等待决策状态持有可点击的 Proposal 权威 / Only the decision-wait state exposes clickable Proposal authority. */
  const pendingProposal =
    commandState.status === 'awaiting-proposal' ? commandState.authority : null
  /** @brief 首次独立恢复仍在进行 / Initial independent hydration remains in progress. */
  const isLoading = threadState === 'loading' || commandState.status === 'loading'
  /** @brief 当前命令正在创建、执行或提交决策 / Current command is creating, executing, or committing a decision. */
  const isSending = [
    'creating-run',
    'running',
    'committing-decision',
    'continuation-running'
  ].includes(commandState.status)
  /** @brief 已进入不可回滚的 Proposal 决策链路 / Proposal decision has entered its irreversible path. */
  const isApplyingProposal =
    commandState.status === 'committing-decision' || commandState.status === 'continuation-running'
  /** @brief 最近失败的准确阶段 / Exact phase of the latest failure. */
  const errorPhase =
    commandState.status === 'retryable-error' || commandState.status === 'terminal-error'
      ? commandState.phase
      : null
  /** @brief 已确认的 Proposal 续答因后续权威版本变化而终止 / Accepted Proposal continuation superseded by a newer authoritative Resume. */
  const isContinuationAuthorityChanged =
    errorPhase === 'continuation' &&
    (commandState.status === 'retryable-error' || commandState.status === 'terminal-error') &&
    commandState.problemCode === 'agent.resume_authority_changed'
  /** @brief 已提交且已应用全部修改的决策 / Accept-all decision that was committed and applied. */
  const acceptedDecisionCommitted =
    errorPhase === 'continuation' &&
    (commandState.status === 'retryable-error' || commandState.status === 'terminal-error') &&
    commandState.decision === 'accept-all'
  /** @brief 消息已可读但精确命令恢复暂不可用 / Messages are readable while exact command recovery is unavailable. */
  const isCommandRecoveryUnavailable =
    (commandState.status === 'retryable-error' || commandState.status === 'terminal-error') &&
    commandState.problemCode === 'resume.assistant_recovery_unavailable'
  const controllerRef = useRef<AbortController | null>(null)
  const assistantInput = useMemo(
    () => ({
      workspaceId: editor.resume.workspaceId,
      resumeId: editor.resume.id,
      resumeRevision: editor.resume.revision,
      resumeTitle: editor.resume.title,
      locale: editor.resume.locale
    }),
    [
      editor.resume.id,
      editor.resume.locale,
      editor.resume.revision,
      editor.resume.title,
      editor.resume.workspaceId
    ]
  )
  /** @brief 当前 Resume 的助手会话身份；revision 变化不应中止已提交 Proposal 的续答 / Assistant-session identity; a revision change must not abort a committed Proposal continuation. */
  const assistantSessionIdentity = `${editor.resume.workspaceId}:${editor.resume.id}`
  /** @brief 每次新请求使用的最新 Resume 输入 / Latest Resume input used by new requests. */
  const assistantInputRef = useRef(assistantInput)

  useEffect((): void => {
    assistantInputRef.current = assistantInput
  }, [assistantInput])

  useEffect((): (() => void) => {
    const controller = new AbortController()
    controllerRef.current = controller
    /** @brief 本次初始加载绑定的输入快照 / Input snapshot bound to this initial load. */
    const loadInput = assistantInputRef.current
    globalThis.queueMicrotask((): void => {
      if (controller.signal.aborted) return
      setError(null)
      setThreadState('loading')
      void gateway.assistant
        .load({ ...loadInput, signal: controller.signal })
        .then((thread): void => {
          setMessages(thread.messages)
          setThreadState('ready')
        })
        .catch((loadError: unknown): void => {
          if (!controller.signal.aborted) {
            setError(loadError)
            setThreadState('error')
          }
        })
      void gateway.assistant
        .recoverCommand({ ...loadInput, signal: controller.signal })
        .then((recovery): void => {
          dispatchCommand({
            type: 'hydration-succeeded',
            pendingProposal: recovery.pendingProposal,
            recoveryProblemCode: recovery.recoveryProblemCode
          })
          if (recovery.recoveryProblemCode !== null) {
            setError(new Error(recovery.recoveryProblemCode))
          }
        })
        .catch((recoveryError: unknown): void => {
          if (!controller.signal.aborted) {
            setError(recoveryError)
            dispatchCommand({
              type: 'command-failed',
              problemCode: 'resume.assistant_recovery_unavailable',
              retryable: true
            })
          }
        })
    })
    return (): void => {
      controller.abort(new DOMException('Resume assistant changed.', 'AbortError'))
      controllerRef.current?.abort(new DOMException('Resume assistant changed.', 'AbortError'))
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [assistantSessionIdentity, gateway.assistant])

  const submitMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const question = draft.trim()
    if (question.length === 0 || isSending) return
    controllerRef.current?.abort(new DOMException('A new assistant request started.', 'AbortError'))
    const controller = new AbortController()
    controllerRef.current = controller
    const optimisticId = `pending-${Date.now()}`
    setMessages([
      ...messages,
      {
        author: 'user',
        id: optimisticId,
        proposalStates: [],
        referenceSourceIds: [],
        text: question
      }
    ])
    setDraft('')
    dispatchCommand({ type: 'command-submitted' })
    dispatchCommand({ type: 'run-started' })
    setError(null)
    void gateway.assistant
      .ask({ ...assistantInput, question, signal: controller.signal })
      .then((thread): void => {
        setMessages(thread.messages)
        if (thread.pendingProposal === null) {
          dispatchCommand({ type: 'command-succeeded' })
        } else {
          dispatchCommand({
            type: 'proposal-received',
            authority: thread.pendingProposal
          })
        }
      })
      .catch((sendError: unknown): void => {
        if (!controller.signal.aborted) {
          setError(sendError)
          dispatchCommand({
            type: 'command-failed',
            problemCode:
              sendError instanceof Error ? sendError.message : 'resume.assistant_request_failed',
            retryable: true
          })
        }
      })
  }

  const decideProposal = (decision: 'accept-all' | 'reject'): void => {
    const authority = pendingProposal
    if (authority === null || isSending) return
    const controller = new AbortController()
    controllerRef.current = controller
    dispatchCommand({ type: 'decision-started', decision })
    setError(null)
    /** @brief 一旦决策已被服务端确认，续答失败也不能回滚已更新的 Resume / A server-confirmed decision must not be rolled back when its continuation fails. */
    let decisionCommitted = false
    void gateway.assistant
      .decideProposal({
        ...assistantInput,
        authority,
        decision: { kind: decision },
        signal: controller.signal
      })
      .then(async (result): Promise<void> => {
        if (result.decision.conflicts.length > 0) {
          throw new Error('resume.assistant_proposal_conflict')
        }
        decisionCommitted = true
        dispatchCommand({ type: 'decision-committed' })
        if (decision === 'accept-all') {
          onEditorChange(result.decision.editor, assistantInput.resumeRevision)
        }
        const continuation = await gateway.assistant.waitForProposalContinuation({
          ...assistantInput,
          continuation: result.continuation,
          signal: controller.signal
        })
        if (controller.signal.aborted) return
        setMessages(continuation.thread.messages)
        if (continuation.problemCode !== null) {
          if (continuation.problemCode === 'agent.resume_authority_changed') {
            onContinuationAuthorityChanged()
          }
          dispatchCommand({
            type: 'continuation-failed',
            problemCode: continuation.problemCode,
            retryable: false
          })
          throw new Error(continuation.problemCode)
        }
        if (continuation.thread.pendingProposal === null) {
          dispatchCommand({ type: 'continuation-succeeded' })
        } else {
          dispatchCommand({
            type: 'proposal-received',
            authority: continuation.thread.pendingProposal
          })
        }
      })
      .catch((decisionError: unknown): void => {
        if (!controller.signal.aborted) {
          setError(decisionError)
          if (!decisionCommitted) {
            dispatchCommand({
              type: 'command-failed',
              problemCode:
                decisionError instanceof Error
                  ? decisionError.message
                  : 'resume.assistant_decision_failed',
              retryable: true
            })
          }
        }
      })
  }

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
        {!isLoading && messages.length === 0 ? (
          <div className="aw-message">
            <p>普通问题只返回建议；明确要求修改时，我会通过安全审批流程更新简历。</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <div
            className={`aw-message${message.author === 'user' ? ' aw-message--user' : ''}`}
            key={message.id}
          >
            {message.proposalStates.length === 0 ? (
              <p>{message.text}</p>
            ) : (
              message.proposalStates.map((proposal) => (
                <div key={proposal.id}>
                  <strong>{proposal.title}</strong>
                  <p>
                    {proposal.status === 'pending'
                      ? '已准备简历修改，等待你的决定。'
                      : proposal.status === 'accepted' || proposal.status === 'partially-accepted'
                        ? '简历修改已接受并应用。'
                        : proposal.status === 'rejected'
                          ? '简历修改已拒绝。'
                          : '简历修改已过期。'}
                  </p>
                </div>
              ))
            )}
            {message.referenceSourceIds.length === 0 ? null : (
              <small className="aw-muted-copy">
                参考知识来源：{message.referenceSourceIds.join('、')}
              </small>
            )}
          </div>
        ))}
        {isLoading || isSending ? (
          <div className="aw-message">
            <p>
              {isSending
                ? isApplyingProposal
                  ? '正在修改简历，正在等待助手完成回复。'
                  : '正在分析请求；明确修改指令将安全应用到当前简历…'
                : '正在恢复简历助手会话…'}
            </p>
          </div>
        ) : null}
        {pendingProposal === null ? null : (
          <div className="aw-message" role="status">
            <strong>{pendingProposal.proposal.title}</strong>
            <p>Agent 准备了 {pendingProposal.proposal.operations.length} 项修改，等待你的决定。</p>
            <div className="aw-inline-actions">
              <button
                className="aw-primary-button"
                disabled={isSending}
                onClick={(): void => decideProposal('accept-all')}
                type="button"
              >
                接受修改
              </button>
              <button
                className="aw-quiet-button"
                disabled={isSending}
                onClick={(): void => decideProposal('reject')}
                type="button"
              >
                拒绝
              </button>
            </div>
          </div>
        )}
        {error === null ? null : (
          <div className="aw-message" role="alert">
            <p>
              {isCommandRecoveryUnavailable
                ? '会话消息已恢复，但正在进行的助手任务状态暂时无法恢复。请稍后刷新重试。'
                : errorPhase === 'continuation'
                  ? isContinuationAuthorityChanged
                    ? '你的决定已经提交，但服务器上的简历又发生了变化。请重新加载权威版本后再继续编辑。'
                    : acceptedDecisionCommitted
                      ? '简历修改已接受并应用。助手确认回复生成失败，不影响已经应用的修改。'
                      : '你的决定已经提交，但助手确认回复生成失败。请稍后重新打开会话。'
                  : resumeAssistantFailureMessage(error)}
            </p>
          </div>
        )}
      </div>
      <form
        aria-label={t('resume.assistantMessageForm', { defaultValue: '简历助手消息' })}
        className="aw-chat-composer"
        onSubmit={submitMessage}
      >
        <textarea
          aria-label={t('resume.workspace.askAssistantLabel', { defaultValue: '询问简历助手' })}
          className="aw-textarea"
          maxLength={2000}
          onChange={(event): void => setDraft(event.currentTarget.value)}
          placeholder={t('resume.askAssistant', {
            defaultValue: '例如：请检查我的简历结构'
          })}
          value={draft}
        />
        <button
          aria-label={t('resume.sendMessage', { defaultValue: '发送消息' })}
          className="aw-icon-button aw-send-button"
          disabled={draft.trim().length === 0 || isLoading || isSending}
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
  authorityReloadRevision,
  editor,
  gateway,
  isWriteLocked,
  onDraftStateChange,
  onEditorChange,
  onMutationError,
  runMutation
}: {
  /** @brief 成功权威重载后递增的草稿重置代际 / Draft-reset generation incremented after a successful authority reload. */
  readonly authorityReloadRevision: number
  readonly editor: UiResumeEditorModel
  readonly gateway: ResumeGateway
  readonly isWriteLocked: boolean
  /** @brief 向工作区报告是否存在浏览器本地草稿 / Report whether browser-local drafts exist to the workspace. */
  readonly onDraftStateChange: (hasDrafts: boolean) => void
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
  /** @brief 规范化条目字段的浏览器本地草稿 / Browser-local drafts for normalized item fields. */
  const [itemDrafts, setItemDrafts] = useState<ReadonlyMap<string, string>>(() => new Map())
  /** @brief 已应用到条目草稿的最近一次权威重载代际 / Latest authority-reload generation applied to item drafts. */
  const [itemDraftAuthorityRevision, setItemDraftAuthorityRevision] =
    useState(authorityReloadRevision)
  /** @brief 当前正在保存的板块 / Section currently being persisted. */
  const [savingSectionId, setSavingSectionId] = useState<UiResumeSectionId | null>(null)
  /** @brief 当前正在保存的条目字段键 / Item-field key currently being persisted. */
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null)
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

  /** @brief 当前编辑器是否含有尚未被服务端确认的本地草稿 / Whether the editor contains local drafts not yet confirmed by the service. */
  const hasLocalDrafts = drafts.size > 0 || itemDrafts.size > 0

  useUnsavedChanges(
    `resume.section-drafts:${editor.resume.id}`,
    hasLocalDrafts || savingSectionId !== null || savingItemKey !== null
  )

  useEffect((): (() => void) => {
    onDraftStateChange(hasLocalDrafts)
    return (): void => onDraftStateChange(false)
  }, [hasLocalDrafts, onDraftStateChange])

  if (itemDraftAuthorityRevision !== authorityReloadRevision) {
    setItemDraftAuthorityRevision(authorityReloadRevision)
    setItemDrafts(new Map())
  }

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

  /** @brief 构造条目字段草稿的稳定本地键 / Build the stable local key for an item-field draft. */
  const itemDraftKey = (
    itemId: UiResumeItemId,
    field: UiResumeItemEditableField | 'dateRange.end' | 'dateRange.start'
  ): string => `${itemId}:${field}`

  /**
   * @brief 构造经历要点草稿的稳定本地键 / Build the stable local key for a highlight draft.
   * @param itemId 目标条目 / Target item.
   * @param highlightIndex 要点索引 / Highlight index.
   * @return 浏览器本地草稿键 / Browser-local draft key.
   */
  const highlightDraftKey = (itemId: UiResumeItemId, highlightIndex: number): string =>
    `${itemId}:highlights:${highlightIndex}`

  /**
   * @brief 提交已经冻结的语义字段命令 / Submit an already frozen semantic-field command.
   * @param dispatch 原样重放同一命令的动作 / Action replaying the same command verbatim.
   * @param key 对应的本地草稿键 / Matching local draft key.
   * @param draft 提交时冻结的草稿正文 / Draft body frozen at submission.
   * @param failureTitle 安全失败提示 / Safe failure title.
   * @return 无返回值 / No return value.
   */
  const submitSemanticCommand = async (
    dispatch: () => Promise<UiResumeEditorModel>,
    key: string,
    draft: string,
    failureTitle: string
  ): Promise<void> => {
    /** @brief 吸收服务端确认的新权威并只清理对应草稿 / Adopt confirmed authority and clear only its matching draft. */
    const accept = (next: UiResumeEditorModel): void => {
      onEditorChange(next)
      setItemDrafts((current) => {
        const remaining = new Map(current)
        if (remaining.get(key) === draft) remaining.delete(key)
        return remaining
      })
      setStructureFailure(null)
    }
    setSavingItemKey(key)
    try {
      await runMutation(dispatch, accept)
    } catch (reason: unknown) {
      /** @brief 根恢复状态机对失败命令的处置 / Root recovery state machine's disposition for the failed command. */
      const disposition = onMutationError(
        reason,
        async (): Promise<void> => accept(await dispatch()),
        (): void => undefined
      )
      if (disposition === null) {
        setStructureFailure({
          error: reason,
          title: failureTitle
        })
      }
    } finally {
      setSavingItemKey(null)
    }
  }

  /**
   * @brief 提交已经冻结的条目字段命令 / Submit an already frozen item-field command.
   * @param command 完整条目更新意图 / Complete item-update intent.
   * @param key 对应的本地草稿键 / Matching local draft key.
   * @param draft 提交时冻结的草稿正文 / Draft body frozen at submission.
   * @return 无返回值 / No return value.
   */
  const submitItemCommand = (
    command: UiResumeItemUpdateInput,
    key: string,
    draft: string
  ): Promise<void> =>
    submitSemanticCommand(
      (): Promise<UiResumeEditorModel> =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_update', scope: 'resume' },
          () => gateway.updateResumeItem(command)
        ),
      key,
      draft,
      '条目修改尚未保存；你的输入仍保留在本页。'
    )

  /** @brief 构造个人资料字段草稿键 / Build a profile-field draft key. */
  const profileDraftKey = (field: 'fullName' | 'headline' | 'summary'): string => `profile:${field}`

  /** @brief 构造联系方式字段草稿键 / Build a contact-field draft key. */
  const contactDraftKey = (
    contactId: UiResumeContactId,
    field: 'label' | 'url' | 'value'
  ): string => `contact:${contactId}:${field}`

  /** @brief 合并一个语义字段的浏览器本地草稿 / Merge one browser-local semantic-field draft. */
  const updateSemanticDraft = (key: string, value: string): void => {
    if (isWriteLocked) return
    setItemDrafts((current) => {
      /** @brief 保留其他未保存字段的新草稿集合 / New draft collection retaining other unsaved fields. */
      const next = new Map(current)
      next.set(key, value)
      return next
    })
  }

  /**
   * @brief 保存姓名或职业标题 / Persist the full name or professional headline.
   * @param field 目标个人资料字段 / Target profile field.
   * @param authoritativeValue 当前权威值 / Current authoritative value.
   * @return 无返回值 / No return value.
   */
  const persistProfileText = async (
    field: 'fullName' | 'headline',
    authoritativeValue: string | null
  ): Promise<void> => {
    /** @brief 当前个人资料字段的草稿键 / Draft key for the current profile field. */
    const key = profileDraftKey(field)
    /** @brief 用户输入的个人资料草稿 / Profile draft entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    if (field === 'fullName' && draft.trim().length === 0) {
      setStructureFailure({
        error: new Error('resume.profile.full_name_required'),
        title: '姓名不能为空。'
      })
      return
    }
    /** @brief 根据字段可空性规范化的值 / Value normalized according to field nullability. */
    const value = field === 'headline' && draft.length === 0 ? null : draft
    if (value === authoritativeValue) return
    /** @brief 冻结权威与个人资料值的命令 / Command freezing authority and the profile value. */
    const command: UiResumeProfileUpdateInput =
      field === 'fullName'
        ? {
            baseRevision: editor.resume.revision,
            commandId: createUiCommandId(),
            concurrencyToken: editor.concurrencyToken,
            field,
            resumeId: editor.resume.id,
            value: draft,
            workspaceId: editor.resume.workspaceId
          }
        : {
            baseRevision: editor.resume.revision,
            commandId: createUiCommandId(),
            concurrencyToken: editor.concurrencyToken,
            field,
            resumeId: editor.resume.id,
            value,
            workspaceId: editor.resume.workspaceId
          }
    await submitSemanticCommand(
      (): Promise<UiResumeEditorModel> =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_update', scope: 'resume' },
          () => gateway.updateResumeProfile(command)
        ),
      key,
      draft,
      '个人资料修改尚未保存；你的输入仍保留在本页。'
    )
  }

  /**
   * @brief 保存个人简介并保留未触及的富文本 marks / Persist profile summary while preserving untouched rich-text marks.
   * @return 无返回值 / No return value.
   */
  const persistProfileSummary = async (): Promise<void> => {
    /** @brief 个人简介草稿键 / Profile-summary draft key. */
    const key = profileDraftKey('summary')
    /** @brief 用户输入的个人简介 / Profile summary entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    /** @brief 由当前权威富文本重定位得到的新简介 / New summary rebased from the authoritative rich text. */
    const value =
      draft.length === 0 ? null : replaceUiResumeRichTextText(editor.resume.profile.summary, draft)
    if (draft === (editor.resume.profile.summary?.text ?? '')) return
    /** @brief 冻结权威与完整简介的命令 / Command freezing authority and the complete summary. */
    const command: UiResumeProfileUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field: 'summary',
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitSemanticCommand(
      (): Promise<UiResumeEditorModel> =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_update', scope: 'resume' },
          () => gateway.updateResumeProfile(command)
        ),
      key,
      draft,
      '个人简介修改尚未保存；你的输入仍保留在本页。'
    )
  }

  /**
   * @brief 保存已有联系方式的一个文本字段 / Persist one text field of an existing contact.
   * @param contact 当前权威联系方式 / Current authoritative contact.
   * @param field 目标字段 / Target field.
   * @return 无返回值 / No return value.
   */
  const persistContact = async (
    contact: UiResumeContact,
    field: 'label' | 'url' | 'value'
  ): Promise<void> => {
    /** @brief 当前联系方式字段草稿键 / Draft key for the current contact field. */
    const key = contactDraftKey(contact.id, field)
    /** @brief 用户输入的联系方式草稿 / Contact draft entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    if (field === 'value' && draft.trim().length === 0) {
      setStructureFailure({
        error: new Error('resume.contact.value_required'),
        title: '联系方式的值不能为空。'
      })
      return
    }
    if (field === 'url' && draft.length > 0) {
      try {
        /** @brief 用于校验安全协议的标准 URL / Standard URL used to validate the safe protocol. */
        const parsed = new URL(draft)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsafe')
      } catch (error: unknown) {
        setStructureFailure({ error, title: '联系方式链接必须是有效的 http 或 https 地址。' })
        return
      }
    }
    /** @brief 根据字段可空性规范化的联系方式值 / Contact value normalized according to field nullability. */
    const value = field === 'value' ? draft : draft.length === 0 ? null : draft
    if (value === contact[field]) return
    /** @brief 冻结权威与联系方式值的命令 / Command freezing authority and the contact value. */
    const command: UiResumeContactUpdateInput =
      field === 'value'
        ? {
            baseRevision: editor.resume.revision,
            commandId: createUiCommandId(),
            concurrencyToken: editor.concurrencyToken,
            contactId: contact.id,
            field,
            resumeId: editor.resume.id,
            value: draft,
            workspaceId: editor.resume.workspaceId
          }
        : {
            baseRevision: editor.resume.revision,
            commandId: createUiCommandId(),
            concurrencyToken: editor.concurrencyToken,
            contactId: contact.id,
            field,
            resumeId: editor.resume.id,
            value,
            workspaceId: editor.resume.workspaceId
          }
    await submitSemanticCommand(
      (): Promise<UiResumeEditorModel> =>
        runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.section_update', scope: 'resume' },
          () => gateway.updateResumeContact(command)
        ),
      key,
      draft,
      '联系方式修改尚未保存；你的输入仍保留在本页。'
    )
  }

  /**
   * @brief 保存一个规范化条目文本字段 / Persist one normalized item text field.
   * @param itemId 目标条目 / Target item.
   * @param field 目标字段 / Target field.
   * @param authoritativeValue 当前权威值 / Current authoritative value.
   * @return 无返回值 / No return value.
   */
  const persistItem = async (
    itemId: UiResumeItemId,
    field: UiResumeItemTextField,
    authoritativeValue: string | null
  ): Promise<void> => {
    /** @brief 当前条目字段的稳定草稿键 / Stable draft key for the current item field. */
    const key = itemDraftKey(itemId, field)
    /** @brief 用户实际输入的字段草稿 / Field draft actually entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    /** @brief 空文本规范化为协议允许的 null / Empty text normalized to the protocol's nullable value. */
    const value = draft.length === 0 ? null : draft
    if (value === authoritativeValue) {
      setItemDrafts((current) => {
        /** @brief 删除已满足意图后的剩余条目草稿 / Remaining item drafts after removing the satisfied intent. */
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    /** @brief 冻结权威与字段值的条目更新命令 / Item-update command freezing authority and field value. */
    const command: UiResumeItemUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field,
      itemId,
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitItemCommand(command, key, draft)
  }

  /**
   * @brief 保存一个经历要点并保留其他要点 / Persist one highlight while retaining the other highlights.
   * @param item 当前权威条目 / Current authoritative item.
   * @param highlightIndex 目标要点索引 / Target highlight index.
   * @return 无返回值 / No return value.
   */
  const persistItemHighlight = async (
    item: UiResumeItem,
    highlightIndex: number
  ): Promise<void> => {
    /** @brief 当前要点的稳定草稿键 / Stable draft key for the current highlight. */
    const key = highlightDraftKey(item.id, highlightIndex)
    /** @brief 用户实际输入的要点草稿 / Highlight draft actually entered by the user. */
    const draft = itemDrafts.get(key)
    /** @brief 当前权威要点 / Current authoritative highlight. */
    const authoritativeHighlight = item.highlights[highlightIndex]
    if (
      draft === undefined ||
      authoritativeHighlight === undefined ||
      savingItemKey !== null ||
      isWriteLocked
    ) {
      return
    }
    if (draft === authoritativeHighlight.text) {
      setItemDrafts((current) => {
        /** @brief 删除未改变要点后的剩余草稿 / Remaining drafts after removing an unchanged highlight. */
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    /** @brief 替换目标正文并保留其他要点的完整数组 / Complete array replacing the target text and retaining other highlights. */
    const value = item.highlights.map((highlight, index) =>
      index === highlightIndex ? replaceUiResumeRichTextText(highlight, draft) : highlight
    )
    /** @brief 冻结权威与完整要点数组的条目命令 / Item command freezing authority and the complete highlights array. */
    const command: UiResumeItemUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field: 'highlights',
      itemId: item.id,
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitItemCommand(command, key, draft)
  }

  /**
   * @brief 保存条目摘要并安全重定位富文本 marks / Persist an item summary and safely rebase rich-text marks.
   * @param item 当前权威条目 / Current authoritative item.
   * @return 无返回值 / No return value.
   */
  const persistItemSummary = async (item: UiResumeItem): Promise<void> => {
    /** @brief 摘要字段的稳定草稿键 / Stable draft key for the summary field. */
    const key = itemDraftKey(item.id, 'summary')
    /** @brief 用户实际输入的摘要草稿 / Summary draft actually entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    if (draft === (item.summary?.text ?? '')) {
      setItemDrafts((current) => {
        /** @brief 删除未改变摘要后的剩余草稿 / Remaining drafts after removing an unchanged summary. */
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    /** @brief 空摘要映射为 null，否则安全替换富文本正文 / Null for an empty summary, otherwise safely replaced rich text. */
    const value = draft.length === 0 ? null : replaceUiResumeRichTextText(item.summary, draft)
    /** @brief 冻结权威与完整摘要的条目命令 / Item command freezing authority and the complete summary. */
    const command: UiResumeItemUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field: 'summary',
      itemId: item.id,
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitItemCommand(command, key, draft)
  }

  /**
   * @brief 保存一行一个的技能列表 / Persist a one-skill-per-line list.
   * @param item 当前权威条目 / Current authoritative item.
   * @return 无返回值 / No return value.
   */
  const persistItemSkills = async (item: UiResumeItem): Promise<void> => {
    /** @brief 技能字段的稳定草稿键 / Stable draft key for the skills field. */
    const key = itemDraftKey(item.id, 'skills')
    /** @brief 用户实际输入的技能草稿 / Skills draft actually entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    /** @brief 去除空行后的完整有序技能 / Complete ordered skills after removing blank lines. */
    const value = draft
      .split(/\r?\n/u)
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0)
    if (
      value.length === item.skills.length &&
      value.every((skill, index) => skill === item.skills[index])
    ) {
      setItemDrafts((current) => {
        /** @brief 删除未改变技能后的剩余草稿 / Remaining drafts after removing unchanged skills. */
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    /** @brief 冻结权威与完整技能列表的条目命令 / Item command freezing authority and the complete skills list. */
    const command: UiResumeItemUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field: 'skills',
      itemId: item.id,
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitItemCommand(command, key, draft)
  }

  /**
   * @brief 保存条目日期范围的一侧 / Persist one boundary of an item date range.
   * @param item 当前权威条目 / Current authoritative item.
   * @param boundary 起始或结束边界 / Start or end boundary.
   * @return 无返回值 / No return value.
   */
  const persistItemDateBoundary = async (
    item: UiResumeItem,
    boundary: 'end' | 'start'
  ): Promise<void> => {
    /** @brief 日期边界的稳定草稿键 / Stable draft key for the date boundary. */
    const key = itemDraftKey(item.id, `dateRange.${boundary}`)
    /** @brief 用户实际输入的日期草稿 / Date draft actually entered by the user. */
    const draft = itemDrafts.get(key)
    if (draft === undefined || savingItemKey !== null || isWriteLocked) return
    /** @brief 当前权威日期边界 / Current authoritative date boundary. */
    const authoritativeValue = item.dateRange?.[boundary] ?? null
    /** @brief 经契约校验并保留精度的新日期边界 / New date boundary validated against the contract while preserving precision. */
    let nextStart = item.dateRange?.start ?? null
    /** @brief 合并后的结束日期 / Merged end date. */
    let nextEnd = item.dateRange?.end ?? null
    try {
      if (boundary === 'start') {
        nextStart = draft.length === 0 ? null : asUiResumePartialDate(draft)
      } else {
        nextEnd =
          draft.length === 0 ? null : draft === 'present' ? 'present' : asUiResumePartialDate(draft)
      }
    } catch (error: unknown) {
      setStructureFailure({
        error,
        title: '日期格式无效；请使用 YYYY、YYYY-MM、YYYY-MM-DD 或 present。'
      })
      return
    }
    /** @brief 经契约校验并保留精度的新日期边界 / New date boundary validated against the contract while preserving precision. */
    const nextBoundary = boundary === 'start' ? nextStart : nextEnd
    if (nextBoundary === authoritativeValue) {
      setItemDrafts((current) => {
        /** @brief 删除未改变日期后的剩余草稿 / Remaining drafts after removing an unchanged date. */
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    /** @brief 合并另一侧权威值后的完整日期范围 / Complete date range merged with the other authoritative boundary. */
    const nextRange: UiResumeDateRange = {
      end: nextEnd,
      start: nextStart
    }
    /** @brief 两侧均为空时使用 null 的规范化日期值 / Normalized date value using null when both boundaries are empty. */
    const value = nextRange.start === null && nextRange.end === null ? null : nextRange
    /** @brief 冻结权威与完整日期范围的条目命令 / Item command freezing authority and the complete date range. */
    const command: UiResumeItemUpdateInput = {
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      field: 'dateRange',
      itemId: item.id,
      resumeId: editor.resume.id,
      value,
      workspaceId: editor.resume.workspaceId
    }
    await submitItemCommand(command, key, draft)
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
      await runMutation(
        () => dispatchSectionCommand(commandAttempt),
        (next): void => acceptSectionCommand(next, section.id, field)
      )
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
      await runMutation(
        () => dispatchReorderCommand(commandAttempt),
        (next): void => {
          onEditorChange(next)
          setStructureFailure(null)
        }
      )
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
      await runMutation(
        () => dispatchDeleteCommand(commandAttempt),
        (next): void => {
          onEditorChange(next)
          setStructureFailure(null)
          setFocusedSectionId(next.resume.sections.at(0)?.id ?? null)
          setDeleteCandidate(null)
        }
      )
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
      <article className="aw-resume-section-editor is-focused">
        <header className="aw-resume-section-heading">
          <div>
            <h3>个人信息</h3>
            <span>profile</span>
          </div>
        </header>
        <div className="aw-section-focus-editor">
          {(
            [
              { field: 'fullName', label: '姓名' },
              { field: 'headline', label: '职业标题' }
            ] as const
          ).map(({ field, label }) => {
            /** @brief 当前个人资料字段的稳定草稿键 / Stable draft key for the current profile field. */
            const key = profileDraftKey(field)
            /** @brief 草稿优先的个人资料字段值 / Draft-first profile-field value. */
            const value = itemDrafts.get(key) ?? editor.resume.profile[field] ?? ''
            return (
              <label key={field}>
                <span>{label}</span>
                <input
                  aria-label={label}
                  className="aw-text-input"
                  disabled={isWriteLocked || savingItemKey === key}
                  onBlur={(): void => {
                    void persistProfileText(field, editor.resume.profile[field])
                  }}
                  onChange={(event): void => updateSemanticDraft(key, event.currentTarget.value)}
                  value={value}
                />
              </label>
            )
          })}
          {(() => {
            /** @brief 个人简介草稿键 / Profile-summary draft key. */
            const key = profileDraftKey('summary')
            /** @brief 草稿优先的个人简介 / Draft-first profile summary. */
            const value = itemDrafts.get(key) ?? editor.resume.profile.summary?.text ?? ''
            return (
              <label>
                <span>个人简介</span>
                <textarea
                  aria-label="个人简介"
                  className="aw-section-textarea"
                  disabled={isWriteLocked || savingItemKey === key}
                  onBlur={(): void => {
                    void persistProfileSummary()
                  }}
                  onChange={(event): void => updateSemanticDraft(key, event.currentTarget.value)}
                  value={value}
                />
              </label>
            )
          })()}
          {editor.resume.profile.contacts.map((contact, contactIndex) => (
            <article className="aw-rich-text-shell" key={contact.id}>
              <strong>联系方式 {contactIndex + 1}</strong>
              {(
                [
                  { field: 'label', label: `联系方式 ${contactIndex + 1} 的标签` },
                  { field: 'value', label: `联系方式 ${contactIndex + 1} 的值` },
                  { field: 'url', label: `联系方式 ${contactIndex + 1} 的链接` }
                ] as const
              ).map(({ field, label }) => {
                /** @brief 当前联系方式字段草稿键 / Draft key for the current contact field. */
                const key = contactDraftKey(contact.id, field)
                /** @brief 草稿优先的联系方式字段值 / Draft-first contact-field value. */
                const value = itemDrafts.get(key) ?? contact[field] ?? ''
                return (
                  <label key={field}>
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      className="aw-text-input"
                      disabled={isWriteLocked || savingItemKey === key}
                      onBlur={(): void => {
                        void persistContact(contact, field)
                      }}
                      onChange={(event): void =>
                        updateSemanticDraft(key, event.currentTarget.value)
                      }
                      value={value}
                    />
                  </label>
                )
              })}
            </article>
          ))}
        </div>
      </article>
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
                    <span>
                      {t('resume.editor.semanticContent', {
                        defaultValue: '板块补充说明（可选）'
                      })}
                    </span>
                    <div className="aw-rich-text-shell">
                      <textarea
                        aria-label={t('resume.editor.semanticContent', {
                          defaultValue: '板块补充说明（可选）'
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
                  {section.items.map((item, itemIndex) => (
                    <article className="aw-rich-text-shell" key={item.id}>
                      <strong>结构化条目 {itemIndex + 1}</strong>
                      {RESUME_ITEM_TEXT_FIELDS.map(({ field, label }) => {
                        /** @brief 当前条目字段的本地草稿键 / Local draft key for this item field. */
                        const key = itemDraftKey(item.id, field)
                        /** @brief 草稿优先、否则使用权威字段值 / Draft-first value falling back to the authoritative field. */
                        const value = itemDrafts.get(key) ?? item[field] ?? ''
                        return (
                          <label key={field}>
                            <span>{label}</span>
                            <input
                              aria-label={`${label} ${itemIndex + 1}`}
                              className="aw-text-input"
                              disabled={isWriteLocked || savingItemKey === key}
                              onBlur={(): void => {
                                void persistItem(item.id, field, item[field])
                              }}
                              onChange={(event): void => {
                                const nextValue = event.currentTarget.value
                                setItemDrafts((current) => {
                                  /** @brief 合并本次输入且保留其他字段草稿 / Merge this input while retaining other field drafts. */
                                  const next = new Map(current)
                                  next.set(key, nextValue)
                                  return next
                                })
                              }}
                              value={value}
                            />
                          </label>
                        )
                      })}
                      {(['start', 'end'] as const).map((boundary) => {
                        /** @brief 当前日期边界的本地草稿键 / Local draft key for the current date boundary. */
                        const key = itemDraftKey(item.id, `dateRange.${boundary}`)
                        /** @brief 草稿优先的日期边界值 / Draft-first date-boundary value. */
                        const value = itemDrafts.get(key) ?? item.dateRange?.[boundary] ?? ''
                        /** @brief 当前日期边界的可访问标签 / Accessible label for the current date boundary. */
                        const label = `${boundary === 'start' ? '开始日期' : '结束日期'} ${itemIndex + 1}`
                        return (
                          <label key={key}>
                            <span>{label}</span>
                            <input
                              aria-label={label}
                              className="aw-text-input"
                              disabled={isWriteLocked || savingItemKey === key}
                              onBlur={(): void => {
                                void persistItemDateBoundary(item, boundary)
                              }}
                              onChange={(event): void => {
                                const nextValue = event.currentTarget.value
                                setItemDrafts((current) => {
                                  /** @brief 合并本次日期输入后的草稿 / Drafts after merging this date input. */
                                  const next = new Map(current)
                                  next.set(key, nextValue)
                                  return next
                                })
                              }}
                              placeholder={boundary === 'end' ? 'YYYY-MM 或 present' : 'YYYY-MM'}
                              value={value}
                            />
                          </label>
                        )
                      })}
                      {(() => {
                        /** @brief 条目摘要的本地草稿键 / Local draft key for the item summary. */
                        const key = itemDraftKey(item.id, 'summary')
                        /** @brief 草稿优先的条目摘要 / Draft-first item summary. */
                        const value = itemDrafts.get(key) ?? item.summary?.text ?? ''
                        /** @brief 当前摘要的可访问标签 / Accessible label for the current summary. */
                        const label = `条目摘要 ${itemIndex + 1}`
                        return (
                          <label>
                            <span>{label}</span>
                            <textarea
                              aria-label={label}
                              className="aw-section-textarea"
                              disabled={isWriteLocked || savingItemKey === key}
                              onBlur={(): void => {
                                void persistItemSummary(item)
                              }}
                              onChange={(event): void => {
                                const nextValue = event.currentTarget.value
                                setItemDrafts((current) => {
                                  /** @brief 合并本次摘要输入后的草稿 / Drafts after merging this summary input. */
                                  const next = new Map(current)
                                  next.set(key, nextValue)
                                  return next
                                })
                              }}
                              value={value}
                            />
                          </label>
                        )
                      })()}
                      {item.highlights.map((highlight, highlightIndex) => {
                        /** @brief 当前经历要点的本地草稿键 / Local draft key for the current highlight. */
                        const key = highlightDraftKey(item.id, highlightIndex)
                        /** @brief 草稿优先的经历要点正文 / Draft-first highlight text. */
                        const value = itemDrafts.get(key) ?? highlight.text
                        /** @brief 当前要点的可访问标签 / Accessible label for the current highlight. */
                        const label = `经历要点 ${itemIndex + 1}-${highlightIndex + 1}`
                        return (
                          <label key={key}>
                            <span>{label}</span>
                            <textarea
                              aria-label={label}
                              className="aw-section-textarea"
                              disabled={isWriteLocked || savingItemKey === key}
                              onBlur={(): void => {
                                void persistItemHighlight(item, highlightIndex)
                              }}
                              onChange={(event): void => {
                                const nextValue = event.currentTarget.value
                                setItemDrafts((current) => {
                                  /** @brief 合并本次要点输入后的草稿 / Drafts after merging this highlight input. */
                                  const next = new Map(current)
                                  next.set(key, nextValue)
                                  return next
                                })
                              }}
                              value={value}
                            />
                          </label>
                        )
                      })}
                      {(() => {
                        /** @brief 技能列表的本地草稿键 / Local draft key for the skills list. */
                        const key = itemDraftKey(item.id, 'skills')
                        /** @brief 草稿优先的一行一个技能正文 / Draft-first one-skill-per-line text. */
                        const value = itemDrafts.get(key) ?? item.skills.join('\n')
                        /** @brief 当前技能列表的可访问标签 / Accessible label for the current skills list. */
                        const label = `技能 ${itemIndex + 1}`
                        return (
                          <label>
                            <span>{label}</span>
                            <textarea
                              aria-label={label}
                              className="aw-section-textarea"
                              disabled={isWriteLocked || savingItemKey === key}
                              onBlur={(): void => {
                                void persistItemSkills(item)
                              }}
                              onChange={(event): void => {
                                const nextValue = event.currentTarget.value
                                setItemDrafts((current) => {
                                  /** @brief 合并本次技能输入后的草稿 / Drafts after merging this skills input. */
                                  const next = new Map(current)
                                  next.set(key, nextValue)
                                  return next
                                })
                              }}
                              value={value}
                            />
                          </label>
                        )
                      })()}
                    </article>
                  ))}
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
  const restoreProcess = useResumeRestoreProcess()
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
  /** @brief 当前单写通道内可等待的完整 mutation / Complete active mutation that PDF generation may await. */
  const mutationPromiseRef = useRef<Promise<unknown> | null>(null)
  /** @brief 不依赖 React commit 即可读取的最新 Resume 权威 / Latest Resume authority readable without waiting for a React commit. */
  const latestEditorRef = useRef(initialEditor)
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief 当前权威重读独占的取消控制器 / Abort controller exclusively owned by the current authority reload. */
  const authorityReloadControllerRef = useRef<AbortController | null>(null)
  /** @brief 当前聚合恢复动作的安全错误 / Safe error from the current aggregate-recovery action. */
  const [authorityRecoveryError, setAuthorityRecoveryError] = useState<unknown>(null)
  const [authorityReloadRevision, setAuthorityReloadRevision] = useState(0)
  /** @brief 中栏是否存在尚未保存到服务端的本地草稿 / Whether the editor pane has browser-local drafts not yet saved to the service. */
  const [hasEditorDrafts, setHasEditorDrafts] = useState(false)
  const [mobilePane, setMobilePane] = useState<MobileResumePane>('preview')
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false)
  const [aiUndo, setAiUndo] = useState<ResumeAiUndoState | null>(() =>
    readAiUndoState(initialEditor)
  )
  const [aiUndoError, setAiUndoError] = useState<unknown>(null)
  const [isUndoingAiEdit, setUndoingAiEdit] = useState(false)
  const [autoRenderRevision, setAutoRenderRevision] = useState<number | null>(null)
  const aiUndoAbortRef = useRef<AbortController | null>(null)

  useEffect(
    (): (() => void) => (): void =>
      aiUndoAbortRef.current?.abort(new DOMException('Resume workspace closed.', 'AbortError')),
    []
  )

  const applyAssistantEditor = (
    nextEditor: UiResumeEditorModel,
    previousRevision: number
  ): void => {
    const state = {
      currentRevision: nextEditor.resume.revision,
      previousRevision
    }
    setEditor(nextEditor)
    setAiUndo(state)
    writeAiUndoState(nextEditor.resume.id, state)
    setAiUndoError(null)
    setAutoRenderRevision(nextEditor.resume.revision)
  }

  const undoLatestAiEdit = async (): Promise<void> => {
    if (aiUndo === null || isUndoingAiEdit) return
    if (editor.resume.revision !== aiUndo.currentRevision) {
      setAiUndo(null)
      writeAiUndoState(editor.resume.id, null)
      setAiUndoError(new Error('resume.ai_undo_revision_changed'))
      return
    }
    aiUndoAbortRef.current?.abort(new DOMException('A newer AI undo started.', 'AbortError'))
    const controller = new AbortController()
    aiUndoAbortRef.current = controller
    setUndoingAiEdit(true)
    setAiUndoError(null)
    const target: ResumeRestoreTarget = {
      currentRevision: aiUndo.currentRevision,
      resumeId: editor.resume.id,
      sourceRevision: aiUndo.previousRevision,
      workspaceId: editor.resume.workspaceId
    }
    try {
      let authority = await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.restore', scope: 'resume' },
        () =>
          restoreProcess.start({
            ...target,
            commandId: createUiCommandId(),
            concurrencyToken: editor.concurrencyToken,
            signal: controller.signal
          })
      )
      if (authority.job.status === 'queued' || authority.job.status === 'running') {
        authority = await restoreProcess.watchToTerminal(
          target,
          authority,
          controller.signal,
          (): void => undefined
        )
      }
      if (authority.job.status !== 'succeeded') {
        throw new Error('resume.ai_undo_job_failed')
      }
      const restored = await restoreProcess.readRestoredResume(
        target,
        authority.job,
        controller.signal
      )
      controller.signal.throwIfAborted()
      setEditor(restored)
      setAiUndo(null)
      writeAiUndoState(restored.resume.id, null)
      setAutoRenderRevision(restored.resume.revision)
    } catch (error: unknown) {
      if (!controller.signal.aborted) setAiUndoError(error)
    } finally {
      if (aiUndoAbortRef.current === controller) aiUndoAbortRef.current = null
      if (!controller.signal.aborted) setUndoingAiEdit(false)
    }
  }

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
  const isWriteLocked = authorityRecovery !== null || isMutatingResume || isUndoingAiEdit
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
  /**
   * @brief 同步吸收一份新 Resume 权威 / Synchronously adopt a new Resume authority.
   * @param nextEditor 服务端确认的新权威 / New authority confirmed by the service.
   * @return 无返回值 / No return value.
   */
  const adoptEditor = (nextEditor: UiResumeEditorModel): void => {
    latestEditorRef.current = nextEditor
    setEditor(nextEditor)
  }

  const runResumeMutation: RunResumeMutation = async <TResult,>(
    mutation: () => Promise<TResult>,
    onSuccess?: (result: TResult) => void
  ): Promise<TResult | null> => {
    if (mutationInFlightRef.current || authorityRecovery !== null) return null
    mutationInFlightRef.current = true
    setMutatingResume(true)
    /** @brief 包含权威吸收步骤的完整单写任务 / Complete single-lane task including authority adoption. */
    const pending = (async (): Promise<TResult> => {
      const result = await mutation()
      onSuccess?.(result)
      return result
    })()
    mutationPromiseRef.current = pending
    try {
      return await pending
    } finally {
      if (mutationPromiseRef.current === pending) mutationPromiseRef.current = null
      mutationInFlightRef.current = false
      setMutatingResume(false)
    }
  }

  /**
   * @brief 若保存正在进行则把 PDF 请求排到新 revision / Defer a PDF request to the new revision while a save is active.
   * @return 本次请求是否已被延迟处理 / Whether the current request was handled by deferral.
   */
  const deferPdfRenderUntilMutationSettles = async (): Promise<boolean> => {
    const pending = mutationPromiseRef.current
    if (pending === null) return false
    try {
      await pending
    } catch {
      return true
    }
    setAutoRenderRevision(latestEditorRef.current.resume.revision)
    return true
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
    assistant: (
      <ResumeAssistantPanel
        editor={editor}
        gateway={gateway}
        onContinuationAuthorityChanged={(): void => {
          setAuthorityRecovery((current) => current ?? { kind: 'conflict', status: 409 })
        }}
        onEditorChange={applyAssistantEditor}
        onCloseMobile={(): void => setMobileAssistantOpen(false)}
      />
    ),
    editor: (
      <ResumeSectionsEditor
        authorityReloadRevision={authorityReloadRevision}
        editor={editor}
        gateway={gateway}
        isWriteLocked={isWriteLocked}
        key={editor.resume.id}
        onDraftStateChange={setHasEditorDrafts}
        onEditorChange={adoptEditor}
        onMutationError={handleMutationError}
        runMutation={runResumeMutation}
      />
    ),
    preview: (
      <ResumePreviewPanel
        autoStart={autoRenderRevision === editor.resume.revision}
        deferRenderUntilMutationSettles={deferPdfRenderUntilMutationSettles}
        editor={editor}
        generation={previewGeneration}
        hasUnsavedChanges={hasEditorDrafts}
        isWriteLocked={isWriteLocked}
        onAutoStartConsumed={(): void => setAutoRenderRevision(null)}
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
        <Link
          aria-disabled={isWriteLocked}
          className="aw-tab"
          onClick={(event): void => {
            if (isWriteLocked) event.preventDefault()
          }}
          to={`/resumes/${editor.resume.id}/export`}
        >
          <Download aria-hidden="true" size={15} />
          {t('resume.output.shortTitle', { defaultValue: '生成与导出' })}
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
                  aria-disabled={isWriteLocked}
                  className="aw-template-settings-link"
                  onClick={(event): void => {
                    if (isWriteLocked) event.preventDefault()
                  }}
                  to={`/resumes/${editor.resume.id}/export`}
                >
                  <Download aria-hidden="true" size={15} />
                  <span>{t('resume.output.shortTitle', { defaultValue: '生成与导出' })}</span>
                </Link>
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
        {aiUndo === null && aiUndoError === null ? null : (
          <div className="aw-inline-error" role={aiUndoError === null ? 'status' : 'alert'}>
            <div>
              <strong>
                {aiUndoError === null ? 'AI 已修改简历并正在更新 PDF' : '无法撤销本次 AI 修改'}
              </strong>
              <p>
                {aiUndoError === null
                  ? `已从版本 ${aiUndo?.previousRevision ?? ''} 生成新版本 ${aiUndo?.currentRevision ?? ''}。`
                  : '简历内容保持当前状态。请重新加载后再试。'}
              </p>
            </div>
            {aiUndo === null || aiUndoError !== null ? null : (
              <button
                className="aw-button aw-button--secondary"
                disabled={isUndoingAiEdit || isWriteLocked}
                onClick={(): void => void undoLatestAiEdit()}
                type="button"
              >
                {isUndoingAiEdit ? '正在撤销…' : '撤销本次 AI 修改'}
              </button>
            )}
          </div>
        )}
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
