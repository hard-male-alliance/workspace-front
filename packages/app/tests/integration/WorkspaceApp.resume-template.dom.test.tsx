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

/** @brief 简历模板与版式用户行为 / Resume-template and layout behaviours. */
describe('WorkspaceApp Resume template', (): void => {
  it('presents templates as a focused list with one selected preview', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    /** @brief 可观察模板保存命令的测试 Resume gateway / Test Resume gateway exposing the template-save command. */
    const resume = new InMemoryResumeGateway()
    /** @brief 模板设置保存调用 / Template-settings persistence call. */
    const updateTemplateSettings = vi.spyOn(resume, 'updateTemplateSettings')
    /** @brief 模板页面根容器 / Template-page root container. */
    const { container } = render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
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

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await vi.waitFor((): void => expect(updateTemplateSettings).toHaveBeenCalledOnce())
    expect(updateTemplateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId: MOCK_RESUME_ID,
        templateId: 'tpl_mock_editorial'
      })
    )
    expect(await screen.findByText('模板与样式设置已保存。')).toBeInTheDocument()
    expect(screen.queryByText('演示数据')).not.toBeInTheDocument()
  })

  it('模板并发冲突时重新加载权威版本而不重放陈旧写入', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回并发冲突的模板 Gateway / Template gateway returning a concurrency conflict. */
    const resume = new InMemoryResumeGateway()
    /** @brief 被拒绝的陈旧模板 mutation / Rejected stale template mutation. */
    const update = vi.spyOn(resume, 'updateTemplateSettings').mockRejectedValue(
      new HttpProblemError({
        code: 'resume.precondition_failed',
        detail: 'private stale revision detail',
        requestId: 'req_template_1234',
        retryable: true,
        retryAfterMs: null,
        status: 412,
        title: 'private conflict title'
      })
    )
    /** @brief 权威模板设置重载调用 / Authoritative template-settings reload call. */
    const reload = vi.spyOn(resume, 'getTemplateSettings')

    render(
      <WorkspaceApp
        gateways={createTestGateways({ resume })}
        initialPath="/resumes/res_mock_ai_platform/template"
      />
    )
    await screen.findByRole('heading', { name: '模板与版式' })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('内容已在其他位置更新')
    expect(screen.queryByText(/private conflict|private stale/u)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新加载服务器版本' }))

    await vi.waitFor((): void => expect(reload).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
