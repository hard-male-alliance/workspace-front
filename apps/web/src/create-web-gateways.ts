/** @file Web 运行时 Gateway 装配 / Web runtime Gateway composition. */

import {
  createHttpClient,
  HttpKnowledgeGateway,
  HttpResumeGateway,
  MockInterviewGateway,
  MockWorkspaceGateway
} from '@ai-job-workspace/app'
import type { AppGateways } from '@ai-job-workspace/app'

/** @brief Web 启动配置错误 / Web bootstrap configuration error. */
export class WebConfigurationError extends Error {
  override readonly name = 'WebConfigurationError'
}

/** @brief 校验公开后端根地址 / Validate the public backend root URL. */
function parseApiBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new WebConfigurationError('VITE_API_BASE_URL is required for the Web application.')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new WebConfigurationError('VITE_API_BASE_URL must be a valid HTTP(S) URL.')
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new WebConfigurationError(
      'VITE_API_BASE_URL must be an HTTP(S) origin without credentials, path, query, or hash.'
    )
  }

  return url.origin
}

/** @brief 创建 Web 的混合 Gateway 集合 / Create the mixed Web Gateway collection. */
export function createWebGateways(apiBaseUrl: string | undefined): AppGateways {
  const client = createHttpClient({ baseUrl: parseApiBaseUrl(apiBaseUrl) })
  return {
    interview: new MockInterviewGateway(),
    knowledge: new HttpKnowledgeGateway(client),
    resume: new HttpResumeGateway(client),
    workspace: new MockWorkspaceGateway()
  }
}
