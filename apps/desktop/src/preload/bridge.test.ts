import { describe, expect, it, vi } from 'vitest'

import { RUNTIME_INFO_CHANNEL } from '@ai-job-workspace/platform'

import { createDesktopPlatformBridge } from './bridge'

describe('createDesktopPlatformBridge', () => {
  it('只经固定通道请求运行时信息', async () => {
    /** @brief 已记录调用的 IPC mock / IPC mock with recorded calls. */
    const invokeRuntimeInfo = vi.fn().mockResolvedValue({
      platform: 'electron' as const,
      appVersion: '0.1.0-test'
    })
    /** @brief 待测的桌面平台桥接 / Desktop platform bridge under test. */
    const bridge = createDesktopPlatformBridge(invokeRuntimeInfo)

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      platform: 'electron',
      appVersion: '0.1.0-test'
    })
    expect(invokeRuntimeInfo).toHaveBeenCalledTimes(1)
    expect(invokeRuntimeInfo).toHaveBeenCalledWith(RUNTIME_INFO_CHANNEL)
    expect(Object.keys(bridge)).toEqual(['getRuntimeInfo'])
  })
})
