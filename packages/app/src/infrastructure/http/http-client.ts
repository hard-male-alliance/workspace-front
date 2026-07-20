/** @file 浏览器产品 API 的最小 HTTP 边界 / Minimal HTTP boundary for the browser product API. */

/** @brief 可注入的 HTTP client 配置 / Injectable HTTP-client configuration. */
export interface HttpClientOptions {
  /** @brief 当前项目后端的公开根地址 / Public root URL of the current project backend. */
  readonly baseUrl: string
  /** @brief 测试可替换的 fetch 实现 / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
}

/** @brief GET 查询参数值 / GET query value. */
type QueryValue = boolean | number | string | null | undefined

/** @brief GET JSON 选项 / GET JSON options. */
export interface GetJsonOptions {
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

/** @brief 创建产品 HTTP client / Create a product HTTP client. */
export function createHttpClient({ baseUrl, fetchImpl = fetch }: HttpClientOptions): HttpClient {
  /** @brief 已规范化且包含产品 API 前缀的地址 / Normalized URL containing the product API prefix. */
  const apiBaseUrl = new URL('/api/v1/', baseUrl)

  return {
    resolveProductUrl(value): string {
      const url = new URL(value, apiBaseUrl)
      if (url.origin !== apiBaseUrl.origin || !url.pathname.startsWith('/api/v1/')) {
        throw new Error('Backend returned an untrusted product artifact URL.')
      }
      return url.toString()
    },

    async getJson(path, options = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)

      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== null && value !== undefined) {
          requestUrl.searchParams.set(key, String(value))
        }
      }

      const response = await fetchImpl(requestUrl.toString(), {
        method: 'GET',
        ...(options.signal === undefined ? {} : { signal: options.signal })
      })

      return parseJsonResponse(response)
    },

    async postJson(path, body, options = {}): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (options.idempotencyKey !== undefined) {
        headers['Idempotency-Key'] = options.idempotencyKey
      }
      if (options.ifMatch !== undefined) {
        headers['If-Match'] = options.ifMatch
      }
      const response = await fetchImpl(requestUrl.toString(), {
        body: JSON.stringify(body),
        headers,
        method: 'POST',
        ...(options.signal === undefined ? {} : { signal: options.signal })
      })
      return parseJsonResponse(response)
    },

    async postForm(path, body, options): Promise<HttpJsonResponse> {
      const requestUrl = new URL(path.replace(/^\//u, ''), apiBaseUrl)
      const response = await fetchImpl(requestUrl.toString(), {
        body,
        headers: { 'Idempotency-Key': options.idempotencyKey },
        method: 'POST',
        ...(options.signal === undefined ? {} : { signal: options.signal })
      })
      return parseJsonResponse(response)
    }
  }
}
