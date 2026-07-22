/** @file 冻结 RenderArtifact 元数据契约的独立解码器 / Dependency-free decoder for the frozen RenderArtifact metadata contract. */

import { isAbsoluteUri, isRfc3339Timestamp } from './contract-formats'

/** @brief 冻结契约允许的 RenderArtifact 格式 / RenderArtifact formats allowed by the frozen contract. */
export type RenderArtifactFormat =
  'pdf' | 'png' | 'html_snapshot' | 'docx' | 'source_map' | 'accessibility_tree'

/** @brief 严格解码后的 RenderArtifact 元数据 / Strictly decoded RenderArtifact metadata. */
export interface RenderArtifactMetadata {
  /** @brief 不透明产物 ID / Opaque artifact ID. */
  readonly id: string
  /** @brief 创建时间 / Creation timestamp. */
  readonly created_at: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updated_at: string
  /** @brief 资源 revision / Resource revision. */
  readonly revision: number
  /** @brief 所属简历 ID / Owning resume ID. */
  readonly resume_id: string
  /** @brief 所属简历 revision / Owning resume revision. */
  readonly resume_revision: number
  /** @brief 产物格式 / Artifact format. */
  readonly format: RenderArtifactFormat
  /** @brief 服务端声明的内容类型 / Server-declared content type. */
  readonly content_type: string
  /** @brief 产物字节数 / Artifact byte count. */
  readonly size_bytes: number
  /** @brief 规范化为小写的 SHA-256 摘要 / SHA-256 digest normalized to lowercase. */
  readonly sha256: string
  /** @brief 绝对下载 URI / Absolute download URI. */
  readonly download_url: string
  /** @brief 可选下载过期时间 / Optional download expiry timestamp. */
  readonly expires_at?: string | null
  /** @brief 可选页数 / Optional page count. */
  readonly page_count?: number | null
  /** @brief 可选 source-map 产物 ID / Optional source-map artifact ID. */
  readonly source_map_artifact_id?: string | null
  /** @brief 可选 namespaced 扩展袋 / Optional namespaced extension bag. */
  readonly extensions?: Readonly<Record<string, unknown>>
}

/** @brief RenderArtifact 允许的精确顶层字段 / Exact top-level keys allowed on RenderArtifact. */
const RENDER_ARTIFACT_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'revision',
  'resume_id',
  'resume_revision',
  'format',
  'content_type',
  'size_bytes',
  'sha256',
  'download_url',
  'expires_at',
  'page_count',
  'source_map_artifact_id',
  'extensions'
])

/** @brief 冻结契约的不透明 ID 格式 / Opaque-ID format from the frozen contract. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u

/** @brief 冻结契约的 SHA-256 格式 / SHA-256 format from the frozen contract. */
const SHA_256_PATTERN = /^[a-fA-F0-9]{64}$/u

/** @brief Extensions 属性名格式 / Extensions property-name format. */
const EXTENSION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{2,127}$/u

/** @brief 冻结契约允许的格式集合 / Format set allowed by the frozen contract. */
const RENDER_ARTIFACT_FORMATS = new Set<RenderArtifactFormat>([
  'pdf',
  'png',
  'html_snapshot',
  'docx',
  'source_map',
  'accessibility_tree'
])

/**
 * @brief 以稳定字段路径报告契约错误 / Report a contract error with a stable field path.
 * @param path 失败字段路径 / Failing field path.
 * @param expectation 预期约束 / Expected constraint.
 * @return 永不正常返回 / Never returns normally.
 */
function contractError(path: string, expectation: string): never {
  throw new Error(`RenderArtifact field ${path} ${expectation}.`)
}

/**
 * @brief 解码普通对象 / Decode a plain object.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @return 可安全按字段读取的对象 / Object safe for field reads.
 */
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return contractError(path, 'must be an object')
  }
  return value as Record<string, unknown>
}

/**
 * @brief 解码字符串 / Decode a string.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @return 已验证字符串 / Validated string.
 */
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') return contractError(path, 'must be a string')
  return value
}

/**
 * @brief 解码安全整数下界 / Decode a safe integer with a lower bound.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @param minimum 最小允许值 / Minimum allowed value.
 * @return 已验证安全整数 / Validated safe integer.
 */
function integerAtLeast(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return contractError(path, `must be a safe integer greater than or equal to ${minimum}`)
  }
  return value as number
}

/**
 * @brief 解码冻结格式的不透明 ID / Decode a frozen-format opaque ID.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @return 已验证 ID / Validated ID.
 */
function opaqueId(value: unknown, path: string): string {
  /** @brief 待验证字符串 / String under validation. */
  const decoded = string(value, path)
  if (!OPAQUE_ID_PATTERN.test(decoded)) return contractError(path, 'must be an opaque ID')
  return decoded
}

/**
 * @brief 解码 RFC 3339 时间戳 / Decode an RFC 3339 timestamp.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @return 已验证时间戳 / Validated timestamp.
 */
function timestamp(value: unknown, path: string): string {
  /** @brief 待验证字符串 / String under validation. */
  const decoded = string(value, path)
  if (!isRfc3339Timestamp(decoded)) {
    return contractError(path, 'must be an RFC 3339 timestamp')
  }
  return decoded
}

/**
 * @brief 解码绝对 URI / Decode an absolute URI.
 * @param value 未知值 / Unknown value.
 * @param path 字段路径 / Field path.
 * @return 已验证 URI / Validated URI.
 */
function absoluteUri(value: unknown, path: string): string {
  /** @brief 待验证字符串 / String under validation. */
  const decoded = string(value, path)
  if (!isAbsoluteUri(decoded)) return contractError(path, 'must be an absolute URI')
  return decoded
}

/**
 * @brief 解码可选 nullable 字段 / Decode an optional nullable field.
 * @param input 父对象 / Parent object.
 * @param key 字段名 / Field name.
 * @param decode 非空值解码器 / Non-null value decoder.
 * @return 缺失时为 undefined，显式 null 时为 null，否则为解码值 / Undefined when absent, null when explicit, otherwise the decoded value.
 */
function optionalNullable<TValue>(
  input: Record<string, unknown>,
  key: string,
  decode: (value: unknown, path: string) => TValue
): TValue | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return undefined
  if (input[key] === null) return null
  return decode(input[key], key)
}

/**
 * @brief 解码 namespaced extensions / Decode namespaced extensions.
 * @param value 未知值 / Unknown value.
 * @return 已验证扩展袋 / Validated extension bag.
 */
function extensions(value: unknown): Readonly<Record<string, unknown>> {
  /** @brief 扩展对象 / Extension object. */
  const decoded = record(value, 'extensions')
  if (!Object.keys(decoded).every((key) => EXTENSION_KEY_PATTERN.test(key))) {
    return contractError('extensions', 'contains an invalid extension key')
  }
  return decoded
}

/**
 * @brief 严格解码冻结的 RenderArtifact 元数据 / Strictly decode frozen RenderArtifact metadata.
 * @param value 未知 JSON 值 / Unknown JSON value.
 * @return 精确字段、强类型且已验证的元数据 / Exact-field, strongly typed, validated metadata.
 * @throws Error 当字段缺失、越界或出现契约外字段时抛出 / Thrown for missing, invalid, or contract-extraneous fields.
 */
export function parseRenderArtifactMetadata(value: unknown): RenderArtifactMetadata {
  /** @brief 待解码顶层对象 / Top-level object under decoding. */
  const input = record(value, 'artifact')
  /** @brief 首个契约外字段 / First field outside the frozen contract. */
  const unexpectedKey = Object.keys(input).find((key) => !RENDER_ARTIFACT_KEYS.has(key))
  if (unexpectedKey !== undefined) {
    return contractError(unexpectedKey, 'is not allowed')
  }

  /** @brief 产物格式字符串 / Artifact format string. */
  const format = string(input.format, 'format')
  if (!RENDER_ARTIFACT_FORMATS.has(format as RenderArtifactFormat)) {
    return contractError('format', 'is not supported by the frozen contract')
  }

  /** @brief 内容类型字符串 / Content-type string. */
  const contentType = string(input.content_type, 'content_type')
  /** @brief JSON Schema 字符长度 / Character count under JSON Schema semantics. */
  const contentTypeLength = [...contentType].length
  if (contentTypeLength < 1 || contentTypeLength > 200) {
    return contractError('content_type', 'must contain between 1 and 200 characters')
  }

  /** @brief SHA-256 字符串 / SHA-256 string. */
  const digest = string(input.sha256, 'sha256')
  if (!SHA_256_PATTERN.test(digest)) return contractError('sha256', 'must be a SHA-256 digest')

  /** @brief 可选过期时间 / Optional expiry timestamp. */
  const expiresAt = optionalNullable(input, 'expires_at', timestamp)
  /** @brief 可选页数 / Optional page count. */
  const pageCount = optionalNullable(input, 'page_count', (item, path): number =>
    integerAtLeast(item, path, 1)
  )
  /** @brief 可选 source-map ID / Optional source-map ID. */
  const sourceMapArtifactId = optionalNullable(input, 'source_map_artifact_id', opaqueId)

  return {
    id: opaqueId(input.id, 'id'),
    created_at: timestamp(input.created_at, 'created_at'),
    updated_at: timestamp(input.updated_at, 'updated_at'),
    revision: integerAtLeast(input.revision, 'revision', 1),
    resume_id: opaqueId(input.resume_id, 'resume_id'),
    resume_revision: integerAtLeast(input.resume_revision, 'resume_revision', 1),
    format: format as RenderArtifactFormat,
    content_type: contentType,
    size_bytes: integerAtLeast(input.size_bytes, 'size_bytes', 0),
    sha256: digest.toLowerCase(),
    download_url: absoluteUri(input.download_url, 'download_url'),
    ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
    ...(pageCount === undefined ? {} : { page_count: pageCount }),
    ...(sourceMapArtifactId === undefined ? {} : { source_map_artifact_id: sourceMapArtifactId }),
    ...(Object.prototype.hasOwnProperty.call(input, 'extensions')
      ? { extensions: extensions(input.extensions) }
      : {})
  }
}
