import {
  ARTIFACT_JSON_MEDIA_TYPE,
  ARTIFACT_PDF_MEDIA_TYPE,
  classifyFetchDecodedContentEncoding,
  createArtifactMetadataUrl,
  getMediaTypeEssence,
  parseArtifactApiOrigin,
  parseArtifactContentLength,
  parseArtifactSaveRequest,
  parsePdfArtifactMetadata
} from '@ai-job-workspace/platform'
import type {
  ArtifactSavePort,
  RenderArtifactMetadata,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

/** @brief 下载后保留 Blob URL 的时间 / Time to retain a Blob URL after starting a download. */
const BLOB_URL_REVOKE_DELAY_MS = 60_000
/** @brief 一次 Web PDF metadata 刷新、下载与校验的总时限 / Total deadline for one Web PDF metadata refresh, download, and verification. */
export const BROWSER_ARTIFACT_SAVE_TIMEOUT_MS = 60_000

/** @brief 浏览器下载元素所需的最小形状 / Minimal shape required from a browser download element. */
export interface BrowserDownloadAnchor {
  /** @brief 下载 URL / Download URL. */
  href: string
  /** @brief 建议下载文件名 / Suggested download filename. */
  download: string
  /** @brief 触发浏览器下载 / Trigger the browser download. */
  readonly click: () => void
  /** @brief 从临时父节点移除 / Remove from the temporary parent. */
  readonly remove: () => void
}

/** @brief 浏览器保存适配器依赖 / Browser save-adapter dependencies. */
export interface BrowserArtifactSaveDependencies {
  /** @brief 可替换的网络实现 / Replaceable network implementation. */
  readonly fetchImpl: typeof fetch
  /**
   * @brief 创建临时下载元素 / Create a temporary download element.
   * @return 尚未附加的下载元素 / A detached download element.
   */
  readonly createAnchor: () => BrowserDownloadAnchor
  /**
   * @brief 将临时元素附加到文档 / Attach a temporary element to the document.
   * @param anchor 待附加的下载元素 / Download element to attach.
   * @return 无返回值 / No return value.
   */
  readonly appendAnchor: (anchor: BrowserDownloadAnchor) => void
  /**
   * @brief 为已校验的 PDF 创建临时 URL / Create a temporary URL for a verified PDF.
   * @param blob 已校验的 PDF Blob / Verified PDF blob.
   * @return 临时 Blob URL / Temporary blob URL.
   */
  readonly createObjectURL: (blob: Blob) => string
  /**
   * @brief 释放临时 Blob URL / Revoke a temporary Blob URL.
   * @param url 待释放的 Blob URL / Blob URL to revoke.
   * @return 无返回值 / No return value.
   */
  readonly revokeObjectURL: (url: string) => void
  /**
   * @brief 延迟执行 Blob URL 清理 / Schedule delayed Blob URL cleanup.
   * @param callback 清理回调 / Cleanup callback.
   * @param delayMilliseconds 延迟毫秒数 / Delay in milliseconds.
   * @return 无返回值 / No return value.
   */
  readonly scheduleRevoke: (callback: () => void, delayMilliseconds: number) => void
  /**
   * @brief 读取当前 Unix epoch 毫秒 / Read current Unix epoch milliseconds.
   * @return 当前毫秒时间戳 / Current timestamp in milliseconds.
   */
  readonly now: () => number
}

/** @brief Web 产物保存边界错误 / Web artifact-save boundary error. */
export class BrowserArtifactSaveError extends Error {
  override readonly name = 'BrowserArtifactSaveError'
}

/**
 * @brief 从 response stream 读取有严格上限的字节 / Read bytes from a response stream with a strict limit.
 * @param response PDF 内容响应 / PDF content response.
 * @param expectedSizeBytes API 元数据声明的精确字节数 / Exact byte count declared by API metadata.
 * @param signal 统一保存截止信号 / Shared save-deadline signal.
 * @return 连续的响应字节 / Contiguous response bytes.
 * @throws BrowserArtifactSaveError body 缺失或超过声明大小时抛出 / Thrown when the body is absent or exceeds its declared size.
 */
async function readExactResponseBytes(
  response: Response,
  expectedSizeBytes: number,
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  /** @brief 经过存在性检查的 PDF 响应体 / PDF response body checked for presence. */
  const body = response.body
  if (body === null) {
    throw new BrowserArtifactSaveError('The PDF response does not contain a readable body.')
  }
  /** @brief PDF 响应体 reader / PDF response-body reader. */
  const reader = body.getReader()

  /** @brief 已复制且受上限约束的分块 / Copied chunks constrained by the declared limit. */
  const chunks: Uint8Array<ArrayBuffer>[] = []
  /** @brief 当前已读取字节数 / Number of bytes read so far. */
  let receivedSizeBytes = 0

  /**
   * @brief 在总时限到达时取消响应 reader / Cancel the response reader when the total deadline expires.
   * @return 无返回值 / No return value.
   */
  function cancelReaderOnAbort(): void {
    void reader.cancel(signal.reason).catch((): void => undefined)
  }

  try {
    signal.throwIfAborted()
    signal.addEventListener('abort', cancelReaderOnAbort, { once: true })
    while (true) {
      /** @brief 当前 stream 读取结果 / Current stream read result. */
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      receivedSizeBytes += value.byteLength
      if (receivedSizeBytes > expectedSizeBytes) {
        try {
          await reader.cancel()
        } catch {
          // Cancellation is best-effort and must not replace the integrity failure.
        }
        throw new BrowserArtifactSaveError('The PDF response exceeds its declared byte count.')
      }
      /** @brief 与 stream 内部缓冲区解耦的当前分块 / Current chunk detached from the stream's internal buffer. */
      const chunk = new Uint8Array(value.byteLength)
      chunk.set(value)
      chunks.push(chunk)
    }
  } finally {
    signal.removeEventListener('abort', cancelReaderOnAbort)
    try {
      reader.releaseLock()
    } catch {
      // A pending cancellation can retain the lock briefly; no reader escapes this boundary.
    }
  }

  if (receivedSizeBytes !== expectedSizeBytes) {
    throw new BrowserArtifactSaveError('The PDF response does not match its declared byte count.')
  }

  /** @brief 合并后的连续响应字节 / Merged contiguous response bytes. */
  const bytes = new Uint8Array(receivedSizeBytes)
  /** @brief 下一个分块写入位置 / Write offset for the next chunk. */
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * @brief 计算字节的小写 SHA-256 / Compute lowercase SHA-256 for bytes.
 * @param bytes 待摘要字节 / Bytes to digest.
 * @return 64 字符小写十六进制摘要 / 64-character lowercase hexadecimal digest.
 */
async function digestSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  /** @brief Web Crypto 返回的二进制摘要 / Binary digest returned by Web Crypto. */
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

/**
 * @brief 获取当前产物的未信任元数据 JSON / Fetch untrusted metadata JSON for the current artifact.
 * @param metadataUrl 当前 artifact 的元数据 URL / Metadata URL for the current artifact.
 * @param fetchImpl 可替换的 fetch 实现 / Replaceable fetch implementation.
 * @param signal 统一保存截止信号 / Shared save-deadline signal.
 * @return 尚未通过 platform decoder 的 JSON 值 / JSON value not yet passed through the platform decoder.
 */
async function fetchArtifactMetadataPayload(
  metadataUrl: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<unknown> {
  /** @brief 当前保存动作重新读取的权威元数据响应 / Authoritative metadata response refreshed for this save action. */
  const response = await fetchImpl(metadataUrl.href, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: ARTIFACT_JSON_MEDIA_TYPE },
    method: 'GET',
    redirect: 'error',
    signal
  })
  if (
    response.status !== 200 ||
    response.redirected ||
    (response.url.length > 0 && response.url !== metadataUrl.href)
  ) {
    throw new BrowserArtifactSaveError('The product API did not return artifact metadata.')
  }
  if (getMediaTypeEssence(response.headers.get('Content-Type')) !== ARTIFACT_JSON_MEDIA_TYPE) {
    throw new BrowserArtifactSaveError('The artifact metadata response is not JSON.')
  }

  try {
    return (await response.json()) as unknown
  } catch {
    throw new BrowserArtifactSaveError('The artifact metadata response is not valid JSON.')
  }
}

/**
 * @brief 下载并核对 PDF 内容 / Download and verify PDF content.
 * @param contentUrl 已验证的同源 artifact 内容 URL / Verified same-origin artifact content URL.
 * @param metadata 权威产物元数据 / Authoritative artifact metadata.
 * @param fetchImpl 可替换的 fetch 实现 / Replaceable fetch implementation.
 * @param signal 统一保存截止信号 / Shared save-deadline signal.
 * @return 已完成大小与 SHA-256 校验的字节 / Bytes verified by size and SHA-256.
 */
async function fetchVerifiedPdf(
  contentUrl: URL,
  metadata: RenderArtifactMetadata,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  /** @brief PDF 内容响应 / PDF content response. */
  const response = await fetchImpl(contentUrl.href, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: ARTIFACT_PDF_MEDIA_TYPE },
    method: 'GET',
    redirect: 'error',
    signal
  })
  if (
    response.status !== 200 ||
    response.redirected ||
    (response.url.length > 0 && response.url !== contentUrl.href)
  ) {
    throw new BrowserArtifactSaveError('The product API did not return the PDF artifact.')
  }
  if (getMediaTypeEssence(response.headers.get('Content-Type')) !== ARTIFACT_PDF_MEDIA_TYPE) {
    throw new BrowserArtifactSaveError('The artifact content response is not a PDF.')
  }
  /** @brief 当前 JS 边界可见的内容编码 / Content encoding visible at the current JavaScript boundary. */
  const contentEncodingHeader = response.headers.get('Content-Encoding')
  /** @brief Fetch 解码后的内容编码语义 / Content-encoding semantics after Fetch decoding. */
  const contentEncoding = classifyFetchDecodedContentEncoding(contentEncodingHeader)
  if (contentEncoding === 'invalid') {
    throw new BrowserArtifactSaveError('The PDF response Content-Encoding is unsupported.')
  }
  /** @brief CORS 可能隐藏 Content-Encoding，此时不能将传输长度当作解码长度 / CORS can hide Content-Encoding, so transfer length cannot then stand for decoded length. */
  const hasUnambiguousIdentityLength =
    contentEncoding === 'identity' && !(response.type === 'cors' && contentEncodingHeader === null)
  if (hasUnambiguousIdentityLength) {
    /** @brief identity 表示下的可选响应长度 / Optional response length for an identity representation. */
    const contentLength = parseArtifactContentLength(response.headers.get('Content-Length'))
    if (contentLength !== null && contentLength !== metadata.size_bytes) {
      throw new BrowserArtifactSaveError('The PDF Content-Length does not match its metadata.')
    }
  }

  /** @brief 受元数据大小上限约束的响应字节 / Response bytes constrained by the metadata size limit. */
  const bytes = await readExactResponseBytes(response, metadata.size_bytes, signal)
  /** @brief 下载内容的实际 SHA-256 / Actual SHA-256 of the downloaded content. */
  const actualSha256 = await digestSha256(bytes)
  signal.throwIfAborted()
  if (actualSha256 !== metadata.sha256.toLowerCase()) {
    throw new BrowserArtifactSaveError('The PDF response failed its integrity check.')
  }
  return bytes
}

/**
 * @brief 创建默认浏览器依赖 / Create default browser dependencies.
 * @return 使用原生 fetch、DOM 与 URL API 的依赖 / Dependencies using native fetch, DOM, and URL APIs.
 */
function createDefaultDependencies(): BrowserArtifactSaveDependencies {
  return {
    appendAnchor: (anchor): void => {
      document.body.append(anchor as HTMLAnchorElement)
    },
    createAnchor: (): HTMLAnchorElement => document.createElement('a'),
    createObjectURL: (blob): string => URL.createObjectURL(blob),
    fetchImpl: globalThis.fetch.bind(globalThis),
    now: (): number => Date.now(),
    revokeObjectURL: (url): void => URL.revokeObjectURL(url),
    scheduleRevoke: (callback, delayMilliseconds): void => {
      globalThis.setTimeout(callback, delayMilliseconds)
    }
  }
}

/**
 * @brief 创建浏览器产物保存适配器 / Create the browser artifact-save adapter.
 * @param apiBaseUrl 已验证的产品 API origin / Validated product API origin.
 * @param overrides 可测试的网络、DOM 与 URL 能力 / Testable network, DOM, and URL capabilities.
 * @return 先核对真实响应再启动下载的宿主端口 / Host port verifying the real response before starting a download.
 * @note 该适配器不虚构认证；跨源 CORS 与 Bearer 注入仍必须由正式认证方案冻结 / This adapter does not invent authentication; cross-origin CORS and Bearer injection still require a frozen authentication design.
 */
export function createBrowserArtifactSavePort(
  apiBaseUrl: string,
  overrides: Partial<BrowserArtifactSaveDependencies> = {}
): ArtifactSavePort {
  /** @brief 当前产品 API origin / Current product API origin. */
  const apiOrigin = parseArtifactApiOrigin(apiBaseUrl).origin
  /** @brief 默认能力与测试替换合成的依赖 / Dependencies composed from defaults and test overrides. */
  const dependencies: BrowserArtifactSaveDependencies = {
    ...createDefaultDependencies(),
    ...overrides
  }

  /**
   * @brief 重新读取权威元数据、核对内容并启动 Blob 下载 / Refresh authoritative metadata, verify content, and start a Blob download.
   * @param request 只含 artifact identity 与安全文件名的保存请求 / Save request containing only artifact identity and a safe filename.
   * @return 已触发但最终文件系统结果不可观察的 started 状态 / Started status because the final filesystem outcome is not observable.
   */
  async function saveArtifact(request: SaveArtifactRequest): Promise<SaveArtifactResult> {
    /** @brief Web 信任边界重新解码的窄保存请求 / Narrow save request decoded again at the Web trust boundary. */
    const validatedRequest = parseArtifactSaveRequest(request)
    /** @brief 权威元数据端点 / Authoritative metadata endpoint. */
    const metadataUrl = createArtifactMetadataUrl(validatedRequest.artifactId, apiOrigin)
    /** @brief 统一取消 metadata、内容流与校验的控制器 / Controller cancelling metadata, content streaming, and verification together. */
    const abortController = new AbortController()
    /** @brief Web 保存操作的总时限计时器 / Total-deadline timer for the Web save operation. */
    const timeout = globalThis.setTimeout((): void => {
      abortController.abort(new Error('PDF artifact downloading timed out.'))
    }, BROWSER_ARTIFACT_SAVE_TIMEOUT_MS)
    try {
      /** @brief 当前保存动作重新取得的未信任 JSON / Untrusted JSON refreshed for this save action. */
      const metadataPayload = await fetchArtifactMetadataPayload(
        metadataUrl,
        dependencies.fetchImpl,
        abortController.signal
      )
      /** @brief 通过共享 Schema 与宿主策略解码的 PDF 元数据 / PDF metadata decoded through shared schema and host policy. */
      let artifact: ReturnType<typeof parsePdfArtifactMetadata>
      try {
        artifact = parsePdfArtifactMetadata(metadataPayload, {
          apiOrigin,
          artifactId: validatedRequest.artifactId,
          nowMilliseconds: dependencies.now()
        })
      } catch {
        throw new BrowserArtifactSaveError(
          'The artifact metadata response violates the PDF contract.'
        )
      }
      /** @brief 已通过大小与摘要核对的 PDF 字节 / PDF bytes verified by size and digest. */
      const bytes = await fetchVerifiedPdf(
        artifact.contentUrl,
        artifact.metadata,
        dependencies.fetchImpl,
        abortController.signal
      )
      /** @brief 只包含已校验 PDF 的 Blob / Blob containing only the verified PDF. */
      const blob = new Blob([bytes.buffer], { type: ARTIFACT_PDF_MEDIA_TYPE })
      /** @brief 仅为本次用户动作创建的下载元素 / Download element created only for this user action. */
      const anchor = dependencies.createAnchor()
      /** @brief 同源临时下载 URL / Same-origin temporary download URL. */
      const blobUrl = dependencies.createObjectURL(blob)

      try {
        anchor.href = blobUrl
        anchor.download = validatedRequest.suggestedFileName
        dependencies.appendAnchor(anchor)
        anchor.click()
      } finally {
        anchor.remove()
        dependencies.scheduleRevoke(
          (): void => dependencies.revokeObjectURL(blobUrl),
          BLOB_URL_REVOKE_DELAY_MS
        )
      }

      return { status: 'started' }
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }

  return { saveArtifact }
}
