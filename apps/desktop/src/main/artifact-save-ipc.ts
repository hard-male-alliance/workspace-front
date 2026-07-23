/** @file Electron Artifact 保存的可信 IPC 边界 / Trusted IPC boundary for Electron Artifact saving. */

import { ipcMain } from 'electron'
import {
  DESKTOP_ARTIFACT_SAVE_CHANNEL,
  sanitizePdfFileName,
  type ArtifactSavePort,
  type SafePdfFileName,
  type SaveArtifactRequest
} from '@ai-job-workspace/platform'

import { isTrustedMainFrameRequest } from './ipc-sender'
import type { IpcSenderEvent, TrustedRendererResolver } from './ipc-sender'

/** @brief API v2 不透明资源 ID 的冻结语法 / Frozen API v2 opaque-resource-ID syntax. */
const OPAQUE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{7,159}$/u

/**
 * @brief 校验 IPC sender 与精确单参数形状 / Validate the IPC sender and exact single-argument shape.
 * @param event IPC event 最小身份 / Minimal identity of the IPC event.
 * @param arguments_ renderer 参数 / Renderer arguments.
 * @param resolveTrustedRenderer 当前可信 renderer / Current trusted renderer.
 * @return 唯一未经信任的请求值 / Sole untrusted request value.
 */
function requireTrustedRequestArgument(
  event: IpcSenderEvent,
  arguments_: readonly unknown[],
  resolveTrustedRenderer: TrustedRendererResolver
): unknown {
  if (arguments_.length !== 1 || !isTrustedMainFrameRequest(event, resolveTrustedRenderer)) {
    throw new Error('Rejected Artifact save request from an untrusted renderer.')
  }
  return arguments_[0]
}

/**
 * @brief 将结构化克隆后的不可信值收敛为封闭保存命令 / Narrow an untrusted structured-clone value into the closed save command.
 * @param value IPC 传入值 / Value received over IPC.
 * @return 仅含两个 ID 与安全文件名的冻结请求 / Frozen request containing only two IDs and a safe filename.
 */
export function parseNativeArtifactSaveRequest(value: unknown): SaveArtifactRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Rejected invalid Artifact save request.')
  }
  /** @brief 未经信任的对象视图 / Untrusted object view. */
  const input = value as Record<string, unknown>
  /** @brief 请求的全部 enumerable 字段 / All enumerable request fields. */
  const keys = Object.keys(input)
  if (
    keys.length !== 3 ||
    !keys.includes('workspaceId') ||
    !keys.includes('artifactId') ||
    !keys.includes('suggestedFileName')
  ) {
    throw new Error('Rejected invalid Artifact save request fields.')
  }
  /** @brief 仅读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceId = input.workspaceId
  /** @brief 仅读取一次的 Artifact ID / Artifact ID read exactly once. */
  const artifactId = input.artifactId
  /** @brief 仅读取一次的安全建议文件名 / Safe suggested filename read exactly once. */
  const suggestedFileName = input.suggestedFileName
  if (
    typeof workspaceId !== 'string' ||
    !OPAQUE_ID_PATTERN.test(workspaceId) ||
    typeof artifactId !== 'string' ||
    !OPAQUE_ID_PATTERN.test(artifactId) ||
    typeof suggestedFileName !== 'string' ||
    sanitizePdfFileName(suggestedFileName) !== suggestedFileName
  ) {
    throw new Error('Rejected invalid Artifact save request values.')
  }
  return Object.freeze({
    artifactId,
    suggestedFileName: suggestedFileName as SafePdfFileName,
    workspaceId
  })
}

/**
 * @brief 注册唯一的原生 Artifact 保存 IPC handler / Register the sole native Artifact-save IPC handler.
 * @param artifactSave main-only 保存服务 / Main-only save service.
 * @param resolveTrustedRenderer 当前可信主窗口身份 / Current trusted main-window identity.
 * @return 无返回值 / No return value.
 */
export function registerNativeArtifactSaveHandler(
  artifactSave: ArtifactSavePort,
  resolveTrustedRenderer: TrustedRendererResolver
): void {
  ipcMain.removeHandler(DESKTOP_ARTIFACT_SAVE_CHANNEL)
  ipcMain.handle(DESKTOP_ARTIFACT_SAVE_CHANNEL, async (event, ...arguments_: unknown[]) => {
    /** @brief 已通过 sender 与参数个数检查的原始请求 / Raw request after sender and argument-count checks. */
    const candidate = requireTrustedRequestArgument(event, arguments_, resolveTrustedRenderer)
    try {
      return await artifactSave.saveArtifact(parseNativeArtifactSaveRequest(candidate))
    } catch {
      throw new Error('The native Artifact could not be saved.')
    }
  })
}
