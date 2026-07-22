import { describe, expect, it, vi } from 'vitest'

import type { DiagnosticRecord } from '../../observability'
import { createDiagnostics } from '../observability'
import { createHttpClient } from './http-client'

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

describe('createHttpClient', (): void => {
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
      {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'batch_12345678',
          'If-Match': '"resume-4"',
          'X-Request-Id': 'request_post_123'
        },
        method: 'POST',
        signal: controller.signal
      }
    )
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

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8000/api/v1/knowledge-sources/ks_1', {
      body: JSON.stringify({ visibility: { session_override_allowed: false } }),
      headers: {
        'Accept-Language': 'zh-CN',
        'Content-Type': 'application/merge-patch+json',
        'If-Match': '"rev-3"',
        'X-Request-Id': 'request_patch_123'
      },
      method: 'PATCH'
    })
  })

  it('preserves structured command Problem Details', async (): Promise<void> => {
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
      code: 'resume.render_unavailable',
      detail: 'The render service is temporarily unavailable.',
      status: 503
    })
  })

  it('accepts only same-origin product API artifact URLs', (): void => {
    const client = createHttpClient({ baseUrl: 'https://api.example.test' })

    expect(
      client.resolveProductUrl('https://api.example.test/api/v1/render-artifacts/a/content')
    ).toBe('https://api.example.test/api/v1/render-artifacts/a/content')
    expect(() => client.resolveProductUrl('https://uploads.example.test/resume.pdf')).toThrowError(
      'untrusted'
    )
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

  it('rejects a success status that differs from the endpoint expectation', async (): Promise<void> => {
    /** @brief 返回错误成功状态的网络替身 / Network double returning the wrong success status. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'job_render_example' }, { status: 201 }))
    /** @brief 被测 HTTP client / HTTP client under test. */
    const client = createHttpClient({ baseUrl: 'https://api.example.test', fetchImpl })

    await expect(
      client.postJson('/resumes/res_example/render-jobs', {}, { expectedStatus: 202 })
    ).rejects.toMatchObject({
      message: 'Backend returned an unexpected success status; expected 202.',
      name: 'HttpContractError',
      status: 201
    })
  })

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

  it('records expected cancellation separately from an HTTP failure', async (): Promise<void> => {
    /** @brief 健康诊断接收器收到的记录 / Records received by the healthy diagnostics sink. */
    const records: DiagnosticRecord[] = []
    /** @brief 被测 HTTP client / HTTP client under test. */
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
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new DOMException('private cancellation reason', 'AbortError'))
    })

    await expect(client.getJson('/resume-templates')).rejects.toMatchObject({ name: 'AbortError' })

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
