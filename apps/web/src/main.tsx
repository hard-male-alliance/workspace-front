import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ApiClient,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway,
  WorkspaceApp
} from '@ai-job-workspace/app'
import { apiBaseUrl } from './api-config'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

/** @brief Web 端共享后端客户端 / Shared backend client for the Web runtime. */
const api = new ApiClient(apiBaseUrl)

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief 挂载 React Web 应用 / Mount the React Web application. */
createRoot(rootElement).render(
  <StrictMode>
    <WorkspaceApp
      gateways={{
        workspace: new MockWorkspaceGateway(),
        resume: new HttpResumeGateway(api),
        interview: new MockInterviewGateway(),
        knowledge: new HttpKnowledgeGateway(api)
      }}
    />
  </StrictMode>
)
