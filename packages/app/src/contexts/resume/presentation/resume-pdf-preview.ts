/** @file Resume PDF 的安全 Blob 预览适配器 / Safe Blob-preview adapter for Resume PDFs. */

import type { UiWorkspaceArtifactContent } from '../../workspace-operations'

/** @brief 只允许 PDF 预览的固定 media type / Fixed media type allowed for PDF preview. */
const PDF_MEDIA_TYPE = 'application/pdf'

/** @brief 可替换的 Blob URL 生命周期端口 / Replaceable Blob-URL lifecycle port. */
export interface ResumePdfObjectUrlPort {
  /**
   * @brief 从已验证 Blob 创建不透明 URL / Create an opaque URL from a validated Blob.
   * @param blob 完整 PDF Blob / Complete PDF Blob.
   * @return 仅当前文档可持有的 Blob URL / Blob URL held only by the current document.
   */
  readonly createObjectURL: (blob: Blob) => string
  /**
   * @brief 释放 Blob URL 与底层内存 / Release a Blob URL and its backing memory.
   * @param url 先前创建的 Blob URL / Previously created Blob URL.
   */
  readonly revokeObjectURL: (url: string) => void
}

/** @brief PDF 内容消费进度通知 / PDF-content consumption progress notification. */
export type ResumePdfContentProgress = (completedBytes: number, totalBytes: number) => void

/** @brief 只含已验证内存内容的 PDF 预览租约 / PDF-preview lease containing only validated in-memory content. */
export interface ResumePdfPreviewLease {
  /** @brief 可安全交给 sandboxed iframe 的 Blob URL / Blob URL safe to give to a sandboxed iframe. */
  readonly url: string
  /** @brief 完整 PDF 字节数 / Complete PDF byte length. */
  readonly byteLength: number
  /**
   * @brief 幂等释放 Blob URL / Idempotently release the Blob URL.
   */
  readonly dispose: () => void
}

/** @brief PDF Blob 预览边界的安全错误类别 / Safe error category at the PDF Blob-preview boundary. */
export type ResumePdfPreviewErrorCode =
  | 'aborted'
  | 'content-length-mismatch'
  | 'content-missing'
  | 'media-type-mismatch'
  | 'object-url-failed'

/** @brief 不包含 URL、token 或响应内容的 PDF 预览错误 / PDF-preview error containing no URL, token, or response content. */
export class ResumePdfPreviewError extends Error {
  /** @brief 稳定错误类别 / Stable error category. */
  readonly code: ResumePdfPreviewErrorCode

  /**
   * @brief 构造安全 PDF 预览错误 / Construct a safe PDF-preview error.
   * @param code 稳定错误类别 / Stable error category.
   */
  constructor(code: ResumePdfPreviewErrorCode) {
    super(`Resume PDF preview failed: ${code}.`)
    this.name = 'ResumePdfPreviewError'
    this.code = code
  }
}

/**
 * @brief 将完整受认证 PDF stream 消费为可撤销的 Blob URL / Consume a complete authenticated PDF stream into a revocable Blob URL.
 * @param content 已验证但尚未消费的完整 Artifact content / Validated complete Artifact content not yet consumed.
 * @param signal 当前预览代际的取消信号 / Abort signal for the current preview generation.
 * @param onProgress 可选字节进度通知 / Optional byte-progress notification.
 * @param objectUrls 可替换 Blob URL 端口 / Replaceable Blob-URL port.
 * @return 读到 EOF 并通过下层长度与 SHA-256 核对后的租约 / Lease created only after EOF and lower-layer length/SHA-256 checks.
 * @note 调用方必须在 artifact、revision 或 route 变化以及 unmount 时调用 dispose / Callers must dispose when artifact, revision, route, or mount lifetime changes.
 */
export async function createResumePdfPreviewLease(
  content: UiWorkspaceArtifactContent,
  signal: AbortSignal,
  onProgress: ResumePdfContentProgress = (): void => undefined,
  objectUrls: ResumePdfObjectUrlPort = globalThis.URL
): Promise<ResumePdfPreviewLease> {
  if (content.mediaType.toLowerCase() !== PDF_MEDIA_TYPE) {
    throw new ResumePdfPreviewError('media-type-mismatch')
  }
  if (signal.aborted) {
    throw new ResumePdfPreviewError('aborted')
  }
  if (content.body === null) {
    throw new ResumePdfPreviewError('content-missing')
  }

  /** @brief 当前 stream 的独占 reader / Exclusive reader for the current stream. */
  const reader = content.body.getReader()
  /** @brief 从网络 buffer 复制出的稳定字节块 / Stable byte chunks copied from network buffers. */
  const chunks: Uint8Array<ArrayBuffer>[] = []
  /** @brief 已消费的字节数 / Number of bytes consumed. */
  let completedBytes = 0
  /** @brief 是否正常到达 EOF / Whether EOF was reached normally. */
  let reachedEnd = false

  try {
    while (!reachedEnd) {
      if (signal.aborted) {
        throw new ResumePdfPreviewError('aborted')
      }
      /** @brief 下一个 PDF chunk 或 EOF / Next PDF chunk or EOF. */
      const result = await reader.read()
      if (result.done) {
        reachedEnd = true
        continue
      }
      /** @brief 与 transport buffer 解耦的 chunk / Chunk detached from its transport buffer. */
      const chunk = new Uint8Array(result.value)
      completedBytes += chunk.byteLength
      if (completedBytes > content.byteLength) {
        throw new ResumePdfPreviewError('content-length-mismatch')
      }
      chunks.push(chunk)
      onProgress(completedBytes, content.byteLength)
    }
  } catch (error: unknown) {
    try {
      await reader.cancel(error)
    } catch {
      // Best effort: preserve the authoritative stream or digest failure.
    }
    if (signal.aborted && !(error instanceof ResumePdfPreviewError)) {
      throw new ResumePdfPreviewError('aborted')
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  if (completedBytes !== content.byteLength) {
    throw new ResumePdfPreviewError('content-length-mismatch')
  }

  /** @brief 只含已完整验证 PDF 字节的 Blob / Blob containing only completely validated PDF bytes. */
  const blob = new Blob(chunks, { type: PDF_MEDIA_TYPE })
  /** @brief object URL 是否已经释放 / Whether the object URL has been released. */
  let disposed = false
  /** @brief 仅在 Blob 创建成功后取得的 object URL / Object URL acquired only after Blob creation succeeds. */
  let url: string
  try {
    url = objectUrls.createObjectURL(blob)
    if (!url.startsWith('blob:')) {
      objectUrls.revokeObjectURL(url)
      throw new ResumePdfPreviewError('object-url-failed')
    }
  } catch {
    throw new ResumePdfPreviewError('object-url-failed')
  }

  return Object.freeze({
    byteLength: completedBytes,
    dispose(): void {
      if (disposed) return
      disposed = true
      objectUrls.revokeObjectURL(url)
    },
    url
  })
}
