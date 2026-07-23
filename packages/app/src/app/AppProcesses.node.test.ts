import { describe, expect, it, vi } from 'vitest'

import type { AppGateways, UiWorkspaceJobAuthority } from '../application'
import {
  InMemoryIdentityGateway,
  InMemoryInterviewGateway,
  InMemoryKnowledgeGateway,
  InMemoryResumeGateway,
  InMemoryWorkspaceGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID
} from '../testing'
import { createUiCommandId } from '../shared-kernel/command'
import { createAppProcesses, ResumeRenderProcessError } from './AppProcesses'

/** @brief 带可观察共享 Operations store 的测试组合 / Test composition carrying an observable shared Operations store. */
interface TestComposition {
  /** @brief 完整应用端口 / Complete application ports. */
  readonly gateways: AppGateways
  /** @brief Resume command 与 Operations gateway 共享的 store / Store shared by Resume commands and the Operations gateway. */
  readonly store: InMemoryWorkspaceOperationsStore
}

/**
 * @brief 创建覆盖全部限界上下文的测试组合 / Create a test composition spanning every bounded context.
 * @return 共享 Render/Job/Artifact 状态的端口 / Ports sharing Render, Job, and Artifact state.
 */
function createComposition(): TestComposition {
  /** @brief Resume 与 Operations 共享的异步资源状态 / Asynchronous-resource state shared by Resume and Operations. */
  const store = new InMemoryWorkspaceOperationsStore()
  /** @brief 同时承载 Resume 各端口的独享测试适配器 / Isolated test adapter serving each Resume port. */
  const resume = new InMemoryResumeGateway({ operationsStore: store })
  return {
    gateways: {
      identity: new InMemoryIdentityGateway(),
      interview: new InMemoryInterviewGateway(),
      knowledge: new InMemoryKnowledgeGateway(),
      resume,
      resumeCreation: resume,
      resumeTemplates: resume,
      workspace: new InMemoryWorkspaceGateway(),
      workspaceOperations: new InMemoryWorkspaceOperationsGateway({}, store)
    },
    store
  }
}

/** @brief 当前测试固定的 Resume Render 目标 / Resume-render target fixed for these tests. */
const TARGET = {
  resumeId: MOCK_RESUME_ID,
  resumeRevision: 18,
  workspaceId: MOCK_RESUME_WORKSPACE_ID
} as const

/** @brief 跨 Resume、Job 与 Artifact 的命名产品流程 / Named product process spanning Resume, Job, and Artifact. */
describe('createAppProcesses Resume Render', (): void => {
  it('follows command, Job result_refs, metadata, and authenticated content without a URL', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 轮询观察到的状态 / Statuses observed while polling. */
    const observed: string[] = []
    /** @brief 已接受的 Render Job / Accepted Render Job. */
    const started = await process.startPdfPreview({ commandId: createUiCommandId(), ...TARGET })
    /** @brief 轮询到的真实终态 / Real terminal state reached by polling. */
    const terminal = await process.watchToTerminal(
      TARGET,
      started,
      new AbortController().signal,
      (authority): void => {
        observed.push(authority.job.status)
      }
    )

    expect(observed).toEqual(['running', 'succeeded'])
    expect(terminal.job.status).toBe('succeeded')
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded Render Job.')
    /** @brief 从结果引用解析的权威 PDF / Authoritative PDF resolved from result references. */
    const { artifact } = await process.resolvePdf(TARGET, terminal.job)
    expect(artifact).toMatchObject({
      kind: 'resume_pdf',
      mediaType: 'application/pdf',
      subject: { id: MOCK_RESUME_ID, revision: 18, resourceType: 'resume' }
    })
    expect('contentUrl' in artifact).toBe(false)

    /** @brief 尚未消费的 Bearer content / Unconsumed Bearer content. */
    const content = await process.readPdfPreview(TARGET, artifact)
    /** @brief 消费 EOF 以完成下层摘要验证 / Reader consuming EOF to complete lower-layer digest validation. */
    const reader = content.body?.getReader()
    /** @brief 已消费的字节数 / Number of bytes consumed. */
    let byteLength = 0
    if (reader === undefined) throw new Error('Expected a non-empty PDF stream.')
    for (;;) {
      /** @brief 当前分块或 EOF / Current chunk or EOF. */
      const result = await reader.read()
      if (result.done) break
      byteLength += result.value.byteLength
    }
    expect(byteLength).toBe(artifact.sizeBytes)
  })

  it('accepts a queued Job whose next observable snapshot is already succeeded', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 已接受但尚未执行的初始快照 / Accepted initial snapshot that has not started yet. */
    const started = await gateways.resume.startResumeRender({
      commandId: createUiCommandId(),
      formats: ['pdf'],
      mode: 'preview',
      ...TARGET
    })
    expect(started.job.status).toBe('queued')
    /** @brief 内存执行器先后生成但客户端可能未观察到的 running 与 succeeded 快照 / Running and succeeded snapshots produced by the memory executor even when the client misses the former. */
    await gateways.workspaceOperations.getJob({
      jobId: started.job.id,
      workspaceId: TARGET.workspaceId
    })
    const succeeded = await gateways.workspaceOperations.getJob({
      jobId: started.job.id,
      workspaceId: TARGET.workspaceId
    })
    expect(succeeded.job.status).toBe('succeeded')
    vi.spyOn(gateways.workspaceOperations, 'getJob').mockResolvedValue(succeeded)
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 客户端实际观察到的快照 / Snapshots actually observed by the client. */
    const observed: string[] = []

    const terminal = await process.watchToTerminal(
      TARGET,
      started,
      new AbortController().signal,
      (authority): void => {
        observed.push(authority.job.status)
      }
    )

    expect(observed).toEqual(['succeeded'])
    expect(terminal.job.status).toBe('succeeded')
  })

  it('uses the current strong Job ETag for a real server cancellation', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief cancellation 调用观测器 / Cancellation-call observer. */
    const cancelJob = vi.spyOn(gateways.workspaceOperations, 'cancelJob')
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 尚在 queued 的已接受 Job / Accepted Job still queued. */
    const started = await process.startPdfPreview({ commandId: createUiCommandId(), ...TARGET })
    /** @brief cancellation 后权威 / Authority after cancellation. */
    const cancelled = await process.cancel(TARGET, started, createUiCommandId())

    expect(cancelled.job.status).toBe('cancelled')
    expect(cancelJob).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrencyToken: started.concurrencyToken,
        jobId: started.job.id,
        workspaceId: TARGET.workspaceId
      })
    )
  })

  it('fails closed when a polled Job regresses in the API v2 state graph', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 已接受的 queued Job / Accepted queued Job. */
    const started = await process.startPdfPreview({ commandId: createUiCommandId(), ...TARGET })
    /** @brief 第一次读取推进到 running / First read advancing to running. */
    const running = await gateways.workspaceOperations.getJob({
      jobId: started.job.id,
      workspaceId: TARGET.workspaceId
    })
    if (running.job.status !== 'running') throw new Error('Expected a running Job fixture.')
    /** @brief 伪造 revision 倒退的 queued 表示 / Forged queued representation with a regressed revision. */
    const regressed = {
      ...started,
      job: { ...started.job, revision: 1 }
    } as UiWorkspaceJobAuthority
    vi.spyOn(gateways.workspaceOperations, 'getJob').mockResolvedValue(regressed)

    await expect(
      process.watchToTerminal(TARGET, running, new AbortController().signal, (): void => undefined)
    ).rejects.toMatchObject({
      code: 'invalid-job-transition',
      name: 'ResumeRenderProcessError'
    })
  })

  it('returns bounded recovery candidates only for the exact Resume revision', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    await gateways.resume.startResumeRender({
      commandId: createUiCommandId(),
      formats: ['pdf'],
      mode: 'preview',
      resumeId: TARGET.resumeId,
      resumeRevision: 17,
      workspaceId: TARGET.workspaceId
    })
    /** @brief 当前精确 revision 的 Job / Job for the current exact revision. */
    const current = await process.startPdfPreview({ commandId: createUiCommandId(), ...TARGET })

    const recovered = await process.findRecoveryCandidates(TARGET)

    expect(recovered.hasMore).toBe(false)
    expect(recovered.jobs).toHaveLength(1)
    expect(recovered.jobs[0]?.id).toBe(current.job.id)
  })

  it('refuses an expired PDF before opening its protected content', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 固定在 Artifact 到期后的产品流程 / Product process with a clock after Artifact expiry. */
    const process = createAppProcesses(
      gateways,
      () => Promise.resolve(),
      () => Date.parse('2030-01-01T00:00:00.000Z')
    ).resumeRender
    /** @brief 已接受的 Render Job / Accepted Render Job. */
    const started = await process.startPdfPreview({ commandId: createUiCommandId(), ...TARGET })
    /** @brief 成功终态 / Succeeded terminal state. */
    const terminal = await process.watchToTerminal(
      TARGET,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded Render Job.')
    /** @brief 真实 Artifact metadata / Real Artifact metadata. */
    const { artifact } = await process.resolvePdf(TARGET, terminal.job)
    /** @brief 显式构造的已过期 metadata，避免 fixture 依赖测试运行日期 / Explicitly expired metadata avoiding fixture dependence on the test execution date. */
    const expiredArtifact = { ...artifact, expiresAt: '2029-12-31T23:59:59.000Z' }
    /** @brief 不应被调用的内容读取 / Content read that must not be called. */
    const readArtifactContent = vi.spyOn(gateways.workspaceOperations, 'readArtifactContent')

    await expect(process.readPdfPreview(TARGET, expiredArtifact)).rejects.toBeInstanceOf(
      ResumeRenderProcessError
    )
    expect(readArtifactContent).not.toHaveBeenCalled()
  })
})
