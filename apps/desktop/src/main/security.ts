/**
 * @brief 渲染器身份描述 / Renderer identity descriptor.
 */
export interface RendererIdentity {
  /** @brief 可信主窗口的 WebContents 标识符 / Trusted main window WebContents identifier. */
  readonly webContentsId: number

  /** @brief 主窗口加载的渲染器 URL / Renderer URL loaded by the main window. */
  readonly rendererUrl: string
}

/**
 * @brief IPC 发送方身份描述 / IPC sender identity descriptor.
 */
export interface IpcSenderIdentity {
  /** @brief 实际发送方的 WebContents 标识符 / Actual sender WebContents identifier. */
  readonly webContentsId: number

  /** @brief IPC 所在 frame 是否为主 frame / Whether the IPC frame is the main frame. */
  readonly isMainFrame: boolean

  /** @brief 实际发送 frame 的 URL / URL of the actual sender frame. */
  readonly frameUrl: string
}

/**
 * @brief 安全解析 URL / Safely parse a URL.
 * @param value 待解析的 URL 字符串 / URL string to parse.
 * @return 成功时返回 URL，失败时返回 undefined / A URL on success, or undefined on failure.
 */
function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/**
 * @brief 判断是否允许渲染器导航 / Decide whether a renderer navigation is allowed.
 * @param candidateUrl 导航目标 URL / Candidate navigation URL.
 * @param rendererUrl 受信任的应用渲染器 URL / Trusted application renderer URL.
 * @return 目标属于受信任渲染器范围时为 true / True when the target is in the trusted renderer scope.
 * @note 开发环境与生产自定义协议均仅允许同一协议、主机与端口下的客户端路由。
 */
export function isAllowedRendererUrl(candidateUrl: string, rendererUrl: string): boolean {
  /** @brief 已解析的候选 URL / Parsed candidate URL. */
  const candidate = parseUrl(candidateUrl)
  /** @brief 已解析的受信任渲染器 URL / Parsed trusted renderer URL. */
  const trustedRenderer = parseUrl(rendererUrl)

  if (candidate === undefined || trustedRenderer === undefined) {
    return false
  }

  if (candidate.protocol === 'file:' || trustedRenderer.protocol === 'file:') {
    return false
  }

  return candidate.protocol === trustedRenderer.protocol && candidate.host === trustedRenderer.host
}

/**
 * @brief 判断 IPC 是否来自可信主 frame / Decide whether IPC originates from the trusted main frame.
 * @param sender 实际 IPC 发送方 / Actual IPC sender.
 * @param trustedRenderer 可信渲染器身份 / Trusted renderer identity.
 * @return 发送方身份和 URL 都匹配时为 true / True when sender identity and URL both match.
 */
export function isTrustedRendererIpcSender(
  sender: IpcSenderIdentity,
  trustedRenderer: RendererIdentity
): boolean {
  return (
    sender.isMainFrame &&
    sender.webContentsId === trustedRenderer.webContentsId &&
    isAllowedRendererUrl(sender.frameUrl, trustedRenderer.rendererUrl)
  )
}
