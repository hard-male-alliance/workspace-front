import { describe, expect, it } from 'vitest'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'

import { createDesktopRuntimeInfo } from './runtime-info'

describe('createDesktopRuntimeInfo', (): void => {
  it('始终下发主进程验证后的产品 API origin', (): void => {
    expect(createDesktopRuntimeInfo('https://api.example.test', { kind: 'disabled' })).toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: APPLICATION_VERSION,
      platform: 'electron'
    })
  })

  it('仅暴露已验证的诊断 endpoint', (): void => {
    expect(
      createDesktopRuntimeInfo('https://api.example.test', {
        endpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
        kind: 'enabled',
        origin: 'https://diagnostics.example.test'
      })
    ).toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: APPLICATION_VERSION,
      diagnosticsEndpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
      platform: 'electron'
    })
  })

  it('配置无效时仅暴露无敏感信息的错误类别', (): void => {
    expect(
      createDesktopRuntimeInfo('https://api.example.test', {
        kind: 'invalid',
        reason: 'invalid_protocol'
      })
    ).toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: APPLICATION_VERSION,
      diagnosticsConfigurationError: 'invalid_protocol',
      platform: 'electron'
    })
  })
})
