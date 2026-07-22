import { describe, expect, it, vi } from 'vitest'

import { createApiV2Client, type ApiV2TransportProfile } from './client'
import { ApiV2AuthenticationRequiredError, ApiV2ContractError } from './errors'
import { ApiV2ProblemError } from './problem-error'

/** @brief 测试使用的非真实 Bearer token / Non-real Bearer token used by tests. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/** @brief 测试使用的请求 ID / Request ID used by tests. */
const REQUEST_ID = 'req_response_12345678'

/**
 * @brief 构造带 v2 必需响应头的 JSON Response / Build a JSON Response with required v2 headers.
 * @param body JSON body / JSON body.
 * @param init Response 初始化参数 / Response initialization.
 * @return 可供 fetch double 返回的响应 / Response suitable for a fetch double.
 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  /** @brief 合并后的响应头 / Merged response headers. */
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-Id', REQUEST_ID)
  return new Response(JSON.stringify(body), { ...init, headers })
}

/**
 * @brief 构造完整合法的 v2 ProblemDetails / Build complete valid v2 ProblemDetails.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return v2 Problem JSON / v2 Problem JSON.
 */
function problemDetails(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    code: 'quota.rate_limited',
    detail: 'Diagnostic detail that clients must not parse.',
    errors: [
      {
        code: 'rate_limited',
        message_key: 'errors.rate_limited',
        params: { limit: 10 },
        pointer: ''
      }
    ],
    extensions: { 'org.hmalliances.retry': true },
    instance: '/api/v2/workspaces',
    request_id: REQUEST_ID,
    retryable: true,
    status: 429,
    title: 'Rate limit exceeded',
    type: 'https://api.hmalliances.org:8022/problems/quota/rate-limited',
    ...overrides
  }
}

describe('createApiV2Client', (): void => {
  it('sends Bearer and correlation headers only to the workspace-scoped v2 URL', async (): Promise<void> => {
    /** @brief 返回成功 JSON 的网络替身 / Network double returning successful JSON. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [] }))
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      acceptLanguage: 'zh-CN',
      createRequestId: (): string => 'req_outbound_12345678',
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    await client.getJson('/workspaces/ws_12345678/resumes', {
      query: { cursor: null, limit: 200 }
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes?limit=200',
      expect.objectContaining({
        credentials: 'omit',
        headers: {
          'Accept-Language': 'zh-CN',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'X-Request-Id': 'req_outbound_12345678'
        },
        method: 'GET',
        redirect: 'error'
      })
    )
  })

  it('requires the exact explicit profile before using the controlled test origin', async (): Promise<void> => {
    /** @brief 返回成功 JSON 的网络替身 / Network double returning successful JSON. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    /** @brief 显式受控测试 client / Explicit controlled-test client. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN,
      transportProfile: {
        apiOrigin: 'http://dev.hmalliances.org:9000',
        kind: 'controlled-test'
      }
    })

    await client.getJson('/me')

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://dev.hmalliances.org:9000/api/v2/me',
      expect.any(Object)
    )
  })

  it('rejects an arbitrary HTTPS origin instead of sending a Bearer token', (): void => {
    /** @brief 绕过静态类型模拟不可信运行时配置 / Untrusted runtime configuration bypassing static types. */
    const invalidProfile = {
      apiOrigin: 'https://attacker.example',
      kind: 'controlled-test'
    } as unknown as ApiV2TransportProfile

    expect(() =>
      createApiV2Client({
        getAccessToken: (): string => ACCESS_TOKEN,
        transportProfile: invalidProfile
      })
    ).toThrow(ApiV2ContractError)
  })

  it('fails before fetch when the in-memory session has no token', async (): Promise<void> => {
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 无凭证 v2 client / Unauthenticated v2 client. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): null => null
    })

    await expect(client.getJson('/me')).rejects.toBeInstanceOf(ApiV2AuthenticationRequiredError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps a valid Problem and Retry-After header without parsing detail', async (): Promise<void> => {
    /** @brief 合法 Problem 响应头 / Valid Problem response headers. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'Retry-After': '120',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回 429 Problem 的网络替身 / Network double returning a 429 Problem. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(problemDetails()), { headers, status: 429 }))
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    /** @brief 捕获的结构化错误 / Captured structured error. */
    const error = await client.getJson('/workspaces').catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiV2ProblemError)
    expect(error).toMatchObject({
      problem: { code: 'quota.rate_limited', request_id: REQUEST_ID, status: 429 },
      retryAfterMilliseconds: 120_000
    })
  })

  it('rejects the old v1 violations and retry_after_ms shape', async (): Promise<void> => {
    /** @brief v1 Problem 伪装响应头 / Headers for the disguised v1 Problem. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回 v1-only 字段的网络替身 / Network double returning v1-only fields. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify(problemDetails({ errors: undefined, retry_after_ms: 10, violations: [] })),
          { headers, status: 429 }
        )
      )
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    await expect(client.getJson('/workspaces')).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('requires the protected-resource challenge on 401', async (): Promise<void> => {
    /** @brief 缺失 WWW-Authenticate 的 401 headers / 401 headers missing WWW-Authenticate. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回不完整 401 的网络替身 / Network double returning an incomplete 401. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          problemDetails({
            code: 'auth.invalid_token',
            errors: [],
            retryable: false,
            status: 401,
            title: 'Unauthorized'
          })
        ),
        { headers, status: 401 }
      )
    )
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      name: 'ApiV2ContractError',
      status: 401
    })
  })

  it('accepts a complete v2 Bearer challenge on 401', async (): Promise<void> => {
    /** @brief 完整 401 headers / Complete 401 headers. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate':
        'Bearer resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource"',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回完整 401 的网络替身 / Network double returning a complete 401. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          problemDetails({
            code: 'auth.invalid_token',
            errors: [],
            retryable: false,
            status: 401,
            title: 'Unauthorized'
          })
        ),
        { headers, status: 401 }
      )
    )
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      name: 'ApiV2ProblemError',
      problem: { code: 'auth.invalid_token', status: 401 }
    })
  })

  it('binds resource_metadata to Bearer within a multi-challenge header', async (): Promise<void> => {
    /** @brief 多认证方案 401 headers / 401 headers containing multiple authentication schemes. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate':
        'Basic realm="legacy", Bearer error="invalid_token", resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource"',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回多 challenge 401 的网络替身 / Network double returning a multi-challenge 401. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          problemDetails({
            code: 'auth.invalid_token',
            errors: [],
            retryable: false,
            status: 401,
            title: 'Unauthorized'
          })
        ),
        { headers, status: 401 }
      )
    )

    await expect(
      createApiV2Client({ fetchImpl, getAccessToken: (): string => ACCESS_TOKEN }).getJson('/me')
    ).rejects.toBeInstanceOf(ApiV2ProblemError)
  })

  it('rejects resource_metadata attached to a different challenge', async (): Promise<void> => {
    /** @brief 把资源元数据错误绑定给 Basic 的 headers / Headers incorrectly binding metadata to Basic. */
    const headers = new Headers({
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate':
        'Basic resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource", Bearer error="invalid_token"',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回错误绑定 challenge 的网络替身 / Network double returning misbound challenges. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          problemDetails({
            code: 'auth.invalid_token',
            errors: [],
            retryable: false,
            status: 401,
            title: 'Unauthorized'
          })
        ),
        { headers, status: 401 }
      )
    )

    await expect(
      createApiV2Client({ fetchImpl, getAccessToken: (): string => ACCESS_TOKEN }).getJson('/me')
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects paths that could escape or redefine the v2 request URL', async (): Promise<void> => {
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN
    })

    await expect(client.getJson('/../../oauth/token')).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(client.getJson('//attacker.example/resumes')).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    await expect(client.getJson('/workspaces/%2e%2e/oauth')).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    await expect(client.getJson('/workspaces/%252e%252e/oauth')).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a declared oversized JSON response before reading its body', async (): Promise<void> => {
    /** @brief 声明超限长度的 success headers / Success headers declaring an oversized body. */
    const headers = new Headers({
      'Content-Length': '4096',
      'Content-Type': 'application/json',
      'X-Request-Id': REQUEST_ID
    })
    /** @brief 返回声明超限响应的网络替身 / Network double returning a declared oversized response. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"small":true}', { headers }))

    await expect(
      createApiV2Client({ fetchImpl, getAccessToken: (): string => ACCESS_TOKEN }).getJson('/me', {
        maxResponseBytes: 128
      })
    ).rejects.toThrow('pre-deserialization byte limit')
  })

  it('stops an unbounded stream when actual bytes exceed the endpoint limit', async (): Promise<void> => {
    /** @brief 无 Content-Length 的超限 JSON body / Oversized JSON body without Content-Length. */
    const body = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(new TextEncoder().encode('{"larger":'))
        controller.enqueue(new TextEncoder().encode('true}'))
        controller.close()
      }
    })
    /** @brief 返回 chunked 风格响应的网络替身 / Network double returning a chunked-style response. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': REQUEST_ID }
      })
    )

    await expect(
      createApiV2Client({ fetchImpl, getAccessToken: (): string => ACCESS_TOKEN }).getJson('/me', {
        maxResponseBytes: 8
      })
    ).rejects.toThrow('pre-deserialization byte limit')
  })

  it('classifies a local deadline without exposing the fetch error', async (): Promise<void> => {
    /** @brief 仅在 AbortSignal 终止时失败的网络替身 / Network double failing only when AbortSignal terminates. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          /** @brief client 注入的请求信号 / Request signal injected by the client. */
          const signal = init?.signal
          if (signal === undefined || signal === null) {
            reject(new Error('Expected a deadline signal.'))
            return
          }
          signal.addEventListener(
            'abort',
            (): void => {
              /** @brief AbortSignal 提供的失败原因 / Failure reason supplied by AbortSignal. */
              const reason: unknown = signal.reason
              reject(
                reason instanceof Error
                  ? reason
                  : new DOMException('The request was aborted.', 'AbortError')
              )
            },
            { once: true }
          )
        })
    )
    /** @brief 使用短截止时间的 v2 client / v2 client using a short deadline. */
    const client = createApiV2Client({
      fetchImpl,
      getAccessToken: (): string => ACCESS_TOKEN,
      timeoutMilliseconds: 5
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      kind: 'timeout',
      name: 'ApiV2NetworkError'
    })
  })
})
