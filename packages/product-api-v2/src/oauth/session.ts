/** @file Web token 的当前页面内存会话 / Current-page in-memory session for Web tokens. */

import {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError
} from '../http/errors'
import type { WebAuthorizationTransaction } from './authorization'
import { parseAuthorizationCallback } from './callback'
import type {
  IdTokenSignatureVerifier,
  RefreshIdTokenVerificationContext,
  VerifiedIdTokenClaims
} from './id-token'
import { verifyIdToken, verifyRefreshIdToken } from './id-token'
import { revokeRefreshToken } from './revocation'
import { exchangeAuthorizationCode, exchangeRefreshToken } from './token'

/** @brief OAuth scope-token 语法 / OAuth scope-token syntax. */
const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/u

/** @brief Refresh Token 请求默认截止毫秒 / Default Refresh Token request deadline in milliseconds. */
const DEFAULT_REFRESH_TIMEOUT_MILLISECONDS = 30_000

/** @brief RFC 7009 撤销默认截止毫秒 / Default RFC 7009 revocation deadline in milliseconds. */
const DEFAULT_REVOCATION_TIMEOUT_MILLISECONDS = 15_000

/** @brief OAuth mutation 允许的最大截止毫秒 / Maximum permitted OAuth-mutation deadline in milliseconds. */
const MAX_OAUTH_TIMEOUT_MILLISECONDS = 120_000

/** @brief 不可序列化约束下的内存 token 状态 / In-memory token state under a no-persistence constraint. */
interface TokenState {
  /** @brief public client ID / Public client ID. */
  readonly clientId: string
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
  /** @brief 首次授权使用的加密 verifier / Cryptographic verifier used by the initial authorization. */
  readonly idTokenVerifier: IdTokenSignatureVerifier
  /** @brief Refresh ID Token 必须复用的验证配置 / Verification context that a Refresh ID Token must reuse. */
  readonly refreshIdTokenVerificationContext: RefreshIdTokenVerificationContext
}

/** @brief 类型系统保证含私有 Refresh Token 的状态 / State statically guaranteed to contain a private Refresh Token. */
interface RefreshableTokenState extends TokenState {
  /** @brief 非空 Refresh Token / Non-null Refresh Token. */
  readonly refreshToken: string
}

/** @brief 已验证但尚未提交的 Refresh Token 轮换 / Validated Refresh Token rotation not yet committed. */
interface ValidatedRefreshRotation {
  /** @brief 新 Access Token / New Access Token. */
  readonly accessToken: string
  /** @brief 新 Access Token 生命周期秒数 / Lifetime of the new Access Token in seconds. */
  readonly expiresInSeconds: number
  /** @brief 强制轮换后的新 Refresh Token / New mandatory-rotation Refresh Token. */
  readonly refreshToken: string
  /** @brief 不扩大原授权的 scopes / Scopes that do not expand the original grant. */
  readonly scopes: readonly string[]
}

/** @brief 单个 token 世代正在执行的 refresh 单飞任务 / Single-flight refresh for one token generation. */
interface RefreshFlight {
  /** @brief 发起任务时的授权世代 / Authorization generation at flight start. */
  readonly generation: number
  /** @brief 发起任务时的完整状态引用 / Complete state reference at flight start. */
  readonly source: RefreshableTokenState
  /** @brief 与会话世代无关的已验证轮换结果 / Validated rotation result independent of session generation. */
  readonly rotation: Promise<ValidatedRefreshRotation>
  /** @brief 所有并发调用者共享的任务 / Operation shared by concurrent callers. */
  readonly promise: Promise<void>
}

/** @brief 内存会话的私有运行时记录 / Private runtime record for an in-memory session. */
interface SessionRecord {
  /** @brief 当前授权世代 / Current authorization generation. */
  generation: number
  /** @brief 当前 token 状态 / Current token state. */
  state: TokenState | null
  /** @brief 当前 Refresh Token 单飞任务 / Current refresh-token single-flight operation. */
  refreshFlight: RefreshFlight | null
  /** @brief 会话时钟 / Session clock. */
  readonly nowEpochSeconds: () => number
}

/** @brief OAuth 网络操作的组合截止 / Combined deadline for an OAuth network operation. */
interface OAuthRequestDeadline {
  /** @brief 调用方取消与本地截止组成的信号 / Signal combining caller cancellation and local deadline. */
  readonly signal: AbortSignal
  /** @brief 是否由本地截止触发 / Whether the local deadline fired. */
  readonly timedOut: () => boolean
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
 * @brief 在异步边界后重新读取取消状态 / Re-read cancellation state after an asynchronous boundary.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 已取消时为 true / True when aborted.
 */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

/**
 * @brief 校验 OAuth mutation 截止时间 / Validate an OAuth-mutation deadline.
 * @param value 调用方配置或默认值 / Caller configuration or default value.
 * @return 正安全整数毫秒 / Positive safe-integer milliseconds.
 */
function oauthTimeoutMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_OAUTH_TIMEOUT_MILLISECONDS) {
    throw new ApiV2ContractError(
      `OAuth request timeout must be between 1 and ${MAX_OAUTH_TIMEOUT_MILLISECONDS} milliseconds.`
    )
  }
  return value
}

/**
 * @brief 组合调用方取消与硬截止 / Combine caller cancellation with a hard deadline.
 * @param callerSignal 调用方取消信号 / Caller cancellation signal.
 * @param timeoutMilliseconds 截止毫秒 / Deadline in milliseconds.
 * @return 可区分 timeout 的组合信号 / Combined signal that distinguishes a timeout.
 */
function createOAuthRequestDeadline(
  callerSignal: AbortSignal | undefined,
  timeoutMilliseconds: number
): OAuthRequestDeadline {
  /** @brief 本地 timeout 信号 / Local timeout signal. */
  const timeoutSignal = AbortSignal.timeout(oauthTimeoutMilliseconds(timeoutMilliseconds))
  return {
    signal:
      callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]),
    timedOut: (): boolean => timeoutSignal.aborted && !isAborted(callerSignal)
  }
}

/**
 * @brief 让单个观察者可独立取消共享任务等待 / Let one observer cancel its wait for a shared operation independently.
 * @param operation 不被观察者取消的共享任务 / Shared operation not cancelled by this observer.
 * @param signal 当前观察者的取消信号 / Cancellation signal of the current observer.
 * @return 当前观察者的独立等待 / Independent wait for the current observer.
 */
function observeWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ApiV2NetworkError('aborted'))
  return new Promise<T>((resolve, reject): void => {
    /** @brief 观察者取消回调 / Observer cancellation callback. */
    const abort = (): void => {
      reject(new ApiV2NetworkError('aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
    void operation.then(
      (value): void => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown): void => {
        signal.removeEventListener('abort', abort)
        reject(
          error instanceof Error
            ? error
            : new ApiV2ContractError('OAuth shared operation rejected without an Error.')
        )
      }
    )
  })
}

/**
 * @brief 将本地 deadline 的取消错误收敛为 timeout / Normalize local-deadline cancellation into timeout.
 * @param error 原操作错误 / Original operation error.
 * @param deadline 当前组合截止 / Current combined deadline.
 * @return 始终抛出规范化错误 / Always throws the normalized error.
 */
function throwNormalizedDeadlineError(error: unknown, deadline: OAuthRequestDeadline): never {
  if (deadline.timedOut() && error instanceof ApiV2NetworkError && error.kind === 'aborted') {
    throw new ApiV2NetworkError('timeout')
  }
  throw error
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
 * @brief 将会话状态收窄为可 refresh 状态 / Narrow session state to a refreshable state.
 * @param state 当前 token 状态 / Current token state.
 * @return 含 Refresh Token 时为 true / True when a Refresh Token is present.
 */
function isRefreshable(state: TokenState | null): state is RefreshableTokenState {
  return state !== null && state.refreshToken !== null
}

/**
 * @brief 安全推进会话世代 / Safely advance the session generation.
 * @param record 私有会话记录 / Private session record.
 * @return 新世代号 / New generation number.
 */
function advanceGeneration(record: SessionRecord): number {
  if (!Number.isSafeInteger(record.generation + 1)) {
    throw new ApiV2ContractError('OAuth session generation is exhausted.')
  }
  record.generation += 1
  return record.generation
}

/**
 * @brief 开始并独占一个新授权世代 / Begin and own a new authorization generation.
 * @param session 目标会话 / Target session.
 * @return 新世代号 / New generation number.
 */
function beginAuthorizationAttempt(session: InMemoryWebTokenSession): number {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(session)
  /** @brief 新授权流程持有的世代 / Generation owned by the new authorization flow. */
  const generation = advanceGeneration(record)
  record.state = null
  record.refreshFlight = null
  return generation
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

/**
 * @brief 严格拆分并验证 OAuth scope 字符串 / Strictly split and validate an OAuth scope string.
 * @param value Token Endpoint 返回的 scope / Scope returned by the Token Endpoint.
 * @return 有序且无重复的 scopes / Ordered unique scopes.
 */
function parseGrantedScopes(value: string): readonly string[] {
  /** @brief 已拆分的 scopes / Split scopes. */
  const scopes = value.split(' ')
  if (
    scopes.some((scope) => !SCOPE_TOKEN_PATTERN.test(scope)) ||
    new Set(scopes).size !== scopes.length
  ) {
    throw new ApiV2ContractError('OAuth token response granted malformed scopes.')
  }
  return Object.freeze(scopes)
}

/**
 * @brief 判断 refresh 任务是否仍拥有原会话状态 / Determine whether a refresh still owns the original session state.
 * @param record 私有会话记录 / Private session record.
 * @param generation refresh 发起世代 / Refresh start generation.
 * @param source refresh 发起状态 / Refresh source state.
 * @return 仍可提交时为 true / True when the refresh may still commit.
 */
function ownsRefreshState(record: SessionRecord, generation: number, source: TokenState): boolean {
  return record.generation === generation && record.state === source
}

/**
 * @brief 只在 refresh 仍拥有状态时清除 token family / Clear a token family only while its refresh still owns the state.
 * @param record 私有会话记录 / Private session record.
 * @param generation refresh 发起世代 / Refresh start generation.
 * @param source refresh 发起状态 / Refresh source state.
 */
function invalidateRefreshState(
  record: SessionRecord,
  generation: number,
  source: TokenState
): void {
  if (!ownsRefreshState(record, generation, source)) return
  advanceGeneration(record)
  record.state = null
  record.refreshFlight = null
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
    SESSION_RECORDS.set(this, {
      generation: 0,
      nowEpochSeconds,
      refreshFlight: null,
      state: null
    })
  }

  /**
   * @brief 为 Bearer HTTP adapter 读取当前 Access Token / Read the current Access Token for a Bearer HTTP adapter.
   * @return Access Token；未登录为 null / Access Token, or null when signed out.
   */
  getAccessToken(): string | null {
    /** @brief 私有会话记录 / Private session record. */
    const record = sessionRecord(this)
    /** @brief 当前状态 / Current state. */
    const current = record.state
    if (current === null) return null
    if (current.expiresAtEpochSeconds <= readEpochSeconds(record.nowEpochSeconds)) {
      if (current.refreshToken === null) {
        advanceGeneration(record)
        record.state = null
      }
      return null
    }
    return current.accessToken
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
    /** @brief 当前有效状态 / Current live state. */
    const current = record.state
    if (current === null) return null
    if (
      current.expiresAtEpochSeconds <= readEpochSeconds(record.nowEpochSeconds) &&
      current.refreshToken === null
    ) {
      advanceGeneration(record)
      record.state = null
      return null
    }
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
    advanceGeneration(record)
    record.state = null
    record.refreshFlight = null
  }
}

/** @brief Refresh 当前 Web token session 的输入 / Input for refreshing the current Web token session. */
export interface RefreshWebTokenSessionOptions {
  /** @brief 目标内存会话 / Target in-memory session. */
  readonly session: InMemoryWebTokenSession
  /** @brief 可替换 Fetch 实现 / Replaceable Fetch implementation. */
  readonly fetchImpl?: typeof fetch | undefined
  /** @brief 可选取消信号；单飞 leader 拥有底层请求 / Optional cancellation signal; the single-flight leader owns the request. */
  readonly signal?: AbortSignal | undefined
  /** @brief refresh 硬截止毫秒 / Hard refresh deadline in milliseconds. */
  readonly timeoutMilliseconds?: number | undefined
}

/**
 * @brief 请求并完整验证一次强制 refresh 轮换 / Request and fully validate one mandatory refresh rotation.
 * @param source 发起时 token 状态 / Token state at start.
 * @param fetchImpl Fetch 实现 / Fetch implementation.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 尚未写入会话的可信轮换结果 / Trusted rotation result not yet written to the session.
 */
async function requestRefreshRotation(
  source: RefreshableTokenState,
  nowEpochSeconds: () => number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<ValidatedRefreshRotation> {
  if (isAborted(signal)) throw new ApiV2NetworkError('aborted')
  /** @brief 严格轮换响应 / Strict rotation response. */
  const response = await exchangeRefreshToken(
    source.refreshToken,
    source.clientId,
    fetchImpl,
    signal
  )
  /** @brief 新授予 scopes / Newly granted scopes. */
  const scopes = parseGrantedScopes(response.scope)
  if (
    response.refreshToken === source.refreshToken ||
    scopes.some((scope) => !source.scopes.includes(scope)) ||
    !scopes.includes('openid') ||
    !scopes.includes('offline_access')
  ) {
    throw new ApiV2ContractError(
      'OAuth refresh response did not safely rotate the token within the prior grant.'
    )
  }
  await verifyRefreshIdToken({
    idToken: response.idToken,
    nowEpochSeconds,
    priorIdentity: source.identity,
    signal,
    verificationContext: source.refreshIdTokenVerificationContext,
    verifier: source.idTokenVerifier
  })
  return Object.freeze({
    accessToken: response.accessToken,
    expiresInSeconds: response.expiresInSeconds,
    refreshToken: response.refreshToken,
    scopes
  })
}

/**
 * @brief 仅在原世代仍有效时原子提交轮换 / Atomically commit a rotation only while the original generation remains current.
 * @param record 私有会话记录 / Private session record.
 * @param source 发起时 token 状态 / Token state at start.
 * @param generation 发起时世代 / Generation at start.
 * @param rotation 已验证的网络轮换任务 / Validated network-rotation task.
 * @param signal 可选取消信号 / Optional cancellation signal.
 */
async function commitRefreshRotation(
  record: SessionRecord,
  source: RefreshableTokenState,
  generation: number,
  rotation: Promise<ValidatedRefreshRotation>,
  signal?: AbortSignal
): Promise<void> {
  try {
    /** @brief 已完整验证的轮换 / Fully validated rotation. */
    const next = await rotation
    if (!ownsRefreshState(record, generation, source)) throw new ApiV2NetworkError('aborted')
    if (isAborted(signal)) {
      invalidateRefreshState(record, generation, source)
      throw new ApiV2NetworkError('aborted')
    }
    /** @brief 响应接收时间 / Response receipt time. */
    const receivedAt = readEpochSeconds(record.nowEpochSeconds)
    if (!ownsRefreshState(record, generation, source) || isAborted(signal)) {
      throw new ApiV2NetworkError('aborted')
    }
    record.state = Object.freeze({
      accessToken: next.accessToken,
      clientId: source.clientId,
      expiresAtEpochSeconds: receivedAt + next.expiresInSeconds,
      identity: source.identity,
      idTokenVerifier: source.idTokenVerifier,
      refreshToken: next.refreshToken,
      refreshIdTokenVerificationContext: source.refreshIdTokenVerificationContext,
      scopes: next.scopes
    })
  } catch (error: unknown) {
    if (!ownsRefreshState(record, generation, source)) {
      throw new ApiV2NetworkError('aborted')
    }
    invalidateRefreshState(record, generation, source)
    throw error
  }
}

/**
 * @brief 以每个会话单飞方式刷新并轮换 token / Refresh and rotate tokens with per-session single flight.
 * @param options 会话与网络依赖 / Session and network dependencies.
 * @return 完成时新 token 已原子提交；不会返回任何 token / Resolves after atomic commit and never returns a token.
 * @note 旧 Refresh Token 一旦可能已发送，任何失败都会清除该会话，禁止重放。 / Once the old Refresh Token may have been sent, every failure clears the session and forbids replay.
 */
export function refreshWebTokenSession(options: RefreshWebTokenSessionOptions): Promise<void> {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(options.session)
  /** @brief 当前 token 状态 / Current token state. */
  const source = record.state
  if (!isRefreshable(source)) {
    return Promise.reject(new ApiV2AuthenticationRequiredError())
  }
  if (options.signal?.aborted === true) {
    return Promise.reject(new ApiV2NetworkError('aborted'))
  }
  /** @brief 已有相同状态的单飞任务 / Existing single flight for the same state. */
  const currentFlight = record.refreshFlight
  if (
    currentFlight !== null &&
    currentFlight.generation === record.generation &&
    currentFlight.source === source
  ) {
    return options.signal === undefined
      ? currentFlight.promise
      : observeWithSignal(currentFlight.promise, options.signal)
  }
  /** @brief leader 拥有的 refresh 总截止 / Total refresh deadline owned by the leader. */
  const deadline = createOAuthRequestDeadline(
    options.signal,
    options.timeoutMilliseconds ?? DEFAULT_REFRESH_TIMEOUT_MILLISECONDS
  )
  /** @brief 本 refresh 持有的世代 / Generation owned by this refresh. */
  const generation = record.generation
  /** @brief 与会话提交分离的网络轮换 / Network rotation separated from session commit. */
  const rotation = requestRefreshRotation(
    source,
    record.nowEpochSeconds,
    options.fetchImpl ?? fetch,
    deadline.signal
  )
  /** @brief 尚未规范化 deadline 类别的提交任务 / Commit before deadline-kind normalization. */
  const commit = commitRefreshRotation(record, source, generation, rotation, deadline.signal)
  /** @brief 新单飞任务 / New single-flight operation. */
  const operation = commit.catch((error: unknown): never =>
    throwNormalizedDeadlineError(error, deadline)
  )
  record.refreshFlight = { generation, promise: operation, rotation, source }
  /** @brief 仅清理仍指向本任务的单飞槽 / Clear the slot only if it still references this operation. */
  const clearFlight = (): void => {
    if (record.refreshFlight?.promise === operation) record.refreshFlight = null
  }
  void operation.then(clearFlight, clearFlight)
  return operation
}

/** @brief 按资源服务器观察条件刷新 Web token session 的输入 / Input for conditionally refreshing a Web token session from a resource-server observation. */
export interface RefreshWebTokenSessionIfCurrentOptions extends RefreshWebTokenSessionOptions {
  /** @brief 触发恢复的已拒绝 Access Token；本地无有效 token 时为 null / Rejected access token that triggered recovery, or null when no locally valid token exists. */
  readonly rejectedAccessToken: string | null
}

/**
 * @brief 仅当资源服务器观察仍对应私有当前状态时刷新 / Refresh only while the resource-server observation still matches private current state.
 * @param options 已拒绝 token、会话与网络依赖 / Rejected token, session, and network dependencies.
 * @return 已替换时直接完成；匹配时完成原子轮换 / Resolves immediately when replaced, or after atomic rotation when matched.
 * @note null 表示调用方观察不到有效 Access Token：已有有效 token 时 no-op，仅对仍保留 Refresh Token 的过期状态刷新。 / Null means the caller observed no valid access token: no-op when one is now valid, and refresh only an expired state that still carries a refresh token.
 */
export function refreshWebTokenSessionIfCurrent(
  options: RefreshWebTokenSessionIfCurrentOptions
): Promise<void> {
  if (options.rejectedAccessToken !== null && typeof options.rejectedAccessToken !== 'string') {
    return Promise.reject(new ApiV2ContractError('OAuth rejected access token must be a string.'))
  }
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(options.session)
  /** @brief 原子决策读取的完整当前状态 / Complete current state read for the atomic decision. */
  const source = record.state

  if (options.rejectedAccessToken === null) {
    if (source === null) return Promise.reject(new ApiV2AuthenticationRequiredError())
    if (source.expiresAtEpochSeconds > readEpochSeconds(record.nowEpochSeconds)) {
      return Promise.resolve()
    }
  } else if (source === null || source.accessToken !== options.rejectedAccessToken) {
    return Promise.resolve()
  }

  if (!isRefreshable(source)) {
    invalidateRefreshState(record, record.generation, source)
    return Promise.reject(new ApiV2AuthenticationRequiredError())
  }
  return refreshWebTokenSession(options)
}

/**
 * @brief 仅当私有当前状态仍使用被拒绝 token 时清除会话 / Clear the session only while private current state still uses the rejected token.
 * @param session 目标内存会话 / Target in-memory session.
 * @param rejectedAccessToken 被第二个严格 401 拒绝的 token / Token rejected by the second strict 401.
 */
export function invalidateWebTokenSessionAccessToken(
  session: InMemoryWebTokenSession,
  rejectedAccessToken: string
): void {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(session)
  /** @brief 失效决策时的当前状态 / Current state at invalidation decision time. */
  const current = record.state
  if (current === null || current.accessToken !== rejectedAccessToken) return
  invalidateRefreshState(record, record.generation, current)
}

/** @brief 本地登出并尽力撤销服务端 token 的输入 / Input for local logout with best-effort server revocation. */
export interface LogoutWebTokenSessionOptions {
  /** @brief 目标内存会话 / Target in-memory session. */
  readonly session: InMemoryWebTokenSession
  /** @brief 可替换 Fetch 实现 / Replaceable Fetch implementation. */
  readonly fetchImpl?: typeof fetch | undefined
  /** @brief 可选撤销请求取消信号 / Optional revocation-request cancellation signal. */
  readonly signal?: AbortSignal | undefined
  /** @brief 整个尽力撤销过程的硬截止毫秒 / Hard deadline for the whole best-effort revocation process. */
  readonly timeoutMilliseconds?: number | undefined
}

/**
 * @brief 先不可逆地本地登出，再尽力按 RFC 7009 撤销 Refresh Token / Irreversibly sign out locally, then best-effort revoke the Refresh Token under RFC 7009.
 * @param options 会话与网络依赖 / Session and network dependencies.
 * @return 撤销尝试结束；服务端失败不会恢复或抛出 / Resolves after the attempt; server failure neither restores nor escapes.
 */
export async function logoutWebTokenSession(options: LogoutWebTokenSessionOptions): Promise<void> {
  /** @brief 私有会话记录 / Private session record. */
  const record = sessionRecord(options.session)
  /** @brief 清除前仅供本函数使用的状态 / State used only by this function after local clearing. */
  const source = record.state
  /** @brief 与当前状态匹配的进行中轮换 / In-flight rotation matching the current state. */
  const rotation =
    isRefreshable(source) &&
    record.refreshFlight?.generation === record.generation &&
    record.refreshFlight.source === source
      ? record.refreshFlight.rotation
      : null
  advanceGeneration(record)
  record.state = null
  record.refreshFlight = null
  if (!isRefreshable(source) || isAborted(options.signal)) return
  /** @brief 登出后服务端撤销的总截止 / Total server-revocation deadline after local logout. */
  const deadline = createOAuthRequestDeadline(
    options.signal,
    options.timeoutMilliseconds ?? DEFAULT_REVOCATION_TIMEOUT_MILLISECONDS
  )
  /** @brief 优先撤销轮换成功后的最新 token / Prefer the latest token after a successful in-flight rotation. */
  let refreshToken = source.refreshToken
  if (rotation !== null) {
    try {
      refreshToken = (await observeWithSignal(rotation, deadline.signal)).refreshToken
    } catch {
      // The old token is the only value available after an ambiguous or rejected rotation.
    }
  }
  if (deadline.signal.aborted) return
  try {
    await revokeRefreshToken(
      refreshToken,
      source.clientId,
      options.fetchImpl ?? fetch,
      deadline.signal
    )
  } catch {
    // Best effort by design: local logout is authoritative and must never be rolled back.
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
  const scopes = parseGrantedScopes(tokenResponse.scope)
  if (
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
      clientId: options.transaction.clientId,
      expiresAtEpochSeconds: tokenReceivedAt + tokenResponse.expiresInSeconds,
      identity,
      idTokenVerifier: options.idTokenVerifier,
      refreshToken: tokenResponse.refreshToken,
      refreshIdTokenVerificationContext: Object.freeze({
        allowedAlgorithms: Object.freeze([...options.transaction.idTokenSigningAlgorithms]),
        clientId: options.transaction.clientId,
        issuer: options.transaction.issuer,
        jwksUri: options.transaction.jwksUri
      }),
      scopes
    },
    options.signal
  )
  return identity
}
