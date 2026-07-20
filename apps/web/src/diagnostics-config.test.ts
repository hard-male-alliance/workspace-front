import { describe, expect, it } from 'vitest'

import {
  FRONTEND_DIAGNOSTICS_BATCH_PATH,
  createWebContentSecurityPolicy,
  resolveDiagnosticsUploadConfiguration
} from './diagnostics-config'

describe('resolveDiagnosticsUploadConfiguration', (): void => {
  it('disables upload when diagnostics is not configured', (): void => {
    expect(resolveDiagnosticsUploadConfiguration({})).toEqual({ kind: 'disabled' })
    expect(
      resolveDiagnosticsUploadConfiguration({
        VITE_DIAGNOSTICS_HOSTNAME: '   ',
        VITE_DIAGNOSTICS_PORT: '   '
      })
    ).toEqual({ kind: 'disabled' })
  })

  it('keeps incomplete or malformed diagnostics configuration offline', (): void => {
    const configurations = [
      { VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test' },
      { VITE_DIAGNOSTICS_PORT: '8443' },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '0'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '65536'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: 'not-a-port'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test/path',
        VITE_DIAGNOSTICS_PORT: '8443'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test;script-src',
        VITE_DIAGNOSTICS_PORT: '8443'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8443',
        VITE_DIAGNOSTICS_PROTOCOL: 'ftp'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8080',
        VITE_DIAGNOSTICS_PROTOCOL: 'http'
      },
      {
        VITE_DIAGNOSTICS_HOSTNAME: '192.0.2.10',
        VITE_DIAGNOSTICS_PORT: '8443'
      }
    ]

    for (const configuration of configurations) {
      expect(resolveDiagnosticsUploadConfiguration(configuration).kind).not.toBe('enabled')
    }
  })

  it('uses HTTPS by default and only the fixed diagnostics batch endpoint', (): void => {
    expect(
      resolveDiagnosticsUploadConfiguration({
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8443'
      })
    ).toEqual({
      endpoint: `https://diagnostics.example.test:8443${FRONTEND_DIAGNOSTICS_BATCH_PATH}`,
      kind: 'enabled',
      origin: 'https://diagnostics.example.test:8443'
    })
  })
})

describe('createWebContentSecurityPolicy', (): void => {
  it('allows exactly the parsed product API and enabled diagnostics origins', (): void => {
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
  })

  it('retains only exact local Vite development sources', (): void => {
    const policy = createWebContentSecurityPolicy({
      environment: {
        VITE_API_BASE_URL: 'https://api.example.test',
        VITE_DIAGNOSTICS_HOSTNAME: 'diagnostics.example.test',
        VITE_DIAGNOSTICS_PORT: '8443'
      },
      includeDevelopmentSources: true
    })

    expect(policy).toContain('http://localhost:5173')
    expect(policy).toContain('http://127.0.0.1:5173')
    expect(policy).toContain('ws://localhost:5173')
    expect(policy).toContain('ws://127.0.0.1:5173')
    expect(policy).not.toContain('*')
    expect(policy).not.toContain(' https: ')
  })
})
