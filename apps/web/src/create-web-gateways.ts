/** @file Web 运行时 Gateway 装配 / Web runtime Gateway composition. */

import {
  createHttpClient,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway
} from '@ai-job-workspace/app'
import type { AppGateways } from '@ai-job-workspace/app'

/** @brief 创建 Web 的混合 Gateway 集合 / Create the mixed Web Gateway collection. */
export function createWebGateways(apiBaseUrl: string): AppGateways {
  const client = createHttpClient({ baseUrl: apiBaseUrl })
  return {
    interview: new MockInterviewGateway(),
    knowledge: new HttpKnowledgeGateway(client),
    resume: new HttpResumeGateway(client),
    workspace: new MockWorkspaceGateway()
  }
}
