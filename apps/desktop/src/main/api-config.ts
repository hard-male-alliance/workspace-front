/** @file Electron 主进程的产品 API 配置映射 / Product API configuration mapping for the Electron main process. */

import { resolveProductApiOrigin } from '@ai-job-workspace/platform'

/** @brief Electron 主进程可读取的产品 API 环境变量 / Product API environment variables readable by the Electron main process. */
export interface DesktopApiEnvironment {
  /** @brief 完整产品 API origin / Complete product API origin. */
  readonly AI_JOB_WORKSPACE_API_BASE_URL?: string | undefined
  /** @brief 拆分配置中的协议 / Protocol in split configuration. */
  readonly AI_JOB_WORKSPACE_API_PROTOCOL?: string | undefined
  /** @brief 拆分配置中的主机名 / Hostname in split configuration. */
  readonly AI_JOB_WORKSPACE_API_HOSTNAME?: string | undefined
  /** @brief 拆分配置中的端口 / Port in split configuration. */
  readonly AI_JOB_WORKSPACE_API_PORT?: string | undefined
}

/**
 * @brief 解析 Electron 产品 API origin / Resolve the Electron product API origin.
 * @param environment 未受信任的主进程环境配置 / Untrusted main-process environment settings.
 * @return 已规范化并可安全加入 CSP 的 HTTP(S) origin / Normalized HTTP(S) origin safe for CSP.
 * @throws ProductApiConfigurationError 配置互斥或值无效时抛出 / Thrown for conflicting or invalid settings.
 */
export function resolveDesktopApiBaseUrl(environment: DesktopApiEnvironment): string {
  return resolveProductApiOrigin({
    baseUrl: environment.AI_JOB_WORKSPACE_API_BASE_URL,
    hostname: environment.AI_JOB_WORKSPACE_API_HOSTNAME,
    port: environment.AI_JOB_WORKSPACE_API_PORT,
    protocol: environment.AI_JOB_WORKSPACE_API_PROTOCOL
  })
}
