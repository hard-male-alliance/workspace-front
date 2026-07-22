import {
  MAX_PDF_ARTIFACT_BYTES,
  parseRfc3339TimestampMilliseconds,
  parseRenderArtifactMetadata,
  sanitizePdfFileName
} from '@ai-job-workspace/platform'
import type {
  ArtifactSavePort,
  RenderArtifactMetadata,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

/** @brief JSON 元数据响应允许的媒体类型 / Media type allowed for JSON metadata responses. */
const JSON_MEDIA_TYPE = 'application/json'
/** @brief PDF 内容响应允许的媒体类型 / Media type allowed for PDF content responses. */
const PDF_MEDIA_TYPE = 'application/pdf'
/** @brief 下载后保留 Blob URL 的时间 / Time to retain a Blob URL after starting a download. */
const BLOB_URL_REVOKE_DELAY_MS = 60_000
/** @brief 一次 Web PDF metadata 刷新、下载与校验的总时限 / Total deadline for one Web PDF metadata refresh, download, and verification. */
export const BROWSER_ARTIFACT_SAVE_TIMEOUT_MS = 60_000
/** @brief 过期前拒绝启动 Web 下载的安全窗口 / Safety window before expiry in which a Web download is rejected. */
export const BROWSER_ARTIFACT_EXPIRY_SAFETY_WINDOW_MS = 30_000
/** @brief 冻结契约中的不透明资源 ID 格式 / Opaque resource-ID format from the frozen contract. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u

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
 * @brief 返回响应 Content-Type 的规范化 essence / Return the normalized essence of a response Content-Type.
 * @param value 未经信任的 Content-Type header / Untrusted Content-Type header.
 * @return 小写 essence；缺失或无效时为 null / Lowercase essence, or null when missing or invalid.
 */
function getMediaTypeEssence(value: string | null): string | null {
  if (value === null) return null
  /** @brief 分号前的媒体类型主体 / Media-type token before parameters. */
  const essence = value.split(';', 1)[0]?.trim().toLowerCase()
  return essence === undefined || essence.length === 0 ? null : essence
}

/**
 * @brief 严格读取非负 Content-Length / Strictly read a non-negative Content-Length.
 * @param value 未经信任的 Content-Length header / Untrusted Content-Length header.
 * @return 缺失时为 null，否则为安全整数 / Null when absent, otherwise a safe integer.
 * @throws BrowserArtifactSaveError header 不符合十进制安全整数时抛出 / Thrown when the header is not a decimal safe integer.
 */
function parseContentLength(value: string | null): number | null {
  if (value === null) return null
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new BrowserArtifactSaveError('The PDF response has an invalid Content-Length header.')
  }
  /** @brief 十进制响应长度 / Decimal response length. */
  const length = Number(value)
  if (!Number.isSafeInteger(length)) {
    throw new BrowserArtifactSaveError('The PDF response Content-Length is outside the safe range.')
  }
  return length
}

/**
 * @brief 严格校验 API origin / Strictly validate the API origin.
 * @param apiBaseUrl 已解析但仍视作不可信的 API base URL / Resolved but still untrusted API base URL.
 * @return 不含路径、凭证、查询或 fragment 的 URL / URL without path, credentials, query, or fragment.
 * @throws BrowserArtifactSaveError 输入不是纯 HTTP(S) origin 时抛出 / Thrown when the input is not a plain HTTP(S) origin.
 */
function parseApiOrigin(apiBaseUrl: string): URL {
  try {
    /** @brief 待验证的 URL / URL being validated. */
    const url = new URL(apiBaseUrl)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new BrowserArtifactSaveError('The product API base URL must be a plain HTTP(S) origin.')
    }
    return url
  } catch (error: unknown) {
    if (error instanceof BrowserArtifactSaveError) throw error
    throw new BrowserArtifactSaveError('The product API base URL is invalid.')
  }
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
 * @brief 校验产物元数据是否可用于当前 PDF 下载 / Validate artifact metadata for the current PDF download.
 * @param metadata 严格解码后的产物元数据 / Strictly decoded artifact metadata.
 * @param request 当前保存请求 / Current save request.
 * @param expectedContentUrl 当前 artifact 的规范内容 URL / Canonical content URL for the artifact.
 * @param now 当前 Unix epoch 毫秒 / Current Unix epoch milliseconds.
 * @return 保留同源短期签名 query 的已验证 URL / Validated URL preserving a same-origin short-lived signature query.
 * @throws BrowserArtifactSaveError 元数据与请求或 Web 安全边界不一致时抛出 / Thrown when metadata conflicts with the request or Web security boundary.
 */
function validatePdfMetadata(
  metadata: RenderArtifactMetadata,
  request: SaveArtifactRequest,
  expectedContentUrl: URL,
  now: number
): URL {
  if (metadata.id !== request.artifactId) {
    throw new BrowserArtifactSaveError('The product API returned metadata for another artifact.')
  }
  if (metadata.format !== 'pdf' || getMediaTypeEssence(metadata.content_type) !== PDF_MEDIA_TYPE) {
    throw new BrowserArtifactSaveError('The requested artifact is not a PDF.')
  }
  if (metadata.size_bytes > MAX_PDF_ARTIFACT_BYTES) {
    throw new BrowserArtifactSaveError('The PDF artifact exceeds the supported size limit.')
  }
  if (metadata.expires_at !== undefined && metadata.expires_at !== null) {
    /** @brief 包括 RFC 3339 闰秒语义的过期时刻 / Expiry instant including RFC 3339 leap-second semantics. */
    const expiresAt = parseRfc3339TimestampMilliseconds(metadata.expires_at)
    if (expiresAt === null || expiresAt <= now + BROWSER_ARTIFACT_EXPIRY_SAFETY_WINDOW_MS) {
      throw new BrowserArtifactSaveError(
        'The PDF artifact download URL has expired or is too close to expiry.'
      )
    }
  }

  try {
    if (metadata.download_url.includes('\\')) {
      throw new BrowserArtifactSaveError(
        'The PDF artifact download URL contains an ambiguous path separator.'
      )
    }
    /** @brief 后端返回的下载 URL / Download URL returned by the backend. */
    const actualContentUrl = new URL(metadata.download_url)
    if (
      (actualContentUrl.protocol !== 'https:' && actualContentUrl.protocol !== 'http:') ||
      actualContentUrl.username.length > 0 ||
      actualContentUrl.password.length > 0 ||
      actualContentUrl.origin !== expectedContentUrl.origin ||
      actualContentUrl.pathname !== expectedContentUrl.pathname ||
      actualContentUrl.hash.length > 0
    ) {
      throw new BrowserArtifactSaveError(
        'The PDF artifact download URL is outside the confirmed API boundary.'
      )
    }
    return actualContentUrl
  } catch (error: unknown) {
    if (error instanceof BrowserArtifactSaveError) throw error
    throw new BrowserArtifactSaveError('The PDF artifact download URL is invalid.')
  }
}

/**
 * @brief 获取并严格解码当前产物元数据 / Fetch and strictly decode current artifact metadata.
 * @param metadataUrl 当前 artifact 的元数据 URL / Metadata URL for the current artifact.
 * @param fetchImpl 可替换的 fetch 实现 / Replaceable fetch implementation.
 * @param signal 统一保存截止信号 / Shared save-deadline signal.
 * @return 严格解码后的元数据 / Strictly decoded metadata.
 */
async function fetchArtifactMetadata(
  metadataUrl: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<RenderArtifactMetadata> {
  /** @brief 当前保存动作重新读取的权威元数据响应 / Authoritative metadata response refreshed for this save action. */
  const response = await fetchImpl(metadataUrl.href, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: JSON_MEDIA_TYPE },
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
  if (getMediaTypeEssence(response.headers.get('Content-Type')) !== JSON_MEDIA_TYPE) {
    throw new BrowserArtifactSaveError('The artifact metadata response is not JSON.')
  }

  try {
    /** @brief 尚未通过平台 decoder 的外部 JSON / External JSON not yet validated by the platform decoder. */
    const value: unknown = await response.json()
    return parseRenderArtifactMetadata(value)
  } catch (error: unknown) {
    if (error instanceof BrowserArtifactSaveError) throw error
    throw new BrowserArtifactSaveError('The artifact metadata response violates the contract.')
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
    headers: { Accept: PDF_MEDIA_TYPE },
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
  if (getMediaTypeEssence(response.headers.get('Content-Type')) !== PDF_MEDIA_TYPE) {
    throw new BrowserArtifactSaveError('The artifact content response is not a PDF.')
  }
  /** @brief 浏览器解码前声明的内容编码 / Content encoding declared before browser decoding. */
  const contentEncoding = response.headers.get('Content-Encoding')?.trim().toLowerCase()
  if (contentEncoding !== undefined && contentEncoding !== 'identity') {
    throw new BrowserArtifactSaveError('Encoded PDF responses are not supported.')
  }
  /** @brief 可选的响应长度声明 / Optional response length declaration. */
  const contentLength = parseContentLength(response.headers.get('Content-Length'))
  if (contentLength !== null && contentLength !== metadata.size_bytes) {
    throw new BrowserArtifactSaveError('The PDF Content-Length does not match its metadata.')
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
  const apiOrigin = parseApiOrigin(apiBaseUrl)
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
    if (typeof request.artifactId !== 'string' || !OPAQUE_ID_PATTERN.test(request.artifactId)) {
      throw new BrowserArtifactSaveError('The artifact ID is invalid.')
    }
    if (typeof request.suggestedFileName !== 'string') {
      throw new BrowserArtifactSaveError('The suggested PDF filename is invalid.')
    }
    /** @brief Web 边界重新净化的建议文件名 / Suggested filename sanitized again at the Web boundary. */
    const safeSuggestedFileName = sanitizePdfFileName(request.suggestedFileName)
    if (safeSuggestedFileName !== request.suggestedFileName) {
      throw new BrowserArtifactSaveError('The suggested PDF filename is not canonical and safe.')
    }

    /** @brief 编码后仍保持单一 path segment 的 artifact ID / Artifact ID encoded as one path segment. */
    const encodedArtifactId = encodeURIComponent(request.artifactId)
    /** @brief 权威元数据端点 / Authoritative metadata endpoint. */
    const metadataUrl = new URL(`/api/v1/render-artifacts/${encodedArtifactId}`, apiOrigin)
    /** @brief 当前 artifact 唯一允许的内容端点 / Sole allowed content endpoint for the current artifact. */
    const contentUrl = new URL(`${metadataUrl.pathname}/content`, apiOrigin)
    /** @brief 统一取消 metadata、内容流与校验的控制器 / Controller cancelling metadata, content streaming, and verification together. */
    const abortController = new AbortController()
    /** @brief Web 保存操作的总时限计时器 / Total-deadline timer for the Web save operation. */
    const timeout = globalThis.setTimeout((): void => {
      abortController.abort(new Error('PDF artifact downloading timed out.'))
    }, BROWSER_ARTIFACT_SAVE_TIMEOUT_MS)
    try {
      /** @brief 当前保存动作重新取得的权威元数据 / Authoritative metadata refreshed for this save action. */
      const metadata = await fetchArtifactMetadata(
        metadataUrl,
        dependencies.fetchImpl,
        abortController.signal
      )
      /** @brief 保留经安全边界验证的同源签名 query 的内容 URL / Content URL preserving a same-origin signature query after boundary validation. */
      const validatedContentUrl = validatePdfMetadata(
        metadata,
        request,
        contentUrl,
        dependencies.now()
      )
      /** @brief 已通过大小与摘要核对的 PDF 字节 / PDF bytes verified by size and digest. */
      const bytes = await fetchVerifiedPdf(
        validatedContentUrl,
        metadata,
        dependencies.fetchImpl,
        abortController.signal
      )
      /** @brief 只包含已校验 PDF 的 Blob / Blob containing only the verified PDF. */
      const blob = new Blob([bytes.buffer], { type: PDF_MEDIA_TYPE })
      /** @brief 仅为本次用户动作创建的下载元素 / Download element created only for this user action. */
      const anchor = dependencies.createAnchor()
      /** @brief 同源临时下载 URL / Same-origin temporary download URL. */
      const blobUrl = dependencies.createObjectURL(blob)

      try {
        anchor.href = blobUrl
        anchor.download = safeSuggestedFileName
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
