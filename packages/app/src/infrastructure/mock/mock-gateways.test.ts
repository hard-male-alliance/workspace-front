/** @file Mock 网关测试 / Mock gateway tests. */

import { describe, expect, it } from 'vitest'

import {
  MOCK_INTERVIEW_SESSION_ID,
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_VISIBILITY,
  MOCK_RESUME_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_WORKSPACE_ID
} from './mock-data'
import {
  MockGatewayError,
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from './mock-gateways'

describe('Mock gateways', () => {
  it('returns deterministic editor, interview, and visibility projections', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()
    /** @brief 面试 Mock 网关 / Interview Mock gateway. */
    const interviewGateway = new MockInterviewGateway()
    /** @brief 知识 Mock 网关 / Knowledge Mock gateway. */
    const knowledgeGateway = new MockKnowledgeGateway()

    /** @brief 编辑器投影 / Editor projection. */
    const editor = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)
    /** @brief 实时面试投影 / Live-interview projection. */
    const interview = await interviewGateway.getLiveInterview(MOCK_INTERVIEW_SESSION_ID)
    /** @brief 可见性投影 / Visibility projection. */
    const visibility = await knowledgeGateway.getKnowledgeVisibility(
      MOCK_KNOWLEDGE_VISIBILITY.source.id
    )

    expect(editor.resume.revision).toBe(18)
    expect(editor.preview.state).toBe('ready')
    expect(interview.connectionState).toBe('connected')
    expect(visibility.source.visibility.defaultEffect).toBe('deny')
  })

  it('returns defensive copies instead of fixture references', async () => {
    /** @brief 工作区 Mock 网关 / Workspace Mock gateway. */
    const workspaceGateway = new MockWorkspaceGateway()
    /** @brief 首次工作区列表 / First workspace list. */
    const firstRead = await workspaceGateway.listWorkspaces()
    /** @brief 第二次工作区列表 / Second workspace list. */
    const secondRead = await workspaceGateway.listWorkspaces()

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead[0]).not.toBe(secondRead[0])
  })

  it('serves a visibility projection for every linked Mock knowledge source', async () => {
    /** @brief 知识 Mock 网关 / Knowledge Mock gateway. */
    const knowledgeGateway = new MockKnowledgeGateway()
    /** @brief 各来源的可见性投影 / Visibility projections for all sources. */
    const visibilityModels = await Promise.all(
      MOCK_KNOWLEDGE_SOURCES.map((source) => knowledgeGateway.getKnowledgeVisibility(source.id))
    )

    expect(visibilityModels.map((model) => model.source.id)).toEqual(
      MOCK_KNOWLEDGE_SOURCES.map((source) => source.id)
    )
  })

  it('makes empty and error states explicit for page-state testing', async () => {
    /** @brief 空态简历 Mock 网关 / Empty-state resume Mock gateway. */
    const emptyGateway = new MockResumeGateway({ mode: 'empty' })
    /** @brief 错误态工作区 Mock 网关 / Error-state workspace Mock gateway. */
    const failingGateway = new MockWorkspaceGateway({ mode: 'error' })

    await expect(emptyGateway.listResumeCards(MOCK_WORKSPACE_ID)).resolves.toEqual([])
    await expect(emptyGateway.getResumeEditor(MOCK_RESUME_ID)).rejects.toBeInstanceOf(
      MockGatewayError
    )
    await expect(failingGateway.getWorkspaceHome(MOCK_WORKSPACE_ID)).rejects.toMatchObject({
      code: 'mock.unavailable'
    })
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
    ).rejects.toMatchObject({ code: 'mock.conflict' })
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

  it('lists only completed interviews with report summaries', async () => {
    const interviewGateway = new MockInterviewGateway()

    const history = await interviewGateway.listCompletedInterviews(MOCK_WORKSPACE_ID)

    expect(history).not.toHaveLength(0)
    expect(history.every((item) => item.overallScore !== null)).toBe(true)
    expect(history.every((item) => item.completedAt.length > 0)).toBe(true)
  })

  it('creates an interview when no knowledge source is selected', async () => {
    const interviewGateway = new MockInterviewGateway()
    const setup = await interviewGateway.getInterviewSetup(MOCK_WORKSPACE_ID)
    const scenario = setup.scenarios[0]

    if (scenario === undefined) {
      throw new Error('Expected at least one Mock interview scenario.')
    }

    const result = await interviewGateway.createInterview({
      workspaceId: MOCK_WORKSPACE_ID,
      jobTarget: {
        title: 'Frontend Engineer',
        company: null,
        location: null,
        seniority: null,
        skills: []
      },
      interviewType: scenario.interviewType,
      difficulty: scenario.difficulty,
      durationMinutes: 30,
      knowledgeSourceIds: [],
      focusPrompt: null
    })

    expect(result.sessionId).toBe(MOCK_INTERVIEW_SESSION_ID)
  })

  it('moves a submitted Mock answer to the AI-controlled completion state', async () => {
    const interviewGateway = new MockInterviewGateway()

    const before = await interviewGateway.getInterviewRuntime(MOCK_INTERVIEW_SESSION_ID)
    expect(before.phase).toBe('listening')
    expect(before.currentTranscript.length).toBeGreaterThan(0)

    const after = await interviewGateway.submitInterviewAnswer(MOCK_INTERVIEW_SESSION_ID)

    expect(after.phase).toBe('completion_ready')
    expect(after.currentTranscript).toBe('')
    expect(after.transcript.at(-1)?.speaker).toBe('interviewer')
  })
})
