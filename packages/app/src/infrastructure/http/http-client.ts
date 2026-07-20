/** @file 浏览器产品 API 的最小 HTTP 边界 / Minimal HTTP boundary for the browser product API. */

import { classifyDiagnosticError, getDiagnosticHttpStatus } from '../../observability'
import type {
  DiagnosticHttpMethod,
  DiagnosticHttpOperation,
  Diagnostics
} from '../../observability'

/** @brief 可注入的 HTTP client 配置 / Injectable HTTP-client configuration. */
export interface HttpClientOptions {
  /** @brief 当前项目后端的公开根地址 / Public root URL of the current project backend. */
  readonly baseUrl: string
  /** @brief 统一 HTTP 边界可选使用的诊断端口 / Optional diagnostics port used by the unified HTTP boundary. */
  readonly diagnostics?: Diagnostics | undefined
  /** @brief 测试可替换的 fetch 实现 / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
  /** @brief 测试可替换的客户端请求关联 ID 生成器 / Client request-correlation-ID generator replaceable in tests. */
  readonly createRequestId?: () => string
}

/** @brief GET 查询参数值 / GET query value. */
type QueryValue = boolean | number | string | null | undefined

/** @brief GET JSON 选项 / GET JSON options. */
export interface GetJsonOptions {
  /** @brief 是否记录该单次请求；高频轮询应由聚合命令记录 / Whether to record this individual request; high-frequency polling should be recorded by an aggregate command. */
  readonly diagnostics?: 'record' | 'suppress'
  /** @brief 查询参数；null/undefined 不发送 / Query values; null and undefined are omitted. */
  readonly query?: Readonly<Record<string, QueryValue>>
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief JSON command 选项 / JSON command options. */
export interface PostJsonOptions {
  /** @brief 已冻结的幂等键 / Confirmed idempotency key. */
  readonly idempotencyKey?: string
  /** @brief 已冻结的乐观并发 ETag / Confirmed optimistic-concurrency ETag. */
  readonly ifMatch?: string
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief multipart command 选项 / Multipart command options. */
export interface PostFormOptions {
  /** @brief 当前用户动作的幂等键 / Idempotency key for the current user action. */
  readonly idempotencyKey: string
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
  readonly status: number
  readonly title: string

  constructor(input: {
    readonly code: string
    readonly detail: string | null
    readonly requestId: string | null
    readonly status: number
    readonly title: string
  }) {
    super(input.title)
    this.code = input.code
    this.detail = input.detail
    this.requestId = input.requestId
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

/** @brief 判断未知值是否为对象 / Determine whether an unknown value is an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @brief HTTP JSON client / HTTP JSON client. */
export interface HttpClient {
  /** @brief 读取并解析 JSON / Read and parse JSON. */
  getJson(path: string, options?: GetJsonOptions): Promise<HttpJsonResponse>
  /** @brief 发送并解析 JSON command / Send and parse a JSON command. */
  postJson(path: string, body: unknown, options?: PostJsonOptions): Promise<HttpJsonResponse>
  /** @brief 发送并解析 multipart command / Send and parse a multipart command. */
  postForm(path: string, body: FormData, options: PostFormOptions): Promise<HttpJsonResponse>
  /** @brief 校验并解析同源产品 API URL / Validate and resolve a same-origin product API URL. */
  resolveProductUrl(value: string): string
}

/** @brief 解析 JSON 或 Problem Details 响应 / Parse a JSON or Problem Details response. */
async function parseJsonResponse(response: Response): Promise<HttpJsonResponse> {
  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  const isJson =
    contentType.includes('application/json') || contentType.includes('application/problem+json')
  if (!isJson) {
    if (response.ok) {
      throw new HttpContractError('Backend returned a non-JSON success response.', response.status)
    }
    throw new Error(`Backend request failed with status ${response.status}.`)
  }

  const data: unknown = await response.json()
  if (!response.ok) {
    if (
      contentType.includes('application/problem+json') &&
      isRecord(data) &&
      typeof data.code === 'string' &&
      typeof data.status === 'number' &&
      typeof data.title === 'string'
    ) {
      throw new HttpProblemError({
        code: data.code,
        detail: typeof data.detail === 'string' ? data.detail : null,
        requestId:
          typeof data.request_id === 'string'
            ? data.request_id
            : response.headers.get('X-Request-ID'),
        status: data.status,
        title: data.title
      })
    }
    throw new Error(`Backend request failed with status ${response.status}.`)
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

  if (normalizedPath === '/resume-templates') return 'resume.template.list'
  if (normalizedPath === '/resumes') return 'resume.document.list'
  if (normalizedPath === '/knowledge-sources') return 'knowledge.source.list'
  if (normalizedPath === '/knowledge-searches') return 'knowledge.search.create'
  if (normalizedPath === '/knowledge-sources/uploads') return 'knowledge.source.upload'
  if (/^\/knowledge-ingestion-jobs\/[^/]+$/u.test(normalizedPath)) {
    return 'knowledge.ingestion_job.read'
  }
  if (/^\/knowledge-sources\/[^/]+\/versions$/u.test(normalizedPath)) {
    return 'knowledge.source.version_upload'
  }
  if (/^\/knowledge-sources\/[^/]+$/u.test(normalizedPath)) return 'knowledge.source.read'
  if (/^\/resume-proposals\/[^/]+\/decisions$/u.test(normalizedPath)) {
    return 'resume.proposal.decision'
  }
  if (/^\/resume-render-jobs\/[^/]+$/u.test(normalizedPath)) return 'resume.render_job.read'
  if (/^\/resumes\/[^/]+\/proposals$/u.test(normalizedPath)) {
    return method === 'GET' ? 'resume.proposal.list' : 'resume.proposal.create'
  }
  if (/^\/resumes\/[^/]+\/render-jobs$/u.test(normalizedPath)) {
    return 'resume.render_job.create'
  }
  if (/^\/resumes\/[^/]+\/render-artifacts$/u.test(normalizedPath)) {
    return 'resume.artifact.list'
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
 * @brief 安全生成仅供诊断使用的请求关联 ID / Safely create a request correlation ID used only for diagnostics.
 * @param factory 可替换的关联 ID 工厂 / Replaceable correlation-ID factory.
 * @return 格式受限的 ID；工厂不可用时为固定安全值 / Format-constrained ID, or a fixed safe value when the factory is unavailable.
 * @note 关联 ID 不再写入产品 HTTP header；其生成失败绝不能阻断业务请求。
 */
function createSafeDiagnosticRequestId(factory: () => string): string {
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

  try {
    const response = await options.fetchImpl(options.requestUrl.toString(), options.init)
    responseStatus = response.status
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
    throw error
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
  /** @brief 当前 client 统一使用的可选诊断端口 / Optional diagnostics port uniformly used by this client. */
  const diagnostics = options.diagnostics

  return {
    resolveProductUrl(value): string {
      const url = new URL(value, apiBaseUrl)
      if (url.origin !== apiBaseUrl.origin || !url.pathname.startsWith('/api/v1/')) {
        throw new Error('Backend returned an untrusted product artifact URL.')
      }
      return url.toString()
    },

    async getJson(path, requestOptions = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeDiagnosticRequestId(createRequestId)

      for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
        if (value !== null && value !== undefined) {
          requestUrl.searchParams.set(key, String(value))
        }
      }

      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: requestOptions.diagnostics ?? 'record',
        fetchImpl,
        init: {
          method: 'GET',
          ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal })
        },
        method: 'GET',
        path,
        requestId,
        requestUrl
      })
    },

    async postJson(path, body, requestOptions = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeDiagnosticRequestId(createRequestId)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (requestOptions.idempotencyKey !== undefined) {
        headers['Idempotency-Key'] = requestOptions.idempotencyKey
      }
      if (requestOptions.ifMatch !== undefined) {
        headers['If-Match'] = requestOptions.ifMatch
      }
      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: 'record',
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
        requestUrl
      })
    },

    async postForm(path, body, requestOptions): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      /** @brief 当前请求的客户端关联 ID / Client correlation ID for the current request. */
      const requestId = createSafeDiagnosticRequestId(createRequestId)
      return executeJsonRequest({
        diagnostics,
        diagnosticsPolicy: 'record',
        fetchImpl,
        init: {
          body,
          headers: { 'Idempotency-Key': requestOptions.idempotencyKey },
          method: 'POST',
          ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal })
        },
        method: 'POST',
        path,
        requestId,
        requestUrl
      })
    }
  }
}
