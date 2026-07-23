/** @file Resume Review 内存 adapter 运行时测试 / Runtime tests for the Resume Review in-memory adapter. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { createUiCommandId } from '../../../../shared-kernel/command'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import { asUiResumeReviewPageLimit, groupUiResumeProposalOperations } from '../../domain/review'
import {
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '../../../../testing'
import {
  MOCK_GROUPED_RESUME_PROPOSAL_ID,
  MOCK_PLATFORM_ENGINEER_ITEM_ID,
  MOCK_RESUME_ID,
  MOCK_SUMMARY_SECTION_ID,
  MOCK_RESUME_WORKSPACE_ID
} from './data'
import { InMemoryResumeGateway } from './gateway'

/** @brief 永不取消的 Review 读取信号 / Review-read signal that never aborts. */
const ACTIVE_REVIEW_SIGNAL = new AbortController().signal

describe('InMemoryResumeGateway review capabilities', () => {
  it('paginates immutable revisions and proposals while preserving distinct cursor identities', async () => {
    /** @brief 独享 Review 状态的网关 / Gateway owning isolated Review state. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 只读取一个 revision 的首页 / First revision page containing one entry. */
    const firstRevisionPage = await gateway.listResumeRevisionPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(1),
      resumeId: MOCK_RESUME_ID,
      signal: ACTIVE_REVIEW_SIGNAL,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(firstRevisionPage).toMatchObject({
      hasMore: true,
      items: [{ resumeId: MOCK_RESUME_ID, revision: 18 }]
    })
    if (!firstRevisionPage.hasMore) throw new Error('Expected revision history to continue.')
    /** @brief revision cursor 读取的第二页 / Second page read with a revision cursor. */
    const secondRevisionPage = await gateway.listResumeRevisionPage({
      cursor: firstRevisionPage.nextCursor,
      limit: asUiResumeReviewPageLimit(1),
      resumeId: MOCK_RESUME_ID,
      signal: ACTIVE_REVIEW_SIGNAL,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(secondRevisionPage.items[0]?.revision).toBe(17)

    /** @brief 只读取一个 Proposal 的首页 / First Proposal page containing one entry. */
    const firstProposalPage = await gateway.listResumeProposalPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(1),
      resumeId: MOCK_RESUME_ID,
      signal: ACTIVE_REVIEW_SIGNAL,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(firstProposalPage).toMatchObject({
      hasMore: true,
      items: [{ id: MOCK_GROUPED_RESUME_PROPOSAL_ID, status: 'pending' }]
    })
    /** @brief 首页中包含重复 ID 的 Proposal / Proposal containing duplicate IDs on the first page. */
    const grouped = firstProposalPage.items[0]
    if (grouped === undefined) throw new Error('Expected a Proposal fixture.')
    expect(groupUiResumeProposalOperations(grouped.operations)).toMatchObject([
      { operations: [{ kind: 'set-field' }, { kind: 'set-field' }] },
      { operations: [{ kind: 'set-field' }] }
    ])

    await expect(
      gateway.listResumeRevisionPage({
        cursor: firstProposalPage.hasMore
          ? asUiOpaqueId<'resume-revision-cursor'>(firstProposalPage.nextCursor)
          : null,
        limit: asUiResumeReviewPageLimit(1),
        resumeId: MOCK_RESUME_ID,
        signal: ACTIVE_REVIEW_SIGNAL,
        workspaceId: MOCK_RESUME_WORKSPACE_ID
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
    await expect(
      gateway.getResumeRevision(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, 14, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toMatchObject({
      document: { revision: 14 },
      resumeId: MOCK_RESUME_ID,
      revision: 14
    })
  })

  it('fails closed on wrong identities and aborts delayed Review reads before publishing data', async () => {
    /** @brief 带确定性延迟的 Review 网关 / Review gateway with deterministic latency. */
    const gateway = new InMemoryResumeGateway({ delayMs: 5 })
    /** @brief 暴露读取取消窗口的控制器 / Controller exposing the read cancellation window. */
    const controller = new AbortController()
    /** @brief 延迟中的 Proposal 页面读取 / Proposal-page read in the delay window. */
    const pendingRead = gateway.listResumeProposalPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(20),
      resumeId: MOCK_RESUME_ID,
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    controller.abort(new DOMException('Review route changed.', 'AbortError'))

    await expect(pendingRead).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      gateway.getResumeProposal(
        asUiOpaqueId<'workspace'>('workspace_other_tenant'),
        MOCK_RESUME_ID,
        MOCK_GROUPED_RESUME_PROPOSAL_ID,
        ACTIVE_REVIEW_SIGNAL
      )
    ).rejects.toMatchObject({ code: 'memory.not_found' })
  })

  it('rejects a Proposal without changing the Resume and replays only the frozen intent', async () => {
    /** @brief 独享决策状态的网关 / Gateway owning isolated decision state. */
    const gateway = new InMemoryResumeGateway()
    /** @brief reject 前的完整 Resume 权威 / Complete Resume authority before rejection. */
    const before = await gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    /** @brief 待拒绝 Proposal 的强权威 / Strong authority of the Proposal to reject. */
    const authority = await gateway.getResumeProposal(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      MOCK_GROUPED_RESUME_PROPOSAL_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    if (authority.proposal.status !== 'pending') {
      throw new Error('Expected the grouped Proposal to be pending.')
    }
    /** @brief 首次 reject 与确认重放共享的冻结命令 / Frozen command shared by the first rejection and confirmation replay. */
    const command = {
      commandId: createUiCommandId(),
      concurrencyToken: authority.concurrencyToken,
      decision: { kind: 'reject' } as const,
      proposal: authority.proposal
    }
    /** @brief 首次 reject 结果 / First rejection result. */
    const rejected = await gateway.decideResumeProposal(command)
    /** @brief 同一冻结信封的幂等重放 / Idempotent replay of the same frozen envelope. */
    const replay = await gateway.decideResumeProposal(command)
    /** @brief reject 后的 Proposal 权威 / Proposal authority after rejection. */
    const afterProposal = await gateway.getResumeProposal(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      MOCK_GROUPED_RESUME_PROPOSAL_ID,
      ACTIVE_REVIEW_SIGNAL
    )

    expect(rejected.editor).toEqual(before)
    expect(rejected).toEqual(replay)
    expect(afterProposal.proposal).toMatchObject({ revision: 3, status: 'rejected' })
    expect(afterProposal.concurrencyToken).not.toBe(authority.concurrencyToken)
    await expect(
      gateway.decideResumeProposal({
        ...command,
        decision: { kind: 'accept-all' }
      })
    ).rejects.toMatchObject({ code: 'memory.idempotency_key_reused' })
  })

  it('accepts a duplicate operation ID as one indivisible group and atomically updates history', async () => {
    /** @brief 独享部分接受状态的网关 / Gateway owning isolated partial-acceptance state. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 含重复 ID 组的待审 Proposal / Pending Proposal containing a duplicate-ID group. */
    const authority = await gateway.getResumeProposal(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      MOCK_GROUPED_RESUME_PROPOSAL_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    if (authority.proposal.status !== 'pending') {
      throw new Error('Expected the grouped Proposal to be pending.')
    }
    /** @brief 两条操作共享的不可拆分 ID / Indivisible ID shared by two operations. */
    const groupedOperationId = authority.proposal.operations[0]?.operationId
    if (groupedOperationId === undefined) throw new Error('Expected a grouped operation ID.')

    /** @brief 原子部分接受的权威结果 / Authoritative result of atomic partial acceptance. */
    const result = await gateway.decideResumeProposal({
      commandId: createUiCommandId(),
      concurrencyToken: authority.concurrencyToken,
      decision: {
        kind: 'accept-selected',
        operationIds: [groupedOperationId]
      },
      proposal: authority.proposal
    })
    /** @brief 被同一 operation ID 一并更新的经历条目 / Experience item updated together under the same operation ID. */
    const updatedItem = result.editor.resume.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === MOCK_PLATFORM_ENGINEER_ITEM_ID)
    /** @brief decision 后的 Proposal 权威 / Proposal authority after the decision. */
    const decided = await gateway.getResumeProposal(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      MOCK_GROUPED_RESUME_PROPOSAL_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    /** @brief decision 后新增的最新 revision / Latest revision created by the decision. */
    const revisions = await gateway.listResumeRevisionPage({
      cursor: null,
      limit: asUiResumeReviewPageLimit(1),
      resumeId: MOCK_RESUME_ID,
      signal: ACTIVE_REVIEW_SIGNAL,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    expect(result.appliedOperationIds).toEqual([groupedOperationId])
    expect(result.conflicts).toEqual([])
    expect(result.editor.resume).toMatchObject({
      revision: 19,
      title: '高级 AI 平台工程师 · 分布式系统'
    })
    expect(updatedItem?.summary?.text).toContain('可靠性治理')
    expect(result.editor.resume.profile.headline).toBe('AI Platform Engineer · Distributed Systems')
    expect(decided.proposal.status).toBe('partially-accepted')
    expect(revisions.items[0]?.revision).toBe(19)
    await expect(
      gateway.getResumeRevision(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, 19, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toMatchObject({ document: { title: result.editor.resume.title } })
  })

  it('aborts a delayed Proposal decision without changing Proposal or Resume state', async () => {
    /** @brief 带可观察取消窗口的网关 / Gateway exposing an observable cancellation window. */
    const gateway = new InMemoryResumeGateway({ delayMs: 5 })
    /** @brief decision 前的 Proposal 权威 / Proposal authority before the decision. */
    const authority = await gateway.getResumeProposal(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      MOCK_GROUPED_RESUME_PROPOSAL_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    if (authority.proposal.status !== 'pending') {
      throw new Error('Expected the grouped Proposal to be pending.')
    }
    /** @brief 当前 decision 生命周期 / Current decision lifecycle. */
    const controller = new AbortController()
    /** @brief 延迟中的 decision / Decision in the delay window. */
    const decision = gateway.decideResumeProposal({
      commandId: createUiCommandId(),
      concurrencyToken: authority.concurrencyToken,
      decision: { kind: 'reject' },
      proposal: authority.proposal,
      signal: controller.signal
    })
    controller.abort(new DOMException('Review route changed.', 'AbortError'))

    await expect(decision).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      gateway.getResumeProposal(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        MOCK_GROUPED_RESUME_PROPOSAL_ID,
        ACTIVE_REVIEW_SIGNAL
      )
    ).resolves.toEqual(authority)
  })

  it('commits a Restore only through the shared observable Job state machine', async () => {
    /** @brief Resume 与 Operations 共享的真实内存 Job store / Real in-memory Job store shared by Resume and Operations. */
    const operationsStore = new InMemoryWorkspaceOperationsStore()
    /** @brief 负责 Resume command 与聚合提交的 adapter / Adapter owning Resume commands and aggregate commits. */
    const resumeGateway = new InMemoryResumeGateway({ operationsStore })
    /** @brief 负责通用 Job 观察的 adapter / Adapter owning generic Job observation. */
    const operationsGateway = new InMemoryWorkspaceOperationsGateway({}, operationsStore)
    /** @brief Restore 接受前的当前 Resume / Current Resume before Restore acceptance. */
    const before = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    /** @brief 同一 Restore 意图与确认重放共享的冻结命令 / Frozen command shared by one Restore intent and confirmation replay. */
    const command = {
      commandId: createUiCommandId(),
      concurrencyToken: before.concurrencyToken,
      currentRevision: before.resume.revision,
      resumeId: before.resume.id,
      sourceRevision: 14,
      workspaceId: before.resume.workspaceId
    }
    /** @brief queued Restore Job / Queued Restore Job. */
    const started = await resumeGateway.startResumeRestore(command)
    await expect(resumeGateway.startResumeRestore(command)).resolves.toEqual(started)
    await expect(
      resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toEqual(before)

    /** @brief 第一次观察推进到 running，但尚未提交 Resume / First observation advances to running without committing the Resume. */
    const running = await operationsGateway.getJob({
      jobId: started.job.id,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    await expect(
      resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toEqual(before)
    /** @brief 第二次观察触发真实原子恢复并到达 succeeded / Second observation triggers the real atomic restore and reaches succeeded. */
    const completed = await operationsGateway.getJob({
      jobId: started.job.id,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    /** @brief Restore 后的当前权威 / Current authority after Restore. */
    const restored = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_REVIEW_SIGNAL
    )

    expect(started.job).toMatchObject({ kind: 'resume.restore', status: 'queued' })
    expect(running.job.status).toBe('running')
    expect(completed.job).toMatchObject({
      resultRefs: [{ id: MOCK_RESUME_ID, resourceType: 'resume', revision: 19 }],
      status: 'succeeded'
    })
    expect(restored.resume).toMatchObject({
      revision: 19,
      template: { templateVersion: '0.9.0' },
      title: '平台工程师 · 求职草稿'
    })
    expect(restored.concurrencyToken).not.toBe(before.concurrencyToken)
    await expect(resumeGateway.startResumeRestore(command)).resolves.toEqual(started)
    await expect(
      resumeGateway.startResumeRestore({ ...command, sourceRevision: 17 })
    ).rejects.toBeInstanceOf(InMemoryGatewayError)
  })

  it('fails a queued Restore closed when a newer user edit wins the aggregate race', async () => {
    /** @brief Resume 与 Operations 共享的状态 / State shared by Resume and Operations. */
    const operationsStore = new InMemoryWorkspaceOperationsStore()
    /** @brief 拥有聚合写入的 Resume adapter / Resume adapter owning aggregate writes. */
    const resumeGateway = new InMemoryResumeGateway({ operationsStore })
    /** @brief 观察异步状态机的 Operations adapter / Operations adapter observing the asynchronous state machine. */
    const operationsGateway = new InMemoryWorkspaceOperationsGateway({}, operationsStore)
    /** @brief Restore 接受时的 Resume 权威 / Resume authority when Restore is accepted. */
    const initial = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    /** @brief 已排队但尚未提交的 Restore / Restore queued but not yet committed. */
    const started = await resumeGateway.startResumeRestore({
      commandId: createUiCommandId(),
      concurrencyToken: initial.concurrencyToken,
      currentRevision: initial.resume.revision,
      resumeId: initial.resume.id,
      sourceRevision: 14,
      workspaceId: initial.resume.workspaceId
    })
    /** @brief 在 Restore 执行前先确认的用户编辑 / User edit confirmed before the Restore executes. */
    const edited = await resumeGateway.updateResumeSection({
      baseRevision: initial.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: initial.concurrencyToken,
      resumeId: initial.resume.id,
      sectionId: MOCK_SUMMARY_SECTION_ID,
      title: '用户刚刚确认的新摘要',
      workspaceId: initial.resume.workspaceId
    })

    await operationsGateway.getJob({
      jobId: started.job.id,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    /** @brief 聚合前置条件失效后的失败终态 / Failed terminal state after the aggregate precondition became stale. */
    const failed = await operationsGateway.getJob({
      jobId: started.job.id,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    expect(failed.job).toMatchObject({
      problem: { code: 'resume.restore_conflict', retryable: false, status: 409 },
      resultRefs: [],
      status: 'failed'
    })
    await expect(
      resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toEqual(edited)
  })

  it('never commits a Restore after its queued Job is cancelled', async () => {
    /** @brief Resume 与 Operations 共享的状态 / State shared by Resume and Operations. */
    const operationsStore = new InMemoryWorkspaceOperationsStore()
    /** @brief Resume command adapter / Resume 命令 adapter. */
    const resumeGateway = new InMemoryResumeGateway({ operationsStore })
    /** @brief 通用 Job adapter / Generic Job adapter. */
    const operationsGateway = new InMemoryWorkspaceOperationsGateway({}, operationsStore)
    /** @brief Restore 前的完整权威 / Complete authority before Restore. */
    const before = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_REVIEW_SIGNAL
    )
    /** @brief 尚未开始的 queued Restore / Queued Restore that has not started. */
    const started = await resumeGateway.startResumeRestore({
      commandId: createUiCommandId(),
      concurrencyToken: before.concurrencyToken,
      currentRevision: before.resume.revision,
      resumeId: before.resume.id,
      sourceRevision: 14,
      workspaceId: before.resume.workspaceId
    })
    /** @brief 用户确认取消后的终态 / Terminal state after user-confirmed cancellation. */
    const cancelled = await operationsGateway.cancelJob({
      commandId: createUiCommandId(),
      concurrencyToken: started.concurrencyToken,
      jobId: started.job.id,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(cancelled.job.status).toBe('cancelled')
    await expect(
      operationsGateway.getJob({
        jobId: started.job.id,
        workspaceId: MOCK_RESUME_WORKSPACE_ID
      })
    ).resolves.toEqual(cancelled)
    await expect(
      resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_REVIEW_SIGNAL)
    ).resolves.toEqual(before)
  })
})
