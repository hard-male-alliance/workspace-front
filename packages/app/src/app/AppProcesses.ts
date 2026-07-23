/** @file 跨限界上下文的命名产品流程 / Named product processes spanning bounded contexts. */

import type {
  AppGateways,
  UiConcurrencyToken,
  UiResumeEditorModel,
  UiResumeId
} from '../application'
import {
  asUiWorkspaceOperationsPageLimit,
  type UiWorkspaceArtifact,
  type UiWorkspaceArtifactContent,
  type UiWorkspaceArtifactId,
  type UiWorkspaceJob,
  type UiWorkspaceJobAuthority,
  type UiWorkspaceJobId,
  type UiWorkspaceOperationsCursor
} from '../contexts/workspace-operations'
import type { UiCommandId } from '../shared-kernel/command'
import { asUiOpaqueId, type UiWorkspaceId } from '../shared-kernel/identity'
import { nextPollDelayMilliseconds, waitForVisiblePollDelay } from '../shared-kernel/polling'

/** @brief 浏览器内 PDF 预览的内存上限 / In-memory byte ceiling for browser PDF preview. */
export const RESUME_PDF_PREVIEW_MAX_BYTES = 64 * 1024 * 1024

/** @brief Resume Render Job 的 canonical kind / Canonical kind of a Resume Render Job. */
const RESUME_RENDER_JOB_KIND = 'resume.render'

/** @brief Resume Render Job 的 canonical subject type / Canonical subject type of a Resume Render Job. */
const RESUME_RESOURCE_TYPE = 'resume'

/** @brief Job 结果引用中的 canonical Artifact type / Canonical Artifact type in Job result references. */
const ARTIFACT_RESOURCE_TYPE = 'artifact'

/** @brief 一次恢复发现最多扫描的 Job 页数 / Maximum Job pages scanned by one recovery discovery. */
const RESUME_RENDER_RECOVERY_PAGE_BUDGET = 5

/** @brief 一次恢复发现最多呈现的精确匹配 Job 数 / Maximum exact-match Jobs returned by one recovery discovery. */
const RESUME_RENDER_RECOVERY_RESULT_LIMIT = 20

/** @brief 一次 Resume render 流程绑定的不可变领域代际 / Immutable domain generation bound to one Resume-render process. */
export interface ResumeRenderTarget {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 要渲染的 Resume identity / Resume identity to render. */
  readonly resumeId: UiResumeId
  /** @brief 要渲染的精确 Resume revision / Exact Resume revision to render. */
  readonly resumeRevision: number
}

/** @brief 启动一次 PDF preview 的完整用户意图 / Complete user intent for starting one PDF preview. */
export interface StartResumePdfPreview extends ResumeRenderTarget {
  /** @brief 同一用户意图及安全确认中稳定的命令 identity / Command identity stable across one user intent and safe confirmations. */
  readonly commandId: UiCommandId
  /** @brief 当前网络调用的取消信号 / Abort signal for the current network call. */
  readonly signal?: AbortSignal
}

/** @brief 轮询观察到新权威时的通知 / Notification emitted when polling observes new authority. */
export type ResumeRenderObservation = (authority: UiWorkspaceJobAuthority) => void

/** @brief 通用 Workspace Job 权威观察通知 / Generic Workspace-Job authority observation. */
export type WorkspaceJobObservation = ResumeRenderObservation

/** @brief 可替换的下一轮等待策略 / Replaceable policy for waiting before the next poll. */
export type ResumeRenderPollWait = (delayMilliseconds: number, signal: AbortSignal) => Promise<void>

/** @brief Resume Render 恢复候选的有界第一页 / Bounded first page of Resume-render recovery candidates. */
export interface ResumeRenderRecoveryCandidates {
  /** @brief 与精确 Resume revision 匹配的有界候选 Job / Bounded candidate Jobs matching the exact Resume revision. */
  readonly jobs: readonly UiWorkspaceJob[]
  /** @brief 页预算或结果上限之外是否可能还有候选；true 时不能宣称候选完整 / Whether candidates may remain beyond the page budget or result limit. */
  readonly hasMore: boolean
}

/** @brief 已从成功 Job 的结果引用解析出的 PDF metadata / PDF metadata resolved from a succeeded Job result reference. */
export interface ResolvedResumePdf {
  /** @brief 完整且权威的 Artifact metadata / Complete authoritative Artifact metadata. */
  readonly artifact: UiWorkspaceArtifact
  /** @brief Job 中引用该 Artifact 的 identity / Artifact identity referenced by the Job. */
  readonly artifactId: UiWorkspaceArtifactId
}

/** @brief Resume Render 跨资源不变量失败类别 / Cross-resource invariant failure category for Resume Render. */
export type ResumeRenderProcessErrorCode =
  | 'artifact-expired'
  | 'artifact-reference-duplicate'
  | 'artifact-result-ambiguous'
  | 'artifact-result-missing'
  | 'artifact-subject-mismatch'
  | 'content-mismatch'
  | 'invalid-job-transition'
  | 'job-identity-mismatch'
  | 'job-kind-mismatch'
  | 'job-subject-mismatch'
  | 'preview-too-large'

/**
 * @brief 不泄漏服务端文案的 Resume Render 流程错误 / Resume-render process error that exposes no server-authored text.
 */
export class ResumeRenderProcessError extends Error {
  /** @brief 稳定流程错误 code / Stable process-error code. */
  readonly code: ResumeRenderProcessErrorCode

  /**
   * @brief 构造一个安全且可分类的流程错误 / Construct a safe, classifiable process error.
   * @param code 稳定错误 code / Stable error code.
   */
  constructor(code: ResumeRenderProcessErrorCode) {
    super(`Resume Render process invariant failed: ${code}.`)
    this.name = 'ResumeRenderProcessError'
    this.code = code
  }
}

/** @brief 跨 Resume 与 Workspace Operations 的命名应用流程 / Named application process spanning Resume and Workspace Operations. */
export interface ResumeRenderProcess {
  /**
   * @brief 启动一个只请求 PDF 的 preview Job / Start a preview Job requesting only PDF.
   * @param input 冻结的用户意图 / Frozen user intent.
   * @return 已接受且完成跨资源核对的 Job 权威 / Accepted Job authority after cross-resource validation.
   */
  readonly startPdfPreview: (input: StartResumePdfPreview) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 持续观察一个已知 Job，直到权威终态或取消 / Observe a known Job until an authoritative terminal state or cancellation.
   * @param target Render 绑定的 Resume 代际 / Resume generation bound to the render.
   * @param initial 已知 Job 权威 / Known Job authority.
   * @param signal 页面或用户取消信号 / Page or user abort signal.
   * @param onObservation 每次权威变化通知 / Notification for each authority change.
   * @return 任一真实终态的 Job 权威 / Job authority in any real terminal state.
   */
  readonly watchToTerminal: (
    target: ResumeRenderTarget,
    initial: UiWorkspaceJobAuthority,
    signal: AbortSignal,
    onObservation: ResumeRenderObservation
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 读取已知 Job 的最新权威 / Read the latest authority for a known Job.
   * @param target Render 绑定的 Resume 代际 / Resume generation bound to the render.
   * @param jobId Job identity / Job identity.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 已完成目标核对的最新 Job / Latest Job after target validation.
   */
  readonly refreshJob: (
    target: ResumeRenderTarget,
    jobId: UiWorkspaceJobId,
    signal?: AbortSignal
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 读取第一批可由用户恢复的 Render Job 候选 / Read the first bounded set of Render Jobs a user may recover.
   * @param target 精确 Resume 代际 / Exact Resume generation.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 不冒充原 intent 精确关联的候选集合 / Candidate set that does not pretend exact correlation to the original intent.
   */
  readonly findRecoveryCandidates: (
    target: ResumeRenderTarget,
    signal?: AbortSignal
  ) => Promise<ResumeRenderRecoveryCandidates>
  /**
   * @brief 取消一个仍在执行的 Job / Cancel a still-running Job.
   * @param target Render 绑定的 Resume 代际 / Resume generation bound to the render.
   * @param authority 当前 Job 与强 ETag / Current Job and strong ETag.
   * @param commandId 同一取消意图中稳定的命令 identity / Command identity stable within one cancellation intent.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 取消命令返回并核对后的权威 / Authority returned and validated by cancellation.
   */
  readonly cancel: (
    target: ResumeRenderTarget,
    authority: UiWorkspaceJobAuthority,
    commandId: UiCommandId,
    signal?: AbortSignal
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 从 succeeded Job 的结果引用解析唯一 PDF / Resolve the sole PDF from a succeeded Job's result references.
   * @param target Render 绑定的 Resume 代际 / Resume generation bound to the render.
   * @param job 成功完成的 Job / Successfully completed Job.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 不暴露受保护 URL 的 PDF metadata / PDF metadata exposing no protected URL.
   */
  readonly resolvePdf: (
    target: ResumeRenderTarget,
    job: Extract<UiWorkspaceJob, { readonly status: 'succeeded' }>,
    signal?: AbortSignal
  ) => Promise<ResolvedResumePdf>
  /**
   * @brief 读取适合浏览器预览的完整 PDF stream / Read a complete PDF stream suitable for browser preview.
   * @param target Render 绑定的 Resume 代际 / Resume generation bound to the render.
   * @param artifact 已完成跨资源核对的 Artifact / Artifact that passed cross-resource validation.
   * @param signal 可选取消信号 / Optional abort signal.
   * @return 完整、受认证且尚未消费的内容 / Complete authenticated content not yet consumed.
   */
  readonly readPdfPreview: (
    target: ResumeRenderTarget,
    artifact: UiWorkspaceArtifact,
    signal?: AbortSignal
  ) => Promise<UiWorkspaceArtifactContent>
}

/** @brief 一次 Resume restore 流程绑定的不可变目标 / Immutable target bound to one Resume-restore process. */
export interface ResumeRestoreTarget {
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 要恢复的 Resume / Resume to restore. */
  readonly resumeId: UiResumeId
  /** @brief 启动 restore 时读取的当前 revision / Current revision read when restore starts. */
  readonly currentRevision: number
  /** @brief 用户明确选择的历史 revision / Historical revision explicitly selected by the user. */
  readonly sourceRevision: number
}

/** @brief 启动一次 Resume restore 的完整用户意图 / Complete user intent for starting one Resume restore. */
export interface StartResumeRestore extends ResumeRestoreTarget {
  /** @brief 同一恢复意图及确认重放中稳定的命令 identity / Command identity stable across the restore intent and confirmation replays. */
  readonly commandId: UiCommandId
  /** @brief 当前 Resume 表示的强 ETag / Strong ETag of the current Resume representation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 当前网络调用的可选取消信号 / Optional cancellation signal for the current network call. */
  readonly signal?: AbortSignal
}

/** @brief Resume restore 跨资源不变量失败类别 / Cross-resource invariant failure category for Resume restore. */
export type ResumeRestoreProcessErrorCode =
  | 'invalid-job-transition'
  | 'job-identity-mismatch'
  | 'job-subject-mismatch'
  | 'resume-not-advanced'

/** @brief 不泄漏服务端内容的 Resume restore 流程错误 / Resume-restore process error exposing no server-authored content. */
export class ResumeRestoreProcessError extends Error {
  /** @brief 稳定流程错误 code / Stable process-error code. */
  readonly code: ResumeRestoreProcessErrorCode

  /**
   * @brief 构造安全且可分类的 restore 流程错误 / Construct a safe, classifiable restore-process error.
   * @param code 稳定流程错误 code / Stable process-error code.
   */
  constructor(code: ResumeRestoreProcessErrorCode) {
    super(`Resume restore process invariant failed: ${code}.`)
    this.name = 'ResumeRestoreProcessError'
    this.code = code
  }
}

/** @brief 跨 Resume Review 与 Workspace Operations 的恢复流程 / Restore process spanning Resume Review and Workspace Operations. */
export interface ResumeRestoreProcess {
  /**
   * @brief 启动一次并发安全的 restore Job / Start one concurrency-safe restore Job.
   * @param input 冻结的当前权威与恢复意图 / Frozen current authority and restore intent.
   * @return 已完成 Workspace/subject 核对的 Job 权威 / Job authority after Workspace and subject validation.
   */
  readonly start: (input: StartResumeRestore) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 观察一个已知 restore Job 到真实终态 / Observe a known restore Job to an authoritative terminal state.
   * @param target 冻结恢复目标 / Frozen restore target.
   * @param initial 已知 Job 权威 / Known Job authority.
   * @param signal 页面或用户取消信号 / Page or user cancellation signal.
   * @param onObservation 每次权威更新通知 / Notification for each authority update.
   * @return 真实终态 Job 权威 / Authoritative terminal Job authority.
   */
  readonly watchToTerminal: (
    target: ResumeRestoreTarget,
    initial: UiWorkspaceJobAuthority,
    signal: AbortSignal,
    onObservation: WorkspaceJobObservation
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 读取已知 restore Job 的最新权威 / Read the latest authority of a known restore Job.
   * @param target 冻结恢复目标 / Frozen restore target.
   * @param jobId Job identity / Job identity.
   * @param signal 可选取消信号 / Optional cancellation signal.
   * @return 已完成范围核对的 Job 权威 / Job authority after scope validation.
   */
  readonly refreshJob: (
    target: ResumeRestoreTarget,
    jobId: UiWorkspaceJobId,
    signal?: AbortSignal
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief 取消一个仍在执行的 restore Job / Cancel a restore Job that is still running.
   * @param target 冻结恢复目标 / Frozen restore target.
   * @param authority 当前 Job 与强 ETag / Current Job and strong ETag.
   * @param commandId 同一取消意图中稳定的 identity / Stable identity within one cancellation intent.
   * @param signal 可选取消信号 / Optional cancellation signal.
   * @return 取消后并完成状态迁移核对的权威 / Authority after cancellation and transition validation.
   */
  readonly cancel: (
    target: ResumeRestoreTarget,
    authority: UiWorkspaceJobAuthority,
    commandId: UiCommandId,
    signal?: AbortSignal
  ) => Promise<UiWorkspaceJobAuthority>
  /**
   * @brief succeeded 后重新读取当前 Resume 权威 / Reread current Resume authority after success.
   * @param target 冻结恢复目标 / Frozen restore target.
   * @param job succeeded Job / Succeeded Job.
   * @param signal 读取取消信号 / Read cancellation signal.
   * @return revision 已前进的完整 Resume 权威 / Complete Resume authority whose revision advanced.
   */
  readonly readRestoredResume: (
    target: ResumeRestoreTarget,
    job: Extract<UiWorkspaceJob, { readonly status: 'succeeded' }>,
    signal: AbortSignal
  ) => Promise<UiResumeEditorModel>
}

/** @brief 应用层拥有的命名产品流程集合 / Named product processes owned by the application layer. */
export interface AppProcesses {
  /** @brief Resume PDF Render 跨上下文流程 / Cross-context Resume PDF Render process. */
  readonly resumeRender: ResumeRenderProcess
  /** @brief Resume 历史恢复跨上下文流程 / Cross-context Resume history-restore process. */
  readonly resumeRestore: ResumeRestoreProcess
}

/**
 * @brief 判断 Job 是否尚未进入终态 / Determine whether a Job has not entered a terminal state.
 * @param job 已验证 Job / Validated Job.
 * @return queued 或 running 时为 true / True for queued or running.
 */
export function workspaceJobNeedsPolling(job: UiWorkspaceJob): boolean {
  return job.status === 'queued' || job.status === 'running'
}

/**
 * @brief 核对 Job 是否属于精确 Resume Render 代际 / Validate that a Job belongs to an exact Resume-render generation.
 * @param job 待核对 Job / Job to validate.
 * @param target 精确 Resume 代际 / Exact Resume generation.
 * @param expectedJobId 可选路径 Job identity / Optional Job identity from the request path.
 */
function assertResumeRenderJobScope(
  job: UiWorkspaceJob,
  target: ResumeRenderTarget,
  expectedJobId?: UiWorkspaceJobId
): void {
  if (
    job.workspaceId !== target.workspaceId ||
    (expectedJobId !== undefined && job.id !== expectedJobId)
  ) {
    throw new ResumeRenderProcessError('job-identity-mismatch')
  }
  if (job.kind !== RESUME_RENDER_JOB_KIND) {
    throw new ResumeRenderProcessError('job-kind-mismatch')
  }
  if (job.subject.resourceType !== RESUME_RESOURCE_TYPE || job.subject.id !== target.resumeId) {
    throw new ResumeRenderProcessError('job-subject-mismatch')
  }
}

/**
 * @brief 核对 Job scope，并在服务端提供时核对 Resume revision / Validate Job scope and the Resume revision when supplied by the service.
 * @param job 待核对 Job / Job to validate.
 * @param target 精确 Resume 代际 / Exact Resume generation.
 * @param expectedJobId 可选路径 Job identity / Optional Job identity from the request path.
 */
function assertResumeRenderJob(
  job: UiWorkspaceJob,
  target: ResumeRenderTarget,
  expectedJobId?: UiWorkspaceJobId
): void {
  assertResumeRenderJobScope(job, target, expectedJobId)
  if (
    job.subject.revision !== undefined &&
    job.subject.revision !== null &&
    job.subject.revision !== target.resumeRevision
  ) {
    throw new ResumeRenderProcessError('job-subject-mismatch')
  }
}

/**
 * @brief 核对 Job 属于目标 Resume restore，而不猜测开放 kind 或可选 subject revision / Validate that a Job belongs to a target Resume restore without guessing its open kind or optional subject revision.
 * @param job 待核对 Job / Job to validate.
 * @param target 冻结恢复目标 / Frozen restore target.
 * @param expectedJobId 可选路径 Job identity / Optional Job identity from the request path.
 */
function assertResumeRestoreJob(
  job: UiWorkspaceJob,
  target: ResumeRestoreTarget,
  expectedJobId?: UiWorkspaceJobId
): void {
  if (
    job.workspaceId !== target.workspaceId ||
    (expectedJobId !== undefined && job.id !== expectedJobId)
  ) {
    throw new ResumeRestoreProcessError('job-identity-mismatch')
  }
  if (job.subject.resourceType !== RESUME_RESOURCE_TYPE || job.subject.id !== target.resumeId) {
    throw new ResumeRestoreProcessError('job-subject-mismatch')
  }
}

/**
 * @brief 判断两次 Job 观察之间是否有实质进展 / Determine whether two Job observations contain material progress.
 * @param previous 前一次 Job / Previous Job.
 * @param next 新 Job / New Job.
 * @return 状态、revision、phase 或完成量变化时为 true / True when status, revision, phase, or completed amount changed.
 */
function hasMaterialJobProgress(previous: UiWorkspaceJob, next: UiWorkspaceJob): boolean {
  return (
    previous.status !== next.status ||
    previous.revision !== next.revision ||
    previous.progress?.phase !== next.progress?.phase ||
    previous.progress?.completed !== next.progress?.completed ||
    previous.progress?.total !== next.progress?.total
  )
}

/**
 * @brief 核对一次 Job 状态迁移没有倒退或越过契约图 / Validate that a Job transition neither regresses nor leaves the contract graph.
 * @param previous 前一次权威 Job / Previous authoritative Job.
 * @param next 下一次权威 Job / Next authoritative Job.
 */
function assertJobTransition(previous: UiWorkspaceJob, next: UiWorkspaceJob): void {
  /** @brief 每个状态允许的下一状态集合 / Allowed next-state set for each status. */
  const allowed: Readonly<Record<UiWorkspaceJob['status'], ReadonlySet<UiWorkspaceJob['status']>>> =
    {
      queued: new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']),
      running: new Set(['running', 'succeeded', 'failed', 'cancelled']),
      succeeded: new Set(['succeeded']),
      failed: new Set(['failed']),
      cancelled: new Set(['cancelled']),
      expired: new Set(['expired'])
    }
  if (
    previous.id !== next.id ||
    previous.workspaceId !== next.workspaceId ||
    next.revision < previous.revision ||
    !allowed[previous.status].has(next.status)
  ) {
    throw new ResumeRenderProcessError('invalid-job-transition')
  }
}

/**
 * @brief 核对 Artifact 属于目标 Resume，并在服务端提供时核对 revision / Validate that an Artifact belongs to the target Resume and match its revision when supplied.
 * @param artifact 待核对 Artifact / Artifact to validate.
 * @param target 精确 Resume 代际 / Exact Resume generation.
 */
function assertResumeArtifactSubject(
  artifact: UiWorkspaceArtifact,
  target: ResumeRenderTarget
): void {
  if (
    artifact.workspaceId !== target.workspaceId ||
    artifact.subject.resourceType !== RESUME_RESOURCE_TYPE ||
    artifact.subject.id !== target.resumeId ||
    (artifact.subject.revision !== undefined &&
      artifact.subject.revision !== null &&
      artifact.subject.revision !== target.resumeRevision)
  ) {
    throw new ResumeRenderProcessError('artifact-subject-mismatch')
  }
}

/**
 * @brief 创建 Resume Render 跨上下文应用流程 / Create the cross-context Resume-render application process.
 * @param gateways 已组合的领域端口 / Composed domain ports.
 * @param waitForNextPoll 可替换轮询等待策略 / Replaceable polling-wait policy.
 * @param now 可替换 epoch 毫秒时钟 / Replaceable epoch-millisecond clock.
 * @return 只暴露命名产品行为的流程 / Process exposing only named product behavior.
 */
export function createAppProcesses(
  gateways: AppGateways,
  waitForNextPoll: ResumeRenderPollWait = waitForVisiblePollDelay,
  now: () => number = Date.now
): AppProcesses {
  /**
   * @brief 以共用退避和状态图观察一个已知 Job / Observe a known Job using shared backoff and transition rules.
   * @param workspaceId 显式授权 Workspace / Explicitly authorized Workspace.
   * @param initial 已知 Job 权威 / Known Job authority.
   * @param signal 页面或用户取消信号 / Page or user cancellation signal.
   * @param onObservation 每次权威变化通知 / Notification on each authority change.
   * @param assertScope 对当前流程的范围核对 / Scope assertion for the current process.
   * @param invalidTransition 构造上下文专属迁移错误 / Factory for a context-specific transition error.
   * @return 真实终态 Job 权威 / Authoritative terminal Job.
   */
  const watchWorkspaceJobToTerminal = async (
    workspaceId: UiWorkspaceId,
    initial: UiWorkspaceJobAuthority,
    signal: AbortSignal,
    onObservation: WorkspaceJobObservation,
    assertScope: (job: UiWorkspaceJob, expectedJobId?: UiWorkspaceJobId) => void,
    invalidTransition: () => Error
  ): Promise<UiWorkspaceJobAuthority> => {
    assertScope(initial.job)
    /** @brief 当前最新 Job 权威 / Latest current Job authority. */
    let current = initial
    /** @brief 上一次没有进展后的等待时间 / Previous delay after an observation without progress. */
    let previousDelay: number | null = null
    while (workspaceJobNeedsPolling(current.job)) {
      /** @brief 本轮带 decorrelated jitter 的等待 / Decorrelated-jitter wait for this poll. */
      const delay = nextPollDelayMilliseconds(previousDelay)
      await waitForNextPoll(delay, signal)
      /** @brief 本轮读取到的新权威 / New authority read by this poll. */
      const next = await gateways.workspaceOperations.getJob({
        jobId: current.job.id,
        signal,
        workspaceId
      })
      signal.throwIfAborted()
      assertScope(next.job, current.job.id)
      try {
        assertJobTransition(current.job, next.job)
      } catch {
        throw invalidTransition()
      }
      previousDelay = hasMaterialJobProgress(current.job, next.job) ? null : delay
      current = next
      onObservation(current)
    }
    return current
  }

  /** @brief Resume Render 命名流程实现 / Named Resume-render process implementation. */
  const resumeRender: ResumeRenderProcess = {
    async startPdfPreview(input): Promise<UiWorkspaceJobAuthority> {
      /** @brief API v2 接受的 Job 权威 / Job authority accepted by API v2. */
      const authority = await gateways.resume.startResumeRender({
        commandId: input.commandId,
        formats: ['pdf'],
        mode: 'preview',
        resumeId: input.resumeId,
        resumeRevision: input.resumeRevision,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        workspaceId: input.workspaceId
      })
      assertResumeRenderJob(authority.job, input)
      return authority
    },
    async watchToTerminal(target, initial, signal, onObservation) {
      return watchWorkspaceJobToTerminal(
        target.workspaceId,
        initial,
        signal,
        onObservation,
        (job, expectedJobId): void => assertResumeRenderJob(job, target, expectedJobId),
        (): Error => new ResumeRenderProcessError('invalid-job-transition')
      )
    },
    async refreshJob(target, jobId, signal) {
      /** @brief 最新 Job 权威 / Latest Job authority. */
      const authority = await gateways.workspaceOperations.getJob({
        jobId,
        ...(signal === undefined ? {} : { signal }),
        workspaceId: target.workspaceId
      })
      assertResumeRenderJob(authority.job, target, jobId)
      return authority
    },
    async findRecoveryCandidates(target, signal) {
      /** @brief 跨页但受预算约束的精确匹配 / Exact matches accumulated across a bounded number of pages. */
      const jobs: UiWorkspaceJob[] = []
      /** @brief 下一页 cursor，首页为 null / Cursor for the next page, or null for the first page. */
      let cursor: UiWorkspaceOperationsCursor | null = null

      for (let pageIndex = 0; pageIndex < RESUME_RENDER_RECOVERY_PAGE_BUDGET; pageIndex += 1) {
        /** @brief 当前稳定排序页 / Current page in the stable server ordering. */
        const page = await gateways.workspaceOperations.listJobsPage({
          cursor,
          kind: RESUME_RENDER_JOB_KIND,
          limit: asUiWorkspaceOperationsPageLimit(200),
          ...(signal === undefined ? {} : { signal }),
          subjectId: target.resumeId,
          subjectType: RESUME_RESOURCE_TYPE,
          workspaceId: target.workspaceId
        })
        for (const job of page.items) {
          assertResumeRenderJobScope(job, target)
          if (job.subject.revision !== target.resumeRevision) continue
          if (jobs.length === RESUME_RENDER_RECOVERY_RESULT_LIMIT) {
            return { hasMore: true, jobs }
          }
          jobs.push(job)
        }
        if (!page.hasMore) return { hasMore: false, jobs }
        cursor = page.nextCursor
      }
      return { hasMore: true, jobs }
    },
    async cancel(target, authority, commandId, signal) {
      assertResumeRenderJob(authority.job, target)
      if (!workspaceJobNeedsPolling(authority.job)) {
        throw new ResumeRenderProcessError('invalid-job-transition')
      }
      /** @brief cancellation 返回的新权威 / New authority returned by cancellation. */
      const cancelled = await gateways.workspaceOperations.cancelJob({
        commandId,
        concurrencyToken: authority.concurrencyToken,
        jobId: authority.job.id,
        ...(signal === undefined ? {} : { signal }),
        workspaceId: target.workspaceId
      })
      assertResumeRenderJob(cancelled.job, target, authority.job.id)
      assertJobTransition(authority.job, cancelled.job)
      return cancelled
    },
    async resolvePdf(target, job, signal) {
      assertResumeRenderJob(job, target)
      /** @brief 当前 Job 中去重后的 Artifact identities / Deduplicated Artifact identities in the current Job. */
      const artifactIds = new Set<string>()
      /** @brief 解析出的 PDF 候选 / Resolved PDF candidates. */
      const pdfCandidates: UiWorkspaceArtifact[] = []

      for (const reference of job.resultRefs) {
        if (reference.resourceType !== ARTIFACT_RESOURCE_TYPE) continue
        if (artifactIds.has(reference.id)) {
          throw new ResumeRenderProcessError('artifact-reference-duplicate')
        }
        artifactIds.add(reference.id)
        /** @brief 从不透明结果引用提升的 Artifact identity / Artifact identity refined from an opaque result reference. */
        const artifactId = asUiOpaqueId<'workspace-artifact'>(reference.id)
        /** @brief 权威 Artifact metadata / Authoritative Artifact metadata. */
        const { artifact } = await gateways.workspaceOperations.getArtifact({
          artifactId,
          ...(signal === undefined ? {} : { signal }),
          workspaceId: target.workspaceId
        })
        assertResumeArtifactSubject(artifact, target)
        if (
          reference.revision !== undefined &&
          reference.revision !== null &&
          reference.revision !== artifact.revision
        ) {
          throw new ResumeRenderProcessError('artifact-subject-mismatch')
        }
        if (
          artifact.kind === 'resume_pdf' &&
          artifact.mediaType.toLowerCase() === 'application/pdf'
        ) {
          pdfCandidates.push(artifact)
        }
      }

      if (pdfCandidates.length === 0) {
        throw new ResumeRenderProcessError('artifact-result-missing')
      }
      if (pdfCandidates.length !== 1) {
        throw new ResumeRenderProcessError('artifact-result-ambiguous')
      }
      /** @brief 唯一 PDF 候选 / Sole PDF candidate. */
      const artifact = pdfCandidates[0]
      if (artifact === undefined) {
        throw new ResumeRenderProcessError('artifact-result-missing')
      }
      return { artifact, artifactId: artifact.id }
    },
    async readPdfPreview(target, artifact, signal) {
      assertResumeArtifactSubject(artifact, target)
      if (
        artifact.kind !== 'resume_pdf' ||
        artifact.mediaType.toLowerCase() !== 'application/pdf'
      ) {
        throw new ResumeRenderProcessError('content-mismatch')
      }
      if (artifact.expiresAt !== null && Date.parse(artifact.expiresAt) <= now()) {
        throw new ResumeRenderProcessError('artifact-expired')
      }
      if (artifact.sizeBytes > RESUME_PDF_PREVIEW_MAX_BYTES) {
        throw new ResumeRenderProcessError('preview-too-large')
      }
      /** @brief Bearer 认证返回的完整 PDF content / Complete Bearer-authenticated PDF content. */
      const content = await gateways.workspaceOperations.readArtifactContent({
        artifact,
        ...(signal === undefined ? {} : { signal })
      })
      if (
        content.byteLength !== artifact.sizeBytes ||
        content.mediaType.toLowerCase() !== artifact.mediaType.toLowerCase()
      ) {
        await content.body?.cancel().catch(() => undefined)
        throw new ResumeRenderProcessError('content-mismatch')
      }
      return content
    }
  }

  /** @brief Resume restore 命名流程实现 / Named Resume-restore process implementation. */
  const resumeRestore: ResumeRestoreProcess = {
    async start(input) {
      /** @brief API v2 接受的 restore Job / Restore Job accepted by API v2. */
      const authority = await gateways.resumeReview.startResumeRestore(input)
      assertResumeRestoreJob(authority.job, input)
      return authority
    },
    async watchToTerminal(target, initial, signal, onObservation) {
      return watchWorkspaceJobToTerminal(
        target.workspaceId,
        initial,
        signal,
        onObservation,
        (job, expectedJobId): void => assertResumeRestoreJob(job, target, expectedJobId),
        (): Error => new ResumeRestoreProcessError('invalid-job-transition')
      )
    },
    async refreshJob(target, jobId, signal) {
      /** @brief 最新 restore Job 权威 / Latest restore-Job authority. */
      const authority = await gateways.workspaceOperations.getJob({
        jobId,
        ...(signal === undefined ? {} : { signal }),
        workspaceId: target.workspaceId
      })
      assertResumeRestoreJob(authority.job, target, jobId)
      return authority
    },
    async cancel(target, authority, commandId, signal) {
      assertResumeRestoreJob(authority.job, target)
      if (!workspaceJobNeedsPolling(authority.job)) {
        throw new ResumeRestoreProcessError('invalid-job-transition')
      }
      /** @brief cancellation 返回的新权威 / New authority returned by cancellation. */
      const cancelled = await gateways.workspaceOperations.cancelJob({
        commandId,
        concurrencyToken: authority.concurrencyToken,
        jobId: authority.job.id,
        ...(signal === undefined ? {} : { signal }),
        workspaceId: target.workspaceId
      })
      assertResumeRestoreJob(cancelled.job, target, authority.job.id)
      try {
        assertJobTransition(authority.job, cancelled.job)
      } catch {
        throw new ResumeRestoreProcessError('invalid-job-transition')
      }
      return cancelled
    },
    async readRestoredResume(target, job, signal) {
      assertResumeRestoreJob(job, target)
      /** @brief Job 成功后重新读取的唯一当前 Resume 权威 / Sole current Resume authority reread after Job success. */
      const editor = await gateways.resume.getResumeEditor(
        target.workspaceId,
        target.resumeId,
        signal
      )
      if (editor.resume.revision <= target.currentRevision) {
        throw new ResumeRestoreProcessError('resume-not-advanced')
      }
      return editor
    }
  }

  return Object.freeze({
    resumeRender: Object.freeze(resumeRender),
    resumeRestore: Object.freeze(resumeRestore)
  })
}
