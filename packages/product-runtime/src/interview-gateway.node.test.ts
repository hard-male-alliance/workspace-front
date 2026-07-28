/** @file Interview production runtime 的受控开发信令映射测试 / Controlled development-signaling mapping tests for the Interview production runtime. */

import { describe, expect, it } from 'vitest'

import { localRealtimeSignalingUrl } from './interview-gateway'

describe('localRealtimeSignalingUrl', (): void => {
  it('routes only the shared-contract development origin to the local port-9000 proxy', (): void => {
    /** @brief 契约允许但本地 DNS 不保证指向 loopback 的开发 URL / Contract-allowed development URL whose DNS is not guaranteed to resolve to loopback locally. */
    const developmentUrl = 'ws://dev.hmalliances.org:9000/realtime/v2/interview?lease=opaque'

    expect(localRealtimeSignalingUrl(developmentUrl)).toBe(
      'ws://localhost:9000/realtime/v2/interview?lease=opaque'
    )
  })

  it.each([
    'wss://api.hmalliances.org/realtime/v2/interview',
    'ws://localhost:8000/realtime/v2/interview',
    'ws://dev.hmalliances.org:9001/realtime/v2/interview'
  ])('does not rewrite any non-contract development origin: %s', (signalingUrl): void => {
    expect(localRealtimeSignalingUrl(signalingUrl)).toBe(signalingUrl)
  })
})
