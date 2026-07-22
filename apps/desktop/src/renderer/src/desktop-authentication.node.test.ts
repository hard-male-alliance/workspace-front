import { describe, expect, it, vi } from 'vitest'
import type {
  DesktopAuthenticatedSession,
  DesktopAuthenticationBridge,
  DesktopAuthenticationResult
} from '@ai-job-workspace/platform'

import { createDesktopApiV2Authentication } from './desktop-authentication'

/**
 * @brief 创建短期测试会话 / Create a short-lived test session.
 * @param accessToken Access Token / Access Token.
 * @return 已认证会话 / Authenticated session.
 */
function session(accessToken: string): DesktopAuthenticatedSession {
  return {
    accessToken,
    expiresAtEpochSeconds: 20_000,
    kind: 'authenticated',
    scopes: ['openid', 'offline_access', 'workspace.read'],
    subject: 'subject-1'
  }
}

/**
 * @brief 创建可手动兑现的 Promise / Create a manually resolvable Promise.
 * @return promise 与 resolve / Promise and resolver.
 */
function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  /** @brief Promise resolver / Promise 兑现器. */
  let resolvePromise: ((value: T) => void) | undefined
  /** @brief 待兑现 Promise / Promise awaiting resolution. */
  const promise = new Promise<T>((resolve): void => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value: T): void => {
      if (resolvePromise === undefined) throw new Error('Deferred resolver is unavailable.')
      resolvePromise(value)
    }
  }
}

/**
 * @brief 创建测试 bridge / Create a test bridge.
 * @param refresh Refresh 实现 / Refresh implementation.
 * @param signOut 可替换登出实现 / Optional sign-out implementation.
 * @return 完整认证 bridge / Complete authentication bridge.
 */
function bridge(
  refresh: DesktopAuthenticationBridge['refresh'],
  signOut: DesktopAuthenticationBridge['signOut'] = (): Promise<DesktopAuthenticationResult> =>
    Promise.resolve({ kind: 'success', session: { kind: 'anonymous' } })
): DesktopAuthenticationBridge {
  return {
    authorize: (): Promise<DesktopAuthenticationResult> =>
      Promise.resolve({ kind: 'success', session: { kind: 'anonymous' } }),
    getSession: (): Promise<DesktopAuthenticationResult> =>
      Promise.resolve({ kind: 'success', session: { kind: 'anonymous' } }),
    refresh,
    signOut
  }
}

describe('createDesktopApiV2Authentication', (): void => {
  it('对同一 401 observation 只发一次 main refresh IPC', async (): Promise<void> => {
    /** @brief 手动控制的 IPC 结果 / Manually controlled IPC result. */
    const result = deferred<DesktopAuthenticationResult>()
    /** @brief refresh IPC spy / Refresh IPC spy. */
    const refresh = vi.fn(() => result.promise)
    /** @brief 初始 Access Token / Initial Access Token. */
    const initialToken = 'access-token-before-refresh-0000'
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createDesktopApiV2Authentication({
      bridge: bridge(refresh),
      initialSession: session(initialToken),
      nowEpochSeconds: () => 12_000,
      onAuthenticationLost: vi.fn()
    })
    /** @brief 两个独立 HTTP 调用信号 / Signals for two independent HTTP calls. */
    const firstSignal = new AbortController().signal
    const secondSignal = new AbortController().signal

    /** @brief 两个并发恢复等待 / Two concurrent recovery waits. */
    const first = authentication.refreshAccessToken({
      rejectedAccessToken: initialToken,
      signal: firstSignal
    })
    const second = authentication.refreshAccessToken({
      rejectedAccessToken: initialToken,
      signal: secondSignal
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    result.resolve({
      kind: 'success',
      session: session('access-token-after-refresh-00000')
    })

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(authentication.getAccessToken()).toBe('access-token-after-refresh-00000')
  })

  it('refresh 失败时清 renderer 内存并只通知登录页一次', async (): Promise<void> => {
    /** @brief 身份丢失 spy / Authentication-loss spy. */
    const onAuthenticationLost = vi.fn()
    /** @brief main 返回的安全失败 / Safe failure returned by main. */
    const refresh = vi.fn((): Promise<DesktopAuthenticationResult> =>
      Promise.resolve({
        kind: 'failure',
        reason: 'failed'
      })
    )
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createDesktopApiV2Authentication({
      bridge: bridge(refresh),
      initialSession: session('access-token-before-failure-000'),
      nowEpochSeconds: () => 12_000,
      onAuthenticationLost
    })

    await expect(
      authentication.refreshAccessToken({
        rejectedAccessToken: 'access-token-before-failure-000',
        signal: new AbortController().signal
      })
    ).rejects.toThrow()
    expect(authentication.getAccessToken()).toBeNull()
    expect(onAuthenticationLost).toHaveBeenCalledTimes(1)
  })

  it('显式登出同步清 Access Token，且迟到 refresh 不能恢复它', async (): Promise<void> => {
    /** @brief 可手动兑现的 refresh / Manually resolvable refresh. */
    const result = deferred<DesktopAuthenticationResult>()
    /** @brief 初始 token / Initial token. */
    const initialToken = 'access-token-before-sign-out-000'
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createDesktopApiV2Authentication({
      bridge: bridge(() => result.promise),
      initialSession: session(initialToken),
      nowEpochSeconds: () => 12_000,
      onAuthenticationLost: vi.fn()
    })
    /** @brief 登出前已发起的 refresh / Refresh started before sign-out. */
    const refresh = authentication.refreshAccessToken({
      rejectedAccessToken: initialToken,
      signal: new AbortController().signal
    })

    authentication.clearAccessToken()
    expect(authentication.getAccessToken()).toBeNull()
    result.resolve({
      kind: 'success',
      session: session('access-token-arriving-after-sign-out')
    })

    await expect(refresh).resolves.toBeUndefined()
    expect(authentication.getAccessToken()).toBeNull()
  })

  it('second-401 的 fire-and-forget 登出会观察 bridge rejection', async (): Promise<void> => {
    /** @brief 拒绝的登出 bridge / Rejecting sign-out bridge. */
    const signOut = vi.fn((): Promise<DesktopAuthenticationResult> =>
      Promise.reject(new Error('injected transport rejection'))
    )
    /** @brief 当前 token / Current token. */
    const accessToken = 'access-token-invalidated-by-server'
    /** @brief 待测认证端口 / Authentication port under test. */
    const authentication = createDesktopApiV2Authentication({
      bridge: bridge((): Promise<never> => Promise.reject(new Error('not used')), signOut),
      initialSession: session(accessToken),
      nowEpochSeconds: () => 12_000,
      onAuthenticationLost: vi.fn()
    })

    authentication.invalidateAccessToken(accessToken)
    await Promise.resolve()
    expect(authentication.getAccessToken()).toBeNull()
    expect(signOut).toHaveBeenCalledOnce()
  })
})
