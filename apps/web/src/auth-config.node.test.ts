/** @file Web OAuth 公开配置测试 / Web OAuth public-configuration tests. */

import { describe, expect, it } from 'vitest'

import {
  assertWebOAuthTransactionConfiguration,
  resolveWebOAuthConfiguration,
  WEB_OAUTH_SCOPES,
  WebOAuthConfigurationError
} from './auth-config'

describe('resolveWebOAuthConfiguration', (): void => {
  it('derives the exact HTTPS callback and frozen v2 scopes', (): void => {
    expect(
      resolveWebOAuthConfiguration(
        { VITE_OAUTH_CLIENT_ID: 'workspace-web' },
        'https://app.hmalliances.org'
      )
    ).toEqual({
      clientId: 'workspace-web',
      redirectUri: 'https://app.hmalliances.org/oauth/callback',
      scopes: WEB_OAUTH_SCOPES
    })
  })

  it('rejects a callback transaction created under different deployment settings', (): void => {
    /** @brief 当前部署配置 / Current deployment configuration. */
    const configuration = resolveWebOAuthConfiguration(
      { VITE_OAUTH_CLIENT_ID: 'workspace-web' },
      'https://app.hmalliances.org'
    )

    expect(() =>
      assertWebOAuthTransactionConfiguration(
        { ...configuration, clientId: 'another-client' },
        configuration
      )
    ).toThrow(WebOAuthConfigurationError)
    expect(() =>
      assertWebOAuthTransactionConfiguration(
        { ...configuration, scopes: [...configuration.scopes].reverse() },
        configuration
      )
    ).toThrow(WebOAuthConfigurationError)
  })

  it.each([
    [{}, 'https://app.hmalliances.org'],
    [{ VITE_OAUTH_CLIENT_ID: ' workspace-web' }, 'https://app.hmalliances.org'],
    [{ VITE_OAUTH_CLIENT_ID: 'workspace-web' }, 'http://app.hmalliances.org'],
    [{ VITE_OAUTH_CLIENT_ID: 'workspace-web' }, 'https://user@example.com']
  ] as const)(
    'rejects an unsafe or incomplete public configuration',
    (environment, origin): void => {
      expect(() => resolveWebOAuthConfiguration(environment, origin)).toThrow(
        WebOAuthConfigurationError
      )
    }
  )
})
