/** @file 浏览器产品 API 的最小 HTTP 边界 / Minimal HTTP boundary for the browser product API. */

import { classifyDiagnosticError, getDiagnosticHttpStatus } from '../../observability'
import type {
  DiagnosticErrorKind,
  DiagnosticHttpMethod,
  DiagnosticHttpOperation,
  Diagnostics
} from '../../observability'

/** @brief 可注入的 HTTP client 配置 / Injectable HTTP-client configuration. */
export interface HttpClientOptions {
  /** @brief 错误回退文本使用的 BCP 47 语言 / BCP 47 language used for error fallback text. */
  readonly acceptLanguage?: string
  /** @brief 当前项目后端的公开根地址 / Public root URL of the current project backend. */
  readonly baseUrl: string
  /** @brief 统一 HTTP 边界可选使用的诊断端口 / Optional diagnostics port used by the unified HTTP boundary. */
  readonly diagnostics?: Diagnostics | undefined
  /** @brief 测试可替换的 fetch 实现 / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
  /** @brief 测试可替换的客户端请求关联 ID 生成器 / Client request-correlation-ID generator replaceable in tests. */
  readonly createRequestId?: () => string
  /** @brief 单次控制面请求的总截止时间（毫秒）/ Total deadline in milliseconds for one control-plane request. */
  readonly timeoutMilliseconds?: number
}

/** @brief 单次控制面 HTTP 请求的默认截止时间 / Default deadline for one control-plane HTTP request. */
const DEFAULT_HTTP_TIMEOUT_MS = 30_000

/** @brief GET 查询参数值 / GET query value. */
type QueryValue = boolean | number | string | null | undefined

/** @brief 当前控制面 JSON 端点使用的冻结成功状态 / Frozen success statuses used by current control-plane JSON endpoints. */
export type HttpSuccessStatus = 200 | 201 | 202

/** @brief GET JSON 选项 / GET JSON options. */
export interface GetJsonOptions {
  /** @brief 是否记录该单次请求；高频轮询应由聚合命令记录 / Whether to record this individual request; high-frequency polling should be recorded by an aggregate command. */
  readonly diagnostics?: 'record' | 'suppress'
  /** @brief 当前端点冻结的成功状态码 / Success status frozen for the current endpoint. */
  readonly expectedStatus?: HttpSuccessStatus
  /** @brief 查询参数；null/undefined 不发送 / Query values; null and undefined are omitted. */
  readonly query?: Readonly<Record<string, QueryValue>>
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief JSON command 选项 / JSON command options. */
export interface PostJsonOptions {
  /** @brief 当前端点冻结的成功状态码 / Success status frozen for the current endpoint. */
  readonly expectedStatus?: HttpSuccessStatus
  /** @brief 已冻结的幂等键 / Confirmed idempotency key. */
  readonly idempotencyKey?: string
  /** @brief 已冻结的乐观并发 ETag / Confirmed optimistic-concurrency ETag. */
  readonly ifMatch?: string
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief JSON Merge Patch 选项 / JSON Merge Patch options. */
export interface PatchJsonOptions {
  /** @brief 当前端点冻结的成功状态码 / Success status frozen for the current endpoint. */
  readonly expectedStatus?: HttpSuccessStatus
  /** @brief 修改已有资源所需的乐观并发 ETag / Optimistic-concurrency ETag required to modify an existing resource. */
  readonly ifMatch: string
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 已解析的 JSON 响应及必要元数据 / Parsed JSON response with required metadata. */
export interface HttpJsonResponse {
  /** @brief 未经信任的外部 JSON / Untrusted external JSON. */
  readonly data: unknown
  /** @brief HTTP 状态码 / HTTP status code. */
  readonly status: number
  /** @brief 响应头，只供 adapter 读取 ETag 等已确认字段 / Response headers for confirmed metadata such as ETag. */
  readonly headers: Headers
}

/** @brief 后端 ProblemDetails 错误 / Backend ProblemDetails error. */
export class HttpProblemError extends Error {
  override readonly name = 'HttpProblemError'
  readonly code: string
  readonly detail: string | null
  readonly requestId: string | null
  readonly retryable: boolean
  readonly retryAfterMs: number | null
  readonly status: number
  readonly title: string

  constructor(input: {
    readonly code: string
    readonly detail: string | null
    readonly requestId: string | null
    readonly retryable: boolean
    readonly retryAfterMs: number | null
    readonly status: number
    readonly title: string
  }) {
    super(input.title)
    this.code = input.code
    this.detail = input.detail
    this.requestId = input.requestId
    this.retryable = input.retryable
    this.retryAfterMs = input.retryAfterMs
    this.status = input.status
    this.title = input.title
  }
}

/** @brief 后端响应与已确认 HTTP 契约不匹配 / Backend response does not match the confirmed HTTP contract. */
export class HttpContractError extends Error {
  override readonly name = 'HttpContractError'
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * @brief 严格校验可用于 If-Match 的单一强实体标签 / Strictly validate one strong entity-tag usable by If-Match.
 * @param value 未经信任的 ETag 值 / Untrusted ETag value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param status 产生该值的 HTTP 状态 / HTTP status that produced the value.
 * @return 可安全原样用于 If-Match 的强实体标签 / Strong entity-tag safe to reuse verbatim in If-Match.
 * @note If-Match 使用强比较；通配符、弱标签、标签列表和控制字符均不能充当资源版本令牌。
 */
export function parseStrongEntityTag(value: unknown, path: string, status = 200): string {
  if (typeof value !== 'string' || !value.startsWith('"') || !value.endsWith('"')) {
    throw new HttpContractError(`Backend field ${path} must be one strong entity-tag.`, status)
  }
  /** @brief 引号内部的不透明标签 / Opaque tag inside the quotes. */
  const opaqueTag = value.slice(1, -1)
  for (const character of opaqueTag) {
    /** @brief 当前字符的 Unicode code point / Unicode code point of the current character. */
    const codePoint = character.codePointAt(0)
    if (
      codePoint === undefined ||
      !(
        codePoint === 0x21 ||
        (codePoint >= 0x23 && codePoint <= 0x7e) ||
        (codePoint >= 0x80 && codePoint <= 0xff)
      )
    ) {
      throw new HttpContractError(`Backend field ${path} must be one strong entity-tag.`, status)
    }
  }
  return value
}

/** @brief 写命令已发送但客户端无法确认最终结果 / Write command sent without a confirmable final outcome. */
export class HttpCommandOutcomeUnknownError extends Error {
  override readonly name = 'HttpCommandOutcomeUnknownError'
  /** @brief 导致无法确认结果的脱敏诊断类别 / Sanitized diagnostic category that made the outcome unconfirmable. */
  readonly diagnosticKind: DiagnosticErrorKind

  /**
   * @brief 构造不包含请求或响应内容的未知结果错误 / Construct an outcome-unknown error without request or response content.
   * @param diagnosticKind 原始失败的安全诊断类别 / Safe diagnostic category of the original failure.
   */
  constructor(diagnosticKind: DiagnosticErrorKind = 'timeout') {
    super('The product API command may have been processed, but its outcome is unknown.')
    this.diagnosticKind = diagnosticKind
  }
}

/**
 * @brief 将命令确认阶段错误收敛为安全的未知结果 / Narrow a command-confirmation failure to a safe outcome-unknown error.
 * @param error 无法安全向用户暴露的原始错误 / Original error unsafe to expose to users.
 * @return 保留低基数诊断类别的未知结果错误 / Outcome-unknown error retaining only a low-cardinality diagnostic kind.
 */
export function toHttpCommandOutcomeUnknownError(error: unknown): HttpCommandOutcomeUnknownError {
  return error instanceof HttpCommandOutcomeUnknownError
    ? error
    : new HttpCommandOutcomeUnknownError(classifyDiagnosticError(error))
}

/** @brief 判断未知值是否为对象 / Determine whether an unknown value is an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @brief ProblemDetails 允许的顶层字段 / Allowed top-level ProblemDetails fields. */
const PROBLEM_DETAIL_KEYS: ReadonlySet<string> = new Set([
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'code',
  'request_id',
  'retryable',
  'retry_after_ms',
  'violations',
  'extensions'
])

/** @brief LocalizedMessage 允许的字段 / Allowed LocalizedMessage fields. */
const LOCALIZED_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  'message_key',
  'fallback_message',
  'params'
])

/** @brief FieldViolation 允许的字段 / Allowed FieldViolation fields. */
const FIELD_VIOLATION_KEYS: ReadonlySet<string> = new Set([
  'pointer',
  'code',
  'message',
  'rejected_value'
])

/** @brief 稳定错误码格式 / Stable error-code format. */
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_.-]*$/u

/** @brief 扩展字段名格式 / Extension-property-name format. */
const EXTENSION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{2,127}$/u

/** @brief URI-reference 允许的 RFC 3986 字符 / RFC 3986 characters allowed in a URI-reference. */
const URI_REFERENCE_PATTERN = /^(?:[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/u

/** @brief 已验证的 ProblemDetails 最小投影 / Validated minimal ProblemDetails projection. */
export interface ParsedProblemDetails {
  /** @brief 稳定机器可读错误码 / Stable machine-readable error code. */
  readonly code: string
  /** @brief 可选诊断说明；不得直接展示 / Optional diagnostic detail that must not be displayed directly. */
  readonly detail: string | null
  /** @brief 可安全检索的请求关联编号 / Request correlation identifier safe for lookup. */
  readonly requestId: string | null
  /** @brief 服务端声明的重试语义 / Retry semantics declared by the service. */
  readonly retryable: boolean
  /** @brief 可选重试等待时间 / Optional retry delay. */
  readonly retryAfterMs: number | null
  /** @brief Problem 对应的 HTTP 状态 / HTTP status represented by the problem. */
  readonly status: number
  /** @brief 后端诊断标题；不得直接展示 / Backend diagnostic title that must not be displayed directly. */
  readonly title: string
}

/**
 * @brief 判断对象是否只含允许字段 / Determine whether an object contains only allowed fields.
 * @param value 待检查对象 / Object to inspect.
 * @param allowedKeys 允许字段集合 / Set of allowed fields.
 * @return 无额外字段时为 true / True when no extra field is present.
 */
function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowedKeys.has(key))
}

/**
 * @brief 按冻结格式校验 URI-reference / Validate a URI-reference against the frozen format.
 * @param value 待校验值 / Value to validate.
 * @return 符合 RFC 3986 URI-reference 基本语法时为 true / True for RFC 3986 URI-reference syntax.
 */
function isUriReference(value: unknown): value is string {
  if (typeof value !== 'string' || !URI_REFERENCE_PATTERN.test(value)) return false
  if (value.indexOf('#') !== value.lastIndexOf('#')) return false
  try {
    new URL(value, 'https://contract.invalid/')
    return true
  } catch {
    return false
  }
}

/**
 * @brief 校验 Extensions 扩展包 / Validate an Extensions bag.
 * @param value 待校验值 / Value to validate.
 * @return 符合扩展字段命名约束时为 true / True when extension names satisfy the contract.
 */
function isExtensions(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => EXTENSION_KEY_PATTERN.test(key))
}

/**
 * @brief 校验本地化错误消息 / Validate a localized error message.
 * @param value 待校验值 / Value to validate.
 * @return 符合 LocalizedMessage Schema 时为 true / True when the value matches LocalizedMessage.
 */
function isLocalizedMessage(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, LOCALIZED_MESSAGE_KEYS)) return false
  return (
    typeof value.message_key === 'string' &&
    ERROR_CODE_PATTERN.test(value.message_key) &&
    typeof value.fallback_message === 'string' &&
    value.fallback_message.length >= 1 &&
    value.fallback_message.length <= 2000 &&
    (value.params === undefined || isRecord(value.params))
  )
}

/**
 * @brief 校验字段违规项 / Validate a field-violation item.
 * @param value 待校验值 / Value to validate.
 * @return 符合 FieldViolation Schema 时为 true / True when the value matches FieldViolation.
 */
function isFieldViolation(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, FIELD_VIOLATION_KEYS)) return false
  return (
    typeof value.pointer === 'string' &&
    typeof value.code === 'string' &&
    ERROR_CODE_PATTERN.test(value.code) &&
    isLocalizedMessage(value.message)
  )
}

/**
 * @brief 严格解析冻结的 ProblemDetails / Strictly parse the frozen ProblemDetails schema.
 * @param value 未经信任的响应 JSON / Untrusted response JSON.
 * @param responseStatus 可选 HTTP 响应状态；顶层错误必须与之相等 / Optional HTTP response status that a top-level error must match.
 * @return 安全的错误投影，失败时为 null / Safe error projection, or null on validation failure.
 */
export function parseProblemDetails(
  value: unknown,
  responseStatus?: number
): ParsedProblemDetails | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PROBLEM_DETAIL_KEYS)) return null
  if (
    !isUriReference(value.type) ||
    typeof value.title !== 'string' ||
    value.title.length < 1 ||
    value.title.length > 512 ||
    typeof value.status !== 'number' ||
    !Number.isInteger(value.status) ||
    value.status < 400 ||
    value.status > 599 ||
    (responseStatus !== undefined && value.status !== responseStatus) ||
    typeof value.code !== 'string' ||
    !ERROR_CODE_PATTERN.test(value.code) ||
    typeof value.retryable !== 'boolean'
  ) {
    return null
  }
  if (
    value.detail !== undefined &&
    value.detail !== null &&
    (typeof value.detail !== 'string' || value.detail.length > 4000)
  ) {
    return null
  }
  if (value.instance !== undefined && value.instance !== null && !isUriReference(value.instance)) {
    return null
  }
  if (
    value.request_id !== undefined &&
    value.request_id !== null &&
    (typeof value.request_id !== 'string' ||
      value.request_id.length < 8 ||
      value.request_id.length > 128)
  ) {
    return null
  }
  if (
    value.retry_after_ms !== undefined &&
    value.retry_after_ms !== null &&
    (typeof value.retry_after_ms !== 'number' ||
      !Number.isInteger(value.retry_after_ms) ||
      value.retry_after_ms < 0)
  ) {
    return null
  }
  if (
    (value.violations !== undefined &&
      (!Array.isArray(value.violations) || !value.violations.every(isFieldViolation))) ||
    (value.extensions !== undefined && !isExtensions(value.extensions))
  ) {
    return null
  }
  return {
    code: value.code,
    detail: typeof value.detail === 'string' ? value.detail : null,
    requestId: typeof value.request_id === 'string' ? value.request_id : null,
    retryable: value.retryable,
    retryAfterMs: typeof value.retry_after_ms === 'number' ? value.retry_after_ms : null,
    status: value.status,
    title: value.title
  }
}

/** @brief HTTP JSON client / HTTP JSON client. */
export interface HttpClient {
  /** @brief 校验创建响应的 Location 指向同源权威资源 / Validate that a creation response Location identifies the same-origin authoritative resource. */
  assertResourceLocation(response: HttpJsonResponse, resourcePath: string): void
  /** @brief 读取并解析 JSON / Read and parse JSON. */
  getJson(path: string, options?: GetJsonOptions): Promise<HttpJsonResponse>
  /** @brief 发送并解析 JSON command / Send and parse a JSON command. */
  postJson(path: string, body: unknown, options?: PostJsonOptions): Promise<HttpJsonResponse>
  /** @brief 发送并解析 JSON Merge Patch / Send and parse a JSON Merge Patch. */
  patchJson(path: string, body: unknown, options: PatchJsonOptions): Promise<HttpJsonResponse>
  /** @brief 校验并解析指定 PDF 产物的同源 content URL / Validate and resolve the same-origin content URL for a specific PDF artifact. */
  resolveArtifactUrl(value: string, artifactId: string): string
}

/**
 * @brief 解析受信任的同源产品 API URL / Resolve a trusted same-origin product API URL.
 * @param value 后端返回的绝对或相对 URI / Absolute or relative URI returned by the backend.
 * @param apiBaseUrl 已验证的产品 API 根 / Validated product API base URL.
 * @return 不含凭证与 fragment 的同源产品 URL / Same-origin product URL without credentials or a fragment.
 * @throws URL 越出产品 API 边界时抛出错误 / Throws when the URL escapes the product API boundary.
 */
function resolveTrustedProductUrl(value: string, apiBaseUrl: URL): URL {
  if (value.includes('\\')) {
    throw new Error('Backend returned an untrusted product API URL.')
  }
  const url = new URL(value, apiBaseUrl)
  if (
    url.origin !== apiBaseUrl.origin ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0 ||
    !url.pathname.startsWith('/api/v1/')
  ) {
    throw new Error('Backend returned an untrusted product API URL.')
  }
  return url
}

/** @brief 解析 JSON 或 Problem Details 响应 / Parse a JSON or Problem Details response. */
async function parseJsonResponse(response: Response): Promise<HttpJsonResponse> {
  /** @brief 去除参数并统一大小写的响应媒体类型 / Response media-type essence without parameters and casing differences. */
  const mediaType =
    response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  /** @brief 是否为契约支持的 JSON 媒体类型 / Whether the response uses a contract-supported JSON media type. */
  const isJson = mediaType === 'application/json' || mediaType === 'application/problem+json'
  if (!isJson) {
    throw new HttpContractError(
      response.ok
        ? 'Backend returned a non-JSON success response.'
        : 'Backend returned an error outside the ProblemDetails contract.',
      response.status
    )
  }

  /** @brief 未经信任但语法有效的响应 JSON / Untrusted but syntactically valid response JSON. */
  let data: unknown
  try {
    data = await response.json()
  } catch (error: unknown) {
    /** @brief body 读取期间仍须保留的取消或截止错误 / Cancellation or deadline error preserved during body reading. */
    const errorKind = classifyDiagnosticError(error)
    if (errorKind === 'aborted' || errorKind === 'timeout') throw error
    throw new HttpContractError('Backend returned malformed JSON.', response.status)
  }
  if (!response.ok) {
    if (mediaType === 'application/problem+json') {
      /** @brief 严格校验后的错误投影 / Strictly validated error projection. */
      const problem = parseProblemDetails(data, response.status)
      if (problem === null) {
        throw new HttpContractError(
          'Backend returned ProblemDetails that does not match the shared contract.',
          response.status
        )
      }

      throw new HttpProblemError({
        ...problem,
        requestId: problem.requestId ?? response.headers.get('X-Request-ID')
      })
    }
    throw new HttpContractError(
      'Backend returned a JSON error outside the ProblemDetails media type.',
      response.status
    )
  }

  return { data, headers: response.headers, status: response.status }
}

/**
 * @brief 将真实相对路径映射为不含 ID 的 HTTP 操作 / Map an actual relative path to an HTTP operation without IDs.
 * @param path 产品 API 的相对路径 / Relative product-API path.
 * @param method HTTP 方法 / HTTP method.
 * @return 低基数、预注册的操作名称 / Low-cardinality registered operation name.
 */
function getDiagnosticHttpOperation(
  path: string,
  method: DiagnosticHttpMethod
): DiagnosticHttpOperation {
  const normalizedPath = `/${path.replace(/^\//u, '')}`

  if (normalizedPath === '/me') return 'workspace.me.read'
  if (normalizedPath === '/workspaces') return 'workspace.list'
  if (normalizedPath === '/interview-scenarios') return 'interview.scenario.list'
  if (/^\/interview-scenarios\/[^/]+$/u.test(normalizedPath)) {
    return 'interview.scenario.read'
  }
  if (normalizedPath === '/interview-sessions') {
    return method === 'POST' ? 'interview.session.create' : 'interview.session.list'
  }
  if (/^\/interview-sessions\/[^/]+$/u.test(normalizedPath)) {
    return 'interview.session.read'
  }
  if (/^\/interview-reports\/[^/]+$/u.test(normalizedPath)) return 'interview.report.read'
  if (normalizedPath === '/resume-templates') return 'resume.template.list'
  if (normalizedPath === '/resumes') return 'resume.document.list'
  if (normalizedPath === '/knowledge-sources') return 'knowledge.source.list'
  if (/^\/knowledge-sources\/[^/]+$/u.test(normalizedPath)) {
    return method === 'PATCH' ? 'knowledge.source.update' : 'knowledge.source.read'
  }
  if (/^\/resume-render-jobs\/[^/]+$/u.test(normalizedPath)) return 'resume.render_job.read'
  if (/^\/resumes\/[^/]+\/render-jobs$/u.test(normalizedPath)) {
    return 'resume.render_job.create'
  }
  if (/^\/resumes\/[^/]+\/operations$/u.test(normalizedPath)) return 'resume.operation.apply'
  if (/^\/resumes\/[^/]+$/u.test(normalizedPath)) return 'resume.document.read'
  return 'unknown'
}

/**
 * @brief 读取单调时钟的毫秒值 / Read a monotonic clock value in milliseconds.
 * @return 适用于网络耗时的当前毫秒值 / Current milliseconds suitable for network duration.
 */
function nowMilliseconds(): number {
  return globalThis.performance?.now() ?? Date.now()
}

/**
 * @brief 计算非负、整毫秒时长 / Calculate a non-negative integer millisecond duration.
 * @param startedAt 起始单调毫秒值 / Starting monotonic millisecond value.
 * @return 非负整毫秒时长 / Non-negative integer millisecond duration.
 */
function durationMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(nowMilliseconds() - startedAt))
}

/**
 * @brief 安全生成请求关联 ID / Safely create a request correlation ID.
 * @param factory 可替换的关联 ID 工厂 / Replaceable correlation-ID factory.
 * @return 格式受限的 ID；工厂不可用时为固定安全值 / Format-constrained ID, or a fixed safe value when the factory is unavailable.
 * @note 返回 `unavailable` 时不发送 header；其生成失败绝不能阻断业务请求。 / The header is omitted when `unavailable` is returned; generation failure must never block a business request.
 */
function createSafeRequestId(factory: () => string): string {
  try {
    const value = factory()
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value)
      ? value
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/**
 * @brief 组装所有产品 API 请求共用的已确认请求头 / Assemble confirmed headers shared by every product-API request.
 * @param requestId 已校验的请求关联 ID / Validated request correlation ID.
 * @param acceptLanguage 可选 BCP 47 语言 / Optional BCP 47 language.
 * @return 不含认证信息的共用请求头 / Shared headers without authentication material.
 */
function createCommonHeaders(
  requestId: string,
  acceptLanguage: string | undefined
): Record<string, string> {
  /** @brief 共享契约允许的公共请求头 / Public request headers allowed by the shared contract. */
  const headers: Record<string, string> = {}
  if (requestId !== 'unavailable') headers['X-Request-Id'] = requestId
  if (
    acceptLanguage !== undefined &&
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(acceptLanguage)
  ) {
    headers['Accept-Language'] = acceptLanguage
  }
  return headers
}

/**
 * @brief 安全发射 HTTP 诊断事件 / Safely emit an HTTP diagnostics event.
 * @param emit 需要执行的发射回调 / Emission callback to execute.
 * @return 无返回值 / No return value.
 * @note 即使替换的 Diagnostics 违反端口约定而抛错，也绝不改变业务请求结果。
 */
function emitSafely(emit: () => void): void {
  try {
    emit()
  } catch {
    // A diagnostics implementation must not influence the product HTTP boundary.
  }
}

/** @brief 统一执行 HTTP JSON 请求的参数 / Parameters for one unified HTTP JSON request. */
interface ExecuteJsonRequestOptions {
  /** @brief 已解析的绝对请求地址 / Resolved absolute request URL. */
  readonly requestUrl: URL
  /** @brief 不含动态 ID 的原始相对路径 / Original relative path without dynamic IDs in diagnostics. */
  readonly path: string
  /** @brief HTTP 方法 / HTTP method. */
  readonly method: DiagnosticHttpMethod
  /** @brief 已组装的 fetch 初始化参数 / Assembled fetch initialization parameters. */
  readonly init: RequestInit
  /** @brief 请求关联 ID / Request correlation ID. */
  readonly requestId: string
  /** @brief 网络实现 / Network implementation. */
  readonly fetchImpl: typeof fetch
  /** @brief 可选诊断端口 / Optional diagnostics port. */
  readonly diagnostics?: Diagnostics | undefined
  /** @brief 当前单次请求的诊断策略 / Diagnostics policy for the individual request. */
  readonly diagnosticsPolicy: 'record' | 'suppress'
  /** @brief 当前端点冻结的成功状态 / Success status frozen for the endpoint. */
  readonly expectedStatus: HttpSuccessStatus
  /** @brief 单次请求截止时间 / Deadline for this request. */
  readonly timeoutMilliseconds: number
}

/** @brief 可在请求完成后释放的截止时间信号 / Deadline signal disposable after request completion. */
interface RequestDeadline {
  /** @brief 同时传播调用方取消与本地超时的信号 / Signal propagating caller cancellation and the local timeout. */
  readonly signal: AbortSignal
  /** @brief 释放 timer 与调用方监听器 / Release the timer and caller listener. */
  readonly dispose: () => void
}

/**
 * @brief 合并调用方取消与本地请求截止时间 / Combine caller cancellation with a local request deadline.
 * @param callerSignal 调用方可选取消信号 / Optional caller cancellation signal.
 * @param timeoutMilliseconds 截止时间毫秒数 / Deadline in milliseconds.
 * @return 请求信号及其清理动作 / Request signal and its cleanup action.
 * @note 超时使用 TimeoutError，页面导航等调用方取消保留原始 AbortError 语义。 / A deadline uses TimeoutError while caller cancellation preserves its AbortError semantics.
 */
function createRequestDeadline(
  callerSignal: AbortSignal | null | undefined,
  timeoutMilliseconds: number
): RequestDeadline {
  /** @brief 当前请求的组合取消控制器 / Combined abort controller for this request. */
  const controller = new AbortController()
  /** @brief 将调用方取消原因透传到组合信号 / Forward caller cancellation to the combined signal. */
  const forwardCallerAbort = (): void => controller.abort(callerSignal?.reason)

  if (callerSignal?.aborted === true) forwardCallerAbort()
  else callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true })

  /** @brief 请求截止 timer / Request-deadline timer. */
  const timeout = setTimeout((): void => {
    controller.abort(
      new DOMException('The product API request exceeded its deadline.', 'TimeoutError')
    )
  }, timeoutMilliseconds)

  return {
    dispose(): void {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', forwardCallerAbort)
    },
    signal: controller.signal
  }
}

/**
 * @brief 执行请求、解析 JSON 并记录已脱敏结果 / Execute a request, parse JSON, and record a sanitized outcome.
 * @param options 已解析请求的参数 / Parameters for the resolved request.
 * @return 已解析 JSON 响应 / Parsed JSON response.
 * @throws 保留原有网络、Problem Details 或契约异常 / Preserves the original network, Problem Details, or contract error.
 */
async function executeJsonRequest(options: ExecuteJsonRequestOptions): Promise<HttpJsonResponse> {
  /** @brief 请求开始时的单调时间 / Monotonic time at request start. */
  const startedAt = nowMilliseconds()
  /** @brief 不包含 query/body 的安全操作名称 / Safe operation name without query or body. */
  const operation = getDiagnosticHttpOperation(options.path, options.method)
  /** @brief 解析前可获知的响应状态 / Response status available before parsing, if any. */
  let responseStatus: number | null = null
  /** @brief 当前请求是否应生成独立 HTTP 事件 / Whether this request should generate an individual HTTP event. */
  const shouldRecord = options.diagnosticsPolicy === 'record'
  /** @brief 当前请求的组合截止信号 / Combined deadline signal for this request. */
  const deadline = createRequestDeadline(options.init.signal, options.timeoutMilliseconds)

  try {
    const response = await options.fetchImpl(options.requestUrl.toString(), {
      ...options.init,
      credentials: 'omit',
      redirect: 'error',
      signal: deadline.signal
    })
    responseStatus = response.status
    if (response.ok && response.status !== options.expectedStatus) {
      throw new HttpContractError(
        `Backend returned an unexpected success status; expected ${options.expectedStatus}.`,
        response.status
      )
    }
    const parsed = await parseJsonResponse(response)
    if (shouldRecord)
      emitSafely(() => {
        options.diagnostics?.emit('http.request_completed', {
          duration_ms: durationMilliseconds(startedAt),
          method: options.method,
          operation,
          request_id: options.requestId,
          status: parsed.status
        })
      })
    return parsed
  } catch (error: unknown) {
    const errorKind = classifyDiagnosticError(error)
    if (shouldRecord)
      emitSafely(() => {
        if (errorKind === 'aborted') {
          options.diagnostics?.emit('http.request_cancelled', {
            duration_ms: durationMilliseconds(startedAt),
            method: options.method,
            operation,
            request_id: options.requestId
          })
          return
        }
        options.diagnostics?.emit('http.request_failed', {
          duration_ms: durationMilliseconds(startedAt),
          error_kind: errorKind,
          method: options.method,
          operation,
          request_id: options.requestId,
          status: responseStatus ?? getDiagnosticHttpStatus(error)
        })
      })
    /** @brief 当前请求是否为可能已经产生副作用的命令 / Whether this request is a command that may already have produced a side effect. */
    const isCommand = options.method === 'POST' || options.method === 'PATCH'
    /** @brief 未收到响应、无法验证的成功响应或任意 5xx 都不能证明命令未提交 / A missing response, unverifiable success, or any 5xx cannot prove that a command was not committed. */
    const commandOutcomeIsUnknown =
      isCommand &&
      (responseStatus === null ||
        (responseStatus >= 200 && responseStatus < 300) ||
        responseStatus >= 500)
    if (commandOutcomeIsUnknown) {
      throw toHttpCommandOutcomeUnknownError(error)
    }
    throw error
  } finally {
    deadline.dispose()
  }
}

/**
 * @brief 创建产品 HTTP client / Create a product HTTP client.
 * @param options 已验证 API origin、网络实现与诊断依赖 / Validated API origin, network implementation, and diagnostics dependency.
 * @return 所有业务 HTTP 请求都会经过的最小 client / Minimal client through which all product HTTP requests pass.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  /** @brief 已规范化且包含产品 API 前缀的地址 / Normalized URL containing the product API prefix. */
  const apiBaseUrl = new URL('/api/v1/', options.baseUrl)
  /** @brief 测试可替换的网络实现 / Network implementation replaceable in tests. */
  const fetchImpl = options.fetchImpl ?? fetch
  /** @brief 测试可替换的客户端请求 ID 生成器 / Client request-ID generator replaceable in tests. */
  const createRequestId = options.createRequestId ?? (() => globalThis.crypto.randomUUID())
  /** @brief 后端错误回退文本的语言 / Language requested for backend error fallback text. */
  const acceptLanguage = options.acceptLanguage
  /** @brief 当前 client 统一使用的可选诊断端口 / Optional diagnostics port uniformly used by this client. */
  const diagnostics = options.diagnostics
  /** @brief 每个请求统一使用的截止时间 / Deadline uniformly applied to every request. */
  const timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_HTTP_TIMEOUT_MS
  if (
    !Number.isFinite(timeoutMilliseconds) ||
    !Number.isInteger(timeoutMilliseconds) ||
    timeoutMilliseconds <= 0
  ) {
    throw new Error('HTTP request timeout must be a positive integer.')
  }

  return {
    assertResourceLocation(response, resourcePath): void {
      /** @brief 服务端声明的新资源地址 / New-resource address declared by the backend. */
      const location = response.headers.get('Location')
      if (location === null) {
        throw new HttpContractError(
          'Backend creation response is missing Location.',
          response.status
        )
      }
      try {
        /** @brief 实际 Location 的可信产品 URL / Trusted product URL from the actual Location. */
        const actual = resolveTrustedProductUrl(location, apiBaseUrl)
        /** @brief 根据请求资源构造的预期 URL / Expected URL constructed from the requested resource. */
        const expected = new URL(resourcePath.replace(/^\//u, ''), apiBaseUrl)
        if (actual.toString() !== expected.toString()) {
          throw new HttpContractError(
            'Backend creation response Location does not identify the created resource.',
            response.status
          )
        }
      } catch (error: unknown) {
        if (error instanceof HttpContractError) throw error
        throw new HttpContractError(
          'Backend creation response contains an invalid Location.',
          response.status
        )
      }
    },

    resolveArtifactUrl(value, artifactId): string {
      try {
        /** @brief Schema 要求的绝对 artifact URI / Absolute artifact URI required by the schema. */
        new URL(value)
        /** @brief 通过同源产品边界后的 artifact URL / Artifact URL after the same-origin product boundary. */
        const url = resolveTrustedProductUrl(value, apiBaseUrl)
        /** @brief 当前 artifact 唯一允许的 content 路径 / Only allowed content path for the current artifact. */
        const expectedPath = `/api/v1/render-artifacts/${encodeURIComponent(artifactId)}/content`
        if (url.pathname !== expectedPath) {
          throw new HttpContractError(
            'Backend artifact URL identifies a different product resource.',
            200
          )
        }
        return url.toString()
      } catch (error: unknown) {
        if (error instanceof HttpContractError) throw error
        throw new HttpContractError('Backend returned an untrusted product artifact URL.', 200)
      }
    },

    async getJson(path, requestOptions = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeRequestId(createRequestId)

      for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
        if (value !== null && value !== undefined) {
          requestUrl.searchParams.set(key, String(value))
        }
      }

      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: requestOptions.diagnostics ?? 'record',
        expectedStatus: requestOptions.expectedStatus ?? 200,
        fetchImpl,
        init: {
          headers: createCommonHeaders(requestId, acceptLanguage),
          method: 'GET',
          ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal })
        },
        method: 'GET',
        path,
        requestId,
        requestUrl,
        timeoutMilliseconds
      })
    },

    async postJson(path, body, requestOptions = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeRequestId(createRequestId)
      const headers: Record<string, string> = {
        ...createCommonHeaders(requestId, acceptLanguage),
        'Content-Type': 'application/json'
      }
      if (requestOptions.idempotencyKey !== undefined) {
        headers['Idempotency-Key'] = requestOptions.idempotencyKey
      }
      if (requestOptions.ifMatch !== undefined) {
        headers['If-Match'] = parseStrongEntityTag(
          requestOptions.ifMatch,
          'request.headers.If-Match',
          0
        )
      }
      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: 'record',
        expectedStatus: requestOptions.expectedStatus ?? 200,
        fetchImpl,
        init: {
          body: JSON.stringify(body),
          headers,
          method: 'POST',
          ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal })
        },
        method: 'POST',
        path,
        requestId,
        requestUrl,
        timeoutMilliseconds
      })
    },

    async patchJson(path, body, requestOptions): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeRequestId(createRequestId)
      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: 'record',
        expectedStatus: requestOptions.expectedStatus ?? 200,
        fetchImpl,
        init: {
          body: JSON.stringify(body),
          headers: {
            ...createCommonHeaders(requestId, acceptLanguage),
            'Content-Type': 'application/merge-patch+json',
            'If-Match': parseStrongEntityTag(requestOptions.ifMatch, 'request.headers.If-Match', 0)
          },
          method: 'PATCH',
          ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal })
        },
        method: 'PATCH',
        path,
        requestId,
        requestUrl,
        timeoutMilliseconds
      })
    }
  }
}
