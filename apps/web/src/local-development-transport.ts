/** @file Web 本地开发态到本机 OAuth 服务的显式网络适配 / Explicit local-development network adapter for the Web OAuth service. */

import {
  API_V2_CONTROLLED_TEST_ORIGIN,
  API_V2_PRODUCTION_ORIGIN
} from '@ai-job-workspace/product-api-v2'

/** @brief 本地后端只用于 Vite development，不参与生产构建配置 / Local backend used only by Vite development. */
export const LOCAL_DEVELOPMENT_API_ORIGIN = 'http://localhost:8000' as const

/**
 * @brief 将冻结的生产 OAuth URL 映射到本地开发后端 / Map a frozen production OAuth URL to the local development backend.
 * @param input 已由 API v2 OAuth 核心钉死的 URL / URL already pinned by the API v2 OAuth core.
 * @return 仅 origin 被替换的本地 URL / Local URL with only its origin replaced.
 */
export function localDevelopmentUrl(input: string | URL): URL {
  const source = new URL(input)
  if (source.origin !== API_V2_PRODUCTION_ORIGIN) {
    throw new TypeError('Local development transport only accepts the pinned API v2 origin.')
  }
  return new URL(`${source.pathname}${source.search}`, LOCAL_DEVELOPMENT_API_ORIGIN)
}

/**
 * @brief 创建只重写 API v2 固定 origin 的开发态 Fetch / Create a development Fetch that rewrites only the pinned API v2 origin.
 * @param fetchImpl 浏览器原始 Fetch / Original browser Fetch.
 * @return 保留 method/body/headers/signal 的本地开发 Fetch / Local-development Fetch preserving request semantics.
 */
export function createLocalDevelopmentFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) {
      return fetchImpl(new Request(localDevelopmentUrl(input.url), input), init)
    }
    return fetchImpl(localDevelopmentUrl(input), init)
  }
}

/**
 * @brief 创建受控产品 API 的本地网络适配 / Create the local network adapter for the controlled Product API.
 * @param fetchImpl 浏览器原始 Fetch / Original browser Fetch.
 * @return 请求映射到本机且规范 Location 映射回 controlled-test origin 的 Fetch / Fetch mapping requests locally and canonical Locations back to the controlled-test origin.
 */
export function createLocalDevelopmentProductFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sourceUrl = new URL(input instanceof Request ? input.url : input)
    if (
      sourceUrl.origin !== API_V2_CONTROLLED_TEST_ORIGIN &&
      sourceUrl.origin !== API_V2_PRODUCTION_ORIGIN
    ) {
      throw new TypeError('Local Product API transport only accepts a frozen API v2 origin.')
    }
    const localUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, 'http://localhost:9000')
    const localInput = input instanceof Request ? new Request(localUrl, input) : localUrl
    const response = await fetchImpl(localInput, init)
    const location = response.headers.get('Location')
    if (location === null || !location.startsWith(`${API_V2_PRODUCTION_ORIGIN}/api/v2/`)) {
      return response
    }
    const headers = new Headers(response.headers)
    headers.set(
      'Location',
      `${API_V2_CONTROLLED_TEST_ORIGIN}${location.slice(API_V2_PRODUCTION_ORIGIN.length)}`
    )
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText
    })
  }
}
