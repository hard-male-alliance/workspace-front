/** @file Workspace Operations 的内存测试 adapter / In-memory test adapter for Workspace Operations. */

import type { WorkspaceOperationsGateway } from '../../application/gateway'
import {
  asUiWorkspaceOperationsCursor,
  uiWorkspaceArtifactsEqual,
  type UiWorkspaceArtifactAuthority,
  type UiWorkspaceArtifactPage,
  type UiWorkspaceJobAuthority,
  type UiWorkspaceJobPage
} from '../../domain/models'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import { asUiConcurrencyToken } from '../../../../shared-kernel/concurrency'
import { InMemoryWorkspaceOperationsStore } from './store'

/** @brief 已缓存取消命令的稳定指纹与结果 / Stable fingerprint and result of a cached cancellation command. */
interface CachedCancellation {
  readonly fingerprint: string
  readonly result: UiWorkspaceJobAuthority
}

/**
 * @brief 为一个 cursor 页计算起始 offset / Resolve the starting offset of one cursor page.
 * @param cursor 首页 null 或先前签发的 cursor / First-page null or a previously issued cursor.
 * @param length 当前过滤后集合长度 / Current filtered collection length.
 * @return 当前页起始 offset / Starting offset of the current page.
 */
function cursorOffset(cursor: string | null, length: number): number {
  if (cursor === null) return 0
  for (let offset = 0; offset <= length; offset += 1) {
    if (asUiWorkspaceOperationsCursor(`operations_cursor_${offset}`) === cursor) return offset
  }
  throw new InMemoryGatewayError('memory.not_found', 'The Mock Operations cursor is not valid.')
}

/**
 * @brief 创建稳定取消指纹 / Create a stable cancellation fingerprint.
 * @param workspaceId 授权 Workspace / Authorization Workspace.
 * @param jobId Job identity / Job identity.
 * @param concurrencyToken 强 If-Match / Strong If-Match.
 * @return 规范 JSON 指纹 / Canonical JSON fingerprint.
 */
function cancellationFingerprint(
  workspaceId: string,
  jobId: string,
  concurrencyToken: string
): string {
  return JSON.stringify({ concurrencyToken, jobId, workspaceId })
}

/**
 * @brief Workspace Operations 自动化测试内存网关 / In-memory Workspace Operations gateway for automated tests.
 * @note 与 `InMemoryResumeGateway` 共享同一个 store 时，Render command、Job 与 Artifact 会形成真实引用链 / When sharing one store with `InMemoryResumeGateway`, Render commands, Jobs, and Artifacts form a real reference chain.
 */
export class InMemoryWorkspaceOperationsGateway implements WorkspaceOperationsGateway {
  /** @brief 确定性行为选项 / Deterministic behavior options. */
  private readonly options: InMemoryGatewayOptions

  /** @brief 跨测试 adapter 共享的 Operations 状态 / Operations state shared across test adapters. */
  private readonly store: InMemoryWorkspaceOperationsStore

  /** @brief 取消 command 的幂等结果 / Idempotent cancellation-command results. */
  private readonly cancellations = new Map<string, CachedCancellation>()

  /**
   * @brief 构造 Workspace Operations 内存网关 / Construct an in-memory Workspace Operations gateway.
   * @param options 确定性读取行为 / Deterministic read behaviour.
   * @param store 可与领域 command adapter 共享的状态 / State shareable with domain-command adapters.
   */
  constructor(
    options: InMemoryGatewayOptions = {},
    store: InMemoryWorkspaceOperationsStore = new InMemoryWorkspaceOperationsStore()
  ) {
    this.options = options
    this.store = store
  }

  /** @inheritdoc */
  async getJob(
    request: Parameters<WorkspaceOperationsGateway['getJob']>[0]
  ): Promise<UiWorkspaceJobAuthority> {
    request.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    request.signal?.throwIfAborted()
    if (mode === 'empty') return throwMemoryNotFound('workspace job')
    /** @brief 完成前用于授权核对的当前 Job / Current Job used for authorization checking before completion. */
    const current = this.store.getJobAuthority(request.jobId)
    if (current.job.workspaceId !== request.workspaceId) return throwMemoryNotFound('workspace job')
    return cloneMemoryValue(this.store.advanceJob(request.jobId))
  }

  /** @inheritdoc */
  async listJobsPage(
    request: Parameters<WorkspaceOperationsGateway['listJobsPage']>[0]
  ): Promise<UiWorkspaceJobPage> {
    request.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    request.signal?.throwIfAborted()
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }
    /** @brief 应用全部 canonical filters 后的 Job / Jobs after applying all canonical filters. */
    const filtered = this.store
      .listJobAuthorities()
      .map((authority) => authority.job)
      .filter(
        (job) =>
          job.workspaceId === request.workspaceId &&
          (request.kind === undefined || request.kind === null || job.kind === request.kind) &&
          (request.subjectType === undefined ||
            request.subjectType === null ||
            job.subject.resourceType === request.subjectType) &&
          (request.subjectId === undefined ||
            request.subjectId === null ||
            job.subject.id === request.subjectId)
      )
    /** @brief 当前 cursor 的起始 offset / Starting offset represented by the current cursor. */
    const offset = cursorOffset(request.cursor, filtered.length)
    /** @brief 当前页不共享引用的 Job / Current-page Jobs sharing no references. */
    const items = cloneMemoryValue(filtered.slice(offset, offset + request.limit))
    /** @brief 后续页的起始 offset / Starting offset of the following page. */
    const nextOffset = offset + items.length
    return nextOffset < filtered.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiWorkspaceOperationsCursor(`operations_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async cancelJob(
    command: Parameters<WorkspaceOperationsGateway['cancelJob']>[0]
  ): Promise<UiWorkspaceJobAuthority> {
    command.signal?.throwIfAborted()
    await prepareMemoryRead(this.options)
    command.signal?.throwIfAborted()
    /** @brief 当前取消意图的稳定指纹 / Stable fingerprint of the current cancellation intent. */
    const fingerprint = cancellationFingerprint(
      command.workspaceId,
      command.jobId,
      command.concurrencyToken
    )
    /** @brief 与 Workspace、canonical Job path 和 command key 绑定的缓存键 / Cache key bound to the Workspace, canonical Job path, and command key. */
    const cacheKey = `${command.workspaceId}:${command.jobId}:${command.commandId}`
    /** @brief 同一 command identity 的既有结果 / Existing result for the same command identity. */
    const cached = this.cancellations.get(cacheKey)
    if (cached !== undefined) {
      if (cached.fingerprint !== fingerprint) {
        throw new InMemoryGatewayError(
          'memory.idempotency_key_reused',
          'The Mock cancellation command identity was reused with a different request.'
        )
      }
      return cloneMemoryValue(cached.result)
    }
    /** @brief 取消前用于 Workspace 授权核对的 Job / Job used for Workspace authorization checking before cancellation. */
    const current = this.store.getJobAuthority(command.jobId)
    if (current.job.workspaceId !== command.workspaceId) return throwMemoryNotFound('workspace job')
    /** @brief 首次取消确认的结果 / Result confirmed by the first cancellation. */
    const result = this.store.cancelJob(command.jobId, command.concurrencyToken)
    this.cancellations.set(cacheKey, { fingerprint, result: cloneMemoryValue(result) })
    return cloneMemoryValue(result)
  }

  /** @inheritdoc */
  async getArtifact(
    request: Parameters<WorkspaceOperationsGateway['getArtifact']>[0]
  ): Promise<UiWorkspaceArtifactAuthority> {
    request.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    request.signal?.throwIfAborted()
    if (mode === 'empty') return throwMemoryNotFound('workspace artifact')
    /** @brief 当前 Artifact metadata / Current Artifact metadata. */
    const artifact = this.store.getArtifact(request.artifactId)
    if (artifact.workspaceId !== request.workspaceId)
      return throwMemoryNotFound('workspace artifact')
    return {
      artifact: cloneMemoryValue(artifact),
      concurrencyToken: asUiConcurrencyToken(`"memory-artifact-metadata-${artifact.revision}"`),
      requestId: `request_metadata_${artifact.id}`
    }
  }

  /** @inheritdoc */
  async listArtifactsPage(
    request: Parameters<WorkspaceOperationsGateway['listArtifactsPage']>[0]
  ): Promise<UiWorkspaceArtifactPage> {
    request.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    request.signal?.throwIfAborted()
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }
    /** @brief 应用全部 canonical filters 后的 Artifact / Artifacts after applying all canonical filters. */
    const filtered = this.store
      .listArtifacts()
      .filter(
        (artifact) =>
          artifact.workspaceId === request.workspaceId &&
          (request.kind === undefined || request.kind === null || artifact.kind === request.kind) &&
          (request.subjectType === undefined ||
            request.subjectType === null ||
            artifact.subject.resourceType === request.subjectType) &&
          (request.subjectId === undefined ||
            request.subjectId === null ||
            artifact.subject.id === request.subjectId)
      )
    /** @brief 当前 cursor 的起始 offset / Starting offset represented by the current cursor. */
    const offset = cursorOffset(request.cursor, filtered.length)
    /** @brief 当前页不共享引用的 Artifact / Current-page Artifacts sharing no references. */
    const items = cloneMemoryValue(filtered.slice(offset, offset + request.limit))
    /** @brief 后续页的起始 offset / Starting offset of the following page. */
    const nextOffset = offset + items.length
    return nextOffset < filtered.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiWorkspaceOperationsCursor(`operations_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async readArtifactContent(
    request: Parameters<WorkspaceOperationsGateway['readArtifactContent']>[0]
  ): ReturnType<WorkspaceOperationsGateway['readArtifactContent']> {
    request.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    request.signal?.throwIfAborted()
    if (mode === 'empty') return throwMemoryNotFound('workspace artifact')
    /** @brief 内容读取前重新核对的 Artifact metadata / Artifact metadata rechecked before content reading. */
    const artifact = this.store.getArtifact(request.artifact.id)
    if (!uiWorkspaceArtifactsEqual(artifact, request.artifact))
      return throwMemoryNotFound('workspace artifact')
    return this.store.readArtifactContent(request.artifact.id)
  }
}
