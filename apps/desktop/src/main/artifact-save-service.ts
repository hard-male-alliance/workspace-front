/** @file Electron PDF 保存策略（无 Electron 注册副作用） / Electron PDF-save policy without Electron registration side effects. */

import {
  MAX_PDF_ARTIFACT_BYTES,
  parseRfc3339TimestampMilliseconds,
  parseRenderArtifactMetadata,
  sanitizePdfFileName
} from '@ai-job-workspace/platform'
import type { RenderArtifactMetadata, SaveArtifactResult } from '@ai-job-workspace/platform'

import type {
  PdfArtifactIntegrityExpectation,
  PdfArtifactWriteResult,
  PdfResponseBody
} from './artifact-file-store'

/** @brief 冻结契约的不透明 ID 格式 / Opaque-ID format from the frozen contract. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u

/** @brief 最大内容重定向次数 / Maximum content-redirect count. */
const MAX_REDIRECTS = 5

/** @brief Chromium Fetch 可解码且本地策略明确允许的压缩内容编码 / Compressed content codings explicitly allowed for Chromium Fetch decoding. */
const SUPPORTED_COMPRESSED_CONTENT_ENCODINGS = new Set(['br', 'deflate', 'gzip', 'zstd'])

/** @brief 过期前拒绝启动下载的保守安全窗口 / Conservative safety window before expiry in which a download is rejected. */
export const ARTIFACT_EXPIRY_SAFETY_WINDOW_MS = 30_000

/** @brief 一次 PDF 元数据刷新、网络下载与文件写入的总时限 / Total deadline for PDF metadata refresh, download, and file write. */
export const ARTIFACT_SAVE_TIMEOUT_MS = 60_000

/** @brief 保存对话框的最小结果 / Minimal save-dialog result. */
export interface ArtifactSaveDialogResult {
  /** @brief 用户是否取消 / Whether the user cancelled. */
  readonly canceled: boolean
  /** @brief 用户选择的目标路径 / Destination path selected by the user. */
  readonly filePath?: string
}

/** @brief 产物 HTTP 响应的最小形状 / Minimal artifact HTTP-response shape. */
export interface ArtifactFetchResponse {
  /** @brief HTTP 状态码 / HTTP status code. */
  readonly status: number
  /** @brief 响应头 / Response headers. */
  readonly headers: Pick<Headers, 'get'>
  /** @brief 可选响应体 / Optional response body. */
  readonly body:
    (PdfResponseBody & { readonly cancel?: (reason?: unknown) => Promise<void> }) | null
  /**
   * @brief 读取未知 JSON 元数据 / Read unknown JSON metadata.
   * @return 未经信任的 JSON 值 / Untrusted JSON value.
   */
  readonly json: () => Promise<unknown>
}

/** @brief 产物 HTTP 请求的最小配置 / Minimal artifact HTTP-request configuration. */
export interface ArtifactFetchInit {
  /** @brief 只允许 GET / Only GET is allowed. */
  readonly method: 'GET'
  /** @brief 绕过 HTTP cache 以取得当前权威状态 / Bypass the HTTP cache to obtain current authoritative state. */
  readonly cache: 'no-store'
  /** @brief 不让 Cookie 冒充契约要求的 Bearer 身份 / Prevent cookies from impersonating the contract-required Bearer identity. */
  readonly credentials: 'omit'
  /** @brief 禁止自动重定向 / Disable automatic redirects. */
  readonly redirect: 'manual'
  /** @brief 请求截止信号 / Request deadline signal. */
  readonly signal: AbortSignal
  /** @brief 最小内容协商头 / Minimal content-negotiation headers. */
  readonly headers: Readonly<Record<string, string>>
}

/** @brief PDF 保存服务依赖 / PDF-save service dependencies. */
export interface ArtifactSaveServiceDependencies {
  /**
   * @brief 使用 renderer 所属 session 获取元数据或内容 / Fetch metadata or content with the renderer's session.
   * @param url 主进程构造或验证的产品 API URL / Product API URL constructed or validated by the main process.
   * @param init 禁止自动重定向的只读请求配置 / Read-only request configuration disabling automatic redirects.
   * @return HTTP 响应 / HTTP response.
   */
  readonly fetch: (url: string, init: ArtifactFetchInit) => Promise<ArtifactFetchResponse>
  /**
   * @brief 显示原生保存对话框 / Show the native save dialog.
   * @param suggestedFileName 已净化的建议文件名 / Sanitized suggested filename.
   * @return 用户选择或取消结果 / User selection or cancellation result.
   */
  readonly showSaveDialog: (suggestedFileName: string) => Promise<ArtifactSaveDialogResult>
  /**
   * @brief 以同目录临时文件安全写入 PDF / Safely write a PDF through a same-directory temporary file.
   * @param destination 最终目标路径 / Final destination path.
   * @param body 已验证响应体 / Validated response body.
   * @param expectation 权威完整性声明与本地上限 / Authoritative integrity declaration and local limit.
   * @return 落盘前验证的实际字节数与摘要 / Actual byte count and digest verified before persistence.
   */
  readonly writePdf: (
    destination: string,
    body: PdfResponseBody,
    expectation: PdfArtifactIntegrityExpectation
  ) => Promise<PdfArtifactWriteResult>
  /**
   * @brief 可替换时钟 / Replaceable clock.
   * @return Unix epoch 毫秒 / Unix epoch milliseconds.
   */
  readonly now?: () => number
}

/** @brief 已验证的内部保存请求 / Validated internal save request. */
interface ValidatedArtifactSaveRequest {
  /** @brief 冻结格式的产物 ID / Artifact ID in the frozen format. */
  readonly artifactId: string
  /** @brief 已净化的 PDF 文件名 / Sanitized PDF filename. */
  readonly suggestedFileName: string
}

/** @brief 已验证的 PDF 元数据与内容 URL / Validated PDF metadata and content URL. */
interface ValidatedPdfMetadata {
  /** @brief 权威产物元数据 / Authoritative artifact metadata. */
  readonly metadata: RenderArtifactMetadata
  /** @brief 同源且绑定同一产物 ID 的内容 URL / Same-origin content URL bound to the same artifact ID. */
  readonly contentUrl: URL
}

/**
 * @brief 阻止主进程文件路径或网络细节经 IPC 泄露 / Prevent main-process file paths or network details from leaking over IPC.
 * @param operation 实际产物保存操作 / Actual artifact-save operation.
 * @return 保存或取消结果 / Saved-or-cancelled result.
 * @throws 仅抛出不含敏感细节的稳定错误 / Throws only a stable error without sensitive details.
 */
export async function maskArtifactSaveFailure(
  operation: () => Promise<SaveArtifactResult>
): Promise<SaveArtifactResult> {
  try {
    return await operation()
  } catch {
    throw new Error('The PDF artifact could not be saved safely.')
  }
}

/**
 * @brief 校验不可信 IPC 保存载荷 / Validate an untrusted IPC save payload.
 * @param value renderer 提供的未知值 / Unknown value supplied by the renderer.
 * @return 已验证且净化的内部请求 / Validated and sanitized internal request.
 * @throws 载荷形状、ID 或文件名越界时抛出 / Throws when the payload shape, ID, or filename crosses the boundary.
 */
export function validateArtifactSaveRequest(value: unknown): ValidatedArtifactSaveRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Artifact-save payload must be an object.')
  }

  /** @brief 仅供边界读取的未知字段映射 / Unknown field map used only at the boundary. */
  const payload = value as Record<string, unknown>
  /** @brief IPC 载荷公开的字段集合 / Field set exposed by the IPC payload. */
  const keys = Object.keys(payload).sort()
  if (keys.length !== 2 || keys[0] !== 'artifactId' || keys[1] !== 'suggestedFileName') {
    throw new Error('Artifact-save payload contains unsupported fields.')
  }
  if (typeof payload.artifactId !== 'string' || typeof payload.suggestedFileName !== 'string') {
    throw new Error('Artifact-save payload string fields are invalid.')
  }
  if (!OPAQUE_ID_PATTERN.test(payload.artifactId)) {
    throw new Error('Artifact-save artifact ID must match the frozen opaque-ID format.')
  }

  /** @brief 在主进程重新净化的建议文件名 / Suggested filename sanitized again in the main process. */
  const safeSuggestedFileName = sanitizePdfFileName(payload.suggestedFileName)
  if (safeSuggestedFileName !== payload.suggestedFileName) {
    throw new Error('Artifact-save suggested filename is not canonical and safe.')
  }

  return {
    artifactId: payload.artifactId,
    suggestedFileName: safeSuggestedFileName
  }
}

/**
 * @brief 返回不含参数且规范化大小写的媒体类型 essence / Return a parameter-free, lowercase media-type essence.
 * @param value 原始 Content-Type 值 / Raw Content-Type value.
 * @return MIME essence；缺失时为 undefined / MIME essence, or undefined when absent.
 */
function mediaTypeEssence(value: string | null): string | undefined {
  return value?.split(';', 1)[0]?.trim().toLowerCase()
}

/** @brief 内容编码对 Content-Length 语义的分类 / Content-encoding classification for Content-Length semantics. */
type ContentEncodingKind = 'identity' | 'compressed' | 'invalid'

/**
 * @brief 分类经 Fetch 解码的内容编码 / Classify a content encoding decoded by Fetch.
 * @param value 原始 Content-Encoding 值 / Raw Content-Encoding value.
 * @return identity、明确支持的压缩编码或 invalid / Identity, explicitly supported compression, or invalid.
 */
function classifyContentEncoding(value: string | null): ContentEncodingKind {
  if (value === null) return 'identity'
  /** @brief 依应用顺序声明的编码 token / Encoding tokens in application order. */
  const codings = value.split(',').map((coding): string => coding.trim().toLowerCase())
  if (codings.some((coding) => coding.length === 0)) return 'invalid'
  if (codings.length === 1 && codings[0] === 'identity') return 'identity'
  if (codings.includes('identity')) return 'invalid'
  return codings.every((coding) => SUPPORTED_COMPRESSED_CONTENT_ENCODINGS.has(coding))
    ? 'compressed'
    : 'invalid'
}

/**
 * @brief 构造权威产物元数据 URL / Construct the authoritative artifact-metadata URL.
 * @param artifactId 已验证产物 ID / Validated artifact ID.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @return 不含 renderer 可控 URL 成分的元数据 URL / Metadata URL without renderer-controlled URL components.
 */
function createArtifactMetadataUrl(artifactId: string, apiOrigin: string): URL {
  /** @brief 规范化 API origin / Normalized API origin. */
  const origin = new URL(apiOrigin).origin
  return new URL(`/api/v1/render-artifacts/${encodeURIComponent(artifactId)}`, origin)
}

/**
 * @brief 验证产物内容 URL 位于产品 API 且仍绑定同一 ID / Verify an artifact-content URL remains in the product API and bound to the same ID.
 * @param candidate 待验证 URL / Candidate URL.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @param artifactId 当前保存操作的产物 ID / Artifact ID of the current save operation.
 * @return 规范化 URL / Normalized URL.
 * @throws URL 非 HTTP(S)、跨 origin、资源 ID 变化或路径越界时抛出 / Throws for non-HTTP(S), cross-origin, identity-changing, or out-of-prefix URLs.
 */
export function validateProductArtifactUrl(
  candidate: string,
  apiOrigin: string,
  artifactId: string
): URL {
  if (candidate.includes('\\')) {
    throw new Error('Artifact URL must not contain ambiguous path separators.')
  }

  /** @brief 主进程配置的权威 origin / Authoritative origin configured by the main process. */
  const expectedOrigin = new URL(apiOrigin).origin
  /** @brief 待验证的绝对 URL / Absolute URL under validation. */
  const url = new URL(candidate)
  /** @brief 当前 artifact 唯一允许的路径 / Only allowed path for the current artifact. */
  const expectedPath = `/api/v1/render-artifacts/${encodeURIComponent(artifactId)}/content`

  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
    throw new Error('Artifact URL must be an HTTP(S) URL without credentials.')
  }
  if (url.origin !== expectedOrigin) {
    throw new Error('Artifact URL must use the configured product API origin.')
  }
  if (url.pathname !== expectedPath || url.hash !== '') {
    throw new Error('Artifact URL must identify the expected artifact content resource.')
  }
  return url
}

/**
 * @brief 取消不再消费的响应体 / Cancel a response body that will not be consumed.
 * @param response 待取消响应 / Response to cancel.
 * @param reason 不含敏感信息的原因 / Reason without sensitive information.
 * @return 无返回值 / No return value.
 */
function cancelResponseBody(response: ArtifactFetchResponse, reason: string): void {
  void response.body?.cancel?.(reason).catch((): void => undefined)
}

/**
 * @brief 在保存对话框后重新读取并验证权威 PDF 元数据 / Refresh and validate authoritative PDF metadata after the save dialog.
 * @param artifactId 已验证产物 ID / Validated artifact ID.
 * @param apiOrigin 权威产品 API origin / Authoritative product API origin.
 * @param dependencies 网络与时钟依赖 / Network and clock dependencies.
 * @param signal 统一保存截止信号 / Shared save-deadline signal.
 * @return 经 PDF 策略验证的权威元数据 / Authoritative metadata validated by PDF policy.
 */
async function fetchPdfMetadata(
  artifactId: string,
  apiOrigin: string,
  dependencies: ArtifactSaveServiceDependencies,
  signal: AbortSignal
): Promise<ValidatedPdfMetadata> {
  /** @brief 主进程自行构造的元数据 URL / Metadata URL constructed by the main process itself. */
  const metadataUrl = createArtifactMetadataUrl(artifactId, apiOrigin)
  /** @brief 元数据 HTTP 响应 / Metadata HTTP response. */
  const response = await dependencies.fetch(metadataUrl.href, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    method: 'GET',
    redirect: 'manual',
    signal
  })
  if (response.status !== 200) {
    cancelResponseBody(response, 'Artifact metadata response has an unexpected status.')
    throw new Error(`Artifact metadata returned HTTP ${response.status}.`)
  }
  if (mediaTypeEssence(response.headers.get('content-type')) !== 'application/json') {
    cancelResponseBody(response, 'Artifact metadata response has an unexpected content type.')
    throw new Error('Artifact metadata response is not application/json.')
  }

  /** @brief 未经信任的元数据 JSON / Untrusted metadata JSON. */
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error('Artifact metadata response is not valid JSON.')
  }
  /** @brief 冻结 Schema 解码后的元数据 / Metadata decoded by the frozen schema. */
  const metadata = parseRenderArtifactMetadata(value)
  if (metadata.id !== artifactId) {
    throw new Error('Artifact metadata identifies a different artifact.')
  }
  if (metadata.format !== 'pdf') {
    throw new Error('Artifact metadata does not describe a PDF.')
  }
  if (mediaTypeEssence(metadata.content_type) !== 'application/pdf') {
    throw new Error('PDF artifact metadata must declare application/pdf.')
  }
  if (metadata.size_bytes > MAX_PDF_ARTIFACT_BYTES) {
    throw new Error('PDF artifact exceeds the 25 MiB size limit.')
  }
  if (metadata.expires_at !== undefined && metadata.expires_at !== null) {
    /** @brief 下载必须晚于的最小过期时间 / Minimum expiry instant required before downloading. */
    const requiredExpiry = (dependencies.now ?? Date.now)() + ARTIFACT_EXPIRY_SAFETY_WINDOW_MS
    /** @brief 包括 RFC 3339 闰秒语义的过期时刻 / Expiry instant including RFC 3339 leap-second semantics. */
    const expiresAt = parseRfc3339TimestampMilliseconds(metadata.expires_at)
    if (expiresAt === null || expiresAt <= requiredExpiry) {
      throw new Error('Artifact download URL is expired or too close to expiry.')
    }
  }

  return {
    contentUrl: validateProductArtifactUrl(metadata.download_url, apiOrigin, artifactId),
    metadata
  }
}

/**
 * @brief 在逐跳身份验证下获取 PDF 响应 / Fetch a PDF response while validating artifact identity at every redirect hop.
 * @param initialUrl 初始已验证 URL / Initial validated URL.
 * @param artifactId 当前保存操作的产物 ID / Artifact ID of the current save operation.
 * @param apiOrigin 权威产品 API origin / Authoritative product API origin.
 * @param fetch 使用 renderer session 的 fetch / Fetch backed by the renderer session.
 * @param signal 统一下载截止信号 / Shared download-deadline signal.
 * @return 已验证最终 URL 的响应 / Response reached through validated URLs.
 */
async function fetchWithValidatedRedirects(
  initialUrl: URL,
  artifactId: string,
  apiOrigin: string,
  fetch: ArtifactSaveServiceDependencies['fetch'],
  signal: AbortSignal
): Promise<ArtifactFetchResponse> {
  /** @brief 当前请求 URL / Current request URL. */
  let currentUrl = initialUrl

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    signal.throwIfAborted()
    /** @brief 当前跳返回的响应 / Response returned by the current hop. */
    const response = await fetch(currentUrl.href, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/pdf' },
      method: 'GET',
      redirect: 'manual',
      signal
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    cancelResponseBody(response, 'Following a validated artifact redirect.')
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error('Artifact download redirected too many times.')
    }

    /** @brief 当前重定向目标 / Redirect target for the current hop. */
    const location = response.headers.get('location')
    if (location === null) throw new Error('Artifact redirect is missing a Location header.')
    currentUrl = validateProductArtifactUrl(
      new URL(location, currentUrl).href,
      apiOrigin,
      artifactId
    )
  }

  throw new Error('Artifact download redirected too many times.')
}

/**
 * @brief 保存一个由主进程重新解析权威元数据的 PDF 产物 / Save a PDF artifact whose authoritative metadata is refreshed by the main process.
 * @param payload 不可信 IPC 载荷 / Untrusted IPC payload.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @param dependencies 原生对话框、session fetch 与安全文件写入 / Native dialog, session fetch, and safe file-write dependencies.
 * @param timeoutMilliseconds 对话框确认后的元数据、下载与写入总时限 / Total metadata, download, and write deadline after dialog confirmation.
 * @return 保存或取消结果 / Saved-or-cancelled result.
 */
export async function savePdfArtifact(
  payload: unknown,
  apiOrigin: string,
  dependencies: ArtifactSaveServiceDependencies,
  timeoutMilliseconds: number = ARTIFACT_SAVE_TIMEOUT_MS
): Promise<SaveArtifactResult> {
  /** @brief 经过 IPC 边界验证的请求 / Request validated at the IPC boundary. */
  const request = validateArtifactSaveRequest(payload)
  /** @brief 原生对话框选择结果 / Native save-dialog result. */
  const selection = await dependencies.showSaveDialog(request.suggestedFileName)

  if (selection.canceled) return { status: 'cancelled' }
  if (selection.filePath === undefined || selection.filePath.length === 0) {
    throw new Error('Save dialog returned no destination path.')
  }
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new Error('Artifact-save timeout must be a positive finite duration.')
  }

  /** @brief 统一中止元数据、下载与流写入的控制器 / Controller aborting metadata, download, and stream writing together. */
  const abortController = new AbortController()
  /** @brief 当前保存操作的总时限计时器 / Total-deadline timer for the current save operation. */
  const timeout = setTimeout((): void => {
    abortController.abort(new Error('PDF artifact saving timed out.'))
  }, timeoutMilliseconds)

  try {
    /** @brief 对话框关闭后重新取得的权威 PDF 元数据 / Authoritative PDF metadata refreshed after the dialog closes. */
    const artifact = await fetchPdfMetadata(
      request.artifactId,
      apiOrigin,
      dependencies,
      abortController.signal
    )
    /** @brief 经逐跳身份校验后的最终内容响应 / Final content response after per-hop identity validation. */
    const response = await fetchWithValidatedRedirects(
      artifact.contentUrl,
      request.artifactId,
      apiOrigin,
      dependencies.fetch,
      abortController.signal
    )

    /**
     * @brief 取消未被消费的不安全响应并抛出安全错误 / Cancel an unconsumed unsafe response and throw a safe error.
     * @param message 不包含 URL 或文件路径的错误消息 / Error message containing no URL or file path.
     * @return 永不兑现 / Never returns normally.
     */
    function rejectResponse(message: string): never {
      cancelResponseBody(response, message)
      throw new Error(message)
    }

    if (response.status !== 200) {
      return rejectResponse(`Artifact download returned HTTP ${response.status}.`)
    }
    if (mediaTypeEssence(response.headers.get('content-type')) !== 'application/pdf') {
      return rejectResponse('Artifact response is not application/pdf.')
    }

    /** @brief 响应内容编码的安全分类 / Safe classification of the response content encoding. */
    const contentEncoding = classifyContentEncoding(response.headers.get('content-encoding'))
    if (contentEncoding === 'invalid') {
      return rejectResponse('Artifact response Content-Encoding is unsupported or invalid.')
    }
    if (contentEncoding === 'identity') {
      /** @brief identity 表示下服务端声明的可选内容长度 / Optional content length declared for the identity representation. */
      const contentLength = response.headers.get('content-length')
      if (contentLength !== null) {
        if (!/^\d+$/u.test(contentLength)) {
          return rejectResponse('Artifact response Content-Length is invalid.')
        }
        /** @brief 经过十进制形状校验的响应长度 / Response length after decimal-shape validation. */
        const declaredResponseSize = Number(contentLength)
        if (
          !Number.isSafeInteger(declaredResponseSize) ||
          declaredResponseSize > MAX_PDF_ARTIFACT_BYTES
        ) {
          return rejectResponse('PDF artifact exceeds the 25 MiB size limit.')
        }
        if (declaredResponseSize !== artifact.metadata.size_bytes) {
          return rejectResponse(
            'Artifact response Content-Length does not match its declared integrity metadata.'
          )
        }
      }
    }
    if (response.body === null) throw new Error('PDF artifact response has no body.')

    /** @brief 文件存储器返回的最终完整性观测 / Final integrity observation returned by the file store. */
    const written = await dependencies.writePdf(selection.filePath, response.body, {
      expectedSha256: artifact.metadata.sha256,
      expectedSizeBytes: artifact.metadata.size_bytes,
      maximumBytes: MAX_PDF_ARTIFACT_BYTES,
      signal: abortController.signal
    })
    if (
      written.sizeBytes !== artifact.metadata.size_bytes ||
      written.sha256 !== artifact.metadata.sha256
    ) {
      throw new Error('Persisted PDF integrity does not match the API declaration.')
    }
    return { status: 'saved' }
  } finally {
    clearTimeout(timeout)
  }
}
