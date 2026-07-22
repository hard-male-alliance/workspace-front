/** @file Resume 内存 adapter 测试 / Resume in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { MOCK_RESUME_ID, MOCK_RESUME_WORKSPACE_ID, MOCK_TEMPLATE_MANIFESTS } from './data'
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
      resumeId: MOCK_RESUME_ID,
      resumeRevision: 18
    })
    const completed = await resumeGateway.getResumeRenderJob(started.id)

    expect(started.status).toBe('queued')
    expect(completed.status).toBe('succeeded')
    expect(completed.artifacts).toHaveLength(1)
  })

  it('routes section structure and template changes through the resume gateway', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 初始编辑器 / Initial editor. */
    const initial = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)
    /** @brief 反向板块顺序 / Reversed section order. */
    const reversedSectionIds = initial.resume.sections.map((section) => section.id).reverse()

    const reordered = await resumeGateway.reorderResumeSections({
      resumeId: MOCK_RESUME_ID,
      orderedSectionIds: reversedSectionIds
    })
    expect(reordered.resume.sections.map((section) => section.id)).toEqual(reversedSectionIds)

    const sectionToDelete = reordered.resume.sections[0]
    if (sectionToDelete === undefined) {
      throw new Error('Expected the Mock resume to contain a section to delete.')
    }

    const deleted = await resumeGateway.deleteResumeSection({
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
      resumeId: MOCK_RESUME_ID,
      templateId: editorialTemplate.id
    })
    expect(templated.resume.template.templateId).toBe(editorialTemplate.id)
  })
})
