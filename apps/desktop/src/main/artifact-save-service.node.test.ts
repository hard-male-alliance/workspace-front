import { describe, expect, it, vi } from 'vitest'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'

import { MAX_PDF_BYTES } from './artifact-file-store'
import {
  maskArtifactSaveFailure,
  savePdfArtifact,
  validateArtifactSaveRequest
} from './artifact-save-service'
import type {
  ArtifactFetchResponse,
  ArtifactSaveServiceDependencies
} from './artifact-save-service'

/** @brief 测试产品 API origin / Product API origin used by tests. */
const API_ORIGIN = 'https://api.example.test'

/**
 * @brief 创建带指定头部与正文的测试响应 / Create a test response with selected headers and body.
 * @param options 可覆盖响应字段 / Response fields to override.
 * @return 最小产物响应 / Minimal artifact response.
 */
function createResponse(
  options: {
    readonly body?: Uint8Array | null
    readonly headers?: Readonly<Record<string, string>>
    readonly status?: number
  } = {}
): ArtifactFetchResponse {
  /** @brief 测试响应头 / Headers for the test response. */
  const headers = new Headers({ 'content-type': 'application/pdf', ...options.headers })
  /** @brief 测试响应字节 / Response bytes used by the test. */
  const bytes = options.body === undefined ? new Uint8Array([0x25, 0x50, 0x44, 0x46]) : options.body

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
    status: options.status ?? 200
  }
}

/**
 * @brief 创建服务测试依赖 / Create service dependencies for a test.
 * @param response fetch 返回的响应 / Response returned by fetch.
 * @return 可观测的依赖集合 / Observable dependency set.
 */
function createDependencies(response: ArtifactFetchResponse = createResponse()) {
  /** @brief session fetch spy / Session-fetch spy. */
  const fetch = vi.fn<ArtifactSaveServiceDependencies['fetch']>().mockResolvedValue(response)
  /** @brief 原生保存对话框 spy / Native save-dialog spy. */
  const showSaveDialog = vi
    .fn<ArtifactSaveServiceDependencies['showSaveDialog']>()
    .mockResolvedValue({ canceled: false, filePath: '/tmp/resume.pdf' })
  /** @brief 原子 PDF 写入 spy / Atomic PDF-write spy. */
  const writePdf = vi.fn<ArtifactSaveServiceDependencies['writePdf']>().mockResolvedValue(undefined)
  return { dependencies: { fetch, showSaveDialog, writePdf }, fetch, showSaveDialog, writePdf }
}

/** @brief 有效的窄保存请求 / Valid narrow save request. */
const validRequest = {
  contentUrl: `${API_ORIGIN}/api/v1/render-artifacts/artifact_1/content`,
  suggestedFileName: sanitizePdfFileName('Klee Resume')
}

describe('validateArtifactSaveRequest', () => {
  it.each([
    null,
    [],
    { contentUrl: validRequest.contentUrl },
    { ...validRequest, hiddenPath: '/etc/passwd' },
    { ...validRequest, suggestedFileName: '../unsafe.pdf' }
  ])('拒绝错误或扩权的 IPC 载荷：%o', (payload) => {
    expect(() => validateArtifactSaveRequest(payload, API_ORIGIN)).toThrow()
  })

  it.each([
    'https://evil.example/api/v1/render-artifacts/a/content',
    `${API_ORIGIN}/private/render-artifacts/a/content`,
    `${API_ORIGIN}/api/v10/render-artifacts/a/content`,
    `${API_ORIGIN}/api/v1/%2e%2e/private`,
    `${API_ORIGIN}/api/v1/resumes/resume_1`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact_1`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact_1/content/extra`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact%252fprivate/content`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact%2fprivate/content`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact%5cprivate/content`,
    `${API_ORIGIN}/api/v1/render-artifacts/artifact_1/content#fragment`,
    `${API_ORIGIN}/api/v1/render-artifacts\\artifact_1\\content`,
    'file:///api/v1/render-artifacts/a/content'
  ])('拒绝越过 origin、协议或 API path 的 URL：%s', (contentUrl) => {
    expect(() => validateArtifactSaveRequest({ ...validRequest, contentUrl }, API_ORIGIN)).toThrow()
  })
})

describe('savePdfArtifact', () => {
  it('取消时不发起网络请求也不写文件', async () => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()
    harness.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'cancelled'
    })
    expect(harness.fetch).not.toHaveBeenCalled()
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('使用 renderer session 身份、手工重定向并逐跳校验', async () => {
    /** @brief 跨到第二个可信路径的重定向响应 / Redirect response to a second trusted path. */
    const redirect = createResponse({
      body: null,
      headers: { location: '/api/v1/render-artifacts/artifact_2/content' },
      status: 302
    })
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies()
    harness.fetch.mockResolvedValueOnce(redirect).mockResolvedValueOnce(createResponse())

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'saved'
    })
    expect(harness.fetch).toHaveBeenCalledTimes(2)
    /** @brief 首次下载调用 / First download call. */
    const firstCall = harness.fetch.mock.calls[0]
    /** @brief 重定向后的下载调用 / Download call after the redirect. */
    const secondCall = harness.fetch.mock.calls[1]
    expect(firstCall?.[0]).toBe(validRequest.contentUrl)
    expect(firstCall?.[1].credentials).toBe('include')
    expect(firstCall?.[1].redirect).toBe('manual')
    expect(firstCall?.[1].signal).toBeInstanceOf(AbortSignal)
    expect(secondCall?.[0]).toBe(`${API_ORIGIN}/api/v1/render-artifacts/artifact_2/content`)
    expect(secondCall?.[1].credentials).toBe('include')
    expect(secondCall?.[1].redirect).toBe('manual')
    expect(secondCall?.[1].signal).toBe(firstCall?.[1].signal)
  })

  it('拒绝重定向到不同 origin', async () => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(
      createResponse({
        body: null,
        headers: { location: 'https://evil.example/api/v1/artifact.pdf' },
        status: 302
      })
    )

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      'configured product API origin'
    )
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it.each([
    [206, { 'content-type': 'application/pdf' }, 'HTTP 206'],
    [500, { 'content-type': 'application/pdf' }, 'HTTP 500'],
    [200, { 'content-type': 'text/html' }, 'application/pdf'],
    [200, { 'content-length': String(MAX_PDF_BYTES + 1) }, '25 MiB']
  ] as const)('拒绝不安全响应 status=%i headers=%o', async (status, headers, errorText) => {
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(createResponse({ headers, status }))

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).rejects.toThrow(
      errorText
    )
    expect(harness.writePdf).not.toHaveBeenCalled()
  })

  it('只把验证过的响应体与 25 MiB 限额交给原子写入器', async () => {
    /** @brief 最终 PDF 响应 / Final PDF response. */
    const response = createResponse({ headers: { 'content-length': '4' } })
    /** @brief 当前测试依赖 / Dependencies for this test. */
    const harness = createDependencies(response)

    await expect(savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies)).resolves.toEqual({
      status: 'saved'
    })
    expect(harness.showSaveDialog).toHaveBeenCalledWith('Klee Resume.pdf')
    expect(harness.writePdf).toHaveBeenCalledTimes(1)
    /** @brief 交给原子写入器的参数 / Arguments passed to the atomic writer. */
    const writeCall = harness.writePdf.mock.calls[0]
    expect(writeCall?.[0]).toBe('/tmp/resume.pdf')
    expect(writeCall?.[1]).toBe(response.body)
    expect(writeCall?.[2]).toBe(MAX_PDF_BYTES)
    expect(writeCall?.[3]).toBeInstanceOf(AbortSignal)
  })

  it('总时限到达时中止 renderer session fetch', async () => {
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
      harness.fetch.mockImplementation(
        (_url: string, init: { readonly signal: AbortSignal }): Promise<ArtifactFetchResponse> => {
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
        }
      )

      /** @brief 受短截止时间保护的保存操作 / Save operation protected by a short deadline. */
      const operation = savePdfArtifact(validRequest, API_ORIGIN, harness.dependencies, 25)
      /** @brief 在计时推进前即安装的失败断言 / Rejection assertion installed before advancing time. */
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
