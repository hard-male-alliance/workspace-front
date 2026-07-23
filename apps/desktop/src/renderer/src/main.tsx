/** @file Electron renderer 的 API v2 产品组合根 / API v2 product composition root for the Electron renderer. */

import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'
import { HostedAuthenticationScreen, HostStartupFailure } from '@ai-job-workspace/app/ui'
import type {
  DesktopAuthenticatedSession,
  DesktopAuthenticationFailureReason,
  ElectronRuntimeInfo,
  HostedIdentityScreenHint,
  PlatformBridge
} from '@ai-job-workspace/platform'
import { createProductGateways } from '@ai-job-workspace/product-runtime'

import { createDesktopDiagnostics } from './create-desktop-observability'
import { DesktopSignOutBoundary } from './DesktopSignOutBoundary'
import {
  createDesktopApiV2Authentication,
  requireDesktopAuthenticatedSession
} from './desktop-authentication'
import { beginDesktopSignOut } from './desktop-sign-out'
import type { DesktopSignOutBoundaryMode } from './desktop-sign-out'

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

/** @brief 已确认的 Electron host 依赖 / Confirmed Electron-host dependencies. */
interface ResolvedDesktopHost {
  /** @brief context-isolated preload bridge / Context-isolated preload bridge. */
  readonly bridge: PlatformBridge
  /** @brief main 确认的运行时信息 / Runtime information confirmed by main. */
  readonly runtimeInfo: ElectronRuntimeInfo
}

/**
 * @brief 读取 preload bridge 与 main 确认的运行时 / Read the preload bridge and main-confirmed runtime.
 * @return 已确认 Electron host / Confirmed Electron host.
 * @throws preload bridge 缺失、调用失败或返回非 Electron 信息时抛出 / Throws when the bridge is missing, fails, or returns non-Electron information.
 */
async function resolveDesktopHost(): Promise<ResolvedDesktopHost> {
  /** @brief 不扩展全局 Window 的模块局部宿主投影 / Module-local host projection that does not augment global Window. */
  const hostWindow: DesktopHostWindow = window
  /** @brief 只能由 Electron preload 注入的窄 bridge / Narrow bridge injected only by Electron preload. */
  const bridge = hostWindow.aiJobWorkspace
  if (bridge === undefined) throw new Error('The Electron preload bridge is unavailable.')
  /** @brief 主进程返回的判别式运行时信息 / Discriminated runtime information returned by main. */
  const runtimeInfo = await bridge.getRuntimeInfo()
  if (runtimeInfo.platform !== 'electron') {
    throw new Error('The Electron preload bridge returned a non-Electron runtime.')
  }
  return Object.freeze({ bridge, runtimeInfo })
}

/**
 * @brief 呈现 native hosted identity 入口 / Render the native hosted-identity entry.
 * @param host 已确认 Electron host / Confirmed Electron host.
 * @param diagnostics renderer 诊断端口 / Renderer diagnostics port.
 * @param failureReason 可选低基数失败状态 / Optional low-cardinality failure state.
 */
function renderAuthentication(
  host: ResolvedDesktopHost,
  diagnostics: ReturnType<typeof createDesktopDiagnostics>,
  failureReason?: DesktopAuthenticationFailureReason
): void {
  /**
   * @brief 经封闭 IPC 发起系统浏览器授权 / Start system-browser authorization through closed IPC.
   * @param screenHint hosted 页面提示 / Hosted-page hint.
   */
  async function authorize(screenHint: HostedIdentityScreenHint): Promise<void> {
    /** @brief main 完成交换、验证和安全持久化后的结果 / Result after main completes exchange, verification, and secure persistence. */
    const result = await host.bridge.authentication.authorize(screenHint)
    /** @brief 只含短期 access token 的 renderer 会话 / Renderer session containing only a short-lived access token. */
    const session = requireDesktopAuthenticatedSession(result)
    renderWorkspace(host, diagnostics, session)
  }

  applicationRoot.render(
    <StrictMode>
      <HostedAuthenticationScreen
        failureReason={failureReason}
        locale={navigator.language}
        onAuthorize={authorize}
      />
    </StrictMode>
  )
}

/**
 * @brief 呈现已移除 renderer 凭据的登出锁定边界 / Render the sign-out lock boundary after removing renderer credentials.
 * @param mode 清理中或阻断恢复 / Clearing or blocked-recovery mode.
 * @param onRetry 可选用户重试动作 / Optional user retry action.
 */
function renderDesktopSignOutBoundary(
  mode: DesktopSignOutBoundaryMode,
  onRetry: () => void = (): void => undefined
): void {
  flushSync((): void => {
    applicationRoot.render(
      <StrictMode>
        <DesktopSignOutBoundary locale={navigator.language} mode={mode} onRetry={onRetry} />
      </StrictMode>
    )
  })
}

/**
 * @brief 组合真实 API v2 gateways 并挂载 WorkspaceApp / Compose real API v2 gateways and mount WorkspaceApp.
 * @param host 已确认 Electron host / Confirmed Electron host.
 * @param diagnostics renderer 诊断端口 / Renderer diagnostics port.
 * @param initialSession main 返回的短期会话 / Short-lived session returned by main.
 */
function renderWorkspace(
  host: ResolvedDesktopHost,
  diagnostics: ReturnType<typeof createDesktopDiagnostics>,
  initialSession: DesktopAuthenticatedSession
): void {
  /** @brief 401 时经 main 单飞轮换、失败切回登录页的认证端口 / Authentication port single-flighting rotations through main and returning to sign-in on failure. */
  const authentication = createDesktopApiV2Authentication({
    bridge: host.bridge.authentication,
    initialSession,
    onAuthenticationLost: (): void => {
      renderAuthentication(host, diagnostics, 'failed')
    }
  })
  /** @brief 仅指向 API STANDARD V2 的产品 gateways / Product gateways targeting only API STANDARD V2. */
  const gateways = createProductGateways({
    authentication,
    locale: navigator.language,
    transportProfile: { kind: 'production' }
  })

  applicationRoot.render(
    <StrictMode>
      <WorkspaceApp
        artifactSave={host.bridge.artifactSave}
        diagnostics={diagnostics}
        gateways={gateways}
        onSignOut={() =>
          beginDesktopSignOut({
            clearAccessToken: authentication.clearAccessToken,
            requestHostSignOut: host.bridge.authentication.signOut,
            showAuthentication: (): void => renderAuthentication(host, diagnostics),
            showBoundary: (mode, onRetry): void => renderDesktopSignOutBoundary(mode, onRetry)
          })
        }
        runtimeInfo={host.runtimeInfo}
      />
    </StrictMode>
  )
}

/**
 * @brief 恢复登录或呈现登录页，然后挂载产品 / Restore authentication or present sign-in, then mount the product.
 */
async function bootstrapDesktopRenderer(): Promise<void> {
  /** @brief 启动时确认的 host / Host confirmed at startup. */
  const host = await resolveDesktopHost()
  /** @brief 仅当 Electron main 验证过时才使用的上传 endpoint / Upload endpoint used only when verified by Electron main. */
  const endpoint = host.runtimeInfo.diagnosticsEndpoint
  /** @brief Electron renderer 统一诊断端口 / Unified diagnostics port for the Electron renderer. */
  const diagnostics = createDesktopDiagnostics(endpoint)

  if (host.runtimeInfo.diagnosticsConfigurationError !== undefined) {
    diagnostics.emit('diagnostics.config_invalid', {
      reason: host.runtimeInfo.diagnosticsConfigurationError
    })
  }
  diagnostics.emit('runtime.info_loaded', {
    app_version: host.runtimeInfo.appVersion,
    platform: host.runtimeInfo.platform,
    upload_enabled: endpoint !== undefined
  })

  /** @brief main 启动恢复后的会话 / Session after main startup recovery. */
  const sessionResult = await host.bridge.authentication.getSession()
  if (sessionResult.kind !== 'success' || sessionResult.session.kind === 'anonymous') {
    renderAuthentication(
      host,
      diagnostics,
      sessionResult.kind === 'failure' ? sessionResult.reason : undefined
    )
    return
  }
  renderWorkspace(host, diagnostics, requireDesktopAuthenticatedSession(sessionResult))
}

/** @brief 重新加载 Electron renderer 以重试已修正配置 / Reload the Electron renderer to retry corrected configuration. */
function reloadDesktopApplication(): void {
  globalThis.location.reload()
}

/**
 * @brief 显示可重试且脱敏的 Electron renderer 启动错误 / Show a retryable, configuration-safe Electron-renderer startup error.
 * @param error 启动失败值 / Bootstrap failure value.
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
