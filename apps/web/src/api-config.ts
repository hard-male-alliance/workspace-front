/** @file Web API 地址配置 / Web API endpoint configuration. */

/** @brief 默认 API 协议 / Default API protocol. */
const DEFAULT_API_PROTOCOL = 'https'
/** @brief 默认 API 主机名 / Default API hostname. */
const DEFAULT_API_HOSTNAME = 'api.hmalliances.org'

/** @brief API 地址的独立组成项 / Independent API endpoint components. */
export interface ApiEndpointConfig {
  /** @brief HTTP 协议，不含冒号 / HTTP protocol without a colon. */
  readonly protocol: string
  /** @brief API 主机名 / API hostname. */
  readonly hostname: string
  /** @brief 可选端口；空值使用协议默认端口 / Optional port; empty uses the protocol default. */
  readonly port?: string | undefined
}

/**
 * @brief 构建 API origin / Build the API origin.
 * @param config 地址组成项 / Endpoint components.
 * @return 规范化 HTTP(S) origin / Normalized HTTP(S) origin.
 */
export function buildApiBaseUrl(config: ApiEndpointConfig): string {
  const protocol = config.protocol.replace(/:$/, '').toLowerCase()
  if (protocol !== 'http' && protocol !== 'https') {
    throw new TypeError('VITE_API_PROTOCOL must be http or https.')
  }
  const hostname = config.hostname.trim()
  if (hostname === '') {
    throw new TypeError('VITE_API_HOSTNAME must not be empty.')
  }
  const defaultPort = protocol === 'http' ? '80' : '443'
  const port = config.port?.trim() || defaultPort
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new TypeError('VITE_API_PORT must be an integer between 1 and 65535.')
  }
  const url = new URL(`${protocol}://${hostname}`)
  url.port = port
  return url.origin
}

/** @brief 当前构建使用的 API origin / API origin used by the current build. */
export const apiBaseUrl = buildApiBaseUrl({
  protocol: import.meta.env.VITE_API_PROTOCOL ?? DEFAULT_API_PROTOCOL,
  hostname: import.meta.env.VITE_API_HOSTNAME ?? DEFAULT_API_HOSTNAME,
  port: import.meta.env.VITE_API_PORT
})
