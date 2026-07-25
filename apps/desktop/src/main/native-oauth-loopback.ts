/** @file Native OAuth loopback HTTP 接收边界 / Native OAuth loopback HTTP receiving boundary. */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

import {
  parseAuthorizationCallback,
  type AuthorizationCodeResponse,
  type NativeAuthorizationTransaction
} from '@ai-job-workspace/product-api-v2/native-oauth'

/** @brief 契约允许的 IP loopback literal / IP loopback literals permitted by the contract. */
export type NativeOAuthLoopbackHost = '127.0.0.1' | '::1'

/** @brief 默认优先 IPv6，再回退 IPv4 / Prefer IPv6 by default, then fall back to IPv4. */
const DEFAULT_LOOPBACK_HOSTS = Object.freeze(['::1', '127.0.0.1'] as const)

/** @brief 授权回调默认最长等待时间 / Default maximum authorization-callback wait. */
const DEFAULT_CALLBACK_TIMEOUT_MILLISECONDS = 5 * 60 * 1000

/** @brief 授权回调允许的最长等待时间 / Maximum permitted authorization-callback wait. */
const MAX_CALLBACK_TIMEOUT_MILLISECONDS = 10 * 60 * 1000

/** @brief 单个 HTTP request target 最大字节数 / Maximum bytes in one HTTP request target. */
const MAX_REQUEST_TARGET_BYTES = 8 * 1024

/** @brief 单个 HTTP header block 最大字节数 / Maximum bytes in one HTTP header block. */
const MAX_HEADER_BYTES = 8 * 1024

/** @brief HTTP headers 与 request 的短截止 / Short deadline for HTTP headers and a request. */
const HTTP_REQUEST_TIMEOUT_MILLISECONDS = 5_000

/** @brief loopback listener 最大并发连接数 / Maximum concurrent loopback-listener connections. */
const MAX_CONNECTIONS = 16

/** @brief callback listener 最大 header 数 / Maximum callback-listener header count. */
const MAX_HEADERS = 32

/** @brief 成功页固定 HTML；不含 code 或其他回调参数 / Static success HTML containing no code or callback parameter. */
const SUCCESS_HTML =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Authorization complete</title><body><main><h1>Authorization complete</h1><p>You can close this window and return to the application.</p></main></body></html>'

/** @brief 失败页固定 HTML；不反射不可信错误 / Static failure HTML that reflects no untrusted error. */
const FAILURE_HTML =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Authorization not completed</title><body><main><h1>Authorization was not completed</h1><p>You can close this window and return to the application.</p></main></body></html>'

/** @brief 无路由页固定纯文本 / Static text for an unmatched route. */
const NOT_FOUND_TEXT = 'Not found.'

/** @brief 接收器内部状态 / Receiver internal state. */
type ReceiverState = 'bound' | 'armed' | 'terminal'

/**
 * @brief 把未知 throwable 规范化为不反射输入的 Error / Normalize an unknown throwable to an Error without reflecting input.
 * @param value 未知 throwable / Unknown throwable.
 * @return 原 Error 或安全通用错误 / Original Error or a safe generic error.
 */
function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error('Native OAuth callback validation failed.')
}

/** @brief loopback 绑定选项 / Loopback binding options. */
export interface BindNativeOAuthLoopbackOptions {
  /** @brief 依次尝试的精确 loopback IP literals / Exact loopback IP literals to try in order. */
  readonly hosts?: readonly NativeOAuthLoopbackHost[] | undefined
  /** @brief callback 总等待时间 / Total callback wait in milliseconds. */
  readonly callbackTimeoutMilliseconds?: number | undefined
  /** @brief 可选调用方取消信号 / Optional caller cancellation signal. */
  readonly signal?: AbortSignal | undefined
}

/** @brief 已由 OS 绑定端口的 OAuth loopback 接收器 / OAuth loopback receiver whose port is already bound by the OS. */
export interface BoundNativeOAuthLoopbackReceiver {
  /** @brief 实际绑定的 HTTP IP-loopback origin / Actually bound HTTP IP-loopback origin. */
  readonly origin: string

  /**
   * @brief 绑定仅 main 内存事务并等待一次精确 callback / Arm a main-memory-only transaction and await one exact callback.
   * @param transaction 由 native factory 签发的事务 / Transaction issued by the native factory.
   * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
   * @return 已校验的一次性 authorization code / Validated one-time authorization code.
   * @note 错误 OAuth response 也先由共享解析器校验 `state` 与 `iss` / An OAuth error response is also checked for `state` and `iss` by the shared parser first.
   */
  readonly waitForCallback: (
    transaction: NativeAuthorizationTransaction,
    signal?: AbortSignal
  ) => Promise<AuthorizationCodeResponse>

  /**
   * @brief 取消并立即关闭 listener / Cancel and immediately close the listener.
   * @return 无返回值 / No return value.
   */
  readonly cancel: () => void
}

/** @brief 操作系统无法绑定任何允许的 loopback IP / The OS could not bind any permitted loopback IP. */
export class NativeOAuthLoopbackUnavailableError extends Error {
  override readonly name = 'NativeOAuthLoopbackUnavailableError'

  /** @brief 创建不包含底层地址或 callback 的安全错误 / Create a safe error containing no address or callback. */
  constructor() {
    super('A native OAuth loopback listener could not be opened.')
  }
}

/** @brief 等待 callback 达到硬截止 / Waiting for the callback reached its hard deadline. */
export class NativeOAuthLoopbackTimeoutError extends Error {
  override readonly name = 'NativeOAuthLoopbackTimeoutError'

  /** @brief 创建不包含 OAuth 参数的超时错误 / Create a timeout error containing no OAuth parameter. */
  constructor() {
    super('The native OAuth callback timed out.')
  }
}

/** @brief callback 等待被本地主动取消 / Callback waiting was cancelled locally. */
export class NativeOAuthLoopbackCancelledError extends Error {
  override readonly name = 'NativeOAuthLoopbackCancelledError'

  /** @brief 创建不包含 AbortSignal reason 的取消错误 / Create a cancellation error containing no AbortSignal reason. */
  constructor() {
    super('The native OAuth callback was cancelled.')
  }
}

/**
 * @brief 校验 callback 等待时间 / Validate the callback wait duration.
 * @param value 未经信任的毫秒值 / Untrusted millisecond value.
 * @return 有界整数毫秒 / Bounded integer milliseconds.
 */
function callbackTimeoutMilliseconds(value: number | undefined): number {
  /** @brief 调用方值或安全默认值 / Caller value or the safe default. */
  const timeout = value ?? DEFAULT_CALLBACK_TIMEOUT_MILLISECONDS
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > MAX_CALLBACK_TIMEOUT_MILLISECONDS
  ) {
    throw new TypeError(
      `Native OAuth callback timeout must be an integer from 1 to ${MAX_CALLBACK_TIMEOUT_MILLISECONDS} milliseconds.`
    )
  }
  return timeout
}

/**
 * @brief 校验唯一且非空的 loopback host 顺序 / Validate a unique non-empty loopback-host order.
 * @param values 调用方 host 列表 / Caller-supplied host list.
 * @return 冻结的 host 尝试顺序 / Frozen host-attempt order.
 */
function loopbackHosts(
  values: readonly NativeOAuthLoopbackHost[] | undefined
): readonly NativeOAuthLoopbackHost[] {
  /** @brief 实际候选顺序 / Effective candidate order. */
  const candidates = values ?? DEFAULT_LOOPBACK_HOSTS
  if (
    candidates.length === 0 ||
    new Set(candidates).size !== candidates.length ||
    candidates.some((value) => value !== '127.0.0.1' && value !== '::1')
  ) {
    throw new TypeError('Native OAuth loopback hosts must be unique 127.0.0.1 or ::1 literals.')
  }
  return Object.freeze([...candidates])
}

/**
 * @brief 构造实际绑定 origin / Build the actually bound origin.
 * @param host 已绑定 host literal / Bound host literal.
 * @param address Node 返回的地址 / Address returned by Node.
 * @return 精确 HTTP loopback origin / Exact HTTP loopback origin.
 */
function boundOrigin(host: NativeOAuthLoopbackHost, address: AddressInfo): string {
  if (
    address.port < 1 ||
    address.port > 65_535 ||
    (host === '127.0.0.1' && address.address !== '127.0.0.1') ||
    (host === '::1' && address.address !== '::1')
  ) {
    throw new NativeOAuthLoopbackUnavailableError()
  }
  return host === '::1' ? `http://[::1]:${address.port}` : `http://127.0.0.1:${address.port}`
}

/**
 * @brief 判断请求是否声明了 HTTP body / Detect whether a request declares an HTTP body.
 * @param request loopback HTTP 请求 / Loopback HTTP request.
 * @return 存在非零 Content-Length 或 Transfer-Encoding 时为 true / True for non-zero Content-Length or any Transfer-Encoding.
 */
function declaresRequestBody(request: IncomingMessage): boolean {
  /** @brief Content-Length 原始值 / Raw Content-Length value. */
  const contentLength = request.headers['content-length']
  return (
    request.headers['transfer-encoding'] !== undefined ||
    (contentLength !== undefined && contentLength !== '0')
  )
}

/**
 * @brief 写入最小、安全且关闭连接的响应 / Write a minimal safe response that closes the connection.
 * @param response HTTP response / HTTP 响应.
 * @param statusCode HTTP 状态码 / HTTP status code.
 * @param body 静态响应体 / Static response body.
 * @param contentType 静态 media type / Static media type.
 * @return 无返回值 / No return value.
 */
function writeStaticResponse(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: 'text/html; charset=utf-8' | 'text/plain; charset=utf-8'
): void {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    Connection: 'close',
    'Content-Security-Policy':
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(body)
}

/**
 * @brief 从 redirect URI 提取未经规范化的精确 path / Extract the exact non-normalized path from a redirect URI.
 * @param redirectUri factory 创建的 redirect URI / Redirect URI created by the factory.
 * @param origin 已绑定 origin / Bound origin.
 * @return 以斜杠开头的随机 callback path / Random callback path beginning with a slash.
 */
function exactCallbackPath(redirectUri: string, origin: string): string {
  if (!redirectUri.startsWith(`${origin}/`)) {
    throw new TypeError('Native OAuth transaction does not belong to the bound loopback origin.')
  }
  /** @brief origin 之后的原始 path / Raw path after the origin. */
  const path = redirectUri.slice(origin.length)
  if (!/^\/oauth\/callback\/[A-Za-z0-9_-]{43}$/u.test(path)) {
    throw new TypeError('Native OAuth transaction has an invalid loopback callback path.')
  }
  return path
}

/**
 * @brief 停止接收新连接并销毁非终态 socket / Stop accepting new connections and destroy non-terminal sockets.
 * @param server loopback HTTP server / Loopback HTTP server.
 * @param sockets 当前活跃 sockets / Currently active sockets.
 * @param terminalSocket 正在写终态页面的 socket / Socket writing the terminal page.
 * @return 无返回值 / No return value.
 */
function stopAcceptingConnections(
  server: Server,
  sockets: ReadonlySet<Socket>,
  terminalSocket?: Socket
): void {
  server.close()
  server.closeIdleConnections()
  for (const socket of sockets) {
    if (socket !== terminalSocket) socket.destroy()
  }
}

/**
 * @brief 在一个明确 IP literal 上绑定并构造接收器 / Bind one explicit IP literal and construct a receiver.
 * @param host 精确 loopback IP literal / Exact loopback IP literal.
 * @param timeoutMilliseconds callback 总截止 / Total callback deadline.
 * @param bindSignal 绑定阶段取消信号 / Binding-phase cancellation signal.
 * @return 已绑定接收器 / Bound receiver.
 */
async function bindOneLoopbackHost(
  host: NativeOAuthLoopbackHost,
  timeoutMilliseconds: number,
  bindSignal?: AbortSignal
): Promise<BoundNativeOAuthLoopbackReceiver> {
  /** @brief 活跃 TCP sockets / Active TCP sockets. */
  const sockets = new Set<Socket>()
  /** @brief listener 状态 / Listener state. */
  let state: ReceiverState = 'bound'
  /** @brief 实际 origin；listen 成功后设置 / Actual origin, set after listen succeeds. */
  let origin = ''
  /** @brief 当前精确 callback path / Current exact callback path. */
  let callbackPath: string | null = null
  /** @brief callback Promise resolve / Callback Promise resolver. */
  let resolveCallback: ((value: AuthorizationCodeResponse) => void) | null = null
  /** @brief callback Promise reject / Callback Promise rejecter. */
  let rejectCallback: ((reason: unknown) => void) | null = null
  /** @brief callback 超时计时器 / Callback timeout timer. */
  let callbackTimer: NodeJS.Timeout | null = null
  /** @brief 当前调用方取消信号 / Current caller cancellation signal. */
  let callbackSignal: AbortSignal | undefined
  /** @brief 终态错误；只用于终态后拒绝重复 arm / Terminal error used only to reject arming after termination. */
  let terminalError: Error | undefined

  /**
   * @brief 清理 callback 计时器与取消监听 / Clear callback timer and cancellation listener.
   * @return 无返回值 / No return value.
   */
  function clearCallbackWait(): void {
    if (callbackTimer !== null) clearTimeout(callbackTimer)
    callbackTimer = null
    callbackSignal?.removeEventListener('abort', cancel)
    callbackSignal = undefined
  }

  /**
   * @brief 以错误进入唯一终态 / Enter the sole terminal state with an error.
   * @param error 安全错误 / Safe error.
   * @param terminalSocket 可保留至静态响应写完的 socket / Socket retained until its static response finishes.
   * @return 无返回值 / No return value.
   */
  function rejectTerminal(error: Error, terminalSocket?: Socket): void {
    if (state === 'terminal') return
    state = 'terminal'
    terminalError = error
    clearCallbackWait()
    stopAcceptingConnections(server, sockets, terminalSocket)
    rejectCallback?.(error)
    armedTransaction = null
    callbackPath = null
    rejectCallback = null
    resolveCallback = null
  }

  /**
   * @brief 以 authorization code 进入唯一终态 / Enter the sole terminal state with an authorization code.
   * @param code 已严格验证的 code / Strictly validated code.
   * @param terminalSocket 可保留至静态响应写完的 socket / Socket retained until its static response finishes.
   * @return 无返回值 / No return value.
   */
  function resolveTerminal(code: AuthorizationCodeResponse, terminalSocket: Socket): void {
    if (state === 'terminal') return
    state = 'terminal'
    terminalError = undefined
    clearCallbackWait()
    stopAcceptingConnections(server, sockets, terminalSocket)
    resolveCallback?.(code)
    armedTransaction = null
    callbackPath = null
    rejectCallback = null
    resolveCallback = null
  }

  /**
   * @brief 本地主动取消 listener / Cancel the listener locally.
   * @return 无返回值 / No return value.
   */
  function cancel(): void {
    rejectTerminal(new NativeOAuthLoopbackCancelledError())
  }

  /**
   * @brief 处理单个已解析 HTTP 请求 / Handle one parsed HTTP request.
   * @param request loopback request / Loopback 请求.
   * @param response loopback response / Loopback 响应.
   * @return 无返回值 / No return value.
   */
  function handleRequest(request: IncomingMessage, response: ServerResponse): void {
    /** @brief Node 保留的原始 request target / Raw request target retained by Node. */
    const requestTarget = request.url ?? ''
    /** @brief UTF-8 request-target 字节数 / UTF-8 byte length of the request target. */
    const targetBytes = Buffer.byteLength(requestTarget, 'utf8')
    /** @brief 不经折叠的 HTTP header 数 / Number of HTTP headers before name folding. */
    const headerCount = request.rawHeaders.length / 2
    if (!Number.isInteger(headerCount) || headerCount > MAX_HEADERS) {
      writeStaticResponse(response, 431, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
      return
    }
    if (
      requestTarget.length === 0 ||
      !requestTarget.startsWith('/') ||
      requestTarget.includes('#') ||
      targetBytes > MAX_REQUEST_TARGET_BYTES
    ) {
      writeStaticResponse(response, 414, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
      return
    }
    /** @brief query 之前未经 URL 规范化的 path / Non-normalized path before the query. */
    const rawPath = requestTarget.split('?', 1)[0] ?? ''
    if (state !== 'armed' || callbackPath === null || rawPath !== callbackPath) {
      writeStaticResponse(response, 404, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
      return
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      writeStaticResponse(response, 405, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
      return
    }
    if (request.headers.expect !== undefined || declaresRequestBody(request)) {
      writeStaticResponse(response, 400, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
      return
    }

    /** @brief 精确 callback 的当前 socket / Current socket for the exact callback. */
    const terminalSocket = request.socket
    response.once('finish', (): void => {
      terminalSocket.destroy()
    })
    try {
      /** @brief 不依赖 Host header 构造的 callback URL / Callback URL constructed without trusting the Host header. */
      const callbackUrl = `${origin}${requestTarget}`
      /** @brief 共享 parser 验证后的 authorization code / Authorization code validated by the shared parser. */
      const code = parseAuthorizationCallback(
        callbackUrl,
        armedTransaction as NativeAuthorizationTransaction
      )
      resolveTerminal(code, terminalSocket)
      writeStaticResponse(response, 200, SUCCESS_HTML, 'text/html; charset=utf-8')
    } catch (error: unknown) {
      rejectTerminal(errorValue(error), terminalSocket)
      writeStaticResponse(response, 400, FAILURE_HTML, 'text/html; charset=utf-8')
    }
  }

  /** @brief 当前已绑定但仅留在 closure 的事务 / Current armed transaction retained only in this closure. */
  let armedTransaction: NativeAuthorizationTransaction | null = null

  /** @brief 有界且只监听 loopback 的 HTTP server / Bounded HTTP server listening only on loopback. */
  const server = createServer(
    {
      connectionsCheckingInterval: 1_000,
      headersTimeout: HTTP_REQUEST_TIMEOUT_MILLISECONDS,
      keepAliveTimeout: 1_000,
      maxHeaderSize: MAX_HEADER_BYTES,
      requestTimeout: HTTP_REQUEST_TIMEOUT_MILLISECONDS
    },
    handleRequest
  )
  server.maxConnections = MAX_CONNECTIONS
  /** @brief 字节上限后由 handler 精确拒绝 header 数，避免 Node 静默截断安全相关字段 / Let the handler reject the exact count after the byte cap so Node never silently truncates security-relevant fields. */
  server.maxHeadersCount = 0
  server.setTimeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS, (socket): void => {
    socket.destroy()
  })

  server.on('connection', (socket): void => {
    sockets.add(socket)
    socket.once('close', (): void => {
      sockets.delete(socket)
    })
  })
  server.on('checkContinue', (_request, response): void => {
    writeStaticResponse(response, 417, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
  })
  server.on('checkExpectation', (_request, response): void => {
    writeStaticResponse(response, 417, NOT_FOUND_TEXT, 'text/plain; charset=utf-8')
  })
  server.on('clientError', (_error, socket): void => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    } else {
      socket.destroy()
    }
  })

  /** @brief listen 前取消的清理器 / Abort cleanup used before listen completes. */
  let removeBindAbortListener: (() => void) | undefined
  try {
    await new Promise<void>((resolve, reject): void => {
      /** @brief listen 前的 error handler / Error handler before listen succeeds. */
      const rejectBind = (): void => {
        removeBindAbortListener?.()
        reject(new NativeOAuthLoopbackUnavailableError())
      }
      /** @brief listen 前的 abort handler / Abort handler before listen succeeds. */
      const cancelBind = (): void => {
        if (server.listening) server.close()
        removeBindAbortListener?.()
        reject(new NativeOAuthLoopbackCancelledError())
      }
      removeBindAbortListener = (): void => {
        bindSignal?.removeEventListener('abort', cancelBind)
        server.removeListener('error', rejectBind)
      }
      if (bindSignal?.aborted === true) {
        cancelBind()
        return
      }
      bindSignal?.addEventListener('abort', cancelBind, { once: true })
      server.once('error', rejectBind)
      server.listen(
        {
          exclusive: true,
          host,
          ipv6Only: host === '::1',
          port: 0
        },
        (): void => {
          removeBindAbortListener?.()
          resolve()
        }
      )
    })
  } catch (error: unknown) {
    server.close()
    for (const socket of sockets) socket.destroy()
    throw error
  }

  /** @brief Node 报告的实际 TCP 地址 / Actual TCP address reported by Node. */
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new NativeOAuthLoopbackUnavailableError()
  }
  try {
    origin = boundOrigin(host, address)
  } catch (error: unknown) {
    server.close()
    throw error
  }

  server.on('error', (): void => {
    rejectTerminal(new NativeOAuthLoopbackUnavailableError())
  })

  /**
   * @brief 绑定事务并等待精确 callback / Arm a transaction and wait for the exact callback.
   * @param transaction native factory 事务 / Native-factory transaction.
   * @param signal 可选取消信号 / Optional cancellation signal.
   * @return 严格 authorization code / Strict authorization code.
   */
  function waitForCallback(
    transaction: NativeAuthorizationTransaction,
    signal?: AbortSignal
  ): Promise<AuthorizationCodeResponse> {
    if (state !== 'bound') {
      return Promise.reject(
        state === 'terminal'
          ? (terminalError ?? new NativeOAuthLoopbackCancelledError())
          : new TypeError('Native OAuth loopback receiver can only be armed once.')
      )
    }
    if (transaction.kind !== 'native-loopback') {
      /** @brief 非 native 事务错误 / Non-native transaction error. */
      const error = new TypeError('Native OAuth loopback requires a native transaction.')
      rejectTerminal(error)
      return Promise.reject(error)
    }
    try {
      callbackPath = exactCallbackPath(transaction.redirectUri, origin)
    } catch (error: unknown) {
      /** @brief 已规范化的 transaction 错误 / Normalized transaction error. */
      const failure = errorValue(error)
      rejectTerminal(failure)
      return Promise.reject(failure)
    }
    armedTransaction = transaction
    state = 'armed'

    /** @brief 唯一 callback Promise / Sole callback Promise. */
    const callback = new Promise<AuthorizationCodeResponse>((resolve, reject): void => {
      resolveCallback = resolve
      rejectCallback = reject
    })
    callbackTimer = setTimeout((): void => {
      rejectTerminal(new NativeOAuthLoopbackTimeoutError())
    }, timeoutMilliseconds)
    callbackTimer.unref()
    callbackSignal = signal
    if (signal?.aborted === true) {
      cancel()
    } else {
      signal?.addEventListener('abort', cancel, { once: true })
    }
    return callback
  }

  return Object.freeze({ cancel, origin, waitForCallback })
}

/**
 * @brief 先让 OS 在允许的 IP loopback 上绑定随机端口 / Let the OS bind a random port on an allowed IP loopback first.
 * @param options host 顺序、总截止与取消 / Host order, total deadline, and cancellation.
 * @return 已监听且尚未创建 OAuth transaction 的接收器 / Listening receiver created before any OAuth transaction.
 * @note 不绑定 `localhost`、通配地址或固定端口；每个失败 listener 都会关闭后才尝试下一个 / Never binds `localhost`, a wildcard, or a fixed port; each failed listener closes before the next attempt.
 */
export async function bindNativeOAuthLoopbackReceiver(
  options: BindNativeOAuthLoopbackOptions = {}
): Promise<BoundNativeOAuthLoopbackReceiver> {
  /** @brief 经验证的 callback 截止 / Validated callback deadline. */
  const timeoutMilliseconds = callbackTimeoutMilliseconds(options.callbackTimeoutMilliseconds)
  /** @brief 经验证的 loopback 尝试顺序 / Validated loopback attempt order. */
  const hosts = loopbackHosts(options.hosts)
  for (const host of hosts) {
    if (options.signal?.aborted === true) throw new NativeOAuthLoopbackCancelledError()
    try {
      return await bindOneLoopbackHost(host, timeoutMilliseconds, options.signal)
    } catch (error: unknown) {
      if (error instanceof NativeOAuthLoopbackCancelledError) throw error
    }
  }
  throw new NativeOAuthLoopbackUnavailableError()
}
