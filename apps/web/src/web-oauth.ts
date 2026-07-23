/** @file Web OAuth 授权导航协调器 / Web OAuth authorization-navigation coordinator. */

import {
  createWebAuthorizationRequest,
  fetchOidcDiscovery,
  type AuthorizationScreenHint
} from '@ai-job-workspace/product-api-v2'

import type { WebOAuthConfiguration } from './auth-config'
import { persistWebOAuthTransaction, type OAuthTransactionStorage } from './oauth-transaction'

/** @brief 启动授权所需 Location 接口 / Location interface required to start authorization. */
export interface WebOAuthNavigationLocation {
  /** @brief 当前 origin / Current origin. */
  readonly origin: string
  /** @brief 当前 pathname / Current pathname. */
  readonly pathname: string
  /** @brief 当前 query / Current query. */
  readonly search: string
  /** @brief 导航至 Authorization Endpoint / Navigate to the Authorization Endpoint. */
  readonly assign: (url: string | URL) => void
}

/** @brief Web 授权导航依赖 / Web authorization-navigation dependencies. */
export interface BeginWebAuthorizationDependencies {
  /** @brief Web Crypto / Web Crypto. */
  readonly crypto: Crypto
  /** @brief Fetch 实现 / Fetch implementation. */
  readonly fetchImpl: typeof fetch
  /** @brief 当前 Location / Current Location. */
  readonly location: WebOAuthNavigationLocation
  /** @brief 当前 tab 的 sessionStorage / Current tab's sessionStorage. */
  readonly storage: OAuthTransactionStorage
}

/** @brief 授权准备最长时间 / Maximum authorization-preparation time. */
const AUTHORIZATION_PREPARATION_TIMEOUT_MS = 30_000

/**
 * @brief 发现能力、生成 PKCE、持久化一次性事务并导航 / Discover capabilities, generate PKCE, persist one-time state, and navigate.
 * @param configuration 已验证 public-client 配置 / Validated public-client configuration.
 * @param screenHint Hosted identity 页面提示 / Hosted-identity screen hint.
 * @param dependencies 浏览器能力 / Browser capabilities.
 * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
 */
export async function beginWebAuthorization(
  configuration: WebOAuthConfiguration,
  screenHint: AuthorizationScreenHint,
  dependencies: BeginWebAuthorizationDependencies,
  signal?: AbortSignal
): Promise<void> {
  /** @brief 准备阶段的硬截止 / Hard deadline for the preparation phase. */
  const timeoutSignal = AbortSignal.timeout(AUTHORIZATION_PREPARATION_TIMEOUT_MS)
  /** @brief 调用方取消与硬截止的组合信号 / Signal combining caller cancellation and the hard deadline. */
  const requestSignal =
    signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])
  /** @brief API v2 OIDC discovery / API v2 OIDC discovery. */
  const discovery = await fetchOidcDiscovery(dependencies.fetchImpl, requestSignal)
  requestSignal.throwIfAborted()
  /** @brief 新授权请求与一次性事务 / New authorization request and one-time transaction. */
  const request = await createWebAuthorizationRequest({
    clientId: configuration.clientId,
    crypto: dependencies.crypto,
    discovery,
    offlineAccessConsent: 'request',
    redirectUri: configuration.redirectUri,
    scopes: configuration.scopes,
    screenHint
  })
  requestSignal.throwIfAborted()
  /** @brief 成功后返回的当前应用路径 / Current application path restored after success. */
  const returnPath = `${dependencies.location.pathname}${dependencies.location.search}`
  persistWebOAuthTransaction(
    dependencies.storage,
    request.transaction,
    returnPath,
    dependencies.location.origin
  )
  dependencies.location.assign(request.authorizationUrl)
}
