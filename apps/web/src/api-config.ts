/** @file Web API 地址配置 / Web API endpoint configuration. */

/** @brief Web 构建可读取的公开 API 环境变量 / Public API environment values available to Web builds. */
export interface PublicApiEnvironment {
  readonly VITE_API_BASE_URL?: string | undefined
  readonly VITE_API_PROTOCOL?: string | undefined
  readonly VITE_API_HOSTNAME?: string | undefined
  readonly VITE_API_PORT?: string | undefined
}

/** @brief Web API 公开配置错误 / Public Web API configuration error. */
export class ApiConfigurationError extends Error {
  override readonly name = 'ApiConfigurationError'
}

/** @brief 判断环境变量是否包含非空文本 / Whether an environment value contains non-empty text. */
function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0
}

/** @brief 校验并规范化 HTTP(S) origin / Validate and normalize an HTTP(S) origin. */
function validateOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ApiConfigurationError('The API endpoint must be a valid HTTP(S) origin.')
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new ApiConfigurationError(
      'The API endpoint must be an HTTP(S) origin without credentials, path, query, or hash.'
    )
  }

  return url.origin
}

/**
 * @brief 解析 Web 使用的公开 API origin / Resolve the public API origin used by Web.
 * @param environment 未经信任的公开构建配置 / Untrusted public build configuration.
 * @return 已规范化的 HTTP(S) origin / Normalized HTTP(S) origin.
 */
export function resolveApiBaseUrl(environment: PublicApiEnvironment): string {
  const baseUrl = environment.VITE_API_BASE_URL?.trim()
  const splitValues = [
    environment.VITE_API_PROTOCOL,
    environment.VITE_API_HOSTNAME,
    environment.VITE_API_PORT
  ]

  if (hasValue(baseUrl) && splitValues.some(hasValue)) {
    throw new ApiConfigurationError('Use either VITE_API_BASE_URL or split API settings, not both.')
  }

  if (hasValue(baseUrl)) {
    return validateOrigin(baseUrl)
  }

  const protocol = (environment.VITE_API_PROTOCOL?.trim() || 'https')
    .replace(/:$/u, '')
    .toLowerCase()
  const hostname = environment.VITE_API_HOSTNAME?.trim() || 'api.hmalliances.org'
  const port = environment.VITE_API_PORT?.trim()

  if (protocol !== 'http' && protocol !== 'https') {
    throw new ApiConfigurationError('VITE_API_PROTOCOL must be http or https.')
  }
  if (hostname.length === 0) {
    throw new ApiConfigurationError('VITE_API_HOSTNAME must not be empty.')
  }
  if (
    port !== undefined &&
    port.length > 0 &&
    (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535)
  ) {
    throw new ApiConfigurationError('VITE_API_PORT must be an integer between 1 and 65535.')
  }

  return validateOrigin(`${protocol}://${hostname}${hasValue(port) ? `:${port}` : ''}`)
}
