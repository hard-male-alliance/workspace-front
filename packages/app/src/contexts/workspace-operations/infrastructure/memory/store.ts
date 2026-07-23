/** @file Workspace Operations 内存 adapter 的共享状态 / Shared state for the Workspace Operations in-memory adapter. */

import type { UiCommandId } from '../../../../shared-kernel/command'
import { asUiConcurrencyToken } from '../../../../shared-kernel/concurrency'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import { InMemoryGatewayError, throwMemoryNotFound } from '../../../../infrastructure/memory'
import type {
  UiWorkspaceArtifact,
  UiWorkspaceArtifactContent,
  UiWorkspaceArtifactId,
  UiWorkspaceJobAuthority,
  UiWorkspaceJobId
} from '../../domain/models'

/** @brief 注册一个内存 Resume Render Job 的输入 / Input for registering one in-memory Resume Render Job. */
export interface InMemoryResumeRenderRegistration {
  readonly commandId: UiCommandId
  readonly workspaceId: UiWorkspaceId
  readonly resumeId: string
  readonly resumeRevision: number
  readonly mode: 'preview' | 'final' | 'export'
  readonly formats: readonly InMemoryResumeRenderFormat[]
}

/** @brief 内存 Render store 支持的协议格式 / Protocol formats supported by the in-memory Render store. */
export type InMemoryResumeRenderFormat = 'pdf' | 'json' | 'docx'

/** @brief 一个内存 Artifact 的 metadata 与不可变字节 / Metadata and immutable bytes of one in-memory Artifact. */
interface StoredArtifact {
  readonly metadata: UiWorkspaceArtifact
  readonly bytes: Uint8Array
  readonly contentEntityTag: ReturnType<typeof asUiConcurrencyToken>
}

/** @brief 已注册 Render command 的稳定指纹与 Job identity / Stable fingerprint and Job identity of a registered Render command. */
interface StoredRenderCommand {
  readonly fingerprint: string
  readonly jobId: UiWorkspaceJobId
}

/** @brief PDF 测试内容 / PDF test content. */
const PDF_CONTENT = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
)

/** @brief JSON 测试内容 / JSON test content. */
const JSON_CONTENT = new TextEncoder().encode('{}\n')

/** @brief DOCX signature 测试内容 / DOCX-signature test content. */
const DOCX_CONTENT = new TextEncoder().encode('PK\u0003\u0004mock-docx')

/** @brief 每种 Render 格式的固定内容事实 / Fixed content facts for each Render format. */
const RENDER_CONTENT: Readonly<
  Record<
    InMemoryResumeRenderFormat,
    {
      readonly bytes: Uint8Array
      readonly kind: UiWorkspaceArtifact['kind']
      readonly mediaType: string
      readonly sha256: string
    }
  >
> = {
  docx: {
    bytes: DOCX_CONTENT,
    kind: 'resume_docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sha256: '5889f539deef526741ab6eb11ac8a28460d5e500728fc48513a6cb5322d7267c'
  },
  json: {
    bytes: JSON_CONTENT,
    kind: 'resume_json',
    mediaType: 'application/json',
    sha256: 'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356'
  },
  pdf: {
    bytes: PDF_CONTENT,
    kind: 'resume_pdf',
    mediaType: 'application/pdf',
    sha256: 'd7dd0115be8b79ae057b3f6ca0fcee578085ba6919dcb70e8643a2aff537d9b5'
  }
}

/**
 * @brief 创建 Render command 的稳定测试指纹 / Create a stable test fingerprint for a Render command.
 * @param input 完整 Render 注册输入 / Complete Render registration input.
 * @return 与格式顺序保持一致的 JSON 指纹 / JSON fingerprint preserving format order.
 */
function renderFingerprint(input: InMemoryResumeRenderRegistration): string {
  return JSON.stringify({
    formats: input.formats,
    mode: input.mode,
    resumeId: input.resumeId,
    resumeRevision: input.resumeRevision,
    workspaceId: input.workspaceId
  })
}

/** @brief Workspace Operations 自动化测试 adapter 的共享 store / Shared store for Workspace Operations automated-test adapters. */
export class InMemoryWorkspaceOperationsStore {
  /** @brief 当前 store 中的 Job 权威 / Job authorities in this store. */
  private readonly jobs = new Map<UiWorkspaceJobId, UiWorkspaceJobAuthority>()

  /** @brief 当前 store 中的 Artifact metadata 与 bytes / Artifact metadata and bytes in this store. */
  private readonly artifacts = new Map<UiWorkspaceArtifactId, StoredArtifact>()

  /** @brief Render command 的幂等结果 / Idempotent Render-command results. */
  private readonly renderCommands = new Map<string, StoredRenderCommand>()

  /** @brief 每个 Render Job 请求的不可变格式 / Immutable formats requested by each Render Job. */
  private readonly renderFormats = new Map<
    UiWorkspaceJobId,
    readonly InMemoryResumeRenderFormat[]
  >()

  /** @brief 为不同 canonical path 分配唯一测试 Job ID 的序号 / Ordinal allocating unique test Job IDs across canonical paths. */
  private nextRenderJobOrdinal = 1

  /**
   * @brief 幂等注册一个 Resume Render Job / Idempotently register one Resume Render Job.
   * @param input 完整 Render 意图 / Complete Render intent.
   * @return queued Job 权威或同一意图的既有权威 / Queued Job authority or existing authority for the same intent.
   */
  registerResumeRender(input: InMemoryResumeRenderRegistration): UiWorkspaceJobAuthority {
    /** @brief 当前意图的稳定指纹 / Stable fingerprint of the current intent. */
    const fingerprint = renderFingerprint(input)
    /** @brief 与服务端 principal/workspace/method/path/key 作用域一致的测试缓存键 / Test-cache key aligned with the server principal/workspace/method/path/key scope. */
    const cacheKey = `${input.workspaceId}:${input.resumeId}:${input.commandId}`
    /** @brief 同一 command identity 的既有注册 / Existing registration for the same command identity. */
    const existing = this.renderCommands.get(cacheKey)
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new InMemoryGatewayError(
          'memory.idempotency_key_reused',
          'The Mock Render command identity was reused with a different request.'
        )
      }
      return this.getJobAuthority(existing.jobId)
    }
    /** @brief 与 path-aware 幂等缓存解耦的唯一 Job identity / Unique Job identity independent of the path-aware idempotency cache. */
    const jobId = asUiOpaqueId<'workspace-job'>(`render_job_${this.nextRenderJobOrdinal}`)
    this.nextRenderJobOrdinal += 1
    /** @brief 首次注册的 queued Job 权威 / Queued Job authority registered for the first time. */
    const authority: UiWorkspaceJobAuthority = {
      concurrencyToken: asUiConcurrencyToken('"memory-render-job-1"'),
      job: {
        createdAt: '2026-07-18T00:00:00.000Z',
        finishedAt: null,
        id: jobId,
        kind: 'resume.render',
        problem: null,
        progress: { completed: 0, phase: 'queued', total: 1, unit: 'steps' },
        resultRefs: [],
        revision: 1,
        startedAt: null,
        status: 'queued',
        subject: {
          id: input.resumeId,
          resourceType: 'resume',
          revision: input.resumeRevision
        },
        updatedAt: '2026-07-18T00:00:00.000Z',
        workspaceId: input.workspaceId
      },
      location: `https://api.hmalliances.org:8022/api/v2/workspaces/${input.workspaceId}/jobs/${jobId}`,
      requestId: `request_${input.commandId}`
    }
    this.jobs.set(jobId, authority)
    this.renderCommands.set(cacheKey, { fingerprint, jobId })
    this.renderFormats.set(jobId, [...input.formats])
    return authority
  }

  /**
   * @brief 读取一个 Job 权威 / Read one Job authority.
   * @param jobId Job identity / Job identity.
   * @return 当前权威 / Current authority.
   */
  getJobAuthority(jobId: UiWorkspaceJobId): UiWorkspaceJobAuthority {
    return this.jobs.get(jobId) ?? throwMemoryNotFound('workspace job')
  }

  /** @brief 返回当前全部 Job 权威 / Return all current Job authorities. */
  listJobAuthorities(): readonly UiWorkspaceJobAuthority[] {
    return [...this.jobs.values()]
  }

  /**
   * @brief 将 Render Job 确定性推进一个合法状态 / Deterministically advance a Render Job by one legal state.
   * @param jobId Job identity / Job identity.
   * @return 推进后的权威；终态保持不变 / Advanced authority, preserving an existing terminal state.
   */
  advanceRenderJob(jobId: UiWorkspaceJobId): UiWorkspaceJobAuthority {
    /** @brief 当前 Job 权威 / Current Job authority. */
    const current = this.getJobAuthority(jobId)
    if (current.job.kind !== 'resume.render') return current
    if (current.job.status === 'queued') {
      /** @brief 合法 queued-to-running 中间权威 / Legal queued-to-running intermediate authority. */
      const running: UiWorkspaceJobAuthority = {
        concurrencyToken: asUiConcurrencyToken('"memory-render-job-2"'),
        job: {
          ...current.job,
          finishedAt: null,
          problem: null,
          progress: { completed: 1, phase: 'layout', total: 2, unit: 'steps' },
          resultRefs: [],
          revision: current.job.revision + 1,
          startedAt: '2026-07-18T00:00:01.000Z',
          status: 'running',
          updatedAt: '2026-07-18T00:00:01.000Z'
        },
        location: null,
        requestId: `request_observe_${jobId}_running`
      }
      this.jobs.set(jobId, running)
      return running
    }
    if (current.job.status !== 'running') return current
    /** @brief 注册时保留的 Render formats / Render formats retained at registration. */
    const formats = this.renderFormats.get(jobId)
    if (formats === undefined) {
      throw new InMemoryGatewayError('memory.unavailable', 'The Mock Render Job lost its formats.')
    }
    /** @brief 为每个格式创建的 Artifact / Artifacts created for every format. */
    const artifacts = formats.map((format, index): UiWorkspaceArtifact => {
      /** @brief 当前格式的固定内容事实 / Fixed content facts for the current format. */
      const content = RENDER_CONTENT[format]
      /** @brief 确定性 Artifact identity / Deterministic Artifact identity. */
      const artifactId = asUiOpaqueId<'workspace-artifact'>(
        `artifact_${jobId}_${format}_${index + 1}`
      )
      /** @brief 新 Artifact metadata / New Artifact metadata. */
      const metadata: UiWorkspaceArtifact = {
        createdAt: '2026-07-18T00:00:05.000Z',
        expiresAt: null,
        id: artifactId,
        kind: content.kind,
        mediaType: content.mediaType,
        pageCount: format === 'pdf' ? 1 : null,
        revision: 1,
        sha256: content.sha256,
        sizeBytes: content.bytes.byteLength,
        subject: current.job.subject,
        updatedAt: '2026-07-18T00:00:05.000Z',
        workspaceId: current.job.workspaceId
      }
      this.artifacts.set(artifactId, {
        bytes: content.bytes.slice(),
        contentEntityTag: asUiConcurrencyToken(`"memory-artifact-content-${index + 1}"`),
        metadata
      })
      return metadata
    })
    /** @brief 成功终态与新强 ETag / Succeeded terminal authority with a new strong ETag. */
    const completed: UiWorkspaceJobAuthority = {
      concurrencyToken: asUiConcurrencyToken('"memory-render-job-3"'),
      job: {
        ...current.job,
        finishedAt: '2026-07-18T00:00:05.000Z',
        problem: null,
        progress: { completed: 1, phase: 'completed', total: 1, unit: 'steps' },
        resultRefs: artifacts.map((artifact) => ({
          id: artifact.id,
          resourceType: 'artifact',
          revision: artifact.revision
        })),
        revision: current.job.revision + 1,
        startedAt: '2026-07-18T00:00:01.000Z',
        status: 'succeeded',
        updatedAt: '2026-07-18T00:00:05.000Z'
      },
      location: null,
      requestId: `request_observe_${jobId}`
    }
    this.jobs.set(jobId, completed)
    return completed
  }

  /**
   * @brief 取消一个仍在排队或执行的 Job / Cancel a Job that is still queued or running.
   * @param jobId Job identity / Job identity.
   * @param concurrencyToken 当前强 ETag / Current strong ETag.
   * @return 取消后的权威 / Authority after cancellation.
   */
  cancelJob(
    jobId: UiWorkspaceJobId,
    concurrencyToken: ReturnType<typeof asUiConcurrencyToken>
  ): UiWorkspaceJobAuthority {
    /** @brief 当前 Job 权威 / Current Job authority. */
    const current = this.getJobAuthority(jobId)
    if (current.concurrencyToken !== concurrencyToken) {
      throw new InMemoryGatewayError('memory.conflict', 'The Mock Job concurrency token is stale.')
    }
    if (current.job.status !== 'queued' && current.job.status !== 'running') {
      throw new InMemoryGatewayError('memory.conflict', 'The Mock Job is already terminal.')
    }
    /** @brief 取消终态 / Cancelled terminal authority. */
    const cancelled: UiWorkspaceJobAuthority = {
      concurrencyToken: asUiConcurrencyToken(`"memory-cancelled-${current.job.revision + 1}"`),
      job: {
        ...current.job,
        finishedAt: '2026-07-18T00:00:02.000Z',
        problem: null,
        progress: current.job.progress,
        resultRefs: [],
        revision: current.job.revision + 1,
        startedAt: current.job.status === 'running' ? current.job.startedAt : null,
        status: 'cancelled',
        updatedAt: '2026-07-18T00:00:02.000Z'
      },
      location: null,
      requestId: `request_cancel_${jobId}`
    }
    this.jobs.set(jobId, cancelled)
    return cancelled
  }

  /** @brief 返回当前全部 Artifact / Return all current Artifacts. */
  listArtifacts(): readonly UiWorkspaceArtifact[] {
    return [...this.artifacts.values()].map((artifact) => artifact.metadata)
  }

  /**
   * @brief 读取一个 Artifact metadata / Read one Artifact metadata resource.
   * @param artifactId Artifact identity / Artifact identity.
   * @return 当前 metadata / Current metadata.
   */
  getArtifact(artifactId: UiWorkspaceArtifactId): UiWorkspaceArtifact {
    return this.artifacts.get(artifactId)?.metadata ?? throwMemoryNotFound('workspace artifact')
  }

  /**
   * @brief 创建一个不共享 bytes 的完整 content stream / Create a complete content stream sharing no bytes.
   * @param artifactId Artifact identity / Artifact identity.
   * @return 未消费的完整受保护内容 / Unconsumed complete protected content.
   */
  readArtifactContent(artifactId: UiWorkspaceArtifactId): UiWorkspaceArtifactContent {
    /** @brief 当前存储的 Artifact / Currently stored Artifact. */
    const stored = this.artifacts.get(artifactId) ?? throwMemoryNotFound('workspace artifact')
    /** @brief 当前读取拥有的字节副本 / Byte copy owned by the current read. */
    const bytes = stored.bytes.slice()
    return {
      acceptsByteRanges: true,
      body:
        bytes.byteLength === 0
          ? null
          : new ReadableStream<Uint8Array>({
              start(controller): void {
                controller.enqueue(bytes)
                controller.close()
              }
            }),
      byteLength: bytes.byteLength,
      disposition: 'inline',
      entityTag: stored.contentEntityTag,
      mediaType: stored.metadata.mediaType,
      requestId: `request_content_${artifactId}`
    }
  }
}
