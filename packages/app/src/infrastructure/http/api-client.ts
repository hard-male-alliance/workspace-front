/**
 * @file 后端 API HTTP 客户端 / Backend API HTTP client.
 */

/** @brief 后端 API 固定版本路径 / Fixed backend API version path. */
const API_PATH = '/api/v1'

/** @brief RFC 9457 风格的问题详情 / RFC 9457-style problem details. */
export interface ApiProblemDetails {
  /** @brief 稳定错误码 / Stable error code. */
  readonly code?: string
  /** @brief 用户可读标题 / Human-readable title. */
  readonly title?: string
  /** @brief 错误详情 / Error detail. */
  readonly detail?: string
  /** @brief 是否可重试 / Whether the request is retryable. */
  readonly retryable?: boolean
}

/** @brief API 请求选项 / API request options. */
export interface ApiRequestOptions {
  /** @brief HTTP 方法 / HTTP method. */
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** @brief 查询参数 / Query parameters. */
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>
  /** @brief JSON 请求体 / JSON request body. */
  readonly body?: unknown
  /** @brief 附加请求头 / Additional request headers. */
  readonly headers?: Readonly<Record<string, string>>
  /** @brief 取消信号 / Cancellation signal. */
  readonly signal?: AbortSignal | undefined
}

/** @brief 带响应元数据的 API 结果 / API result with response metadata. */
export interface ApiResponse<TValue> {
  /** @brief 反序列化响应体 / Deserialized response body. */
  readonly data: TValue
  /** @brief 原始响应头 / Raw response headers. */
  readonly headers: Headers
}

/** @brief 非成功 API 响应 / Unsuccessful API response. */
export class ApiError extends Error {
  /** @brief HTTP 状态码 / HTTP status code. */
  readonly status: number
  /** @brief 结构化问题详情 / Structured problem details. */
  readonly problem: ApiProblemDetails | null

  /**
   * @brief 构造 API 错误 / Construct an API error.
   * @param status HTTP 状态码 / HTTP status code.
   * @param problem 后端问题详情 / Backend problem details.
   */
  constructor(status: number, problem: ApiProblemDetails | null) {
    super(problem?.detail ?? problem?.title ?? `API request failed with status ${status}.`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

/**
 * @brief 规范化公开 API origin / Normalize the public API origin.
 * @param baseUrl 可配置服务地址 / Configurable service URL.
 * @return 不含路径、查询与尾斜杠的 origin / Origin without path, query, or trailing slash.
 * @throws {TypeError} 地址不是有效 HTTP(S) origin 时抛出 / Thrown for a non-HTTP(S) origin.
 */
export function normalizeApiBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new TypeError('API base URL must be an HTTP(S) origin without credentials.')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('API base URL must not contain a path, query, or fragment.')
  }
  return url.origin
}

/** @brief 统一的版本化后端客户端 / Unified versioned backend client. */
export class ApiClient {
  /** @brief 完整 API 根路径 / Complete API root. */
  readonly apiRoot: string

  /**
   * @brief 构造 API 客户端 / Construct an API client.
   * @param baseUrl 后端公开 origin / Public backend origin.
   */
  constructor(baseUrl: string) {
    this.apiRoot = `${normalizeApiBaseUrl(baseUrl)}${API_PATH}`
  }

  /**
   * @brief 发送 JSON API 请求 / Send a JSON API request.
   * @template TValue 响应体类型 / Response body type.
   * @param path 以斜杠开头的资源路径 / Resource path beginning with a slash.
   * @param options 请求选项 / Request options.
   * @return 响应体及响应头 / Response body and headers.
   */
  async request<TValue>(
    path: `/${string}`,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<TValue>> {
    const url = new URL(`${this.apiRoot}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }

    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const request: RequestInit = {
      method: options.method ?? 'GET',
      headers
    }
    if (options.body !== undefined) {
      request.body = JSON.stringify(options.body)
    }
    if (options.signal !== undefined) {
      request.signal = options.signal
    }
    const response = await fetch(url, request)
    if (!response.ok) {
      throw new ApiError(response.status, await readProblemDetails(response))
    }
    return { data: (await response.json()) as TValue, headers: response.headers }
  }
}

/**
 * @brief 尝试读取后端问题详情 / Try to read backend problem details.
 * @param response 非成功响应 / Unsuccessful response.
 * @return 可用的问题详情，否则为空 / Problem details when available, otherwise null.
 */
async function readProblemDetails(response: Response): Promise<ApiProblemDetails | null> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('json')) {
    return null
  }
  try {
    return (await response.json()) as ApiProblemDetails
  } catch {
    return null
  }
}
