import { describe, expect, it } from 'vitest'

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

    expect(policy).toContain("connect-src 'self' https://diagnostics.example.test:8443;")
    expect(policy).not.toContain('/api/v1/frontend-diagnostics/batches')
    expect(policy).not.toContain('*')
  })

  it('未配置诊断服务时保持仅 self 的连接策略', (): void => {
    /** @brief 未配置诊断服务时的 CSP / CSP when no diagnostics service is configured. */
    const policy = createProductionContentSecurityPolicy({ kind: 'disabled' })

    expect(policy).toContain("connect-src 'self';")
    expect(policy).not.toContain('*')
  })
})
