import { describe, expect, it } from 'vitest'

import {
  DESKTOP_OAUTH_SCOPES,
  DesktopOAuthConfigurationError,
  resolveDesktopOAuthConfiguration
} from './native-oauth-config'

describe('resolveDesktopOAuthConfiguration', (): void => {
  it('只接受显式 native public client ID 并冻结产品 scopes', (): void => {
    expect(
      resolveDesktopOAuthConfiguration({
        AI_JOB_WORKSPACE_OAUTH_CLIENT_ID: 'desktop-public-client'
      })
    ).toEqual({
      clientId: 'desktop-public-client',
      scopes: DESKTOP_OAUTH_SCOPES
    })
    expect(Object.isFrozen(DESKTOP_OAUTH_SCOPES)).toBe(true)
  })

  it.each([undefined, '', ' leading', 'trailing ', 'line\nbreak'])(
    '拒绝缺失、空白或控制字符 client ID：%s',
    (clientId): void => {
      expect(() =>
        resolveDesktopOAuthConfiguration({
          AI_JOB_WORKSPACE_OAUTH_CLIENT_ID: clientId
        })
      ).toThrowError(DesktopOAuthConfigurationError)
    }
  )
})
