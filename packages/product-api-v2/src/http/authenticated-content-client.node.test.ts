import { describe, expect, it, vi } from 'vitest'

import { getWorkspaceArtifactContent } from '../artifacts/artifact-content'
import { parseArtifact, type Artifact } from '../artifacts/artifact'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import type { ApiV2AuthenticationPort } from './authentication'
import { createApiV2Client } from './client'
import { ApiV2ContractError } from './errors'
import type { ApiV2NetworkError } from './errors'

/** @brief 测试用初始 Access Token / Initial test access token. */
const ACCESS_TOKEN = 'access_binary_example_only_not_real_7Yw8N2'

/** @brief 401 后安装的测试 Access Token / Test access token installed after a 401. */
const REFRESHED_ACCESS_TOKEN = 'access_binary_refreshed_not_real_9Za1K4'

/** @brief canonical Artifact Workspace ID / Workspace ID of the canonical Artifact. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Artifact ID / ID of the canonical Artifact. */
const ARTIFACT_ID = 'artifact_01K0EXAMPLE000000001'

/** @brief Artifact content 强 ETag / Strong ETag for Artifact content. */
const CONTENT_ETAG = '"artifact-content-sha256-v1"'

/** @brief 字节 01 02 03 04 的 SHA-256 / SHA-256 of bytes 01 02 03 04. */
const FOUR_BYTE_SHA256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'

/** @brief 二进制响应 request ID / Request ID for binary responses. */
const RESPONSE_REQUEST_ID = 'request_binary_response_1234'

/** @brief API v2 固定 Bearer challenge / Frozen API v2 Bearer challenge. */
const BEARER_CHALLENGE =
  'Bearer resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource"'

/**
 * @brief 构造固定 token 的认证端口 / Build an authentication port with a fixed token.
 * @param accessToken 当前内存 token / Current in-memory token.
 * @return 不改变凭证的完整认证端口 / Complete authentication port that does not mutate credentials.
 */
function fixedAuthentication(accessToken: string | null = ACCESS_TOKEN): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string | null => accessToken,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/**
 * @brief 构造四字节的 canonical Artifact metadata / Build canonical Artifact metadata for four bytes.
 * @return 严格解码的 Artifact / Strictly decoded Artifact.
 */
async function fourByteArtifact(): Promise<Artifact> {
  /** @brief canonical 示例的可变拷贝 / Mutable copy of the canonical example. */
  const input = structuredClone(await readCanonicalExample('resume_pdf_artifact')) as Record<
    string,
    unknown
  >
  input.size_bytes = 4
  input.sha256 = FOUR_BYTE_SHA256
  return parseArtifact(input)
}

/**
 * @brief 构造带严格 Artifact headers 的二进制响应 / Build a binary response with strict Artifact headers.
 * @param status 完整或部分成功状态 / Complete or partial success status.
 * @param bytes 不透明 body 字节 / Opaque body bytes.
 * @param overrides 响应头覆盖 / Response-header overrides.
 * @return 未消费的 fetch Response / Unconsumed fetch Response.
 */
function binaryResponse(
  status: 200 | 206,
  bytes: Uint8Array,
  overrides: Readonly<Record<string, string | null>> = {}
): Response {
  /** @brief 默认严格响应头 / Default strict response headers. */
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'Content-Length': String(bytes.byteLength),
    'Content-Type': 'application/pdf',
    ETag: CONTENT_ETAG,
    'X-Request-Id': RESPONSE_REQUEST_ID
  })
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name)
    else headers.set(name, value)
  }
  return new Response(Uint8Array.from(bytes).buffer, { headers, status })
}

/**
 * @brief 构造完整 RFC 9457 Problem 响应 / Build a complete RFC 9457 Problem response.
 * @param status HTTP 错误状态 / HTTP error status.
 * @param requestId 响应 request ID / Response request ID.
 * @return 可供认证生命周期消费的 Problem / Problem consumable by the authentication lifecycle.
 */
function problemResponse(status: 401 | 404, requestId: string): Response {
  /** @brief Problem 响应头 / Problem response headers. */
  const headers = new Headers({
    'Content-Type': 'application/problem+json',
    'X-Request-Id': requestId
  })
  if (status === 401) headers.set('WWW-Authenticate', BEARER_CHALLENGE)
  return new Response(
    JSON.stringify({
      code: status === 401 ? 'auth.invalid_token' : 'artifact.not_found',
      detail: 'Diagnostic detail that must remain structured.',
      errors: [],
      extensions: {},
      instance: `/api/v2/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      request_id: requestId,
      retryable: false,
      status,
      title: status === 401 ? 'Unauthorized' : 'Artifact not found',
      type: `https://api.hmalliances.org:8022/problems/artifact/status-${status}`
    }),
    { headers, status }
  )
}

/**
 * @brief 完整消费二进制响应 / Fully consume a binary response.
 * @param response 有界二进制响应 / Bounded binary response.
 * @return 与原始 body 等长的字节数组 / Byte array equal in length to the original body.
 */
async function responseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer())
}

describe('API v2 authenticated Artifact content transport', (): void => {
  it('uses the existing Bearer boundary while keeping successful bytes opaque', async (): Promise<void> => {
    /** @brief 不构成有效 JSON 或 UTF-8 文本的 body / Body that is neither valid JSON nor valid UTF-8 text. */
    const bytes = new Uint8Array([0xff, 0x00, 0xc3, 0x28])
    /** @brief 返回不透明二进制内容的 fetch 替身 / Fetch double returning opaque binary content. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(binaryResponse(200, bytes))
    /** @brief 被测受保护客户端 / Protected client under test. */
    const client = createApiV2Client({
      acceptLanguage: 'zh-CN',
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'request_binary_outbound_123',
      fetchImpl
    })

    /** @brief transport 返回的未解码响应 / Undecoded response returned by the transport. */
    const response = await client.getAuthenticatedContent(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: null, maxResponseBytes: 4, range: null }
    )

    await expect(responseBytes(response)).resolves.toEqual(bytes)
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      expect.objectContaining({
        credentials: 'omit',
        headers: {
          'Accept-Language': 'zh-CN',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'X-Request-Id': 'request_binary_outbound_123'
        },
        method: 'GET',
        redirect: 'error'
      })
    )
  })

  it('satisfies the Artifact structural port with exact Range and Content-Range semantics', async (): Promise<void> => {
    /** @brief 返回所请求闭区间的 fetch 替身 / Fetch double returning the requested closed interval. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      binaryResponse(206, new Uint8Array([2, 3]), {
        'Content-Range': 'bytes 1-2/4'
      })
    )
    /** @brief 带真实二进制能力的完整 API client / Complete API client with real binary capability. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      fetchImpl
    })

    /** @brief 经 metadata 和 wire headers 双重验证的结果 / Result validated against both metadata and wire headers. */
    const result = await getWorkspaceArtifactContent(client, {
      artifact: await fourByteArtifact(),
      ifRange: CONTENT_ETAG,
      range: { endByteInclusive: 2, startByte: 1 }
    })

    expect(result).toMatchObject({
      contentRange: { completeSizeBytes: 4, endByteInclusive: 2, startByte: 1 },
      expectedByteLength: 2,
      kind: 'partial',
      mediaType: 'application/pdf',
      status: 206
    })
    /** @brief 实际发送的请求头 / Request headers actually dispatched. */
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Range')).toBe('bytes=1-2')
    expect(headers.get('If-Range')).toBe(CONTENT_ETAG)
    expect(result.body).not.toBeNull()
    await expect(new Response(result.body).arrayBuffer()).resolves.toHaveProperty('byteLength', 2)
  })

  it('permits an RFC 9110 Range fallback to the metadata-bounded complete representation', async (): Promise<void> => {
    /** @brief If-Range 不匹配后返回完整表示的 fetch 替身 / Fetch double returning a complete representation after an If-Range mismatch. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      binaryResponse(200, new Uint8Array([1, 2, 3, 4]), {
        ETag: '"artifact-content-sha256-v2"'
      })
    )
    /** @brief 带真实二进制能力的完整 API client / Complete API client with real binary capability. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      getWorkspaceArtifactContent(client, {
        artifact: await fourByteArtifact(),
        ifRange: CONTENT_ETAG,
        range: { endByteInclusive: 2, startByte: 1 }
      })
    ).resolves.toMatchObject({
      entityTag: '"artifact-content-sha256-v2"',
      expectedByteLength: 4,
      kind: 'complete',
      status: 200
    })
  })

  it('replays the same binary intent once after a strict 401 refresh', async (): Promise<void> => {
    /** @brief 刷新前后的内存 token / In-memory token before and after refresh. */
    let accessToken = ACCESS_TOKEN
    /** @brief 刷新调用观察器 / Refresh-call observer. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>(
      (request): Promise<void> => {
        expect(request.rejectedAccessToken).toBe(ACCESS_TOKEN)
        expect(request.signal).toBeInstanceOf(AbortSignal)
        accessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    )
    /** @brief 可原子替换内存 token 的认证端口 / Authentication port that atomically replaces its in-memory token. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => accessToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken
    }
    /** @brief 每次尝试生成不同 request ID 的序列 / Sequence producing a distinct request ID per attempt. */
    const requestIds = ['request_binary_attempt_123', 'request_binary_retry_1234']
    /** @brief 先拒绝旧 token、再返回 content 的 fetch 替身 / Fetch double rejecting the old token before returning content. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(problemResponse(401, 'request_binary_unauth_123'))
      .mockResolvedValueOnce(
        binaryResponse(206, new Uint8Array([2, 3]), {
          'Content-Range': 'bytes 1-2/4'
        })
      )
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({
      authentication,
      createRequestId: (): string => requestIds.shift() ?? 'request_binary_extra_1234',
      fetchImpl
    })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: CONTENT_ETAG, maxResponseBytes: 4, range: 'bytes=1-2' }
      )
    ).resolves.toMatchObject({ status: 206 })

    expect(refreshAccessToken).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    /** @brief 首次尝试请求头 / First-attempt request headers. */
    const firstHeaders = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    /** @brief 认证重放请求头 / Authentication-replay request headers. */
    const retryHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers)
    expect(firstHeaders.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(retryHeaders.get('Authorization')).toBe(`Bearer ${REFRESHED_ACCESS_TOKEN}`)
    expect(firstHeaders.get('X-Request-Id')).not.toBe(retryHeaders.get('X-Request-Id'))
    expect(firstHeaders.get('Range')).toBe(retryHeaders.get('Range'))
    expect(firstHeaders.get('If-Range')).toBe(retryHeaders.get('If-Range'))
  })

  it('decodes a non-success body only as RFC 9457 Problem details', async (): Promise<void> => {
    /** @brief 返回 Artifact not-found Problem 的 fetch 替身 / Fetch double returning an Artifact not-found Problem. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(problemResponse(404, 'request_binary_missing_123'))
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toMatchObject({
      problem: {
        code: 'artifact.not_found',
        request_id: 'request_binary_missing_123',
        status: 404
      }
    })
  })

  it('rejects an oversized declared body before exposing its stream', async (): Promise<void> => {
    /** @brief 声明五字节 body 的 fetch 替身 / Fetch double declaring a five-byte body. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(binaryResponse(200, new Uint8Array([1, 2, 3, 4, 5])))
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('cancels an oversized declared success body without masking the contract error', async (): Promise<void> => {
    /** @brief 是否观察到 transport 主动取消 / Whether transport cancellation was observed. */
    let cancelled = false
    /** @brief 直到协议校验失败才终止的 body / Body terminated only after protocol validation fails. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 记录响应体取消 / Record response-body cancellation. */
      cancel(): void {
        cancelled = true
      },
      /** @brief 发出首个字节并保持打开 / Emit one byte and remain open. */
      start(controller): void {
        controller.enqueue(new Uint8Array([1]))
      }
    })
    /** @brief 声明超过端点上限的响应 / Response declaring more than the endpoint ceiling. */
    const response = new Response(body, {
      headers: {
        'Content-Length': '5',
        'Content-Type': 'application/pdf',
        'X-Request-Id': RESPONSE_REQUEST_ID
      },
      status: 200
    })
    /** @brief 返回超限响应的 fetch 替身 / Fetch double returning the oversized response. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await vi.waitFor((): void => expect(cancelled).toBe(true))
  })

  it('cancels an error body when RFC 9457 media-type validation fails', async (): Promise<void> => {
    /** @brief 是否观察到错误 body 取消 / Whether error-body cancellation was observed. */
    let cancelled = false
    /** @brief 保持打开的非 Problem body / Open non-Problem body. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 记录错误响应清理 / Record error-response cleanup. */
      cancel(): void {
        cancelled = true
      },
      /** @brief 发出非 JSON 字节 / Emit non-JSON bytes. */
      start(controller): void {
        controller.enqueue(new Uint8Array([0xff]))
      }
    })
    /** @brief 媒体类型错误的 404 / 404 carrying the wrong media type. */
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Request-Id': 'request_binary_bad_problem_123'
      },
      status: 404
    })
    /** @brief 返回错误 body 的 fetch 替身 / Fetch double returning the invalid error body. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await vi.waitFor((): void => expect(cancelled).toBe(true))
  })

  it('cancels a 401 body before refresh when its required Bearer challenge is missing', async (): Promise<void> => {
    /** @brief 是否观察到未认证响应体取消 / Whether unauthorized-body cancellation was observed. */
    let cancelled = false
    /** @brief 不应被消费或重放的 401 body / 401 body that must neither be consumed nor replayed. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 记录 challenge 校验失败后的取消 / Record cancellation after challenge validation fails. */
      cancel(): void {
        cancelled = true
      },
      /** @brief 发出任意 Problem 候选字节 / Emit arbitrary candidate Problem bytes. */
      start(controller): void {
        controller.enqueue(new TextEncoder().encode('{}'))
      }
    })
    /** @brief 故意缺失 WWW-Authenticate 的 401 / 401 deliberately missing WWW-Authenticate. */
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Request-Id': 'request_binary_bad_challenge_123'
      },
      status: 401
    })
    /** @brief 不得调用的 refresh 观察器 / Refresh observer that must not be called. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>()
    /** @brief 带 refresh 观察器的认证端口 / Authentication port carrying the refresh observer. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => ACCESS_TOKEN,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken
    }
    /** @brief 返回不完整 401 的 fetch 替身 / Fetch double returning the incomplete 401. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication, fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    await vi.waitFor((): void => expect(cancelled).toBe(true))
  })

  it('rejects and cancels a non-identity encoded success response', async (): Promise<void> => {
    /** @brief 是否观察到编码响应取消 / Whether encoded-response cancellation was observed. */
    let cancelled = false
    /** @brief 不应交给调用方的编码响应体 / Encoded response body that must not reach the caller. */
    const body = new ReadableStream<Uint8Array>({
      /** @brief 记录内容编码失败后的取消 / Record cancellation after content-coding rejection. */
      cancel(): void {
        cancelled = true
      },
      /** @brief 发出任意编码字节 / Emit arbitrary coded bytes. */
      start(controller): void {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]))
      }
    })
    /** @brief 带 gzip Content-Encoding 的响应 / Response carrying gzip Content-Encoding. */
    const response = new Response(body, {
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/pdf',
        'X-Request-Id': RESPONSE_REQUEST_ID
      },
      status: 200
    })
    /** @brief 返回编码响应的 fetch 替身 / Fetch double returning the encoded response. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        { ifRange: null, maxResponseBytes: 4, range: null }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await vi.waitFor((): void => expect(cancelled).toBe(true))
  })

  it('fails an undeclared streaming body as soon as it crosses the byte ceiling', async (): Promise<void> => {
    /** @brief 隐去 Content-Length 的五字节响应 / Five-byte response omitting Content-Length. */
    const response = binaryResponse(200, new Uint8Array([1, 2, 3, 4, 5]), {
      'Content-Length': null
    })
    /** @brief 返回长度未知内容的 fetch 替身 / Fetch double returning content of unknown length. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })
    /** @brief headers 阶段通过后的有界响应 / Bounded response after header validation. */
    const result = await client.getAuthenticatedContent(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: null, maxResponseBytes: 4, range: null }
    )

    await expect(result.arrayBuffer()).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('propagates caller cancellation into a content stream after headers arrive', async (): Promise<void> => {
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const abortController = new AbortController()
    /** @brief 记录上游是否收到 stream cancellation / Whether the upstream stream observed cancellation. */
    let upstreamCancelled = false
    /** @brief 只发送首字节并保持打开的源流 / Source stream that emits one byte and remains open. */
    const source = new ReadableStream<Uint8Array>({
      /**
       * @brief 发出首字节但不结束 / Emit the first byte without closing.
       * @param controller 原始源流控制器 / Original source-stream controller.
       * @return 无返回值 / No value.
       */
      start(controller): void {
        controller.enqueue(new Uint8Array([1]))
      },
      /**
       * @brief 观察下游取消 / Observe downstream cancellation.
       * @return 无返回值 / No value.
       */
      cancel(): void {
        upstreamCancelled = true
      }
    })
    /** @brief 慢速二进制响应 / Slow binary response. */
    const response = new Response(source, {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Request-Id': RESPONSE_REQUEST_ID
      },
      status: 200
    })
    /** @brief 返回慢速流的 fetch 替身 / Fetch double returning the slow stream. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })
    /** @brief transport 包装后的 reader / Reader wrapped by the transport. */
    const reader = (
      await client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        {
          ifRange: null,
          maxResponseBytes: 4,
          range: null,
          signal: abortController.signal
        }
      )
    ).body?.getReader()
    if (reader === undefined) throw new Error('Expected a binary response stream.')

    await expect(reader.read()).resolves.toMatchObject({ done: false })
    abortController.abort(new DOMException('Caller cancelled download.', 'AbortError'))
    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor((): void => expect(upstreamCancelled).toBe(true))
  })

  it('maps cancellation before response headers to the shared network error model', async (): Promise<void> => {
    /** @brief 调用方取消控制器 / Caller cancellation controller. */
    const abortController = new AbortController()
    /** @brief 直到 signal 取消才拒绝的 fetch 替身 / Fetch double rejecting only after its signal aborts. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          /** @brief transport 组合后的取消信号 / Cancellation signal combined by the transport. */
          const signal = init?.signal
          if (signal === null || signal === undefined) {
            reject(new Error('Expected an AbortSignal.'))
            return
          }
          /** @brief 用 signal reason 拒绝网络请求 / Reject the network request with the signal reason. */
          const rejectOnAbort = (): void => {
            /** @brief 保证 Promise 使用 Error 类型拒绝 / Ensure the Promise rejects with an Error. */
            const reason =
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException('The request was aborted.', 'AbortError')
            reject(reason)
          }
          if (signal.aborted) rejectOnAbort()
          else signal.addEventListener('abort', rejectOnAbort, { once: true })
        })
    )
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })
    /** @brief 尚未取得响应头的下载任务 / Download task awaiting response headers. */
    const operation = client.getAuthenticatedContent(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      {
        ifRange: null,
        maxResponseBytes: 4,
        range: null,
        signal: abortController.signal
      }
    )
    abortController.abort()

    await expect(operation).rejects.toMatchObject({
      kind: 'aborted'
    } satisfies Partial<ApiV2NetworkError>)
  })

  it.each([
    ['missing options', undefined],
    ['negative byte limit', { ifRange: null, maxResponseBytes: -1, range: null }],
    [
      'byte limit above the Artifact contract ceiling',
      { ifRange: null, maxResponseBytes: 1024 * 1024 * 1024 + 1, range: null }
    ],
    ['multiple byte ranges', { ifRange: null, maxResponseBytes: 4, range: 'bytes=0-1,2-3' }],
    ['reversed byte range', { ifRange: null, maxResponseBytes: 4, range: 'bytes=3-1' }],
    [
      'closed range exceeding its ceiling',
      { ifRange: null, maxResponseBytes: 1, range: 'bytes=0-1' }
    ],
    ['If-Range without Range', { ifRange: CONTENT_ETAG, maxResponseBytes: 4, range: null }],
    ['weak If-Range', { ifRange: `W/${CONTENT_ETAG}`, maxResponseBytes: 4, range: 'bytes=0-1' }]
  ])('rejects %s before dispatch', async (_name, options): Promise<void> => {
    /** @brief 不应调用的 fetch 替身 / Fetch double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测客户端 / Client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.getAuthenticatedContent(
        `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
        options as never
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
