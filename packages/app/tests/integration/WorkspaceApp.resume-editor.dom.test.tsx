import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HttpProblemError } from '@ai-job-workspace/app/http'
import { MOCK_RESUME_ID, InMemoryResumeGateway } from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

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

  it('保留未获服务端确认的板块草稿，并允许用户安全重试', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 首次保存失败、重试恢复真实实现的测试 Gateway / Test gateway whose first save fails and retry uses the real implementation. */
    const resume = new InMemoryResumeGateway()
    /** @brief 可观察的板块保存命令 / Observable section-save command. */
    const update = vi
      .spyOn(resume, 'updateResumeSection')
      .mockRejectedValueOnce(new TypeError('POST https://private.example/resumes failed'))

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
    expect(screen.getByRole('combobox', { name: '快速切换简历模板' })).toHaveValue('tpl_mock_dawn')

    fireEvent.change(screen.getByRole('combobox', { name: '快速切换简历模板' }), {
      target: { value: 'tpl_mock_editorial' }
    })
    expect(await screen.findByText('Editorial')).toBeInTheDocument()
  })
})
