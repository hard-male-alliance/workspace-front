import { describe, expect, it, vi } from 'vitest'
import { API_V2_PRODUCTION_ORIGIN, createApiV2PublicClient } from '@ai-job-workspace/product-api-v2'

import {
  createProductionContentSecurityPolicy,
  resolveDesktopDiagnosticsConfiguration
} from './diagnostics-config'

describe('resolveDesktopDiagnosticsConfiguration', (): void => {
  it('在 hostname 与 port 均存在时生成固定 HTTPS endpoint', (): void => {
    /** @brief 已验证的桌面诊断配置 / Validated desktop diagnostics configuration. */
    const configuration = resolveDesktopDiagnosticsConfiguration({
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    })

    expect(configuration).toEqual({
      endpoint: 'https://diagnostics.example.test:8443/api/v1/frontend-diagnostics/batches',
      kind: 'enabled',
      origin: 'https://diagnostics.example.test:8443'
    })
  })

  it('接受明确 HTTP 协议并规范化默认端口', (): void => {
    /** @brief 已验证的本地开发诊断配置 / Validated local-development diagnostics configuration. */
    const configuration = resolveDesktopDiagnosticsConfiguration({
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: '127.0.0.1',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '80',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL: 'HTTP:'
    })

    expect(configuration).toEqual({
      endpoint: 'http://127.0.0.1/api/v1/frontend-diagnostics/batches',
      kind: 'enabled',
      origin: 'http://127.0.0.1'
    })
  })

  it.each([
    {},
    { AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test' },
    { AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443' },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: ''
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'https://diagnostics.example.test/path',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'user:secret@diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: '@diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '70000'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL: 'ftp'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8080',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL: 'http'
    },
    {
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: '192.0.2.10',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    }
  ])('对缺失、半配或无效配置安静禁用上传：%o', (environment) => {
    expect(resolveDesktopDiagnosticsConfiguration(environment).kind).not.toBe('enabled')
  })
})

describe('createProductionContentSecurityPolicy', (): void => {
  it('只将已验证的 diagnostics origin 精确加入 connect-src', (): void => {
    /** @brief 已验证的诊断配置 / Validated diagnostics configuration. */
    const configuration = resolveDesktopDiagnosticsConfiguration({
      AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
      AI_JOB_WORKSPACE_DIAGNOSTICS_PORT: '8443'
    })
    /** @brief 生产 renderer 使用的 CSP / CSP used by the production renderer. */
    const policy = createProductionContentSecurityPolicy(configuration)

    expect(policy).toContain(
      `connect-src 'self' ${API_V2_PRODUCTION_ORIGIN} https://diagnostics.example.test:8443;`
    )
    expect(policy).toContain(`frame-src ${API_V2_PRODUCTION_ORIGIN};`)
    expect(policy).not.toContain('frame-src https://diagnostics.example.test:8443')
    expect(policy).toContain("object-src 'none';")
    expect(policy).not.toContain('/api/v1/frontend-diagnostics/batches')
    expect(policy).not.toContain('*')
  })

  it('未配置诊断服务时只允许 self 与产品 API origin', (): void => {
    /** @brief 未配置诊断服务时的 CSP / CSP when no diagnostics service is configured. */
    const policy = createProductionContentSecurityPolicy({ kind: 'disabled' })

    expect(policy).toContain(`connect-src 'self' ${API_V2_PRODUCTION_ORIGIN};`)
    expect(policy).toContain(`frame-src ${API_V2_PRODUCTION_ORIGIN};`)
    expect(policy).not.toContain('*')
  })

  it('产品与诊断共用 origin 时不重复放宽 CSP', (): void => {
    /** @brief 共用后端 origin 的 CSP / CSP with a shared backend origin. */
    const policy = createProductionContentSecurityPolicy({
      endpoint: `${API_V2_PRODUCTION_ORIGIN}/api/v1/frontend-diagnostics/batches`,
      kind: 'enabled',
      origin: API_V2_PRODUCTION_ORIGIN
    })

    expect(policy).toContain(`connect-src 'self' ${API_V2_PRODUCTION_ORIGIN};`)
    expect(policy).not.toContain(`${API_V2_PRODUCTION_ORIGIN} ${API_V2_PRODUCTION_ORIGIN}`)
  })

  it('CSP 产品 origin 与 production transport 实际请求 origin 完全相同', async (): Promise<void> => {
    /** @brief 捕获生产 transport URL 的网络替身 / Network substitute capturing the production transport URL. */
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('stop after URL capture'))
    /** @brief 使用默认 production profile 的公开 client / Public client using the default production profile. */
    const client = createApiV2PublicClient({
      createRequestId: (): string => 'req_desktop_csp_12345678',
      fetchImpl
    })
    await client.getJson('/resume-templates').catch(() => undefined)
    /** @brief transport 实际请求 URL / URL actually requested by the transport. */
    const requestedUrl = fetchImpl.mock.calls[0]?.[0]
    if (typeof requestedUrl !== 'string') throw new Error('Production transport did not run.')
    /** @brief production transport 的实际 origin / Actual origin of the production transport. */
    const transportOrigin = new URL(requestedUrl).origin
    /** @brief Desktop production CSP / Desktop production CSP. */
    const policy = createProductionContentSecurityPolicy({ kind: 'disabled' })

    expect(transportOrigin).toBe(API_V2_PRODUCTION_ORIGIN)
    expect(policy).toContain(`connect-src 'self' ${transportOrigin};`)
    expect(policy).toContain(`frame-src ${transportOrigin};`)
  })
})
