/** @file Electron main 的 native OAuth public-client 配置 / Native OAuth public-client configuration in Electron main. */

/** @brief Electron 产品请求的冻结 OAuth scopes / Frozen OAuth scopes requested by the Electron product. */
export const DESKTOP_OAUTH_SCOPES = Object.freeze([
  'openid',
  'profile',
  'offline_access',
  'workspace.read',
  'resume.read',
  'resume.write'
] as const)

/** @brief Electron main 可读取的 OAuth 环境变量 / OAuth environment variables readable by Electron main. */
export interface DesktopOAuthEnvironment {
  /** @brief Authorization Server 注册的 native public client ID / Native public-client ID registered with the Authorization Server. */
  readonly AI_JOB_WORKSPACE_OAUTH_CLIENT_ID?: string | undefined
}

/** @brief 严格验证的 Electron OAuth 配置 / Strictly validated Electron OAuth configuration. */
export interface DesktopOAuthConfiguration {
  /** @brief 注册的 public client ID / Registered public client ID. */
  readonly clientId: string
  /** @brief 产品请求的固定 scopes / Frozen scopes requested by the product. */
  readonly scopes: typeof DESKTOP_OAUTH_SCOPES
}

/** @brief Electron native OAuth 配置错误 / Electron native OAuth configuration error. */
export class DesktopOAuthConfigurationError extends Error {
  override readonly name = 'DesktopOAuthConfigurationError'
}

/**
 * @brief 解析不含 client secret 的 native public-client 配置 / Resolve native public-client configuration containing no client secret.
 * @param environment 未经信任的 main 环境 / Untrusted main-process environment.
 * @return 冻结 client ID 与产品 scopes / Frozen client ID and product scopes.
 */
export function resolveDesktopOAuthConfiguration(
  environment: DesktopOAuthEnvironment
): DesktopOAuthConfiguration {
  /** @brief 构建或部署提供的 public client ID / Public client ID supplied by build or deployment. */
  const clientId = environment.AI_JOB_WORKSPACE_OAUTH_CLIENT_ID
  if (
    typeof clientId !== 'string' ||
    clientId.length === 0 ||
    clientId.length > 255 ||
    clientId !== clientId.trim() ||
    [...clientId].some((character) => {
      /** @brief 当前 Unicode code point / Current Unicode code point. */
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x20 || codePoint === 0x7f
    })
  ) {
    throw new DesktopOAuthConfigurationError(
      'AI_JOB_WORKSPACE_OAUTH_CLIENT_ID must be a valid native public client ID.'
    )
  }
  return Object.freeze({ clientId, scopes: DESKTOP_OAUTH_SCOPES })
}
