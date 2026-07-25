/** @file Electron renderer 可见的最小运行时信息 / Minimal runtime information visible to the Electron renderer. */

import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import type { ElectronRuntimeInfo } from '@ai-job-workspace/platform'
import { API_V2_PRODUCTION_ORIGIN } from '@ai-job-workspace/product-api-v2'

import type { DesktopDiagnosticsResolution } from './diagnostics-config'

/**
 * @brief 构造不可变的 Electron 运行时信息 / Build immutable Electron runtime information.
 * @param diagnostics 已由主进程解析的诊断配置 / Diagnostics configuration resolved by the main process.
 * @return 不包含特权对象的最小运行时信息 / Minimal runtime information without privileged objects.
 */
export function createDesktopRuntimeInfo(
  diagnostics: DesktopDiagnosticsResolution
): ElectronRuntimeInfo {
  return {
    apiBaseUrl: API_V2_PRODUCTION_ORIGIN,
    appVersion: APPLICATION_VERSION,
    platform: 'electron',
    ...(diagnostics.kind === 'enabled' ? { diagnosticsEndpoint: diagnostics.endpoint } : {}),
    ...(diagnostics.kind === 'invalid' ? { diagnosticsConfigurationError: diagnostics.reason } : {})
  }
}
