/** @file Workspace Operations 的通用 Job 与 Artifact 领域模型 / Generic Job and Artifact domain models for Workspace Operations. */

import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiJsonObject } from '../../../shared-kernel/json'
import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'

/** @brief Workspace Job 身份 / Workspace Job identity. */
export type UiWorkspaceJobId = UiOpaqueId<'workspace-job'>

/** @brief Workspace Artifact 身份 / Workspace Artifact identity. */
export type UiWorkspaceArtifactId = UiOpaqueId<'workspace-artifact'>

/** @brief 绑定 Workspace 与过滤条件的不透明 Operations cursor / Opaque Operations cursor bound to a Workspace and filters. */
export type UiWorkspaceOperationsCursor = UiOpaqueId<'workspace-operations-cursor'>

/** @brief Operations 集合单页最大条目数 / Maximum items in one Operations collection page. */
export const UI_WORKSPACE_OPERATIONS_PAGE_LIMIT_MAX = 200

/** @brief 经 API v2 上限约束的 Operations 页大小 / Operations page size constrained by API v2. */
export type UiWorkspaceOperationsPageLimit = number & {
  /** @brief Operations 页大小品牌 / Operations-page-limit brand. */
  readonly __uiWorkspaceOperationsBrand: 'page-limit'
}

/**
 * @brief 将服务端 cursor 提升为不透明 Operations cursor / Refine a server cursor into an opaque Operations cursor.
 * @param value 服务端签发的 cursor / Cursor issued by the server.
 * @return 带 Operations 语义品牌的 cursor / Cursor carrying Operations semantics.
 * @throws {TypeError} 当 cursor 为空或超过契约上限时抛出 / Thrown when the cursor is empty or exceeds the contract ceiling.
 */
export function asUiWorkspaceOperationsCursor(value: string): UiWorkspaceOperationsCursor {
  if (value.length < 1 || [...value].length > 2048) {
    throw new TypeError('A Workspace Operations cursor must contain between 1 and 2048 characters.')
  }
  return value as UiWorkspaceOperationsCursor
}

/**
 * @brief 构造受 API v2 上限约束的 Operations 页大小 / Construct an Operations page size constrained by API v2.
 * @param value 候选页大小 / Candidate page size.
 * @return 1 至 200 之间的名义页大小 / Nominal page size between 1 and 200.
 * @throws {RangeError} 当页大小不是合法整数时抛出 / Thrown when the page size is not a valid integer.
 */
export function asUiWorkspaceOperationsPageLimit(value: number): UiWorkspaceOperationsPageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_WORKSPACE_OPERATIONS_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `Workspace Operations page limit must be an integer from 1 to ${UI_WORKSPACE_OPERATIONS_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiWorkspaceOperationsPageLimit
}

/**
 * @brief 跨限界上下文的资源引用 / Cross-bounded-context resource reference.
 * @note `resourceType` 是服务端开放 code，不能在前端闭合为枚举 / `resourceType` is an open server code and must not be closed into a frontend enum.
 */
export interface UiWorkspaceResourceRef {
  /** @brief 稳定资源类型 code / Stable resource-type code. */
  readonly resourceType: string
  /** @brief 不透明资源身份 / Opaque resource identity. */
  readonly id: string
  /** @brief 可选领域 revision；保留缺失与 null 的区别 / Optional domain revision, preserving absence versus null. */
  readonly revision?: number | null
}

/** @brief Job 进度计量单位 / Job progress measurement unit. */
export type UiWorkspaceJobProgressUnit = 'bytes' | 'items' | 'pages' | 'steps' | 'unknown'

/** @brief Workspace Job 进度 / Workspace Job progress. */
export interface UiWorkspaceJobProgress {
  /** @brief 当前阶段 / Current phase. */
  readonly phase: string
  /** @brief 已完成数量 / Completed amount. */
  readonly completed: number
  /** @brief 总量；未知时为 null / Total amount, or null when unknown. */
  readonly total: number | null
  /** @brief 计量单位 / Measurement unit. */
  readonly unit: UiWorkspaceJobProgressUnit
}

/** @brief ProblemDetails 字段错误的 UI 投影 / UI projection of a ProblemDetails field error. */
export interface UiWorkspaceOperationProblemFieldError {
  /** @brief JSON Pointer 或协议字段路径 / JSON Pointer or protocol field path. */
  readonly pointer: string
  /** @brief 稳定错误 code / Stable error code. */
  readonly code: string
  /** @brief 可选本地化消息键 / Optional localization message key. */
  readonly messageKey: string | null
  /** @brief 可选低敏感插值参数 / Optional low-sensitivity interpolation parameters. */
  readonly params: Readonly<Record<string, string | number | boolean | null>> | null
}

/** @brief 终态 Job 携带的安全 ProblemDetails 投影 / Safe ProblemDetails projection carried by a terminal Job. */
export interface UiWorkspaceOperationProblem {
  /** @brief 可文档化 HTTPS Problem 类型 / Documentable HTTPS Problem type. */
  readonly type: string
  /** @brief 人类诊断标题；不得用于业务分支 / Human diagnostic title, not for business branching. */
  readonly title: string
  /** @brief HTTP 状态 / HTTP status. */
  readonly status: number
  /** @brief 稳定机器 code / Stable machine-readable code. */
  readonly code: string
  /** @brief 服务端请求关联 ID / Server request-correlation ID. */
  readonly requestId: string
  /** @brief 服务端声明的可重试性 / Retryability declared by the server. */
  readonly retryable: boolean
  /** @brief 结构化字段错误 / Structured field errors. */
  readonly errors: readonly UiWorkspaceOperationProblemFieldError[]
  /** @brief 可选诊断详情 / Optional diagnostic detail. */
  readonly detail: string | null
  /** @brief 可选 Problem 实例 URI-reference / Optional Problem instance URI-reference. */
  readonly instance: string | null
  /** @brief 可选 namespaced JSON 扩展 / Optional namespaced JSON extensions. */
  readonly extensions: UiJsonObject | null
}

/** @brief 所有 Workspace Job 状态共享的领域字段 / Domain fields shared by every Workspace Job state. */
interface UiWorkspaceJobFields {
  /** @brief Job 身份 / Job identity. */
  readonly id: UiWorkspaceJobId
  /** @brief Job 领域 revision / Job domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updatedAt: string
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 开放的领域 Job kind / Open domain Job kind. */
  readonly kind: string
  /** @brief Job 操作的主体资源 / Subject resource operated on by the Job. */
  readonly subject: UiWorkspaceResourceRef
  /** @brief 可选进度 / Optional progress. */
  readonly progress: UiWorkspaceJobProgress | null
  /** @brief 结果资源引用 / Result resource references. */
  readonly resultRefs: readonly UiWorkspaceResourceRef[]
}

/** @brief 等待执行的 Workspace Job / Workspace Job awaiting execution. */
export interface UiQueuedWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'queued'
  readonly problem: null
  readonly startedAt: null
  readonly finishedAt: null
}

/** @brief 正在执行的 Workspace Job / Workspace Job currently executing. */
export interface UiRunningWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'running'
  readonly problem: null
  readonly startedAt: string
  readonly finishedAt: null
}

/** @brief 成功完成的 Workspace Job / Successfully completed Workspace Job. */
export interface UiSucceededWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'succeeded'
  readonly problem: null
  readonly startedAt: string | null
  readonly finishedAt: string
}

/** @brief 失败并携带结构化问题的 Workspace Job / Failed Workspace Job carrying a structured problem. */
export interface UiFailedWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'failed'
  readonly problem: UiWorkspaceOperationProblem
  readonly startedAt: string | null
  readonly finishedAt: string
}

/** @brief 被取消的 Workspace Job / Cancelled Workspace Job. */
export interface UiCancelledWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'cancelled'
  readonly problem: UiWorkspaceOperationProblem | null
  readonly startedAt: string | null
  readonly finishedAt: string
}

/** @brief 开始前过期的 Workspace Job / Workspace Job expired before starting. */
export interface UiExpiredWorkspaceJob extends UiWorkspaceJobFields {
  readonly status: 'expired'
  readonly problem: UiWorkspaceOperationProblem | null
  readonly startedAt: null
  readonly finishedAt: string
}

/** @brief API v2 Workspace Job 生命周期的闭合判别联合 / Closed discriminated union of the API v2 Workspace Job lifecycle. */
export type UiWorkspaceJob =
  | UiQueuedWorkspaceJob
  | UiRunningWorkspaceJob
  | UiSucceededWorkspaceJob
  | UiFailedWorkspaceJob
  | UiCancelledWorkspaceJob
  | UiExpiredWorkspaceJob

/** @brief 与强 ETag 同一响应返回的 Job 权威 / Job authority returned with a strong ETag in the same response. */
export interface UiWorkspaceJobAuthority {
  /** @brief 严格映射的 Job / Strictly mapped Job. */
  readonly job: UiWorkspaceJob
  /** @brief 后续取消所需的强并发令牌 / Strong concurrency token required by later cancellation. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the server. */
  readonly requestId: string
  /** @brief 仅 202 创建响应携带的 canonical Job Location / Canonical Job Location carried only by a 202 creation response. */
  readonly location: string | null
}

/** @brief 保持 `hasMore` 与 cursor 关系的 Workspace Job 页 / Workspace Job page preserving the `hasMore`/cursor relation. */
export type UiWorkspaceJobPage =
  | {
      readonly items: readonly UiWorkspaceJob[]
      readonly hasMore: true
      readonly nextCursor: UiWorkspaceOperationsCursor
    }
  | {
      readonly items: readonly UiWorkspaceJob[]
      readonly hasMore: false
      readonly nextCursor: null
    }

/** @brief API v2 闭合 Artifact kind / Closed API v2 Artifact kind. */
export type UiWorkspaceArtifactKind =
  | 'generic'
  | 'interview_audio'
  | 'interview_transcript'
  | 'interview_video'
  | 'resume_docx'
  | 'resume_json'
  | 'resume_pdf'

/**
 * @brief 不暴露受保护 URL 的 Workspace Artifact metadata / Workspace Artifact metadata without exposing its protected URL.
 * @note 内容必须通过 `WorkspaceOperationsGateway.readArtifactContent` 使用 Bearer 读取 / Content must be read with Bearer through `WorkspaceOperationsGateway.readArtifactContent`.
 */
export interface UiWorkspaceArtifact {
  readonly id: UiWorkspaceArtifactId
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly workspaceId: UiWorkspaceId
  readonly kind: UiWorkspaceArtifactKind
  readonly subject: UiWorkspaceResourceRef
  readonly mediaType: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly pageCount: number | null
  readonly expiresAt: string | null
}

/**
 * @brief 精确比较两个 Artifact metadata 快照 / Exactly compare two Artifact metadata snapshots.
 * @param left 较早的已验证快照 / Earlier validated snapshot.
 * @param right 后续权威快照 / Later authoritative snapshot.
 * @return 除 RFC media type 大小写外所有字段语义相同时为 true / True when every field is semantically equal except RFC media-type casing.
 */
export function uiWorkspaceArtifactsEqual(
  left: UiWorkspaceArtifact,
  right: UiWorkspaceArtifact
): boolean {
  return (
    left.id === right.id &&
    left.revision === right.revision &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.workspaceId === right.workspaceId &&
    left.kind === right.kind &&
    left.mediaType.toLowerCase() === right.mediaType.toLowerCase() &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256 &&
    left.pageCount === right.pageCount &&
    left.expiresAt === right.expiresAt &&
    left.subject.resourceType === right.subject.resourceType &&
    left.subject.id === right.subject.id &&
    Object.hasOwn(left.subject, 'revision') === Object.hasOwn(right.subject, 'revision') &&
    left.subject.revision === right.subject.revision
  )
}

/** @brief 与强 metadata ETag 同一响应返回的 Artifact 权威 / Artifact authority returned with its strong metadata ETag. */
export interface UiWorkspaceArtifactAuthority {
  readonly artifact: UiWorkspaceArtifact
  readonly concurrencyToken: UiConcurrencyToken
  readonly requestId: string
}

/** @brief 保持 `hasMore` 与 cursor 关系的 Workspace Artifact 页 / Workspace Artifact page preserving the `hasMore`/cursor relation. */
export type UiWorkspaceArtifactPage =
  | {
      readonly items: readonly UiWorkspaceArtifact[]
      readonly hasMore: true
      readonly nextCursor: UiWorkspaceOperationsCursor
    }
  | {
      readonly items: readonly UiWorkspaceArtifact[]
      readonly hasMore: false
      readonly nextCursor: null
    }

/** @brief 受保护完整 Artifact content 的已验证 stream / Validated stream of complete protected Artifact content. */
export interface UiWorkspaceArtifactContent {
  /** @brief 尚未消费的字节流 / Unconsumed byte stream. */
  readonly body: ReadableStream<Uint8Array> | null
  /** @brief 完整内容字节数 / Complete content byte length. */
  readonly byteLength: number
  /** @brief 与 metadata 一致的 media type / Media type matching the metadata. */
  readonly mediaType: string
  /** @brief 内容表示的强 ETag / Strong ETag of the content representation. */
  readonly entityTag: UiConcurrencyToken
  /** @brief 安全归一化的呈现策略 / Safely normalized presentation policy. */
  readonly disposition: 'attachment' | 'inline'
  /** @brief 响应是否声明 byte-range 能力 / Whether the response advertises byte-range support. */
  readonly acceptsByteRanges: boolean
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the server. */
  readonly requestId: string
}
