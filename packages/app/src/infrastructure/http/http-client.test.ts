import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from './http-client'

describe('createHttpClient', (): void => {
  it('requests product endpoints under the configured API v1 base', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await client.getJson('/resume-templates', {
      query: { cursor: null, limit: 20, locale: 'zh-CN' }
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8000/api/v1/resume-templates?limit=20&locale=zh-CN'
    )
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
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

  it('posts JSON commands with only the confirmed concurrency and idempotency headers', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ new_revision: 5 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
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
          'If-Match': '"resume-4"'
        },
        method: 'POST',
        signal: controller.signal
      }
    )
  })

  it('posts FormData without setting a multipart Content-Type boundary', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 202
      })
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    const controller = new AbortController()
    const body = new FormData()
    body.append('file', new File(['hello'], 'notes.md', { type: 'text/markdown' }))

    await client.postForm('/knowledge-sources/uploads', body, {
      idempotencyKey: 'upload_12345678',
      signal: controller.signal
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/knowledge-sources/uploads',
      {
        body,
        headers: { 'Idempotency-Key': 'upload_12345678' },
        method: 'POST',
        signal: controller.signal
      }
    )
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers).not.toHaveProperty('Content-Type')
  })

  it('preserves structured upload Problem Details', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'knowledge.file_too_large',
          detail: 'The uploaded file exceeds the configured limit.',
          status: 413,
          title: 'Knowledge file is too large'
        }),
        {
          headers: { 'Content-Type': 'application/problem+json' },
          status: 413
        }
      )
    )
    const client = createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })

    await expect(
      client.postForm('/knowledge-sources/uploads', new FormData(), {
        idempotencyKey: 'upload_12345678'
      })
    ).rejects.toMatchObject({
      code: 'knowledge.file_too_large',
      detail: 'The uploaded file exceeds the configured limit.',
      status: 413
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
      status: 404,
      title: 'Resume not found'
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
})
