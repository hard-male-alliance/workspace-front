/** @file Native OAuth loopback HTTP 接收器测试 / Native OAuth loopback HTTP receiver tests. */

import { createConnection } from 'node:net'
import type { Socket } from 'node:net'

import {
  createNativeAuthorizationRequest,
  OAuthAuthorizationResponseError,
  type NativeAuthorizationTransaction,
  type OidcDiscoveryDocument
} from '@ai-job-workspace/product-api-v2/native-oauth'
import { describe, expect, it } from 'vitest'

import {
  bindNativeOAuthLoopbackReceiver,
  NativeOAuthLoopbackCancelledError,
  NativeOAuthLoopbackTimeoutError,
  type BoundNativeOAuthLoopbackReceiver
} from './native-oauth-loopback'

/** @brief API STANDARD V2 discovery fixture / API STANDARD V2 discovery fixture. */
const DISCOVERY: OidcDiscoveryDocument = {
  authorizationEndpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
  idTokenSigningAlgorithms: ['ES256', 'RS256'],
  issuer: 'https://api.hmalliances.org:8022',
  jwksUri: 'https://api.hmalliances.org:8022/oauth/jwks',
  revocationEndpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
  scopesSupported: ['openid', 'profile', 'offline_access', 'workspace.read'],
  tokenEndpoint: 'https://api.hmalliances.org:8022/oauth/token',
  userinfoEndpoint: 'https://api.hmalliances.org:8022/userinfo'
}

/** @brief 测试 authorization code / Test authorization code. */
const AUTHORIZATION_CODE = 'authorization_code_returned_once'

/** @brief 原始 HTTP 响应投影 / Raw HTTP response projection. */
interface RawHttpResponse {
  /** @brief 原始 response 文本 / Raw response text. */
  readonly text: string
  /** @brief HTTP 状态码 / HTTP status code. */
  readonly status: number
}

/**
 * @brief 在已绑定 receiver 上创建真实 native 事务 / Create a real native transaction for a bound receiver.
 * @param receiver 已绑定 receiver / Bound receiver.
 * @return native transaction / Native transaction.
 */
async function createTransaction(
  receiver: BoundNativeOAuthLoopbackReceiver
): Promise<NativeAuthorizationTransaction> {
  /** @brief 真实 product-api native request / Real product-api native request. */
  const request = await createNativeAuthorizationRequest({
    boundLoopbackOrigin: receiver.origin,
    clientId: 'workspace-desktop',
    discovery: DISCOVERY,
    offlineAccessConsent: 'request',
    scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
    screenHint: 'login'
  })
  return request.transaction
}

/**
 * @brief 构造成功或错误 callback 的 raw request target / Build the raw request target for a success or error callback.
 * @param transaction 原始 native 事务 / Original native transaction.
 * @param parameters code/error 与可选安全字段覆盖 / Code/error parameters and optional security-field overrides.
 * @return 以 `/` 开头的 request target / Request target beginning with `/`.
 */
function callbackTarget(
  transaction: NativeAuthorizationTransaction,
  parameters: Readonly<
    | { readonly code: string; readonly state?: string; readonly issuer?: string }
    | { readonly error: string; readonly state?: string; readonly issuer?: string }
  >
): string {
  /** @brief callback URL builder / Callback URL builder. */
  const callback = new URL(transaction.redirectUri)
  if ('code' in parameters) {
    callback.searchParams.set('code', parameters.code)
  } else {
    callback.searchParams.set('error', parameters.error)
  }
  callback.searchParams.set('state', parameters.state ?? transaction.state)
  callback.searchParams.set('iss', parameters.issuer ?? transaction.issuer)
  return `${callback.pathname}${callback.search}`
}

/**
 * @brief 直接向 loopback socket 写 raw HTTP，允许验证恶意 Host 与 body / Write raw HTTP to the loopback socket so hostile Host and body cases are testable.
 * @param origin 实际绑定 origin / Actually bound origin.
 * @param request 完整 raw HTTP request / Complete raw HTTP request.
 * @return 收齐并关闭后的 raw response / Raw response after collection and close.
 */
function sendRawHttp(origin: string, request: string): Promise<RawHttpResponse> {
  /** @brief 解析后的绑定 origin / Parsed bound origin. */
  const url = new URL(origin)
  return new Promise<RawHttpResponse>((resolve, reject): void => {
    /** @brief 响应 chunks / Response chunks. */
    const chunks: Buffer[] = []
    /** @brief 直连 loopback 的 TCP socket / TCP socket connected directly to loopback. */
    const socket: Socket = createConnection({ host: url.hostname, port: Number(url.port) })
    socket.setTimeout(2_000)
    socket.once('connect', (): void => {
      socket.write(request)
    })
    socket.on('data', (chunk: Buffer): void => {
      chunks.push(chunk)
    })
    socket.once('timeout', (): void => {
      socket.destroy(new Error('Raw loopback request timed out.'))
    })
    socket.once('error', reject)
    socket.once('close', (): void => {
      /** @brief UTF-8 HTTP response / UTF-8 HTTP response. */
      const text = Buffer.concat(chunks).toString('utf8')
      /** @brief status-line 状态码 / Status code from the status line. */
      const status = Number(/^HTTP\/1\.1 ([0-9]{3})/u.exec(text)?.[1] ?? 0)
      resolve({ status, text })
    })
  })
}

/**
 * @brief 发送关闭连接的 GET / Send a connection-closing GET.
 * @param receiver 已绑定 receiver / Bound receiver.
 * @param target raw request target / Raw request target.
 * @param hostHeader 故意不可信的 Host 值 / Deliberately untrusted Host value.
 * @return raw response / Raw response.
 */
function get(
  receiver: BoundNativeOAuthLoopbackReceiver,
  target: string,
  hostHeader = 'attacker.invalid'
): Promise<RawHttpResponse> {
  return sendRawHttp(
    receiver.origin,
    `GET ${target} HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`
  )
}

describe('bindNativeOAuthLoopbackReceiver', (): void => {
  it('selects only an available IPv6 or IPv4 literal when the host is not pinned', async (): Promise<void> => {
    /** @brief 默认能力探测 receiver / Receiver using default capability probing. */
    const receiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 2_000
    })

    expect(receiver.origin).toMatch(/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/u)
    receiver.cancel()
  })

  it('binds an OS-assigned IP-loopback port, ignores Host, validates the exact callback, and closes', async (): Promise<void> => {
    /** @brief 只使用 IPv4 以保证测试环境确定性 / IPv4-only receiver for deterministic test environments. */
    const receiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 2_000,
      hosts: ['127.0.0.1']
    })
    /** @brief factory 在绑定后创建的真实事务 / Real transaction created by the factory after binding. */
    const transaction = await createTransaction(receiver)
    /** @brief 已 armed 的唯一 callback / Sole armed callback. */
    const callback = receiver.waitForCallback(transaction)
    /** @brief 恶意 Host 下的精确 callback response / Exact callback response sent with a hostile Host. */
    const response = await get(receiver, callbackTarget(transaction, { code: AUTHORIZATION_CODE }))

    await expect(callback).resolves.toEqual({ code: AUTHORIZATION_CODE })
    expect(receiver.origin).toMatch(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u)
    expect(transaction.redirectUri.startsWith(`${receiver.origin}/oauth/callback/`)).toBe(true)
    expect(transaction.redirectUri.split('/').at(-1)).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(response.status).toBe(200)
    expect(response.text).toContain('Cache-Control: no-store')
    expect(response.text).toContain("Content-Security-Policy: default-src 'none'")
    expect(response.text).not.toContain(AUTHORIZATION_CODE)
    expect(response.text).not.toContain(transaction.state)
  })

  it.each([
    ['state', { error: 'access_denied', state: 'A'.repeat(43) }],
    ['issuer', { error: 'access_denied', issuer: 'https://attacker.invalid' }]
  ] as const)(
    'rejects an OAuth error callback whose %s is invalid before exposing the error',
    async (_field, parameters): Promise<void> => {
      /** @brief 独立 receiver / Independent receiver. */
      const receiver = await bindNativeOAuthLoopbackReceiver({
        callbackTimeoutMilliseconds: 2_000,
        hosts: ['127.0.0.1']
      })
      /** @brief 独立 native 事务 / Independent native transaction. */
      const transaction = await createTransaction(receiver)
      /** @brief 等待安全失败的 callback / Callback expected to fail safely. */
      const callback = receiver.waitForCallback(transaction)
      void callback.catch((): undefined => undefined)
      /** @brief 通用失败页面 / Generic failure page. */
      const response = await get(receiver, callbackTarget(transaction, parameters))

      await expect(callback).rejects.not.toBeInstanceOf(OAuthAuthorizationResponseError)
      expect(response.status).toBe(400)
      expect(response.text).not.toContain('access_denied')
      /** @brief 攻击者提供的安全字段 / Attacker-supplied security field. */
      const hostileValue = 'state' in parameters ? parameters.state : parameters.issuer
      expect(response.text).not.toContain(hostileValue)
    }
  )

  it('accepts a standards error only after state and issuer validation, then closes terminally', async (): Promise<void> => {
    /** @brief 独立 receiver / Independent receiver. */
    const receiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 2_000,
      hosts: ['127.0.0.1']
    })
    /** @brief 独立 native 事务 / Independent native transaction. */
    const transaction = await createTransaction(receiver)
    /** @brief 等待标准授权拒绝 / Wait for a standard authorization denial. */
    const callback = receiver.waitForCallback(transaction)
    void callback.catch((): undefined => undefined)
    /** @brief 不反射错误码的失败页面 / Failure page that reflects no error code. */
    const response = await get(receiver, callbackTarget(transaction, { error: 'access_denied' }))

    await expect(callback).rejects.toBeInstanceOf(OAuthAuthorizationResponseError)
    expect(response.status).toBe(400)
    expect(response.text).not.toContain('access_denied')
  })

  it('does not let wrong paths, methods, bodies, or oversized targets consume the callback', async (): Promise<void> => {
    /** @brief 独立 receiver / Independent receiver. */
    const receiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 2_000,
      hosts: ['127.0.0.1']
    })
    /** @brief 独立 native 事务 / Independent native transaction. */
    const transaction = await createTransaction(receiver)
    /** @brief 随机精确 path / Random exact path. */
    const path = new URL(transaction.redirectUri).pathname
    /** @brief 等待最终合法 callback / Wait for the eventual valid callback. */
    const callback = receiver.waitForCallback(transaction)

    await expect(get(receiver, '/oauth/callback/not-the-random-target')).resolves.toMatchObject({
      status: 404
    })
    await expect(
      sendRawHttp(
        receiver.origin,
        `POST ${path} HTTP/1.1\r\nHost: ignored.invalid\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`
      )
    ).resolves.toMatchObject({ status: 405 })
    await expect(
      sendRawHttp(
        receiver.origin,
        `GET ${path} HTTP/1.1\r\nHost: ignored.invalid\r\nContent-Length: 1\r\nConnection: close\r\n\r\nx`
      )
    ).resolves.toMatchObject({ status: 400 })
    await expect(get(receiver, `/${'x'.repeat(9_000)}`)).resolves.toMatchObject({
      status: 400
    })
    await expect(
      sendRawHttp(
        receiver.origin,
        `GET ${path} HTTP/1.1\r\nHost: ignored.invalid\r\nX-Fill: ${'x'.repeat(9_000)}\r\nConnection: close\r\n\r\n`
      )
    ).resolves.toMatchObject({ status: 400 })
    /** @brief 超过 header-count 上限的 raw headers / Raw headers exceeding the count limit. */
    const excessHeaders = Array.from(
      { length: 33 },
      (_value, index): string => `X-Probe-${index}: x\r\n`
    ).join('')
    await expect(
      sendRawHttp(
        receiver.origin,
        `GET ${path} HTTP/1.1\r\nHost: ignored.invalid\r\n${excessHeaders}Connection: close\r\n\r\n`
      )
    ).resolves.toMatchObject({ status: 431 })

    /** @brief 非法探测之后的合法 response / Valid response after invalid probes. */
    const validResponse = await get(
      receiver,
      callbackTarget(transaction, { code: AUTHORIZATION_CODE })
    )
    await expect(callback).resolves.toEqual({ code: AUTHORIZATION_CODE })
    expect(validResponse.status).toBe(200)
  })

  it('times out or cancels once and closes without accepting a later callback', async (): Promise<void> => {
    /** @brief 短截止 receiver / Receiver with a short deadline. */
    const timeoutReceiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 20,
      hosts: ['127.0.0.1']
    })
    /** @brief 超时事务 / Transaction that will time out. */
    const timeoutTransaction = await createTransaction(timeoutReceiver)
    await expect(timeoutReceiver.waitForCallback(timeoutTransaction)).rejects.toBeInstanceOf(
      NativeOAuthLoopbackTimeoutError
    )

    /** @brief 取消 receiver / Receiver cancelled explicitly. */
    const cancelledReceiver = await bindNativeOAuthLoopbackReceiver({
      callbackTimeoutMilliseconds: 2_000,
      hosts: ['127.0.0.1']
    })
    /** @brief 取消事务 / Cancelled transaction. */
    const cancelledTransaction = await createTransaction(cancelledReceiver)
    /** @brief 被取消 callback / Callback cancelled before arrival. */
    const cancelled = cancelledReceiver.waitForCallback(cancelledTransaction)
    cancelledReceiver.cancel()
    cancelledReceiver.cancel()
    await expect(cancelled).rejects.toBeInstanceOf(NativeOAuthLoopbackCancelledError)
  })
})
