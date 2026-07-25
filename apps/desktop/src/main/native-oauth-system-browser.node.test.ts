/** @file Native OAuth 系统浏览器边界测试 / Native OAuth system-browser boundary tests. */

import {
  createNativeAuthorizationRequest,
  type OidcDiscoveryDocument
} from '@ai-job-workspace/product-api-v2/native-oauth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** @brief Electron shell mock / Electron shell mock. */
const electron = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string, options?: { readonly logUsage: boolean }) => Promise<void>>()
}))

vi.mock('electron', () => ({
  shell: { openExternal: electron.openExternal }
}))

import {
  assertNativeOAuthSystemBrowserUrl,
  NativeOAuthSystemBrowserError,
  openNativeOAuthInSystemBrowser
} from './native-oauth-system-browser'

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

/**
 * @brief 创建 factory 生成的可信系统浏览器 URL / Create a factory-generated trusted system-browser URL.
 * @return canonical authorization URL / Canonical authorization URL.
 */
async function authorizationUrl(): Promise<string> {
  /** @brief 固定测试端口上的 native request / Native request on a fixed test port. */
  const request = await createNativeAuthorizationRequest({
    boundLoopbackOrigin: 'http://127.0.0.1:49152',
    clientId: 'workspace-desktop',
    discovery: DISCOVERY,
    offlineAccessConsent: 'request',
    scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
    screenHint: 'login'
  })
  return request.authorizationUrl
}

describe('native OAuth system browser boundary', (): void => {
  beforeEach((): void => {
    electron.openExternal.mockReset()
    electron.openExternal.mockResolvedValue(undefined)
  })

  it('passes only the pinned factory URL to Electron shell.openExternal', async (): Promise<void> => {
    /** @brief factory 生成 URL / Factory-generated URL. */
    const url = await authorizationUrl()

    expect(assertNativeOAuthSystemBrowserUrl(url)).toBe(url)
    await openNativeOAuthInSystemBrowser(url)

    expect(electron.openExternal).toHaveBeenCalledOnce()
    expect(electron.openExternal).toHaveBeenCalledWith(url, { logUsage: false })
  })

  it('rejects endpoint, redirect, duplicate, extension, and platform-length confusion', async (): Promise<void> => {
    /** @brief factory 生成基线 URL / Factory-generated baseline URL. */
    const valid = await authorizationUrl()
    /** @brief 错误 issuer URL / Wrong-issuer URL. */
    const wrongIssuer = new URL(valid)
    wrongIssuer.hostname = 'attacker.invalid'
    /** @brief 普通 hostname redirect / Ordinary-hostname redirect. */
    const localhostRedirect = new URL(valid)
    localhostRedirect.searchParams.set(
      'redirect_uri',
      'http://localhost:49152/oauth/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    )
    /** @brief 重复 state / Duplicate state. */
    const duplicateState = new URL(valid)
    duplicateState.searchParams.append('state', 'A'.repeat(43))
    /** @brief 未声明参数 / Undeclared parameter. */
    const extension = new URL(valid)
    extension.searchParams.set('return_to', 'file:///tmp/unsafe')
    /** @brief 超过 Windows external-open 上限的 URL / URL beyond the Windows external-open limit. */
    const oversized = new URL(valid)
    oversized.searchParams.set('client_id', 'x'.repeat(2_100))

    for (const unsafe of [
      'file:///tmp/authorize',
      wrongIssuer.toString(),
      localhostRedirect.toString(),
      duplicateState.toString(),
      extension.toString(),
      oversized.toString()
    ]) {
      expect(() => assertNativeOAuthSystemBrowserUrl(unsafe)).toThrow(NativeOAuthSystemBrowserError)
    }
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it('wraps host launch failures without reflecting the authorization URL', async (): Promise<void> => {
    /** @brief factory 生成 URL / Factory-generated URL. */
    const url = await authorizationUrl()
    electron.openExternal.mockRejectedValue(new Error(`Failed to open ${url}`))

    /** @brief 对外安全错误 / Safe outward error. */
    const failure = await openNativeOAuthInSystemBrowser(url).catch(
      (error: unknown): unknown => error
    )
    expect(failure).toBeInstanceOf(NativeOAuthSystemBrowserError)
    expect(String(failure)).not.toContain('code_challenge')
    expect(String(failure)).not.toContain('state=')
  })
})
