/** @file 带内存 Bearer 凭证的 API v2 只读 HTTP 边界 / API v2 read-only HTTP boundary with in-memory Bearer credentials. */

import { locale, opaqueId } from './contract'
import type { ApiV2AuthenticationPort } from './authentication'
import { readBoundedJson } from './bounded-json'
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
  /** @brief 内存 Access Token 的读取、刷新与条件失效端口 / Port for reading, refreshing, and conditionally invalidating in-memory access tokens. */
  readonly authentication: ApiV2AuthenticationPort
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
 * @param authentication 内存认证端口 / In-memory authentication port.
 * @return 可安全发送的 token；会话缺失时为 null / Token safe to send, or null when the session is absent.
 */
function readBearerToken(authentication: ApiV2AuthenticationPort): string | null {
  /** @brief 当前内存 token / Current in-memory token. */
  let token: unknown
  try {
    token = authentication.getAccessToken()
  } catch {
    throw new ApiV2ContractError('The in-memory access-token source failed.')
  }
  if (token === null) return null
  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 8192 ||
    !BEARER_TOKEN_PATTERN.test(token)
  ) {
    throw new ApiV2ContractError('The in-memory access token violates the OAuth Bearer syntax.')
  }
  return token
}

/**
 * @brief 将 AbortSignal reason 收敛为 Error / Normalize an AbortSignal reason into an Error.
 * @param signal 已取消的信号 / Aborted signal.
 * @return 可安全拒绝 Promise 的错误 / Error safe for rejecting a Promise.
 */
function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The API v2 operation was aborted.', 'AbortError')
}

/**
 * @brief 等待异步操作，同时强制执行共享截止信号 / Await an asynchronous operation while enforcing the shared deadline signal.
 * @param operation 正在执行的异步操作 / Asynchronous operation in progress.
 * @param signal 共享取消信号 / Shared cancellation signal.
 * @return 操作结果 / Operation result.
 */
function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal))
  }
  return new Promise<T>((resolve, reject): void => {
    /** @brief 移除共享取消监听 / Remove the shared cancellation listener. */
    const dispose = (): void => signal.removeEventListener('abort', abort)
    /** @brief 以共享取消原因结束等待 / End the wait with the shared cancellation reason. */
    const abort = (): void => {
      dispose()
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', abort, { once: true })
    void operation.then(
      (value): void => {
        dispose()
        resolve(value)
      },
      (error: unknown): void => {
        dispose()
        reject(
          error instanceof Error
            ? error
            : new Error('The API v2 asynchronous operation rejected without an Error.')
        )
      }
    )
  })
}

/**
 * @brief 获取首个可发送的 Bearer token / Acquire the first Bearer token that can be sent.
 * @param authentication Access Token 生命周期端口 / Access-token lifecycle port.
 * @param signal 共享截止信号 / Shared deadline signal.
 * @return 当前可发送 token / Current token safe to send.
 */
async function acquireInitialBearerToken(
  authentication: ApiV2AuthenticationPort,
  signal: AbortSignal
): Promise<string> {
  /** @brief 首次读取的 token / Initially observed token. */
  const currentToken = readBearerToken(authentication)
  if (currentToken !== null) return currentToken
  await awaitWithAbort(
    authentication.refreshAccessToken({ rejectedAccessToken: null, signal }),
    signal
  )
  /** @brief 刷新后重新读取的 token / Token reread after refresh. */
  const refreshedToken = readBearerToken(authentication)
  if (refreshedToken === null) throw new ApiV2AuthenticationRequiredError()
  return refreshedToken
}

/**
 * @brief 针对一次被拒绝的 token 获取替代 token / Acquire a replacement for one rejected token.
 * @param authentication Access Token 生命周期端口 / Access-token lifecycle port.
 * @param rejectedAccessToken 被首个 401 拒绝的 token / Token rejected by the first 401.
 * @param signal 共享截止信号 / Shared deadline signal.
 * @return 重试实际使用的 token / Token actually used by the retry.
 */
async function acquireReplacementBearerToken(
  authentication: ApiV2AuthenticationPort,
  rejectedAccessToken: string,
  signal: AbortSignal
): Promise<string> {
  await awaitWithAbort(authentication.refreshAccessToken({ rejectedAccessToken, signal }), signal)
  /** @brief 刷新后重新读取的 token / Token reread after refresh. */
  const refreshedToken = readBearerToken(authentication)
  if (refreshedToken === null) throw new ApiV2AuthenticationRequiredError()
  return refreshedToken
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
  const data = await readBoundedJson(response, {
    context: 'API v2 response',
    maximumBytes
  })
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

/** @brief 单次认证 GET 尝试的输入 / Input for one authenticated GET attempt. */
interface AuthenticatedGetAttempt {
  /** @brief 当前请求 URL / Current request URL. */
  readonly requestUrl: URL
  /** @brief 当前实际使用的 Bearer token / Bearer token actually used by this attempt. */
  readonly accessToken: string
  /** @brief 当前端点冻结的成功状态 / Success status frozen for the endpoint. */
  readonly expectedStatus: number
  /** @brief 当前端点响应字节上限 / Response byte limit for the endpoint. */
  readonly maximumResponseBytes: number
  /** @brief 当前界面语言 / Current UI language. */
  readonly acceptLanguage: string | undefined
  /** @brief 网络实现 / Network implementation. */
  readonly fetchImpl: typeof fetch
  /** @brief 请求 ID 工厂 / Request-ID factory. */
  readonly requestIdFactory: () => string
  /** @brief 当前时间读取器 / Current-time reader. */
  readonly now: () => number
  /** @brief 跨认证与网络阶段共享的截止信号 / Deadline signal shared across authentication and network phases. */
  readonly signal: AbortSignal
}

/**
 * @brief 执行一次带独立 request ID 的认证 GET / Execute one authenticated GET with its own request ID.
 * @param attempt 已验证的尝试输入 / Validated attempt input.
 * @return 已完整解析的 API v2 JSON 响应 / Fully parsed API v2 JSON response.
 */
async function performAuthenticatedGet(
  attempt: AuthenticatedGetAttempt
): Promise<ApiV2JsonResponse> {
  /** @brief 本次尝试的新请求 ID / Fresh request ID for this attempt. */
  const requestId = createRequestId(attempt.requestIdFactory)
  /** @brief 本次尝试的请求头 / Request headers for this attempt. */
  const headers: Record<string, string> = {
    Authorization: `Bearer ${attempt.accessToken}`,
    'X-Request-Id': requestId
  }
  if (attempt.acceptLanguage !== undefined) headers['Accept-Language'] = attempt.acceptLanguage
  /** @brief 原始 fetch 操作 / Raw fetch operation. */
  const fetchOperation = attempt.fetchImpl(attempt.requestUrl.toString(), {
    credentials: 'omit',
    headers,
    method: 'GET',
    redirect: 'error',
    signal: attempt.signal
  })
  /** @brief 原始 fetch 响应 / Raw fetch response. */
  const response = await awaitWithAbort(fetchOperation, attempt.signal)
  return await awaitWithAbort(
    parseResponse(response, attempt.expectedStatus, attempt.maximumResponseBytes, attempt.now()),
    attempt.signal
  )
}

/**
 * @brief 判断错误是否为完整验证的 401 Problem / Determine whether an error is a fully validated 401 Problem.
 * @param error 捕获的错误 / Caught error.
 * @return 完整验证的 401 Problem 判定 / Fully validated 401 Problem predicate.
 */
function isUnauthorizedProblem(error: unknown): error is ApiV2ProblemError {
  return error instanceof ApiV2ProblemError && error.problem.status === 401
}

/**
 * @brief 将未验证响应前的失败投影为封闭网络错误 / Project a pre-verifiable-response failure into the closed network error model.
 * @param error 捕获的 transport 或 parse 错误 / Caught transport or parse error.
 * @param deadline 当前 GET 的共享截止 / Shared deadline for the current GET.
 * @param callerSignal 调用方取消信号 / Caller cancellation signal.
 * @throws 已验证协议错误或脱敏网络错误 / A validated protocol error or sanitized network error.
 */
function throwTransportFailure(
  error: unknown,
  deadline: RequestDeadline,
  callerSignal: AbortSignal | undefined
): never {
  if (
    error instanceof ApiV2AuthenticationRequiredError ||
    error instanceof ApiV2ContractError ||
    error instanceof ApiV2ProblemError
  ) {
    throw error
  }
  if (deadline.timedOut()) throw new ApiV2NetworkError('timeout')
  if (callerSignal?.aborted === true) throw new ApiV2NetworkError('aborted')
  throw new ApiV2NetworkError('network')
}

/**
 * @brief 保留认证端口错误，同时统一共享取消语义 / Preserve authentication-port failures while normalizing shared cancellation.
 * @param error 捕获的认证端口错误 / Caught authentication-port error.
 * @param deadline 当前 GET 的共享截止 / Shared deadline for the current GET.
 * @param callerSignal 调用方取消信号 / Caller cancellation signal.
 * @throws 原始认证错误或统一网络取消错误 / Original authentication error or normalized network cancellation error.
 */
function throwAuthenticationFailure(
  error: unknown,
  deadline: RequestDeadline,
  callerSignal: AbortSignal | undefined
): never {
  if (deadline.timedOut()) throw new ApiV2NetworkError('timeout')
  if (callerSignal?.aborted === true) throw new ApiV2NetworkError('aborted')
  throw error
}

/**
 * @brief 条件失效被连续两次拒绝的 token / Conditionally invalidate a token rejected twice in succession.
 * @param authentication Access Token 生命周期端口 / Access-token lifecycle port.
 * @param rejectedAccessToken 第二次尝试实际发送的 token / Token actually sent by the second attempt.
 */
function invalidateRejectedAccessToken(
  authentication: ApiV2AuthenticationPort,
  rejectedAccessToken: string
): void {
  try {
    authentication.invalidateAccessToken(rejectedAccessToken)
  } catch {
    throw new ApiV2ContractError('The in-memory access-token invalidation failed.', 401)
  }
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
  if (
    typeof options.authentication?.getAccessToken !== 'function' ||
    typeof options.authentication.refreshAccessToken !== 'function' ||
    typeof options.authentication.invalidateAccessToken !== 'function'
  ) {
    throw new ApiV2ContractError('API v2 requires a complete authentication lifecycle port.')
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
      /** @brief 当前请求组合截止 / Combined deadline for the current request. */
      const deadline = createRequestDeadline(requestOptions.signal, timeoutMilliseconds)
      try {
        /** @brief 首次尝试实际发送的 token / Token actually sent by the first attempt. */
        let accessToken: string
        try {
          accessToken = await acquireInitialBearerToken(options.authentication, deadline.signal)
        } catch (error: unknown) {
          throwAuthenticationFailure(error, deadline, requestOptions.signal)
        }
        try {
          return await performAuthenticatedGet({
            acceptLanguage: options.acceptLanguage,
            accessToken,
            expectedStatus,
            fetchImpl,
            maximumResponseBytes,
            now,
            requestIdFactory,
            requestUrl,
            signal: deadline.signal
          })
        } catch (firstError: unknown) {
          if (!isUnauthorizedProblem(firstError)) {
            throwTransportFailure(firstError, deadline, requestOptions.signal)
          }
        }

        /** @brief 401 后重试实际发送的 token / Token actually sent by the retry after 401. */
        let retryAccessToken: string
        try {
          retryAccessToken = await acquireReplacementBearerToken(
            options.authentication,
            accessToken,
            deadline.signal
          )
        } catch (error: unknown) {
          throwAuthenticationFailure(error, deadline, requestOptions.signal)
        }
        try {
          return await performAuthenticatedGet({
            acceptLanguage: options.acceptLanguage,
            accessToken: retryAccessToken,
            expectedStatus,
            fetchImpl,
            maximumResponseBytes,
            now,
            requestIdFactory,
            requestUrl,
            signal: deadline.signal
          })
        } catch (retryError: unknown) {
          if (isUnauthorizedProblem(retryError)) {
            invalidateRejectedAccessToken(options.authentication, retryAccessToken)
          }
          throwTransportFailure(retryError, deadline, requestOptions.signal)
        }
      } finally {
        deadline.dispose()
      }
    }
  }
}
