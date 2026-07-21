/** @file Resume 内存 adapter 测试 / Resume in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { MOCK_RESUME_ID, MOCK_RESUME_WORKSPACE_ID, MOCK_TEMPLATE_MANIFESTS } from './data'
import { MockResumeGateway } from './gateway'

describe('MockResumeGateway', () => {
  it('makes the configured empty state explicit', async () => {
    const gateway = new MockResumeGateway({ mode: 'empty' })

    await expect(gateway.listResumeCards(MOCK_RESUME_WORKSPACE_ID)).resolves.toEqual([])
    await expect(gateway.getResumeEditor(MOCK_RESUME_ID)).rejects.toBeInstanceOf(
      InMemoryGatewayError
    )
  })

  it('generates a structured resume from a natural-language assistant request', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()

    /** @brief 自然语言生成结果 / Natural-language generation result. */
    const result = await resumeGateway.sendAssistantMessage({
      resumeId: MOCK_RESUME_ID,
      message: '请根据我的知识库帮我生成一份后端工程师简历'
    })

    expect(result.assistantMessage.role).toBe('assistant')
    expect(result.changeId).not.toBeNull()
    expect(result.canUndo).toBe(true)
    expect(result.editor.resume.sections.length).toBeGreaterThan(0)
    expect(
      result.editor.resume.sections.every((section) =>
        [
          'summary',
          'experience',
          'education',
          'projects',
          'skills',
          'publications',
          'awards',
          'certifications',
          'languages',
          'volunteer',
          'custom'
        ].includes(section.kind)
      )
    ).toBe(true)
  })

  it('keeps a Mock Proposal pending until the user accepts or rejects it', async () => {
    const resumeGateway = new MockResumeGateway()
    const before = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)

    const proposal = await resumeGateway.createResumeProposal({
      message: '把职业摘要改得更突出量化成果',
      resumeId: MOCK_RESUME_ID
    })

    expect(await resumeGateway.listResumeProposals(MOCK_RESUME_ID)).toEqual([proposal])
    expect((await resumeGateway.getResumeEditor(MOCK_RESUME_ID)).resume.revision).toBe(
      before.resume.revision
    )

    const accepted = await resumeGateway.decideResumeProposal({
      decision: 'accept',
      proposalId: proposal.id
    })
    expect(accepted.status).toBe('accepted')
    expect((await resumeGateway.getResumeEditor(MOCK_RESUME_ID)).resume.revision).toBeGreaterThan(
      before.resume.revision
    )
  })

  it('keeps Mock PDF rendering split into start, status, and artifact recovery', async () => {
    const resumeGateway = new MockResumeGateway()

    const started = await resumeGateway.startResumePdfRender({
      resumeId: MOCK_RESUME_ID,
      resumeRevision: 18
    })
    const completed = await resumeGateway.getResumeRenderJob(started.id)
    const artifacts = await resumeGateway.listResumePdfArtifacts(MOCK_RESUME_ID)

    expect(started.status).toBe('queued')
    expect(completed.status).toBe('succeeded')
    expect(completed.artifacts).toHaveLength(1)
    expect(artifacts).toEqual(completed.artifacts)
  })

  it('applies an assistant revision immediately and can undo the latest AI change', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()
    /** @brief 修改前编辑器 / Editor before the AI revision. */
    const before = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)

    /** @brief AI 修改结果 / AI revision result. */
    const revision = await resumeGateway.sendAssistantMessage({
      resumeId: MOCK_RESUME_ID,
      message: '把职业摘要改得更突出量化成果'
    })

    expect(revision.editor.resume.sections[0]?.contentPreview).not.toBe(
      before.resume.sections[0]?.contentPreview
    )
    if (revision.changeId === null) {
      throw new Error('Expected the Mock AI revision to return an undoable change ID.')
    }

    /** @brief 撤销结果 / Undo result. */
    const undone = await resumeGateway.undoAssistantChange({
      resumeId: MOCK_RESUME_ID,
      changeId: revision.changeId
    })

    expect(undone.editor.resume.sections).toEqual(before.resume.sections)
    expect(undone.canUndo).toBe(false)
  })

  it('rejects an assistant undo after a newer user-authored edit', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()
    /** @brief AI 修改结果 / AI revision result. */
    const revision = await resumeGateway.sendAssistantMessage({
      resumeId: MOCK_RESUME_ID,
      message: '把职业摘要改得更突出量化成果'
    })
    if (revision.changeId === null) {
      throw new Error('Expected the Mock AI revision to return an undoable change ID.')
    }
    /** @brief 首个简历板块 / First resume section. */
    const firstSection = revision.editor.resume.sections[0]

    if (firstSection === undefined) {
      throw new Error('Expected the Mock resume to contain at least one section.')
    }

    await resumeGateway.updateResumeSection({
      resumeId: MOCK_RESUME_ID,
      sectionId: firstSection.id,
      title: firstSection.title,
      content: '这是用户在 AI 修改后手动输入的内容。'
    })

    await expect(
      resumeGateway.undoAssistantChange({
        resumeId: MOCK_RESUME_ID,
        changeId: revision.changeId
      })
    ).rejects.toMatchObject({ code: 'memory.conflict' })
  })

  it('routes section structure and template changes through the resume gateway', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()
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
