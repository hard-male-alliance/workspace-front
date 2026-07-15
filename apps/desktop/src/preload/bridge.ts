import { RUNTIME_INFO_CHANNEL } from '@ai-job-workspace/platform'
import type { PlatformBridge, RuntimeInfo } from '@ai-job-workspace/platform'

/**
 * @brief 最小 IPC 调用器 / Minimal IPC invoker.
 */
export type RuntimeInfoInvoker = (channel: typeof RUNTIME_INFO_CHANNEL) => Promise<RuntimeInfo>

/**
 * @brief 创建桌面端平台桥接 / Create the desktop platform bridge.
 * @param invokeRuntimeInfo 仅允许调用运行时信息通道的 IPC 函数 / IPC function limited to the runtime-info channel.
 * @return 不暴露通用 IPC 的平台桥接 / A platform bridge that does not expose generic IPC.
 */
export function createDesktopPlatformBridge(invokeRuntimeInfo: RuntimeInfoInvoker): PlatformBridge {
  /**
   * @brief 请求运行时信息 / Request runtime information.
   * @return 经 IPC 传回的运行时信息 / Runtime information returned over IPC.
   */
  function getRuntimeInfo(): Promise<RuntimeInfo> {
    return invokeRuntimeInfo(RUNTIME_INFO_CHANNEL)
  }

  return { getRuntimeInfo }
}
