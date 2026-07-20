import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiError } from './api-client'
import { ApiClient, normalizeApiBaseUrl } from './api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApiClient', () => {
  it('normalizes the origin and adds the API version exactly once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = new ApiClient('https://api.hmalliances.org')
    await api.request('/resumes', { query: { limit: 100 } })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.hmalliances.org/api/v1/resumes?limit=100'
    )
  })

  it('turns a problem response into an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'resume.not_found', detail: 'missing' }), {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' }
        })
      )
    )

    await expect(
      new ApiClient('https://api.hmalliances.org').request('/resumes/missing')
    ).rejects.toMatchObject({
      status: 404,
      problem: { code: 'resume.not_found' }
    } satisfies Partial<ApiError>)
  })
})

describe('normalizeApiBaseUrl', () => {
  it('rejects base URLs that already contain an API path', () => {
    expect(() => normalizeApiBaseUrl('https://api.hmalliances.org/api/v1')).toThrow(TypeError)
  })
})
