/** @file Electron PDF 保存策略（无 Electron 注册副作用） / Electron PDF-save policy without Electron registration side effects. */

import { sanitizePdfFileName } from '@ai-job-workspace/platform'
import type { SaveArtifactResult } from '@ai-job-workspace/platform'

import { MAX_PDF_BYTES } from './artifact-file-store'
import type { PdfResponseBody } from './artifact-file-store'

/** @brief PDF 产物内容路由的精确路径形状 / Exact pathname shape of a PDF artifact-content route. */
const PRODUCT_ARTIFACT_PATH = /^\/api\/v1\/render-artifacts\/[^/]+\/content$/u

/** @brief 会改变服务端路径分段语义的编码 / Encodings that can alter server-side path segmentation. */
const AMBIGUOUS_PATH_ENCODING = /%(?:25|2e|2f|5c)/iu

/** @brief 最大重定向次数 / Maximum redirect count. */
const MAX_REDIRECTS = 5

/** @brief 一次 PDF 网络下载与文件写入的总时限 / Total deadline for one PDF download and file write. */
export const ARTIFACT_SAVE_TIMEOUT_MS = 60_000

/** @brief 保存对话框的最小结果 / Minimal save-dialog result. */
export interface ArtifactSaveDialogResult {
  /** @brief 用户是否取消 / Whether the user cancelled. */
  readonly canceled: boolean
  /** @brief 用户选择的目标路径 / Destination path selected by the user. */
  readonly filePath?: string
}

/** @brief PDF 下载响应的最小形状 / Minimal PDF-download response shape. */
export interface ArtifactFetchResponse {
  /** @brief HTTP 状态码 / HTTP status code. */
  readonly status: number
  /** @brief 响应头 / Response headers. */
  readonly headers: Pick<Headers, 'get'>
  /** @brief 可选响应体 / Optional response body. */
  readonly body:
    (PdfResponseBody & { readonly cancel?: (reason?: unknown) => Promise<void> }) | null
}

/** @brief PDF 保存服务依赖 / PDF-save service dependencies. */
export interface ArtifactSaveServiceDependencies {
  /**
   * @brief 使用 renderer 所属 session 获取产物 / Fetch the artifact with the renderer's session.
   * @param url 已验证的产品 API URL / Validated product API URL.
   * @param init 禁止自动重定向的请求配置 / Request configuration disabling automatic redirects.
   * @return HTTP 响应 / HTTP response.
   */
  readonly fetch: (
    url: string,
    init: {
      readonly credentials: 'include'
      readonly redirect: 'manual'
      readonly signal: AbortSignal
    }
  ) => Promise<ArtifactFetchResponse>
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
   * @param maximumBytes 最大实际字节数 / Maximum actual byte count.
   * @param signal 统一下载截止信号 / Shared download-deadline signal.
   * @return 写入完成 Promise / Promise fulfilled after writing.
   */
  readonly writePdf: (
    destination: string,
    body: PdfResponseBody,
    maximumBytes: number,
    signal: AbortSignal
  ) => Promise<void>
}

/** @brief 已验证的内部保存请求 / Validated internal save request. */
interface ValidatedArtifactSaveRequest {
  /** @brief 已验证的内容 URL / Validated content URL. */
  readonly contentUrl: URL
  /** @brief 已净化的 PDF 文件名 / Sanitized PDF filename. */
  readonly suggestedFileName: string
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
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @return 已验证且净化的内部请求 / Validated and sanitized internal request.
 * @throws 载荷形状或 URL 越界时抛出 / Throws when the payload shape or URL crosses the boundary.
 */
export function validateArtifactSaveRequest(
  value: unknown,
  apiOrigin: string
): ValidatedArtifactSaveRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Artifact-save payload must be an object.')
  }

  /** @brief 仅供边界读取的未知字段映射 / Unknown field map used only at the boundary. */
  const payload = value as Record<string, unknown>
  /** @brief IPC 载荷公开的字段集合 / Field set exposed by the IPC payload. */
  const keys = Object.keys(payload).sort()
  if (keys.length !== 2 || keys[0] !== 'contentUrl' || keys[1] !== 'suggestedFileName') {
    throw new Error('Artifact-save payload contains unsupported fields.')
  }
  if (typeof payload.contentUrl !== 'string' || typeof payload.suggestedFileName !== 'string') {
    throw new Error('Artifact-save payload fields must be strings.')
  }

  /** @brief 在主进程重新净化的建议文件名 / Suggested filename sanitized again in the main process. */
  const safeSuggestedFileName = sanitizePdfFileName(payload.suggestedFileName)
  if (safeSuggestedFileName !== payload.suggestedFileName) {
    throw new Error('Artifact-save suggested filename is not canonical and safe.')
  }

  return {
    contentUrl: validateProductArtifactUrl(payload.contentUrl, apiOrigin),
    suggestedFileName: safeSuggestedFileName
  }
}

/**
 * @brief 验证产物 URL 仍位于产品 API 边界 / Verify that an artifact URL remains inside the product API boundary.
 * @param candidate 待验证 URL / Candidate URL.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @return 规范化 URL / Normalized URL.
 * @throws URL 非 HTTP(S)、跨 origin 或路径越界时抛出 / Throws for non-HTTP(S), cross-origin, or out-of-prefix URLs.
 */
export function validateProductArtifactUrl(candidate: string, apiOrigin: string): URL {
  if (candidate.includes('\\')) {
    throw new Error('Artifact URL must not contain ambiguous path separators.')
  }

  /** @brief 主进程配置的权威 origin / Authoritative origin configured by the main process. */
  const expectedOrigin = new URL(apiOrigin).origin
  /** @brief 待验证的绝对 URL / Absolute URL under validation. */
  const url = new URL(candidate)

  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
    throw new Error('Artifact URL must be an HTTP(S) URL without credentials.')
  }
  if (url.origin !== expectedOrigin) {
    throw new Error('Artifact URL must use the configured product API origin.')
  }
  if (
    !PRODUCT_ARTIFACT_PATH.test(url.pathname) ||
    AMBIGUOUS_PATH_ENCODING.test(url.pathname) ||
    url.hash !== ''
  ) {
    throw new Error(
      'Artifact URL must use an unambiguous /api/v1/render-artifacts/{artifact_id}/content route.'
    )
  }
  return url
}

/**
 * @brief 在逐跳验证下获取 PDF 响应 / Fetch a PDF response while validating every redirect hop.
 * @param initialUrl 初始已验证 URL / Initial validated URL.
 * @param apiOrigin 权威产品 API origin / Authoritative product API origin.
 * @param fetch 使用 renderer session 的 fetch / Fetch backed by the renderer session.
 * @param signal 统一下载截止信号 / Shared download-deadline signal.
 * @return 已验证最终 URL 的响应 / Response reached through validated URLs.
 */
async function fetchWithValidatedRedirects(
  initialUrl: URL,
  apiOrigin: string,
  fetch: ArtifactSaveServiceDependencies['fetch'],
  signal: AbortSignal
): Promise<ArtifactFetchResponse> {
  /** @brief 当前请求 URL / Current request URL. */
  let currentUrl = initialUrl

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    /** @brief 当前跳返回的响应 / Response returned by the current hop. */
    signal.throwIfAborted()
    const response = await fetch(currentUrl.href, {
      credentials: 'include',
      redirect: 'manual',
      signal
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    void response.body?.cancel?.('Following a validated redirect.').catch((): void => undefined)
    if (redirectCount === MAX_REDIRECTS)
      throw new Error('Artifact download redirected too many times.')

    /** @brief 当前重定向目标 / Redirect target for the current hop. */
    const location = response.headers.get('location')
    if (location === null) throw new Error('Artifact redirect is missing a Location header.')
    currentUrl = validateProductArtifactUrl(new URL(location, currentUrl).href, apiOrigin)
  }

  throw new Error('Artifact download redirected too many times.')
}

/**
 * @brief 保存一个经过边界验证的 PDF 产物 / Save one PDF artifact after boundary validation.
 * @param payload 不可信 IPC 载荷 / Untrusted IPC payload.
 * @param apiOrigin 主进程已验证的产品 API origin / Product API origin validated by the main process.
 * @param dependencies 原生对话框、session fetch 与安全文件写入 / Native dialog, session fetch, and safe file-write dependencies.
 * @param timeoutMilliseconds 对话框确认后的下载与写入总时限 / Total download-and-write deadline after dialog confirmation.
 * @return 保存或取消结果 / Saved-or-cancelled result.
 */
export async function savePdfArtifact(
  payload: unknown,
  apiOrigin: string,
  dependencies: ArtifactSaveServiceDependencies,
  timeoutMilliseconds: number = ARTIFACT_SAVE_TIMEOUT_MS
): Promise<SaveArtifactResult> {
  /** @brief 经过 IPC 边界验证的请求 / Request validated at the IPC boundary. */
  const request = validateArtifactSaveRequest(payload, apiOrigin)
  /** @brief 原生对话框选择结果 / Native save-dialog result. */
  const selection = await dependencies.showSaveDialog(request.suggestedFileName)

  if (selection.canceled) return { status: 'cancelled' }
  if (selection.filePath === undefined || selection.filePath.length === 0) {
    throw new Error('Save dialog returned no destination path.')
  }

  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new Error('Artifact-save timeout must be a positive finite duration.')
  }

  /** @brief 统一中止网络与流写入的控制器 / Controller that aborts networking and stream writing together. */
  const abortController = new AbortController()
  /** @brief 当前下载与写入的总时限计时器 / Total-deadline timer for the current download and write. */
  const timeout = setTimeout((): void => {
    abortController.abort(new Error('PDF artifact saving timed out.'))
  }, timeoutMilliseconds)

  try {
    /** @brief 经逐跳校验后的最终 HTTP 响应 / Final HTTP response after per-hop validation. */
    const response = await fetchWithValidatedRedirects(
      request.contentUrl,
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
      void response.body?.cancel?.(message).catch((): void => undefined)
      throw new Error(message)
    }

    if (response.status !== 200) {
      return rejectResponse(`Artifact download returned HTTP ${response.status}.`)
    }

    /** @brief 去除参数并统一大小写的媒体类型 / Lowercase media type without parameters. */
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/pdf') {
      return rejectResponse('Artifact response is not application/pdf.')
    }

    /** @brief 服务端声明的可选内容长度 / Optional content length declared by the server. */
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null) {
      if (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_PDF_BYTES) {
        return rejectResponse('PDF artifact exceeds the 25 MiB size limit.')
      }
    }
    if (response.body === null) throw new Error('PDF artifact response has no body.')

    await dependencies.writePdf(
      selection.filePath,
      response.body,
      MAX_PDF_BYTES,
      abortController.signal
    )
    return { status: 'saved' }
  } finally {
    clearTimeout(timeout)
  }
}
