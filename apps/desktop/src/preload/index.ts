/** @file Electron preload 的 context-isolated 平台出口 / Context-isolated platform surface of the Electron preload. */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopAuthenticationResult,
  PlatformBridge,
  RuntimeInfo
} from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'
import type { DesktopNoArgumentChannel, DesktopStringArgumentChannel } from './bridge'

/**
 * @brief 调用一个无参数白名单通道 / Invoke one allowlisted argument-free channel.
 * @param channel 编译期封闭通道 / Compile-time closed channel.
 * @return 认证结果或运行时信息 / Authentication result or runtime information.
 */
function invokeWithoutArgument(
  channel: DesktopNoArgumentChannel
): Promise<DesktopAuthenticationResult | RuntimeInfo> {
  return ipcRenderer.invoke(channel)
}

/**
 * @brief 调用一个单字符串参数白名单通道 / Invoke one allowlisted channel carrying a single string.
 * @param channel 编译期封闭通道 / Compile-time closed channel.
 * @param value 页面提示、被拒绝 token 或 null / Screen hint, rejected token, or null.
 * @return 认证命令结果 / Authentication-command result.
 */
function invokeWithStringArgument(
  channel: DesktopStringArgumentChannel,
  value: string | null
): Promise<DesktopAuthenticationResult> {
  return ipcRenderer.invoke(channel, value)
}

/** @brief 暴露给 renderer 的冻结窄桥接 / Frozen narrow bridge exposed to the renderer. */
const platformBridge: PlatformBridge = createDesktopPlatformBridge({
  invokeWithStringArgument,
  invokeWithoutArgument
})

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aiJobWorkspace', platformBridge)
}
