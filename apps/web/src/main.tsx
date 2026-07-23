import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HostStartupFailure, WorkspaceApp } from '@ai-job-workspace/app'
import { APPLICATION_VERSION } from '@ai-job-workspace/platform'
import {
  completeWebAuthorization,
  InMemoryWebTokenSession,
  logoutWebTokenSession,
  WebCryptoJwksIdTokenVerifier,
  type AuthorizationScreenHint
} from '@ai-job-workspace/product-api-v2'
import { createProductGateways } from '@ai-job-workspace/product-runtime'
import {
  assertWebOAuthTransactionConfiguration,
  resolveWebOAuthConfiguration,
  WebOAuthConfigurationError,
  type WebOAuthConfiguration
} from './auth-config'
import { createWebArtifactSave } from './artifact-save'
import { createWebDiagnostics } from './create-web-observability'
import { resolveDiagnosticsUploadConfiguration } from './diagnostics-config'
import { WebAuthenticationScreen } from './WebAuthenticationScreen'
import { consumeWebOAuthCallback, type ConsumedWebOAuthCallback } from './oauth-transaction'
import { createWebApiV2Authentication } from './web-authentication'
import { beginWebAuthorization } from './web-oauth'

/** @brief Web renderer 根节点 / Web renderer root element. */
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Web root element #root is missing.')
}

/** @brief Web 应用唯一 React root / Sole React root for the Web application. */
const applicationRoot = createRoot(rootElement)

/** @brief 当前页面唯一、永不持久化的 Web token 会话 / Sole current-page Web token session that is never persisted. */
const tokenSession = new InMemoryWebTokenSession()

/** @brief 在任何异步工作前消费并清理可能含 code 的 callback / Callback consumed and scrubbed before any asynchronous work. */
let consumedCallback: ConsumedWebOAuthCallback | null = null
/** @brief callback 一次性状态缺失或损坏 / Missing or corrupt one-time callback state. */
let callbackPreparationError: unknown
try {
  consumedCallback = consumeWebOAuthCallback(
    globalThis.location,
    globalThis.history,
    globalThis.sessionStorage
  )
} catch (error: unknown) {
  callbackPreparationError = error
}

/**
 * @brief 呈现 hosted identity 入口 / Render hosted-identity entry points.
 * @param configuration 已验证 OAuth 配置 / Validated OAuth configuration.
 * @param error 可选失败状态 / Optional failure state.
 */
function renderAuthentication(configuration: WebOAuthConfiguration, error?: unknown): void {
  /** @brief 发起一次 Authorization Code + PKCE 导航 / Start one Authorization Code + PKCE navigation. */
  const authorize = (screenHint: AuthorizationScreenHint): Promise<void> =>
    beginWebAuthorization(configuration, screenHint, {
      crypto: globalThis.crypto,
      fetchImpl: globalThis.fetch,
      location: globalThis.location,
      storage: globalThis.sessionStorage
    })

  applicationRoot.render(
    <StrictMode>
      <WebAuthenticationScreen
        failureReason={error === undefined ? undefined : 'failed'}
        locale={navigator.language}
        onAuthorize={authorize}
      />
    </StrictMode>
  )
}

/**
 * @brief 解析配置、组合真实网关并挂载 Web 应用 / Resolve configuration, compose real gateways, and mount the Web application.
 * @return 无返回值 / No return value.
 */
async function bootstrapWebApplication(): Promise<void> {
  /** @brief 可选诊断上传的明确三态配置 / Explicit three-state configuration for optional diagnostics upload. */
  const diagnosticsConfiguration = resolveDiagnosticsUploadConfiguration({
    VITE_DIAGNOSTICS_HOSTNAME: import.meta.env.VITE_DIAGNOSTICS_HOSTNAME,
    VITE_DIAGNOSTICS_PORT: import.meta.env.VITE_DIAGNOSTICS_PORT,
    VITE_DIAGNOSTICS_PROTOCOL: import.meta.env.VITE_DIAGNOSTICS_PROTOCOL
  })
  /** @brief 已组合的本地日志与可选远程诊断端口 / Composed local logging and optional remote diagnostics port. */
  const diagnostics = createWebDiagnostics({ configuration: diagnosticsConfiguration })
  /** @brief 当前 HTTPS 部署的 public-client 配置 / Public-client configuration of this HTTPS deployment. */
  const oauthConfiguration = resolveWebOAuthConfiguration(
    { VITE_OAUTH_CLIENT_ID: import.meta.env.VITE_OAUTH_CLIENT_ID },
    globalThis.location.origin,
    { allowDevelopmentLoopbackHttp: import.meta.env.DEV }
  )

  diagnostics.emit('app.started', {
    app_version: APPLICATION_VERSION,
    platform: 'web',
    upload_enabled: diagnosticsConfiguration.kind === 'enabled'
  })

  if (callbackPreparationError !== undefined) {
    renderAuthentication(oauthConfiguration, callbackPreparationError)
    return
  }
  if (consumedCallback === null) {
    renderAuthentication(oauthConfiguration)
    return
  }

  try {
    assertWebOAuthTransactionConfiguration(consumedCallback.transaction, oauthConfiguration)
    /** @brief callback 完成的总截止 / Total callback-completion deadline. */
    const callbackSignal = AbortSignal.timeout(60_000)
    await completeWebAuthorization({
      callbackUrl: consumedCallback.callbackUrl,
      idTokenVerifier: new WebCryptoJwksIdTokenVerifier(),
      session: tokenSession,
      signal: callbackSignal,
      transaction: consumedCallback.transaction
    })
  } catch (error: unknown) {
    tokenSession.clear()
    renderAuthentication(oauthConfiguration, error)
    return
  } finally {
    consumedCallback = null
  }

  /** @brief 认证丢失前可静止的 Web Artifact 服务；组合完成前为 null / Web Artifact service quiesceable before authentication loss, or null before composition completes. */
  let artifactSaveLifecycle: ReturnType<typeof createWebArtifactSave> | null = null
  /** @brief 将资源服务器 401 与私有 token 轮换组合的 Web 认证端口 / Web authentication port composing resource-server 401 handling with private token rotation. */
  const authentication = createWebApiV2Authentication({
    onAuthenticationLost: (error: unknown): void => {
      /** @brief 先静止敏感下载再切换认证页面 / Quiesce sensitive downloads before switching to authentication. */
      const transition = async (): Promise<void> => {
        await artifactSaveLifecycle?.suspendAndQuiesce()
        renderAuthentication(oauthConfiguration, error)
      }
      void transition()
    },
    session: tokenSession
  })
  /** @brief 仅指向契约 HTTP adapter 的产品网关 / Product gateways backed only by contract HTTP adapters. */
  const gateways = createProductGateways({
    authentication,
    locale: navigator.language,
    transportProfile: { kind: 'production' }
  })
  /** @brief 通过权威 API v2 metadata 与 Bearer 内容流实现的 Web Artifact 保存端口 / Web Artifact-save port backed by authoritative API v2 metadata and Bearer content streams. */
  const artifactSave = createWebArtifactSave({
    workspaceOperations: gateways.workspaceOperations
  })
  artifactSaveLifecycle = artifactSave

  applicationRoot.render(
    <StrictMode>
      <WorkspaceApp
        artifactSave={artifactSave}
        diagnostics={diagnostics}
        gateways={gateways}
        onSignOut={async (): Promise<void> => {
          await artifactSave.suspendAndQuiesce()
          try {
            await logoutWebTokenSession({ session: tokenSession })
            renderAuthentication(oauthConfiguration)
          } catch (error: unknown) {
            artifactSave.resume()
            throw error
          }
        }}
        runtimeInfo={{ appVersion: APPLICATION_VERSION, platform: 'web' }}
      />
    </StrictMode>
  )
}

/**
 * @brief 刷新当前 Web 页面以重试经过修正的部署配置 / Reload the current Web page to retry corrected deployment configuration.
 * @return 无返回值 / No return value.
 */
function reloadWebApplication(): void {
  globalThis.location.reload()
}

/**
 * @brief Produce a safe startup remediation hint without reflecting secrets / Produce a safe startup remediation hint without reflecting secrets.
 * @param error Untrusted startup error.
 * @return Safe low-cardinality detail for the startup failure page.
 */
function safeWebStartupFailureDetail(error: unknown): string | undefined {
  return error instanceof WebOAuthConfigurationError ? error.message : undefined
}

void bootstrapWebApplication().catch((error: unknown): void => {
  console.error('Web application failed to start.', error)
  applicationRoot.render(
    <StrictMode>
      <HostStartupFailure
        detail={safeWebStartupFailureDetail(error)}
        locale={navigator.language}
        onRetry={reloadWebApplication}
      />
    </StrictMode>
  )
})
