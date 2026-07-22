import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DEMO_INTERVIEW_SESSION_ID, InMemoryInterviewGateway } from '@ai-job-workspace/app/testing'
import { HttpCommandOutcomeUnknownError, HttpProblemError } from '@ai-job-workspace/app/http'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  navigateWorkspaceApp,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 面试练习用户行为测试 / Interview-practice user-behaviour tests. */
describe('WorkspaceApp interview workflow', (): void => {
  it('rebuilds room state for the authoritative Interview session ID', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 当前测试独享的 Interview Gateway / Interview Gateway owned by the current test. */
    const interview = new InMemoryInterviewGateway()
    /** @brief A 会话权威运行态 / Authoritative runtime for session A. */
    const runtimeA = await interview.getInterviewRuntime(DEMO_INTERVIEW_SESSION_ID)
    /** @brief B 会话领域 ID / Domain ID for session B. */
    const sessionBId = 'int_authoritative_b' as typeof DEMO_INTERVIEW_SESSION_ID
    /** @brief B 会话权威运行态 / Authoritative runtime for session B. */
    const runtimeB = {
      ...runtimeA,
      currentTranscript: '只属于 B 会话的实时回答。',
      session: {
        ...runtimeA.session,
        id: sessionBId,
        jobTarget: { ...runtimeA.session.jobTarget, title: 'B Platform Role' }
      }
    }
    /** @brief 兑现 B 会话读取的函数 / Resolver for the session B read. */
    let resolveRuntimeB: ((runtime: typeof runtimeB) => void) | undefined
    /** @brief 保持 B 会话读取待定的 Promise / Promise keeping the session B read pending. */
    const pendingRuntimeB = new Promise<typeof runtimeB>((resolve): void => {
      resolveRuntimeB = resolve
    })
    vi.spyOn(interview, 'getInterviewRuntime').mockImplementation((sessionId) => {
      if (sessionId === DEMO_INTERVIEW_SESSION_ID) return Promise.resolve(runtimeA)
      if (sessionId === sessionBId) return pendingRuntimeB
      return Promise.reject(new Error('Unexpected Interview session ID.'))
    })
    window.history.replaceState(null, '', `/interviews/${DEMO_INTERVIEW_SESSION_ID}`)

    render(<WorkspaceApp gateways={createTestGateways({ interview })} />)
    await screen.findByRole('heading', { name: '模拟面试进行中' })
    fireEvent.click(screen.getByRole('button', { name: '退出本次练习' }))
    expect(screen.getByRole('dialog', { name: '退出本次练习？' })).toBeInTheDocument()

    navigateWorkspaceApp(`/interviews/${sessionBId}`)

    expect(screen.getByText('正在准备模拟面试…')).toBeInTheDocument()
    expect(screen.queryByText('AI Platform Engineer')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '退出本次练习？' })).not.toBeInTheDocument()

    await act(async (): Promise<void> => {
      resolveRuntimeB?.(runtimeB)
      await pendingRuntimeB
    })

    expect(await screen.findByText(/B Platform Role/u)).toBeInTheDocument()
    expect(screen.getByText('只属于 B 会话的实时回答。')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '退出本次练习？' })).not.toBeInTheDocument()
  })

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

  it('confirms an unknown creation with the exact same command snapshot', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 可观察创建输入的 Interview 测试网关 / Interview test gateway exposing creation inputs. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 首次结果未知、第二次确认成功的创建替身 / Creation double unknown first and confirmed on its second call. */
    const createInterview = vi
      .spyOn(interview, 'createInterview')
      .mockRejectedValueOnce(new HttpCommandOutcomeUnknownError('network'))
      .mockResolvedValueOnce({ sessionId: 'int_mock_system_design' as never })

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )

    await screen.findByRole('heading', { name: '配置模拟面试' })
    fireEvent.click(screen.getByRole('button', { name: '开始面试' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '上次创建结果尚未确认。当前设置已锁定；请确认上次结果，不要创建重复的面试会话。'
    )
    expect(screen.getByRole('combobox', { name: '目标岗位' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '练习场景' })).toBeDisabled()
    expect(screen.getAllByRole('checkbox').every((option) => option.hasAttribute('disabled'))).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: '开始面试' })).not.toBeInTheDocument()

    /** @brief 结果确认前不可离开的页面内返回链接 / In-page Back link that cannot leave before confirmation. */
    const backLink = screen.getByRole('link', { name: '返回' })
    expect(backLink).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(backLink)
    expect(screen.getByRole('heading', { name: '配置模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认上次创建结果' })).toBeInTheDocument()
    expect(createInterview).toHaveBeenCalledTimes(1)

    /** @brief 首次发送后保留的完整命令快照 / Complete command snapshot retained after the first send. */
    const firstInput = createInterview.mock.calls[0]?.[0]
    expect(firstInput?.commandId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u)

    fireEvent.click(screen.getByRole('button', { name: '确认上次创建结果' }))

    expect(await screen.findByRole('heading', { name: '模拟面试进行中' })).toBeInTheDocument()
    /** @brief 结果确认使用的命令快照 / Command snapshot used to confirm the outcome. */
    const confirmationInput = createInterview.mock.calls[1]?.[0]
    expect(createInterview).toHaveBeenCalledTimes(2)
    expect(confirmationInput).toBe(firstInput)
  })

  it('unlocks a creation intent after confirmation receives a definitive rejection', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('en-US')
    /** @brief 返回未知结果后明确拒绝同一命令的测试网关 / Test gateway returning an unknown outcome followed by a definitive rejection for the same command. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 两阶段创建替身 / Two-stage creation double. */
    const createInterview = vi
      .spyOn(interview, 'createInterview')
      .mockRejectedValueOnce(new HttpCommandOutcomeUnknownError('network'))
      .mockRejectedValueOnce(
        new HttpProblemError({
          code: 'interview.invalid_request',
          detail: 'private backend detail',
          requestId: null,
          retryable: false,
          retryAfterMs: null,
          status: 422,
          title: 'private backend title'
        })
      )

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )
    await screen.findByRole('heading', { name: 'Set up a mock interview' })
    fireEvent.click(screen.getByRole('button', { name: 'Start interview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm previous creation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The interview could not be created. Your settings are preserved; try again.'
    )
    expect(screen.queryByText(/private backend/u)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target role' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start interview' })).toBeEnabled()
    expect(createInterview).toHaveBeenCalledTimes(2)
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
