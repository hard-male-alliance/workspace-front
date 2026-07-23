import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import type { ApiV2AuthenticationPort } from './authentication'
import type { ApiV2PostJsonOptions, ApiV2WriteClient } from './client'
import { createApiV2Client } from './client'
import { ApiV2ContractError } from './errors'
import { ApiV2ProblemError } from './problem-error'

/** @brief 首次写请求的测试 Access Token / Test access token for the first write attempt. */
const ACCESS_TOKEN = 'access_write_example_only_not_real_7Yw8N2'

/** @brief 认证重放使用的测试 Access Token / Test access token used by authentication replay. */
const REFRESHED_ACCESS_TOKEN = 'access_write_refreshed_not_real_9Za1K4'

/** @brief 测试幂等键 / Test idempotency key. */
const IDEMPOTENCY_KEY = 'resume_create_intent_12345678'

/** @brief 测试响应请求 ID / Test response request ID. */
const RESPONSE_REQUEST_ID = 'req_write_response_12345678'

/** @brief API v2 固定 Bearer challenge / Frozen API v2 Bearer challenge. */
const BEARER_CHALLENGE =
  'Bearer resource_metadata="https://api.hmalliances.org:8022/.well-known/oauth-protected-resource"'

/**
 * @brief 构造固定 token 的认证端口 / Build an authentication port with a fixed token.
 * @param accessToken 当前内存 token / Current in-memory token.
 * @return 不改变 token 的完整认证端口 / Complete authentication port that does not mutate the token.
 */
function fixedAuthentication(accessToken: string | null = ACCESS_TOKEN): ApiV2AuthenticationPort {
  return {
    getAccessToken: (): string | null => accessToken,
    invalidateAccessToken: (): void => undefined,
    refreshAccessToken: (): Promise<void> => Promise.resolve()
  }
}

/**
 * @brief 构造完整 v2 Problem / Build a complete v2 Problem.
 * @param status HTTP 状态 / HTTP status.
 * @param requestId 响应请求 ID / Response request ID.
 * @return Schema 完整的 Problem JSON / Schema-complete Problem JSON.
 */
function problemDetails(status: number, requestId = RESPONSE_REQUEST_ID): Record<string, unknown> {
  return {
    code:
      status === 401
        ? 'auth.invalid_token'
        : status === 412
          ? 'concurrency.precondition_failed'
          : status === 409
            ? 'idempotency.key_reused'
            : 'service.unavailable',
    detail: 'Diagnostic detail that the client must not expose.',
    errors: [],
    extensions: {},
    instance: '/api/v2/workspaces/ws_12345678/resumes',
    request_id: requestId,
    retryable: status >= 500,
    status,
    title: status === 401 ? 'Unauthorized' : 'Write failed',
    type: `https://api.hmalliances.org:8022/problems/write/status-${status}`
  }
}

/**
 * @brief 构造严格 JSON success 响应 / Build a strict JSON success response.
 * @param body JSON body / JSON body.
 * @param status 成功状态 / Success status.
 * @param overrides 响应头覆盖 / Response header overrides.
 * @return 带公共 v2 headers 的 Response / Response carrying common v2 headers.
 */
function writeJsonResponse(
  body: unknown,
  status: 200 | 201 | 202 = 200,
  overrides: HeadersInit = {}
): Response {
  /** @brief 默认和用例覆盖后的响应头 / Response headers after defaults and case overrides. */
  const headers = new Headers({
    'Content-Type': 'application/json',
    ETag: '"write-entity-2"',
    'X-Request-Id': RESPONSE_REQUEST_ID,
    ...Object.fromEntries(new Headers(overrides))
  })
  if ((status === 201 || status === 202) && !headers.has('Location')) {
    headers.set(
      'Location',
      `https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/${
        status === 201 ? 'resumes/res_12345678' : 'jobs/job_12345678'
      }`
    )
  }
  return new Response(JSON.stringify(body), { headers, status })
}

/**
 * @brief 构造完整 Problem 响应 / Build a complete Problem response.
 * @param status HTTP 状态 / HTTP status.
 * @param requestId 响应请求 ID / Response request ID.
 * @param includeChallenge 401 是否带标准 challenge / Whether a 401 carries the standard challenge.
 * @return 可供 fetch double 返回的 Problem / Problem suitable for a fetch double.
 */
function problemResponse(
  status: number,
  requestId = RESPONSE_REQUEST_ID,
  includeChallenge = true
): Response {
  /** @brief Problem 响应头 / Problem response headers. */
  const headers = new Headers({
    'Content-Type': 'application/problem+json',
    'X-Request-Id': requestId
  })
  if (status === 401 && includeChallenge) headers.set('WWW-Authenticate', BEARER_CHALLENGE)
  return new Response(JSON.stringify(problemDetails(status, requestId)), { headers, status })
}

/**
 * @brief 创建只在取消时结束的 fetch double / Create a fetch double that settles only when aborted.
 * @return 用于超时与取消用例的挂起 fetch / Stalled fetch used by timeout and cancellation cases.
 */
function stalledFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        /** @brief Client 提供的共享 signal / Shared signal supplied by the client. */
        const signal = init?.signal
        if (signal === null || signal === undefined) {
          reject(new Error('Expected an AbortSignal.'))
          return
        }
        /** @brief 用标准取消原因拒绝请求 / Reject the request with the standard abort reason. */
        const rejectOnAbort = (): void => {
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('The request was aborted.', 'AbortError')
          )
        }
        if (signal.aborted) rejectOnAbort()
        else signal.addEventListener('abort', rejectOnAbort, { once: true })
      })
  )
}

/**
 * @brief 在编译期锁定 POST 判别联合 / Lock the POST discriminated union at compile time.
 * @note 函数不在运行时调用；`@ts-expect-error` 会在契约意外放宽时使 typecheck 失败。 / The function is not invoked at runtime; `@ts-expect-error` makes typecheck fail if the contract is accidentally widened.
 */
function assertPostOptionTypes(client: ApiV2WriteClient): void {
  // @ts-expect-error -- updated-result 必须显式提供 If-Match / updated-result requires an explicit If-Match.
  const updatedWithoutIfMatch: ApiV2PostJsonOptions<'updated-result'> = {
    idempotencyKey: IDEMPOTENCY_KEY,
    successKind: 'updated-result'
  }
  /** @brief 查询语义不得携带并发前置条件 / Query semantics must not carry a concurrency precondition. */
  const queryWithIfMatch: ApiV2PostJsonOptions<'query-result'> = {
    idempotencyKey: IDEMPOTENCY_KEY,
    // @ts-expect-error -- query-result 禁止 If-Match / query-result forbids If-Match.
    ifMatch: '"resume-1"',
    successKind: 'query-result'
  }
  /** @brief 旧状态开关不再属于公开选项 / The legacy status switch is no longer a public option. */
  const legacyStatus: ApiV2PostJsonOptions<'created-resource'> = {
    // @ts-expect-error -- 状态由 successKind 唯一派生 / status is derived solely from successKind.
    expectedStatus: 201,
    idempotencyKey: IDEMPOTENCY_KEY,
    successKind: 'created-resource'
  }
  /** @brief 旧表示开关不再属于公开选项 / The legacy representation switch is no longer a public option. */
  const legacyRepresentation: ApiV2PostJsonOptions<'created-resource'> = {
    idempotencyKey: IDEMPOTENCY_KEY,
    // @ts-expect-error -- 表示约束由 successKind 唯一派生 / representation constraints derive solely from successKind.
    successRepresentation: 'resource',
    successKind: 'created-resource'
  }
  void client.postJson(
    '/workspaces/ws_12345678/resumes',
    {},
    {
      // @ts-expect-error -- 方法对象字面量也不接受旧自由状态 / method object literals also reject the legacy free-form status.
      expectedStatus: 201,
      idempotencyKey: IDEMPOTENCY_KEY,
      successKind: 'created-resource'
    }
  )

  void updatedWithoutIfMatch
  void queryWithIfMatch
  void legacyStatus
  void legacyRepresentation
}

void assertPostOptionTypes

describe('API v2 write transport', (): void => {
  it('posts a frozen JSON command and returns typed creation metadata without raw Headers', async (): Promise<void> => {
    /** @brief 返回新 Resume 的网络替身 / Network double returning a new Resume. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(writeJsonResponse({ id: 'res_12345678' }, 201))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({
      acceptLanguage: 'zh-CN',
      authentication: fixedAuthentication(),
      createRequestId: (): string => 'req_write_outbound_12345678',
      fetchImpl
    })
    /** @brief 创建 Resume 请求体 / Create-Resume request body. */
    const body = { locale: 'zh-CN', template: { id: 'tpl_12345678', version: 7 } }

    /** @brief 类型化创建响应 / Typed creation response. */
    const result = await client.postJson('/workspaces/ws_12345678/resumes', body, {
      idempotencyKey: IDEMPOTENCY_KEY,
      ifMatch: '"workspace-7"',
      successKind: 'created-resource'
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes',
      expect.objectContaining({
        body: JSON.stringify(body),
        credentials: 'omit',
        headers: {
          'Accept-Language': 'zh-CN',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': IDEMPOTENCY_KEY,
          'If-Match': '"workspace-7"',
          'X-Request-Id': 'req_write_outbound_12345678'
        },
        method: 'POST',
        redirect: 'error'
      })
    )
    expect(result).toEqual({
      data: { id: 'res_12345678' },
      metadata: {
        entityTag: '"write-entity-2"',
        location:
          'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes/res_12345678',
        requestId: RESPONSE_REQUEST_ID
      },
      status: 201
    })
    expectTypeOf(result.status).toEqualTypeOf<201>()
    expectTypeOf(result.metadata.entityTag).toEqualTypeOf<string>()
    expectTypeOf(result.metadata.location).toEqualTypeOf<string>()
    expect(result).not.toHaveProperty('headers')
  })

  it('uses merge-patch with mandatory strong concurrency and returns the new ETag', async (): Promise<void> => {
    /** @brief 返回更新后资源的网络替身 / Network double returning the updated resource. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(writeJsonResponse({ title: 'Updated' }))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({
      authentication: fixedAuthentication(),
      fetchImpl
    })

    /** @brief 更新响应 / Update response. */
    const result = await client.patchJson(
      '/workspaces/ws_12345678/resumes/res_12345678',
      { title: 'Updated' },
      { ifMatch: '"resume-1"' }
    )

    /** @brief PATCH 请求初始化参数 / PATCH request initialization. */
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init).toMatchObject({
      body: '{"title":"Updated"}',
      method: 'PATCH'
    })
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/merge-patch+json')
    expect(new Headers(init?.headers).get('If-Match')).toBe('"resume-1"')
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false)
    expect(result.metadata.entityTag).toBe('"write-entity-2"')
  })

  it('posts an empty command without inventing a JSON body or content type', async (): Promise<void> => {
    /** @brief 返回异步 Job 的网络替身 / Network double returning an asynchronous Job. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(writeJsonResponse({ id: 'job_12345678' }, 202))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    /** @brief 空 command 的响应 / Response from the empty command. */
    const result = await client.postEmpty(
      '/workspaces/ws_12345678/resumes/res_12345678/restore-jobs',
      { idempotencyKey: 'restore_command_12345678', successKind: 'accepted-resource' }
    )

    /** @brief 空 command 请求初始化 / Empty-command request initialization. */
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init).not.toHaveProperty('body')
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    expect(result.metadata.location).toContain('/api/v2/workspaces/ws_12345678/jobs/')
  })

  it('deletes only with a strong If-Match and strictly accepts a bodyless 204', async (): Promise<void> => {
    /** @brief 返回严格 204 的网络替身 / Network double returning a strict 204. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { 'X-Request-Id': RESPONSE_REQUEST_ID },
        status: 204
      })
    )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.deleteNoContent('/workspaces/ws_12345678/resumes/res_12345678', {
        ifMatch: '"resume-3"'
      })
    ).resolves.toEqual({
      metadata: { entityTag: null, location: null, requestId: RESPONSE_REQUEST_ID },
      status: 204
    })
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get('If-Match')).toBe('"resume-3"')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('deletes asynchronously with a strong If-Match and returns a located 202 Job', async (): Promise<void> => {
    /** @brief 返回异步删除 Job 的网络替身 / Network double returning an asynchronous deletion Job. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(writeJsonResponse({ id: 'job_12345678' }, 202))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    /** @brief 异步 DELETE 响应 / Asynchronous DELETE response. */
    const result = await client.deleteAcceptedJson(
      '/workspaces/ws_12345678/connections/con_12345678',
      { ifMatch: '"connection-2"' }
    )

    /** @brief DELETE 请求初始化参数 / DELETE request initialization. */
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init?.method).toBe('DELETE')
    expect(init).not.toHaveProperty('body')
    expect(new Headers(init?.headers).get('If-Match')).toBe('"connection-2"')
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false)
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    expect(result).toEqual({
      data: { id: 'job_12345678' },
      metadata: {
        entityTag: '"write-entity-2"',
        location:
          'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/jobs/job_12345678',
        requestId: RESPONSE_REQUEST_ID
      },
      status: 202
    })
    expectTypeOf(result.status).toEqualTypeOf<202>()
    expectTypeOf(result.metadata.entityTag).toEqualTypeOf<string>()
    expectTypeOf(result.metadata.location).toEqualTypeOf<string>()
  })

  it('fails PATCH and DELETE locally when their mandatory strong If-Match is absent', async (): Promise<void> => {
    /** @brief 不应读取的 token source / Token source that must not be read. */
    const getAccessToken = vi.fn((): string => ACCESS_TOKEN)
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({
      authentication: {
        getAccessToken,
        invalidateAccessToken: (): void => undefined,
        refreshAccessToken: (): Promise<void> => Promise.resolve()
      },
      fetchImpl
    })

    await expect(
      client.patchJson(
        '/workspaces/ws_12345678/resumes/res_12345678',
        {},
        {} as { ifMatch: string }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      client.deleteNoContent(
        '/workspaces/ws_12345678/resumes/res_12345678',
        {} as { ifMatch: string }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      client.deleteAcceptedJson(
        '/workspaces/ws_12345678/connections/con_12345678',
        {} as { ifMatch: string }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    [
      'short idempotency key',
      '/workspaces/ws_12345678/resumes',
      {},
      { idempotencyKey: 'short', successKind: 'created-resource' }
    ],
    [
      'weak If-Match',
      '/workspaces/ws_12345678/resumes',
      {},
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: 'W/"resume-1"',
        successKind: 'created-resource'
      }
    ],
    [
      'escaping path',
      '/../../oauth/token',
      {},
      { idempotencyKey: IDEMPOTENCY_KEY, successKind: 'created-resource' }
    ],
    [
      'non-finite JSON number',
      '/workspaces/ws_12345678/resumes',
      { score: Number.NaN },
      { idempotencyKey: IDEMPOTENCY_KEY, successKind: 'created-resource' }
    ],
    [
      'UTF-8 request over the endpoint limit',
      '/workspaces/ws_12345678/resumes',
      { title: '猫猫猫猫' },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        maxRequestBytes: 16,
        successKind: 'created-resource'
      }
    ]
  ] as const)(
    'fails %s locally before reading credentials or dispatching',
    async (_caseName, path, body, options): Promise<void> => {
      /** @brief 不应读取的认证端口 / Authentication port that must not be read. */
      const getAccessToken = vi.fn((): string => ACCESS_TOKEN)
      /** @brief 不应调用的网络替身 / Network double that must not be called. */
      const fetchImpl = vi.fn<typeof fetch>()
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({
        authentication: {
          getAccessToken,
          invalidateAccessToken: (): void => undefined,
          refreshAccessToken: (): Promise<void> => Promise.resolve()
        },
        fetchImpl
      })

      await expect(client.postJson(path, body, options)).rejects.toBeInstanceOf(ApiV2ContractError)
      expect(getAccessToken).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['a missing success discriminant', { idempotencyKey: IDEMPOTENCY_KEY }],
    [
      'an update without If-Match',
      { idempotencyKey: IDEMPOTENCY_KEY, successKind: 'updated-result' }
    ],
    [
      'a query carrying If-Match',
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-1"',
        successKind: 'query-result'
      }
    ]
  ] as const)(
    'fails a runtime-cast POST policy with %s before credentials or dispatch',
    async (_caseName, unsafeOptions): Promise<void> => {
      /** @brief 不应读取的 token source / Token source that must not be read. */
      const getAccessToken = vi.fn((): string => ACCESS_TOKEN)
      /** @brief 不应调用的网络替身 / Network double that must not be called. */
      const fetchImpl = vi.fn<typeof fetch>()
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({
        authentication: {
          getAccessToken,
          invalidateAccessToken: (): void => undefined,
          refreshAccessToken: (): Promise<void> => Promise.resolve()
        },
        fetchImpl
      })

      await expect(
        client.postJson(
          '/workspaces/ws_12345678/resumes',
          {},
          unsafeOptions as unknown as ApiV2PostJsonOptions
        )
      ).rejects.toBeInstanceOf(ApiV2ContractError)
      expect(getAccessToken).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )

  it('rejects cyclic and accessor-bearing input before JSON serialization can execute code', async (): Promise<void> => {
    /** @brief 自引用 JSON 候选 / Self-referential JSON candidate. */
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    /** @brief 带危险 getter 的 JSON 候选 / JSON candidate carrying a dangerous getter. */
    const accessor: Record<string, unknown> = {}
    /** @brief 不应执行的 getter / Getter that must never execute. */
    const getter = vi.fn((): string => 'secret')
    Object.defineProperty(accessor, 'secret', { enumerable: true, get: getter })
    /** @brief 带危险 getter 的数组 / Array carrying a dangerous getter. */
    const accessorArray: unknown[] = [null]
    /** @brief 不应执行的数组 getter / Array getter that must never execute. */
    const arrayGetter = vi.fn((): string => 'secret')
    Object.defineProperty(accessorArray, 0, { enumerable: true, get: arrayGetter })
    /** @brief 带非 JSON 隐藏属性的数组 / Array carrying a non-JSON hidden property. */
    const hiddenPropertyArray: unknown[] = []
    Object.defineProperty(hiddenPropertyArray, 'hidden', {
      enumerable: false,
      value: 'secret'
    })
    /** @brief 带 symbol key 的数组 / Array carrying a symbol key. */
    const symbolPropertyArray: unknown[] = []
    Object.defineProperty(symbolPropertyArray, Symbol('secret'), {
      enumerable: true,
      value: 'secret'
    })
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.postJson('/workspaces/ws_12345678/resumes', cyclic, {
        idempotencyKey: IDEMPOTENCY_KEY,
        successKind: 'created-resource'
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      client.postJson('/workspaces/ws_12345678/resumes', accessor, {
        idempotencyKey: IDEMPOTENCY_KEY,
        successKind: 'created-resource'
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    for (const body of [accessorArray, hiddenPropertyArray, symbolPropertyArray]) {
      await expect(
        client.postJson('/workspaces/ws_12345678/resumes', body, {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        })
      ).rejects.toBeInstanceOf(ApiV2ContractError)
    }
    expect(getter).not.toHaveBeenCalled()
    expect(arrayGetter).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('replays one strict 401 with identical bytes and command headers but a fresh request ID', async (): Promise<void> => {
    /** @brief 当前内存 Access Token / Current in-memory access token. */
    let currentAccessToken = ACCESS_TOKEN
    /** @brief 被调用方随后修改的原始对象 / Original object subsequently mutated by the caller double. */
    const body = { title: 'Original' }
    /** @brief 刷新后安装新 token 的认证端口 / Authentication port installing a new token after refresh. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentAccessToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (request): Promise<void> => {
        expect(request.rejectedAccessToken).toBe(ACCESS_TOKEN)
        currentAccessToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 构造后替换的认证端口观察器 / Authentication-port observer installed after construction. */
    const replacementGetAccessToken = vi.fn((): string => 'access_replacement_not_real_5Qr8')
    /** @brief 不应参与重放的替换认证端口 / Replacement authentication port that must not participate in replay. */
    const replacementAuthentication: ApiV2AuthenticationPort = {
      getAccessToken: replacementGetAccessToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (): Promise<void> => Promise.resolve()
    }
    /** @brief 单调 request ID 序号 / Monotonic request-ID ordinal. */
    let requestOrdinal = 0
    /** @brief 调用方保留并会修改的原始选项 / Original options retained and mutated by the caller. */
    const clientOptions = {
      acceptLanguage: 'zh-CN',
      authentication,
      createRequestId: (): string => {
        requestOrdinal += 1
        return `req_write_attempt_${requestOrdinal}_12345678`
      },
      fetchImpl: vi.fn<typeof fetch>()
    }
    /** @brief 首次严格 401、第二次成功的网络替身 / Network double returning a strict 401 then success. */
    const fetchImpl = clientOptions.fetchImpl.mockImplementation(() => {
      if (clientOptions.fetchImpl.mock.calls.length === 1) {
        body.title = 'Mutated after dispatch'
        clientOptions.acceptLanguage = 'fr-FR'
        clientOptions.authentication = replacementAuthentication
        return Promise.resolve(problemResponse(401, 'req_write_first_401_12345678'))
      }
      return Promise.resolve(writeJsonResponse({ id: 'res_12345678' }))
    })
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client(clientOptions)

    await client.postJson('/workspaces/ws_12345678/resumes/res_12345678/operations', body, {
      idempotencyKey: 'operation_batch_12345678',
      ifMatch: '"resume-7"',
      successKind: 'updated-result'
    })

    /** @brief 两次尝试的请求初始化 / Request initialization for both attempts. */
    const attempts = fetchImpl.mock.calls.map((call) => call[1])
    expect(attempts.map((init) => init?.body)).toEqual([
      '{"title":"Original"}',
      '{"title":"Original"}'
    ])
    expect(attempts.map((init) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
      'operation_batch_12345678',
      'operation_batch_12345678'
    ])
    expect(attempts.map((init) => new Headers(init?.headers).get('If-Match'))).toEqual([
      '"resume-7"',
      '"resume-7"'
    ])
    expect(attempts.map((init) => new Headers(init?.headers).get('X-Request-Id'))).toEqual([
      'req_write_attempt_1_12345678',
      'req_write_attempt_2_12345678'
    ])
    expect(attempts.map((init) => new Headers(init?.headers).get('Authorization'))).toEqual([
      `Bearer ${ACCESS_TOKEN}`,
      `Bearer ${REFRESHED_ACCESS_TOKEN}`
    ])
    expect(attempts.map((init) => new Headers(init?.headers).get('Accept-Language'))).toEqual([
      'zh-CN',
      'zh-CN'
    ])
    expect(replacementGetAccessToken).not.toHaveBeenCalled()
    expect(new Set(attempts.map((init) => init?.signal)).size).toBe(1)
  })

  it('does not replay a malformed 401 and marks the dispatched outcome unknown', async (): Promise<void> => {
    /** @brief 不应调用的刷新函数 / Refresh function that must not be called. */
    const refreshAccessToken = vi.fn<ApiV2AuthenticationPort['refreshAccessToken']>()
    /** @brief 返回缺少 challenge 的 401 / Network double returning a 401 without its challenge. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(problemResponse(401, RESPONSE_REQUEST_ID, false))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({
      authentication: {
        getAccessToken: (): string => ACCESS_TOKEN,
        invalidateAccessToken: (): void => undefined,
        refreshAccessToken
      },
      fetchImpl
    })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toMatchObject({ kind: 'contract', name: 'ApiV2WriteOutcomeUnknownError' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('fails closed before replay when the request-ID source repeats the first attempt ID', async (): Promise<void> => {
    /** @brief 当前内存 Access Token / Current in-memory access token. */
    let currentToken = ACCESS_TOKEN
    /** @brief 首次返回严格 401 的网络替身 / Network double returning a strict 401 first. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(problemResponse(401))
    /** @brief 刷新后安装 token 的认证端口 / Authentication port installing a token after refresh. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentToken,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (): Promise<void> => {
        currentToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({
      authentication,
      createRequestId: (): string => 'req_repeated_write_12345678',
      fetchImpl
    })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([409, 412] as const)(
    'returns a fully verified %s Problem without automatic retry',
    async (status): Promise<void> => {
      /** @brief 返回确定 client conflict 的网络替身 / Network double returning a definitive client conflict. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(problemResponse(status))
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

      await expect(
        client.postJson(
          '/workspaces/ws_12345678/resumes',
          {},
          {
            idempotencyKey: IDEMPOTENCY_KEY,
            successKind: 'created-resource'
          }
        )
      ).rejects.toMatchObject({
        name: 'ApiV2ProblemError',
        problem: { status }
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  )

  it('keeps a malformed trusted 412 deterministic as a contract error', async (): Promise<void> => {
    /** @brief 返回非 Problem 前置条件失败的网络替身 / Network double returning a non-Problem precondition failure. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('malformed precondition response', {
        headers: {
          'Content-Type': 'text/plain',
          'X-Request-Id': RESPONSE_REQUEST_ID
        },
        status: 412
      })
    )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes/res_12345678/operations',
        {},
        {
          idempotencyKey: 'operation_batch_12345678',
          ifMatch: '"resume-1"',
          successKind: 'updated-result'
        }
      )
    ).rejects.toMatchObject({ name: 'ApiV2ContractError', status: 412 })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps a malformed 409 classified as an unknown dispatched outcome', async (): Promise<void> => {
    /** @brief 返回非 Problem 冲突的网络替身 / Network double returning a non-Problem conflict. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('malformed conflict response', {
        headers: {
          'Content-Type': 'text/plain',
          'X-Request-Id': RESPONSE_REQUEST_ID
        },
        status: 409
      })
    )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      status: 409
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not retry a 5xx and preserves only safe Problem coordinates in the unknown outcome', async (): Promise<void> => {
    /** @brief 返回严格 503 Problem 的网络替身 / Network double returning a strict 503 Problem. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(problemResponse(503))
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    /** @brief 捕获的未知写结果 / Captured unknown write outcome. */
    const error = await client
      .postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
      .catch((reason: unknown) => reason)

    expect(error).toEqual(
      expect.objectContaining({
        kind: 'server',
        name: 'ApiV2WriteOutcomeUnknownError',
        problemCode: 'service.unavailable',
        requestId: RESPONSE_REQUEST_ID,
        status: 503
      })
    )
    expect(error).not.toHaveProperty('cause')
    expect(String(error)).not.toContain('Diagnostic detail')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([
    ['network', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('private DNS detail'))],
    ['timeout', stalledFetch()]
  ] as const)(
    'does not retry a %s failure after dispatch',
    async (kind, fetchImpl): Promise<void> => {
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({
        authentication: fixedAuthentication(),
        fetchImpl,
        timeoutMilliseconds: kind === 'timeout' ? 5 : 30_000
      })

      await expect(
        client.patchJson(
          '/workspaces/ws_12345678/resumes/res_12345678',
          { title: 'Unknown' },
          { ifMatch: '"resume-4"' }
        )
      ).rejects.toMatchObject({ kind, name: 'ApiV2WriteOutcomeUnknownError' })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  )

  it('does not retry caller cancellation after dispatch', async (): Promise<void> => {
    /** @brief 调用方页面取消器 / Caller page cancellation controller. */
    const controller = new AbortController()
    /** @brief 通知测试 fetch 已被调用 / Notify the test that fetch has been invoked. */
    let notifyDispatched: (() => void) | undefined
    /** @brief fetch dispatch 栅栏 / Barrier for fetch dispatch. */
    const dispatched = new Promise<void>((resolve): void => {
      notifyDispatched = resolve
    })
    /** @brief 挂起到取消的网络替身 / Network double stalled until cancellation. */
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          notifyDispatched?.()
          /** @brief Client 提供的共享 signal / Shared signal supplied by the client. */
          const signal = init?.signal
          if (signal === null || signal === undefined) {
            reject(new Error('Expected an AbortSignal.'))
            return
          }
          signal.addEventListener(
            'abort',
            (): void => {
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new DOMException('The request was aborted.', 'AbortError')
              )
            },
            { once: true }
          )
        })
    )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })
    /** @brief 已 dispatch 的 PATCH / Dispatched PATCH. */
    const operation = client.patchJson(
      '/workspaces/ws_12345678/resumes/res_12345678',
      { title: 'Unknown' },
      { ifMatch: '"resume-4"', signal: controller.signal }
    )
    await dispatched
    controller.abort(new DOMException('private navigation reason', 'AbortError'))

    await expect(operation).rejects.toMatchObject({
      kind: 'aborted',
      name: 'ApiV2WriteOutcomeUnknownError'
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps an already-aborted caller operation local and never dispatches it', async (): Promise<void> => {
    /** @brief 调用前已取消的控制器 / Controller aborted before the call. */
    const controller = new AbortController()
    controller.abort(new DOMException('private prior navigation', 'AbortError'))
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.patchJson(
        '/workspaces/ws_12345678/resumes/res_12345678',
        { title: 'Never sent' },
        { ifMatch: '"resume-4"', signal: controller.signal }
      )
    ).rejects.toMatchObject({ kind: 'aborted', name: 'ApiV2NetworkError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps an initial authentication failure local because no write was dispatched', async (): Promise<void> => {
    /** @brief 可辨识的本地会话错误 / Identifiable local session error. */
    const localError = new Error('local refresh unavailable')
    /** @brief 不应调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 无 token 且刷新失败的认证端口 / Authentication port without a token whose refresh fails. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): null => null,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (): Promise<void> => Promise.reject(localError)
    }
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication, fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toBe(localError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps refresh failure after a definitive first 401 local and does not dispatch a replay', async (): Promise<void> => {
    /** @brief 可辨识的本地刷新错误 / Identifiable local refresh error. */
    const localError = new Error('local refresh failed')
    /** @brief 返回严格 401 的网络替身 / Network double returning a strict 401. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(problemResponse(401))
    /** @brief 刷新失败的认证端口 / Authentication port whose refresh fails. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => ACCESS_TOKEN,
      invalidateAccessToken: (): void => undefined,
      refreshAccessToken: (): Promise<void> => Promise.reject(localError)
    }
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication, fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toBe(localError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('invalidates only the token rejected by a second strict 401', async (): Promise<void> => {
    /** @brief 当前会话 token / Current session token. */
    let currentToken = ACCESS_TOKEN
    /** @brief 条件 token 失效观察器 / Conditional token invalidation observer. */
    const invalidateAccessToken = vi.fn<ApiV2AuthenticationPort['invalidateAccessToken']>()
    /** @brief 刷新并可失效的认证端口 / Refreshable and invalidatable authentication port. */
    const authentication: ApiV2AuthenticationPort = {
      getAccessToken: (): string => currentToken,
      invalidateAccessToken,
      refreshAccessToken: (): Promise<void> => {
        currentToken = REFRESHED_ACCESS_TOKEN
        return Promise.resolve()
      }
    }
    /** @brief 连续返回严格 401 的网络替身 / Network double returning two strict 401 responses. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          problemResponse(401, `req_write_401_${fetchImpl.mock.calls.length}_12345678`)
        )
      )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication, fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/resumes',
        {},
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          successKind: 'created-resource'
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ProblemError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(invalidateAccessToken).toHaveBeenCalledOnce()
    expect(invalidateAccessToken).toHaveBeenCalledWith(REFRESHED_ACCESS_TOKEN)
  })

  it.each([
    ['missing Location', new Headers({ Location: '' })],
    [
      'relative Location',
      new Headers({ Location: '/api/v2/workspaces/ws_12345678/resumes/res_1' })
    ],
    [
      'cross-origin Location',
      new Headers({
        Location: 'https://attacker.example/api/v2/workspaces/ws_12345678/resumes/res_1'
      })
    ],
    [
      'out-of-boundary Location',
      new Headers({ Location: 'https://api.hmalliances.org:8022/oauth/token' })
    ],
    [
      'an empty query suffix',
      new Headers({
        Location: 'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes/res_1?'
      })
    ],
    [
      'an empty fragment suffix',
      new Headers({
        Location: 'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes/res_1#'
      })
    ],
    [
      'userinfo',
      new Headers({
        Location:
          'https://operator@api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/resumes/res_1'
      })
    ],
    [
      'a backslash',
      new Headers({
        Location: 'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678\\resumes/res_1'
      })
    ],
    [
      'a dot segment',
      new Headers({
        Location: 'https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/./resumes/res_1'
      })
    ],
    [
      'a normalized host spelling',
      new Headers({
        Location: 'https://API.HMALLIANCES.ORG:8022/api/v2/workspaces/ws_12345678/resumes/res_1'
      })
    ]
  ] as const)(
    'marks a 201 with %s as contract-unknown after dispatch',
    async (_caseName, locationHeaders): Promise<void> => {
      /** @brief 当前非法 Location 用例的响应头 / Headers for the current invalid-Location case. */
      const headers = new Headers({
        'Content-Type': 'application/json',
        ETag: '"resume-1"',
        'X-Request-Id': RESPONSE_REQUEST_ID
      })
      if (locationHeaders.get('Location') === '') headers.delete('Location')
      else headers.set('Location', locationHeaders.get('Location') ?? '')
      /** @brief 返回非法创建响应的网络替身 / Network double returning an invalid creation response. */
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"id":"res_12345678"}', { headers, status: 201 }))
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

      await expect(
        client.postJson(
          '/workspaces/ws_12345678/resumes',
          {},
          {
            idempotencyKey: IDEMPOTENCY_KEY,
            successKind: 'created-resource'
          }
        )
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 201
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  )

  it.each([
    [201, 'created-resource'],
    [202, 'accepted-resource']
  ] as const)(
    'requires a strong ETag on every located %s response',
    async (status, successKind): Promise<void> => {
      /** @brief 只有 Location 而缺少 ETag 的响应头 / Response headers carrying Location but missing ETag. */
      const headers = new Headers({
        'Content-Type': 'application/json',
        Location: `https://api.hmalliances.org:8022/api/v2/workspaces/ws_12345678/${
          status === 201 ? 'resumes/res_12345678' : 'jobs/job_12345678'
        }`,
        'X-Request-Id': RESPONSE_REQUEST_ID
      })
      /** @brief 返回缺失强 ETag 的定位响应 / Network double returning a located response without a strong ETag. */
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { headers, status }))
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

      await expect(
        client.postJson(
          '/workspaces/ws_12345678/resumes',
          {},
          { idempotencyKey: IDEMPOTENCY_KEY, successKind }
        )
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status
      })
    }
  )

  it.each([null, 'W/"resume-1"'] as const)(
    'marks a mutable success with invalid ETag %s as contract-unknown',
    async (etag): Promise<void> => {
      /** @brief 成功响应头 / Success response headers. */
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Request-Id': RESPONSE_REQUEST_ID
      })
      if (etag !== null) headers.set('ETag', etag)
      /** @brief 返回无效 ETag 的网络替身 / Network double returning an invalid ETag. */
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { headers, status: 200 }))
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

      await expect(
        client.postJson(
          '/workspaces/ws_12345678/resumes/res_12345678/operations',
          {},
          {
            idempotencyKey: 'operation_batch_12345678',
            ifMatch: '"resume-1"',
            successKind: 'updated-result'
          }
        )
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 200
      })
    }
  )

  it('allows an explicit non-resource result while still validating any ETag that is present', async (): Promise<void> => {
    /** @brief 无 ETag 的纯计算结果响应 / Pure computation result response without an ETag. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"matches":[]}', {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': RESPONSE_REQUEST_ID
        },
        status: 200
      })
    )
    /** @brief 被测完整 client / Complete client under test. */
    const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

    await expect(
      client.postJson(
        '/workspaces/ws_12345678/knowledge-searches',
        { query: 'TypeScript' },
        {
          idempotencyKey: 'knowledge_search_12345678',
          successKind: 'query-result'
        }
      )
    ).resolves.toMatchObject({ metadata: { entityTag: null }, status: 200 })
  })

  it.each([
    ['Content-Type', { 'Content-Type': 'application/json' }],
    ['Content-Length: 0', { 'Content-Length': '0' }]
  ] as const)(
    'marks a 204 carrying forbidden %s as contract-unknown',
    async (_caseName, forbiddenHeaders): Promise<void> => {
      /** @brief 携带禁止表示头的 204 / 204 carrying a forbidden representation header. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          headers: {
            ...forbiddenHeaders,
            'X-Request-Id': RESPONSE_REQUEST_ID
          },
          status: 204
        })
      )
      /** @brief 被测完整 client / Complete client under test. */
      const client = createApiV2Client({ authentication: fixedAuthentication(), fetchImpl })

      await expect(
        client.deleteNoContent('/workspaces/ws_12345678/resumes/res_12345678', {
          ifMatch: '"resume-3"'
        })
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        status: 204
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  )
})
