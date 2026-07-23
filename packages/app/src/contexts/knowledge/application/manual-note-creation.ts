/** @file 手工笔记 KnowledgeSource 的可恢复创建流程 / Recoverable manual-note KnowledgeSource creation process. */

import { createUiCommandId } from '../../../shared-kernel/command'
import type { UiPrincipalSubject } from '../../identity'
import { asUiKnowledgeSourcePageLimit } from '../domain/models'
import type {
  UiKnowledgeSourceAuthority,
  UiKnowledgeSourcePage,
  UiKnowledgeVisibilityPolicy
} from '../domain/models'
import type { UiCreateManualKnowledgeNoteCommand } from './commands'
import type { KnowledgeGateway } from './gateway'

/** @brief 创建流程用于重读权威列表的固定首页大小 / Fixed first-page size used by creation recovery. */
const AUTHORITY_RELOAD_PAGE_LIMIT = asUiKnowledgeSourcePageLimit(50)

/** @brief 手工笔记创建草稿 / Manual-note creation draft. */
export interface UiManualKnowledgeNoteDraft {
  /** @brief 用户可见来源名称 / User-visible source name. */
  readonly name: string
  /** @brief 只在创建请求中发送的纯文本正文 / Plain-text body sent only in the creation request. */
  readonly content: string
  /** @brief 创建时完整可见性策略 / Complete visibility policy used at creation. */
  readonly visibility: UiKnowledgeVisibilityPolicy
}

/** @brief 创建恢复状态所属的 principal 与 Workspace / Principal and Workspace owning creation recovery state. */
export interface UiKnowledgeCreationScope {
  /** @brief 当前 OIDC subject / Current OIDC subject. */
  readonly principalSubject: UiPrincipalSubject
  /** @brief 当前授权 Workspace / Current authorized Workspace. */
  readonly workspaceId: UiCreateManualKnowledgeNoteCommand['workspaceId']
}

/** @brief 未确认创建命令的恢复方式 / Recovery mode for an unconfirmed creation command. */
export type UiKnowledgeCreateRecoveryMode = 'exact-replay' | 'authority-review'

/** @brief 进入权威审阅而不得继续重放的原因 / Reason authority review is required instead of another replay. */
export type UiKnowledgeCreateAuthorityReviewReason =
  'idempotency-key-reused' | 'invalid-success-response'

/**
 * @brief 进程内保存的冻结创建尝试 / Frozen creation attempt retained in process memory.
 * @note 正文不会写入 URL、日志或持久化存储 / The body is never written to a URL, log, or persistent storage.
 */
export type UiPendingManualKnowledgeNoteCreation =
  | {
      /** @brief 冻结命令；除 signal 外后续确认不得修改 / Frozen command that confirmations must not modify except for signal. */
      readonly command: Omit<UiCreateManualKnowledgeNoteCommand, 'signal'>
      /** @brief 允许同 key、同 payload 精确确认 / Exact confirmation with the same key and payload is allowed. */
      readonly mode: 'exact-replay'
      /** @brief 最早可确认的 epoch 毫秒；null 表示无需等待 / Earliest confirmation epoch milliseconds, or null without a delay. */
      readonly confirmAfterMilliseconds: number | null
      /** @brief 可安全展示的关联编号 / Correlation identifier safe to display. */
      readonly referenceId: string | null
    }
  | {
      /** @brief 冻结命令，仅用于保留草稿并解释风险 / Frozen command retained only to preserve the draft and explain risk. */
      readonly command: Omit<UiCreateManualKnowledgeNoteCommand, 'signal'>
      /** @brief 旧 key 不得再重放，必须先重读权威集合 / The old key must not be replayed; authority must be reread first. */
      readonly mode: 'authority-review'
      /** @brief 禁止重放的稳定原因 / Stable reason replay is forbidden. */
      readonly reason: UiKnowledgeCreateAuthorityReviewReason
      /** @brief 可安全展示的关联编号 / Correlation identifier safe to display. */
      readonly referenceId: string | null
    }

/** @brief 手工笔记创建流程错误 code / Manual-note creation process error code. */
export type KnowledgeManualNoteCreationProcessErrorCode =
  | 'confirmation-cooldown-active'
  | 'pending-command-exists'
  | 'pending-command-missing'
  | 'replay-forbidden'

/** @brief 不包含正文或服务端诊断的创建流程错误 / Creation-process error without note content or server diagnostics. */
export class KnowledgeManualNoteCreationProcessError extends Error {
  /** @brief 稳定流程错误 code / Stable process-error code. */
  readonly code: KnowledgeManualNoteCreationProcessErrorCode

  /**
   * @brief 构造安全流程错误 / Construct a safe process error.
   * @param code 稳定错误 code / Stable error code.
   */
  constructor(code: KnowledgeManualNoteCreationProcessErrorCode) {
    super(`Manual KnowledgeSource creation process rejected the transition: ${code}.`)
    this.name = 'KnowledgeManualNoteCreationProcessError'
    this.code = code
  }
}

/** @brief 可恢复手工笔记创建流程 / Recoverable manual-note creation process. */
export interface KnowledgeManualNoteCreationProcess {
  /**
   * @brief 读取当前 scope 的未决创建 / Read the pending creation for the current scope.
   * @param scope 当前 principal 与 Workspace / Current principal and Workspace.
   * @return 未决创建；不存在时为 null / Pending creation, or null when absent.
   * @note principal 变化会立即清除上一 principal 的正文 / A principal change immediately clears the previous principal's body.
   */
  readonly getPending: (
    scope: UiKnowledgeCreationScope
  ) => UiPendingManualKnowledgeNoteCreation | null
  /**
   * @brief 冻结并提交一个新的创建意图 / Freeze and submit a new creation intent.
   * @param scope 当前 principal 与 Workspace / Current principal and Workspace.
   * @param draft 当前完整草稿 / Current complete draft.
   * @param signal 本次网络调用取消信号 / Abort signal for this network call.
   * @return 服务端确认的新来源权威 / New source authority confirmed by the service.
   */
  readonly create: (
    scope: UiKnowledgeCreationScope,
    draft: UiManualKnowledgeNoteDraft,
    signal?: AbortSignal
  ) => Promise<UiKnowledgeSourceAuthority>
  /**
   * @brief 原样确认上一次结果未知的命令 / Confirm the previous unknown-result command exactly.
   * @param scope 当前 principal 与 Workspace / Current principal and Workspace.
   * @param signal 本次确认调用取消信号 / Abort signal for this confirmation call.
   * @return 服务端确认的新来源权威 / New source authority confirmed by the service.
   */
  readonly confirm: (
    scope: UiKnowledgeCreationScope,
    signal?: AbortSignal
  ) => Promise<UiKnowledgeSourceAuthority>
  /**
   * @brief 先重读权威首页，再放弃不可确定的旧命令 / Reread the authoritative first page before abandoning the indeterminate old command.
   * @param scope 当前 principal 与 Workspace / Current principal and Workspace.
   * @param signal 权威读取取消信号 / Abort signal for the authority read.
   * @return 成功读取的一页权威来源 / Successfully read authoritative source page.
   * @note 读取失败时仍保留旧命令；读取成功不代表能判断创建结果 / A failed read retains the old command; a successful read still cannot determine the creation outcome.
   */
  readonly abandonAfterAuthorityRead: (
    scope: UiKnowledgeCreationScope,
    signal: AbortSignal
  ) => Promise<UiKnowledgeSourcePage>
}

/**
 * @brief 判断未知值是否为非数组对象 / Determine whether an unknown value is a non-array object.
 * @param value 未知值 / Unknown value.
 * @return 可读取字段时为 true / True when fields can be read.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @brief 只接受可安全展示的 request ID / Accept only request IDs safe for display.
 * @param value 未受信任值 / Untrusted value.
 * @return 安全关联编号；否则为 null / Safe correlation identifier, or null.
 */
function safeReferenceId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/u.test(value) ? value : null
}

/**
 * @brief 读取 API v2 Problem 对象 / Read an API v2 Problem object.
 * @param error application port 抛出的未知错误 / Unknown error thrown by the application port.
 * @return 已识别 Problem；否则为 null / Recognized Problem, or null.
 */
function readProblem(error: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(error) && error.name === 'ApiV2ProblemError' && isRecord(error.problem)
    ? error.problem
    : null
}

/**
 * @brief 读取可信 Retry-After / Read a trusted Retry-After delay.
 * @param error application port 抛出的未知错误 / Unknown error thrown by the application port.
 * @return 非负有限毫秒数；否则为 null / Non-negative finite milliseconds, or null.
 */
function readRetryAfterMilliseconds(error: unknown): number | null {
  if (!isRecord(error)) return null
  return typeof error.retryAfterMilliseconds === 'number' &&
    Number.isFinite(error.retryAfterMilliseconds) &&
    error.retryAfterMilliseconds >= 0
    ? error.retryAfterMilliseconds
    : null
}

/**
 * @brief 深复制创建策略中所有可变集合 / Deep-copy every mutable collection in a creation policy.
 * @param policy 当前策略草稿 / Current policy draft.
 * @return 可安全冻结进命令的策略副本 / Policy copy safe to freeze into a command.
 */
function cloneVisibilityPolicy(policy: UiKnowledgeVisibilityPolicy): UiKnowledgeVisibilityPolicy {
  /** @brief 逐项冻结且保留顺序的 Agent grants / Individually frozen Agent grants preserving order. */
  const agentGrants = policy.agentGrants.map((grant) =>
    Object.freeze({
      ...grant,
      allowedOperations: Object.freeze([...grant.allowedOperations])
    })
  )
  return Object.freeze({
    ...policy,
    agentGrants: Object.freeze(agentGrants),
    allowedModelRegions: Object.freeze([...policy.allowedModelRegions])
  })
}

/**
 * @brief 创建不可变命令快照 / Create an immutable command snapshot.
 * @param scope 命令 scope / Command scope.
 * @param draft 完整表单草稿 / Complete form draft.
 * @return 具有新幂等 identity 的冻结命令 / Frozen command with a new idempotency identity.
 */
function freezeCommand(
  scope: UiKnowledgeCreationScope,
  draft: UiManualKnowledgeNoteDraft
): Omit<UiCreateManualKnowledgeNoteCommand, 'signal'> {
  /** @brief 可在未知结果后原样重放的命令副本 / Command copy that can be replayed exactly after an unknown result. */
  const command: Omit<UiCreateManualKnowledgeNoteCommand, 'signal'> = {
    commandId: createUiCommandId(),
    content: draft.content,
    name: draft.name,
    visibility: Object.freeze(cloneVisibilityPolicy(draft.visibility)),
    workspaceId: scope.workspaceId
  }
  return Object.freeze(command)
}

/**
 * @brief 为 Knowledge bounded context 创建可恢复手工笔记流程 / Create a recoverable manual-note process for the Knowledge bounded context.
 * @param gateway Workspace-scoped Knowledge port / Workspace-scoped Knowledge port.
 * @param now 可替换 epoch 毫秒时钟 / Replaceable epoch-millisecond clock.
 * @return 仅在进程内持有敏感正文的创建流程 / Creation process retaining sensitive content only in process memory.
 */
export function createKnowledgeManualNoteCreationProcess(
  gateway: KnowledgeGateway,
  now: () => number = Date.now
): KnowledgeManualNoteCreationProcess {
  /** @brief 当前内存状态所属 principal / Principal owning current in-memory state. */
  let activePrincipal: UiPrincipalSubject | null = null
  /** @brief 每个 Workspace 最多一个未决创建 / At most one pending creation per Workspace. */
  const pendingByWorkspace = new Map<
    UiKnowledgeCreationScope['workspaceId'],
    UiPendingManualKnowledgeNoteCreation
  >()

  /**
   * @brief 激活 principal，并在变化时清除旧正文 / Activate a principal and clear old content when it changes.
   * @param principalSubject 当前 principal subject / Current principal subject.
   */
  function activatePrincipal(principalSubject: UiPrincipalSubject): void {
    if (activePrincipal !== null && activePrincipal !== principalSubject) {
      pendingByWorkspace.clear()
    }
    activePrincipal = principalSubject
  }

  /**
   * @brief 将一次失败转换为后续安全恢复状态 / Convert one failure into a safe subsequent recovery state.
   * @param command 已发送的冻结命令 / Frozen command that was sent.
   * @param error application port 错误 / Application-port error.
   */
  function retainAfterFailure(
    command: Omit<UiCreateManualKnowledgeNoteCommand, 'signal'>,
    error: unknown
  ): void {
    /** @brief 已验证 Problem / Validated Problem. */
    const problem = readProblem(error)
    /** @brief Problem 或未知写错误的安全 request ID / Safe request ID from a Problem or unknown-write error. */
    const referenceId =
      safeReferenceId(problem?.request_id) ??
      (isRecord(error) ? safeReferenceId(error.requestId) : null)

    if (problem?.status === 409 && problem.code === 'idempotency.in_progress') {
      /** @brief 服务端要求的最早确认时刻 / Earliest confirmation time requested by the service. */
      const retryAfter = readRetryAfterMilliseconds(error)
      pendingByWorkspace.set(command.workspaceId, {
        command,
        confirmAfterMilliseconds: retryAfter === null ? null : now() + retryAfter,
        mode: 'exact-replay',
        referenceId
      })
      return
    }

    if (problem?.status === 409 && problem.code === 'idempotency.key_reused') {
      pendingByWorkspace.set(command.workspaceId, {
        command,
        mode: 'authority-review',
        reason: 'idempotency-key-reused',
        referenceId
      })
      return
    }

    if (
      isRecord(error) &&
      error.name === 'ApiV2WriteOutcomeUnknownError' &&
      error.kind === 'contract' &&
      typeof error.status === 'number'
    ) {
      pendingByWorkspace.set(command.workspaceId, {
        command,
        mode: 'authority-review',
        reason: 'invalid-success-response',
        referenceId
      })
      return
    }

    if (
      problem !== null &&
      typeof problem.status === 'number' &&
      problem.status >= 400 &&
      problem.status < 500
    ) {
      pendingByWorkspace.delete(command.workspaceId)
      return
    }

    pendingByWorkspace.set(command.workspaceId, {
      command,
      confirmAfterMilliseconds: null,
      mode: 'exact-replay',
      referenceId
    })
  }

  /**
   * @brief 发送冻结命令并原子更新恢复状态 / Send a frozen command and atomically update recovery state.
   * @param command 冻结命令 / Frozen command.
   * @param signal 当前调用取消信号 / Current-call abort signal.
   * @return 已确认来源权威 / Confirmed source authority.
   */
  async function dispatch(
    command: Omit<UiCreateManualKnowledgeNoteCommand, 'signal'>,
    signal?: AbortSignal
  ): Promise<UiKnowledgeSourceAuthority> {
    try {
      /** @brief 服务端确认的创建结果 / Creation result confirmed by the service. */
      const authority = await gateway.createManualKnowledgeNote({
        ...command,
        ...(signal === undefined ? {} : { signal })
      })
      pendingByWorkspace.delete(command.workspaceId)
      return authority
    } catch (error: unknown) {
      retainAfterFailure(command, error)
      throw error
    }
  }

  /** @brief 由公开接口提供上下文类型的流程实现 / Process implementation contextually typed by its public interface. */
  const process: KnowledgeManualNoteCreationProcess = {
    getPending(scope: UiKnowledgeCreationScope): UiPendingManualKnowledgeNoteCreation | null {
      activatePrincipal(scope.principalSubject)
      return pendingByWorkspace.get(scope.workspaceId) ?? null
    },
    async create(
      scope: UiKnowledgeCreationScope,
      draft: UiManualKnowledgeNoteDraft,
      signal?: AbortSignal
    ): Promise<UiKnowledgeSourceAuthority> {
      activatePrincipal(scope.principalSubject)
      if (pendingByWorkspace.has(scope.workspaceId)) {
        throw new KnowledgeManualNoteCreationProcessError('pending-command-exists')
      }
      /** @brief 在任何可能 dispatch 前保存的冻结意图 / Frozen intent retained before any possible dispatch. */
      const command = freezeCommand(scope, draft)
      pendingByWorkspace.set(scope.workspaceId, {
        command,
        confirmAfterMilliseconds: null,
        mode: 'exact-replay',
        referenceId: null
      })
      return dispatch(command, signal)
    },
    async confirm(
      scope: UiKnowledgeCreationScope,
      signal?: AbortSignal
    ): Promise<UiKnowledgeSourceAuthority> {
      activatePrincipal(scope.principalSubject)
      /** @brief 必须原样重放的当前未决命令 / Current pending command that must be replayed exactly. */
      const pending = pendingByWorkspace.get(scope.workspaceId)
      if (pending === undefined) {
        throw new KnowledgeManualNoteCreationProcessError('pending-command-missing')
      }
      if (pending.mode !== 'exact-replay') {
        throw new KnowledgeManualNoteCreationProcessError('replay-forbidden')
      }
      if (pending.confirmAfterMilliseconds !== null && pending.confirmAfterMilliseconds > now()) {
        throw new KnowledgeManualNoteCreationProcessError('confirmation-cooldown-active')
      }
      return dispatch(pending.command, signal)
    },
    async abandonAfterAuthorityRead(
      scope: UiKnowledgeCreationScope,
      signal: AbortSignal
    ): Promise<UiKnowledgeSourcePage> {
      activatePrincipal(scope.principalSubject)
      if (!pendingByWorkspace.has(scope.workspaceId)) {
        throw new KnowledgeManualNoteCreationProcessError('pending-command-missing')
      }
      /** @brief 放弃前成功取得的权威第一页 / Authoritative first page successfully obtained before abandonment. */
      const page = await gateway.listKnowledgeSourcePage({
        cursor: null,
        limit: AUTHORITY_RELOAD_PAGE_LIMIT,
        signal,
        workspaceId: scope.workspaceId
      })
      pendingByWorkspace.delete(scope.workspaceId)
      return page
    }
  }
  return Object.freeze(process)
}
