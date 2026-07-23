/** @file 桌面诊断上传公开配置与 CSP 组装 / Desktop diagnostics upload public configuration and CSP composition. */

import { resolveDiagnosticsEndpointConfiguration } from '@ai-job-workspace/platform'
import type { DiagnosticsConfigurationErrorReason } from '@ai-job-workspace/platform'
import { API_V2_PRODUCTION_ORIGIN } from '@ai-job-workspace/product-api-v2'

/** @brief 桌面进程可读取的诊断环境变量 / Diagnostics environment variables readable by the desktop process. */
export interface DesktopDiagnosticsEnvironment {
  /** @brief 诊断服务主机名 / Diagnostics service hostname. */
  readonly AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME?: string | undefined
  /** @brief 诊断服务端口 / Diagnostics service port. */
  readonly AI_JOB_WORKSPACE_DIAGNOSTICS_PORT?: string | undefined
  /** @brief 诊断服务协议；省略时使用 HTTPS / Diagnostics service protocol; HTTPS when omitted. */
  readonly AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL?: string | undefined
}

/** @brief 经主进程校验的诊断服务配置 / Diagnostics service configuration validated by the main process. */
export interface DesktopDiagnosticsConfiguration {
  /** @brief 仅允许 CSP 使用的规范化 origin / Normalized origin permitted only for CSP use. */
  readonly origin: string
  /** @brief renderer 可安全使用的固定批量上传 endpoint / Fixed batch-upload endpoint safe for renderer use. */
  readonly endpoint: string
}

/** @brief 桌面诊断配置的显式解析结果 / Explicit desktop diagnostics configuration resolution. */
export type DesktopDiagnosticsResolution =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'invalid'; readonly reason: DiagnosticsConfigurationErrorReason }
  | ({ readonly kind: 'enabled' } & DesktopDiagnosticsConfiguration)

/**
 * @brief 解析可选的桌面诊断服务配置 / Resolve optional desktop diagnostics-service configuration.
 * @param environment 未受信任的桌面进程环境变量 / Untrusted desktop-process environment variables.
 * @return disabled、invalid 或带固定 endpoint 的 enabled 结果 / disabled, invalid, or enabled with a fixed endpoint.
 * @note 该函数故意不抛出配置错误，诊断上传不能阻断产品启动 / This function intentionally never throws: diagnostics uploads must not block product startup.
 */
export function resolveDesktopDiagnosticsConfiguration(
  environment: DesktopDiagnosticsEnvironment
): DesktopDiagnosticsResolution {
  /** @brief 跨 renderer 共用的严格解析结果 / Strict resolution result shared across renderers. */
  const configuration = resolveDiagnosticsEndpointConfiguration({
    hostname: environment.AI_JOB_WORKSPACE_DIAGNOSTICS_HOSTNAME,
    port: environment.AI_JOB_WORKSPACE_DIAGNOSTICS_PORT,
    protocol: environment.AI_JOB_WORKSPACE_DIAGNOSTICS_PROTOCOL
  })
  if (configuration.kind !== 'enabled') return configuration
  return { endpoint: configuration.endpoint, kind: 'enabled', origin: configuration.origin }
}

/**
 * @brief 生成生产 Electron renderer 的 CSP / Build the production Electron-renderer CSP.
 * @param diagnostics 已由主进程验证的诊断配置 / Diagnostics configuration already validated by the main process.
 * @return 不使用通配符的最小 CSP / Minimal CSP without wildcards.
 * @note CSP 仅允许诊断 origin，而不是携带路径的 endpoint；PDF frame 只允许已验证内存内容的 Blob URL / CSP permits only the diagnostics origin, not a path-bearing endpoint; PDF frames allow only Blob URLs backed by validated in-memory content.
 */
export function createProductionContentSecurityPolicy(
  diagnostics: DesktopDiagnosticsResolution
): string {
  /** @brief 最小网络连接来源列表 / Minimal network connection source list. */
  const connectSources = [
    "'self'",
    API_V2_PRODUCTION_ORIGIN,
    ...(diagnostics.kind === 'enabled' ? [diagnostics.origin] : [])
  ]
  /** @brief 去重后的连接来源 / Deduplicated connection sources. */
  const uniqueConnectSources = [...new Set(connectSources)].join(' ')

  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'self' blob:; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${uniqueConnectSources}; media-src 'self' blob:; worker-src 'self' blob:`
}
