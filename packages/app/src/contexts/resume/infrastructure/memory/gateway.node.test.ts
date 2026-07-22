/** @file Resume 内存 adapter 测试 / Resume in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { asUiResumePageLimit } from '../../domain/models'
import {
  MOCK_EDITORIAL_TEMPLATE,
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID
} from './data'
import { InMemoryResumeGateway } from './gateway'

describe('InMemoryResumeGateway', () => {
  it('makes the configured empty state explicit', async () => {
    const gateway = new InMemoryResumeGateway({ mode: 'empty' })

    await expect(
      gateway.listResumeSummariesPage({
        cursor: null,
        limit: asUiResumePageLimit(20),
        signal: new AbortController().signal,
        workspaceId: MOCK_RESUME_WORKSPACE_ID
      })
    ).resolves.toEqual({ hasMore: false, items: [], nextCursor: null })
    await expect(
      gateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID)
    ).rejects.toBeInstanceOf(InMemoryGatewayError)
  })

  it('paginates Resume summaries with a closed cursor relation', async () => {
    /** @brief 独享 Resume 内存网关 / Dedicated Resume in-memory gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 可取消的测试读取 / Abortable test read. */
    const controller = new AbortController()
    /** @brief 只取一条的首页 / First page containing one item. */
    const firstPage = await resumeGateway.listResumeSummariesPage({
      cursor: null,
      limit: asUiResumePageLimit(1),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    expect(firstPage).toMatchObject({
      hasMore: true,
      items: [{ workspaceId: MOCK_RESUME_WORKSPACE_ID }]
    })
    if (!firstPage.hasMore) throw new Error('Expected the first Mock Resume page to continue.')

    /** @brief 使用服务端游标读取的末页 / Terminal page read with the service cursor. */
    const lastPage = await resumeGateway.listResumeSummariesPage({
      cursor: firstPage.nextCursor,
      limit: asUiResumePageLimit(1),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(lastPage).toMatchObject({
      hasMore: false,
      items: [{ workspaceId: MOCK_RESUME_WORKSPACE_ID }],
      nextCursor: null
    })
    expect(new Set([...firstPage.items, ...lastPage.items].map((summary) => summary.id)).size).toBe(
      2
    )
  })

  it('honours an aborted Resume page read before publishing data', async () => {
    const resumeGateway = new InMemoryResumeGateway({ delayMs: 5 })
    const controller = new AbortController()
    const page = resumeGateway.listResumeSummariesPage({
      cursor: null,
      limit: asUiResumePageLimit(20),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    controller.abort(new DOMException('Workspace changed.', 'AbortError'))

    await expect(page).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps PDF rendering split into start and status recovery', async () => {
    const resumeGateway = new InMemoryResumeGateway()

    const started = await resumeGateway.startResumePdfRender({
      commandId: 'command_render_memory_test' as never,
      resumeId: MOCK_RESUME_ID,
      resumeRevision: 18
    })
    const completed = await resumeGateway.getResumeRenderJob(started.id)

    expect(started.status).toBe('queued')
    expect(completed.status).toBe('succeeded')
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.artifacts[0]).toMatchObject({ id: 'artifact_mock_18' })
  })

  it('routes section structure and current-template settings through the resume gateway', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 初始编辑器 / Initial editor. */
    const initial = await resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID)
    /** @brief 反向板块顺序 / Reversed section order. */
    const reversedSectionIds = initial.resume.sections.map((section) => section.id).reverse()

    const reordered = await resumeGateway.reorderResumeSections({
      baseRevision: initial.resume.revision,
      resumeId: MOCK_RESUME_ID,
      orderedSectionIds: reversedSectionIds
    })
    expect(reordered.resume.sections.map((section) => section.id)).toEqual(reversedSectionIds)

    const sectionToDelete = reordered.resume.sections[0]
    if (sectionToDelete === undefined) {
      throw new Error('Expected the Mock resume to contain a section to delete.')
    }

    const deleted = await resumeGateway.deleteResumeSection({
      baseRevision: reordered.resume.revision,
      resumeId: MOCK_RESUME_ID,
      sectionId: sectionToDelete.id
    })
    expect(deleted.resume.sections.some((section) => section.id === sectionToDelete.id)).toBe(false)

    /** @brief 删除后读取的当前固定模板设置 / Current pinned-template settings read after deletion. */
    const settings = await resumeGateway.getTemplateSettings(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID
    )
    const saved = await resumeGateway.updateTemplateSettings({
      baseRevision: deleted.resume.revision,
      resumeId: MOCK_RESUME_ID,
      styleIntent: { ...settings.styleIntent, density: 0.75 },
      templateId: settings.selectedTemplate.id,
      templateVersion: settings.selectedTemplate.version
    })
    expect(saved.styleIntent.density).toBe(0.75)
    expect(saved.selectedTemplate).toEqual(settings.selectedTemplate)
  })

  it('reads an exact historical template version omitted from the latest catalog', async () => {
    /** @brief 独享 Resume 内存网关 / Dedicated Resume in-memory gateway. */
    const resumeGateway = new InMemoryResumeGateway()

    const latest = await resumeGateway.listTemplateManifests('zh-SG')
    expect(latest).not.toContainEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
    await expect(
      resumeGateway.getTemplateManifest(
        MOCK_HISTORICAL_DAWN_TEMPLATE.id,
        MOCK_HISTORICAL_DAWN_TEMPLATE.version
      )
    ).resolves.toEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
  })

  it('does not use template-settings persistence as an implicit migration command', async () => {
    const resumeGateway = new InMemoryResumeGateway()
    const settings = await resumeGateway.getTemplateSettings(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID
    )

    await expect(
      resumeGateway.updateTemplateSettings({
        baseRevision: settings.resumeRevision,
        resumeId: settings.resumeId,
        styleIntent: settings.styleIntent,
        templateId: MOCK_EDITORIAL_TEMPLATE.id,
        templateVersion: MOCK_EDITORIAL_TEMPLATE.version
      })
    ).rejects.toMatchObject({ name: 'ResumeTemplateMigrationCapabilityError' })
    await expect(
      resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID)
    ).resolves.toMatchObject({
      resume: {
        revision: settings.resumeRevision,
        template: {
          templateId: settings.selectedTemplate.id,
          templateVersion: settings.selectedTemplate.version
        }
      }
    })
  })

  it('rejects a second mutation while the same Resume aggregate lane is occupied', async () => {
    /** @brief 带确定性延迟以观察写通道的测试网关 / Test gateway with deterministic latency exposing the mutation lane. */
    const resumeGateway = new InMemoryResumeGateway({ delayMs: 10 })
    const editor = await resumeGateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID)
    const firstSection = editor.resume.sections[0]
    if (firstSection === undefined) throw new Error('Expected a Resume section fixture.')

    /** @brief 占用唯一通道的首个写操作 / First mutation occupying the sole lane. */
    const firstMutation = resumeGateway.updateResumeSection({
      baseRevision: editor.resume.revision,
      content: '更新后的摘要',
      resumeId: editor.resume.id,
      sectionId: firstSection.id
    })
    await expect(
      resumeGateway.deleteResumeSection({
        baseRevision: editor.resume.revision,
        resumeId: editor.resume.id,
        sectionId: firstSection.id
      })
    ).rejects.toMatchObject({ name: 'ResumeMutationInProgressError' })
    await expect(firstMutation).resolves.toMatchObject({ resume: { revision: 19 } })
  })
})
