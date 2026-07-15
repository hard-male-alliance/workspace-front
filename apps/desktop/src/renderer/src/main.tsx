import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from '@ai-job-workspace/app'

/** @brief React 挂载根节点 / React mounting root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('The desktop renderer root element is missing.')
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>
)
