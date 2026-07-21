import { describe, expect, it } from 'vitest'

import { isDesktopSmokeEnabled, parseDesktopSmokeResult } from './desktop-smoke'

describe('isDesktopSmokeEnabled', (): void => {
  it('只接受严格的环境开关值', (): void => {
    expect(isDesktopSmokeEnabled({ AI_JOB_WORKSPACE_SMOKE: '1' })).toBe(true)
    expect(isDesktopSmokeEnabled({ AI_JOB_WORKSPACE_SMOKE: 'true' })).toBe(false)
    expect(isDesktopSmokeEnabled({})).toBe(false)
  })
})

describe('parseDesktopSmokeResult', (): void => {
  it('接受有内容且由 Electron bridge 标识的结果', (): void => {
    expect(
      parseDesktopSmokeResult({
        appVersion: '0.1.0',
        platform: 'electron',
        rootTextLength: 42
      })
    ).toEqual({
      appVersion: '0.1.0',
      platform: 'electron',
      rootTextLength: 42
    })
  })

  it.each([
    undefined,
    {},
    { appVersion: '0.1.0', platform: 'electron', rootTextLength: 0 },
    { appVersion: '0.1.0', platform: 'web', rootTextLength: 42 },
    { appVersion: '', platform: 'electron', rootTextLength: 42 }
  ])('拒绝无法证明 renderer 与 preload 就绪的结果：%o', (result): void => {
    expect(() => parseDesktopSmokeResult(result)).toThrowError(/Desktop smoke check/u)
  })
})
