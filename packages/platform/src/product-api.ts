/** @file 产品 API origin 的跨宿主配置 / Cross-host product API-origin configuration. */

import { resolveCspSafeHttpOrigin } from './diagnostics'

/** @brief 默认生产 API origin / Default production API origin. */
export const DEFAULT_PRODUCT_API_ORIGIN = 'https://api.hmalliances.org'

/** @brief 不依赖宿主变量命名的产品 API 配置 / Host-agnostic product API configuration. */
export interface ProductApiEnvironment {
  /** @brief 完整 API origin / Complete API origin. */
  readonly baseUrl?: string | undefined
  /** @brief 拆分配置中的协议 / Protocol in split configuration. */
  readonly protocol?: string | undefined
  /** @brief 拆分配置中的主机名 / Hostname in split configuration. */
  readonly hostname?: string | undefined
  /** @brief 拆分配置中的端口 / Port in split configuration. */
  readonly port?: string | undefined
}

/** @brief 产品 API 配置错误 / Product API configuration error. */
export class ProductApiConfigurationError extends Error {
  override readonly name = 'ProductApiConfigurationError'
}

/**
 * @brief 判断配置项是否含非空文本 / Decide whether a setting contains non-empty text.
 * @param value 待检查的环境值 / Environment value to inspect.
 * @return 含非空文本时为 true / True when non-empty text is present.
 */
function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0
}

/**
 * @brief 校验并规范化 HTTP(S) origin / Validate and normalize an HTTP(S) origin.
 * @param value 未受信任的候选值 / Untrusted candidate value.
 * @return 可安全用于 fetch 与 CSP 的 origin / Origin safe for fetch and CSP.
 * @throws ProductApiConfigurationError 候选值不是纯 HTTP(S) origin 时抛出 / Thrown when the candidate is not a plain HTTP(S) origin.
 */
function validateOrigin(value: string): string {
  /** @brief CSP-safe HTTP(S) origin，失败时为 undefined / CSP-safe HTTP(S) origin, or undefined on failure. */
  const origin = resolveCspSafeHttpOrigin(value)
  if (origin === undefined) {
    throw new ProductApiConfigurationError(
      'The API endpoint must be a CSP-safe HTTP(S) hostname origin without credentials, path, query, or hash.'
    )
  }

  /** @brief 已规范化 origin 的 URL 投影 / URL projection of the normalized origin. */
  const url = new URL(origin)
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ProductApiConfigurationError(
      'Plain HTTP is only allowed for explicit localhost or 127.0.0.1 development origins.'
    )
  }

  return origin
}

/**
 * @brief 解析任意宿主使用的产品 API origin / Resolve the product API origin used by any host.
 * @param environment 由宿主映射后的不可信配置 / Untrusted configuration mapped by a host.
 * @return 已规范化的 HTTP(S) origin / Normalized HTTP(S) origin.
 * @throws ProductApiConfigurationError 配置互斥或值无效时抛出 / Thrown for conflicting or invalid settings.
 */
export function resolveProductApiOrigin(environment: ProductApiEnvironment): string {
  /** @brief 去除首尾空白后的完整 origin / Complete origin after trimming. */
  const baseUrl = environment.baseUrl?.trim()
  /** @brief 拆分配置候选值 / Candidate split settings. */
  const splitValues = [environment.protocol, environment.hostname, environment.port]

  if (hasValue(baseUrl) && splitValues.some(hasValue)) {
    throw new ProductApiConfigurationError(
      'Use either a complete API origin or split API settings, not both.'
    )
  }

  if (hasValue(baseUrl)) return validateOrigin(baseUrl)

  /** @brief 规范化后的协议 / Normalized protocol. */
  const protocol = (environment.protocol?.trim() || 'https').replace(/:$/u, '').toLowerCase()
  /** @brief 规范化后的主机名 / Normalized hostname. */
  const hostname = environment.hostname?.trim() || new URL(DEFAULT_PRODUCT_API_ORIGIN).hostname
  /** @brief 规范化前的可选端口 / Optional port before normalization. */
  const port = environment.port?.trim()

  if (protocol !== 'http' && protocol !== 'https') {
    throw new ProductApiConfigurationError('The API protocol must be http or https.')
  }
  if (hostname.length === 0) {
    throw new ProductApiConfigurationError('The API hostname must not be empty.')
  }
  if (
    port !== undefined &&
    port.length > 0 &&
    (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535)
  ) {
    throw new ProductApiConfigurationError('The API port must be an integer between 1 and 65535.')
  }

  return validateOrigin(`${protocol}://${hostname}${hasValue(port) ? `:${port}` : ''}`)
}
