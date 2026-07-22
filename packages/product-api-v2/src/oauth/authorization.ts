/** @file Web Authorization Code + PKCE 授权事务 / Web Authorization Code + PKCE authorization transaction. */

import { exactRecord } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  API_V2_OAUTH_AUTHORIZATION_ENDPOINT,
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI,
  API_V2_OAUTH_TOKEN_ENDPOINT,
  type OidcDiscoveryDocument
} from './discovery'

/** @brief OAuth scope-token 语法 / OAuth scope-token syntax. */
const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/u

/** @brief 本实现支持的 ID Token 算法 / ID Token algorithms supported by this implementation. */
const LOCAL_ID_TOKEN_ALGORITHMS = new Set(['ES256', 'RS256'])

/** @brief 授权事务快照版本 / Authorization-transaction snapshot version. */
const TRANSACTION_SNAPSHOT_VERSION = 1

/** @brief 授权事务最大存活秒数 / Maximum authorization-transaction lifetime in seconds. */
const TRANSACTION_LIFETIME_SECONDS = 10 * 60

/** @brief 本模块签发的事务实例 / Transactions issued by this module. */
const ISSUED_TRANSACTIONS = new WeakSet<object>()

/** @brief 已认领 code exchange 的事务实例 / Transactions whose code exchange has been claimed. */
const CONSUMED_TRANSACTIONS = new WeakSet<object>()

/** @brief Web 授权页面提示 / Web authorization screen hint. */
export type WebAuthorizationScreenHint = 'login' | 'recovery' | 'signup'

/** @brief offline_access 同意状态 / offline_access consent state. */
export type OfflineAccessConsent = 'existing' | 'request'

/** @brief 创建 Web 授权事务的输入 / Input for creating a Web authorization transaction. */
export interface CreateWebAuthorizationOptions {
  /** @brief 已验证 discovery / Validated discovery. */
  readonly discovery: OidcDiscoveryDocument
  /** @brief 已注册的 public client ID / Registered public-client ID. */
  readonly clientId: string
  /** @brief 精确注册的 Web redirect URI / Exactly registered Web redirect URI. */
  readonly redirectUri: string
  /** @brief 请求的 OAuth scopes / Requested OAuth scopes. */
  readonly scopes: readonly string[]
  /** @brief Hosted UI 页面提示 / Hosted-UI screen hint. */
  readonly screenHint: WebAuthorizationScreenHint
  /** @brief 请求 offline_access 时的同意状态 / Consent state when offline_access is requested. */
  readonly offlineAccessConsent?: OfflineAccessConsent | undefined
  /** @brief 可替换 Web Crypto；默认使用浏览器 global crypto / Replaceable Web Crypto; browser global crypto by default. */
  readonly crypto?: Crypto | undefined
  /** @brief 可替换当前 epoch 秒 / Replaceable current epoch seconds. */
  readonly nowEpochSeconds?: () => number
}

/** @brief 一次性 Web OAuth 授权事务 / One-time Web OAuth authorization transaction. */
export interface WebAuthorizationTransaction {
  /** @brief public client ID / Public client ID. */
  readonly clientId: string
  /** @brief 精确 redirect URI / Exact redirect URI. */
  readonly redirectUri: string
  /** @brief 固定 issuer / Fixed issuer. */
  readonly issuer: string
  /** @brief 动态发现的 token endpoint / Dynamically discovered token endpoint. */
  readonly tokenEndpoint: string
  /** @brief 动态发现的 JWKS URI / Dynamically discovered JWKS URI. */
  readonly jwksUri: string
  /** @brief discovery 允许的 ID Token 签名算法 / ID Token signing algorithms allowed by discovery. */
  readonly idTokenSigningAlgorithms: readonly string[]
  /** @brief 请求的 scopes / Requested scopes. */
  readonly scopes: readonly string[]
  /** @brief CSRF 关联值 / CSRF correlation value. */
  readonly state: string
  /** @brief OIDC 重放关联值 / OIDC replay correlation value. */
  readonly nonce: string
  /** @brief PKCE verifier；只驻留当前页面内存 / PKCE verifier; current-page memory only. */
  readonly codeVerifier: string
  /** @brief 创建时间 epoch 秒 / Creation time in epoch seconds. */
  readonly createdAtEpochSeconds: number
}

/** @brief 可跨顶层导航保存的一次性事务快照 / One-time transaction snapshot that can cross a top-level navigation. */
export interface WebAuthorizationTransactionSnapshot {
  /** @brief 固定快照版本 / Frozen snapshot version. */
  readonly version: 1
  /** @brief public client ID / Public client ID. */
  readonly client_id: string
  /** @brief 精确 redirect URI / Exact redirect URI. */
  readonly redirect_uri: string
  /** @brief 请求 scopes / Requested scopes. */
  readonly scopes: readonly string[]
  /** @brief 本地与 discovery 共同允许的算法 / Algorithms allowed both locally and by discovery. */
  readonly id_token_signing_algorithms: readonly string[]
  /** @brief CSRF state / CSRF state. */
  readonly state: string
  /** @brief OIDC nonce / OIDC nonce. */
  readonly nonce: string
  /** @brief PKCE verifier / PKCE verifier. */
  readonly code_verifier: string
  /** @brief 创建时间 epoch 秒 / Creation time in epoch seconds. */
  readonly created_at_epoch_seconds: number
}

/** @brief 已验证事务字段 / Validated transaction fields. */
interface TransactionFields {
  readonly clientId: string
  readonly codeVerifier: string
  readonly createdAtEpochSeconds: number
  readonly idTokenSigningAlgorithms: readonly string[]
  readonly nonce: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
  readonly state: string
}

/** @brief 模块私有的真实事务实现 / Module-private concrete transaction implementation. */
class IssuedWebAuthorizationTransaction implements WebAuthorizationTransaction {
  readonly clientId: string
  readonly codeVerifier: string
  readonly createdAtEpochSeconds: number
  readonly idTokenSigningAlgorithms: readonly string[]
  readonly issuer = API_V2_OAUTH_ISSUER
  readonly jwksUri = API_V2_OAUTH_JWKS_URI
  readonly nonce: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
  readonly state: string
  readonly tokenEndpoint = API_V2_OAUTH_TOKEN_ENDPOINT

  /**
   * @brief 从模块内已验证字段创建事务 / Construct from module-validated fields.
   * @param fields 已验证事务字段 / Validated transaction fields.
   */
  constructor(fields: TransactionFields) {
    this.clientId = fields.clientId
    this.codeVerifier = fields.codeVerifier
    this.createdAtEpochSeconds = fields.createdAtEpochSeconds
    this.idTokenSigningAlgorithms = Object.freeze([...fields.idTokenSigningAlgorithms])
    this.nonce = fields.nonce
    this.redirectUri = fields.redirectUri
    this.scopes = Object.freeze([...fields.scopes])
    this.state = fields.state
    ISSUED_TRANSACTIONS.add(this)
    Object.freeze(this)
  }
}

/**
 * @brief 原子认领一次性 authorization code 交换权 / Atomically claim the one-time authorization-code exchange.
 * @param transaction 待认领事务 / Transaction to claim.
 * @note 网络结果不确定时也不可重放 code；调用方应重新授权。 / The code remains non-replayable after an ambiguous network result; callers must authorize again.
 */
export function claimAuthorizationCodeExchange(transaction: WebAuthorizationTransaction): void {
  if (!ISSUED_TRANSACTIONS.has(transaction)) {
    throw new ApiV2ContractError('OAuth authorization transaction was not issued by this client.')
  }
  if (CONSUMED_TRANSACTIONS.has(transaction)) {
    throw new ApiV2ContractError('OAuth authorization transaction has already been consumed.')
  }
  CONSUMED_TRANSACTIONS.add(transaction)
}

/** @brief 创建结果：导航 URL 与一次性事务 / Creation result: navigation URL and one-time transaction. */
export interface WebAuthorizationRequest {
  /** @brief 浏览器应导航到的 hosted URL / Hosted URL the browser should navigate to. */
  readonly authorizationUrl: string
  /** @brief 导航前必须存为一次性 sessionStorage 快照的事务 / Transaction to snapshot once in sessionStorage before navigation. */
  readonly transaction: WebAuthorizationTransaction
}

/**
 * @brief 将字节编码为无 padding Base64url / Encode bytes as unpadded Base64url.
 * @param bytes 原始字节 / Raw bytes.
 * @return Base64url 字符串 / Base64url string.
 */
function base64Url(bytes: Uint8Array): string {
  /** @brief 小块安全构造的二进制字符串 / Binary string constructed in safe chunks. */
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * @brief 使用 Web Crypto 生成 256-bit 随机值 / Generate a 256-bit random value with Web Crypto.
 * @param cryptoImpl Web Crypto 实现 / Web Crypto implementation.
 * @return 43 字符 Base64url 值 / 43-character Base64url value.
 */
function randomBase64Url(cryptoImpl: Crypto): string {
  /** @brief 256-bit 随机缓冲区 / 256-bit random buffer. */
  const bytes = new Uint8Array(32)
  cryptoImpl.getRandomValues(bytes)
  return base64Url(bytes)
}

/**
 * @brief 计算 RFC 7636 S256 challenge / Compute an RFC 7636 S256 challenge.
 * @param verifier PKCE verifier / PKCE verifier.
 * @param cryptoImpl Web Crypto 实现 / Web Crypto implementation.
 * @return Base64url SHA-256 digest / Base64url SHA-256 digest.
 */
async function createS256Challenge(verifier: string, cryptoImpl: Crypto): Promise<string> {
  /** @brief UTF-8 verifier bytes / UTF-8 verifier bytes. */
  const encoded = new TextEncoder().encode(verifier)
  /** @brief SHA-256 摘要 / SHA-256 digest. */
  const digest = await cryptoImpl.subtle.digest('SHA-256', encoded)
  return base64Url(new Uint8Array(digest))
}

/**
 * @brief 校验精确注册的 Web redirect URI / Validate an exactly registered Web redirect URI.
 * @param value redirect URI / Redirect URI.
 * @return 规范化 URI / Normalized URI.
 */
function webRedirectUri(value: string): string {
  try {
    /** @brief 已解析 redirect URL / Parsed redirect URL. */
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== '' ||
      [...url.searchParams.keys()].some((key) =>
        ['code', 'error', 'error_description', 'error_uri', 'iss', 'state'].includes(key)
      )
    ) {
      throw new Error()
    }
    if (value !== value.trim()) throw new Error()
    return value
  } catch {
    throw new ApiV2ContractError('Web OAuth redirect URI must be an unambiguous HTTPS URI.')
  }
}

/**
 * @brief 校验 scopes 并保持调用方显式顺序 / Validate scopes while preserving caller-explicit order.
 * @param values 请求 scopes / Requested scopes.
 * @return 不可变 scope 数组 / Immutable scope array.
 */
function requestedScopes(values: readonly string[]): readonly string[] {
  if (
    values.length === 0 ||
    new Set(values).size !== values.length ||
    values.some((value) => !SCOPE_TOKEN_PATTERN.test(value)) ||
    !values.includes('openid')
  ) {
    throw new ApiV2ContractError('OAuth scopes must be unique valid scope-tokens including openid.')
  }
  return Object.freeze([...values])
}

/**
 * @brief 校验 public client ID / Validate a public client ID.
 * @param value 未经信任的 client ID / Untrusted client ID.
 * @return 已校验 client ID / Validated client ID.
 */
function publicClientId(value: unknown): string {
  if (typeof value !== 'string') throw new ApiV2ContractError('OAuth client_id is invalid.')
  /** @brief 去除外层空白后的值 / Value after trimming surrounding whitespace. */
  const normalized = value.trim()
  if (
    normalized !== value ||
    normalized.length === 0 ||
    normalized.length > 255 ||
    [...normalized].some((character) => {
      /** @brief 当前字符的 Unicode code point / Unicode code point of the current character. */
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x20 || codePoint === 0x7f
    })
  ) {
    throw new ApiV2ContractError('OAuth client_id is invalid.')
  }
  return normalized
}

/**
 * @brief 从 discovery 选择本地可验证算法 / Select locally verifiable algorithms from discovery.
 * @param values discovery 算法列表 / Discovery algorithm list.
 * @param rejectUnsupported 是否拒绝而非忽略未知算法 / Whether to reject rather than ignore unsupported algorithms.
 * @return 本地支持的非空唯一算法 / Non-empty unique locally supported algorithms.
 */
function supportedIdTokenAlgorithms(
  values: unknown,
  rejectUnsupported: boolean
): readonly string[] {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > 32 ||
    values.some((value) => typeof value !== 'string')
  ) {
    throw new ApiV2ContractError('OAuth ID Token algorithm list is invalid.')
  }
  /** @brief 字符串算法列表 / String algorithm list. */
  const algorithms = values as readonly string[]
  if (new Set(algorithms).size !== algorithms.length) {
    throw new ApiV2ContractError('OAuth ID Token algorithm list contains duplicates.')
  }
  if (rejectUnsupported && algorithms.some((value) => !LOCAL_ID_TOKEN_ALGORITHMS.has(value))) {
    throw new ApiV2ContractError('OAuth transaction snapshot contains an unsupported algorithm.')
  }
  /** @brief discovery 与本地白名单交集 / Intersection of discovery and the local allowlist. */
  const supported = algorithms.filter((value) => LOCAL_ID_TOKEN_ALGORITHMS.has(value))
  if (supported.length === 0) {
    throw new ApiV2ContractError('OIDC discovery has no locally supported ID Token algorithm.')
  }
  return Object.freeze(supported)
}

/**
 * @brief 校验客户端生成的 256-bit Base64url 关联值 / Validate a client-generated 256-bit Base64url correlation value.
 * @param value 未经信任的值 / Untrusted value.
 * @param path 字段路径 / Field path.
 * @return 43 字符 canonical Base64url / 43-character canonical Base64url.
 */
function correlationValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new ApiV2ContractError(`OAuth transaction ${path} is invalid.`)
  }
  return value
}

/**
 * @brief 校验授权事务创建时间 / Validate an authorization-transaction creation time.
 * @param value 未经信任的 epoch 秒 / Untrusted epoch seconds.
 * @return 非负安全整数 epoch 秒 / Non-negative safe-integer epoch seconds.
 */
function transactionCreationTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ApiV2ContractError('OAuth transaction creation time is invalid.')
  }
  return value as number
}

/**
 * @brief 从已验证字段签发不可伪造事务 / Issue an unforgeable transaction from validated fields.
 * @param fields 已验证字段 / Validated fields.
 * @return 模块登记的事务 / Module-registered transaction.
 */
function issueTransaction(fields: TransactionFields): WebAuthorizationTransaction {
  return new IssuedWebAuthorizationTransaction(fields)
}

/**
 * @brief 断言事务由本模块签发且仍在回调时限内 / Assert a module-issued transaction remains within its callback lifetime.
 * @param transaction 待检查事务 / Transaction to inspect.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 */
export function assertActiveWebAuthorizationTransaction(
  transaction: WebAuthorizationTransaction,
  nowEpochSeconds: number
): void {
  if (!ISSUED_TRANSACTIONS.has(transaction)) {
    throw new ApiV2ContractError('OAuth authorization transaction was not issued by this client.')
  }
  if (
    !Number.isFinite(nowEpochSeconds) ||
    nowEpochSeconds < transaction.createdAtEpochSeconds - 60 ||
    nowEpochSeconds - transaction.createdAtEpochSeconds > TRANSACTION_LIFETIME_SECONDS
  ) {
    throw new ApiV2ContractError('OAuth authorization transaction has expired or has invalid time.')
  }
}

/**
 * @brief 创建可写入 sessionStorage 的无 token 快照 / Create a token-free snapshot suitable for sessionStorage.
 * @param transaction 本模块签发的事务 / Transaction issued by this module.
 * @return 版本化严格快照 / Versioned exact snapshot.
 */
export function snapshotWebAuthorizationTransaction(
  transaction: WebAuthorizationTransaction
): WebAuthorizationTransactionSnapshot {
  if (!ISSUED_TRANSACTIONS.has(transaction)) {
    throw new ApiV2ContractError('OAuth authorization transaction was not issued by this client.')
  }
  return Object.freeze({
    client_id: transaction.clientId,
    code_verifier: transaction.codeVerifier,
    created_at_epoch_seconds: transaction.createdAtEpochSeconds,
    id_token_signing_algorithms: Object.freeze([...transaction.idTokenSigningAlgorithms]),
    nonce: transaction.nonce,
    redirect_uri: transaction.redirectUri,
    scopes: Object.freeze([...transaction.scopes]),
    state: transaction.state,
    version: TRANSACTION_SNAPSHOT_VERSION
  })
}

/**
 * @brief 严格恢复已原子取出并删除的一次性 sessionStorage 快照 / Strictly restore a one-time sessionStorage snapshot after atomic read-and-remove.
 * @param value 未经信任的 JSON 值 / Untrusted JSON value.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @return 重新登记的一次性事务 / Re-registered one-time transaction.
 * @note 调用方必须先从 sessionStorage 删除原值，再调用本函数；Access/Refresh Token 禁止进入快照。 / The caller must delete the sessionStorage value before calling; access and refresh tokens must never enter the snapshot.
 */
export function restoreWebAuthorizationTransaction(
  value: unknown,
  nowEpochSeconds: number = Date.now() / 1000
): WebAuthorizationTransaction {
  /** @brief 严格快照对象 / Exact snapshot object. */
  const input = exactRecord(value, 'oauth.transaction', [
    'version',
    'client_id',
    'redirect_uri',
    'scopes',
    'id_token_signing_algorithms',
    'state',
    'nonce',
    'code_verifier',
    'created_at_epoch_seconds'
  ])
  if (input.version !== TRANSACTION_SNAPSHOT_VERSION) {
    throw new ApiV2ContractError('OAuth transaction snapshot version is unsupported.')
  }
  if (!Array.isArray(input.scopes) || input.scopes.some((value) => typeof value !== 'string')) {
    throw new ApiV2ContractError('OAuth transaction scopes are invalid.')
  }
  /** @brief 恢复后的事务 / Restored transaction. */
  const transaction = issueTransaction({
    clientId: publicClientId(input.client_id),
    codeVerifier: correlationValue(input.code_verifier, 'code_verifier'),
    createdAtEpochSeconds: transactionCreationTime(input.created_at_epoch_seconds),
    idTokenSigningAlgorithms: supportedIdTokenAlgorithms(input.id_token_signing_algorithms, true),
    nonce: correlationValue(input.nonce, 'nonce'),
    redirectUri: webRedirectUri(typeof input.redirect_uri === 'string' ? input.redirect_uri : ''),
    scopes: requestedScopes(input.scopes as readonly string[]),
    state: correlationValue(input.state, 'state')
  })
  assertActiveWebAuthorizationTransaction(transaction, nowEpochSeconds)
  return transaction
}

/**
 * @brief 创建 Web Authorization Code + PKCE S256 请求 / Create a Web Authorization Code + PKCE S256 request.
 * @param options 客户端、redirect、scope 与运行时依赖 / Client, redirect, scope, and runtime dependencies.
 * @return 导航 URL 与仅内存事务 / Navigation URL and memory-only transaction.
 */
export async function createWebAuthorizationRequest(
  options: CreateWebAuthorizationOptions
): Promise<WebAuthorizationRequest> {
  if (!['login', 'recovery', 'signup'].includes(options.screenHint)) {
    throw new ApiV2ContractError('OAuth screen_hint is invalid.')
  }
  if (
    options.offlineAccessConsent !== undefined &&
    options.offlineAccessConsent !== 'existing' &&
    options.offlineAccessConsent !== 'request'
  ) {
    throw new ApiV2ContractError('OAuth offline-access consent state is invalid.')
  }
  if (
    options.discovery.issuer !== API_V2_OAUTH_ISSUER ||
    options.discovery.authorizationEndpoint !== API_V2_OAUTH_AUTHORIZATION_ENDPOINT ||
    options.discovery.tokenEndpoint !== API_V2_OAUTH_TOKEN_ENDPOINT ||
    options.discovery.jwksUri !== API_V2_OAUTH_JWKS_URI
  ) {
    throw new ApiV2ContractError('OIDC discovery is not pinned to API STANDARD V2.')
  }
  /** @brief public client ID / Public client ID. */
  const clientId = publicClientId(options.clientId)
  /** @brief 精确 redirect URI / Exact redirect URI. */
  const redirectUri = webRedirectUri(options.redirectUri)
  /** @brief 已验证 scopes / Validated scopes. */
  const scopes = requestedScopes(options.scopes)
  if (scopes.some((scope) => !options.discovery.scopesSupported.includes(scope))) {
    throw new ApiV2ContractError('OAuth request contains a scope not advertised by discovery.')
  }
  /** @brief 是否请求 refresh token / Whether a refresh token is requested. */
  const requestsOfflineAccess = scopes.includes('offline_access')
  if (requestsOfflineAccess !== (options.offlineAccessConsent !== undefined)) {
    throw new ApiV2ContractError(
      'offline_access requires an explicit consent state, and other requests must omit it.'
    )
  }
  /** @brief Web Crypto 实现 / Web Crypto implementation. */
  const cryptoImpl = options.crypto ?? globalThis.crypto
  if (cryptoImpl?.subtle === undefined || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new ApiV2ContractError('Web Crypto is required for OAuth PKCE.')
  }
  /** @brief PKCE verifier / PKCE verifier. */
  const codeVerifier = randomBase64Url(cryptoImpl)
  /** @brief PKCE S256 challenge / PKCE S256 challenge. */
  const codeChallenge = await createS256Challenge(codeVerifier, cryptoImpl)
  /** @brief CSRF state / CSRF state. */
  const state = randomBase64Url(cryptoImpl)
  /** @brief OIDC nonce / OIDC nonce. */
  const nonce = randomBase64Url(cryptoImpl)
  /** @brief 授权 URL / Authorization URL. */
  const authorizationUrl = new URL(API_V2_OAUTH_AUTHORIZATION_ENDPOINT)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('client_id', clientId)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('scope', scopes.join(' '))
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('nonce', nonce)
  authorizationUrl.searchParams.set('code_challenge', codeChallenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')
  authorizationUrl.searchParams.set('screen_hint', options.screenHint)
  if (options.offlineAccessConsent === 'request')
    authorizationUrl.searchParams.set('prompt', 'consent')
  /** @brief 创建时间 / Creation time. */
  const createdAtEpochSeconds = transactionCreationTime(
    Math.floor((options.nowEpochSeconds ?? ((): number => Date.now() / 1000))())
  )
  /** @brief discovery 与本地共同允许的签名算法 / Signing algorithms allowed by both discovery and this client. */
  const idTokenSigningAlgorithms = supportedIdTokenAlgorithms(
    options.discovery.idTokenSigningAlgorithms,
    false
  )
  return {
    authorizationUrl: authorizationUrl.toString(),
    transaction: issueTransaction({
      clientId,
      codeVerifier,
      createdAtEpochSeconds,
      idTokenSigningAlgorithms,
      nonce,
      redirectUri,
      scopes,
      state
    })
  }
}
