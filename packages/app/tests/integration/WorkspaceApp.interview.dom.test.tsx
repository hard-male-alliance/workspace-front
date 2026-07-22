import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InMemoryInterviewGateway } from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 面试练习用户行为测试 / Interview-practice user-behaviour tests. */
describe('WorkspaceApp interview workflow', (): void => {
  it('opens the interview hub with a new-interview entry and completed history', async () => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews" />)

    expect(await screen.findByRole('heading', { name: '模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '开始新面试' })).toHaveAttribute(
      'href',
      '/interviews/new'
    )
    expect(await screen.findByText('AI Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
  })

  it('starts an interview from a compact setup form with knowledge selected by default', async () => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/new" />)

    expect(await screen.findByRole('heading', { name: '配置模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '目标岗位' })).toHaveValue('AI Platform Engineer')
    expect(screen.getByRole('combobox', { name: '练习场景' })).toHaveValue('scn_mock_system_design')

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

  it('does not offer a false start when realtime transport is unavailable', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    const interview = new InMemoryInterviewGateway()
    const setup = await interview.getInterviewSetup('ws_mock_klee_career_lab' as never)
    vi.spyOn(interview, 'getInterviewSetup').mockResolvedValue({
      ...setup,
      realtimeAvailable: false
    })

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )

    expect(
      await screen.findByText('实时面试连接尚未就绪；当前不会创建无法使用的会话。')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始面试' })).toBeDisabled()
  })

  it('keeps the transcript read-only until the student submits and AI ends the interview', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design" />)

    await screen.findByRole('heading', { name: '模拟面试进行中' })
    expect(screen.getByText('持续监听中；转写只读，无法编辑或撤回。')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      screen.getByText('麦克风音频仅用于本次实时面试；保存范围由会话策略决定。')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '结束录音并提交' }))

    expect(await screen.findByText('AI 已完成本次面试')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看面试分析' })).toHaveAttribute(
      'href',
      '/interviews/int_mock_system_design/summary'
    )
  })

  it('does not claim microphone capture when audio is disabled for the session', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 面试测试网关 / Interview test gateway. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 未启用麦克风的实时投影 / Runtime projection without microphone capture. */
    const runtime = await interview.getInterviewRuntime('int_mock_system_design' as never)
    vi.spyOn(interview, 'getInterviewRuntime').mockResolvedValue({
      ...runtime,
      session: {
        ...runtime.session,
        media: { ...runtime.session.media, userAudio: false }
      }
    })

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath="/interviews/int_mock_system_design"
      />
    )

    expect(await screen.findByText('面试进行中')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '实时回答' })).toBeInTheDocument()
    expect(screen.getByText('本次会话未启用麦克风采集。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交回答' })).toBeEnabled()
    expect(screen.queryByText('正在聆听')).not.toBeInTheDocument()
  })

  it('requires confirmation before leaving an unfinished interview', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews/int_mock_system_design" />)
    await screen.findByRole('heading', { name: '模拟面试进行中' })

    fireEvent.click(screen.getByRole('button', { name: '退出本次练习' }))

    expect(screen.getByRole('dialog', { name: '退出本次练习？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }))
    expect(await screen.findByRole('heading', { name: '模拟面试' })).toBeInTheDocument()
  })

  it('stays in the room when the server does not confirm ending the session', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    const interview = new InMemoryInterviewGateway()
    vi.spyOn(interview, 'endInterview').mockRejectedValue(new Error('end request unavailable'))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath="/interviews/int_mock_system_design"
      />
    )
    await screen.findByRole('heading', { name: '模拟面试进行中' })

    fireEvent.click(screen.getByRole('button', { name: '退出本次练习' }))
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '未能结束本次面试，服务器没有确认退出。请保留当前页面并稍后重试。'
    )
    expect(screen.getByRole('heading', { name: '模拟面试进行中' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: '当前工作区资料' })).toBeInTheDocument()
    expect(
      screen.getByText('以下为当前工作区的资料；当前报告契约不提供本次会话的资料范围或引用关系。')
    ).toBeInTheDocument()
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
