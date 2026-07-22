import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  ARTIFACT_EXPIRY_SAFETY_WINDOW_MS,
  MAX_PDF_ARTIFACT_BYTES,
  sanitizePdfFileName
} from '@ai-job-workspace/platform'

import {
  BROWSER_ARTIFACT_SAVE_TIMEOUT_MS,
  BrowserArtifactSaveError,
  createBrowserArtifactSavePort
} from './browser-artifact-save'
import type {
  BrowserArtifactSaveDependencies,
  BrowserDownloadAnchor
} from './browser-artifact-save'

/** @brief 测试 API origin / API origin used by tests. */
const API_ORIGIN = 'https://api.example.test'
/** @brief 测试 artifact ID / Artifact ID used by tests. */
const ARTIFACT_ID = 'artifact_12345678'
/** @brief 测试 PDF 内容 / PDF content used by tests. */
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%%EOF')
/** @brief 测试 PDF 内容的已知 SHA-256 / Known SHA-256 of the test PDF content. */
const PDF_SHA256 = 'd5db70fbccdd8ccc6a553604b79a09cd33083b401340d546efa08a52142c972e'

/**
 * @brief 构造严格 RenderArtifact JSON / Build strict RenderArtifact JSON.
 * @param overrides 待替换的字段 / Fields to override.
 * @return 满足冻结 Schema 的 JSON object / JSON object satisfying the frozen schema.
 */
function createMetadata(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    content_type: 'application/pdf',
    created_at: '2026-07-22T00:00:00Z',
    download_url: `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content?signature=short-lived`,
    expires_at: '2026-07-23T00:00:00Z',
    format: 'pdf',
    id: ARTIFACT_ID,
    page_count: 1,
    resume_id: 'resume_12345678',
    resume_revision: 3,
    revision: 1,
    sha256: PDF_SHA256,
    size_bytes: PDF_BYTES.byteLength,
    source_map_artifact_id: null,
    updated_at: '2026-07-22T00:00:00Z',
    ...overrides
  }
}

/**
 * @brief 构造 JSON HTTP 响应 / Build a JSON HTTP response.
 * @param body JSON value / JSON 值.
 * @param init 可选 Response 初始化参数 / Optional Response initialization.
 * @return 带 application/json 的 Response / Response carrying application/json.
 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  /** @brief 合并后的响应 headers / Merged response headers. */
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { ...init, headers, status: init.status ?? 200 })
}

/**
 * @brief 构造 PDF HTTP 响应 / Build a PDF HTTP response.
 * @param bytes 响应字节 / Response bytes.
 * @param headers 可选额外 headers / Optional additional headers.
 * @return 带 application/pdf 的 Response / Response carrying application/pdf.
 */
function pdfResponse(bytes = PDF_BYTES, headers: HeadersInit = {}): Response {
  /** @brief 合并后的响应 headers / Merged response headers. */
  const responseHeaders = new Headers(headers)
  if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', 'application/pdf')
  return new Response(bytes, { headers: responseHeaders, status: 200 })
}

/** @brief 测试宿主及其 spy / Test host and its spies. */
interface TestHost {
  /** @brief 最小下载元素 / Minimal download element. */
  readonly anchor: BrowserDownloadAnchor
  /** @brief 文档附加 spy / Document-append spy. */
  readonly appendAnchor: Mock<BrowserArtifactSaveDependencies['appendAnchor']>
  /** @brief anchor click spy / Anchor click spy. */
  readonly click: Mock<BrowserDownloadAnchor['click']>
  /** @brief Blob URL 创建 spy / Blob-URL creation spy. */
  readonly createObjectURL: Mock<BrowserArtifactSaveDependencies['createObjectURL']>
  /** @brief anchor remove spy / Anchor remove spy. */
  readonly remove: Mock<BrowserDownloadAnchor['remove']>
  /** @brief Blob URL 释放 spy / Blob-URL revocation spy. */
  readonly revokeObjectURL: Mock<BrowserArtifactSaveDependencies['revokeObjectURL']>
  /** @brief 延迟调度 spy / Delayed-scheduling spy. */
  readonly scheduleRevoke: Mock<BrowserArtifactSaveDependencies['scheduleRevoke']>
}

/**
 * @brief 构造可观测的浏览器宿主 / Build an observable browser host.
 * @return 全部 DOM 与 URL spy / All DOM and URL spies.
 */
function createTestHost(): TestHost {
  /** @brief anchor click spy / Anchor click spy. */
  const click = vi.fn<BrowserDownloadAnchor['click']>()
  /** @brief anchor remove spy / Anchor remove spy. */
  const remove = vi.fn<BrowserDownloadAnchor['remove']>()
  /** @brief 测试使用的最小下载元素 / Minimal download element used by tests. */
  const anchor: BrowserDownloadAnchor = { click, download: '', href: '', remove }
  return {
    anchor,
    appendAnchor: vi.fn<BrowserArtifactSaveDependencies['appendAnchor']>(),
    click,
    createObjectURL: vi.fn<BrowserArtifactSaveDependencies['createObjectURL']>(
      (): string => 'blob:https://app.example.test/verified-pdf'
    ),
    remove,
    revokeObjectURL: vi.fn<BrowserArtifactSaveDependencies['revokeObjectURL']>(),
    scheduleRevoke: vi.fn<BrowserArtifactSaveDependencies['scheduleRevoke']>()
  }
}

/**
 * @brief 从测试宿主投影适配器 overrides / Project adapter overrides from a test host.
 * @param host 测试宿主 / Test host.
 * @param fetchImpl 当前测试的 fetch / Fetch for the current test.
 * @return 可注入依赖 / Injectable dependencies.
 */
function createOverrides(
  host: TestHost,
  fetchImpl: typeof fetch
): Partial<BrowserArtifactSaveDependencies> {
  return {
    appendAnchor: host.appendAnchor,
    createAnchor: (): BrowserDownloadAnchor => host.anchor,
    createObjectURL: host.createObjectURL,
    fetchImpl,
    now: (): number => Date.parse('2026-07-22T01:00:00Z'),
    revokeObjectURL: host.revokeObjectURL,
    scheduleRevoke: host.scheduleRevoke
  }
}

/**
 * @brief 构造默认保存请求 / Build the default save request.
 * @return 仅含 artifact identity 与安全文件名的请求 / Request containing only artifact identity and a safe filename.
 */
function createRequest(): {
  readonly artifactId: string
  readonly suggestedFileName: ReturnType<typeof sanitizePdfFileName>
} {
  return {
    artifactId: ARTIFACT_ID,
    suggestedFileName: sanitizePdfFileName('Klee Resume')
  }
}

describe('createBrowserArtifactSavePort', () => {
  it('刷新权威元数据、校验 PDF 后只下载已验证 Blob', async () => {
    /** @brief 依次返回元数据和 PDF 的 fetch spy / Fetch spy returning metadata and PDF in sequence. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata()))
      .mockResolvedValueOnce(
        pdfResponse(PDF_BYTES, { 'Content-Length': String(PDF_BYTES.byteLength) })
      )
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).resolves.toEqual({ status: 'started' })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}`,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        method: 'GET',
        redirect: 'error'
      })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content?signature=short-lived`,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/pdf' },
        method: 'GET',
        redirect: 'error'
      })
    )
    /** @brief metadata 与 content 共用的保存截止信号 / Save-deadline signal shared by metadata and content. */
    const metadataSignal = fetchImpl.mock.calls[0]?.[1]?.signal
    /** @brief content 请求使用的截止信号 / Deadline signal used by the content request. */
    const contentSignal = fetchImpl.mock.calls[1]?.[1]?.signal
    expect(metadataSignal).toBeInstanceOf(AbortSignal)
    expect(contentSignal).toBe(metadataSignal)
    expect(host.createObjectURL).toHaveBeenCalledOnce()
    /** @brief 保存适配器产生的 PDF Blob / PDF blob produced by the save adapter. */
    const blob = host.createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('application/pdf')
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(PDF_BYTES))
    expect(host.anchor.href).toBe('blob:https://app.example.test/verified-pdf')
    expect(host.anchor.download).toBe('Klee Resume.pdf')
    expect(host.appendAnchor).toHaveBeenCalledWith(host.anchor)
    expect(host.click).toHaveBeenCalledOnce()
    expect(host.remove).toHaveBeenCalledOnce()
    expect(host.revokeObjectURL).not.toHaveBeenCalled()
    expect(host.scheduleRevoke).toHaveBeenCalledWith(expect.any(Function), 60_000)

    /** @brief 捕获的延迟清理回调 / Captured delayed cleanup callback. */
    const revoke = host.scheduleRevoke.mock.calls[0]?.[0] as () => void
    revoke()
    expect(host.revokeObjectURL).toHaveBeenCalledWith('blob:https://app.example.test/verified-pdf')
  })

  it.each([
    ['unexpected status', jsonResponse(createMetadata(), { status: 201 })],
    [
      'wrong media type',
      jsonResponse(createMetadata(), { headers: { 'Content-Type': 'text/json' } })
    ],
    ['unknown field', jsonResponse(createMetadata({ unexpected: true }))]
  ])('拒绝不符合严格 HTTP/Schema 契约的元数据：%s', async (_caseName, response) => {
    /** @brief 只返回非法元数据的 fetch spy / Fetch spy returning invalid metadata only. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toBeInstanceOf(
      BrowserArtifactSaveError
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(host.click).not.toHaveBeenCalled()
  })

  it.each([
    ['another identity', createMetadata({ id: 'artifact_87654321' })],
    ['non-PDF format', createMetadata({ content_type: 'image/png', format: 'png' })],
    ['expired URL', createMetadata({ expires_at: '2026-07-22T00:59:59Z' })],
    ['expired leap-second URL', createMetadata({ expires_at: '2016-12-31T23:59:60Z' })],
    [
      'URL expiring inside the safety window',
      createMetadata({
        expires_at: new Date(
          Date.parse('2026-07-22T01:00:00Z') + ARTIFACT_EXPIRY_SAFETY_WINDOW_MS
        ).toISOString()
      })
    ],
    [
      'foreign origin',
      createMetadata({
        download_url: `https://cdn.example.test/api/v1/render-artifacts/${ARTIFACT_ID}/content`
      })
    ],
    [
      'another artifact path',
      createMetadata({
        download_url: `${API_ORIGIN}/api/v1/render-artifacts/artifact_87654321/content`
      })
    ],
    [
      'fragment-bearing URL',
      createMetadata({
        download_url: `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content#private`
      })
    ],
    [
      'credential-bearing URL',
      createMetadata({
        download_url: `https://user:secret@api.example.test/api/v1/render-artifacts/${ARTIFACT_ID}/content`
      })
    ],
    [
      'ambiguous path separator',
      createMetadata({
        download_url: `${API_ORIGIN}/api/v1/render-artifacts\\${ARTIFACT_ID}\\content`
      })
    ],
    ['oversized artifact', createMetadata({ size_bytes: MAX_PDF_ARTIFACT_BYTES + 1 })]
  ])('在读取内容前拒绝不安全元数据：%s', async (_caseName, metadata) => {
    /** @brief 只返回候选元数据的 fetch spy / Fetch spy returning candidate metadata only. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(metadata))
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toBeInstanceOf(
      BrowserArtifactSaveError
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(host.createObjectURL).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong media type', pdfResponse(PDF_BYTES, { 'Content-Type': 'application/pdf-fake' })],
    ['unsupported encoding', pdfResponse(PDF_BYTES, { 'Content-Encoding': 'compress' })],
    [
      'wrong Content-Length',
      pdfResponse(PDF_BYTES, { 'Content-Length': String(PDF_BYTES.byteLength + 1) })
    ],
    ['truncated body', pdfResponse(PDF_BYTES.slice(0, -1))],
    ['body exceeds metadata', pdfResponse(new Uint8Array([...PDF_BYTES, 0]))]
  ])('拒绝内容响应的类型、编码和大小偏差：%s', async (_caseName, contentResponse) => {
    /** @brief 依次返回合法元数据与非法内容的 fetch spy / Fetch spy returning valid metadata then invalid content. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata()))
      .mockResolvedValueOnce(contentResponse)
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toBeInstanceOf(
      BrowserArtifactSaveError
    )
    expect(host.createObjectURL).not.toHaveBeenCalled()
    expect(host.click).not.toHaveBeenCalled()
  })

  it.each(['br', 'deflate', 'gzip', 'zstd'])(
    '接受 Fetch 已解码的 %s 响应且不信任传输 Content-Length',
    async (contentEncoding) => {
      /** @brief 传输长度故意与解码后 PDF 长度不同 / Transfer length intentionally differs from the decoded PDF length. */
      const contentResponse = pdfResponse(PDF_BYTES, {
        'Content-Encoding': contentEncoding,
        'Content-Length': '999'
      })
      /** @brief 依次返回元数据与 Fetch 解码后 PDF 的 spy / Spy returning metadata then the Fetch-decoded PDF. */
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(createMetadata()))
        .mockResolvedValueOnce(contentResponse)
      /** @brief 可观测浏览器宿主 / Observable browser host. */
      const host = createTestHost()
      /** @brief 待测 Web 保存端口 / Web save port under test. */
      const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

      await expect(port.saveArtifact(createRequest())).resolves.toEqual({ status: 'started' })
      expect(host.createObjectURL).toHaveBeenCalledOnce()
      expect(host.click).toHaveBeenCalledOnce()
    }
  )

  it('CORS 隐藏 Content-Encoding 时忽略可见的传输长度', async () => {
    /** @brief 模拟 CORS 未暴露编码 header 但暴露 Content-Length 的响应 / Response simulating CORS hiding the encoding header while exposing Content-Length. */
    const contentResponse = pdfResponse(PDF_BYTES, { 'Content-Length': '999' })
    Object.defineProperty(contentResponse, 'type', { value: 'cors' })
    /** @brief 依次返回元数据与已解码 PDF 的 fetch spy / Fetch spy returning metadata then decoded PDF bytes. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata()))
      .mockResolvedValueOnce(contentResponse)
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).resolves.toEqual({ status: 'started' })
    expect(host.createObjectURL).toHaveBeenCalledOnce()
    expect(host.click).toHaveBeenCalledOnce()
  })

  it('压缩响应仍以 Fetch 解码后的实际字节数为权威', async () => {
    /** @brief 声明 gzip 但解码后截断的 PDF / PDF declared as gzip but truncated after Fetch decoding. */
    const contentResponse = pdfResponse(PDF_BYTES.slice(0, -1), {
      'Content-Encoding': 'gzip',
      'Content-Length': String(PDF_BYTES.byteLength)
    })
    /** @brief 依次返回元数据与截断内容的 spy / Spy returning metadata then truncated content. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata()))
      .mockResolvedValueOnce(contentResponse)
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toThrow('declared byte count')
    expect(host.createObjectURL).not.toHaveBeenCalled()
    expect(host.click).not.toHaveBeenCalled()
  })

  it('拒绝 SHA-256 不匹配且不创建可下载 URL', async () => {
    /** @brief 依次返回错误摘要元数据和内容的 fetch spy / Fetch spy returning wrong-digest metadata and content. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata({ sha256: 'a'.repeat(64) })))
      .mockResolvedValueOnce(pdfResponse())
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toThrow('integrity')
    expect(host.createObjectURL).not.toHaveBeenCalled()
  })

  it('Web 边界拒绝绕过 SafePdfFileName brand 的非规范文件名', async () => {
    /** @brief 不应被调用的 fetch spy / Fetch spy that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(
      port.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: '../unsafe.pdf' as ReturnType<typeof sanitizePdfFileName>
      })
    ).rejects.toThrow('canonical and safe')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(host.createObjectURL).not.toHaveBeenCalled()
  })

  it('统一总时限中止卡住的 metadata 请求且不启动下载', async () => {
    vi.useFakeTimers()
    try {
      /** @brief fetch 已安装截止监听器的通知 / Notification that fetch installed its abort listener. */
      let notifyFetchStarted: (() => void) | undefined
      /** @brief 等待 metadata fetch 开始的 Promise / Promise waiting for the metadata fetch to start. */
      const fetchStarted = new Promise<void>((resolve): void => {
        notifyFetchStarted = resolve
      })
      /** @brief 仅在截止后失败的 fetch / Fetch that rejects only after abort. */
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        /** @brief 当前保存截止信号 / Current save-deadline signal. */
        const signal = init?.signal
        if (!(signal instanceof AbortSignal)) {
          return Promise.reject(new Error('Missing artifact-save deadline signal.'))
        }
        notifyFetchStarted?.()
        return new Promise((_resolve, reject): void => {
          signal.addEventListener(
            'abort',
            (): void => {
              /** @brief 截止控制器提供的原因 / Reason supplied by the abort controller. */
              const reason: unknown = signal.reason as unknown
              reject(reason instanceof Error ? reason : new Error('Artifact fetch aborted.'))
            },
            { once: true }
          )
        })
      })
      /** @brief 可观测浏览器宿主 / Observable browser host. */
      const host = createTestHost()
      /** @brief 待测 Web 保存端口 / Web save port under test. */
      const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))
      /** @brief 受统一总时限保护的保存操作 / Save operation protected by the total deadline. */
      const operation = port.saveArtifact(createRequest())
      /** @brief 在推进时钟前安装的失败断言 / Rejection assertion installed before advancing the clock. */
      const rejection = expect(operation).rejects.toThrow('timed out')

      await fetchStarted
      await vi.advanceTimersByTimeAsync(BROWSER_ARTIFACT_SAVE_TIMEOUT_MS)
      await rejection

      expect(host.createObjectURL).not.toHaveBeenCalled()
      expect(host.click).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('即使浏览器拒绝 click 也移除 anchor 并延迟释放 Blob URL', async () => {
    /** @brief 依次返回合法元数据和 PDF 的 fetch spy / Fetch spy returning valid metadata and PDF. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(createMetadata()))
      .mockResolvedValueOnce(pdfResponse())
    /** @brief 可观测浏览器宿主 / Observable browser host. */
    const host = createTestHost()
    host.click.mockImplementation((): never => {
      throw new Error('download blocked')
    })
    /** @brief 待测 Web 保存端口 / Web save port under test. */
    const port = createBrowserArtifactSavePort(API_ORIGIN, createOverrides(host, fetchImpl))

    await expect(port.saveArtifact(createRequest())).rejects.toThrow('download blocked')
    expect(host.remove).toHaveBeenCalledOnce()
    expect(host.scheduleRevoke).toHaveBeenCalledOnce()
  })
})
