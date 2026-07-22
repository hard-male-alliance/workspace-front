import { describe, expect, it } from 'vitest'
import { ProductApiConfigurationError } from '@ai-job-workspace/platform'

import { resolveDesktopApiBaseUrl } from './api-config'

describe('resolveDesktopApiBaseUrl', (): void => {
  it('无显式配置时使用产品生产 origin', (): void => {
    expect(resolveDesktopApiBaseUrl({})).toBe('https://api.hmalliances.org')
  })

  it('支持完整 origin 与拆分配置两种主进程部署方式', (): void => {
    expect(
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_BASE_URL: 'http://127.0.0.1:8000'
      })
    ).toBe('http://127.0.0.1:8000')
    expect(
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_HOSTNAME: 'api.example.test',
        AI_JOB_WORKSPACE_API_PORT: '8443',
        AI_JOB_WORKSPACE_API_PROTOCOL: 'https'
      })
    ).toBe('https://api.example.test:8443')
  })

  it('拒绝混用、带路径与非 HTTP(S) 配置', (): void => {
    expect(() =>
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_BASE_URL: 'https://api.example.test',
        AI_JOB_WORKSPACE_API_HOSTNAME: 'other.example.test'
      })
    ).toThrowError(ProductApiConfigurationError)
    expect(() =>
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_BASE_URL: 'https://api.example.test/api'
      })
    ).toThrowError(ProductApiConfigurationError)
    expect(() =>
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_PROTOCOL: 'ftp'
      })
    ).toThrowError(ProductApiConfigurationError)
  })

  it('拒绝非 loopback 产品 API 使用明文 HTTP', (): void => {
    expect(() =>
      resolveDesktopApiBaseUrl({
        AI_JOB_WORKSPACE_API_BASE_URL: 'http://api.example.test'
      })
    ).toThrowError(ProductApiConfigurationError)
  })
})
