/** @file Electron IPC 发送方身份提取 / Electron IPC sender-identity extraction. */

import { isTrustedRendererIpcSender } from './security'
import type { RendererIdentity } from './security'

/** @brief 延迟读取当前可信主窗口身份的函数 / Function that lazily resolves the current trusted main-window identity. */
export type TrustedRendererResolver = () => RendererIdentity | undefined

/** @brief IPC 身份检查所需的最小事件形状 / Minimal event shape required for IPC identity checks. */
export interface IpcSenderEvent {
  /** @brief 触发 IPC 的 frame / Frame that initiated IPC. */
  readonly senderFrame: { readonly frameTreeNodeId: number; readonly url: string } | null
  /** @brief 发送 WebContents 的最小身份 / Minimal identity of the sending WebContents. */
  readonly sender: {
    /** @brief WebContents 标识 / WebContents identifier. */
    readonly id: number
    /** @brief 发送 WebContents 的主 frame / Main frame of the sending WebContents. */
    readonly mainFrame: { readonly frameTreeNodeId: number }
  }
}

/**
 * @brief 判断 IPC 调用是否来自当前可信主 frame / Decide whether an IPC call comes from the current trusted main frame.
 * @param event IPC 调用事件的最小身份视图 / Minimal identity view of the IPC invocation.
 * @param resolveTrustedRenderer 当前可信窗口身份解析器 / Resolver for the current trusted-window identity.
 * @return 调用来自可信主 frame 时为 true / True when the call originates from the trusted main frame.
 */
export function isTrustedMainFrameRequest(
  event: IpcSenderEvent,
  resolveTrustedRenderer: TrustedRendererResolver
): boolean {
  /** @brief 触发 IPC 的 frame / Frame that triggered the IPC call. */
  const senderFrame = event.senderFrame
  /** @brief 调用时刻的可信主窗口身份 / Trusted main-window identity at invocation time. */
  const trustedRenderer = resolveTrustedRenderer()

  if (senderFrame === null || trustedRenderer === undefined) return false

  return isTrustedRendererIpcSender(
    {
      webContentsId: event.sender.id,
      isMainFrame: senderFrame.frameTreeNodeId === event.sender.mainFrame.frameTreeNodeId,
      frameUrl: senderFrame.url
    },
    trustedRenderer
  )
}
