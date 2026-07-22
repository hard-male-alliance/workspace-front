/** @file 注入式 ID Token 签名验证端口与强制 claim 校验 / Injectable ID Token signature-verification port and mandatory claim validation. */

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import type { WebAuthorizationTransaction } from './authorization'

/** @brief 通过签名验证器的输入 / Input to the signature verifier. */
export interface IdTokenSignatureVerificationInput {
  /** @brief 未经信任的 compact ID Token / Untrusted compact ID Token. */
  readonly idToken: string
  /** @brief discovery 动态提供的 JWKS URI / JWKS URI dynamically supplied by discovery. */
  readonly jwksUri: string
  /** @brief discovery 允许的非对称算法 / Asymmetric algorithms allowed by discovery. */
  readonly allowedAlgorithms: readonly string[]
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal | undefined
}

/**
 * @brief ID Token 加密验证端口 / Cryptographic ID Token verification port.
 * @note 实现必须从 jwksUri 获取/缓存密钥，校验 compact JWS 签名，并拒绝 none、对称算法和未列出的 alg；返回值仍会由核心校验 claims。 / Implementations must fetch/cache keys from jwksUri, verify the compact-JWS signature, and reject none, symmetric, and unlisted algorithms; claims are still checked by the core.
 */
export interface IdTokenSignatureVerifier {
  /**
   * @brief 验证签名并返回尚未信任语义的 claims / Verify the signature and return semantically untrusted claims.
   * @param input token、JWKS 与算法白名单 / Token, JWKS, and algorithm allowlist.
   * @return 通过签名验证的 claims JSON / Claims JSON after signature verification.
   */
  readonly verifySignature: (input: IdTokenSignatureVerificationInput) => Promise<unknown>
}

/** @brief 未接入加密库时的失败关闭 verifier / Fail-closed verifier used before a cryptographic adapter is wired. */
export class RejectingIdTokenSignatureVerifier implements IdTokenSignatureVerifier {
  /**
   * @brief 始终拒绝未经配置的签名验证 / Always reject unconfigured signature verification.
   * @param _input 未使用的验证输入 / Unused verification input.
   * @return 永不返回 / Never returns.
   */
  verifySignature(_input: IdTokenSignatureVerificationInput): Promise<never> {
    void _input
    return Promise.reject(
      new ApiV2ContractError('No cryptographic ID Token verifier is configured.')
    )
  }
}

/** @brief 核心已验证的 OIDC 身份 claims / OIDC identity claims validated by the core. */
export interface VerifiedIdTokenClaims {
  /** @brief 精确 issuer / Exact issuer. */
  readonly issuer: string
  /** @brief OIDC subject / OIDC subject. */
  readonly subject: string
  /** @brief 客户端 audience / Client audience. */
  readonly audience: readonly string[]
  /** @brief 到期 epoch 秒 / Expiration epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 签发 epoch 秒 / Issued-at epoch seconds. */
  readonly issuedAtEpochSeconds: number
}

/**
 * @brief 读取必需字符串 claim / Read a required string claim.
 * @param value 未知 claim / Unknown claim.
 * @param name claim 名 / Claim name.
 * @return 已校验字符串 / Validated string.
 */
function claimString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new ApiV2ContractError(`ID Token claim ${name} must be a non-empty string.`)
  }
  return value
}

/**
 * @brief 读取必需 NumericDate claim / Read a required NumericDate claim.
 * @param value 未知 claim / Unknown claim.
 * @param name claim 名 / Claim name.
 * @return 安全整数 epoch 秒 / Safe integer epoch seconds.
 */
function numericDate(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ApiV2ContractError(
      `ID Token claim ${name} must be a non-negative integer NumericDate.`
    )
  }
  return value as number
}

/**
 * @brief 在加密签名验证后强制校验 OIDC nonce/iss/aud/exp / Enforce OIDC nonce/iss/aud/exp after cryptographic signature verification.
 * @param claimsValue 签名已验证但语义未验证的 claims / Signature-verified but semantically untrusted claims.
 * @param transaction 原授权事务 / Original authorization transaction.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @param clockSkewSeconds 允许的时钟偏差 / Allowed clock skew.
 * @return 完整验证的身份 claims / Fully validated identity claims.
 */
export function validateIdTokenClaims(
  claimsValue: unknown,
  transaction: WebAuthorizationTransaction,
  nowEpochSeconds: number = Date.now() / 1000,
  clockSkewSeconds = 60
): VerifiedIdTokenClaims {
  if (typeof claimsValue !== 'object' || claimsValue === null || Array.isArray(claimsValue)) {
    throw new ApiV2ContractError('ID Token claims must be an object.')
  }
  if (
    !Number.isFinite(nowEpochSeconds) ||
    !Number.isSafeInteger(clockSkewSeconds) ||
    clockSkewSeconds < 0 ||
    clockSkewSeconds > 300
  ) {
    throw new ApiV2ContractError('ID Token time validation configuration is invalid.')
  }
  /** @brief Claims 对象 / Claims object. */
  const claims = claimsValue as Record<string, unknown>
  /** @brief issuer / Issuer. */
  const issuer = claimString(claims.iss, 'iss')
  /** @brief subject / Subject. */
  const subject = claimString(claims.sub, 'sub')
  /** @brief nonce / Nonce. */
  const nonce = claimString(claims.nonce, 'nonce')
  /** @brief 到期时间 / Expiration time. */
  const expiresAt = numericDate(claims.exp, 'exp')
  /** @brief 签发时间 / Issued-at time. */
  const issuedAt = numericDate(claims.iat, 'iat')
  if (issuer !== transaction.issuer) {
    throw new ApiV2ContractError('ID Token issuer does not match the authorization transaction.')
  }
  if (nonce !== transaction.nonce) {
    throw new ApiV2ContractError('ID Token nonce does not match the authorization transaction.')
  }
  /** @brief audience 数组 / Audience array. */
  let audience: readonly string[]
  if (typeof claims.aud === 'string') audience = [claimString(claims.aud, 'aud')]
  else if (Array.isArray(claims.aud) && claims.aud.length > 0 && claims.aud.length <= 16) {
    audience = claims.aud.map((value) => claimString(value, 'aud'))
  } else {
    throw new ApiV2ContractError('ID Token aud must be a string or non-empty string array.')
  }
  if (!audience.includes(transaction.clientId)) {
    throw new ApiV2ContractError('ID Token audience does not include the OAuth client.')
  }
  if (new Set(audience).size !== audience.length) {
    throw new ApiV2ContractError('ID Token audience must not contain duplicates.')
  }
  if (
    (audience.length > 1 || claims.azp !== undefined) &&
    claimString(claims.azp, 'azp') !== transaction.clientId
  ) {
    throw new ApiV2ContractError('ID Token authorized party does not match the OAuth client.')
  }
  if (expiresAt + clockSkewSeconds <= nowEpochSeconds) {
    throw new ApiV2ContractError('ID Token has expired.')
  }
  if (issuedAt > nowEpochSeconds + clockSkewSeconds) {
    throw new ApiV2ContractError('ID Token was issued in the future.')
  }
  if (issuedAt < transaction.createdAtEpochSeconds - clockSkewSeconds) {
    throw new ApiV2ContractError('ID Token predates the authorization transaction.')
  }
  if (expiresAt <= issuedAt) {
    throw new ApiV2ContractError('ID Token expiration must be later than its issue time.')
  }
  if (
    claims.nbf !== undefined &&
    numericDate(claims.nbf, 'nbf') > nowEpochSeconds + clockSkewSeconds
  ) {
    throw new ApiV2ContractError('ID Token is not active yet.')
  }
  return Object.freeze({
    audience: Object.freeze([...audience]),
    expiresAtEpochSeconds: expiresAt,
    issuedAtEpochSeconds: issuedAt,
    issuer,
    subject
  })
}

/**
 * @brief 先验证签名，再独立验证安全 claims / Verify signature first, then independently validate security claims.
 * @param idToken 未经信任的 ID Token / Untrusted ID Token.
 * @param transaction 原授权事务 / Original authorization transaction.
 * @param verifier 注入的加密 verifier / Injected cryptographic verifier.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @return 完整验证的 claims / Fully validated claims.
 */
export async function verifyIdToken(
  idToken: string,
  transaction: WebAuthorizationTransaction,
  verifier: IdTokenSignatureVerifier = new RejectingIdTokenSignatureVerifier(),
  nowEpochSeconds: () => number = (): number => Date.now() / 1000,
  signal?: AbortSignal
): Promise<VerifiedIdTokenClaims> {
  /** @brief 加密 verifier 输入 / Cryptographic-verifier input. */
  const verificationInput: IdTokenSignatureVerificationInput = {
    allowedAlgorithms: transaction.idTokenSigningAlgorithms,
    idToken,
    jwksUri: transaction.jwksUri,
    ...(signal === undefined ? {} : { signal })
  }
  /** @brief 通过加密验证的 claims / Cryptographically verified claims. */
  const claims = await verifier.verifySignature(verificationInput)
  if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
  /** @brief 签名验证完成后的当前时间 / Current time after signature verification. */
  let now: number
  try {
    now = nowEpochSeconds()
  } catch {
    throw new ApiV2ContractError('ID Token clock failed.')
  }
  return validateIdTokenClaims(claims, transaction, now)
}
