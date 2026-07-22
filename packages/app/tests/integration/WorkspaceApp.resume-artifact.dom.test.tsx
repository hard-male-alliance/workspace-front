import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HttpCommandOutcomeUnknownError } from '@ai-job-workspace/app/http'
import { InMemoryResumeGateway, MOCK_TEMPLATE_MANIFESTS } from '@ai-job-workspace/app/testing'
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

    /** @brief 只允许被严格 sandbox 的 PDF 预览框 / PDF preview frame allowed only under a strict sandbox. */
    const preview = await screen.findByTitle('简历 PDF 预览')
    expect(preview).toHaveAttribute('src', 'about:blank#mock-resume-pdf')
    expect(preview).toHaveAttribute('sandbox', '')
    expect(screen.getByRole('button', { name: '下载 PDF' })).toBeInTheDocument()
  })

  it('在同一 React commit 内只接受一次 Render 启动意图', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的 Resume gateway / Resume gateway owned by this test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 保持待定以暴露同步重入窗口的启动观测器 / Start observer kept pending to expose the synchronous re-entry window. */
    const startRender = vi
      .spyOn(resume, 'startResumePdfRender')
      .mockImplementation(() => new Promise<never>(() => undefined))
    /** @brief 当前页面视图 / Current page view. */
    const view = render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 同一 commit 内被双击的生成按钮 / Render button double-invoked within one commit. */
    const renderButton = screen.getByRole('button', { name: '生成 PDF 预览' })
    act((): void => {
      renderButton.click()
      renderButton.click()
    })

    expect(startRender).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('以相同命令身份确认结果未知的 PDF 生成请求', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 替换的 Render Job 启动实现 / Render-Job start implementation before spying. */
    const startRenderJob = resume.startResumePdfRender.bind(resume)
    /** @brief 可观测并首次返回结果未知的启动命令 / Observable start command whose first response has an unknown outcome. */
    const startRender = vi
      .spyOn(resume, 'startResumePdfRender')
      .mockImplementationOnce(async (input): Promise<never> => {
        await startRenderJob(input)
        throw new HttpCommandOutcomeUnknownError('network')
      })
      .mockImplementation(startRenderJob)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    /** @brief 对用户展示的安全结果未知提示 / Safe outcome-unknown notice shown to the user. */
    const outcomeUnknown = await screen.findByRole('alert')
    expect(outcomeUnknown).toHaveTextContent(/PDF/u)
    expect(outcomeUnknown).toHaveTextContent(/无法确认|可能/u)
    expect(outcomeUnknown).not.toHaveTextContent('预览生成失败，请重试')

    /** @brief 首次提交的不可变命令身份 / Immutable command identity submitted the first time. */
    const firstStart = startRender.mock.calls.at(0)?.[0]
    if (firstStart === undefined) throw new Error('Expected the initial PDF Render command.')
    expect(firstStart.commandId).toEqual(expect.any(String))

    fireEvent.click(screen.getByRole('button', { name: '收起“预览”窗口' }))
    expect(screen.queryByRole('region', { name: '语义内容预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认 PDF 生成结果' })).not.toBeInTheDocument()
    expect(startRender).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '展开“预览”窗口' }))
    expect(screen.getByRole('button', { name: '确认 PDF 生成结果' })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/无法确认|可能/u)
    expect(startRender).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '确认 PDF 生成结果' }))

    expect(await screen.findByTitle('简历 PDF 预览')).toHaveAttribute(
      'src',
      'about:blank#mock-resume-pdf'
    )
    expect(startRender).toHaveBeenCalledTimes(2)
    /** @brief 确认操作重用的命令身份 / Command identity reused by the confirmation action. */
    const confirmationStart = startRender.mock.calls.at(1)?.[0]
    expect(confirmationStart).toMatchObject({
      commandId: firstStart.commandId,
      resumeId: firstStart.resumeId,
      resumeRevision: firstStart.resumeRevision
    })
  })

  it('轮询暂时失败后只继续查询已知 PDF Render Job', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 替换的轮询实现 / Polling implementation before spying. */
    const getRenderJob = resume.getResumeRenderJob.bind(resume)
    /** @brief PDF Render Job 启动观测器 / PDF Render Job start observer. */
    const startRender = vi.spyOn(resume, 'startResumePdfRender')
    /** @brief 首次网络失败、后续恢复的轮询观测器 / Poll observer that fails once and then recovers. */
    const getRender = vi
      .spyOn(resume, 'getResumeRenderJob')
      .mockRejectedValueOnce(new TypeError('private upstream URL must not reach the UI'))
      .mockImplementation(getRenderJob)

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByRole('button', { name: '继续查询 PDF' })).toBeEnabled()
    expect(screen.getByRole('alert')).not.toHaveTextContent('private upstream URL')
    expect(startRender).toHaveBeenCalledTimes(1)
    expect(getRender).toHaveBeenCalledTimes(1)
    /** @brief 已由服务端确认的 Render Job ID / Render Job ID already confirmed by the service. */
    const confirmedJobId = getRender.mock.calls.at(0)?.[0]

    fireEvent.click(screen.getByRole('button', { name: '继续查询 PDF' }))

    expect(await screen.findByTitle('简历 PDF 预览')).toHaveAttribute(
      'src',
      'about:blank#mock-resume-pdf'
    )
    expect(startRender).toHaveBeenCalledTimes(1)
    expect(getRender).toHaveBeenCalledTimes(2)
    expect(getRender.mock.calls.at(1)?.[0]).toBe(confirmedJobId)
  })

  it('aborts the old generation and never restores its PDF after an authoritative Resume edit', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief Render Job 的测试类型 / Render Job type used by this test. */
    type RenderJob = Awaited<ReturnType<InMemoryResumeGateway['getResumeRenderJob']>>
    /** @brief 未被 spy 替换的轮询实现 / Polling implementation before spying. */
    const getRenderJob = resume.getResumeRenderJob.bind(resume)
    /** @brief 首轮生成的旧 revision 产物 / Old-revision artifact completed by the first render. */
    let staleCompletedJob: RenderJob | undefined
    /** @brief 第二轮旧 generation 轮询的兑现函数 / Resolver for the second old-generation poll. */
    let resolveStalePoll: ((job: RenderJob) => void) | undefined
    /** @brief 第二轮旧 generation 轮询的取消信号 / Abort signal for the second old-generation poll. */
    let stalePollingSignal: AbortSignal | undefined
    vi.spyOn(resume, 'getResumeRenderJob').mockImplementation(
      async (jobId, signal): Promise<RenderJob> => {
        if (staleCompletedJob === undefined) {
          staleCompletedJob = await getRenderJob(jobId, signal)
          return staleCompletedJob
        }
        stalePollingSignal = signal
        return new Promise<RenderJob>((resolve): void => {
          resolveStalePoll = resolve
        })
      }
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')

    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await vi.waitFor((): void => expect(stalePollingSignal).toBeDefined())
    /** @brief 触发新权威 revision 的语义内容编辑框 / Semantic-content editor that creates a new authoritative revision. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '新的权威简历内容' } })
    fireEvent.blur(content)

    await vi.waitFor((): void => {
      expect(screen.getByText('版本 19')).toBeInTheDocument()
      expect(stalePollingSignal?.aborted).toBe(true)
    })
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下载 PDF' })).not.toBeInTheDocument()

    if (staleCompletedJob === undefined) throw new Error('Expected the first Render Job to finish.')
    resolveStalePoll?.(staleCompletedJob)
    await vi.waitFor((): void => {
      expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '下载 PDF' })).not.toBeInTheDocument()
    })
  })

  it('removes a completed PDF as soon as the Resume revision changes', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))
    await screen.findByTitle('简历 PDF 预览')

    /** @brief 触发新 revision 的语义内容编辑框 / Semantic-content editor that triggers a new revision. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(content, { target: { value: '更新后的权威简历内容' } })
    fireEvent.blur(content)

    expect(await screen.findByText('版本 19')).toBeInTheDocument()
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下载 PDF' })).not.toBeInTheDocument()
  })

  it('rejects a completed artifact whose Resume revision does not match the editor', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回错误 artifact revision 的测试 Gateway / Test Gateway returning an artifact for the wrong revision. */
    const resume = new InMemoryResumeGateway()
    /** @brief 未被 spy 替换的轮询实现 / Polling implementation before spying. */
    const getRenderJob = resume.getResumeRenderJob.bind(resume)
    vi.spyOn(resume, 'getResumeRenderJob').mockImplementation(async (jobId, signal) => {
      /** @brief 后端完成但 artifact 身份陈旧的 Render Job / Completed job whose artifact identity is stale. */
      const completed = await getRenderJob(jobId, signal)
      return {
        ...completed,
        artifacts: completed.artifacts.map((artifact) => ({
          ...artifact,
          resumeRevision: artifact.resumeRevision - 1
        }))
      }
    })

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法生成 PDF 预览')
    expect(alert).toHaveTextContent('应用遇到未预期的问题')
    expect(screen.queryByTitle('简历 PDF 预览')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下载 PDF' })).not.toBeInTheDocument()
  })

  it('does not offer a PDF operation unsupported by the selected backend template', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 声明模板不支持 PDF 的测试 Gateway / Test Gateway whose templates do not support PDF. */
    const resume = new InMemoryResumeGateway()
    vi.spyOn(resume, 'listTemplatePage').mockImplementation((input) => {
      input.signal.throwIfAborted()
      return Promise.resolve({
        hasMore: false,
        items: MOCK_TEMPLATE_MANIFESTS.map((template) => ({
          ...template,
          supportedOutputFormats: ['png']
        })),
        nextCursor: null
      })
    })
    /** @brief PDF Render Job 启动观测器 / PDF Render Job start observer. */
    const startRender = vi.spyOn(resume, 'startResumePdfRender')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('button', { name: '生成 PDF 预览' })).toBeDisabled()
    expect(screen.getByText('当前模板不支持 PDF 输出。')).toBeInTheDocument()
    expect(startRender).not.toHaveBeenCalled()
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

    /** @brief 同一 commit 内被双击的保存按钮 / Save button double-invoked within one commit. */
    const saveButton = screen.getByRole('button', { name: '下载 PDF' })
    act((): void => {
      saveButton.click()
      saveButton.click()
    })

    expect(screen.getByRole('button', { name: '正在保存 PDF…' })).toBeDisabled()
    expect(saveArtifact).toHaveBeenCalledTimes(1)
    expect(saveArtifact).toHaveBeenCalledWith({
      artifactId: 'artifact_mock_18',
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

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法保存 PDF')
    expect(alert).toHaveTextContent('应用遇到未预期的问题')
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
