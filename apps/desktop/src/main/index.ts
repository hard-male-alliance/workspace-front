/** @file Electron 主进程组合根与应用生命周期 / Electron main-process composition root and application lifecycle. */

import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'

import { resolveDesktopApiBaseUrl } from './api-config'
import {
  createProductionContentSecurityPolicy,
  resolveDesktopDiagnosticsConfiguration
} from './diagnostics-config'
import { configureDefaultPermissionDenial, createMainWindow } from './main-window'
import {
  getTrustedRendererUrl,
  loadTrustedRenderer,
  registerDevelopmentRendererContentSecurityPolicy,
  registerRendererProtocol,
  registerRendererSchemePrivileges
} from './renderer-host'
import { createDesktopRuntimeInfo } from './runtime-info'
import { registerRuntimeInfoHandler } from './runtime-ipc'
import type { RendererIdentity } from './security'
import { reportDesktopStartupFailure } from './startup-failure'

/** @brief 唯一的产品主窗口 / The single product main window. */
let mainWindow: BrowserWindow | null = null

/**
 * @brief 读取当前可信主窗口身份 / Resolve the current trusted main-window identity.
 * @return 主窗口存在时返回其 WebContents 与 renderer URL，否则返回 undefined / Current WebContents and renderer URL, or undefined when no main window exists.
 */
function resolveTrustedRendererIdentity(): RendererIdentity | undefined {
  if (mainWindow === null) {
    return undefined
  }

  return {
    webContentsId: mainWindow.webContents.id,
    rendererUrl: getTrustedRendererUrl()
  }
}

/**
 * @brief 创建、登记并加载产品主窗口 / Create, retain, and load the product main window.
 * @return 已加载可信 renderer 的主窗口 / Main window after its trusted renderer has loaded.
 * @note 在加载前登记窗口身份，确保 preload 的首个 IPC 请求可被正确授权 / Retains window identity before loading so the preload's first IPC request can be authorized.
 */
async function openMainWindow(): Promise<BrowserWindow> {
  /** @brief 本次窗口唯一允许加载的 renderer URL / Only renderer URL allowed for this window. */
  const rendererUrl = getTrustedRendererUrl()
  /** @brief 已创建但尚未加载内容的主窗口 / Main window created before content loading. */
  const window = createMainWindow(rendererUrl)

  mainWindow = window

  /**
   * @brief 在窗口关闭后清理全局引用 / Clear the global reference after window closure.
   * @return 无返回值 / No return value.
   */
  function clearMainWindowOnClose(): void {
    if (mainWindow === window) {
      mainWindow = null
    }
  }

  window.on('closed', clearMainWindowOnClose)
  await loadTrustedRenderer(window, rendererUrl)
  return window
}

/**
 * @brief 初始化桌面应用的运行时边界 / Initialize desktop-application runtime boundaries.
 * @return 初始化完成时兑现的 Promise / Promise fulfilled when initialization completes.
 */
async function initializeDesktopApplication(): Promise<void> {
  /** @brief 由主进程严格验证的产品 API origin / Product API origin strictly validated by the main process. */
  const apiBaseUrl = resolveDesktopApiBaseUrl(process.env)
  /** @brief 主进程解析的可选诊断配置 / Optional diagnostics configuration resolved by the main process. */
  const diagnostics = resolveDesktopDiagnosticsConfiguration(process.env)
  /** @brief 只允许产品 API 与可选诊断 origin 的生产 CSP / Production CSP allowing only the product API and optional diagnostics origin. */
  const contentSecurityPolicy = createProductionContentSecurityPolicy(diagnostics, apiBaseUrl)
  /** @brief 通过 IPC 下发的不可变运行时信息 / Immutable runtime information exposed through IPC. */
  const runtimeInfo = createDesktopRuntimeInfo(apiBaseUrl, diagnostics)
  /** @brief 当前进程唯一可信的 renderer URL / Sole trusted renderer URL for this process. */
  const rendererUrl = getTrustedRendererUrl()

  configureDefaultPermissionDenial()
  registerRendererProtocol(contentSecurityPolicy)
  registerDevelopmentRendererContentSecurityPolicy(rendererUrl, contentSecurityPolicy)
  registerRuntimeInfoHandler(runtimeInfo, resolveTrustedRendererIdentity)

  await openMainWindow()

  app.on('activate', recreateMainWindowOnActivate)
}

/**
 * @brief 安全读取原生启动错误所用 locale / Safely read the locale used by the native startup error.
 * @return Electron 已 ready 时的宿主 locale；否则回退 en-US / Host locale after Electron is ready, otherwise en-US.
 */
function resolveStartupFailureLocale(): string {
  if (!app.isReady()) return 'en-US'
  try {
    return app.getLocale()
  } catch {
    return 'en-US'
  }
}

/**
 * @brief 报告不可恢复的启动失败 / Report an unrecoverable startup failure.
 * @param error 启动期间抛出的错误 / Error thrown during startup.
 * @return 无返回值 / No return value.
 */
function reportStartupFailure(error: unknown): void {
  reportDesktopStartupFailure(error, resolveStartupFailureLocale(), {
    exit: (exitCode): void => app.exit(exitCode),
    logError: (message, reason): void => console.error(message, reason),
    showErrorBox: (title, content): void => dialog.showErrorBox(title, content)
  })
}

/**
 * @brief 在 ready 前安全注册 renderer scheme 权限 / Safely register renderer-scheme privileges before ready.
 * @return 注册成功时为 true；失败时报告原生错误并阻止后续初始化 / True on success; on failure reports a native error and prevents later initialization.
 */
function registerRendererSchemePrivilegesSafely(): boolean {
  try {
    registerRendererSchemePrivileges()
    return true
  } catch (error: unknown) {
    reportStartupFailure(error)
    return false
  }
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
    void openMainWindow().catch(reportStartupFailure)
  }
}

if (registerRendererSchemePrivilegesSafely()) {
  app.on('window-all-closed', quitWhenAllWindowsClose)
  void app.whenReady().then(initializeDesktopApplication).catch(reportStartupFailure)
}
