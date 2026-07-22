/** @file 跨宿主 PDF 产物边界策略 / Cross-host PDF artifact boundary policy. */

import { isOpaqueResourceId, parseRfc3339TimestampMilliseconds } from './contract-formats'
import { MAX_PDF_ARTIFACT_BYTES } from './artifact-save'
import { parseRenderArtifactMetadata } from './render-artifact'
import type { RenderArtifactMetadata } from './render-artifact'

/** @brief JSON 元数据媒体类型 / JSON metadata media type. */
export const ARTIFACT_JSON_MEDIA_TYPE = 'application/json'

/** @brief PDF 内容媒体类型 / PDF content media type. */
export const ARTIFACT_PDF_MEDIA_TYPE = 'application/pdf'

/** @brief 过期前拒绝启动下载的共享安全窗口 / Shared safety window before expiry in which downloads are rejected. */
export const ARTIFACT_EXPIRY_SAFETY_WINDOW_MS = 30_000

/** @brief Chromium Fetch 可解码且产品明确允许的压缩编码 / Compressed codings decoded by Chromium Fetch and explicitly allowed by product policy. */
const FETCH_DECODED_CONTENT_ENCODINGS = new Set(['br', 'deflate', 'gzip', 'zstd'])

/** @brief Fetch 解码后的内容编码语义 / Content-encoding semantics after Fetch decoding. */
export type FetchDecodedContentEncodingKind = 'identity' | 'compressed' | 'invalid'

/** @brief PDF 产物策略违反 / PDF artifact policy violation. */
export class PdfArtifactPolicyError extends Error {
  override readonly name = 'PdfArtifactPolicyError'
}

/** @brief PDF 元数据解码选项 / PDF metadata decoding options. */
export interface PdfArtifactMetadataOptions {
  /** @brief 当前操作的权威产物 ID / Authoritative artifact ID for the current operation. */
  readonly artifactId: string
  /** @brief 已由宿主配置的产品 API origin / Product API origin configured by the host. */
  readonly apiOrigin: string
  /** @brief 当前 Unix epoch 毫秒 / Current Unix epoch milliseconds. */
  readonly nowMilliseconds: number
  /** @brief 可选的过期安全窗口 / Optional expiry safety window. */
  readonly expirySafetyWindowMilliseconds?: number
}

/** @brief 已验证的 PDF 元数据与内容 URL / Validated PDF metadata and content URL. */
export interface ValidatedPdfArtifactMetadata {
  /** @brief 严格解码的冻结契约元数据 / Strictly decoded frozen-contract metadata. */
  readonly metadata: RenderArtifactMetadata
  /** @brief 同 origin 且仍绑定当前产物的内容 URL / Same-origin content URL still bound to the current artifact. */
  readonly contentUrl: URL
}

/**
 * @brief 返回去除参数并规范化大小写的媒体类型 essence / Return a parameter-free, lowercase media-type essence.
 * @param value 未受信任的 Content-Type 值 / Untrusted Content-Type value.
 * @return 小写 essence；缺失或为空时返回 null / Lowercase essence, or null when missing or empty.
 */
export function getMediaTypeEssence(value: string | null): string | null {
  if (value === null) return null
  /** @brief 分号前的媒体类型主体 / Media-type token before parameters. */
  const essence = value.split(';', 1)[0]?.trim().toLowerCase()
  return essence === undefined || essence.length === 0 ? null : essence
}

/**
 * @brief 严格校验产品 API origin / Strictly validate the product API origin.
 * @param value 宿主提供但在当前边界仍重新校验的值 / Host-provided value revalidated at the current boundary.
 * @return 不含路径、凭证、query 或 fragment 的 HTTP(S) URL / HTTP(S) URL without path, credentials, query, or fragment.
 * @throws PdfArtifactPolicyError 候选值不是纯 origin 时抛出 / Thrown when the candidate is not a plain origin.
 */
export function parseArtifactApiOrigin(value: string): URL {
  try {
    /** @brief 待验证的 URL / URL under validation. */
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new PdfArtifactPolicyError('The product API base URL must be a plain HTTP(S) origin.')
    }
    return url
  } catch (error: unknown) {
    if (error instanceof PdfArtifactPolicyError) throw error
    throw new PdfArtifactPolicyError('The product API base URL is invalid.')
  }
}

/**
 * @brief 构造权威产物元数据 URL / Construct the authoritative artifact-metadata URL.
 * @param artifactId 当前产物 ID / Current artifact ID.
 * @param apiOrigin 产品 API origin / Product API origin.
 * @return 不含上层可控 URL 成分的元数据 URL / Metadata URL without upper-layer-controlled URL components.
 * @throws PdfArtifactPolicyError ID 或 origin 不合法时抛出 / Thrown when the ID or origin is invalid.
 */
export function createArtifactMetadataUrl(artifactId: string, apiOrigin: string): URL {
  if (!isOpaqueResourceId(artifactId)) {
    throw new PdfArtifactPolicyError('Artifact ID must match the frozen opaque-ID format.')
  }
  /** @brief 当前边界重新校验的 API origin / API origin revalidated at the current boundary. */
  const origin = parseArtifactApiOrigin(apiOrigin)
  return new URL(`/api/v1/render-artifacts/${encodeURIComponent(artifactId)}`, origin)
}

/**
 * @brief 验证产物内容 URL 仍位于产品 API 且绑定同一 ID / Verify an artifact-content URL remains in the product API and bound to the same ID.
 * @param candidate 待验证绝对 URL / Absolute URL candidate to validate.
 * @param apiOrigin 产品 API origin / Product API origin.
 * @param artifactId 当前产物 ID / Current artifact ID.
 * @return 保留安全 query 的规范化 URL / Normalized URL preserving a safe query.
 * @throws PdfArtifactPolicyError 协议、origin、身份或路径越界时抛出 / Thrown when protocol, origin, identity, or path crosses the boundary.
 */
export function validateArtifactContentUrl(
  candidate: string,
  apiOrigin: string,
  artifactId: string
): URL {
  if (candidate.includes('\\')) {
    throw new PdfArtifactPolicyError('Artifact URL must not contain ambiguous path separators.')
  }
  if (!isOpaqueResourceId(artifactId)) {
    throw new PdfArtifactPolicyError('Artifact ID must match the frozen opaque-ID format.')
  }

  try {
    /** @brief 当前边界重新校验的 API origin / API origin revalidated at the current boundary. */
    const expectedOrigin = parseArtifactApiOrigin(apiOrigin).origin
    /** @brief 待验证的下载 URL / Download URL under validation. */
    const url = new URL(candidate)
    /** @brief 当前产物唯一允许的内容路径 / Only allowed content path for the current artifact. */
    const expectedPath = `/api/v1/render-artifacts/${encodeURIComponent(artifactId)}/content`

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new PdfArtifactPolicyError('Artifact URL must be an HTTP(S) URL without credentials.')
    }
    if (url.origin !== expectedOrigin) {
      throw new PdfArtifactPolicyError('Artifact URL must use the configured product API origin.')
    }
    if (url.pathname !== expectedPath || url.hash.length > 0) {
      throw new PdfArtifactPolicyError(
        'Artifact URL must identify the expected artifact content resource.'
      )
    }
    return url
  } catch (error: unknown) {
    if (error instanceof PdfArtifactPolicyError) throw error
    throw new PdfArtifactPolicyError('Artifact URL is invalid.')
  }
}

/**
 * @brief 严格解码并校验当前 PDF 产物元数据 / Strictly decode and validate current PDF artifact metadata.
 * @param value 未经信任的 API JSON / Untrusted API JSON.
 * @param options 当前身份、origin 与时间策略 / Current identity, origin, and time policy.
 * @return 已绑定同一产物的 PDF 元数据与内容 URL / PDF metadata and content URL bound to the same artifact.
 * @throws Error 冻结 Schema 或 PDF 宿主策略不满足时抛出 / Thrown when the frozen schema or PDF host policy is violated.
 */
export function parsePdfArtifactMetadata(
  value: unknown,
  options: PdfArtifactMetadataOptions
): ValidatedPdfArtifactMetadata {
  if (!Number.isFinite(options.nowMilliseconds)) {
    throw new PdfArtifactPolicyError('Artifact policy time must be finite.')
  }
  /** @brief 本次下载的过期安全窗口 / Expiry safety window for this download. */
  const safetyWindow = options.expirySafetyWindowMilliseconds ?? ARTIFACT_EXPIRY_SAFETY_WINDOW_MS
  if (!Number.isFinite(safetyWindow) || safetyWindow < 0) {
    throw new PdfArtifactPolicyError('Artifact expiry safety window must be non-negative.')
  }

  /** @brief 通过冻结 RenderArtifact Schema 的元数据 / Metadata decoded through the frozen RenderArtifact schema. */
  const metadata = parseRenderArtifactMetadata(value)
  if (metadata.id !== options.artifactId) {
    throw new PdfArtifactPolicyError('Artifact metadata identifies a different artifact.')
  }
  if (metadata.format !== 'pdf') {
    throw new PdfArtifactPolicyError('Artifact metadata does not describe a PDF.')
  }
  if (getMediaTypeEssence(metadata.content_type) !== ARTIFACT_PDF_MEDIA_TYPE) {
    throw new PdfArtifactPolicyError('PDF artifact metadata must declare application/pdf.')
  }
  if (metadata.size_bytes > MAX_PDF_ARTIFACT_BYTES) {
    throw new PdfArtifactPolicyError('PDF artifact exceeds the 25 MiB size limit.')
  }
  if (metadata.expires_at !== undefined && metadata.expires_at !== null) {
    /** @brief 包括 RFC 3339 闰秒语义的过期时刻 / Expiry instant including RFC 3339 leap-second semantics. */
    const expiresAt = parseRfc3339TimestampMilliseconds(metadata.expires_at)
    if (expiresAt === null || expiresAt <= options.nowMilliseconds + safetyWindow) {
      throw new PdfArtifactPolicyError('Artifact download URL is expired or too close to expiry.')
    }
  }

  return {
    contentUrl: validateArtifactContentUrl(
      metadata.download_url,
      options.apiOrigin,
      options.artifactId
    ),
    metadata
  }
}

/**
 * @brief 分类由 Fetch 解码后暴露给应用的内容编码 / Classify content encoding exposed after Fetch decoding.
 * @param value 原始 Content-Encoding header / Raw Content-Encoding header.
 * @return identity、已支持的压缩编码或 invalid / Identity, supported compression, or invalid.
 * @note 压缩响应的 Content-Length 属于传输表示，不得用来校验 Fetch 解码后的字节 / Content-Length on a compressed response describes the transfer representation and must not validate Fetch-decoded bytes.
 */
export function classifyFetchDecodedContentEncoding(
  value: string | null
): FetchDecodedContentEncodingKind {
  if (value === null) return 'identity'
  /** @brief 按应用顺序声明的编码 token / Encoding tokens declared in application order. */
  const codings = value.split(',').map((coding): string => coding.trim().toLowerCase())
  if (codings.some((coding) => coding.length === 0)) return 'invalid'
  if (codings.length === 1 && codings[0] === 'identity') return 'identity'
  if (codings.includes('identity')) return 'invalid'
  return codings.every((coding) => FETCH_DECODED_CONTENT_ENCODINGS.has(coding))
    ? 'compressed'
    : 'invalid'
}

/**
 * @brief 严格解码可选的非负 Content-Length / Strictly decode an optional non-negative Content-Length.
 * @param value 未受信任的 header 值 / Untrusted header value.
 * @return 缺失时为 null，否则为安全整数 / Null when absent, otherwise a safe integer.
 * @throws PdfArtifactPolicyError header 不是十进制安全整数时抛出 / Thrown when the header is not a decimal safe integer.
 */
export function parseArtifactContentLength(value: string | null): number | null {
  if (value === null) return null
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PdfArtifactPolicyError('Artifact response Content-Length is invalid.')
  }
  /** @brief 经过十进制形状校验的长度 / Length after decimal-shape validation. */
  const length = Number(value)
  if (!Number.isSafeInteger(length)) {
    throw new PdfArtifactPolicyError('Artifact response Content-Length is outside the safe range.')
  }
  return length
}
