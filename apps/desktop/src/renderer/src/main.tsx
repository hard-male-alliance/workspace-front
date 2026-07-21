import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'
import type { ElectronRuntimeInfo, PlatformBridge } from '@ai-job-workspace/platform'
import { createProductGateways } from '@ai-job-workspace/product-runtime'

import { createDesktopDiagnostics } from './create-desktop-observability'

/** @brief React 挂载根节点 / React mounting root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('The desktop renderer root element is missing.')
}

/** @brief 已验证存在的 React 挂载节点 / React mounting node verified to exist. */
const mountElement = rootElement

/** @brief preload bridge 与主进程确认信息的启动快照 / Bootstrap snapshot of the preload bridge and main-confirmed information. */
interface DesktopRuntimeSnapshot {
  /** @brief preload 注入的窄宿主 bridge / Narrow host bridge injected by preload. */
  readonly bridge: PlatformBridge
  /** @brief 主进程确认的 Electron 运行时信息 / Electron runtime information confirmed by main. */
  readonly runtimeInfo: ElectronRuntimeInfo
}

/**
 * @brief 读取主进程确认的运行时信息 / Read runtime information confirmed by the main process.
 * @return bridge 与已确认 Electron 信息的不可变快照 / Immutable snapshot of the bridge and confirmed Electron information.
 * @throws preload bridge 缺失、调用失败或返回非 Electron 信息时抛出 / Throws when the preload bridge is missing, fails, or returns non-Electron information.
 */
async function resolveDesktopRuntime(): Promise<DesktopRuntimeSnapshot> {
  /** @brief 只能由 Electron preload 注入的窄 bridge / Narrow bridge injected only by the Electron preload. */
  const bridge = window.aiJobWorkspace
  if (bridge === undefined) {
    throw new Error('The Electron preload bridge is unavailable.')
  }

  /** @brief 主进程返回的判别式运行时信息 / Discriminated runtime information returned by the main process. */
  const runtimeInfo = await bridge.getRuntimeInfo()
  if (runtimeInfo.platform !== 'electron') {
    throw new Error('The Electron preload bridge returned a non-Electron runtime.')
  }

  return { bridge, runtimeInfo }
}

/**
 * @brief 创建并挂载 Electron renderer 应用 / Create and mount the Electron renderer application.
 * @return 挂载完成后的 Promise / Promise fulfilled after mounting completes.
 */
async function bootstrapDesktopRenderer(): Promise<void> {
  /** @brief 启动时一次性确认的 bridge 与运行时信息 / Bridge and runtime information confirmed once during bootstrap. */
  const { bridge, runtimeInfo } = await resolveDesktopRuntime()
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
  diagnostics.emit('app.started', {
    app_version: runtimeInfo.appVersion,
    platform: 'electron',
    upload_enabled: endpoint !== undefined
  })

  createRoot(mountElement).render(
    <StrictMode>
      <WorkspaceApp
        artifactSave={bridge}
        diagnostics={diagnostics}
        gateways={createProductGateways(runtimeInfo.apiBaseUrl, diagnostics)}
        runtimeInfo={runtimeInfo}
      />
    </StrictMode>
  )
}

/**
 * @brief 显示不可恢复的 Electron renderer 启动错误 / Show an unrecoverable Electron-renderer startup error.
 * @param error 启动失败值 / Bootstrap failure value.
 * @return 无返回值 / No return value.
 */
function reportDesktopBootstrapFailure(error: unknown): void {
  console.error('Desktop renderer failed to start.', error)
  mountElement.setAttribute('role', 'alert')
  mountElement.textContent = 'The desktop application could not start safely.'
}

void bootstrapDesktopRenderer().catch(reportDesktopBootstrapFailure)
