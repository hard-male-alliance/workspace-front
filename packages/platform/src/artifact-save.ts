/**
 * @brief 单个可保存 Resume Artifact 的判别式闭合格式 / Discriminated closed format for one saveable Resume Artifact.
 * @note 联合类型在编译期也禁止 kind、MIME 与扩展名交叉组合 / The union also forbids cross-combining kind, MIME, and extension at compile time.
 */
export type ResumeArtifactSaveFormat =
  | {
      readonly kind: 'resume_pdf'
      readonly mediaType: 'application/pdf'
      readonly extension: '.pdf'
      readonly dialogLabel: 'PDF'
    }
  | {
      readonly kind: 'resume_json'
      readonly mediaType: 'application/json'
      readonly extension: '.json'
      readonly dialogLabel: 'JSON'
    }
  | {
      readonly kind: 'resume_docx'
      readonly mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      readonly extension: '.docx'
      readonly dialogLabel: 'DOCX'
    }

/** @brief API v2 可保存的 Resume Artifact kind / API v2 Resume Artifact kinds eligible for saving. */
export type ResumeArtifactSaveKind = ResumeArtifactSaveFormat['kind']

/** @brief API v2 Resume Artifact 的闭合媒体类型 / Closed media types for API v2 Resume Artifacts. */
export type ResumeArtifactSaveMediaType = ResumeArtifactSaveFormat['mediaType']

/** @brief API v2 Resume Artifact 的闭合文件扩展名 / Closed filename extensions for API v2 Resume Artifacts. */
export type ResumeArtifactSaveExtension = ResumeArtifactSaveFormat['extension']

/** @brief PDF 保存格式 / PDF save format. */
const RESUME_PDF_FORMAT: ResumeArtifactSaveFormat = Object.freeze({
  dialogLabel: 'PDF',
  extension: '.pdf',
  kind: 'resume_pdf',
  mediaType: 'application/pdf'
})

/** @brief JSON 保存格式 / JSON save format. */
const RESUME_JSON_FORMAT: ResumeArtifactSaveFormat = Object.freeze({
  dialogLabel: 'JSON',
  extension: '.json',
  kind: 'resume_json',
  mediaType: 'application/json'
})

/** @brief DOCX 保存格式 / DOCX save format. */
const RESUME_DOCX_FORMAT: ResumeArtifactSaveFormat = Object.freeze({
  dialogLabel: 'DOCX',
  extension: '.docx',
  kind: 'resume_docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
})

/** @brief 唯一允许保存的三种 Resume Artifact 格式 / The only three Resume Artifact formats eligible for saving. */
export const RESUME_ARTIFACT_SAVE_FORMATS: readonly ResumeArtifactSaveFormat[] = Object.freeze([
  RESUME_PDF_FORMAT,
  RESUME_JSON_FORMAT,
  RESUME_DOCX_FORMAT
])

/** @brief 经过净化且以受支持扩展名结尾的建议文件名 / Sanitized suggested filename ending in a supported extension. */
export type SafeArtifactFileName = string & { readonly __safeArtifactFileName: unique symbol }

/** @brief 建议文件名允许的最大字符数 / Maximum character count allowed for a suggested filename. */
const MAX_SUGGESTED_FILE_NAME_LENGTH = 120

/** @brief 任一受支持 Resume Artifact 扩展名 / Any supported Resume Artifact extension. */
const SUPPORTED_EXTENSION_PATTERN = /\.(?:docx|json|pdf)$/iu

/**
 * @brief 按 kind 解析闭合 Resume Artifact 保存格式 / Resolve the closed Resume Artifact save format by kind.
 * @param kind 未经信任的 Artifact kind / Untrusted Artifact kind.
 * @return 精确格式；不受支持时为 null / Exact format, or null when unsupported.
 */
export function resumeArtifactSaveFormatForKind(kind: string): ResumeArtifactSaveFormat | null {
  switch (kind) {
    case 'resume_pdf':
      return RESUME_PDF_FORMAT
    case 'resume_json':
      return RESUME_JSON_FORMAT
    case 'resume_docx':
      return RESUME_DOCX_FORMAT
    default:
      return null
  }
}

/**
 * @brief 同时核对 kind 与 MIME 的闭合映射 / Validate the closed kind-and-MIME mapping together.
 * @param kind 未经信任的 Artifact kind / Untrusted Artifact kind.
 * @param mediaType 未经信任且不应含参数的 MIME type / Untrusted MIME type that must not contain parameters.
 * @return 两者属于同一闭合格式时返回格式，否则为 null / Matching closed format, or null when the pair is invalid.
 */
export function resolveResumeArtifactSaveFormat(
  kind: string,
  mediaType: string
): ResumeArtifactSaveFormat | null {
  /** @brief kind 对应的唯一允许格式 / Sole allowed format for the kind. */
  const format = resumeArtifactSaveFormatForKind(kind)
  return format !== null && mediaType.toLowerCase() === format.mediaType ? format : null
}

/**
 * @brief 将不可信显示名称净化为指定 Resume Artifact 格式的安全文件名 / Sanitize an untrusted display name into a safe filename for a Resume Artifact format.
 * @param input 用户可见的文件名或标题 / User-visible filename or title.
 * @param kind 目标 Resume Artifact kind / Target Resume Artifact kind.
 * @return 不含路径、控制字符或平台保留字符且扩展名正确的文件名 / Filename without paths, controls, or platform-reserved characters and with the correct extension.
 */
export function sanitizeArtifactFileName(
  input: string,
  kind: ResumeArtifactSaveKind
): SafeArtifactFileName {
  /** @brief kind 对应的受信闭合格式 / Trusted closed format corresponding to the kind. */
  const format = resumeArtifactSaveFormatForKind(kind)
  if (format === null) {
    throw new TypeError('Unsupported Resume Artifact save kind.')
  }
  /** @brief 移除已有受支持扩展名后的安全主体 / Safe stem after removing an existing supported extension. */
  const stem = input
    .normalize('NFKC')
    .replace(SUPPORTED_EXTENSION_PATTERN, '')
    // eslint-disable-next-line no-control-regex -- Filename boundary must remove the complete ASCII control range.
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/gu, ' ')
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[ .]+|[ .]+$/gu, '')
    .slice(0, MAX_SUGGESTED_FILE_NAME_LENGTH - format.extension.length)
    .replace(/[ .]+$/gu, '')

  /** @brief 空名称与路径特殊名称的安全回退 / Safe fallback for empty and path-special names. */
  const nonEmptyStem = stem.length > 0 && stem !== '.' && stem !== '..' ? stem : 'resume'
  /** @brief 避开 Windows 保留设备名的最终主体 / Final stem avoiding Windows reserved device names. */
  const portableStem = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(nonEmptyStem)
    ? `_${nonEmptyStem}`
    : nonEmptyStem

  return `${portableStem}${format.extension}` as SafeArtifactFileName
}

/**
 * @brief 将显示名称净化为 PDF 文件名 / Sanitize a display name into a PDF filename.
 * @param input 用户可见的文件名或标题 / User-visible filename or title.
 * @return 安全 PDF 文件名 / Safe PDF filename.
 * @note 这是通用格式感知净化器的 PDF 便捷入口 / This is the PDF convenience entry point of the format-aware sanitizer.
 */
export function sanitizePdfFileName(input: string): SafeArtifactFileName {
  return sanitizeArtifactFileName(input, 'resume_pdf')
}

/**
 * @brief 从已净化建议文件名解析唯一格式 / Resolve the sole format from a sanitized suggested filename.
 * @param fileName 跨宿主边界后的未经信任文件名 / Untrusted filename after crossing a host boundary.
 * @return 文件名安全且扩展名受支持时的格式，否则为 null / Format when the filename is safe with a supported extension, otherwise null.
 */
export function resumeArtifactSaveFormatForFileName(
  fileName: string
): ResumeArtifactSaveFormat | null {
  /** @brief 与文件名扩展名匹配的候选格式 / Candidate format matching the filename extension. */
  const format =
    RESUME_ARTIFACT_SAVE_FORMATS.find(({ extension }) =>
      fileName.toLowerCase().endsWith(extension)
    ) ?? null
  if (format === null || sanitizeArtifactFileName(fileName, format.kind) !== fileName) return null
  return format
}

/** @brief 保存宿主产物的请求 / Request to save a host artifact. */
export interface SaveArtifactRequest {
  /** @brief 授权路径中的不透明 Workspace ID / Opaque Workspace ID in the authorization path. */
  readonly workspaceId: string
  /** @brief 由宿主重新解析权威元数据的不透明产物 ID / Opaque artifact ID whose authoritative metadata the host resolves again. */
  readonly artifactId: string
  /** @brief 不包含目录信息且格式感知的安全建议文件名 / Format-aware safe suggested filename without directory information. */
  readonly suggestedFileName: SafeArtifactFileName
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
  /** @brief 当前宿主可保存的最大 Artifact 字节数；null 表示流式宿主无应用层上限 / Maximum Artifact bytes this host can save, or null when a streaming host has no application-level ceiling. */
  readonly maximumArtifactBytes: number | null
  /**
   * @brief 将已生成的受支持 Resume Artifact 保存到用户选择的位置 / Save a generated supported Resume Artifact to a user-selected destination.
   * @param request 只含不透明 Workspace/Artifact ID 与格式感知安全建议文件名的请求 / Request containing only opaque Workspace/Artifact IDs and a format-aware safe suggested filename.
   * @param signal 可选调用方生命周期取消信号 / Optional caller-lifecycle abort signal.
   * @return 已启动、已保存或已取消的判别结果 / Discriminated started, saved, or cancelled result.
   */
  readonly saveArtifact: (
    request: SaveArtifactRequest,
    signal?: AbortSignal
  ) => Promise<SaveArtifactResult>
}

/** @brief Electron 原生产物保存 IPC 通道 / IPC channel for native Electron artifact saving. */
export const DESKTOP_ARTIFACT_SAVE_CHANNEL = 'artifact:save' as const
