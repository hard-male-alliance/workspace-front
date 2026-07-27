/** @file Web 本地开发网络适配测试 / Web local-development network-adapter tests. */

import { describe, expect, it, vi } from 'vitest'

import {
  createLocalDevelopmentFetch,
  createLocalDevelopmentProductFetch,
  LOCAL_DEVELOPMENT_API_ORIGIN,
  localDevelopmentUrl
} from './local-development-transport'

describe('local development transport', (): void => {
  it('rewrites only the pinned API origin while preserving path and query', (): void => {
    expect(
      localDevelopmentUrl(
        'https://api.hmalliances.org/oauth/authorize?client_id=aiws-web-local'
      ).toString()
    ).toBe(`${LOCAL_DEVELOPMENT_API_ORIGIN}/oauth/authorize?client_id=aiws-web-local`)
    expect(() => localDevelopmentUrl('https://evil.example/oauth/token')).toThrow(
      'only accepts the pinned API v2 origin'
    )
  })

  it('preserves fetch request semantics while changing only the destination origin', async (): Promise<void> => {
    const response = new Response(null, { status: 204 })
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(response))
    const localFetch = createLocalDevelopmentFetch(fetchImpl)
    const signal = new AbortController().signal

    await expect(
      localFetch('https://api.hmalliances.org/oauth/token', {
        body: 'grant_type=authorization_code',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal
      })
    ).resolves.toBe(response)

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('http://localhost:8000/oauth/token'),
      expect.objectContaining({
        body: 'grant_type=authorization_code',
        method: 'POST',
        signal
      })
    )
  })

  it('maps controlled Product requests locally and canonical Locations back to the controlled origin', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{"id":"resume_12345678"}', {
          headers: {
            'Content-Type': 'application/json',
            Location:
              'https://api.hmalliances.org/api/v2/workspaces/ws_12345678/resumes/resume_12345678'
          },
          status: 201
        })
      )
    )
    const productFetch = createLocalDevelopmentProductFetch(fetchImpl)

    const response = await productFetch(
      'http://dev.hmalliances.org:9000/api/v2/workspaces/ws_12345678/resumes',
      { method: 'POST' }
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('http://localhost:9000/api/v2/workspaces/ws_12345678/resumes'),
      { method: 'POST' }
    )
    expect(response.headers.get('Location')).toBe(
      'http://dev.hmalliances.org:9000/api/v2/workspaces/ws_12345678/resumes/resume_12345678'
    )
  })

  it('rejects an unexpected Product request origin before dispatch', async (): Promise<void> => {
    const fetchImpl = vi.fn<typeof fetch>()
    const productFetch = createLocalDevelopmentProductFetch(fetchImpl)

    await expect(productFetch('https://evil.example/api/v2/workspaces')).rejects.toThrow(
      'only accepts a frozen API v2 origin'
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
