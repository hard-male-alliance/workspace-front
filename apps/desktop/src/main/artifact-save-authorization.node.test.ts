import { describe, expect, it } from 'vitest'

import { isTrustedMainFrameRequest } from './ipc-sender'

/** @brief 当前应用可信 renderer 身份 / Trusted renderer identity for the current application. */
const trustedRenderer = {
  rendererUrl: 'ai-job-workspace://renderer/index.html',
  webContentsId: 42
}

describe('artifact-save IPC authorization', () => {
  it('只接受当前窗口、可信 URL 的主 frame', () => {
    expect(
      isTrustedMainFrameRequest(
        {
          sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
          senderFrame: { frameTreeNodeId: 7, url: 'ai-job-workspace://renderer/resumes/a/edit' }
        },
        () => trustedRenderer
      )
    ).toBe(true)
  })

  it.each([
    {
      sender: { id: 99, mainFrame: { frameTreeNodeId: 7 } },
      senderFrame: { frameTreeNodeId: 7, url: 'ai-job-workspace://renderer/index.html' }
    },
    {
      sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
      senderFrame: { frameTreeNodeId: 8, url: 'ai-job-workspace://renderer/index.html' }
    },
    {
      sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
      senderFrame: { frameTreeNodeId: 7, url: 'https://evil.example/' }
    }
  ])('拒绝其他窗口、子 frame 或越界 URL：%o', (event) => {
    expect(isTrustedMainFrameRequest(event, () => trustedRenderer)).toBe(false)
  })

  it('在当前可信窗口不存在时默认拒绝', () => {
    expect(
      isTrustedMainFrameRequest(
        {
          sender: { id: 42, mainFrame: { frameTreeNodeId: 7 } },
          senderFrame: { frameTreeNodeId: 7, url: 'ai-job-workspace://renderer/index.html' }
        },
        () => undefined
      )
    ).toBe(false)
  })
})
