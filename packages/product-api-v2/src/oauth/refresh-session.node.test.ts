/** @file Web OAuth Refresh Token 轮换与撤销测试 / Web OAuth Refresh Token rotation and revocation tests. */

import { describe, expect, it, vi } from 'vitest'

import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError
} from '../http/errors'
import { createWebAuthorizationRequest, type WebAuthorizationTransaction } from './authorization'
import { parseOidcDiscovery } from './discovery'
import type { IdTokenSignatureVerifier } from './id-token'
import {
  completeWebAuthorization,
  InMemoryWebTokenSession,
  invalidateWebTokenSessionAccessToken,
  logoutWebTokenSession,
  refreshWebTokenSession,
  refreshWebTokenSessionIfCurrent
} from './session'
import { parseRefreshTokenResponse } from './token'

/** @brief 固定测试时间 epoch 秒 / Fixed test time in epoch seconds. */
const NOW = 1_800_000_000

/** @brief public client ID / Public client ID. */
const CLIENT_ID = 'workspace-web'

/** @brief 精确 Web callback / Exact Web callback. */
const REDIRECT_URI = 'https://app.hmalliances.org/oauth/callback'

/** @brief 初始 Access Token / Initial Access Token. */
const INITIAL_ACCESS_TOKEN = 'access_initial_example_only_7Yw8N2'

/** @brief 初始 Refresh Token / Initial Refresh Token. */
const INITIAL_REFRESH_TOKEN = 'refresh_initial_example_only_2pR7kT'

/** @brief 首次轮换 Access Token / First rotated Access Token. */
const ROTATED_ACCESS_TOKEN = 'access_rotated_example_only_8Qx9P3'

/** @brief 首次轮换 Refresh Token / First rotated Refresh Token. */
const ROTATED_REFRESH_TOKEN = 'refresh_rotated_example_only_3mT8sV'

/** @brief 第二次轮换 Access Token / Second rotated Access Token. */
const SECOND_ACCESS_TOKEN = 'access_second_example_only_9Az4R6'

/** @brief 第二次轮换 Refresh Token / Second rotated Refresh Token. */
const SECOND_REFRESH_TOKEN = 'refresh_second_example_only_4nU9tW'

/** @brief 示例 ID Token / Example ID Token. */
const ID_TOKEN = 'id_token_example_only_not_a_real_jwt_4qL9mX'

/** @brief 示例 refresh ID Token / Example refresh ID Token. */
const REFRESH_ID_TOKEN = 'id_token_refresh_example_only_not_a_real_jwt_8vK2nQ'

/** @brief 固定授权 scopes / Fixed authorization scopes. */
const SCOPES = ['openid', 'profile', 'offline_access', 'workspace.read'] as const

/**
 * @brief 构造 token/revoke 测试 Response / Construct a token/revocation test Response.
 * @param body 可选 JSON body / Optional JSON body.
 * @param status HTTP status / HTTP status.
 * @return 带 Token Endpoint 防缓存头的响应 / Response with Token Endpoint anti-cache headers.
 */
function endpointResponse(body: unknown = null, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      Pragma: 'no-cache'
    },
    status
  })
}

/**
 * @brief 构造一次 refresh 成功 JSON / Construct one successful refresh JSON.
 * @param accessToken 新 Access Token / New Access Token.
 * @param refreshToken 新 Refresh Token / New Refresh Token.
 * @param scope 返回 scopes / Returned scopes.
 * @return canonical RefreshTokenResponse JSON / Canonical RefreshTokenResponse JSON.
 */
function refreshJson(
  accessToken: string,
  refreshToken: string,
  scope = SCOPES.join(' ')
): Record<string, unknown> {
  return {
    access_token: accessToken,
    expires_in: 600,
    refresh_token: refreshToken,
    scope,
    token_type: 'Bearer'
  }
}

/**
 * @brief 创建真实的一次性授权事务 / Create a genuine one-time authorization transaction.
 * @return 模块签发的事务 / Module-issued transaction.
 */
async function createTransaction(): Promise<WebAuthorizationTransaction> {
  /** @brief 最小可信 discovery / Minimum trusted discovery. */
  const discovery = parseOidcDiscovery({
    authorization_endpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    issuer: 'https://api.hmalliances.org:8022',
    jwks_uri: 'https://api.hmalliances.org:8022/oauth/jwks',
    response_types_supported: ['code'],
    revocation_endpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
    scopes_supported: SCOPES,
    subject_types_supported: ['public'],
    token_endpoint: 'https://api.hmalliances.org:8022/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
    userinfo_endpoint: 'https://api.hmalliances.org:8022/userinfo'
  })
  return (
    await createWebAuthorizationRequest({
      clientId: CLIENT_ID,
      discovery,
      nowEpochSeconds: (): number => NOW,
      offlineAccessConsent: 'existing',
      redirectUri: REDIRECT_URI,
      scopes: SCOPES,
      screenHint: 'login'
    })
  ).transaction
}

/**
 * @brief 在内存会话中建立初始 token family / Establish an initial token family in memory.
 * @param session 目标会话 / Target session.
 * @param refreshClaims 可选 refresh ID Token claims / Optional refresh ID Token claims.
 */
async function authorize(session: InMemoryWebTokenSession, refreshClaims?: unknown): Promise<void> {
  /** @brief 一次性事务 / One-time transaction. */
  const transaction = await createTransaction()
  /** @brief 有效 callback / Valid callback. */
  const callback = new URL(transaction.redirectUri)
  callback.searchParams.set('code', 'authorization_code_example_1234567890')
  callback.searchParams.set('iss', transaction.issuer)
  callback.searchParams.set('state', transaction.state)
  /** @brief 返回可信 claims 的签名 verifier / Signature verifier returning trusted claims. */
  const verifier: IdTokenSignatureVerifier = {
    verifySignature: (input): Promise<unknown> =>
      Promise.resolve(
        input.idToken === ID_TOKEN
          ? {
              aud: CLIENT_ID,
              exp: NOW + 600,
              iat: NOW,
              iss: transaction.issuer,
              nonce: transaction.nonce,
              sub: 'oidc-subject-refresh-tests'
            }
          : refreshClaims
      )
  }
  await completeWebAuthorization({
    callbackUrl: callback.toString(),
    fetchImpl: (): Promise<Response> =>
      Promise.resolve(
        endpointResponse({
          access_token: INITIAL_ACCESS_TOKEN,
          expires_in: 600,
          id_token: ID_TOKEN,
          refresh_token: INITIAL_REFRESH_TOKEN,
          scope: SCOPES.join(' '),
          token_type: 'Bearer'
        })
      ),
    idTokenVerifier: verifier,
    nowEpochSeconds: (): number => NOW,
    session,
    transaction
  })
}

/**
 * @brief 从 Fetch init 读取 form body / Read a form body from Fetch init.
 * @param init Fetch init / Fetch init.
 * @return form 字段 / Form fields.
 */
function formFields(init?: RequestInit): Record<string, string> {
  expect(init?.body).toBeInstanceOf(URLSearchParams)
  return Object.fromEntries(init?.body as URLSearchParams)
}

describe('RefreshTokenResponse decoder', (): void => {
  it('requires a rotated refresh token and rejects every unknown field', (): void => {
    expect(
      parseRefreshTokenResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN))
    ).toEqual({
      accessToken: ROTATED_ACCESS_TOKEN,
      expiresInSeconds: 600,
      idToken: null,
      refreshToken: ROTATED_REFRESH_TOKEN,
      scope: SCOPES.join(' ')
    })
    /** @brief 缺少强制轮换字段的响应 / Response missing mandatory rotation. */
    const missingRotation = refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)
    delete missingRotation.refresh_token
    expect(() => parseRefreshTokenResponse(missingRotation)).toThrow(ApiV2ContractError)
    expect(() =>
      parseRefreshTokenResponse({
        ...refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN),
        legacy_token: 'forbidden'
      })
    ).toThrow(ApiV2ContractError)
  })
})

describe('in-memory refresh rotation', (): void => {
  it('single-flights concurrent callers and atomically uses each rotated token once', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 释放第一次 refresh 的函数 / Function releasing the first refresh. */
    let releaseFirst!: (response: Response) => void
    /** @brief 第一次 refresh gate / First refresh gate. */
    const firstGate = new Promise<Response>((resolve) => {
      releaseFirst = resolve
    })
    /** @brief 捕获轮换请求的 Fetch / Fetch capturing rotation requests. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, init): Promise<Response> => {
        expect(_input).toBe('https://api.hmalliances.org:8022/oauth/token')
        expect(formFields(init)).toEqual({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: INITIAL_REFRESH_TOKEN
        })
        return firstGate
      })
      .mockImplementationOnce((_input, init): Promise<Response> => {
        expect(formFields(init)).toEqual({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: ROTATED_REFRESH_TOKEN
        })
        return Promise.resolve(
          endpointResponse(refreshJson(SECOND_ACCESS_TOKEN, SECOND_REFRESH_TOKEN))
        )
      })
    /** @brief 两个并发观察者 / Two concurrent observers. */
    const first = refreshWebTokenSession({ fetchImpl, session })
    const concurrent = refreshWebTokenSession({ fetchImpl, session })
    expect(concurrent).toBe(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    releaseFirst(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await Promise.all([first, concurrent])
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
    expect(JSON.stringify(session.getProjection())).not.toContain(ROTATED_REFRESH_TOKEN)

    await refreshWebTokenSession({ fetchImpl, session })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(session.getAccessToken()).toBe(SECOND_ACCESS_TOKEN)
  })

  it('verifies an optional refresh ID Token with the original identity context', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session, {
      aud: CLIENT_ID,
      exp: NOW + 600,
      iat: NOW,
      iss: 'https://api.hmalliances.org:8022',
      sub: 'oidc-subject-refresh-tests'
    })

    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            endpointResponse({
              ...refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN),
              id_token: REFRESH_ID_TOKEN
            })
          ),
        session
      })
    ).resolves.toBeUndefined()
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
    expect(session.getProjection()?.identity.subject).toBe('oidc-subject-refresh-tests')
  })

  it('lets a follower cancel only its own wait without cancelling the shared refresh', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 释放 leader refresh 的函数 / Function releasing the leader refresh. */
    let releaseRefresh!: (response: Response) => void
    /** @brief leader refresh gate / Leader refresh gate. */
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve
    })
    /** @brief leader 请求 / Leader request. */
    const leader = refreshWebTokenSession({
      fetchImpl: (): Promise<Response> => refreshGate,
      session
    })
    /** @brief follower 自有取消控制器 / Cancellation controller owned by the follower. */
    const followerController = new AbortController()
    /** @brief 只观察共享任务的 follower / Follower observing only the shared operation. */
    const follower = refreshWebTokenSession({
      session,
      signal: followerController.signal
    })

    followerController.abort()
    await expect(follower).rejects.toMatchObject({ kind: 'aborted' })
    releaseRefresh(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await expect(leader).resolves.toBeUndefined()
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
  })

  it('bounds a hung refresh and clears a token whose use became ambiguous', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 只有取消时才结束的 Fetch / Fetch that settles only when cancelled. */
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init): Promise<Response> =>
        new Promise<Response>((_resolve, reject): void => {
          init?.signal?.addEventListener(
            'abort',
            (): void => reject(new DOMException('timed out', 'AbortError')),
            { once: true }
          )
        })
    )

    await expect(
      refreshWebTokenSession({ fetchImpl, session, timeoutMilliseconds: 5 })
    ).rejects.toMatchObject({ kind: 'timeout' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.getProjection()).toBeNull()
  })

  it('clears the whole session after network ambiguity or invalid_grant and never retries', async (): Promise<void> => {
    /** @brief 网络不确定会话 / Session encountering network ambiguity. */
    const ambiguousSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(ambiguousSession)
    /** @brief 只失败一次的 Fetch / Fetch failing exactly once. */
    const ambiguousFetch = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')))
    await expect(
      refreshWebTokenSession({ fetchImpl: ambiguousFetch, session: ambiguousSession })
    ).rejects.toBeInstanceOf(ApiV2NetworkError)
    expect(ambiguousSession.getAccessToken()).toBeNull()
    expect(ambiguousSession.getProjection()).toBeNull()
    await expect(
      refreshWebTokenSession({ fetchImpl: ambiguousFetch, session: ambiguousSession })
    ).rejects.toBeInstanceOf(ApiV2AuthenticationRequiredError)
    expect(ambiguousFetch).toHaveBeenCalledTimes(1)

    /** @brief invalid_grant 会话 / Session receiving invalid_grant. */
    const rejectedSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(rejectedSession)
    /** @brief 返回 invalid_grant 的 Fetch / Fetch returning invalid_grant. */
    const rejectedFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(endpointResponse({ error: 'invalid_grant' }, 400))
    )
    await expect(
      refreshWebTokenSession({ fetchImpl: rejectedFetch, session: rejectedSession })
    ).rejects.toMatchObject({ error: 'invalid_grant' })
    expect(rejectedSession.getProjection()).toBeNull()
    expect(rejectedFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects scope expansion and an unchanged refresh token, then fails closed', async (): Promise<void> => {
    /** @brief scope 扩大测试会话 / Scope-expansion test session. */
    const expandedSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(expandedSession)
    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            endpointResponse(
              refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN, `${SCOPES.join(' ')} admin`)
            )
          ),
        session: expandedSession
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(expandedSession.getProjection()).toBeNull()

    /** @brief 未轮换测试会话 / Non-rotation test session. */
    const reusedSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(reusedSession)
    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, INITIAL_REFRESH_TOKEN))
          ),
        session: reusedSession
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(reusedSession.getProjection()).toBeNull()

    /** @brief 必需 scope 缺失测试会话 / Required-scope omission test session. */
    const missingScopeSession = new InMemoryWebTokenSession({
      nowEpochSeconds: (): number => NOW
    })
    await authorize(missingScopeSession)
    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            endpointResponse(
              refreshJson(
                ROTATED_ACCESS_TOKEN,
                ROTATED_REFRESH_TOKEN,
                'openid profile workspace.read'
              )
            )
          ),
        session: missingScopeSession
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(missingScopeSession.getProjection()).toBeNull()
  })

  it('enforces anti-cache headers and a byte limit before decoding refresh JSON', async (): Promise<void> => {
    /** @brief 无防缓存头会话 / Session receiving no anti-cache headers. */
    const cacheableSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(cacheableSession)
    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            new Response(JSON.stringify(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)), {
              headers: { 'Content-Type': 'application/json' },
              status: 200
            })
          ),
        session: cacheableSession
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(cacheableSession.getProjection()).toBeNull()

    /** @brief 超限响应会话 / Session receiving an oversized response. */
    const oversizedSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(oversizedSession)
    await expect(
      refreshWebTokenSession({
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            endpointResponse({
              ...refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN),
              padding: 'x'.repeat(80 * 1024)
            })
          ),
        session: oversizedSession
      })
    ).rejects.toThrow('pre-deserialization byte limit')
    expect(oversizedSession.getProjection()).toBeNull()
  })

  it('retains a private refresh path after access-token expiry', async (): Promise<void> => {
    /** @brief 可推进测试时钟 / Mutable test clock. */
    let now = NOW
    /** @brief 会话 / Session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => now })
    await authorize(session)
    now = NOW + 601
    expect(session.getAccessToken()).toBeNull()
    expect(session.getProjection()).toMatchObject({ hasRefreshToken: true })
    await refreshWebTokenSession({
      fetchImpl: (): Promise<Response> =>
        Promise.resolve(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN))),
      session
    })
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
  })

  it('atomically refreshes only the raw state matching the rejected access token', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 捕获条件 refresh 的 Fetch / Fetch capturing conditional refresh. */
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    )

    await expect(
      refreshWebTokenSessionIfCurrent({
        fetchImpl,
        rejectedAccessToken: INITIAL_ACCESS_TOKEN,
        session
      })
    ).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)

    await expect(
      refreshWebTokenSessionIfCurrent({
        fetchImpl,
        rejectedAccessToken: INITIAL_ACCESS_TOKEN,
        session
      })
    ).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
  })

  it('treats null as no valid projection without confusing an expired newer generation', async (): Promise<void> => {
    /** @brief 可推进测试时钟 / Mutable test clock. */
    let now = NOW
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => now })
    await authorize(session)
    /** @brief 有效 token 场景不应调用的 Fetch / Fetch that must not run while a valid token exists. */
    const validFetch = vi.fn<typeof fetch>()
    await expect(
      refreshWebTokenSessionIfCurrent({
        fetchImpl: validFetch,
        rejectedAccessToken: null,
        session
      })
    ).resolves.toBeUndefined()
    expect(validFetch).not.toHaveBeenCalled()

    await refreshWebTokenSession({
      fetchImpl: (): Promise<Response> =>
        Promise.resolve(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN))),
      session
    })
    now = NOW + 601
    expect(session.getAccessToken()).toBeNull()
    /** @brief 迟到旧 401 不得消费新世代 Refresh Token / A late old 401 must not consume the newer generation's refresh token. */
    const lateFetch = vi.fn<typeof fetch>()
    await expect(
      refreshWebTokenSessionIfCurrent({
        fetchImpl: lateFetch,
        rejectedAccessToken: INITIAL_ACCESS_TOKEN,
        session
      })
    ).resolves.toBeUndefined()
    expect(lateFetch).not.toHaveBeenCalled()
    expect(session.getProjection()).toMatchObject({ hasRefreshToken: true })

    /** @brief 当前缺失投影触发的第二次轮换 Fetch / Fetch for the second rotation triggered by an absent projection. */
    const expiredFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(endpointResponse(refreshJson(SECOND_ACCESS_TOKEN, SECOND_REFRESH_TOKEN)))
    )
    await refreshWebTokenSessionIfCurrent({
      fetchImpl: expiredFetch,
      rejectedAccessToken: null,
      session
    })
    expect(expiredFetch).toHaveBeenCalledOnce()
    expect(session.getAccessToken()).toBe(SECOND_ACCESS_TOKEN)
  })

  it('conditionally invalidates raw state without letting a late 401 erase a newer token', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    await refreshWebTokenSession({
      fetchImpl: (): Promise<Response> =>
        Promise.resolve(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN))),
      session
    })

    invalidateWebTokenSessionAccessToken(session, INITIAL_ACCESS_TOKEN)
    expect(session.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN)
    invalidateWebTokenSessionAccessToken(session, ROTATED_ACCESS_TOKEN)
    expect(session.getAccessToken()).toBeNull()
    expect(session.getProjection()).toBeNull()
  })

  it('does not commit after cancellation or a stale session generation', async (): Promise<void> => {
    /** @brief 取消测试会话 / Cancellation test session. */
    const cancelledSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(cancelledSession)
    /** @brief 取消控制器 / Cancellation controller. */
    const controller = new AbortController()
    /** @brief 释放取消请求的函数 / Function releasing the cancelled request. */
    let releaseCancelled!: (response: Response) => void
    /** @brief 取消请求 gate / Cancelled request gate. */
    const cancelledGate = new Promise<Response>((resolve) => {
      releaseCancelled = resolve
    })
    /** @brief 尚未完成的取消 refresh / Pending refresh to cancel. */
    const cancelled = refreshWebTokenSession({
      fetchImpl: (): Promise<Response> => cancelledGate,
      session: cancelledSession,
      signal: controller.signal
    })
    controller.abort()
    releaseCancelled(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await expect(cancelled).rejects.toMatchObject({ kind: 'aborted' })
    expect(cancelledSession.getProjection()).toBeNull()

    /** @brief stale-generation 测试会话 / Stale-generation test session. */
    const staleSession = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(staleSession)
    /** @brief 释放 stale 请求的函数 / Function releasing the stale request. */
    let releaseStale!: (response: Response) => void
    /** @brief stale 请求 gate / Stale request gate. */
    const staleGate = new Promise<Response>((resolve) => {
      releaseStale = resolve
    })
    /** @brief 尚未完成的 stale refresh / Pending refresh that will become stale. */
    const stale = refreshWebTokenSession({
      fetchImpl: (): Promise<Response> => staleGate,
      session: staleSession
    })
    staleSession.clear()
    releaseStale(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await expect(stale).rejects.toMatchObject({ kind: 'aborted' })
    expect(staleSession.getAccessToken()).toBeNull()
  })

  it('removes the old token family before a new authorization supersedes an in-flight refresh', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 释放旧 refresh 的函数 / Function releasing the old refresh. */
    let releaseRefresh!: (response: Response) => void
    /** @brief 旧 refresh 响应 gate / Old refresh response gate. */
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve
    })
    /** @brief 已发送但未完成的旧 refresh / Old refresh sent but not completed. */
    const refresh = refreshWebTokenSession({
      fetchImpl: (): Promise<Response> => refreshGate,
      session
    })
    /** @brief 取代旧会话的新授权事务 / New authorization transaction superseding the old session. */
    const nextTransaction = await createTransaction()
    /** @brief 新授权 callback / New authorization callback. */
    const nextCallback = new URL(nextTransaction.redirectUri)
    nextCallback.searchParams.set('code', 'authorization_code_next_example_1234567890')
    nextCallback.searchParams.set('iss', nextTransaction.issuer)
    nextCallback.searchParams.set('state', nextTransaction.state)
    /** @brief 注定失败但会先取得授权世代的流程 / Flow that fails after first owning a new authorization generation. */
    const nextAuthorization = completeWebAuthorization({
      callbackUrl: nextCallback.toString(),
      fetchImpl: (): Promise<Response> => Promise.reject(new TypeError('new authorization failed')),
      idTokenVerifier: {
        verifySignature: (): never => {
          throw new Error('must not verify after token exchange failure')
        }
      },
      nowEpochSeconds: (): number => NOW,
      session,
      transaction: nextTransaction
    })

    expect(session.getAccessToken()).toBeNull()
    expect(session.getProjection()).toBeNull()
    releaseRefresh(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await expect(refresh).rejects.toMatchObject({ kind: 'aborted' })
    await expect(nextAuthorization).rejects.toBeInstanceOf(ApiV2NetworkError)
    await expect(refreshWebTokenSession({ session })).rejects.toBeInstanceOf(
      ApiV2AuthenticationRequiredError
    )
  })
})

describe('RFC 7009 logout', (): void => {
  it('clears locally before best-effort revoke and never restores on failure', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 拒绝撤销请求的函数 / Function rejecting the revocation request. */
    let rejectRevoke!: (reason: unknown) => void
    /** @brief 撤销请求 gate / Revocation-request gate. */
    const revokeGate = new Promise<Response>((_resolve, reject) => {
      rejectRevoke = reject
    })
    /** @brief 捕获 RFC 7009 form 的 Fetch / Fetch capturing the RFC 7009 form. */
    const fetchImpl = vi.fn<typeof fetch>((input, init) => {
      expect(input).toBe('https://api.hmalliances.org:8022/oauth/revoke')
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('omit')
      expect(init?.redirect).toBe('error')
      expect(formFields(init)).toEqual({
        client_id: CLIENT_ID,
        token: INITIAL_REFRESH_TOKEN,
        token_type_hint: 'refresh_token'
      })
      return revokeGate
    })
    /** @brief 尚未完成的 logout / Pending logout. */
    const logout = logoutWebTokenSession({ fetchImpl, session })
    expect(session.getAccessToken()).toBeNull()
    expect(session.getProjection()).toBeNull()
    rejectRevoke(new TypeError('offline'))
    await expect(logout).resolves.toBeUndefined()
    expect(session.getProjection()).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight rotation and revokes the newest refresh token', async (): Promise<void> => {
    /** @brief 已授权会话 / Authorized session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    await authorize(session)
    /** @brief 释放轮换响应的函数 / Function releasing the rotation response. */
    let releaseRefresh!: (response: Response) => void
    /** @brief 轮换响应 gate / Rotation-response gate. */
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve
    })
    /** @brief 已发送但未完成的轮换 / Rotation sent but not completed. */
    const refresh = refreshWebTokenSession({
      fetchImpl: (): Promise<Response> => refreshGate,
      session
    })
    /** @brief RFC 7009 撤销 Fetch / RFC 7009 revocation fetch. */
    const revokeFetch = vi.fn<typeof fetch>((_input, init): Promise<Response> => {
      expect(formFields(init)).toEqual({
        client_id: CLIENT_ID,
        token: ROTATED_REFRESH_TOKEN,
        token_type_hint: 'refresh_token'
      })
      return Promise.resolve(endpointResponse())
    })
    /** @brief 先本地清除、再等待最新 token 的登出 / Logout that clears locally before awaiting the latest token. */
    const logout = logoutWebTokenSession({ fetchImpl: revokeFetch, session })

    expect(session.getProjection()).toBeNull()
    expect(revokeFetch).not.toHaveBeenCalled()
    releaseRefresh(endpointResponse(refreshJson(ROTATED_ACCESS_TOKEN, ROTATED_REFRESH_TOKEN)))
    await expect(refresh).rejects.toMatchObject({ kind: 'aborted' })
    await expect(logout).resolves.toBeUndefined()
    expect(revokeFetch).toHaveBeenCalledTimes(1)
    expect(session.getProjection()).toBeNull()
  })
})
