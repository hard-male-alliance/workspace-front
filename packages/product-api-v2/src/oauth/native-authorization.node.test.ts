/** @file Native 系统浏览器 OAuth public-client 事务测试 / Native system-browser OAuth public-client transaction tests. */

import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import {
  claimAuthorizationCodeExchange,
  createNativeAuthorizationRequest,
  snapshotWebAuthorizationTransaction,
  type CreateNativeAuthorizationOptions,
  type NativeAuthorizationTransaction
} from './authorization'
import { parseAuthorizationCallback } from './callback'
import { parseOidcDiscovery, type OidcDiscoveryDocument } from './discovery'
import { validateIdTokenClaims, verifyIdToken } from './id-token'

/** @brief 固定测试时间 epoch 秒 / Fixed test time in epoch seconds. */
const NOW = 1_800_000_000

/** @brief Native public client ID / Native public-client ID. */
const CLIENT_ID = 'workspace-desktop'

/** @brief 系统已动态绑定的 loopback origin / Loopback origin dynamically bound by the system. */
const BOUND_LOOPBACK_ORIGIN = 'http://127.0.0.1:49152'

/**
 * @brief 创建完整 discovery JSON / Create complete discovery JSON.
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
 * @brief 创建 native 授权输入 / Create native authorization input.
 * @param overrides 要覆盖的输入 / Input fields to override.
 * @return 完整 factory 输入 / Complete factory input.
 */
function nativeOptions(
  overrides: Partial<CreateNativeAuthorizationOptions> = {}
): CreateNativeAuthorizationOptions {
  return {
    boundLoopbackOrigin: BOUND_LOOPBACK_ORIGIN,
    clientId: CLIENT_ID,
    discovery: discovery(),
    nowEpochSeconds: (): number => NOW,
    offlineAccessConsent: 'request',
    scopes: ['openid', 'profile', 'offline_access', 'workspace.read'],
    screenHint: 'login',
    ...overrides
  }
}

/**
 * @brief 为事务构建成功 callback / Construct a successful callback for a transaction.
 * @param transaction 原 native 事务 / Original native transaction.
 * @return 包含 code、state 与 issuer 的 callback URL / Callback URL containing code, state, and issuer.
 */
function callbackUrl(transaction: NativeAuthorizationTransaction): string {
  /** @brief 待填充的精确 callback / Exact callback to populate. */
  const callback = new URL(transaction.redirectUri)
  callback.searchParams.set('code', 'authorization_code_example_1234567890')
  callback.searchParams.set('iss', transaction.issuer)
  callback.searchParams.set('state', transaction.state)
  return callback.toString()
}

describe('native public-client Authorization Code + PKCE request', (): void => {
  it('binds a random path to the already-bound IPv4 origin and emits exact parameters', async (): Promise<void> => {
    /** @brief Native 授权请求 / Native authorization request. */
    const request = await createNativeAuthorizationRequest(nativeOptions())
    /** @brief 解析后的 hosted authorization URL / Parsed hosted authorization URL. */
    const authorizationUrl = new URL(request.authorizationUrl)

    expect(request.transaction.kind).toBe('native-loopback')
    expect(request.transaction.redirectUri).toMatch(
      /^http:\/\/127\.0\.0\.1:49152\/oauth\/callback\/[A-Za-z0-9_-]{43}$/u
    )
    expect([...authorizationUrl.searchParams.keys()]).toEqual([
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
    expect(Object.fromEntries(authorizationUrl.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      code_challenge_method: 'S256',
      nonce: request.transaction.nonce,
      prompt: 'consent',
      redirect_uri: request.transaction.redirectUri,
      response_type: 'code',
      scope: 'openid profile offline_access workspace.read',
      screen_hint: 'login',
      state: request.transaction.state
    })

    /** @brief 独立计算的 PKCE digest / Independently calculated PKCE digest. */
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(request.transaction.codeVerifier)
    )
    expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
      Buffer.from(digest).toString('base64url')
    )
    expect(request.transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(request.transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(request.transaction.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/u)
  })

  it('generates independent 256-bit callback, verifier, state, and nonce values', async (): Promise<void> => {
    /** @brief 首个 native 事务 / First native transaction. */
    const first = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    /** @brief 第二个 native 事务 / Second native transaction. */
    const second = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    /** @brief 首个 callback path segment / First callback-path segment. */
    const firstCallbackSegment = first.redirectUri.split('/').at(-1)
    /** @brief 第二个 callback path segment / Second callback-path segment. */
    const secondCallbackSegment = second.redirectUri.split('/').at(-1)

    expect(new Set([firstCallbackSegment, first.codeVerifier, first.state, first.nonce]).size).toBe(
      4
    )
    expect(firstCallbackSegment).not.toBe(secondCallbackSegment)
    expect(first.codeVerifier).not.toBe(second.codeVerifier)
    expect(first.state).not.toBe(second.state)
    expect(first.nonce).not.toBe(second.nonce)
  })

  it.each([
    'http://localhost:49152',
    'http://127.0.0.1:49152?callback=1',
    'http://127.0.0.1:49152#callback',
    'http://user@127.0.0.1:49152',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
    'http://127.0.0.1:049152',
    'http://127.0.0.1:49152/',
    'https://127.0.0.1:49152',
    'com.hmalliances.workspace:/oauth/callback'
  ])('rejects a non-exact or unsupported loopback binding: %s', async (origin): Promise<void> => {
    await expect(
      createNativeAuthorizationRequest(nativeOptions({ boundLoopbackOrigin: origin }))
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each(['http://127.0.0.1:49152', 'http://[::1]:49152'])(
    'accepts either contract loopback address after binding: %s',
    async (boundLoopbackOrigin): Promise<void> => {
      /** @brief 当前地址族对应的 native 事务 / Native transaction for the current address family. */
      const transaction = (
        await createNativeAuthorizationRequest(nativeOptions({ boundLoopbackOrigin }))
      ).transaction
      expect(transaction.redirectUri).toMatch(
        new RegExp(
          `^${boundLoopbackOrigin.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/oauth/callback/[A-Za-z0-9_-]{43}$`,
          'u'
        )
      )
    }
  )

  it.each([1, 65_535])(
    'accepts the explicit loopback port boundary %s',
    async (port): Promise<void> => {
      /** @brief 端口边界上的事务 / Transaction at the port boundary. */
      const transaction = (
        await createNativeAuthorizationRequest(
          nativeOptions({ boundLoopbackOrigin: `http://127.0.0.1:${port}` })
        )
      ).transaction
      expect(transaction.redirectUri).toMatch(
        new RegExp(`^http://127\\.0\\.0\\.1:${port}/oauth/callback/[A-Za-z0-9_-]{43}$`, 'u')
      )
    }
  )

  it('keeps native transactions outside the Web snapshot boundary', async (): Promise<void> => {
    /** @brief 仅 native main 内存事务 / Native-main-memory-only transaction. */
    const transaction = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    expect(() => {
      // @ts-expect-error Native transactions are intentionally outside the Web snapshot type.
      snapshotWebAuthorizationTransaction(transaction)
    }).toThrow(ApiV2ContractError)
    expect(() => JSON.stringify(transaction)).toThrow(ApiV2ContractError)
    expect(Reflect.ownKeys(transaction)).toEqual([])
    expect({ ...transaction }).toEqual({})
    expect(JSON.stringify({ ...transaction })).toBe('{}')
    expect(structuredClone(transaction)).toEqual({})
  })

  it('binds OIDC issuer, audience, and nonce validation to the native transaction', async (): Promise<void> => {
    /** @brief 原 native 事务 / Original native transaction. */
    const transaction = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    /** @brief 签名层已验证的有效 claims / Valid claims already verified by the signature layer. */
    const claims = {
      aud: transaction.clientId,
      exp: NOW + 600,
      iat: NOW,
      iss: transaction.issuer,
      nonce: transaction.nonce,
      sub: 'oidc-subject-native-01K0EXAMPLE0001'
    }
    expect(validateIdTokenClaims(claims, transaction, NOW, 0)).toMatchObject({
      issuer: transaction.issuer,
      subject: 'oidc-subject-native-01K0EXAMPLE0001'
    })
    expect(() =>
      validateIdTokenClaims({ ...claims, nonce: 'attacker-nonce' }, transaction, NOW, 0)
    ).toThrow(ApiV2ContractError)

    /** @brief 复制公开字段构造的结构伪造事务 / Structurally forged transaction built from copied public fields. */
    const forged = {
      clientId: transaction.clientId,
      codeVerifier: transaction.codeVerifier,
      createdAtEpochSeconds: transaction.createdAtEpochSeconds,
      idTokenSigningAlgorithms: transaction.idTokenSigningAlgorithms,
      issuer: transaction.issuer,
      jwksUri: transaction.jwksUri,
      kind: transaction.kind,
      nonce: transaction.nonce,
      redirectUri: transaction.redirectUri,
      scopes: transaction.scopes,
      state: transaction.state,
      tokenEndpoint: transaction.tokenEndpoint
    } as NativeAuthorizationTransaction
    expect(() => validateIdTokenClaims(claims, forged, NOW, 0)).toThrow(ApiV2ContractError)

    /** @brief 不得在 opaque capability 校验前调用的签名 verifier / Signature verifier that must not run before opaque-capability validation. */
    const verifier = { verifySignature: vi.fn(() => Promise.resolve(claims)) }
    await expect(
      verifyIdToken('header.payload.signature', forged, verifier, (): number => NOW)
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(verifier.verifySignature).not.toHaveBeenCalled()
  })

  it('validates the exact callback target, state, and issuer for the shared parser', async (): Promise<void> => {
    /** @brief 原 native 事务 / Original native transaction. */
    const transaction = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    expect(parseAuthorizationCallback(callbackUrl(transaction), transaction, NOW)).toEqual({
      code: 'authorization_code_example_1234567890'
    })

    /** @brief 被替换路径的 callback / Callback with a substituted path. */
    const wrongPath = new URL(callbackUrl(transaction))
    wrongPath.pathname = '/oauth/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    expect(() => parseAuthorizationCallback(wrongPath.toString(), transaction, NOW)).toThrow(
      ApiV2ContractError
    )

    /** @brief WHATWG URL 会规范化但必须按原始 target 拒绝的 dot-segment callback / Dot-segment callback normalized by WHATWG URL but rejected by its raw target. */
    const validCallback = new URL(callbackUrl(transaction))
    const normalizedAlias = `${transaction.redirectUri.replace('/oauth/callback/', '/oauth/ignored/../callback/')}?${validCallback.searchParams.toString()}`
    expect(() => parseAuthorizationCallback(normalizedAlias, transaction, NOW)).toThrow(
      ApiV2ContractError
    )

    /** @brief 被替换 state 的 callback / Callback with substituted state. */
    const wrongState = new URL(callbackUrl(transaction))
    wrongState.searchParams.set('state', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')
    expect(() => parseAuthorizationCallback(wrongState.toString(), transaction, NOW)).toThrow(
      ApiV2ContractError
    )

    /** @brief 被替换 issuer 的 callback / Callback with a substituted issuer. */
    const wrongIssuer = new URL(callbackUrl(transaction))
    wrongIssuer.searchParams.set('iss', 'https://attacker.example')
    expect(() => parseAuthorizationCallback(wrongIssuer.toString(), transaction, NOW)).toThrow(
      ApiV2ContractError
    )
  })

  it('allows exactly one authorization-code exchange claim for native transactions', async (): Promise<void> => {
    /** @brief 原 native 事务 / Original native transaction. */
    const transaction = (await createNativeAuthorizationRequest(nativeOptions())).transaction
    claimAuthorizationCodeExchange(transaction)
    expect(() => claimAuthorizationCodeExchange(transaction)).toThrow(ApiV2ContractError)

    /** @brief 结构伪造的 native 事务 / Structurally forged native transaction. */
    const forged = { ...transaction } as NativeAuthorizationTransaction
    expect(() => claimAuthorizationCodeExchange(forged)).toThrow(ApiV2ContractError)
  })
})
