import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryResumeGateway } from '@ai-job-workspace/app/testing'
import type { ArtifactSavePort, SaveArtifactResult } from '@ai-job-workspace/platform'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 简历产物生成与保存用户行为 / Resume-artifact generation and save behaviours. */
describe('WorkspaceApp Resume artifact', (): void => {
  it('starts a PDF Render Job and displays the completed artifact', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByTitle('简历 PDF 预览')).toHaveAttribute(
      'src',
      'about:blank#mock-resume-pdf'
    )
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeInTheDocument()
  })

  it('通过显式 Host port 保存 PDF，并在等待期间提供可访问状态', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试控制的保存结果兑现函数 / Test-controlled save-result resolver. */
    let resolveSave: ((result: SaveArtifactResult) => void) | undefined
    /** @brief 保持 pending 直至测试兑现的保存调用 / Save call kept pending until the test resolves it. */
    const saveArtifact = vi.fn(
      (): Promise<SaveArtifactResult> =>
        new Promise((resolve): void => {
          resolveSave = resolve
        })
    )
    /** @brief 当前测试显式注入的宿主保存端口 / Host save port explicitly injected by this test. */
    const artifactSave: ArtifactSavePort = { saveArtifact }

    render(
      <WorkspaceApp artifactSave={artifactSave} initialPath="/resumes/res_mock_ai_platform/edit" />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')

    fireEvent.click(screen.getByRole('button', { name: '下载 PDF' }))

    expect(screen.getByRole('button', { name: '正在保存 PDF…' })).toBeDisabled()
    expect(saveArtifact).toHaveBeenCalledWith({
      contentUrl: 'about:blank#mock-resume-pdf',
      suggestedFileName: 'Klee Chen Resume.pdf'
    })
    resolveSave?.({ status: 'saved' })
    expect(await screen.findByText('PDF 已保存。')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeEnabled()
  })

  it('以 alert 告知宿主保存失败且不移除 iframe 预览', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回失败的测试宿主端口 / Test host port returning a failure. */
    const artifactSave: ArtifactSavePort = {
      saveArtifact: vi.fn().mockRejectedValue(new Error('/Users/klee/private/resume.pdf: ENOSPC'))
    }

    render(
      <WorkspaceApp artifactSave={artifactSave} initialPath="/resumes/res_mock_ai_platform/edit" />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')
    fireEvent.click(screen.getByRole('button', { name: '下载 PDF' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('PDF 保存失败，请重试。')
    expect(screen.queryByText(/Users\/klee/u)).not.toBeInTheDocument()
    expect(screen.getByTitle('简历 PDF 预览')).toHaveAttribute('src', 'about:blank#mock-resume-pdf')
  })

  it('准确播报浏览器只能确认下载已启动', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回浏览器已启动状态的测试宿主端口 / Test host port returning the browser-started state. */
    const artifactSave: ArtifactSavePort = {
      saveArtifact: vi.fn().mockResolvedValue({ status: 'started' })
    }

    render(
      <WorkspaceApp artifactSave={artifactSave} initialPath="/resumes/res_mock_ai_platform/edit" />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')
    fireEvent.click(screen.getByRole('button', { name: '下载 PDF' }))

    expect(await screen.findByText('PDF 下载已开始。')).toHaveAttribute('aria-live', 'polite')
  })

  it('以 polite 状态告知用户原生保存已取消', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回取消结果的测试宿主端口 / Test host port returning a cancellation result. */
    const artifactSave: ArtifactSavePort = {
      saveArtifact: vi.fn().mockResolvedValue({ status: 'cancelled' })
    }

    render(
      <WorkspaceApp artifactSave={artifactSave} initialPath="/resumes/res_mock_ai_platform/edit" />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')
    fireEvent.click(screen.getByRole('button', { name: '下载 PDF' }))

    expect(await screen.findByText('已取消保存。')).toHaveAttribute('aria-live', 'polite')
  })

  it('aborts PDF polling when the Resume page unmounts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 轮询调用收到的取消信号 / Cancellation signal received by polling. */
    let pollingSignal: AbortSignal | undefined
    vi.spyOn(resume, 'getResumeRenderJob').mockImplementation((_jobId, signal): Promise<never> => {
      pollingSignal = signal
      return new Promise<never>(() => undefined)
    })
    /** @brief 当前简历页面渲染结果 / Current Resume-page render result. */
    const view = render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await vi.waitFor((): void => expect(pollingSignal).toBeDefined())

    view.unmount()

    expect(pollingSignal?.aborted).toBe(true)
  })
})
