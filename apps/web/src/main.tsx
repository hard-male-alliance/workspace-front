import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HostStartupFailure, WorkspaceApp } from '@ai-job-workspace/app'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import { createProductGateways } from '@ai-job-workspace/product-runtime'
import { resolveApiBaseUrl } from './api-config'
import { createWebDiagnostics } from './create-web-observability'
import { resolveDiagnosticsUploadConfiguration } from './diagnostics-config'
import { createBrowserArtifactSavePort } from './browser-artifact-save'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief Web 应用唯一 React root / Sole React root for the Web application. */
const applicationRoot = createRoot(rootElement)

/**
 * @brief 解析配置、组合真实网关并挂载 Web 应用 / Resolve configuration, compose real gateways, and mount the Web application.
 * @return 无返回值 / No return value.
 */
function bootstrapWebApplication(): void {
  /** @brief 可选诊断上传的明确三态配置 / Explicit three-state configuration for optional diagnostics upload. */
  const diagnosticsConfiguration = resolveDiagnosticsUploadConfiguration({
    VITE_DIAGNOSTICS_HOSTNAME: import.meta.env.VITE_DIAGNOSTICS_HOSTNAME,
    VITE_DIAGNOSTICS_PORT: import.meta.env.VITE_DIAGNOSTICS_PORT,
    VITE_DIAGNOSTICS_PROTOCOL: import.meta.env.VITE_DIAGNOSTICS_PROTOCOL
  })
  /** @brief 已组合的本地日志与可选远程诊断端口 / Composed local logging and optional remote diagnostics port. */
  const diagnostics = createWebDiagnostics({ configuration: diagnosticsConfiguration })
  /** @brief 构建期和运行期共用的已验证产品 API origin / Product API origin validated consistently at build and runtime. */
  const apiBaseUrl = resolveApiBaseUrl({
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_API_PROTOCOL: import.meta.env.VITE_API_PROTOCOL,
    VITE_API_HOSTNAME: import.meta.env.VITE_API_HOSTNAME,
    VITE_API_PORT: import.meta.env.VITE_API_PORT
  })
  /** @brief 仅指向契约 HTTP adapter 的产品网关 / Product gateways backed only by contract HTTP adapters. */
  const gateways = createProductGateways(apiBaseUrl, diagnostics, {
    apiMajor: 'v1',
    locale: navigator.language,
    platform: 'web'
  })

  diagnostics.emit('app.started', {
    app_version: APPLICATION_VERSION,
    platform: 'web',
    upload_enabled: diagnosticsConfiguration.kind === 'enabled'
  })

  applicationRoot.render(
    <StrictMode>
      <WorkspaceApp
        artifactSave={createBrowserArtifactSavePort(apiBaseUrl)}
        diagnostics={diagnostics}
        gateways={gateways}
        runtimeInfo={{ appVersion: APPLICATION_VERSION, platform: 'web' }}
      />
    </StrictMode>
  )
}

/**
 * @brief 刷新当前 Web 页面以重试经过修正的部署配置 / Reload the current Web page to retry corrected deployment configuration.
 * @return 无返回值 / No return value.
 */
function reloadWebApplication(): void {
  globalThis.location.reload()
}

try {
  bootstrapWebApplication()
} catch (error: unknown) {
  console.error('Web application failed to start.', error)
  applicationRoot.render(
    <StrictMode>
      <HostStartupFailure locale={navigator.language} onRetry={reloadWebApplication} />
    </StrictMode>
  )
}
