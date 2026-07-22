/** @file Electron PDF 保存策略（无 Electron 注册副作用） / Electron PDF-save policy without Electron registration side effects. */

import {
  ARTIFACT_JSON_MEDIA_TYPE,
  ARTIFACT_PDF_MEDIA_TYPE,
  classifyFetchDecodedContentEncoding,
  createArtifactMetadataUrl,
  getMediaTypeEssence,
  MAX_PDF_ARTIFACT_BYTES,
  parseArtifactContentLength,
  parseArtifactSaveRequest,
  parsePdfArtifactMetadata
} from '@ai-job-workspace/platform'
import type { SaveArtifactResult, ValidatedPdfArtifactMetadata } from '@ai-job-workspace/platform'

import type {
  PdfArtifactIntegrityExpectation,
  PdfArtifactWriteResult,
  PdfResponseBody
} from './artifact-file-store'

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
  /** @brief 遇到任何重定向即失败 / Fail on every redirect. */
  readonly redirect: 'error'
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
   * @param init 遇到重定向即失败的只读请求配置 / Read-only request configuration that fails on redirects.
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
): Promise<ValidatedPdfArtifactMetadata> {
  /** @brief 主进程自行构造的元数据 URL / Metadata URL constructed by the main process itself. */
  const metadataUrl = createArtifactMetadataUrl(artifactId, apiOrigin)
  /** @brief 元数据 HTTP 响应 / Metadata HTTP response. */
  const response = await dependencies.fetch(metadataUrl.href, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: ARTIFACT_JSON_MEDIA_TYPE },
    method: 'GET',
    redirect: 'error',
    signal
  })
  if (response.status !== 200) {
    cancelResponseBody(response, 'Artifact metadata response has an unexpected status.')
    throw new Error(`Artifact metadata returned HTTP ${response.status}.`)
  }
  if (getMediaTypeEssence(response.headers.get('content-type')) !== ARTIFACT_JSON_MEDIA_TYPE) {
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
  return parsePdfArtifactMetadata(value, {
    apiOrigin,
    artifactId,
    nowMilliseconds: (dependencies.now ?? Date.now)()
  })
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
  const request = parseArtifactSaveRequest(payload)
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
    /** @brief 禁止重定向的 PDF 内容响应 / PDF-content response fetched with redirects forbidden. */
    const response = await dependencies.fetch(artifact.contentUrl.href, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: ARTIFACT_PDF_MEDIA_TYPE },
      method: 'GET',
      redirect: 'error',
      signal: abortController.signal
    })

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
    if (getMediaTypeEssence(response.headers.get('content-type')) !== ARTIFACT_PDF_MEDIA_TYPE) {
      return rejectResponse('Artifact response is not application/pdf.')
    }

    /** @brief 响应内容编码的安全分类 / Safe classification of the response content encoding. */
    const contentEncoding = classifyFetchDecodedContentEncoding(
      response.headers.get('content-encoding')
    )
    if (contentEncoding === 'invalid') {
      return rejectResponse('Artifact response Content-Encoding is unsupported or invalid.')
    }
    if (contentEncoding === 'identity') {
      /** @brief identity 表示下服务端声明的可选内容长度 / Optional content length declared for the identity representation. */
      const contentLength = parseArtifactContentLength(response.headers.get('content-length'))
      if (contentLength !== null) {
        if (contentLength > MAX_PDF_ARTIFACT_BYTES) {
          return rejectResponse('PDF artifact exceeds the 25 MiB size limit.')
        }
        if (contentLength !== artifact.metadata.size_bytes) {
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
