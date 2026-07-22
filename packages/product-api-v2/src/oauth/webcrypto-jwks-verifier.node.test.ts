/** @file WebCrypto + JWKS ID Token verifier 安全测试 / Security tests for the WebCrypto + JWKS ID Token verifier. */

import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import type { ApiV2NetworkError } from '../http/errors'
import { API_V2_OAUTH_JWKS_URI } from './discovery'
import type { IdTokenSignatureVerificationInput } from './id-token'
import {
  WebCryptoJwksIdTokenVerifier,
  type SupportedIdTokenAlgorithm
} from './webcrypto-jwks-verifier'

/** @brief verifier 收到的 discovery 算法白名单 / Discovery algorithm allowlist supplied to the verifier. */
const ALGORITHMS = ['ES256', 'RS256'] as const

/** @brief 测试用 OIDC claims / OIDC claims used by tests. */
const CLAIMS = {
  aud: 'workspace-web',
  exp: 1_800_000_600,
  iat: 1_800_000_000,
  iss: 'https://api.hmalliances.org:8022',
  nonce: 'nonce_example_123456789012345678901234567890',
  sub: 'oidc-subject-01K0EXAMPLE0001'
}

/** @brief 测试使用的 JOSE public JWK / JOSE public JWK used by tests. */
interface TestPublicJwk extends JsonWebKey {
  /** @brief JOSE 算法 / JOSE algorithm. */
  readonly alg: SupportedIdTokenAlgorithm
  /** @brief JOSE key ID / JOSE key ID. */
  readonly kid: string
  /** @brief 公钥用途 / Public-key use. */
  readonly use: 'sig'
}

/** @brief 测试签名 key pair 与 public JWK / Test signing key pair and public JWK. */
interface SigningKey {
  /** @brief JWS algorithm / JWS algorithm. */
  readonly algorithm: SupportedIdTokenAlgorithm
  /** @brief Key ID / Key ID. */
  readonly kid: string
  /** @brief Private signing key / Private signing key. */
  readonly privateKey: CryptoKey
  /** @brief Public verification JWK / Public verification JWK. */
  readonly publicJwk: TestPublicJwk
}

/**
 * @brief 将字节编码为 Base64url / Encode bytes as Base64url.
 * @param bytes 原始字节 / Raw bytes.
 * @return 无 padding Base64url / Unpadded Base64url.
 */
function encodeBytes(bytes: Uint8Array): string {
  /** @brief 二进制字符串 / Binary string. */
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * @brief 将 JSON 值编码为 compact-JWS 段 / Encode a JSON value as a compact-JWS segment.
 * @param value JSON 值 / JSON value.
 * @return Base64url 段 / Base64url segment.
 */
function encodeJson(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)))
}

/**
 * @brief 生成 RS256 或 ES256 测试 key / Generate an RS256 or ES256 test key.
 * @param algorithm JWS 算法 / JWS algorithm.
 * @param kid key ID / Key ID.
 * @param rsaModulusLength 可选 RSA modulus bit length / Optional RSA modulus bit length.
 * @return 签名 key 与 public JWK / Signing key and public JWK.
 */
async function createSigningKey(
  algorithm: SupportedIdTokenAlgorithm,
  kid: string,
  rsaModulusLength = 2048
): Promise<SigningKey> {
  /** @brief Web Crypto key generation algorithm / Web Crypto key-generation algorithm. */
  const generationAlgorithm: RsaHashedKeyGenParams | EcKeyGenParams =
    algorithm === 'RS256'
      ? {
          hash: 'SHA-256',
          modulusLength: rsaModulusLength,
          name: 'RSASSA-PKCS1-v1_5',
          publicExponent: new Uint8Array([1, 0, 1])
        }
      : { name: 'ECDSA', namedCurve: 'P-256' }
  /** @brief 生成的 key pair / Generated key pair. */
  const pair = await crypto.subtle.generateKey(generationAlgorithm, true, ['sign', 'verify'])
  /** @brief 导出的 public JWK / Exported public JWK. */
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    algorithm,
    kid,
    privateKey: pair.privateKey,
    publicJwk: {
      ...exported,
      alg: algorithm,
      key_ops: ['verify'],
      kid,
      use: 'sig'
    }
  }
}

/**
 * @brief 使用 Web Crypto 生成 compact JWS / Produce a compact JWS with Web Crypto.
 * @param key 签名 key / Signing key.
 * @param claims payload claims / Payload claims.
 * @param kidOverride 可选 header kid / Optional header kid.
 * @return token 与 raw signature / Token and raw signature.
 */
async function signToken(
  key: SigningKey,
  claims: unknown = CLAIMS,
  kidOverride?: string
): Promise<{ readonly signature: Uint8Array; readonly token: string }> {
  /** @brief protected header 段 / Protected-header segment. */
  const header = encodeJson({
    alg: key.algorithm,
    kid: kidOverride ?? key.kid,
    typ: 'JWT'
  })
  /** @brief payload 段 / Payload segment. */
  const payload = encodeJson(claims)
  /** @brief signing input / Signing input. */
  const input = new TextEncoder().encode(`${header}.${payload}`)
  /** @brief Web Crypto signing algorithm / Web Crypto signing algorithm. */
  const signingAlgorithm: AlgorithmIdentifier | EcdsaParams =
    key.algorithm === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5' } : { hash: 'SHA-256', name: 'ECDSA' }
  /** @brief raw signature / Raw signature. */
  const signature = new Uint8Array(
    await crypto.subtle.sign(signingAlgorithm, key.privateKey, input)
  )
  return { signature, token: `${header}.${payload}.${encodeBytes(signature)}` }
}

/**
 * @brief 构造 JWKS HTTP response / Construct a JWKS HTTP response.
 * @param keys Public JWKs / Public JWKs.
 * @return JWK Set response / JWK Set response.
 */
function jwksResponse(keys: readonly JsonWebKey[]): Response {
  return new Response(JSON.stringify({ keys }), {
    headers: { 'Content-Type': 'application/jwk-set+json' },
    status: 200
  })
}

/**
 * @brief 构造 verifier 输入 / Construct verifier input.
 * @param token Compact ID Token / Compact ID Token.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 完整 verifier 输入 / Complete verifier input.
 */
function verifierInput(token: string, signal?: AbortSignal): IdTokenSignatureVerificationInput {
  return {
    allowedAlgorithms: ALGORITHMS,
    idToken: token,
    jwksUri: API_V2_OAUTH_JWKS_URI,
    signal
  }
}

describe('WebCryptoJwksIdTokenVerifier', (): void => {
  it.each(['RS256', 'ES256'] as const)(
    'verifies a real %s Web Crypto signature and returns claims only afterwards',
    async (algorithm): Promise<void> => {
      /** @brief 签名 key / Signing key. */
      const key = await createSigningKey(algorithm, `${algorithm.toLowerCase()}-current`)
      /** @brief 签名 token / Signed token. */
      const signed = await signToken(key)
      if (algorithm === 'ES256') {
        // Web Crypto follows its normative IEEE-P1363/JOSE-compatible R||S representation here.
        expect(signed.signature.byteLength).toBe(64)
      }
      /** @brief 捕获安全 Fetch 选项的 spy / Spy capturing secure Fetch options. */
      const fetchImpl = vi.fn<typeof fetch>((input, init) => {
        expect(input).toBe(API_V2_OAUTH_JWKS_URI)
        expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
        return Promise.resolve(jwksResponse([key.publicJwk]))
      })
      /** @brief 生产 verifier / Production verifier. */
      const verifier = new WebCryptoJwksIdTokenVerifier({ fetchImpl })
      await expect(verifier.verifySignature(verifierInput(signed.token))).resolves.toEqual(CLAIMS)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  )

  it('rejects a tampered payload/signature and never returns unverified claims', async (): Promise<void> => {
    /** @brief RS256 key / RS256 key. */
    const key = await createSigningKey('RS256', 'rsa-current')
    /** @brief 原签名 token / Originally signed token. */
    const signed = await signToken(key)
    /** @brief 被篡改的 payload / Tampered payload. */
    const segments = signed.token.split('.')
    /** @brief 篡改 token / Tampered token. */
    const tampered = `${segments[0]}.${encodeJson({ ...CLAIMS, sub: 'attacker' })}.${segments[2]}`
    /** @brief verifier / Verifier. */
    const verifier = new WebCryptoJwksIdTokenVerifier({
      fetchImpl: (): Promise<Response> => Promise.resolve(jwksResponse([key.publicJwk]))
    })
    await expect(verifier.verifySignature(verifierInput(tampered))).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
  })

  it.each(['none', 'HS256'])(
    'rejects %s before any JWKS network request',
    async (algorithm): Promise<void> => {
      /** @brief 非法 alg token / Token with a forbidden alg. */
      const token = `${encodeJson({ alg: algorithm, kid: 'attacker' })}.${encodeJson(CLAIMS)}.AA`
      /** @brief 不应调用的 Fetch / Fetch that must not be called. */
      const fetchImpl = vi.fn<typeof fetch>()
      /** @brief verifier / Verifier. */
      const verifier = new WebCryptoJwksIdTokenVerifier({ fetchImpl })
      await expect(verifier.verifySignature(verifierInput(token))).rejects.toBeInstanceOf(
        ApiV2ContractError
      )
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )

  it('forces exactly one refresh on kid miss and accepts a rotated key', async (): Promise<void> => {
    /** @brief 旧 key / Old key. */
    const oldKey = await createSigningKey('RS256', 'rsa-old')
    /** @brief 新 key / New key. */
    const newKey = await createSigningKey('RS256', 'rsa-new')
    /** @brief 旧 token / Old token. */
    const oldToken = await signToken(oldKey)
    /** @brief 新 token / New token. */
    const newToken = await signToken(newKey)
    /** @brief 第一次旧 JWKS、刷新后新 JWKS / Old JWKS first, new JWKS after refresh. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jwksResponse([oldKey.publicJwk]))
      .mockResolvedValueOnce(jwksResponse([newKey.publicJwk]))
    /** @brief verifier / Verifier. */
    const verifier = new WebCryptoJwksIdTokenVerifier({ fetchImpl })
    await expect(verifier.verifySignature(verifierInput(oldToken.token))).resolves.toEqual(CLAIMS)
    await expect(verifier.verifySignature(verifierInput(newToken.token))).resolves.toEqual(CLAIMS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('refreshes once when a rotated key reuses the same kid', async (): Promise<void> => {
    /** @brief 旧 key / Old key. */
    const oldKey = await createSigningKey('RS256', 'rsa-stable-kid')
    /** @brief 同 kid 新 key / New key reusing the same kid. */
    const newKey = await createSigningKey('RS256', 'rsa-stable-kid')
    /** @brief 旧 token / Old token. */
    const oldToken = await signToken(oldKey)
    /** @brief 新 token / New token. */
    const newToken = await signToken(newKey)
    /** @brief 轮换前后 JWKS / JWKS before and after rotation. */
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jwksResponse([oldKey.publicJwk]))
      .mockResolvedValueOnce(jwksResponse([newKey.publicJwk]))
    /** @brief verifier / Verifier. */
    const verifier = new WebCryptoJwksIdTokenVerifier({ fetchImpl })
    await expect(verifier.verifySignature(verifierInput(oldToken.token))).resolves.toEqual(CLAIMS)
    await expect(verifier.verifySignature(verifierInput(newToken.token))).resolves.toEqual(CLAIMS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects an RS256 modulus shorter than the JWA 2048-bit minimum', async (): Promise<void> => {
    /** @brief 弱 1024-bit RSA key / Weak 1024-bit RSA key. */
    const weakKey = await createSigningKey('RS256', 'rsa-weak', 1024)
    /** @brief 弱 key 签发的 token / Token signed by the weak key. */
    const token = await signToken(weakKey)
    /** @brief verifier / Verifier. */
    const verifier = new WebCryptoJwksIdTokenVerifier({
      fetchImpl: (): Promise<Response> => Promise.resolve(jwksResponse([weakKey.publicJwk]))
    })
    await expect(verifier.verifySignature(verifierInput(token.token))).rejects.toThrow(
      'at least 2048 bits'
    )
  })

  it('stops reading an oversized JWKS before JSON parsing', async (): Promise<void> => {
    /** @brief RS256 key / RS256 key. */
    const key = await createSigningKey('RS256', 'rsa-current')
    /** @brief token / Token. */
    const signed = await signToken(key)
    /** @brief 明显超过测试限制的 response / Response clearly exceeding the test limit. */
    const oversized = new Response(
      JSON.stringify({ keys: [key.publicJwk], padding: 'x'.repeat(512) }),
      {
        headers: { 'Content-Type': 'application/jwk-set+json' },
        status: 200
      }
    )
    /** @brief 小上限 verifier / Verifier with a small limit. */
    const verifier = new WebCryptoJwksIdTokenVerifier({
      fetchImpl: (): Promise<Response> => Promise.resolve(oversized),
      maxJwksBytes: 128
    })
    await expect(verifier.verifySignature(verifierInput(signed.token))).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
  })

  it('propagates cancellation and does not start a JWKS request after abort', async (): Promise<void> => {
    /** @brief RS256 key / RS256 key. */
    const key = await createSigningKey('RS256', 'rsa-current')
    /** @brief token / Token. */
    const signed = await signToken(key)
    /** @brief 已取消 controller / Already-aborted controller. */
    const controller = new AbortController()
    controller.abort()
    /** @brief 不应调用的 Fetch / Fetch that must not be called. */
    const fetchImpl = vi.fn<typeof fetch>()
    /** @brief verifier / Verifier. */
    const verifier = new WebCryptoJwksIdTokenVerifier({ fetchImpl })
    await expect(
      verifier.verifySignature(verifierInput(signed.token, controller.signal))
    ).rejects.toMatchObject({ kind: 'aborted' } satisfies Partial<ApiV2NetworkError>)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
