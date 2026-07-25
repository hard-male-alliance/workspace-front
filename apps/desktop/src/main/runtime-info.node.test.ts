import { describe, expect, it } from 'vitest'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import { API_V2_PRODUCTION_ORIGIN } from '@ai-job-workspace/product-api-v2'

import { createDesktopRuntimeInfo } from './runtime-info'

describe('createDesktopRuntimeInfo', (): void => {
  it('始终下发主进程验证后的产品 API origin', (): void => {
    expect(createDesktopRuntimeInfo({ kind: 'disabled' })).toEqual({
      apiBaseUrl: API_V2_PRODUCTION_ORIGIN,
      appVersion: APPLICATION_VERSION,
      platform: 'electron'
    })
  })

  it('仅暴露已验证的诊断 endpoint', (): void => {
    expect(
      createDesktopRuntimeInfo({
        endpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
        kind: 'enabled',
        origin: 'https://diagnostics.example.test'
      })
    ).toEqual({
      apiBaseUrl: API_V2_PRODUCTION_ORIGIN,
      appVersion: APPLICATION_VERSION,
      diagnosticsEndpoint: 'https://diagnostics.example.test/api/v1/frontend-diagnostics/batches',
      platform: 'electron'
    })
  })

  it('配置无效时仅暴露无敏感信息的错误类别', (): void => {
    expect(
      createDesktopRuntimeInfo({
        kind: 'invalid',
        reason: 'invalid_protocol'
      })
    ).toEqual({
      apiBaseUrl: API_V2_PRODUCTION_ORIGIN,
      appVersion: APPLICATION_VERSION,
      diagnosticsConfigurationError: 'invalid_protocol',
      platform: 'electron'
    })
  })
})
