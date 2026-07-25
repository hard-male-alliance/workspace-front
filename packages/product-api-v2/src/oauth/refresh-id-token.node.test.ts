/** @file OIDC refresh response 可选 ID Token 严格验证测试 / Strict validation tests for an optional OIDC refresh-response ID Token. */

import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import type {
  IdTokenSignatureVerifier,
  RefreshIdTokenVerificationContext,
  VerifiedIdTokenClaims
} from './id-token'
import { validateRefreshIdTokenClaims, verifyRefreshIdToken } from './id-token'

/** @brief 固定测试时间 epoch 秒 / Fixed test time in epoch seconds. */
const NOW = 1_800_000_000

/** @brief 首次身份签发时间 / Initial-identity issue time. */
const PRIOR_ISSUED_AT = NOW - 600

/** @brief 固定 public client ID / Fixed public-client ID. */
const CLIENT_ID = 'workspace-web'

/** @brief 固定 issuer / Fixed issuer. */
const ISSUER = 'https://api.hmalliances.org:8022'

/** @brief 固定 refresh ID Token / Fixed refresh ID Token. */
const REFRESH_ID_TOKEN = 'refresh_id_token_example_only_not_a_real_jwt_7xN3pQ'

/** @brief 首次授权绑定的验证配置 / Verification configuration bound by initial authorization. */
const VERIFICATION_CONTEXT: RefreshIdTokenVerificationContext = Object.freeze({
  allowedAlgorithms: Object.freeze(['ES256', 'RS256']),
  clientId: CLIENT_ID,
  issuer: ISSUER,
  jwksUri: `${ISSUER}/oauth/jwks`,
  nonce: 'initial-authorization-nonce'
})

/** @brief 首次验证且必须保持的身份 / Initially verified identity that must remain stable. */
const PRIOR_IDENTITY: VerifiedIdTokenClaims = Object.freeze({
  audience: Object.freeze([CLIENT_ID, 'workspace-api']),
  authorizedParty: CLIENT_ID,
  expiresAtEpochSeconds: NOW - 1,
  issuedAtEpochSeconds: PRIOR_ISSUED_AT,
  issuer: ISSUER,
  subject: 'oidc-subject-refresh-tests'
})

/**
 * @brief 构造有效 refresh ID Token claims / Construct valid refresh ID Token claims.
 * @return 满足身份连续性与时间约束的 claims / Claims satisfying identity-continuity and time constraints.
 */
function validRefreshClaims(): Record<string, unknown> {
  return {
    aud: [CLIENT_ID, 'workspace-api'],
    azp: CLIENT_ID,
    exp: NOW + 600,
    iat: NOW,
    iss: ISSUER,
    nbf: NOW - 1,
    sub: PRIOR_IDENTITY.subject
  }
}

describe('OIDC refresh ID Token validation', (): void => {
  it('skips an absent ID Token without invoking cryptography', async (): Promise<void> => {
    /** @brief 不应调用的签名 verifier / Signature verifier that must not be called. */
    const verifier: IdTokenSignatureVerifier = {
      verifySignature: vi.fn(() => Promise.reject(new Error('must not run')))
    }
    await expect(
      verifyRefreshIdToken({
        idToken: null,
        nowEpochSeconds: (): number => NOW,
        priorIdentity: PRIOR_IDENTITY,
        verificationContext: VERIFICATION_CONTEXT,
        verifier
      })
    ).resolves.toBeUndefined()
    expect(verifier.verifySignature).not.toHaveBeenCalled()
  })

  it('reuses the initial JWKS and algorithm policy, then retains the prior identity', async (): Promise<void> => {
    /** @brief 验证调用取消信号 / Cancellation signal for the verification call. */
    const controller = new AbortController()
    /** @brief 返回有效 refresh claims 的 verifier / Verifier returning valid refresh claims. */
    const verifier: IdTokenSignatureVerifier = {
      verifySignature: vi.fn((input) => {
        expect(input).toEqual({
          allowedAlgorithms: VERIFICATION_CONTEXT.allowedAlgorithms,
          idToken: REFRESH_ID_TOKEN,
          jwksUri: VERIFICATION_CONTEXT.jwksUri,
          signal: controller.signal
        })
        return Promise.resolve(validRefreshClaims())
      })
    }
    /** @brief 调用前身份引用 / Identity reference before verification. */
    const identityBefore = PRIOR_IDENTITY
    await expect(
      verifyRefreshIdToken({
        idToken: REFRESH_ID_TOKEN,
        nowEpochSeconds: (): number => NOW,
        priorIdentity: identityBefore,
        signal: controller.signal,
        verificationContext: VERIFICATION_CONTEXT,
        verifier
      })
    ).resolves.toBeUndefined()
    expect(identityBefore).toBe(PRIOR_IDENTITY)
    expect(identityBefore.subject).toBe('oidc-subject-refresh-tests')
    expect(verifier.verifySignature).toHaveBeenCalledTimes(1)
  })

  it('accepts an omitted nonce or the exact initial nonce', (): void => {
    expect(() =>
      validateRefreshIdTokenClaims(validRefreshClaims(), PRIOR_IDENTITY, VERIFICATION_CONTEXT, NOW)
    ).not.toThrow()

    /** @brief 带首次 nonce 的 refresh claims / Refresh claims carrying the initial nonce. */
    const sameNonce = validRefreshClaims()
    sameNonce.nonce = VERIFICATION_CONTEXT.nonce
    expect(() =>
      validateRefreshIdTokenClaims(sameNonce, PRIOR_IDENTITY, VERIFICATION_CONTEXT, NOW)
    ).not.toThrow()
  })

  it('rejects every refresh identity, audience, lifetime, activation, and nonce discontinuity', (): void => {
    /** @brief 每个安全约束的破坏器 / Mutators that each violate one security invariant. */
    const invalidMutations: ReadonlyArray<
      readonly [string, (claims: Record<string, unknown>) => void]
    > = [
      ['issuer', (claims): void => void (claims.iss = 'https://attacker.example')],
      ['subject', (claims): void => void (claims.sub = 'different-subject')],
      ['audience', (claims): void => void (claims.aud = [CLIENT_ID, 'different-api'])],
      ['authorized party', (claims): void => void (claims.azp = 'different-client')],
      ['expiration', (claims): void => void (claims.exp = NOW - 61)],
      ['future issue time', (claims): void => void (claims.iat = NOW + 61)],
      ['stale issue time', (claims): void => void (claims.iat = NOW - 61)],
      ['future activation', (claims): void => void (claims.nbf = NOW + 61)],
      ['nonce mismatch', (claims): void => void (claims.nonce = 'different-authorization-nonce')]
    ]
    for (const [name, mutate] of invalidMutations) {
      /** @brief 单约束被破坏的 claims / Claims with one violated invariant. */
      const claims = validRefreshClaims()
      mutate(claims)
      expect(
        () => validateRefreshIdTokenClaims(claims, PRIOR_IDENTITY, VERIFICATION_CONTEXT, NOW),
        name
      ).toThrow(ApiV2ContractError)
    }
  })

  it('requires exact azp presence and exact audience order from the prior identity', (): void => {
    /** @brief 缺失 azp 的 claims / Claims missing azp. */
    const missingAzp = validRefreshClaims()
    delete missingAzp.azp
    expect(() =>
      validateRefreshIdTokenClaims(missingAzp, PRIOR_IDENTITY, VERIFICATION_CONTEXT, NOW)
    ).toThrow(ApiV2ContractError)

    /** @brief audience 次序改变的 claims / Claims with reordered audience. */
    const reorderedAudience = validRefreshClaims()
    reorderedAudience.aud = ['workspace-api', CLIENT_ID]
    expect(() =>
      validateRefreshIdTokenClaims(reorderedAudience, PRIOR_IDENTITY, VERIFICATION_CONTEXT, NOW)
    ).toThrow(ApiV2ContractError)

    /** @brief 首次无 azp 的单 audience 身份 / Initial single-audience identity without azp. */
    const priorWithoutAzp: VerifiedIdTokenClaims = Object.freeze({
      ...PRIOR_IDENTITY,
      audience: Object.freeze([CLIENT_ID]),
      authorizedParty: null
    })
    /** @brief Refresh 突然新增 azp 的 claims / Refresh claims unexpectedly adding azp. */
    const addedAzp = validRefreshClaims()
    addedAzp.aud = CLIENT_ID
    expect(() =>
      validateRefreshIdTokenClaims(addedAzp, priorWithoutAzp, VERIFICATION_CONTEXT, NOW)
    ).toThrow(ApiV2ContractError)
  })

  it('fails closed on signature rejection, issuer-context drift, cancellation, and clock failure', async (): Promise<void> => {
    /** @brief 拒绝签名的 verifier / Verifier rejecting the signature. */
    const rejectingVerifier: IdTokenSignatureVerifier = {
      verifySignature: (): Promise<never> =>
        Promise.reject(new ApiV2ContractError('signature rejected'))
    }
    await expect(
      verifyRefreshIdToken({
        idToken: REFRESH_ID_TOKEN,
        priorIdentity: PRIOR_IDENTITY,
        verificationContext: VERIFICATION_CONTEXT,
        verifier: rejectingVerifier
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    /** @brief 已取消控制器 / Already-aborted controller. */
    const controller = new AbortController()
    controller.abort()
    /** @brief 返回有效 claims 的 verifier / Verifier returning valid claims. */
    const validVerifier: IdTokenSignatureVerifier = {
      verifySignature: (): Promise<unknown> => Promise.resolve(validRefreshClaims())
    }
    await expect(
      verifyRefreshIdToken({
        idToken: REFRESH_ID_TOKEN,
        priorIdentity: PRIOR_IDENTITY,
        signal: controller.signal,
        verificationContext: VERIFICATION_CONTEXT,
        verifier: validVerifier
      })
    ).rejects.toBeInstanceOf(ApiV2NetworkError)

    await expect(
      verifyRefreshIdToken({
        idToken: REFRESH_ID_TOKEN,
        nowEpochSeconds: (): never => {
          throw new Error('clock unavailable')
        },
        priorIdentity: PRIOR_IDENTITY,
        verificationContext: VERIFICATION_CONTEXT,
        verifier: validVerifier
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)

    expect(() =>
      validateRefreshIdTokenClaims(
        validRefreshClaims(),
        PRIOR_IDENTITY,
        { ...VERIFICATION_CONTEXT, issuer: 'https://attacker.example' },
        NOW
      )
    ).toThrow(ApiV2ContractError)
  })
})
