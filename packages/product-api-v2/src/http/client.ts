/** @file 带内存 Bearer 凭证的 API v2 HTTP 边界 / API v2 HTTP boundary with in-memory Bearer credentials. */

import { idempotencyKey, locale, opaqueId, strongEntityTag } from './contract'
import type { ApiV2AuthenticationPort } from './authentication'
import { readBoundedJson } from './bounded-json'
import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError,
  ApiV2WriteOutcomeUnknownError
} from './errors'
import { parseProblemDetails } from './problem'
import { ApiV2ProblemError } from './problem-error'
import { API_V2_CONTROLLED_TEST_ORIGIN, API_V2_PRODUCTION_ORIGIN } from '../origin'

/** @brief OAuth Bearer b64token 语法 / OAuth Bearer b64token syntax. */
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9\-._~+/]+=*$/u

/** @brief v2 401 challenge 固定的 Protected Resource Metadata / Frozen Protected Resource Metadata used by v2 401 challenges. */
const PROTECTED_RESOURCE_METADATA =
  'https://api.hmalliances.org:8022/.well-known/oauth-protected-resource'

/** @brief 默认控制面 GET 截止时间 / Default deadline for control-plane GET requests. */
const DEFAULT_TIMEOUT_MILLISECONDS = 30_000

/** @brief 默认 JSON 响应硬上限 / Default hard limit for JSON responses. */
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024

/** @brief 单个 JSON 响应允许配置的绝对上限 / Absolute configurable ceiling for one JSON response. */
const ABSOLUTE_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 默认 JSON 请求硬上限 / Default hard limit for JSON request bodies. */
const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024

/** @brief 单个 JSON 请求允许配置的绝对上限 / Absolute configurable ceiling for one JSON request. */
const ABSOLUTE_MAX_REQUEST_BYTES = 16 * 1024 * 1024

/** @brief Transport JSON 预验证的最大嵌套深度 / Maximum nesting depth for transport JSON prevalidation. */
const MAXIMUM_JSON_DEPTH = 128

/** @brief Transport 内部冻结的 JSON 数据模型 / Transport-internal frozen JSON data model. */
type TransportJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly TransportJsonValue[]
  | { readonly [key: string]: TransportJsonValue }

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

/** @brief POST 成功的封闭产品语义 / Closed product semantics for a successful POST. */
export type ApiV2PostSuccessKind =
  'accepted-resource' | 'created-resource' | 'query-result' | 'updated-resource' | 'updated-result'

/** @brief POST 成功语义与并发前置条件的判别联合 / Discriminated union of POST success semantics and concurrency preconditions. */
export type ApiV2PostSuccessPolicy =
  | {
      /** @brief 异步资源已接受，固定 202 + ETag + Location / Asynchronous resource accepted with fixed 202, ETag, and Location. */
      readonly successKind: 'accepted-resource'
      /** @brief 端点语义要求时的可选强前置条件 / Optional strong precondition when required by endpoint semantics. */
      readonly ifMatch?: string
    }
  | {
      /** @brief 资源已创建，固定 201 + ETag + Location / Resource created with fixed 201, ETag, and Location. */
      readonly successKind: 'created-resource'
      /** @brief 端点语义要求时的可选强前置条件 / Optional strong precondition when required by endpoint semantics. */
      readonly ifMatch?: string
    }
  | {
      /** @brief 不修改资源的纯结果，固定 200 且不保证 ETag / Pure non-mutating result with fixed 200 and no ETag guarantee. */
      readonly successKind: 'query-result'
      /** @brief 纯查询结果禁止 If-Match / If-Match is forbidden for a pure query result. */
      readonly ifMatch?: never
    }
  | {
      /** @brief 既有资源已更新，固定 200 + ETag / Existing resource updated with fixed 200 and ETag. */
      readonly successKind: 'updated-resource'
      /** @brief 修改既有资源必需的强前置条件 / Mandatory strong precondition for modifying an existing resource. */
      readonly ifMatch: string
    }
  | {
      /** @brief 修改成功后返回结果，固定 200 + ETag / Result returned after a successful update with fixed 200 and ETag. */
      readonly successKind: 'updated-result'
      /** @brief 修改既有资源必需的强前置条件 / Mandatory strong precondition for modifying an existing resource. */
      readonly ifMatch: string
    }

/** @brief API v2 POST 公共选项 / Common API v2 POST options. */
interface ApiV2PostOptionsBase {
  /** @brief 用户意图对应的稳定幂等键 / Stable idempotency key for the user intent. */
  readonly idempotencyKey: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
  /** @brief 当前端点解码前的响应字节上限 / Response byte limit before decoding for this endpoint. */
  readonly maxResponseBytes?: number
}

/** @brief API v2 JSON POST 选项 / API v2 JSON POST options. */
export type ApiV2PostJsonOptions<TKind extends ApiV2PostSuccessKind = ApiV2PostSuccessKind> =
  ApiV2PostOptionsBase &
    Extract<ApiV2PostSuccessPolicy, { readonly successKind: TKind }> & {
      /** @brief 序列化后 UTF-8 请求字节上限 / UTF-8 request byte limit after serialization. */
      readonly maxRequestBytes?: number
    }

/** @brief API v2 空 body POST 选项 / API v2 empty-body POST options. */
export type ApiV2PostEmptyOptions<TKind extends ApiV2PostSuccessKind = ApiV2PostSuccessKind> =
  ApiV2PostOptionsBase & Extract<ApiV2PostSuccessPolicy, { readonly successKind: TKind }>

/** @brief API v2 JSON Merge Patch 选项 / API v2 JSON Merge Patch options. */
export interface ApiV2PatchJsonOptions {
  /** @brief 被修改表示的强前置条件 / Strong precondition for the representation being modified. */
  readonly ifMatch: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
  /** @brief 序列化后 UTF-8 请求字节上限 / UTF-8 request byte limit after serialization. */
  readonly maxRequestBytes?: number
  /** @brief 当前端点解码前的响应字节上限 / Response byte limit before decoding for this endpoint. */
  readonly maxResponseBytes?: number
}

/** @brief API v2 条件 DELETE 选项 / API v2 conditional DELETE options. */
export interface ApiV2DeleteOptions {
  /** @brief 被删除表示的强前置条件 / Strong precondition for the representation being deleted. */
  readonly ifMatch: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
  /** @brief 错误 Problem 解码前的响应字节上限 / Response byte limit before decoding an error Problem. */
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

/** @brief 带强 ETag 和 Location 的写响应元数据 / Write-response metadata carrying a strong ETag and Location. */
export interface ApiV2LocatedWriteResponseMetadata {
  /** @brief 新建可变资源的强实体标签 / Strong entity tag for the new mutable resource. */
  readonly entityTag: string
  /** @brief 已验证的同源绝对资源地址 / Validated same-origin absolute resource location. */
  readonly location: string
  /** @brief 服务端返回且已验证的请求 ID / Validated request ID returned by the server. */
  readonly requestId: string
}

/** @brief 带强 ETag 的更新响应元数据 / Updated-response metadata carrying a strong ETag. */
export interface ApiV2VersionedWriteResponseMetadata {
  /** @brief 更新后表示的强实体标签 / Strong entity tag for the updated representation. */
  readonly entityTag: string
  /** @brief 服务端可选返回的已验证同源地址 / Optional validated same-origin location returned by the server. */
  readonly location: string | null
  /** @brief 服务端返回且已验证的请求 ID / Validated request ID returned by the server. */
  readonly requestId: string
}

/** @brief 纯结果写响应元数据 / Pure-result write-response metadata. */
export interface ApiV2ResultWriteResponseMetadata {
  /** @brief 服务端可选返回且已验证的强 ETag / Optional validated strong ETag returned by the server. */
  readonly entityTag: string | null
  /** @brief 服务端可选返回的已验证同源地址 / Optional validated same-origin location returned by the server. */
  readonly location: string | null
  /** @brief 服务端返回且已验证的请求 ID / Validated request ID returned by the server. */
  readonly requestId: string
}

/** @brief 写响应元数据的封闭联合 / Closed union of write-response metadata. */
export type ApiV2WriteResponseMetadata =
  | ApiV2LocatedWriteResponseMetadata
  | ApiV2ResultWriteResponseMetadata
  | ApiV2VersionedWriteResponseMetadata

/** @brief 已验证的 201 创建资源响应 / Validated 201 created-resource response. */
export interface ApiV2CreatedResourceResponse {
  /** @brief 未经领域 decoder 信任的 JSON / JSON not yet trusted by a domain decoder. */
  readonly data: unknown
  /** @brief 非空 ETag 与 Location / Non-null ETag and Location. */
  readonly metadata: ApiV2LocatedWriteResponseMetadata
  /** @brief 固定 Created 状态 / Frozen Created status. */
  readonly status: 201
}

/** @brief 已验证的 202 异步资源响应 / Validated 202 asynchronous-resource response. */
export interface ApiV2AcceptedResourceResponse {
  /** @brief 未经领域 decoder 信任的 JSON / JSON not yet trusted by a domain decoder. */
  readonly data: unknown
  /** @brief 非空 ETag 与 Location / Non-null ETag and Location. */
  readonly metadata: ApiV2LocatedWriteResponseMetadata
  /** @brief 固定 Accepted 状态 / Frozen Accepted status. */
  readonly status: 202
}

/** @brief 已验证的 200 资源更新响应 / Validated 200 resource-update response. */
export interface ApiV2UpdatedWriteJsonResponse {
  /** @brief 未经领域 decoder 信任的 JSON / JSON not yet trusted by a domain decoder. */
  readonly data: unknown
  /** @brief 非空强 ETag 元数据 / Metadata carrying a non-null strong ETag. */
  readonly metadata: ApiV2VersionedWriteResponseMetadata
  /** @brief 固定 OK 状态 / Frozen OK status. */
  readonly status: 200
}

/** @brief 已验证的 200 纯结果响应 / Validated 200 pure-result response. */
export interface ApiV2ResultWriteJsonResponse {
  /** @brief 未经领域 decoder 信任的 JSON / JSON not yet trusted by a domain decoder. */
  readonly data: unknown
  /** @brief 不要求 ETag 的已验证元数据 / Validated metadata without an ETag requirement. */
  readonly metadata: ApiV2ResultWriteResponseMetadata
  /** @brief 固定 OK 状态 / Frozen OK status. */
  readonly status: 200
}

/** @brief 写 JSON 响应的封闭联合 / Closed union of JSON write responses. */
export type ApiV2WriteJsonResponse =
  | ApiV2AcceptedResourceResponse
  | ApiV2CreatedResourceResponse
  | ApiV2ResultWriteJsonResponse
  | ApiV2UpdatedWriteJsonResponse

/** @brief 按 POST 产品语义映射精确响应类型 / Map POST product semantics to an exact response type. */
export type ApiV2PostJsonResponse<TKind extends ApiV2PostSuccessKind> =
  TKind extends 'created-resource'
    ? ApiV2CreatedResourceResponse
    : TKind extends 'accepted-resource'
      ? ApiV2AcceptedResourceResponse
      : TKind extends 'query-result'
        ? ApiV2ResultWriteJsonResponse
        : ApiV2UpdatedWriteJsonResponse

/** @brief 已验证的 API v2 204 写响应 / Validated API v2 204 write response. */
export interface ApiV2NoContentResponse {
  /** @brief 不存在资源表示的固定元数据 / Frozen metadata without a resource representation. */
  readonly metadata: {
    /** @brief 204 不返回实体标签 / A 204 delete returns no entity tag. */
    readonly entityTag: null
    /** @brief 204 不返回资源地址 / A 204 delete returns no resource location. */
    readonly location: null
    /** @brief 已验证的请求 ID / Validated request ID. */
    readonly requestId: string
  }
  /** @brief 固定 No Content 状态 / Frozen No Content status. */
  readonly status: 204
}

/** @brief API v2 transport profile / API v2 transport profile. */
export type ApiV2TransportProfile =
  | { readonly kind: 'production' }
  | {
      readonly kind: 'controlled-test'
      readonly apiOrigin: 'http://dev.hmalliances.org:9000'
    }

/** @brief API v2 最小读取端口 / Minimal API v2 read port. */
export interface ApiV2Client {
  /**
   * @brief 读取一个 JSON 产品资源 / Read one JSON product resource.
   * @param path 相对 `/api/v2` 的绝对风格路径 / Absolute-style path relative to `/api/v2`.
   * @param options 查询、状态、字节上限和取消选项 / Query, status, byte-limit, and cancellation options.
   * @return 未经领域映射的响应 / Response before domain mapping.
   */
  readonly getJson: (path: string, options?: ApiV2GetOptions) => Promise<ApiV2JsonResponse>
}

/** @brief API v2 最小写入端口 / Minimal API v2 write port. */
export interface ApiV2WriteClient {
  /**
   * @brief 发送带幂等键的完整 JSON command / Send a complete JSON command with an idempotency key.
   * @param path 相对 `/api/v2` 的产品路径 / Product path relative to `/api/v2`.
   * @param body 发送前严格验证并冻结的 JSON 值 / JSON value strictly validated and frozen before dispatch.
   * @param options 幂等、并发、状态与大小策略 / Idempotency, concurrency, status, and size policy.
   * @return JSON body 与类型化响应元数据 / JSON body and typed response metadata.
   */
  readonly postJson: <TKind extends ApiV2PostSuccessKind>(
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<TKind>
  ) => Promise<ApiV2PostJsonResponse<TKind>>
  /**
   * @brief 发送无请求 body 的幂等 command / Send an idempotent command without a request body.
   * @param path 相对 `/api/v2` 的产品路径 / Product path relative to `/api/v2`.
   * @param options 幂等、并发、状态与大小策略 / Idempotency, concurrency, status, and size policy.
   * @return JSON body 与类型化响应元数据 / JSON body and typed response metadata.
   */
  readonly postEmpty: <TKind extends ApiV2PostSuccessKind>(
    path: string,
    options: ApiV2PostEmptyOptions<TKind>
  ) => Promise<ApiV2PostJsonResponse<TKind>>
  /**
   * @brief 发送带强 If-Match 的 JSON Merge Patch / Send JSON Merge Patch with a strong If-Match.
   * @param path 相对 `/api/v2` 的产品路径 / Product path relative to `/api/v2`.
   * @param body 发送前严格验证并冻结的 merge patch / Merge patch strictly validated and frozen before dispatch.
   * @param options 强并发前置条件与大小策略 / Strong concurrency precondition and size policy.
   * @return 更新后 JSON body 与强 ETag / Updated JSON body and strong ETag.
   */
  readonly patchJson: (
    path: string,
    body: unknown,
    options: ApiV2PatchJsonOptions
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
  /**
   * @brief 发送带强 If-Match 的异步 DELETE 并严格接收 202 / Send an asynchronous DELETE with a strong If-Match and strictly accept 202.
   * @param path 相对 `/api/v2` 的产品路径 / Product path relative to `/api/v2`.
   * @param options 强并发前置条件与响应上限 / Strong concurrency precondition and response limit.
   * @return 带强 Job ETag 与绝对 Location 的响应 / Response carrying a strong Job ETag and absolute Location.
   */
  readonly deleteAcceptedJson: (
    path: string,
    options: ApiV2DeleteOptions
  ) => Promise<ApiV2AcceptedResourceResponse>
  /**
   * @brief 发送带强 If-Match 的 DELETE 并严格接收 204 / Send DELETE with a strong If-Match and strictly accept 204.
   * @param path 相对 `/api/v2` 的产品路径 / Product path relative to `/api/v2`.
   * @param options 强并发前置条件与响应上限 / Strong concurrency precondition and response limit.
   * @return 已验证的无 body 响应 / Validated bodyless response.
   */
  readonly deleteNoContent: (
    path: string,
    options: ApiV2DeleteOptions
  ) => Promise<ApiV2NoContentResponse>
}

/** @brief 由运行时组装的完整 API v2 HTTP client / Complete API v2 HTTP client composed by the runtime. */
export type ApiV2HttpClient = ApiV2Client & ApiV2WriteClient

/** @brief API v2 读写客户端共享的 transport 配置 / Transport options shared by API v2 read and write clients. */
export interface ApiV2TransportOptions {
  /** @brief 默认固定生产；测试直连必须显式选择 / Frozen production by default; direct test transport must be explicit. */
  readonly transportProfile?: ApiV2TransportProfile
  /** @brief 当前界面 Locale / Current UI locale. */
  readonly acceptLanguage?: string | undefined
  /** @brief 测试可替换的 fetch / Fetch implementation replaceable in tests. */
  readonly fetchImpl?: typeof fetch
  /** @brief 测试可替换的请求 ID 工厂 / Request-ID factory replaceable in tests. */
  readonly createRequestId?: () => string
  /** @brief 每次 API 操作的总截止时间 / Total deadline for each API operation. */
  readonly timeoutMilliseconds?: number
  /** @brief 测试可替换的当前时间 / Current time replaceable in tests. */
  readonly now?: () => number
}

/** @brief API v2 受保护产品客户端配置 / Options for the protected API v2 product client. */
export interface ApiV2ClientOptions extends ApiV2TransportOptions {
  /** @brief 内存 Access Token 的读取、刷新与条件失效端口 / Port for reading, refreshing, and conditionally invalidating in-memory access tokens. */
  readonly authentication: ApiV2AuthenticationPort
}

/** @brief API v2 公开只读客户端配置 / Options for the public read-only API v2 client. */
export type ApiV2PublicClientOptions = ApiV2TransportOptions

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
    return new URL('/api/v2/', API_V2_PRODUCTION_ORIGIN)
  }
  if (profile.kind === 'controlled-test' && profile.apiOrigin === API_V2_CONTROLLED_TEST_ORIGIN) {
    return new URL('/api/v2/', API_V2_CONTROLLED_TEST_ORIGIN)
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
    typeof path !== 'string' ||
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
 * @brief 校验请求或响应字节上限 / Validate a request or response byte limit.
 * @param value 调用方提供或默认的上限 / Caller-provided or default limit.
 * @param ceiling 允许配置的绝对上限 / Absolute configurable ceiling.
 * @param kind 诊断中的 body 类别 / Body kind used in diagnostics.
 * @return 已验证的正安全整数 / Validated positive safe integer.
 */
function validateByteLimit(value: number, ceiling: number, kind: 'request' | 'response'): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ceiling) {
    throw new ApiV2ContractError(`API v2 ${kind} byte limit must be between 1 and ${ceiling}.`)
  }
  return value
}

/**
 * @brief 严格投影 JSON 数据模型并拒绝隐式丢字段或执行 getter / Strictly project the JSON data model and reject implicit field loss or getter execution.
 * @param value 当前值 / Current value.
 * @param path 脱敏结构路径 / Sanitized structural path.
 * @param depth 当前嵌套深度 / Current nesting depth.
 * @param ancestors 当前递归栈，用于拒绝环 / Current recursion stack used to reject cycles.
 * @return 与调用方对象脱离的 JSON 快照 / JSON snapshot detached from the caller object.
 */
function snapshotJsonValue(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>
): TransportJsonValue {
  if (depth > MAXIMUM_JSON_DEPTH) {
    throw new ApiV2ContractError('API v2 JSON request exceeds the maximum nesting depth.')
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ApiV2ContractError(`API v2 JSON field ${path} must be a finite number.`)
    }
    return value
  }
  if (typeof value !== 'object') {
    throw new ApiV2ContractError(`API v2 JSON field ${path} is not JSON-compatible.`)
  }
  if (ancestors.has(value)) {
    throw new ApiV2ContractError('API v2 JSON request must not contain a reference cycle.')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      /** @brief 数组全部自有 keys / All own keys of the array. */
      const ownKeys = Reflect.ownKeys(value)
      for (const key of ownKeys) {
        if (key === 'length') continue
        if (typeof key !== 'string') {
          throw new ApiV2ContractError(`API v2 JSON field ${path} must not contain symbol keys.`)
        }
        /** @brief 可能的规范数组下标 / Potential canonical array index. */
        const index = Number(key)
        /** @brief 当前数组属性描述符 / Descriptor for the current array property. */
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= value.length ||
          String(index) !== key
        ) {
          throw new ApiV2ContractError(`API v2 JSON field ${path} has a non-JSON array property.`)
        }
        if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
          throw new ApiV2ContractError(`API v2 JSON field ${path} contains an unsafe array slot.`)
        }
      }
      /** @brief 与调用方数组脱离的 JSON 快照 / JSON snapshot detached from the caller array. */
      const snapshot: TransportJsonValue[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new ApiV2ContractError(`API v2 JSON field ${path} must not contain sparse arrays.`)
        }
        /** @brief 当前数组元素描述符 / Descriptor for the current array element. */
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
          throw new ApiV2ContractError(`API v2 JSON field ${path} contains an unsafe array slot.`)
        }
        snapshot.push(
          snapshotJsonValue(descriptor.value, `${path}[${index}]`, depth + 1, ancestors)
        )
      }
      return snapshot
    }

    /** @brief 当前对象原型 / Prototype of the current object. */
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ApiV2ContractError(`API v2 JSON field ${path} must be a plain object.`)
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new ApiV2ContractError(`API v2 JSON field ${path} must not contain symbol keys.`)
    }
    /** @brief 一次性读取且不执行 getter 的属性描述符 / Property descriptors read once without executing getters. */
    const descriptors = Object.getOwnPropertyDescriptors(value)
    /** @brief 与调用方对象脱离的无原型 JSON 快照 / Prototype-free JSON snapshot detached from the caller object. */
    const snapshot: Record<string, TransportJsonValue> = Object.create(null) as Record<
      string,
      TransportJsonValue
    >
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor) || !descriptor.enumerable) {
        throw new ApiV2ContractError(`API v2 JSON field ${path} contains an unsafe property.`)
      }
      snapshot[key] = snapshotJsonValue(descriptor.value, `${path}.${key}`, depth + 1, ancestors)
    }
    return snapshot
  } catch (error: unknown) {
    if (error instanceof ApiV2ContractError) throw error
    throw new ApiV2ContractError('API v2 JSON request could not be inspected safely.')
  } finally {
    ancestors.delete(value)
  }
}

/**
 * @brief 预验证并一次性序列化 JSON 请求 / Prevalidate and serialize a JSON request exactly once.
 * @param value 未知调用方值 / Unknown caller value.
 * @param maximumBytes UTF-8 body 上限 / UTF-8 body limit.
 * @return 可在认证重放中原样复用的 JSON 文本 / JSON text reusable byte-for-byte across authentication replay.
 */
function serializeJsonRequest(value: unknown, maximumBytes: number): string {
  /** @brief 与调用方可变对象脱离的 JSON 快照 / JSON snapshot detached from the caller's mutable object. */
  const snapshot = snapshotJsonValue(value, '$', 0, new WeakSet<object>())
  /** @brief 完整验证后得到的 JSON 文本 / JSON text produced after complete validation. */
  let serialized: string
  try {
    serialized = JSON.stringify(snapshot)
  } catch {
    throw new ApiV2ContractError('API v2 JSON request could not be serialized safely.')
  }
  /** @brief 实际 UTF-8 请求字节数 / Actual UTF-8 request byte count. */
  const byteLength = new TextEncoder().encode(serialized).byteLength
  if (byteLength > maximumBytes) {
    throw new ApiV2ContractError('API v2 JSON request exceeds its pre-dispatch byte limit.')
  }
  return serialized
}

/**
 * @brief 验证 POST 成功语义判别字段 / Validate the POST success-semantics discriminant.
 * @param value 未知判别值 / Unknown discriminant value.
 * @return 已验证的封闭语义 / Validated closed semantics.
 */
function postSuccessKind(value: unknown): ApiV2PostSuccessKind {
  switch (value) {
    case 'accepted-resource':
    case 'created-resource':
    case 'query-result':
    case 'updated-resource':
    case 'updated-result':
      return value
    default:
      throw new ApiV2ContractError('API v2 POST requires a supported successKind.')
  }
}

/**
 * @brief 把 POST 成功语义映射为唯一 HTTP 状态 / Map POST success semantics to its sole HTTP status.
 * @param kind 已验证的成功语义 / Validated success semantics.
 * @return 不可配置的成功状态 / Non-configurable success status.
 */
function postSuccessStatus(kind: ApiV2PostSuccessKind): 200 | 201 | 202 {
  if (kind === 'created-resource') return 201
  if (kind === 'accepted-resource') return 202
  return 200
}

/**
 * @brief 按 POST 语义验证并冻结 If-Match / Validate and freeze If-Match according to POST semantics.
 * @param kind 已验证的成功语义 / Validated success semantics.
 * @param value 未知 If-Match 值 / Unknown If-Match value.
 * @return 已验证强 ETag，或允许省略时为 undefined / Validated strong ETag, or undefined when omission is allowed.
 */
function postIfMatch(kind: ApiV2PostSuccessKind, value: unknown): string | undefined {
  if (kind === 'query-result') {
    if (value !== undefined) {
      throw new ApiV2ContractError('API v2 query-result POST must not carry If-Match.')
    }
    return undefined
  }
  if (kind === 'updated-resource' || kind === 'updated-result') {
    return strongEntityTag(value, 'request.headers.If-Match')
  }
  return value === undefined ? undefined : strongEntityTag(value, 'request.headers.If-Match')
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

/** @brief 已验证的公共响应头 / Validated common response headers. */
interface ValidatedResponseHeaders {
  /** @brief 响应媒体类型 essence / Response media-type essence. */
  readonly mediaType: string
  /** @brief 服务端请求 ID / Server request ID. */
  readonly requestId: string
}

/**
 * @brief 验证所有 Product API 响应共有的安全头 / Validate safe headers shared by all Product API responses.
 * @param response 原始 fetch 响应 / Raw fetch response.
 * @return 已验证媒体类型与请求 ID / Validated media type and request ID.
 */
function validateResponseHeaders(response: Response): ValidatedResponseHeaders {
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

  return { mediaType, requestId: responseRequestId }
}

/**
 * @brief 完整解析并抛出 RFC 9457 Problem / Fully parse and throw an RFC 9457 Problem.
 * @param response 非成功响应 / Non-success response.
 * @param headers 已验证公共响应头 / Validated common response headers.
 * @param maximumBytes Problem body 上限 / Problem body limit.
 * @param now 当前 epoch 毫秒 / Current epoch milliseconds.
 */
async function throwProblemResponse(
  response: Response,
  headers: ValidatedResponseHeaders,
  maximumBytes: number,
  now: number
): Promise<never> {
  if (headers.mediaType !== 'application/problem+json') {
    throw new ApiV2ContractError(
      'API v2 error response must use application/problem+json.',
      response.status
    )
  }
  /** @brief 语法有效但尚未按 Problem Schema 验证的 JSON / Syntactically valid JSON awaiting Problem-schema validation. */
  const data = await readBoundedJson(response, {
    context: 'API v2 response',
    maximumBytes
  })
  /** @brief 已完整验证的 Problem / Fully validated Problem. */
  const problem = parseProblemDetails(data, response.status)
  if (problem.request_id !== headers.requestId) {
    throw new ApiV2ContractError(
      'API v2 Problem request_id must match X-Request-Id.',
      response.status
    )
  }
  throw new ApiV2ProblemError(problem, parseRetryAfter(response.headers.get('Retry-After'), now))
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
  /** @brief 已验证公共响应头 / Validated common response headers. */
  const headers = validateResponseHeaders(response)

  if (!response.ok) return await throwProblemResponse(response, headers, maximumBytes, now)
  if (headers.mediaType !== 'application/json') {
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
  return { data, headers: response.headers, status: response.status }
}

/**
 * @brief 严格解析 204 success 或共享 Problem 响应 / Strictly parse a 204 success or shared Problem response.
 * @param response 原始 fetch 响应 / Raw fetch response.
 * @param maximumBytes Problem body 上限 / Problem body limit.
 * @param now 当前 epoch 毫秒 / Current epoch milliseconds.
 * @return 已验证请求 ID / Validated request ID.
 */
async function parseNoContentResponse(
  response: Response,
  maximumBytes: number,
  now: number
): Promise<string> {
  /** @brief 已验证公共响应头 / Validated common response headers. */
  const headers = validateResponseHeaders(response)
  if (!response.ok) return await throwProblemResponse(response, headers, maximumBytes, now)
  if (response.status !== 204) {
    throw new ApiV2ContractError('API v2 DELETE success status must be 204.', response.status)
  }
  if (
    headers.mediaType !== '' ||
    response.body !== null ||
    response.headers.get('Content-Length') !== null
  ) {
    throw new ApiV2ContractError('API v2 204 response must not contain a representation.', 204)
  }
  return headers.requestId
}

/** @brief 单次 Product API HTTP 尝试的输入 / Input for one Product API HTTP attempt. */
interface ProductRequestAttempt<TResponse> {
  /** @brief 当前请求 URL / Current request URL. */
  readonly requestUrl: URL
  /** @brief 受保护请求实际使用的 Bearer token；公开请求省略 / Bearer token used by a protected request; omitted for a public request. */
  readonly accessToken?: string
  /** @brief 当前界面语言 / Current UI language. */
  readonly acceptLanguage: string | undefined
  /** @brief HTTP 方法 / HTTP method. */
  readonly method: 'DELETE' | 'GET' | 'PATCH' | 'POST'
  /** @brief 已预验证且冻结的可选请求 body / Optional prevalidated and frozen request body. */
  readonly body?: string
  /** @brief 可选请求媒体类型 / Optional request media type. */
  readonly contentType?: 'application/json' | 'application/merge-patch+json'
  /** @brief 可选幂等键 / Optional idempotency key. */
  readonly idempotencyKey?: string
  /** @brief 可选强并发前置条件 / Optional strong concurrency precondition. */
  readonly ifMatch?: string
  /** @brief 网络实现 / Network implementation. */
  readonly fetchImpl: typeof fetch
  /** @brief 请求 ID 工厂 / Request-ID factory. */
  readonly requestIdFactory: () => string
  /** @brief 当前逻辑操作已经使用的 request ID / Request IDs already used by the current logical operation. */
  readonly usedRequestIds: Set<string>
  /** @brief 跨认证与网络阶段共享的截止信号 / Deadline signal shared across authentication and network phases. */
  readonly signal: AbortSignal
  /** @brief 标记 fetch 已进入不可判定的 dispatch 边界 / Mark that fetch entered the outcome-uncertain dispatch boundary. */
  readonly markDispatched: () => void
  /** @brief 当前端点严格响应解析器 / Strict response parser for the current endpoint. */
  readonly parse: (response: Response) => Promise<TResponse>
}

/**
 * @brief 执行一次带独立 request ID 的 Product API 请求 / Execute one Product API request with its own request ID.
 * @param attempt 已验证的尝试输入 / Validated attempt input.
 * @return 已完整解析的 API v2 响应 / Fully parsed API v2 response.
 */
async function performProductRequest<TResponse>(
  attempt: ProductRequestAttempt<TResponse>
): Promise<TResponse> {
  if (attempt.signal.aborted) throw abortReason(attempt.signal)
  /** @brief 本次尝试的新请求 ID / Fresh request ID for this attempt. */
  const requestId = createRequestId(attempt.requestIdFactory)
  if (attempt.usedRequestIds.has(requestId)) {
    throw new ApiV2ContractError('API v2 request attempts require distinct request IDs.')
  }
  attempt.usedRequestIds.add(requestId)
  /** @brief 本次尝试的请求头 / Request headers for this attempt. */
  const headers: Record<string, string> = { 'X-Request-Id': requestId }
  if (attempt.accessToken !== undefined) headers.Authorization = `Bearer ${attempt.accessToken}`
  if (attempt.acceptLanguage !== undefined) headers['Accept-Language'] = attempt.acceptLanguage
  if (attempt.contentType !== undefined) headers['Content-Type'] = attempt.contentType
  if (attempt.idempotencyKey !== undefined) headers['Idempotency-Key'] = attempt.idempotencyKey
  if (attempt.ifMatch !== undefined) headers['If-Match'] = attempt.ifMatch
  attempt.markDispatched()
  /** @brief 原始 fetch 操作 / Raw fetch operation. */
  const fetchOperation = attempt.fetchImpl(attempt.requestUrl.toString(), {
    ...(attempt.body === undefined ? {} : { body: attempt.body }),
    credentials: 'omit',
    headers,
    method: attempt.method,
    redirect: 'error',
    signal: attempt.signal
  })
  /** @brief 原始 fetch 响应 / Raw fetch response. */
  const response = await awaitWithAbort(fetchOperation, attempt.signal)
  return await awaitWithAbort(attempt.parse(response), attempt.signal)
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

/** @brief 单次认证请求的结果与 dispatch 证据 / Result and dispatch evidence for one authenticated request. */
interface AttemptObservation<TResponse> {
  /** @brief 当前尝试 Promise / Promise for the current attempt. */
  readonly operation: Promise<TResponse>
  /** @brief fetch 是否已越过 dispatch 边界 / Whether fetch crossed the dispatch boundary. */
  readonly wasDispatched: () => boolean
}

/** @brief 认证请求生命周期配置 / Authenticated request lifecycle configuration. */
interface AuthenticatedLifecycle<TResponse> {
  /** @brief Access Token 生命周期端口 / Access-token lifecycle port. */
  readonly authentication: ApiV2AuthenticationPort
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly callerSignal: AbortSignal | undefined
  /** @brief 请求总截止毫秒 / Total request deadline in milliseconds. */
  readonly timeoutMilliseconds: number
  /** @brief 创建一次使用指定 token 的请求尝试 / Create one request attempt using the supplied token. */
  readonly attempt: (accessToken: string, signal: AbortSignal) => AttemptObservation<TResponse>
  /** @brief 投影非 401 尝试失败 / Project a non-401 attempt failure. */
  readonly failAttempt: (error: unknown, deadline: RequestDeadline, wasDispatched: boolean) => never
}

/**
 * @brief 执行统一认证、单次严格 401 刷新与条件失效生命周期 / Execute the shared authentication, one strict-401 refresh, and conditional invalidation lifecycle.
 * @param lifecycle 当前端点尝试工厂与失败策略 / Attempt factory and failure policy for the endpoint.
 * @return 首次或认证重放的成功结果 / Successful result from the first or authentication-replay attempt.
 */
async function executeAuthenticatedLifecycle<TResponse>(
  lifecycle: AuthenticatedLifecycle<TResponse>
): Promise<TResponse> {
  /** @brief 当前请求组合截止 / Combined deadline for the current request. */
  const deadline = createRequestDeadline(lifecycle.callerSignal, lifecycle.timeoutMilliseconds)
  try {
    /** @brief 首次尝试实际发送的 token / Token actually sent by the first attempt. */
    let accessToken: string
    try {
      accessToken = await acquireInitialBearerToken(lifecycle.authentication, deadline.signal)
    } catch (error: unknown) {
      throwAuthenticationFailure(error, deadline, lifecycle.callerSignal)
    }

    /** @brief 首次认证请求观察 / First authenticated request observation. */
    const firstAttempt = lifecycle.attempt(accessToken, deadline.signal)
    try {
      return await firstAttempt.operation
    } catch (firstError: unknown) {
      if (!isUnauthorizedProblem(firstError)) {
        lifecycle.failAttempt(firstError, deadline, firstAttempt.wasDispatched())
      }
    }

    /** @brief 401 后重试实际发送的 token / Token actually sent by the retry after 401. */
    let retryAccessToken: string
    try {
      retryAccessToken = await acquireReplacementBearerToken(
        lifecycle.authentication,
        accessToken,
        deadline.signal
      )
    } catch (error: unknown) {
      throwAuthenticationFailure(error, deadline, lifecycle.callerSignal)
    }

    /** @brief 认证重放请求观察 / Authentication-replay request observation. */
    const retryAttempt = lifecycle.attempt(retryAccessToken, deadline.signal)
    try {
      return await retryAttempt.operation
    } catch (retryError: unknown) {
      if (isUnauthorizedProblem(retryError)) {
        invalidateRejectedAccessToken(lifecycle.authentication, retryAccessToken)
      }
      lifecycle.failAttempt(retryError, deadline, retryAttempt.wasDispatched())
    }
  } finally {
    deadline.dispose()
  }
}

/**
 * @brief 将写入尝试失败投影为确定错误或未知结果 / Project a write-attempt failure into a definitive error or unknown outcome.
 * @param error 捕获的尝试错误 / Caught attempt error.
 * @param deadline 当前共享截止 / Current shared deadline.
 * @param callerSignal 调用方取消信号 / Caller cancellation signal.
 * @param wasDispatched 是否越过 dispatch 边界 / Whether the dispatch boundary was crossed.
 * @throws 确定 Problem、本地契约错误或脱敏未知结果 / A definitive Problem, local contract error, or sanitized unknown outcome.
 */
function throwWriteAttemptFailure(
  error: unknown,
  deadline: RequestDeadline,
  callerSignal: AbortSignal | undefined,
  wasDispatched: boolean
): never {
  if (!wasDispatched) throwTransportFailure(error, deadline, callerSignal)
  if (error instanceof ApiV2ProblemError) {
    if (error.problem.status < 500) throw error
    throw new ApiV2WriteOutcomeUnknownError(
      'server',
      error.problem.status,
      error.problem.code,
      error.problem.request_id
    )
  }
  if (error instanceof ApiV2ContractError && error.status === 412) {
    throw error
  }
  if (deadline.timedOut()) throw new ApiV2WriteOutcomeUnknownError('timeout')
  if (callerSignal?.aborted === true) throw new ApiV2WriteOutcomeUnknownError('aborted')
  if (error instanceof ApiV2ContractError) {
    throw new ApiV2WriteOutcomeUnknownError('contract', error.status)
  }
  if (error instanceof ApiV2AuthenticationRequiredError) throw error
  throw new ApiV2WriteOutcomeUnknownError('network')
}

/**
 * @brief 验证同源绝对 Product API Location / Validate an absolute same-origin Product API Location.
 * @param value 原始 Location / Raw Location.
 * @param apiBaseUrl 已验证 Product API 基址 / Validated Product API base URL.
 * @param status 响应状态 / Response status.
 * @return 规范化绝对 Location / Normalized absolute Location.
 */
function trustedWriteLocation(value: string, apiBaseUrl: URL, status: number): string {
  /** @brief Location 必须原样命中的产品 API 前缀 / Product API prefix the Location must match verbatim. */
  const requiredPrefix = `${apiBaseUrl.origin}/api/v2/`
  /** @brief 不含 origin 的原始路径 / Raw path excluding the origin. */
  const rawPath = value.startsWith(apiBaseUrl.origin) ? value.slice(apiBaseUrl.origin.length) : ''
  if (
    value !== value.trim() ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    !value.startsWith(requiredPrefix) ||
    !/^\/api\/v2\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/u.test(rawPath)
  ) {
    throw new ApiV2ContractError('API v2 write response contains an invalid Location.', status)
  }
  /** @brief 绝对 Location URL / Absolute Location URL. */
  let location: URL
  try {
    location = new URL(value)
  } catch {
    throw new ApiV2ContractError('API v2 write response Location must be absolute.', status)
  }
  if (
    location.origin !== apiBaseUrl.origin ||
    location.username !== '' ||
    location.password !== '' ||
    location.hash !== '' ||
    location.search !== '' ||
    location.toString() !== value ||
    !/^\/api\/v2\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/u.test(
      location.pathname
    )
  ) {
    throw new ApiV2ContractError(
      'API v2 write response Location escaped the product API boundary.',
      status
    )
  }
  return location.toString()
}

/**
 * @brief 把内部 Headers 收敛为纯结果元数据 / Project internal Headers into pure-result metadata.
 * @param response 已解析 JSON 响应 / Parsed JSON response.
 * @param apiBaseUrl 已验证 Product API 基址 / Validated Product API base URL.
 * @return 不含 raw Headers 的已验证元数据 / Validated metadata without raw Headers.
 */
function resultWriteResponseMetadata(
  response: ApiV2JsonResponse,
  apiBaseUrl: URL
): ApiV2ResultWriteResponseMetadata {
  /** @brief 原始 ETag / Raw ETag. */
  const rawEntityTag = response.headers.get('ETag')
  /** @brief 已验证强 ETag 或 null / Validated strong ETag or null. */
  let entityTag: string | null = null
  if (rawEntityTag !== null) {
    try {
      entityTag = strongEntityTag(rawEntityTag, 'response.headers.ETag')
    } catch {
      throw new ApiV2ContractError(
        'API v2 mutable write response contains an invalid ETag.',
        response.status
      )
    }
  }
  /** @brief 原始 Location / Raw Location. */
  const rawLocation = response.headers.get('Location')
  /** @brief 已验证绝对 Location 或 null / Validated absolute Location or null. */
  const location =
    rawLocation === null ? null : trustedWriteLocation(rawLocation, apiBaseUrl, response.status)
  /** @brief 已由公共解析器验证的响应请求 ID / Response request ID validated by the common parser. */
  const requestId = response.headers.get('X-Request-Id')
  if (requestId === null) {
    throw new ApiV2ContractError('API v2 response is missing X-Request-Id.', response.status)
  }
  return { entityTag, location, requestId }
}

/**
 * @brief 要求成功更新的强 ETag / Require a strong ETag for a successful update.
 * @param response 已解析 JSON 响应 / Parsed JSON response.
 * @param apiBaseUrl 已验证 Product API 基址 / Validated Product API base URL.
 * @return ETag 非空的元数据 / Metadata with a non-null ETag.
 */
function versionedWriteResponseMetadata(
  response: ApiV2JsonResponse,
  apiBaseUrl: URL
): ApiV2VersionedWriteResponseMetadata {
  /** @brief 先完整验证可选头的基础元数据 / Base metadata after fully validating optional headers. */
  const metadata = resultWriteResponseMetadata(response, apiBaseUrl)
  if (metadata.entityTag === null) {
    throw new ApiV2ContractError(
      'API v2 mutable write response is missing a strong ETag.',
      response.status
    )
  }
  return {
    entityTag: metadata.entityTag,
    location: metadata.location,
    requestId: metadata.requestId
  }
}

/**
 * @brief 要求新建或异步资源的强 ETag 与 Location / Require a strong ETag and Location for a created or asynchronous resource.
 * @param response 已解析 JSON 响应 / Parsed JSON response.
 * @param apiBaseUrl 已验证 Product API 基址 / Validated Product API base URL.
 * @return ETag 与 Location 均非空的元数据 / Metadata with non-null ETag and Location.
 */
function locatedWriteResponseMetadata(
  response: ApiV2JsonResponse,
  apiBaseUrl: URL
): ApiV2LocatedWriteResponseMetadata {
  /** @brief 已要求强 ETag 的元数据 / Metadata already requiring a strong ETag. */
  const metadata = versionedWriteResponseMetadata(response, apiBaseUrl)
  if (metadata.location === null) {
    throw new ApiV2ContractError(
      `API v2 ${response.status} response is missing Location.`,
      response.status
    )
  }
  return {
    entityTag: metadata.entityTag,
    location: metadata.location,
    requestId: metadata.requestId
  }
}

/** @brief 进入公开或认证生命周期前已完全预验证的请求 / Fully prevalidated request entering a public or authenticated lifecycle. */
interface PreparedProductRequest<TResponse> {
  /** @brief 当前请求 URL / Current request URL. */
  readonly requestUrl: URL
  /** @brief HTTP 方法 / HTTP method. */
  readonly method: 'DELETE' | 'GET' | 'PATCH' | 'POST'
  /** @brief 冻结的可选请求 body / Frozen optional request body. */
  readonly body?: string
  /** @brief 可选请求媒体类型 / Optional request media type. */
  readonly contentType?: 'application/json' | 'application/merge-patch+json'
  /** @brief 可选幂等键 / Optional idempotency key. */
  readonly idempotencyKey?: string
  /** @brief 可选强并发前置条件 / Optional strong concurrency precondition. */
  readonly ifMatch?: string
  /** @brief 当前端点严格响应解析器 / Strict response parser for the current endpoint. */
  readonly parse: (response: Response) => Promise<TResponse>
}

/** @brief 已预验证的 POST command 策略 / Prevalidated POST-command policy. */
interface PreparedPostPolicy {
  /** @brief 已验证成功语义 / Validated success semantics. */
  readonly successKind: ApiV2PostSuccessKind
  /** @brief 冻结的成功状态 / Frozen success status. */
  readonly expectedStatus: 200 | 201 | 202
  /** @brief 可选强并发前置条件 / Optional strong concurrency precondition. */
  readonly ifMatch: string | undefined
  /** @brief 已验证幂等键 / Validated idempotency key. */
  readonly idempotencyKey: string
  /** @brief 响应解码上限 / Response decoding limit. */
  readonly maximumResponseBytes: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal: AbortSignal | undefined
}

/** @brief 已验证且可复用的 API v2 transport 依赖 / Validated reusable API v2 transport dependencies. */
interface PreparedApiV2Transport {
  /** @brief 已验证 Product API v2 基址 / Validated Product API v2 base URL. */
  readonly apiBaseUrl: URL
  /** @brief 构造时冻结的可选界面语言 / Optional UI language frozen at construction. */
  readonly acceptLanguage: string | undefined
  /** @brief 网络实现 / Network implementation. */
  readonly fetchImpl: typeof fetch
  /** @brief 测试可替换的当前时间 / Current time, replaceable in tests. */
  readonly now: () => number
  /** @brief 请求 ID 工厂 / Request-ID factory. */
  readonly requestIdFactory: () => string
  /** @brief 每次逻辑操作的总截止时间 / Total deadline for each logical operation. */
  readonly timeoutMilliseconds: number
}

/** @brief 已完全预验证的 GET 及其调用方取消信号 / Fully prevalidated GET and its caller cancellation signal. */
interface PreparedGetRequest {
  /** @brief 不再读取调用方输入的 GET / GET that no longer reads caller input. */
  readonly request: PreparedProductRequest<ApiV2JsonResponse>
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal: AbortSignal | undefined
}

/**
 * @brief 验证并冻结公开与受保护 client 共用的 transport 依赖 / Validate and freeze transport dependencies shared by public and protected clients.
 * @param options origin、语言、deadline 与可替换运行时依赖 / Origin, language, deadline, and replaceable runtime dependencies.
 * @return 不含认证策略的已验证 transport / Validated transport without an authentication policy.
 */
function prepareApiV2Transport(options: ApiV2TransportOptions): PreparedApiV2Transport {
  /** @brief 已验证 API v2 基址 / Validated API v2 base URL. */
  const apiBaseUrl = resolveApiBaseUrl(options.transportProfile)
  /** @brief 网络实现 / Network implementation. */
  const fetchImpl = options.fetchImpl ?? fetch
  if (typeof fetchImpl !== 'function') {
    throw new ApiV2ContractError('API v2 requires a fetch implementation.')
  }
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
  /** @brief 仅读取一次的语言候选值 / Language candidate read exactly once. */
  const acceptLanguageCandidate = options.acceptLanguage
  /** @brief 构造时冻结的已验证语言 / Validated language frozen at construction time. */
  const acceptLanguage =
    acceptLanguageCandidate === undefined
      ? undefined
      : locale(acceptLanguageCandidate, 'request.headers.Accept-Language')
  return {
    acceptLanguage,
    apiBaseUrl,
    fetchImpl,
    now,
    requestIdFactory,
    timeoutMilliseconds
  }
}

/**
 * @brief 一次性验证并冻结一项 API v2 GET / Validate and freeze one API v2 GET exactly once.
 * @param path 相对 Product API path / Relative Product API path.
 * @param requestOptions query、状态、大小与取消策略 / Query, status, size, and cancellation policy.
 * @param transport 已验证共享 transport / Validated shared transport.
 * @return 不再读取调用方对象的 GET / GET that no longer reads caller objects.
 */
function prepareGetRequest(
  path: string,
  requestOptions: ApiV2GetOptions,
  transport: PreparedApiV2Transport
): PreparedGetRequest {
  /** @brief 当前端点冻结的成功状态 / Success status frozen for the current endpoint. */
  const expectedStatus = requestOptions.expectedStatus ?? 200
  if (!Number.isSafeInteger(expectedStatus) || expectedStatus < 200 || expectedStatus > 299) {
    throw new ApiV2ContractError('API v2 expected success status must be a 2xx integer.')
  }
  /** @brief 当前端点响应字节上限 / Response byte limit for the current endpoint. */
  const maximumResponseBytes = validateByteLimit(
    requestOptions.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    ABSOLUTE_MAX_RESPONSE_BYTES,
    'response'
  )
  /** @brief 当前请求 URL / Current request URL. */
  const requestUrl = resolveRequestUrl(path, transport.apiBaseUrl)
  for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
    if (value === null || value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ApiV2ContractError(`API v2 query parameter ${key} must be finite.`)
    }
    requestUrl.searchParams.set(key, String(value))
  }
  return {
    request: {
      method: 'GET',
      parse: (response): Promise<ApiV2JsonResponse> =>
        parseResponse(response, expectedStatus, maximumResponseBytes, transport.now()),
      requestUrl
    },
    signal: requestOptions.signal
  }
}

/**
 * @brief 创建 v2-only Bearer 产品客户端 / Create a v2-only Bearer product client.
 * @param options origin、内存凭证与可替换运行时依赖 / Origin, in-memory credentials, and replaceable runtime dependencies.
 * @return 不含 v1 fallback 的严格客户端 / Strict client without a v1 fallback.
 */
export function createApiV2Client(options: ApiV2ClientOptions): ApiV2HttpClient {
  /** @brief 已验证且冻结的共享 transport / Validated and frozen shared transport. */
  const transport = prepareApiV2Transport(options)
  /** @brief 便于闭包使用的 transport 字段 / Transport fields used throughout the client closure. */
  const { acceptLanguage, apiBaseUrl, fetchImpl, now, requestIdFactory, timeoutMilliseconds } =
    transport
  /** @brief 构造时冻结的认证端口 / Authentication port frozen at construction time. */
  const authentication = options.authentication
  if (
    typeof authentication?.getAccessToken !== 'function' ||
    typeof authentication.refreshAccessToken !== 'function' ||
    typeof authentication.invalidateAccessToken !== 'function'
  ) {
    throw new ApiV2ContractError('API v2 requires a complete authentication lifecycle port.')
  }

  /**
   * @brief 执行一份已预验证请求 / Execute one prevalidated request.
   * @param prepared 不再读取调用方可变输入的请求 / Request that no longer reads mutable caller input.
   * @param callerSignal 调用方取消信号 / Caller cancellation signal.
   * @param operationKind 读写失败语义 / Read-versus-write failure semantics.
   * @return 严格解析后的端点结果 / Strictly parsed endpoint result.
   */
  function executePrepared<TResponse>(
    prepared: PreparedProductRequest<TResponse>,
    callerSignal: AbortSignal | undefined,
    operationKind: 'read' | 'write'
  ): Promise<TResponse> {
    /** @brief 逻辑操作内用于保证每次尝试 request ID 唯一的集合 / Set ensuring each attempt has a unique request ID within one logical operation. */
    const usedRequestIds = new Set<string>()
    return executeAuthenticatedLifecycle({
      authentication,
      callerSignal,
      timeoutMilliseconds,
      attempt(accessToken, signal): AttemptObservation<TResponse> {
        /** @brief 当前尝试是否越过 dispatch 边界 / Whether this attempt crossed the dispatch boundary. */
        let wasDispatched = false
        /** @brief 当前认证请求 Promise / Promise for the current authenticated request. */
        const operation = performProductRequest({
          acceptLanguage,
          accessToken,
          ...(prepared.body === undefined ? {} : { body: prepared.body }),
          ...(prepared.contentType === undefined ? {} : { contentType: prepared.contentType }),
          fetchImpl,
          ...(prepared.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: prepared.idempotencyKey }),
          ...(prepared.ifMatch === undefined ? {} : { ifMatch: prepared.ifMatch }),
          markDispatched(): void {
            wasDispatched = true
          },
          method: prepared.method,
          parse: prepared.parse,
          requestIdFactory,
          requestUrl: prepared.requestUrl,
          signal,
          usedRequestIds
        })
        return { operation, wasDispatched: (): boolean => wasDispatched }
      },
      failAttempt(error, deadline, wasDispatched): never {
        if (operationKind === 'write') {
          throwWriteAttemptFailure(error, deadline, callerSignal, wasDispatched)
        }
        throwTransportFailure(error, deadline, callerSignal)
      }
    })
  }

  /**
   * @brief 一次性预验证 POST command 策略 / Prevalidate a POST-command policy exactly once.
   * @param requestOptions 调用方 POST 选项 / Caller POST options.
   * @return 不再读取调用方输入的冻结策略 / Frozen policy that no longer reads caller input.
   */
  function preparePostPolicy(
    requestOptions: ApiV2PostJsonOptions | ApiV2PostEmptyOptions | undefined
  ): PreparedPostPolicy {
    /** @brief 已验证成功语义 / Validated success semantics. */
    const successKind = postSuccessKind(requestOptions?.successKind)
    return {
      expectedStatus: postSuccessStatus(successKind),
      ifMatch: postIfMatch(successKind, requestOptions?.ifMatch),
      idempotencyKey: idempotencyKey(requestOptions?.idempotencyKey),
      maximumResponseBytes: validateByteLimit(
        requestOptions?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        ABSOLUTE_MAX_RESPONSE_BYTES,
        'response'
      ),
      signal: requestOptions?.signal,
      successKind
    }
  }

  /**
   * @brief 通过共享 parser 构造类型化写 JSON 响应 / Build a typed write JSON response through the shared parser.
   * @param response 原始 fetch 响应 / Raw fetch response.
   * @param policy 已冻结 POST 策略 / Frozen POST policy.
   * @return 不暴露 raw Headers 的写响应 / Write response without raw Headers.
   */
  async function parsePostResponse(
    response: Response,
    policy: PreparedPostPolicy
  ): Promise<ApiV2WriteJsonResponse> {
    /** @brief 内部带 raw Headers 的解析结果 / Internal parsed result carrying raw Headers. */
    const parsed = await parseResponse(
      response,
      policy.expectedStatus,
      policy.maximumResponseBytes,
      now()
    )
    switch (policy.successKind) {
      case 'created-resource':
        return {
          data: parsed.data,
          metadata: locatedWriteResponseMetadata(parsed, apiBaseUrl),
          status: 201
        }
      case 'accepted-resource':
        return {
          data: parsed.data,
          metadata: locatedWriteResponseMetadata(parsed, apiBaseUrl),
          status: 202
        }
      case 'query-result':
        return {
          data: parsed.data,
          metadata: resultWriteResponseMetadata(parsed, apiBaseUrl),
          status: 200
        }
      case 'updated-resource':
      case 'updated-result':
        return {
          data: parsed.data,
          metadata: versionedWriteResponseMetadata(parsed, apiBaseUrl),
          status: 200
        }
    }
  }

  return {
    async getJson(path, requestOptions = {}): Promise<ApiV2JsonResponse> {
      /** @brief 已一次性验证的 GET / GET validated exactly once. */
      const prepared = prepareGetRequest(path, requestOptions, transport)
      return await executePrepared(prepared.request, prepared.signal, 'read')
    },

    async postJson<TKind extends ApiV2PostSuccessKind>(
      path: string,
      body: unknown,
      requestOptions: ApiV2PostJsonOptions<TKind>
    ): Promise<ApiV2PostJsonResponse<TKind>> {
      /** @brief 已冻结 POST command 策略 / Frozen POST-command policy. */
      const policy = preparePostPolicy(requestOptions)
      /** @brief 当前端点请求字节上限 / Request byte limit for the current endpoint. */
      const maximumRequestBytes = validateByteLimit(
        requestOptions?.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
        ABSOLUTE_MAX_REQUEST_BYTES,
        'request'
      )
      /** @brief 完整预序列化 JSON body / Fully pre-serialized JSON body. */
      const serializedBody = serializeJsonRequest(body, maximumRequestBytes)
      /** @brief 已验证请求 URL / Validated request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)

      /** @brief 按运行时判别语义严格解析的响应 / Response strictly parsed from the runtime semantics discriminant. */
      const response = await executePrepared(
        {
          body: serializedBody,
          contentType: 'application/json',
          idempotencyKey: policy.idempotencyKey,
          ...(policy.ifMatch === undefined ? {} : { ifMatch: policy.ifMatch }),
          method: 'POST',
          parse: (response): Promise<ApiV2WriteJsonResponse> => parsePostResponse(response, policy),
          requestUrl
        },
        policy.signal,
        'write'
      )
      return response as ApiV2PostJsonResponse<TKind>
    },

    async postEmpty<TKind extends ApiV2PostSuccessKind>(
      path: string,
      requestOptions: ApiV2PostEmptyOptions<TKind>
    ): Promise<ApiV2PostJsonResponse<TKind>> {
      /** @brief 已冻结空 POST command 策略 / Frozen empty-POST command policy. */
      const policy = preparePostPolicy(requestOptions)
      /** @brief 已验证请求 URL / Validated request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)

      /** @brief 按运行时判别语义严格解析的响应 / Response strictly parsed from the runtime semantics discriminant. */
      const response = await executePrepared(
        {
          idempotencyKey: policy.idempotencyKey,
          ...(policy.ifMatch === undefined ? {} : { ifMatch: policy.ifMatch }),
          method: 'POST',
          parse: (response): Promise<ApiV2WriteJsonResponse> => parsePostResponse(response, policy),
          requestUrl
        },
        policy.signal,
        'write'
      )
      return response as ApiV2PostJsonResponse<TKind>
    },

    async patchJson(path, body, requestOptions): Promise<ApiV2UpdatedWriteJsonResponse> {
      /** @brief 已验证强 If-Match / Validated strong If-Match. */
      const ifMatch = strongEntityTag(requestOptions?.ifMatch, 'request.headers.If-Match')
      /** @brief 当前端点请求字节上限 / Request byte limit for the current endpoint. */
      const maximumRequestBytes = validateByteLimit(
        requestOptions?.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
        ABSOLUTE_MAX_REQUEST_BYTES,
        'request'
      )
      /** @brief 当前端点响应字节上限 / Response byte limit for the current endpoint. */
      const maximumResponseBytes = validateByteLimit(
        requestOptions?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        ABSOLUTE_MAX_RESPONSE_BYTES,
        'response'
      )
      /** @brief 完整预序列化 merge patch / Fully pre-serialized merge patch. */
      const serializedBody = serializeJsonRequest(body, maximumRequestBytes)
      /** @brief 已验证请求 URL / Validated request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)

      return await executePrepared(
        {
          body: serializedBody,
          contentType: 'application/merge-patch+json',
          ifMatch,
          method: 'PATCH',
          async parse(response): Promise<ApiV2UpdatedWriteJsonResponse> {
            /** @brief 内部带 raw Headers 的解析结果 / Internal parsed result carrying raw Headers. */
            const parsed = await parseResponse(response, 200, maximumResponseBytes, now())
            return {
              data: parsed.data,
              metadata: versionedWriteResponseMetadata(parsed, apiBaseUrl),
              status: 200
            }
          },
          requestUrl
        },
        requestOptions?.signal,
        'write'
      )
    },

    async deleteAcceptedJson(path, requestOptions): Promise<ApiV2AcceptedResourceResponse> {
      /** @brief 已验证强 If-Match / Validated strong If-Match. */
      const ifMatch = strongEntityTag(requestOptions?.ifMatch, 'request.headers.If-Match')
      /** @brief 当前端点响应字节上限 / Response byte limit for the endpoint. */
      const maximumResponseBytes = validateByteLimit(
        requestOptions?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        ABSOLUTE_MAX_RESPONSE_BYTES,
        'response'
      )
      /** @brief 已验证请求 URL / Validated request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)

      return await executePrepared(
        {
          ifMatch,
          method: 'DELETE',
          async parse(response): Promise<ApiV2AcceptedResourceResponse> {
            /** @brief 内部带 raw Headers 的解析结果 / Internal parsed result carrying raw Headers. */
            const parsed = await parseResponse(response, 202, maximumResponseBytes, now())
            return {
              data: parsed.data,
              metadata: locatedWriteResponseMetadata(parsed, apiBaseUrl),
              status: 202
            }
          },
          requestUrl
        },
        requestOptions?.signal,
        'write'
      )
    },

    async deleteNoContent(path, requestOptions): Promise<ApiV2NoContentResponse> {
      /** @brief 已验证强 If-Match / Validated strong If-Match. */
      const ifMatch = strongEntityTag(requestOptions?.ifMatch, 'request.headers.If-Match')
      /** @brief 当前端点 Problem 响应字节上限 / Problem response byte limit for the current endpoint. */
      const maximumResponseBytes = validateByteLimit(
        requestOptions?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        ABSOLUTE_MAX_RESPONSE_BYTES,
        'response'
      )
      /** @brief 已验证请求 URL / Validated request URL. */
      const requestUrl = resolveRequestUrl(path, apiBaseUrl)

      return await executePrepared(
        {
          ifMatch,
          method: 'DELETE',
          async parse(response): Promise<ApiV2NoContentResponse> {
            /** @brief 公共解析器验证的请求 ID / Request ID validated by the common parser. */
            const requestId = await parseNoContentResponse(response, maximumResponseBytes, now())
            return {
              metadata: { entityTag: null, location: null, requestId },
              status: 204
            }
          },
          requestUrl
        },
        requestOptions?.signal,
        'write'
      )
    }
  }
}

/**
 * @brief 创建不会读取或发送 Bearer 的 API v2 公开只读客户端 / Create a public read-only API v2 client that neither reads nor sends a Bearer token.
 * @param options origin、语言、deadline 与可替换运行时依赖 / Origin, language, deadline, and replaceable runtime dependencies.
 * @return 仅适用于契约公开资源的严格 GET client / Strict GET client only for resources declared public by the contract.
 * @note 端点模块决定哪些资源公开；该 transport 不提供写方法或认证重放 / Endpoint modules decide which resources are public; this transport exposes neither writes nor authentication replay.
 */
export function createApiV2PublicClient(options: ApiV2PublicClientOptions = {}): ApiV2Client {
  /** @brief 已验证且冻结的公开 transport / Validated and frozen public transport. */
  const transport = prepareApiV2Transport(options)

  return {
    async getJson(path, requestOptions = {}): Promise<ApiV2JsonResponse> {
      /** @brief 已一次性验证的公开 GET / Public GET validated exactly once. */
      const prepared = prepareGetRequest(path, requestOptions, transport)
      /** @brief 当前公开读取的组合截止 / Combined deadline for the current public read. */
      const deadline = createRequestDeadline(prepared.signal, transport.timeoutMilliseconds)
      try {
        return await performProductRequest({
          acceptLanguage: transport.acceptLanguage,
          fetchImpl: transport.fetchImpl,
          markDispatched: (): void => undefined,
          method: prepared.request.method,
          parse: prepared.request.parse,
          requestIdFactory: transport.requestIdFactory,
          requestUrl: prepared.request.requestUrl,
          signal: deadline.signal,
          usedRequestIds: new Set<string>()
        })
      } catch (error: unknown) {
        throwTransportFailure(error, deadline, prepared.signal)
      } finally {
        deadline.dispose()
      }
    }
  }
}
