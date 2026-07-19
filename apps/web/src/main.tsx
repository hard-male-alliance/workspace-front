import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'
import { createWebGateways, WebConfigurationError } from './create-web-gateways'
import { WebConfigurationErrorPage } from './WebConfigurationErrorPage'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief Web 应用内容 / Web application content. */
let application: React.JSX.Element
/** @brief 未经信任的 Vite 公开环境值 / Untrusted public Vite environment value. */
const apiBaseUrlValue: unknown = import.meta.env.VITE_API_BASE_URL
/** @brief 已收窄的后端公开根地址 / Narrowed public backend root URL. */
const apiBaseUrl = typeof apiBaseUrlValue === 'string' ? apiBaseUrlValue : undefined

try {
  application = <WorkspaceApp gateways={createWebGateways(apiBaseUrl)} />
} catch (error: unknown) {
  if (!(error instanceof WebConfigurationError)) {
    throw error
  }
  application = <WebConfigurationErrorPage />
}

/** @brief 挂载 React Web 应用 / Mount the React Web application. */
createRoot(rootElement).render(<StrictMode>{application}</StrictMode>)
