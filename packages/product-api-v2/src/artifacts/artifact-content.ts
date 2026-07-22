/** @file API v2 Artifact 受保护内容下载与 Range 响应验证 / API v2 protected Artifact download and Range-response validation. */

import { boundedInteger, opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { artifactMediaType, parseArtifact, type Artifact } from './artifact'

/** @brief HTTP token 的 RFC 9110 tchar 格式 / RFC 9110 tchar format for HTTP tokens. */
const HTTP_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/u

/** @brief 参数化 HTTP 字段的最大字符数 / Maximum character count for a parameterized HTTP field. */
const MAXIMUM_PARAMETERIZED_HEADER_LENGTH = 4096

/** @brief 可请求的 Artifact 字节闭区间 / Inclusive Artifact byte interval that can be requested. */
export interface ArtifactByteRange {
  /** @brief 起始字节偏移 / Starting byte offset. */
  readonly startByte: number
  /** @brief 可选的包含式结束偏移 / Optional inclusive ending offset. */
  readonly endByteInclusive?: number
}

/** @brief 受保护 Artifact content GET 的 transport 选项 / Transport options for a protected Artifact content GET. */
export interface AuthenticatedArtifactContentOptions {
  /** @brief 已验证的 Range header；整体下载时为 null / Validated Range header, or null for a complete download. */
  readonly range: string | null
  /** @brief 仅与 Range 一起发送的强 If-Range / Strong If-Range sent only with a Range request. */
  readonly ifRange: string | null
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 受保护 Artifact content 的最小 transport 端口 / Minimal transport port for protected Artifact content.
 * @note 实现必须只在 canonical API v2 origin 附加内存 Bearer token，使用 `credentials: omit` 并以 `redirect: error` 失败关闭 / Implementations must attach the in-memory Bearer token only at the canonical API v2 origin, use `credentials: omit`, and fail closed with `redirect: error`.
 */
export interface AuthenticatedArtifactContentClient {
  /**
   * @brief 从不含 origin 或 query 的 v2 产品路径读取二进制响应 / Read a binary response from a v2 product path without an origin or query.
   * @param path 相对 `/api/v2` 的受保护路径 / Protected path relative to `/api/v2`.
   * @param options 仅包含已验证 Range、If-Range 与取消信号 / Options containing only validated Range, If-Range, and cancellation values.
   * @return 未消费的 fetch Response / Unconsumed fetch Response.
   */
  readonly getAuthenticatedContent: (
    path: string,
    options: AuthenticatedArtifactContentOptions
  ) => Promise<Response>
}

/** @brief Artifact content 读取输入 / Input for reading Artifact content. */
export interface ArtifactContentReadRequest {
  /** @brief 先前严格解码的 Artifact metadata / Previously strictly decoded Artifact metadata. */
  readonly artifact: Artifact
  /** @brief 可选单一字节区间 / Optional single byte range. */
  readonly range?: ArtifactByteRange
  /** @brief 与 Range 配对的强内容 ETag / Strong content ETag paired with Range. */
  readonly ifRange?: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 已验证的 Content-Disposition 呈现策略 / Validated Content-Disposition presentation policy. */
export type ArtifactContentDisposition = 'attachment' | 'inline'

/** @brief Artifact content 响应的公共字段 / Fields shared by complete and partial Artifact content responses. */
export interface ArtifactContentFields {
  /** @brief 未消费的 content stream / Unconsumed content stream. */
  readonly body: ReadableStream<Uint8Array> | null
  /** @brief 本次响应 body 的预期字节数 / Expected byte count of this response body. */
  readonly expectedByteLength: number
  /** @brief content 表示的强 ETag / Strong ETag of the content representation. */
  readonly entityTag: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the service. */
  readonly requestId: string
  /** @brief 与 metadata 匹配的 media type / Media type matching the metadata. */
  readonly mediaType: string
  /** @brief 安全收敛后的展示策略 / Safely normalized presentation policy. */
  readonly disposition: ArtifactContentDisposition
  /** @brief 响应是否声明支持 byte ranges / Whether the response advertises byte-range support. */
  readonly acceptsByteRanges: boolean
}

/** @brief 已验证的部分内容区间 / Validated partial-content interval. */
export interface ArtifactContentRange {
  /** @brief 包含式起始偏移 / Inclusive starting offset. */
  readonly startByte: number
  /** @brief 包含式结束偏移 / Inclusive ending offset. */
  readonly endByteInclusive: number
  /** @brief 完整 Artifact 的字节数 / Byte count of the complete Artifact. */
  readonly completeSizeBytes: number
}

/** @brief 完整 Artifact content 响应 / Complete Artifact content response. */
export interface CompleteArtifactContent extends ArtifactContentFields {
  /** @brief 完整响应判别值 / Complete-response discriminant. */
  readonly kind: 'complete'
  /** @brief 完整响应状态 / Complete-response status. */
  readonly status: 200
  /** @brief 完整内容 SHA-256 / Complete-content SHA-256. */
  readonly completeSha256: string
}

/** @brief 部分 Artifact content 响应 / Partial Artifact content response. */
export interface PartialArtifactContent extends ArtifactContentFields {
  /** @brief 部分响应判别值 / Partial-response discriminant. */
  readonly kind: 'partial'
  /** @brief 部分响应状态 / Partial-response status. */
  readonly status: 206
  /** @brief 与请求精确匹配的 Content-Range / Content-Range exactly matching the request. */
  readonly contentRange: ArtifactContentRange
}

/** @brief 完整或部分 Artifact content 的判别联合 / Discriminated union of complete or partial Artifact content. */
export type ArtifactContent = CompleteArtifactContent | PartialArtifactContent

/** @brief 内部已验证的 Range 请求 / Internally validated Range request. */
interface ValidatedRangeRequest {
  /** @brief 发送的 Range header / Range header to send. */
  readonly header: string
  /** @brief 包含式起始偏移 / Inclusive starting offset. */
  readonly startByte: number
  /** @brief 包含式结束偏移 / Inclusive ending offset. */
  readonly endByteInclusive: number
}

/**
 * @brief 在 quoted-string 外切分分号参数 / Split semicolon parameters outside quoted strings.
 * @param value 已通过字符级安全检查的字段值 / Field value that passed character-level safety checks.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 主值与参数片段 / Primary value and parameter segments.
 */
function splitParameterizedHeader(value: string, path: string): readonly string[] {
  /** @brief 已切分片段 / Segments already split. */
  const segments: string[] = []
  /** @brief 当前片段 / Current segment. */
  let current = ''
  /** @brief 扫描器是否在 quoted-string 中 / Whether the scanner is inside a quoted string. */
  let quoted = false
  /** @brief 上一字符是否为 quoted-pair 反斜线 / Whether the previous character was a quoted-pair backslash. */
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (quoted && character === '\\') {
      current += character
      escaped = true
      continue
    }
    if (character === '"') {
      current += character
      quoted = !quoted
      continue
    }
    if (character === ';' && !quoted) {
      segments.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (quoted || escaped) {
    throw new ApiV2ContractError(`API v2 field ${path} has an unterminated quoted string.`)
  }
  segments.push(current.trim())
  return segments
}

/**
 * @brief 校验 HTTP quoted-string 参数值 / Validate an HTTP quoted-string parameter value.
 * @param value 参数原始值 / Raw parameter value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 语法合法时无返回值 / No value when syntax is valid.
 */
function validateQuotedString(value: string, path: string): void {
  if (value.length < 2 || value[0] !== '"' || value[value.length - 1] !== '"') {
    throw new ApiV2ContractError(`API v2 field ${path} contains an invalid quoted string.`)
  }
  /** @brief 内层 quoted-string 内容 / Inner quoted-string content. */
  const inner = value.slice(1, -1)
  /** @brief 上一字符是否为转义反斜线 / Whether the preceding character is an escape backslash. */
  let escaped = false
  for (const character of inner) {
    /** @brief 当前字符码 / Current character code. */
    const code = character.codePointAt(0) ?? 0
    if (escaped) {
      if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
        throw new ApiV2ContractError(`API v2 field ${path} contains an invalid quoted pair.`)
      }
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '"' || (code < 0x20 && code !== 0x09) || code === 0x7f) {
      throw new ApiV2ContractError(`API v2 field ${path} contains an invalid quoted string.`)
    }
  }
  if (escaped) {
    throw new ApiV2ContractError(`API v2 field ${path} contains an invalid quoted pair.`)
  }
}

/**
 * @brief 严格解析一个参数化 HTTP 字段 / Strictly parse one parameterized HTTP field.
 * @param value 原始字段值 / Raw field value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 主 token，保留原始大小写 / Primary token preserving its original case.
 */
function parameterizedHeader(value: string | null, path: string): string {
  if (value === null || value.length === 0 || value.length > MAXIMUM_PARAMETERIZED_HEADER_LENGTH) {
    throw new ApiV2ContractError(`API v2 field ${path} is missing or too large.`)
  }
  for (const character of value) {
    /** @brief 当前字段字符码 / Current field character code. */
    const code = character.codePointAt(0) ?? 0
    if (
      character === '\r' ||
      character === '\n' ||
      code === 0x7f ||
      (code < 0x20 && code !== 0x09)
    ) {
      throw new ApiV2ContractError(`API v2 field ${path} contains an unsafe character.`)
    }
  }
  /** @brief 主值与参数片段 / Primary value and parameter segments. */
  const [primary, ...parameters] = splitParameterizedHeader(value, path)
  if (primary === undefined || primary.length === 0) {
    throw new ApiV2ContractError(`API v2 field ${path} must start with a field value.`)
  }
  /** @brief 已观察的不区分大小写参数名 / Case-insensitive parameter names already observed. */
  const names = new Set<string>()
  for (const parameter of parameters) {
    /** @brief 当前参数的等号位置 / Equals-sign position of the current parameter. */
    const separator = parameter.indexOf('=')
    if (separator <= 0) {
      throw new ApiV2ContractError(`API v2 field ${path} contains a malformed parameter.`)
    }
    /** @brief 当前参数名 / Current parameter name. */
    const name = parameter.slice(0, separator).trim()
    /** @brief 当前参数值 / Current parameter value. */
    const parameterValue = parameter.slice(separator + 1).trim()
    /** @brief 用于去重的小写参数名 / Lowercase parameter name used for duplicate detection. */
    const normalizedName = name.toLowerCase()
    if (!HTTP_TOKEN_PATTERN.test(name) || names.has(normalizedName)) {
      throw new ApiV2ContractError(`API v2 field ${path} contains an invalid parameter name.`)
    }
    names.add(normalizedName)
    if (parameterValue.startsWith('"')) validateQuotedString(parameterValue, path)
    else if (!HTTP_TOKEN_PATTERN.test(parameterValue)) {
      throw new ApiV2ContractError(`API v2 field ${path} contains an invalid parameter value.`)
    }
  }
  return primary
}

/**
 * @brief 验证响应 Content-Type 与 Artifact metadata 一致 / Validate response Content-Type against Artifact metadata.
 * @param value 响应 Content-Type / Response Content-Type.
 * @param expected Artifact metadata media type / Artifact metadata media type.
 * @return metadata 中未改写的 media type / Unmodified media type from metadata.
 */
function matchingMediaType(value: string | null, expected: string): string {
  /** @brief 响应声明的参数前 media type / Response-declared media type before parameters. */
  const responseMediaType = artifactMediaType(
    parameterizedHeader(value, 'response.headers.Content-Type'),
    'response.headers.Content-Type'
  )
  if (responseMediaType.toLowerCase() !== expected.toLowerCase()) {
    throw new ApiV2ContractError(
      'API v2 Artifact content Content-Type differs from its authoritative metadata.'
    )
  }
  return expected
}

/**
 * @brief 解析并安全收敛 Content-Disposition / Parse and safely normalize Content-Disposition.
 * @param value 响应 Content-Disposition / Response Content-Disposition.
 * @return inline 或安全默认的 attachment / Inline or the safe attachment default.
 * @note filename 参数仅做语法验证，不向 UI 暴露为可信路径 / Filename parameters are syntax-checked but never exposed to UI as trusted paths.
 */
function contentDisposition(value: string | null): ArtifactContentDisposition {
  /** @brief 不区分大小写的 disposition type / Case-insensitive disposition type. */
  const rawDisposition = parameterizedHeader(value, 'response.headers.Content-Disposition')
  if (!HTTP_TOKEN_PATTERN.test(rawDisposition)) {
    throw new ApiV2ContractError(
      'API v2 field response.headers.Content-Disposition must start with an HTTP token.'
    )
  }
  /** @brief 小写 disposition type / Lowercase disposition type. */
  const disposition = rawDisposition.toLowerCase()
  return disposition === 'inline' ? 'inline' : 'attachment'
}

/**
 * @brief 校验可选 Content-Length 与预期 body 大小一致 / Validate an optional Content-Length against the expected body size.
 * @param value 响应 Content-Length / Response Content-Length.
 * @param expected 预期字节数 / Expected byte count.
 * @return 验证成功时无返回值 / No value when validation succeeds.
 */
function validateContentLength(value: string | null, expected: number): void {
  if (value === null) return
  if (!/^[0-9]+$/u.test(value)) {
    throw new ApiV2ContractError('API v2 Artifact content has an invalid Content-Length.')
  }
  /** @brief 十进制响应字节数 / Decimal response byte count. */
  const decoded = Number(value)
  if (!Number.isSafeInteger(decoded) || decoded !== expected) {
    throw new ApiV2ContractError(
      'API v2 Artifact content Content-Length differs from the selected representation.'
    )
  }
}

/**
 * @brief 校验单一 Artifact byte range / Validate one Artifact byte range.
 * @param value 未知 Range 输入 / Unknown Range input.
 * @param completeSizeBytes 完整 Artifact 大小 / Complete Artifact size.
 * @return 可发送且已闭合的 Range / Range ready to send with a resolved inclusive end.
 */
function artifactRange(value: ArtifactByteRange, completeSizeBytes: number): ValidatedRangeRequest {
  if (completeSizeBytes === 0) {
    throw new ApiV2ContractError('A zero-byte API v2 Artifact cannot satisfy a Range request.')
  }
  /** @brief 已验证起始偏移 / Validated starting offset. */
  const startByte = boundedInteger(
    value.startByte,
    'request.range.start_byte',
    0,
    completeSizeBytes - 1
  )
  /** @brief 调用方是否显式给出结束偏移 / Whether the caller explicitly supplied an ending offset. */
  const hasExplicitEnd = Object.hasOwn(value, 'endByteInclusive')
  /** @brief 已解析的包含式结束偏移 / Resolved inclusive ending offset. */
  const endByteInclusive = hasExplicitEnd
    ? boundedInteger(
        value.endByteInclusive,
        'request.range.end_byte_inclusive',
        startByte,
        completeSizeBytes - 1
      )
    : completeSizeBytes - 1
  return {
    endByteInclusive,
    header: hasExplicitEnd ? `bytes=${startByte}-${endByteInclusive}` : `bytes=${startByte}-`,
    startByte
  }
}

/**
 * @brief 解析并精确匹配 206 Content-Range / Parse and exactly match a 206 Content-Range.
 * @param value 响应 Content-Range / Response Content-Range.
 * @param expected 已发送的闭区间 / Closed interval that was requested.
 * @param completeSizeBytes 完整 Artifact 大小 / Complete Artifact size.
 * @return 已验证的区间 / Validated content range.
 */
function matchingContentRange(
  value: string | null,
  expected: ValidatedRangeRequest,
  completeSizeBytes: number
): ArtifactContentRange {
  /** @brief bytes Content-Range 的十进制分组 / Decimal captures of a bytes Content-Range. */
  const match = value === null ? null : /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/u.exec(value)
  if (match === null) {
    throw new ApiV2ContractError('API v2 partial Artifact content requires Content-Range.')
  }
  /** @brief Content-Range 起始偏移 / Content-Range starting offset. */
  const startByte = Number(match[1])
  /** @brief Content-Range 结束偏移 / Content-Range ending offset. */
  const endByteInclusive = Number(match[2])
  /** @brief Content-Range 完整大小 / Content-Range complete size. */
  const decodedCompleteSize = Number(match[3])
  if (
    !Number.isSafeInteger(startByte) ||
    !Number.isSafeInteger(endByteInclusive) ||
    !Number.isSafeInteger(decodedCompleteSize) ||
    startByte !== expected.startByte ||
    endByteInclusive !== expected.endByteInclusive ||
    decodedCompleteSize !== completeSizeBytes
  ) {
    throw new ApiV2ContractError(
      'API v2 Artifact Content-Range differs from the requested range or metadata size.'
    )
  }
  return { completeSizeBytes, endByteInclusive, startByte }
}

/**
 * @brief 检查响应 body 尚未消费或锁定 / Check that the response body is neither consumed nor locked.
 * @param response 待交给上层的响应 / Response whose body will be handed upward.
 * @param expectedByteLength 预期 body 大小 / Expected body size.
 * @return 尚未消费的 stream；零字节时可为 null / Unconsumed stream, or null for zero bytes.
 */
function responseBody(
  response: Response,
  expectedByteLength: number
): ReadableStream<Uint8Array> | null {
  /** @brief fetch 响应 body stream / Fetch response body stream. */
  const body = response.body
  if (response.bodyUsed || body?.locked === true || (body === null && expectedByteLength > 0)) {
    throw new ApiV2ContractError('API v2 Artifact content body is missing, consumed, or locked.')
  }
  if (body === null) return null
  /** @brief 流式观察到的字节数 / Byte count observed while streaming. */
  let receivedByteLength = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      /**
       * @brief 在透传每个 chunk 前强制 body 上限 / Enforce the body ceiling before forwarding each chunk.
       * @param chunk fetch body 字节块 / Fetch body byte chunk.
       * @param controller 下游 stream controller / Downstream stream controller.
       * @return 无返回值 / No return value.
       */
      transform(chunk, controller): void {
        receivedByteLength += chunk.byteLength
        if (receivedByteLength > expectedByteLength) {
          controller.error(
            new ApiV2ContractError(
              'API v2 Artifact content body exceeds the selected representation size.'
            )
          )
          return
        }
        controller.enqueue(chunk)
      },
      /**
       * @brief 在 EOF 验证 body 不短于预期 / Verify at EOF that the body is not shorter than expected.
       * @param controller 下游 stream controller / Downstream stream controller.
       * @return 无返回值 / No return value.
       */
      flush(controller): void {
        if (receivedByteLength !== expectedByteLength) {
          controller.error(
            new ApiV2ContractError(
              'API v2 Artifact content body is shorter than the selected representation size.'
            )
          )
        }
      }
    })
  )
}

/**
 * @brief 读取并严格验证一个完整或部分 Artifact content 响应 / Read and strictly validate one complete or partial Artifact content response.
 * @param client 只接收相对路径的 Bearer transport 端口 / Bearer transport port accepting only relative paths.
 * @param request 权威 metadata、可选 Range 与取消信号 / Authoritative metadata, optional Range, and cancellation signal.
 * @return 不暴露 URL 的已验证 stream 与表示元数据 / Validated stream and representation metadata without an exposed URL.
 * @note 206 始终保留为 partial；服务端忽略 Range 或 If-Range 不匹配时，RFC 9110 允许的 200 明确进入 complete 分支 / A 206 always remains partial; an RFC 9110-compliant 200 caused by an ignored Range or failed If-Range explicitly enters the complete branch.
 */
export async function getWorkspaceArtifactContent(
  client: AuthenticatedArtifactContentClient,
  request: ArtifactContentReadRequest
): Promise<ArtifactContent> {
  /** @brief 从调用方对象仅读取一次的 metadata / Metadata read exactly once from the caller object. */
  const artifactCandidate = request.artifact
  /** @brief 从调用方对象仅读取一次的 Range / Range read exactly once from the caller object. */
  const rangeCandidate = request.range
  /** @brief 从调用方对象仅读取一次的 If-Range / If-Range read exactly once from the caller object. */
  const ifRangeCandidate = request.ifRange
  /** @brief 从调用方对象仅读取一次的取消信号 / Signal read exactly once from the caller object. */
  const signal = request.signal
  /** @brief 重新验证以拒绝伪造 metadata 对象 / Revalidated metadata used to reject forged metadata objects. */
  const artifact = parseArtifact(artifactCandidate)
  /** @brief 可选已闭合 Range / Optional closed Range. */
  const range =
    rangeCandidate === undefined ? null : artifactRange(rangeCandidate, artifact.size_bytes)
  if (range === null && ifRangeCandidate !== undefined) {
    throw new ApiV2ContractError('API v2 If-Range is only valid together with a Range request.')
  }
  /** @brief 可选强 If-Range / Optional strong If-Range. */
  const ifRange =
    ifRangeCandidate === undefined
      ? null
      : strongEntityTag(ifRangeCandidate, 'request.headers.If-Range')
  /** @brief 只由已验证 identity 推导的相对路径 / Relative path derived only from validated identity. */
  const path = `/workspaces/${encodeURIComponent(artifact.workspace_id)}/artifacts/${encodeURIComponent(artifact.id)}/content`
  /** @brief 受保护 transport 返回的原始响应 / Raw response returned by the protected transport. */
  const response = await client.getAuthenticatedContent(path, {
    ifRange,
    range: range?.header ?? null,
    ...(signal === undefined ? {} : { signal })
  })
  if (response.redirected) {
    throw new ApiV2ContractError('API v2 Artifact content must not follow a redirect.')
  }
  if (
    (range === null && response.status !== 200) ||
    (range !== null && response.status !== 200 && response.status !== 206)
  ) {
    throw new ApiV2ContractError(
      'API v2 Artifact content returned a status inconsistent with the requested representation.',
      response.status
    )
  }
  /** @brief 与 metadata 一致的响应 media type / Response media type matching the metadata. */
  const mediaType = matchingMediaType(response.headers.get('Content-Type'), artifact.media_type)
  /** @brief 响应 content 强 ETag / Strong content ETag. */
  const entityTag = strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag')
  if (response.status === 206 && ifRange !== null && entityTag !== ifRange) {
    throw new ApiV2ContractError(
      'API v2 partial Artifact content ETag differs from the requested If-Range validator.'
    )
  }
  /** @brief 响应 request ID / Response request ID. */
  const requestId = opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id')
  /** @brief 安全收敛的内容展示策略 / Safely normalized content presentation policy. */
  const disposition = contentDisposition(response.headers.get('Content-Disposition'))
  /** @brief 服务端是否声明 byte-range 能力 / Whether the server advertises byte-range support. */
  const acceptsByteRanges =
    response.headers
      .get('Accept-Ranges')
      ?.split(',')
      .some((unit): boolean => unit.trim().toLowerCase() === 'bytes') ?? false

  if (response.status === 200) {
    if (response.headers.has('Content-Range')) {
      throw new ApiV2ContractError(
        'A complete API v2 Artifact response must not carry Content-Range.'
      )
    }
    validateContentLength(response.headers.get('Content-Length'), artifact.size_bytes)
    return {
      acceptsByteRanges,
      body: responseBody(response, artifact.size_bytes),
      completeSha256: artifact.sha256,
      disposition,
      entityTag,
      expectedByteLength: artifact.size_bytes,
      kind: 'complete',
      mediaType,
      requestId,
      status: 200
    }
  }

  if (range === null) {
    throw new ApiV2ContractError(
      'API v2 partial Artifact content requires an originating Range request.',
      response.status
    )
  }

  /** @brief 与请求区间及 metadata 完全匹配的响应区间 / Response interval exactly matching the request and metadata. */
  const contentRange = matchingContentRange(
    response.headers.get('Content-Range'),
    range,
    artifact.size_bytes
  )
  /** @brief 本次部分 body 的字节数 / Byte count of this partial body. */
  const expectedByteLength = contentRange.endByteInclusive - contentRange.startByte + 1
  validateContentLength(response.headers.get('Content-Length'), expectedByteLength)
  return {
    acceptsByteRanges,
    body: responseBody(response, expectedByteLength),
    contentRange,
    disposition,
    entityTag,
    expectedByteLength,
    kind: 'partial',
    mediaType,
    requestId,
    status: 206
  }
}
