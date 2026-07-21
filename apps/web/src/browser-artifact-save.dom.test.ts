import { describe, expect, it, vi } from 'vitest'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'

import { createBrowserArtifactSavePort } from './browser-artifact-save'
import type { BrowserDownloadAnchor } from './browser-artifact-save'

describe('createBrowserArtifactSavePort', () => {
  it('使用一次性 anchor 保留浏览器下载语义并立即清理', async () => {
    /** @brief 临时下载元素的 click spy / Click spy for the temporary download element. */
    const click = vi.fn()
    /** @brief 临时下载元素的 remove spy / Remove spy for the temporary download element. */
    const remove = vi.fn()
    /** @brief 测试使用的最小下载元素 / Minimal download element used by the test. */
    const anchor: BrowserDownloadAnchor = { click, download: '', href: '', remove }
    /** @brief 文档附加操作 spy / Document-append spy. */
    const appendAnchor = vi.fn()
    /** @brief 待测浏览器保存端口 / Browser save port under test. */
    const port = createBrowserArtifactSavePort({ appendAnchor, createAnchor: () => anchor })

    await expect(
      port.saveArtifact({
        contentUrl: 'https://api.example.test/api/v1/render-artifacts/artifact_1/content',
        suggestedFileName: sanitizePdfFileName('Klee Resume')
      })
    ).resolves.toEqual({ status: 'started' })

    expect(anchor.href).toBe('https://api.example.test/api/v1/render-artifacts/artifact_1/content')
    expect(anchor.download).toBe('Klee Resume.pdf')
    expect(appendAnchor).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('即使浏览器拒绝 click 也清理临时 anchor', async () => {
    /** @brief 模拟失败的下载元素 / Download element simulating a failed click. */
    const anchor: BrowserDownloadAnchor = {
      click: vi.fn((): never => {
        throw new Error('download blocked')
      }),
      download: '',
      href: '',
      remove: vi.fn()
    }
    /** @brief 待测浏览器保存端口 / Browser save port under test. */
    const port = createBrowserArtifactSavePort({
      appendAnchor: vi.fn(),
      createAnchor: () => anchor
    })

    await expect(
      port.saveArtifact({
        contentUrl: 'https://api.example.test/api/v1/a',
        suggestedFileName: sanitizePdfFileName('a')
      })
    ).rejects.toThrow('download blocked')
    expect(anchor.remove).toHaveBeenCalledOnce()
  })
})
