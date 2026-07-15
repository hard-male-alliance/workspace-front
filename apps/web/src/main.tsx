import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief 挂载 React Web 应用 / Mount the React Web application. */
createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>
)
