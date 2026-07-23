import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiV2ProblemError, ApiV2WriteOutcomeUnknownError } from '@ai-job-workspace/product-api-v2'
import {
  InMemoryResumeGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '@ai-job-workspace/app/testing'
import type {
  ArtifactSavePort,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief URL.createObjectURL 的原始属性描述 / Original URL.createObjectURL property descriptor. */
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
/** @brief URL.revokeObjectURL 的原始属性描述 / Original URL.revokeObjectURL property descriptor. */
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
/** @brief navigator.pdfViewerEnabled 的原始自有属性 / Original own navigator.pdfViewerEnabled property. */
const originalPdfViewerEnabled = Object.getOwnPropertyDescriptor(navigator, 'pdfViewerEnabled')

/**
 * @brief 安装可观察但不读取远端 URL 的 Blob URL 宿主 / Install an observable Blob-URL host that never reads a remote URL.
 * @return create/revoke 观测器 / Create and revoke observers.
 */
function installBlobUrlHost(): {
  readonly createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>
  readonly revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>
} {
  /** @brief Blob URL 创建观测器 / Blob-URL creation observer. */
  const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:resume-pdf-preview')
  /** @brief Blob URL 释放观测器 / Blob-URL revocation observer. */
  const revokeObjectURL = vi.fn<(url: string) => void>()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  return { createObjectURL, revokeObjectURL }
}

/**
 * @brief 恢复测试前的 Blob URL 宿主 / Restore the Blob-URL host that existed before the tests.
 */
function restoreBlobUrlHost(): void {
  if (originalCreateObjectUrl === undefined) {
    Reflect.deleteProperty(URL, 'createObjectURL')
  } else {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
  }
  if (originalRevokeObjectUrl === undefined) {
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  } else {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
  }
}

/**
 * @brief 设置浏览器公开的原生 PDF 查看器能力 / Set the browser-reported native PDF-viewer capability.
 * @param enabled 浏览器是否明确支持内嵌 PDF / Whether the browser explicitly supports inline PDF.
 */
function setPdfViewerEnabled(enabled: boolean): void {
  Object.defineProperty(navigator, 'pdfViewerEnabled', {
    configurable: true,
    value: enabled
  })
}

/** @brief 恢复测试前的 PDF 查看器能力 / Restore the PDF-viewer capability that existed before the tests. */
function restorePdfViewerEnabled(): void {
  if (originalPdfViewerEnabled === undefined) {
    Reflect.deleteProperty(navigator, 'pdfViewerEnabled')
  } else {
    Object.defineProperty(navigator, 'pdfViewerEnabled', originalPdfViewerEnabled)
  }
}

/**
 * @brief 获取承载语义或 PDF 预览的 busy surface / Get the busy surface carrying the semantic or PDF preview.
 * @return 带 aria-busy 的预览容器 / Preview container carrying aria-busy.
 */
function getPreviewBusySurface(): HTMLElement {
  /** @brief 直接由可访问 busy 状态定位的预览容器 / Preview container located directly by its accessible busy state. */
  const surface = document.querySelector('.aw-editor-preview[aria-busy]')
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected the Resume preview to have an aria-busy container.')
  }
  return surface
}

beforeEach(async (): Promise<void> => {
  await setWorkspaceAppTestLocale('zh-SG')
  vi.spyOn(Math, 'random').mockReturnValue(0)
  setPdfViewerEnabled(true)
})

afterEach((): void => {
  restoreBlobUrlHost()
  restorePdfViewerEnabled()
  vi.restoreAllMocks()
})

/** @brief 简历 Render、Job、Artifact、Blob 与保存闭环 / Resume Render, Job, Artifact, Blob, and save lifecycle. */
describe('WorkspaceApp Resume artifact', (): void => {
  it('resolves Job result_refs and previews only a validated Bearer-fetched Blob URL', async (): Promise<void> => {
    /** @brief 当前测试的 Blob URL 宿主 / Blob-URL host for this test. */
    const objectUrls = installBlobUrlHost()

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('progressbar', { name: 'PDF 生成进度' })).toBeInTheDocument()
    /** @brief 只接收内存 Blob URL 的严格 sandbox 预览 / Strict sandbox preview receiving only an in-memory Blob URL. */
    const preview = await screen.findByTitle('简历 PDF 预览', {}, { timeout: 4_000 })
    expect(preview).toHaveAttribute('src', 'blob:resume-pdf-preview')
    expect(preview).toHaveAttribute('sandbox', '')
    expect(objectUrls.createObjectURL).toHaveBeenCalledTimes(1)
    expect(objectUrls.createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(preview).not.toHaveAttribute('src', expect.stringContaining('/api/v2/'))
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeEnabled()
  })

  it('offers an explicit download fallback when the browser has no inline PDF viewer', async (): Promise<void> => {
    installBlobUrlHost()
    setPdfViewerEnabled(false)

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(
      await screen.findByText('当前浏览器无法内嵌显示 PDF', {}, { timeout: 4_000 })
    ).toBeInTheDocument()
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeEnabled()
  })

  it('segments long Artifact expiry waits instead of overflowing the browser timer', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
    const store = new InMemoryWorkspaceOperationsStore()
    const resume = new InMemoryResumeGateway({ operationsStore: store })
    const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
    /** @brief 未替换的 Artifact metadata 读取 / Original Artifact-metadata read. */
    const getArtifact = workspaceOperations.getArtifact.bind(workspaceOperations)
    /** @brief 超过单个浏览器 timer 上限的有效期 / Expiry beyond one browser timer's limit. */
    const expiresAt = new Date(Date.now() + 2_147_483_647 + 60_000).toISOString()
    vi.spyOn(workspaceOperations, 'getArtifact').mockImplementation(async (request) => {
      /** @brief 带长有效期的 Artifact 权威 / Artifact authority carrying a long lifetime. */
      const authority = await getArtifact(request)
      return { ...authority, artifact: { ...authority.artifact, expiresAt } }
    })
    vi.spyOn(workspaceOperations, 'readArtifactContent').mockImplementation((request) => {
      request.signal?.throwIfAborted()
      return Promise.resolve(store.readArtifactContent(request.artifact.id))
    })
    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume, workspaceOperations })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览', {}, { timeout: 4_000 })

    await act(
      async (): Promise<void> =>
        new Promise((resolve): void => {
          globalThis.setTimeout(resolve, 20)
        })
    )
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeEnabled()
    expect(screen.queryByText('该 PDF 已过期，请重新生成。')).not.toBeInTheDocument()
  })

  it('reuses the exact Render command identity after an unknown start outcome', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
    const store = new InMemoryWorkspaceOperationsStore()
    /** @brief 当前测试的 Resume command adapter / Resume-command adapter for this test. */
    const resume = new InMemoryResumeGateway({ operationsStore: store })
    /** @brief 当前测试的 Workspace Operations adapter / Workspace Operations adapter for this test. */
    const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
    /** @brief 未替换的 Render command / Original Render command. */
    const startRender = resume.startResumeRender.bind(resume)
    /** @brief 首次写已提交但响应丢失的观测器 / Observer whose first committed write loses its response. */
    const start = vi
      .spyOn(resume, 'startResumeRender')
      .mockImplementationOnce(async (input): Promise<never> => {
        await startRender(input)
        throw new ApiV2WriteOutcomeUnknownError('network')
      })
      .mockImplementation(startRender)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume, workspaceOperations })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/结果待确认|无法确认/u)
    /** @brief 首次提交的冻结意图 / Frozen intent submitted first. */
    const first = start.mock.calls[0]?.[0]
    if (first === undefined) throw new Error('Expected the first Render command.')

    fireEvent.click(screen.getByRole('button', { name: '确认 PDF 生成结果' }))
    await screen.findByTitle('简历 PDF 预览', {}, { timeout: 4_000 })

    /** @brief 安全确认重放的同一意图 / Same intent replayed for safe confirmation. */
    const confirmation = start.mock.calls[1]?.[0]
    expect(confirmation).toMatchObject({
      commandId: first.commandId,
      formats: ['pdf'],
      mode: 'preview',
      resumeId: first.resumeId,
      resumeRevision: first.resumeRevision,
      workspaceId: first.workspaceId
    })
  })

  it('cancels the server Job instead of treating fetch abort as cancellation', async (): Promise<void> => {
    installBlobUrlHost()
    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    /** @brief 只有取得 Job identity 与强 ETag 后才出现的 cancellation / Cancellation available only after Job identity and strong ETag exist. */
    const cancel = await screen.findByRole('button', { name: '取消生成' })
    fireEvent.click(cancel)

    expect(await screen.findByText('PDF 生成已取消。')).toHaveAttribute('role', 'status')
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
  })

  it.each([
    {
      createError: (): Error => new ApiV2WriteOutcomeUnknownError('network'),
      label: 'an unknown write outcome'
    },
    {
      createError: (): Error =>
        new ApiV2ProblemError(
          {
            code: 'idempotency.in_progress',
            detail: null,
            errors: [],
            extensions: null,
            instance: null,
            request_id: 'req_cancel_in_progress_12345678',
            retryable: true,
            status: 409,
            title: 'Cancellation is still in progress',
            type: 'https://api.hmalliances.org/problems/idempotency-in-progress'
          },
          null
        ),
      label: 'an idempotency.in_progress response'
    }
  ])(
    'confirms cancellation with the same command and original ETag after $label',
    async ({ createError }): Promise<void> => {
      installBlobUrlHost()
      /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
      const store = new InMemoryWorkspaceOperationsStore()
      /** @brief 当前测试的 Resume command adapter / Resume-command adapter for this test. */
      const resume = new InMemoryResumeGateway({ operationsStore: store })
      /** @brief 当前测试的 Workspace Operations adapter / Workspace Operations adapter for this test. */
      const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
      /** @brief 未替换的服务端 cancellation / Original server-side cancellation. */
      const cancelJob = workspaceOperations.cancelJob.bind(workspaceOperations)
      /** @brief 首次结果不确定、确认时成功的 cancellation 观测器 / Cancellation observer uncertain first and successful on confirmation. */
      const cancel = vi
        .spyOn(workspaceOperations, 'cancelJob')
        .mockRejectedValueOnce(createError())
        .mockImplementation(cancelJob)

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume, workspaceOperations })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })
      fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
      fireEvent.click(await screen.findByRole('button', { name: '取消生成' }))

      /** @brief 首次提交并冻结的 cancellation 信封 / Cancellation envelope submitted and frozen first. */
      const first = cancel.mock.calls[0]?.[0]
      if (first === undefined) throw new Error('Expected the first cancellation command.')
      fireEvent.click(await screen.findByRole('button', { name: '确认取消结果' }))

      expect(await screen.findByText('PDF 生成已取消。')).toHaveAttribute('role', 'status')
      expect(cancel).toHaveBeenCalledTimes(2)
      /** @brief 安全确认使用的完整 cancellation 信封 / Complete cancellation envelope used by safe confirmation. */
      const confirmation = cancel.mock.calls[1]?.[0]
      expect(confirmation).toMatchObject({
        commandId: first.commandId,
        concurrencyToken: first.concurrencyToken,
        jobId: first.jobId,
        workspaceId: first.workspaceId
      })
    }
  )

  it('fails closed when an Artifact subject does not match the rendered Resume revision', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
    const store = new InMemoryWorkspaceOperationsStore()
    const resume = new InMemoryResumeGateway({ operationsStore: store })
    const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
    /** @brief 未替换的 Artifact metadata 读取 / Original Artifact-metadata read. */
    const getArtifact = workspaceOperations.getArtifact.bind(workspaceOperations)
    vi.spyOn(workspaceOperations, 'getArtifact').mockImplementation(async (request) => {
      /** @brief 被篡改为上一 revision 的 metadata / Metadata tampered to the previous revision. */
      const authority = await getArtifact(request)
      return {
        ...authority,
        artifact: {
          ...authority.artifact,
          subject: {
            ...authority.artifact.subject,
            revision:
              authority.artifact.subject.revision === null ||
              authority.artifact.subject.revision === undefined
                ? 1
                : authority.artifact.subject.revision - 1
          }
        }
      }
    })

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume, workspaceOperations })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('alert', {}, { timeout: 4_000 })).toHaveTextContent(
      '无法生成 PDF 预览'
    )
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
  })

  it('clears preview progress and aria-busy when the PDF exceeds the preview ceiling', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
    const store = new InMemoryWorkspaceOperationsStore()
    const resume = new InMemoryResumeGateway({ operationsStore: store })
    const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
    /** @brief 未替换的 Artifact metadata 读取 / Original Artifact-metadata read. */
    const getArtifact = workspaceOperations.getArtifact.bind(workspaceOperations)
    vi.spyOn(workspaceOperations, 'getArtifact').mockImplementation(async (request) => {
      /** @brief 被声明为超过浏览器预览上限的 metadata / Metadata declared above the browser preview ceiling. */
      const authority = await getArtifact(request)
      return {
        ...authority,
        artifact: { ...authority.artifact, sizeBytes: 64 * 1024 * 1024 + 1 }
      }
    })
    /** @brief 过大产物不得触发的内容读取 / Content read forbidden for an oversized artifact. */
    const readArtifactContent = vi.spyOn(workspaceOperations, 'readArtifactContent')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume, workspaceOperations })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('alert', {}, { timeout: 4_000 })).toHaveTextContent('PDF 太大')
    await vi.waitFor((): void => {
      expect(
        screen.queryByRole('progressbar', { name: '正在安全加载 PDF 预览' })
      ).not.toBeInTheDocument()
      expect(getPreviewBusySurface()).toHaveAttribute('aria-busy', 'false')
    })
    expect(readArtifactContent).not.toHaveBeenCalled()
  })

  it('clears preview progress and aria-busy when the authenticated stream fails', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief Resume command 与 Operations 查询共享的状态 / State shared by Resume commands and Operations reads. */
    const store = new InMemoryWorkspaceOperationsStore()
    const resume = new InMemoryResumeGateway({ operationsStore: store })
    const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
    /** @brief 未替换的受认证内容读取 / Original authenticated-content read. */
    const readArtifactContent = workspaceOperations.readArtifactContent.bind(workspaceOperations)
    vi.spyOn(workspaceOperations, 'readArtifactContent').mockImplementation(async (request) => {
      /** @brief 保留权威 headers、长度与摘要约束的原始描述 / Original descriptor preserving authoritative headers, length, and digest constraints. */
      const content = await readArtifactContent(request)
      await content.body?.cancel()
      /** @brief 发出一块后失败的受认证 stream / Authenticated stream failing after one chunk. */
      const body = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(new Uint8Array([1]))
          controller.error(new Error('private upstream stream failure'))
        }
      })
      return { ...content, body }
    })

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume, workspaceOperations })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('alert', {}, { timeout: 4_000 })).toHaveTextContent(
      '无法生成 PDF 预览'
    )
    await vi.waitFor((): void => {
      expect(
        screen.queryByRole('progressbar', { name: '正在安全加载 PDF 预览' })
      ).not.toBeInTheDocument()
      expect(getPreviewBusySurface()).toHaveAttribute('aria-busy', 'false')
    })
    expect(screen.queryByText('private upstream stream failure')).not.toBeInTheDocument()
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
  })

  it('passes both Workspace and Artifact identities to the host save boundary', async (): Promise<void> => {
    installBlobUrlHost()
    /** @brief 测试控制的保存结果 resolver / Test-controlled save-result resolver. */
    let resolveSave: ((result: SaveArtifactResult) => void) | undefined
    /** @brief 保持 pending 以验证同步单通道的保存调用 / Save call kept pending to verify the synchronous single lane. */
    const saveArtifact = vi.fn<(request: SaveArtifactRequest) => Promise<SaveArtifactResult>>(
      (request): Promise<SaveArtifactResult> => {
        void request
        return new Promise((resolve): void => {
          resolveSave = resolve
        })
      }
    )
    /** @brief 当前测试的宿主保存端口 / Host save port for this test. */
    const artifactSave: ArtifactSavePort = { maximumArtifactBytes: null, saveArtifact }

    render(
      <WorkspaceApp artifactSave={artifactSave} initialPath="/resumes/res_mock_ai_platform/edit" />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览', {}, { timeout: 4_000 })

    /** @brief 同一 React commit 内双击的保存按钮 / Save button double-clicked within one React commit. */
    const saveButton = screen.getByRole('button', { name: '下载 PDF' })
    act((): void => {
      saveButton.click()
      saveButton.click()
    })

    expect(saveArtifact).toHaveBeenCalledTimes(1)
    /** @brief 实际越过宿主边界的保存请求 / Save request that actually crossed the host boundary. */
    const request = saveArtifact.mock.calls[0]?.[0]
    expect(request?.artifactId).toMatch(/^artifact_/u)
    expect(request?.suggestedFileName).toBe('Klee Chen Resume.pdf')
    expect(request?.workspaceId).toBe('ws_mock_klee_career_lab')
    resolveSave?.({ status: 'saved' })
    expect(await screen.findByText('PDF 已保存。')).toHaveAttribute('aria-live', 'polite')
  })

  it('revokes the Blob URL when the Resume preview leaves the page', async (): Promise<void> => {
    /** @brief 当前测试的 Blob URL 宿主 / Blob-URL host for this test. */
    const objectUrls = installBlobUrlHost()
    /** @brief 当前挂载的应用视图 / Mounted application view. */
    const view = render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览', {}, { timeout: 4_000 })

    view.unmount()

    expect(objectUrls.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith('blob:resume-pdf-preview')
  })
})
