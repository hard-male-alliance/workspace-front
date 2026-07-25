import {
  asUiConcurrencyToken,
  asUiOpaqueId,
  type UiWorkspaceId
} from '@ai-job-workspace/app/application'
import { sanitizePdfFileName } from '@ai-job-workspace/platform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebArtifactSave, type WebArtifactSaveOptions } from './artifact-save'

/** @brief DOM 测试 Workspace 身份 / DOM-test Workspace identity. */
const WORKSPACE_ID = asUiOpaqueId<'workspace'>('workspace_web_dom') as UiWorkspaceId

/** @brief DOM 测试 Artifact 身份 / DOM-test Artifact identity. */
const ARTIFACT_ID = asUiOpaqueId<'workspace-artifact'>('artifact_web_dom')

/** @brief Web 下载所需的 Operations 端口类型 / Operations-port type required by Web downloads. */
type TestWorkspaceOperations = WebArtifactSaveOptions['workspaceOperations']

afterEach((): void => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('createWebArtifactSave in the DOM runtime', (): void => {
  it('uses only a temporary Blob URL in the DOM and revokes it after a delay', async (): Promise<void> => {
    /** @brief PDF 测试字节 / Test PDF bytes. */
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    /** @brief 下载点击时捕获的锚点快照 / Anchor snapshot captured when the download is clicked. */
    let clickedAnchor: Pick<HTMLAnchorElement, 'download' | 'href' | 'isConnected' | 'rel'> | null =
      null
    /** @brief 延迟撤销回调 / Delayed revocation callback. */
    const revokeCallbacks: (() => void)[] = []
    /** @brief 捕获的 Blob / Captured Blob. */
    let downloadedBlob: Blob | null = null
    /** @brief 锚点点击监听 / Anchor click observer. */
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ): void {
      clickedAnchor = {
        download: this.download,
        href: this.href,
        isConnected: this.isConnected,
        rel: this.rel
      }
    })
    /** @brief Blob URL 撤销 mock / Blob URL revocation mock. */
    const revokeObjectURL = vi.fn()
    /** @brief Workspace Operations mock / Workspace Operations mock. */
    const workspaceOperations: TestWorkspaceOperations = {
      getArtifact: vi.fn<TestWorkspaceOperations['getArtifact']>(() =>
        Promise.resolve({
          artifact: {
            createdAt: '2026-07-23T00:00:00.000Z',
            expiresAt: null,
            id: ARTIFACT_ID,
            kind: 'resume_pdf',
            mediaType: 'application/pdf',
            pageCount: 1,
            revision: 1,
            sha256: '0'.repeat(64),
            sizeBytes: bytes.byteLength,
            subject: { id: 'resume_web_dom', resourceType: 'resume', revision: 3 },
            updatedAt: '2026-07-23T00:00:00.000Z',
            workspaceId: WORKSPACE_ID
          },
          concurrencyToken: asUiConcurrencyToken('"metadata-dom"'),
          requestId: 'request_metadata_dom'
        })
      ),
      readArtifactContent: vi.fn<TestWorkspaceOperations['readArtifactContent']>(() =>
        Promise.resolve({
          acceptsByteRanges: true,
          body: new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(bytes)
              controller.close()
            }
          }),
          byteLength: bytes.byteLength,
          disposition: 'attachment',
          entityTag: asUiConcurrencyToken('"content-dom"'),
          mediaType: 'application/pdf',
          requestId: 'request_content_dom'
        })
      )
    }
    /** @brief 被测 Web 保存端口 / Web save port under test. */
    const save = createWebArtifactSave({
      document,
      objectUrls: {
        createObjectURL(blob): string {
          downloadedBlob = blob
          return 'blob:https://app.example.test/opaque-download-id'
        },
        revokeObjectURL
      },
      schedule(callback, delayMilliseconds): void {
        expect(delayMilliseconds).toBe(60_000)
        revokeCallbacks.push(callback)
      },
      workspaceOperations
    })

    await expect(
      save.saveArtifact({
        artifactId: ARTIFACT_ID,
        suggestedFileName: sanitizePdfFileName('Klee Resume'),
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toEqual({ status: 'started' })

    expect(click).toHaveBeenCalledOnce()
    expect(clickedAnchor).toEqual({
      download: 'Klee Resume.pdf',
      href: 'blob:https://app.example.test/opaque-download-id',
      isConnected: true,
      rel: 'noopener'
    })
    expect(document.body.querySelector('a')).toBeNull()
    expect(downloadedBlob).toMatchObject({ size: bytes.byteLength, type: 'application/pdf' })
    expect(revokeObjectURL).not.toHaveBeenCalled()

    revokeCallbacks[0]?.()
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      'blob:https://app.example.test/opaque-download-id'
    )
  })
})
