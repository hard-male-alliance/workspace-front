/** @file API v2 Workspace Artifact metadata 与单项读取 / API v2 Workspace Artifact metadata and single-resource read. */

import type { ApiV2Client } from '../http/client'
import {
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  networkUrl,
  opaqueId,
  parseResourceFields,
  stringValue,
  strongEntityTag,
  timestamp,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { API_V2_CONTROLLED_TEST_ORIGIN, API_V2_PRODUCTION_ORIGIN } from '../origin'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'

/** @brief 单个 Artifact metadata JSON 的解码前字节上限 / Pre-decoding byte ceiling for one Artifact metadata JSON response. */
const ARTIFACT_MAX_RESPONSE_BYTES = 512 * 1024

/** @brief Artifact media_type 的冻结格式 / Frozen Artifact media_type format. */
const MEDIA_TYPE_PATTERN = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u

/** @brief Artifact SHA-256 小写十六进制格式 / Lowercase hexadecimal Artifact SHA-256 format. */
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

/** @brief Artifact 种类 / Artifact kind. */
export type ArtifactKind =
  | 'generic'
  | 'interview_audio'
  | 'interview_transcript'
  | 'interview_video'
  | 'resume_docx'
  | 'resume_json'
  | 'resume_pdf'

/** @brief API v2 Workspace Artifact metadata / API v2 Workspace Artifact metadata. */
export interface Artifact extends ResourceFields {
  /** @brief 显式授权的 Workspace ID / Explicitly authorized Workspace ID. */
  readonly workspace_id: string
  /** @brief Artifact 种类 / Artifact kind. */
  readonly kind: ArtifactKind
  /** @brief Artifact 所属的领域资源 / Domain resource owning the Artifact. */
  readonly subject: ResourceReference
  /** @brief 规范 media type，不含参数 / Canonical media type without parameters. */
  readonly media_type: string
  /** @brief 完整内容大小 / Complete content size. */
  readonly size_bytes: number
  /** @brief 完整内容 SHA-256 / Complete-content SHA-256. */
  readonly sha256: string
  /** @brief 需要 Bearer 认证的规范内容 URL / Canonical content URL requiring Bearer authentication. */
  readonly content_url: string
  /** @brief 可选页数 / Optional page count. */
  readonly page_count: number | null
  /** @brief 可选过期时间 / Optional expiration time. */
  readonly expires_at: string | null
}

/** @brief Artifact metadata 单项读取输入 / Input for reading one Artifact metadata resource. */
export interface ArtifactReadRequest {
  /** @brief 授权路径中的 Workspace ID / Workspace ID in the authorization path. */
  readonly workspaceId: string
  /** @brief 要读取的不透明 Artifact ID / Opaque Artifact ID to read. */
  readonly artifactId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带 HTTP 表示元数据的权威 Artifact metadata / Authoritative Artifact metadata carrying HTTP representation metadata. */
export interface ArtifactRepresentation {
  /** @brief 严格解码的 Artifact metadata / Strictly decoded Artifact metadata. */
  readonly value: Artifact
  /** @brief metadata 表示的强 ETag，不等同于 content ETag / Strong metadata ETag, distinct from the content ETag. */
  readonly entityTag: string
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/**
 * @brief 校验封闭 Artifact 种类 / Validate a closed Artifact kind.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Artifact 种类 / Validated Artifact kind.
 */
export function artifactKind(value: unknown, path: string): ArtifactKind {
  /** @brief canonical Artifact 种类 / Canonical Artifact kinds. */
  const allowed: readonly ArtifactKind[] = [
    'resume_pdf',
    'resume_json',
    'resume_docx',
    'interview_audio',
    'interview_video',
    'interview_transcript',
    'generic'
  ]
  return closedStringEnum(value, path, allowed)
}

/**
 * @brief 校验不含参数的 media type / Validate a parameter-free media type.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 media type / Validated media type.
 */
export function artifactMediaType(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  if (!MEDIA_TYPE_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a media type without parameters.`)
  }
  return decoded
}

/**
 * @brief 校验小写 SHA-256 摘要 / Validate a lowercase SHA-256 digest.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证摘要 / Validated digest.
 */
function sha256(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 64, 64)
  if (!SHA256_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a lowercase SHA-256 digest.`)
  }
  return decoded
}

/**
 * @brief 校验 content_url 精确指向当前 Workspace Artifact content / Validate content_url points exactly to the current Workspace Artifact content.
 * @param value 未知 URL / Unknown URL.
 * @param workspaceId Artifact Workspace ID / Artifact Workspace ID.
 * @param artifactId Artifact ID / Artifact ID.
 * @return 未改写的规范 URL / Unmodified canonical URL.
 * @note 当前 Schema 未提供跨域签名下载描述符，因此消费者必须失败关闭任意 HTTPS URL / The current Schema has no cross-origin signed-download descriptor, so the consumer must fail closed on arbitrary HTTPS URLs.
 */
function canonicalArtifactContentUrl(
  value: unknown,
  workspaceId: string,
  artifactId: string
): string {
  /** @brief Schema 级别已验证 NetworkUrl / Schema-level validated NetworkUrl. */
  const decoded = networkUrl(value, 'artifact.content_url')
  /** @brief 从 Artifact identity 推导的规范路径 / Canonical path derived from Artifact identity. */
  const expectedPath = `/api/v2/workspaces/${workspaceId}/artifacts/${artifactId}/content`
  /** @brief 生产环境规范 URL / Canonical production URL. */
  const productionUrl = `${API_V2_PRODUCTION_ORIGIN}${expectedPath}`
  /** @brief 受控测试环境规范 URL / Canonical controlled-test URL. */
  const controlledTestUrl = `${API_V2_CONTROLLED_TEST_ORIGIN}${expectedPath}`
  if (decoded !== productionUrl && decoded !== controlledTestUrl) {
    throw new ApiV2ContractError(
      'API v2 Artifact content_url must identify the current Artifact on a canonical API origin.'
    )
  }
  return decoded
}

/**
 * @brief 严格解码 canonical Artifact metadata / Strictly decode canonical Artifact metadata.
 * @param value 未知 Artifact / Unknown Artifact.
 * @return 已验证 Artifact metadata / Validated Artifact metadata.
 */
export function parseArtifact(value: unknown): Artifact {
  /** @brief 精确 Artifact 对象 / Exact Artifact object. */
  const input = exactRecord(value, 'artifact', [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'kind',
    'subject',
    'media_type',
    'size_bytes',
    'sha256',
    'content_url',
    'page_count',
    'expires_at'
  ])
  /** @brief 持久资源公共字段 / Common persistent-resource fields. */
  const resource = parseResourceFields(input, 'artifact')
  /** @brief Artifact Workspace ID / Artifact Workspace ID. */
  const workspaceId = opaqueId(input.workspace_id, 'artifact.workspace_id')
  return {
    ...resource,
    content_url: canonicalArtifactContentUrl(input.content_url, workspaceId, resource.id),
    expires_at:
      input.expires_at === null ? null : timestamp(input.expires_at, 'artifact.expires_at'),
    kind: artifactKind(input.kind, 'artifact.kind'),
    media_type: artifactMediaType(input.media_type, 'artifact.media_type'),
    page_count:
      input.page_count === null
        ? null
        : boundedInteger(input.page_count, 'artifact.page_count', 1, Number.MAX_SAFE_INTEGER),
    sha256: sha256(input.sha256, 'artifact.sha256'),
    size_bytes: boundedInteger(input.size_bytes, 'artifact.size_bytes', 0, 1_073_741_824),
    subject: parseResourceReference(input.subject, 'artifact.subject'),
    workspace_id: workspaceId
  }
}

/**
 * @brief 读取 Workspace 下的一个权威 Artifact metadata / Read one authoritative Artifact metadata resource in a Workspace.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Artifact identity 与取消信号 / Explicit Workspace and Artifact identities plus cancellation signal.
 * @return 同一 200 响应中的 metadata、强 ETag 与 request ID / Metadata, strong ETag, and request ID from the same 200 response.
 */
export async function getWorkspaceArtifact(
  client: ApiV2Client,
  request: ArtifactReadRequest
): Promise<ArtifactRepresentation> {
  /** @brief 仅读取一次的 Workspace ID 候选值 / Workspace-ID candidate read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 仅读取一次的 Artifact ID 候选值 / Artifact-ID candidate read exactly once. */
  const artifactIdCandidate = request.artifactId
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 Artifact ID / Validated Artifact ID. */
  const artifactId = opaqueId(artifactIdCandidate, 'request.artifact_id')
  /** @brief Workspace-scoped Artifact metadata 路径 / Workspace-scoped Artifact metadata path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/artifacts/${encodeURIComponent(artifactId)}`
  /** @brief transport 严格验证的 200 JSON 响应 / 200 JSON response strictly validated by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: ARTIFACT_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已验证权威 Artifact metadata / Validated authoritative Artifact metadata. */
  const value = parseArtifact(response.data)
  if (value.workspace_id !== workspaceId || value.id !== artifactId) {
    throw new ApiV2ContractError(
      'API v2 returned Artifact metadata whose Workspace or identity differs from the request path.'
    )
  }
  /** @brief metadata 表示的强 ETag / Strong ETag for the metadata representation. */
  const entityTag = strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag')
  /** @brief 同一响应中的 request ID / Request ID from the same response. */
  const requestId = opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id')
  return { entityTag, requestId, value }
}
