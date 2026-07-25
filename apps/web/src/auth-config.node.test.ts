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
        { VITE_OAUTH_CLIENT_ID: 'aiws-web-local' },
        'https://app.hmalliances.org'
      )
    ).toEqual({
      clientId: 'aiws-web-local',
      redirectUri: 'https://app.hmalliances.org/oauth/callback',
      scopes: WEB_OAUTH_SCOPES
    })
  })

  it.each([
    ['localhost', 'http://localhost:5173', 'http://localhost:5173/oauth/callback'],
    ['127.0.0.1', 'http://127.0.0.1:5173', 'http://127.0.0.1:5173/oauth/callback']
  ] as const)(
    'allows development loopback HTTP origin for %s',
    (_host, origin, redirectUri): void => {
      expect(
        resolveWebOAuthConfiguration({ VITE_OAUTH_CLIENT_ID: 'aiws-web-local' }, origin, {
          allowDevelopmentLoopbackHttp: true
        })
      ).toEqual({
        clientId: 'aiws-web-local',
        redirectUri,
        scopes: WEB_OAUTH_SCOPES
      })
    }
  )

  it.each([
    'http://app.hmalliances.org',
    'http://192.168.0.2:5173',
    'http://localhost.evil.test:5173'
  ] as const)('rejects non-loopback HTTP origin in development: %s', (origin): void => {
    expect(() =>
      resolveWebOAuthConfiguration({ VITE_OAUTH_CLIENT_ID: 'aiws-web-local' }, origin, {
        allowDevelopmentLoopbackHttp: true
      })
    ).toThrow(WebOAuthConfigurationError)
  })

  it('keeps production HTTP origins rejected even for localhost', (): void => {
    expect(() =>
      resolveWebOAuthConfiguration(
        { VITE_OAUTH_CLIENT_ID: 'aiws-web-local' },
        'http://localhost:5173'
      )
    ).toThrow(WebOAuthConfigurationError)
  })

  it.each([{}, { VITE_OAUTH_CLIENT_ID: ' aiws-web-local' }] as const)(
    'describes how to fix a missing or invalid public client ID',
    (environment): void => {
      expect(() =>
        resolveWebOAuthConfiguration(environment, 'https://app.hmalliances.org')
      ).toThrow(/Create apps\/web\/\.env/)
    }
  )

  it('rejects a callback transaction created under different deployment settings', (): void => {
    /** @brief 当前部署配置 / Current deployment configuration. */
    const configuration = resolveWebOAuthConfiguration(
      { VITE_OAUTH_CLIENT_ID: 'aiws-web-local' },
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
    [{ VITE_OAUTH_CLIENT_ID: ' aiws-web-local' }, 'https://app.hmalliances.org'],
    [{ VITE_OAUTH_CLIENT_ID: 'aiws-web-local' }, 'http://app.hmalliances.org'],
    [{ VITE_OAUTH_CLIENT_ID: 'aiws-web-local' }, 'https://user@example.com']
  ] as const)(
    'rejects an unsafe or incomplete public configuration',
    (environment, origin): void => {
      expect(() => resolveWebOAuthConfiguration(environment, origin)).toThrow(
        WebOAuthConfigurationError
      )
    }
  )
})
