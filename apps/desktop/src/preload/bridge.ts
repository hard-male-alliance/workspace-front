import {
  parseArtifactSaveRequest,
  RUNTIME_INFO_CHANNEL,
  SAVE_ARTIFACT_CHANNEL
} from '@ai-job-workspace/platform'
import type {
  PlatformBridge,
  RuntimeInfo,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

/**
 * @brief 最小 IPC 调用器 / Minimal IPC invoker.
 */
export type RuntimeInfoInvoker = (channel: typeof RUNTIME_INFO_CHANNEL) => Promise<RuntimeInfo>

/** @brief 只允许产物保存通道的最小 IPC 调用器 / Minimal IPC invoker limited to the artifact-save channel. */
export type ArtifactSaveInvoker = (
  channel: typeof SAVE_ARTIFACT_CHANNEL,
  request: SaveArtifactRequest
) => Promise<SaveArtifactResult>

/**
 * @brief 创建桌面端平台桥接 / Create the desktop platform bridge.
 * @param invokeRuntimeInfo 仅允许调用运行时信息通道的 IPC 函数 / IPC function limited to the runtime-info channel.
 * @param invokeArtifactSave 仅允许调用产物保存通道的 IPC 函数 / IPC function limited to the artifact-save channel.
 * @return 不暴露通用 IPC 的平台桥接 / A platform bridge that does not expose generic IPC.
 */
export function createDesktopPlatformBridge(
  invokeRuntimeInfo: RuntimeInfoInvoker,
  invokeArtifactSave: ArtifactSaveInvoker
): PlatformBridge {
  /**
   * @brief 请求运行时信息 / Request runtime information.
   * @return 经 IPC 传回的运行时信息 / Runtime information returned over IPC.
   */
  function getRuntimeInfo(): Promise<RuntimeInfo> {
    return invokeRuntimeInfo(RUNTIME_INFO_CHANNEL)
  }

  /**
   * @brief 请求主进程安全保存产物 / Ask the main process to save an artifact safely.
   * @param request 只含产物 ID 与安全文件名的请求 / Request containing only the artifact ID and safe filename.
   * @return 宿主保存判别结果 / Discriminated host-save result.
   */
  function saveArtifact(request: SaveArtifactRequest): Promise<SaveArtifactResult> {
    return invokeArtifactSave(SAVE_ARTIFACT_CHANNEL, parseArtifactSaveRequest(request))
  }

  return { getRuntimeInfo, saveArtifact }
}
