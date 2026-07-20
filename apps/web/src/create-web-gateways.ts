/** @file Web 运行时 Gateway 装配 / Web runtime Gateway composition. */

import {
  createHttpClient,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway
} from '@ai-job-workspace/app'
import type { AppGateways, Diagnostics } from '@ai-job-workspace/app'

/**
 * @brief 创建 Web 的混合 Gateway 集合 / Create the mixed Web Gateway collection.
 * @param apiBaseUrl 已验证的产品 API origin / Validated product API origin.
 * @param diagnostics 统一 HTTP 边界使用的诊断端口 / Diagnostics port used by the unified HTTP boundary.
 * @return Web 运行时装配的领域 gateway 集合 / Domain gateway collection composed by the Web runtime.
 */
export function createWebGateways(apiBaseUrl: string, diagnostics: Diagnostics): AppGateways {
  const client = createHttpClient({ baseUrl: apiBaseUrl, diagnostics })
  return {
    interview: new MockInterviewGateway(),
    knowledge: new HttpKnowledgeGateway(client),
    resume: new HttpResumeGateway(client),
    workspace: new MockWorkspaceGateway()
  }
}
