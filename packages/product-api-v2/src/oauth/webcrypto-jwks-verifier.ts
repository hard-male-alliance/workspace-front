/** @file 使用 Web Crypto 与短期 JWKS 缓存验证 ID Token JWS / Verify ID Token JWS with Web Crypto and a short-lived JWKS cache. */

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import { readBoundedJson } from '../http/bounded-json'
import { API_V2_OAUTH_JWKS_URI } from './discovery'
import type { IdTokenSignatureVerificationInput, IdTokenSignatureVerifier } from './id-token'

/** @brief 本地实现允许的非对称 JWS 算法 / Asymmetric JWS algorithms allowed by the local implementation. */
export type SupportedIdTokenAlgorithm = 'ES256' | 'RS256'

/** @brief 本地固定算法白名单 / Fixed local algorithm allowlist. */
const LOCAL_ALGORITHMS: ReadonlySet<string> = new Set<SupportedIdTokenAlgorithm>(['ES256', 'RS256'])

/** @brief Compact JWS Base64url 段语法 / Compact-JWS Base64url segment syntax. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u

/** @brief 默认 JWKS 最大响应字节数 / Default maximum JWKS response size in bytes. */
const DEFAULT_MAX_JWKS_BYTES = 256 * 1024

/** @brief 默认 JWKS 内存缓存时间 / Default in-memory JWKS cache duration. */
const DEFAULT_CACHE_TTL_MILLISECONDS = 5 * 60 * 1000

/** @brief JWKS 响应允许的 media type / Media types allowed for JWKS responses. */
const JWKS_MEDIA_TYPES = new Set(['application/json', 'application/jwk-set+json'])

/**
 * @brief 在异步边界后重新检查调用方取消 / Recheck caller cancellation after an asynchronous boundary.
 * @param signal 可选取消信号 / Optional cancellation signal.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
}

/** @brief verifier 构造选项 / Verifier construction options. */
export interface WebCryptoJwksIdTokenVerifierOptions {
  /** @brief 可替换 Fetch 实现 / Replaceable Fetch implementation. */
  readonly fetchImpl?: typeof fetch | undefined
  /** @brief 可替换 Web Crypto 实现 / Replaceable Web Crypto implementation. */
  readonly crypto?: Crypto | undefined
  /** @brief 可替换当前 epoch 毫秒 / Replaceable current epoch milliseconds. */
  readonly nowMilliseconds?: () => number
  /** @brief JWKS 内存缓存 TTL / JWKS in-memory cache TTL. */
  readonly cacheTtlMilliseconds?: number | undefined
  /** @brief JWKS 响应硬字节上限 / Hard JWKS response byte limit. */
  readonly maxJwksBytes?: number | undefined
}

/** @brief 已校验的 public JWK 投影 / Validated public-JWK projection. */
interface ValidatedJwk {
  /** @brief JWK alg；未声明为 null / JWK alg, or null when undeclared. */
  readonly alg: string | null
  /** @brief EC curve / EC curve. */
  readonly crv: string | null
  /** @brief RSA exponent / RSA exponent. */
  readonly e: string | null
  /** @brief 稳定 key ID / Stable key ID. */
  readonly kid: string
  /** @brief RSA modulus / RSA modulus. */
  readonly n: string | null
  /** @brief Key type / Key type. */
  readonly kty: string
  /** @brief Key operations；未声明为 null / Key operations, or null when undeclared. */
  readonly keyOps: readonly string[] | null
  /** @brief Key use；未声明为 null / Key use, or null when undeclared. */
  readonly use: string | null
  /** @brief EC x coordinate / EC x coordinate. */
  readonly x: string | null
  /** @brief EC y coordinate / EC y coordinate. */
  readonly y: string | null
}

/** @brief 短期 JWKS 缓存条目 / Short-lived JWKS cache entry. */
interface JwksCacheEntry {
  /** @brief 到期 epoch 毫秒 / Expiration epoch milliseconds. */
  readonly expiresAtMilliseconds: number
  /** @brief 已严格解析的 keys / Strictly parsed keys. */
  readonly keys: readonly ValidatedJwk[]
}

/** @brief 已拆分但 payload 尚未解析的 compact JWS / Split compact JWS with an unparsed payload. */
interface ParsedCompactJws {
  /** @brief JWS alg / JWS alg. */
  readonly algorithm: SupportedIdTokenAlgorithm
  /** @brief 编码后的 header / Encoded header. */
  readonly encodedHeader: string
  /** @brief 编码后的 payload / Encoded payload. */
  readonly encodedPayload: string
  /** @brief key ID / Key ID. */
  readonly kid: string
  /** @brief 原始签名字节 / Raw signature bytes. */
  readonly signature: Uint8Array
}

/**
 * @brief 读取有界非空字符串 / Read a bounded non-empty string.
 * @param value 未知字段 / Unknown field.
 * @param path 字段路径 / Field path.
 * @param maximumLength 最大字符数 / Maximum character count.
 * @return 已校验字符串 / Validated string.
 */
function boundedString(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new ApiV2ContractError(`JWS/JWKS field ${path} must be a bounded non-empty string.`)
  }
  return value
}

/**
 * @brief 严格解码 Base64url 段 / Strictly decode a Base64url segment.
 * @param value 编码段 / Encoded segment.
 * @param path 诊断路径 / Diagnostic path.
 * @param maximumBytes 最大解码字节数 / Maximum decoded byte count.
 * @return 解码字节 / Decoded bytes.
 */
function decodeBase64Url(value: string, path: string, maximumBytes: number): Uint8Array {
  if (
    !BASE64URL_PATTERN.test(value) ||
    value.length % 4 === 1 ||
    Math.floor((value.length * 3) / 4) > maximumBytes
  ) {
    throw new ApiV2ContractError(`JWS/JWKS field ${path} is not canonical bounded Base64url.`)
  }
  try {
    /** @brief Base64 padding / Base64 padding. */
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    /** @brief atob 二进制输出 / Binary output from atob. */
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
    /** @brief 解码字节 / Decoded bytes. */
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (bytes.byteLength > maximumBytes) throw new Error()
    /** @brief 重新编码的 canonical Base64url / Re-encoded canonical Base64url. */
    let canonical = ''
    for (const byte of bytes) canonical += String.fromCharCode(byte)
    canonical = btoa(canonical).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
    if (canonical !== value) throw new Error()
    return bytes
  } catch {
    throw new ApiV2ContractError(`JWS/JWKS field ${path} is not canonical bounded Base64url.`)
  }
}

/**
 * @brief 将 UTF-8 JSON 字节解析为 object / Parse UTF-8 JSON bytes into an object.
 * @param bytes JSON bytes / JSON bytes.
 * @param path 诊断路径 / Diagnostic path.
 * @return JSON object / JSON object.
 */
function parseJsonObject(bytes: Uint8Array, path: string): Record<string, unknown> {
  try {
    /** @brief 严格 UTF-8 文本 / Strict UTF-8 text. */
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    /** @brief JSON 值 / JSON value. */
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new ApiV2ContractError(`JWS/JWKS field ${path} must be a UTF-8 JSON object.`)
  }
}

/**
 * @brief 拆分并严格校验 protected header，不解析 claims / Split and strictly validate the protected header without parsing claims.
 * @param token 未经信任的 compact JWS / Untrusted compact JWS.
 * @param discoveryAlgorithms discovery 算法白名单 / Discovery algorithm allowlist.
 * @return payload 仍未解析的 JWS / JWS whose payload remains unparsed.
 */
function parseCompactJws(token: string, discoveryAlgorithms: readonly string[]): ParsedCompactJws {
  if (token.length < 20 || token.length > 16_384) {
    throw new ApiV2ContractError('ID Token compact JWS length is invalid.')
  }
  /** @brief compact JWS 三段 / Three compact-JWS segments. */
  const segments = token.split('.')
  if (segments.length !== 3) {
    throw new ApiV2ContractError('ID Token must be a three-segment compact JWS.')
  }
  /** @brief 编码 header / Encoded header. */
  const encodedHeader = segments[0] ?? ''
  /** @brief 编码 payload / Encoded payload. */
  const encodedPayload = segments[1] ?? ''
  /** @brief 编码 signature / Encoded signature. */
  const encodedSignature = segments[2] ?? ''
  /** @brief protected header / Protected header. */
  const header = parseJsonObject(decodeBase64Url(encodedHeader, 'header', 4096), 'header')
  /** @brief 会改变验证语义或密钥信任源的 header 字段 / Header fields that alter verification semantics or key trust. */
  const forbiddenHeaderFields = ['b64', 'crit', 'jku', 'jwk', 'x5u']
  if (forbiddenHeaderFields.some((key) => header[key] !== undefined)) {
    throw new ApiV2ContractError('ID Token protected header attempts to alter verification trust.')
  }
  /** @brief JWS alg / JWS alg. */
  const algorithm = boundedString(header.alg, 'header.alg', 16)
  if (!LOCAL_ALGORITHMS.has(algorithm) || !discoveryAlgorithms.includes(algorithm)) {
    throw new ApiV2ContractError('ID Token algorithm is not allowed locally and by discovery.')
  }
  /** @brief JWK kid / JWK kid. */
  const kid = boundedString(header.kid, 'header.kid', 256)
  if (header.typ !== undefined && header.typ !== 'JWT' && header.typ !== 'application/jwt') {
    throw new ApiV2ContractError('ID Token protected header typ is invalid.')
  }
  /** @brief 原始 signature / Raw signature. */
  const signature = decodeBase64Url(encodedSignature, 'signature', 16_384)
  if (algorithm === 'ES256' && signature.byteLength !== 64) {
    throw new ApiV2ContractError('ES256 JWS signature must use the 64-byte JOSE R||S format.')
  }
  decodeBase64Url(encodedPayload, 'payload', 64 * 1024)
  return {
    algorithm: algorithm as SupportedIdTokenAlgorithm,
    encodedHeader,
    encodedPayload,
    kid,
    signature
  }
}

/**
 * @brief 解析可选 JWK 字符串 / Parse an optional JWK string.
 * @param value 未知字段 / Unknown field.
 * @param path 字段路径 / Field path.
 * @param maximumLength 最大字符数 / Maximum character count.
 * @return 字符串或 null / String or null.
 */
function optionalString(value: unknown, path: string, maximumLength: number): string | null {
  return value === undefined ? null : boundedString(value, path, maximumLength)
}

/**
 * @brief 严格解析单个 public JWK / Strictly parse one public JWK.
 * @param value 未经信任的 JWK / Untrusted JWK.
 * @param index key 索引 / Key index.
 * @return 安全投影 / Safe projection.
 */
function parseJwk(value: unknown, index: number): ValidatedJwk {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiV2ContractError(`JWKS key ${index} must be an object.`)
  }
  /** @brief JWK 字段 / JWK fields. */
  const input = value as Record<string, unknown>
  if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some((field) => input[field] !== undefined)) {
    throw new ApiV2ContractError('JWKS must not publish private or symmetric key material.')
  }
  /** @brief 可选 key operations / Optional key operations. */
  let keyOps: readonly string[] | null = null
  if (input.key_ops !== undefined) {
    if (
      !Array.isArray(input.key_ops) ||
      input.key_ops.length === 0 ||
      input.key_ops.some((operation) => typeof operation !== 'string')
    ) {
      throw new ApiV2ContractError(`JWKS key ${index}.key_ops is invalid.`)
    }
    keyOps = input.key_ops as readonly string[]
    if (new Set(keyOps).size !== keyOps.length) {
      throw new ApiV2ContractError(`JWKS key ${index}.key_ops contains duplicates.`)
    }
  }
  return {
    alg: optionalString(input.alg, `keys[${index}].alg`, 16),
    crv: optionalString(input.crv, `keys[${index}].crv`, 32),
    e: optionalString(input.e, `keys[${index}].e`, 2048),
    keyOps,
    kid: boundedString(input.kid, `keys[${index}].kid`, 256),
    kty: boundedString(input.kty, `keys[${index}].kty`, 16),
    n: optionalString(input.n, `keys[${index}].n`, 16_384),
    use: optionalString(input.use, `keys[${index}].use`, 16),
    x: optionalString(input.x, `keys[${index}].x`, 2048),
    y: optionalString(input.y, `keys[${index}].y`, 2048)
  }
}

/**
 * @brief 严格解析 JWK Set / Strictly parse a JWK Set.
 * @param value 未经信任的 JWKS JSON / Untrusted JWKS JSON.
 * @return 已校验 public keys / Validated public keys.
 */
function parseJwks(value: unknown): readonly ValidatedJwk[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiV2ContractError('JWKS document must be an object.')
  }
  /** @brief JWKS 字段 / JWKS fields. */
  const input = value as Record<string, unknown>
  if (!Array.isArray(input.keys) || input.keys.length === 0 || input.keys.length > 64) {
    throw new ApiV2ContractError('JWKS keys must contain between 1 and 64 entries.')
  }
  /** @brief 已校验 keys / Validated keys. */
  const keys = input.keys.map(parseJwk)
  /** @brief kid 列表 / Key-ID list. */
  const kids = keys.map((key) => key.kid)
  if (new Set(kids).size !== kids.length) {
    throw new ApiV2ContractError('JWKS must not contain duplicate kid values.')
  }
  return keys
}

/**
 * @brief 选择与 alg/kid/use/key_ops/kty 精确兼容的 key / Select a key exactly compatible with alg/kid/use/key_ops/kty.
 * @param keys JWKS keys / JWKS keys.
 * @param kid 目标 key ID / Target key ID.
 * @param algorithm 目标算法 / Target algorithm.
 * @return 匹配 key 或 null / Matching key or null.
 */
function selectJwk(
  keys: readonly ValidatedJwk[],
  kid: string,
  algorithm: SupportedIdTokenAlgorithm
): ValidatedJwk | null {
  /** @brief 目标 key type / Target key type. */
  const expectedKeyType = algorithm === 'RS256' ? 'RSA' : 'EC'
  /** @brief 符合所有签名约束的 key / Keys satisfying every signing constraint. */
  const matches = keys.filter(
    (key) =>
      key.kid === kid &&
      key.kty === expectedKeyType &&
      (key.alg === null || key.alg === algorithm) &&
      (key.use === null || key.use === 'sig') &&
      (key.keyOps === null || key.keyOps.includes('verify')) &&
      (algorithm !== 'ES256' || key.crv === 'P-256')
  )
  if (matches.length > 1) {
    throw new ApiV2ContractError('JWKS key selection is ambiguous.')
  }
  return matches[0] ?? null
}

/** @brief DOM 与 Node Web Crypto 共同接受的 public JWK 字段 / Public JWK fields accepted by both DOM and Node Web Crypto. */
interface PortableJsonWebKey {
  /** @brief JWS algorithm / JWS 算法. */
  readonly alg?: string
  /** @brief EC curve / EC 曲线. */
  readonly crv?: string
  /** @brief RSA exponent / RSA 指数. */
  readonly e?: string
  /** @brief key extractability / 密钥可导出性. */
  readonly ext?: boolean
  /** @brief key operations / 密钥操作. */
  readonly key_ops?: string[]
  /** @brief key type / 密钥类型. */
  readonly kty?: string
  /** @brief RSA modulus / RSA 模数. */
  readonly n?: string
  /** @brief EC x coordinate / EC x 坐标. */
  readonly x?: string
  /** @brief EC y coordinate / EC y 坐标. */
  readonly y?: string
}

/**
 * @brief 将 key 投影为跨运行时 Web Crypto JWK / Project a key into a cross-runtime Web Crypto JWK.
 * @param key 已筛选 JWK / Selected JWK.
 * @param algorithm JWS 算法 / JWS algorithm.
 * @return public JWK 的结构化记录 / Structured record for the public JWK.
 */
function toJsonWebKey(key: ValidatedJwk, algorithm: SupportedIdTokenAlgorithm): PortableJsonWebKey {
  if (algorithm === 'RS256') {
    if (key.n === null || key.e === null) {
      throw new ApiV2ContractError('RS256 JWK must contain n and e.')
    }
    /** @brief RSA modulus bytes / RSA modulus bytes. */
    const modulus = decodeBase64Url(key.n, 'jwk.n', 8192)
    /** @brief RSA exponent bytes / RSA exponent bytes. */
    const exponent = decodeBase64Url(key.e, 'jwk.e', 8)
    /** @brief modulus 实际 bit length / Actual modulus bit length. */
    const modulusBits =
      modulus.byteLength === 0
        ? 0
        : (modulus.byteLength - 1) * 8 + (32 - Math.clz32(modulus[0] ?? 0))
    if (modulus[0] === 0 || modulusBits < 2048) {
      throw new ApiV2ContractError(
        'RS256 JWK modulus must be a canonical value of at least 2048 bits.'
      )
    }
    if (exponent.byteLength === 0 || exponent[0] === 0) {
      throw new ApiV2ContractError('RS256 JWK exponent must be a canonical positive integer.')
    }
    /** @brief RSA exponent 数值 / RSA exponent numeric value. */
    let exponentValue = 0n
    for (const byte of exponent) exponentValue = (exponentValue << 8n) | BigInt(byte)
    if (exponentValue < 3n || exponentValue % 2n === 0n) {
      throw new ApiV2ContractError('RS256 JWK exponent must be an odd integer of at least 3.')
    }
    return { alg: algorithm, e: key.e, ext: true, key_ops: ['verify'], kty: 'RSA', n: key.n }
  }
  if (key.x === null || key.y === null || key.crv !== 'P-256') {
    throw new ApiV2ContractError('ES256 JWK must contain P-256 x and y coordinates.')
  }
  if (
    decodeBase64Url(key.x, 'jwk.x', 32).byteLength !== 32 ||
    decodeBase64Url(key.y, 'jwk.y', 32).byteLength !== 32
  ) {
    throw new ApiV2ContractError('ES256 JWK coordinates must each contain exactly 32 bytes.')
  }
  return {
    alg: algorithm,
    crv: 'P-256',
    ext: true,
    key_ops: ['verify'],
    kty: 'EC',
    x: key.x,
    y: key.y
  }
}

/** @brief 生产 WebCrypto + JWKS ID Token verifier / Production WebCrypto + JWKS ID Token verifier. */
export class WebCryptoJwksIdTokenVerifier implements IdTokenSignatureVerifier {
  /** @brief Fetch 实现 / Fetch implementation. */
  private readonly fetchImpl: typeof fetch
  /** @brief Web Crypto 实现 / Web Crypto implementation. */
  private readonly cryptoImpl: Crypto
  /** @brief 当前时间读取器 / Current-time reader. */
  private readonly nowMilliseconds: () => number
  /** @brief cache TTL / Cache TTL. */
  private readonly cacheTtlMilliseconds: number
  /** @brief body 上限 / Body limit. */
  private readonly maxJwksBytes: number
  /** @brief 当前 cache / Current cache. */
  private cache: JwksCacheEntry | null = null

  /**
   * @brief 构造生产 verifier / Construct a production verifier.
   * @param options 可替换 runtime 与资源限制 / Replaceable runtime and resource limits.
   */
  constructor(options: WebCryptoJwksIdTokenVerifierOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.cryptoImpl = options.crypto ?? globalThis.crypto
    this.nowMilliseconds = options.nowMilliseconds ?? Date.now
    this.cacheTtlMilliseconds = options.cacheTtlMilliseconds ?? DEFAULT_CACHE_TTL_MILLISECONDS
    this.maxJwksBytes = options.maxJwksBytes ?? DEFAULT_MAX_JWKS_BYTES
    if (this.cryptoImpl?.subtle === undefined) {
      throw new ApiV2ContractError('Web Crypto is required for ID Token verification.')
    }
    if (
      !Number.isSafeInteger(this.cacheTtlMilliseconds) ||
      this.cacheTtlMilliseconds <= 0 ||
      this.cacheTtlMilliseconds > 10 * 60 * 1000 ||
      !Number.isSafeInteger(this.maxJwksBytes) ||
      this.maxJwksBytes <= 0 ||
      this.maxJwksBytes > 2 * 1024 * 1024
    ) {
      throw new ApiV2ContractError('JWKS cache or response-size configuration is invalid.')
    }
  }

  /**
   * @brief 获取 JWKS；cache miss/到期才联网 / Obtain JWKS, using the network only on cache miss or expiry.
   * @param forceRefresh 是否强制轮换刷新 / Whether to force a rotation refresh.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 已校验 keys / Validated keys.
   */
  private async getKeys(
    forceRefresh: boolean,
    signal?: AbortSignal
  ): Promise<readonly ValidatedJwk[]> {
    throwIfAborted(signal)
    /** @brief 当前时间 / Current time. */
    const now = this.nowMilliseconds()
    if (!forceRefresh && this.cache !== null && this.cache.expiresAtMilliseconds > now) {
      return this.cache.keys
    }
    /** @brief 新 JWKS keys / Fresh JWKS keys. */
    const keys = await this.fetchKeys(signal)
    this.cache = {
      expiresAtMilliseconds: this.nowMilliseconds() + this.cacheTtlMilliseconds,
      keys
    }
    return keys
  }

  /**
   * @brief 从冻结 URI 拉取一个有界 JWKS / Fetch one bounded JWKS from the frozen URI.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 已校验 keys / Validated keys.
   */
  private async fetchKeys(signal?: AbortSignal): Promise<readonly ValidatedJwk[]> {
    try {
      /** @brief 原始 JWKS response / Raw JWKS response. */
      const response = await this.fetchImpl(API_V2_OAUTH_JWKS_URI, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/jwk-set+json, application/json' },
        method: 'GET',
        redirect: 'error',
        signal: signal ?? null
      })
      /** @brief response media type / Response media type. */
      const mediaType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (response.status !== 200 || mediaType === undefined || !JWKS_MEDIA_TYPES.has(mediaType)) {
        throw new ApiV2ContractError(
          'JWKS must return 200 with a JWK Set media type.',
          response.status
        )
      }
      /** @brief 有界 JWKS JSON / Bounded JWKS JSON. */
      const value = await readBoundedJson(response, {
        context: 'JWKS response',
        maximumBytes: this.maxJwksBytes
      })
      return parseJwks(value)
    } catch (error: unknown) {
      if (error instanceof ApiV2ContractError || error instanceof ApiV2NetworkError) throw error
      if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
      throw new ApiV2NetworkError('network')
    }
  }

  /**
   * @brief 使用一个已筛选 JWK 验证签名 / Verify a signature with one selected JWK.
   * @param jwk 已筛选 public key / Selected public key.
   * @param jws 已解析 compact JWS / Parsed compact JWS.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 签名是否有效 / Whether the signature is valid.
   */
  private async verifyWithJwk(
    jwk: ValidatedJwk,
    jws: ParsedCompactJws,
    signal?: AbortSignal
  ): Promise<boolean> {
    throwIfAborted(signal)
    /** @brief Web Crypto 导入算法 / Web Crypto import algorithm. */
    const importAlgorithm =
      jws.algorithm === 'RS256'
        ? ({ hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' } as const)
        : ({ name: 'ECDSA', namedCurve: 'P-256' } as const)
    /** @brief 严格投影后的 public JWK / Strictly projected public JWK. */
    const jsonWebKey = toJsonWebKey(jwk, jws.algorithm)
    /** @brief Web Crypto public key / Web Crypto public key. */
    let key: CryptoKey
    try {
      key = await this.cryptoImpl.subtle.importKey('jwk', jsonWebKey, importAlgorithm, false, [
        'verify'
      ])
    } catch {
      throw new ApiV2ContractError('JWKS public key cannot be imported for ID Token verification.')
    }
    throwIfAborted(signal)
    /** @brief JWS signing input / JWS signing input. */
    const signingInput = new TextEncoder().encode(`${jws.encodedHeader}.${jws.encodedPayload}`)
    /** @brief Web Crypto verify 算法 / Web Crypto verification algorithm. */
    const verifyAlgorithm =
      jws.algorithm === 'RS256'
        ? ({ name: 'RSASSA-PKCS1-v1_5' } as const)
        : ({ hash: 'SHA-256', name: 'ECDSA' } as const)
    /** @brief ArrayBuffer-backed signature copy / ArrayBuffer-backed signature copy. */
    const signature = Uint8Array.from(jws.signature)
    try {
      /** @brief Web Crypto 验签结果 / Web Crypto verification result. */
      const valid = await this.cryptoImpl.subtle.verify(
        verifyAlgorithm,
        key,
        signature,
        signingInput
      )
      throwIfAborted(signal)
      return valid
    } catch (error: unknown) {
      if (error instanceof ApiV2NetworkError) throw error
      throw new ApiV2ContractError('ID Token signature verification failed.')
    }
  }

  /**
   * @brief 验证 compact JWS 签名并在成功后解析 claims / Verify a compact-JWS signature and parse claims only after success.
   * @param input token、固定 JWKS URI、算法与取消信号 / Token, fixed JWKS URI, algorithms, and cancellation signal.
   * @return 签名已验证但语义待核心校验的 claims / Signature-verified claims awaiting core semantic validation.
   */
  async verifySignature(input: IdTokenSignatureVerificationInput): Promise<unknown> {
    if (input.jwksUri !== API_V2_OAUTH_JWKS_URI) {
      throw new ApiV2ContractError('ID Token verifier refuses an unpinned JWKS URI.')
    }
    /** @brief protected header 与 raw signature / Protected header and raw signature. */
    const jws = parseCompactJws(input.idToken, input.allowedAlgorithms)
    /** @brief 当前 cache 或首次 fetch keys / Current cached or initially fetched keys. */
    let keys = await this.getKeys(false, input.signal)
    /** @brief 是否已经为本 token 强制刷新 / Whether this token has already forced a refresh. */
    let didRefresh = false
    /** @brief 按 kid 与算法筛选的 key / Key selected by kid and algorithm. */
    let jwk = selectJwk(keys, jws.kid, jws.algorithm)
    if (jwk === null) {
      keys = await this.getKeys(true, input.signal)
      didRefresh = true
      jwk = selectJwk(keys, jws.kid, jws.algorithm)
    }
    if (jwk === null) {
      throw new ApiV2ContractError('No trusted JWKS key matches the ID Token kid and alg.')
    }
    /** @brief 首次验签结果 / Initial signature-verification result. */
    let valid = await this.verifyWithJwk(jwk, jws, input.signal)
    if (!valid && !didRefresh) {
      keys = await this.getKeys(true, input.signal)
      jwk = selectJwk(keys, jws.kid, jws.algorithm)
      if (jwk !== null) valid = await this.verifyWithJwk(jwk, jws, input.signal)
    }
    if (!valid) throw new ApiV2ContractError('ID Token signature verification failed.')
    throwIfAborted(input.signal)
    return parseJsonObject(decodeBase64Url(jws.encodedPayload, 'payload', 64 * 1024), 'payload')
  }
}
