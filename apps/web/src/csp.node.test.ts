import { describe, expect, it } from 'vitest'

import { createWebContentSecurityPolicy } from './diagnostics-config'

describe('Web Content Security Policy', (): void => {
  it('allows the exact product API and enabled diagnostics origins in production', (): void => {
    const policy = createWebContentSecurityPolicy({
      environment: {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8443'
      },
      includeDevelopmentSources: false
    })

    expect(policy).toContain(
      "connect-src 'self' https://api.hmalliances.org:8022 https://diagnostics.example.test:8443"
    )
    expect(policy).toContain("img-src 'self' https: data: blob:")
    expect(policy).toContain("frame-src 'self' blob:")
    expect(policy).not.toContain("frame-src 'self' https://api.hmalliances.org:8022")
    expect(policy).not.toContain('http://dev.hmalliances.org:9000')
    expect(policy).not.toContain('localhost')
    expect(policy).not.toContain('*')
  })

  it('keeps exact localhost and WebSocket sources for Vite development', (): void => {
    const policy = createWebContentSecurityPolicy({
      environment: {
        VITE_DIAGNOSTICS_HOSTNAME: undefined
      },
      includeDevelopmentSources: true
    })

    expect(policy).toContain('http://localhost:5173')
    expect(policy).toContain('http://127.0.0.1:5173')
    expect(policy).toContain('http://dev.hmalliances.org:9000')
    expect(policy).toContain('ws://localhost:5173')
    expect(policy).toContain('ws://127.0.0.1:5173')
    expect(policy).not.toContain('*')
  })
})
