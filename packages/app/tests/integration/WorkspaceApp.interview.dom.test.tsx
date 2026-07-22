import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DEMO_INTERVIEW_SESSION_ID, InMemoryInterviewGateway } from '@ai-job-workspace/app/testing'
import {
  HttpCommandOutcomeUnknownError,
  HttpContractError,
  HttpProblemError
} from '@ai-job-workspace/app/http'

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
    expect(screen.getByRole('listitem')).toHaveTextContent('AI Platform Engineer')
    expect(screen.getByRole('listitem')).toHaveTextContent('82 / 100')
  })

  it('shows the backend overall scale in completed Interview history', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 使用非百分制历史投影的 Interview 测试网关 / Interview test gateway using a non-percent history projection. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 内存网关提供的基准历史投影 / Baseline history projection supplied by the memory gateway. */
    const history = await interview.listCompletedInterviews('ws_mock_klee_career_lab' as never)
    vi.spyOn(interview, 'listCompletedInterviews').mockResolvedValue(
      history.map((item) => ({
        ...item,
        overallMaximumScore: 5,
        overallMinimumScore: 1,
        overallScore: 4
      }))
    )

    render(<WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews" />)

    /** @brief 展示权威量表的历史行 / History row displaying the authoritative scale. */
    const historyRow = await screen.findByRole('listitem')
    expect(historyRow).toHaveTextContent('AI Platform Engineer')
    expect(historyRow).toHaveTextContent('4 [1–5]')
    expect(historyRow).not.toHaveTextContent('/ 100')
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

    /** @brief 动态创建错误的可访问告警 / Accessible alert for the dynamic creation error. */
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('上次创建结果尚未确认；当前设置已锁定。')
    expect(alert).toHaveTextContent('请求可能已被服务处理')
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
      'The interview could not be created. Your settings are preserved.'
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The service did not accept')
    expect(screen.queryByText(/private backend/u)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target role' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start interview' })).toBeEnabled()
    expect(createInterview).toHaveBeenCalledTimes(2)
  })

  it('reloads setup authority instead of replaying a 409 creation conflict', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 创建返回并发冲突的 Interview 测试网关 / Interview test gateway whose creation returns a conflict. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 配置权威读取观察 / Setup-authority read observation. */
    const getInterviewSetup = vi.spyOn(interview, 'getInterviewSetup')
    /** @brief 不得由恢复按钮重放的创建命令 / Creation command that the recovery button must not replay. */
    const createInterview = vi.spyOn(interview, 'createInterview').mockRejectedValue(
      new HttpProblemError({
        code: 'interview.session_conflict',
        detail: 'private conflict detail at https://internal.example.test',
        requestId: 'req_conflict_1234',
        retryable: true,
        retryAfterMs: null,
        status: 409,
        title: 'private conflict title'
      })
    )

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )
    await screen.findByRole('heading', { name: '配置模拟面试' })
    fireEvent.click(screen.getByRole('button', { name: '开始面试' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('内容已在其他位置更新')
    expect(alert).toHaveTextContent('支持编号：req_conflict_1234')
    expect(alert).not.toHaveTextContent(/private|internal\.example/u)
    expect(screen.getByRole('button', { name: '开始面试' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '重新加载最新数据' }))

    await vi.waitFor((): void => expect(getInterviewSetup).toHaveBeenCalledTimes(2))
    expect(createInterview).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: '开始面试' })).toBeEnabled()
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

  it('reloads session authority without replaying an answer whose outcome is unknown', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 回答结果未知的 Interview 测试网关 / Interview test gateway with an unknown answer outcome. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 权威运行态读取观察 / Authoritative-runtime read observation. */
    const getInterviewRuntime = vi.spyOn(interview, 'getInterviewRuntime')
    /** @brief 不得由恢复动作重放的回答提交 / Answer submission that recovery must not replay. */
    const submitInterviewAnswer = vi
      .spyOn(interview, 'submitInterviewAnswer')
      .mockRejectedValue(new HttpCommandOutcomeUnknownError('network'))

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath="/interviews/int_mock_system_design"
      />
    )
    await screen.findByRole('heading', { name: '模拟面试进行中' })
    fireEvent.click(screen.getByRole('button', { name: '结束录音并提交' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('请求可能已被服务处理')
    expect(screen.getByRole('button', { name: '结束录音并提交' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '重新加载会话状态' }))

    await vi.waitFor((): void => expect(getInterviewRuntime).toHaveBeenCalledTimes(2))
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('请求可能已被服务处理')
    expect(screen.getByRole('button', { name: '结束录音并提交' })).toBeDisabled()
  })

  it('reloads session authority without replaying an answer after a malformed 409 response', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 返回违约 409 响应的 Interview 测试网关 / Interview test gateway returning a malformed 409 response. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 权威运行态读取观察 / Authoritative-runtime read observation. */
    const getInterviewRuntime = vi.spyOn(interview, 'getInterviewRuntime')
    /** @brief 不得由恢复动作重放的回答提交 / Answer submission that recovery must not replay. */
    const submitInterviewAnswer = vi
      .spyOn(interview, 'submitInterviewAnswer')
      .mockRejectedValue(
        new HttpContractError('private malformed response at https://internal.example.test', 409)
      )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath="/interviews/int_mock_system_design"
      />
    )
    await screen.findByRole('heading', { name: '模拟面试进行中' })
    fireEvent.click(screen.getByRole('button', { name: '结束录音并提交' }))

    /** @brief 违约响应的安全可访问告警 / Safe accessible alert for the malformed response. */
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('服务返回了无法识别的数据')
    expect(alert).not.toHaveTextContent(/private|internal\.example/u)
    expect(screen.getByRole('button', { name: '结束录音并提交' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '重新加载会话状态' }))

    await vi.waitFor((): void => expect(getInterviewRuntime).toHaveBeenCalledTimes(2))
    expect(submitInterviewAnswer).toHaveBeenCalledOnce()
    await vi.waitFor((): void => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '结束录音并提交' })).toBeEnabled()
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

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法确认本次面试已经结束。')
    expect(alert).toHaveTextContent('应用遇到未预期的问题')
    expect(alert).not.toHaveTextContent('end request unavailable')
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

  it('uses backend rubric names and normalizes a 1..5 score without opaque-ID labels', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 提供非百分制总结的 Interview 测试网关 / Interview test gateway providing a non-percent summary. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 内存网关提供的基准总结投影 / Baseline summary projection supplied by the memory gateway. */
    const summary = await interview.getInterviewSummary(DEMO_INTERVIEW_SESSION_ID)
    /** @brief 来自服务端量表而非 opaque ID 映射的维度名 / Dimension name supplied by the backend rubric rather than an opaque-ID map. */
    const backendDimensionName = '服务端量表：问题重构'
    vi.spyOn(interview, 'getInterviewSummary').mockResolvedValue({
      details: {
        ...summary.details,
        scenario: {
          ...summary.details.scenario,
          rubric: {
            ...summary.details.scenario.rubric,
            dimensions: summary.details.scenario.rubric.dimensions.map((dimension, index) => ({
              ...dimension,
              maximumScore: 5,
              minimumScore: 1,
              name: index === 0 ? backendDimensionName : dimension.name
            })),
            maximumScore: 5,
            minimumScore: 1
          }
        }
      },
      report: {
        ...summary.report,
        overallMaximumScore: 5,
        overallMinimumScore: 1,
        overallScore: 4,
        rubricScores: summary.report.rubricScores.map((score, index) => ({
          ...score,
          dimensionName: index === 0 ? backendDimensionName : score.dimensionName,
          maximumScore: 5,
          minimumScore: 1,
          score: index === 0 ? 4 : (index % 5) + 1
        }))
      }
    })

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath={`/interviews/${DEMO_INTERVIEW_SESSION_ID}/summary`}
      />
    )

    await screen.findByRole('heading', { name: '面试分析' })
    expect(screen.getByLabelText('总评分')).toHaveTextContent(/4\s*\[1–5\]/u)
    expect(screen.getAllByText(backendDimensionName)).not.toHaveLength(0)
    expect(screen.queryByText('问题界定')).not.toBeInTheDocument()

    /** @brief 以 1..5 原始量表标注的首个进度条 / First progress bar labelled with the raw 1..5 scale. */
    const progressbar = screen.getByRole('progressbar', {
      name: `${backendDimensionName} 4`
    })
    expect(progressbar).toHaveAttribute('aria-valuemin', '1')
    expect(progressbar).toHaveAttribute('aria-valuemax', '5')
    expect(progressbar).toHaveAttribute('aria-valuenow', '4')
    expect(progressbar.firstElementChild).toHaveStyle({ width: '75%' })
  })
})
