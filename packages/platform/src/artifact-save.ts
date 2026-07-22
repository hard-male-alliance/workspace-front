/** @brief 经过净化且以 .pdf 结尾的建议文件名 / Sanitized suggested filename ending in .pdf. */
export type SafePdfFileName = string & { readonly __safePdfFileName: unique symbol }

/** @brief 本地允许保存的 PDF 产物最大字节数（25 MiB） / Maximum locally savable PDF artifact size in bytes (25 MiB). */
export const MAX_PDF_ARTIFACT_BYTES = 25 * 1024 * 1024

/** @brief 建议文件名允许的最大字符数 / Maximum character count allowed for a suggested filename. */
const MAX_SUGGESTED_FILE_NAME_LENGTH = 120

/**
 * @brief 将不可信显示名称净化为安全 PDF 文件名 / Sanitize an untrusted display name into a safe PDF filename.
 * @param input 用户可见的文件名或标题 / User-visible filename or title.
 * @return 不含路径、控制字符或平台保留字符的 PDF 文件名 / PDF filename without paths, controls, or platform-reserved characters.
 */
export function sanitizePdfFileName(input: string): SafePdfFileName {
  /** @brief 移除现有扩展名后的安全主体 / Safe stem after removing an existing extension. */
  const stem = input
    .normalize('NFKC')
    .replace(/\.pdf$/iu, '')
    // eslint-disable-next-line no-control-regex -- Filename boundary must remove the complete ASCII control range.
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[ .]+|[ .]+$/gu, '')
    .slice(0, MAX_SUGGESTED_FILE_NAME_LENGTH - 4)
    .replace(/[ .]+$/gu, '')

  /** @brief 空名称与路径特殊名称的安全回退 / Safe fallback for empty and path-special names. */
  const nonEmptyStem = stem.length > 0 && stem !== '.' && stem !== '..' ? stem : 'resume'
  /** @brief 避开 Windows 保留设备名的最终主体 / Final stem avoiding Windows reserved device names. */
  const portableStem = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(nonEmptyStem)
    ? `_${nonEmptyStem}`
    : nonEmptyStem

  return `${portableStem}.pdf` as SafePdfFileName
}

/** @brief 保存宿主产物的请求 / Request to save a host artifact. */
export interface SaveArtifactRequest {
  /** @brief 由宿主重新解析权威元数据的不透明产物 ID / Opaque artifact ID whose authoritative metadata the host resolves again. */
  readonly artifactId: string
  /** @brief 不包含目录信息的安全建议文件名 / Safe suggested filename without directory information. */
  readonly suggestedFileName: SafePdfFileName
}

/** @brief 宿主产物保存结果 / Host artifact-save result. */
export type SaveArtifactResult =
  | {
      /** @brief 宿主已启动下载但无法观察最终结果 / The host started a download but cannot observe its final outcome. */
      readonly status: 'started'
    }
  | {
      /** @brief 产物已保存 / The artifact was saved. */
      readonly status: 'saved'
    }
  | {
      /** @brief 用户取消保存 / The user cancelled saving. */
      readonly status: 'cancelled'
    }

/**
 * @brief 宿主产物保存端口 / Host artifact-save port.
 * @note 端口刻意不暴露文件路径、Node.js 文件系统或通用 IPC / The port intentionally exposes no file paths, Node.js filesystem, or generic IPC.
 */
export interface ArtifactSavePort {
  /**
   * @brief 将已生成的产物保存到用户选择的位置 / Save a generated artifact to a user-selected destination.
   * @param request 只含不透明产物 ID 与安全建议文件名的请求 / Request containing only an opaque artifact ID and safe suggested filename.
   * @return 已启动、已保存或已取消的判别结果 / Discriminated started, saved, or cancelled result.
   */
  readonly saveArtifact: (request: SaveArtifactRequest) => Promise<SaveArtifactResult>
}

/** @brief 产物保存专用 IPC 通道 / Dedicated artifact-save IPC channel. */
export const SAVE_ARTIFACT_CHANNEL = 'platform:save-artifact' as const
