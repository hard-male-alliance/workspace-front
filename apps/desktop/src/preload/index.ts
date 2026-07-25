/** @file Electron preload 的 context-isolated 平台出口 / Context-isolated platform surface of the Electron preload. */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  DESKTOP_ARTIFACT_SAVE_CHANNEL,
  DesktopAuthenticationResult,
  PlatformBridge,
  RuntimeInfo,
  SaveArtifactRequest,
  SaveArtifactResult
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

/**
 * @brief 调用封闭的原生产物保存通道 / Invoke the closed native artifact-save channel.
 * @param channel 编译期固定产物通道 / Compile-time fixed artifact channel.
 * @param request 只含 Workspace/Artifact ID 与安全文件名的请求 / Request containing only Workspace/Artifact IDs and a safe filename.
 * @return 主进程可观察的保存终态 / Save terminal state observed by main.
 */
function invokeArtifactSave(
  channel: typeof DESKTOP_ARTIFACT_SAVE_CHANNEL,
  request: SaveArtifactRequest
): Promise<SaveArtifactResult> {
  return ipcRenderer.invoke(channel, request)
}

/** @brief 暴露给 renderer 的冻结窄桥接 / Frozen narrow bridge exposed to the renderer. */
const platformBridge: PlatformBridge = createDesktopPlatformBridge({
  invokeArtifactSave,
  invokeWithStringArgument,
  invokeWithoutArgument
})

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aiJobWorkspace', platformBridge)
}
