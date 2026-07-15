/**
 * @brief 运行时宿主类型 / Runtime host type.
 *
 * 与后端能力声明保持相同的宿主命名，但该类型仅描述前端本地运行环境。
 */
export type RuntimePlatform = 'web' | 'electron'

/** @brief 当前前端语义版本 / Current frontend semantic version. */
export const APPLICATION_VERSION = '0.1.0'

/**
 * @brief 最小运行时信息 / Minimal runtime information.
 */
export interface RuntimeInfo {
  /** @brief 运行应用的宿主 / Host that runs the application. */
  readonly platform: RuntimePlatform

  /** @brief 应用语义版本 / Semantic application version. */
  readonly appVersion: string
}

/**
 * @brief 渲染器可见的平台桥接 / Renderer-visible platform bridge.
 *
 * @note 此接口刻意不暴露 Node.js、Electron IPC 或文件系统对象。
 */
export interface PlatformBridge {
  /**
   * @brief 获取经过主进程确认的运行时信息 / Get runtime information verified by the main process.
   * @return 异步返回最小运行时信息 / A promise for minimal runtime information.
   */
  readonly getRuntimeInfo: () => Promise<RuntimeInfo>
}

declare global {
  /** @brief 浏览器全局窗口扩展 / Browser global window extension. */
  interface Window {
    /** @brief 仅由 Electron preload 注入的平台桥接 / Platform bridge injected only by Electron preload. */
    readonly aiJobWorkspace?: PlatformBridge
  }
}

/** @brief 运行时信息 IPC 通道 / Runtime information IPC channel. */
export const RUNTIME_INFO_CHANNEL = 'platform:get-runtime-info' as const

/**
 * @brief 创建浏览器宿主桥接 / Create a browser-host bridge.
 * @param appVersion 应用语义版本 / Semantic application version.
 * @return 仅报告 Web 运行时的窄桥接 / A narrow bridge reporting the Web runtime only.
 */
export function createWebPlatformBridge(appVersion: string): PlatformBridge {
  /**
   * @brief 获取浏览器运行时信息 / Get browser runtime information.
   * @return 已兑现的浏览器运行时信息 Promise / A fulfilled promise for browser runtime information.
   */
  function getRuntimeInfo(): Promise<RuntimeInfo> {
    return Promise.resolve({
      platform: 'web',
      appVersion
    })
  }

  return {
    getRuntimeInfo
  }
}
