/** @file Web 诊断上传配置与严格 CSP 组装 / Web diagnostics-upload configuration and strict CSP composition. */

import { resolveDiagnosticsEndpointConfiguration } from '@ai-job-workspace/platform'
import type { DiagnosticsEndpointConfiguration } from '@ai-job-workspace/platform'

import { resolveApiBaseUrl } from './api-config'
import type { PublicApiEnvironment } from './api-config'

/** @brief 固定的前端诊断批量上传路径 / Fixed frontend-diagnostics batch upload path. */
export { FRONTEND_DIAGNOSTICS_BATCH_PATH } from '@ai-job-workspace/platform'

/** @brief Web 构建可读取的诊断公开环境变量 / Public diagnostics environment values readable by Web builds. */
export interface PublicDiagnosticsEnvironment {
  /** @brief 诊断接收器主机名 / Diagnostics receiver hostname. */
  readonly VITE_DIAGNOSTICS_HOSTNAME?: string | undefined
  /** @brief 诊断接收器端口 / Diagnostics receiver port. */
  readonly VITE_DIAGNOSTICS_PORT?: string | undefined
  /** @brief 诊断接收器协议；省略时使用 HTTPS / Diagnostics receiver protocol; HTTPS when omitted. */
  readonly VITE_DIAGNOSTICS_PROTOCOL?: string | undefined
}

/** @brief 用于 Web CSP 的公开环境合集 / Combined public environment used for Web CSP. */
export type PublicWebEnvironment = PublicApiEnvironment & PublicDiagnosticsEnvironment

/** @brief 可选诊断上传的三态配置 / Three-state configuration for optional diagnostics upload. */
export type DiagnosticsUploadConfiguration = DiagnosticsEndpointConfiguration

/** @brief Web CSP 生成选项 / Options for Web CSP generation. */
export interface WebContentSecurityPolicyOptions {
  /** @brief 未经信任的公开构建环境变量 / Untrusted public build environment values. */
  readonly environment: PublicWebEnvironment
  /** @brief 是否保留本地 Vite 开发连接来源 / Whether to retain local Vite development connection sources. */
  readonly includeDevelopmentSources: boolean
}

/**
 * @brief 解析不阻断产品的可选 Web 诊断上传配置 / Resolve optional Web diagnostics-upload configuration without blocking the product.
 * @param environment 未经信任的公开构建环境变量 / Untrusted public build environment values.
 * @return disabled、invalid 或 enabled 的显式三态 / Explicit disabled, invalid, or enabled state.
 * @note 只在 hostname 和 port 都有效时启用；永不回退到产品 API origin。
 */
export function resolveDiagnosticsUploadConfiguration(
  environment: PublicDiagnosticsEnvironment
): DiagnosticsUploadConfiguration {
  return resolveDiagnosticsEndpointConfiguration({
    hostname: environment.VITE_DIAGNOSTICS_HOSTNAME,
    port: environment.VITE_DIAGNOSTICS_PORT,
    protocol: environment.VITE_DIAGNOSTICS_PROTOCOL
  })
}

/**
 * @brief 生成严格的 Web Content-Security-Policy / Build a strict Web Content-Security-Policy.
 * @param options 环境与开发态选项 / Environment and development-mode options.
 * @return 可注入 HTML 的完整 CSP 文本 / Complete CSP text suitable for HTML injection.
 * @note 运行时不能放宽 CSP；构建时仅加入已验证的 API/diagnostics origin。
 */
export function createWebContentSecurityPolicy(options: WebContentSecurityPolicyOptions): string {
  /** @brief 已校验的产品 API 源，同时用于网络请求和 PDF iframe / Validated product API origin for requests and PDF frames. */
  const apiOrigin = resolveApiBaseUrl(options.environment)
  /** @brief 去重后的 connect-src allowlist / Deduplicated connect-src allowlist. */
  const connectSources = new Set<string>(["'self'", apiOrigin])
  /** @brief 诊断上传的三态解析结果 / Three-state diagnostics-upload resolution. */
  const diagnostics = resolveDiagnosticsUploadConfiguration(options.environment)

  if (diagnostics.kind === 'enabled') connectSources.add(diagnostics.origin)
  if (options.includeDevelopmentSources) {
    connectSources.add('http://localhost:5173')
    connectSources.add('http://127.0.0.1:5173')
    connectSources.add('ws://localhost:5173')
    connectSources.add('ws://127.0.0.1:5173')
  }

  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${[...connectSources].join(' ')}; frame-src 'self' ${apiOrigin}; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'`
}
