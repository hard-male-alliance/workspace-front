/** @file Electron 运行时信息 IPC 边界 / Electron runtime-information IPC boundary. */

import { ipcMain } from 'electron'
import { RUNTIME_INFO_CHANNEL } from '@ai-job-workspace/platform'
import type { ElectronRuntimeInfo, RuntimeInfo } from '@ai-job-workspace/platform'

import { isTrustedMainFrameRequest } from './ipc-sender'
import type { TrustedRendererResolver } from './ipc-sender'

export type { TrustedRendererResolver } from './ipc-sender'

/**
 * @brief 注册唯一的运行时信息 IPC handler / Register the sole runtime-information IPC handler.
 * @param runtimeInfo 允许可信 renderer 读取的不可变信息 / Immutable information exposed to the trusted renderer.
 * @param resolveTrustedRenderer 当前可信窗口身份解析器 / Resolver for the current trusted-window identity.
 * @return 无返回值 / No return value.
 */
export function registerRuntimeInfoHandler(
  runtimeInfo: ElectronRuntimeInfo,
  resolveTrustedRenderer: TrustedRendererResolver
): void {
  ipcMain.removeHandler(RUNTIME_INFO_CHANNEL)
  ipcMain.handle(RUNTIME_INFO_CHANNEL, (event): RuntimeInfo => {
    if (!isTrustedMainFrameRequest(event, resolveTrustedRenderer)) {
      throw new Error('Rejected runtime information request from an untrusted renderer.')
    }

    return runtimeInfo
  })
}
