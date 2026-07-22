/** @file Resume 内存 adapter 测试 / Resume in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import {
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  MOCK_TEMPLATE_MANIFESTS
} from './data'
import { InMemoryResumeGateway } from './gateway'

describe('InMemoryResumeGateway', () => {
  it('makes the configured empty state explicit', async () => {
    const gateway = new InMemoryResumeGateway({ mode: 'empty' })

    await expect(gateway.listResumeCards(MOCK_RESUME_WORKSPACE_ID)).resolves.toEqual([])
    await expect(gateway.getResumeEditor(MOCK_RESUME_ID)).rejects.toBeInstanceOf(
      InMemoryGatewayError
    )
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

  it('routes section structure and template changes through the resume gateway', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 初始编辑器 / Initial editor. */
    const initial = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)
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

    const editorialTemplate = MOCK_TEMPLATE_MANIFESTS.find(
      (template) => template.name === 'Editorial'
    )
    if (editorialTemplate === undefined) {
      throw new Error('Expected the Editorial Mock template.')
    }

    const templated = await resumeGateway.selectResumeTemplate({
      baseRevision: deleted.resume.revision,
      resumeId: MOCK_RESUME_ID,
      templateId: editorialTemplate.id,
      templateVersion: editorialTemplate.version
    })
    expect(templated.resume.template.templateId).toBe(editorialTemplate.id)
    expect(templated.resume.template.templateVersion).toBe(editorialTemplate.version)
  })

  it('reads and selects an exact historical template version omitted from the latest catalog', async () => {
    /** @brief 独享 Resume 内存网关 / Dedicated Resume in-memory gateway. */
    const resumeGateway = new InMemoryResumeGateway()

    const latest = await resumeGateway.listTemplateManifests('zh-SG')
    /** @brief 当前权威 Resume revision / Current authoritative Resume revision. */
    const editor = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)
    expect(latest).not.toContainEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
    await expect(
      resumeGateway.getTemplateManifest(
        MOCK_HISTORICAL_DAWN_TEMPLATE.id,
        MOCK_HISTORICAL_DAWN_TEMPLATE.version
      )
    ).resolves.toEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)

    const templated = await resumeGateway.selectResumeTemplate({
      baseRevision: editor.resume.revision,
      resumeId: MOCK_RESUME_ID,
      templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
    })
    expect(templated.resume.template).toEqual({
      templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
      templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
    })

    const settings = await resumeGateway.getTemplateSettings(MOCK_RESUME_ID)
    expect(settings.selectedTemplate).toEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
    expect(settings.availableTemplates).toContainEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
  })
})
