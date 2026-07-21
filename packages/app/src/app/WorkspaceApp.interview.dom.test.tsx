import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 模拟面试用户行为测试 / Mock-interview user-behaviour tests. */
describe('WorkspaceApp interview workflow', (): void => {
  it('opens the interview hub with a new-interview entry and completed history', async () => {
    await setWorkspaceAppTestLocale('zh-SG')

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
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/new" />)

    expect(await screen.findByRole('heading', { name: '配置模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '目标岗位' })).toHaveValue('AI Platform Engineer')

    /** @brief 默认选中的知识来源选项 / Knowledge-source options selected by default. */
    const knowledgeOptions = await screen.findAllByRole('checkbox')
    expect(knowledgeOptions.length).toBeGreaterThan(0)
    expect(knowledgeOptions.every((option) => option.hasAttribute('checked'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '开始面试' }))
    expect(await screen.findByRole('heading', { name: '模拟面试进行中' })).toBeInTheDocument()
  })

  it('allows a student to enter a target role that is not in the saved list', async () => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/new" />)

    /** @brief 已保存目标岗位选择框 / Saved-target-role selector. */
    const targetRole = await screen.findByRole('combobox', { name: '目标岗位' })
    fireEvent.change(targetRole, { target: { value: '__custom__' } })

    /** @brief 自定义目标岗位输入框 / Custom-target-role input. */
    const customRole = screen.getByRole('textbox', { name: '手动输入目标岗位' })
    fireEvent.change(customRole, { target: { value: '前端开发实习生' } })

    expect(customRole).toHaveValue('前端开发实习生')
    expect(screen.getByRole('button', { name: '开始面试' })).toBeEnabled()
  })

  it('keeps the transcript read-only until the student submits and AI ends the interview', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

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
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design" />)
    await screen.findByRole('heading', { name: '模拟面试进行中' })

    fireEvent.click(screen.getByRole('button', { name: '退出本次练习' }))

    expect(screen.getByRole('dialog', { name: '退出本次练习？' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '确认退出' })).toHaveAttribute('href', '/interviews')
  })

  it('explains the interview score with dimensions, evidence, and next practice actions', async () => {
    await setWorkspaceAppTestLocale('zh-SG')

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
})
