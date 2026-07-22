/** @file Electron 主窗口创建与浏览上下文安全策略 / Electron main-window creation and browsing-context security policy. */

import { BrowserWindow, session } from 'electron'
import type { WebContents } from 'electron'
import { fileURLToPath } from 'node:url'

import { createHardenedWebPreferences, isAllowedRendererUrl } from './security'

/** @brief sandbox preload 构建文件路径 / Path to the sandbox-compatible preload build file. */
const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url))

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
 * @brief 拒绝所有 Chromium 权限 / Deny all Chromium permissions.
 * @return 无返回值 / No return value.
 * @note 后续若需要摄像头或麦克风，应基于受信任 origin 与显式用户操作添加最小 allowlist / Future camera or microphone access requires a minimal allowlist tied to trusted origins and explicit user actions.
 */
export function configureDefaultPermissionDenial(): void {
  session.defaultSession.setPermissionCheckHandler(denyPermissionCheck)
  session.defaultSession.setPermissionRequestHandler(denyPermissionRequest)
}

/**
 * @brief 为 WebContents 安装导航、弹窗与 WebView 防护 / Install navigation, popup, and WebView protections for WebContents.
 * @param webContents 待保护的窗口内容 / Window contents to protect.
 * @param rendererUrl 唯一受信任的 renderer URL / Only trusted renderer URL.
 * @return 无返回值 / No return value.
 */
function configureWebContentsSecurity(webContents: WebContents, rendererUrl: string): void {
  /**
   * @brief 阻止越界页面导航 / Block an out-of-scope page navigation.
   * @param event 可取消的 Electron 事件 / Cancellable Electron event.
   * @param navigationUrl 候选导航 URL / Candidate navigation URL.
   * @return 无返回值 / No return value.
   */
  function blockUnexpectedNavigation(event: Electron.Event, navigationUrl: string): void {
    if (!isAllowedRendererUrl(navigationUrl, rendererUrl)) {
      event.preventDefault()
    }
  }

  webContents.on('will-navigate', blockUnexpectedNavigation)
  webContents.setWindowOpenHandler(denyNewWindow)
  webContents.on('will-attach-webview', blockWebviewAttachment)
}

/**
 * @brief 创建并保护产品主窗口 / Create and protect the product main window.
 * @param rendererUrl 唯一受信任的 renderer URL / Only trusted renderer URL.
 * @return 尚未开始加载内容的主窗口 / Main window before content loading begins.
 * @note 调用者必须先保存窗口身份，再加载 renderer，以避免首个 IPC 请求与可信身份注册发生竞态 / The caller must retain the window identity before loading to avoid a race between the first IPC request and trusted-identity registration.
 */
export function createMainWindow(rendererUrl: string): BrowserWindow {
  /** @brief 受安全偏好保护的新主窗口 / New main window protected by security preferences. */
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#f7f4ee',
    webPreferences: createHardenedWebPreferences(preloadPath)
  })

  configureWebContentsSecurity(window.webContents, rendererUrl)

  /**
   * @brief 在内容可显示后展示窗口 / Show the window after its content is ready.
   * @return 无返回值 / No return value.
   */
  function showWindowWhenReady(): void {
    window.show()
  }

  window.once('ready-to-show', showWindowWhenReady)
  return window
}
