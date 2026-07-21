import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactSavePort, SaveArtifactResult } from '@ai-job-workspace/platform'

import { HttpProblemError } from '../http'
import { MOCK_RESUME_ID, MockResumeGateway } from '../testing'
import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 简历工作区用户行为测试 / Resume-workspace user-behaviour tests. */
describe('WorkspaceApp resume workflow', (): void => {
  it('renders three persistent resume window headers with equal desktop panels and separators', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)

    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('toolbar', { name: '简历窗口控制' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 对话' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '内容编辑' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PDF 预览' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'AI 对话' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '内容编辑' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'PDF 预览' })).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('allows every resume window to collapse while preserving all three title bars', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.click(screen.getByRole('button', { name: '收起“AI 对话”窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '收起“内容编辑”窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '收起“PDF 预览”窗口' }))

    expect(screen.queryByRole('complementary', { name: 'AI 对话' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '内容编辑' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'PDF 预览' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“AI 对话”窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“内容编辑”窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“PDF 预览”窗口' })).toBeInTheDocument()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })

  it('keeps an AI Proposal pending until the student explicitly accepts it', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.change(screen.getByRole('textbox', { name: '询问简历助手' }), {
      target: { value: '把职业摘要改得更突出量化成果' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(await screen.findByRole('heading', { name: '职业摘要修改建议' })).toBeInTheDocument()
    expect(
      screen.getByDisplayValue(
        '面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '接受建议' }))
    expect(
      await screen.findByDisplayValue(
        '将模型推理延迟从 1.8 秒降低至 620 毫秒，并建立可复用的 AI 平台能力。'
      )
    ).toBeInTheDocument()
  })

  it('rejects a pending AI Proposal without changing the Resume', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })
    fireEvent.change(screen.getByRole('textbox', { name: '询问简历助手' }), {
      target: { value: '把职业摘要改得更突出量化成果' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    await screen.findByRole('heading', { name: '职业摘要修改建议' })

    fireEvent.click(screen.getByRole('button', { name: '拒绝建议' }))

    expect(
      await screen.findByDisplayValue(
        '面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '职业摘要修改建议' })).not.toBeInTheDocument()
  })

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

  it.each([412, 409] as const)(
    'locks stale resume writes after HTTP %i and reloads the authoritative revision',
    async (status) => {
      await setWorkspaceAppTestLocale('en-US')
      /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
      const resume = new MockResumeGateway()
      await resume.createResumeProposal({
        message: 'Make the summary more specific',
        resumeId: MOCK_RESUME_ID
      })
      /** @brief 用户首次载入的简历投影 / Resume projection initially loaded by the user. */
      const initial = await resume.getResumeEditor(MOCK_RESUME_ID)
      /** @brief 服务端权威简历投影 / Authoritative server Resume projection. */
      const authoritative = {
        ...initial,
        resume: { ...initial.resume, revision: status === 412 ? 99 : 77 }
      }
      vi.spyOn(resume, 'getResumeEditor')
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(authoritative)
      /** @brief 被拒绝的陈旧写入 / Rejected stale write. */
      const update = vi.spyOn(resume, 'updateResumeSection').mockRejectedValue(
        new HttpProblemError({
          code: status === 412 ? 'resume.precondition_failed' : 'resume.conflict',
          detail: 'The Resume ETag is stale.',
          requestId: null,
          status,
          title: 'Resume changed elsewhere'
        })
      )

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })
      /** @brief 语义内容编辑框 / Semantic-content editor. */
      const content = screen.getByRole('textbox', { name: 'Semantic content' })
      fireEvent.change(content, { target: { value: 'A stale local edit' } })
      fireEvent.blur(content)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This resume changed on the server. Reload the authoritative version before editing.'
      )
      expect(content).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Accept suggestion' })).toBeDisabled()
      expect(
        screen.getByRole('combobox', { name: 'Quickly switch resume template' })
      ).toBeDisabled()
      expect(screen.getByText('Revision 18')).toBeInTheDocument()
      expect(update).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))
      expect(await screen.findByText(`Revision ${status === 412 ? 99 : 77}`)).toBeInTheDocument()
      expect(screen.queryByText('A stale local edit')).not.toBeInTheDocument()
    }
  )

  it('aborts PDF polling when the Resume page unmounts', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new MockResumeGateway()
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

  it('offers section ordering, deletion, and quick template selection in the workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('button', { name: '下移职业摘要' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除职业摘要' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '快速切换简历模板' })).toHaveValue('tpl_mock_dawn')

    fireEvent.change(screen.getByRole('combobox', { name: '快速切换简历模板' }), {
      target: { value: 'tpl_mock_editorial' }
    })
    expect(await screen.findByText('Editorial')).toBeInTheDocument()
  })

  it('presents templates as a focused list with one selected preview', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 模板页面根容器 / Template-page root container. */
    const { container } = render(
      <WorkspaceApp initialPath="/resumes/res_mock_ai_platform/template" />
    )

    expect(await screen.findByRole('heading', { name: '模板与版式' })).toBeInTheDocument()
    expect(container.querySelector('.aw-template-list')).toBeInTheDocument()
    expect(container.querySelector('.aw-template-preview')).toBeInTheDocument()

    /** @brief Editorial 模板选择按钮 / Editorial template selection button. */
    const editorialTemplate = screen.getByRole('button', { name: /Editorial/ })
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(editorialTemplate)
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Editorial')).toHaveLength(2)
  })
})
