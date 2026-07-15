import { contextBridge, ipcRenderer } from 'electron'
import type { PlatformBridge, RuntimeInfo } from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'
import type { RuntimeInfoInvoker } from './bridge'

/**
 * @brief 通过受控 IPC 获取运行时信息 / Get runtime information through controlled IPC.
 * @return 主进程验证后的运行时信息 / Runtime information verified by the main process.
 */
function invokeRuntimeInfo(channel: Parameters<RuntimeInfoInvoker>[0]): Promise<RuntimeInfo> {
  return ipcRenderer.invoke(channel)
}

/** @brief 暴露给渲染器的窄平台桥接 / Narrow platform bridge exposed to the renderer. */
const platformBridge: PlatformBridge = createDesktopPlatformBridge(invokeRuntimeInfo)

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aiJobWorkspace', platformBridge)
}
