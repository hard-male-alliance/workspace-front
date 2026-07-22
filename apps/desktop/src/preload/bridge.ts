/** @file Electron preload 的窄平台桥接组合 / Narrow platform-bridge composition in the Electron preload. */

import {
  DESKTOP_AUTH_AUTHORIZE_CHANNEL,
  DESKTOP_AUTH_GET_SESSION_CHANNEL,
  DESKTOP_AUTH_REFRESH_CHANNEL,
  DESKTOP_AUTH_SIGN_OUT_CHANNEL,
  RUNTIME_INFO_CHANNEL
} from '@ai-job-workspace/platform'
import type {
  DesktopAuthenticationResult,
  HostedIdentityScreenHint,
  PlatformBridge,
  RuntimeInfo
} from '@ai-job-workspace/platform'

/** @brief preload 允许的无参数 IPC 通道 / Argument-free IPC channels permitted by the preload. */
export type DesktopNoArgumentChannel =
  | typeof DESKTOP_AUTH_GET_SESSION_CHANNEL
  | typeof DESKTOP_AUTH_SIGN_OUT_CHANNEL
  | typeof RUNTIME_INFO_CHANNEL

/** @brief preload 允许的单字符串参数 IPC 通道 / Single-string IPC channels permitted by the preload. */
export type DesktopStringArgumentChannel =
  typeof DESKTOP_AUTH_AUTHORIZE_CHANNEL | typeof DESKTOP_AUTH_REFRESH_CHANNEL

/** @brief 无参数 IPC 调用器 / Argument-free IPC invoker. */
export type DesktopNoArgumentInvoker = (
  channel: DesktopNoArgumentChannel
) => Promise<DesktopAuthenticationResult | RuntimeInfo>

/** @brief 单字符串参数 IPC 调用器 / Single-string IPC invoker. */
export type DesktopStringArgumentInvoker = (
  channel: DesktopStringArgumentChannel,
  value: string | null
) => Promise<DesktopAuthenticationResult>

/** @brief 创建 preload bridge 的受限依赖 / Restricted dependencies for creating the preload bridge. */
export interface DesktopPlatformBridgeDependencies {
  /** @brief 仅允许无参数白名单通道的调用器 / Invoker limited to argument-free allowlisted channels. */
  readonly invokeWithoutArgument: DesktopNoArgumentInvoker
  /** @brief 仅允许单字符串参数白名单通道的调用器 / Invoker limited to allowlisted channels carrying one string. */
  readonly invokeWithStringArgument: DesktopStringArgumentInvoker
}

/**
 * @brief 创建桌面端平台桥接 / Create the desktop platform bridge.
 * @param dependencies 两个封闭 IPC 调用器 / Two closed IPC invokers.
 * @return 不暴露通用 IPC 的平台桥接 / Platform bridge that exposes no generic IPC.
 */
export function createDesktopPlatformBridge(
  dependencies: DesktopPlatformBridgeDependencies
): PlatformBridge {
  /**
   * @brief 请求运行时信息 / Request runtime information.
   * @return 经 IPC 传回的运行时信息 / Runtime information returned over IPC.
   */
  async function getRuntimeInfo(): Promise<RuntimeInfo> {
    return (await dependencies.invokeWithoutArgument(RUNTIME_INFO_CHANNEL)) as RuntimeInfo
  }

  return Object.freeze({
    authentication: Object.freeze({
      authorize: (screenHint: HostedIdentityScreenHint) =>
        dependencies.invokeWithStringArgument(DESKTOP_AUTH_AUTHORIZE_CHANNEL, screenHint),
      getSession: () =>
        dependencies.invokeWithoutArgument(
          DESKTOP_AUTH_GET_SESSION_CHANNEL
        ) as Promise<DesktopAuthenticationResult>,
      refresh: (rejectedAccessToken: string | null) =>
        dependencies.invokeWithStringArgument(DESKTOP_AUTH_REFRESH_CHANNEL, rejectedAccessToken),
      signOut: () =>
        dependencies.invokeWithoutArgument(
          DESKTOP_AUTH_SIGN_OUT_CHANNEL
        ) as Promise<DesktopAuthenticationResult>
    }),
    getRuntimeInfo
  })
}
