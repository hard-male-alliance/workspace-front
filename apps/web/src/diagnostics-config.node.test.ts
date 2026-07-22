import { describe, expect, it } from 'vitest'

import {
  FRONTEND_DIAGNOSTICS_BATCH_PATH,
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
