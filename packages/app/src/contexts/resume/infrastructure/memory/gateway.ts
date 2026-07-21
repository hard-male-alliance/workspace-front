/** @file Resume 的内存 adapter / In-memory adapter for Resume. */

import type { ResumeGateway } from '../../application/gateway'
import type {
  UiResumeAssistantMessage,
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeProposal,
  UiResumeProposalDecisionInput,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiStartResumePdfRenderInput
} from '../../domain/models'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type MockGatewayOptions
} from '../../../../infrastructure/memory'
import {
  MOCK_RESUME_CARDS,
  MOCK_RESUME_EDITOR,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_TEMPLATE_SETTINGS
} from './data'

/**
 * @brief 简历与模板数据的 Mock 适配器 / Mock adapter for resume and template data.
 * @note 所有返回值都是 UI projection；它不提交 ResumeOperationBatch 或模板迁移 Job。
 */
export class MockResumeGateway implements ResumeGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: MockGatewayOptions
  /** @brief 当前实例内的简历编辑器投影 / Resume-editor projection owned by this instance. */
  private editor: UiResumeEditorModel

  /** @brief 最近一次可撤销 AI 变更 / Latest undoable AI change. */
  private undoState: {
    readonly changeId: string
    readonly editor: UiResumeEditorModel
  } | null = null

  /** @brief 确定性消息序号 / Deterministic message sequence. */
  private messageSequence = 0

  /** @brief 当前实例内待审批 Proposal / Pending Proposals owned by this instance. */
  private proposals: UiResumeProposal[] = []

  /** @brief Mock Proposal 对应的原始指令 / Original instructions for Mock Proposals. */
  private readonly proposalInstructions = new Map<string, string>()

  /** @brief 确定性 Proposal 序号 / Deterministic Proposal sequence. */
  private proposalSequence = 0

  /** @brief Mock Render Jobs / Mock Render Jobs. */
  private readonly renderJobs = new Map<string, UiResumeRenderJob>()

  /** @brief 已完成的 Mock PDF artifacts / Completed Mock PDF artifacts. */
  private pdfArtifacts: UiResumePdfArtifact[] = []

  /**
   * @brief 构造简历 Mock 网关 / Construct the resume Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    this.options = options
    this.editor = cloneMemoryValue(MOCK_RESUME_EDITOR)
  }

  /**
   * @brief 列出 Mock 简历卡片 / List Mock resume cards.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 简历卡片 / Mock resume cards.
   */
  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== MOCK_RESUME_WORKSPACE_ID) {
      return []
    }

    return cloneMemoryValue(MOCK_RESUME_CARDS)
  }

  /**
   * @brief 获取 Mock 三栏简历编辑器 / Get the Mock three-pane resume editor.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 编辑器数据 / Mock editor data.
   */
  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    return cloneMemoryValue(this.editor)
  }

  async listResumeProposals(resumeId: UiResumeId): Promise<readonly UiResumeProposal[]> {
    await prepareMemoryRead(this.options)
    return cloneMemoryValue(
      this.proposals.filter(
        (proposal) => proposal.resumeId === resumeId && proposal.status === 'pending'
      )
    )
  }

  async createResumeProposal(input: UiResumeAssistantMessageInput): Promise<UiResumeProposal> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) return throwMemoryNotFound('resume editor')
    const instruction = input.message.trim()
    if (instruction.length === 0) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'Mock Proposal instructions cannot be empty.'
      )
    }
    this.proposalSequence += 1
    const proposal: UiResumeProposal = {
      baseRevision: this.editor.resume.revision,
      changes: ['set_field'],
      createdAt: '2026-07-18T00:00:00.000Z',
      id: asUiOpaqueId<'resume-proposal'>(`proposal_mock_${this.proposalSequence}`),
      resumeId: input.resumeId,
      status: 'pending',
      summary: '将根据你的指令更新职业摘要；接受前不会写入简历。',
      title: '职业摘要修改建议'
    }
    this.proposals = [...this.proposals, proposal]
    this.proposalInstructions.set(proposal.id, instruction)
    return cloneMemoryValue(proposal)
  }

  async decideResumeProposal(input: UiResumeProposalDecisionInput): Promise<UiResumeProposal> {
    await prepareMemoryRead(this.options)
    const proposal = this.proposals.find((item) => item.id === input.proposalId)
    if (proposal === undefined || proposal.status !== 'pending') {
      return throwMemoryNotFound('resume proposal')
    }
    if (input.decision === 'accept') {
      const instruction = this.proposalInstructions.get(proposal.id)
      if (instruction === undefined) return throwMemoryNotFound('resume proposal instruction')
      await this.sendAssistantMessage({ message: instruction, resumeId: proposal.resumeId })
    }
    const decided: UiResumeProposal = {
      ...proposal,
      status: input.decision === 'accept' ? 'accepted' : 'rejected'
    }
    this.proposals = this.proposals.map((item) => (item.id === proposal.id ? decided : item))
    this.proposalInstructions.delete(proposal.id)
    return cloneMemoryValue(decided)
  }

  async startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob> {
    await prepareMemoryRead(this.options)
    input.signal?.throwIfAborted()
    if (input.resumeId !== MOCK_RESUME_ID) return throwMemoryNotFound('resume editor')
    const job: UiResumeRenderJob = {
      artifacts: [],
      diagnostic: null,
      id: asUiOpaqueId<'resume-render-job'>(`render_mock_${input.resumeRevision}`),
      progressPercent: 0,
      resumeId: input.resumeId,
      resumeRevision: input.resumeRevision,
      status: 'queued'
    }
    this.renderJobs.set(job.id, job)
    return cloneMemoryValue(job)
  }

  async getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob> {
    await prepareMemoryRead(this.options)
    signal?.throwIfAborted()
    const job = this.renderJobs.get(jobId)
    if (job === undefined) return throwMemoryNotFound('resume render job')
    const artifact: UiResumePdfArtifact = {
      contentUrl: 'about:blank#mock-resume-pdf',
      createdAt: '2026-07-18T00:00:05.000Z',
      id: asUiOpaqueId<'resume-pdf-artifact'>(`artifact_mock_${job.resumeRevision}`),
      pageCount: 1,
      resumeId: job.resumeId,
      resumeRevision: job.resumeRevision
    }
    const completed: UiResumeRenderJob = {
      ...job,
      artifacts: [artifact],
      progressPercent: 100,
      status: 'succeeded'
    }
    this.renderJobs.set(jobId, completed)
    this.pdfArtifacts = [artifact]
    return cloneMemoryValue(completed)
  }

  async listResumePdfArtifacts(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<readonly UiResumePdfArtifact[]> {
    await prepareMemoryRead(this.options)
    signal?.throwIfAborted()
    return cloneMemoryValue(this.pdfArtifacts.filter((artifact) => artifact.resumeId === resumeId))
  }

  /**
   * @brief 处理确定性的 Mock 简历助手消息 / Handle a deterministic Mock assistant message.
   * @param input 助手消息领域输入 / Assistant-message domain input.
   * @return 结构化助手结果 / Structured assistant result.
   */
  async sendAssistantMessage(
    input: UiResumeAssistantMessageInput
  ): Promise<UiResumeAssistantTurnResult> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const message = input.message.trim()
    if (message.length === 0) {
      throw new InMemoryGatewayError('memory.conflict', 'Mock assistant messages cannot be empty.')
    }

    this.messageSequence += 1
    const changeId = asUiOpaqueId<'resume-assistant-change'>(
      `chg_mock_resume_${this.messageSequence}`
    )
    const before = cloneMemoryValue(this.editor)
    const isGenerationRequest = message.includes('生成')
    const assistantMessage: UiResumeAssistantMessage = {
      id: `msg_mock_assistant_${this.messageSequence}`,
      role: 'assistant',
      text: isGenerationRequest
        ? '已根据当前对话和 Mock 知识内容生成简历结构，并同步到内容与 PDF 预览。'
        : '已直接更新职业摘要，突出可验证的工程结果。',
      createdAt: '2026-07-18T00:00:00.000Z',
      isStreaming: false
    }
    const userMessage: UiResumeAssistantMessage = {
      id: `msg_mock_user_${this.messageSequence}`,
      role: 'user',
      text: message,
      createdAt: '2026-07-18T00:00:00.000Z',
      isStreaming: false
    }
    const nextSections = this.editor.resume.sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            contentPreview: isGenerationRequest
              ? 'AI 平台工程师，专注于可靠的模型服务、知识检索与可观测性工程。'
              : '将模型推理延迟从 1.8 秒降低至 620 毫秒，并建立可复用的 AI 平台能力。'
          }
        : section
    )

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        sections: nextSections,
        updatedAt: '2026-07-18T00:00:00.000Z'
      },
      assistantMessages: [...this.editor.assistantMessages, userMessage, assistantMessage]
    }
    this.undoState = { changeId, editor: before }

    return cloneMemoryValue({
      editor: this.editor,
      assistantMessage,
      changeId,
      canUndo: true
    })
  }

  /**
   * @brief 撤销最近一次 Mock AI 变更 / Undo the latest Mock AI change.
   * @param input 撤销领域输入 / Undo domain input.
   * @return 撤销后的编辑器 / Editor after undo.
   */
  async undoAssistantChange(
    input: UiResumeAssistantUndoInput
  ): Promise<UiResumeAssistantUndoResult> {
    await prepareMemoryRead(this.options)
    if (
      input.resumeId !== MOCK_RESUME_ID ||
      this.undoState === null ||
      input.changeId !== this.undoState.changeId
    ) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock assistant change can no longer be undone.'
      )
    }

    this.editor = cloneMemoryValue(this.undoState.editor)
    this.undoState = null
    return cloneMemoryValue({ editor: this.editor, canUndo: false })
  }

  /**
   * @brief 更新 Mock 简历板块并使旧 AI 撤销失效 / Update a Mock section and invalidate AI undo.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器 / Latest editor.
   */
  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const sectionExists = this.editor.resume.sections.some(
      (section) => section.id === input.sectionId
    )
    if (!sectionExists) {
      return throwMemoryNotFound('resume section')
    }

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        sections: this.editor.resume.sections.map((section) =>
          section.id === input.sectionId
            ? { ...section, title: input.title, contentPreview: input.content }
            : section
        ),
        updatedAt: '2026-07-18T00:00:01.000Z'
      }
    }
    this.undoState = null
    return cloneMemoryValue(this.editor)
  }

  /** @brief 调整 Mock 简历板块顺序 / Reorder Mock resume sections. */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const sectionById = new Map(this.editor.resume.sections.map((section) => [section.id, section]))
    const reorderedSections = input.orderedSectionIds.map((sectionId) => sectionById.get(sectionId))
    if (
      reorderedSections.length !== this.editor.resume.sections.length ||
      new Set(input.orderedSectionIds).size !== this.editor.resume.sections.length ||
      reorderedSections.some((section) => section === undefined)
    ) {
      throw new InMemoryGatewayError('memory.conflict', 'The Mock section order is incomplete.')
    }

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        sections: reorderedSections.filter((section) => section !== undefined),
        updatedAt: '2026-07-18T00:00:02.000Z'
      }
    }
    this.undoState = null
    return cloneMemoryValue(this.editor)
  }

  /** @brief 删除 Mock 简历板块 / Delete a Mock resume section. */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const remainingSections = this.editor.resume.sections.filter(
      (section) => section.id !== input.sectionId
    )
    if (remainingSections.length === this.editor.resume.sections.length) {
      return throwMemoryNotFound('resume section')
    }
    if (remainingSections.length === 0) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'A Mock resume must keep at least one section.'
      )
    }

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        sections: remainingSections,
        updatedAt: '2026-07-18T00:00:03.000Z'
      }
    }
    this.undoState = null
    return cloneMemoryValue(this.editor)
  }

  /** @brief 切换 Mock 简历模板 / Select a Mock resume template. */
  async selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const template = MOCK_TEMPLATE_MANIFESTS.find((item) => item.id === input.templateId)
    if (template === undefined) {
      return throwMemoryNotFound('resume template')
    }

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        template: { templateId: template.id, templateVersion: template.version },
        updatedAt: '2026-07-18T00:00:04.000Z'
      }
    }
    this.undoState = null
    return cloneMemoryValue(this.editor)
  }

  /**
   * @brief 列出支持指定语言的 Mock 模板 / List Mock templates supporting a locale.
   * @param locale 资源内容语言 / Resource-content locale.
   * @return Mock 模板清单 / Mock template manifests.
   */
  async listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty') {
      return []
    }

    const manifests = MOCK_TEMPLATE_MANIFESTS.filter((template) =>
      template.supportedLocales.includes(locale)
    )
    return cloneMemoryValue(manifests)
  }

  /**
   * @brief 获取 Mock 模板设置页数据 / Get Mock template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 模板设置数据 / Mock template-settings data.
   */
  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('template settings')
    }

    return cloneMemoryValue(MOCK_TEMPLATE_SETTINGS)
  }
}
