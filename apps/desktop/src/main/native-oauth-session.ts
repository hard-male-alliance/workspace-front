/** @file Electron main 的持久 Refresh Token 与内存 Access Token 会话 / Persistent Refresh Token and in-memory Access Token session in Electron main. */

import {
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  revokeRefreshToken,
  verifyIdToken,
  verifyRefreshIdToken
} from '@ai-job-workspace/product-api-v2/native-oauth'
import type {
  IdTokenSignatureVerifier,
  NativeAuthorizationTransaction,
  RefreshIdTokenVerificationContext,
  VerifiedIdTokenClaims
} from '@ai-job-workspace/product-api-v2/native-oauth'

/** @brief OAuth scope-token 语法 / OAuth scope-token syntax. */
const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/u

/** @brief Refresh Token 请求硬截止 / Hard deadline for a Refresh Token request. */
const REFRESH_TIMEOUT_MILLISECONDS = 30_000

/** @brief RFC 7009 尽力撤销硬截止 / Hard deadline for best-effort RFC 7009 revocation. */
const REVOCATION_TIMEOUT_MILLISECONDS = 15_000

/** @brief native 会话允许的最大 scope 数 / Maximum scope count accepted by the native session. */
const MAX_SCOPE_COUNT = 64

/** @brief native 会话持久化的长期授权 / Long-lived native grant persisted by the host. */
export interface NativeStoredRefreshGrant {
  /** @brief public client ID / Public client ID. */
  readonly clientId: string
  /** @brief 已验证 OIDC 身份 / Verified OIDC identity. */
  readonly identity: VerifiedIdTokenClaims
  /** @brief 私有 Refresh Token / Private Refresh Token. */
  readonly refreshToken: string
  /** @brief Refresh ID Token 验证上下文 / Refresh ID Token verification context. */
  readonly verificationContext: RefreshIdTokenVerificationContext
  /** @brief 授予 scopes / Granted scopes. */
  readonly scopes: readonly string[]
}

/** @brief main-only Refresh Token 持久化端口 / Main-only Refresh Token persistence port. */
export interface NativeRefreshGrantStore {
  /**
   * @brief 在改变现有授权前确认安全存储可用 / Confirm secure-storage availability before changing an existing grant.
   * @return 可用性检查完成 / Resolves after the availability check.
   */
  readonly ensureAvailable: () => Promise<void>
  /**
   * @brief 读取并解密长期授权 / Read and decrypt the long-lived grant.
   * @return 无记录时为 null / Null when no record exists.
   */
  readonly read: () => Promise<NativeStoredRefreshGrant | null>
  /**
   * @brief 原子替换完整长期授权 / Atomically replace the complete long-lived grant.
   * @param grant 已验证授权 / Validated grant.
   * @return 持久化完成 / Resolves after persistence.
   */
  readonly replace: (grant: NativeStoredRefreshGrant) => Promise<void>
  /**
   * @brief 删除本地长期授权 / Delete the local long-lived grant.
   * @return 本地清理完成 / Resolves after local clearing.
   */
  readonly clear: () => Promise<void>
}

/** @brief main 内存中的完整 native 会话 / Complete native session held in main memory. */
interface NativeSessionState extends NativeStoredRefreshGrant {
  /** @brief 短期 Access Token；null 表示需刷新 / Short-lived Access Token, or null when refresh is required. */
  readonly accessToken: string | null
  /** @brief Access Token 到期 epoch 秒；无 token 时为 0 / Access Token expiration epoch seconds, or zero without a token. */
  readonly expiresAtEpochSeconds: number
}

/** @brief 通过 IPC 投影前的 main 私有会话视图 / Main-private session view before IPC projection. */
export interface NativeOAuthSessionProjection {
  /** @brief 短期 Access Token / Short-lived Access Token. */
  readonly accessToken: string
  /** @brief Access Token 到期 epoch 秒 / Access Token expiration epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 已授予 scopes / Granted scopes. */
  readonly scopes: readonly string[]
  /** @brief 已验证 OIDC subject / Verified OIDC subject. */
  readonly subject: string
}

/** @brief 已验证但尚未持久化的 Refresh Token 轮换 / Validated Refresh Token rotation not yet persisted. */
interface NativeRefreshRotation {
  /** @brief 新 Access Token / New Access Token. */
  readonly accessToken: string
  /** @brief 新 Access Token 到期 epoch 秒 / New Access Token expiration epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 新完整长期授权 / New complete long-lived grant. */
  readonly grant: NativeStoredRefreshGrant
}

/** @brief 单个会话世代的 refresh 单飞任务 / Refresh single flight for one session generation. */
interface NativeRefreshFlight {
  /** @brief 发起 refresh 的世代 / Generation that started the refresh. */
  readonly generation: number
  /** @brief 发起 refresh 的状态引用 / State reference that started the refresh. */
  readonly source: NativeSessionState
  /** @brief 已验证但不含提交的网络轮换 / Validated network rotation without commit. */
  readonly rotation: Promise<NativeRefreshRotation>
  /** @brief 包含原子持久化与内存提交的共享任务 / Shared operation including atomic persistence and memory commit. */
  readonly promise: Promise<void>
}

/** @brief native OAuth 会话构造依赖 / Construction dependencies of the native OAuth session. */
export interface NativeOAuthSessionOptions {
  /** @brief 当前部署注册的 public client ID / Registered public client ID for this deployment. */
  readonly clientId: string
  /** @brief OS-backed Refresh Token store / OS-backed Refresh Token store. */
  readonly grantStore: NativeRefreshGrantStore
  /** @brief JWKS + Web Crypto ID Token verifier / JWKS and Web Crypto ID Token verifier. */
  readonly idTokenVerifier: IdTokenSignatureVerifier
  /** @brief 可替换 Fetch 实现 / Replaceable Fetch implementation. */
  readonly fetchImpl?: typeof fetch | undefined
  /** @brief 可替换 epoch 秒时钟 / Replaceable epoch-seconds clock. */
  readonly nowEpochSeconds?: (() => number) | undefined
}

/** @brief native OAuth 会话状态错误 / Native OAuth session-state error. */
export class NativeOAuthSessionError extends Error {
  override readonly name = 'NativeOAuthSessionError'
}

/**
 * @brief 读取有效 epoch 秒 / Read a valid epoch-seconds value.
 * @param clock 会话时钟 / Session clock.
 * @return 非负有限 epoch 秒 / Non-negative finite epoch seconds.
 */
function readEpochSeconds(clock: () => number): number {
  /** @brief 当前时钟值 / Current clock value. */
  const value = clock()
  if (!Number.isFinite(value) || value < 0) {
    throw new NativeOAuthSessionError('The native OAuth session clock is invalid.')
  }
  return value
}

/**
 * @brief 在异步边界后重新读取取消状态 / Re-read cancellation after an asynchronous boundary.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 已取消时为 true / True when aborted.
 */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

/**
 * @brief 严格拆分授予 scopes / Strictly split granted scopes.
 * @param value Token Endpoint 返回的 scope 字符串 / Scope string returned by the Token Endpoint.
 * @return 有序且无重复的 scopes / Ordered duplicate-free scopes.
 */
function parseGrantedScopes(value: string): readonly string[] {
  /** @brief 以单个空格拆分的 scope tokens / Scope tokens split on a single space. */
  const scopes = value.split(' ')
  if (
    scopes.length === 0 ||
    scopes.length > MAX_SCOPE_COUNT ||
    scopes.some((scope) => !SCOPE_TOKEN_PATTERN.test(scope)) ||
    new Set(scopes).size !== scopes.length
  ) {
    throw new NativeOAuthSessionError('The native OAuth grant contains malformed scopes.')
  }
  return Object.freeze(scopes)
}

/**
 * @brief 冻结长期授权的深层数组与身份 / Freeze arrays and identity within a long-lived grant.
 * @param grant 已验证授权 / Validated grant.
 * @return 深层冻结投影 / Deeply frozen projection.
 */
function freezeGrant(grant: NativeStoredRefreshGrant): NativeStoredRefreshGrant {
  return Object.freeze({
    ...grant,
    identity: Object.freeze({
      ...grant.identity,
      audience: Object.freeze([...grant.identity.audience])
    }),
    scopes: Object.freeze([...grant.scopes]),
    verificationContext: Object.freeze({
      ...grant.verificationContext,
      allowedAlgorithms: Object.freeze([...grant.verificationContext.allowedAlgorithms])
    })
  })
}

/**
 * @brief 校验持久授权是否属于当前部署 / Validate that a persisted grant belongs to the current deployment.
 * @param grant OS store 解密后的授权 / Grant decrypted by the OS store.
 * @param clientId 当前 public client ID / Current public client ID.
 * @return 冻结的可信授权 / Frozen trusted grant.
 */
function validateStoredGrant(
  grant: NativeStoredRefreshGrant,
  clientId: string
): NativeStoredRefreshGrant {
  if (
    grant.clientId !== clientId ||
    clientId.length === 0 ||
    clientId.length > 255 ||
    grant.refreshToken.length < 20 ||
    grant.refreshToken.length > 8192 ||
    grant.scopes.length === 0 ||
    grant.scopes.length > MAX_SCOPE_COUNT ||
    grant.scopes.some((scope) => !SCOPE_TOKEN_PATTERN.test(scope)) ||
    new Set(grant.scopes).size !== grant.scopes.length ||
    !grant.scopes.includes('openid') ||
    !grant.scopes.includes('offline_access') ||
    grant.verificationContext.clientId !== clientId ||
    grant.verificationContext.issuer !== API_V2_OAUTH_ISSUER ||
    grant.verificationContext.jwksUri !== API_V2_OAUTH_JWKS_URI ||
    grant.verificationContext.nonce.length === 0 ||
    grant.verificationContext.nonce.length > 255 ||
    grant.verificationContext.allowedAlgorithms.length === 0 ||
    grant.verificationContext.allowedAlgorithms.length > 2 ||
    grant.verificationContext.allowedAlgorithms.some(
      (algorithm) => algorithm !== 'ES256' && algorithm !== 'RS256'
    ) ||
    new Set(grant.verificationContext.allowedAlgorithms).size !==
      grant.verificationContext.allowedAlgorithms.length ||
    grant.identity.issuer !== API_V2_OAUTH_ISSUER ||
    grant.identity.subject.length === 0 ||
    grant.identity.subject.length > 2048 ||
    grant.identity.audience.length === 0 ||
    grant.identity.audience.length > 16 ||
    new Set(grant.identity.audience).size !== grant.identity.audience.length ||
    !grant.identity.audience.includes(clientId) ||
    (grant.identity.audience.length > 1 && grant.identity.authorizedParty === null) ||
    (grant.identity.authorizedParty !== null && grant.identity.authorizedParty !== clientId) ||
    !Number.isSafeInteger(grant.identity.expiresAtEpochSeconds) ||
    !Number.isSafeInteger(grant.identity.issuedAtEpochSeconds) ||
    grant.identity.issuedAtEpochSeconds < 0 ||
    grant.identity.expiresAtEpochSeconds <= grant.identity.issuedAtEpochSeconds
  ) {
    throw new NativeOAuthSessionError('The stored native OAuth grant is invalid or stale.')
  }
  return freezeGrant(grant)
}

/**
 * @brief 创建 caller 与硬截止组合信号 / Create a signal combining caller cancellation and a hard deadline.
 * @param callerSignal 可选调用方信号 / Optional caller signal.
 * @param timeoutMilliseconds 硬截止毫秒 / Hard deadline in milliseconds.
 * @return 组合 AbortSignal / Combined AbortSignal.
 */
function deadlineSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMilliseconds: number
): AbortSignal {
  /** @brief 本地硬截止信号 / Local hard-deadline signal. */
  const timeout = AbortSignal.timeout(timeoutMilliseconds)
  return callerSignal === undefined ? timeout : AbortSignal.any([callerSignal, timeout])
}

/** @brief Electron main 的 native OAuth 会话聚合 / Native OAuth session aggregate in Electron main. */
export class NativeOAuthSession {
  /** @brief 当前 public client ID / Current public client ID. */
  private readonly clientId: string
  /** @brief OS-backed 长期授权存储 / OS-backed long-lived grant store. */
  private readonly grantStore: NativeRefreshGrantStore
  /** @brief ID Token 加密 verifier / Cryptographic ID Token verifier. */
  private readonly idTokenVerifier: IdTokenSignatureVerifier
  /** @brief OAuth 网络实现 / OAuth network implementation. */
  private readonly fetchImpl: typeof fetch
  /** @brief 会话时钟 / Session clock. */
  private readonly nowEpochSeconds: () => number
  /** @brief 当前授权世代 / Current authorization generation. */
  private generation = 0
  /** @brief 当前 main 内存会话 / Current main-memory session. */
  private state: NativeSessionState | null = null
  /** @brief 当前 refresh 单飞任务 / Current refresh single flight. */
  private refreshFlight: NativeRefreshFlight | null = null
  /** @brief 串行持久化队列尾 / Tail of the serialized persistence queue. */
  private persistenceTail: Promise<void> = Promise.resolve()
  /** @brief 会话生命周期阶段 / Native-session lifecycle phase. */
  private lifecycle: 'active' | 'authorizing' | 'signing-out' | 'shutting-down' | 'closed' =
    'active'
  /** @brief 幂等关闭任务 / Idempotent shutdown operation. */
  private shutdownFlight: Promise<void> | null = null

  /**
   * @brief 创建 main-only native OAuth 会话 / Construct a main-only native OAuth session.
   * @param options public client、存储、verifier 与时钟 / Public client, store, verifier, and clock.
   */
  constructor(options: NativeOAuthSessionOptions) {
    this.clientId = options.clientId
    this.grantStore = options.grantStore
    this.idTokenVerifier = options.idTokenVerifier
    this.fetchImpl = options.fetchImpl ?? fetch
    this.nowEpochSeconds = options.nowEpochSeconds ?? ((): number => Date.now() / 1000)
  }

  /**
   * @brief 串行执行一个持久化动作 / Run one persistence action serially.
   * @param operation 存储动作 / Storage operation.
   * @return 当前动作结果 / Result of the current operation.
   */
  private enqueuePersistence<T>(operation: () => Promise<T>): Promise<T> {
    /** @brief 在前序成功或失败后均继续的当前任务 / Current task continuing after either prior outcome. */
    const current = this.persistenceTail.then(operation, operation)
    this.persistenceTail = current.then(
      (): void => undefined,
      (): void => undefined
    )
    return current
  }

  /**
   * @brief 安全推进会话世代 / Safely advance the session generation.
   * @return 新世代 / New generation.
   */
  private advanceGeneration(): number {
    if (!Number.isSafeInteger(this.generation + 1)) {
      throw new NativeOAuthSessionError('The native OAuth session generation is exhausted.')
    }
    this.generation += 1
    return this.generation
  }

  /**
   * @brief 判断异步流程是否仍拥有会话 / Determine whether an asynchronous flow still owns the session.
   * @param generation 流程世代 / Flow generation.
   * @param source 流程源状态；新授权为 null / Source state, or null for new authorization.
   * @return 仍可提交时为 true / True while commit is still allowed.
   */
  private owns(generation: number, source: NativeSessionState | null): boolean {
    return this.generation === generation && this.state === source
  }

  /**
   * @brief 要求会话可接受新的生命周期命令 / Require the session to accept a new lifecycle command.
   * @return 无返回值 / No return value.
   */
  private assertActive(): void {
    if (this.lifecycle !== 'active') {
      throw new NativeOAuthSessionError('The native OAuth session is busy or shutting down.')
    }
  }

  /**
   * @brief 在独立硬截止内尽力撤销 Refresh Token / Best-effort revoke a Refresh Token under an independent hard deadline.
   * @param refreshToken 待撤销 Refresh Token / Refresh Token to revoke.
   * @param clientId 所属 public client ID / Owning public client ID.
   * @return 撤销尝试结束 / Resolves when the revocation attempt finishes.
   */
  private async bestEffortRevoke(refreshToken: string, clientId: string): Promise<void> {
    await revokeRefreshToken(
      refreshToken,
      clientId,
      this.fetchImpl,
      deadlineSignal(undefined, REVOCATION_TIMEOUT_MILLISECONDS)
    ).catch(() => undefined)
  }

  /**
   * @brief 启动时恢复并立即轮换持久 Refresh Token / Restore and immediately rotate a persisted Refresh Token at startup.
   * @return 恢复后的有效会话；无记录或失效时为 null / Live restored session, or null when absent or invalid.
   */
  async restore(): Promise<NativeOAuthSessionProjection | null> {
    this.assertActive()
    await this.grantStore.ensureAvailable()
    /** @brief OS store 中的授权 / Grant read from the OS store. */
    const stored = await this.enqueuePersistence(() => this.grantStore.read())
    if (stored === null) return null
    try {
      /** @brief 针对当前 client 严格验证的授权 / Grant validated against the current client. */
      const grant = validateStoredGrant(stored, this.clientId)
      this.state = Object.freeze({
        ...grant,
        accessToken: null,
        expiresAtEpochSeconds: 0
      })
      await this.refresh(null)
      return this.getProjection()
    } catch {
      this.advanceGeneration()
      this.state = null
      this.refreshFlight = null
      await this.enqueuePersistence(() => this.grantStore.clear()).catch(() => undefined)
      return null
    }
  }

  /**
   * @brief 开始一个新授权并返回绑定世代的 grant installer / Begin a new authorization and return its generation-bound grant installer.
   * @param signal 整轮授权取消信号 / Cancellation signal for the complete authorization round.
   * @return 只可安装本授权结果的 main 端口 / Main-side port that can install only this authorization result.
   */
  async beginAuthorization(signal?: AbortSignal): Promise<{
    readonly installGrant: (
      code: string,
      transaction: NativeAuthorizationTransaction,
      signal?: AbortSignal
    ) => Promise<void>
  }> {
    if (isAborted(signal)) {
      throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
    }
    await this.grantStore.ensureAvailable()
    if (isAborted(signal)) {
      throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
    }
    this.assertActive()
    this.lifecycle = 'authorizing'
    /** @brief preflight 后已存在的轮换任务 / Rotation already in flight after the preflight. */
    const refresh = this.refreshFlight?.promise
    if (refresh !== undefined) await refresh.catch(() => undefined)
    if (isAborted(signal)) {
      this.lifecycle = 'active'
      throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
    }
    /** @brief 仅在安全清理成功后才被替换的旧授权 / Prior grant replaced only after secure local clearing succeeds. */
    const prior = this.state
    try {
      await this.enqueuePersistence(() => this.grantStore.clear())
    } catch (error: unknown) {
      this.lifecycle = 'active'
      throw error
    }
    if (isAborted(signal) || this.lifecycle !== 'authorizing') {
      if (prior !== null) await this.bestEffortRevoke(prior.refreshToken, prior.clientId)
      if (this.lifecycle === 'authorizing') this.lifecycle = 'active'
      throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
    }
    /** @brief 新授权拥有的世代 / Generation owned by the new authorization. */
    const generation = this.advanceGeneration()
    this.state = null
    this.refreshFlight = null
    if (prior !== null) await this.bestEffortRevoke(prior.refreshToken, prior.clientId)
    if (isAborted(signal)) {
      this.lifecycle = 'active'
      throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
    }
    return Object.freeze({
      installGrant: (
        code: string,
        transaction: NativeAuthorizationTransaction,
        signal?: AbortSignal
      ) => this.installAuthorizationGrant(generation, code, transaction, signal)
    })
  }

  /**
   * @brief 交换、验证并持久化一个新授权结果 / Exchange, verify, and persist a new authorization result.
   * @param generation 授权世代 / Authorization generation.
   * @param code 一次性 authorization code / One-time authorization code.
   * @param transaction main 内存事务 / Main-memory transaction.
   * @param signal 可选取消信号 / Optional cancellation signal.
   */
  private async installAuthorizationGrant(
    generation: number,
    code: string,
    transaction: NativeAuthorizationTransaction,
    signal?: AbortSignal
  ): Promise<void> {
    if (
      !this.owns(generation, null) ||
      transaction.clientId !== this.clientId ||
      signal?.aborted === true
    ) {
      throw new NativeOAuthSessionError('The native OAuth authorization is no longer current.')
    }
    /** @brief 可能需要失败时撤销的候选 Refresh Token / Candidate Refresh Token to revoke on failure. */
    let candidateRefreshToken: string | null = null
    try {
      /** @brief 严格 token response / Strict token response. */
      const response = await exchangeAuthorizationCode(code, transaction, this.fetchImpl, signal)
      candidateRefreshToken = response.refreshToken
      /** @brief Token Endpoint 响应接收时间 / Token Endpoint response receipt time. */
      const receivedAt = readEpochSeconds(this.nowEpochSeconds)
      /** @brief 完整验证的初始身份 / Fully verified initial identity. */
      const identity = await verifyIdToken(
        response.idToken,
        transaction,
        this.idTokenVerifier,
        this.nowEpochSeconds,
        signal
      )
      /** @brief 授予 scopes / Granted scopes. */
      const scopes = parseGrantedScopes(response.scope)
      if (
        response.refreshToken === null ||
        scopes.some((scope) => !transaction.scopes.includes(scope)) ||
        !scopes.includes('openid') ||
        !scopes.includes('offline_access') ||
        !transaction.scopes.includes('offline_access')
      ) {
        throw new NativeOAuthSessionError(
          'The native OAuth response did not include the required offline grant.'
        )
      }
      /** @brief 首次授权绑定的长期授权 / Long-lived grant bound to the initial authorization. */
      const grant = freezeGrant({
        clientId: this.clientId,
        identity,
        refreshToken: response.refreshToken,
        scopes,
        verificationContext: {
          allowedAlgorithms: transaction.idTokenSigningAlgorithms,
          clientId: transaction.clientId,
          issuer: transaction.issuer,
          jwksUri: transaction.jwksUri,
          nonce: transaction.nonce
        }
      })
      /** @brief 尚未公开的候选内存状态 / Candidate in-memory state not yet exposed. */
      const next = Object.freeze({
        ...grant,
        accessToken: response.accessToken,
        expiresAtEpochSeconds: receivedAt + response.expiresInSeconds
      })
      await this.enqueuePersistence(async (): Promise<void> => {
        if (!this.owns(generation, null) || isAborted(signal)) {
          throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
        }
        await this.grantStore.replace(grant)
      })
      if (!this.owns(generation, null) || isAborted(signal)) {
        throw new NativeOAuthSessionError('The native OAuth authorization was cancelled.')
      }
      this.state = next
      this.lifecycle = 'active'
    } catch (error: unknown) {
      if (this.owns(generation, null)) {
        this.advanceGeneration()
        await this.enqueuePersistence(() => this.grantStore.clear()).catch(() => undefined)
      }
      if (candidateRefreshToken !== null) {
        await this.bestEffortRevoke(candidateRefreshToken, this.clientId)
      }
      if (this.lifecycle === 'authorizing') this.lifecycle = 'active'
      throw error
    }
  }

  /**
   * @brief 放弃尚未完成的新授权世代 / Abandon an incomplete authorization generation.
   * @return 本地清理尝试完成 / Resolves after local cleanup is attempted.
   */
  async cancelAuthorization(): Promise<void> {
    if (this.lifecycle !== 'authorizing') return
    this.advanceGeneration()
    this.state = null
    this.refreshFlight = null
    try {
      await this.enqueuePersistence(() => this.grantStore.clear())
    } finally {
      this.lifecycle = 'active'
    }
  }

  /**
   * @brief 获取当前有效短期会话 / Get the current live short-lived session.
   * @return access token 与非敏感投影；无有效 access token 时为 null / Access token and non-sensitive projection, or null without a live access token.
   */
  getProjection(): NativeOAuthSessionProjection | null {
    /** @brief 当前状态快照 / Current state snapshot. */
    const current = this.state
    if (
      current === null ||
      current.accessToken === null ||
      current.expiresAtEpochSeconds <= readEpochSeconds(this.nowEpochSeconds)
    ) {
      return null
    }
    return Object.freeze({
      accessToken: current.accessToken,
      expiresAtEpochSeconds: current.expiresAtEpochSeconds,
      scopes: current.scopes,
      subject: current.identity.subject
    })
  }

  /**
   * @brief 条件刷新当前 token 世代 / Conditionally refresh the current token generation.
   * @param rejectedAccessToken 被资源服务器拒绝的 token；无 token 时为 null / Token rejected by the resource server, or null when absent.
   * @param signal 可选调用方取消信号 / Optional caller cancellation signal.
   */
  async refresh(rejectedAccessToken: string | null, signal?: AbortSignal): Promise<void> {
    this.assertActive()
    if (
      rejectedAccessToken !== null &&
      (rejectedAccessToken.length < 20 || rejectedAccessToken.length > 8192)
    ) {
      throw new NativeOAuthSessionError('The rejected Access Token is invalid.')
    }
    /** @brief 原子决策读取的当前状态 / Current state read for the atomic decision. */
    const source = this.state
    if (source === null)
      throw new NativeOAuthSessionError('Native OAuth authentication is required.')
    if (rejectedAccessToken === null) {
      if (
        source.accessToken !== null &&
        source.expiresAtEpochSeconds > readEpochSeconds(this.nowEpochSeconds)
      ) {
        return
      }
    } else if (source.accessToken !== rejectedAccessToken) {
      return
    }

    /** @brief 可复用的同世代单飞任务 / Reusable single flight for the same generation. */
    const existing = this.refreshFlight
    if (
      existing !== null &&
      existing.generation === this.generation &&
      existing.source === source
    ) {
      await existing.promise
      return
    }
    /** @brief 本 refresh 持有的世代 / Generation owned by this refresh. */
    const generation = this.generation
    /** @brief leader 拥有的总截止信号 / Total deadline signal owned by the leader. */
    const operationSignal = deadlineSignal(signal, REFRESH_TIMEOUT_MILLISECONDS)
    /** @brief 与会话提交分离的已验证轮换 / Validated rotation separated from session commit. */
    const rotation = this.requestRefreshRotation(source, operationSignal)
    /** @brief 包含磁盘与内存原子边界的提交任务 / Commit operation spanning disk and memory boundaries. */
    const operation = this.commitRefreshRotation(generation, source, rotation, operationSignal)
    this.refreshFlight = { generation, promise: operation, rotation, source }
    /** @brief 仅清除仍指向本任务的单飞槽 / Clear the flight slot only while it still references this operation. */
    const clearFlight = (): void => {
      if (this.refreshFlight?.promise === operation) this.refreshFlight = null
    }
    void operation.then(clearFlight, clearFlight)
    await operation
  }

  /**
   * @brief 请求并验证一次 Refresh Token 强制轮换 / Request and validate one mandatory Refresh Token rotation.
   * @param source 发起状态 / Source state.
   * @param signal 硬截止信号 / Hard-deadline signal.
   * @return 尚未持久化的轮换 / Rotation not yet persisted.
   */
  private async requestRefreshRotation(
    source: NativeSessionState,
    signal: AbortSignal
  ): Promise<NativeRefreshRotation> {
    /** @brief 严格 refresh response / Strict refresh response. */
    const response = await exchangeRefreshToken(
      source.refreshToken,
      source.clientId,
      this.fetchImpl,
      signal
    )
    try {
      /** @brief 新授予 scopes / Newly granted scopes. */
      const scopes = parseGrantedScopes(response.scope)
      if (
        response.refreshToken === source.refreshToken ||
        scopes.some((scope) => !source.scopes.includes(scope)) ||
        !scopes.includes('openid') ||
        !scopes.includes('offline_access')
      ) {
        throw new NativeOAuthSessionError(
          'The native OAuth refresh response did not safely rotate the prior grant.'
        )
      }
      await verifyRefreshIdToken({
        idToken: response.idToken,
        nowEpochSeconds: this.nowEpochSeconds,
        priorIdentity: source.identity,
        signal,
        verificationContext: source.verificationContext,
        verifier: this.idTokenVerifier
      })
      /** @brief 新完整长期授权 / New complete long-lived grant. */
      const grant = freezeGrant({
        clientId: source.clientId,
        identity: source.identity,
        refreshToken: response.refreshToken,
        scopes,
        verificationContext: source.verificationContext
      })
      return Object.freeze({
        accessToken: response.accessToken,
        expiresAtEpochSeconds: readEpochSeconds(this.nowEpochSeconds) + response.expiresInSeconds,
        grant
      })
    } catch (error: unknown) {
      await this.bestEffortRevoke(response.refreshToken, source.clientId)
      throw error
    }
  }

  /**
   * @brief 仅在原世代仍有效时持久化并提交轮换 / Persist and commit a rotation only while its original generation remains current.
   * @param generation 发起世代 / Starting generation.
   * @param source 发起状态 / Starting state.
   * @param rotation 已验证网络轮换 / Validated network rotation.
   * @param signal 硬截止信号 / Hard-deadline signal.
   */
  private async commitRefreshRotation(
    generation: number,
    source: NativeSessionState,
    rotation: Promise<NativeRefreshRotation>,
    signal: AbortSignal
  ): Promise<void> {
    /** @brief 服务端可能已签发、但本地尚未取得提交权的新凭据 / New credentials potentially issued by the server without local commit ownership. */
    let next: NativeRefreshRotation | null = null
    try {
      /** @brief 已完整验证的下一代凭据 / Fully validated next-generation credentials. */
      const validated = await rotation
      next = validated
      await this.enqueuePersistence(async (): Promise<void> => {
        if (!this.owns(generation, source) || signal.aborted) {
          throw new NativeOAuthSessionError('The native OAuth refresh is no longer current.')
        }
        await this.grantStore.replace(validated.grant)
      })
      if (!this.owns(generation, source) || signal.aborted) {
        throw new NativeOAuthSessionError('The native OAuth refresh is no longer current.')
      }
      this.state = Object.freeze({
        ...validated.grant,
        accessToken: validated.accessToken,
        expiresAtEpochSeconds: validated.expiresAtEpochSeconds
      })
    } catch (error: unknown) {
      if (this.owns(generation, source)) {
        this.advanceGeneration()
        this.state = null
        this.refreshFlight = null
        await this.enqueuePersistence(() => this.grantStore.clear()).catch(() => undefined)
      }
      if (next !== null) await this.bestEffortRevoke(next.grant.refreshToken, next.grant.clientId)
      throw error
    }
  }

  /**
   * @brief 先清本地会话，再尽力撤销最新 Refresh Token / Clear the local session first, then best-effort revoke the newest Refresh Token.
   */
  async signOut(): Promise<void> {
    this.assertActive()
    this.lifecycle = 'signing-out'
    /** @brief 清理前当前状态 / Current state before clearing. */
    const source = this.state
    /** @brief 与当前状态匹配的进行中轮换 / In-flight rotation matching the current state. */
    const rotation =
      source !== null &&
      this.refreshFlight?.generation === this.generation &&
      this.refreshFlight.source === source
        ? this.refreshFlight.rotation
        : null
    this.advanceGeneration()
    this.state = null
    this.refreshFlight = null
    /** @brief 本地持久删除失败；撤销结束后再上报 / Local durable-clear failure reported only after revocation finishes. */
    let clearError: unknown
    try {
      await this.enqueuePersistence(() => this.grantStore.clear())
    } catch (error: unknown) {
      clearError = error
    }
    if (source === null) {
      this.lifecycle = 'active'
      if (clearError !== undefined) {
        throw clearError instanceof Error
          ? clearError
          : new NativeOAuthSessionError('The native OAuth grant could not be cleared.')
      }
      return
    }
    /** @brief 优先使用成功轮换后的最新 Refresh Token / Prefer the newest Refresh Token after a successful rotation. */
    let refreshToken = source.refreshToken
    if (rotation !== null) {
      try {
        refreshToken = (await rotation).grant.refreshToken
      } catch {
        // Ambiguous rotation leaves only the source token available for best-effort revocation.
      }
    }
    await this.bestEffortRevoke(refreshToken, source.clientId)
    this.lifecycle = 'active'
    if (clearError !== undefined) {
      throw clearError instanceof Error
        ? clearError
        : new NativeOAuthSessionError('The native OAuth grant could not be cleared.')
    }
  }

  /**
   * @brief 等待网络轮换与磁盘提交静止后清除 Access Token 内存 / Quiesce rotations and persistence before clearing Access Token memory.
   * @return 幂等关闭任务 / Idempotent shutdown operation.
   */
  shutdown(): Promise<void> {
    if (this.shutdownFlight !== null) return this.shutdownFlight
    if (this.lifecycle !== 'active') {
      return Promise.reject(
        new NativeOAuthSessionError(
          'The native OAuth session cannot shut down during a transition.'
        )
      )
    }
    this.lifecycle = 'shutting-down'
    /** @brief 等待轮换与持久化静止后再清内存的关闭任务 / Shutdown task clearing memory only after rotations and persistence quiesce. */
    const operation = (async (): Promise<void> => {
      /** @brief 关闭开始时已有的 refresh / Refresh already active when shutdown begins. */
      const refresh = this.refreshFlight?.promise
      if (refresh !== undefined) await refresh.catch(() => undefined)
      await this.persistenceTail
      /** @brief 已完成最新持久化的当前授权 / Current grant after latest persistence completes. */
      const source = this.state
      this.advanceGeneration()
      this.refreshFlight = null
      this.state =
        source === null
          ? null
          : Object.freeze({
              ...source,
              accessToken: null,
              expiresAtEpochSeconds: 0
            })
      this.lifecycle = 'closed'
    })()
    this.shutdownFlight = operation
    /** @brief 关闭失败时恢复可重试生命周期 / Restore a retryable lifecycle after shutdown failure. */
    const releaseRejectedShutdown = (): void => {
      if (this.shutdownFlight !== operation) return
      this.shutdownFlight = null
      if (this.lifecycle === 'shutting-down') this.lifecycle = 'active'
    }
    void operation.then(undefined, releaseRejectedShutdown)
    return operation
  }
}
