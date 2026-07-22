/** @file 注入式 ID Token 签名验证端口与强制 claim 校验 / Injectable ID Token signature-verification port and mandatory claim validation. */

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import {
  assertActivePublicClientAuthorizationTransaction,
  type PublicClientAuthorizationTransaction
} from './authorization'

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
  /** @brief 可选授权方；保留 presence 以验证 refresh 身份连续性 / Optional authorized party; presence is retained to validate refresh identity continuity. */
  readonly authorizedParty: string | null
  /** @brief 到期 epoch 秒 / Expiration epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 签发 epoch 秒 / Issued-at epoch seconds. */
  readonly issuedAtEpochSeconds: number
}

/** @brief 刷新 ID Token 必须复用的首次验证配置 / Initial verification configuration that a refresh ID Token must reuse. */
export interface RefreshIdTokenVerificationContext {
  /** @brief 首次授权使用的 public client ID / Public-client ID used by the initial authorization. */
  readonly clientId: string
  /** @brief 首次授权钉死的 issuer / Issuer pinned by the initial authorization. */
  readonly issuer: string
  /** @brief 首次授权钉死的 JWKS URI / JWKS URI pinned by the initial authorization. */
  readonly jwksUri: string
  /** @brief 首次授权请求绑定的 nonce / Nonce bound to the initial authorization request. */
  readonly nonce: string
  /** @brief 首次 discovery 与本地共同允许的算法 / Algorithms allowed by both initial discovery and local policy. */
  readonly allowedAlgorithms: readonly string[]
}

/** @brief 可选 refresh ID Token 的严格验证输入 / Strict input for an optional refresh ID Token. */
export interface VerifyRefreshIdTokenOptions {
  /** @brief Refresh response 中可选的 ID Token / Optional ID Token from the refresh response. */
  readonly idToken: string | null
  /** @brief 首次验证后必须保持的身份 / Identity that must remain stable after initial verification. */
  readonly priorIdentity: VerifiedIdTokenClaims
  /** @brief 首次授权绑定的验证配置 / Verification configuration bound at initial authorization. */
  readonly verificationContext: RefreshIdTokenVerificationContext
  /** @brief 注入的加密签名 verifier / Injected cryptographic signature verifier. */
  readonly verifier: IdTokenSignatureVerifier
  /** @brief 可替换当前 epoch 秒 / Replaceable current epoch seconds. */
  readonly nowEpochSeconds?: (() => number) | undefined
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal | undefined
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
 * @brief 读取规范化且无重复的 audience / Read a normalized, duplicate-free audience.
 * @param value 未知 aud claim / Unknown aud claim.
 * @return 非空 audience 数组 / Non-empty audience array.
 */
function claimAudience(value: unknown): readonly string[] {
  /** @brief 规范化 audience / Normalized audience. */
  let audience: readonly string[]
  if (typeof value === 'string') audience = [claimString(value, 'aud')]
  else if (Array.isArray(value) && value.length > 0 && value.length <= 16) {
    audience = value.map((item) => claimString(item, 'aud'))
  } else {
    throw new ApiV2ContractError('ID Token aud must be a string or non-empty string array.')
  }
  if (new Set(audience).size !== audience.length) {
    throw new ApiV2ContractError('ID Token audience must not contain duplicates.')
  }
  return audience
}

/**
 * @brief 严格读取并校验 authorized party / Strictly read and validate the authorized party.
 * @param value 未知 azp claim / Unknown azp claim.
 * @param audience 已验证 audience / Validated audience.
 * @param clientId 预期 OAuth client ID / Expected OAuth client ID.
 * @return azp；未提供时为 null / The azp value, or null when absent.
 */
function claimAuthorizedParty(
  value: unknown,
  audience: readonly string[],
  clientId: string
): string | null {
  if (audience.length > 1 && value === undefined) {
    throw new ApiV2ContractError('ID Token with multiple audiences must contain azp.')
  }
  if (value === undefined) return null
  /** @brief 已验证 authorized party / Validated authorized party. */
  const authorizedParty = claimString(value, 'azp')
  if (authorizedParty !== clientId) {
    throw new ApiV2ContractError('ID Token authorized party does not match the OAuth client.')
  }
  return authorizedParty
}

/**
 * @brief 校验 ID Token 时间配置 / Validate ID Token time-validation configuration.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @param clockSkewSeconds 允许时钟偏差 / Allowed clock skew.
 */
function assertTimeConfiguration(nowEpochSeconds: number, clockSkewSeconds: number): void {
  if (
    !Number.isFinite(nowEpochSeconds) ||
    !Number.isSafeInteger(clockSkewSeconds) ||
    clockSkewSeconds < 0 ||
    clockSkewSeconds > 300
  ) {
    throw new ApiV2ContractError('ID Token time validation configuration is invalid.')
  }
}

/**
 * @brief 校验通用 exp/iat/nbf 时间边界 / Validate common exp/iat/nbf time boundaries.
 * @param claims ID Token claims / ID Token claims.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @param clockSkewSeconds 允许时钟偏差 / Allowed clock skew.
 * @return exp 与 iat / The exp and iat values.
 */
function validateTokenTimes(
  claims: Readonly<Record<string, unknown>>,
  nowEpochSeconds: number,
  clockSkewSeconds: number
): Readonly<{ expiresAt: number; issuedAt: number }> {
  /** @brief 到期时间 / Expiration time. */
  const expiresAt = numericDate(claims.exp, 'exp')
  /** @brief 签发时间 / Issued-at time. */
  const issuedAt = numericDate(claims.iat, 'iat')
  if (expiresAt + clockSkewSeconds <= nowEpochSeconds) {
    throw new ApiV2ContractError('ID Token has expired.')
  }
  if (issuedAt > nowEpochSeconds + clockSkewSeconds) {
    throw new ApiV2ContractError('ID Token was issued in the future.')
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
  return Object.freeze({ expiresAt, issuedAt })
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
  transaction: PublicClientAuthorizationTransaction,
  nowEpochSeconds: number = Date.now() / 1000,
  clockSkewSeconds = 60
): VerifiedIdTokenClaims {
  assertTimeConfiguration(nowEpochSeconds, clockSkewSeconds)
  assertActivePublicClientAuthorizationTransaction(transaction, nowEpochSeconds)
  if (typeof claimsValue !== 'object' || claimsValue === null || Array.isArray(claimsValue)) {
    throw new ApiV2ContractError('ID Token claims must be an object.')
  }
  /** @brief Claims 对象 / Claims object. */
  const claims = claimsValue as Record<string, unknown>
  /** @brief issuer / Issuer. */
  const issuer = claimString(claims.iss, 'iss')
  /** @brief subject / Subject. */
  const subject = claimString(claims.sub, 'sub')
  /** @brief nonce / Nonce. */
  const nonce = claimString(claims.nonce, 'nonce')
  if (issuer !== transaction.issuer) {
    throw new ApiV2ContractError('ID Token issuer does not match the authorization transaction.')
  }
  if (nonce !== transaction.nonce) {
    throw new ApiV2ContractError('ID Token nonce does not match the authorization transaction.')
  }
  /** @brief audience 数组 / Audience array. */
  const audience = claimAudience(claims.aud)
  if (!audience.includes(transaction.clientId)) {
    throw new ApiV2ContractError('ID Token audience does not include the OAuth client.')
  }
  /** @brief 可选 authorized party / Optional authorized party. */
  const authorizedParty = claimAuthorizedParty(claims.azp, audience, transaction.clientId)
  /** @brief 已验证时间 / Validated times. */
  const { expiresAt, issuedAt } = validateTokenTimes(claims, nowEpochSeconds, clockSkewSeconds)
  if (issuedAt < transaction.createdAtEpochSeconds - clockSkewSeconds) {
    throw new ApiV2ContractError('ID Token predates the authorization transaction.')
  }
  return Object.freeze({
    audience: Object.freeze([...audience]),
    authorizedParty,
    expiresAtEpochSeconds: expiresAt,
    issuedAtEpochSeconds: issuedAt,
    issuer,
    subject
  })
}

/**
 * @brief 校验 refresh ID Token 的身份与首次授权严格连续 / Validate strict identity continuity between refresh and initial ID Tokens.
 * @param claimsValue 签名已验证但语义未验证的 refresh claims / Signature-verified but semantically untrusted refresh claims.
 * @param priorIdentity 首次已验证身份 / Initially verified identity.
 * @param context 首次绑定的 client、issuer、JWKS 与算法 / Initially bound client, issuer, JWKS, and algorithms.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @param clockSkewSeconds 允许时钟偏差 / Allowed clock skew.
 */
export function validateRefreshIdTokenClaims(
  claimsValue: unknown,
  priorIdentity: VerifiedIdTokenClaims,
  context: RefreshIdTokenVerificationContext,
  nowEpochSeconds: number = Date.now() / 1000,
  clockSkewSeconds = 60
): void {
  if (typeof claimsValue !== 'object' || claimsValue === null || Array.isArray(claimsValue)) {
    throw new ApiV2ContractError('Refresh ID Token claims must be an object.')
  }
  assertTimeConfiguration(nowEpochSeconds, clockSkewSeconds)
  if (context.issuer !== priorIdentity.issuer) {
    throw new ApiV2ContractError('Refresh ID Token verification context changed issuer.')
  }
  /** @brief Refresh claims 对象 / Refresh claims object. */
  const claims = claimsValue as Record<string, unknown>
  if (Reflect.has(claims, 'nonce') && claimString(claims.nonce, 'nonce') !== context.nonce) {
    throw new ApiV2ContractError(
      'Refresh ID Token nonce does not match the initial authorization request.'
    )
  }
  /** @brief Refresh issuer / Refresh issuer. */
  const issuer = claimString(claims.iss, 'iss')
  if (issuer !== context.issuer || issuer !== priorIdentity.issuer) {
    throw new ApiV2ContractError('Refresh ID Token issuer changed from the prior identity.')
  }
  /** @brief Refresh subject / Refresh subject. */
  const subject = claimString(claims.sub, 'sub')
  if (subject !== priorIdentity.subject) {
    throw new ApiV2ContractError('Refresh ID Token subject changed from the prior identity.')
  }
  /** @brief Refresh audience / Refresh audience. */
  const audience = claimAudience(claims.aud)
  if (
    !audience.includes(context.clientId) ||
    audience.length !== priorIdentity.audience.length ||
    audience.some((value, index) => value !== priorIdentity.audience[index])
  ) {
    throw new ApiV2ContractError('Refresh ID Token audience changed from the prior identity.')
  }
  /** @brief Refresh authorized party / Refresh authorized party. */
  const authorizedParty = claimAuthorizedParty(claims.azp, audience, context.clientId)
  if (authorizedParty !== priorIdentity.authorizedParty) {
    throw new ApiV2ContractError(
      'Refresh ID Token authorized party changed from the prior identity.'
    )
  }
  /** @brief Refresh token 时间 / Refresh-token times. */
  const { issuedAt } = validateTokenTimes(claims, nowEpochSeconds, clockSkewSeconds)
  if (
    issuedAt < priorIdentity.issuedAtEpochSeconds ||
    issuedAt < nowEpochSeconds - clockSkewSeconds
  ) {
    throw new ApiV2ContractError('Refresh ID Token was not freshly issued for this rotation.')
  }
}

/**
 * @brief 验证 refresh response 的可选 ID Token 且不替换首次身份 / Verify an optional refresh-response ID Token without replacing the initial identity.
 * @param options Refresh ID Token、首次身份与固定验证依赖 / Refresh ID Token, prior identity, and pinned verification dependencies.
 * @return 验证完成；ID Token 缺失时安全跳过 / Resolves after validation; safely skips an absent ID Token.
 * @note 非空 ID Token 始终复用首次 client、issuer、JWKS 与算法；成功也不返回新身份，调用方必须保留 priorIdentity。 / A present ID Token always reuses the initial client, issuer, JWKS, and algorithms; success returns no new identity, so callers must retain priorIdentity.
 */
export async function verifyRefreshIdToken(options: VerifyRefreshIdTokenOptions): Promise<void> {
  if (options.idToken === null) return
  /** @brief 加密 verifier 输入 / Cryptographic-verifier input. */
  const verificationInput: IdTokenSignatureVerificationInput = {
    allowedAlgorithms: options.verificationContext.allowedAlgorithms,
    idToken: options.idToken,
    jwksUri: options.verificationContext.jwksUri,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  }
  /** @brief 通过加密验证的 refresh claims / Cryptographically verified refresh claims. */
  const claims = await options.verifier.verifySignature(verificationInput)
  if (options.signal?.aborted === true) throw new ApiV2NetworkError('aborted')
  /** @brief 签名验证后的当前时间 / Current time after signature verification. */
  let now: number
  try {
    now = (options.nowEpochSeconds ?? ((): number => Date.now() / 1000))()
  } catch {
    throw new ApiV2ContractError('ID Token clock failed.')
  }
  validateRefreshIdTokenClaims(claims, options.priorIdentity, options.verificationContext, now)
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
  transaction: PublicClientAuthorizationTransaction,
  verifier: IdTokenSignatureVerifier = new RejectingIdTokenSignatureVerifier(),
  nowEpochSeconds: () => number = (): number => Date.now() / 1000,
  signal?: AbortSignal
): Promise<VerifiedIdTokenClaims> {
  /** @brief 签名网络动作前的事务检查时间 / Transaction-check time before any signature-verification network action. */
  let transactionCheckTime: number
  try {
    transactionCheckTime = nowEpochSeconds()
  } catch {
    throw new ApiV2ContractError('ID Token clock failed.')
  }
  assertActivePublicClientAuthorizationTransaction(transaction, transactionCheckTime)
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
