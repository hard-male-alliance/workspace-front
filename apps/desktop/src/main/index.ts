import { app, BrowserWindow, ipcMain, net, protocol, session } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APPLICATION_VERSION, RUNTIME_INFO_CHANNEL } from '@ai-job-workspace/platform'
import type { ElectronRuntimeInfo, RuntimeInfo } from '@ai-job-workspace/platform'

import {
  createProductionContentSecurityPolicy,
  resolveDesktopDiagnosticsConfiguration
} from './diagnostics-config'
import { isAllowedRendererUrl, isTrustedRendererIpcSender } from './security'
import {
  rendererProtocolHost,
  rendererProtocolScheme,
  resolveRendererFilePath
} from './renderer-protocol'

protocol.registerSchemesAsPrivileged([
  {
    scheme: rendererProtocolScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      /** @brief 允许受 CSP 约束的 renderer 对已放行诊断 origin 发起 CORS fetch / Allow CSP-constrained renderer CORS fetches to the configured diagnostics origin. */
      corsEnabled: true
    }
  }
])

/** @brief 生产构建后的渲染器入口路径 / Renderer entry path after a production build. */
const productionRendererPath = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

/** @brief 生产构建后的受信任渲染器 URL / Trusted renderer URL after a production build. */
const productionRendererUrl = `${rendererProtocolScheme}://${rendererProtocolHost}/index.html`

/** @brief 经主进程校验的可选诊断服务配置 / Optional diagnostics-service configuration validated by the main process. */
const desktopDiagnosticsConfiguration = resolveDesktopDiagnosticsConfiguration(process.env)

/** @brief 生产入口文档的附加 CSP / Additional CSP applied to the production entry document. */
const productionContentSecurityPolicy = createProductionContentSecurityPolicy(
  desktopDiagnosticsConfiguration
)

/** @brief 唯一的产品主窗口 / The single product main window. */
let mainWindow: BrowserWindow | null = null

/** @brief 受控 smoke 检查的环境开关 / Environment switch for the controlled smoke check. */
const desktopSmokeEnvironmentKey = 'AI_JOB_WORKSPACE_SMOKE'

/** @brief renderer smoke 检查的返回数据 / Renderer smoke-check result. */
interface DesktopSmokeResult {
  /** @brief renderer 根节点的文本长度 / Text length of the renderer root element. */
  readonly rootTextLength: number
  /** @brief preload bridge 返回的平台 / Platform returned by the preload bridge. */
  readonly platform: string
  /** @brief preload bridge 返回的应用版本 / App version returned by the preload bridge. */
  readonly appVersion: string
}

/**
 * @brief 获取当前受信任的渲染器 URL / Get the currently trusted renderer URL.
 * @return 开发服务器或生产 HTML 的 URL / The development-server or production-HTML URL.
 */
function getRendererUrl(): string {
  return getDevelopmentRendererUrl() ?? productionRendererUrl
}

/**
 * @brief 获取仅开发态可用的 Vite renderer URL / Get a Vite renderer URL available only in development.
 * @return 非打包开发进程中的 renderer URL；其他情况下为 undefined / Renderer URL in an unpackaged development process, otherwise undefined.
 * @note 已打包应用绝不信任环境变量中的 renderer URL，始终加载受限自定义协议。
 */
function getDevelopmentRendererUrl(): string | undefined {
  return app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
}

/**
 * @brief 注册受限 renderer 协议 / Register the restricted renderer protocol.
 * @return 无返回值 / No return value.
 * @note 仅将 `ai-job-workspace://renderer` 映射到构建输出；不会把任意本地文件暴露给 renderer。
 */
function registerRendererProtocol(): void {
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
    headers.set('Content-Security-Policy', productionContentSecurityPolicy)

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText
    })
  })
}

/**
 * @brief 构造运行时信息 / Build runtime information.
 * @return 不包含特权对象的最小运行时信息 / Minimal runtime information without privileged objects.
 */
function getRuntimeInfo(): ElectronRuntimeInfo {
  return {
    appVersion: APPLICATION_VERSION,
    platform: 'electron',
    ...(desktopDiagnosticsConfiguration.kind === 'enabled'
      ? { diagnosticsEndpoint: desktopDiagnosticsConfiguration.endpoint }
      : {}),
    ...(desktopDiagnosticsConfiguration.kind === 'invalid'
      ? { diagnosticsConfigurationError: desktopDiagnosticsConfiguration.reason }
      : {})
  }
}

/**
 * @brief 拒绝 Chromium 权限预检 / Deny a Chromium permission preflight check.
 * @return 始终返回 false / Always returns false.
 */
function denyPermissionCheck(): false {
  return false
}

/**
 * @brief 拒绝 Chromium 权限请求 / Deny a Chromium permission request.
 * @param _webContents 发出请求的内容对象 / Web contents that issued the request.
 * @param _permission 请求的权限名称 / Requested permission name.
 * @param callback 权限结果回调 / Permission result callback.
 * @return 无返回值 / No return value.
 */
function denyPermissionRequest(
  _webContents: WebContents,
  _permission: string,
  callback: (permissionGranted: boolean) => void
): void {
  callback(false)
}

/**
 * @brief 拒绝所有 Chromium 权限 / Deny all Chromium permissions.
 * @return 无返回值 / No return value.
 * @note 后续若需要摄像头或麦克风，应基于受信任 origin 与显式用户操作添加最小 allowlist。
 */
function configureDefaultPermissionDenial(): void {
  session.defaultSession.setPermissionCheckHandler(denyPermissionCheck)
  session.defaultSession.setPermissionRequestHandler(denyPermissionRequest)
}

/**
 * @brief 阻止越界页面导航 / Block an out-of-scope page navigation.
 * @param event 可取消的 Electron 事件 / Cancellable Electron event.
 * @param navigationUrl 候选导航 URL / Candidate navigation URL.
 * @return 无返回值 / No return value.
 */
function blockUnexpectedNavigation(event: Electron.Event, navigationUrl: string): void {
  if (!isAllowedRendererUrl(navigationUrl, getRendererUrl())) {
    event.preventDefault()
  }
}

/**
 * @brief 拒绝所有新窗口 / Deny every new-window request.
 * @return 固定的拒绝响应 / A fixed denial response.
 */
function denyNewWindow(): { action: 'deny' } {
  return { action: 'deny' }
}

/**
 * @brief 阻止 WebView 附着 / Block WebView attachment.
 * @param event 可取消的 Electron 事件 / Cancellable Electron event.
 * @return 无返回值 / No return value.
 */
function blockWebviewAttachment(event: Electron.Event): void {
  event.preventDefault()
}

/**
 * @brief 为 WebContents 安装导航与弹窗防护 / Install navigation and popup protections for WebContents.
 * @param webContents 待保护的窗口内容 / Window contents to protect.
 * @return 无返回值 / No return value.
 */
function configureWebContentsSecurity(webContents: WebContents): void {
  webContents.on('will-navigate', blockUnexpectedNavigation)
  webContents.setWindowOpenHandler(denyNewWindow)
  webContents.on('will-attach-webview', blockWebviewAttachment)
}

/**
 * @brief 判断 IPC 调用是否来自主窗口 / Decide whether an IPC call comes from the main window.
 * @param event Electron IPC 调用事件 / Electron IPC invoke event.
 * @return 调用来自受信任主 frame 时为 true / True when the call comes from the trusted main frame.
 */
function isTrustedRuntimeInfoRequest(event: IpcMainInvokeEvent): boolean {
  if (mainWindow === null) {
    return false
  }

  /** @brief 触发 IPC 的 frame / Frame that triggered the IPC call. */
  const senderFrame = event.senderFrame

  if (senderFrame === null) {
    return false
  }

  /** @brief 用于授权校验的发送方身份 / Sender identity used for authorization. */
  const senderIdentity = {
    webContentsId: event.sender.id,
    isMainFrame: senderFrame.frameTreeNodeId === event.sender.mainFrame.frameTreeNodeId,
    frameUrl: senderFrame.url
  }
  /** @brief 可信主窗口身份 / Trusted main-window identity. */
  const trustedRenderer = {
    webContentsId: mainWindow.webContents.id,
    rendererUrl: getRendererUrl()
  }
  return isTrustedRendererIpcSender(senderIdentity, trustedRenderer)
}

/**
 * @brief 处理运行时信息 IPC 调用 / Handle a runtime-information IPC invocation.
 * @param event Electron IPC 调用事件 / Electron IPC invoke event.
 * @return 主进程确认的运行时信息 / Runtime information confirmed by the main process.
 * @throws 发送方不是可信主 frame 时抛出错误 / Throws when the sender is not the trusted main frame.
 */
function handleRuntimeInfoRequest(event: IpcMainInvokeEvent): RuntimeInfo {
  if (!isTrustedRuntimeInfoRequest(event)) {
    throw new Error('Rejected runtime information request from an untrusted renderer.')
  }

  return getRuntimeInfo()
}

/**
 * @brief 注册最小 IPC 接口 / Register the minimal IPC surface.
 * @return 无返回值 / No return value.
 */
function registerIpcHandlers(): void {
  ipcMain.removeHandler(RUNTIME_INFO_CHANNEL)
  ipcMain.handle(RUNTIME_INFO_CHANNEL, handleRuntimeInfoRequest)
}

/**
 * @brief 加载共享 React 渲染器 / Load the shared React renderer.
 * @param window 需要加载内容的主窗口 / Main window that should load content.
 * @return 在渲染器加载完成时兑现的 Promise / A promise fulfilled when renderer loading finishes.
 */
async function loadRenderer(window: BrowserWindow): Promise<void> {
  /** @brief 开发服务器 URL / Development-server URL. */
  const developmentRendererUrl = getDevelopmentRendererUrl()

  if (developmentRendererUrl !== undefined) {
    await window.loadURL(developmentRendererUrl)
    return
  }

  await window.loadURL(productionRendererUrl)
}

/**
 * @brief 创建并保护产品主窗口 / Create and protect the product main window.
 * @return 已创建且已开始加载的主窗口 / The created main window after loading starts.
 */
async function createMainWindow(): Promise<BrowserWindow> {
  /** @brief 受安全偏好保护的新主窗口 / New main window protected by security preferences. */
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  })

  mainWindow = window
  configureWebContentsSecurity(window.webContents)
  /**
   * @brief 在内容可显示后展示窗口 / Show the window after its content is ready.
   * @return 无返回值 / No return value.
   */
  function showWindowWhenReady(): void {
    window.show()
  }

  /**
   * @brief 在窗口关闭后清理全局引用 / Clear the global reference after window closure.
   * @return 无返回值 / No return value.
   */
  function clearMainWindowOnClose(): void {
    if (mainWindow === window) {
      mainWindow = null
    }
  }

  window.once('ready-to-show', showWindowWhenReady)
  window.on('closed', clearMainWindowOnClose)
  await loadRenderer(window)

  return window
}

/**
 * @brief 读取 renderer、preload 与 IPC 的 smoke 结果 / Read the renderer, preload, and IPC smoke result.
 * @param window 已加载 renderer 的主窗口 / Main window whose renderer has loaded.
 * @return 经运行时校验的 smoke 数据 / Runtime-validated smoke data.
 * @note 运行时信息由正常 React 渲染路径读取，绝不向 renderer 暴露测试 API。
 */
async function inspectDesktopSmoke(window: BrowserWindow): Promise<DesktopSmokeResult> {
  /** @brief 主进程发起的受控 renderer 检查结果 / Controlled renderer check result initiated by main. */
  const result: unknown = await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000

      async function inspectRenderer() {
        const root = document.getElementById('root')
        const rootTextLength = root?.textContent?.trim().length ?? 0

        const applicationShell = document.querySelector('[data-runtime-platform]')
        const platform = applicationShell?.getAttribute('data-runtime-platform') ?? ''
        const appVersion = applicationShell?.getAttribute('data-runtime-version') ?? ''

        if (rootTextLength > 0 && platform === 'electron' && appVersion.length > 0) {
          try {
            resolve({
              rootTextLength,
              platform,
              appVersion
            })
          } catch (error) {
            reject(error)
          }
          return
        }

        if (Date.now() >= deadline) {
          reject(new Error('Renderer did not mount before the desktop smoke timeout.'))
          return
        }

        globalThis.setTimeout(inspectRenderer, 25)
      }

      void inspectRenderer()
    })
  `)

  if (
    typeof result !== 'object' ||
    result === null ||
    !('rootTextLength' in result) ||
    !('platform' in result) ||
    !('appVersion' in result)
  ) {
    throw new Error('Desktop smoke check returned an invalid result.')
  }

  /** @brief 经运行时形状检查后的 smoke 数据 / Smoke data after runtime shape validation. */
  const smokeResult = result as DesktopSmokeResult

  if (
    typeof smokeResult.rootTextLength !== 'number' ||
    smokeResult.rootTextLength <= 0 ||
    smokeResult.platform !== 'electron' ||
    typeof smokeResult.appVersion !== 'string' ||
    smokeResult.appVersion.length === 0
  ) {
    throw new Error('Desktop smoke check could not verify renderer content or the preload bridge.')
  }

  return smokeResult
}

/**
 * @brief 验证 renderer、preload、IPC 与生产深链 / Verify renderer, preload, IPC, and a production deep link.
 * @param window 已加载 renderer 的主窗口 / Main window whose renderer has loaded.
 * @return smoke 检查通过时兑现的 Promise / Promise fulfilled when the smoke check passes.
 * @note 只在 `AI_JOB_WORKSPACE_SMOKE=1` 时调用；深链检查会验证根路径构建资源在自定义协议下仍能加载。
 */
async function verifyDesktopSmoke(window: BrowserWindow): Promise<void> {
  /** @brief 根路由的 smoke 数据 / Smoke data from the root route. */
  const rootSmokeResult = await inspectDesktopSmoke(window)
  /** @brief 用于验证相对资源不会逃逸的生产深链 / Production deep link used to verify asset resolution. */
  const deepLinkUrl = `${rendererProtocolScheme}://${rendererProtocolHost}/knowledge/ks_mock_git/visibility`

  await window.loadURL(deepLinkUrl)

  /** @brief 深链重新加载后的 smoke 数据 / Smoke data after a deep-link reload. */
  const deepLinkSmokeResult = await inspectDesktopSmoke(window)

  console.info(
    `Desktop smoke passed: root=${rootSmokeResult.rootTextLength} chars, deep-link=${deepLinkSmokeResult.rootTextLength} chars, platform=${deepLinkSmokeResult.platform}, version=${deepLinkSmokeResult.appVersion}`
  )
}

/**
 * @brief 初始化桌面应用 / Initialize the desktop application.
 * @return 初始化完成时兑现的 Promise / A promise fulfilled when initialization completes.
 */
async function initializeDesktopApplication(): Promise<void> {
  configureDefaultPermissionDenial()
  registerRendererProtocol()
  registerIpcHandlers()
  /** @brief 已创建且已加载的主窗口 / Created and loaded main window. */
  const window = await createMainWindow()

  if (process.env[desktopSmokeEnvironmentKey] === '1') {
    await verifyDesktopSmoke(window)
    app.quit()
    return
  }

  app.on('activate', recreateMainWindowOnActivate)
}

/**
 * @brief 报告不可恢复的启动失败 / Report an unrecoverable startup failure.
 * @param error 启动期间抛出的错误 / Error thrown during startup.
 * @return 无返回值 / No return value.
 */
function reportStartupFailure(error: unknown): void {
  console.error('Desktop application failed to start.', error)
  app.exit(1)
}

/**
 * @brief 在所有窗口关闭后退出非 macOS 应用 / Quit non-macOS application after all windows close.
 * @return 无返回值 / No return value.
 */
function quitWhenAllWindowsClose(): void {
  if (process.platform !== 'darwin') {
    app.quit()
  }
}

/**
 * @brief 在 macOS 激活时重建主窗口 / Recreate the main window on macOS activation.
 * @return 无返回值 / No return value.
 */
function recreateMainWindowOnActivate(): void {
  if (mainWindow === null) {
    void createMainWindow().catch(reportStartupFailure)
  }
}

app.on('window-all-closed', quitWhenAllWindowsClose)

void app.whenReady().then(initializeDesktopApplication).catch(reportStartupFailure)
