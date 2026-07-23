/** @file Web Artifact 下载宿主适配器 / Web Artifact download host adapter. */

import {
  asUiOpaqueId,
  type AppGateways,
  type UiWorkspaceArtifactId,
  type UiWorkspaceId
} from '@ai-job-workspace/app/application'
import {
  resolveResumeArtifactSaveFormat,
  resumeArtifactSaveFormatForFileName,
  type ArtifactSavePort,
  type ResumeArtifactSaveFormat,
  type SaveArtifactRequest,
  type SaveArtifactResult
} from '@ai-job-workspace/platform'

/** @brief Web Blob 下载允许的最大 Artifact 字节数 / Maximum Artifact bytes allowed for a Web Blob download. */
export const WEB_ARTIFACT_BLOB_MAX_BYTES = 64 * 1024 * 1024

/** @brief 下载启动后保留 Blob URL 的毫秒数 / Milliseconds to retain a Blob URL after starting a download. */
const WEB_ARTIFACT_URL_REVOKE_DELAY_MS = 60_000

/** @brief Web Artifact 保存失败分类 / Web Artifact-save failure classification. */
export type WebArtifactSaveErrorCode =
  | 'artifact-content-mismatch'
  | 'artifact-identity-mismatch'
  | 'artifact-not-downloadable'
  | 'artifact-too-large'
  | 'download-start-failed'

/**
 * @brief 可安全分类且不泄露认证信息的 Web Artifact 保存错误 / Safely classifiable Web Artifact-save error that exposes no authentication data.
 */
export class WebArtifactSaveError extends Error {
  /** @brief 稳定的失败分类 / Stable failure classification. */
  readonly code: WebArtifactSaveErrorCode

  /**
   * @brief 创建一个安全 Web Artifact 保存错误 / Create a safe Web Artifact-save error.
   * @param code 稳定失败分类 / Stable failure classification.
   * @param message 不包含 URL、token 或响应内容的安全消息 / Safe message containing no URL, token, or response content.
   */
  constructor(code: WebArtifactSaveErrorCode, message: string) {
    super(message)
    this.name = 'WebArtifactSaveError'
    this.code = code
  }
}

/** @brief Web 下载需要的 Workspace Operations 子集 / Workspace Operations subset required by Web downloads. */
type WebArtifactOperations = Pick<
  AppGateways['workspaceOperations'],
  'getArtifact' | 'readArtifactContent'
>

/** @brief 可供 Web 下载使用的最小 Document 端口 / Minimal Document port used for Web downloads. */
interface WebDownloadDocument {
  /** @brief 当前文档主体 / Current document body. */
  readonly body: Pick<HTMLElement, 'appendChild'>
  /** @brief 创建下载锚点 / Create a download anchor. */
  readonly createElement: (tagName: 'a') => HTMLAnchorElement
}

/** @brief Blob URL 生命周期端口 / Blob URL lifecycle port. */
interface WebObjectUrlPort {
  /** @brief 为内存 Blob 创建不透明 URL / Create an opaque URL for an in-memory Blob. */
  readonly createObjectURL: (blob: Blob) => string
  /** @brief 撤销先前创建的 Blob URL / Revoke a previously created Blob URL. */
  readonly revokeObjectURL: (url: string) => void
}

/** @brief 延迟任务调度器 / Delayed-task scheduler. */
type WebDownloadScheduler = (callback: () => void, delayMilliseconds: number) => void

/** @brief 一个仍持有 Blob 内存的 Web 下载租约 / Web-download lease that still retains Blob memory. */
interface WebDownloadLease {
  /** @brief 幂等撤销 Blob URL / Idempotently revoke the Blob URL. */
  dispose: () => void
  /** @brief scheduler 是否已在租约注册前同步释放 / Whether the scheduler disposed before lease registration. */
  disposed: boolean
}

/** @brief Web Artifact 保存端口依赖 / Dependencies of the Web Artifact-save port. */
export interface WebArtifactSaveOptions {
  /** @brief 权威 Artifact metadata 与受认证内容读取端口 / Authoritative Artifact metadata and authenticated-content read port. */
  readonly workspaceOperations: WebArtifactOperations
  /** @brief 可注入的文档端口 / Injectable document port. */
  readonly document?: WebDownloadDocument
  /** @brief 可注入的 Blob URL 端口 / Injectable Blob URL port. */
  readonly objectUrls?: WebObjectUrlPort
  /** @brief 可注入的延迟撤销调度器 / Injectable delayed-revocation scheduler. */
  readonly schedule?: WebDownloadScheduler
}

/**
 * @brief 校验建议文件名并解析用户请求格式 / Validate the suggested filename and resolve the user-requested format.
 * @param request 宿主保存请求 / Host save request.
 * @return 已验证文件名与唯一格式 / Validated filename and sole format.
 */
function validatedArtifactSaveIntent(request: SaveArtifactRequest): {
  readonly fileName: string
  readonly format: ResumeArtifactSaveFormat
} {
  /** @brief 从品牌类型边界重新读取的运行时字符串 / Runtime string reread across the branded-type boundary. */
  const fileName: string = request.suggestedFileName
  /** @brief 文件名声明的唯一保存格式 / Sole save format declared by the filename. */
  const format = resumeArtifactSaveFormatForFileName(fileName)
  if (format === null) {
    throw new WebArtifactSaveError(
      'artifact-not-downloadable',
      'The suggested Artifact filename is unsafe or has an unsupported format.'
    )
  }
  return { fileName, format }
}

/** @brief 供 Workspace Operations 使用的语义化身份 / Semantic identities used by Workspace Operations. */
interface WebArtifactIdentity {
  /** @brief Artifact 身份 / Artifact identity. */
  readonly artifactId: UiWorkspaceArtifactId
  /** @brief 授权 Workspace 身份 / Authorized Workspace identity. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 将宿主边界的字符串提升为领域身份 / Refine host-boundary strings into domain identities.
 * @param request 宿主保存请求 / Host save request.
 * @return Workspace 与 Artifact 领域身份 / Workspace and Artifact domain identities.
 */
function artifactIdentity(request: SaveArtifactRequest): WebArtifactIdentity {
  return {
    artifactId: asUiOpaqueId<'workspace-artifact'>(request.artifactId),
    workspaceId: asUiOpaqueId<'workspace'>(request.workspaceId)
  }
}

/**
 * @brief 收集并完整消费受验证的 Artifact stream / Collect and fully consume a validated Artifact stream.
 * @param body 未消费的受认证内容 stream / Unconsumed authenticated-content stream.
 * @param expectedByteLength 权威预期字节数 / Authoritative expected byte count.
 * @param abortController 本次下载的取消控制器 / Cancellation controller for this download.
 * @return 适合构造 Blob 的不可变字节块 / Immutable byte chunks suitable for constructing a Blob.
 * @note 读取到 EOF 才会让下层完成 size 与 SHA-256 校验 / Reading to EOF is required for the lower layer to finish size and SHA-256 validation.
 */
async function collectArtifactBytes(
  body: ReadableStream<Uint8Array> | null,
  expectedByteLength: number,
  abortController: AbortController
): Promise<Uint8Array<ArrayBuffer>[]> {
  if (body === null) {
    if (expectedByteLength === 0) {
      return []
    }
    throw new WebArtifactSaveError(
      'artifact-content-mismatch',
      'The Artifact content stream is missing.'
    )
  }

  /** @brief 当前 stream 的独占读取器 / Exclusive reader for the current stream. */
  const reader = body.getReader()
  /** @brief 已复制且不再受网络缓冲区影响的分块 / Copied chunks no longer backed by network buffers. */
  const chunks: Uint8Array<ArrayBuffer>[] = []
  /** @brief 已收集的实际字节数 / Actual byte count collected so far. */
  let collectedByteLength = 0
  /** @brief 是否正常读到 EOF / Whether EOF was reached normally. */
  let reachedEnd = false

  try {
    while (!reachedEnd) {
      abortController.signal.throwIfAborted()
      /** @brief 下一个网络分块或 EOF / Next network chunk or EOF. */
      const result = await reader.read()
      abortController.signal.throwIfAborted()
      if (result.done) {
        reachedEnd = true
        continue
      }
      /** @brief 与 transport buffer 解耦的分块副本 / Chunk copy detached from the transport buffer. */
      const chunk = new Uint8Array(result.value)
      collectedByteLength += chunk.byteLength
      if (
        collectedByteLength > expectedByteLength ||
        collectedByteLength > WEB_ARTIFACT_BLOB_MAX_BYTES
      ) {
        throw new WebArtifactSaveError(
          'artifact-content-mismatch',
          'The Artifact content exceeded its validated byte limit.'
        )
      }
      chunks.push(chunk)
    }
  } catch (error: unknown) {
    abortController.abort()
    try {
      await reader.cancel()
    } catch {
      // Best effort: preserve the authoritative stream or validation failure.
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  if (collectedByteLength !== expectedByteLength) {
    throw new WebArtifactSaveError(
      'artifact-content-mismatch',
      'The Artifact content length differs from its authoritative metadata.'
    )
  }
  return chunks
}

/**
 * @brief 使用临时 Blob URL 启动浏览器下载 / Start a browser download with a temporary Blob URL.
 * @param blob 已完整验证的内存 Blob / Fully validated in-memory Blob.
 * @param fileName 格式感知安全文件名 / Format-aware safe filename.
 * @param webDocument 创建并挂载临时锚点的 Document 端口 / Document port used to create and attach a temporary anchor.
 * @param objectUrls Blob URL 生命周期端口 / Blob URL lifecycle port.
 * @param schedule 延迟撤销调度器 / Delayed revocation scheduler.
 * @param onDispose Blob URL 被撤销后的通知 / Notification after the Blob URL is revoked.
 * @return 可提前撤销 Blob URL 的幂等函数 / Idempotent function that can revoke the Blob URL early.
 */
function startBlobDownload(
  blob: Blob,
  fileName: string,
  webDocument: WebDownloadDocument,
  objectUrls: WebObjectUrlPort,
  schedule: WebDownloadScheduler,
  onDispose: () => void
): () => void {
  /** @brief 成功创建后仅指向已验证内存内容的临时 URL / Temporary URL pointing only to validated in-memory content once created. */
  let objectUrl: string | null = null
  /** @brief 成功创建后触发浏览器下载的临时锚点 / Temporary anchor that triggers the browser download once created. */
  let anchor: HTMLAnchorElement | null = null

  try {
    objectUrl = objectUrls.createObjectURL(blob)
    if (!objectUrl.startsWith('blob:')) {
      throw new WebArtifactSaveError(
        'download-start-failed',
        'The browser did not create an opaque Blob URL for the Artifact.'
      )
    }
    anchor = webDocument.createElement('a')
    anchor.download = fileName
    anchor.href = objectUrl
    anchor.hidden = true
    anchor.rel = 'noopener'
    webDocument.body.appendChild(anchor)
    anchor.click()
  } catch {
    if (objectUrl !== null) {
      objectUrls.revokeObjectURL(objectUrl)
    }
    throw new WebArtifactSaveError(
      'download-start-failed',
      'The browser could not start the Artifact download.'
    )
  } finally {
    anchor?.remove()
  }

  if (objectUrl === null) {
    throw new WebArtifactSaveError(
      'download-start-failed',
      'The browser did not create an Artifact download URL.'
    )
  }
  /** @brief 成功启动下载后确定存在的 Blob URL / Blob URL known to exist after the download starts successfully. */
  const scheduledObjectUrl = objectUrl
  /** @brief Blob URL 是否已被撤销 / Whether the Blob URL has been revoked. */
  let disposed = false
  /** @brief 统一 timer、下一次下载与登出的幂等释放 / Idempotent release shared by timer, next download, and sign-out. */
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    objectUrls.revokeObjectURL(scheduledObjectUrl)
    onDispose()
  }
  try {
    schedule(dispose, WEB_ARTIFACT_URL_REVOKE_DELAY_MS)
  } catch {
    dispose()
  }
  return dispose
}

/** @brief 可在清除认证前静止的 Web Artifact 保存服务 / Web Artifact-save service that can quiesce before authentication is cleared. */
export interface WebArtifactSaveService extends ArtifactSavePort {
  /**
   * @brief 暂停新保存、取消并等待全部在途下载 / Suspend new saves, cancel, and await every in-flight download.
   * @return 所有旧下载都不再能触发 DOM 副作用时兑现 / Resolves once no old download can trigger a DOM side effect.
   */
  readonly suspendAndQuiesce: () => Promise<void>
  /** @brief 登出失败且会话仍可用时恢复保存 / Resume saves when sign-out fails and the session remains usable. */
  readonly resume: () => void
}

/**
 * @brief 创建只下载权威 API v2 Resume Artifact 的 Web 保存服务 / Create a Web save service that downloads only authoritative API v2 Resume Artifacts.
 * @param options Workspace Operations 与可测试的浏览器宿主依赖 / Workspace Operations and testable browser-host dependencies.
 * @return 不向 DOM 暴露认证 URL 或 token 且可静止的保存服务 / Quiesceable save service exposing no authenticated URL or token to the DOM.
 */
export function createWebArtifactSave(options: WebArtifactSaveOptions): WebArtifactSaveService {
  /** @brief 当前页面的 Document 端口 / Document port for the current page. */
  const webDocument = options.document ?? globalThis.document
  /** @brief 当前页面的 Blob URL 端口 / Blob URL port for the current page. */
  const objectUrls = options.objectUrls ?? globalThis.URL
  /** @brief 当前页面的延迟任务调度器 / Delayed-task scheduler for the current page. */
  const schedule: WebDownloadScheduler =
    options.schedule ??
    ((callback, delayMilliseconds): void => {
      globalThis.setTimeout(callback, delayMilliseconds)
    })
  /** @brief 当前服务是否接受新保存 / Whether the service currently accepts new saves. */
  let active = true
  /** @brief 当前全部在途保存 / Every currently in-flight save. */
  const operations = new Set<Promise<SaveArtifactResult>>()
  /** @brief 当前全部保存的取消器 / Abort controllers for every current save. */
  const operationAborts = new Set<AbortController>()
  /** @brief 当前仍保留 Blob 内存的下载租约；正常产品最多一个 / Download leases still retaining Blob memory; at most one in normal use. */
  const blobLeases = new Set<WebDownloadLease>()

  /**
   * @brief 执行一次绑定独立取消器的 Web 下载 / Perform one Web download bound to an independent abort controller.
   * @param request 已净化宿主请求 / Sanitized host request.
   * @param abortController metadata、stream 与 DOM 副作用共享的取消器 / Controller shared by metadata, stream, and DOM effects.
   * @return 浏览器已开始下载的结果 / Result confirming that the browser download started.
   */
  const performSave = async (
    request: SaveArtifactRequest,
    abortController: AbortController
  ): Promise<SaveArtifactResult> => {
    abortController.signal.throwIfAborted()
    /** @brief 在访问网络前重新核验的文件名与请求格式 / Filename and requested format revalidated before network access. */
    const intent = validatedArtifactSaveIntent(request)
    /** @brief 从宿主请求提升的领域身份 / Domain identities refined from the host request. */
    const identity = artifactIdentity(request)

    try {
      /** @brief 从 API v2 重新读取的权威 Artifact / Authoritative Artifact reread from API v2. */
      const { artifact } = await options.workspaceOperations.getArtifact({
        artifactId: identity.artifactId,
        signal: abortController.signal,
        workspaceId: identity.workspaceId
      })
      abortController.signal.throwIfAborted()
      if (artifact.id !== identity.artifactId || artifact.workspaceId !== identity.workspaceId) {
        throw new WebArtifactSaveError(
          'artifact-identity-mismatch',
          'The authoritative Artifact identity differs from the save request.'
        )
      }
      /** @brief 权威 kind 与 MIME 共同解析出的闭合格式 / Closed format jointly resolved from authoritative kind and MIME. */
      const format = resolveResumeArtifactSaveFormat(artifact.kind, artifact.mediaType)
      if (format === null || format.kind !== intent.format.kind) {
        throw new WebArtifactSaveError(
          'artifact-not-downloadable',
          'The requested Artifact kind, media type, and filename format do not match.'
        )
      }
      if (artifact.sizeBytes > WEB_ARTIFACT_BLOB_MAX_BYTES) {
        throw new WebArtifactSaveError(
          'artifact-too-large',
          'The Resume Artifact exceeds the Web in-memory download limit.'
        )
      }
      if (artifact.expiresAt !== null && Date.parse(artifact.expiresAt) <= Date.now()) {
        throw new WebArtifactSaveError(
          'artifact-not-downloadable',
          'The requested Resume Artifact has expired.'
        )
      }

      /** @brief Bearer 认证读取且不暴露 URL 的完整内容 / Complete Bearer-authenticated content read without exposing a URL. */
      const content = await options.workspaceOperations.readArtifactContent({
        artifact,
        signal: abortController.signal
      })
      abortController.signal.throwIfAborted()
      if (
        content.byteLength !== artifact.sizeBytes ||
        content.mediaType.toLowerCase() !== artifact.mediaType.toLowerCase() ||
        content.byteLength > WEB_ARTIFACT_BLOB_MAX_BYTES
      ) {
        abortController.abort()
        try {
          await content.body?.cancel()
        } catch {
          // Best effort: preserve the safe descriptor mismatch.
        }
        throw new WebArtifactSaveError(
          'artifact-content-mismatch',
          'The Artifact content descriptor differs from its authoritative metadata.'
        )
      }

      /** @brief 读到 EOF 并完成下层 SHA-256 校验的字节块 / Byte chunks read through EOF, completing lower-layer SHA-256 validation. */
      const chunks = await collectArtifactBytes(content.body, content.byteLength, abortController)
      abortController.signal.throwIfAborted()
      /** @brief 只含已完整验证 Resume Artifact 字节的内存 Blob / In-memory Blob containing only fully validated Resume Artifact bytes. */
      const blob = new Blob(chunks, { type: format.mediaType })
      abortController.signal.throwIfAborted()
      for (const previous of blobLeases) previous.dispose()
      blobLeases.clear()
      /** @brief 即使测试 scheduler 同步执行也能正确注册的租约记录 / Lease record registering correctly even when a test scheduler fires synchronously. */
      const lease: WebDownloadLease = { dispose: (): void => undefined, disposed: false }
      lease.dispose = startBlobDownload(
        blob,
        intent.fileName,
        webDocument,
        objectUrls,
        schedule,
        (): void => {
          lease.disposed = true
          blobLeases.delete(lease)
        }
      )
      if (!lease.disposed) blobLeases.add(lease)
      return { status: 'started' }
    } catch (error: unknown) {
      abortController.abort()
      throw error
    }
  }

  return Object.freeze({
    maximumArtifactBytes: WEB_ARTIFACT_BLOB_MAX_BYTES,
    resume(): void {
      active = true
    },
    saveArtifact(request: SaveArtifactRequest, signal?: AbortSignal): Promise<SaveArtifactResult> {
      if (!active) {
        return Promise.reject(
          new WebArtifactSaveError(
            'artifact-not-downloadable',
            'Artifact saving is suspended for the current Web session.'
          )
        )
      }
      /** @brief 本次完整 metadata/content/DOM 链路共享的取消控制器 / Cancellation controller shared by this metadata/content/DOM chain. */
      const abortController = new AbortController()
      /** @brief 将页面代际取消转发到 Web 下载 / Forward page-generation cancellation into the Web download. */
      const forwardAbort = (): void =>
        abortController.abort(new DOMException('Artifact save cancelled.', 'AbortError'))
      if (signal?.aborted === true) forwardAbort()
      else signal?.addEventListener('abort', forwardAbort, { once: true })
      /** @brief 当前保存的完整 Promise / Complete Promise for the current save. */
      const operation = performSave(request, abortController)
      operations.add(operation)
      operationAborts.add(abortController)
      /** @brief 仅释放当前已终结操作 / Release only the current terminal operation. */
      const release = (): void => {
        signal?.removeEventListener('abort', forwardAbort)
        operations.delete(operation)
        operationAborts.delete(abortController)
      }
      void operation.then(release, release)
      return operation
    },
    async suspendAndQuiesce(): Promise<void> {
      active = false
      for (const abortController of operationAborts) {
        abortController.abort(new DOMException('Artifact save cancelled.', 'AbortError'))
      }
      await Promise.allSettled([...operations])
      for (const lease of blobLeases) lease.dispose()
      blobLeases.clear()
    }
  })
}
