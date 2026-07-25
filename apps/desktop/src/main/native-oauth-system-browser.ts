/** @file Native OAuth 系统浏览器启动边界 / Native OAuth system-browser launch boundary. */

import { API_V2_OAUTH_AUTHORIZATION_ENDPOINT } from '@ai-job-workspace/product-api-v2/native-oauth'

/** @brief Windows `ShellExecute` 路径下 Electron 文档声明的 URL 上限 / Electron-documented URL limit on the Windows `ShellExecute` path. */
const MAX_EXTERNAL_URL_LENGTH = 2_081

/** @brief 授权 URL 允许的固定参数 / Fixed parameters permitted in an authorization URL. */
const REQUIRED_AUTHORIZATION_PARAMETERS = Object.freeze([
  'client_id',
  'code_challenge',
  'code_challenge_method',
  'nonce',
  'redirect_uri',
  'response_type',
  'scope',
  'screen_hint',
  'state'
] as const)

/** @brief 授权 URL 允许的全部参数 / Every parameter permitted in an authorization URL. */
const ALLOWED_AUTHORIZATION_PARAMETERS = new Set([...REQUIRED_AUTHORIZATION_PARAMETERS, 'prompt'])

/** @brief 256-bit canonical Base64url 值语法 / Syntax of a canonical 256-bit Base64url value. */
const CORRELATION_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/u

/** @brief RFC 6749 scope-token 语法 / RFC 6749 scope-token syntax. */
const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/u

/** @brief 系统浏览器无法安全启动 / The system browser could not be launched safely. */
export class NativeOAuthSystemBrowserError extends Error {
  override readonly name = 'NativeOAuthSystemBrowserError'

  /** @brief 创建不包含授权 URL 的安全错误 / Create a safe error containing no authorization URL. */
  constructor() {
    super('The native OAuth authorization page could not be opened in the system browser.')
  }
}

/**
 * @brief 读取恰好一个授权参数 / Read exactly one authorization parameter.
 * @param url 已解析授权 URL / Parsed authorization URL.
 * @param name 参数名 / Parameter name.
 * @return 唯一参数值 / Sole parameter value.
 */
function soleParameter(url: URL, name: string): string {
  /** @brief 同名值 / Values bearing the same name. */
  const values = url.searchParams.getAll(name)
  if (values.length !== 1) throw new NativeOAuthSystemBrowserError()
  return values[0] ?? ''
}

/**
 * @brief 校验系统浏览器只会收到 factory 形状的固定授权 URL / Validate that the system browser receives only a factory-shaped pinned authorization URL.
 * @param value 待启动 URL / URL proposed for launch.
 * @return canonical 授权 URL 原值 / Original canonical authorization URL.
 */
export function assertNativeOAuthSystemBrowserUrl(value: string): string {
  if (value.length === 0 || value.length > MAX_EXTERNAL_URL_LENGTH || value !== value.trim()) {
    throw new NativeOAuthSystemBrowserError()
  }
  try {
    /** @brief 已解析候选 URL / Parsed candidate URL. */
    const url = new URL(value)
    /** @brief 固定授权 endpoint / Pinned authorization endpoint. */
    const endpoint = new URL(API_V2_OAUTH_AUTHORIZATION_ENDPOINT)
    if (
      url.origin !== endpoint.origin ||
      url.pathname !== endpoint.pathname ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== '' ||
      url.toString() !== value ||
      [...url.searchParams.keys()].some((name) => !ALLOWED_AUTHORIZATION_PARAMETERS.has(name))
    ) {
      throw new NativeOAuthSystemBrowserError()
    }
    for (const name of REQUIRED_AUTHORIZATION_PARAMETERS) soleParameter(url, name)
    if (url.searchParams.getAll('prompt').length > 1) {
      throw new NativeOAuthSystemBrowserError()
    }

    /** @brief 精确 native redirect URI / Exact native redirect URI. */
    const redirectUri = soleParameter(url, 'redirect_uri')
    /** @brief 已解析 native redirect / Parsed native redirect. */
    const redirect = new URL(redirectUri)
    /** @brief 解码后的 scope tokens / Decoded scope tokens. */
    const scopes = soleParameter(url, 'scope').split(' ')
    /** @brief public client ID / Public client ID. */
    const clientId = soleParameter(url, 'client_id')
    if (
      !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}\/oauth\/callback\/[A-Za-z0-9_-]{43}$/u.test(
        redirectUri
      ) ||
      redirect.toString() !== redirectUri ||
      Number(redirect.port) > 65_535 ||
      soleParameter(url, 'response_type') !== 'code' ||
      soleParameter(url, 'code_challenge_method') !== 'S256' ||
      !CORRELATION_VALUE_PATTERN.test(soleParameter(url, 'code_challenge')) ||
      !CORRELATION_VALUE_PATTERN.test(soleParameter(url, 'state')) ||
      !CORRELATION_VALUE_PATTERN.test(soleParameter(url, 'nonce')) ||
      !['login', 'recovery', 'signup'].includes(soleParameter(url, 'screen_hint')) ||
      clientId.length === 0 ||
      clientId.length > 255 ||
      clientId !== clientId.trim() ||
      [...clientId].some((character) => {
        /** @brief 当前 client ID 字符码点 / Code point of the current client-ID character. */
        const codePoint = character.codePointAt(0) ?? 0
        return codePoint <= 0x20 || codePoint === 0x7f
      }) ||
      scopes.length === 0 ||
      scopes.some((scope) => !SCOPE_TOKEN_PATTERN.test(scope)) ||
      new Set(scopes).size !== scopes.length ||
      !scopes.includes('openid') ||
      (url.searchParams.has('prompt') && !scopes.includes('offline_access')) ||
      (url.searchParams.has('prompt') && soleParameter(url, 'prompt') !== 'consent')
    ) {
      throw new NativeOAuthSystemBrowserError()
    }
    return value
  } catch (error: unknown) {
    if (error instanceof NativeOAuthSystemBrowserError) throw error
    throw new NativeOAuthSystemBrowserError()
  }
}

/**
 * @brief 通过 Electron shell 在默认系统浏览器打开可信授权 URL / Open a trusted authorization URL in the default system browser through Electron shell.
 * @param authorizationUrl native factory 生成的授权 URL / Authorization URL generated by the native factory.
 * @return 浏览器启动请求完成时兑现的 Promise / Promise fulfilled when the browser-launch request completes.
 * @note 本边界不接受 renderer URL，也不在 Electron WebView/BrowserWindow 中加载 hosted identity / This boundary accepts no renderer URL and never loads hosted identity in an Electron WebView or BrowserWindow.
 */
export async function openNativeOAuthInSystemBrowser(authorizationUrl: string): Promise<void> {
  /** @brief 已完成固定 endpoint 与参数校验的 URL / URL validated against the pinned endpoint and parameter grammar. */
  const trustedAuthorizationUrl = assertNativeOAuthSystemBrowserUrl(authorizationUrl)
  try {
    /** @brief 仅在实际主进程调用时加载的 Electron shell / Electron shell loaded only for an actual main-process call. */
    const { shell } = await import('electron')
    await shell.openExternal(trustedAuthorizationUrl, { logUsage: false })
  } catch {
    throw new NativeOAuthSystemBrowserError()
  }
}
