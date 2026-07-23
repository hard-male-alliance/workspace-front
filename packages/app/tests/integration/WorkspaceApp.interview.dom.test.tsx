import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DEMO_INTERVIEW_SESSION,
  DEMO_INTERVIEW_SESSION_ID,
  DEMO_LIVE_INTERVIEW_SESSION,
  InMemoryInterviewGateway
} from '@ai-job-workspace/app/testing'
import { HttpCommandOutcomeUnknownError } from '@ai-job-workspace/app/http'
import { asUiInterviewSessionCursor } from '../../src/contexts/interview'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief API v2 Interview 产品旅程测试 / API v2 Interview product-journey tests. */
describe('WorkspaceApp interview workflow', (): void => {
  it('展示全部会话状态，并只从 Session 权威声明报告是否可用', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath="/interviews" />)

    expect(await screen.findByRole('heading', { name: '模拟面试' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '创建练习会话' })).toHaveAttribute(
      'href',
      '/interviews/new'
    )
    /** @brief 服务端返回的两条会话记录 / Two session records returned by the service. */
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows.some((row) => within(row).queryByText('进行中') !== null)).toBe(true)
    expect(rows.some((row) => within(row).queryByText('已完成') !== null)).toBe(true)
    expect(screen.getByText('报告可查看')).toBeInTheDocument()
    expect(screen.getByText('完成后可生成报告')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('/ 100')
  })

  it('用不透明 cursor 追加 Session，失败重试严格复用同一 cursor', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 测试 Interview 端口 / Interview port under test. */
    const interview = new InMemoryInterviewGateway()
    /** @brief 后续页服务端 cursor / Server-issued continuation cursor. */
    const cursor = asUiInterviewSessionCursor('interview-session-cursor-retry')
    /** @brief 后续页尝试次数 / Continuation-page attempt count. */
    let continuationAttempts = 0
    const listInterviewSessionPage = vi
      .spyOn(interview, 'listInterviewSessionPage')
      .mockImplementation((request) => {
        request.signal?.throwIfAborted()
        if (request.cursor === null) {
          return Promise.resolve({
            hasMore: true as const,
            items: [DEMO_LIVE_INTERVIEW_SESSION],
            nextCursor: cursor
          })
        }
        continuationAttempts += 1
        if (continuationAttempts === 1) return Promise.reject(new Error('private adapter detail'))
        return Promise.resolve({
          hasMore: false as const,
          items: [DEMO_INTERVIEW_SESSION],
          nextCursor: null
        })
      })

    render(<WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews" />)

    await screen.findByText('完成后可生成报告')
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载更多会话')
    expect(document.body).not.toHaveTextContent('private adapter detail')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('报告可查看')).toBeInTheDocument()
    expect(listInterviewSessionPage.mock.calls.slice(1).map(([request]) => request.cursor)).toEqual(
      [cursor, cursor]
    )
    expect(screen.getByText('已显示全部会话')).toBeInTheDocument()
  })

  it('从 active Scenario 创建持久 Session，并使用隐私保守的 canonical 请求', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 可观察创建命令的 Interview 端口 / Interview port exposing the creation command. */
    const interview = new InMemoryInterviewGateway()
    const createInterviewSession = vi.spyOn(interview, 'createInterviewSession')

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )

    expect(await screen.findByRole('heading', { name: '创建练习会话' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '练习场景' })).toHaveValue('scn_mock_system_design')
    fireEvent.change(screen.getByRole('textbox', { name: '目标岗位' }), {
      target: { value: '前端平台工程师' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '目标公司（可选）' }), {
      target: { value: 'Northstar' }
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /保存文字转录 30 天/u }))
    fireEvent.click(screen.getByRole('button', { name: '创建练习会话' }))

    expect(await screen.findByRole('heading', { name: '前端平台工程师' })).toBeInTheDocument()
    expect(createInterviewSession).toHaveBeenCalledOnce()
    /** @brief 发出的 canonical Session 命令 / Dispatched canonical Session command. */
    const command = createInterviewSession.mock.calls[0]?.[0]
    expect(command).toMatchObject({
      input: {
        inference: {
          allowExternalModelProcessing: false,
          allowProviderFallback: false,
          qualityTier: 'balanced'
        },
        jobTarget: { company: 'Northstar', title: '前端平台工程师' },
        knowledge: { mode: 'policy_default' },
        media: { userAudio: true, userVideo: false },
        recording: {
          recordAudio: false,
          recordVideo: false,
          retentionDays: 30,
          storeTranscript: true
        },
        scenarioId: 'scn_mock_system_design'
      },
      workspaceId: 'ws_mock_klee_career_lab'
    })
    expect(command?.commandId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u)
    expect(command?.input.recording.consentVersion).toBeTruthy()
    expect(command?.input.recording.consentedAt).toBeTruthy()
  })

  it('创建结果未知时锁定设置，并用完全相同的命令确认', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 两阶段确认创建的 Interview 端口 / Interview port confirming creation in two stages. */
    const interview = new InMemoryInterviewGateway()
    const authority = await interview.getInterviewSession({
      sessionId: DEMO_INTERVIEW_SESSION_ID,
      signal: new AbortController().signal,
      workspaceId: DEMO_INTERVIEW_SESSION.workspaceId
    })
    const createInterviewSession = vi
      .spyOn(interview, 'createInterviewSession')
      .mockRejectedValueOnce(new HttpCommandOutcomeUnknownError('network'))
      .mockResolvedValueOnce(authority)

    render(
      <WorkspaceApp gateways={createTestGateways({ interview })} initialPath="/interviews/new" />
    )

    await screen.findByRole('heading', { name: '创建练习会话' })
    fireEvent.change(screen.getByRole('textbox', { name: '目标岗位' }), {
      target: { value: '安全工程师' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建练习会话' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('上次创建结果尚未确认')
    expect(screen.getByRole('textbox', { name: '目标岗位' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '返回' })).toHaveAttribute('aria-disabled', 'true')
    /** @brief 首次冻结的创建命令 / Creation command frozen on first dispatch. */
    const firstCommand = createInterviewSession.mock.calls[0]?.[0]
    fireEvent.click(screen.getByRole('button', { name: '确认上次创建结果' }))

    expect(await screen.findByRole('heading', { name: 'AI Platform Engineer' })).toBeInTheDocument()
    expect(createInterviewSession).toHaveBeenCalledTimes(2)
    expect(createInterviewSession.mock.calls[1]?.[0]).toStrictEqual(firstCommand)
  })

  it('统一 Session 路由不伪造未冻结的 realtime 产品能力', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath={`/interviews/${DEMO_LIVE_INTERVIEW_SESSION.id}`} />)

    expect(await screen.findByRole('heading', { name: 'AI Platform Engineer' })).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '会话尚未完成' })).toBeInTheDocument()
    expect(screen.getByText(/未冻结的 realtime 帧协议不会在浏览器里伪造/u)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/持续监听|正在聆听/u)).not.toBeInTheDocument()
  })

  it('在同一 Session 路由呈现报告、真实转录和已核验证据', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')

    render(<WorkspaceApp initialPath={`/interviews/${DEMO_INTERVIEW_SESSION_ID}`} />)

    expect(await screen.findByRole('heading', { name: 'AI Platform Engineer' })).toBeInTheDocument()
    expect(await screen.findByText('82 / 100')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '能力维度' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '评分证据' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '面试转录' })).toBeInTheDocument()
    expect(
      screen.getByText(
        '我会先确认评估对象、并发规模、数据保留与可审计要求，然后从控制面和数据面拆分。'
      )
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '已在转录中定位' })).toHaveLength(2)
    expect(screen.getAllByText('报告摘录（不是核验证明）')).toHaveLength(2)
    expect(screen.getByText('已加载完整转录')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回会话记录' })).toHaveAttribute(
      'href',
      '/interviews'
    )
  })

  it('转录读取失败不阻塞报告主体，并且不泄露 adapter 细节', async (): Promise<void> => {
    await setWorkspaceAppTestLocale('zh-SG')
    /** @brief 仅转录失败的 Interview 端口 / Interview port failing only transcript reads. */
    const interview = new InMemoryInterviewGateway()
    vi.spyOn(interview, 'listInterviewTranscriptPage').mockRejectedValue(
      new Error('private transcript adapter detail')
    )

    render(
      <WorkspaceApp
        gateways={createTestGateways({ interview })}
        initialPath={`/interviews/${DEMO_INTERVIEW_SESSION_ID}`}
      />
    )

    expect(await screen.findByText('82 / 100')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '能力维度' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '报告已就绪，但转录暂时无法加载' })
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('private transcript adapter detail')
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
  })
})
