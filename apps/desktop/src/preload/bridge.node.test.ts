import { describe, expect, it, vi } from 'vitest'

import {
  DESKTOP_AUTH_AUTHORIZE_CHANNEL,
  DESKTOP_AUTH_GET_SESSION_CHANNEL,
  DESKTOP_AUTH_REFRESH_CHANNEL,
  DESKTOP_AUTH_SIGN_OUT_CHANNEL,
  RUNTIME_INFO_CHANNEL
} from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'
import type { DesktopNoArgumentInvoker, DesktopStringArgumentInvoker } from './bridge'

describe('createDesktopPlatformBridge', () => {
  it('只经固定通道请求运行时信息与认证动作', async () => {
    /** @brief 无参数白名单 IPC mock / Argument-free allowlisted IPC mock. */
    const invokeWithoutArgument = vi.fn<DesktopNoArgumentInvoker>((channel) =>
      Promise.resolve(
        channel === RUNTIME_INFO_CHANNEL
          ? {
              apiBaseUrl: 'https://api.example.test',
              appVersion: '0.1.0-test',
              platform: 'electron' as const
            }
          : { kind: 'success' as const, session: { kind: 'anonymous' as const } }
      )
    )
    /** @brief 单字符串参数白名单 IPC mock / Single-string-argument allowlisted IPC mock. */
    const invokeWithStringArgument = vi.fn<DesktopStringArgumentInvoker>(() =>
      Promise.resolve({
        kind: 'success' as const,
        session: { kind: 'anonymous' as const }
      })
    )
    /** @brief 待测的桌面平台桥接 / Desktop platform bridge under test. */
    const bridge = createDesktopPlatformBridge({
      invokeWithStringArgument,
      invokeWithoutArgument
    })

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: '0.1.0-test',
      platform: 'electron'
    })
    await bridge.authentication.getSession()
    await bridge.authentication.authorize('signup')
    await bridge.authentication.refresh('access-token-with-enough-characters')
    await bridge.authentication.signOut()

    expect(invokeWithoutArgument.mock.calls).toEqual([
      [RUNTIME_INFO_CHANNEL],
      [DESKTOP_AUTH_GET_SESSION_CHANNEL],
      [DESKTOP_AUTH_SIGN_OUT_CHANNEL]
    ])
    expect(invokeWithStringArgument.mock.calls).toEqual([
      [DESKTOP_AUTH_AUTHORIZE_CHANNEL, 'signup'],
      [DESKTOP_AUTH_REFRESH_CHANNEL, 'access-token-with-enough-characters']
    ])
    expect(Object.keys(bridge)).toEqual(['authentication', 'getRuntimeInfo'])
    expect(Object.keys(bridge.authentication)).toEqual([
      'authorize',
      'getSession',
      'refresh',
      'signOut'
    ])
  })

  it('透传主进程验证后的诊断 endpoint', async () => {
    /** @brief 已验证诊断 endpoint / Validated diagnostics endpoint. */
    const diagnosticsEndpoint =
      'https://diagnostics.example.test:8443/api/v1/frontend-diagnostics/batches'
    /** @brief 无参数 IPC mock / Argument-free IPC mock. */
    const invokeWithoutArgument = vi.fn<DesktopNoArgumentInvoker>(() =>
      Promise.resolve({
        apiBaseUrl: 'https://api.example.test',
        appVersion: '0.1.0-test',
        diagnosticsEndpoint,
        platform: 'electron' as const
      })
    )
    /** @brief 未使用的认证 IPC mock / Unused authentication IPC mock. */
    const invokeWithStringArgument = vi.fn<DesktopStringArgumentInvoker>()
    /** @brief 待测 bridge / Bridge under test. */
    const bridge = createDesktopPlatformBridge({
      invokeWithStringArgument,
      invokeWithoutArgument
    })

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      apiBaseUrl: 'https://api.example.test',
      appVersion: '0.1.0-test',
      diagnosticsEndpoint,
      platform: 'electron'
    })
  })
})
