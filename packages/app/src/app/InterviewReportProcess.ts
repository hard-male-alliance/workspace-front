/** @file 可恢复的 Interview Report 产品流程 / Recoverable Interview Report product process. */

import type {
  InterviewGateway,
  UiInterviewReport,
  UiInterviewSessionAuthority,
  UiInterviewSessionId,
  UiPrincipalSubject,
  UiWorkspaceJob,
  UiWorkspaceJobAuthority,
  UiWorkspaceJobId,
  UiWorkspaceId,
  WorkspaceOperationsGateway
} from '../application'
import { createUiCommandId, type UiCommandId } from '../shared-kernel/command'
import { asUiOpaqueId } from '../shared-kernel/identity'
import { nextPollDelayMilliseconds, waitForVisiblePollDelay } from '../shared-kernel/polling'

/** @brief 服务端至少保留报告创建幂等记录的时间 / Minimum server retention for report-creation idempotency records. */
export const INTERVIEW_REPORT_RECOVERY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000

/** @brief sessionStorage 中的记录格式版本 / Record format version stored in sessionStorage. */
const INTERVIEW_REPORT_RECOVERY_VERSION = 1

/** @brief sessionStorage 键命名空间 / Namespace for sessionStorage keys. */
const INTERVIEW_REPORT_RECOVERY_KEY_PREFIX = 'ai-job-workspace.interview-report.v1:'

/** @brief 报告流程所需的 Interview 端口最小集合 / Minimal Interview ports required by the report process. */
type InterviewReportGateway = Pick<
  InterviewGateway,
  'createInterviewReportJob' | 'getInterviewReport' | 'getInterviewSession'
>

/** @brief 报告流程所需的 Workspace Operations 端口最小集合 / Minimal Workspace Operations ports required by the report process. */
type InterviewReportOperationsGateway = Pick<WorkspaceOperationsGateway, 'getJob'>

/** @brief 与 Web Storage API 兼容的最小持久化端口 / Minimal persistence port compatible with the Web Storage API. */
export interface InterviewReportRecoveryStorage {
  /**
   * @brief 读取字符串记录 / Read a string record.
   * @param key scope 隔离的存储键 / Scope-isolated storage key.
   * @return 已保存字符串，或不存在时的 null / Stored string, or null when absent.
   */
  readonly getItem: (key: string) => string | null
  /**
   * @brief 原子替换字符串记录 / Atomically replace a string record.
   * @param key scope 隔离的存储键 / Scope-isolated storage key.
   * @param value 无秘密的恢复记录 / Secret-free recovery record.
   */
  readonly setItem: (key: string, value: string) => void
  /**
   * @brief 删除字符串记录 / Remove a string record.
   * @param key scope 隔离的存储键 / Scope-isolated storage key.
   */
  readonly removeItem: (key: string) => void
}

/** @brief 一次报告意图的 principal、Workspace 与 Session 边界 / Principal, Workspace, and Session boundary for one report intent. */
export interface InterviewReportScope {
  /** @brief 当前固定 issuer 下的 principal subject / Current principal subject beneath the fixed issuer. */
  readonly principalSubject: UiPrincipalSubject
  /** @brief 当前显式授权 Workspace / Currently authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 报告唯一所属 Session / Sole Session owning the report. */
  readonly sessionId: UiInterviewSessionId
}

/** @brief 未确认 POST 的安全恢复模式 / Safe recovery mode for an unconfirmed POST. */
export type InterviewReportRecoveryMode = 'exact-replay' | 'authority-review'

/** @brief 可安全交给页面的报告恢复事实 / Report-recovery facts safe to expose to a page. */
export type InterviewReportRecovery =
  | {
      /** @brief 必须由用户确认后原样重放 / Exact replay requires user confirmation. */
      readonly status: 'confirmation-required'
      /** @brief 同一请求必须复用的命令身份 / Command identity that the same request must reuse. */
      readonly commandId: UiCommandId
      /** @brief 首次冻结意图的 epoch 毫秒 / Epoch milliseconds when the intent was first frozen. */
      readonly createdAtMilliseconds: number
      /** @brief 最早允许确认的 epoch 毫秒 / Earliest epoch milliseconds at which confirmation is allowed. */
      readonly confirmAfterMilliseconds: number | null
    }
  | {
      /** @brief 旧响应无法安全确认，只能先重读权威 / The old response cannot confirm safely; authority must be reviewed. */
      readonly status: 'authority-review-required'
      /** @brief 不得再次发送的旧命令身份 / Old command identity that must not be sent again. */
      readonly commandId: UiCommandId
      /** @brief 首次冻结意图的 epoch 毫秒 / Epoch milliseconds when the intent was first frozen. */
      readonly createdAtMilliseconds: number
    }
  | {
      /** @brief 已知 Job identity，可在重载后只读恢复 / A known Job identity can be recovered read-only after reload. */
      readonly status: 'job-accepted'
      /** @brief 创建该 Job 的稳定命令身份 / Stable command identity that created the Job. */
      readonly commandId: UiCommandId
      /** @brief 已接受 Job identity / Accepted Job identity. */
      readonly jobId: UiWorkspaceJobId
      /** @brief 首次冻结意图的 epoch 毫秒 / Epoch milliseconds when the intent was first frozen. */
      readonly createdAtMilliseconds: number
    }

/** @brief 报告流程的可观察产品事件 / Observable product events from the report process. */
export type InterviewReportObservation =
  | {
      /** @brief POST 已返回并核对 Job / The POST returned a validated Job. */
      readonly status: 'job-accepted'
      readonly authority: UiWorkspaceJobAuthority
    }
  | {
      /** @brief 轮询取得新的 Job 权威 / Polling obtained a new Job authority. */
      readonly status: 'job-updated'
      readonly authority: UiWorkspaceJobAuthority
    }
  | {
      /** @brief Job 已成功，但 Session 尚未发布 reportId / The Job succeeded but the Session has not published reportId. */
      readonly status: 'report-publishing'
      readonly sessionAuthority: UiInterviewSessionAuthority
    }
  | {
      /** @brief Session 与 Report 权威已共同核对 / Session and Report authorities were jointly validated. */
      readonly status: 'ready'
      readonly sessionAuthority: UiInterviewSessionAuthority
      readonly report: UiInterviewReport
    }

/** @brief 页面可直接消费的报告流程结果 / Report-process outcome directly consumable by a page. */
export type InterviewReportProcessOutcome =
  | {
      /** @brief 报告已由 Session 权威定位并完成跨资源核对 / The report was located by Session authority and cross-resource validated. */
      readonly status: 'ready'
      readonly sessionAuthority: UiInterviewSessionAuthority
      readonly report: UiInterviewReport
    }
  | {
      /** @brief 未决写入需要显式确认 / An indeterminate write requires explicit confirmation. */
      readonly status: 'confirmation-required'
      readonly recovery: Extract<
        InterviewReportRecovery,
        { readonly status: 'confirmation-required' }
      >
    }
  | {
      /** @brief 旧命令不得重放，页面应只提供权威刷新 / The old command must not be replayed; the page should offer authority refresh only. */
      readonly status: 'authority-review-required'
      readonly recovery: Extract<
        InterviewReportRecovery,
        { readonly status: 'authority-review-required' }
      >
    }
  | {
      /** @brief 当前 Session 尚无报告且没有可恢复 intent / The current Session has no report and no recoverable intent. */
      readonly status: 'not-started'
      readonly sessionAuthority: UiInterviewSessionAuthority
    }
  | {
      /** @brief Job 以非成功终态结束 / The Job ended in a non-success terminal state. */
      readonly status: 'job-terminal'
      readonly authority: UiWorkspaceJobAuthority
    }

/** @brief 可替换的可见性轮询等待 / Replaceable visibility-aware polling wait. */
export type InterviewReportPollWait = (
  delayMilliseconds: number,
  signal: AbortSignal
) => Promise<void>

/** @brief 报告流程依赖 / Dependencies of the Interview Report process. */
export interface InterviewReportProcessDependencies {
  /** @brief Interview REST 端口 / Interview REST port. */
  readonly interview: InterviewReportGateway
  /** @brief 通用 Workspace Job 端口 / Generic Workspace Job port. */
  readonly workspaceOperations: InterviewReportOperationsGateway
  /** @brief sessionStorage 或确定性测试替身 / sessionStorage or a deterministic test double. */
  readonly storage: InterviewReportRecoveryStorage
  /** @brief 可替换可见性等待策略 / Optional replaceable visibility-aware wait strategy. */
  readonly waitForNextPoll?: InterviewReportPollWait
  /** @brief 可替换 epoch 毫秒时钟 / Optional replaceable epoch-millisecond clock. */
  readonly now?: () => number
}

/** @brief Interview Report 产品流程 / Interview Report product process. */
export interface InterviewReportProcess {
  /**
   * @brief 同步读取当前 scope 的有效恢复事实 / Synchronously read valid recovery facts for the current scope.
   * @param scope 当前 principal、Workspace 与 Session / Current principal, Workspace, and Session.
   * @return 24 小时内的恢复事实，或 null / Recovery facts within 24 hours, or null.
   */
  readonly getRecovery: (scope: InterviewReportScope) => InterviewReportRecovery | null
  /**
   * @brief 从最新 Session 权威冻结并启动一个新报告意图 / Freeze and start a new report intent from current Session authority.
   * @param scope 当前 principal、Workspace 与 Session / Current principal, Workspace, and Session.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 可选产品状态通知 / Optional product-state notification.
   * @return 报告、终态 Job 或恢复要求 / Report, terminal Job, or recovery requirement.
   */
  readonly start: (
    scope: InterviewReportScope,
    signal: AbortSignal,
    onObservation?: (observation: InterviewReportObservation) => void
  ) => Promise<InterviewReportProcessOutcome>
  /**
   * @brief 页面重载后只读恢复已知 Job 或发现未决确认 / Recover a known Job read-only or discover pending confirmation after reload.
   * @param scope 当前 principal、Workspace 与 Session / Current principal, Workspace, and Session.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 可选产品状态通知 / Optional product-state notification.
   * @return 当前可证明的报告流程结果 / Currently provable report-process outcome.
   */
  readonly recover: (
    scope: InterviewReportScope,
    signal: AbortSignal,
    onObservation?: (observation: InterviewReportObservation) => void
  ) => Promise<InterviewReportProcessOutcome>
  /**
   * @brief 显式确认并原样重放上次未知结果 / Explicitly confirm and exactly replay the previous unknown outcome.
   * @param scope 当前 principal、Workspace 与 Session / Current principal, Workspace, and Session.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 可选产品状态通知 / Optional product-state notification.
   * @return 当前可证明的报告流程结果 / Currently provable report-process outcome.
   */
  readonly confirm: (
    scope: InterviewReportScope,
    signal: AbortSignal,
    onObservation?: (observation: InterviewReportObservation) => void
  ) => Promise<InterviewReportProcessOutcome>
}

/** @brief 报告流程不变量错误 code / Report-process invariant error code. */
export type InterviewReportProcessErrorCode =
  | 'invalid-job-transition'
  | 'job-identity-mismatch'
  | 'job-subject-mismatch'
  | 'pending-intent-exists'
  | 'recovery-storage-unavailable'
  | 'report-identity-mismatch'
  | 'report-session-mismatch'
  | 'session-identity-mismatch'
  | 'session-not-completed'

/** @brief 不携带服务端正文或报告数据的流程错误 / Process error carrying neither server-authored text nor report data. */
export class InterviewReportProcessError extends Error {
  /** @brief 稳定错误 code / Stable error code. */
  readonly code: InterviewReportProcessErrorCode

  /**
   * @brief 构造安全流程错误 / Construct a safe process error.
   * @param code 稳定错误 code / Stable error code.
   */
  constructor(code: InterviewReportProcessErrorCode) {
    super(`Interview Report process invariant failed: ${code}.`)
    this.name = 'InterviewReportProcessError'
    this.code = code
  }
}

/** @brief sessionStorage 中的无秘密恢复记录 / Secret-free recovery record stored in sessionStorage. */
interface StoredInterviewReportRecovery {
  readonly version: typeof INTERVIEW_REPORT_RECOVERY_VERSION
  readonly principalSubject: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly commandId: string
  readonly createdAtMilliseconds: number
  readonly mode: InterviewReportRecoveryMode
  readonly confirmAfterMilliseconds: number | null
  readonly jobId: string | null
}

/** @brief 判断未知值是否为普通对象 / Determine whether an unknown value is a plain record. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @brief 创建无歧义且 scope 隔离的存储键 / Create an unambiguous scope-isolated storage key.
 * @param scope 当前恢复 scope / Current recovery scope.
 * @return 只用于该 principal、Workspace 与 Session 的键 / Key used only for this principal, Workspace, and Session.
 */
function storageKey(scope: InterviewReportScope): string {
  return `${INTERVIEW_REPORT_RECOVERY_KEY_PREFIX}${JSON.stringify([
    scope.principalSubject,
    scope.workspaceId,
    scope.sessionId
  ])}`
}

/**
 * @brief 核对并解析无秘密恢复记录 / Validate and parse a secret-free recovery record.
 * @param value 未受信任 JSON 值 / Untrusted JSON value.
 * @param scope 存储键声明的 scope / Scope declared by the storage key.
 * @return 完整有效记录，或 null / Complete valid record, or null.
 */
function parseStoredRecovery(
  value: unknown,
  scope: InterviewReportScope
): StoredInterviewReportRecovery | null {
  if (
    !isRecord(value) ||
    value.version !== INTERVIEW_REPORT_RECOVERY_VERSION ||
    value.principalSubject !== scope.principalSubject ||
    value.workspaceId !== scope.workspaceId ||
    value.sessionId !== scope.sessionId ||
    typeof value.commandId !== 'string' ||
    value.commandId.length < 1 ||
    !Number.isSafeInteger(value.createdAtMilliseconds) ||
    (value.mode !== 'exact-replay' && value.mode !== 'authority-review') ||
    (value.confirmAfterMilliseconds !== null &&
      !Number.isSafeInteger(value.confirmAfterMilliseconds)) ||
    (value.jobId !== null && (typeof value.jobId !== 'string' || value.jobId.length < 1))
  ) {
    return null
  }
  return {
    commandId: value.commandId,
    confirmAfterMilliseconds: value.confirmAfterMilliseconds as number | null,
    createdAtMilliseconds: value.createdAtMilliseconds as number,
    jobId: value.jobId,
    mode: value.mode,
    principalSubject: scope.principalSubject,
    sessionId: scope.sessionId,
    version: INTERVIEW_REPORT_RECOVERY_VERSION,
    workspaceId: scope.workspaceId
  }
}

/**
 * @brief 将持久记录投影成页面恢复事实 / Project a stored record into page recovery facts.
 * @param record 已验证持久记录 / Validated stored record.
 * @return 不含存储实现细节的恢复事实 / Recovery facts without storage implementation details.
 */
function projectRecovery(record: StoredInterviewReportRecovery): InterviewReportRecovery {
  /** @brief 恢复所复用的命令 identity / Command identity reused by recovery. */
  const commandId = asUiOpaqueId<'command'>(record.commandId)
  if (record.jobId !== null) {
    return {
      commandId,
      createdAtMilliseconds: record.createdAtMilliseconds,
      jobId: asUiOpaqueId<'workspace-job'>(record.jobId),
      status: 'job-accepted'
    }
  }
  if (record.mode === 'authority-review') {
    return {
      commandId,
      createdAtMilliseconds: record.createdAtMilliseconds,
      status: 'authority-review-required'
    }
  }
  return {
    commandId,
    confirmAfterMilliseconds: record.confirmAfterMilliseconds,
    createdAtMilliseconds: record.createdAtMilliseconds,
    status: 'confirmation-required'
  }
}

/**
 * @brief 核对 Session 响应仍属于精确页面 scope / Validate that a Session response still belongs to the exact page scope.
 * @param authority Session 与强 ETag 权威 / Session and strong-ETag authority.
 * @param scope 页面 scope / Page scope.
 */
function assertSessionScope(
  authority: UiInterviewSessionAuthority,
  scope: InterviewReportScope
): void {
  if (
    authority.session.workspaceId !== scope.workspaceId ||
    authority.session.id !== scope.sessionId
  ) {
    throw new InterviewReportProcessError('session-identity-mismatch')
  }
}

/**
 * @brief 核对 Job 的 Workspace、path identity 与 subject identity / Validate the Job workspace, path identity, and subject identity.
 * @param job 已严格解析 Job / Strictly parsed Job.
 * @param scope 当前报告 scope / Current report scope.
 * @param expectedJobId 已知 path Job identity / Known path Job identity.
 * @note 不猜测开放的 Job kind 或 subject resource type / Open Job kind and subject resource type are intentionally not guessed.
 */
function assertJobScope(
  job: UiWorkspaceJob,
  scope: InterviewReportScope,
  expectedJobId?: UiWorkspaceJobId
): void {
  if (
    job.workspaceId !== scope.workspaceId ||
    (expectedJobId !== undefined && job.id !== expectedJobId)
  ) {
    throw new InterviewReportProcessError('job-identity-mismatch')
  }
  if (job.subject.id !== scope.sessionId) {
    throw new InterviewReportProcessError('job-subject-mismatch')
  }
}

/**
 * @brief 核对 Report 与 Session 暴露的精确身份关系 / Validate the exact identity relationship exposed by Report and Session.
 * @param report 已严格解析报告 / Strictly parsed report.
 * @param authority 当前 Session 权威 / Current Session authority.
 * @param scope 当前报告 scope / Current report scope.
 */
function assertReportScope(
  report: UiInterviewReport,
  authority: UiInterviewSessionAuthority,
  scope: InterviewReportScope
): void {
  if (
    authority.session.reportId === null ||
    report.id !== authority.session.reportId ||
    report.workspaceId !== scope.workspaceId
  ) {
    throw new InterviewReportProcessError('report-identity-mismatch')
  }
  if (report.sessionId !== scope.sessionId) {
    throw new InterviewReportProcessError('report-session-mismatch')
  }
}

/**
 * @brief 判断两个 Job 观察间是否有实质进展 / Determine whether two Job observations contain material progress.
 * @param previous 前一 Job / Previous Job.
 * @param next 后一 Job / Next Job.
 * @return 状态、revision 或进度变化时为 true / True when status, revision, or progress changes.
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
 * @brief 核对两次读取之间没有越出可观察 Job 状态图 / Validate two reads against the observable Job state graph.
 * @param previous 前一 Job 权威 / Previous Job authority.
 * @param next 新 Job 权威 / New Job authority.
 */
function assertJobTransition(previous: UiWorkspaceJob, next: UiWorkspaceJob): void {
  /** @brief 允许跳过未观察中间态的可达状态集合 / Reachable states allowing unobserved intermediate states. */
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
    throw new InterviewReportProcessError('invalid-job-transition')
  }
}

/** @brief POST 失败后的恢复分类 / Recovery classification after a failed POST. */
type DispatchFailureDisposition =
  | { readonly kind: 'definitive' }
  | {
      readonly kind: 'recoverable'
      readonly mode: InterviewReportRecoveryMode
      readonly confirmAfterMilliseconds: number | null
    }

/**
 * @brief 从应用端口错误读取稳定的 API v2 Problem 字段 / Read stable API v2 Problem fields from an application-port error.
 * @param error 未知应用错误 / Unknown application error.
 * @return 已验证形状的 status/code，或 null / Shaped status/code values, or null.
 */
function readProblem(error: unknown): { readonly status: number; readonly code: string } | null {
  if (!isRecord(error) || error.name !== 'ApiV2ProblemError' || !isRecord(error.problem)) {
    return null
  }
  return typeof error.problem.status === 'number' && typeof error.problem.code === 'string'
    ? { code: error.problem.code, status: error.problem.status }
    : null
}

/**
 * @brief 读取已验证 Retry-After 并转换为绝对时刻 / Read validated Retry-After and convert it to an absolute instant.
 * @param error 未知应用错误 / Unknown application error.
 * @param nowMilliseconds 当前时刻 / Current instant.
 * @return 最早确认时刻，或 null / Earliest confirmation instant, or null.
 */
function confirmationInstant(error: unknown, nowMilliseconds: number): number | null {
  if (
    !isRecord(error) ||
    typeof error.retryAfterMilliseconds !== 'number' ||
    !Number.isFinite(error.retryAfterMilliseconds) ||
    error.retryAfterMilliseconds < 0
  ) {
    return null
  }
  return nowMilliseconds + error.retryAfterMilliseconds
}

/**
 * @brief 区分明确拒绝、可精确重放和必须权威审阅 / Distinguish definitive rejection, exact replay, and authority review.
 * @param error POST 抛出的应用错误 / Application error thrown by the POST.
 * @param nowMilliseconds 当前时刻 / Current instant.
 * @return 不暴露 transport 细节的恢复分类 / Recovery classification exposing no transport details.
 */
function classifyDispatchFailure(
  error: unknown,
  nowMilliseconds: number
): DispatchFailureDisposition {
  /** @brief 已验证 Problem / Validated Problem. */
  const problem = readProblem(error)
  if (problem !== null && problem.status >= 400 && problem.status < 500) {
    if (problem.code === 'idempotency.in_progress') {
      return {
        confirmAfterMilliseconds: confirmationInstant(error, nowMilliseconds),
        kind: 'recoverable',
        mode: 'exact-replay'
      }
    }
    if (problem.code === 'idempotency.key_reused') {
      return {
        confirmAfterMilliseconds: null,
        kind: 'recoverable',
        mode: 'authority-review'
      }
    }
    return { kind: 'definitive' }
  }
  if (
    isRecord(error) &&
    error.name === 'ApiV2WriteOutcomeUnknownError' &&
    error.kind === 'contract' &&
    typeof error.status === 'number'
  ) {
    return {
      confirmAfterMilliseconds: null,
      kind: 'recoverable',
      mode: 'authority-review'
    }
  }
  return {
    confirmAfterMilliseconds: null,
    kind: 'recoverable',
    mode: 'exact-replay'
  }
}

/**
 * @brief 创建跨 Interview 与 Workspace Operations 的报告流程 / Create the report process spanning Interview and Workspace Operations.
 * @param dependencies 显式端口、存储、时钟与等待策略 / Explicit ports, storage, clock, and wait policy.
 * @return 页面可注入的紧凑报告流程 / Compact report process suitable for page injection.
 */
export function createInterviewReportProcess(
  dependencies: InterviewReportProcessDependencies
): InterviewReportProcess {
  /** @brief 当前时间源 / Current time source. */
  const now = dependencies.now ?? Date.now
  /** @brief 默认在隐藏页面暂停的轮询等待 / Polling wait that pauses while the page is hidden by default. */
  const waitForNextPoll = dependencies.waitForNextPoll ?? waitForVisiblePollDelay

  /**
   * @brief 尽力删除恢复记录 / Best-effort removal of a recovery record.
   * @param scope 要清理的 scope / Scope to clean.
   */
  function clearRecovery(scope: InterviewReportScope): void {
    try {
      dependencies.storage.removeItem(storageKey(scope))
    } catch {
      // 已完成产品结果不能被非关键 sessionStorage 清理失败覆盖。
    }
  }

  /**
   * @brief 在任何可能 dispatch 之前保存恢复记录 / Save a recovery record before any possible dispatch.
   * @param scope 当前报告 scope / Current report scope.
   * @param record 无秘密记录 / Secret-free record.
   */
  function saveRecovery(scope: InterviewReportScope, record: StoredInterviewReportRecovery): void {
    try {
      dependencies.storage.setItem(storageKey(scope), JSON.stringify(record))
    } catch {
      throw new InterviewReportProcessError('recovery-storage-unavailable')
    }
  }

  /**
   * @brief 读取、验证并应用 24 小时 TTL / Read, validate, and apply the 24-hour TTL.
   * @param scope 当前报告 scope / Current report scope.
   * @return 有效记录，或 null / Valid record, or null.
   */
  function loadRecovery(scope: InterviewReportScope): StoredInterviewReportRecovery | null {
    /** @brief sessionStorage 原始字符串 / Raw sessionStorage string. */
    let raw: string | null
    try {
      raw = dependencies.storage.getItem(storageKey(scope))
    } catch {
      throw new InterviewReportProcessError('recovery-storage-unavailable')
    }
    if (raw === null) return null

    /** @brief JSON 解码后的未知值 / Unknown JSON-decoded value. */
    let decoded: unknown
    try {
      decoded = JSON.parse(raw) as unknown
    } catch {
      clearRecovery(scope)
      return null
    }
    /** @brief 字段与 scope 均已核对的记录 / Record validated by fields and scope. */
    const record = parseStoredRecovery(decoded, scope)
    if (record === null) {
      clearRecovery(scope)
      return null
    }
    /** @brief 记录相对于当前时钟的年龄 / Record age relative to the current clock. */
    const age = now() - record.createdAtMilliseconds
    if (!Number.isFinite(age) || age < 0 || age >= INTERVIEW_REPORT_RECOVERY_TTL_MILLISECONDS) {
      clearRecovery(scope)
      return null
    }
    return record
  }

  /**
   * @brief 读取并核对当前 Session / Read and validate the current Session.
   * @param scope 当前报告 scope / Current report scope.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @return 当前 Session 权威 / Current Session authority.
   */
  async function readSession(
    scope: InterviewReportScope,
    signal: AbortSignal
  ): Promise<UiInterviewSessionAuthority> {
    /** @brief 服务端最新 Session 权威 / Latest Session authority from the service. */
    const authority = await dependencies.interview.getInterviewSession({
      sessionId: scope.sessionId,
      signal,
      workspaceId: scope.workspaceId
    })
    signal.throwIfAborted()
    assertSessionScope(authority, scope)
    return authority
  }

  /**
   * @brief 由 Session.reportId 读取并核对不可变报告 / Read and validate the immutable report located by Session.reportId.
   * @param scope 当前报告 scope / Current report scope.
   * @param authority 包含非空 reportId 的 Session 权威 / Session authority containing a non-null reportId.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return 可直接展示的 ready 结果 / Ready outcome safe to display.
   */
  async function readReadyReport(
    scope: InterviewReportScope,
    authority: UiInterviewSessionAuthority,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<Extract<InterviewReportProcessOutcome, { readonly status: 'ready' }>> {
    /** @brief 已由调用方确认非空的报告 identity / Report identity already proven non-null by the caller. */
    const reportId = authority.session.reportId
    if (reportId === null) {
      throw new InterviewReportProcessError('report-identity-mismatch')
    }
    /** @brief 服务端不可变报告 / Immutable report returned by the service. */
    const report = await dependencies.interview.getInterviewReport({
      reportId,
      signal,
      workspaceId: scope.workspaceId
    })
    signal.throwIfAborted()
    assertReportScope(report, authority, scope)
    clearRecovery(scope)
    /** @brief 最终 ready 结果 / Final ready outcome. */
    const outcome = { report, sessionAuthority: authority, status: 'ready' as const }
    onObservation(outcome)
    return outcome
  }

  /**
   * @brief 若 Session 已发布 reportId，立即解析报告 / Resolve the report immediately when Session has published reportId.
   * @param scope 当前报告 scope / Current report scope.
   * @param authority 当前 Session 权威 / Current Session authority.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return ready 结果，或尚未发布时的 null / Ready outcome, or null before publication.
   */
  async function resolveIfPublished(
    scope: InterviewReportScope,
    authority: UiInterviewSessionAuthority,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<Extract<InterviewReportProcessOutcome, { readonly status: 'ready' }> | null> {
    return authority.session.reportId === null
      ? null
      : readReadyReport(scope, authority, signal, onObservation)
  }

  /**
   * @brief Job 成功后等待 Session 发布权威 reportId / Wait for Session to publish authoritative reportId after Job success.
   * @param scope 当前报告 scope / Current report scope.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return 已核对 Session 与 Report 的 ready 结果 / Ready outcome with validated Session and Report.
   */
  async function waitForReportPublication(
    scope: InterviewReportScope,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<Extract<InterviewReportProcessOutcome, { readonly status: 'ready' }>> {
    /** @brief 上一轮尚无进展后的退避 / Previous delay after no publication progress. */
    let previousDelay: number | null = null
    while (true) {
      /** @brief 最新 Session 权威 / Latest Session authority. */
      const authority = await readSession(scope, signal)
      /** @brief 已发布时的最终报告 / Final report when already published. */
      const ready = await resolveIfPublished(scope, authority, signal, onObservation)
      if (ready !== null) return ready
      onObservation({ sessionAuthority: authority, status: 'report-publishing' })
      /** @brief 本轮可见性等待 / Visibility-aware wait for this publication poll. */
      const delay = nextPollDelayMilliseconds(previousDelay)
      await waitForNextPoll(delay, signal)
      previousDelay = delay
    }
  }

  /**
   * @brief 观察已知 Job 到终态并解析报告 / Observe a known Job to terminal state and resolve the report.
   * @param scope 当前报告 scope / Current report scope.
   * @param initial 初始 Job 权威 / Initial Job authority.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return ready 报告或非成功终态 / Ready report or a non-success terminal state.
   */
  async function followAcceptedJob(
    scope: InterviewReportScope,
    initial: UiWorkspaceJobAuthority,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<InterviewReportProcessOutcome> {
    assertJobScope(initial.job, scope)
    /** @brief 当前最新 Job 权威 / Latest current Job authority. */
    let current = initial
    /** @brief 上次没有实质进展后的等待 / Previous delay after no material progress. */
    let previousDelay: number | null = null
    while (current.job.status === 'queued' || current.job.status === 'running') {
      /** @brief 下一次可见性等待 / Next visibility-aware wait. */
      const delay = nextPollDelayMilliseconds(previousDelay)
      await waitForNextPoll(delay, signal)
      /** @brief 从通用 Operations 端口读取的新 Job 权威 / New Job authority from the generic Operations port. */
      const next = await dependencies.workspaceOperations.getJob({
        jobId: current.job.id,
        signal,
        workspaceId: scope.workspaceId
      })
      signal.throwIfAborted()
      assertJobScope(next.job, scope, current.job.id)
      assertJobTransition(current.job, next.job)
      previousDelay = hasMaterialJobProgress(current.job, next.job) ? null : delay
      current = next
      onObservation({ authority: current, status: 'job-updated' })
    }
    if (current.job.status !== 'succeeded') {
      clearRecovery(scope)
      return { authority: current, status: 'job-terminal' }
    }
    return waitForReportPublication(scope, signal, onObservation)
  }

  /**
   * @brief 保存 accepted Job identity，失败时保留原命令供精确重放 / Persist an accepted Job identity, retaining the original command if storage update fails.
   * @param scope 当前报告 scope / Current report scope.
   * @param record 冻结命令记录 / Frozen-command record.
   * @param authority 已核对 Job 权威 / Validated Job authority.
   */
  function retainAcceptedJob(
    scope: InterviewReportScope,
    record: StoredInterviewReportRecovery,
    authority: UiWorkspaceJobAuthority
  ): void {
    try {
      saveRecovery(scope, { ...record, jobId: authority.job.id })
    } catch (error: unknown) {
      if (
        !(error instanceof InterviewReportProcessError) ||
        error.code !== 'recovery-storage-unavailable'
      ) {
        throw error
      }
      // 初始无 Job 记录已经在 dispatch 前落盘；精确重放仍能取回相同 Job。
    }
  }

  /**
   * @brief 发送冻结命令并进入 Job 观察 / Dispatch a frozen command and begin Job observation.
   * @param scope 当前报告 scope / Current report scope.
   * @param record 已在 dispatch 前保存的记录 / Record saved before dispatch.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return 报告、终态 Job 或恢复要求 / Report, terminal Job, or recovery requirement.
   */
  async function dispatch(
    scope: InterviewReportScope,
    record: StoredInterviewReportRecovery,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<InterviewReportProcessOutcome> {
    /** @brief POST 返回的 Job 权威 / Job authority returned by the POST. */
    let authority: UiWorkspaceJobAuthority
    try {
      authority = await dependencies.interview.createInterviewReportJob({
        commandId: asUiOpaqueId<'command'>(record.commandId),
        sessionId: scope.sessionId,
        signal,
        workspaceId: scope.workspaceId
      })
    } catch (error: unknown) {
      /** @brief 失败对应的安全恢复策略 / Safe recovery strategy for this failure. */
      const disposition = classifyDispatchFailure(error, now())
      if (disposition.kind === 'definitive') {
        clearRecovery(scope)
        throw error
      }
      /** @brief 更新后的未决记录 / Updated pending record. */
      const pending: StoredInterviewReportRecovery = {
        ...record,
        confirmAfterMilliseconds: disposition.confirmAfterMilliseconds,
        mode: disposition.mode
      }
      saveRecovery(scope, pending)
      /** @brief 页面可消费的恢复事实 / Recovery facts consumable by the page. */
      const recovery = projectRecovery(pending)
      return recovery.status === 'authority-review-required'
        ? { recovery, status: 'authority-review-required' }
        : {
            recovery: recovery as Extract<
              InterviewReportRecovery,
              { readonly status: 'confirmation-required' }
            >,
            status: 'confirmation-required'
          }
    }

    try {
      assertJobScope(authority.job, scope)
    } catch (error: unknown) {
      saveRecovery(scope, {
        ...record,
        confirmAfterMilliseconds: null,
        mode: 'authority-review'
      })
      throw error
    }
    retainAcceptedJob(scope, record, authority)
    onObservation({ authority, status: 'job-accepted' })
    return followAcceptedJob(scope, authority, signal, onObservation)
  }

  /**
   * @brief 从已知 Session 权威快速返回已有报告 / Return an existing report from known Session authority.
   * @param scope 当前报告 scope / Current report scope.
   * @param authority 当前 Session 权威 / Current Session authority.
   * @param signal 页面生命周期取消信号 / Page-lifecycle abort signal.
   * @param onObservation 产品观察通知 / Product observation callback.
   * @return ready 结果或 null / Ready outcome or null.
   */
  async function existingReport(
    scope: InterviewReportScope,
    authority: UiInterviewSessionAuthority,
    signal: AbortSignal,
    onObservation: (observation: InterviewReportObservation) => void
  ): Promise<Extract<InterviewReportProcessOutcome, { readonly status: 'ready' }> | null> {
    return resolveIfPublished(scope, authority, signal, onObservation)
  }

  /** @brief 默认不产生副作用的观察器 / Default observation callback with no side effects. */
  const NO_OBSERVATION = (): void => undefined

  /** @brief 公开流程实现 / Public process implementation. */
  const process: InterviewReportProcess = {
    getRecovery(scope): InterviewReportRecovery | null {
      /** @brief 当前有效持久记录 / Current valid persisted record. */
      const record = loadRecovery(scope)
      return record === null ? null : projectRecovery(record)
    },
    async start(
      scope,
      signal,
      onObservation = NO_OBSERVATION
    ): Promise<InterviewReportProcessOutcome> {
      /** @brief 启动前最新 Session 权威 / Latest Session authority before starting. */
      const authority = await readSession(scope, signal)
      /** @brief 已有报告时不产生新 Job / Existing report without creating a new Job. */
      const ready = await existingReport(scope, authority, signal, onObservation)
      if (ready !== null) return ready
      if (authority.session.status !== 'completed') {
        throw new InterviewReportProcessError('session-not-completed')
      }
      if (loadRecovery(scope) !== null) {
        throw new InterviewReportProcessError('pending-intent-exists')
      }
      /** @brief 在任何可能 dispatch 前冻结并保存的新意图 / New intent frozen and saved before any possible dispatch. */
      const record: StoredInterviewReportRecovery = {
        commandId: createUiCommandId(),
        confirmAfterMilliseconds: null,
        createdAtMilliseconds: now(),
        jobId: null,
        mode: 'exact-replay',
        principalSubject: scope.principalSubject,
        sessionId: scope.sessionId,
        version: INTERVIEW_REPORT_RECOVERY_VERSION,
        workspaceId: scope.workspaceId
      }
      saveRecovery(scope, record)
      return dispatch(scope, record, signal, onObservation)
    },
    async recover(
      scope,
      signal,
      onObservation = NO_OBSERVATION
    ): Promise<InterviewReportProcessOutcome> {
      /** @brief 恢复前最新 Session 权威 / Latest Session authority before recovery. */
      const authority = await readSession(scope, signal)
      /** @brief Session 已发布报告时直接完成 / Complete directly when Session has published a report. */
      const ready = await existingReport(scope, authority, signal, onObservation)
      if (ready !== null) return ready
      /** @brief 当前有效恢复记录 / Current valid recovery record. */
      const record = loadRecovery(scope)
      if (record === null) return { sessionAuthority: authority, status: 'not-started' }
      /** @brief 页面恢复投影 / Recovery projection for the page. */
      const recovery = projectRecovery(record)
      if (recovery.status === 'confirmation-required') {
        return { recovery, status: 'confirmation-required' }
      }
      if (recovery.status === 'authority-review-required') {
        return { recovery, status: 'authority-review-required' }
      }
      /** @brief 重载后由已保存 Job identity 读取的权威 / Job authority read from persisted identity after reload. */
      const jobAuthority = await dependencies.workspaceOperations.getJob({
        jobId: recovery.jobId,
        signal,
        workspaceId: scope.workspaceId
      })
      signal.throwIfAborted()
      assertJobScope(jobAuthority.job, scope, recovery.jobId)
      return followAcceptedJob(scope, jobAuthority, signal, onObservation)
    },
    async confirm(
      scope,
      signal,
      onObservation = NO_OBSERVATION
    ): Promise<InterviewReportProcessOutcome> {
      /** @brief 确认前最新 Session 权威 / Latest Session authority before confirmation. */
      const authority = await readSession(scope, signal)
      /** @brief 未知 POST 已落地时直接采用 Session 权威 / Adopt Session authority when the unknown POST already landed. */
      const ready = await existingReport(scope, authority, signal, onObservation)
      if (ready !== null) return ready
      /** @brief 必须确认的当前恢复记录 / Current recovery record requiring confirmation. */
      const record = loadRecovery(scope)
      if (record === null) return { sessionAuthority: authority, status: 'not-started' }
      /** @brief 页面恢复投影 / Recovery projection for the page. */
      const recovery = projectRecovery(record)
      if (recovery.status === 'job-accepted') {
        /** @brief 已知 Job 的最新权威 / Latest authority for the known Job. */
        const jobAuthority = await dependencies.workspaceOperations.getJob({
          jobId: recovery.jobId,
          signal,
          workspaceId: scope.workspaceId
        })
        signal.throwIfAborted()
        assertJobScope(jobAuthority.job, scope, recovery.jobId)
        return followAcceptedJob(scope, jobAuthority, signal, onObservation)
      }
      if (recovery.status === 'authority-review-required') {
        return { recovery, status: 'authority-review-required' }
      }
      if (recovery.confirmAfterMilliseconds !== null && recovery.confirmAfterMilliseconds > now()) {
        return { recovery, status: 'confirmation-required' }
      }
      return dispatch(scope, record, signal, onObservation)
    }
  }
  return Object.freeze(process)
}
