/** @file Web token 的当前页面内存会话 / Current-page in-memory session for Web tokens. */

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import type { WebAuthorizationTransaction } from './authorization'
import { parseAuthorizationCallback } from './callback'
import type { IdTokenSignatureVerifier, VerifiedIdTokenClaims } from './id-token'
import { verifyIdToken } from './id-token'
import { exchangeAuthorizationCode } from './token'

/** @brief 不可序列化约束下的内存 token 状态 / In-memory token state under a no-persistence constraint. */
interface TokenState {
  /** @brief Access Token / Access Token. */
  readonly accessToken: string
  /** @brief 可选 Refresh Token / Optional Refresh Token. */
  readonly refreshToken: string | null
  /** @brief Access Token 到期 epoch 秒 / Access Token expiration epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 授予 scopes / Granted scopes. */
  readonly scopes: readonly string[]
  /** @brief 已验证 OIDC 身份 / Verified OIDC identity. */
  readonly identity: VerifiedIdTokenClaims
}

/** @brief 内存会话的私有运行时记录 / Private runtime record for an in-memory session. */
interface SessionRecord {
  /** @brief 当前授权世代 / Current authorization generation. */
  generation: number
  /** @brief 当前 token 状态 / Current token state. */
  state: TokenState | null
  /** @brief 会话时钟 / Session clock. */
  readonly nowEpochSeconds: () => number
}

/** @brief 会话构造选项 / Session construction options. */
export interface InMemoryWebTokenSessionOptions {
  /** @brief 可替换 epoch 秒时钟 / Replaceable epoch-seconds clock. */
  readonly nowEpochSeconds?: () => number
}

/** @brief 会话实例到私有运行时记录的模块内映射 / Module-private mapping from sessions to runtime records. */
const SESSION_RECORDS = new WeakMap<InMemoryWebTokenSession, SessionRecord>()

/**
 * @brief 读取有效 epoch 秒 / Read a valid epoch-seconds value.
 * @param clock 时钟函数 / Clock function.
 * @return 非负有限 epoch 秒 / Non-negative finite epoch seconds.
 */
function readEpochSeconds(clock: () => number): number {
  /** @brief 当前时钟值 / Current clock value. */
  const value = clock()
  if (!Number.isFinite(value) || value < 0) {
    throw new ApiV2ContractError('OAuth session clock returned an invalid epoch time.')
  }
  return value
}

/**
 * @brief 读取真实会话记录 / Read a genuine session record.
 * @param session 会话实例 / Session instance.
 * @return 模块私有记录 / Module-private record.
 */
function sessionRecord(session: InMemoryWebTokenSession): SessionRecord {
  /** @brief 已登记记录 / Registered record. */
  const record = SESSION_RECORDS.get(session)
  if (record === undefined) {
    throw new ApiV2ContractError('OAuth token session was not created by this client.')
  }
  return record
}

/**
 * @brief 开始并独占一个新授权世代 / Begin and own a new authorization generation.
 * @param session 目标会话 / Target session.
 * @return 新世代号 / New generation number.
 */
function beginAuthorizationAttempt(session: InMemoryWebTokenSession): number {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(session)
  if (!Number.isSafeInteger(record.generation + 1)) {
    throw new ApiV2ContractError('OAuth session generation is exhausted.')
  }
  record.generation += 1
  return record.generation
}

/**
 * @brief 仅由仍占有世代的流程原子提交 token / Atomically commit tokens only from the flow still owning its generation.
 * @param session 目标会话 / Target session.
 * @param generation 流程持有的世代 / Generation owned by the flow.
 * @param state 完整验证的新状态 / Fully validated new state.
 * @param signal 可选取消信号 / Optional cancellation signal.
 */
function commitAuthorizationAttempt(
  session: InMemoryWebTokenSession,
  generation: number,
  state: TokenState,
  signal?: AbortSignal
): void {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(session)
  if (signal?.aborted === true || record.generation !== generation) {
    throw new ApiV2NetworkError('aborted')
  }
  if (state.expiresAtEpochSeconds <= readEpochSeconds(record.nowEpochSeconds)) {
    throw new ApiV2ContractError('OAuth access token expired before session commit.')
  }
  record.state = Object.freeze({
    ...state,
    identity: Object.freeze({ ...state.identity }),
    scopes: Object.freeze([...state.scopes])
  })
}

/** @brief Web OAuth 当前页面内存会话 / Web OAuth current-page in-memory session. */
export class InMemoryWebTokenSession {
  /**
   * @brief 创建只在当前页面内存存活的 token 会话 / Create a token session confined to current-page memory.
   * @param options 可替换时钟 / Replaceable clock.
   */
  constructor(options: InMemoryWebTokenSessionOptions = {}) {
    /** @brief 会话时钟 / Session clock. */
    const nowEpochSeconds = options.nowEpochSeconds ?? ((): number => Date.now() / 1000)
    if (typeof nowEpochSeconds !== 'function') {
      throw new ApiV2ContractError('OAuth session clock must be a function.')
    }
    SESSION_RECORDS.set(this, { generation: 0, nowEpochSeconds, state: null })
  }

  /**
   * @brief 为 Bearer HTTP adapter 读取当前 Access Token / Read the current Access Token for a Bearer HTTP adapter.
   * @return Access Token；未登录为 null / Access Token, or null when signed out.
   */
  getAccessToken(): string | null {
    /** @brief 私有会话记录 / Private session record. */
    const record = sessionRecord(this)
    if (
      record.state !== null &&
      record.state.expiresAtEpochSeconds <= readEpochSeconds(record.nowEpochSeconds)
    ) {
      record.state = null
    }
    return record.state?.accessToken ?? null
  }

  /**
   * @brief 读取非敏感会话投影 / Read a non-sensitive session projection.
   * @return 到期、scope 与身份；未登录为 null / Expiration, scopes, and identity, or null when signed out.
   */
  getProjection(): {
    readonly expiresAtEpochSeconds: number
    readonly identity: VerifiedIdTokenClaims
    readonly scopes: readonly string[]
    readonly hasRefreshToken: boolean
  } | null {
    /** @brief 当前内存状态 / Current in-memory state. */
    const record = sessionRecord(this)
    if (
      record.state !== null &&
      record.state.expiresAtEpochSeconds <= readEpochSeconds(record.nowEpochSeconds)
    ) {
      record.state = null
    }
    /** @brief 当前有效状态 / Current live state. */
    const current = record.state
    if (current === null) return null
    return Object.freeze({
      expiresAtEpochSeconds: current.expiresAtEpochSeconds,
      hasRefreshToken: current.refreshToken !== null,
      identity: current.identity,
      scopes: current.scopes
    })
  }

  /** @brief 立即清除所有内存 token / Immediately clear every in-memory token. */
  clear(): void {
    /** @brief 私有会话记录 / Private session record. */
    const record = sessionRecord(this)
    record.generation += 1
    record.state = null
  }
}

/** @brief 完成 Web 授权流程的输入 / Input for completing the Web authorization flow. */
export interface CompleteWebAuthorizationOptions {
  /** @brief 浏览器 callback URL / Browser callback URL. */
  readonly callbackUrl: string
  /** @brief 原始内存事务 / Original in-memory transaction. */
  readonly transaction: WebAuthorizationTransaction
  /** @brief 注入的 ID Token 签名 verifier / Injected ID Token signature verifier. */
  readonly idTokenVerifier: IdTokenSignatureVerifier
  /** @brief token 目标内存会话 / Destination in-memory token session. */
  readonly session: InMemoryWebTokenSession
  /** @brief 可替换 Fetch 实现 / Replaceable Fetch implementation. */
  readonly fetchImpl?: typeof fetch | undefined
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal | undefined
  /** @brief 可替换当前 epoch 秒 / Replaceable current epoch seconds. */
  readonly nowEpochSeconds?: (() => number) | undefined
}

/**
 * @brief 完成 callback、code exchange、签名与 claims 校验后原子建立会话 / Atomically establish a session after callback, code exchange, signature, and claim validation.
 * @param options 协议依赖与内存目标 / Protocol dependencies and memory destination.
 * @return 已验证 OIDC 身份 / Verified OIDC identity.
 */
export async function completeWebAuthorization(
  options: CompleteWebAuthorizationOptions
): Promise<VerifiedIdTokenClaims> {
  /** @brief 本流程的授权世代 / Authorization generation owned by this flow. */
  const generation = beginAuthorizationAttempt(options.session)
  /** @brief 流程时钟 / Flow clock. */
  const nowEpochSeconds = options.nowEpochSeconds ?? ((): number => Date.now() / 1000)
  /** @brief 已验证 callback code / Validated callback code. */
  const { code } = parseAuthorizationCallback(
    options.callbackUrl,
    options.transaction,
    readEpochSeconds(nowEpochSeconds)
  )
  /** @brief 严格 token response / Strict token response. */
  const tokenResponse = await exchangeAuthorizationCode(
    code,
    options.transaction,
    options.fetchImpl,
    options.signal
  )
  /** @brief Token Endpoint 响应接收时间 / Time at which the Token Endpoint response was received. */
  const tokenReceivedAt = readEpochSeconds(nowEpochSeconds)
  /** @brief 完整验证的 ID Token claims / Fully validated ID Token claims. */
  const identity = await verifyIdToken(
    tokenResponse.idToken,
    options.transaction,
    options.idTokenVerifier,
    nowEpochSeconds,
    options.signal
  )
  /** @brief 授予 scopes / Granted scopes. */
  const scopes = tokenResponse.scope.split(' ')
  if (
    scopes.some((scope) => scope.length === 0) ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !options.transaction.scopes.includes(scope)) ||
    !scopes.includes('openid') ||
    (tokenResponse.refreshToken !== null &&
      (!options.transaction.scopes.includes('offline_access') ||
        !scopes.includes('offline_access')))
  ) {
    throw new ApiV2ContractError('OAuth token response granted malformed or unrequested scopes.')
  }
  commitAuthorizationAttempt(
    options.session,
    generation,
    {
      accessToken: tokenResponse.accessToken,
      expiresAtEpochSeconds: tokenReceivedAt + tokenResponse.expiresInSeconds,
      identity,
      refreshToken: tokenResponse.refreshToken,
      scopes
    },
    options.signal
  )
  return identity
}
