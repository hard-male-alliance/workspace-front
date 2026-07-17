import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { appI18n, appI18nReady } from '../i18n'
import { WorkspaceApp } from './WorkspaceApp'

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
    expect(screen.getByRole('link', { name: '简历' })).toHaveAttribute(
      'href',
      '/resumes/res_mock_ai_platform/edit'
    )
    expect(screen.getByRole('link', { name: '模拟面试' })).toHaveAttribute(
      'href',
      '/interviews/int_mock_system_design'
    )
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.queryByRole('link', { name: '可见性' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '状态' })).not.toBeInTheDocument()
  })

  it('renders English chrome and retains accessible names for compact navigation', async (): Promise<void> => {
    await appI18nReady
    await appI18n.changeLanguage('en-US')

    render(<WorkspaceApp initialPath="/" />)

    expect(await screen.findByRole('heading', { name: "Today's workspace" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      '/resumes/res_mock_ai_platform/edit'
    )
    expect(screen.getByRole('link', { name: 'Mock interview' })).toHaveAttribute(
      'href',
      '/interviews/int_mock_system_design'
    )
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('Career Workspace')
  })

  it('opens the resume assistant as a drawer and applies a proposal only after confirmation', async (): Promise<void> => {
    await resetChineseLocale()

    /** @brief 当前渲染容器 / Current render container. */
    const { container } = render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)

    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(container.querySelectorAll('.aw-editor-workspace > .aw-editor-pane')).toHaveLength(2)
    const resumePreview = screen.getByRole('article', { name: '简历 PDF 视觉预览（Mock）' })
    expect(resumePreview).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '简历助手' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开简历助手' }))
    expect(screen.getByRole('complementary', { name: '简历助手' })).toBeInTheDocument()
    expect(screen.getByText('建议修改（需要你的审批）')).toBeInTheDocument()
    expect(
      within(resumePreview).queryByText('将推理延迟从 1.8s 降至 620ms')
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '应用建议' }))
    expect(screen.getAllByText('将推理延迟从 1.8s 降至 620ms')).toHaveLength(2)
    expect(screen.getByText('已应用到本地草稿（Mock）')).toBeInTheDocument()

    /** @brief 移动端编辑 tab / Compact-layout editing tab. */
    const editingTab = screen.getByRole('button', { name: '内容' })
    fireEvent.click(editingTab)
    expect(container.querySelector('.aw-editor-page')).toHaveClass('aw-editor-page--mobile-edit')

    /** @brief 本地草稿标题输入 / Local draft-title input. */
    const sectionTitleInput = screen.getByLabelText('区段标题')
    fireEvent.change(sectionTitleInput, { target: { value: '本地草稿摘要' } })
    expect(screen.getByRole('heading', { name: '本地草稿摘要' })).toBeInTheDocument()
    expect(screen.getByText('本地草稿预览（Mock）')).toBeInTheDocument()

    /** @brief 富文本编辑器 DOM / Rich-text editor DOM. */
    const richTextEditor = screen.getByRole('textbox', { name: '语义内容' })
    richTextEditor.textContent = '本地富文本草稿内容'
    fireEvent.input(richTextEditor)
    expect(screen.getAllByText('本地富文本草稿内容')).toHaveLength(2)
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

  it('renders template intent, live interview, report, knowledge and visibility routes', async (): Promise<void> => {
    await resetChineseLocale()

    /** @brief 待验收路由与标题 / Acceptance routes and headings. */
    const routeCases: readonly { readonly path: string; readonly heading: string }[] = [
      { path: '/resumes/res_mock_ai_platform/template', heading: '模板与版式' },
      { path: '/interviews/int_mock_system_design', heading: '数字人模拟面试' },
      { path: '/interviews/int_mock_system_design/summary', heading: '面试总结' },
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

  it('gives local Mock controls explicit feedback without creating a transport', async (): Promise<void> => {
    await resetChineseLocale()

    /** @brief 面试页容器 / Interview-page container. */
    const interviewRender = render(
      <WorkspaceApp initialPath="/interviews/int_mock_system_design" />
    )

    await screen.findByRole('heading', { name: '数字人模拟面试' })
    expect(screen.getByText('文字 Mock 练习')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '当前问题' })).toBeInTheDocument()
    expect(screen.getByText('第 1 / 5 题')).toBeInTheDocument()
    expect(screen.getByText('客户端数字人渲染')).toBeInTheDocument()
    expect(screen.queryByText('client_render')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '共享屏幕（Mock）' }))
    expect(screen.getByText('已请求本地屏幕共享（Mock；未采集或传输媒体）。')).toBeInTheDocument()
    interviewRender.unmount()

    /** @brief 总结页容器 / Summary-page container. */
    const summaryRender = render(
      <WorkspaceApp initialPath="/interviews/int_mock_system_design/summary" />
    )

    await screen.findByRole('heading', { name: '面试总结' })
    const prioritySection = screen.getByTestId('report-priority')
    const evidenceSection = screen.getByTestId('report-evidence')
    expect(
      prioritySection.compareDocumentPosition(evidenceSection) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByText('高优先级')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存练习计划' }))
    expect(screen.getByText('练习计划已保存到本地演示状态')).toBeInTheDocument()
    summaryRender.unmount()
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
