import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import type {
  ApiV2AuthenticatedContentResponse,
  ApiV2AuthenticatedHeaderVisibility
} from '../http/client'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { parseArtifact, type Artifact } from './artifact'
import {
  ARTIFACT_CONTENT_IDLE_TIMEOUT_MILLISECONDS,
  getWorkspaceArtifactContent,
  type AuthenticatedArtifactContentClient
} from './artifact-content'

/** @brief canonical Artifact Workspace ID / Workspace ID of the canonical Artifact. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Artifact ID / ID of the canonical Artifact. */
const ARTIFACT_ID = 'artifact_01K0EXAMPLE000000001'

/** @brief Artifact content 强 ETag / Strong ETag for Artifact content. */
const CONTENT_ETAG = '"artifact-content-sha256-v1"'

/** @brief 字节 01 02 03 04 的 SHA-256 / SHA-256 of bytes 01 02 03 04. */
const FOUR_BYTE_SHA256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'

/** @brief Artifact content 响应 request ID / Request ID for Artifact content responses. */
const REQUEST_ID = 'request_artifact_bytes_1234'

/**
 * @brief 构造四字节的已验证 Artifact metadata / Build validated metadata for a four-byte Artifact.
 * @return 与 canonical identity 一致的 Artifact / Artifact retaining canonical identity.
 */
async function fourByteArtifact(): Promise<Artifact> {
  /** @brief canonical Artifact 的可变拷贝 / Mutable copy of the canonical Artifact. */
  const input = structuredClone(await readCanonicalExample('resume_pdf_artifact')) as Record<
    string,
    unknown
  >
  input.size_bytes = 4
  input.sha256 = FOUR_BYTE_SHA256
  return parseArtifact(input)
}

/**
 * @brief 构造权威空 Artifact metadata / Build authoritative metadata for an empty Artifact.
 * @return SHA-256 与空内容一致的 Artifact / Artifact whose SHA-256 matches empty content.
 */
async function emptyArtifact(): Promise<Artifact> {
  /** @brief canonical Artifact 的可变拷贝 / Mutable copy of the canonical Artifact. */
  const input = structuredClone(await readCanonicalExample('resume_pdf_artifact')) as Record<
    string,
    unknown
  >
  input.size_bytes = 0
  input.sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  return parseArtifact(input)
}

/**
 * @brief 为测试 Response 附加 transport 头可见性事实 / Attach the transport header-visibility fact to a test Response.
 * @param response 待提升的未消费响应 / Unconsumed response to refine.
 * @param headerVisibility 原始 fetch 的响应头可见性 / Header visibility of the original fetch.
 * @return 满足受保护 content 端口的响应 / Response satisfying the protected-content port.
 */
function authenticatedResponse(
  response: Response,
  headerVisibility: ApiV2AuthenticatedHeaderVisibility = 'unfiltered'
): ApiV2AuthenticatedContentResponse {
  Object.defineProperty(response, 'headerVisibility', {
    configurable: false,
    enumerable: true,
    value: headerVisibility,
    writable: false
  })
  return response as ApiV2AuthenticatedContentResponse
}

/**
 * @brief 构造完整或部分 content 响应 / Build a complete or partial content response.
 * @param status HTTP 成功状态 / HTTP success status.
 * @param body 响应字节 / Response bytes.
 * @param overrides 响应头覆盖 / Response-header overrides.
 * @param headerVisibility 原始 fetch 的响应头可见性 / Header visibility of the original fetch.
 * @return 未消费且携带 transport 可见性事实的响应 / Unconsumed response carrying the transport visibility fact.
 */
function contentResponse(
  status: 200 | 206,
  body: Uint8Array | null,
  overrides: Readonly<Record<string, string | null>> = {},
  headerVisibility: ApiV2AuthenticatedHeaderVisibility = 'unfiltered'
): ApiV2AuthenticatedContentResponse {
  /** @brief 基础安全响应头 / Baseline safe response headers. */
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'Content-Length': String(body?.byteLength ?? 0),
    'Content-Type': 'application/pdf',
    ETag: CONTENT_ETAG,
    'X-Request-Id': REQUEST_ID
  })
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name)
    else headers.set(name, value)
  }
  /** @brief 脱离任何 SharedArrayBuffer 的 fetch body / Fetch body detached from any SharedArrayBuffer. */
  const responseBody = body === null ? null : Uint8Array.from(body).buffer
  /** @brief transport 已限制大小的测试响应 / Test response whose size was bounded by the transport. */
  return authenticatedResponse(new Response(responseBody, { headers, status }), headerVisibility)
}

describe('API v2 Artifact content consumer', (): void => {
  it('returns a complete authenticated stream without exposing the protected URL', async (): Promise<void> => {
    /** @brief 受保护 content transport / Protected content transport. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, new Uint8Array([1, 2, 3, 4])))
    /** @brief 完整 content 读取结果 / Complete-content read result. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    expect(result).toMatchObject({
      acceptsByteRanges: true,
      expectedSha256: FOUR_BYTE_SHA256,
      disposition: 'inline',
      entityTag: CONTENT_ETAG,
      expectedByteLength: 4,
      kind: 'complete',
      mediaType: 'application/pdf',
      requestId: REQUEST_ID,
      status: 200
    })
    expect(result.body).toBeInstanceOf(ReadableStream)
    expect(getAuthenticatedContent).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: null, maxResponseBytes: 4, range: null }
    )
  })

  it('defaults a CORS-filtered Content-Disposition to safe attachment semantics', async (): Promise<void> => {
    /** @brief 模拟浏览器 CORS 过滤后不可见 Content-Disposition 的响应 / Response simulating a Content-Disposition hidden by browser CORS filtering. */
    const response = contentResponse(
      200,
      new Uint8Array([1, 2, 3, 4]),
      {
        'Content-Disposition': null
      },
      'cors-filtered'
    )
    /** @brief 返回 CORS-filtered 响应的 transport / Transport returning the CORS-filtered response. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).resolves.toMatchObject({ disposition: 'attachment', kind: 'complete' })
  })

  it('cancels a body that makes no progress before the stream idle deadline', async (): Promise<void> => {
    vi.useFakeTimers()
    try {
      /** @brief 永不产出 chunk 或 EOF 的恶意 body / Malicious body that never produces a chunk or EOF. */
      const stalledBody = new ReadableStream<Uint8Array>({
        pull: (): Promise<void> => new Promise((): void => undefined)
      })
      /** @brief 带合法响应头但停滞 body 的响应 / Response with valid headers and a stalled body. */
      const response = contentResponse(200, new Uint8Array([1, 2, 3, 4]))
      Object.defineProperty(response, 'body', { configurable: true, value: stalledBody })
      /** @brief 返回停滞响应的 transport / Transport returning the stalled response. */
      const getAuthenticatedContent = vi
        .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
        .mockResolvedValue(response)
      /** @brief 带空闲截止的验证流 / Validating stream carrying the idle deadline. */
      const content = await getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
      /** @brief 触发底层 pull 的 reader / Reader triggering the underlying pull. */
      const reader = content.body?.getReader()
      if (reader === undefined) throw new Error('Expected a non-empty Artifact stream.')
      /** @brief 等待超时失败的首次读取 / First read awaiting timeout failure. */
      const reading = reader.read()
      /** @brief 在推进 fake timer 前即注册的拒绝断言 / Rejection assertion registered before advancing the fake timer. */
      const rejection = expect(reading).rejects.toBeInstanceOf(ApiV2ContractError)

      await vi.advanceTimersByTimeAsync(ARTIFACT_CONTENT_IDLE_TIMEOUT_MILLISECONDS)

      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an exact 206 response in the partial branch', async (): Promise<void> => {
    /** @brief 返回合法部分内容的 transport / Transport returning valid partial content. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([2, 3]), { 'Content-Range': 'bytes 1-2/4' })
      )
    /** @brief 部分 content 读取结果 / Partial-content read result. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      {
        artifact: await fourByteArtifact(),
        ifRange: CONTENT_ETAG,
        range: { endByteInclusive: 2, startByte: 1 }
      }
    )

    expect(result).toMatchObject({
      contentRange: { completeSizeBytes: 4, endByteInclusive: 2, startByte: 1 },
      expectedByteLength: 2,
      kind: 'partial',
      status: 206
    })
    expect('expectedSha256' in result).toBe(false)
    expect(getAuthenticatedContent).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: CONTENT_ETAG, maxResponseBytes: 4, range: 'bytes=1-2' }
    )
  })

  it('resolves an open-ended Range against authoritative metadata', async (): Promise<void> => {
    /** @brief 返回 open-ended 区间的 transport / Transport returning an open-ended selection. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([3, 4]), { 'Content-Range': 'bytes 2-3/4' })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact(), range: { startByte: 2 } }
      )
    ).resolves.toMatchObject({
      contentRange: { completeSizeBytes: 4, endByteInclusive: 3, startByte: 2 },
      kind: 'partial'
    })
    expect(getAuthenticatedContent).toHaveBeenCalledWith(expect.any(String), {
      ifRange: null,
      maxResponseBytes: 4,
      range: 'bytes=2-'
    })
  })

  it('accepts a case-insensitive RFC 9110 Content-Range unit', async (): Promise<void> => {
    /** @brief 返回大小写变体 range unit 的 transport / Transport returning a case-variant range unit. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([2, 3]), { 'Content-Range': 'Bytes 1-2/4' })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact(), range: { endByteInclusive: 2, startByte: 1 } }
      )
    ).resolves.toMatchObject({ kind: 'partial' })
  })

  it('keeps an RFC 9110 If-Range fallback as a validated complete response', async (): Promise<void> => {
    /** @brief If-Range 不匹配后返回完整新表示的 transport / Transport returning a complete new representation after an If-Range mismatch. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(200, new Uint8Array([1, 2, 3, 4]), {
          ETag: '"artifact-content-sha256-v2"'
        })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          ifRange: CONTENT_ETAG,
          range: { endByteInclusive: 2, startByte: 1 }
        }
      )
    ).resolves.toMatchObject({
      entityTag: '"artifact-content-sha256-v2"',
      expectedByteLength: 4,
      kind: 'complete',
      status: 200
    })
  })

  it.each([
    ['unsolicited 206', 206, { 'Content-Range': 'bytes 0-3/4' }, {}],
    [
      'mismatched Content-Range start',
      206,
      { 'Content-Length': '2', 'Content-Range': 'bytes 0-1/4' },
      { range: { endByteInclusive: 2, startByte: 1 } }
    ],
    [
      'mismatched Content-Range total',
      206,
      { 'Content-Length': '2', 'Content-Range': 'bytes 1-2/5' },
      { range: { endByteInclusive: 2, startByte: 1 } }
    ]
  ])('rejects %s', async (_name, status, headerOverrides, requestOverrides): Promise<void> => {
    /** @brief 为状态反例生成的字节 / Bytes generated for a status negative case. */
    const bytes = status === 200 ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([2, 3])
    /** @brief 返回非法响应的 transport / Transport returning an invalid response. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(status as 200 | 206, bytes, headerOverrides))

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact(), ...requestOverrides }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    ['wrong media type', { 'Content-Type': 'application/octet-stream' }],
    ['wrong length', { 'Content-Length': '3' }],
    ['weak ETag', { ETag: `W/${CONTENT_ETAG}` }],
    ['missing disposition', { 'Content-Disposition': null }],
    [
      'duplicate disposition parameters',
      { 'Content-Disposition': 'attachment; filename=a.pdf; FILENAME=b.pdf' }
    ],
    ['unexpected Content-Range', { 'Content-Range': 'bytes 0-3/4' }]
  ])('rejects a complete response with %s', async (_name, overrides): Promise<void> => {
    /** @brief 返回 header 反例的 transport / Transport returning a header negative case. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, new Uint8Array([1, 2, 3, 4]), overrides))

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('fails closed on a non-identity Content-Encoding', async (): Promise<void> => {
    /** @brief 返回内容编码响应的 transport / Transport returning a content-coded response. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(200, new Uint8Array([1, 2, 3, 4]), { 'Content-Encoding': 'gzip' })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('cancels an unlocked body when domain header validation fails', async (): Promise<void> => {
    /** @brief 领域拒绝后观察到的上游取消 / Upstream cancellation observed after domain rejection. */
    let cancelled = false
    /** @brief 保持打开直到被取消的响应体 / Response body kept open until cancellation. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 记录协议失败后的取消 / Record cancellation after protocol failure. */
      cancel(): void {
        cancelled = true
      },
      /** @brief 发出合法长度的首个 chunk / Emit the first correctly sized chunk. */
      start(controller): void {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]))
      }
    })
    /** @brief 带错误媒体类型的响应 / Response carrying the wrong media type. */
    const response = authenticatedResponse(
      new Response(body, {
        headers: {
          'Content-Disposition': 'inline',
          'Content-Type': 'application/octet-stream',
          ETag: CONTENT_ETAG,
          'X-Request-Id': REQUEST_ID
        },
        status: 200
      })
    )
    /** @brief 返回协议错误响应的 transport / Transport returning the invalid response. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await vi.waitFor((): void => expect(cancelled).toBe(true))
  })

  it('rejects a 206 representation whose ETag differs from If-Range', async (): Promise<void> => {
    /** @brief 返回不同 content validator 的 transport / Transport returning a different content validator. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([2, 3]), {
          'Content-Range': 'bytes 1-2/4',
          ETag: '"different-artifact-representation"'
        })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          ifRange: CONTENT_ETAG,
          range: { endByteInclusive: 2, startByte: 1 }
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects an out-of-bounds request before dispatch', async (): Promise<void> => {
    /** @brief 不应被调用的 transport / Transport that must not be called. */
    const getAuthenticatedContent =
      vi.fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          range: { endByteInclusive: 4, startByte: 1 }
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getAuthenticatedContent).not.toHaveBeenCalled()
  })

  it('rejects a consumed response body before handing out its stream', async (): Promise<void> => {
    /** @brief 即将被预先消费的响应 / Response that will be consumed in advance. */
    const response = contentResponse(200, new Uint8Array([1, 2, 3, 4]))
    await response.arrayBuffer()
    /** @brief 返回已消费 body 的 transport / Transport returning an already consumed body. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    ['shorter', new Uint8Array([1, 2, 3])],
    ['longer', new Uint8Array([1, 2, 3, 4, 5])]
  ])('fails the stream when the actual body is %s than metadata', async (_name, bytes) => {
    /** @brief 返回无 Content-Length 字节反例的 transport / Transport returning a byte-count negative case without Content-Length. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, bytes, { 'Content-Length': null }))
    /** @brief 头部验证成功后的计数 stream / Counting stream after header validation succeeds. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    expect(result.body).not.toBeNull()
    await expect(new Response(result.body).arrayBuffer()).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('fails the stream at EOF when complete bytes do not match metadata SHA-256', async (): Promise<void> => {
    /** @brief 返回等长错误字节的 transport / Transport returning wrong bytes of the correct length. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, new Uint8Array([4, 3, 2, 1])))
    /** @brief header 校验通过但完整性尚待 EOF 的结果 / Result whose headers pass while integrity awaits EOF. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    expect(result.body).not.toBeNull()
    await expect(new Response(result.body).arrayBuffer()).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('verifies SHA-256 across arbitrary response chunk boundaries', async (): Promise<void> => {
    /** @brief 分三段发出的完整内容 / Complete content emitted in three chunks. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 发出跨 hash block API 边界的 chunks / Emit chunks across digest update boundaries. */
      start(controller): void {
        controller.enqueue(new Uint8Array([1]))
        controller.enqueue(new Uint8Array([2, 3]))
        controller.enqueue(new Uint8Array([4]))
        controller.close()
      }
    })
    /** @brief 没有 Content-Length 的合法流式响应 / Valid streaming response without Content-Length. */
    const response = authenticatedResponse(
      new Response(body, {
        headers: {
          'Content-Disposition': 'inline',
          'Content-Type': 'application/pdf',
          ETag: CONTENT_ETAG,
          'X-Request-Id': REQUEST_ID
        },
        status: 200
      })
    )
    /** @brief 返回分块 body 的 transport / Transport returning the chunked body. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)
    /** @brief 带 EOF 完整性验证的结果 / Result carrying EOF integrity verification. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    await expect(new Response(result.body).arrayBuffer()).resolves.toHaveProperty('byteLength', 4)
  })

  it('verifies an empty Artifact even when fetch exposes no body stream', async (): Promise<void> => {
    /** @brief 合法空内容响应 / Valid empty-content response. */
    const response = contentResponse(200, null)
    /** @brief 返回空内容的 transport / Transport returning empty content. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)

    await expect(
      getWorkspaceArtifactContent({ getAuthenticatedContent }, { artifact: await emptyArtifact() })
    ).resolves.toMatchObject({ body: null, expectedByteLength: 0, kind: 'complete' })
  })
})
