import type { DiagnosticsConfigurationErrorReason } from './diagnostics'

/**
 * @brief 运行时宿主类型 / Runtime host type.
 *
 * 与后端能力声明保持相同的宿主命名，但该类型仅描述前端本地运行环境。
 */
export type RuntimePlatform = 'web' | 'electron'

/** @brief 当前前端语义版本 / Current frontend semantic version. */
export const APPLICATION_VERSION = '0.1.0'

/** @brief 所有运行时信息共有的公开字段 / Public fields shared by all runtime-information variants. */
interface BaseRuntimeInfo {
  /** @brief 应用语义版本 / Semantic application version. */
  readonly appVersion: string
}

/** @brief 浏览器运行时信息 / Browser runtime information. */
export interface WebRuntimeInfo extends BaseRuntimeInfo {
  /** @brief 浏览器宿主标识 / Browser-host discriminator. */
  readonly platform: 'web'
}

/** @brief Electron 运行时信息 / Electron runtime information. */
export interface ElectronRuntimeInfo extends BaseRuntimeInfo {
  /** @brief Electron 宿主标识 / Electron-host discriminator. */
  readonly platform: 'electron'
  /** @brief 主进程验证后的产品 API origin / Product API origin validated by the main process. */
  readonly apiBaseUrl: string
  /** @brief 主进程校验后可选的诊断批量上传 endpoint / Optional diagnostics batch-upload endpoint validated by the main process. */
  readonly diagnosticsEndpoint?: string
  /** @brief 主进程拒绝诊断上传配置时的无敏感原因 / Non-sensitive reason when the main process rejected diagnostics upload configuration. */
  readonly diagnosticsConfigurationError?: DiagnosticsConfigurationErrorReason
}

/** @brief 跨平台运行时信息的判别联合 / Discriminated union of cross-platform runtime information. */
export type RuntimeInfo = ElectronRuntimeInfo | WebRuntimeInfo

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

/** @brief 运行时信息 IPC 通道 / Runtime information IPC channel. */
export const RUNTIME_INFO_CHANNEL = 'platform:get-runtime-info' as const
