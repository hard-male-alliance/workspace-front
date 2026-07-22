/** @file Web OAuth/OIDC v2 协议核心测试 / Tests for the Web OAuth/OIDC v2 protocol core. */

import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import {
  createWebAuthorizationRequest,
  restoreWebAuthorizationTransaction,
  snapshotWebAuthorizationTransaction,
  type WebAuthorizationTransaction
} from './authorization'
import { parseAuthorizationCallback } from './callback'
import { fetchOidcDiscovery, parseOidcDiscovery, type OidcDiscoveryDocument } from './discovery'
import { OAuthAuthorizationResponseError, OAuthTokenResponseError } from './errors'
import {
  RejectingIdTokenSignatureVerifier,
  validateIdTokenClaims,
  verifyIdToken,
  type IdTokenSignatureVerifier
} from './id-token'
import { completeWebAuthorization, InMemoryWebTokenSession } from './session'
import { exchangeAuthorizationCode, parseAuthorizationCodeTokenResponse } from './token'

/** @brief 固定测试时间 epoch 秒 / Fixed test time in epoch seconds. */
const NOW = 1_800_000_000

/** @brief 测试 public client ID / Test public-client ID. */
const CLIENT_ID = 'workspace-web'

/** @brief 测试 redirect URI / Test redirect URI. */
const REDIRECT_URI = 'https://app.hmalliances.org/oauth/callback'

/** @brief 满足 canonical schema 的示例 Access Token / Example Access Token satisfying the canonical schema. */
const ACCESS_TOKEN = 'access_example_only_not_a_real_token_7Yw8N2'

/** @brief 满足 canonical schema 的示例 Refresh Token / Example Refresh Token satisfying the canonical schema. */
const REFRESH_TOKEN = 'refresh_example_only_rotated_on_every_use_2pR7kT'

/** @brief 满足 canonical schema 的示例 ID Token / Example ID Token satisfying the canonical schema. */
const ID_TOKEN = 'id_token_example_only_not_a_real_jwt_4qL9mX'

/**
 * @brief 创建完整的 discovery JSON / Create complete discovery JSON.
 * @return 未经 parser 信任的 metadata / Metadata not yet trusted by the parser.
 */
function discoveryJson(): Record<string, unknown> {
  return {
    authorization_endpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    issuer: 'https://api.hmalliances.org:8022',
    jwks_uri: 'https://api.hmalliances.org:8022/oauth/jwks',
    response_types_supported: ['code'],
    revocation_endpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
    scopes_supported: ['openid', 'profile', 'offline_access', 'workspace.read'],
    subject_types_supported: ['public'],
    token_endpoint: 'https://api.hmalliances.org:8022/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
    userinfo_endpoint: 'https://api.hmalliances.org:8022/userinfo'
  }
}

/**
 * @brief 获取可信测试 discovery / Obtain trusted test discovery.
 * @return 已验证 metadata / Validated metadata.
 */
function discovery(): OidcDiscoveryDocument {
  return parseOidcDiscovery(discoveryJson())
}

/**
 * @brief 创建测试授权事务 / Create a test authorization transaction.
 * @return 仅内存授权事务 / Memory-only authorization transaction.
 */
async function transaction(): Promise<WebAuthorizationTransaction> {
  return (
    await createWebAuthorizationRequest({
      clientId: CLIENT_ID,
      discovery: discovery(),
      nowEpochSeconds: (): number => NOW,
      offlineAccessConsent: 'existing',
      redirectUri: REDIRECT_URI,
      scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
      screenHint: 'login'
    })
  ).transaction
}

/**
 * @brief 构造成功 token JSON / Construct successful token JSON.
 * @return canonical token payload / Canonical token payload.
 */
function tokenJson(): Record<string, unknown> {
  return {
    access_token: ACCESS_TOKEN,
    expires_in: 600,
    id_token: ID_TOKEN,
    refresh_token: REFRESH_TOKEN,
    scope: 'openid profile offline_access workspace.read',
    token_type: 'Bearer'
  }
}

/**
 * @brief 构造 token endpoint 响应 / Construct a Token Endpoint response.
 * @param body JSON body / JSON body.
 * @param status HTTP status / HTTP status.
 * @return 带强制防缓存头的响应 / Response with mandatory anti-caching headers.
 */
function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      Pragma: 'no-cache'
    },
    status
  })
}

/**
 * @brief 构造与事务对应的 callback URL / Construct a callback URL matching a transaction.
 * @param value 原授权事务 / Original authorization transaction.
 * @return 有效 callback URL / Valid callback URL.
 */
function callbackUrl(value: WebAuthorizationTransaction): string {
  /** @brief callback URL / Callback URL. */
  const url = new URL(value.redirectUri)
  url.searchParams.set('code', 'authorization_code_example_1234567890')
  url.searchParams.set('iss', value.issuer)
  url.searchParams.set('state', value.state)
  return url.toString()
}

/**
 * @brief 构造通过签名端口的有效 claims / Construct valid claims returned by a signature port.
 * @param value 原授权事务 / Original authorization transaction.
 * @return 完整安全 claims / Complete security claims.
 */
function validClaims(value: WebAuthorizationTransaction): Record<string, unknown> {
  return {
    aud: value.clientId,
    exp: NOW + 600,
    iat: NOW,
    iss: value.issuer,
    nonce: value.nonce,
    sub: 'oidc-subject-01K0EXAMPLE0001'
  }
}

describe('OIDC discovery', (): void => {
  it('pins issuer, endpoints, public-client auth, PKCE S256, iss response, and asymmetric ID-token algorithms', (): void => {
    expect(discovery()).toEqual({
      authorizationEndpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
      idTokenSigningAlgorithms: ['ES256', 'RS256'],
      issuer: 'https://api.hmalliances.org:8022',
      jwksUri: 'https://api.hmalliances.org:8022/oauth/jwks',
      revocationEndpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
      scopesSupported: ['openid', 'profile', 'offline_access', 'workspace.read'],
      tokenEndpoint: 'https://api.hmalliances.org:8022/oauth/token',
      userinfoEndpoint: 'https://api.hmalliances.org:8022/userinfo'
    })
  })

  it('fails closed when discovery enables a symmetric ID Token algorithm or omits response iss', (): void => {
    /** @brief 恶意降级 metadata / Malicious downgrade metadata. */
    const unsafe = discoveryJson()
    unsafe.id_token_signing_alg_values_supported = ['HS256']
    expect(() => parseOidcDiscovery(unsafe)).toThrow(ApiV2ContractError)

    /** @brief 缺少 issuer 防混淆能力的 metadata / Metadata missing issuer mix-up defense. */
    const withoutIssuerResponse = discoveryJson()
    withoutIssuerResponse.authorization_response_iss_parameter_supported = false
    expect(() => parseOidcDiscovery(withoutIssuerResponse)).toThrow(ApiV2ContractError)
  })

  it('bounds discovery bytes before parsing untrusted JSON', async (): Promise<void> => {
    /** @brief 超出 discovery 上限的响应 / Response exceeding the discovery limit. */
    const oversized = new Response(JSON.stringify({ padding: 'x'.repeat(300 * 1024) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
    await expect(
      fetchOidcDiscovery((): Promise<Response> => Promise.resolve(oversized))
    ).rejects.toThrow('pre-deserialization byte limit')
  })
})

describe('Authorization Code + PKCE request', (): void => {
  it('uses Web Crypto entropy and emits only the exact v2 authorization parameters', async (): Promise<void> => {
    /** @brief 授权请求 / Authorization request. */
    const request = await createWebAuthorizationRequest({
      clientId: CLIENT_ID,
      discovery: discovery(),
      nowEpochSeconds: (): number => NOW,
      offlineAccessConsent: 'request',
      redirectUri: REDIRECT_URI,
      scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
      screenHint: 'signup'
    })
    /** @brief 解析后的授权 URL / Parsed authorization URL. */
    const url = new URL(request.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://api.hmalliances.org:8022/oauth/authorize')
    expect([...url.searchParams.keys()]).toEqual([
      'response_type',
      'client_id',
      'redirect_uri',
      'scope',
      'state',
      'nonce',
      'code_challenge',
      'code_challenge_method',
      'screen_hint',
      'prompt'
    ])
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      code_challenge_method: 'S256',
      nonce: request.transaction.nonce,
      prompt: 'consent',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile offline_access workspace.read',
      screen_hint: 'signup',
      state: request.transaction.state
    })
    expect(request.transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(request.transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(request.transaction.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    /** @brief 独立重算的 PKCE digest / Independently recomputed PKCE digest. */
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(request.transaction.codeVerifier)
    )
    /** @brief 独立重算的 Base64url challenge / Independently recomputed Base64url challenge. */
    const expectedChallenge = Buffer.from(digest).toString('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(expectedChallenge)
  })

  it('refuses offline_access without an explicit consent decision', async (): Promise<void> => {
    await expect(
      createWebAuthorizationRequest({
        clientId: CLIENT_ID,
        discovery: discovery(),
        redirectUri: REDIRECT_URI,
        scopes: ['openid', 'offline_access'],
        screenHint: 'login'
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('round-trips only a strict token-free transaction snapshot across navigation', async (): Promise<void> => {
    /** @brief 原始事务 / Original transaction. */
    const original = await transaction()
    /** @brief 可序列化的严格快照 / Strict serializable snapshot. */
    const snapshot = snapshotWebAuthorizationTransaction(original)
    expect(snapshot).not.toHaveProperty('token_endpoint')
    expect(snapshot).not.toHaveProperty('jwks_uri')
    expect(JSON.stringify(snapshot)).not.toContain('access_token')
    /** @brief 模拟 sessionStorage JSON 往返后的事务 / Transaction after a simulated sessionStorage JSON round trip. */
    const restored = restoreWebAuthorizationTransaction(
      JSON.parse(JSON.stringify(snapshot)) as unknown,
      NOW
    )
    expect(restored).toMatchObject({
      clientId: CLIENT_ID,
      issuer: 'https://api.hmalliances.org:8022',
      jwksUri: 'https://api.hmalliances.org:8022/oauth/jwks',
      tokenEndpoint: 'https://api.hmalliances.org:8022/oauth/token'
    })
    expect(parseAuthorizationCallback(callbackUrl(restored), restored, NOW)).toEqual({
      code: 'authorization_code_example_1234567890'
    })

    await expect(
      Promise.resolve().then(() =>
        restoreWebAuthorizationTransaction(
          { ...snapshot, token_endpoint: 'https://evil.example/token' },
          NOW
        )
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })
})

describe('authorization callback', (): void => {
  it('validates state and RFC 9207 issuer before accepting the code', async (): Promise<void> => {
    /** @brief 原授权事务 / Original authorization transaction. */
    const value = await transaction()
    expect(parseAuthorizationCallback(callbackUrl(value), value, NOW)).toEqual({
      code: 'authorization_code_example_1234567890'
    })

    /** @brief state 被替换的 callback / Callback with a substituted state. */
    const wrongState = new URL(callbackUrl(value))
    wrongState.searchParams.set('state', 'attacker_state_123456789012345678901234')
    expect(() => parseAuthorizationCallback(wrongState.toString(), value, NOW)).toThrow(
      ApiV2ContractError
    )

    /** @brief issuer 被替换的 callback / Callback with a substituted issuer. */
    const wrongIssuer = new URL(callbackUrl(value))
    wrongIssuer.searchParams.set('iss', 'https://evil.example')
    expect(() => parseAuthorizationCallback(wrongIssuer.toString(), value, NOW)).toThrow(
      ApiV2ContractError
    )
  })

  it('validates error callbacks and exposes only the standard low-cardinality error', async (): Promise<void> => {
    /** @brief 原授权事务 / Original authorization transaction. */
    const value = await transaction()
    /** @brief 用户拒绝 callback / User-denied callback. */
    const denied = new URL(value.redirectUri)
    denied.searchParams.set('error', 'access_denied')
    denied.searchParams.set('error_description', 'User cancelled')
    denied.searchParams.set('iss', value.issuer)
    denied.searchParams.set('state', value.state)
    expect(() => parseAuthorizationCallback(denied.toString(), value, NOW)).toThrow(
      OAuthAuthorizationResponseError
    )

    denied.searchParams.set('state', 'attacker_state_123456789012345678901234')
    expect(() => parseAuthorizationCallback(denied.toString(), value, NOW)).toThrow(
      ApiV2ContractError
    )
  })
})

describe('Token Endpoint', (): void => {
  it('uses exact form encoding with no credentials and strictly parses the canonical schema', async (): Promise<void> => {
    /** @brief 原授权事务 / Original authorization transaction. */
    const value = await transaction()
    /** @brief 捕获请求的 Fetch spy / Fetch spy capturing the request. */
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      expect(_input).toBe('https://api.hmalliances.org:8022/oauth/token')
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBe('omit')
      expect(init?.redirect).toBe('error')
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      })
      expect(init?.body).toBeInstanceOf(URLSearchParams)
      expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
        client_id: CLIENT_ID,
        code: 'authorization_code_example_1234567890',
        code_verifier: value.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
      return Promise.resolve(tokenResponse(tokenJson()))
    })
    await expect(
      exchangeAuthorizationCode('authorization_code_example_1234567890', value, fetchImpl)
    ).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 600,
      idToken: ID_TOKEN,
      refreshToken: REFRESH_TOKEN,
      scope: 'openid profile offline_access workspace.read'
    })
  })

  it('rejects unknown success fields, missing anti-cache headers, and OAuth errors', async (): Promise<void> => {
    expect(() =>
      parseAuthorizationCodeTokenResponse({ ...tokenJson(), legacy_token: 'no' })
    ).toThrow(ApiV2ContractError)

    /** @brief 无防缓存头的 Fetch / Fetch without anti-caching headers. */
    const noStoreMissing = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify(tokenJson()), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
      )
    )
    await expect(
      exchangeAuthorizationCode(
        'authorization_code_example_1234567890',
        await transaction(),
        noStoreMissing
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    /** @brief 标准 OAuth error Fetch / Standard OAuth error Fetch. */
    const rejected = vi.fn<typeof fetch>(async () =>
      Promise.resolve(tokenResponse({ error: 'invalid_grant' }, 400))
    )
    await expect(
      exchangeAuthorizationCode(
        'authorization_code_example_1234567890',
        await transaction(),
        rejected
      )
    ).rejects.toBeInstanceOf(OAuthTokenResponseError)
  })

  it('never replays an authorization code after an ambiguous first exchange', async (): Promise<void> => {
    /** @brief 原授权事务 / Original authorization transaction. */
    const value = await transaction()
    /** @brief 模拟网络不确定性的 Fetch / Fetch simulating network ambiguity. */
    const fails = vi.fn<typeof fetch>(async () => Promise.reject(new Error('connection lost')))
    await expect(
      exchangeAuthorizationCode('authorization_code_example_1234567890', value, fails)
    ).rejects.toBeTruthy()
    await expect(
      exchangeAuthorizationCode('authorization_code_example_1234567890', value, fails)
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(fails).toHaveBeenCalledTimes(1)
  })

  it('bounds token-response bytes before parsing untrusted JSON', async (): Promise<void> => {
    /** @brief 超出 token response 上限的 Fetch / Fetch exceeding the token-response limit. */
    const oversized = vi.fn<typeof fetch>(async () =>
      Promise.resolve(tokenResponse({ ...tokenJson(), padding: 'x'.repeat(70 * 1024) }))
    )
    await expect(
      exchangeAuthorizationCode(
        'authorization_code_example_1234567890',
        await transaction(),
        oversized
      )
    ).rejects.toThrow('pre-deserialization byte limit')
  })

  it('rejects a structurally forged transaction before sending code or verifier', async (): Promise<void> => {
    /** @brief 不应调用的 Fetch / Fetch that must never be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief 结构上相似但未由模块签发的恶意事务 / Structurally similar malicious transaction not issued by the module. */
    const forged = {
      ...(await transaction()),
      tokenEndpoint: 'https://evil.example/token'
    } as WebAuthorizationTransaction
    await expect(
      exchangeAuthorizationCode('authorization_code_example_1234567890', forged, fetchImpl)
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('ID Token and memory-only session', (): void => {
  it('fails closed without a signature adapter and enforces nonce/iss/aud/exp after it', async (): Promise<void> => {
    /** @brief 原授权事务 / Original authorization transaction. */
    const value = await transaction()
    await expect(
      verifyIdToken(ID_TOKEN, value, new RejectingIdTokenSignatureVerifier(), (): number => NOW)
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    for (const claim of ['iss', 'nonce', 'aud', 'exp'] as const) {
      /** @brief 单个安全 claim 被破坏的 payload / Payload with one corrupted security claim. */
      const claims = validClaims(value)
      claims[claim] = claim === 'exp' ? NOW - 1000 : 'attacker-value'
      expect(() => validateIdTokenClaims(claims, value, NOW, 0)).toThrow(ApiV2ContractError)
    }
  })

  it('installs tokens atomically only after signature and claim validation', async (): Promise<void> => {
    /** @brief 首次失败事务 / First failing transaction. */
    const failingTransaction = await transaction()
    /** @brief 当前页面内存会话 / Current-page in-memory session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    /** @brief Token endpoint Fetch / Token Endpoint Fetch. */
    const fetchImpl = vi.fn<typeof fetch>(async () => Promise.resolve(tokenResponse(tokenJson())))
    /** @brief 返回错误 nonce 的签名 verifier / Signature verifier returning a wrong nonce. */
    const invalidVerifier: IdTokenSignatureVerifier = {
      verifySignature: (): Promise<unknown> =>
        Promise.resolve({
          ...validClaims(failingTransaction),
          nonce: 'wrong-nonce'
        })
    }
    await expect(
      completeWebAuthorization({
        callbackUrl: callbackUrl(failingTransaction),
        fetchImpl,
        idTokenVerifier: invalidVerifier,
        nowEpochSeconds: (): number => NOW,
        session,
        transaction: failingTransaction
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(session.getAccessToken()).toBeNull()
    expect(session.getProjection()).toBeNull()

    /** @brief 成功事务 / Successful transaction. */
    const successfulTransaction = await transaction()
    /** @brief 流程级取消控制器 / Flow-level cancellation controller. */
    const controller = new AbortController()
    /** @brief 返回有效 claims 的签名 verifier / Signature verifier returning valid claims. */
    const validVerifier: IdTokenSignatureVerifier = {
      verifySignature: (input): Promise<unknown> => {
        expect(input).toEqual({
          allowedAlgorithms: ['ES256', 'RS256'],
          idToken: ID_TOKEN,
          jwksUri: 'https://api.hmalliances.org:8022/oauth/jwks',
          signal: controller.signal
        })
        return Promise.resolve(validClaims(successfulTransaction))
      }
    }
    await completeWebAuthorization({
      callbackUrl: callbackUrl(successfulTransaction),
      fetchImpl,
      idTokenVerifier: validVerifier,
      nowEpochSeconds: (): number => NOW,
      session,
      signal: controller.signal,
      transaction: successfulTransaction
    })
    expect(session.getAccessToken()).toBe(ACCESS_TOKEN)
    expect(session.getProjection()).toMatchObject({
      expiresAtEpochSeconds: NOW + 600,
      hasRefreshToken: true,
      scopes: ['openid', 'profile', 'offline_access', 'workspace.read']
    })
    expect(JSON.stringify(session.getProjection())).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(session.getProjection())).not.toContain(REFRESH_TOKEN)
    session.clear()
    expect(session.getAccessToken()).toBeNull()
  })

  it('never revives a session after clear while verification is in flight', async (): Promise<void> => {
    /** @brief 授权事务 / Authorization transaction. */
    const value = await transaction()
    /** @brief 固定时钟会话 / Fixed-clock session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    /** @brief 通知 verifier 已进入的函数 / Function notifying that the verifier was entered. */
    let notifyEntered: (() => void) | null = null
    /** @brief verifier 进入信号 / Signal that verification has started. */
    const entered = new Promise<void>((resolve) => {
      notifyEntered = resolve
    })
    /** @brief 释放 verifier 的函数 / Function releasing the verifier. */
    let releaseVerifier!: (claims: unknown) => void
    /** @brief 被测试控制的 verifier gate / Verifier gate controlled by the test. */
    const gate = new Promise<unknown>((resolve) => {
      releaseVerifier = resolve
    })
    /** @brief 延迟完成的 verifier / Delayed verifier. */
    const verifier: IdTokenSignatureVerifier = {
      verifySignature: (): Promise<unknown> => {
        notifyEntered?.()
        return gate
      }
    }
    /** @brief 尚未完成的授权 / Pending authorization completion. */
    const pending = completeWebAuthorization({
      callbackUrl: callbackUrl(value),
      fetchImpl: (): Promise<Response> => Promise.resolve(tokenResponse(tokenJson())),
      idTokenVerifier: verifier,
      nowEpochSeconds: (): number => NOW,
      session,
      transaction: value
    })
    await entered
    session.clear()
    releaseVerifier(validClaims(value))
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
    expect(session.getAccessToken()).toBeNull()
  })

  it('prevents a slower old login from overwriting a newer identity', async (): Promise<void> => {
    /** @brief 旧授权事务 / Older authorization transaction. */
    const older = await transaction()
    /** @brief 新授权事务 / Newer authorization transaction. */
    const newer = await transaction()
    /** @brief 固定时钟会话 / Fixed-clock session. */
    const session = new InMemoryWebTokenSession({ nowEpochSeconds: (): number => NOW })
    /** @brief 通知旧 verifier 已进入的函数 / Function notifying that the old verifier was entered. */
    let notifyOlderEntered: (() => void) | null = null
    /** @brief 旧 verifier 进入信号 / Signal that the older verifier started. */
    const olderEntered = new Promise<void>((resolve) => {
      notifyOlderEntered = resolve
    })
    /** @brief 释放旧 verifier 的函数 / Function releasing the old verifier. */
    let releaseOlder!: (claims: unknown) => void
    /** @brief 旧 verifier gate / Older verifier gate. */
    const olderGate = new Promise<unknown>((resolve) => {
      releaseOlder = resolve
    })
    /** @brief 旧流程 / Older completion. */
    const olderCompletion = completeWebAuthorization({
      callbackUrl: callbackUrl(older),
      fetchImpl: (): Promise<Response> => Promise.resolve(tokenResponse(tokenJson())),
      idTokenVerifier: {
        verifySignature: (): Promise<unknown> => {
          notifyOlderEntered?.()
          return olderGate
        }
      },
      nowEpochSeconds: (): number => NOW,
      session,
      transaction: older
    })
    await olderEntered
    /** @brief 新身份 claims / Newer identity claims. */
    const newerClaims = { ...validClaims(newer), sub: 'oidc-subject-newer' }
    await completeWebAuthorization({
      callbackUrl: callbackUrl(newer),
      fetchImpl: (): Promise<Response> => Promise.resolve(tokenResponse(tokenJson())),
      idTokenVerifier: { verifySignature: (): Promise<unknown> => Promise.resolve(newerClaims) },
      nowEpochSeconds: (): number => NOW,
      session,
      transaction: newer
    })
    releaseOlder({ ...validClaims(older), sub: 'oidc-subject-older' })
    await expect(olderCompletion).rejects.toMatchObject({ kind: 'aborted' })
    expect(session.getProjection()?.identity.subject).toBe('oidc-subject-newer')
  })
})
