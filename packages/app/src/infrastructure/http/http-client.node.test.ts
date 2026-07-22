import { describe, expect, it, vi } from 'vitest'

import type { DiagnosticRecord } from '../../observability'
import { createDiagnostics } from '../observability'
import { createHttpClient, parseStrongEntityTag } from './http-client'

describe('parseStrongEntityTag', (): void => {
  it('accepts one quoted strong entity-tag', (): void => {
    expect(parseStrongEntityTag('"rev-18-sha256prefix"', 'ETag')).toBe('"rev-18-sha256prefix"')
  })

  it.each(['*', 'W/"rev-18"', '"rev-18", "rev-19"', '"line\nbreak"', 'unquoted'])(
    'rejects an unsafe If-Match token: %s',
    (value): void => {
      expect(() => parseStrongEntityTag(value, 'ETag')).toThrowError()
    }
  )

  it('stops an unsafe token before fetch can emit an If-Match header', async (): Promise<void> => {
    /** @brief 不应被调用的网络替身 / Network double that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(client.patchJson('/resource', {}, { ifMatch: '*' })).rejects.toMatchObject({
      name: 'HttpContractError'
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

/**
 * @brief 构造完整、Schema 合法的 ProblemDetails / Build complete schema-valid ProblemDetails.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return ProblemDetails JSON / ProblemDetails JSON.
 */
function problemDetails(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    code: 'resume.invalid_field',
    detail: 'Private backend diagnostic detail.',
    extensions: { 'com.example.trace': 'trace-value' },
    instance: '/api/v1/resumes/res_example',
    request_id: 'request_12345678',
    retry_after_ms: 250,
    retryable: false,
    status: 422,
    title: 'Resume field is invalid',
    type: 'urn:aiws:error:resume:invalid_field',
    violations: [
      {
        code: 'invalid_value',
        message: {
          fallback_message: 'The field is invalid.',
          message_key: 'resume.invalid_value',
          params: { field: 'title' }
        },
        pointer: '/title',
        rejected_value: 'private rejected value'
      }
    ],
    ...overrides
  }
}

/**
 * @brief 创建只在 AbortSignal 终止时失败的网络替身 / Create a network double that fails only when its AbortSignal terminates.
 * @return 可验证 caller cancellation 与 deadline 的挂起 fetch / Pending fetch usable for caller-cancellation and deadline tests.
 */
function createStalledFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        /** @brief HTTP client 注入的组合信号 / Combined signal injected by the HTTP client. */
        const signal = init?.signal
        if (signal === undefined || signal === null) {
          reject(new Error('Expected the HTTP client to provide a request deadline.'))
          return
        }
        /** @brief 使用规范取消原因结束挂起请求 / Reject the pending request with its standard abort reason. */
        const rejectOnAbort = (): void => {
          /** @brief AbortSignal 提供的取消原因 / Cancellation reason supplied by AbortSignal. */
          const reason: unknown = signal.reason
          reject(
            reason instanceof Error
              ? reason
              : new DOMException('The request was aborted.', 'AbortError')
          )
        }
        if (signal.aborted) rejectOnAbort()
        else signal.addEventListener('abort', rejectOnAbort, { once: true })
      })
  )
}

/**
 * @brief 创建已返回响应头但 JSON body 一直挂起的网络替身 / Create a network double whose headers arrive while its JSON body stalls.
 * @param status 已收到的 HTTP 状态 / HTTP status whose headers have arrived.
 * @return 可验证 body 读取阶段取消与截止时间的 fetch / Fetch usable for body-read cancellation and deadline tests.
 */
function createStalledBodyFetch(status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    /** @brief HTTP client 注入且覆盖整个 body 生命周期的组合信号 / Combined signal injected by the HTTP client for the full body lifetime. */
    const signal = init?.signal
    if (signal === undefined || signal === null) {
      return Promise.reject(new Error('Expected the HTTP client to provide a request deadline.'))
    }

    /** @brief 模拟已收到成功响应头但尚未读取完 body 的响应 / Response simulating received success headers with an unread body. */
    const response = {
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: (): Promise<unknown> =>
        new Promise<unknown>((_resolve, reject) => {
          /** @brief 用组合信号的原始原因结束 body 读取 / End body reading with the combined signal's original reason. */
          const rejectOnAbort = (): void => {
            /** @brief AbortSignal 提供的 body 终止原因 / Body-termination reason supplied by AbortSignal. */
            const reason: unknown = signal.reason
            reject(
              reason instanceof Error
                ? reason
                : new DOMException('The response body was aborted.', 'AbortError')
            )
          }
          if (signal.aborted) rejectOnAbort()
          else signal.addEventListener('abort', rejectOnAbort, { once: true })
        }),
      ok: status >= 200 && status < 300,
      status
    } as Response

    return Promise.resolve(response)
  })
}

describe('createHttpClient', (): void => {
  it('accepts parameters on the exact application/json media type', async (): Promise<void> => {
    /** @brief 返回带 charset 参数 JSON 的网络替身 / Network double returning JSON with a charset parameter. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { ok: true },
          { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } }
        )
      )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(client.getJson('/workspaces')).resolves.toMatchObject({ data: { ok: true } })
  })

  it('rejects a media type that only contains application/json as a substring', async (): Promise<void> => {
    /** @brief 返回伪 JSON 媒体类型的网络替身 / Network double returning a lookalike JSON media type. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"ok":true}', {
        headers: { 'Content-Type': 'text/application/json-fake' },
        status: 200
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({
      name: 'HttpContractError'
    })
  })

  it('requests product endpoints under the configured API v1 base', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    const client = createHttpClient({
      acceptLanguage: 'zh-CN',
      baseUrl: 'http://127.0.0.1:8000',
      createRequestId: (): string => 'request_get_123',
      fetchImpl
    })

    await client.getJson('/resume-templates', {
      query: { cursor: null, limit: 20, locale: 'zh-CN' }
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates?limit=20&locale=zh-CN'
    )
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      headers: { 'Accept-Language': 'zh-CN', 'X-Request-Id': 'request_get_123' },
      method: 'GET'
    })
  })

  it('returns parsed data together with safe response metadata', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'res_example' }), {
        headers: {
          'Content-Type': 'application/json',
          ETag: '"resume-4"'
        },
        status: 200
      })
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    const result = await client.getJson('/resumes/res_example')

    expect(result.data).toEqual({ id: 'res_example' })
    expect(result.status).toBe(200)
    expect(result.headers.get('ETag')).toBe('"resume-4"')
  })

  it('posts JSON commands with the confirmed correlation, concurrency, and idempotency headers', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ new_revision: 5 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    const client = createHttpClient({
      baseUrl: 'http://127.0.0.1:8000',
      createRequestId: (): string => 'request_post_123',
      fetchImpl
    })
    const controller = new AbortController()
    const body = { base_revision: 4, operations: [] }

    await client.postJson('/resumes/res_example/operations', body, {
      idempotencyKey: 'batch_12345678',
      ifMatch: '"resume-4"',
      signal: controller.signal
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/resumes/res_example/operations',
      expect.objectContaining({
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'batch_12345678',
          'If-Match': '"resume-4"',
          'X-Request-Id': 'request_post_123'
        },
        method: 'POST',
        redirect: 'error'
      })
    )
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends conditional JSON Merge Patch requests with the contract media type', async (): Promise<void> => {
    /** @brief 返回更新后资源的网络替身 / Network double returning the updated resource. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'ks_1' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({
      acceptLanguage: 'zh-CN',
      baseUrl: 'http://127.0.0.1:8000',
      createRequestId: (): string => 'request_patch_123',
      fetchImpl
    })

    await client.patchJson(
      '/knowledge-sources/ks_1',
      { visibility: { session_override_allowed: false } },
      { ifMatch: '"rev-3"' }
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/knowledge-sources/ks_1',
      expect.objectContaining({
        body: JSON.stringify({ visibility: { session_override_allowed: false } }),
        headers: {
          'Accept-Language': 'zh-CN',
          'Content-Type': 'application/merge-patch+json',
          'If-Match': '"rev-3"',
          'X-Request-Id': 'request_patch_123'
        },
        method: 'PATCH'
      })
    )
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('marks a command outcome unknown even when a 5xx response has valid Problem Details', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'resume.render_unavailable',
          detail: 'The render service is temporarily unavailable.',
          retryable: false,
          status: 503,
          title: 'Resume rendering is unavailable',
          type: 'urn:aiws:error:resume:render_unavailable'
        }),
        {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 503
        }
      )
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(
      client.postJson(
        '/resumes/res_example/render-jobs',
        {},
        {
          idempotencyKey: 'render_12345678'
        }
      )
    ).rejects.toMatchObject({
      diagnosticKind: 'backend_problem',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it('preserves valid 5xx Problem Details for a read request', async (): Promise<void> => {
    /** @brief 返回可验证读失败的网络替身 / Network double returning a verifiable read failure. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'workspace.temporarily_unavailable',
          detail: 'The workspace service is temporarily unavailable.',
          retryable: true,
          status: 503,
          title: 'Workspace service unavailable',
          type: 'urn:aiws:error:workspace:temporarily_unavailable'
        }),
        {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 503
        }
      )
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({
      code: 'workspace.temporarily_unavailable',
      retryable: true,
      status: 503
    })
  })

  it('accepts only the exact same-origin content URL for the requested artifact', (): void => {
    const client = createHttpClient({ baseUrl: 'https://api.example.test' })

    expect(
      client.resolveArtifactUrl(
        'https://api.example.test/api/v1/render-artifacts/artifact_123/content?signature=short-lived',
        'artifact_123'
      )
    ).toBe(
      'https://api.example.test/api/v1/render-artifacts/artifact_123/content?signature=short-lived'
    )
    expect(() =>
      client.resolveArtifactUrl('https://uploads.example.test/resume.pdf', 'artifact_123')
    ).toThrowError('untrusted')
    expect(() =>
      client.resolveArtifactUrl(
        'https://api.example.test/api/v1/render-artifacts/artifact_other/content',
        'artifact_123'
      )
    ).toThrowError('different product resource')
    expect(() =>
      client.resolveArtifactUrl(
        'https://api.example.test/api/v1/resumes/resume_123',
        'artifact_123'
      )
    ).toThrowError('different product resource')
    expect(() =>
      client.resolveArtifactUrl(
        'https://user:secret@api.example.test/api/v1/render-artifacts/artifact_123/content',
        'artifact_123'
      )
    ).toThrowError('untrusted')
    expect(() =>
      client.resolveArtifactUrl(
        'https://api.example.test/api/v1/render-artifacts/artifact_123/content#page=1',
        'artifact_123'
      )
    ).toThrowError('untrusted')
    expect(() =>
      client.resolveArtifactUrl(
        'https://api.example.test/api/v1/render-artifacts/artifact_123\\content',
        'artifact_123'
      )
    ).toThrowError('untrusted')
    expect(() =>
      client.resolveArtifactUrl('/api/v1/render-artifacts/artifact_123/content', 'artifact_123')
    ).toThrowError('untrusted')
  })

  it('throws a structured error for application/problem+json responses', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'resume.not_found',
          detail: 'The requested resume is unavailable.',
          retry_after_ms: null,
          retryable: false,
          status: 404,
          title: 'Resume not found',
          type: 'https://example.test/problems/resume-not-found'
        }),
        {
          headers: {
            'Content-Type': 'application/problem+json',
            'X-Request-ID': 'req_example'
          },
          status: 404
        }
      )
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    const request = client.getJson('/resumes/res_missing')

    await expect(request).rejects.toMatchObject({
      code: 'resume.not_found',
      detail: 'The requested resume is unavailable.',
      name: 'HttpProblemError',
      requestId: 'req_example',
      retryable: false,
      retryAfterMs: null,
      status: 404,
      title: 'Resume not found'
    })
  })

  it('accepts a complete ProblemDetails document matching the frozen schema', async (): Promise<void> => {
    /** @brief 返回完整 ProblemDetails 的网络替身 / Network double returning complete ProblemDetails. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(problemDetails()), {
        headers: { 'Content-Type': 'application/problem+json' },
        status: 422
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(client.getJson('/resumes/res_example')).rejects.toMatchObject({
      code: 'resume.invalid_field',
      detail: 'Private backend diagnostic detail.',
      name: 'HttpProblemError',
      requestId: 'request_12345678',
      retryAfterMs: 250,
      status: 422
    })
  })

  it.each([
    ['unknown top-level field', { private_stack: 'must not escape' }],
    ['invalid type URI-reference', { type: 'not a URI reference' }],
    ['invalid instance URI-reference', { instance: '/bad path' }],
    ['oversized title', { title: 'x'.repeat(513) }],
    ['oversized detail', { detail: 'x'.repeat(4001) }],
    ['short request_id', { request_id: 'short' }],
    [
      'invalid violation',
      {
        violations: [
          {
            code: 'invalid_value',
            message: { fallback_message: '', message_key: 'resume.invalid_value' },
            pointer: '/title'
          }
        ]
      }
    ],
    ['invalid extension name', { extensions: { x: true } }]
  ] as const)(
    'rejects ProblemDetails with %s without exposing payload content',
    async (_caseName, override): Promise<void> => {
      /** @brief 返回当前非法 ProblemDetails 的网络替身 / Network double returning this invalid ProblemDetails. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(problemDetails(override)), {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 422
        })
      )
      /** @brief 被测 HTTP client / HTTP client under test. */
      const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

      await expect(client.getJson('/resumes/res_example')).rejects.toMatchObject({
        message: 'Backend returned ProblemDetails that does not match the shared contract.',
        name: 'HttpContractError',
        status: 422
      })
    }
  )

  it('marks a command outcome unknown when the success status differs from its expectation', async (): Promise<void> => {
    /** @brief 返回错误成功状态的网络替身 / Network double returning the wrong success status. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'job_render_example' }, { status: 201 }))
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(
      client.postJson('/resumes/res_example/render-jobs', {}, { expectedStatus: 202 })
    ).rejects.toMatchObject({
      diagnosticKind: 'contract',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it.each([
    [
      'non-JSON success body',
      new Response('<html>unexpected</html>', {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      })
    ],
    [
      'malformed success JSON',
      new Response('{', {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    ]
  ] as const)('marks a POST with %s as outcome unknown', async (_caseName, response) => {
    /** @brief 返回无法验证成功响应的网络替身 / Network double returning an unverifiable success response. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    /** @brief 被测命令 HTTP client / Command HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(
      client.postJson('/resumes/res_example/operations', {}, { idempotencyKey: 'batch_12345678' })
    ).rejects.toMatchObject({
      diagnosticKind: 'contract',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it.each(['POST', 'PATCH'] as const)(
    'marks a %s outcome unknown when a 503 response has no valid ProblemDetails',
    async (method): Promise<void> => {
      /** @brief 返回损坏 503 JSON 的网络替身 / Network double returning malformed JSON under a 503 status. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{', {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 503
        })
      )
      /** @brief 被测命令 HTTP client / Command HTTP client under test. */
      const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })
      /** @brief 当前方法的命令请求 / Command request for the current method. */
      const request =
        method === 'POST'
          ? client.postJson('/interview-sessions', {}, { idempotencyKey: 'session_12345678' })
          : client.patchJson('/knowledge-sources/source_1', {}, { ifMatch: '"revision-1"' })

      await expect(request).rejects.toMatchObject({
        diagnosticKind: 'contract',
        name: 'HttpCommandOutcomeUnknownError'
      })
    }
  )

  it.each(['POST', 'PATCH'] as const)(
    'marks a %s outcome unknown when the body of a 503 response exceeds the deadline',
    async (method): Promise<void> => {
      /** @brief 返回 503 headers 后挂起 body 的网络替身 / Network double stalling its body after 503 headers. */
      const client = createHttpClient({
        baseUrl: 'https://api.example.test',
        fetchImpl: createStalledBodyFetch(503),
        timeoutMilliseconds: 5
      })
      /** @brief 当前方法的命令请求 / Command request for the current method. */
      const request =
        method === 'POST'
          ? client.postJson('/interview-sessions', {}, { idempotencyKey: 'session_12345678' })
          : client.patchJson('/knowledge-sources/source_1', {}, { ifMatch: '"revision-1"' })

      await expect(request).rejects.toMatchObject({
        diagnosticKind: 'timeout',
        name: 'HttpCommandOutcomeUnknownError'
      })
    }
  )

  it('rejects successful responses that are not JSON', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>unexpected</html>', {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      })
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(client.getJson('/resumes')).rejects.toMatchObject({
      name: 'HttpContractError',
      status: 200
    })
  })

  it('rejects non-ProblemDetails HTTP errors as contract violations', async (): Promise<void> => {
    /** @brief 返回普通 JSON 错误的网络替身 / Network double returning a plain-JSON error. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'private backend detail' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({
      name: 'HttpContractError',
      status: 503
    })
  })

  it('rejects malformed JSON without exposing parser details', async (): Promise<void> => {
    /** @brief 返回损坏 JSON 的网络替身 / Network double returning malformed JSON. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{', {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({
      message: 'Backend returned malformed JSON.',
      name: 'HttpContractError',
      status: 200
    })
  })

  it('records a completed request with a local correlation ID but no query text', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_local_123',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
      )
    })

    await client.getJson('/knowledge-sources', { query: { cursor: 'sensitive-cursor' } })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      attributes: {
        method: 'GET',
        operation: 'knowledge.source.list',
        request_id: 'request_local_123',
        status: 200
      },
      name: 'http.request_completed'
    })
    expect(JSON.stringify(records)).not.toContain('sensitive-cursor')
  })

  it.each([
    ['/me', 'GET', 'workspace.me.read'],
    ['/workspaces', 'GET', 'workspace.list'],
    ['/interview-scenarios/scenario_1', 'GET', 'interview.scenario.read'],
    ['/interview-sessions', 'POST', 'interview.session.create'],
    ['/interview-reports/report_1', 'GET', 'interview.report.read'],
    ['/knowledge-sources/source_1', 'PATCH', 'knowledge.source.update']
  ] as const)(
    'records %s as the stable %s operation %s',
    async (path, method, operation): Promise<void> => {
      /** @brief 当前用例收到的诊断记录 / Diagnostic records received by this case. */
      const records: DiagnosticRecord[] = []
      /** @brief 返回有效 JSON 的网络替身 / Network double returning valid JSON. */
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
      )
      /** @brief 当前路径分类用例的 HTTP client / HTTP client for this path-classification case. */
      const client = createHttpClient({
        baseUrl: 'https://api.example.test',
        createRequestId: (): string => 'request_operation_123',
        diagnostics: createDiagnostics({
          sinks: [
            {
              emit(record): void {
                records.push(record)
              }
            }
          ]
        }),
        fetchImpl
      })

      if (method === 'POST') {
        await client.postJson(path, {}, { idempotencyKey: 'command_12345678' })
      } else if (method === 'PATCH') {
        await client.patchJson(path, {}, { ifMatch: '"revision-1"' })
      } else {
        await client.getJson(path)
      }

      expect(records[0]).toMatchObject({
        attributes: { method, operation },
        name: 'http.request_completed'
      })
    }
  )

  it('records a categorized network failure without exporting the error text', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_local_456',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('private DNS failure'))
    })

    await expect(client.getJson('/resumes/res_secret')).rejects.toBeInstanceOf(TypeError)

    expect(records[0]).toMatchObject({
      attributes: {
        error_kind: 'network',
        operation: 'resume.document.read',
        request_id: 'request_local_456',
        status: null
      },
      name: 'http.request_failed'
    })
    expect(JSON.stringify(records)).not.toContain('private DNS failure')
    expect(JSON.stringify(records)).not.toContain('res_secret')
  })

  it('marks a POST network disconnect as outcome unknown while preserving network diagnostics', async (): Promise<void> => {
    /** @brief 模拟连接在命令发送后断开的网络替身 / Network double simulating a disconnect after command transmission. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('private connection failure'))
    /** @brief 被测命令 HTTP client / Command HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(
      client.postJson('/interview-sessions', {}, { idempotencyKey: 'session_12345678' })
    ).rejects.toMatchObject({
      diagnosticKind: 'network',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it('marks a caller-aborted PATCH as outcome unknown', async (): Promise<void> => {
    /** @brief 页面生命周期拥有的取消器 / Cancellation controller owned by the page lifecycle. */
    const controller = new AbortController()
    /** @brief 使用挂起请求的命令 HTTP client / Command HTTP client using a stalled request. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      fetchImpl: createStalledFetch(),
      timeoutMilliseconds: 1_000
    })
    /** @brief 尚未收到响应的 PATCH / PATCH that has not received a response. */
    const request = client.patchJson(
      '/knowledge-sources/source_1',
      {},
      { ifMatch: '"revision-1"', signal: controller.signal }
    )
    controller.abort(new DOMException('private navigation', 'AbortError'))

    await expect(request).rejects.toMatchObject({
      diagnosticKind: 'aborted',
      name: 'HttpCommandOutcomeUnknownError'
    })
  })

  it('records expected cancellation separately from an HTTP failure', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 被测 HTTP client / HTTP client under test. */
    /** @brief 由页面生命周期控制的取消器 / Cancellation controller owned by the page lifecycle. */
    const controller = new AbortController()
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_local_789',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: createStalledFetch(),
      timeoutMilliseconds: 1_000
    })

    const request = client.getJson('/resume-templates', { signal: controller.signal })
    controller.abort(new DOMException('private cancellation reason', 'AbortError'))

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })

    expect(records[0]).toMatchObject({
      attributes: {
        method: 'GET',
        operation: 'resume.template.list',
        request_id: 'request_local_789'
      },
      name: 'http.request_cancelled'
    })
    expect(JSON.stringify(records)).not.toContain('private cancellation reason')
  })

  it('aborts a stalled request at its deadline and records a timeout failure', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 使用短测试截止时间的 HTTP client / HTTP client using a short test deadline. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_timeout_123',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: createStalledFetch(),
      timeoutMilliseconds: 5
    })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({ name: 'TimeoutError' })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      attributes: {
        error_kind: 'timeout',
        operation: 'workspace.list',
        request_id: 'request_timeout_123',
        status: null
      },
      name: 'http.request_failed'
    })
  })

  it('preserves caller cancellation while a response JSON body is stalled', async (): Promise<void> => {
    /** @brief body 读取取消产生的诊断记录 / Diagnostic records emitted for body-read cancellation. */
    const records: DiagnosticRecord[] = []
    /** @brief 页面生命周期拥有的取消器 / Cancellation controller owned by the page lifecycle. */
    const controller = new AbortController()
    /** @brief 必须原样传播的调用方取消原因 / Caller cancellation reason that must be preserved by identity. */
    const reason = new DOMException('private body cancellation', 'AbortError')
    /** @brief 使用挂起 JSON body 的被测 client / Client under test with a stalled JSON body. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_body_abort_123',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: createStalledBodyFetch(),
      timeoutMilliseconds: 1_000
    })

    const request = client.getJson('/workspaces', { signal: controller.signal })
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      attributes: {
        operation: 'workspace.list',
        request_id: 'request_body_abort_123'
      },
      name: 'http.request_cancelled'
    })
    expect(JSON.stringify(records)).not.toContain('private body cancellation')
  })

  it('preserves and diagnoses a deadline while a response JSON body is stalled', async (): Promise<void> => {
    /** @brief body 读取超时产生的诊断记录 / Diagnostic records emitted for the body-read timeout. */
    const records: DiagnosticRecord[] = []
    /** @brief 使用短截止时间和挂起 JSON body 的被测 client / Client under test with a short deadline and stalled JSON body. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): string => 'request_body_timeout_123',
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl: createStalledBodyFetch(),
      timeoutMilliseconds: 5
    })

    await expect(client.getJson('/workspaces')).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      attributes: {
        error_kind: 'timeout',
        operation: 'workspace.list',
        request_id: 'request_body_timeout_123',
        status: 200
      },
      name: 'http.request_failed'
    })
  })

  it.each(['POST', 'PATCH'] as const)(
    'turns a stalled %s body deadline into an outcome-unknown error while retaining timeout diagnostics',
    async (method): Promise<void> => {
      /** @brief 命令结果未知时产生的诊断记录 / Diagnostic records emitted for the unknown command outcome. */
      const records: DiagnosticRecord[] = []
      /** @brief 使用短截止时间和挂起命令 body 的被测 client / Client under test with a short deadline and stalled command body. */
      const client = createHttpClient({
        baseUrl: 'https://api.example.test',
        createRequestId: (): string => `request_${method.toLowerCase()}_timeout_123`,
        diagnostics: createDiagnostics({
          sinks: [
            {
              emit(record): void {
                records.push(record)
              }
            }
          ]
        }),
        fetchImpl: createStalledBodyFetch(),
        timeoutMilliseconds: 5
      })

      /** @brief 当前方法对应的命令 Promise / Command promise for the current method. */
      const request =
        method === 'POST'
          ? client.postJson(
              '/resumes/res_example/operations',
              {},
              {
                idempotencyKey: 'operation_timeout_123'
              }
            )
          : client.patchJson('/knowledge-sources/source_1', {}, { ifMatch: '"revision-1"' })

      await expect(request).rejects.toMatchObject({ name: 'HttpCommandOutcomeUnknownError' })
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({
        attributes: {
          error_kind: 'timeout',
          method,
          status: 200
        },
        name: 'http.request_failed'
      })
    }
  )

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects the invalid request deadline %s at composition time',
    (timeoutMilliseconds): void => {
      expect(() =>
        createHttpClient({ baseUrl: 'https://api.example.test', timeoutMilliseconds })
      ).toThrowError('positive integer')
    }
  )

  it('does not let an unavailable diagnostics ID factory block the business request', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 网络边界替身 / Fetch boundary double. */
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({
      baseUrl: 'https://api.example.test',
      createRequestId: (): never => {
        throw new Error('random source is unavailable')
      },
      diagnostics: createDiagnostics({
        sinks: [
          {
            emit(record): void {
              records.push(record)
            }
          }
        ]
      }),
      fetchImpl
    })

    await expect(client.getJson('/resume-templates')).resolves.toMatchObject({ status: 200 })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(records[0]).toMatchObject({
      attributes: { request_id: 'unavailable' },
      name: 'http.request_completed'
    })
  })
})
