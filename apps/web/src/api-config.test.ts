import { describe, expect, it } from 'vitest'

import { buildApiBaseUrl } from './api-config'

describe('buildApiBaseUrl', () => {
  it('uses the protocol default port when the port variable is empty', () => {
    expect(buildApiBaseUrl({ protocol: 'http', hostname: 'api.hmalliances.org', port: '' })).toBe(
      'http://api.hmalliances.org'
    )
    expect(buildApiBaseUrl({ protocol: 'https', hostname: 'api.hmalliances.org', port: '' })).toBe(
      'https://api.hmalliances.org'
    )
  })

  it('keeps an explicitly configured non-default port', () => {
    expect(
      buildApiBaseUrl({ protocol: 'https', hostname: 'api.hmalliances.org', port: '8443' })
    ).toBe('https://api.hmalliances.org:8443')
  })
})
