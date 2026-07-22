/** @file 带内存 Bearer 凭证的 API v2 只读 HTTP 边界 / API v2 read-only HTTP boundary with in-memory Bearer credentials. */

import { locale, opaqueId } from './contract'
import { ApiV2AuthenticationRequiredError, ApiV2ContractError, ApiV2NetworkError } from './errors'
import { parseProblemDetails } from './problem'
import { ApiV2ProblemError } from './problem-error'

/** @brief OAuth Bearer b64token 语法 / OAuth Bearer b64token syntax. */
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9\-._~+/]+=*$/u

/** @brief v2 401 challenge 固定的 Protected Resource Metadata / Frozen Protected Resource Metadata used by v2 401 challenges. */
const PROTECTED_RESOURCE_METADATA =
  'https://api.hmalliances.org:8022/.well-known/oauth-protected-resource'

/** @brief API v2 固定生产 Origin / Frozen API v2 production origin. */
const PRODUCTION_API_ORIGIN = 'https://api.hmalliances.org:8022'

/** @brief API v2 受控测试直连 Origin / Controlled API v2 direct-test origin. */
const CONTROLLED_TEST_API_ORIGIN = 'http://dev.hmalliances.org:9000'

/** @brief 默认控制面 GET 截止时间 / Default deadline for control-plane GET requests. */
const DEFAULT_TIMEOUT_MILLISECONDS = 30_000

/** @brief 默认 JSON 响应硬上限 / Default hard limit for JSON responses. */
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024

/** @brief 单个 JSON 响应允许配置的绝对上限 / Absolute configurable ceiling for one JSON response. */
const ABSOLUTE_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief GET query 支持的标量 / Scalars supported in GET queries. */
export type ApiV2QueryValue = boolean | number | string | null | undefined

/** @brief API v2 GET 选项 / API v2 GET options. */
export interface ApiV2GetOptions {
  /** @brief 当前端点冻结的成功状态 / Success status frozen for the endpoint. */
  readonly expectedStatus?: number
  /** @brief 查询参数；null/undefined 不发送 / Query parameters; null and undefined are omitted. */
  readonly query?: Readonly<Record<string, ApiV2QueryValue>>
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
  /** @brief 当前端点解码前的响应字节上限 / Response byte limit before decoding for this endpoint. */
  readonly maxResponseBytes?: number
}

/** @brief 已解析 API v2 JSON 响应 / Parsed API v2 JSON response. */
export interface ApiV2JsonResponse {
  /** @brief 未经领域 decoder 信任的 JSON / JSON not yet trusted by a domain decoder. */
  readonly data: unknown
  /** @brief 已验证响应头 / Validated response headers. */
  readonly headers: Headers
  /** @brief HTTP 状态 / HTTP status. */
  readonly status: number
}

/** @brief API v2 transport profile / API v2 transport profile. */
export type ApiV2TransportProfile =
  | { readonly kind: 'production' }
  | {
      readonly kind: 'controlled-test'
      readonly apiOrigin: 'http://dev.hmalliances.org:9000'
    }

/** @brief API v2 只读产品客户端 / Read-only API v2 product client. */
export interface ApiV2Client {
  /**
   * @brief 读取一个 JSON 产品资源 / Read one JSON product resource.
   * @param path 相对 `/api/v2` 的绝对风格路径 / Absolute-style path relative to `/api/v2`.
   * @param options 查询、状态、字节上限和取消选项 / Query, status, byte-limit, and cancellation options.
   * @return 未经领域映射的响应 / Response before domain mapping.
   */
  readonly getJson: (path: string, options?: ApiV2GetOptions) => Promise<ApiV2JsonResponse>
}

/** @brief API v2 HTTP 客户端配置 / API v2 HTTP-client options. */
export interface ApiV2ClientOptions {
  /** @brief 默认固定生产；测试直连必须显式选择 / Frozen production by default; direct test transport must be explicit. */
  readonly transportProfile?: ApiV2TransportProfile
  /** @brief 当前界面 Locale / Current UI locale. */
  readonly acceptLanguage?: string | undefined
  /** @brief 只从当前内存会话读取 Access Token / Read the access token only from the current in-memory session. */
  readonly getAccessToken: () => string | null
  /** @brief 测试可替换的 fetch / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
  /** @brief 测试可替换的请求 ID 工厂 / Request-ID factory replaceable in tests. */
  readonly createRequestId?: () => string
  /** @brief 每次 GET 的总截止时间 / Total deadline for each GET. */
  readonly timeoutMilliseconds?: number
  /** @brief 测试可替换的当前时间 / Current time replaceable in tests. */
  readonly now?: () => number
}

/** @brief 单次请求的组合取消生命周期 / Combined cancellation lifecycle for one request. */
interface RequestDeadline {
  /** @brief 同时传播调用方取消和本地截止的信号 / Signal propagating caller cancellation and local deadline. */
  readonly signal: AbortSignal
  /** @brief 是否由本地截止触发 / Whether the local deadline fired. */
  readonly timedOut: () => boolean
  /** @brief 清理 timer 和 listener / Dispose the timer and listener. */
  readonly dispose: () => void
}

/**
 * @brief 规范化并验证单一 API origin / Normalize and validate one API origin.
 * @param profile 显式 transport profile / Explicit transport profile.
 * @return 以 `/api/v2/` 结尾的产品基址 / Product base URL ending in `/api/v2/`.
 */
function resolveApiBaseUrl(profile: ApiV2TransportProfile | undefined): URL {
  if (profile === undefined || profile.kind === 'production') {
    return new URL('/api/v2/', PRODUCTION_API_ORIGIN)
  }
  if (profile.kind === 'controlled-test' && profile.apiOrigin === CONTROLLED_TEST_API_ORIGIN) {
    return new URL('/api/v2/', CONTROLLED_TEST_API_ORIGIN)
  }
  throw new ApiV2ContractError(
    'API v2 controlled-test transport must use the frozen direct-test origin.'
  )
}

/**
 * @brief 读取并校验当前内存 Access Token / Read and validate the current in-memory access token.
 * @param readToken 内存会话读取器 / In-memory session reader.
 * @return 可安全放入 Authorization header 的 token / Token safe for the Authorization header.
 */
function readBearerToken(readToken: () => string | null): string {
  /** @brief 当前内存 token / Current in-memory token. */
  let token: string | null
  try {
    token = readToken()
  } catch {
    throw new ApiV2ContractError('The in-memory access-token source failed.')
  }
  if (token === null) throw new ApiV2AuthenticationRequiredError()
  if (token.length < 20 || token.length > 8192 || !BEARER_TOKEN_PATTERN.test(token)) {
    throw new ApiV2ContractError('The in-memory access token violates the OAuth Bearer syntax.')
  }
  return token
}

/**
 * @brief 将相对产品 path 限制在 `/api/v2/` 内 / Confine a relative product path beneath `/api/v2/`.
 * @param path Gateway 提供的产品路径 / Product path supplied by a gateway.
 * @param apiBaseUrl 已验证 v2 基址 / Validated v2 base URL.
 * @return 不可逃逸 v2 前缀的 URL / URL unable to escape the v2 prefix.
 */
function resolveRequestUrl(path: string, apiBaseUrl: URL): URL {
  if (
    !/^\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/u.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new ApiV2ContractError(
      'API v2 request paths must be unencoded, query-free relative product paths.'
    )
  }
  /** @brief 解析后的产品 URL / Resolved product URL. */
  const requestUrl = new URL(path.slice(1), apiBaseUrl)
  if (
    requestUrl.origin !== apiBaseUrl.origin ||
    !requestUrl.pathname.startsWith('/api/v2/') ||
    requestUrl.username !== '' ||
    requestUrl.password !== ''
  ) {
    throw new ApiV2ContractError('API v2 request path escaped the product API boundary.')
  }
  return requestUrl
}

/**
 * @brief 生成并校验请求关联 ID / Generate and validate a request-correlation ID.
 * @param factory 请求 ID 工厂 / Request-ID factory.
 * @return API v2 OpaqueId / API v2 OpaqueId.
 */
function createRequestId(factory: () => string): string {
  try {
    return opaqueId(factory(), 'request.id')
  } catch (error: unknown) {
    if (error instanceof ApiV2ContractError) throw error
    throw new ApiV2ContractError('API v2 request ID generation failed.')
  }
}

/**
 * @brief 组合调用方取消与请求截止时间 / Combine caller cancellation with a request deadline.
 * @param callerSignal 调用方信号 / Caller signal.
 * @param timeoutMilliseconds 截止毫秒数 / Deadline in milliseconds.
 * @return 可释放的组合信号 / Disposable combined signal.
 */
function createRequestDeadline(
  callerSignal: AbortSignal | undefined,
  timeoutMilliseconds: number
): RequestDeadline {
  /** @brief 当前请求的取消控制器 / Abort controller for the current request. */
  const controller = new AbortController()
  /** @brief 本地截止是否已触发 / Whether the local deadline has fired. */
  let didTimeOut = false
  /** @brief 透传调用方取消 / Forward caller cancellation. */
  const forwardAbort = (): void => controller.abort(callerSignal?.reason)
  if (callerSignal?.aborted === true) forwardAbort()
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true })
  /** @brief 请求截止 timer / Request-deadline timer. */
  const timeout = setTimeout((): void => {
    didTimeOut = true
    controller.abort(new DOMException('API v2 request deadline exceeded.', 'TimeoutError'))
  }, timeoutMilliseconds)
  return {
    dispose(): void {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', forwardAbort)
    },
    signal: controller.signal,
    timedOut: (): boolean => didTimeOut
  }
}

/**
 * @brief 解析 Retry-After 为非负毫秒数 / Parse Retry-After into non-negative milliseconds.
 * @param value 原始响应头 / Raw response header.
 * @param now 当前 epoch 毫秒 / Current epoch milliseconds.
 * @return 合法等待时长；无效或缺失时为 null / Valid delay, or null when absent or invalid.
 */
function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null
  /** @brief 去除 HTTP 字段外层 OWS 后的值 / Value after removing surrounding HTTP OWS. */
  const normalized = value.trim()
  if (/^\d+$/u.test(normalized)) {
    /** @brief delta-seconds 转换的毫秒数 / Milliseconds converted from delta-seconds. */
    const milliseconds = Number(normalized) * 1000
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }
  /** @brief RFC 9110 要求接收的三种 HTTP-date 语法 / Three HTTP-date syntaxes recipients must accept under RFC 9110. */
  const isHttpDate = [
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u,
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/u,
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u
  ].some((pattern) => pattern.test(normalized))
  if (!isHttpDate) return null
  /** @brief HTTP-date 解析结果 / Parsed HTTP-date. */
  const retryAt = Date.parse(normalized)
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null
}

/** @brief 单个 WWW-Authenticate challenge 的最小结构 / Minimal structure for one WWW-Authenticate challenge. */
interface AuthenticationChallenge {
  /** @brief 不区分大小写的认证 scheme / Case-insensitive authentication scheme. */
  readonly scheme: string
  /** @brief 绑定到该 scheme 的 token68 或 auth-param 文本 / token68 or auth-param text bound to this scheme. */
  readonly payload: string
}

/**
 * @brief 在 quoted-string 外切分逗号列表 / Split a comma list outside quoted strings.
 * @param value 原始 HTTP 字段 / Raw HTTP field value.
 * @return 未丢失 quoted comma 的字段成员 / Field members without losing quoted commas.
 */
function splitHttpList(value: string): readonly string[] {
  /** @brief 已切分成员 / Split members. */
  const members: string[] = []
  /** @brief 当前成员起点 / Start offset of the current member. */
  let start = 0
  /** @brief 当前是否位于 quoted-string / Whether the scanner is inside a quoted string. */
  let quoted = false
  /** @brief 上一字符是否为 quoted-pair 反斜线 / Whether the previous character was a quoted-pair backslash. */
  let escaped = false
  for (let index = 0; index < value.length; index += 1) {
    /** @brief 当前字符 / Current character. */
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quoted && character === '\\') {
      escaped = true
      continue
    }
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (character === ',' && !quoted) {
      members.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  members.push(value.slice(start).trim())
  return members.filter((member) => member !== '')
}

/**
 * @brief 将 WWW-Authenticate 列表绑定到各自 challenge / Bind a WWW-Authenticate list to individual challenges.
 * @param value 原始 challenge 列表 / Raw challenge list.
 * @return scheme 与其参数的关联 / Association between schemes and their parameters.
 */
function parseAuthenticationChallenges(value: string): readonly AuthenticationChallenge[] {
  /** @brief HTTP token 字符集 / HTTP token character set. */
  const challengeStart = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)(?:[ \t]+(.*))?$/u
  /** @brief 正在构造的 challenge / Challenge currently being assembled. */
  let current: { scheme: string; payloadParts: string[] } | null = null
  /** @brief 所有已解析 challenge / All parsed challenges. */
  const challenges: AuthenticationChallenge[] = []

  for (const member of splitHttpList(value)) {
    /** @brief 可能的新 scheme / Potential new scheme. */
    const match = challengeStart.exec(member)
    /** @brief scheme 后文本 / Text following the potential scheme. */
    const remainder = match?.[2]?.trim() ?? ''
    /** @brief 当前成员是否开始新 challenge / Whether this member starts a new challenge. */
    const beginsChallenge = match !== null && !remainder.startsWith('=')
    if (beginsChallenge) {
      if (current !== null) {
        challenges.push({ scheme: current.scheme, payload: current.payloadParts.join(',') })
      }
      current = {
        payloadParts: remainder === '' ? [] : [remainder],
        scheme: match[1] ?? ''
      }
      continue
    }
    if (current !== null) current.payloadParts.push(member)
  }
  if (current !== null) {
    challenges.push({ scheme: current.scheme, payload: current.payloadParts.join(',') })
  }
  return challenges
}

/**
 * @brief 校验 401 的 Bearer challenge 与受保护资源元数据 / Validate a 401 Bearer challenge and protected-resource metadata.
 * @param response 401 响应 / 401 response.
 */
function assertUnauthorizedChallenge(response: Response): void {
  if (response.status !== 401) return
  /** @brief WWW-Authenticate challenge / WWW-Authenticate challenge. */
  const challenge = response.headers.get('WWW-Authenticate')
  /** @brief 带冻结资源元数据的 Bearer challenge 是否存在 / Whether a Bearer challenge carries the frozen resource metadata. */
  const hasRequiredBearerChallenge =
    challenge !== null &&
    parseAuthenticationChallenges(challenge).some((candidate) => {
      if (candidate.scheme.toLowerCase() !== 'bearer') return false
      /** @brief 当前 Bearer challenge 的 resource_metadata / resource_metadata on this Bearer challenge. */
      const resourceMetadata = candidate.payload.match(
        /(?:^|,)\s*resource_metadata\s*=\s*"((?:[^"\\]|\\.)*)"(?:\s*(?:,|$))/iu
      )?.[1]
      return resourceMetadata === PROTECTED_RESOURCE_METADATA
    })
  if (!hasRequiredBearerChallenge) {
    throw new ApiV2ContractError(
      'API v2 401 response is missing the required Bearer resource_metadata challenge.',
      401
    )
  }
}

/**
 * @brief 在反序列化前按实际字节限制并读取 JSON / Read JSON under an actual byte limit before deserialization.
 * @param response 原始 fetch 响应 / Raw fetch response.
 * @param maximumBytes 当前端点最大响应字节数 / Maximum response bytes for the endpoint.
 * @return 语法有效的 JSON 值 / Syntactically valid JSON value.
 */
async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  /** @brief 服务端声明的表示长度 / Representation length declared by the server. */
  const contentLength = response.headers.get('Content-Length')
  if (contentLength !== null) {
    /** @brief 十进制 Content-Length / Decimal Content-Length. */
    const declaredBytes = /^\d+$/u.test(contentLength) ? Number(contentLength) : Number.NaN
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      throw new ApiV2ContractError(
        'API v2 response exceeds its pre-deserialization byte limit.',
        response.status
      )
    }
  }
  if (response.body === null) {
    throw new ApiV2ContractError('API v2 response contains malformed JSON.', response.status)
  }
  /** @brief 响应流 reader / Response-stream reader. */
  const reader = response.body.getReader()
  /** @brief 未合并的受限字节块 / Bounded byte chunks before joining. */
  const chunks: Uint8Array[] = []
  /** @brief 已读取实际字节数 / Actual byte count read so far. */
  let receivedBytes = 0
  while (true) {
    /** @brief 下一响应流读取结果 / Next response-stream read result. */
    const result = await reader.read()
    if (result.done) break
    receivedBytes += result.value.byteLength
    if (receivedBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ApiV2ContractError(
        'API v2 response exceeds its pre-deserialization byte limit.',
        response.status
      )
    }
    chunks.push(result.value)
  }
  /** @brief 合并后的完整受限表示 / Complete bounded representation after joining chunks. */
  const bytes = new Uint8Array(receivedBytes)
  /** @brief 当前写入 offset / Current write offset. */
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  /** @brief 严格 UTF-8 JSON 文本 / Strict UTF-8 JSON text. */
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ApiV2ContractError('API v2 response is not valid UTF-8.', response.status)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiV2ContractError('API v2 response contains malformed JSON.', response.status)
  }
}

/**
 * @brief 解析 JSON success 或 Problem 响应 / Parse a JSON success or Problem response.
 * @param response 原始 fetch 响应 / Raw fetch response.
 * @param expectedStatus 当前端点成功状态 / Success status expected by the endpoint.
 * @param maximumBytes 当前端点响应字节上限 / Response byte limit for the endpoint.
 * @param now 当前 epoch 毫秒 / Current epoch milliseconds.
 * @return 已解析 JSON 响应 / Parsed JSON response.
 */
async function parseResponse(
  response: Response,
  expectedStatus: number,
  maximumBytes: number,
  now: number
): Promise<ApiV2JsonResponse> {
  assertUnauthorizedChallenge(response)
  /** @brief 响应媒体类型 essence / Response media-type essence. */
  const mediaType =
    response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  /** @brief 服务端返回的请求 ID / Request ID returned by the server. */
  const responseRequestId = response.headers.get('X-Request-Id')
  if (responseRequestId === null) {
    throw new ApiV2ContractError('API v2 response is missing X-Request-Id.', response.status)
  }
  opaqueId(responseRequestId, 'response.headers.X-Request-Id')

  if (!response.ok && mediaType !== 'application/problem+json') {
    throw new ApiV2ContractError(
      'API v2 error response must use application/problem+json.',
      response.status
    )
  }
  if (response.ok && mediaType !== 'application/json') {
    throw new ApiV2ContractError(
      'API v2 JSON success response must use application/json.',
      response.status
    )
  }
  if (response.ok && response.status !== expectedStatus) {
    throw new ApiV2ContractError(
      `API v2 success status must be ${expectedStatus}.`,
      response.status
    )
  }
  /** @brief 语法有效但尚未按领域 Schema 验证的 JSON / Syntactically valid JSON awaiting domain-schema validation. */
  const data = await readBoundedJson(response, maximumBytes)
  if (!response.ok) {
    /** @brief 已完整验证的 Problem / Fully validated Problem. */
    const problem = parseProblemDetails(data, response.status)
    if (problem.request_id !== responseRequestId) {
      throw new ApiV2ContractError(
        'API v2 Problem request_id must match X-Request-Id.',
        response.status
      )
    }
    throw new ApiV2ProblemError(problem, parseRetryAfter(response.headers.get('Retry-After'), now))
  }
  return { data, headers: response.headers, status: response.status }
}

/**
 * @brief 创建 v2-only Bearer 产品客户端 / Create a v2-only Bearer product client.
 * @param options origin、内存凭证与可替换运行时依赖 / Origin, in-memory credentials, and replaceable runtime dependencies.
 * @return 不含 v1 fallback 的只读客户端 / Read-only client without a v1 fallback.
 */
export function createApiV2Client(options: ApiV2ClientOptions): ApiV2Client {
  /** @brief 已验证 API v2 基址 / Validated API v2 base URL. */
  const apiBaseUrl = resolveApiBaseUrl(options.transportProfile)
  /** @brief 网络实现 / Network implementation. */
  const fetchImpl = options.fetchImpl ?? fetch
  /** @brief 请求 ID 工厂 / Request-ID factory. */
  const requestIdFactory =
    options.createRequestId ??
    ((): string => `req_${globalThis.crypto.randomUUID().replaceAll('-', '_')}`)
  /** @brief 当前时间读取器 / Current-time reader. */
  const now = options.now ?? Date.now
  /** @brief 请求总截止毫秒 / Total request deadline in milliseconds. */
  const timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new ApiV2ContractError('API v2 timeout must be a positive safe integer.')
  }
  if (options.acceptLanguage !== undefined) {
    locale(options.acceptLanguage, 'request.headers.Accept-Language')
  }

  return {
    async getJson(path, requestOptions = {}): Promise<ApiV2JsonResponse> {
      /** @brief 当前端点冻结的成功状态 / Success status frozen for the current endpoint. */
      const expectedStatus = requestOptions.expectedStatus ?? 200
      if (!Number.isSafeInteger(expectedStatus) || expectedStatus < 200 || expectedStatus > 299) {
        throw new ApiV2ContractError('API v2 expected success status must be a 2xx integer.')
      }
      /** @brief 当前端点响应字节上限 / Response byte limit for the current endpoint. */
      const maximumResponseBytes = requestOptions.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
      if (
        !Number.isSafeInteger(maximumResponseBytes) ||
        maximumResponseBytes <= 0 ||
        maximumResponseBytes > ABSOLUTE_MAX_RESPONSE_BYTES
      ) {
        throw new ApiV2ContractError(
          `API v2 response byte limit must be between 1 and ${ABSOLUTE_MAX_RESPONSE_BYTES}.`
        )
      }
      /** @brief 当前请求 URL / Current request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)
      for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
        if (value === null || value === undefined) continue
        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new ApiV2ContractError(`API v2 query parameter ${key} must be finite.`)
        }
        requestUrl.searchParams.set(key, String(value))
      }
      /** @brief 当前请求 ID / Current request ID. */
      const requestId = createRequestId(requestIdFactory)
      /** @brief 当前内存 Bearer token / Current in-memory Bearer token. */
      const accessToken = readBearerToken(options.getAccessToken)
      /** @brief v2 公共请求头 / Common v2 request headers. */
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'X-Request-Id': requestId
      }
      if (options.acceptLanguage !== undefined) {
        headers['Accept-Language'] = options.acceptLanguage
      }
      /** @brief 当前请求组合截止 / Combined deadline for the current request. */
      const deadline = createRequestDeadline(requestOptions.signal, timeoutMilliseconds)
      try {
        /** @brief 原始 fetch 响应 / Raw fetch response. */
        const response = await fetchImpl(requestUrl.toString(), {
          credentials: 'omit',
          headers,
          method: 'GET',
          redirect: 'error',
          signal: deadline.signal
        })
        return await parseResponse(response, expectedStatus, maximumResponseBytes, now())
      } catch (error: unknown) {
        if (
          error instanceof ApiV2AuthenticationRequiredError ||
          error instanceof ApiV2ContractError ||
          error instanceof ApiV2ProblemError
        ) {
          throw error
        }
        if (deadline.timedOut()) throw new ApiV2NetworkError('timeout')
        if (requestOptions.signal?.aborted === true) throw new ApiV2NetworkError('aborted')
        throw new ApiV2NetworkError('network')
      } finally {
        deadline.dispose()
      }
    }
  }
}
