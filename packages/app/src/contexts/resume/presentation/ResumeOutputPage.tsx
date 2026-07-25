/** @file Resume 最终生成与语义导出的完整产品页 / Complete product page for Resume final generation and semantic export. */

import {
  ArrowLeft,
  BadgeCheck,
  CircleX,
  Download,
  FileArchive,
  FileJson,
  FileText,
  LoaderCircle,
  ShieldCheck
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  sanitizeArtifactFileName,
  type ResumeArtifactSaveKind,
  type SaveArtifactResult
} from '@ai-job-workspace/platform'

import {
  useAsyncResource,
  useResumeGateway,
  useResumeRenderProcess,
  useResumeTemplateCatalog,
  useWorkspaceSession
} from '../../../app/AppData'
import {
  type ResolvedResumeRenderOutput,
  type ResumeRenderSpecification,
  workspaceJobNeedsPolling
} from '../../../app/AppProcesses'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { useArtifactSave } from '../../../app/Host'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { useUnsavedChanges } from '../../../app/UnsavedChanges'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId, type UiCommandId } from '../../../shared-kernel/command'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../shared-kernel/identity'
import { nextDeadlineTimerDelayMilliseconds } from '../../../shared-kernel/polling'
import { EmptyState, LoadingState } from '../../../ui'
import type {
  UiWorkspaceArtifact,
  UiWorkspaceJob,
  UiWorkspaceJobAuthority
} from '../../workspace-operations'
import {
  getResumeCommandRetryAfterMilliseconds,
  getResumeConflictStatus,
  getResumeIdempotencyConflict,
  isResumeCommandDefinitivelyRejected,
  isResumeUnreplayableContractResponse
} from '../application/errors'
import { loadPinnedResumeTemplate } from '../application/template-catalog'
import type { UiResumeEditorModel } from '../domain/document'
import type { UiResumeRenderFormat, UiResumeRenderMode, UiTemplateManifest } from '../domain/models'
import {
  deriveResumeRenderFormatAvailability,
  type ResumeRenderFormatAvailability
} from '../domain/render-policy'

/** @brief 输出页面首屏资源 / First-screen resources for the output page. */
type ResumeOutputResources =
  | {
      /** @brief 当前身份没有可选 Workspace / The current identity has no selectable Workspace. */
      readonly kind: 'no-workspace'
    }
  | {
      /** @brief 已取得 Workspace-scoped Resume 与固定模板权威 / Workspace-scoped Resume and pinned Template authorities are available. */
      readonly kind: 'workspace'
      /** @brief 当前完整 Resume 权威 / Current complete Resume authority. */
      readonly editor: UiResumeEditorModel
      /** @brief Resume 精确固定的不可变模板 / Immutable Template pinned exactly by the Resume. */
      readonly template: UiTemplateManifest
      /** @brief 当前授权路径中的 Workspace / Workspace in the current authorization path. */
      readonly workspaceId: UiWorkspaceId
      /** @brief 当前 Workspace 展示名 / Current Workspace display name. */
      readonly workspaceName: string
    }

/** @brief 一次创建 Render Job 的冻结信封 / Frozen envelope for one Render-Job creation. */
interface FrozenRenderIntent {
  /** @brief 同一确认序列中稳定的命令 identity / Command identity stable throughout one confirmation sequence. */
  readonly commandId: UiCommandId
  /** @brief 不随界面后续状态变化的 mode、formats 与 Resume revision / Mode, formats, and Resume revision unaffected by later UI state. */
  readonly specification: ResumeRenderSpecification
}

/** @brief 创建命令失败后的安全恢复方式 / Safe recovery mode after a create-command failure. */
type StartRecovery = 'none' | 'exact-replay' | 'unreplayable-unknown' | 'definitively-rejected'

/** @brief Job cancellation 的冻结信封 / Frozen envelope for Job cancellation. */
interface FrozenCancelIntent {
  /** @brief 首次 cancellation 使用的 Job 与强 ETag / Job and strong ETag used by the first cancellation request. */
  readonly authority: UiWorkspaceJobAuthority
  /** @brief 同一 cancellation 确认序列中稳定的命令 identity / Command identity stable throughout one cancellation confirmation sequence. */
  readonly commandId: UiCommandId
}

/** @brief cancellation 失败后的安全恢复方式 / Safe recovery mode after a cancellation failure. */
type CancelRecovery = 'none' | 'exact-replay' | 'refresh-required'

/** @brief 单个格式最近一次宿主保存的可访问状态 / Accessible status of the latest host save for one format. */
interface ArtifactSaveFeedback {
  /** @brief 保存结果或失败 / Save result or failure. */
  readonly result: SaveArtifactResult | null
  /** @brief 已脱敏呈现的保存错误 / Save error rendered through the sanitized failure projection. */
  readonly error: unknown
}

/** @brief API v2 Resume Render 格式到 Artifact kind 的闭合映射 / Closed mapping from API v2 Resume Render formats to Artifact kinds. */
const ARTIFACT_KIND_BY_FORMAT: Readonly<Record<UiResumeRenderFormat, ResumeArtifactSaveKind>> = {
  docx: 'resume_docx',
  json: 'resume_json',
  pdf: 'resume_pdf'
}

/** @brief 输出格式的稳定展示顺序 / Stable display order for output formats. */
const FORMAT_ORDER: readonly UiResumeRenderFormat[] = ['json', 'pdf', 'docx']

/**
 * @brief 判断 Job 是否处于可观察和可取消状态 / Determine whether a Job remains observable and cancellable.
 * @param job 已核对的 Job / Validated Job.
 * @return queued 或 running 时为 true / True for queued or running.
 */
function isPendingJob(job: UiWorkspaceJob): boolean {
  return workspaceJobNeedsPolling(job)
}

/**
 * @brief 格式化 Artifact 字节数 / Format an Artifact byte count.
 * @param bytes 非负字节数 / Non-negative byte count.
 * @param locale 当前界面语言 / Current interface locale.
 * @return 适合元数据卡片的本地化大小 / Localized size suitable for a metadata card.
 */
function formatArtifactBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${new Intl.NumberFormat(locale).format(bytes)} B`
  /** @brief 采用二进制单位的候选集合 / Candidate binary units. */
  const units = ['KiB', 'MiB', 'GiB'] as const
  /** @brief 当前缩放值 / Current scaled value. */
  let value = bytes / 1024
  /** @brief 当前二进制单位位置 / Current binary-unit index. */
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

/**
 * @brief 格式化 API 时间戳 / Format an API timestamp.
 * @param timestamp ISO 时间戳 / ISO timestamp.
 * @param locale 当前界面语言 / Current interface locale.
 * @return 本地日期时间 / Localized date and time.
 */
function formatOutputTimestamp(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

/**
 * @brief 取得稳定本地化格式标签 / Get a stable localized format label.
 * @param format API v2 Render 格式 / API v2 Render format.
 * @return 用户可识别的文件格式 / User-recognizable file format.
 */
function formatLabel(format: UiResumeRenderFormat): string {
  return format.toUpperCase()
}

/**
 * @brief 用产品固定顺序呈现格式集合 / Render a format set in product-canonical order.
 * @param formats 冻结格式集合 / Frozen format set.
 * @return 逗号分隔的格式标签 / Comma-separated format labels.
 */
function formatSetLabel(formats: readonly UiResumeRenderFormat[]): string {
  /** @brief 当前集合 / Current set. */
  const selected = new Set(formats)
  return FORMAT_ORDER.filter((format) => selected.has(format))
    .map(formatLabel)
    .join(' + ')
}

/**
 * @brief 判断 Artifact 在当前时刻是否过期 / Determine whether an Artifact is expired now.
 * @param artifact 权威 Artifact metadata / Authoritative Artifact metadata.
 * @param nowMilliseconds 当前 epoch 毫秒 / Current epoch milliseconds.
 * @return 有限 expires_at 已到达时为 true / True when a finite expires_at has been reached.
 */
function artifactIsExpired(artifact: UiWorkspaceArtifact, nowMilliseconds: number): boolean {
  return artifact.expiresAt !== null && Date.parse(artifact.expiresAt) <= nowMilliseconds
}

/**
 * @brief 一次性安排下一次 Artifact 到期检查 / Schedule the next Artifact-expiry check once.
 * @param outputs 当前已解析输出 / Currently resolved outputs.
 * @param onDeadline 到期或安全 timer 分段完成后的回调 / Callback after expiry or one safe timer segment.
 * @return 清理函数 / Cleanup function.
 */
function scheduleNextArtifactExpiry(
  outputs: readonly ResolvedResumeRenderOutput[],
  onDeadline: () => void
): () => void {
  /** @brief 当前时钟 / Current clock. */
  const now = Date.now()
  /** @brief 尚未到期的有限截止时间 / Finite future expiry deadlines. */
  const futureDeadlines = outputs
    .map(({ artifact }) =>
      artifact.expiresAt === null ? Number.NaN : Date.parse(artifact.expiresAt)
    )
    .filter((deadline) => Number.isFinite(deadline) && deadline > now)
  if (futureDeadlines.length === 0) return (): void => undefined
  /** @brief 最近的到期时间 / Nearest expiry deadline. */
  const nearest = Math.min(...futureDeadlines)
  /** @brief 当前宿主可安全表达的下一段等待 / Next wait segment safely expressible by the host. */
  const delay = nextDeadlineTimerDelayMilliseconds(nearest, now)
  if (delay === null) return (): void => undefined
  /** @brief 到期检查 timer / Expiry-check timer. */
  const timer = globalThis.setTimeout(onDeadline, delay)
  return (): void => globalThis.clearTimeout(timer)
}

/** @brief 生成页工作区属性 / Output-workspace properties. */
interface ResumeOutputWorkspaceProps {
  /** @brief 首屏已验证资源 / Validated first-screen resources. */
  readonly resources: Extract<ResumeOutputResources, { readonly kind: 'workspace' }>
}

/**
 * @brief Resume 最终生成与导出工作区 / Resume final-generation and export workspace.
 * @param props 当前 Workspace、Resume 与精确 TemplateManifest / Current Workspace, Resume, and exact TemplateManifest.
 * @return 具备安全异步生命周期和独立保存操作的产品页面 / Product page with a safe async lifecycle and independent save actions.
 */
function ResumeOutputWorkspace({ resources }: ResumeOutputWorkspaceProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const diagnostics = useDiagnostics()
  const artifactSave = useArtifactSave()
  const renderProcess = useResumeRenderProcess()
  /** @brief 固定模板与 API v2 能力的闭合交集 / Closed intersection of the pinned Template and API v2 capabilities. */
  const availability = useMemo<ResumeRenderFormatAvailability>(
    () => deriveResumeRenderFormatAvailability(resources.template.supportedOutputFormats),
    [resources.template.supportedOutputFormats]
  )
  /** @brief 当前已确认或观察到的 Job 权威 / Current confirmed or observed Job authority. */
  const [jobAuthority, setJobAuthority] = useState<UiWorkspaceJobAuthority | null>(null)
  /** @brief 当前 Job 绑定的冻结 Render 规格 / Frozen Render specification bound to the current Job. */
  const [activeSpecification, setActiveSpecification] = useState<ResumeRenderSpecification | null>(
    null
  )
  /** @brief 成功 Job 严格解析出的全部输出 / Every output strictly resolved from a succeeded Job. */
  const [outputs, setOutputs] = useState<readonly ResolvedResumeRenderOutput[]>([])
  /** @brief 创建或观察 Job 的最近失败 / Latest failure while creating or observing the Job. */
  const [workflowError, setWorkflowError] = useState<unknown>(null)
  /** @brief 创建命令的安全恢复方式 / Safe recovery mode for the create command. */
  const [startRecovery, setStartRecovery] = useState<StartRecovery>('none')
  /** @brief 创建命令 Retry-After 的绝对截止时间 / Absolute Retry-After deadline for the create command. */
  const [startRetryDeadline, setStartRetryDeadline] = useState<number | null>(null)
  /** @brief 当前是否正在创建、读取或解析 / Whether create, read, or resolution work is active. */
  const [isProcessing, setProcessing] = useState(false)
  /** @brief cancellation 最近失败 / Latest cancellation failure. */
  const [cancelError, setCancelError] = useState<unknown>(null)
  /** @brief cancellation 的安全恢复方式 / Safe cancellation recovery mode. */
  const [cancelRecovery, setCancelRecovery] = useState<CancelRecovery>('none')
  /** @brief cancellation Retry-After 的绝对截止时间 / Absolute Retry-After deadline for cancellation. */
  const [cancelRetryDeadline, setCancelRetryDeadline] = useState<number | null>(null)
  /** @brief 当前是否正在提交 cancellation 或重读权威 / Whether cancellation or authority refresh is active. */
  const [isCancelling, setCancelling] = useState(false)
  /** @brief 放弃未知本地跟踪后的持久安全说明 / Persistent safety notice after abandoning uncertain local tracking. */
  const [trackingNotice, setTrackingNotice] = useState<string | null>(null)
  /** @brief 当前宿主保存中的唯一格式 / Sole format currently being saved by the host. */
  const [savingFormat, setSavingFormat] = useState<UiResumeRenderFormat | null>(null)
  /** @brief 各格式最近宿主保存结果 / Latest host-save feedback by format. */
  const [saveFeedback, setSaveFeedback] = useState<
    Partial<Record<UiResumeRenderFormat, ArtifactSaveFeedback>>
  >({})
  /** @brief 用于重新计算到期状态的本地时钟 / Local clock used to recompute expiry state. */
  const [artifactClock, setArtifactClock] = useState(Date.now)
  /** @brief 同步防止同一 React commit 双击创建 / Synchronous guard against duplicate creates within one React commit. */
  const processingRef = useRef(false)
  /** @brief 同步防止同一 React commit 双击 cancellation / Synchronous guard against duplicate cancellations within one React commit. */
  const cancellingRef = useRef(false)
  /** @brief 同步强制宿主保存单通道 / Synchronous guard enforcing one host-save lane. */
  const savingRef = useRef(false)
  /** @brief 仍需确认或明确放弃的创建意图 / Create intent still requiring confirmation or explicit abandonment. */
  const frozenIntentRef = useRef<FrozenRenderIntent | null>(null)
  /** @brief 仍需确认或安全重读的 cancellation 意图 / Cancellation intent still requiring confirmation or safe authority refresh. */
  const cancelIntentRef = useRef<FrozenCancelIntent | null>(null)
  /** @brief 防止旧异步响应覆盖的新 Job 权威 / Latest Job authority protected from stale async responses. */
  const jobAuthorityRef = useRef<UiWorkspaceJobAuthority | null>(null)
  /** @brief 当前创建、观察或解析生命周期 / Current create, observe, or resolve lifecycle. */
  const workflowAbortRef = useRef<AbortController | null>(null)
  /** @brief 当前 cancellation 生命周期 / Current cancellation lifecycle. */
  const cancelAbortRef = useRef<AbortController | null>(null)
  /** @brief 当前宿主保存生命周期 / Current host-save lifecycle. */
  const saveAbortRef = useRef<AbortController | null>(null)

  /**
   * @brief 提交不倒退的 Job 权威 / Commit a Job authority without regression.
   * @param authority 新读取权威 / Newly read authority.
   */
  const commitJobAuthority = useCallback((authority: UiWorkspaceJobAuthority): void => {
    /** @brief 当前已提交权威 / Currently committed authority. */
    const current = jobAuthorityRef.current
    if (
      current !== null &&
      current.job.id === authority.job.id &&
      (authority.job.revision < current.job.revision ||
        (!isPendingJob(current.job) && isPendingJob(authority.job)))
    ) {
      return
    }
    jobAuthorityRef.current = authority
    setJobAuthority(authority)
    if (!isPendingJob(authority.job)) {
      cancelIntentRef.current = null
      setCancelRecovery('none')
      setCancelRetryDeadline(null)
    }
  }, [])

  /**
   * @brief 重置为新的显式 Render 意图 / Reset the workspace for a new explicit Render intent.
   * @param specification 新意图的冻结规格 / Frozen specification for the new intent.
   */
  const resetForNewIntent = useCallback((specification: ResumeRenderSpecification): void => {
    workflowAbortRef.current?.abort()
    cancelAbortRef.current?.abort()
    saveAbortRef.current?.abort()
    jobAuthorityRef.current = null
    cancelIntentRef.current = null
    setJobAuthority(null)
    setActiveSpecification(specification)
    setOutputs([])
    setWorkflowError(null)
    setStartRecovery('none')
    setStartRetryDeadline(null)
    setCancelError(null)
    setCancelRecovery('none')
    setCancelRetryDeadline(null)
    setTrackingNotice(null)
    setSavingFormat(null)
    setSaveFeedback({})
    setArtifactClock(Date.now())
  }, [])

  /**
   * @brief 观察已知 Job 到终态并解析全部输出 / Observe a known Job to terminal and resolve every output.
   * @param initial 已知 Job 权威 / Known Job authority.
   * @param specification Job 绑定的冻结规格 / Frozen specification bound to the Job.
   */
  const observeKnownJob = useCallback(
    async (
      initial: UiWorkspaceJobAuthority,
      specification: ResumeRenderSpecification
    ): Promise<void> => {
      workflowAbortRef.current?.abort()
      /** @brief 当前观察 controller / Controller for the current observation. */
      const controller = new AbortController()
      workflowAbortRef.current = controller
      processingRef.current = true
      setProcessing(true)
      setWorkflowError(null)
      try {
        commitJobAuthority(initial)
        /** @brief 当前观察得到的终态 / Terminal authority produced by this observation. */
        const terminal = isPendingJob(initial.job)
          ? await renderProcess.watchToTerminal(
              specification,
              initial,
              controller.signal,
              commitJobAuthority
            )
          : initial
        controller.signal.throwIfAborted()
        commitJobAuthority(terminal)
        if (terminal.job.status !== 'succeeded') return
        /** @brief 严格匹配请求格式的输出集合 / Outputs strictly matching the requested formats. */
        const resolved = await renderProcess.resolveOutputs(
          specification,
          terminal.job,
          controller.signal
        )
        controller.signal.throwIfAborted()
        setOutputs(resolved)
        setArtifactClock(Date.now())
      } catch (error: unknown) {
        if (!controller.signal.aborted) setWorkflowError(error)
      } finally {
        if (workflowAbortRef.current === controller) workflowAbortRef.current = null
        processingRef.current = false
        if (!controller.signal.aborted) setProcessing(false)
      }
    },
    [commitJobAuthority, renderProcess]
  )

  /**
   * @brief 提交或原样确认冻结的 Render 创建命令 / Submit or exactly confirm a frozen Render create command.
   * @param intent 完整冻结信封 / Complete frozen envelope.
   */
  const dispatchFrozenIntent = useCallback(
    async (intent: FrozenRenderIntent): Promise<void> => {
      if (processingRef.current || startRetryDeadline !== null) return
      workflowAbortRef.current?.abort()
      /** @brief 当前 POST 生命周期 / Current POST lifecycle. */
      const controller = new AbortController()
      workflowAbortRef.current = controller
      processingRef.current = true
      setProcessing(true)
      setWorkflowError(null)
      setTrackingNotice(null)
      try {
        /** @brief 已接受且核对后的 Job 权威 / Accepted and validated Job authority. */
        const authority = await runDiagnosticCommand(
          diagnostics,
          { operation: 'resume.render', scope: 'resume' },
          () =>
            renderProcess.start({
              commandId: intent.commandId,
              ...intent.specification,
              signal: controller.signal
            })
        )
        controller.signal.throwIfAborted()
        frozenIntentRef.current = null
        setStartRecovery('none')
        setStartRetryDeadline(null)
        commitJobAuthority(authority)
        processingRef.current = false
        setProcessing(false)
        if (workflowAbortRef.current === controller) workflowAbortRef.current = null
        await observeKnownJob(authority, intent.specification)
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          /** @brief 已验证幂等冲突 / Validated idempotency conflict. */
          const idempotency = getResumeIdempotencyConflict(error)
          /** @brief 不泄漏技术内容的失败类别 / Failure category without technical content leakage. */
          const failure = classifyResourceFailure(error)
          if (idempotency === 'in-progress' || failure.kind === 'outcome-unknown') {
            frozenIntentRef.current = intent
            setStartRecovery('exact-replay')
            /** @brief 服务端允许下一次精确确认的等待 / Delay until the next exact confirmation is permitted. */
            const retryAfter = getResumeCommandRetryAfterMilliseconds(error)
            setStartRetryDeadline(retryAfter === null ? null : Date.now() + retryAfter)
          } else if (isResumeUnreplayableContractResponse(error)) {
            frozenIntentRef.current = intent
            setStartRecovery('unreplayable-unknown')
            setStartRetryDeadline(null)
          } else {
            frozenIntentRef.current = null
            setStartRecovery(
              idempotency === 'key-reused' || isResumeCommandDefinitivelyRejected(error)
                ? 'definitively-rejected'
                : 'none'
            )
            setStartRetryDeadline(null)
          }
          setWorkflowError(error)
        }
      } finally {
        if (workflowAbortRef.current === controller) workflowAbortRef.current = null
        processingRef.current = false
        if (!controller.signal.aborted) setProcessing(false)
      }
    },
    [commitJobAuthority, diagnostics, observeKnownJob, renderProcess, startRetryDeadline]
  )

  /**
   * @brief 由用户选择创建 final 或 export Job / Create a final or export Job selected by the user.
   * @param mode 产品意图 / Product intent.
   * @param formats 由固定模板策略推导的闭合格式 / Closed formats derived from the pinned-Template policy.
   */
  const startRender = (
    mode: Extract<UiResumeRenderMode, 'export' | 'final'>,
    formats: readonly UiResumeRenderFormat[]
  ): void => {
    if (
      processingRef.current ||
      cancellingRef.current ||
      savingRef.current ||
      frozenIntentRef.current !== null ||
      formats.length === 0
    ) {
      return
    }
    /** @brief 本次点击冻结的规格 / Specification frozen by this click. */
    const specification: ResumeRenderSpecification = Object.freeze({
      formats: Object.freeze([...formats]),
      mode,
      resumeId: resources.editor.resume.id,
      resumeRevision: resources.editor.resume.revision,
      workspaceId: resources.workspaceId
    })
    /** @brief 本次点击冻结的完整信封 / Complete envelope frozen by this click. */
    const intent: FrozenRenderIntent = Object.freeze({
      commandId: createUiCommandId(),
      specification
    })
    frozenIntentRef.current = intent
    resetForNewIntent(specification)
    void dispatchFrozenIntent(intent)
  }

  /**
   * @brief 对未知结果原样重放冻结创建信封 / Replay the frozen create envelope exactly after an unknown outcome.
   */
  const confirmSameCreate = (): void => {
    /** @brief 唯一允许确认的原信封 / Sole original envelope eligible for confirmation. */
    const intent = frozenIntentRef.current
    if (intent === null || startRecovery !== 'exact-replay') return
    void dispatchFrozenIntent(intent)
  }

  /**
   * @brief 显式放弃未知创建命令的本地跟踪 / Explicitly abandon local tracking of an uncertain create command.
   * @note 该动作不声称取消服务端可能已接受的任务 / This action never claims to cancel a task the service may have accepted.
   */
  const abandonUnknownTracking = (): void => {
    workflowAbortRef.current?.abort()
    frozenIntentRef.current = null
    processingRef.current = false
    setProcessing(false)
    setStartRecovery('none')
    setStartRetryDeadline(null)
    setWorkflowError(null)
    setTrackingNotice(
      t('resume.output.abandonedNotice', {
        defaultValue:
          '已停止在本页跟踪旧命令。这不会取消服务端可能已经接受的任务；开始新任务前请留意重复输出。'
      })
    )
  }

  /**
   * @brief 只通过 GET 继续观察已知 Job / Continue a known Job using GET reads only.
   */
  const continueKnownJob = async (): Promise<void> => {
    /** @brief 当前已知 Job 与冻结规格 / Current known Job and frozen specification. */
    const authority = jobAuthorityRef.current
    const specification = activeSpecification
    if (
      authority === null ||
      specification === null ||
      processingRef.current ||
      cancellingRef.current
    ) {
      return
    }
    workflowAbortRef.current?.abort()
    /** @brief 当前安全重读 controller / Controller for the current safe refresh. */
    const controller = new AbortController()
    workflowAbortRef.current = controller
    processingRef.current = true
    setProcessing(true)
    setWorkflowError(null)
    try {
      /** @brief GET 返回的最新 Job 权威 / Latest Job authority returned by GET. */
      const refreshed = await renderProcess.refreshJob(
        specification,
        authority.job.id,
        controller.signal
      )
      controller.signal.throwIfAborted()
      commitJobAuthority(refreshed)
      processingRef.current = false
      setProcessing(false)
      if (workflowAbortRef.current === controller) workflowAbortRef.current = null
      await observeKnownJob(refreshed, specification)
    } catch (error: unknown) {
      if (!controller.signal.aborted) setWorkflowError(error)
    } finally {
      if (workflowAbortRef.current === controller) workflowAbortRef.current = null
      processingRef.current = false
      if (!controller.signal.aborted) setProcessing(false)
    }
  }

  /**
   * @brief 提交或原样确认冻结 cancellation / Submit or exactly confirm a frozen cancellation.
   * @param intent 完整冻结 cancellation 信封 / Complete frozen cancellation envelope.
   */
  const dispatchCancellation = async (intent: FrozenCancelIntent): Promise<void> => {
    /** @brief cancellation 绑定的冻结 Render 规格 / Frozen Render specification bound to cancellation. */
    const specification = activeSpecification
    if (cancellingRef.current || cancelRetryDeadline !== null || specification === null) return
    workflowAbortRef.current?.abort()
    processingRef.current = false
    setProcessing(false)
    cancelAbortRef.current?.abort()
    /** @brief 当前 cancellation controller / Current cancellation controller. */
    const controller = new AbortController()
    cancelAbortRef.current = controller
    cancellingRef.current = true
    setCancelling(true)
    setCancelError(null)
    try {
      /** @brief cancellation 返回的 Job 权威 / Job authority returned by cancellation. */
      const updated = await renderProcess.cancel(
        specification,
        intent.authority,
        intent.commandId,
        controller.signal
      )
      controller.signal.throwIfAborted()
      commitJobAuthority(updated)
      cancelIntentRef.current = null
      setCancelRecovery('none')
      setCancelRetryDeadline(null)
      if (isPendingJob(updated.job)) {
        cancellingRef.current = false
        setCancelling(false)
        if (cancelAbortRef.current === controller) cancelAbortRef.current = null
        await observeKnownJob(updated, specification)
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        /** @brief cancellation 幂等状态 / Cancellation idempotency state. */
        const idempotency = getResumeIdempotencyConflict(error)
        /** @brief cancellation 结果的安全类别 / Safe category of the cancellation outcome. */
        const failure = classifyResourceFailure(error)
        if (idempotency === 'in-progress' || failure.kind === 'outcome-unknown') {
          cancelIntentRef.current = intent
          setCancelRecovery('exact-replay')
          /** @brief cancellation 确认截止时间 / Cancellation-confirmation deadline. */
          const retryAfter = getResumeCommandRetryAfterMilliseconds(error)
          setCancelRetryDeadline(retryAfter === null ? null : Date.now() + retryAfter)
        } else {
          cancelIntentRef.current = null
          setCancelRecovery(
            isResumeUnreplayableContractResponse(error) ||
              getResumeConflictStatus(error) !== null ||
              idempotency === 'key-reused'
              ? 'refresh-required'
              : 'none'
          )
          setCancelRetryDeadline(null)
        }
        setCancelError(error)
      }
    } finally {
      if (cancelAbortRef.current === controller) cancelAbortRef.current = null
      cancellingRef.current = false
      if (!controller.signal.aborted) setCancelling(false)
    }
  }

  /**
   * @brief 取消当前 queued/running Job / Cancel the current queued or running Job.
   */
  const cancelJob = (): void => {
    /** @brief 最新 Job 权威 / Latest Job authority. */
    const authority = jobAuthorityRef.current
    if (
      authority === null ||
      !isPendingJob(authority.job) ||
      activeSpecification === null ||
      cancellingRef.current
    ) {
      return
    }
    /** @brief 首次点击冻结的 cancellation / Cancellation frozen by the first click. */
    const intent: FrozenCancelIntent = Object.freeze({
      authority,
      commandId: createUiCommandId()
    })
    cancelIntentRef.current = intent
    void dispatchCancellation(intent)
  }

  /**
   * @brief 原样确认结果未知的 cancellation / Exactly confirm a cancellation with an unknown outcome.
   */
  const confirmSameCancellation = (): void => {
    /** @brief 唯一允许确认的 cancellation / Sole cancellation eligible for confirmation. */
    const intent = cancelIntentRef.current
    if (intent === null || cancelRecovery !== 'exact-replay') return
    void dispatchCancellation(intent)
  }

  /**
   * @brief 放弃 cancellation POST 确认并只继续读取 Job / Abandon cancellation POST confirmation and continue only reading the Job.
   */
  const abandonCancellationAndRefresh = (): void => {
    cancelIntentRef.current = null
    setCancelRecovery('none')
    setCancelRetryDeadline(null)
    setCancelError(null)
    setTrackingNotice(
      t('resume.output.cancelAbandonedNotice', {
        defaultValue:
          '已停止确认取消命令；这不会撤销服务端可能已经处理的取消。接下来只读取该任务的权威状态。'
      })
    )
    void continueKnownJob()
  }

  /**
   * @brief 将一个已验证输出交给宿主保存 / Ask the host to save one validated output.
   * @param output 已完成跨资源核对的输出 / Output that passed cross-resource validation.
   */
  const saveOutput = async (output: ResolvedResumeRenderOutput): Promise<void> => {
    /** @brief 点击时的当前时钟 / Current clock at click time. */
    const now = Date.now()
    /** @brief 当前宿主限制 / Current host limit. */
    const limit = artifactSave.maximumArtifactBytes
    if (
      savingRef.current ||
      artifactIsExpired(output.artifact, now) ||
      (limit !== null && output.artifact.sizeBytes > limit)
    ) {
      setArtifactClock(now)
      return
    }
    savingRef.current = true
    saveAbortRef.current?.abort()
    /** @brief 当前宿主保存 controller / Current host-save controller. */
    const controller = new AbortController()
    saveAbortRef.current = controller
    setSavingFormat(output.format)
    setSaveFeedback((current) => ({
      ...current,
      [output.format]: { error: null, result: null }
    }))
    try {
      /** @brief 宿主保存判别结果 / Discriminated host-save result. */
      const result = await artifactSave.saveArtifact(
        {
          artifactId: output.artifactId,
          suggestedFileName: sanitizeArtifactFileName(
            `${resources.editor.resume.profile.fullName} Resume`,
            ARTIFACT_KIND_BY_FORMAT[output.format]
          ),
          workspaceId: resources.workspaceId
        },
        controller.signal
      )
      controller.signal.throwIfAborted()
      setSaveFeedback((current) => ({
        ...current,
        [output.format]: { error: null, result }
      }))
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setSaveFeedback((current) => ({
          ...current,
          [output.format]: { error, result: null }
        }))
      }
    } finally {
      if (saveAbortRef.current === controller) saveAbortRef.current = null
      savingRef.current = false
      if (!controller.signal.aborted) setSavingFormat(null)
    }
  }

  useEffect((): (() => void) => {
    return scheduleNextArtifactExpiry(outputs, (): void => setArtifactClock(Date.now()))
  }, [artifactClock, outputs])

  useEffect((): (() => void) | undefined => {
    if (startRetryDeadline === null) return undefined
    /** @brief 当前安全 timer 分段 / Current safe timer segment. */
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null
    /** @brief 安排一个或多个宿主安全分段 / Schedule one or more host-safe segments. */
    const schedule = (): void => {
      /** @brief 下一段 Retry-After / Next Retry-After segment. */
      const delay = nextDeadlineTimerDelayMilliseconds(startRetryDeadline)
      if (delay === null) {
        setStartRetryDeadline(null)
        return
      }
      timer = globalThis.setTimeout(schedule, delay)
    }
    schedule()
    return (): void => {
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }, [startRetryDeadline])

  useEffect((): (() => void) | undefined => {
    if (cancelRetryDeadline === null) return undefined
    /** @brief 当前安全 timer 分段 / Current safe timer segment. */
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null
    /** @brief 安排一个或多个 cancellation Retry-After 分段 / Schedule one or more cancellation Retry-After segments. */
    const schedule = (): void => {
      /** @brief 下一段 cancellation Retry-After / Next cancellation Retry-After segment. */
      const delay = nextDeadlineTimerDelayMilliseconds(cancelRetryDeadline)
      if (delay === null) {
        setCancelRetryDeadline(null)
        return
      }
      timer = globalThis.setTimeout(schedule, delay)
    }
    schedule()
    return (): void => {
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }, [cancelRetryDeadline])

  useEffect(
    (): (() => void) => () => {
      workflowAbortRef.current?.abort()
      cancelAbortRef.current?.abort()
      saveAbortRef.current?.abort()
    },
    []
  )

  /** @brief 当前 Job 的进度 / Current Job progress. */
  const jobProgress = jobAuthority?.job.progress ?? null
  /** @brief 创建命令是否仍有未知结果 / Whether the create command still has an unknown outcome. */
  const createOutcomeUncertain =
    startRecovery === 'exact-replay' || startRecovery === 'unreplayable-unknown'
  /** @brief 是否允许开始新的产品意图 / Whether a new product intent may start. */
  const canStartNew =
    !isProcessing &&
    !isCancelling &&
    savingFormat === null &&
    !createOutcomeUncertain &&
    (jobAuthority === null || !isPendingJob(jobAuthority.job))
  /** @brief 离开页面会丢失且不能跨会话猜测恢复的活动跟踪 / Active tracking that would be lost and cannot be guessed across sessions. */
  const hasUnsettledTracking =
    createOutcomeUncertain ||
    cancelRecovery === 'exact-replay' ||
    (jobAuthority !== null && isPendingJob(jobAuthority.job)) ||
    (isProcessing && jobAuthority === null)
  useUnsavedChanges('resume-output-tracking', hasUnsettledTracking)

  return (
    <main className="aw-page aw-resume-output-page">
      <Link
        aria-disabled={hasUnsettledTracking}
        className="aw-back-link"
        onClick={(event): void => {
          if (hasUnsettledTracking) event.preventDefault()
        }}
        to={`/resumes/${resources.editor.resume.id}/edit`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {t('resume.output.backToEditor', { defaultValue: '返回编辑器' })}
      </Link>

      <header className="aw-output-header">
        <div>
          <p className="aw-output-eyebrow">
            {resources.workspaceName} · {resources.template.name} v{resources.template.version}
          </p>
          <h1>{t('resume.output.title', { defaultValue: '生成与导出' })}</h1>
          <p>
            {t('resume.output.description', {
              defaultValue: '从当前 Resume 版本生成可交付文件，或导出语义 JSON 与模板支持的文件。'
            })}
          </p>
        </div>
        <span className="aw-output-revision">
          {t('resume.output.revision', {
            defaultValue: '固定版本 {{revision}}',
            revision: resources.editor.resume.revision
          })}
        </span>
      </header>

      <section
        aria-label={t('resume.output.intentOptions', { defaultValue: '生成方式' })}
        className="aw-output-intent-grid"
      >
        <article className="aw-output-intent-card">
          <span className="aw-output-intent-icon">
            <BadgeCheck aria-hidden="true" size={22} />
          </span>
          <div>
            <h2>{t('resume.output.finalTitle', { defaultValue: '最终文件' })}</h2>
            <p>
              {t('resume.output.finalDescription', {
                defaultValue:
                  '一次任务生成模板支持的 PDF/DOCX。这里的“最终”仅表示交付意图，不会发布、锁定或改写 Resume。'
              })}
            </p>
          </div>
          <div aria-label={t('resume.output.availableFormats', { defaultValue: '可用格式' })}>
            {availability.finalFormats.length === 0 ? (
              <span className="aw-output-format-empty">
                {t('resume.output.noFinalFormats', {
                  defaultValue: '当前模板没有可交付的 PDF 或 DOCX 格式'
                })}
              </span>
            ) : (
              availability.finalFormats.map((format) => (
                <span className="aw-output-format-chip" key={format}>
                  {formatLabel(format)}
                </span>
              ))
            )}
          </div>
          <button
            className="aw-primary-button"
            disabled={!canStartNew || availability.finalFormats.length === 0}
            onClick={(): void => startRender('final', availability.finalFormats)}
            type="button"
          >
            {t('resume.output.generateFinal', {
              defaultValue: '生成最终文件（{{formats}}）',
              formats: formatSetLabel(availability.finalFormats)
            })}
          </button>
        </article>

        <article className="aw-output-intent-card">
          <span className="aw-output-intent-icon">
            <FileArchive aria-hidden="true" size={22} />
          </span>
          <div>
            <h2>{t('resume.output.exportTitle', { defaultValue: '完整导出' })}</h2>
            <p>
              {t('resume.output.exportDescription', {
                defaultValue:
                  '一次任务导出语义 JSON，并附带当前模板支持的 PDF/DOCX；JSON 不依赖模板格式能力。'
              })}
            </p>
          </div>
          <div aria-label={t('resume.output.availableFormats', { defaultValue: '可用格式' })}>
            {availability.exportFormats.map((format) => (
              <span className="aw-output-format-chip" key={format}>
                {formatLabel(format)}
              </span>
            ))}
          </div>
          <button
            className="aw-primary-button"
            disabled={!canStartNew}
            onClick={(): void => startRender('export', availability.exportFormats)}
            type="button"
          >
            {t('resume.output.generateExport', {
              defaultValue: '导出语义与文件（{{formats}}）',
              formats: formatSetLabel(availability.exportFormats)
            })}
          </button>
        </article>
      </section>

      <aside className="aw-output-safety-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <p>
          {t('resume.output.safetyNote', {
            defaultValue:
              '每次点击都会把 mode、全部 formats 和当前 Resume revision 冻结为一个任务；PNG 与 HTML 快照不会发送给 Render API。'
          })}
        </p>
      </aside>

      {trackingNotice !== null ? (
        <p className="aw-output-tracking-notice" role="status">
          {trackingNotice}
        </p>
      ) : null}

      {activeSpecification !== null ? (
        <section
          aria-busy={isProcessing || isCancelling}
          aria-label={t('resume.output.currentTask', { defaultValue: '当前生成任务' })}
          className="aw-output-job"
        >
          <div className="aw-output-job-heading">
            <div>
              <p className="aw-output-eyebrow">
                {activeSpecification.mode === 'final'
                  ? t('resume.output.finalTitle', { defaultValue: '最终文件' })
                  : t('resume.output.exportTitle', { defaultValue: '完整导出' })}
              </p>
              <h2>
                {jobAuthority === null
                  ? t('resume.output.confirmingCreation', { defaultValue: '正在确认任务创建' })
                  : t('resume.output.jobLabel', {
                      defaultValue: '任务 {{jobId}}',
                      jobId: jobAuthority.job.id
                    })}
              </h2>
            </div>
            <span
              className="aw-output-job-status"
              data-status={jobAuthority?.job.status ?? 'creating'}
            >
              {isProcessing && jobAuthority === null
                ? t('resume.output.creating', { defaultValue: '创建中' })
                : jobAuthority?.job.status === 'queued'
                  ? t('resume.output.statusQueued', { defaultValue: '排队中' })
                  : jobAuthority?.job.status === 'running'
                    ? t('resume.output.statusRunning', { defaultValue: '生成中' })
                    : jobAuthority?.job.status === 'succeeded'
                      ? t('resume.output.statusSucceeded', { defaultValue: '已完成' })
                      : jobAuthority?.job.status === 'failed'
                        ? t('resume.output.statusFailed', { defaultValue: '失败' })
                        : jobAuthority?.job.status === 'cancelled'
                          ? t('resume.output.statusCancelled', { defaultValue: '已取消' })
                          : jobAuthority?.job.status === 'expired'
                            ? t('resume.output.statusExpired', { defaultValue: '已过期' })
                            : t('resume.output.statusPending', { defaultValue: '待确认' })}
            </span>
          </div>

          <p className="aw-output-job-spec">
            {t('resume.output.frozenSpec', {
              defaultValue: '固定 Resume 版本 {{revision}} · {{formats}} · 单个 Job',
              formats: formatSetLabel(activeSpecification.formats),
              revision: activeSpecification.resumeRevision
            })}
          </p>

          {jobAuthority !== null && isPendingJob(jobAuthority.job) && cancelError === null ? (
            <div className="aw-output-progress">
              <div>
                <LoaderCircle aria-hidden="true" className="aw-output-spinner" size={18} />
                <span>
                  {jobAuthority.job.status === 'queued'
                    ? t('resume.output.queuedDescription', { defaultValue: '任务正在等待执行。' })
                    : t('resume.output.runningDescription', {
                        defaultValue: '任务正在生成全部请求格式。'
                      })}
                </span>
              </div>
              {jobProgress !== null && jobProgress.total !== null && jobProgress.total > 0 ? (
                <progress
                  aria-label={t('resume.output.progress', { defaultValue: '生成进度' })}
                  max={jobProgress.total}
                  value={jobProgress.completed}
                />
              ) : null}
            </div>
          ) : null}

          {workflowError !== null ? (
            <div className="aw-output-error" role="alert">
              <strong>
                {createOutcomeUncertain
                  ? t('resume.output.unknownTitle', { defaultValue: '任务创建结果尚未确认' })
                  : t('resume.output.workflowErrorTitle', {
                      defaultValue: '无法继续处理这个任务'
                    })}
              </strong>
              <p>
                <ResourceFailureMessage error={workflowError} />
              </p>
              {startRecovery === 'exact-replay' ? (
                <p>
                  {t('resume.output.exactReplayNotice', {
                    defaultValue:
                      '确认操作会原样复用同一 commandId、mode、formats 和 Resume revision，不会创建新意图。'
                  })}
                </p>
              ) : null}
              {startRecovery === 'unreplayable-unknown' ? (
                <p>
                  {t('resume.output.unreplayableNotice', {
                    defaultValue:
                      '服务已返回无法验证的成功响应；旧命令不能安全重放。本页无法证明服务端是否已接受任务。'
                  })}
                </p>
              ) : null}
              {startRecovery === 'definitively-rejected' ? (
                <p>
                  {t('resume.output.rejectedNotice', {
                    defaultValue: '旧命令已结束且不会重发；下一次生成会使用全新的命令 identity。'
                  })}
                </p>
              ) : null}
              <div className="aw-output-actions">
                {startRecovery === 'exact-replay' ? (
                  <button
                    className="aw-primary-button"
                    disabled={isProcessing || startRetryDeadline !== null}
                    onClick={confirmSameCreate}
                    type="button"
                  >
                    {startRetryDeadline !== null
                      ? t('resume.output.waitingToConfirm', {
                          defaultValue: '等待服务端允许确认…'
                        })
                      : t('resume.output.confirmSameCreate', {
                          defaultValue: '确认同一任务创建结果'
                        })}
                  </button>
                ) : null}
                {jobAuthority !== null && !createOutcomeUncertain ? (
                  <button
                    className="aw-quiet-button"
                    disabled={isProcessing}
                    onClick={(): void => void continueKnownJob()}
                    type="button"
                  >
                    {t('resume.output.continueReading', { defaultValue: '继续读取任务状态' })}
                  </button>
                ) : null}
                {createOutcomeUncertain ? (
                  <button
                    className="aw-quiet-button"
                    disabled={isProcessing}
                    onClick={abandonUnknownTracking}
                    type="button"
                  >
                    {t('resume.output.abandonTracking', { defaultValue: '放弃未知本地跟踪' })}
                  </button>
                ) : null}
              </div>
              {createOutcomeUncertain ? (
                <p className="aw-output-abandon-warning">
                  {t('resume.output.abandonWarning', {
                    defaultValue: '放弃只会清除本页的确认信封，不会取消服务端可能已经接受的任务。'
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {jobAuthority !== null && isPendingJob(jobAuthority.job) ? (
            <div className="aw-output-actions">
              <button
                className="aw-danger-button"
                disabled={isCancelling || cancelRetryDeadline !== null}
                onClick={cancelRecovery === 'exact-replay' ? confirmSameCancellation : cancelJob}
                type="button"
              >
                {isCancelling
                  ? t('resume.output.cancelling', { defaultValue: '正在取消…' })
                  : cancelRetryDeadline !== null
                    ? t('resume.output.waitingToCancel', {
                        defaultValue: '等待服务端允许确认…'
                      })
                    : cancelRecovery === 'exact-replay'
                      ? t('resume.output.confirmSameCancel', {
                          defaultValue: '确认同一取消结果'
                        })
                      : t('resume.output.cancelJob', { defaultValue: '取消生成任务' })}
              </button>
            </div>
          ) : null}

          {cancelError !== null ? (
            <div className="aw-output-error" role="alert">
              <strong>
                {t('resume.output.cancelErrorTitle', { defaultValue: '取消结果尚未完全确认' })}
              </strong>
              <p>
                <ResourceFailureMessage error={cancelError} />
              </p>
              <div className="aw-output-actions">
                {cancelRecovery === 'exact-replay' ? (
                  <button
                    className="aw-primary-button"
                    disabled={isCancelling || cancelRetryDeadline !== null}
                    onClick={confirmSameCancellation}
                    type="button"
                  >
                    {t('resume.output.confirmSameCancel', {
                      defaultValue: '确认同一取消结果'
                    })}
                  </button>
                ) : null}
                <button
                  className="aw-quiet-button"
                  disabled={isCancelling || isProcessing}
                  onClick={abandonCancellationAndRefresh}
                  type="button"
                >
                  {t('resume.output.readJobInstead', {
                    defaultValue: '停止重发取消并读取任务'
                  })}
                </button>
              </div>
            </div>
          ) : null}

          {jobAuthority?.job.status === 'failed' ? (
            <div className="aw-output-terminal aw-output-terminal--danger" role="status">
              <CircleX aria-hidden="true" size={20} />
              <div>
                <strong>{t('resume.output.failedTitle', { defaultValue: '生成任务失败' })}</strong>
                <p>
                  {t('resume.output.failedDescription', {
                    defaultValue:
                      '服务端确认任务没有成功生成完整输出。你可以保留当前 Resume 并开始一次新任务。'
                  })}
                  {jobAuthority.job.problem.requestId.length > 0
                    ? ` ${t('errors.reference', {
                        referenceId: jobAuthority.job.problem.requestId
                      })}`
                    : ''}
                </p>
              </div>
            </div>
          ) : jobAuthority?.job.status === 'cancelled' ? (
            <div className="aw-output-terminal" role="status">
              <CircleX aria-hidden="true" size={20} />
              <div>
                <strong>
                  {t('resume.output.cancelledTitle', { defaultValue: '生成任务已取消' })}
                </strong>
                <p>
                  {t('resume.output.cancelledDescription', {
                    defaultValue: '服务端已确认任务终止，没有可保存的输出。'
                  })}
                </p>
              </div>
            </div>
          ) : jobAuthority?.job.status === 'expired' ? (
            <div className="aw-output-terminal aw-output-terminal--danger" role="status">
              <CircleX aria-hidden="true" size={20} />
              <div>
                <strong>
                  {t('resume.output.expiredTitle', { defaultValue: '任务在开始前已过期' })}
                </strong>
                <p>
                  {t('resume.output.expiredDescription', {
                    defaultValue: '这次任务不会继续执行；需要时可以创建一个新任务。'
                  })}
                </p>
              </div>
            </div>
          ) : null}

          {jobAuthority?.job.status === 'succeeded' && outputs.length === 0 && isProcessing ? (
            <LoadingState
              label={t('resume.output.resolvingOutputs', {
                defaultValue: '正在核对全部输出元数据…'
              })}
            />
          ) : null}

          {outputs.length > 0 ? (
            <section
              aria-label={t('resume.output.outputList', { defaultValue: '生成的文件' })}
              className="aw-output-results"
            >
              <div className="aw-output-results-heading">
                <BadgeCheck aria-hidden="true" size={20} />
                <div>
                  <h3>{t('resume.output.outputsReady', { defaultValue: '全部输出已核对' })}</h3>
                  <p>
                    {t('resume.output.outputsReadyDescription', {
                      defaultValue:
                        '每个按钮独立保存对应 Artifact；页面不会自动下载，也不会把受保护地址暴露给浏览器。'
                    })}
                  </p>
                </div>
              </div>
              <ul className="aw-output-file-list">
                {outputs.map((output) => {
                  /** @brief 当前输出是否已过期 / Whether this output has expired. */
                  const expired = artifactIsExpired(output.artifact, artifactClock)
                  /** @brief 当前输出是否超过宿主限制 / Whether this output exceeds the host limit. */
                  const tooLarge =
                    artifactSave.maximumArtifactBytes !== null &&
                    output.artifact.sizeBytes > artifactSave.maximumArtifactBytes
                  /** @brief 当前格式保存反馈 / Host-save feedback for this format. */
                  const feedback = saveFeedback[output.format]
                  /** @brief 当前格式图标 / Icon for the current format. */
                  const FormatIcon =
                    output.format === 'json'
                      ? FileJson
                      : output.format === 'docx'
                        ? FileArchive
                        : FileText
                  return (
                    <li className="aw-output-file-card" key={output.artifactId}>
                      <span className="aw-output-file-icon">
                        <FormatIcon aria-hidden="true" size={22} />
                      </span>
                      <div className="aw-output-file-copy">
                        <div>
                          <strong>{formatLabel(output.format)}</strong>
                          <span>
                            {formatArtifactBytes(output.artifact.sizeBytes, i18n.language)}
                          </span>
                        </div>
                        <dl>
                          <div>
                            <dt>{t('resume.output.createdAt', { defaultValue: '生成时间' })}</dt>
                            <dd>
                              {formatOutputTimestamp(output.artifact.createdAt, i18n.language)}
                            </dd>
                          </div>
                          {output.artifact.pageCount !== null ? (
                            <div>
                              <dt>{t('resume.output.pages', { defaultValue: '页数' })}</dt>
                              <dd>{output.artifact.pageCount}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt>{t('resume.output.expiry', { defaultValue: '有效期' })}</dt>
                            <dd>
                              {output.artifact.expiresAt === null
                                ? t('resume.output.noExpiry', {
                                    defaultValue: '服务端未设置到期时间'
                                  })
                                : formatOutputTimestamp(output.artifact.expiresAt, i18n.language)}
                            </dd>
                          </div>
                        </dl>
                        {expired ? (
                          <p className="aw-output-file-warning" role="status">
                            {t('resume.output.artifactExpired', {
                              defaultValue: '此文件已过期，请重新生成。'
                            })}
                          </p>
                        ) : tooLarge ? (
                          <p className="aw-output-file-warning" role="status">
                            {t('resume.output.artifactTooLarge', {
                              defaultValue: '此文件超过当前宿主 {{limit}} 的保存上限。',
                              limit: formatArtifactBytes(
                                artifactSave.maximumArtifactBytes ?? 0,
                                i18n.language
                              )
                            })}
                          </p>
                        ) : null}
                        {feedback?.result !== null && feedback?.result !== undefined ? (
                          <p aria-live="polite" className="aw-output-save-status">
                            {feedback.result.status === 'saved'
                              ? t('resume.output.saved', {
                                  defaultValue: '{{format}} 已保存。',
                                  format: formatLabel(output.format)
                                })
                              : feedback.result.status === 'started'
                                ? t('resume.output.saveStarted', {
                                    defaultValue: '{{format}} 下载已开始。',
                                    format: formatLabel(output.format)
                                  })
                                : t('resume.output.saveCancelled', {
                                    defaultValue: '已取消保存 {{format}}。',
                                    format: formatLabel(output.format)
                                  })}
                          </p>
                        ) : null}
                        {feedback?.error !== null && feedback?.error !== undefined ? (
                          <p className="aw-output-file-warning" role="alert">
                            <ResourceFailureMessage error={feedback.error} />{' '}
                            {classifyResourceFailure(feedback.error).kind === 'outcome-unknown'
                              ? t('resume.output.saveUnknownHint', {
                                  defaultValue:
                                    '宿主可能已经开始保存；再次操作前请先检查下载或目标目录。'
                                })
                              : ''}
                          </p>
                        ) : null}
                      </div>
                      <button
                        aria-label={t('resume.output.saveFormat', {
                          defaultValue: '保存 {{format}}',
                          format: formatLabel(output.format)
                        })}
                        className="aw-quiet-button"
                        disabled={savingFormat !== null || expired || tooLarge}
                        onClick={(): void => void saveOutput(output)}
                        type="button"
                      >
                        <Download aria-hidden="true" size={16} />
                        {savingFormat === output.format
                          ? t('resume.output.saving', { defaultValue: '正在保存…' })
                          : t('resume.output.save', { defaultValue: '保存' })}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

/**
 * @brief Resume “生成与导出”路由页 / Resume “Generate and export” route page.
 * @return 严格加载 Workspace-scoped Resume 与精确固定模板的产品页 / Product page strictly loading a Workspace-scoped Resume and its exactly pinned Template.
 */
export function ResumeOutputPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { resumeId } = useParams()
  const resume = useResumeGateway()
  const templateCatalog = useResumeTemplateCatalog()
  const { getCurrentWorkspace } = useWorkspaceSession()
  /** @brief URL 中不透明 Resume identity / Opaque Resume identity from the URL. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])

  /** @brief 加载授权路径、Resume 权威和精确 TemplateManifest / Load authorization path, Resume authority, and exact TemplateManifest. */
  const loadResources = useCallback(
    async (signal: AbortSignal): Promise<ResumeOutputResources> => {
      signal.throwIfAborted()
      if (resumeId === undefined) {
        throw new Error('A Resume identity is required for generation and export.')
      }
      /** @brief 当前显式选择的 Workspace / Current explicitly selected Workspace. */
      const workspace = await getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) return { kind: 'no-workspace' }
      /** @brief Workspace-scoped 当前 Resume 权威 / Current Workspace-scoped Resume authority. */
      const editor = await resume.getResumeEditor(workspace.id, requestedResumeId, signal)
      signal.throwIfAborted()
      if (editor.resume.id !== requestedResumeId || editor.resume.workspaceId !== workspace.id) {
        throw new Error('The Resume gateway returned authority outside the requested scope.')
      }
      /** @brief 与 Resume reference 完全一致的不可变 TemplateManifest / Immutable TemplateManifest exactly matching the Resume reference. */
      const template = await loadPinnedResumeTemplate(
        templateCatalog,
        editor.resume.template,
        signal
      )
      signal.throwIfAborted()
      return {
        editor,
        kind: 'workspace',
        template,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }
    },
    [getCurrentWorkspace, requestedResumeId, resume, resumeId, templateCatalog]
  )
  /** @brief 当前路由资源状态 / Current route-resource state. */
  const resources = useAsyncResource('resume.output', loadResources, requestedResumeId)

  if (resources.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('resume.output.loading', { defaultValue: '正在准备生成与导出…' })} />
      </div>
    )
  }
  if (resources.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={resources.error}
          onRetry={resources.retry}
          title={t('resume.output.loadError', { defaultValue: '无法准备生成与导出' })}
        />
      </div>
    )
  }
  if (resources.data.kind === 'no-workspace') {
    return (
      <div className="aw-page">
        <EmptyState
          description={t('resume.output.noWorkspaceDescription', {
            defaultValue: '选择一个可访问的工作区后，才能生成其中 Resume 的文件。'
          })}
          title={t('resume.output.noWorkspaceTitle', { defaultValue: '未选择工作区' })}
        />
      </div>
    )
  }
  return <ResumeOutputWorkspace key={requestedResumeId} resources={resources.data} />
}
