import { describe, expect, it } from 'vitest'

import { createWebPlatformBridge } from './runtime'

describe('createWebPlatformBridge', () => {
  it('仅报告浏览器运行时', async () => {
    /** @brief 待测的浏览器平台桥接 / Browser platform bridge under test. */
    const bridge = createWebPlatformBridge('0.1.0-test')

    await expect(bridge.getRuntimeInfo()).resolves.toEqual({
      platform: 'web',
      appVersion: '0.1.0-test'
    })
  })
})
