import { describe, expect, it, vi } from 'vitest'
import {
  API_V2_OAUTH_AUTHORIZATION_ENDPOINT,
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI,
  createNativeAuthorizationRequest,
  type IdTokenSignatureVerifier
} from '@ai-job-workspace/product-api-v2/native-oauth'

import { NativeOAuthSession } from './native-oauth-session'
import type { NativeRefreshGrantStore, NativeStoredRefreshGrant } from './native-oauth-session'

/** @brief 测试 scopes / Test scopes. */
const TEST_SCOPES = Object.freeze(['openid', 'offline_access', 'workspace.read'])

/**
 * @brief 创建测试长期授权 / Create a test long-lived grant.
 * @param refreshToken Refresh Token / Refresh Token.
 * @return 完整授权 / Complete grant.
 */
function grant(refreshToken: string): NativeStoredRefreshGrant {
  return {
    clientId: 'desktop-client',
    identity: {
      audience: ['desktop-client'],
      authorizedParty: null,
      expiresAtEpochSeconds: 20_000,
      issuedAtEpochSeconds: 10_000,
      issuer: API_V2_OAUTH_ISSUER,
      subject: 'subject-1'
    },
    refreshToken,
    scopes: TEST_SCOPES,
    verificationContext: {
      allowedAlgorithms: ['RS256'],
      clientId: 'desktop-client',
      issuer: API_V2_OAUTH_ISSUER,
      jwksUri: API_V2_OAUTH_JWKS_URI,
      nonce: 'nonce-with-enough-entropy-for-test'
    }
  }
}

/** @brief 可观察的内存 grant store / Observable in-memory grant store. */
class TestGrantStore implements NativeRefreshGrantStore {
  /** @brief 当前授权 / Current grant. */
  current: NativeStoredRefreshGrant | null
  /** @brief 下一次 replace 是否失败 / Whether the next replacement fails. */
  failReplace = false
  /** @brief clear 调用次数 / Clear-call count. */
  clearCount = 0
  /** @brief replace 调用次数 / Replace-call count. */
  replaceCount = 0
  /** @brief availability preflight 是否失败 / Whether availability preflight fails. */
  failAvailability = false
  /** @brief clear 是否失败 / Whether local clearing fails. */
  failClear = false

  /**
   * @brief 从初始授权创建 store / Construct a store from an initial grant.
   * @param initial 初始授权 / Initial grant.
   */
  constructor(initial: NativeStoredRefreshGrant | null) {
    this.current = initial
  }

  /** @brief 读取当前授权 / Read the current grant. */
  read(): Promise<NativeStoredRefreshGrant | null> {
    return Promise.resolve(this.current)
  }

  /** @brief 验证测试安全存储可用 / Validate test secure-storage availability. */
  ensureAvailable(): Promise<void> {
    return this.failAvailability
      ? Promise.reject(new Error('injected secure-storage unavailability'))
      : Promise.resolve()
  }

  /** @brief 替换当前授权 / Replace the current grant. */
  replace(next: NativeStoredRefreshGrant): Promise<void> {
    this.replaceCount += 1
    if (this.failReplace) {
      return Promise.reject(new Error('injected atomic replacement failure'))
    }
    this.current = next
    return Promise.resolve()
  }

  /** @brief 清除当前授权 / Clear the current grant. */
  clear(): Promise<void> {
    this.clearCount += 1
    if (this.failClear) return Promise.reject(new Error('injected clear failure'))
    this.current = null
    return Promise.resolve()
  }
}

/**
 * @brief 创建严格 token response / Create a strict token response.
 * @param accessToken Access Token / Access Token.
 * @param refreshToken Refresh Token / Refresh Token.
 * @return HTTP response / HTTP 响应.
 */
function refreshResponse(accessToken: string, refreshToken: string): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 300,
      scope: TEST_SCOPES.join(' '),
      refresh_token: refreshToken
    }),
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        Pragma: 'no-cache'
      },
      status: 200
    }
  )
}

/**
 * @brief 创建可手动兑现的 Promise / Create a manually resolvable Promise.
 * @return promise 与 resolve / Promise and resolver.
 */
function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  /** @brief Promise resolver / Promise 兑现器. */
  let resolvePromise: ((value: T) => void) | undefined
  /** @brief 待手动兑现的 Promise / Promise awaiting manual resolution. */
  const promise = new Promise<T>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value: T): void => {
      if (resolvePromise === undefined) throw new Error('Deferred resolver is unavailable.')
      resolvePromise(value)
    }
  }
}

/** @brief refresh response 无 ID Token 时不会被调用的 verifier / Verifier unused when refresh responses omit ID Tokens. */
const unusedVerifier: IdTokenSignatureVerifier = {
  verifySignature: (): Promise<never> => Promise.reject(new Error('unexpected verifier call'))
}

describe('NativeOAuthSession refresh lifecycle', (): void => {
  it('只同步失效匹配的当前 Access Token，并保留可由宿主登出的长期授权', async (): Promise<void> => {
    /** @brief 顺序生成 token 的计数 / Counter generating sequential tokens. */
    let tokenCalls = 0
    /** @brief 测试网络实现 / Test network implementation. */
    const fetchImplementation: typeof fetch = (_input, init) => {
      if (
        init?.body instanceof URLSearchParams &&
        init.body.get('grant_type') === 'refresh_token'
      ) {
        tokenCalls += 1
        return Promise.resolve(
          refreshResponse(
            `access-token-${String(tokenCalls).padStart(20, '0')}`,
            `refresh-token-${String(tokenCalls).padStart(20, '0')}`
          )
        )
      }
      throw new Error('unexpected request')
    }
    /** @brief 初始长期授权 store / Initial durable-grant store. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl: vi.fn(fetchImplementation),
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 恢复后的当前 token / Current token after restoration. */
    const current = session.getProjection()?.accessToken
    if (current === undefined) throw new Error('Expected restored session.')

    session.invalidateAccessToken('late-access-token-observation')
    expect(session.getProjection()?.accessToken).toBe(current)
    session.invalidateAccessToken(current)

    expect(session.getProjection()).toBeNull()
    expect(store.current).not.toBeNull()
  })

  it('交换 code、验证 ID Token 后才原子公开并持久化初始会话', async (): Promise<void> => {
    /** @brief 固定 discovery / Pinned discovery. */
    const discovery = {
      authorizationEndpoint: API_V2_OAUTH_AUTHORIZATION_ENDPOINT,
      idTokenSigningAlgorithms: ['RS256'],
      issuer: API_V2_OAUTH_ISSUER,
      jwksUri: API_V2_OAUTH_JWKS_URI,
      revocationEndpoint: `${API_V2_OAUTH_ISSUER}/oauth/revoke`,
      scopesSupported: TEST_SCOPES,
      tokenEndpoint: `${API_V2_OAUTH_ISSUER}/oauth/token`,
      userinfoEndpoint: `${API_V2_OAUTH_ISSUER}/userinfo`
    } as const
    /** @brief main 内存 native transaction / Main-memory native transaction. */
    const request = await createNativeAuthorizationRequest({
      boundLoopbackOrigin: 'http://127.0.0.1:49152',
      clientId: 'desktop-client',
      discovery,
      nowEpochSeconds: () => 12_000,
      offlineAccessConsent: 'request',
      scopes: TEST_SCOPES,
      screenHint: 'login'
    })
    /** @brief 返回与事务 nonce 绑定 claims 的 verifier / Verifier returning claims bound to the transaction nonce. */
    const verifier: IdTokenSignatureVerifier = {
      verifySignature: (): Promise<unknown> =>
        Promise.resolve({
          aud: 'desktop-client',
          exp: 13_000,
          iat: 12_000,
          iss: API_V2_OAUTH_ISSUER,
          nonce: request.transaction.nonce,
          sub: 'subject-1'
        })
    }
    /** @brief Authorization Code exchange 网络实现 / Authorization Code exchange network implementation. */
    const fetchImpl = vi.fn((): Promise<Response> =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'access-token-authorized-00000',
            expires_in: 300,
            id_token: 'signed-id-token-placeholder',
            refresh_token: 'refresh-token-authorized-0000',
            scope: TEST_SCOPES.join(' '),
            token_type: 'Bearer'
          }),
          {
            headers: {
              'Cache-Control': 'no-store',
              'Content-Type': 'application/json',
              Pragma: 'no-cache'
            },
            status: 200
          }
        )
      )
    ) as unknown as typeof fetch
    /** @brief 初始空 store / Initially empty store. */
    const store = new TestGrantStore(null)
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl,
      grantStore: store,
      idTokenVerifier: verifier,
      nowEpochSeconds: () => 12_000
    })
    /** @brief 当前授权独占的 installer / Installer exclusively owned by this authorization. */
    const installer = await session.beginAuthorization()
    expect(session.getProjection()).toBeNull()

    await installer.installGrant('one-time-authorization-code', request.transaction)

    expect(session.getProjection()).toMatchObject({
      accessToken: 'access-token-authorized-00000',
      subject: 'subject-1'
    })
    expect(store.current?.refreshToken).toBe('refresh-token-authorized-0000')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('对同一被拒绝 Access Token 执行单飞轮换', async (): Promise<void> => {
    /** @brief 第二轮 refresh 的手动响应 / Manually controlled second refresh response. */
    const secondResponse = deferred<Response>()
    /** @brief Token Endpoint 调用次数 / Token Endpoint call count. */
    let tokenCalls = 0
    /** @brief 测试网络实现 / Test network implementation. */
    const fetchImplementation: typeof fetch = async (_input, init) => {
      if (
        init?.body instanceof URLSearchParams &&
        init.body.get('grant_type') === 'refresh_token'
      ) {
        tokenCalls += 1
        return tokenCalls === 1
          ? refreshResponse('access-token-restored-000000', 'refresh-token-rotated-one-0000')
          : secondResponse.promise
      }
      throw new Error('unexpected request')
    }
    /** @brief 可观察的测试网络实现 / Observable test network implementation. */
    const fetchImpl = vi.fn(fetchImplementation) as unknown as typeof fetch
    /** @brief 初始 store / Initial store. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 被资源服务器拒绝的恢复后 token / Restored token rejected by the resource server. */
    const rejected = session.getProjection()?.accessToken
    if (rejected === undefined) throw new Error('Expected restored session.')

    /** @brief 两个并发 refresh 观察者 / Two concurrent refresh observers. */
    const first = session.refresh(rejected)
    const second = session.refresh(rejected)
    expect(tokenCalls).toBe(2)
    secondResponse.resolve(
      refreshResponse('access-token-rotated-0000000', 'refresh-token-rotated-two-0000')
    )

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(tokenCalls).toBe(2)
    expect(store.current?.refreshToken).toBe('refresh-token-rotated-two-0000')
  })

  it('原子持久化失败时不公开新 Access Token 并清除 token family', async (): Promise<void> => {
    /** @brief 顺序生成轮换 token 的计数 / Counter generating sequential rotated tokens. */
    let tokenCalls = 0
    /** @brief 测试网络实现 / Test network implementation. */
    /** @brief 持久化失败后撤销的新 token / New token revoked after persistence failure. */
    let revokedToken: string | null = null
    /** @brief 区分 refresh 与 revoke 的测试网络 / Test network distinguishing refresh from revocation. */
    const fetchImplementation: typeof fetch = (_input, init) => {
      if (init?.body instanceof URLSearchParams && init.body.has('token_type_hint')) {
        revokedToken = init.body.get('token')
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      tokenCalls += 1
      return Promise.resolve(
        refreshResponse(
          `access-token-${String(tokenCalls).padStart(20, '0')}`,
          `refresh-token-${String(tokenCalls).padStart(20, '0')}`
        )
      )
    }
    /** @brief 可观察网络实现 / Observable network implementation. */
    const fetchImpl = vi.fn(fetchImplementation) as unknown as typeof fetch
    /** @brief 会在第二次替换失败的 store / Store failing the second replacement. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 当前 token / Current token. */
    const rejected = session.getProjection()?.accessToken
    if (rejected === undefined) throw new Error('Expected restored session.')
    store.failReplace = true

    await expect(session.refresh(rejected)).rejects.toThrow('injected atomic replacement failure')
    expect(session.getProjection()).toBeNull()
    expect(store.current).toBeNull()
    expect(store.clearCount).toBeGreaterThan(0)
    expect(revokedToken).toBe('refresh-token-00000000000000000002')
  })

  it('logout 与 refresh 竞态时先清本地并撤销成功轮换后的最新 token', async (): Promise<void> => {
    /** @brief 竞态 refresh response / Racing refresh response. */
    const racingResponse = deferred<Response>()
    /** @brief Token Endpoint 调用次数 / Token Endpoint call count. */
    let tokenCalls = 0
    /** @brief 撤销请求携带的 token / Token carried by the revocation request. */
    let revokedToken: string | null = null
    /** @brief 测试网络实现 / Test network implementation. */
    const fetchImplementation: typeof fetch = async (_input, init) => {
      if (init?.body instanceof URLSearchParams) {
        if (init.body.get('grant_type') === 'refresh_token') {
          tokenCalls += 1
          return tokenCalls === 1
            ? refreshResponse('access-token-restored-000000', 'refresh-token-rotated-one-0000')
            : racingResponse.promise
        }
        if (init.body.get('token_type_hint') === 'refresh_token') {
          revokedToken = init.body.get('token')
          return new Response(null, { status: 200 })
        }
      }
      throw new Error('unexpected request')
    }
    /** @brief 可观察的测试网络实现 / Observable test network implementation. */
    const fetchImpl = vi.fn(fetchImplementation) as unknown as typeof fetch
    /** @brief 初始 store / Initial store. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 当前 Access Token / Current Access Token. */
    const rejected = session.getProjection()?.accessToken
    if (rejected === undefined) throw new Error('Expected restored session.')
    /** @brief 与 logout 竞态的 refresh / Refresh racing with logout. */
    const refresh = session.refresh(rejected)
    /** @brief 本地优先的 logout / Local-first logout. */
    const logout = session.signOut()
    expect(session.getProjection()).toBeNull()
    await vi.waitFor((): void => expect(store.current).toBeNull())

    racingResponse.resolve(
      refreshResponse('access-token-racing-00000000', 'refresh-token-racing-new-00000')
    )
    await expect(refresh).rejects.toThrow()
    await expect(logout).resolves.toBeUndefined()
    expect(session.getProjection()).toBeNull()
    expect(store.current).toBeNull()
    expect(revokedToken).toBe('refresh-token-racing-new-00000')
  })

  it('安全存储 preflight 失败时不清除或撤销现有授权', async (): Promise<void> => {
    /** @brief 不应发生任何网络请求 / Network function that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new Error('unexpected request')))
    /** @brief 保有旧授权但 preflight 失败的 store / Store retaining an old grant while preflight fails. */
    const store = new TestGrantStore(grant('refresh-token-preserved-000000'))
    store.failAvailability = true
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })

    await expect(session.beginAuthorization()).rejects.toThrow(
      'injected secure-storage unavailability'
    )
    expect(store.current?.refreshToken).toBe('refresh-token-preserved-000000')
    expect(store.clearCount).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('持久删除失败仍撤销服务端 grant，并向调用者报告失败', async (): Promise<void> => {
    /** @brief 被撤销 token / Revoked token. */
    let revokedToken: string | null = null
    /** @brief 先恢复再处理 revoke 的网络实现 / Network implementation restoring first and then handling revocation. */
    const fetchImplementation: typeof fetch = (_input, init) => {
      if (init?.body instanceof URLSearchParams && init.body.has('token_type_hint')) {
        revokedToken = init.body.get('token')
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      return Promise.resolve(
        refreshResponse('access-token-restored-000000', 'refresh-token-current-0000000')
      )
    }
    /** @brief clear 失败的 store / Store whose clear operation fails. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl: fetchImplementation,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    store.failClear = true

    await expect(session.signOut()).rejects.toThrow('injected clear failure')
    expect(revokedToken).toBe('refresh-token-current-0000000')
    expect(session.getProjection()).toBeNull()
    expect(store.current?.refreshToken).toBe('refresh-token-current-0000000')
  })

  it('关闭等待进行中的轮换持久化后才清除 Access Token 内存', async (): Promise<void> => {
    /** @brief 关闭期间进行中的 response / Response in flight during shutdown. */
    const racingResponse = deferred<Response>()
    /** @brief refresh 调用次数 / Refresh-call count. */
    let tokenCalls = 0
    /** @brief 两次轮换的网络实现 / Network implementation for two rotations. */
    const fetchImplementation: typeof fetch = async () => {
      tokenCalls += 1
      return tokenCalls === 1
        ? refreshResponse('access-token-restored-000000', 'refresh-token-restored-000000')
        : racingResponse.promise
    }
    /** @brief 初始 store / Initial store. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl: fetchImplementation,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 当前将被刷新 token / Current token to refresh. */
    const rejected = session.getProjection()?.accessToken
    if (rejected === undefined) throw new Error('Expected restored session.')
    /** @brief 退出时仍进行中的 refresh / Refresh still active when shutdown begins. */
    const refresh = session.refresh(rejected)
    /** @brief 必须等待 refresh 的关闭任务 / Shutdown task that must wait for refresh. */
    const shutdown = session.shutdown()
    expect(session.getProjection()?.accessToken).toBe(rejected)

    racingResponse.resolve(
      refreshResponse('access-token-after-race-00000', 'refresh-token-after-race-00000')
    )
    await expect(refresh).resolves.toBeUndefined()
    await expect(shutdown).resolves.toBeUndefined()
    expect(store.current?.refreshToken).toBe('refresh-token-after-race-00000')
    expect(session.getProjection()).toBeNull()
  })

  it('服务端已签发但验证失败的 rotated token 仍被撤销', async (): Promise<void> => {
    /** @brief 被撤销 token / Revoked token. */
    let revokedToken: string | null = null
    /** @brief 返回越权 scope 的第二轮 response / Second response returning an escalated scope. */
    let tokenCalls = 0
    /** @brief 测试网络实现 / Test network implementation. */
    const fetchImplementation: typeof fetch = (_input, init) => {
      if (init?.body instanceof URLSearchParams && init.body.has('token_type_hint')) {
        revokedToken = init.body.get('token')
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      tokenCalls += 1
      if (tokenCalls === 1) {
        return Promise.resolve(
          refreshResponse('access-token-restored-000000', 'refresh-token-restored-000000')
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'access-token-invalid-scope-000',
            expires_in: 300,
            refresh_token: 'refresh-token-invalid-scope-000',
            scope: `${TEST_SCOPES.join(' ')} admin`,
            token_type: 'Bearer'
          }),
          {
            headers: {
              'Cache-Control': 'no-store',
              'Content-Type': 'application/json',
              Pragma: 'no-cache'
            },
            status: 200
          }
        )
      )
    }
    /** @brief 初始 store / Initial store. */
    const store = new TestGrantStore(grant('refresh-token-initial-00000000'))
    /** @brief 待测 session / Session under test. */
    const session = new NativeOAuthSession({
      clientId: 'desktop-client',
      fetchImpl: fetchImplementation,
      grantStore: store,
      idTokenVerifier: unusedVerifier,
      nowEpochSeconds: () => 12_000
    })
    await session.restore()
    /** @brief 当前 Access Token / Current Access Token. */
    const rejected = session.getProjection()?.accessToken
    if (rejected === undefined) throw new Error('Expected restored session.')

    await expect(session.refresh(rejected)).rejects.toThrow()
    expect(revokedToken).toBe('refresh-token-invalid-scope-000')
    expect(store.current).toBeNull()
  })
})
