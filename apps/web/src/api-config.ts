/** @file Web API 地址配置 / Web API endpoint configuration. */

import { ProductApiConfigurationError, resolveProductApiOrigin } from '@ai-job-workspace/platform'

/** @brief Web 构建可读取的公开 API 环境变量 / Public API environment values available to Web builds. */
export interface PublicApiEnvironment {
  readonly VITE_API_BASE_URL?: string | undefined
  readonly VITE_API_PROTOCOL?: string | undefined
  readonly VITE_API_HOSTNAME?: string | undefined
  readonly VITE_API_PORT?: string | undefined
}

/** @brief Web API 公开配置错误 / Public Web API configuration error. */
export { ProductApiConfigurationError as ApiConfigurationError }

/**
 * @brief 解析 Web 使用的公开 API origin / Resolve the public API origin used by Web.
 * @param environment 未经信任的公开构建配置 / Untrusted public build configuration.
 * @return 已规范化的 HTTP(S) origin / Normalized HTTP(S) origin.
 */
export function resolveApiBaseUrl(environment: PublicApiEnvironment): string {
  return resolveProductApiOrigin({
    baseUrl: environment.VITE_API_BASE_URL,
    hostname: environment.VITE_API_HOSTNAME,
    port: environment.VITE_API_PORT,
    protocol: environment.VITE_API_PROTOCOL
  })
}
