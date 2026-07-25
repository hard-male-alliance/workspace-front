import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryResumeGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID
} from '@ai-job-workspace/app/testing'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief Review DOM 测试可观察的共享 adapter / Shared adapters observable by Resume Review DOM tests. */
interface ResumeReviewTestComposition {
  /** @brief 当前 Resume 与 Review 状态 / Current Resume and Review state. */
  readonly resume: InMemoryResumeGateway
  /** @brief 可观察 Job 轮询和取消的 adapter / Adapter exposing observable Job polling and cancellation. */
  readonly workspaceOperations: InMemoryWorkspaceOperationsGateway
}

/**
 * @brief 使用共享 Operations store 渲染真实内存 Resume Review 产品页 / Render the real in-memory Resume Review product page with a shared Operations store.
 * @param initialPath Review 页初始地址 / Initial Review-page location.
 * @return 当前测试独享且共享 Job 状态的 adapter / Test-owned adapters sharing Job state.
 */
function renderResumeReview(
  initialPath = '/resumes/res_mock_ai_platform/review'
): ResumeReviewTestComposition {
  /** @brief Resume 与 Workspace Operations 共用的 Job 状态 / Job state shared by Resume and Workspace Operations. */
  const operationsStore = new InMemoryWorkspaceOperationsStore()
  /** @brief 当前测试独享的 Resume 聚合与 Proposal 状态 / Test-owned Resume aggregate and Proposal state. */
  const resume = new InMemoryResumeGateway({ operationsStore })
  /** @brief 与 Resume command 观察同一 Job 的 Operations adapter / Operations adapter observing the same Jobs as Resume commands. */
  const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, operationsStore)

  render(
    <WorkspaceApp
      gateways={createTestGateways({
        resume,
        resumeReview: resume,
        workspaceOperations
      })}
      initialPath={initialPath}
    />
  )
  return { resume, workspaceOperations }
}

/**
 * @brief 打开指定 Agent Proposal 并取得它的详情区 / Open one Agent Proposal and return its detail section.
 * @param title Proposal 可访问标题 / Accessible Proposal title.
 * @return 以 Proposal 标题定位的详情 section / Detail section located from the Proposal heading.
 */
async function openProposal(title: string): Promise<HTMLElement> {
  /** @brief 只在 Proposal inbox 中寻找的列表按钮 / List button located only inside the Proposal inbox. */
  const proposalList = await screen.findByRole('region', { name: '建议列表' })
  fireEvent.click(within(proposalList).getByRole('button', { name: new RegExp(title, 'u') }))

  /** @brief 详情中的语义标题，不会误命中列表按钮 / Semantic detail heading that cannot match the list button. */
  const detailHeading = await screen.findByRole('heading', { name: title })
  /** @brief 承载当前 Proposal 权威及 decision controls 的详情区 / Detail section carrying Proposal authority and decision controls. */
  const detail = detailHeading.closest('section')
  if (!(detail instanceof HTMLElement)) {
    throw new Error('Expected the selected Resume Proposal to render inside a detail section.')
  }
  return detail
}

/** @brief 切换到可寻址的 Agent 建议页签 / Switch to the addressable Agent-suggestions tab. */
function openAgentSuggestionsTab(): void {
  /** @brief Review 页唯一的页签导航 / The Review page's unique tab navigation. */
  const tabs = screen.getByRole('navigation', { name: '版本与建议视图' })
  fireEvent.click(within(tabs).getByRole('button', { name: /^Agent 建议/u }))
}

/**
 * @brief 打开一个历史 revision 并等待恢复控件可用 / Open a historical revision and wait for its restore controls.
 * @param revision 要打开的历史 revision / Historical revision to open.
 * @return 该 revision 的只读语义预览 / Read-only semantic preview of that revision.
 */
async function openHistoricalRevision(revision: number): Promise<HTMLElement> {
  /** @brief 服务端顺序呈现的 revision 时间线 / Revision timeline rendered in server order. */
  const timeline = await screen.findByRole('region', { name: '版本时间线' })
  fireEvent.click(
    within(timeline).getByRole('button', { name: new RegExp(`^版本 ${revision}`, 'u') })
  )
  return screen.findByRole('article', {
    name: `历史版本 ${revision} 的语义预览`
  })
}

/**
 * @brief 以页面恢复可见事件立即推进一轮生产轮询 / Advance one production poll through a page-visible event.
 * @return React 已吸收本轮权威后的 Promise / Promise after React absorbs this authority observation.
 * @note 生产实现会在后台暂停；恢复可见时立即重读，因此测试无需篡改轮询时钟。 / Production pauses in the background and rereads immediately on visibility restoration, so tests need not alter the polling clock.
 */
async function advanceVisibleRestorePoll(): Promise<void> {
  await act(async (): Promise<void> => {
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
  })
}

beforeEach(async (): Promise<void> => {
  await setWorkspaceAppTestLocale('zh-SG')
})

/** @brief Resume revision 历史与 Agent Proposal 审阅产品闭环 / Resume revision-history and Agent-Proposal review product loop. */
describe('WorkspaceApp Resume review', (): void => {
  it('loads current authority, opens an immutable historical revision, and groups duplicate operation IDs indivisibly', async (): Promise<void> => {
    renderResumeReview()

    expect(await screen.findByRole('heading', { name: '版本与建议' })).toBeVisible()
    expect(screen.getByText('当前 Resume 版本 18')).toBeVisible()

    /** @brief 服务端顺序呈现的 revision 时间线 / Revision timeline rendered in server order. */
    const timeline = screen.getByRole('region', { name: '版本时间线' })
    expect(within(timeline).getByRole('button', { name: /^版本 18/u })).toHaveTextContent(
      '当前版本'
    )
    fireEvent.click(within(timeline).getByRole('button', { name: /^版本 17/u }))

    /** @brief 不可变 revision 的完整语义预览 / Complete semantic preview of the immutable revision. */
    const historicalPreview = await screen.findByRole('article', {
      name: '历史版本 17 的语义预览'
    })
    expect(within(historicalPreview).getByText('AI Platform Engineer')).toBeVisible()
    expect(screen.getByText(/历史内容始终只读/u)).toBeVisible()

    openAgentSuggestionsTab()
    expect(
      within(screen.getByRole('navigation', { name: '版本与建议视图' })).getByRole('button', {
        name: /^Agent 建议/u
      })
    ).toHaveAttribute('aria-current', 'page')

    /** @brief 含重复 operation_id 的待审 Proposal 详情 / Pending Proposal detail containing a duplicate operation_id. */
    const detail = await openProposal('突出平台影响力与生产可靠性')
    /** @brief API v2 operation ID 分组后的可决策集合 / Decidable collection grouped by API v2 operation ID. */
    const operationGroups = within(detail).getByRole('group', {
      name: '建议修改（2 个可决策组）'
    })
    expect(within(operationGroups).getAllByRole('checkbox')).toHaveLength(2)
    expect(
      within(operationGroups).getAllByText(
        '这 2 项共享同一个操作标识，API 只允许把它们作为一个整体接受或拒绝。'
      )
    ).toHaveLength(1)
  })

  it('accepts one indivisible operation-ID group only after confirmation and exposes the new Resume revision', async (): Promise<void> => {
    renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')

    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    /** @brief 当前待审 Proposal 详情 / Current pending Proposal detail. */
    const detail = await openProposal('突出平台影响力与生产可靠性')
    /** @brief 同时包含两条语义操作的唯一 checkbox / Single checkbox carrying both semantic operations. */
    const groupedSelection = within(detail).getByRole('checkbox', {
      name: /高级 AI 平台工程师.*负责多租户 Agent 平台/u
    })
    fireEvent.click(groupedSelection)

    /** @brief 仅选择一个 operation-ID 组的 decision 入口 / Decision entry selecting exactly one operation-ID group. */
    const acceptSelected = within(detail).getByRole('button', { name: '接受选中项（1）' })
    expect(acceptSelected).toBeEnabled()
    fireEvent.click(acceptSelected)

    expect(within(detail).getByText('确认这次不可分割的决策')).toBeVisible()
    expect(within(detail).getByText('只接受选中的 1 个 operation-ID 组。')).toBeVisible()
    fireEvent.click(within(detail).getByRole('button', { name: '确认提交' }))

    expect(await screen.findByText('当前 Resume 版本 19')).toBeVisible()
    expect(await screen.findByText('决策已确认。当前 Resume 已更新到版本 19。')).toBeVisible()
    /** @brief 同步后的历史首页必须立即包含新 revision / Synchronized history first page must immediately contain the new revision. */
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '版本与建议视图' })).getByRole('button', {
        name: '版本历史'
      })
    )
    expect(
      within(screen.getByRole('region', { name: '版本时间线' })).getByRole('button', {
        name: /^版本 19/u
      })
    ).toBeVisible()
    openAgentSuggestionsTab()
    /** @brief 决策成功后重新读取的终态详情 / Terminal detail reread after the successful decision. */
    const decidedDetail = await openProposal('突出平台影响力与生产可靠性')
    expect(await within(decidedDetail).findByText('已部分接受')).toBeVisible()
    expect(within(decidedDetail).queryByRole('button', { name: '接受全部' })).toBeNull()
    expect(within(decidedDetail).queryByRole('button', { name: /接受选中项/u })).toBeNull()
    expect(within(decidedDetail).queryByRole('button', { name: '拒绝建议' })).toBeNull()
  })

  it('rejects a pending Proposal without changing the Resume revision', async (): Promise<void> => {
    renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')

    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    /** @brief 将被拒绝但不会修改 Resume 的待审详情 / Pending detail rejected without mutating the Resume. */
    const detail = await openProposal('把代表项目提前到工作经历之前')
    fireEvent.click(within(detail).getByRole('button', { name: '拒绝建议' }))

    expect(
      within(detail).getByText('这条建议会进入已拒绝状态，Resume 内容不会改变。')
    ).toBeVisible()
    fireEvent.click(within(detail).getByRole('button', { name: '确认提交' }))

    /** @brief 服务端确认 reject 后重新读取的终态详情 / Terminal detail reread after the server confirms rejection. */
    const rejectedDetail = await openProposal('把代表项目提前到工作经历之前')
    expect(await within(rejectedDetail).findByText('已拒绝')).toBeVisible()
    expect(screen.getByText('当前 Resume 版本 18')).toBeVisible()
    expect(within(rejectedDetail).queryByRole('button', { name: '接受全部' })).toBeNull()
    expect(within(rejectedDetail).queryByRole('button', { name: /接受选中项/u })).toBeNull()
    expect(within(rejectedDetail).queryByRole('button', { name: '拒绝建议' })).toBeNull()
  })

  it('never renders decision actions for an already terminal Proposal', async (): Promise<void> => {
    renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')

    /** @brief 初次载入便已 accepted 的终态详情 / Terminal detail already accepted on initial load. */
    const detail = await openProposal('补充分布式系统方向')
    expect(within(detail).getByText('已全部接受')).toBeVisible()
    expect(within(detail).queryByRole('button', { name: '接受全部' })).toBeNull()
    expect(within(detail).queryByRole('button', { name: /接受选中项/u })).toBeNull()
    expect(within(detail).queryByRole('button', { name: '拒绝建议' })).toBeNull()
  })

  it('replays an outcome-unknown Proposal decision with the exact frozen envelope', async (): Promise<void> => {
    /** @brief 可注入首次未知写入结果的 Review adapter / Review adapter whose first write outcome can be made unknown. */
    const { resume } = renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')
    const detail = await openProposal('突出平台影响力与生产可靠性')
    /** @brief 捕获两次 decision，并只让首次失去结果 / Capture both decisions while making only the first lose its outcome. */
    const decide = vi.spyOn(resume, 'decideResumeProposal').mockRejectedValueOnce({
      kind: 'network',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: 'request_unknown_proposal'
    })

    fireEvent.click(within(detail).getByRole('button', { name: '接受全部' }))
    fireEvent.click(within(detail).getByRole('button', { name: '确认提交' }))
    expect(await within(detail).findByText('结果尚未确认，必须原样确认同一决策')).toBeVisible()
    expect(within(detail).getByRole('button', { name: '放弃旧命令并重读建议' })).toBeVisible()

    fireEvent.click(within(detail).getByRole('button', { name: '确认同一决策结果' }))
    expect(await screen.findByText('当前 Resume 版本 19')).toBeVisible()
    expect(decide).toHaveBeenCalledTimes(2)
    /** @brief 两次调用中信号之外的完整冻结写信封 / Complete frozen write envelope other than its call-lifecycle signal. */
    const first = decide.mock.calls[0]?.[0]
    const second = decide.mock.calls[1]?.[0]
    expect(second).toMatchObject({
      commandId: first?.commandId,
      concurrencyToken: first?.concurrencyToken,
      decision: first?.decision,
      proposal: first?.proposal
    })
  })

  it.each([
    {
      error: {
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        requestId: 'request_bad_proposal_contract',
        status: 200
      },
      name: 'unreplayable contract response'
    },
    {
      error: {
        name: 'ApiV2ProblemError',
        problem: {
          code: 'idempotency.key_reused',
          request_id: 'request_proposal_key_reused',
          retryable: false,
          status: 409
        },
        retryAfterMilliseconds: null
      },
      name: 'idempotency key-reused response'
    }
  ])('never resends a Proposal decision after $name', async ({ error }): Promise<void> => {
    /** @brief 可验证旧信封没有危险重发的 Review adapter / Review adapter proving the old envelope is not dangerously resent. */
    const { resume } = renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')
    const detail = await openProposal('突出平台影响力与生产可靠性')
    const decide = vi.spyOn(resume, 'decideResumeProposal').mockRejectedValueOnce(error)

    fireEvent.click(within(detail).getByRole('button', { name: '接受全部' }))
    fireEvent.click(within(detail).getByRole('button', { name: '确认提交' }))

    expect(
      await within(detail).findByRole('button', { name: '放弃旧命令并重读建议' })
    ).toBeVisible()
    expect(within(detail).queryByRole('button', { name: '确认提交' })).toBeNull()
    expect(within(detail).queryByRole('button', { name: '确认同一决策结果' })).toBeNull()
    expect(decide).toHaveBeenCalledTimes(1)
  })

  it('keeps a confirmed decision locked while authority synchronization is retried', async (): Promise<void> => {
    /** @brief 可让首次后续读取失败的 Review adapter / Review adapter whose first follow-up read can fail. */
    const { resume } = renderResumeReview('/resumes/res_mock_ai_platform/review?tab=proposals')
    const detail = await openProposal('突出平台影响力与生产可靠性')
    vi.spyOn(resume, 'listResumeProposalPage').mockRejectedValueOnce(
      new TypeError('Temporary Proposal list read failure.')
    )

    fireEvent.click(within(detail).getByRole('button', { name: '接受全部' }))
    fireEvent.click(within(detail).getByRole('button', { name: '确认提交' }))

    expect(await screen.findByText('当前 Resume 版本 19')).toBeVisible()
    expect(
      await within(detail).findByText('决策已确认，但最新建议和版本列表尚未同步')
    ).toBeVisible()
    expect(within(detail).queryByRole('button', { name: '接受全部' })).toBeNull()
    fireEvent.click(within(detail).getByRole('button', { name: '重新读取最新状态' }))
    expect(await within(detail).findByText('已全部接受')).toBeVisible()
    expect(within(detail).queryByText('决策已确认，但最新建议和版本列表尚未同步')).toBeNull()
  })

  it('confirms twice, exposes queued and running authority, then rereads the new current revision after Job success', async (): Promise<void> => {
    /** @brief 可观察 Job 与当前 Resume 重读的测试组合 / Composition exposing Job observations and current-Resume rereads. */
    const { resume, workspaceOperations } = renderResumeReview()
    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    await openHistoricalRevision(17)

    /** @brief 恢复前不发送命令的第一次确认 / First confirmation that sends no command. */
    fireEvent.click(screen.getByRole('button', { name: '恢复到版本 17' }))
    expect(screen.getByText('确认从版本 17 创建新的当前版本？')).toBeVisible()

    /** @brief 只记录恢复成功后的权威 Resume 重读 / Observer recording only the authoritative reread after success. */
    const rereadCurrent = vi.spyOn(resume, 'getResumeEditor')
    /** @brief 轮询实际观察到的 Job 状态 / Job statuses actually observed by polling. */
    const observedStatuses: string[] = []
    /** @brief 保留内存执行器语义并记录其权威返回 / Preserve in-memory executor semantics while recording authority. */
    const getJob = workspaceOperations.getJob.bind(workspaceOperations)
    vi.spyOn(workspaceOperations, 'getJob').mockImplementation(async (request) => {
      /** @brief 本轮 Job 权威 / Job authority for this poll. */
      const authority = await getJob(request)
      observedStatuses.push(authority.job.status)
      return authority
    })

    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(await screen.findByText('恢复任务正在排队。')).toBeVisible()

    await advanceVisibleRestorePoll()
    expect(await screen.findByText('正在创建新的当前版本。')).toBeVisible()

    await advanceVisibleRestorePoll()
    expect(await screen.findByText('恢复已确认；新的当前 Resume 是版本 19。')).toBeVisible()
    expect(screen.getByText('当前 Resume 版本 19')).toBeVisible()
    expect(observedStatuses).toEqual(['running', 'succeeded'])
    expect(rereadCurrent).toHaveBeenCalledTimes(1)
  })

  it('keeps cancellation available during polling and never commits the cancelled restore', async (): Promise<void> => {
    /** @brief 可在取消后直接核对聚合权威的测试组合 / Composition allowing direct aggregate verification after cancellation. */
    const { resume } = renderResumeReview()
    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    await openHistoricalRevision(17)
    fireEvent.click(screen.getByRole('button', { name: '恢复到版本 17' }))
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(await screen.findByText('恢复任务正在排队。')).toBeVisible()

    /** @brief 自动观察仍在等待时也必须可用的真实取消动作 / Real cancellation that must remain usable while automatic observation waits. */
    const cancel = screen.getByRole('button', { name: '取消恢复任务' })
    expect(cancel).toBeEnabled()
    fireEvent.click(cancel)
    expect(await screen.findByText('恢复任务已取消。')).toBeVisible()

    await advanceVisibleRestorePoll()
    /** @brief 直接重读聚合，证明 cancellation 不只是 UI 状态 / Direct aggregate reread proving cancellation is not merely a UI state. */
    const current = await resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      new AbortController().signal
    )
    expect(current.resume.revision).toBe(18)
    expect(screen.getByText('当前 Resume 版本 18')).toBeVisible()
    expect(screen.queryByText(/恢复已确认/u)).toBeNull()
  })

  it('retries an outcome-unknown restore with the exact same frozen command', async (): Promise<void> => {
    /** @brief 可注入第一次未知结果的 Resume adapter / Resume adapter whose first restore result can be made unknown. */
    const { resume } = renderResumeReview()
    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    await openHistoricalRevision(17)
    /** @brief 捕获全部 restore 命令，并只让第一次确认失去结果 / Capture every restore command while making only the first confirmation unknown. */
    const startRestore = vi.spyOn(resume, 'startResumeRestore').mockRejectedValueOnce({
      kind: 'network',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: 'request_unknown_restore'
    })

    fireEvent.click(screen.getByRole('button', { name: '恢复到版本 17' }))
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(await screen.findByText('结果尚未确认，必须原样确认同一恢复命令')).toBeVisible()
    expect(
      screen.getByText(
        '你也可以放弃本地跟踪并重读当前 Resume；这不会撤销服务器可能已经接受的任务。'
      )
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '确认同一恢复结果' }))
    expect(await screen.findByText('恢复任务正在排队。')).toBeVisible()
    expect(startRestore).toHaveBeenCalledTimes(2)
    /** @brief 两次 transport 调用中的完整冻结信封 / Complete frozen envelopes across both transport calls. */
    const first = startRestore.mock.calls[0]?.[0]
    const second = startRestore.mock.calls[1]?.[0]
    expect(first).toBeDefined()
    expect(second).toMatchObject({
      commandId: first?.commandId,
      concurrencyToken: first?.concurrencyToken,
      currentRevision: first?.currentRevision,
      resumeId: first?.resumeId,
      sourceRevision: first?.sourceRevision,
      workspaceId: first?.workspaceId
    })

    fireEvent.click(screen.getByRole('button', { name: '取消恢复任务' }))
    expect(await screen.findByText('恢复任务已取消。')).toBeVisible()
  })

  it('can abandon an outcome-unknown local command and authoritatively reread current Resume', async (): Promise<void> => {
    /** @brief 可观察权威重读的 Resume adapter / Resume adapter exposing authoritative rereads. */
    const { resume } = renderResumeReview()
    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    await openHistoricalRevision(17)
    vi.spyOn(resume, 'startResumeRestore').mockRejectedValueOnce({
      kind: 'network',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: 'request_unknown_abandon'
    })
    /** @brief 只计算放弃动作发起的权威重读 / Count only the authoritative reread initiated by abandoning. */
    const rereadCurrent = vi.spyOn(resume, 'getResumeEditor')

    fireEvent.click(screen.getByRole('button', { name: '恢复到版本 17' }))
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(await screen.findByText('结果尚未确认，必须原样确认同一恢复命令')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '放弃旧命令并重读当前 Resume' }))

    expect(await screen.findByRole('button', { name: '恢复到版本 17' })).toBeVisible()
    expect(rereadCurrent).toHaveBeenCalledTimes(1)
    expect(screen.getByText('当前 Resume 版本 18')).toBeVisible()
  })

  it.each([
    {
      error: {
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        requestId: 'request_bad_contract',
        status: 202
      },
      name: 'unreplayable contract response'
    },
    {
      error: {
        name: 'ApiV2ProblemError',
        problem: {
          code: 'idempotency.key_reused',
          request_id: 'request_key_reused',
          retryable: false,
          status: 409
        },
        retryAfterMilliseconds: null
      },
      name: 'idempotency key-reused response'
    }
  ])('never resends the frozen restore after $name', async ({ error }): Promise<void> => {
    /** @brief 可验证危险命令未重放的 Resume adapter / Resume adapter proving the unsafe command is not replayed. */
    const { resume } = renderResumeReview()
    expect(await screen.findByText('当前 Resume 版本 18')).toBeVisible()
    await openHistoricalRevision(17)
    const startRestore = vi.spyOn(resume, 'startResumeRestore').mockRejectedValueOnce(error)

    fireEvent.click(screen.getByRole('button', { name: '恢复到版本 17' }))
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(await screen.findByRole('button', { name: '放弃旧命令并重读当前 Resume' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '确认恢复' })).toBeNull()
    expect(screen.queryByRole('button', { name: '确认同一恢复结果' })).toBeNull()
    expect(startRestore).toHaveBeenCalledTimes(1)
  })
})
