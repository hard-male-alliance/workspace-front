/** @file Interview API v2 查询与命令 / Interview API v2 reads and commands. */

import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type {
  UiCreateInterviewSessionInput,
  UiInterviewEndReason,
  UiInterviewPageLimit,
  UiInterviewRealtimeTransport,
  UiInterviewReportId,
  UiInterviewScenarioCursor,
  UiInterviewScenarioId,
  UiInterviewScenarioInput,
  UiInterviewScenarioStatus,
  UiInterviewSessionCursor,
  UiInterviewSessionId,
  UiInterviewTranscriptCursor
} from '../domain/models'

/** @brief 读取一页 InterviewScenario / Read one InterviewScenario page. */
export interface UiInterviewScenarioPageRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 首页为 null 的服务端 cursor / Server cursor, null for the first page. */
  readonly cursor: UiInterviewScenarioCursor | null
  /** @brief 单页上限 / Page limit. */
  readonly limit: UiInterviewPageLimit
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 读取一个 InterviewScenario / Read one InterviewScenario. */
export interface UiInterviewScenarioRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的场景身份 / Scenario identity in the path. */
  readonly scenarioId: UiInterviewScenarioId
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 幂等创建 InterviewScenario / Idempotently create an InterviewScenario. */
export interface UiCreateInterviewScenarioCommand {
  /** @brief 用户意图的稳定幂等身份 / Stable idempotency identity for the user intent. */
  readonly commandId: UiCommandId
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 完整 canonical 创建输入 / Complete canonical creation input. */
  readonly input: UiInterviewScenarioInput
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief InterviewScenario merge-patch 的字段集合 / Fields of an InterviewScenario merge patch. */
interface UiInterviewScenarioPatchFields {
  readonly name: string
  readonly description: string
  readonly locale: UiInterviewScenarioInput['locale']
  readonly interviewType: UiInterviewScenarioInput['interviewType']
  readonly difficulty: UiInterviewScenarioInput['difficulty']
  readonly durationMinutes: number
  readonly targetQuestionCount: number
  readonly focusAreas: readonly string[]
  readonly allowFollowups: boolean
  readonly allowBargeIn: boolean
  readonly rubric: UiInterviewScenarioInput['rubric']
  readonly status: UiInterviewScenarioStatus
}

/**
 * @brief 至少含一个字段的最小 InterviewScenario merge patch / Minimal InterviewScenario merge patch containing at least one field.
 */
export type UiInterviewScenarioPatch = {
  [TKey in keyof UiInterviewScenarioPatchFields]: Readonly<
    Pick<UiInterviewScenarioPatchFields, TKey> & Partial<Omit<UiInterviewScenarioPatchFields, TKey>>
  >
}[keyof UiInterviewScenarioPatchFields]

/** @brief 以强 If-Match 更新 InterviewScenario / Update an InterviewScenario with strong If-Match. */
export interface UiUpdateInterviewScenarioCommand {
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的场景身份 / Scenario identity in the path. */
  readonly scenarioId: UiInterviewScenarioId
  /** @brief 与当前场景表示原子配对的强 ETag / Strong ETag atomically paired with the current scenario representation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 只含用户实际改动字段的 merge patch / Merge patch containing only fields actually changed by the user. */
  readonly patch: UiInterviewScenarioPatch
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 读取一页 InterviewSession / Read one InterviewSession page. */
export interface UiInterviewSessionPageRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 首页为 null 的服务端 cursor / Server cursor, null for the first page. */
  readonly cursor: UiInterviewSessionCursor | null
  /** @brief 单页上限 / Page limit. */
  readonly limit: UiInterviewPageLimit
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 读取一个 InterviewSession / Read one InterviewSession. */
export interface UiInterviewSessionRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的会话身份 / Session identity in the path. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 幂等创建持久 InterviewSession / Idempotently create a persistent InterviewSession. */
export interface UiCreateInterviewSessionCommand {
  /** @brief 用户意图的稳定幂等身份 / Stable idempotency identity for the user intent. */
  readonly commandId: UiCommandId
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 完整 canonical Session 创建输入 / Complete canonical Session-creation input. */
  readonly input: UiCreateInterviewSessionInput
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 创建一个短期 RealtimeConnection / Create one short-lived RealtimeConnection. */
export interface UiCreateRealtimeConnectionCommand {
  /** @brief 用户意图的稳定幂等身份 / Stable idempotency identity for the user intent. */
  readonly commandId: UiCommandId
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的唯一会话身份 / Sole session identity in the path. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 客户端支持且不重复的传输 / Unique transports supported by the client. */
  readonly supportedTransports: readonly UiInterviewRealtimeTransport[]
  /** @brief 客户端音频 codec / Client audio codecs. */
  readonly audioCodecs: readonly string[]
  /** @brief 客户端视频 codec / Client video codecs. */
  readonly videoCodecs: readonly string[]
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 幂等请求结束 InterviewSession / Idempotently request ending an InterviewSession. */
export interface UiEndInterviewSessionCommand {
  /** @brief 用户意图的稳定幂等身份 / Stable idempotency identity for the user intent. */
  readonly commandId: UiCommandId
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的会话身份 / Session identity in the path. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 与冻结 Session 快照配对的强 ETag / Strong ETag paired with the frozen Session snapshot. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 明确结束原因 / Explicit ending reason. */
  readonly reason: UiInterviewEndReason
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 读取一页持久 InterviewTranscript / Read one persisted InterviewTranscript page. */
export interface UiInterviewTranscriptPageRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的会话身份 / Session identity in the path. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 首页为 null 的服务端 cursor / Server cursor, null for the first page. */
  readonly cursor: UiInterviewTranscriptCursor | null
  /** @brief 单页上限 / Page limit. */
  readonly limit: UiInterviewPageLimit
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 幂等创建 InterviewReport Job / Idempotently create an InterviewReport Job. */
export interface UiCreateInterviewReportJobCommand {
  /** @brief 用户意图的稳定幂等身份 / Stable idempotency identity for the user intent. */
  readonly commandId: UiCommandId
  /** @brief path 中的显式授权 Workspace / Explicit authorization Workspace in the path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的会话身份 / Session identity in the path. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 可选的固定 rubric 版本；缺失与 value 保持不同 / Optional pinned rubric version, preserving absence versus value. */
  readonly rubricVersion?: string
  /** @brief 当前调用取消信号 / Current-call cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 读取一个 InterviewReport / Read one InterviewReport. */
export interface UiInterviewReportRead {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief path 中的报告身份 / Report identity in the path. */
  readonly reportId: UiInterviewReportId
  /** @brief 页面生命周期取消信号 / Page-lifecycle cancellation signal. */
  readonly signal?: AbortSignal
}
