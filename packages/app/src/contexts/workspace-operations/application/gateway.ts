/** @file Workspace Operations 应用端口 / Workspace Operations application port. */

import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type {
  UiWorkspaceArtifact,
  UiWorkspaceArtifactAuthority,
  UiWorkspaceArtifactContent,
  UiWorkspaceArtifactId,
  UiWorkspaceArtifactKind,
  UiWorkspaceArtifactPage,
  UiWorkspaceJobAuthority,
  UiWorkspaceJobId,
  UiWorkspaceJobPage,
  UiWorkspaceOperationsCursor,
  UiWorkspaceOperationsPageLimit
} from '../domain/models'

/** @brief 读取一个 Workspace Job 的输入 / Input for reading one Workspace Job. */
export interface UiWorkspaceJobRead {
  readonly workspaceId: UiWorkspaceId
  readonly jobId: UiWorkspaceJobId
  readonly signal?: AbortSignal
}

/** @brief 查询一页 Workspace Job 的输入 / Input for querying one Workspace Job page. */
export interface UiWorkspaceJobPageRead {
  readonly workspaceId: UiWorkspaceId
  readonly cursor: UiWorkspaceOperationsCursor | null
  readonly limit: UiWorkspaceOperationsPageLimit
  /** @brief 开放 Job kind 过滤器 / Open Job-kind filter. */
  readonly kind?: string | null
  readonly subjectType?: string | null
  readonly subjectId?: string | null
  readonly signal?: AbortSignal
}

/** @brief 幂等且并发安全地取消一个 Job 的命令 / Command for cancelling one Job idempotently and concurrency-safely. */
export interface UiWorkspaceJobCancellation {
  readonly commandId: UiCommandId
  readonly workspaceId: UiWorkspaceId
  readonly jobId: UiWorkspaceJobId
  readonly concurrencyToken: UiConcurrencyToken
  readonly signal?: AbortSignal
}

/** @brief 读取一个 Workspace Artifact metadata 的输入 / Input for reading one Workspace Artifact metadata resource. */
export interface UiWorkspaceArtifactRead {
  readonly workspaceId: UiWorkspaceId
  readonly artifactId: UiWorkspaceArtifactId
  readonly signal?: AbortSignal
}

/** @brief 绑定已验证 metadata 快照的 Artifact content 读取 / Artifact-content read bound to a validated metadata snapshot. */
export interface UiWorkspaceArtifactContentRead {
  /** @brief 调用方已核对、且内容适配器必须重新确认未漂移的 metadata / Caller-validated metadata that the content adapter must confirm has not drifted. */
  readonly artifact: UiWorkspaceArtifact
  /** @brief 可选取消信号 / Optional abort signal. */
  readonly signal?: AbortSignal
}

/** @brief 查询一页 Workspace Artifact 的输入 / Input for querying one Workspace Artifact page. */
export interface UiWorkspaceArtifactPageRead {
  readonly workspaceId: UiWorkspaceId
  readonly cursor: UiWorkspaceOperationsCursor | null
  readonly limit: UiWorkspaceOperationsPageLimit
  readonly kind?: UiWorkspaceArtifactKind | null
  readonly subjectType?: string | null
  readonly subjectId?: string | null
  readonly signal?: AbortSignal
}

/**
 * @brief Workspace 通用异步 Job 与 Artifact 端口 / Generic asynchronous Job and Artifact port for a Workspace.
 * @note 此边界不暴露受保护 URL 或 Blob URL；内容始终通过 Bearer stream 读取 / This boundary exposes neither protected URLs nor Blob URLs; content is always read as a Bearer-authenticated stream.
 */
export interface WorkspaceOperationsGateway {
  /**
   * @brief 读取一个带强并发令牌的 Job 权威 / Read one Job authority carrying a strong concurrency token.
   * @param request 显式 Workspace、Job identity 与取消信号 / Explicit Workspace and Job identities plus cancellation signal.
   * @return 与强 ETag 同一响应返回的 Job / Job returned in the same response as its strong ETag.
   */
  getJob(request: UiWorkspaceJobRead): Promise<UiWorkspaceJobAuthority>

  /**
   * @brief 使用 canonical filters 读取一页 Job / Read one Job page using canonical filters.
   * @param request Workspace、cursor、limit 与过滤器 / Workspace, cursor, limit, and filters.
   * @return 保持 cursor 关系的 Job 页 / Job page preserving the cursor relation.
   */
  listJobsPage(request: UiWorkspaceJobPageRead): Promise<UiWorkspaceJobPage>

  /**
   * @brief 以幂等键和强 If-Match 取消 Job / Cancel a Job with an idempotency key and strong If-Match.
   * @param command 完整取消意图 / Complete cancellation intent.
   * @return 取消后的 Job 权威与新强 ETag / Updated Job authority and new strong ETag.
   */
  cancelJob(command: UiWorkspaceJobCancellation): Promise<UiWorkspaceJobAuthority>

  /**
   * @brief 读取一个不暴露 content URL 的 Artifact metadata 权威 / Read one Artifact metadata authority without exposing its content URL.
   * @param request 已核对 metadata 快照与取消信号 / Validated metadata snapshot plus cancellation signal.
   * @return Artifact metadata 与强 metadata ETag / Artifact metadata and its strong metadata ETag.
   */
  getArtifact(request: UiWorkspaceArtifactRead): Promise<UiWorkspaceArtifactAuthority>

  /**
   * @brief 使用 canonical filters 读取一页 Artifact metadata / Read one Artifact metadata page using canonical filters.
   * @param request Workspace、cursor、limit 与过滤器 / Workspace, cursor, limit, and filters.
   * @return 保持 cursor 关系的 Artifact 页 / Artifact page preserving the cursor relation.
   */
  listArtifactsPage(request: UiWorkspaceArtifactPageRead): Promise<UiWorkspaceArtifactPage>

  /**
   * @brief 重新解析权威 metadata 并读取完整受保护内容 / Re-resolve authoritative metadata and read complete protected content.
   * @param request Workspace、Artifact identity 与取消信号 / Workspace and Artifact identities plus cancellation signal.
   * @return 已验证 media type、长度、摘要与强 ETag 的未消费 stream / Unconsumed stream with validated media type, length, digest, and strong ETag.
   */
  readArtifactContent(request: UiWorkspaceArtifactContentRead): Promise<UiWorkspaceArtifactContent>
}
