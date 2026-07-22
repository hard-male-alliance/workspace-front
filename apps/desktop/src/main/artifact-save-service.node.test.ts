import { describe, expect, it, vi } from 'vitest'
import {
  ARTIFACT_EXPIRY_SAFETY_WINDOW_MS,
  MAX_PDF_ARTIFACT_BYTES,
  parseArtifactSaveRequest,
  sanitizePdfFileName
} from '@ai-job-workspace/platform'

import { maskArtifactSaveFailure, savePdfArtifact } from './artifact-save-service'
import type {
  ArtifactFetchResponse,
  ArtifactSaveServiceDependencies
} from './artifact-save-service'

/** @brief 测试产品 API origin / Product API origin used by tests. */
const API_ORIGIN = 'https://api.example.test'

/** @brief 默认测试时钟 / Default test clock. */
const NOW = Date.parse('2026-07-22T08:00:00Z')

/** @brief 默认测试 PDF 字节的 SHA-256 / SHA-256 of the default test PDF bytes. */
const PDF_SHA256 = '315d429b7714cedb6ad04ac31240145257692630457f3c88253c5beceac76027'

/** @brief 符合冻结 Schema 的权威 PDF 元数据 / Authoritative PDF metadata matching the frozen schema. */
const validMetadata = {
  id: 'artifact_123',
  created_at: '2026-07-22T07:55:00Z',
  updated_at: '2026-07-22T07:59:00Z',
  revision: 1,
  resume_id: 'resume_123',
  resume_revision: 4,
  format: 'pdf',
  content_type: 'application/pdf',
  size_bytes: 4,
  sha256: PDF_SHA256,
  download_url: `${API_ORIGIN}/api/v1/render-artifacts/artifact_123/content?signature=short-lived`,
  expires_at: '2026-07-22T08:05:00Z',
  page_count: 1,
  source_map_artifact_id: null,
  extensions: {}
} as const

/** @brief 有效的最窄保存请求 / Valid narrow save request. */
const validRequest = {
  artifactId: 'artifact_123',
  suggestedFileName: sanitizePdfFileName('Klee Resume')
}

/**
 * @brief 创建带指定头部、正文与 JSON 的测试响应 / Create a test response with selected headers, body, and JSON.
 * @param options 可覆盖响应字段 / Response fields to override.
 * @return 最小产物响应 / Minimal artifact response.
 */
function createResponse(
  options: {
    readonly body?: Uint8Array | null
    readonly headers?: Readonly<Record<string, string>>
    readonly json?: unknown
    readonly jsonError?: Error
    readonly status?: number
  } = {}
): ArtifactFetchResponse {
  /** @brief 测试响应头 / Headers for the test response. */
  const headers = new Headers(options.headers)
  /** @brief 测试响应字节 / Response bytes used by the test. */
  const bytes = options.body === undefined ? null : options.body

  return {
    body:
      bytes === null
        ? null
        : new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(bytes)
              controller.close()
            }
          }),
    headers,
    json: (): Promise<unknown> =>
      options.jsonError === undefined
        ? Promise.resolve(options.json)
        : Promise.reject(options.jsonError),
    status: options.status ?? 200
  }
}

/**
 * @brief 创建合法元数据响应 / Create a valid metadata response.
 * @param metadata 可覆盖的元数据 / Metadata override.
 * @return JSON 元数据响应 / JSON metadata response.
 */
function createMetadataResponse(metadata: unknown = validMetadata): ArtifactFetchResponse {
  return createResponse({
    headers: { 'content-type': 'application/json; charset=utf-8' },
    json: metadata
  })
}

/**
 * @brief 创建合法 PDF 内容响应 / Create a valid PDF-content response.
 * @param options 可覆盖响应字段 / Response overrides.
 * @return PDF 内容响应 / PDF-content response.
 */
function createContentResponse(
  options: {
    readonly body?: Uint8Array | null
    readonly headers?: Readonly<Record<string, string>>
    readonly status?: number
  } = {}
): ArtifactFetchResponse {
  return createResponse({
    body: options.body === undefined ? new Uint8Array([0x25, 0x50, 0x44, 0x46]) : options.body,
    headers: { 'content-type': 'application/pdf', ...options.headers },
    ...(options.status === undefined ? {} : { status: options.status })
  })
}

/**
 * @brief 创建服务测试依赖 / Create service dependencies for a test.
 * @param metadataResponse metadata fetch 返回的响应 / Response returned by the metadata fetch.
 * @param contentResponse content fetch 返回的响应 / Response returned by the content fetch.
 * @return 可观测的依赖集合 / Observable dependency set.
 */
function createDependencies(
  metadataResponse: ArtifactFetchResponse = createMetadataResponse(),
  contentResponse: ArtifactFetchResponse = createContentResponse()
) {
  /** @brief session fetch spy / Session-fetch spy. */
  const fetch = vi
    .fn<ArtifactSaveServiceDependencies['fetch']>()
    .mockResolvedValueOnce(metadataResponse)
    .mockResolvedValueOnce(contentResponse)
  /** @brief 原生保存对话框 spy / Native save-dialog spy. */
  const showSaveDialog = vi
    .fn<ArtifactSaveServiceDependencies['showSaveDialog']>()
    .mockResolvedValue({ canceled: false, filePath: '/tmp/resume.pdf' })
  /** @brief 原子 PDF 写入 spy / Atomic PDF-write spy. */
  const writePdf = vi
    .fn<ArtifactSaveServiceDependencies['writePdf']>()
    .mockResolvedValue({ sha256: PDF_SHA256, sizeBytes: 4 })
  /** @brief 固定测试时钟 / Fixed test clock. */
  const now = vi.fn().mockReturnValue(NOW)
  return {
    dependencies: { fetch, now, showSaveDialog, writePdf },
    fetch,
    now,
    showSaveDialog,
    writePdf
  }
}

describe('parseArtifactSaveRequest', () => {
  it('只保留产物 ID 与安全文件名', () => {
    expect(parseArtifactSaveRequest(validRequest)).toEqual({
      artifactId: 'artifact_123',
      suggestedFileName: 'Klee Resume.pdf'
    })
  })

  it.each([
    null,
    [],
    { artifactId: 'artifact_123' },
    { ...validRequest, hiddenPath: '/etc/passwd' },
    { ...validRequest, artifactId: 'short' },
    { ...validRequest, artifactId: 'artifact/123' },
    { ...validRequest, suggestedFileName: '../unsafe.pdf' }
  ])('拒绝错误或扩权的 IPC 载荷：%o', (payload) => {
    expect(() => parseArtifactSaveRequest(payload)).toThrow()
  })
})

describe('savePdfArtifact', () => {
  it('主进程在打开原生对话框前重新解码不可信 IPC 载荷', async () => {
    /** @brief 不应触发任何宿主副作用的依赖 / Dependencies that must observe no host side effects. */
    const harness = createDependencies()

    await expect(
      savePdfArtifact(
        { ...validRequest, hiddenPath: '/tmp/private.pdf' },
        API_ORIGIN,
        harness.dependencies
      )
    ).rejects.toThrow('unsupported fields')
    expect(harness.showSaveDialog).not.toHaveBeenCalled()
    expect(harness.fetch).not.toHaveBeenCalled()
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('取消时不读取元数据也不写文件', async () => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()
    harness.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'cancelled'
    })
    expect(harness.fetch).not.toHaveBeenCalled()
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('关闭对话框后由主进程刷新元数据，再下载同一产物', async () => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'saved'
    })
    expect(harness.showSaveDialog).toHaveBeenCalledWith('Klee Resume.pdf')
    expect(harness.fetch).toHaveBeenCalledTimes(2)
    /** @brief 元数据调用 / Metadata call. */
    const metadataCall = harness.fetch.mock.calls[0]
    /** @brief 内容调用 / Content call. */
    const contentCall = harness.fetch.mock.calls[1]
    expect(metadataCall?.[0]).toBe(`${API_ORIGIN}/api/v1/render-artifacts/artifact_123`)
    expect(metadataCall?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      method: 'GET',
      redirect: 'error'
    })
    expect(contentCall?.[0]).toBe(validMetadata.download_url)
    expect(contentCall?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/pdf' },
      method: 'GET',
      redirect: 'error'
    })
    expect(contentCall?.[1].signal).toBe(metadataCall?.[1].signal)
    expect(harness.showSaveDialog.mock.invocationCallOrder[0]).toBeLessThan(
      harness.fetch.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
  })

  it.each([
    [createResponse({ headers: { 'content-type': 'application/json' }, status: 204 }), 'HTTP 204'],
    [
      createResponse({ headers: { 'content-type': 'text/html' }, json: validMetadata }),
      'application/json'
    ],
    [
      createResponse({
        headers: { 'content-type': 'application/json' },
        jsonError: new SyntaxError('private parser details')
      }),
      'valid JSON'
    ],
    [createMetadataResponse({ ...validMetadata, hidden: true }), 'not allowed'],
    [createMetadataResponse({ ...validMetadata, id: 'artifact_456' }), 'different artifact'],
    [createMetadataResponse({ ...validMetadata, format: 'png' }), 'does not describe a PDF'],
    [createMetadataResponse({ ...validMetadata, content_type: 'text/html' }), 'application/pdf'],
    [
      createMetadataResponse({ ...validMetadata, size_bytes: MAX_PDF_ARTIFACT_BYTES + 1 }),
      '25 MiB'
    ],
    [
      createMetadataResponse({
        ...validMetadata,
        download_url: 'https://evil.example/api/v1/render-artifacts/artifact_123/content'
      }),
      'configured product API origin'
    ]
  ] as const)('拒绝不可信元数据响应：%s', async (metadataResponse, errorText) => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(metadataResponse)

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      errorText
    )
    expect(harness.fetch).toHaveBeenCalledTimes(1)
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('保守拒绝已过期或安全窗口内即将过期的 URL', async () => {
    /** @brief 安全窗口边界上的过期时间 / Expiry at the safety-window boundary. */
    const expiresAt = new Date(NOW + ARTIFACT_EXPIRY_SAFETY_WINDOW_MS).toISOString()
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(
      createMetadataResponse({ ...validMetadata, expires_at: expiresAt })
    )

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      'too close to expiry'
    )
    expect(harness.fetch).toHaveBeenCalledTimes(1)
  })

  it('按 RFC 3339 语义判定已过期的闰秒 URL', async () => {
    /** @brief 包含合法历史闰秒的元数据 / Metadata containing a valid historical leap second. */
    const harness = createDependencies(
      createMetadataResponse({ ...validMetadata, expires_at: '2016-12-31T23:59:60Z' })
    )

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      'too close to expiry'
    )
    expect(harness.fetch).toHaveBeenCalledTimes(1)
  })

  it('内容发生任何重定向时由 Electron transport fail closed 且不写文件', async () => {
    /** @brief 模拟 Electron 对 redirect:error 的真实拒绝语义 / Realistic Electron rejection for redirect:error. */
    const redirectFailure = new Error("Attempted to redirect, but redirect policy was 'error'")
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()
    harness.fetch
      .mockReset()
      .mockResolvedValueOnce(createMetadataResponse())
      .mockRejectedValueOnce(redirectFailure)

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toBe(
      redirectFailure
    )
    expect(harness.fetch).toHaveBeenCalledTimes(2)
    expect(harness.fetch.mock.calls[1]?.[1]).toMatchObject({ redirect: 'error' })
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it.each([
    [206, { 'content-type': 'application/pdf' }, 'HTTP 206'],
    [500, { 'content-type': 'application/pdf' }, 'HTTP 500'],
    [200, { 'content-type': 'text/html' }, 'application/pdf'],
    [200, { 'content-length': String(MAX_PDF_ARTIFACT_BYTES + 1) }, '25 MiB'],
    [200, { 'content-length': '5' }, 'declared integrity'],
    [200, { 'content-length': '4.5' }, 'Content-Length']
  ] as const)('拒绝不安全内容响应 status=%i headers=%o', async (status, headers, errorText) => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(
      createMetadataResponse(),
      createContentResponse({ headers, status })
    )

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      errorText
    )
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('非 identity 内容编码不把传输 Content-Length 当作 PDF 字节数', async () => {
    /** @brief gzip 表示长度与解码后 PDF 长度不同的响应 / Gzip response whose representation length differs from decoded PDF length. */
    const content = createContentResponse({
      headers: { 'content-encoding': 'gzip', 'content-length': '999' }
    })
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(createMetadataResponse(), content)

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'saved'
    })
    expect(harness.writePdf).toHaveBeenCalledTimes(1)
  })

  it.each(['', 'unknown', 'identity, gzip', 'gzip,'])(
    '拒绝未知、空白或矛盾的内容编码：%j',
    async (encoding) => {
      /** @brief 当前测试依赖 / Dependencies for this test. */
      const harness = createDependencies(
        createMetadataResponse(),
        createContentResponse({ headers: { 'content-encoding': encoding } })
      )

      await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
        'Content-Encoding'
      )
      expect(harness.writePdf).not.toHaveBeenCalled()
    }
  )

  it('始终把权威 metadata 的完整性值与共享 25 MiB 限额交给原子写入器', async () => {
    /** @brief identity PDF 响应 / Identity PDF response. */
    const response = createContentResponse({ headers: { 'content-length': '4' } })
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(createMetadataResponse(), response)

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'saved'
    })
    expect(harness.writePdf).toHaveBeenCalledTimes(1)
    /** @brief 交给原子写入器的参数 / Arguments passed to the atomic writer. */
    const writeCall = harness.writePdf.mock.calls[0]
    expect(writeCall?.[0]).toBe('/tmp/resume.pdf')
    expect(writeCall?.[1]).toBe(response.body)
    expect(writeCall?.[2]).toMatchObject({
      expectedSha256: PDF_SHA256,
      expectedSizeBytes: 4,
      maximumBytes: MAX_PDF_ARTIFACT_BYTES
    })
    expect(writeCall?.[2].signal).toBeInstanceOf(AbortSignal)
  })

  it('拒绝文件存储器不可能返回的完整性观测', async () => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()
    harness.writePdf.mockResolvedValue({ sha256: 'b'.repeat(64), sizeBytes: 4 })

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      'Persisted PDF integrity'
    )
  })

  it('总时限包含 dialog 后的元数据请求', async () => {
    vi.useFakeTimers()
    try {
      /** @brief fetch 已收到截止信号时的通知 / Notification that fetch received the deadline signal. */
      let notifyFetchStarted: (() => void) | undefined
      /** @brief 等待 fetch 开始的 Promise / Promise waiting for fetch to begin. */
      const fetchStarted = new Promise<void>((resolve): void => {
        notifyFetchStarted = resolve
      })
      /** @brief 当前测试依赖 / Dependencies for this test. */
      const harness = createDependencies()
      harness.fetch.mockReset().mockImplementation((_url, init): Promise<ArtifactFetchResponse> => {
        notifyFetchStarted?.()
        return new Promise((_resolve, reject): void => {
          init.signal.addEventListener(
            'abort',
            (): void => {
              /** @brief 截止控制器提供的安全失败原因 / Safe failure reason supplied by the deadline controller. */
              const reason: unknown = init.signal.reason as unknown
              reject(reason instanceof Error ? reason : new Error('Artifact fetch was aborted.'))
            },
            { once: true }
          )
        })
      })

      /** @brief 受短截止时间保护的保存操作 / Save operation protected by a short deadline. */
      const operation = savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies, 25)
      /** @brief 在计时推进前安装的失败断言 / Rejection assertion installed before advancing time. */
      const rejection = expect(operation).rejects.toThrow('timed out')
      await fetchStarted
      await vi.advanceTimersByTimeAsync(25)

      await rejection
      expect(harness.writePdf).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('maskArtifactSaveFailure', () => {
  it('不把主进程本地路径泄露给 renderer', async () => {
    await expect(
      maskArtifactSaveFailure(() =>
        Promise.reject(new Error('/Users/klee/private/resume.pdf: permission denied'))
      )
    ).rejects.toThrow('The PDF artifact could not be saved safely.')
    await expect(
      maskArtifactSaveFailure(() =>
        Promise.reject(new Error('/Users/klee/private/resume.pdf: permission denied'))
      )
    ).rejects.not.toThrow('/Users/klee')
  })
})
