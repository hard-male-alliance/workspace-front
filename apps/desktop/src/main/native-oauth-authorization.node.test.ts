/** @file Electron main native OAuth 编排测试 / Electron-main native OAuth orchestration tests. */

import type {
  NativeAuthorizationTransaction,
  OidcDiscoveryDocument
} from '@ai-job-workspace/product-api-v2/native-oauth'
import { describe, expect, it, vi } from 'vitest'

import {
  authorizeNativeOAuth,
  type NativeOAuthAuthorizationCommand,
  type NativeOAuthGrantInstaller
} from './native-oauth-authorization'
import {
  NativeOAuthLoopbackCancelledError,
  NativeOAuthLoopbackTimeoutError
} from './native-oauth-loopback'
import { NativeOAuthSystemBrowserError } from './native-oauth-system-browser'

/** @brief API STANDARD V2 discovery fixture / API STANDARD V2 discovery fixture. */
const DISCOVERY: OidcDiscoveryDocument = {
  authorizationEndpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
  idTokenSigningAlgorithms: ['ES256', 'RS256'],
  issuer: 'https://api.hmalliances.org:8022',
  jwksUri: 'https://api.hmalliances.org:8022/oauth/jwks',
  revocationEndpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
  scopesSupported: ['openid', 'profile', 'offline_access', 'workspace.read'],
  tokenEndpoint: 'https://api.hmalliances.org:8022/oauth/token',
  userinfoEndpoint: 'https://api.hmalliances.org:8022/userinfo'
}

/** @brief 测试授权命令 / Test authorization command. */
const COMMAND: NativeOAuthAuthorizationCommand = {
  clientId: 'workspace-desktop',
  discovery: DISCOVERY,
  offlineAccessConsent: 'request',
  scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
  screenHint: 'login'
}

/** @brief 测试 authorization code / Test authorization code. */
const AUTHORIZATION_CODE = 'authorization_code_installed_in_main'

describe('authorizeNativeOAuth', (): void => {
  it('binds before navigation, uses a system-browser URL, and sends secrets only to the main installer', async (): Promise<void> => {
    /** @brief 系统浏览器收到的 URL / URL received by the system-browser port. */
    let openedAuthorizationUrl = ''
    /** @brief main 私有授权安装端口 / Main-private grant installation port. */
    const installGrant = vi.fn(
      (code: string, transaction: NativeAuthorizationTransaction): Promise<void> => {
        expect(code).toBe(AUTHORIZATION_CODE)
        expect(transaction.kind).toBe('native-loopback')
        return Promise.resolve()
      }
    )
    /** @brief main 私有授权安装端口 / Main-private grant installation port. */
    const grantInstaller: NativeOAuthGrantInstaller = { installGrant }
    /**
     * @brief 模拟系统浏览器完成 hosted authorization redirect / Simulate the system browser completing the hosted authorization redirect.
     * @param authorizationUrl factory 生成的 hosted URL / Factory-generated hosted URL.
     */
    async function openAuthorizationUrl(authorizationUrl: string): Promise<void> {
      openedAuthorizationUrl = authorizationUrl
      /** @brief hosted authorize URL / Hosted authorization URL. */
      const authorize = new URL(authorizationUrl)
      /** @brief factory 绑定的精确 redirect / Exact redirect bound by the factory. */
      const redirect = new URL(authorize.searchParams.get('redirect_uri') ?? '')
      redirect.searchParams.set('code', AUTHORIZATION_CODE)
      redirect.searchParams.set('state', authorize.searchParams.get('state') ?? '')
      redirect.searchParams.set('iss', DISCOVERY.issuer)
      /** @brief 浏览器加载静态完成页的 response / Response for the browser's static completion page. */
      const response = await fetch(redirect)
      expect(response.status).toBe(200)
    }

    /** @brief 编排结果刻意为空，避免秘密穿过调用边界 / Deliberately void result preventing secrets from crossing the call boundary. */
    const result = await authorizeNativeOAuth(COMMAND, {
      callbackTimeoutMilliseconds: 2_000,
      grantInstaller,
      loopbackHosts: ['127.0.0.1'],
      openAuthorizationUrl
    })

    /** @brief 已解析系统浏览器 URL / Parsed system-browser URL. */
    const opened = new URL(openedAuthorizationUrl)
    /** @brief 动态 OS 端口 redirect / Redirect using a dynamic OS port. */
    const redirect = opened.searchParams.get('redirect_uri') ?? ''
    expect(result).toBeUndefined()
    expect(opened.origin + opened.pathname).toBe(DISCOVERY.authorizationEndpoint)
    expect(redirect).toMatch(
      /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/oauth\/callback\/[A-Za-z0-9_-]{43}$/u
    )
    expect(installGrant).toHaveBeenCalledOnce()
    expect(installGrant.mock.calls[0]?.[1].redirectUri).toBe(redirect)
  })

  it('cancels the receiver and returns a URL-free error when system-browser launch fails', async (): Promise<void> => {
    /** @brief 不应运行的 installer / Installer that must not run. */
    const installGrant = vi.fn<NativeOAuthGrantInstaller['installGrant']>()
    /** @brief 包含敏感授权参数的宿主失败 / Host failure containing sensitive authorization parameters. */
    const openAuthorizationUrl = vi.fn((url: string): Promise<never> =>
      Promise.reject(new Error(`Cannot open ${url}`))
    )

    /** @brief 对外安全失败 / Safe outward failure. */
    const failure = await authorizeNativeOAuth(COMMAND, {
      callbackTimeoutMilliseconds: 2_000,
      grantInstaller: { installGrant },
      loopbackHosts: ['127.0.0.1'],
      openAuthorizationUrl
    }).catch((error: unknown): unknown => error)

    expect(failure).toBeInstanceOf(NativeOAuthSystemBrowserError)
    expect(String(failure)).not.toContain('code_challenge')
    expect(String(failure)).not.toContain('state=')
    expect(installGrant).not.toHaveBeenCalled()
  })

  it('lets the callback deadline terminate a hung system-browser opener', async (): Promise<void> => {
    /** @brief 不应调用的 installer / Installer that must not be called. */
    const installGrant = vi.fn<NativeOAuthGrantInstaller['installGrant']>()
    /** @brief 永不自行完成的宿主 opener / Host opener that never completes by itself. */
    const openAuthorizationUrl = vi.fn((): Promise<void> => new Promise<void>(() => undefined))

    await expect(
      authorizeNativeOAuth(COMMAND, {
        callbackTimeoutMilliseconds: 20,
        grantInstaller: { installGrant },
        loopbackHosts: ['127.0.0.1'],
        openAuthorizationUrl
      })
    ).rejects.toBeInstanceOf(NativeOAuthLoopbackTimeoutError)
    expect(installGrant).not.toHaveBeenCalled()
  })

  it('does not bind or open a browser for a pre-cancelled command', async (): Promise<void> => {
    /** @brief 已取消 signal / Already-cancelled signal. */
    const controller = new AbortController()
    controller.abort(new Error('private cancellation reason'))
    /** @brief 不应调用的 bind factory / Bind factory that must not be called. */
    const bindLoopbackReceiver = vi.fn()
    /** @brief 不应调用的 browser opener / Browser opener that must not be called. */
    const openAuthorizationUrl = vi.fn()
    /** @brief 不应调用的 installer / Installer that must not be called. */
    const installGrant = vi.fn<NativeOAuthGrantInstaller['installGrant']>()

    await expect(
      authorizeNativeOAuth(
        COMMAND,
        {
          bindLoopbackReceiver,
          grantInstaller: { installGrant },
          openAuthorizationUrl
        },
        controller.signal
      )
    ).rejects.toBeInstanceOf(NativeOAuthLoopbackCancelledError)
    expect(bindLoopbackReceiver).not.toHaveBeenCalled()
    expect(openAuthorizationUrl).not.toHaveBeenCalled()
    expect(installGrant).not.toHaveBeenCalled()
  })
})
