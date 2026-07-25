/** @file Resume 最终生成与导出 DOM 旅程 / DOM journeys for Resume final generation and export. */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiV2WriteOutcomeUnknownError } from '@ai-job-workspace/product-api-v2'
import {
  InMemoryResumeGateway,
  InMemoryWorkspaceOperationsGateway,
  InMemoryWorkspaceOperationsStore
} from '@ai-job-workspace/app/testing'
import type {
  ArtifactSavePort,
  SaveArtifactRequest,
  SaveArtifactResult
} from '@ai-job-workspace/platform'

import {
  createTestGateways,
  installWorkspaceAppTestCleanup,
  setWorkspaceAppTestLocale,
  WorkspaceApp
} from './WorkspaceApp.dom-test-harness'

installWorkspaceAppTestCleanup()

/** @brief 输出 DOM 测试使用的共享 adapter / Shared adapters used by output DOM tests. */
interface ResumeOutputTestComposition {
  /** @brief 当前 Resume command adapter / Current Resume-command adapter. */
  readonly resume: InMemoryResumeGateway
  /** @brief 当前通用 Operations adapter / Current generic Operations adapter. */
  readonly workspaceOperations: InMemoryWorkspaceOperationsGateway
}

/**
 * @brief 创建声明 PDF、DOCX、PNG 与 HTML snapshot 的固定模板测试装配 / Create a test composition whose pinned Template declares PDF, DOCX, PNG, and HTML snapshot.
 * @return Resume 与 Operations 共享状态的装配 / Composition where Resume and Operations share state.
 */
function createMultiFormatComposition(): ResumeOutputTestComposition {
  /** @brief 当前测试独享的 Operations store / Operations store owned by this test. */
  const store = new InMemoryWorkspaceOperationsStore()
  /** @brief 当前测试的 Resume adapter / Resume adapter for this test. */
  const resume = new InMemoryResumeGateway({ operationsStore: store })
  /** @brief 当前测试的 Operations adapter / Operations adapter for this test. */
  const workspaceOperations = new InMemoryWorkspaceOperationsGateway({}, store)
  /** @brief 未修改的固定模板读取 / Original pinned-Template read. */
  const getTemplate = resume.getTemplate.bind(resume)
  vi.spyOn(resume, 'getTemplate').mockImplementation(async (reference, signal) => {
    /** @brief 保持精确 identity 的原模板 / Original Template preserving exact identity. */
    const template = await getTemplate(reference, signal)
    return {
      ...template,
      supportedOutputFormats: ['html_snapshot', 'docx', 'png', 'pdf']
    }
  })
  return { resume, workspaceOperations }
}

/**
 * @brief 渲染真实内存“生成与导出”页 / Render the real in-memory “Generate and export” page.
 * @param composition 可观察 adapter / Observable adapters.
 * @param artifactSave 可选宿主保存端口 / Optional host-save port.
 */
function renderResumeOutput(
  composition: ResumeOutputTestComposition,
  artifactSave?: ArtifactSavePort
): void {
  render(
    <WorkspaceApp
      {...(artifactSave === undefined ? {} : { artifactSave })}
      gateways={createTestGateways({
        resume: composition.resume,
        resumeTemplates: composition.resume,
        workspaceOperations: composition.workspaceOperations
      })}
      initialPath="/resumes/res_mock_ai_platform/export"
    />
  )
}

/**
 * @brief 通过页面恢复可见事件推进一轮 Job GET / Advance one Job GET through a page-visible event.
 */
async function advanceVisibleJobPoll(): Promise<void> {
  await act(async (): Promise<void> => {
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve): void => {
      globalThis.setTimeout(resolve, 0)
    })
  })
}

/**
 * @brief 将内存 queued Job 推进到 succeeded 并等待输出区域 / Advance an in-memory queued Job to succeeded and await the output region.
 * @return 已完成输出区域 / Completed output region.
 */
async function completeRenderJob(): Promise<HTMLElement> {
  await advanceVisibleJobPoll()
  await advanceVisibleJobPoll()
  return screen.findByRole('region', { name: '生成的文件' })
}

beforeEach(async (): Promise<void> => {
  await setWorkspaceAppTestLocale('zh-SG')
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

/** @brief Resume final/export 产品闭环 / Resume final/export product loop. */
describe('WorkspaceApp Resume output', (): void => {
  it('creates one final Job for only the pinned Template PDF/DOCX intersection', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 可观察 Render create / Observable Render create. */
    const start = vi.spyOn(composition.resume, 'startResumeRender')
    renderResumeOutput(composition)

    expect(await screen.findByRole('heading', { name: '生成与导出' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' }))
    /** @brief 任务完成后的输出区 / Output region after task completion. */
    const outputs = await completeRenderJob()

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        formats: ['pdf', 'docx'],
        mode: 'final',
        resumeId: 'res_mock_ai_platform',
        resumeRevision: 18,
        workspaceId: 'ws_mock_klee_career_lab'
      })
    )
    expect(within(outputs).getByRole('button', { name: '保存 PDF' })).toBeEnabled()
    expect(within(outputs).getByRole('button', { name: '保存 DOCX' })).toBeEnabled()
    expect(within(outputs).queryByRole('button', { name: '保存 JSON' })).not.toBeInTheDocument()
  })

  it('exactly replays an uncertain export POST and resolves JSON/PDF/DOCX without PNG or HTML', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 未替换的真实内存 Render create / Original real in-memory Render create. */
    const startRender = composition.resume.startResumeRender.bind(composition.resume)
    /** @brief 首次已提交但响应丢失、确认时返回缓存 Job 的 adapter / Adapter whose first committed response is lost and confirmation returns the cached Job. */
    const start = vi
      .spyOn(composition.resume, 'startResumeRender')
      .mockImplementationOnce(async (input): Promise<never> => {
        await startRender(input)
        throw new ApiV2WriteOutcomeUnknownError('network')
      })
      .mockImplementation(startRender)
    renderResumeOutput(composition)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '导出语义与文件（JSON + PDF + DOCX）' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('任务创建结果尚未确认')
    /** @brief 首次冻结意图 / Initially frozen intent. */
    const first = start.mock.calls[0]?.[0]
    if (first === undefined) throw new Error('Expected an initial export command.')

    fireEvent.click(screen.getByRole('button', { name: '确认同一任务创建结果' }))
    /** @brief 任务完成后的输出区 / Output region after task completion. */
    const outputs = await completeRenderJob()
    /** @brief 精确确认信封 / Exact confirmation envelope. */
    const confirmation = start.mock.calls[1]?.[0]

    expect(confirmation).toMatchObject({
      commandId: first.commandId,
      formats: first.formats,
      mode: first.mode,
      resumeId: first.resumeId,
      resumeRevision: first.resumeRevision,
      workspaceId: first.workspaceId
    })
    expect(first).toMatchObject({
      formats: ['json', 'pdf', 'docx'],
      mode: 'export'
    })
    expect(first.formats).not.toContain('png')
    expect(first.formats).not.toContain('html_snapshot')
    expect(within(outputs).getByRole('button', { name: '保存 JSON' })).toBeEnabled()
    expect(within(outputs).getByRole('button', { name: '保存 PDF' })).toBeEnabled()
    expect(within(outputs).getByRole('button', { name: '保存 DOCX' })).toBeEnabled()
  })

  it('never replays a malformed successful create response and explains explicit local abandonment', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 返回不可重放坏成功响应的 Render create / Render create returning an unreplayable malformed success response. */
    const start = vi
      .spyOn(composition.resume, 'startResumeRender')
      .mockRejectedValue(
        new ApiV2WriteOutcomeUnknownError(
          'contract',
          201,
          null,
          'request_bad_render_success_12345678'
        )
      )
    renderResumeOutput(composition)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('旧命令不能安全重放')
    expect(screen.queryByRole('button', { name: '确认同一任务创建结果' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放弃未知本地跟踪' }))

    expect(await screen.findByRole('status')).toHaveTextContent('不会取消服务端可能已经接受的任务')
    expect(start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' })).toBeEnabled()
  })

  it('cancels the known server Job and presents the authoritative cancelled terminal state', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 可观察 cancellation / Observable cancellation. */
    const cancel = vi.spyOn(composition.workspaceOperations, 'cancelJob')
    renderResumeOutput(composition)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' }))
    fireEvent.click(await screen.findByRole('button', { name: '取消生成任务' }))

    expect(await screen.findByText('生成任务已取消')).toBeVisible()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: '生成的文件' })).not.toBeInTheDocument()
  })

  it('saves outputs independently while enforcing one synchronous host-save lane', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 第一份保存的完成器 / Resolver for the first save. */
    let resolveFirstSave: ((result: SaveArtifactResult) => void) | undefined
    /** @brief 可观察宿主保存 / Observable host save. */
    const saveArtifact = vi.fn((request: SaveArtifactRequest): Promise<SaveArtifactResult> => {
      if (request.suggestedFileName.endsWith('.pdf')) {
        return new Promise((resolve): void => {
          resolveFirstSave = resolve
        })
      }
      return Promise.resolve({ status: 'saved' })
    })
    /** @brief 当前测试宿主能力 / Host capability for this test. */
    const artifactSave: ArtifactSavePort = {
      maximumArtifactBytes: null,
      saveArtifact
    }
    renderResumeOutput(composition, artifactSave)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' }))
    /** @brief 已完成输出区 / Completed output region. */
    const outputs = await completeRenderJob()
    /** @brief PDF 保存按钮 / PDF save button. */
    const savePdf = within(outputs).getByRole('button', { name: '保存 PDF' })
    act((): void => {
      savePdf.click()
      savePdf.click()
    })

    expect(saveArtifact).toHaveBeenCalledTimes(1)
    expect(within(outputs).getByRole('button', { name: '保存 DOCX' })).toBeDisabled()
    resolveFirstSave?.({ status: 'saved' })
    expect(await within(outputs).findByText('PDF 已保存。')).toBeVisible()

    fireEvent.click(within(outputs).getByRole('button', { name: '保存 DOCX' }))
    expect(await within(outputs).findByText('DOCX 已保存。')).toBeVisible()
    expect(saveArtifact).toHaveBeenCalledTimes(2)
    expect(saveArtifact.mock.calls.map(([request]) => request.suggestedFileName)).toEqual([
      'Klee Chen Resume.pdf',
      'Klee Chen Resume.docx'
    ])
  })

  it('fails closed on the host size ceiling and warns before retrying an uncertain save', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief JSON 保存的未知宿主结果 / Unknown host outcome for the JSON save. */
    const saveArtifact = vi
      .fn<(request: SaveArtifactRequest) => Promise<SaveArtifactResult>>()
      .mockRejectedValue(new ApiV2WriteOutcomeUnknownError('network'))
    /** @brief 只允许三字节 JSON fixture 的宿主 / Host permitting only the three-byte JSON fixture. */
    const artifactSave: ArtifactSavePort = {
      maximumArtifactBytes: 3,
      saveArtifact
    }
    renderResumeOutput(composition, artifactSave)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '导出语义与文件（JSON + PDF + DOCX）' }))
    /** @brief 已完成输出区 / Completed output region. */
    const outputs = await completeRenderJob()

    expect(within(outputs).getByRole('button', { name: '保存 JSON' })).toBeEnabled()
    expect(within(outputs).getByRole('button', { name: '保存 PDF' })).toBeDisabled()
    expect(within(outputs).getByRole('button', { name: '保存 DOCX' })).toBeDisabled()
    expect(within(outputs).getAllByText(/超过当前宿主 3 B 的保存上限/u)).toHaveLength(2)

    fireEvent.click(within(outputs).getByRole('button', { name: '保存 JSON' }))
    expect(await within(outputs).findByText(/再次操作前请先检查下载或目标目录/u)).toBeVisible()
    expect(saveArtifact).toHaveBeenCalledTimes(1)
  })

  it('disables every save action when authoritative Artifact metadata is already expired', async (): Promise<void> => {
    /** @brief 当前多格式装配 / Current multi-format composition. */
    const composition = createMultiFormatComposition()
    /** @brief 未替换的 Artifact metadata GET / Original Artifact-metadata GET. */
    const getArtifact = composition.workspaceOperations.getArtifact.bind(
      composition.workspaceOperations
    )
    /** @brief 将权威到期时间固定在过去的 adapter / Adapter pinning authoritative expiry in the past. */
    vi.spyOn(composition.workspaceOperations, 'getArtifact').mockImplementation(async (request) => {
      /** @brief 原始权威 metadata / Original authoritative metadata. */
      const authority = await getArtifact(request)
      return {
        ...authority,
        artifact: {
          ...authority.artifact,
          expiresAt: new Date(Date.now() - 1_000).toISOString()
        }
      }
    })
    renderResumeOutput(composition)

    await screen.findByRole('heading', { name: '生成与导出' })
    fireEvent.click(screen.getByRole('button', { name: '生成最终文件（PDF + DOCX）' }))
    /** @brief 已完成输出区 / Completed output region. */
    const outputs = await completeRenderJob()

    expect(within(outputs).getByRole('button', { name: '保存 PDF' })).toBeDisabled()
    expect(within(outputs).getByRole('button', { name: '保存 DOCX' })).toBeDisabled()
    expect(within(outputs).getAllByText('此文件已过期，请重新生成。')).toHaveLength(2)
  })
})
