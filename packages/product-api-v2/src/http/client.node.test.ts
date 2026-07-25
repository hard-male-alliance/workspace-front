import { describe, expect, it, vi } from 'vitest'

import type { ApiV2AuthenticationPort } from './authentication'
import { createApiV2Client, createApiV2PublicClient, type ApiV2TransportProfile } from './client'
import { ApiV2AuthenticationRequiredError, ApiV2ContractError } from './errors'
import { ApiV2ProblemError } from './problem-error'

/** @brief 测试使用的非真实 Bearer token / Non-real Bearer token used by tests. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/** @brief 刷新后的测试 Access Token / Refreshed access token used by tests. */
const REFRESHED_ACCESS_TOKEN = 'access_refreshed_example_only_not_real_9Za1K4'

/** @brief 并发流程安装的更新测试 Access Token / Newer test access token installed by a concurrent flow. */
const NEWER_ACCESS_TOKEN = 'access_newer_example_only_not_real_3Qr6T8'

/** @brief 测试使用的请求 ID / Request ID used by tests. */
const REQUEST_ID = 'req_response_12345678'

/** @brief API v2 固定的完整 Bearer challenge / Frozen complete API v2 Bearer challenge. */
const BEARER_CHALLENGE =
  'Bearer resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource"'

/**
 * @brief 构造固定 token 的完整认证端口 / Build a complete authentication port with a fixed token.
 * @param accessToken 当前内存 token / Current in-memory token.
 * @return 不执行刷新或失效的认证端口 / Authentication port that performs no refresh or invalidation.
 */
function fixedAuthentication(accessToken: string | null): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string | null => accessToken,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

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

/**
 * @brief 构造完整合法的 401 Problem 响应 / Build a complete valid 401 Problem response.
 * @param requestId 响应关联 ID / Response correlation ID.
 * @param challenge WWW-Authenticate 字段 / WWW-Authenticate field.
 * @return 可重复构造的新 401 Response / Fresh 401 Response that can be constructed repeatedly.
 */
function unauthorizedResponse(
  requestId: string = REQUEST_ID,
  challenge: string = BEARER_CHALLENGE
): Response {
  return new Response(
    JSON.stringify(
      problemDetails({
        code: 'auth.invalid_token',
        errors: [],
        request_id: requestId,
        retryable: false,
        status: 401,
        title: 'Unauthorized'
      })
    ),
    {
      headers: {
        'Content-Type': 'application/problem+json',
        'WWW-Authenticate': challenge,
        'X-Request-Id': requestId
      },
      status: 401
    }
  )
}

describe('createApiV2Client', (): void => {
  it('sends Bearer and correlation headers only to the workspace-scoped v2 URL', async (): Promise<void> => {
    /** @brief 返回成功 JSON 的网络替身 / Network double returning successful JSON. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [] }))
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      acceptLanguage: 'zh-CN',
      authentication: fixedAuthentication(ACCESS_TOKEN),
      createRequestId: (): string => 'req_outbound_12345678',
      fetchImpl
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
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl,
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
        authentication: fixedAuthentication(ACCESS_TOKEN),
        transportProfile: invalidProfile
      })
    ).toThrow(ApiV2ContractError)
  })

  it('refreshes before fetch when the in-memory session has no token', async (): Promise<void> => {
    /** @brief 刷新前为空的内存 token / In-memory token absent before refresh. */
    let currentAccessToken: string | null = null
    /** @brief 刷新调用观察器 / Refresh-call observer. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>(
      (request): Promise<void> => {
        expect(request.rejectedAccessToken).toBeNull()
        expect(request.signal).toBeInstanceOf(AbortSignal)
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    )
    /** @brief 首次刷新能力完整的认证端口 / Authentication port with initial-refresh capability. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string | null => currentAccessToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken
    }
    /** @brief 返回成功 JSON 的网络替身 / Network double returning successful JSON. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'me' }))
    /** @brief 无初始凭证的 v2 client / v2 client without an initial credential. */
    const client = createApiV2Client({ authentication, fetchImpl })

    await expect(client.getJson('/me')).resolves.toMatchObject({ data: { id: 'me' } })
    expect(refreshAccessToken).toHaveBeenCalledOnce()
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${REFRESHED_ACCESS_TOKEN}`
    )
  })

  it('fails before fetch when refresh completes without installing a token', async (): Promise<void> => {
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 无凭证 v2 client / Unauthenticated v2 client. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(null),
      fetchImpl
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
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl
    })

    /** @brief 捕获的结构化错误 / Captured structured error. */
    const error = await client.getJson('/workspaces').catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiV2ProblemError)
    expect(error).toMatchObject({
      problem: { code: 'quota.rate_limited', request_id: REQUEST_ID, status: 429 },
      retryAfterMilliseconds: 120_000
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
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
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl
    })

    await expect(client.getJson('/workspaces')).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(fetchImpl).toHaveBeenCalledOnce()
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
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      name: 'ApiV2ContractError',
      status: 401
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('refreshes after one strict 401 and retries the GET once with a new request ID', async (): Promise<void> => {
    /** @brief 当前内存 token / Current in-memory token. */
    let currentAccessToken: string = ACCESS_TOKEN
    /** @brief 各尝试发送的 headers / Headers sent by each attempt. */
    const observedHeaders: Headers[] = []
    /** @brief 各阶段共享的 deadline signal / Deadline signal shared by all phases. */
    const observedSignals: AbortSignal[] = []
    /** @brief 401 后刷新观察器 / Refresh observer after 401. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>(
      (request): Promise<void> => {
        expect(request.rejectedAccessToken).toBe(ACCESS_TOKEN)
        observedSignals.push(request.signal)
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    )
    /** @brief 完整认证端口 / Complete authentication port. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentAccessToken,
      invalidateAccessToken: vi.fn(),
      refreshAccessToken
    }
    /** @brief 首次 401、重试成功的网络替身 / Network double returning 401 then success. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      /** @brief 当前尝试 headers / Headers for the current attempt. */
      const headers = new Headers(init?.headers)
      observedHeaders.push(headers)
      if (init?.signal instanceof AbortSignal) observedSignals.push(init.signal)
      return Promise.resolve(
        observedHeaders.length === 1
          ? unauthorizedResponse('req_unauthorized_first_1234')
          : jsonResponse({ id: 'me' })
      )
    })
    /** @brief 单调请求序号 / Monotonic request ordinal. */
    let requestOrdinal = 0
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      authentication,
      createRequestId: (): string => {
        requestOrdinal += 1
        return `req_outbound_attempt_${requestOrdinal}_12345678`
      },
      fetchImpl
    })

    await expect(client.getJson('/me')).resolves.toMatchObject({ data: { id: 'me' } })
    expect(refreshAccessToken).toHaveBeenCalledOnce()
    expect(observedHeaders.map((headers) => headers.get('Authorization'))).toEqual([
      `Bearer ${ACCESS_TOKEN}`,
      `Bearer ${REFRESHED_ACCESS_TOKEN}`
    ])
    expect(observedHeaders.map((headers) => headers.get('X-Request-Id'))).toEqual([
      'req_outbound_attempt_1_12345678',
      'req_outbound_attempt_2_12345678'
    ])
    expect(new Set(observedSignals).size).toBe(1)
  })

  it('delegates a replaced token race atomically to the authentication provider', async (): Promise<void> => {
    /** @brief 并发替换中的当前 token / Current token during concurrent replacement. */
    let currentAccessToken: string = ACCESS_TOKEN
    /** @brief provider 条件刷新观察器 / Provider conditional-refresh observer. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>(
      (request): Promise<void> => {
        if (currentAccessToken === request.rejectedAccessToken) {
          throw new Error('The provider must observe the concurrently replaced token.')
        }
        return Promise.resolve()
      }
    )
    /** @brief 原子比较能力的认证端口 / Authentication port with atomic comparison semantics. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentAccessToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken
    }
    /** @brief 首次响应前并发安装新 token 的网络替身 / Network double installing a new token before the first response. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      if (fetchImpl.mock.calls.length === 1) {
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve(unauthorizedResponse('req_replaced_race_12345678'))
      }
      return Promise.resolve(jsonResponse({ id: 'me' }))
    })

    await expect(
      createApiV2Client({ authentication, fetchImpl }).getJson('/me')
    ).resolves.toMatchObject({ data: { id: 'me' } })
    expect(refreshAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ rejectedAccessToken: ACCESS_TOKEN })
    )
    expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${REFRESHED_ACCESS_TOKEN}`
    )
  })

  it('invalidates the retry token after a second strict 401 and returns that Problem', async (): Promise<void> => {
    /** @brief 当前会话 token / Current session token. */
    let currentAccessToken: string | null = ACCESS_TOKEN
    /** @brief 原子条件失效观察器 / Atomic conditional-invalidation observer. */
    const invalidateAccessToken = vi.fn((rejectedAccessToken: string): void => {
      if (currentAccessToken === rejectedAccessToken) currentAccessToken = null
    })
    /** @brief 轮换并条件失效的认证端口 / Authentication port that rotates and conditionally invalidates. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string | null => currentAccessToken,
      invalidateAccessToken,
      refreshAccessToken: (): Promise<void> => {
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 连续返回两个独立严格 401 的网络替身 / Network double returning two independent strict 401 responses. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          unauthorizedResponse(`req_rejected_attempt_${fetchImpl.mock.calls.length}_12345678`)
        )
      )

    await expect(
      createApiV2Client({ authentication, fetchImpl }).getJson('/me')
    ).rejects.toMatchObject({
      name: 'ApiV2ProblemError',
      problem: { code: 'auth.invalid_token', status: 401 }
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(invalidateAccessToken).toHaveBeenCalledOnce()
    expect(invalidateAccessToken).toHaveBeenCalledWith(REFRESHED_ACCESS_TOKEN)
    expect(currentAccessToken).toBeNull()
  })

  it('does not let a late second 401 clear a newer access token', async (): Promise<void> => {
    /** @brief 当前会话 token / Current session token. */
    let currentAccessToken: string | null = ACCESS_TOKEN
    /** @brief 仅相等时清理的失效函数 / Invalidation function that clears only on equality. */
    const invalidateAccessToken = vi.fn((rejectedAccessToken: string): void => {
      if (currentAccessToken === rejectedAccessToken) currentAccessToken = null
    })
    /** @brief 具备原子失效语义的认证端口 / Authentication port with atomic invalidation semantics. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string | null => currentAccessToken,
      invalidateAccessToken,
      refreshAccessToken: (): Promise<void> => {
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 第二响应到达前安装更新 token 的网络替身 / Network double installing a newer token before the second response arrives. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      /** @brief 当前尝试序号 / Current attempt ordinal. */
      const attempt = fetchImpl.mock.calls.length
      if (attempt === 2) currentAccessToken = NEWER_ACCESS_TOKEN
      return Promise.resolve(unauthorizedResponse(`req_late_attempt_${attempt}_12345678`))
    })

    await expect(
      createApiV2Client({ authentication, fetchImpl }).getJson('/me')
    ).rejects.toBeInstanceOf(ApiV2ProblemError)
    expect(invalidateAccessToken).toHaveBeenCalledWith(REFRESHED_ACCESS_TOKEN)
    expect(currentAccessToken).toBe(NEWER_ACCESS_TOKEN)
  })

  it('does not invalidate a token from a malformed second 401', async (): Promise<void> => {
    /** @brief 当前会话 token / Current session token. */
    let currentAccessToken: string = ACCESS_TOKEN
    /** @brief 不应调用的 token 失效函数 / Token invalidation function that must not be called. */
    const invalidateAccessToken = vi.fn<ApiV2AuthenticationPort['invalidateAccessToken']>()
    /** @brief 首次刷新成功的认证端口 / Authentication port succeeding on the first refresh. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentAccessToken,
      invalidateAccessToken,
      refreshAccessToken: (): Promise<void> => {
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 先返回严格 401、再返回错误 challenge 的网络替身 / Network double returning a strict 401 then a malformed challenge. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          fetchImpl.mock.calls.length === 1
            ? unauthorizedResponse('req_strict_first_12345678')
            : unauthorizedResponse('req_malformed_second_1234', 'Basic realm="legacy"')
        )
      )

    await expect(
      createApiV2Client({ authentication, fetchImpl }).getJson('/me')
    ).rejects.toMatchObject({ name: 'ApiV2ContractError', status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(invalidateAccessToken).not.toHaveBeenCalled()
    expect(currentAccessToken).toBe(REFRESHED_ACCESS_TOKEN)
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
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
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
    )

    await expect(
      createApiV2Client({
        authentication: fixedAuthentication(ACCESS_TOKEN),
        fetchImpl
      }).getJson('/me')
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
      createApiV2Client({
        authentication: fixedAuthentication(ACCESS_TOKEN),
        fetchImpl
      }).getJson('/me')
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects paths that could escape or redefine the v2 request URL', async (): Promise<void> => {
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测 v2 client / v2 client under test. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl
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
      createApiV2Client({
        authentication: fixedAuthentication(ACCESS_TOKEN),
        fetchImpl
      }).getJson('/me', { maxResponseBytes: 128 })
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
      createApiV2Client({
        authentication: fixedAuthentication(ACCESS_TOKEN),
        fetchImpl
      }).getJson('/me', { maxResponseBytes: 8 })
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
      authentication: fixedAuthentication(ACCESS_TOKEN),
      fetchImpl,
      timeoutMilliseconds: 5
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      kind: 'timeout',
      name: 'ApiV2NetworkError'
    })
  })

  it('enforces the same total deadline while waiting for an initial refresh', async (): Promise<void> => {
    /** @brief refresh 收到的共享截止信号 / Shared deadline signal received by refresh. */
    let refreshSignal: AbortSignal | undefined
    /** @brief 永不主动完成的认证端口 / Authentication port that never completes refresh itself. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): null => null,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (request): Promise<void> => {
        refreshSignal = request.signal
        return new Promise<void>(() => undefined)
      }
    }
    /** @brief 不应开始的网络替身 / Network double that must never start. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 使用短共享截止的 client / Client using a short shared deadline. */
    const client = createApiV2Client({
      authentication,
      fetchImpl,
      timeoutMilliseconds: 5
    })

    await expect(client.getJson('/me')).rejects.toMatchObject({
      kind: 'timeout',
      name: 'ApiV2NetworkError'
    })
    expect(refreshSignal?.aborted).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createApiV2PublicClient', (): void => {
  it('reads a public Template without accepting or sending authentication state', async (): Promise<void> => {
    /** @brief 公开请求的网络替身 / Network double for the public request. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ items: [] }))
    /** @brief 不具备认证或写能力的公开 client / Public client without authentication or write capabilities. */
    const client = createApiV2PublicClient({
      acceptLanguage: 'zh-CN',
      createRequestId: (): string => 'req_public_12345678',
      fetchImpl
    })

    await client.getJson('/resume-templates', { query: { cursor: null, limit: 24 } })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.hmalliances.org:8022/api/v2/resume-templates?limit=24',
      expect.objectContaining({
        credentials: 'omit',
        headers: {
          'Accept-Language': 'zh-CN',
          'X-Request-Id': 'req_public_12345678'
        },
        method: 'GET',
        redirect: 'error'
      })
    )
  })

  it('does not turn a public 401 into an authentication refresh replay', async (): Promise<void> => {
    /** @brief 始终拒绝公开请求的网络替身 / Network double that always rejects the public request. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(unauthorizedResponse())
    /** @brief 公开 Template client / Public Template client. */
    const client = createApiV2PublicClient({ fetchImpl })

    await expect(client.getJson('/resume-templates')).rejects.toBeInstanceOf(ApiV2ProblemError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
