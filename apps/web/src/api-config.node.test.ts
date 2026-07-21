import { describe, expect, it } from 'vitest'

import { ApiConfigurationError, resolveApiBaseUrl } from './api-config'

describe('resolveApiBaseUrl', (): void => {
  it('keeps the existing complete-origin configuration compatible', (): void => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 'http://127.0.0.1:8000' })).toBe(
      'http://127.0.0.1:8000'
    )
  })

  it('builds an origin from the PR protocol, hostname, and port configuration', (): void => {
    expect(
      resolveApiBaseUrl({
        VITE_API_PROTOCOL: 'https',
        VITE_API_HOSTNAME: 'api.example.test',
        VITE_API_PORT: '8443'
      })
    ).toBe('https://api.example.test:8443')
  })

  it('uses the confirmed deployment origin when no public API variables are configured', (): void => {
    expect(resolveApiBaseUrl({})).toBe('https://api.hmalliances.org')
  })

  it('uses the protocol default port when a split port is omitted', (): void => {
    expect(
      resolveApiBaseUrl({
        VITE_API_PROTOCOL: 'http',
        VITE_API_HOSTNAME: 'localhost'
      })
    ).toBe('http://localhost')
  })

  it('rejects mixing a complete origin with any split endpoint setting', (): void => {
    expect(() =>
      resolveApiBaseUrl({
        VITE_API_BASE_URL: 'https://api.example.test',
        VITE_API_HOSTNAME: 'other.example.test'
      })
    ).toThrowError(ApiConfigurationError)
    expect(() =>
      resolveApiBaseUrl({
        VITE_API_BASE_URL: 'https://api.example.test',
        VITE_API_PORT: '8443'
      })
    ).toThrowError(ApiConfigurationError)
  })

  it('rejects credentials, CSP separators, paths, and invalid ports', (): void => {
    expect(() =>
      resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://user:secret@example.test/api' })
    ).toThrowError(ApiConfigurationError)
    expect(() =>
      resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://api.example.test;script-src' })
    ).toThrowError(ApiConfigurationError)
    expect(() =>
      resolveApiBaseUrl({
        VITE_API_PROTOCOL: 'https',
        VITE_API_HOSTNAME: 'api.example.test',
        VITE_API_PORT: '70000'
      })
    ).toThrowError(ApiConfigurationError)
  })
})
