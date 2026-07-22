import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HostStartupFailure } from '@ai-job-workspace/app/ui'
import type { ElectronRuntimeInfo, PlatformBridge } from '@ai-job-workspace/platform'

import { createDesktopDiagnostics } from './create-desktop-observability'

/** @brief React 挂载根节点 / React mounting root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('The desktop renderer root element is missing.')
}

/** @brief 已验证存在的 React 挂载节点 / React mounting node verified to exist. */
const mountElement = rootElement

/** @brief Electron renderer 唯一 React root / Sole React root for the Electron renderer. */
const applicationRoot = createRoot(mountElement)

/** @brief 仅在 Electron renderer 模块内可见的 preload bridge 投影 / Module-local projection of the preload bridge for the Electron renderer. */
interface DesktopHostWindow extends Window {
  /** @brief 仅由 Electron preload 注入的窄平台桥接 / Narrow platform bridge injected only by Electron preload. */
  readonly aiJobWorkspace?: PlatformBridge
}

/**
 * @brief 读取主进程确认的运行时信息 / Read runtime information confirmed by the main process.
 * @return 主进程确认的不可变 Electron 信息 / Immutable Electron information confirmed by the main process.
 * @throws preload bridge 缺失、调用失败或返回非 Electron 信息时抛出 / Throws when the preload bridge is missing, fails, or returns non-Electron information.
 */
async function resolveDesktopRuntime(): Promise<ElectronRuntimeInfo> {
  /** @brief 不扩展全局 Window 的模块局部宿主投影 / Module-local host projection that does not augment global Window. */
  const hostWindow: DesktopHostWindow = window
  /** @brief 只能由 Electron preload 注入的窄 bridge / Narrow bridge injected only by the Electron preload. */
  const bridge = hostWindow.aiJobWorkspace
  if (bridge === undefined) {
    throw new Error('The Electron preload bridge is unavailable.')
  }

  /** @brief 主进程返回的判别式运行时信息 / Discriminated runtime information returned by the main process. */
  const runtimeInfo = await bridge.getRuntimeInfo()
  if (runtimeInfo.platform !== 'electron') {
    throw new Error('The Electron preload bridge returned a non-Electron runtime.')
  }

  return runtimeInfo
}

/**
 * @brief 创建并挂载 Electron renderer 应用 / Create and mount the Electron renderer application.
 * @return 挂载完成后的 Promise / Promise fulfilled after mounting completes.
 */
async function bootstrapDesktopRenderer(): Promise<void> {
  /** @brief 启动时一次性确认的运行时信息 / Runtime information confirmed once during bootstrap. */
  const runtimeInfo = await resolveDesktopRuntime()
  /** @brief 仅当 Electron 主进程验证过时才使用的上传 endpoint / Upload endpoint used only when verified by the Electron main process. */
  const endpoint = runtimeInfo.diagnosticsEndpoint
  /** @brief 主进程拒绝诊断上传时给出的无敏感原因 / Non-sensitive reason supplied when the main process rejected diagnostics upload. */
  const diagnosticsConfigurationError = runtimeInfo.diagnosticsConfigurationError
  /** @brief Electron renderer 统一诊断端口 / Unified diagnostics port for the Electron renderer. */
  const diagnostics = createDesktopDiagnostics(endpoint)

  if (diagnosticsConfigurationError !== undefined) {
    diagnostics.emit('diagnostics.config_invalid', { reason: diagnosticsConfigurationError })
  }

  diagnostics.emit('runtime.info_loaded', {
    app_version: runtimeInfo.appVersion,
    platform: runtimeInfo.platform,
    upload_enabled: endpoint !== undefined
  })
  throw new Error(
    'Desktop startup is closed until the API v2 system-browser OAuth boundary is available.'
  )
}

/**
 * @brief 重新加载 Electron renderer 以重试已修正的宿主配置 / Reload the Electron renderer to retry corrected host configuration.
 * @return 无返回值 / No return value.
 */
function reloadDesktopApplication(): void {
  globalThis.location.reload()
}

/**
 * @brief 显示可重试且脱敏的 Electron renderer 启动错误 / Show a retryable, configuration-safe Electron-renderer startup error.
 * @param error 启动失败值 / Bootstrap failure value.
 * @return 无返回值 / No return value.
 */
function reportDesktopBootstrapFailure(error: unknown): void {
  console.error('Desktop renderer failed to start.', error)
  applicationRoot.render(
    <StrictMode>
      <HostStartupFailure locale={navigator.language} onRetry={reloadDesktopApplication} />
    </StrictMode>
  )
}

void bootstrapDesktopRenderer().catch(reportDesktopBootstrapFailure)
