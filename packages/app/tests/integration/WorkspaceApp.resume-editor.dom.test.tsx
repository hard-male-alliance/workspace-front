import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HttpCommandOutcomeUnknownError, HttpProblemError } from '@ai-job-workspace/app/http'
import {
  MOCK_DAWN_TEMPLATE,
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  InMemoryResumeGateway
} from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 必须进入权威恢复屏障的简历写操作 / Resume mutations that must enter the authoritative-recovery barrier. */
const RESUME_OUTCOME_UNKNOWN_MUTATIONS = [
  ['section update', 'section-update'],
  ['section reorder', 'section-reorder'],
  ['section delete', 'section-delete'],
  ['quick template selection', 'template-select']
] as const

/** @brief 简历编辑器用户行为测试 / Resume-editor user-behaviour tests. */
describe('WorkspaceApp Resume editor', (): void => {
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

  it('preserves local section title and body drafts while the editor pane is collapsed', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
    const resume = new InMemoryResumeGateway()
    /** @brief 验证折叠期间没有把本地草稿提交给服务端 / Verify that collapsing does not submit browser-local drafts. */
    const update = vi.spyOn(resume, 'updateResumeSection')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 尚未保存的板块标题 / Unsaved section-title draft. */
    const title = screen.getByRole('textbox', { name: '区段标题' })
    /** @brief 尚未保存的板块正文 / Unsaved section-body draft. */
    const content = screen.getByRole('textbox', { name: '语义内容' })
    fireEvent.change(title, { target: { value: '尚未保存的标题' } })
    fireEvent.change(content, { target: { value: '尚未保存的正文' } })

    fireEvent.click(screen.getByRole('button', { name: '收起“内容编辑”窗口' }))
    expect(screen.queryByRole('region', { name: '内容编辑' })).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '展开“内容编辑”窗口' }))
    expect(screen.getByRole('textbox', { name: '区段标题' })).toHaveValue('尚未保存的标题')
    expect(screen.getByRole('textbox', { name: '语义内容' })).toHaveValue('尚未保存的正文')
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the assistant composer unavailable until the Agent message contract is connected', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('textbox', { name: '询问简历助手' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
  })

  it.each([412, 409] as const)(
    'locks stale resume writes after HTTP %i and reloads the authoritative revision',
    async (status) => {
      await setWorkspaceAppTestLocale('en-US')
      /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
      const resume = new InMemoryResumeGateway()
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
          retryable: true,
          retryAfterMs: null,
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
      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
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

  it.each(RESUME_OUTCOME_UNKNOWN_MUTATIONS)(
    'locks all Resume writes after an outcome-unknown %s and reloads authority before unlocking',
    async (_label, mutation): Promise<void> => {
      await setWorkspaceAppTestLocale('en-US')
      /** @brief 当前测试独享的简历 Gateway / Resume Gateway owned by the current test. */
      const resume = new InMemoryResumeGateway()
      /** @brief 用户首次载入的简历投影 / Resume projection initially loaded by the user. */
      const initial = await resume.getResumeEditor(MOCK_RESUME_ID)
      /** @brief reload 后返回的服务端权威投影 / Authoritative server projection returned after reload. */
      const authoritative = {
        ...initial,
        resume: { ...initial.resume, revision: 91 }
      }
      /** @brief reload 同步读取的模板清单 / Template catalog read during authoritative reload. */
      const templates = await resume.listTemplateManifests(initial.resume.locale)
      /** @brief 可观察的权威简历读取 / Observable authoritative Resume reads. */
      const getEditor = vi
        .spyOn(resume, 'getResumeEditor')
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(authoritative)
      /** @brief 可观察的权威模板读取 / Observable authoritative template reads. */
      const listTemplates = vi.spyOn(resume, 'listTemplateManifests').mockResolvedValue(templates)
      /** @brief 可观察的板块更新命令 / Observable section-update command. */
      const update = vi.spyOn(resume, 'updateResumeSection')
      /** @brief 可观察的板块排序命令 / Observable section-reorder command. */
      const reorder = vi.spyOn(resume, 'reorderResumeSections')
      /** @brief 可观察的板块删除命令 / Observable section-delete command. */
      const remove = vi.spyOn(resume, 'deleteResumeSection')
      /** @brief 可观察的快速模板切换命令 / Observable quick-template command. */
      const selectTemplate = vi.spyOn(resume, 'selectResumeTemplate')
      /** @brief 当前用例触发的唯一写命令 / Sole write command triggered by this case. */
      const command = {
        'section-delete': remove,
        'section-reorder': reorder,
        'section-update': update,
        'template-select': selectTemplate
      }[mutation]
      command.mockRejectedValue(new HttpCommandOutcomeUnknownError('network'))

      render(
        <WorkspaceApp
          gateways={createTestGateways({ resume })}
          initialPath="/resumes/res_mock_ai_platform/edit"
        />
      )
      await screen.findByRole('heading', { name: 'Klee Chen' })

      /** @brief 执行当前参数指定的用户写操作 / Perform the user mutation selected by the current parameter. */
      const triggerMutation = (): void => {
        switch (mutation) {
          case 'section-update': {
            /** @brief 语义内容编辑框 / Semantic-content editor. */
            const content = screen.getByRole('textbox', { name: 'Semantic content' })
            fireEvent.change(content, { target: { value: 'An unconfirmed local edit' } })
            fireEvent.blur(content)
            return
          }
          case 'section-reorder':
            fireEvent.click(screen.getByRole('button', { name: 'Move 职业摘要 down' }))
            return
          case 'section-delete': {
            /** @brief 需要二次确认的删除按钮 / Delete button requiring a second confirmation. */
            const deleteButton = screen.getByRole('button', { name: 'Delete 职业摘要' })
            fireEvent.click(deleteButton)
            fireEvent.click(deleteButton)
            return
          }
          case 'template-select': {
            /** @brief Editorial option 的复合模板身份 / Composite template identity carried by the Editorial option. */
            const editorialOption = screen.getByRole<HTMLOptionElement>('option', {
              name: 'Editorial'
            })
            fireEvent.change(
              screen.getByRole('combobox', { name: 'Quickly switch resume template' }),
              { target: { value: editorialOption.value } }
            )
            return
          }
        }
      }

      /** @brief 断言只有当前操作被提交一次 / Assert that only the selected command was submitted once. */
      const expectSingleSelectedWrite = (): void => {
        expect(update).toHaveBeenCalledTimes(mutation === 'section-update' ? 1 : 0)
        expect(reorder).toHaveBeenCalledTimes(mutation === 'section-reorder' ? 1 : 0)
        expect(remove).toHaveBeenCalledTimes(mutation === 'section-delete' ? 1 : 0)
        expect(selectTemplate).toHaveBeenCalledTimes(mutation === 'template-select' ? 1 : 0)
      }

      triggerMutation()

      /** @brief 根级未知结果恢复提示 / Root-level outcome-unknown recovery alert. */
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Resume operation result is unknown')
      expect(alert).toHaveTextContent(/reload.*before/i)
      expect(screen.getByRole('textbox', { name: 'Semantic content' })).toBeDisabled()
      expect(
        screen.getByRole('combobox', { name: 'Quickly switch resume template' })
      ).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move 职业摘要 down' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Delete 职业摘要' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Generate PDF preview' })).toBeDisabled()
      expectSingleSelectedWrite()

      triggerMutation()
      await Promise.resolve()
      expectSingleSelectedWrite()

      expect(getEditor).toHaveBeenCalledTimes(1)
      expect(listTemplates).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }))

      expect(await screen.findByText('Revision 91')).toBeInTheDocument()
      expect(getEditor).toHaveBeenCalledTimes(2)
      expect(listTemplates).toHaveBeenCalledTimes(2)
      expectSingleSelectedWrite()
      expect(screen.getByRole('textbox', { name: 'Semantic content' })).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'Quickly switch resume template' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Move 职业摘要 down' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Delete 职业摘要' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Generate PDF preview' })).toBeEnabled()
      if (mutation === 'section-update') {
        expect(screen.getByRole('textbox', { name: 'Semantic content' })).toHaveValue(
          'An unconfirmed local edit'
        )
      }
    }
  )

  it('保留明确可重试 503 失败的板块草稿，并允许用户原地重试', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 首次保存返回可重试 503、重试恢复真实实现的测试 Gateway / Test gateway whose first save returns retryable HTTP 503 and retry uses the real implementation. */
    const resume = new InMemoryResumeGateway()
    /** @brief 可观察的板块保存命令 / Observable section-save command. */
    const update = vi.spyOn(resume, 'updateResumeSection').mockRejectedValueOnce(
      new HttpProblemError({
        code: 'service.temporarily_unavailable',
        detail: 'POST https://private.example/resumes failed',
        requestId: null,
        retryable: true,
        retryAfterMs: 500,
        status: 503,
        title: 'Temporary backend overload'
      })
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })
    /** @brief 用户正在编辑的语义正文 / Semantic body edited by the user. */
    const content = screen.getByRole('textbox', { name: '语义内容' })

    fireEvent.change(content, { target: { value: '尚未由服务端确认的草稿' } })
    fireEvent.blur(content)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '板块修改尚未保存；你的输入仍保留在本页。'
    )
    expect(content).toHaveValue('尚未由服务端确认的草稿')
    expect(screen.queryByText(/private\.example/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await vi.waitFor((): void => expect(update).toHaveBeenCalledTimes(2))
    await vi.waitFor((): void => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(content).toHaveValue('尚未由服务端确认的草稿')
  })

  it('offers section ordering, deletion, and quick template selection in the workspace', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/resumes/res_mock_ai_platform/edit" />)
    await screen.findByRole('heading', { name: 'Klee Chen' })

    expect(screen.getByRole('button', { name: '下移职业摘要' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除职业摘要' })).toBeInTheDocument()
    /** @brief 快速模板选择器 / Quick-template selector. */
    const templateSelect = screen.getByRole('combobox', { name: '快速切换简历模板' })
    /** @brief 当前 Dawn option / Current Dawn option. */
    const dawnOption = screen.getByRole<HTMLOptionElement>('option', { name: 'Dawn' })
    /** @brief Editorial option / Editorial option. */
    const editorialOption = screen.getByRole<HTMLOptionElement>('option', { name: 'Editorial' })
    expect(templateSelect).toHaveValue(dawnOption.value)

    fireEvent.change(templateSelect, {
      target: { value: editorialOption.value }
    })
    expect(await screen.findByText('Editorial')).toBeInTheDocument()
  })

  it('loads a pinned historical manifest and switches by the full template identity', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前简历固定历史模板版本的测试 Gateway / Test gateway whose Resume is pinned to a historical template version. */
    const resume = new InMemoryResumeGateway()
    /** @brief 模板切换绑定的当前权威 revision / Current authoritative revision bound to the template change. */
    const current = await resume.getResumeEditor(MOCK_RESUME_ID)
    await resume.selectResumeTemplate({
      baseRevision: current.resume.revision,
      resumeId: MOCK_RESUME_ID,
      templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
    })
    /** @brief 可观察的精确版本读取 / Observable exact-version read. */
    const getTemplate = vi.spyOn(resume, 'getTemplateManifest')
    /** @brief 可观察的复合身份切换命令 / Observable composite-identity selection command. */
    const selectTemplate = vi.spyOn(resume, 'selectResumeTemplate')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/edit"
      />
    )
    await screen.findByRole('heading', { name: 'Klee Chen' })

    /** @brief 快速模板选择器 / Quick-template selector. */
    const templateSelect = screen.getByRole('combobox', { name: '快速切换简历模板' })
    /** @brief 历史版本 option / Historical-version option. */
    const historicalOption = screen.getByRole<HTMLOptionElement>('option', {
      name: MOCK_HISTORICAL_DAWN_TEMPLATE.name
    })
    /** @brief 同 ID 的最新版本 option / Latest-version option sharing the same ID. */
    const latestOption = screen.getByRole<HTMLOptionElement>('option', {
      name: MOCK_DAWN_TEMPLATE.name
    })

    expect(historicalOption.value).not.toBe(latestOption.value)
    expect(templateSelect).toHaveValue(historicalOption.value)
    expect(getTemplate).toHaveBeenCalledWith(
      MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      MOCK_HISTORICAL_DAWN_TEMPLATE.version
    )

    fireEvent.change(templateSelect, { target: { value: latestOption.value } })
    await vi.waitFor((): void => expect(selectTemplate).toHaveBeenCalledTimes(1))
    expect(selectTemplate).toHaveBeenCalledWith({
      baseRevision: 19,
      resumeId: MOCK_RESUME_ID,
      templateId: MOCK_DAWN_TEMPLATE.id,
      templateVersion: MOCK_DAWN_TEMPLATE.version
    })
  })
})
