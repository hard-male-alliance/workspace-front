/** @file Resume PDF Render、预览与保存产品面板 / Product panel for Resume PDF rendering, preview, and saving. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'

import { ResumeRenderProcessError, type ResumeRenderSpecification } from '../../../app/AppProcesses'
import { useResumeRenderProcess } from '../../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { useArtifactSave } from '../../../app/Host'
import { ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId, type UiCommandId } from '../../../shared-kernel/command'
import { nextDeadlineTimerDelayMilliseconds } from '../../../shared-kernel/polling'
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
import type { UiResumeEditorModel } from '../domain/document'
import { ResumeSemanticPreview } from './ResumeSemanticPreview'
import { createResumePdfPreviewLease, type ResumePdfPreviewLease } from './resume-pdf-preview'

/** @brief 原生 PDF 查看器必须完成 iframe 加载的时限 / Deadline for the native PDF viewer to finish loading the iframe. */
const PDF_INLINE_PREVIEW_TIMEOUT_MILLISECONDS = 10_000

/** @brief 当前 Job 是否仍可被观察或取消 / Whether the current Job can still be observed or cancelled. */
function isPendingJob(job: UiWorkspaceJob): boolean {
  return job.status === 'queued' || job.status === 'running'
}

/** @brief 内嵌 PDF 查看器的产品状态 / Product state of the inline PDF viewer. */
type PdfInlinePreviewStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

/**
 * @brief 检查浏览器是否公开支持原生 PDF 查看器 / Check whether the browser reports native PDF-viewer support.
 * @return 只有浏览器明确报告支持时为 true / True only when the browser explicitly reports support.
 */
function supportsInlinePdfPreview(): boolean {
  return typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === true
}

/** @brief PDF 视觉预览面板属性 / PDF visual-preview panel properties. */
export interface ResumePreviewPanelProps {
  /** @brief 当前完整 Resume 权威 / Current complete Resume authority. */
  readonly editor: UiResumeEditorModel
  /** @brief Resume/template/revision 变化时更新的预览代际 / Preview generation updated with Resume/template/revision changes. */
  readonly generation: string
  /** @brief 文档权威状态未恢复时禁止创建新 Job / Prevent new Job creation until document authority is recovered. */
  readonly isWriteLocked: boolean
  /** @brief 当前固定模板是否支持 PDF / Whether the pinned Template supports PDF. */
  readonly pdfSupported: boolean
}

/** @brief PDF 内容消费进度 / PDF-content consumption progress. */
interface PdfContentProgress {
  /** @brief 已消费字节数 / Consumed byte count. */
  readonly completed: number
  /** @brief 完整字节数 / Complete byte count. */
  readonly total: number
}

/** @brief 必须原样确认的 Job cancellation 意图 / Job-cancellation intent that must be confirmed verbatim. */
interface ResumeRenderCancelIntent {
  /** @brief 首次 cancellation 使用的 Job 与强 ETag / Job and strong ETag used by the first cancellation request. */
  readonly authority: UiWorkspaceJobAuthority
  /** @brief 首次请求与确认请求共享的 command identity / Command identity shared by the first request and confirmations. */
  readonly commandId: UiCommandId
}

/**
 * @brief PDF 视觉预览、Job 控制与 Artifact 保存面板 / PDF visual preview, Job control, and Artifact-save panel.
 * @param props 当前 Resume 代际、写锁与模板能力 / Current Resume generation, write lock, and Template capability.
 * @return 只将已验证 Blob URL 交给 iframe 的产品面板 / Product panel giving the iframe only a validated Blob URL.
 */
export function ResumePreviewPanel({
  editor,
  generation,
  isWriteLocked,
  pdfSupported
}: ResumePreviewPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const diagnostics = useDiagnostics()
  const artifactSave = useArtifactSave()
  const renderProcess = useResumeRenderProcess()
  /** @brief 当前 PDF preview 绑定的不可变 Render 规格 / Immutable Render specification bound to the current PDF preview. */
  const target = useMemo<ResumeRenderSpecification>(
    () => ({
      formats: ['pdf'],
      mode: 'preview',
      resumeId: editor.resume.id,
      resumeRevision: editor.resume.revision,
      workspaceId: editor.resume.workspaceId
    }),
    [editor.resume.id, editor.resume.revision, editor.resume.workspaceId]
  )
  const [artifact, setArtifact] = useState<UiWorkspaceArtifact | null>(null)
  const [previewLease, setPreviewLease] = useState<ResumePdfPreviewLease | null>(null)
  /** @brief 原生 PDF 查看器当前是否可用 / Current availability of the native PDF viewer. */
  const [inlinePreviewStatus, setInlinePreviewStatus] = useState<PdfInlinePreviewStatus>('idle')
  const [previewProgress, setPreviewProgress] = useState<PdfContentProgress | null>(null)
  const [jobAuthority, setJobAuthority] = useState<UiWorkspaceJobAuthority | null>(null)
  /** @brief 最近一次 Render Job、Artifact 或预览加载错误 / Latest Render Job, Artifact, or preview-load error. */
  const [error, setError] = useState<unknown>(null)
  const [isRendering, setRendering] = useState(false)
  /** @brief 启动响应确认前必须复用的命令 identity / Command identity reused until start outcome is confirmed. */
  const [startCommandId, setStartCommandId] = useState<UiCommandId | null>(null)
  /** @brief API v2 Retry-After 要求等待的时长 / Delay required by API v2 Retry-After. */
  const [startConfirmDelayMilliseconds, setStartConfirmDelayMilliseconds] = useState<number | null>(
    null
  )
  /** @brief 恢复查询返回、但不冒充原 intent 精确关联的 Job 候选 / Recovery Jobs that do not pretend exact correlation to the original intent. */
  const [recoveryCandidates, setRecoveryCandidates] = useState<readonly UiWorkspaceJob[]>([])
  const [recoveryHasMore, setRecoveryHasMore] = useState(false)
  const [isFindingRecovery, setFindingRecovery] = useState(false)
  const [recoverySearched, setRecoverySearched] = useState(false)
  const [recoveryError, setRecoveryError] = useState<unknown>(null)
  /** @brief PDF 产物是否正在由宿主保存 / Whether the PDF artifact is being saved by the host. */
  const [isSaving, setSaving] = useState(false)
  /** @brief 产物保存的可访问状态 / Accessible artifact-save status. */
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [isCancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<unknown>(null)
  const [cancelCommandId, setCancelCommandId] = useState<UiCommandId | null>(null)
  /** @brief 2xx 契约失败后是否必须先重读 Job 权威 / Whether Job authority must be reread after a 2xx contract failure. */
  const [cancelAuthorityRequired, setCancelAuthorityRequired] = useState(false)
  /** @brief cancellation 的 Retry-After 等待 / Retry-After delay for cancellation confirmation. */
  const [cancelConfirmDelayMilliseconds, setCancelConfirmDelayMilliseconds] = useState<
    number | null
  >(null)
  /** @brief 当前 Artifact 是否已超过服务端有效期 / Whether the current Artifact has passed its server expiry. */
  const [artifactExpired, setArtifactExpired] = useState(false)

  /** @brief React commit 前同步占位的 Render 单通道 / Synchronous single lane for Render before React commits. */
  const renderInFlightRef = useRef(false)
  /** @brief 与未确认启动意图绑定的同步 command identity / Synchronous command identity bound to an unconfirmed start intent. */
  const startCommandIdRef = useRef<UiCommandId | null>(null)
  /** @brief React commit 前同步占位的宿主保存单通道 / Synchronous single lane for host saves before React commits. */
  const saveInFlightRef = useRef(false)
  /** @brief React commit 前同步占位的 cancellation 单通道 / Synchronous single lane for cancellation before React commits. */
  const cancelInFlightRef = useRef(false)
  /** @brief cancellation 安全确认中冻结的完整请求 / Complete request frozen across safe cancellation confirmation. */
  const cancelIntentRef = useRef<ResumeRenderCancelIntent | null>(null)
  /** @brief React commit 前同步占位的恢复查询通道 / Synchronous recovery-query lane before React commits. */
  const recoveryInFlightRef = useRef(false)
  const renderAbortRef = useRef<AbortController | null>(null)
  const auxiliaryAbortRef = useRef<AbortController | null>(null)
  const cancelAbortRef = useRef<AbortController | null>(null)
  const saveAbortRef = useRef<AbortController | null>(null)
  /** @brief 当前最新 Job 权威的同步引用 / Synchronous reference to the latest Job authority. */
  const jobAuthorityRef = useRef<UiWorkspaceJobAuthority | null>(null)
  /** @brief 当前 Blob URL 租约的同步引用 / Synchronous reference to the current Blob-URL lease. */
  const previewLeaseRef = useRef<ResumePdfPreviewLease | null>(null)
  /** @brief 当前仍允许提交异步结果的预览代际 / Preview generation still allowed to commit async results. */
  const activeGenerationRef = useRef<string | null>(generation)

  /** @brief Render 失败的安全页面语义 / Safe page semantics of the Render failure. */
  const renderFailure = error === null ? null : classifyResourceFailure(error)
  /** @brief 已知 Job 是否仍可继续查询 / Whether the known Job may still be polled. */
  const canResumePolling = error !== null && jobAuthority !== null && isPendingJob(jobAuthority.job)
  /** @brief 当前错误是否要求原样确认启动命令 / Whether the current error requires exact start-command confirmation. */
  const startIdempotencyConflict = getResumeIdempotencyConflict(error)
  const mustConfirmStart =
    startCommandId !== null &&
    (renderFailure?.kind === 'outcome-unknown' || startIdempotencyConflict === 'in-progress') &&
    !isResumeUnreplayableContractResponse(error)
  /** @brief Retry-After 是否暂时阻止确认 / Whether Retry-After temporarily blocks confirmation. */
  const confirmationBlocked = startConfirmDelayMilliseconds !== null
  /** @brief 当前错误是否只能通过候选恢复而不能重放坏响应 / Whether recovery candidates, not replaying a bad response, are required. */
  const canFindRecovery =
    error !== null &&
    (isResumeUnreplayableContractResponse(error) || startIdempotencyConflict === 'key-reused')
  /** @brief 当前宿主是否能保存该 Artifact 大小 / Whether the current host can save this Artifact size. */
  const artifactSaveLimitExceeded =
    artifact !== null &&
    artifactSave.maximumArtifactBytes !== null &&
    artifact.sizeBytes > artifactSave.maximumArtifactBytes
  /** @brief 产物保存结果是否无法确认 / Whether the artifact-save outcome cannot be confirmed. */
  const saveOutcomeUnknown =
    saveError !== null && classifyResourceFailure(saveError).kind === 'outcome-unknown'
  useEffect((): (() => void) | undefined => {
    if (startConfirmDelayMilliseconds === null) return undefined
    /** @brief 到期后清除 Retry-After 门的 timer / Timer clearing the Retry-After gate on expiry. */
    const timer = globalThis.setTimeout(
      (): void => setStartConfirmDelayMilliseconds(null),
      startConfirmDelayMilliseconds
    )
    return (): void => globalThis.clearTimeout(timer)
  }, [startConfirmDelayMilliseconds])

  useEffect((): (() => void) | undefined => {
    if (cancelConfirmDelayMilliseconds === null) return undefined
    /** @brief 到期后开放 cancellation 原样确认的 timer / Timer allowing verbatim cancellation confirmation after expiry. */
    const timer = globalThis.setTimeout(
      (): void => setCancelConfirmDelayMilliseconds(null),
      cancelConfirmDelayMilliseconds
    )
    return (): void => globalThis.clearTimeout(timer)
  }, [cancelConfirmDelayMilliseconds])

  useEffect((): (() => void) | undefined => {
    if (artifact?.expiresAt === null || artifact?.expiresAt === undefined) return undefined
    /** @brief 契约给出的绝对过期时刻 / Absolute expiry instant supplied by the contract. */
    const expiresAtMilliseconds = Date.parse(artifact.expiresAt)
    /** @brief effect 是否已卸载 / Whether the effect has been disposed. */
    let disposed = false
    /** @brief 当前分段 timer / Current segmented timer. */
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null

    /** @brief 重新核对绝对时钟并安排下一段等待 / Recheck the absolute clock and schedule the next wait segment. */
    const scheduleExpiryCheck = (): void => {
      if (disposed) return
      /** @brief 受宿主上限约束的下一段等待 / Next wait segment bounded by the host limit. */
      const delayMilliseconds = nextDeadlineTimerDelayMilliseconds(expiresAtMilliseconds)
      if (delayMilliseconds === null) {
        setArtifactExpired(true)
        return
      }
      timer = globalThis.setTimeout(scheduleExpiryCheck, delayMilliseconds)
    }

    scheduleExpiryCheck()
    return (): void => {
      disposed = true
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }, [artifact])

  useEffect((): (() => void) | undefined => {
    if (previewLease === null || inlinePreviewStatus !== 'loading') return undefined
    /** @brief 原生查看器沉默失败时切换到显式下载降级的 timer / Timer switching a silent native-viewer failure to the explicit download fallback. */
    const timer = globalThis.setTimeout(
      (): void => setInlinePreviewStatus('unavailable'),
      PDF_INLINE_PREVIEW_TIMEOUT_MILLISECONDS
    )
    return (): void => globalThis.clearTimeout(timer)
  }, [inlinePreviewStatus, previewLease])

  useEffect((): (() => void) => {
    activeGenerationRef.current = generation
    return (): void => {
      if (activeGenerationRef.current === generation) activeGenerationRef.current = null
      renderAbortRef.current?.abort()
      auxiliaryAbortRef.current?.abort()
      cancelAbortRef.current?.abort()
      saveAbortRef.current?.abort()
      previewLeaseRef.current?.dispose()
      previewLeaseRef.current = null
    }
  }, [generation])

  /**
   * @brief 判断异步操作是否仍可提交到当前预览代际 / Test whether an async operation may still commit to the current preview generation.
   * @param expectedGeneration 操作启动时的代际 / Generation captured when the operation started.
   * @return 组件仍挂载且代际未变化时为 true / True while mounted and still on the same generation.
   */
  const isCurrentGeneration = (expectedGeneration: string): boolean =>
    activeGenerationRef.current === expectedGeneration

  /**
   * @brief 原子提交最新 Job 权威 / Atomically commit the latest Job authority.
   * @param authority 新 Job 权威 / New Job authority.
   */
  const commitJobAuthority = (authority: UiWorkspaceJobAuthority): void => {
    /** @brief 已提交且不能被较旧异步结果覆盖的权威 / Already committed authority that an older async result must not overwrite. */
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
      setCancelCommandId(null)
      setCancelConfirmDelayMilliseconds(null)
      setCancelAuthorityRequired(false)
    }
  }

  /**
   * @brief 替换并释放上一份 Blob URL 租约 / Replace and release the previous Blob-URL lease.
   * @param lease 新租约；null 表示回到语义预览 / New lease, or null to return to semantic preview.
   */
  const commitPreviewLease = (lease: ResumePdfPreviewLease | null): void => {
    if (previewLeaseRef.current !== lease) previewLeaseRef.current?.dispose()
    previewLeaseRef.current = lease
    setPreviewLease(lease)
    setInlinePreviewStatus(
      lease === null ? 'idle' : supportsInlinePdfPreview() ? 'loading' : 'unavailable'
    )
  }

  /**
   * @brief 为已核对的 Artifact 加载并创建 Blob 预览 / Load and create a Blob preview for a validated Artifact.
   * @param artifactToPreview 已核对 Artifact / Validated Artifact.
   * @param controller 当前预览代际 controller / Controller for the current preview generation.
   * @param expectedGeneration 操作绑定代际 / Generation bound to the operation.
   */
  const loadArtifactPreview = async (
    artifactToPreview: UiWorkspaceArtifact,
    controller: AbortController,
    expectedGeneration: string
  ): Promise<void> => {
    setPreviewProgress({ completed: 0, total: artifactToPreview.sizeBytes })
    try {
      /** @brief 完整受认证 PDF stream / Complete authenticated PDF stream. */
      const content = await renderProcess.readPdfPreview(
        target,
        artifactToPreview,
        controller.signal
      )
      /** @brief EOF、长度和 SHA 校验完成后创建的 Blob URL 租约 / Blob-URL lease created after EOF, length, and SHA validation. */
      const lease = await createResumePdfPreviewLease(
        content,
        controller.signal,
        (completed, total): void => {
          if (isCurrentGeneration(expectedGeneration)) setPreviewProgress({ completed, total })
        }
      )
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) {
        lease.dispose()
        return
      }
      commitPreviewLease(lease)
    } finally {
      if (isCurrentGeneration(expectedGeneration)) setPreviewProgress(null)
    }
  }

  /**
   * @brief 观察 Job 并在成功后解析和加载唯一 PDF / Observe a Job, then resolve and load its sole PDF after success.
   * @param initial 初始 Job 权威 / Initial Job authority.
   * @param controller 当前流程 controller / Controller for the current process.
   * @param expectedGeneration 操作绑定代际 / Generation bound to the operation.
   */
  const observeAndLoad = async (
    initial: UiWorkspaceJobAuthority,
    controller: AbortController,
    expectedGeneration: string
  ): Promise<void> => {
    commitJobAuthority(initial)
    /** @brief 观察到的终态权威 / Terminal authority observed from the Job. */
    const terminal = isPendingJob(initial.job)
      ? await renderProcess.watchToTerminal(
          target,
          initial,
          controller.signal,
          (authority): void => {
            if (isCurrentGeneration(expectedGeneration)) commitJobAuthority(authority)
          }
        )
      : initial
    if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
    commitJobAuthority(terminal)
    if (terminal.job.status !== 'succeeded') return
    /** @brief 从 result_refs 严格解析的唯一 PDF 输出 / Sole PDF output strictly resolved from result_refs. */
    const [completedOutput] = await renderProcess.resolveOutputs(
      target,
      terminal.job,
      controller.signal
    )
    if (completedOutput === undefined) {
      throw new ResumeRenderProcessError('artifact-result-missing')
    }
    /** @brief 已完成跨资源核对的 PDF Artifact / PDF Artifact after cross-resource validation. */
    const completedArtifact = completedOutput.artifact
    if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
    setArtifact(completedArtifact)
    setArtifactExpired(false)
    await loadArtifactPreview(completedArtifact, controller, expectedGeneration)
  }

  /**
   * @brief 启动、继续或恢复一个 PDF Render 流程 / Start, continue, or recover a PDF-render process.
   * @param recovered 可选由用户明确选择的既有 Job / Optional existing Job explicitly selected by the user.
   */
  const renderPdf = async (recovered?: UiWorkspaceJobAuthority): Promise<void> => {
    if (renderInFlightRef.current || isWriteLocked || !pdfSupported) return
    /** @brief 本次是否只继续读取已知 Job / Whether this run only resumes a known Job. */
    const resumeKnownJob =
      recovered !== undefined || (canResumePolling && jobAuthorityRef.current !== null)
    renderInFlightRef.current = true
    renderAbortRef.current?.abort()
    saveAbortRef.current?.abort()
    cancelAbortRef.current?.abort()
    /** @brief 本次流程的取消 controller / Abort controller for this process. */
    const controller = new AbortController()
    /** @brief 本次流程绑定的预览代际 / Preview generation captured for this process. */
    const expectedGeneration = generation
    renderAbortRef.current = controller
    setRendering(true)
    setError(null)
    setCancelError(null)
    setRecoveryError(null)
    setRecoveryCandidates([])
    setRecoveryHasMore(false)
    setSaveError(null)
    setSaveStatus(null)
    setArtifact(null)
    setArtifactExpired(false)
    cancelIntentRef.current = null
    setCancelCommandId(null)
    setCancelConfirmDelayMilliseconds(null)
    setCancelAuthorityRequired(false)
    commitPreviewLease(null)
    setPreviewProgress(null)
    if (!resumeKnownJob) {
      jobAuthorityRef.current = null
      setJobAuthority(null)
    }
    /** @brief 同一创建意图内稳定的 command identity / Stable command identity within one creation intent. */
    const commandId = startCommandIdRef.current ?? createUiCommandId()
    if (!resumeKnownJob && startCommandIdRef.current === null) {
      startCommandIdRef.current = commandId
      setStartCommandId(commandId)
    }

    try {
      await runDiagnosticCommand(
        diagnostics,
        { operation: 'resume.pdf_render', scope: 'resume' },
        async (): Promise<void> => {
          /** @brief 本次观察的初始 Job / Initial Job observed in this run. */
          const initial =
            recovered ??
            (resumeKnownJob && jobAuthorityRef.current !== null
              ? jobAuthorityRef.current
              : await renderProcess.start({
                  commandId,
                  ...target,
                  signal: controller.signal
                }))
          if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
          if (!resumeKnownJob) {
            startCommandIdRef.current = null
            setStartCommandId(null)
            setStartConfirmDelayMilliseconds(null)
          }
          await observeAndLoad(initial, controller, expectedGeneration)
        }
      )
    } catch (reason: unknown) {
      if (isCurrentGeneration(expectedGeneration) && !controller.signal.aborted) {
        /** @brief 创建命令的幂等冲突类别 / Idempotency-conflict kind of the start command. */
        const idempotencyConflict = getResumeIdempotencyConflict(reason)
        if (idempotencyConflict === 'in-progress') {
          /** @brief 已验证 Retry-After；缺失时允许用户手动确认 / Validated Retry-After, with manual confirmation allowed when absent. */
          const retryAfter = getResumeCommandRetryAfterMilliseconds(reason)
          setStartConfirmDelayMilliseconds(retryAfter)
        } else if (
          idempotencyConflict === 'key-reused' ||
          isResumeUnreplayableContractResponse(reason) ||
          isResumeCommandDefinitivelyRejected(reason)
        ) {
          startCommandIdRef.current = null
          setStartCommandId(null)
          setStartConfirmDelayMilliseconds(null)
        } else if (classifyResourceFailure(reason).kind !== 'outcome-unknown') {
          startCommandIdRef.current = null
          setStartCommandId(null)
          setStartConfirmDelayMilliseconds(null)
        }
        setError(reason)
      }
    } finally {
      if (renderAbortRef.current === controller) renderAbortRef.current = null
      renderInFlightRef.current = false
      if (isCurrentGeneration(expectedGeneration)) setRendering(false)
    }
  }

  /**
   * @brief 查询但不自动认领当前 Resume revision 的 Render Job 候选 / Find Render Jobs for the current Resume revision without automatically claiming one.
   */
  const findRecoveryCandidates = useCallback(async (): Promise<void> => {
    if (recoveryInFlightRef.current) return
    recoveryInFlightRef.current = true
    auxiliaryAbortRef.current?.abort()
    /** @brief 当前恢复查询 controller / Controller for this recovery query. */
    const controller = new AbortController()
    /** @brief 查询绑定的预览代际 / Preview generation bound to this query. */
    const expectedGeneration = generation
    auxiliaryAbortRef.current = controller
    setFindingRecovery(true)
    setRecoveryError(null)
    try {
      /** @brief 有界候选集合 / Bounded candidate set. */
      const candidates = await renderProcess.findPreviewRecoveryCandidates(
        target,
        controller.signal
      )
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
      setRecoveryCandidates(candidates.jobs)
      setRecoveryHasMore(candidates.hasMore)
      setRecoverySearched(true)
    } catch (reason: unknown) {
      if (activeGenerationRef.current === expectedGeneration && !controller.signal.aborted) {
        setRecoveryError(reason)
        setRecoverySearched(true)
      }
    } finally {
      if (auxiliaryAbortRef.current === controller) auxiliaryAbortRef.current = null
      recoveryInFlightRef.current = false
      if (activeGenerationRef.current === expectedGeneration) setFindingRecovery(false)
    }
  }, [generation, renderProcess, target])

  useEffect((): (() => void) => {
    /** @brief commit 后启动恢复发现的零延迟任务 / Zero-delay task starting recovery discovery after commit. */
    const timer = globalThis.setTimeout((): void => {
      void findRecoveryCandidates()
    }, 0)
    return (): void => {
      globalThis.clearTimeout(timer)
      auxiliaryAbortRef.current?.abort()
    }
  }, [findRecoveryCandidates])

  /**
   * @brief 用户明确选择一个候选 Job 后恢复观察 / Resume observation after the user explicitly selects a candidate Job.
   * @param candidate 用户选择的候选 Job / Candidate Job selected by the user.
   */
  const recoverCandidate = async (candidate: UiWorkspaceJob): Promise<void> => {
    if (renderInFlightRef.current || recoveryInFlightRef.current) return
    recoveryInFlightRef.current = true
    auxiliaryAbortRef.current?.abort()
    /** @brief 读取强 ETag 所需的临时 controller / Temporary controller needed to read a strong ETag. */
    const controller = new AbortController()
    /** @brief 恢复动作绑定的预览代际 / Preview generation bound to this recovery action. */
    const expectedGeneration = generation
    auxiliaryAbortRef.current = controller
    try {
      /** @brief 从候选 ID 重新读取的权威 Job / Authoritative Job reread from the candidate identity. */
      const authority = await renderProcess.refreshJob(target, candidate.id, controller.signal)
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
      if (auxiliaryAbortRef.current === controller) auxiliaryAbortRef.current = null
      await renderPdf(authority)
    } catch (reason: unknown) {
      if (isCurrentGeneration(expectedGeneration) && !controller.signal.aborted) {
        setRecoveryError(reason)
      }
    } finally {
      if (auxiliaryAbortRef.current === controller) auxiliaryAbortRef.current = null
      recoveryInFlightRef.current = false
    }
  }

  /**
   * @brief 对当前仍在执行的 Job 提交服务端 cancellation / Submit server-side cancellation for the current running Job.
   */
  const cancelRender = async (): Promise<void> => {
    /** @brief 点击时已有的冻结 cancellation 意图 / Existing frozen cancellation intent at click time. */
    const existingIntent = cancelIntentRef.current
    /** @brief 没有待确认意图时读取的最新 Job 权威 / Latest Job authority read only when no intent awaits confirmation. */
    const latestAuthority = jobAuthorityRef.current
    if (
      cancelInFlightRef.current ||
      cancelConfirmDelayMilliseconds !== null ||
      (existingIntent === null && (latestAuthority === null || !isPendingJob(latestAuthority.job)))
    ) {
      return
    }
    cancelInFlightRef.current = true
    cancelAbortRef.current?.abort()
    /** @brief cancellation 与页面代际绑定的取消器 / Cancellation controller bound to the page generation. */
    const controller = new AbortController()
    /** @brief cancellation 绑定的预览代际 / Preview generation bound to this cancellation. */
    const expectedGeneration = generation
    cancelAbortRef.current = controller
    setCancelling(true)
    setCancelError(null)
    /** @brief 首次请求冻结或确认时原样复用的完整 cancellation 意图 / Complete cancellation intent frozen initially or reused verbatim for confirmation. */
    const intent =
      existingIntent ??
      ({ authority: latestAuthority, commandId: createUiCommandId() } as ResumeRenderCancelIntent)
    cancelIntentRef.current = intent
    setCancelCommandId(intent.commandId)
    try {
      /** @brief cancellation 返回的最新权威 / Latest authority returned by cancellation. */
      const updated = await renderProcess.cancel(
        target,
        intent.authority,
        intent.commandId,
        controller.signal
      )
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
      commitJobAuthority(updated)
      cancelIntentRef.current = null
      setCancelCommandId(null)
      setCancelConfirmDelayMilliseconds(null)
      if (!isPendingJob(updated.job)) renderAbortRef.current?.abort()
    } catch (reason: unknown) {
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
      /** @brief cancellation 的幂等冲突 / Idempotency conflict for cancellation. */
      const idempotencyConflict = getResumeIdempotencyConflict(reason)
      /** @brief cancellation 的权威并发冲突 / Authoritative concurrency conflict for cancellation. */
      const conflictStatus = getResumeConflictStatus(reason)
      if (idempotencyConflict === 'in-progress') {
        setCancelConfirmDelayMilliseconds(getResumeCommandRetryAfterMilliseconds(reason))
      }
      if (
        idempotencyConflict === 'key-reused' ||
        isResumeUnreplayableContractResponse(reason) ||
        conflictStatus !== null ||
        isResumeCommandDefinitivelyRejected(reason)
      ) {
        cancelIntentRef.current = null
        setCancelCommandId(null)
        setCancelConfirmDelayMilliseconds(null)
      }
      if (isResumeUnreplayableContractResponse(reason) || conflictStatus !== null) {
        setCancelAuthorityRequired(true)
        try {
          /** @brief 2xx 坏响应后重新读取的 Job 权威 / Job authority reread after an invalid 2xx response. */
          const refreshed = await renderProcess.refreshJob(
            target,
            intent.authority.job.id,
            controller.signal
          )
          if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
          commitJobAuthority(refreshed)
          setCancelAuthorityRequired(false)
          if (!isPendingJob(refreshed.job)) {
            renderAbortRef.current?.abort()
            setCancelError(null)
            return
          }
        } catch {
          // Preserve the original safe cancellation uncertainty.
        }
      }
      setCancelError(reason)
    } finally {
      if (cancelAbortRef.current === controller) cancelAbortRef.current = null
      cancelInFlightRef.current = false
      if (isCurrentGeneration(expectedGeneration)) setCancelling(false)
    }
  }

  /**
   * @brief 在 2xx cancellation 响应不合约时重新建立 Job 权威 / Re-establish Job authority after a non-conforming 2xx cancellation response.
   */
  const refreshCancellationAuthority = async (): Promise<void> => {
    /** @brief 当前仍可用于路径读取的 Job 权威 / Current Job authority still usable for path identity. */
    const authority = jobAuthorityRef.current
    if (authority === null || cancelInFlightRef.current) return
    cancelInFlightRef.current = true
    cancelAbortRef.current?.abort()
    /** @brief 当前权威恢复请求的取消器 / Controller for the current authority-recovery request. */
    const controller = new AbortController()
    /** @brief 当前恢复绑定的预览代际 / Preview generation bound to this recovery. */
    const expectedGeneration = generation
    cancelAbortRef.current = controller
    setCancelling(true)
    try {
      /** @brief 重新读取的 Job 权威 / Reread Job authority. */
      const refreshed = await renderProcess.refreshJob(target, authority.job.id, controller.signal)
      if (!isCurrentGeneration(expectedGeneration) || controller.signal.aborted) return
      commitJobAuthority(refreshed)
      setCancelAuthorityRequired(false)
      setCancelError(null)
      if (!isPendingJob(refreshed.job)) renderAbortRef.current?.abort()
    } catch (reason: unknown) {
      if (isCurrentGeneration(expectedGeneration) && !controller.signal.aborted) {
        setCancelError(reason)
      }
    } finally {
      if (cancelAbortRef.current === controller) cancelAbortRef.current = null
      cancelInFlightRef.current = false
      if (isCurrentGeneration(expectedGeneration)) setCancelling(false)
    }
  }

  /**
   * @brief 请求当前宿主保存已生成的 PDF / Ask the current host to save the generated PDF.
   */
  const savePdf = async (): Promise<void> => {
    if (
      artifact === null ||
      artifactExpired ||
      artifactSaveLimitExceeded ||
      saveInFlightRef.current
    ) {
      return
    }
    saveInFlightRef.current = true
    saveAbortRef.current?.abort()
    /** @brief 当前保存与页面代际绑定的取消器 / Save controller bound to the page generation. */
    const controller = new AbortController()
    saveAbortRef.current = controller
    /** @brief 本次保存绑定的预览代际 / Preview generation captured for this save. */
    const expectedGeneration = generation
    setSaving(true)
    setSaveError(null)
    setSaveStatus(null)
    try {
      /** @brief 宿主返回的保存判别结果 / Discriminated save result returned by the host. */
      const result = await artifactSave.saveArtifact(
        {
          artifactId: artifact.id,
          suggestedFileName: sanitizePdfFileName(`${editor.resume.profile.fullName} Resume`),
          workspaceId: artifact.workspaceId
        },
        controller.signal
      )
      if (!isCurrentGeneration(expectedGeneration)) return
      if (result.status === 'saved') {
        setSaveStatus(t('resume.workspace.pdfSaved', { defaultValue: 'PDF 已保存。' }))
      } else if (result.status === 'started') {
        setSaveStatus(
          t('resume.workspace.pdfDownloadStarted', { defaultValue: 'PDF 下载已开始。' })
        )
      } else {
        setSaveStatus(t('resume.workspace.pdfSaveCancelled', { defaultValue: '已取消保存。' }))
      }
    } catch (reason: unknown) {
      if (isCurrentGeneration(expectedGeneration) && !controller.signal.aborted) {
        setSaveError(reason)
      }
    } finally {
      if (saveAbortRef.current === controller) saveAbortRef.current = null
      saveInFlightRef.current = false
      if (isCurrentGeneration(expectedGeneration)) setSaving(false)
    }
  }

  /** @brief 当前可展示的 Job 进度 / Current displayable Job progress. */
  const jobProgress = jobAuthority?.job.progress ?? null
  /** @brief 当前 Job 的可访问状态说明 / Accessible status description for the current Job. */
  const jobStatus =
    jobAuthority === null
      ? null
      : jobAuthority.job.status === 'queued'
        ? t('resume.workspace.pdfQueued', { defaultValue: 'PDF 生成任务正在排队。' })
        : jobAuthority.job.status === 'running'
          ? t('resume.workspace.pdfRunning', { defaultValue: '正在生成 PDF。' })
          : jobAuthority.job.status === 'succeeded'
            ? t('resume.workspace.pdfSucceeded', { defaultValue: 'PDF 已生成。' })
            : jobAuthority.job.status === 'failed'
              ? t('resume.workspace.pdfFailed', {
                  defaultValue: 'PDF 生成失败。参考编号：{{referenceId}}',
                  referenceId: jobAuthority.job.problem.requestId
                })
              : jobAuthority.job.status === 'cancelled'
                ? t('resume.workspace.pdfCancelled', { defaultValue: 'PDF 生成已取消。' })
                : t('resume.workspace.pdfExpired', { defaultValue: 'PDF 生成任务已过期。' })
  /** @brief Job 失败是否需要即时告知用户 / Whether a Job failure requires an immediate alert. */
  const jobFailed = jobAuthority?.job.status === 'failed'

  return (
    <section
      aria-label={
        previewLease === null
          ? t('resume.workspace.semanticPreviewRegion', {
              defaultValue: '语义内容预览（非最终排版）'
            })
          : t('resume.workspace.pdfPreviewRegion', { defaultValue: 'PDF 预览' })
      }
    >
      <div className="aw-inline-actions">
        <button
          className="aw-primary-button"
          disabled={
            isRendering ||
            isWriteLocked ||
            !pdfSupported ||
            confirmationBlocked ||
            isFindingRecovery ||
            canFindRecovery
          }
          onClick={(): void => {
            void renderPdf()
          }}
          type="button"
        >
          {isRendering
            ? t('resume.workspace.renderingPdf', { defaultValue: '正在生成 PDF…' })
            : mustConfirmStart
              ? t('resume.workspace.confirmPdfRender', { defaultValue: '确认 PDF 生成结果' })
              : canResumePolling
                ? t('resume.workspace.resumePdfPolling', { defaultValue: '继续查询 PDF' })
                : recoveryCandidates.length > 0
                  ? t('resume.workspace.renderNewPdf', { defaultValue: '生成新的 PDF 预览' })
                  : t('resume.workspace.renderPdf', { defaultValue: '生成 PDF 预览' })}
        </button>
        {jobAuthority !== null && isPendingJob(jobAuthority.job) ? (
          <button
            className="aw-quiet-button"
            disabled={isCancelling || cancelConfirmDelayMilliseconds !== null}
            onClick={(): void => {
              if (cancelAuthorityRequired) void refreshCancellationAuthority()
              else void cancelRender()
            }}
            type="button"
          >
            {isCancelling
              ? t('resume.workspace.cancellingPdf', { defaultValue: '正在取消…' })
              : cancelAuthorityRequired
                ? t('resume.workspace.refreshCancelPdf', {
                    defaultValue: '重新读取取消状态'
                  })
                : cancelCommandId === null
                  ? t('resume.workspace.cancelPdf', { defaultValue: '取消生成' })
                  : t('resume.workspace.confirmCancelPdf', { defaultValue: '确认取消结果' })}
          </button>
        ) : null}
        {!pdfSupported ? (
          <span className="aw-muted-copy">
            {t('resume.workspace.pdfUnsupported', { defaultValue: '当前模板不支持 PDF 输出。' })}
          </span>
        ) : null}
        {previewLease === null ? (
          <span className="aw-muted-copy">
            {t('resume.workspace.semanticPreviewNotice', {
              defaultValue: '当前为语义内容预览，不代表最终模板排版。'
            })}
          </span>
        ) : null}
        {artifact !== null ? (
          <button
            className="aw-quiet-button"
            disabled={
              isSaving || saveOutcomeUnknown || artifactExpired || artifactSaveLimitExceeded
            }
            onClick={(): void => {
              void savePdf()
            }}
            type="button"
          >
            {isSaving
              ? t('resume.workspace.savingPdf', { defaultValue: '正在保存 PDF…' })
              : t('resume.workspace.downloadPreviewPdf', {
                  defaultValue: '下载预览 PDF'
                })}
          </button>
        ) : null}
      </div>

      {jobProgress !== null && jobProgress.total !== null && jobProgress.total > 0 ? (
        <label className="aw-muted-copy">
          <span>{t('resume.workspace.pdfProgress', { defaultValue: 'PDF 生成进度' })}</span>
          <progress max={jobProgress.total} value={jobProgress.completed} />
        </label>
      ) : null}
      {previewProgress !== null && previewProgress.total > 0 ? (
        <label className="aw-muted-copy">
          <span>{t('resume.workspace.pdfLoading', { defaultValue: '正在安全加载 PDF 预览' })}</span>
          <progress max={previewProgress.total} value={previewProgress.completed} />
        </label>
      ) : null}
      {jobStatus !== null ? (
        <p aria-atomic="true" aria-live="polite" role={jobFailed ? 'alert' : 'status'}>
          {jobStatus}
        </p>
      ) : null}
      {artifact !== null ? (
        <p className="aw-muted-copy">
          {t('resume.workspace.pdfMetadata', {
            defaultValue: '{{pages}} 页 · {{size}}',
            pages: artifact.pageCount ?? '—',
            size: new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: 1,
              style: 'unit',
              unit: 'megabyte',
              unitDisplay: 'short'
            }).format(artifact.sizeBytes / (1024 * 1024))
          })}
        </p>
      ) : null}
      {artifactExpired ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.pdfArtifactExpired', {
              defaultValue: '该 PDF 已过期，请重新生成。'
            })}
          </strong>
        </div>
      ) : null}
      {artifactSaveLimitExceeded ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.pdfHostLimitExceeded', {
              defaultValue: '该 PDF 超出当前浏览器的安全内存上限，请使用桌面客户端保存。'
            })}
          </strong>
        </div>
      ) : null}
      {saveStatus !== null ? (
        <span aria-live="polite" className="aw-sr-only">
          {saveStatus}
        </span>
      ) : null}
      {saveError !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {saveOutcomeUnknown
              ? t('resume.workspace.pdfSaveOutcomeUnknown', {
                  defaultValue: 'PDF 保存结果待确认。请先检查下载记录或目标文件。'
                })
              : t('resume.workspace.pdfSaveError', { defaultValue: '无法保存 PDF' })}
          </strong>{' '}
          <ResourceFailureMessage error={saveError} />
        </div>
      ) : null}
      {cancelError !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.pdfCancelError', { defaultValue: '无法确认 PDF 取消结果。' })}
          </strong>{' '}
          <ResourceFailureMessage error={cancelError} />
        </div>
      ) : null}
      {error !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {mustConfirmStart
              ? t('resume.workspace.renderOutcomeUnknown', {
                  defaultValue: 'PDF 生成结果待确认。'
                })
              : error instanceof ResumeRenderProcessError && error.code === 'preview-too-large'
                ? t('resume.workspace.pdfPreviewTooLarge', {
                    defaultValue: artifactSaveLimitExceeded
                      ? 'PDF 太大，当前客户端既不能预览也不能安全保存。'
                      : 'PDF 太大，无法在页面内预览；可以保存到本地。'
                  })
                : t('resume.workspace.renderError', { defaultValue: '无法生成 PDF 预览' })}
          </strong>{' '}
          <ResourceFailureMessage error={error} />
          {canFindRecovery ? (
            <>
              <button
                className="aw-quiet-button"
                disabled={isFindingRecovery}
                onClick={(): void => {
                  void findRecoveryCandidates()
                }}
                type="button"
              >
                {isFindingRecovery
                  ? t('resume.workspace.findingRenderJobs', {
                      defaultValue: '正在查找已有任务…'
                    })
                  : t('resume.workspace.findRenderJobs', {
                      defaultValue: '查找已有生成任务'
                    })}
              </button>
              <button
                className="aw-quiet-button"
                disabled={isRendering || isFindingRecovery}
                onClick={(): void => {
                  void renderPdf()
                }}
                type="button"
              >
                {t('resume.workspace.abandonRenderRecovery', {
                  defaultValue: '放弃恢复并新建任务（可能重复）'
                })}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {recoveryError !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('resume.workspace.renderRecoveryError', {
              defaultValue: '无法查询已有 PDF 任务。'
            })}
          </strong>{' '}
          <ResourceFailureMessage error={recoveryError} />
        </div>
      ) : null}
      {canFindRecovery && recoverySearched && recoveryCandidates.length === 0 ? (
        <p className="aw-muted-copy" role="status">
          {t('resume.workspace.noRenderRecovery', {
            defaultValue: recoveryHasMore
              ? '在本次有界查询中未找到匹配任务，服务端仍有更早记录。'
              : '未找到当前简历版本的已有 PDF 任务。'
          })}
        </p>
      ) : null}
      {recoveryCandidates.length > 0 ? (
        <section aria-label={t('resume.workspace.renderRecovery', { defaultValue: '可恢复任务' })}>
          <p className="aw-muted-copy">
            {t('resume.workspace.renderRecoveryNotice', {
              defaultValue:
                '这些任务匹配当前简历版本，但不代表与刚才的命令一一对应。请选择要查看的任务。'
            })}
          </p>
          <ul>
            {recoveryCandidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  className="aw-quiet-button"
                  onClick={(): void => {
                    void recoverCandidate(candidate)
                  }}
                  type="button"
                >
                  {t('resume.workspace.recoverRenderJob', {
                    createdAt: new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    }).format(new Date(candidate.createdAt)),
                    defaultValue: '{{createdAt}} · {{status}}',
                    status: candidate.status
                  })}
                </button>
              </li>
            ))}
          </ul>
          {recoveryHasMore ? (
            <p className="aw-muted-copy">
              {t('resume.workspace.moreRenderRecovery', {
                defaultValue: '还有更早的任务未显示。'
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      <div
        aria-busy={
          isRendering ||
          previewProgress !== null ||
          (previewLease !== null && inlinePreviewStatus === 'loading')
        }
        className="aw-editor-scroll aw-editor-preview"
      >
        {previewLease !== null && inlinePreviewStatus !== 'unavailable' ? (
          <div className="aw-pdf-preview-stage">
            <iframe
              className="aw-paper aw-pdf-preview-frame"
              onError={(): void => setInlinePreviewStatus('unavailable')}
              onLoad={(): void =>
                setInlinePreviewStatus((current) => (current === 'loading' ? 'ready' : current))
              }
              sandbox=""
              src={previewLease.url}
              title={t('resume.workspace.pdfFrameTitle', { defaultValue: '简历 PDF 预览' })}
            />
            {inlinePreviewStatus === 'loading' ? (
              <div aria-live="polite" className="aw-pdf-preview-loading" role="status">
                {t('resume.workspace.pdfInlineLoading', {
                  defaultValue: '正在浏览器中打开已验证的 PDF…'
                })}
              </div>
            ) : null}
          </div>
        ) : previewLease !== null ? (
          <div className="aw-paper aw-pdf-preview-fallback" role="status">
            <div>
              <strong>
                {t('resume.workspace.pdfInlineUnavailableTitle', {
                  defaultValue: '当前浏览器无法内嵌显示 PDF'
                })}
              </strong>
              <p>
                {t('resume.workspace.pdfInlineUnavailableDescription', {
                  defaultValue: 'PDF 已安全生成并完成校验，请下载后使用系统 PDF 查看器打开。'
                })}
              </p>
            </div>
          </div>
        ) : (
          <ResumeSemanticPreview
            document={editor.resume}
            label={t('resume.semanticPreviewAria', { defaultValue: '简历语义预览' })}
          />
        )}
      </div>
    </section>
  )
}
