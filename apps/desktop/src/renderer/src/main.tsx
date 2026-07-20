import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway,
  WorkspaceApp
} from '@ai-job-workspace/app'
import { APPLICATION_VERSION, createWebPlatformBridge } from '@ai-job-workspace/platform'
import type { RuntimeInfo } from '@ai-job-workspace/platform'

import { createDesktopDiagnostics } from './create-desktop-observability'

/** @brief React 挂载根节点 / React mounting root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('The desktop renderer root element is missing.')
}

/** @brief 已验证存在的 React 挂载节点 / React mounting node verified to exist. */
const mountElement = rootElement

/**
 * @brief 读取主进程确认的运行时信息 / Read runtime information confirmed by the main process.
 * @return 已确认信息；bridge 失效时为 undefined / Confirmed information, or undefined when the bridge fails.
 */
async function resolveDesktopRuntimeInfo(): Promise<RuntimeInfo | undefined> {
  /** @brief Electron 窄 bridge 或测试中的安全 Web 回退 / Electron narrow bridge or safe Web fallback in tests. */
  const bridge = window.aiJobWorkspace ?? createWebPlatformBridge(APPLICATION_VERSION)

  try {
    return await bridge.getRuntimeInfo()
  } catch {
    return undefined
  }
}

/**
 * @brief 创建并挂载 Electron renderer 应用 / Create and mount the Electron renderer application.
 * @return 挂载完成后的 Promise / Promise fulfilled after mounting completes.
 */
async function bootstrapDesktopRenderer(): Promise<void> {
  /** @brief 主进程验证的可选运行时信息 / Optional runtime information validated by the main process. */
  const runtimeInfo = await resolveDesktopRuntimeInfo()
  /** @brief 仅当 Electron 主进程验证过时才使用的上传 endpoint / Upload endpoint used only when verified by the Electron main process. */
  const endpoint =
    runtimeInfo?.platform === 'electron' ? runtimeInfo.diagnosticsEndpoint : undefined
  /** @brief 主进程拒绝诊断上传时给出的无敏感原因 / Non-sensitive reason supplied when the main process rejected diagnostics upload. */
  const diagnosticsConfigurationError =
    runtimeInfo?.platform === 'electron' ? runtimeInfo.diagnosticsConfigurationError : undefined
  /** @brief Electron renderer 统一诊断端口 / Unified diagnostics port for the Electron renderer. */
  const diagnostics = createDesktopDiagnostics(endpoint)

  if (diagnosticsConfigurationError !== undefined) {
    diagnostics.emit('diagnostics.config_invalid', { reason: diagnosticsConfigurationError })
  }

  if (runtimeInfo === undefined) {
    diagnostics.emit('runtime.info_failed', { error_kind: 'unknown' })
  } else {
    diagnostics.emit('runtime.info_loaded', {
      app_version: runtimeInfo.appVersion,
      platform: runtimeInfo.platform,
      upload_enabled: endpoint !== undefined
    })
  }
  diagnostics.emit('app.started', {
    app_version: APPLICATION_VERSION,
    platform: 'electron',
    upload_enabled: endpoint !== undefined
  })

  createRoot(mountElement).render(
    <StrictMode>
      <WorkspaceApp
        diagnostics={diagnostics}
        gateways={{
          workspace: new MockWorkspaceGateway(),
          resume: new MockResumeGateway(),
          interview: new MockInterviewGateway(),
          knowledge: new MockKnowledgeGateway()
        }}
      />
    </StrictMode>
  )
}

void bootstrapDesktopRenderer()
