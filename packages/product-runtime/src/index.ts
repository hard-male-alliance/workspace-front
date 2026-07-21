/** @file 产品运行时的共享依赖装配 / Shared dependency composition for product runtimes. */

import type { AppGateways } from '@ai-job-workspace/app/application'
import type { Diagnostics } from '@ai-job-workspace/app/diagnostics'
import { DemoInterviewGateway, DemoWorkspaceGateway } from '@ai-job-workspace/app/demo'
import {
  createHttpClient,
  HttpKnowledgeGateway,
  HttpResumeGateway
} from '@ai-job-workspace/app/http'

/**
 * @brief 创建正式产品宿主共用的 Gateway 集合 / Create the gateway set shared by production product hosts.
 * @param apiBaseUrl 已由宿主验证的产品 API origin / Product API origin already validated by the host.
 * @param diagnostics 统一 HTTP 边界使用的诊断端口 / Diagnostics port used by the unified HTTP boundary.
 * @return Web 与 Electron 共用的业务依赖集合 / Business dependencies shared by Web and Electron.
 * @note Workspace 与 Interview 的路由级请求/响应入口尚未完全冻结，因此显式使用进程内 Demo adapter；Resume 与 Knowledge 始终调用正式 HTTP adapter。 / Workspace and Interview use explicit in-process Demo adapters while their route-level request and response entrypoints remain unfrozen; Resume and Knowledge always use production HTTP adapters.
 */
export function createProductGateways(apiBaseUrl: string, diagnostics: Diagnostics): AppGateways {
  /** @brief 共享 HTTP 客户端 / Shared HTTP client. */
  const client = createHttpClient({ baseUrl: apiBaseUrl, diagnostics })

  return {
    interview: new DemoInterviewGateway(),
    knowledge: new HttpKnowledgeGateway(client),
    resume: new HttpResumeGateway(client),
    workspace: new DemoWorkspaceGateway()
  }
}
