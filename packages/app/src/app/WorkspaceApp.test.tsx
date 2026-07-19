import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { appI18n, appI18nReady } from '../i18n'
import { WorkspaceApp } from './WorkspaceApp'
import {
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from '../infrastructure/mock'

/** @brief 每个测试后的 DOM 清理 / DOM cleanup after every test. */
afterEach((): void => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

/**
 * @brief 将共享 i18n 重置为中文 / Reset shared i18n to Chinese.
 * @return 语言重置完成 Promise / Promise fulfilled after locale reset.
 */
async function resetChineseLocale(): Promise<void> {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
}

/** @brief 共享应用路由与结构测试 / Shared application routing and structure tests. */
describe('WorkspaceApp', (): void => {
  it('renders the shared workspace home through Mock gateways', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续编辑简历' })).toHaveAttribute(
      'href',
      '/resumes/res_mock_ai_platform/edit'
    )
  })

  it('starts in dark mode and lets the student switch to the light theme locally', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/" />)

    await screen.findByRole('heading', { name: '今日工作台' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    fireEvent.click(screen.getByRole('button', { name: '切换为浅色主题' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('inkwell-theme')).toBe('light')
  })

  it('presents the action-first dashboard and keeps every existing workspace area reachable', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: '今日工作台' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日最重要的事' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '继续处理' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近活动' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '简历' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: '模拟面试' })).toHaveAttribute('href', '/interviews')
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.queryByRole('link', { name: '可见性' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '状态' })).not.toBeInTheDocument()
  })

  it('renders English chrome and retains accessible names for compact navigation', async (): Promise<void> => {
    await appI18nReady
    await appI18n.changeLanguage('en-US')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: "Today's workspace" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/resumes')
    expect(screen.getByRole('link', { name: 'Mock interview' })).toHaveAttribute(
      'href',
      '/interviews'
    )
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('Career Workspace')
  })

  it('renders three persistent resume window headers with equal desktop panels and separators', async (): Promise<void> => {
    await resetChineseLocale()

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
    await resetChineseLocale()

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
    await resetChineseLocale()

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
    await resetChineseLocale()

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
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    fireEvent.click(screen.getByRole('button', { name: '生成 PDF 预览' }))

    expect(await screen.findByTitle('简历 PDF 预览')).toHaveAttribute(
      'src',
      'about:blank#mock-resume-pdf'
    )
    expect(screen.getByRole('link', { name: '下载 PDF' })).toHaveAttribute(
      'href',
      'about:blank#mock-resume-pdf'
    )
  })

  it('aborts PDF polling when the Resume page unmounts', async (): Promise<void> => {
    await resetChineseLocale()
    const resume = new MockResumeGateway()
    let pollingSignal: AbortSignal | undefined
    vi.spyOn(resume, 'getResumeRenderJob').mockImplementation((_jobId, signal): Promise<never> => {
      pollingSignal = signal
      return new Promise<never>(() => undefined)
    })
    const view = render(
      <WorkspaceApp
        gateways={{
          interview: new MockInterviewGateway(),
          knowledge: new MockKnowledgeGateway(),
          resume,
          workspace: new MockWorkspaceGateway()
        }}
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
    await resetChineseLocale()

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
    await resetChineseLocale()

    const { container } = render(
      <WorkspaceApp initialPath="/resumes/res_mock_ai_platform/template" />
    )

    expect(await screen.findByRole('heading', { name: '模板与版式' })).toBeInTheDocument()
    expect(container.querySelector('.aw-template-list')).toBeInTheDocument()
    expect(container.querySelector('.aw-template-preview')).toBeInTheDocument()

    const editorialTemplate = screen.getByRole('button', { name: /Editorial/ })
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(editorialTemplate)
    expect(editorialTemplate).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Editorial')).toHaveLength(2)
  })

  it('renders template, interview, report, knowledge and visibility routes', async (): Promise<void> => {
    await resetChineseLocale()

    /** @brief 待验收路由与标题 / Acceptance routes and headings. */
    const routeCases: readonly { readonly path: string; readonly heading: string }[] = [
      { path: '/resumes/res_mock_ai_platform/template', heading: '模板与版式' },
      { path: '/interviews/int_mock_system_design', heading: '模拟面试进行中' },
      { path: '/interviews/int_mock_system_design/summary', heading: '面试分析' },
      { path: '/knowledge', heading: '个人记忆与知识库' },
      { path: '/knowledge/ks_mock_git/visibility', heading: 'Agent 可见性' }
    ]

    for (const routeCase of routeCases) {
      /** @brief 当前路由容器 / Current route container. */
      const currentRender = render(<WorkspaceApp initialPath={routeCase.path} />)

      expect(await screen.findByRole('heading', { name: routeCase.heading })).toBeInTheDocument()
      currentRender.unmount()
    }
  })

  it('keeps every Mock knowledge-source visibility route reachable', async (): Promise<void> => {
    await resetChineseLocale()

    /** @brief 所有可见性卡片会链接到的来源 ID / Source IDs linked from visibility cards. */
    const sourceIds = ['ks_mock_resume', 'ks_mock_git', 'ks_mock_blog', 'ks_mock_file'] as const

    for (const sourceId of sourceIds) {
      /** @brief 当前来源页面容器 / Current source-page container. */
      const currentRender = render(
        <WorkspaceApp initialPath={`/knowledge/${sourceId}/visibility`} />
      )

      expect(await screen.findByRole('heading', { name: 'Agent 可见性' })).toBeInTheDocument()
      currentRender.unmount()
    }
  })

  it('opens the interview hub with a new-interview entry and completed history', async () => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews" />)

    expect(await screen.findByRole('heading', { name: '模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '开始新面试' })).toHaveAttribute(
      'href',
      '/interviews/new'
    )
    expect(screen.getByText('AI Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
  })

  it('starts an interview from a compact setup form with knowledge selected by default', async () => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews/new" />)

    expect(await screen.findByRole('heading', { name: '配置模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '目标岗位' })).toHaveValue('AI Platform Engineer')

    const knowledgeOptions = await screen.findAllByRole('checkbox')
    expect(knowledgeOptions.length).toBeGreaterThan(0)
    expect(knowledgeOptions.every((option) => option.hasAttribute('checked'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '开始面试' }))
    expect(await screen.findByRole('heading', { name: '模拟面试进行中' })).toBeInTheDocument()
  })

  it('allows a student to enter a target role that is not in the saved list', async () => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews/new" />)

    const targetRole = await screen.findByRole('combobox', { name: '目标岗位' })
    fireEvent.change(targetRole, { target: { value: '__custom__' } })

    const customRole = screen.getByRole('textbox', { name: '手动输入目标岗位' })
    fireEvent.change(customRole, { target: { value: '前端开发实习生' } })

    expect(customRole).toHaveValue('前端开发实习生')
    expect(screen.getByRole('button', { name: '开始面试' })).toBeEnabled()
  })

  it('keeps the transcript read-only until the student submits and AI ends the interview', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design" />)

    await screen.findByRole('heading', { name: '模拟面试进行中' })
    expect(screen.getByText('持续监听中；转写只读，无法编辑或撤回。')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Mock 不采集真实音频')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '结束录音并提交' }))

    expect(await screen.findByText('AI 已完成本次面试')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /结束面试并查看分析/ })).toHaveAttribute(
      'href',
      '/interviews/int_mock_system_design/summary'
    )
  })

  it('requires confirmation before leaving an unfinished interview', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design" />)
    await screen.findByRole('heading', { name: '模拟面试进行中' })

    fireEvent.click(screen.getByRole('button', { name: '退出本次练习' }))

    expect(screen.getByRole('dialog', { name: '退出本次练习？' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '确认退出' })).toHaveAttribute('href', '/interviews')
  })

  it('explains the interview score with dimensions, evidence, and next practice actions', async () => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design/summary" />)

    await screen.findByRole('heading', { name: '面试分析' })
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '能力维度' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '面试能力维度评分' })).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: '评分证据' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '下一次练习' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回面试记录' })).toHaveAttribute(
      'href',
      '/interviews'
    )
    expect(screen.getByRole('link', { name: '再练一次' })).toHaveAttribute(
      'href',
      '/interviews/new'
    )
  })

  it('filters knowledge sources locally and keeps source details in the knowledge workflow', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/knowledge" />)

    await screen.findByRole('heading', { name: '个人记忆与知识库' })
    expect(screen.getByRole('heading', { name: '来源详情' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '筛选知识来源' }), {
      target: { value: 'portfolio-engineering' }
    })

    expect(screen.getAllByText('portfolio-engineering')).toHaveLength(2)
    expect(screen.queryByText('AI 平台工程师 · 中文简历')).not.toBeInTheDocument()
  })

  it('localizes visibility policy enums instead of rendering transport values', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/knowledge/ks_mock_git/visibility" />)

    await screen.findByRole('heading', { name: 'Agent 可见性' })
    expect(screen.getByText('权限概览')).toBeInTheDocument()
    expect(screen.getByText('机密')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(screen.getByText('私有部署')).toBeInTheDocument()
    expect(screen.queryByText('confidential')).not.toBeInTheDocument()
    expect(screen.queryByText('private_deployment')).not.toBeInTheDocument()
  })

  it('makes empty, loading and error states available for visual acceptance', async (): Promise<void> => {
    await resetChineseLocale()

    render(<WorkspaceApp initialPath="/states" />)

    expect(screen.getByText('仅供开发与验收')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '从一个小动作开始' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
