import {
  RUNTIME_INFO_CHANNEL,
  SAVE_ARTIFACT_CHANNEL,
  sanitizePdfFileName
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

/** @brief 冻结契约的不透明 ID 形状 / Opaque-ID shape from the frozen contract. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u

/**
 * @brief 在 preload 边界精确复制产物保存请求 / Exactly copy an artifact-save request at the preload boundary.
 * @param value renderer 提供的不可信载荷 / Untrusted payload supplied by the renderer.
 * @return 仅包含窄 IPC 字段的新请求 / New request containing only the narrow IPC fields.
 * @throws 形状、产物 ID 或文件名非法时抛出 / Throws for an invalid shape, artifact ID, or filename.
 * @note 主进程仍会重复验证；preload 不是唯一信任边界 / The main process validates again; preload is not the sole trust boundary.
 */
export function validatePreloadArtifactSaveRequest(value: unknown): SaveArtifactRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Artifact-save payload must be an object.')
  }

  /** @brief 只用于边界读取的未知字段映射 / Unknown field map used only at the boundary. */
  const payload = value as Record<string, unknown>
  /** @brief preload 允许的精确字段集 / Exact field set allowed by preload. */
  const keys = Object.keys(payload).sort()
  if (keys.length !== 2 || keys[0] !== 'artifactId' || keys[1] !== 'suggestedFileName') {
    throw new Error('Artifact-save payload contains unsupported fields.')
  }
  if (typeof payload.artifactId !== 'string' || typeof payload.suggestedFileName !== 'string') {
    throw new Error('Artifact-save payload string fields are invalid.')
  }
  if (!OPAQUE_ID_PATTERN.test(payload.artifactId)) {
    throw new Error('Artifact-save artifact ID must match the frozen opaque-ID format.')
  }

  /** @brief preload 重新净化的建议文件名 / Suggested filename sanitized again by preload. */
  const safeSuggestedFileName = sanitizePdfFileName(payload.suggestedFileName)
  if (safeSuggestedFileName !== payload.suggestedFileName) {
    throw new Error('Artifact-save suggested filename is not canonical and safe.')
  }

  return {
    artifactId: payload.artifactId,
    suggestedFileName: safeSuggestedFileName
  }
}

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
    return invokeArtifactSave(SAVE_ARTIFACT_CHANNEL, validatePreloadArtifactSaveRequest(request))
  }

  return { getRuntimeInfo, saveArtifact }
}
