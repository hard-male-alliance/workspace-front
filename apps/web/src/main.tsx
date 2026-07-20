import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import { resolveApiBaseUrl } from './api-config'
import { createWebDiagnostics } from './create-web-observability'
import { createWebGateways } from './create-web-gateways'
import { resolveDiagnosticsUploadConfiguration } from './diagnostics-config'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief 可选诊断上传的明确三态配置 / Explicit three-state configuration for optional diagnostics upload. */
const diagnosticsConfiguration = resolveDiagnosticsUploadConfiguration({
  VITE_DIAGNOSTICS_HOSTNAME: import.meta.env.VITE_DIAGNOSTICS_HOSTNAME,
  VITE_DIAGNOSTICS_PORT: import.meta.env.VITE_DIAGNOSTICS_PORT,
  VITE_DIAGNOSTICS_PROTOCOL: import.meta.env.VITE_DIAGNOSTICS_PROTOCOL
})
/** @brief 已组合的本地日志与可选远程诊断端口 / Composed local logging and optional remote diagnostics port. */
const diagnostics = createWebDiagnostics({ configuration: diagnosticsConfiguration })

diagnostics.emit('app.started', {
  app_version: APPLICATION_VERSION,
  platform: 'web',
  upload_enabled: diagnosticsConfiguration.kind === 'enabled'
})

/** @brief 构建期和运行期共用的已验证产品 API origin / Product API origin validated consistently at build and runtime. */
const apiBaseUrl = resolveApiBaseUrl({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_API_PROTOCOL: import.meta.env.VITE_API_PROTOCOL,
  VITE_API_HOSTNAME: import.meta.env.VITE_API_HOSTNAME,
  VITE_API_PORT: import.meta.env.VITE_API_PORT
})

/** @brief 使用已验证依赖组合出的 Web 应用 / Web application composed with validated dependencies. */
const application = (
  <WorkspaceApp diagnostics={diagnostics} gateways={createWebGateways(apiBaseUrl, diagnostics)} />
)

/** @brief 挂载 React Web 应用 / Mount the React Web application. */
createRoot(rootElement).render(<StrictMode>{application}</StrictMode>)
