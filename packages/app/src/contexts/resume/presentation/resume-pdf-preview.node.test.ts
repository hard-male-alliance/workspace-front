import { describe, expect, it, vi } from 'vitest'

import { asUiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiWorkspaceArtifactContent } from '../../workspace-operations'
import { createResumePdfPreviewLease, type ResumePdfObjectUrlPort } from './resume-pdf-preview'

/**
 * @brief 构造测试用完整 PDF content / Build complete PDF content for tests.
 * @param chunks stream 分块 / Stream chunks.
 * @param byteLength 声明的完整长度 / Declared complete length.
 * @return 未消费的 content descriptor / Unconsumed content descriptor.
 */
function pdfContent(chunks: readonly Uint8Array[], byteLength: number): UiWorkspaceArtifactContent {
  /** @brief 按顺序发出测试分块的 stream / Stream enqueuing test chunks in order. */
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  })
  return {
    acceptsByteRanges: true,
    body,
    byteLength,
    disposition: 'inline',
    entityTag: asUiConcurrencyToken('"pdf-content-v1"'),
    mediaType: 'application/pdf',
    requestId: 'request_pdf_preview_test'
  }
}

/** @brief Resume PDF Blob URL 生命周期 / Resume PDF Blob-URL lifecycle. */
describe('createResumePdfPreviewLease', (): void => {
  it('creates a URL only after EOF and revokes it exactly once', async (): Promise<void> => {
    /** @brief Blob URL 创建观测器 / Blob-URL creation observer. */
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:preview-test')
    /** @brief Blob URL 释放观测器 / Blob-URL revocation observer. */
    const revokeObjectURL = vi.fn<(url: string) => void>()
    /** @brief 当前测试的 URL 端口 / URL port for this test. */
    const objectUrls: ResumePdfObjectUrlPort = { createObjectURL, revokeObjectURL }
    /** @brief 内容消费进度观测器 / Content-consumption progress observer. */
    const onProgress = vi.fn<(completed: number, total: number) => void>()

    const lease = await createResumePdfPreviewLease(
      pdfContent([new Uint8Array([1, 2]), new Uint8Array([3])], 3),
      new AbortController().signal,
      onProgress,
      objectUrls
    )

    expect(lease).toMatchObject({ byteLength: 3, url: 'blob:preview-test' })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(onProgress).toHaveBeenLastCalledWith(3, 3)
    lease.dispose()
    lease.dispose()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-test')
  })

  it('accepts case-insensitive PDF media type and normalizes the Blob type', async (): Promise<void> => {
    /** @brief Blob URL 创建观测器 / Blob-URL creation observer. */
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:uppercase-pdf')
    /** @brief 当前测试的 URL 端口 / URL port for this test. */
    const objectUrls: ResumePdfObjectUrlPort = {
      createObjectURL,
      revokeObjectURL: vi.fn()
    }
    /** @brief 使用大小写混合 media type 的完整内容 / Complete content using a mixed-case media type. */
    const content = {
      ...pdfContent([new Uint8Array([1, 2, 3])], 3),
      mediaType: 'Application/PDF'
    }

    const lease = await createResumePdfPreviewLease(
      content,
      new AbortController().signal,
      undefined,
      objectUrls
    )

    /** @brief 传给 URL 宿主的规范 PDF Blob / Canonical PDF Blob passed to the URL host. */
    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob?.type).toBe('application/pdf')
    lease.dispose()
  })

  it('revokes and rejects a host URL outside the blob scheme', async (): Promise<void> => {
    /** @brief 宿主错误返回的非 Blob URL / Non-Blob URL incorrectly returned by the host. */
    const unsafeUrl = 'https://private.example.test/resume.pdf'
    /** @brief 非 Blob URL 的释放观测器 / Revocation observer for the non-Blob URL. */
    const revokeObjectURL = vi.fn<(url: string) => void>()
    /** @brief 返回不可信 URL 的宿主端口 / Host port returning an untrusted URL. */
    const objectUrls: ResumePdfObjectUrlPort = {
      createObjectURL: vi.fn().mockReturnValue(unsafeUrl),
      revokeObjectURL
    }

    await expect(
      createResumePdfPreviewLease(
        pdfContent([new Uint8Array([1, 2, 3])], 3),
        new AbortController().signal,
        undefined,
        objectUrls
      )
    ).rejects.toMatchObject({ code: 'object-url-failed' })
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith(unsafeUrl)
  })

  it('fails closed before creating a URL when the declared length differs', async (): Promise<void> => {
    /** @brief 不应被调用的 URL 端口 / URL port that must not be called. */
    const objectUrls: ResumePdfObjectUrlPort = {
      createObjectURL: vi.fn().mockReturnValue('blob:must-not-exist'),
      revokeObjectURL: vi.fn()
    }

    await expect(
      createResumePdfPreviewLease(
        pdfContent([new Uint8Array([1, 2, 3])], 2),
        new AbortController().signal,
        undefined,
        objectUrls
      )
    ).rejects.toMatchObject({
      code: 'content-length-mismatch'
    })
    expect(objectUrls.createObjectURL).not.toHaveBeenCalled()
  })

  it('cancels the stream and does not create a URL after abort', async (): Promise<void> => {
    /** @brief 当前测试的取消控制器 / Abort controller for this test. */
    const controller = new AbortController()
    /** @brief stream cancel 观测器 / Stream-cancel observer. */
    const cancel = vi.fn()
    /** @brief 第一块后保持 pending 的 stream / Stream remaining pending after its first chunk. */
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull(streamController): void {
        streamController.enqueue(new Uint8Array([1]))
        controller.abort()
      }
    })
    /** @brief 测试 content descriptor / Test content descriptor. */
    const content: UiWorkspaceArtifactContent = {
      acceptsByteRanges: false,
      body,
      byteLength: 2,
      disposition: 'inline',
      entityTag: asUiConcurrencyToken('"pdf-content-v1"'),
      mediaType: 'application/pdf',
      requestId: 'request_pdf_preview_abort'
    }
    /** @brief 不应创建 URL 的测试端口 / Test port that must not create a URL. */
    const objectUrls: ResumePdfObjectUrlPort = {
      createObjectURL: vi.fn().mockReturnValue('blob:must-not-exist'),
      revokeObjectURL: vi.fn()
    }

    await expect(
      createResumePdfPreviewLease(content, controller.signal, undefined, objectUrls)
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(objectUrls.createObjectURL).not.toHaveBeenCalled()
  })
})
