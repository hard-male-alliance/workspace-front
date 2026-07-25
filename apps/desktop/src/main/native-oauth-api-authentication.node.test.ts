/** @file Electron main Artifact OAuth 适配测试 / Tests for the Electron-main Artifact OAuth adapter. */

import { describe, expect, it, vi } from 'vitest'
import { ApiV2NetworkError } from '@ai-job-workspace/product-api-v2'

import { createNativeArtifactAuthentication } from './native-oauth-api-authentication'
import type { NativeArtifactAuthenticationSession } from './native-oauth-api-authentication'
import type { NativeOAuthSessionProjection } from './native-oauth-session'

/** @brief 测试用 Access Token A / Test Access Token A. */
const TOKEN_A = 'access-token-aaaaaaaaaaaaaaaaaaaa'

/** @brief 测试用 Access Token B / Test Access Token B. */
const TOKEN_B = 'access-token-bbbbbbbbbbbbbbbbbbbb'

/**
 * @brief 创建可变的最小 native 会话 / Create a mutable minimal native session.
 * @param initial 初始投影 / Initial projection.
 * @return 会话、刷新 spy 与投影写入器 / Session, refresh spy, and projection setter.
 */
function createSession(initial: NativeOAuthSessionProjection | null) {
  /** @brief 当前投影 / Current projection. */
  let current = initial
  /** @brief 可观察 refresh / Observable refresh. */
  const refresh = vi.fn<NativeArtifactAuthenticationSession['refresh']>(() => Promise.resolve())
  /** @brief 条件失效 spy / Conditional-invalidation spy. */
  const invalidateAccessToken = vi.fn((rejectedAccessToken: string): void => {
    if (current?.accessToken === rejectedAccessToken) current = null
  })
  return {
    invalidateAccessToken,
    refresh,
    session: {
      getProjection: (): NativeOAuthSessionProjection | null => current,
      invalidateAccessToken,
      refresh
    } satisfies NativeArtifactAuthenticationSession,
    setProjection: (next: NativeOAuthSessionProjection | null): void => {
      current = next
    }
  }
}

/**
 * @brief 创建测试投影 / Create a test projection.
 * @param accessToken Access Token.
 * @return 完整 main-only 投影 / Complete main-only projection.
 */
function projection(accessToken: string): NativeOAuthSessionProjection {
  return {
    accessToken,
    expiresAtEpochSeconds: 4_000_000_000,
    scopes: ['openid', 'offline_access', 'artifact.read'],
    subject: 'subject-01JEXAMPLE'
  }
}

describe('createNativeArtifactAuthentication', (): void => {
  it('只读取 main 会话并把 401 观察委托给 native refresh', async (): Promise<void> => {
    /** @brief 初始已认证会话 / Initially authenticated session. */
    const observed = createSession(projection(TOKEN_A))
    observed.refresh.mockImplementation((rejectedAccessToken): Promise<void> => {
      expect(rejectedAccessToken).toBe(TOKEN_A)
      observed.setProjection(projection(TOKEN_B))
      return Promise.resolve()
    })
    /** @brief 不应触发的清理 / Cleanup that must not run. */
    const onAuthenticationRejected = vi.fn()
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createNativeArtifactAuthentication({
      onAuthenticationRejected,
      session: observed.session
    })

    expect(authentication.getAccessToken()).toBe(TOKEN_A)
    await authentication.refreshAccessToken({
      rejectedAccessToken: TOKEN_A,
      signal: new AbortController().signal
    })
    expect(authentication.getAccessToken()).toBe(TOKEN_B)
    expect(observed.refresh).toHaveBeenCalledOnce()
    expect(onAuthenticationRejected).not.toHaveBeenCalled()
  })

  it('取消单个等待者但不把调用方 signal 交给共享 native refresh', async (): Promise<void> => {
    /** @brief 手动控制的 refresh 兑现器 / Manually controlled refresh resolver. */
    let resolveRefresh: (() => void) | undefined
    /** @brief 长时间运行的共享 refresh / Long-running shared refresh. */
    const refreshOperation = new Promise<void>((resolve): void => {
      resolveRefresh = resolve
    })
    /** @brief 当前会话 / Current session. */
    const observed = createSession(projection(TOKEN_A))
    observed.refresh.mockReturnValue(refreshOperation)
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createNativeArtifactAuthentication({
      onAuthenticationRejected: vi.fn(),
      session: observed.session
    })
    /** @brief 当前 HTTP 观察者取消器 / Abort controller for the current HTTP observer. */
    const abort = new AbortController()
    /** @brief 当前观察者等待 / Current observer wait. */
    const observation = authentication.refreshAccessToken({
      rejectedAccessToken: TOKEN_A,
      signal: abort.signal
    })
    abort.abort()

    await expect(observation).rejects.toBeInstanceOf(ApiV2NetworkError)
    expect(observed.refresh).toHaveBeenCalledWith(TOKEN_A)
    resolveRefresh?.()
    await refreshOperation
  })

  it('只让当前 token 的二次 401 失效，并至多请求一次宿主清理', (): void => {
    /** @brief 当前会话 / Current session. */
    const observed = createSession(projection(TOKEN_A))
    /** @brief 宿主安全清理 spy / Host safe-cleanup spy. */
    const onAuthenticationRejected = vi.fn()
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createNativeArtifactAuthentication({
      onAuthenticationRejected,
      session: observed.session
    })

    authentication.invalidateAccessToken('late-access-token-cccccccccccc')
    expect(authentication.getAccessToken()).toBe(TOKEN_A)
    authentication.invalidateAccessToken(TOKEN_A)
    authentication.invalidateAccessToken(TOKEN_A)

    expect(authentication.getAccessToken()).toBeNull()
    expect(observed.invalidateAccessToken).toHaveBeenCalledOnce()
    expect(onAuthenticationRejected).toHaveBeenCalledOnce()
  })
})
