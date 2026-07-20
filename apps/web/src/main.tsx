import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'
import { ApiConfigurationError, resolveApiBaseUrl } from './api-config'
import { createWebGateways } from './create-web-gateways'
import { WebConfigurationErrorPage } from './WebConfigurationErrorPage'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief Web 应用内容 / Web application content. */
let application: React.JSX.Element

try {
  const apiBaseUrl = resolveApiBaseUrl({
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_API_PROTOCOL: import.meta.env.VITE_API_PROTOCOL,
    VITE_API_HOSTNAME: import.meta.env.VITE_API_HOSTNAME,
    VITE_API_PORT: import.meta.env.VITE_API_PORT
  })
  application = <WorkspaceApp gateways={createWebGateways(apiBaseUrl)} />
} catch (error: unknown) {
  if (!(error instanceof ApiConfigurationError)) {
    throw error
  }
  application = <WebConfigurationErrorPage />
}

/** @brief 挂载 React Web 应用 / Mount the React Web application. */
createRoot(rootElement).render(<StrictMode>{application}</StrictMode>)
