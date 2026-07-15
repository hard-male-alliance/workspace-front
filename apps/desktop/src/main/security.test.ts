import { describe, expect, it } from 'vitest'

import { isAllowedRendererUrl, isTrustedRendererIpcSender } from './security'

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

  it('生产 file URL 只允许应用入口及其 hash 路由', () => {
    expect(
      isAllowedRendererUrl(
        'file:///opt/ai-job-workspace/renderer/index.html#/knowledge',
        'file:///opt/ai-job-workspace/renderer/index.html'
      )
    ).toBe(true)
    expect(
      isAllowedRendererUrl(
        'file:///opt/ai-job-workspace/renderer/other.html',
        'file:///opt/ai-job-workspace/renderer/index.html'
      )
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
  })
})
