import { describe, expect, it } from 'vitest'

import { createWebContentSecurityPolicy } from './diagnostics-config'

describe('Web Content Security Policy', (): void => {
  it('allows the exact product API and enabled diagnostics origins in production', (): void => {
    const policy = createWebContentSecurityPolicy({
      environment: {
        VITE_API_BASE_URL: 'https://api.example.test:9443',
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8443'
      },
      includeDevelopmentSources: false
    })

    expect(policy).toContain(
      "connect-src 'self' https://api.example.test:9443 https://diagnostics.example.test:8443"
    )
    expect(policy).toContain("frame-src 'self' https://api.example.test:9443")
    expect(policy).not.toContain('localhost')
    expect(policy).not.toContain('*')
  })

  it('keeps exact localhost and WebSocket sources for Vite development', (): void => {
    const policy = createWebContentSecurityPolicy({
      environment: {
        VITE_API_BASE_URL: 'https://api.example.test'
      },
      includeDevelopmentSources: true
    })

    expect(policy).toContain('http://localhost:5173')
    expect(policy).toContain('http://127.0.0.1:5173')
    expect(policy).toContain('ws://localhost:5173')
    expect(policy).toContain('ws://127.0.0.1:5173')
    expect(policy).not.toContain('*')
  })
})
