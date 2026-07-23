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
import { asUiOpaqueId } from '../shared-kernel/identity'
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
      resumeReview: resume,
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

/** @brief 当前测试固定的 PDF preview 规格 / PDF-preview specification fixed for these tests. */
const PREVIEW_SPECIFICATION = {
  formats: ['pdf'],
  mode: 'preview',
  ...TARGET
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
    const started = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
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
    const [output] = await process.resolveOutputs(PREVIEW_SPECIFICATION, terminal.job)
    if (output === undefined) throw new Error('Expected a resolved PDF output.')
    /** @brief 从结果引用解析的权威 PDF / Authoritative PDF resolved from result references. */
    const { artifact } = output
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

  it('binds every export format to one Job and resolves exact kind/MIME outputs in request order', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief Resume command 调用观测器 / Resume-command call observer. */
    const startResumeRender = vi.spyOn(gateways.resume, 'startResumeRender')
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 一个 Job 原子绑定的完整导出规格 / Complete export specification atomically bound to one Job. */
    const specification = {
      formats: ['json', 'pdf', 'docx'],
      mode: 'export',
      ...TARGET
    } as const
    /** @brief 唯一接受的导出 Job / Sole accepted export Job. */
    const started = await process.start({
      commandId: createUiCommandId(),
      ...specification
    })
    /** @brief 轮询到成功的同一个 Job / Same Job observed through success. */
    const terminal = await process.watchToTerminal(
      specification,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded export Job.')

    const outputs = await process.resolveOutputs(specification, terminal.job)

    expect(startResumeRender).toHaveBeenCalledTimes(1)
    expect(startResumeRender).toHaveBeenCalledWith(
      expect.objectContaining({
        formats: ['json', 'pdf', 'docx'],
        mode: 'export',
        resumeRevision: TARGET.resumeRevision
      })
    )
    expect(terminal.job.id).toBe(started.job.id)
    expect(outputs.map((output) => [output.format, output.artifact.kind])).toEqual([
      ['json', 'resume_json'],
      ['pdf', 'resume_pdf'],
      ['docx', 'resume_docx']
    ])
    expect(new Set(outputs.map((output) => output.artifact.subject.revision))).toEqual(
      new Set([TARGET.resumeRevision])
    )
  })

  it('replays an unknown start only with the exact command and uses GET after a Job is known', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief Resume POST 与 Workspace Job GET 观测器 / Resume POST and Workspace-Job GET observers. */
    const startResumeRender = vi.spyOn(gateways.resume, 'startResumeRender')
    const getJob = vi.spyOn(gateways.workspaceOperations, 'getJob')
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 未确认 POST 期间冻结的完整命令 / Complete command frozen while the POST is unconfirmed. */
    const command = {
      commandId: createUiCommandId(),
      formats: ['pdf', 'docx'],
      mode: 'final',
      ...TARGET
    } as const

    const first = await process.start(command)
    const replay = await process.start(command)
    expect(replay).toEqual(first)
    await expect(process.start({ ...command, formats: ['pdf'] })).rejects.toMatchObject({
      code: 'memory.idempotency_key_reused'
    })

    startResumeRender.mockClear()
    await process.refreshJob(command, first.job.id)
    expect(startResumeRender).not.toHaveBeenCalled()
    expect(getJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: first.job.id, workspaceId: TARGET.workspaceId })
    )
  })

  it('rejects product-invalid or non-v2 formats before dispatch', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不得接收无效产品意图的底层端口 / Lower port that must not receive invalid product intents. */
    const startResumeRender = vi.spyOn(gateways.resume, 'startResumeRender')
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender

    await expect(
      process.start({
        commandId: createUiCommandId(),
        formats: ['json'],
        mode: 'final',
        ...TARGET
      })
    ).rejects.toMatchObject({ code: 'invalid-render-intent' })
    await expect(
      process.start({
        commandId: createUiCommandId(),
        formats: ['pdf'],
        mode: 'export',
        ...TARGET
      })
    ).rejects.toMatchObject({ code: 'invalid-render-intent' })
    await expect(
      process.start({
        commandId: createUiCommandId(),
        formats: ['png'],
        mode: 'final',
        ...TARGET
      } as never)
    ).rejects.toMatchObject({ code: 'invalid-render-intent' })
    expect(startResumeRender).not.toHaveBeenCalled()
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
    const { gateways, store } = createComposition()
    /** @brief cancellation 调用观测器 / Cancellation-call observer. */
    const cancelJob = vi.spyOn(gateways.workspaceOperations, 'cancelJob')
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 尚在 queued 的已接受 Job / Accepted Job still queued. */
    const started = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
    /** @brief cancellation 后权威 / Authority after cancellation. */
    const cancelled = await process.cancel(TARGET, started, createUiCommandId())

    expect(cancelled.job.status).toBe('cancelled')
    expect(cancelled.job.resultRefs).toEqual([])
    expect(store.listArtifacts()).toEqual([])
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
    const started = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
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
    const current = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })

    const recovered = await process.findPreviewRecoveryCandidates(TARGET)

    expect(recovered.hasMore).toBe(false)
    expect(recovered.jobs).toHaveLength(1)
    expect(recovered.jobs[0]?.id).toBe(current.job.id)
  })

  it('fails closed on missing and unrequested Render outputs', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 服务端实际接受的双格式导出 / Two-format export actually accepted by the service. */
    const actualSpecification = {
      formats: ['json', 'pdf'],
      mode: 'export',
      ...TARGET
    } as const
    const started = await process.start({
      commandId: createUiCommandId(),
      ...actualSpecification
    })
    const terminal = await process.watchToTerminal(
      actualSpecification,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded export Job.')

    await expect(
      process.resolveOutputs(
        { ...actualSpecification, formats: ['json', 'pdf', 'docx'] },
        terminal.job
      )
    ).rejects.toMatchObject({ code: 'artifact-result-missing' })
    await expect(process.resolveOutputs(PREVIEW_SPECIFICATION, terminal.job)).rejects.toMatchObject(
      { code: 'artifact-output-unrequested' }
    )
  })

  it('fails closed on duplicate formats and kind/MIME disagreement in Job outputs', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    /** @brief 双格式导出规格 / Two-format export specification. */
    const specification = {
      formats: ['pdf', 'json'],
      mode: 'export',
      ...TARGET
    } as const
    const started = await process.start({
      commandId: createUiCommandId(),
      ...specification
    })
    const terminal = await process.watchToTerminal(
      specification,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded export Job.')
    /** @brief 未替换的 Artifact metadata 读取 / Original Artifact-metadata read. */
    const getArtifact = gateways.workspaceOperations.getArtifact.bind(gateways.workspaceOperations)
    /** @brief 将 JSON 伪装成第二个 PDF 的恶意 metadata adapter / Malicious metadata adapter disguising JSON as a second PDF. */
    const duplicateOutputAdapter = vi
      .spyOn(gateways.workspaceOperations, 'getArtifact')
      .mockImplementation(async (request) => {
        /** @brief 当前真实 Artifact 权威 / Current real Artifact authority. */
        const authority = await getArtifact(request)
        return authority.artifact.kind === 'resume_json'
          ? {
              ...authority,
              artifact: {
                ...authority.artifact,
                kind: 'resume_pdf',
                mediaType: 'application/pdf'
              }
            }
          : authority
      })
    await expect(process.resolveOutputs(specification, terminal.job)).rejects.toMatchObject({
      code: 'artifact-output-duplicate'
    })

    duplicateOutputAdapter.mockRestore()
    /** @brief 另一个隔离组合，避免复用已替换端口 / Another isolated composition avoiding reuse of the replaced port. */
    const mismatchComposition = createComposition()
    const mismatchProcess = createAppProcesses(mismatchComposition.gateways, () =>
      Promise.resolve()
    ).resumeRender
    const mismatchStarted = await mismatchProcess.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
    const mismatchTerminal = await mismatchProcess.watchToTerminal(
      PREVIEW_SPECIFICATION,
      mismatchStarted,
      new AbortController().signal,
      (): void => undefined
    )
    if (mismatchTerminal.job.status !== 'succeeded') {
      throw new Error('Expected a succeeded preview Job.')
    }
    /** @brief 未替换的 PDF Artifact metadata 读取 / Original PDF Artifact-metadata read. */
    const getPdfArtifact = mismatchComposition.gateways.workspaceOperations.getArtifact.bind(
      mismatchComposition.gateways.workspaceOperations
    )
    vi.spyOn(mismatchComposition.gateways.workspaceOperations, 'getArtifact').mockImplementation(
      async (request) => {
        const authority = await getPdfArtifact(request)
        return {
          ...authority,
          artifact: { ...authority.artifact, mediaType: 'application/json' }
        }
      }
    )
    await expect(
      mismatchProcess.resolveOutputs(PREVIEW_SPECIFICATION, mismatchTerminal.job)
    ).rejects.toMatchObject({ code: 'artifact-kind-media-type-mismatch' })
  })

  it('rejects non-Artifact refs, duplicate refs, and mismatched Artifact identities', async (): Promise<void> => {
    /** @brief 当前测试组合 / Composition for this test. */
    const { gateways } = createComposition()
    /** @brief 不等待真实时间的产品流程 / Product process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRender
    const started = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
    const terminal = await process.watchToTerminal(
      PREVIEW_SPECIFICATION,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded preview Job.')
    /** @brief 成功 Job 的唯一真实 Artifact 引用 / Sole real Artifact reference in the succeeded Job. */
    const reference = terminal.job.resultRefs[0]
    if (reference === undefined) throw new Error('Expected one Artifact result reference.')
    /** @brief 未替换的 Artifact metadata 读取 / Original Artifact-metadata read. */
    const getArtifact = gateways.workspaceOperations.getArtifact.bind(gateways.workspaceOperations)
    /** @brief 所有异常引用场景共享的读取观测器 / Read observer shared by all malformed-reference cases. */
    const getArtifactAdapter = vi.spyOn(gateways.workspaceOperations, 'getArtifact')

    await expect(
      process.resolveOutputs(PREVIEW_SPECIFICATION, {
        ...terminal.job,
        resultRefs: [{ ...reference, resourceType: 'resume' }]
      })
    ).rejects.toMatchObject({ code: 'artifact-output-unrequested' })
    expect(getArtifactAdapter).not.toHaveBeenCalled()

    await expect(
      process.resolveOutputs(PREVIEW_SPECIFICATION, {
        ...terminal.job,
        resultRefs: [reference, reference]
      })
    ).rejects.toMatchObject({ code: 'artifact-reference-duplicate' })

    getArtifactAdapter.mockImplementation(async (request) => {
      /** @brief 路径 identity 正确但表示 identity 错误的恶意响应 / Malicious response with a correct path identity but wrong representation identity. */
      const authority = await getArtifact(request)
      return {
        ...authority,
        artifact: {
          ...authority.artifact,
          id: asUiOpaqueId<'workspace-artifact'>('artifact_wrong_identity')
        }
      }
    })
    await expect(process.resolveOutputs(PREVIEW_SPECIFICATION, terminal.job)).rejects.toMatchObject(
      { code: 'artifact-identity-mismatch' }
    )
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
    const started = await process.start({
      commandId: createUiCommandId(),
      ...PREVIEW_SPECIFICATION
    })
    /** @brief 成功终态 / Succeeded terminal state. */
    const terminal = await process.watchToTerminal(
      TARGET,
      started,
      new AbortController().signal,
      (): void => undefined
    )
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded Render Job.')
    const [output] = await process.resolveOutputs(PREVIEW_SPECIFICATION, terminal.job)
    if (output === undefined) throw new Error('Expected a resolved PDF output.')
    /** @brief 真实 Artifact metadata / Real Artifact metadata. */
    const { artifact } = output
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

/** @brief 跨 Resume history 与通用 Job 的恢复流程 / Restore process spanning Resume history and generic Jobs. */
describe('createAppProcesses Resume restore', (): void => {
  it('observes the real Job and rereads the advanced Resume only after success', async (): Promise<void> => {
    /** @brief 当前测试组合 / Current test composition. */
    const { gateways } = createComposition()
    /** @brief 启动前读取的 Resume 与强 ETag / Resume and strong ETag read before starting. */
    const current = await gateways.resume.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      new AbortController().signal
    )
    /** @brief 不等待真实时间的 restore 流程 / Restore process independent of wall-clock delays. */
    const process = createAppProcesses(gateways, () => Promise.resolve()).resumeRestore
    /** @brief 冻结恢复目标 / Frozen restore target. */
    const target = {
      currentRevision: current.resume.revision,
      resumeId: current.resume.id,
      sourceRevision: 17,
      workspaceId: current.resume.workspaceId
    } as const
    /** @brief API v2 接受的 queued Job / Queued Job accepted by API v2. */
    const started = await process.start({
      ...target,
      commandId: createUiCommandId(),
      concurrencyToken: current.concurrencyToken
    })
    expect(started.job.status).toBe('queued')
    /** @brief 轮询期间的真实状态 / Real states observed during polling. */
    const observed: string[] = []
    /** @brief 到达的真实终态 / Real terminal state reached by polling. */
    const terminal = await process.watchToTerminal(
      target,
      started,
      new AbortController().signal,
      (authority): void => {
        observed.push(authority.job.status)
      }
    )
    expect(observed).toEqual(['running', 'succeeded'])
    expect(terminal.job.status).toBe('succeeded')
    if (terminal.job.status !== 'succeeded') throw new Error('Expected a succeeded Restore Job.')
    /** @brief Job 成功后重新读取的 Resume 权威 / Resume authority reread after Job success. */
    const restored = await process.readRestoredResume(
      target,
      terminal.job,
      new AbortController().signal
    )
    expect(restored.resume).toMatchObject({
      id: MOCK_RESUME_ID,
      revision: current.resume.revision + 1
    })
  })
})
