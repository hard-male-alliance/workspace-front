import { describe, expect, it } from 'vitest'

import {
  createHardenedWebPreferences,
  isAllowedRendererUrl,
  isTrustedRendererIpcSender
} from './security'

describe('createHardenedWebPreferences', (): void => {
  it('显式启用隔离与沙箱并关闭 Node、WebView 和不安全内容', (): void => {
    expect(createHardenedWebPreferences('/trusted/preload.cjs')).toEqual({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: '/trusted/preload.cjs',
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    })
  })
})

describe('isAllowedRendererUrl', () => {
  it('开发环境只允许同源导航', () => {
    expect(
      isAllowedRendererUrl('http://localhost:5173/resumes/editor', 'http://localhost:5173/')
    ).toBe(true)
    expect(isAllowedRendererUrl('https://localhost:5173/', 'http://localhost:5173/')).toBe(false)
    expect(isAllowedRendererUrl('http://localhost.evil.example/', 'http://localhost:5173/')).toBe(
      false
    )
  })

  it('生产自定义协议只允许受信任 renderer host', () => {
    expect(
      isAllowedRendererUrl(
        'ai-job-workspace://renderer/knowledge/source-1/visibility',
        'ai-job-workspace://renderer/index.html'
      )
    ).toBe(true)
    expect(
      isAllowedRendererUrl(
        'ai-job-workspace://untrusted/index.html',
        'ai-job-workspace://renderer/index.html'
      )
    ).toBe(false)
    expect(
      isAllowedRendererUrl('file:///tmp/untrusted.html', 'ai-job-workspace://renderer/index.html')
    ).toBe(false)
  })
})

describe('isTrustedRendererIpcSender', () => {
  it('要求主 frame、窗口标识和 URL 同时匹配', () => {
    /** @brief 可信主窗口身份 / Trusted main-window identity. */
    const trustedRenderer = {
      webContentsId: 42,
      rendererUrl: 'http://localhost:5173/'
    }

    expect(
      isTrustedRendererIpcSender(
        {
          webContentsId: 42,
          isMainFrame: true,
          frameUrl: 'http://localhost:5173/workspace'
        },
        trustedRenderer
      )
    ).toBe(true)
    expect(
      isTrustedRendererIpcSender(
        {
          webContentsId: 42,
          isMainFrame: false,
          frameUrl: 'http://localhost:5173/'
        },
        trustedRenderer
      )
    ).toBe(false)
    expect(
      isTrustedRendererIpcSender(
        {
          webContentsId: 7,
          isMainFrame: true,
          frameUrl: 'http://localhost:5173/'
        },
        trustedRenderer
      )
    ).toBe(false)
    expect(
      isTrustedRendererIpcSender(
        {
          webContentsId: 42,
          isMainFrame: true,
          frameUrl: 'http://untrusted.example/'
        },
        trustedRenderer
      )
    ).toBe(false)
  })
})
