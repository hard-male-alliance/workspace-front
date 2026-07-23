/** @file Web OAuth public-client 配置边界 / Web OAuth public-client configuration boundary. */

/** @brief Web OAuth 固定请求 scopes / Frozen scopes requested by the Web OAuth client. */
export const WEB_OAUTH_SCOPES = Object.freeze([
  'openid',
  'profile',
  'offline_access',
  'workspace.read',
  'resume.read',
  'resume.write'
] as const)

/** @brief Web OAuth 公开构建配置 / Public Web OAuth build configuration. */
export interface PublicWebOAuthEnvironment {
  /** @brief Authorization Server 注册的 public client ID / Public client ID registered with the Authorization Server. */
  readonly VITE_OAUTH_CLIENT_ID?: string | undefined
}

/** @brief 已验证 Web OAuth 配置 / Validated Web OAuth configuration. */
export interface WebOAuthConfiguration {
  /** @brief 注册的 public client ID / Registered public client ID. */
  readonly clientId: string
  /** @brief 当前部署的精确 HTTPS callback URI / Exact HTTPS callback URI of this deployment. */
  readonly redirectUri: string
  /** @brief 产品请求的冻结 scopes / Frozen scopes requested by the product. */
  readonly scopes: typeof WEB_OAUTH_SCOPES
}

/** @brief Web OAuth origin validation policy / Web OAuth origin validation policy. */
export interface WebOAuthConfigurationOptions {
  /** @brief Allow standard HTTP loopback origins only for Vite development. */
  readonly allowDevelopmentLoopbackHttp?: boolean | undefined
}

/** @brief Web OAuth 配置错误 / Web OAuth configuration error. */
export class WebOAuthConfigurationError extends Error {
  override readonly name = 'WebOAuthConfigurationError'
}

/** @brief 与当前部署配置比对所需的事务字段 / Transaction fields required for deployment matching. */
export interface WebOAuthTransactionConfigurationProjection {
  /** @brief 事务 public client ID / Transaction public client ID. */
  readonly clientId: string
  /** @brief 事务 redirect URI / Transaction redirect URI. */
  readonly redirectUri: string
  /** @brief 事务请求 scopes / Scopes requested by the transaction. */
  readonly scopes: readonly string[]
}

/**
 * @brief 防止构建配置变化后交换旧 callback / Prevent exchange of a callback created under stale build configuration.
 * @param transaction 已恢复事务的配置投影 / Configuration projection of the restored transaction.
 * @param configuration 当前部署配置 / Current deployment configuration.
 */
export function assertWebOAuthTransactionConfiguration(
  transaction: WebOAuthTransactionConfigurationProjection,
  configuration: WebOAuthConfiguration
): void {
  if (
    transaction.clientId !== configuration.clientId ||
    transaction.redirectUri !== configuration.redirectUri ||
    transaction.scopes.length !== configuration.scopes.length ||
    transaction.scopes.some((scope, index) => scope !== configuration.scopes[index])
  ) {
    throw new WebOAuthConfigurationError(
      'The OAuth callback was created under a different Web deployment configuration.'
    )
  }
}

/**
 * @brief 解析 public client ID 与当前 HTTPS redirect URI / Resolve the public client ID and current HTTPS redirect URI.
 * @param environment 未经信任的公开构建环境 / Untrusted public build environment.
 * @param applicationOrigin 当前 Web 应用 origin / Current Web application origin.
 * @return 不包含任何凭证的 OAuth 配置 / OAuth configuration containing no credentials.
 */
export function resolveWebOAuthConfiguration(
  environment: PublicWebOAuthEnvironment,
  applicationOrigin: string,
  options: WebOAuthConfigurationOptions = {}
): WebOAuthConfiguration {
  /** @brief 构建期 public client ID / Build-time public client ID. */
  const clientId = environment.VITE_OAUTH_CLIENT_ID
  if (
    typeof clientId !== 'string' ||
    clientId.length === 0 ||
    clientId.length > 255 ||
    clientId !== clientId.trim() ||
    [...clientId].some((character) => {
      /** @brief 当前字符 code point / Current character code point. */
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x20 || codePoint === 0x7f
    })
  ) {
    throw new WebOAuthConfigurationError(
      'VITE_OAUTH_CLIENT_ID must be a valid public client ID. Create apps/web/.env from apps/web/.env.example and set VITE_OAUTH_CLIENT_ID to the registered public Web OAuth client ID.'
    )
  }

  try {
    /** @brief 当前应用 origin / Current application origin. */
    const origin = new URL(applicationOrigin)
    /** @brief Canonical origin without path, credentials, search, or hash. */
    const isCanonicalOrigin =
      origin.origin === applicationOrigin &&
      origin.pathname === '/' &&
      origin.search === '' &&
      origin.hash === '' &&
      origin.username === '' &&
      origin.password === ''
    /** @brief Production and preview deployment origin policy. */
    const isHttpsDeploymentOrigin = origin.protocol === 'https:' && isCanonicalOrigin
    /** @brief Vite development-only standard loopback HTTP policy. */
    const isDevelopmentLoopbackHttpOrigin =
      options.allowDevelopmentLoopbackHttp === true &&
      origin.protocol === 'http:' &&
      isCanonicalOrigin &&
      origin.port !== '' &&
      (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1')

    if (!isHttpsDeploymentOrigin && !isDevelopmentLoopbackHttpOrigin) {
      throw new Error()
    }
    return Object.freeze({
      clientId,
      redirectUri: new URL('/oauth/callback', origin).toString(),
      scopes: WEB_OAUTH_SCOPES
    })
  } catch {
    throw new WebOAuthConfigurationError(
      'The Web OAuth deployment origin must be a canonical HTTPS origin.'
    )
  }
}
