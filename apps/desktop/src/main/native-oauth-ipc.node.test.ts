/** @file Native OAuth IPC sender 与参数封闭性测试 / Native OAuth IPC sender and argument-closure tests. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_AUTH_AUTHORIZE_CHANNEL,
  DESKTOP_AUTH_GET_SESSION_CHANNEL,
  DESKTOP_AUTH_REFRESH_CHANNEL,
  DESKTOP_AUTH_SIGN_OUT_CHANNEL
} from '@ai-job-workspace/platform'

import type { IpcSenderEvent } from './ipc-sender'
import type { NativeOAuthControllerSession } from './native-oauth-ipc'
import type { NativeOAuthSessionProjection } from './native-oauth-session'

/** @brief 测试 IPC handler 形状 / Test IPC-handler shape. */
type TestIpcHandler = (event: IpcSenderEvent, ...arguments_: unknown[]) => unknown

/** @brief Electron module mock / Electron module mock. */
const electron = vi.hoisted(() => {
  /** @brief 已注册 handlers / Registered handlers. */
  const handlers = new Map<string, TestIpcHandler>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: TestIpcHandler): void => {
      handlers.set(channel, handler)
    }),
    openExternal: vi.fn((): Promise<void> => Promise.resolve()),
    removeHandler: vi.fn((channel: string): void => {
      handlers.delete(channel)
    })
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: electron.handle,
    removeHandler: electron.removeHandler
  },
  shell: { openExternal: electron.openExternal }
}))

import { NativeOAuthController, registerNativeOAuthHandlers } from './native-oauth-ipc'
import { DESKTOP_OAUTH_SCOPES } from './native-oauth-config'
import { NativeSecureStorageUnavailableError } from './native-oauth-secure-store'

/** @brief 当前可信 renderer / Current trusted renderer. */
const trustedRenderer = {
  rendererUrl: 'ai-job-workspace://renderer/index.html',
  webContentsId: 42
}

/** @brief 可信主 frame event / Trusted main-frame event. */
const trustedEvent: IpcSenderEvent = {
  sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
  senderFrame: {
    frameTreeNodeId: 7,
    url: 'ai-job-workspace://renderer/index.html'
  }
}

/** @brief 不可信 renderer event / Untrusted renderer event. */
const untrustedEvent: IpcSenderEvent = {
  sender: { id: 99, mainFrame: { frameTreeNodeId: 7 } },
  senderFrame: {
    frameTreeNodeId: 7,
    url: 'https://attacker.invalid/'
  }
}

/** @brief 不持有 token 的 controller session / Controller session holding no token. */
const anonymousSession: NativeOAuthControllerSession = {
  beginAuthorization: (): Promise<never> => Promise.reject(new Error('not used')),
  cancelAuthorization: (): Promise<void> => Promise.resolve(),
  getProjection: () => null,
  refresh: (): Promise<never> => Promise.reject(new Error('not used')),
  shutdown: (): Promise<void> => Promise.resolve(),
  signOut: (): Promise<void> => Promise.resolve()
}

/** @brief 为当前测试注册匿名 controller / Register an anonymous controller for the current test. */
function registerAnonymousController(): void {
  /** @brief 待测 controller / Controller under test. */
  const controller = new NativeOAuthController({
    configuration: {
      clientId: 'desktop-client',
      scopes: [
        'openid',
        'profile',
        'offline_access',
        'workspace.read',
        'resume.read',
        'resume.write'
      ]
    },
    session: anonymousSession
  })
  registerNativeOAuthHandlers(controller, () => trustedRenderer)
}

describe('native OAuth IPC boundary', (): void => {
  beforeEach((): void => {
    electron.handlers.clear()
    registerAnonymousController()
  })

  it('四个 handler 均验证当前可信主 frame 与精确参数个数', (): void => {
    /** @brief 每个通道及其合法参数 / Every channel and its valid arguments. */
    const invocations = [
      [DESKTOP_AUTH_GET_SESSION_CHANNEL, []],
      [DESKTOP_AUTH_AUTHORIZE_CHANNEL, ['login']],
      [DESKTOP_AUTH_REFRESH_CHANNEL, [null]],
      [DESKTOP_AUTH_SIGN_OUT_CHANNEL, []]
    ] as const
    expect(electron.handlers.size).toBe(4)
    for (const [channel, arguments_] of invocations) {
      /** @brief 当前通道 handler / Handler for the current channel. */
      const handler = electron.handlers.get(channel)
      if (handler === undefined) throw new Error(`Missing test handler for ${channel}.`)
      expect(() => handler(untrustedEvent, ...arguments_)).toThrow(
        'Rejected authentication request from an untrusted renderer.'
      )
      expect(() => handler(trustedEvent, ...arguments_, 'extra')).toThrow(
        'Rejected authentication request from an untrusted renderer.'
      )
    }
  })

  it('可信 handler 只接受封闭 screen hint 与 string-or-null observation', (): void => {
    /** @brief 已注册 authorize handler / Registered authorize handler. */
    const authorize = electron.handlers.get(DESKTOP_AUTH_AUTHORIZE_CHANNEL)
    /** @brief 已注册 refresh handler / Registered refresh handler. */
    const refresh = electron.handlers.get(DESKTOP_AUTH_REFRESH_CHANNEL)
    /** @brief 已注册 session handler / Registered session handler. */
    const getSession = electron.handlers.get(DESKTOP_AUTH_GET_SESSION_CHANNEL)
    if (authorize === undefined || refresh === undefined || getSession === undefined) {
      throw new Error('Native OAuth handlers were not registered by the preceding setup.')
    }

    expect(() => authorize(trustedEvent, 'password')).toThrow(
      'Rejected invalid native OAuth screen hint.'
    )
    expect(() => refresh(trustedEvent, { token: 'secret' })).toThrow(
      'Rejected invalid Access Token observation.'
    )
    expect(getSession(trustedEvent)).toEqual({
      kind: 'success',
      session: { kind: 'anonymous' }
    })
  })
})

/** @brief 控制器测试配置 / Controller test configuration. */
const controllerConfiguration = {
  clientId: 'desktop-client',
  scopes: DESKTOP_OAUTH_SCOPES
} as const

/**
 * @brief 创建可手动兑现的 Promise / Create a manually resolvable Promise.
 * @return promise 与 resolver / Promise and resolver.
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
 * @brief 创建可观察的匿名会话 / Create an observable anonymous session.
 * @return session 与生命周期 spies / Session and lifecycle spies.
 */
function createObservableSession() {
  /** @brief 放弃授权 spy / Authorization-cancellation spy. */
  const cancelAuthorization = vi.fn((): Promise<void> => Promise.resolve())
  /** @brief 关闭 spy / Shutdown spy. */
  const shutdown = vi.fn((): Promise<void> => Promise.resolve())
  /** @brief 登出 spy / Sign-out spy. */
  const signOut = vi.fn((): Promise<void> => Promise.resolve())
  return {
    cancelAuthorization,
    session: {
      beginAuthorization: (): Promise<{ readonly installGrant: () => Promise<void> }> =>
        Promise.resolve({ installGrant: (): Promise<void> => Promise.resolve() }),
      cancelAuthorization,
      getProjection: () => null,
      refresh: (): Promise<void> => Promise.resolve(),
      shutdown,
      signOut
    },
    shutdown,
    signOut
  }
}

describe('NativeOAuthController lifecycle', (): void => {
  it('成功重新授权后才恢复受保护操作', async (): Promise<void> => {
    /** @brief 授权后安装的投影 / Projection installed after authorization. */
    let currentProjection: NativeOAuthSessionProjection | null = null
    /** @brief 恢复 spy / Resume spy. */
    const resume = vi.fn()
    /** @brief 授权时安装投影的测试会话 / Test session installing a projection during authorization. */
    const session: NativeOAuthControllerSession = {
      beginAuthorization: (): Promise<{ readonly installGrant: () => Promise<void> }> =>
        Promise.resolve({ installGrant: (): Promise<void> => Promise.resolve() }),
      cancelAuthorization: (): Promise<void> => Promise.resolve(),
      getProjection: (): NativeOAuthSessionProjection | null => currentProjection,
      refresh: (): Promise<void> => Promise.resolve(),
      shutdown: (): Promise<void> => Promise.resolve(),
      signOut: (): Promise<void> => Promise.resolve()
    }
    /** @brief 待测控制器 / Controller under test. */
    const controller = new NativeOAuthController({
      authorize: (): Promise<void> => {
        currentProjection = {
          accessToken: 'access-token-after-authorization',
          expiresAtEpochSeconds: 4_000_000_000,
          scopes: ['openid', 'offline_access'],
          subject: 'subject_01JEXAMPLE'
        }
        return Promise.resolve()
      },
      configuration: controllerConfiguration,
      fetchDiscovery: (): Promise<never> => Promise.resolve({} as never),
      protectedOperations: {
        closeAndQuiesce: (): Promise<void> => Promise.resolve(),
        resume,
        suspendAndQuiesce: (): Promise<void> => Promise.resolve()
      },
      session
    })

    await expect(controller.authorize('login')).resolves.toMatchObject({ kind: 'success' })
    expect(resume).toHaveBeenCalledOnce()
  })

  it('登出先静止 main-only 受保护操作再清 native 会话', async (): Promise<void> => {
    /** @brief 生命周期调用顺序 / Lifecycle call order. */
    const order: string[] = []
    /** @brief 可观察会话 / Observable session. */
    const observed = createObservableSession()
    observed.signOut.mockImplementation((): Promise<void> => {
      order.push('session-sign-out')
      return Promise.resolve()
    })
    /** @brief 待测控制器 / Controller under test. */
    const controller = new NativeOAuthController({
      configuration: controllerConfiguration,
      protectedOperations: {
        closeAndQuiesce: (): Promise<void> => Promise.resolve(),
        resume: (): void => undefined,
        suspendAndQuiesce: (): Promise<void> => {
          order.push('artifact-quiesced')
          return Promise.resolve()
        }
      },
      session: observed.session
    })

    await expect(controller.signOut()).resolves.toEqual({
      kind: 'success',
      session: { kind: 'anonymous' }
    })
    expect(order).toEqual(['artifact-quiesced', 'session-sign-out'])
  })

  it('应用退出先永久关闭受保护操作再 shutdown native 会话', async (): Promise<void> => {
    /** @brief 生命周期调用顺序 / Lifecycle call order. */
    const order: string[] = []
    /** @brief 可观察会话 / Observable session. */
    const observed = createObservableSession()
    observed.shutdown.mockImplementation((): Promise<void> => {
      order.push('session-shutdown')
      return Promise.resolve()
    })
    /** @brief 待测控制器 / Controller under test. */
    const controller = new NativeOAuthController({
      configuration: controllerConfiguration,
      protectedOperations: {
        closeAndQuiesce: (): Promise<void> => {
          order.push('artifact-closed')
          return Promise.resolve()
        },
        resume: (): void => undefined,
        suspendAndQuiesce: (): Promise<void> => Promise.resolve()
      },
      session: observed.session
    })

    await expect(controller.dispose()).resolves.toBeUndefined()
    expect(order).toEqual(['artifact-closed', 'session-shutdown'])
  })

  it('把启动期安全存储不可用显式投影给 renderer', (): void => {
    /** @brief 可观察匿名会话 / Observable anonymous session. */
    const { session } = createObservableSession()
    /** @brief 带恢复失败的 controller / Controller carrying a restoration failure. */
    const controller = new NativeOAuthController({
      configuration: controllerConfiguration,
      initialFailureReason: 'secure-storage-unavailable',
      session
    })

    expect(controller.getSession()).toEqual({
      kind: 'failure',
      reason: 'secure-storage-unavailable'
    })
  })

  it.each([
    [new NativeSecureStorageUnavailableError(), 'secure-storage-unavailable'],
    [
      new NativeSecureStorageUnavailableError('persistent-login-unsupported'),
      'persistent-login-unsupported'
    ],
    [new DOMException('User cancelled.', 'AbortError'), 'cancelled']
  ] as const)('交互授权保留低基数失败语义 %#', async (error, reason): Promise<void> => {
    /** @brief 在 preflight 失败的会话 / Session failing during authorization preflight. */
    const observed = createObservableSession()
    observed.session.beginAuthorization = (): Promise<never> => Promise.reject(error)
    /** @brief 待测 controller / Controller under test. */
    const controller = new NativeOAuthController({
      configuration: controllerConfiguration,
      session: observed.session
    })

    await expect(controller.authorize('login')).resolves.toEqual({ kind: 'failure', reason })
  })

  it('整轮授权总截止会取消未完成流程并放弃授权世代', async (): Promise<void> => {
    /** @brief 可观察匿名会话 / Observable anonymous session. */
    const { cancelAuthorization, session } = createObservableSession()
    /** @brief 故意忽略 signal 且永不结束的 discovery / Discovery operation deliberately ignoring its signal and never finishing. */
    const fetchDiscovery = vi.fn((): Promise<never> => new Promise((): void => undefined))
    /** @brief 测试捕获的截止动作 / Deadline action captured by the test. */
    let expire: (() => void) | undefined
    /** @brief 测试总截止调度器 / Test total-deadline scheduler. */
    const scheduleAuthorizationDeadline = vi.fn(
      (scheduledExpire: () => void, timeoutMilliseconds: number): (() => void) => {
        expect(timeoutMilliseconds).toBe(10)
        expire = scheduledExpire
        return vi.fn()
      }
    )
    /** @brief 极短总截止的 controller / Controller with a short total deadline. */
    const controller = new NativeOAuthController({
      authorizationTimeoutMilliseconds: 10,
      configuration: controllerConfiguration,
      fetchDiscovery,
      scheduleAuthorizationDeadline,
      session
    })

    /** @brief 受总截止保护的授权任务 / Authorization operation protected by the total deadline. */
    const authorization = controller.authorize('login')
    if (expire === undefined) throw new Error('Controller did not schedule its total deadline.')
    expire()
    await expect(authorization).resolves.toEqual({
      kind: 'failure',
      reason: 'failed'
    })
    expect(cancelAuthorization).toHaveBeenCalledTimes(1)
  })

  it('dispose 先取消并等待授权终态，再关闭 session', async (): Promise<void> => {
    /** @brief 生命周期调用顺序 / Lifecycle call order. */
    const order: string[] = []
    /** @brief 可观察匿名会话 / Observable anonymous session. */
    const observed = createObservableSession()
    observed.cancelAuthorization.mockImplementation((): Promise<void> => {
      order.push('cancel-authorization')
      return Promise.resolve()
    })
    observed.shutdown.mockImplementation((): Promise<void> => {
      order.push('shutdown')
      return Promise.resolve()
    })
    /** @brief 仅在取消时结束的 authorization runner / Authorization runner ending only when aborted. */
    const authorize = vi.fn(
      (_command, _installer, signal?: AbortSignal): Promise<void> =>
        new Promise((_resolve, reject): void => {
          signal?.addEventListener(
            'abort',
            (): void => {
              order.push('authorization-aborted')
              reject(new DOMException('Cancelled', 'AbortError'))
            },
            { once: true }
          )
        })
    )
    /** @brief 待测 controller / Controller under test. */
    const controller = new NativeOAuthController({
      authorize,
      configuration: controllerConfiguration,
      fetchDiscovery: (): Promise<never> => Promise.resolve({} as never),
      session: observed.session
    })
    /** @brief 进行中的授权 / In-flight authorization. */
    const authorization = controller.authorize('login')
    await vi.waitFor((): void => expect(authorize).toHaveBeenCalledTimes(1))

    await expect(controller.dispose()).resolves.toBeUndefined()
    await expect(authorization).resolves.toEqual({ kind: 'failure', reason: 'cancelled' })
    expect(order).toEqual(['authorization-aborted', 'cancel-authorization', 'shutdown'])
  })

  it('dispose 等待忽略 AbortSignal 的底层授权任务真正静止', async (): Promise<void> => {
    /** @brief 忽略取消的 discovery / Discovery operation ignoring cancellation. */
    const discovery = deferred<never>()
    /** @brief 可观察会话 / Observable session. */
    const observed = createObservableSession()
    /** @brief 测试截止动作 / Captured deadline action. */
    let expire: (() => void) | undefined
    /** @brief 待测 controller / Controller under test. */
    const controller = new NativeOAuthController({
      authorizationTimeoutMilliseconds: 10,
      configuration: controllerConfiguration,
      fetchDiscovery: (): Promise<never> => discovery.promise,
      scheduleAuthorizationDeadline: (scheduledExpire): (() => void) => {
        expire = scheduledExpire
        return (): void => undefined
      },
      session: observed.session
    })

    /** @brief 受截止保护的 renderer 结果 / Renderer result protected by the deadline. */
    const authorization = controller.authorize('login')
    await vi.waitFor((): void => expect(expire).toBeTypeOf('function'))
    expire?.()
    await expect(authorization).resolves.toEqual({ kind: 'failure', reason: 'failed' })

    /** @brief 应等待底层任务的关闭 / Disposal that must wait for the underlying task. */
    const disposal = controller.dispose()
    await Promise.resolve()
    expect(observed.shutdown).not.toHaveBeenCalled()

    discovery.resolve({} as never)
    await expect(disposal).resolves.toBeUndefined()
    expect(observed.shutdown).toHaveBeenCalledOnce()
  })

  it('dispose 失败后释放单飞槽并允许重试', async (): Promise<void> => {
    /** @brief 首次关闭失败的会话 / Session whose first shutdown fails. */
    const observed = createObservableSession()
    observed.shutdown
      .mockRejectedValueOnce(new Error('injected shutdown failure'))
      .mockResolvedValueOnce(undefined)
    /** @brief 待测 controller / Controller under test. */
    const controller = new NativeOAuthController({
      configuration: controllerConfiguration,
      session: observed.session
    })

    await expect(controller.dispose()).rejects.toThrow('injected shutdown failure')
    await expect(controller.dispose()).resolves.toBeUndefined()
    expect(observed.shutdown).toHaveBeenCalledTimes(2)
  })
})
