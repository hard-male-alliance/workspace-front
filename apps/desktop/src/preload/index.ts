import { contextBridge, ipcRenderer } from 'electron'
import type {
  PlatformBridge,
  RuntimeInfo,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'
import type { ArtifactSaveInvoker, RuntimeInfoInvoker } from './bridge'

/**
 * @brief 通过受控 IPC 获取运行时信息 / Get runtime information through controlled IPC.
 * @return 主进程验证后的运行时信息 / Runtime information verified by the main process.
 */
function invokeRuntimeInfo(channel: Parameters<RuntimeInfoInvoker>[0]): Promise<RuntimeInfo> {
  return ipcRenderer.invoke(channel)
}

/**
 * @brief 通过专用 IPC 请求保存一个 PDF 产物 / Request saving one PDF artifact through dedicated IPC.
 * @param channel 编译期固定的产物保存通道 / Artifact-save channel fixed at compile time.
 * @param request 窄保存请求 / Narrow save request.
 * @return 宿主保存判别结果 / Discriminated host-save result.
 */
function invokeArtifactSave(
  channel: Parameters<ArtifactSaveInvoker>[0],
  request: SaveArtifactRequest
): Promise<SaveArtifactResult> {
  return ipcRenderer.invoke(channel, request)
}

/** @brief 暴露给渲染器的窄平台桥接 / Narrow platform bridge exposed to the renderer. */
const platformBridge: PlatformBridge = createDesktopPlatformBridge(
  invokeRuntimeInfo,
  invokeArtifactSave
)

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('aiJobWorkspace', platformBridge)
}
