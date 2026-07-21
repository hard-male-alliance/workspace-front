/** @file Electron renderer 的受限托管边界 / Restricted hosting boundary for the Electron renderer. */

import { app, net, protocol, session } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  rendererProtocolHost,
  rendererProtocolScheme,
  resolveRendererFilePath,
  selectTrustedRendererUrl
} from './renderer-protocol'
import { isAllowedRendererUrl } from './security'

/** @brief 生产构建后的 renderer 入口路径 / Renderer entry path after a production build. */
const productionRendererPath = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

/** @brief 生产构建后的受信任 renderer URL / Trusted renderer URL after a production build. */
const productionRendererUrl = `${rendererProtocolScheme}://${rendererProtocolHost}/index.html`

/**
 * @brief 在 Electron 就绪前注册受限 renderer 协议能力 / Register restricted renderer-protocol privileges before Electron is ready.
 * @return 无返回值 / No return value.
 */
export function registerRendererSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: rendererProtocolScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        /** @brief 允许受 CSP 约束的 renderer 向精确放行的后端 origin 发起 CORS fetch / Allow CSP-constrained renderer CORS fetches to explicitly permitted backend origins. */
        corsEnabled: true
      }
    }
  ])
}

/**
 * @brief 获取当前受信任的 renderer URL / Get the currently trusted renderer URL.
 * @return 开发服务器或生产自定义协议 URL / Development-server or production custom-protocol URL.
 */
export function getTrustedRendererUrl(): string {
  return selectTrustedRendererUrl(
    app.isPackaged,
    process.env['ELECTRON_RENDERER_URL'],
    productionRendererUrl
  )
}

/**
 * @brief 为可信开发服务器主文档注入动态 CSP / Inject dynamic CSP into the trusted development-server main document.
 * @param rendererUrl 已选择的可信 renderer URL / Selected trusted renderer URL.
 * @param contentSecurityPolicy 由主进程验证配置后生成的 CSP / CSP generated from main-process validated configuration.
 * @return 无返回值 / No return value.
 * @note 生产自定义协议由协议响应头承载同一策略；本函数只处理 HTTP(S) 开发服务器 / The production custom protocol carries the same policy in its response header; this function handles only HTTP(S) development servers.
 */
export function registerDevelopmentRendererContentSecurityPolicy(
  rendererUrl: string,
  contentSecurityPolicy: string
): void {
  /** @brief 已解析的可信 renderer URL / Parsed trusted renderer URL. */
  const trustedRenderer = new URL(rendererUrl)
  if (trustedRenderer.protocol !== 'http:' && trustedRenderer.protocol !== 'https:') return

  /** @brief 仅匹配可信开发 origin 的 Electron URL filter / Electron URL filter matching only the trusted development origin. */
  const filter = { urls: [`${trustedRenderer.origin}/*`] }
  /** @brief 与可信开发服务器同 host/port 的精确 HMR WebSocket origin / Exact HMR WebSocket origin sharing the trusted development server's host and port. */
  const webSocketOrigin = `${trustedRenderer.protocol === 'https:' ? 'wss:' : 'ws:'}//${trustedRenderer.host}`
  /** @brief 仅为开发态增加精确 HMR WebSocket 的 CSP / CSP augmented only with the exact development HMR WebSocket. */
  const developmentContentSecurityPolicy = contentSecurityPolicy.replace(
    "connect-src 'self'",
    `connect-src 'self' ${webSocketOrigin}`
  )

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback): void => {
    if (details.resourceType !== 'mainFrame' || !isAllowedRendererUrl(details.url, rendererUrl)) {
      callback(
        details.responseHeaders === undefined ? {} : { responseHeaders: details.responseHeaders }
      )
      return
    }

    /** @brief 移除开发服务器既有 CSP 后的响应头 / Response headers after removing any development-server CSP. */
    const responseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders ?? {}).filter(
        ([name]) => name.toLowerCase() !== 'content-security-policy'
      )
    )
    responseHeaders['Content-Security-Policy'] = [developmentContentSecurityPolicy]
    callback({ responseHeaders })
  })
}

/**
 * @brief 注册受限 renderer 文件协议 / Register the restricted renderer file protocol.
 * @param contentSecurityPolicy 主进程从已验证配置构造的 CSP / CSP built by the main process from validated settings.
 * @return 无返回值 / No return value.
 * @note 仅将 `ai-job-workspace://renderer` 映射到构建输出，不会暴露任意本地文件 / Only maps `ai-job-workspace://renderer` to build output and never exposes arbitrary local files.
 */
export function registerRendererProtocol(contentSecurityPolicy: string): void {
  protocol.handle(rendererProtocolScheme, async (request): Promise<Response> => {
    /** @brief renderer 构建输出目录 / Renderer build output directory. */
    const rendererDirectory = path.dirname(productionRendererPath)
    /** @brief 经过路径约束后的资源路径 / Resource path after path constraints. */
    const rendererFilePath = resolveRendererFilePath(request.url, rendererDirectory)

    if (rendererFilePath === undefined || !existsSync(rendererFilePath)) {
      return new Response('Not found.', { status: 404 })
    }

    /** @brief 受限协议代理的本地文件响应 / Local-file response proxied by the restricted protocol. */
    const response = await net.fetch(pathToFileURL(rendererFilePath).toString())

    if (rendererFilePath !== productionRendererPath) {
      return response
    }

    /** @brief 入口文档响应的安全头 / Security headers for the entry-document response. */
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', contentSecurityPolicy)

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText
    })
  })
}

/**
 * @brief 在主窗口中加载可信 renderer / Load the trusted renderer in the main window.
 * @param window 产品主窗口 / Product main window.
 * @param rendererUrl 已选择的可信 renderer URL / Selected trusted renderer URL.
 * @return renderer 加载完成时兑现的 Promise / Promise fulfilled when renderer loading completes.
 */
export async function loadTrustedRenderer(
  window: BrowserWindow,
  rendererUrl: string
): Promise<void> {
  await window.loadURL(rendererUrl)
}
