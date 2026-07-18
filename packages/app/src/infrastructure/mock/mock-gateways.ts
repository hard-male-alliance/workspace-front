/**
 * @file 明确标注的 Mock 页面数据适配器 / Explicitly named Mock page-data adapters.
 * @remarks
 * 这些类不执行 HTTP、WebRTC、SSE 或 Node.js 调用，且不应被误认为正式服务端客户端。
 */

import type {
  InterviewGateway,
  KnowledgeGateway,
  ResumeGateway,
  WorkspaceGateway
} from '../../domain/gateways'
import type {
  UiContentLocale,
  UiCreateInterviewInput,
  UiCreateInterviewResult,
  UiInterviewHistoryItem,
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewScenario,
  UiInterviewSetupModel,
  UiInterviewSessionId,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiLiveInterviewModel,
  UiResumeCard,
  UiResumeAssistantMessage,
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiWorkspace,
  UiWorkspaceHomeModel,
  UiWorkspaceId
} from '../../domain/models'
import { asUiOpaqueId } from '../../domain/models'
import {
  MOCK_INTERVIEW_REPORT,
  MOCK_INTERVIEW_HISTORY,
  MOCK_INTERVIEW_RUNTIME,
  MOCK_INTERVIEW_SCENARIOS,
  MOCK_INTERVIEW_SESSION_ID,
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_VISIBILITY,
  MOCK_LIVE_INTERVIEW,
  MOCK_RESUME_CARDS,
  MOCK_RESUME_EDITOR,
  MOCK_RESUME_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_TEMPLATE_SETTINGS,
  MOCK_WORKSPACE_HOME,
  MOCK_WORKSPACE_ID,
  MOCK_WORKSPACES
} from './mock-data'

/** @brief Mock 网关行为模式 / Mock gateway behavior mode. */
export type MockGatewayMode = 'ready' | 'empty' | 'error'

/**
 * @brief Mock 网关构造选项 / Mock gateway construction options.
 * @note `delayMs` 用于让页面在验收时呈现 loading state；默认不延迟，保持单元测试快速且确定。
 */
export interface MockGatewayOptions {
  /** @brief 返回数据、空数据或错误 / Return data, empty data, or an error. */
  readonly mode?: MockGatewayMode
  /** @brief 模拟异步延迟（毫秒）/ Simulated async delay in milliseconds. */
  readonly delayMs?: number
}

/** @brief Mock 错误码 / Mock error code. */
export type MockGatewayErrorCode = 'mock.unavailable' | 'mock.not_found' | 'mock.conflict'

/**
 * @brief 明确标注的 Mock 网关错误 / Explicitly named Mock gateway error.
 * @note 它仅帮助页面展示错误态，不能映射为 contract 中的 ProblemDetails。
 */
export class MockGatewayError extends Error {
  /** @brief Mock 错误码 / Mock error code. */
  readonly code: MockGatewayErrorCode

  /**
   * @brief 构造 Mock 网关错误 / Construct a Mock gateway error.
   * @param code 错误码 / Error code.
   * @param message 错误说明 / Error message.
   */
  constructor(code: MockGatewayErrorCode, message: string) {
    super(message)
    this.name = 'MockGatewayError'
    this.code = code
  }
}

/**
 * @brief 深拷贝确定性 Mock 数据 / Deep-clone deterministic Mock data.
 * @template TValue 要拷贝的值类型 / Value type to clone.
 * @param value 原始 Mock 数据 / Source Mock data.
 * @return 不共享引用的副本 / Copy without shared references.
 */
const cloneMockValue = <TValue>(value: TValue): TValue => structuredClone(value)

/**
 * @brief 等待 Mock 异步延迟 / Wait for a Mock async delay.
 * @param delayMs 延迟（毫秒）/ Delay in milliseconds.
 * @return 完成 Promise / Completion promise.
 */
const waitForMockDelay = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

/**
 * @brief Mock 网关的共用行为 / Shared Mock-gateway behavior.
 * @note 这是前端测试基础设施，而非可用于生产的远程数据层。
 */
abstract class MockGatewayBase {
  /** @brief 当前行为模式 / Current behavior mode. */
  protected readonly mode: MockGatewayMode

  /** @brief 异步延迟 / Async delay. */
  private readonly delayMs: number

  /**
   * @brief 构造 Mock 网关基类 / Construct the Mock gateway base.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  protected constructor(options: MockGatewayOptions = {}) {
    this.mode = options.mode ?? 'ready'
    this.delayMs = options.delayMs ?? 0
  }

  /**
   * @brief 在读取数据前应用 Mock 行为 / Apply Mock behavior before reading data.
   * @return 当前模式 / Current mode.
   * @throws {MockGatewayError} 当模式为 error 时抛出。
   */
  protected async prepareMockRead(): Promise<MockGatewayMode> {
    await waitForMockDelay(this.delayMs)

    if (this.mode === 'error') {
      throw new MockGatewayError('mock.unavailable', 'Mock gateway is configured to fail.')
    }

    return this.mode
  }

  /**
   * @brief 抛出 Mock 未找到错误 / Throw a Mock not-found error.
   * @param resourceName 资源说明 / Resource description.
   * @return 此函数不会返回 / This function never returns.
   * @throws {MockGatewayError} 始终抛出未找到错误。
   */
  protected throwMockNotFound(resourceName: string): never {
    throw new MockGatewayError('mock.not_found', `Mock ${resourceName} was not found.`)
  }
}

/**
 * @brief 工作区数据的 Mock 适配器 / Mock adapter for workspace data.
 * @note 类名含 Mock，明确表明它不可替代正式 Workspace API 客户端。
 */
export class MockWorkspaceGateway extends MockGatewayBase implements WorkspaceGateway {
  /**
   * @brief 构造工作区 Mock 网关 / Construct the workspace Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    super(options)
  }

  /**
   * @brief 列出 Mock 工作区 / List Mock workspaces.
   * @return Mock 工作区列表 / Mock workspace list.
   */
  async listWorkspaces(): Promise<readonly UiWorkspace[]> {
    const mode = await this.prepareMockRead()
    return mode === 'empty' ? [] : cloneMockValue(MOCK_WORKSPACES)
  }

  /**
   * @brief 获取 Mock 工作区首页 / Get Mock workspace home.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 首页数据 / Mock home data.
   */
  async getWorkspaceHome(workspaceId: UiWorkspaceId): Promise<UiWorkspaceHomeModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return this.throwMockNotFound('workspace')
    }

    return cloneMockValue(MOCK_WORKSPACE_HOME)
  }
}

/**
 * @brief 简历与模板数据的 Mock 适配器 / Mock adapter for resume and template data.
 * @note 所有返回值都是 UI projection；它不提交 ResumeOperationBatch 或模板迁移 Job。
 */
export class MockResumeGateway extends MockGatewayBase implements ResumeGateway {
  /** @brief 当前实例内的简历编辑器投影 / Resume-editor projection owned by this instance. */
  private editor: UiResumeEditorModel

  /** @brief 最近一次可撤销 AI 变更 / Latest undoable AI change. */
  private undoState: {
    readonly changeId: string
    readonly editor: UiResumeEditorModel
  } | null = null

  /** @brief 确定性消息序号 / Deterministic message sequence. */
  private messageSequence = 0

  /**
   * @brief 构造简历 Mock 网关 / Construct the resume Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    super(options)
    this.editor = cloneMockValue(MOCK_RESUME_EDITOR)
  }

  /**
   * @brief 列出 Mock 简历卡片 / List Mock resume cards.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 简历卡片 / Mock resume cards.
   */
  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return []
    }

    return cloneMockValue(MOCK_RESUME_CARDS)
  }

  /**
   * @brief 获取 Mock 三栏简历编辑器 / Get the Mock three-pane resume editor.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 编辑器数据 / Mock editor data.
   */
  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    return cloneMockValue(this.editor)
  }

  /**
   * @brief 处理确定性的 Mock 简历助手消息 / Handle a deterministic Mock assistant message.
   * @param input 助手消息领域输入 / Assistant-message domain input.
   * @return 结构化助手结果 / Structured assistant result.
   */
  async sendAssistantMessage(
    input: UiResumeAssistantMessageInput
  ): Promise<UiResumeAssistantTurnResult> {
    await this.prepareMockRead()
    if (input.resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    const message = input.message.trim()
    if (message.length === 0) {
      throw new MockGatewayError('mock.conflict', 'Mock assistant messages cannot be empty.')
    }

    this.messageSequence += 1
    const changeId = asUiOpaqueId<'resume-assistant-change'>(
      `chg_mock_resume_${this.messageSequence}`
    )
    const before = cloneMockValue(this.editor)
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

    return cloneMockValue({
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
    await this.prepareMockRead()
    if (
      input.resumeId !== MOCK_RESUME_ID ||
      this.undoState === null ||
      input.changeId !== this.undoState.changeId
    ) {
      throw new MockGatewayError(
        'mock.conflict',
        'The Mock assistant change can no longer be undone.'
      )
    }

    this.editor = cloneMockValue(this.undoState.editor)
    this.undoState = null
    return cloneMockValue({ editor: this.editor, canUndo: false })
  }

  /**
   * @brief 更新 Mock 简历板块并使旧 AI 撤销失效 / Update a Mock section and invalidate AI undo.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器 / Latest editor.
   */
  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    await this.prepareMockRead()
    if (input.resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    const sectionExists = this.editor.resume.sections.some(
      (section) => section.id === input.sectionId
    )
    if (!sectionExists) {
      return this.throwMockNotFound('resume section')
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
    return cloneMockValue(this.editor)
  }

  /** @brief 调整 Mock 简历板块顺序 / Reorder Mock resume sections. */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    await this.prepareMockRead()
    if (input.resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    const sectionById = new Map(this.editor.resume.sections.map((section) => [section.id, section]))
    const reorderedSections = input.orderedSectionIds.map((sectionId) => sectionById.get(sectionId))
    if (
      reorderedSections.length !== this.editor.resume.sections.length ||
      new Set(input.orderedSectionIds).size !== this.editor.resume.sections.length ||
      reorderedSections.some((section) => section === undefined)
    ) {
      throw new MockGatewayError('mock.conflict', 'The Mock section order is incomplete.')
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
    return cloneMockValue(this.editor)
  }

  /** @brief 删除 Mock 简历板块 / Delete a Mock resume section. */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    await this.prepareMockRead()
    if (input.resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    const remainingSections = this.editor.resume.sections.filter(
      (section) => section.id !== input.sectionId
    )
    if (remainingSections.length === this.editor.resume.sections.length) {
      return this.throwMockNotFound('resume section')
    }
    if (remainingSections.length === 0) {
      throw new MockGatewayError('mock.conflict', 'A Mock resume must keep at least one section.')
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
    return cloneMockValue(this.editor)
  }

  /** @brief 切换 Mock 简历模板 / Select a Mock resume template. */
  async selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel> {
    await this.prepareMockRead()
    if (input.resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('resume editor')
    }

    const template = MOCK_TEMPLATE_MANIFESTS.find((item) => item.id === input.templateId)
    if (template === undefined) {
      return this.throwMockNotFound('resume template')
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
    return cloneMockValue(this.editor)
  }

  /**
   * @brief 列出支持指定语言的 Mock 模板 / List Mock templates supporting a locale.
   * @param locale 资源内容语言 / Resource-content locale.
   * @return Mock 模板清单 / Mock template manifests.
   */
  async listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty') {
      return []
    }

    const manifests = MOCK_TEMPLATE_MANIFESTS.filter((template) =>
      template.supportedLocales.includes(locale)
    )
    return cloneMockValue(manifests)
  }

  /**
   * @brief 获取 Mock 模板设置页数据 / Get Mock template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 模板设置数据 / Mock template-settings data.
   */
  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
      return this.throwMockNotFound('template settings')
    }

    return cloneMockValue(MOCK_TEMPLATE_SETTINGS)
  }
}

/**
 * @brief 模拟面试数据的 Mock 适配器 / Mock adapter for interview data.
 * @note 它不建立 RealtimeConnectionDescriptor、WebRTC、SSE 或 WebSocket 连接。
 */
export class MockInterviewGateway extends MockGatewayBase implements InterviewGateway {
  /** @inheritdoc */
  async listCompletedInterviews(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewHistoryItem[]> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return []
    }

    return cloneMockValue(MOCK_INTERVIEW_HISTORY)
  }

  /** @inheritdoc */
  async getInterviewSetup(workspaceId: UiWorkspaceId): Promise<UiInterviewSetupModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return { scenarios: [], jobTargets: [] }
    }

    return cloneMockValue({
      scenarios: MOCK_INTERVIEW_SCENARIOS,
      jobTargets: [MOCK_INTERVIEW_RUNTIME.session.jobTarget]
    })
  }

  /** @inheritdoc */
  async createInterview(input: UiCreateInterviewInput): Promise<UiCreateInterviewResult> {
    input.signal?.throwIfAborted()
    await this.prepareMockRead()
    if (input.workspaceId !== MOCK_WORKSPACE_ID || input.jobTarget.title.trim().length === 0) {
      return this.throwMockNotFound('interview setup')
    }

    return { sessionId: MOCK_INTERVIEW_SESSION_ID }
  }

  /**
   * @brief 构造面试 Mock 网关 / Construct the interview Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    super(options)
  }

  /**
   * @brief 列出 Mock 面试场景 / List Mock interview scenarios.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 面试场景 / Mock interview scenarios.
   */
  async listInterviewScenarios(
    workspaceId: UiWorkspaceId
  ): Promise<readonly UiInterviewScenario[]> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return []
    }

    return cloneMockValue(MOCK_INTERVIEW_SCENARIOS)
  }

  /**
   * @brief 获取 Mock 实时面试页数据 / Get Mock live-interview page data.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return Mock 实时面试数据 / Mock live-interview data.
   */
  async getLiveInterview(sessionId: UiInterviewSessionId): Promise<UiLiveInterviewModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || sessionId !== MOCK_INTERVIEW_SESSION_ID) {
      return this.throwMockNotFound('interview session')
    }

    return cloneMockValue(MOCK_LIVE_INTERVIEW)
  }

  /** @inheritdoc */
  async getInterviewRuntime(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || sessionId !== MOCK_INTERVIEW_SESSION_ID) {
      return this.throwMockNotFound('interview runtime')
    }

    return cloneMockValue(MOCK_INTERVIEW_RUNTIME)
  }

  /** @inheritdoc */
  async submitInterviewAnswer(sessionId: UiInterviewSessionId): Promise<UiInterviewRuntimeModel> {
    const runtime = await this.getInterviewRuntime(sessionId)
    const submittedEntry = {
      id: 'seg_mock_candidate_submitted',
      speaker: 'candidate' as const,
      text: runtime.currentTranscript,
      isFinal: true,
      startMs: 15000,
      endMs: 22000
    }
    const closingEntry = {
      id: 'seg_mock_interviewer_close',
      speaker: 'interviewer' as const,
      text: '本次面试的问题已经覆盖完成，可以结束面试并查看分析。',
      isFinal: true,
      startMs: 23000,
      endMs: 26000
    }

    return cloneMockValue({
      ...runtime,
      phase: 'completion_ready' as const,
      currentTranscript: '',
      transcript: [...runtime.transcript, submittedEntry, closingEntry]
    })
  }

  /**
   * @brief 获取 Mock 面试总结 / Get the Mock interview report.
   * @param sessionId 面试会话 ID / Interview session ID.
   * @return Mock 面试报告 / Mock interview report.
   */
  async getInterviewReport(sessionId: UiInterviewSessionId): Promise<UiInterviewReport> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || sessionId !== MOCK_INTERVIEW_SESSION_ID) {
      return this.throwMockNotFound('interview report')
    }

    return cloneMockValue(MOCK_INTERVIEW_REPORT)
  }
}

/**
 * @brief 知识库数据的 Mock 适配器 / Mock adapter for knowledge data.
 * @note 它只展示 KnowledgeSource 与 VisibilityPolicy 投影，不模拟上传、索引或 PATCH。
 */
export class MockKnowledgeGateway extends MockGatewayBase implements KnowledgeGateway {
  /**
   * @brief 构造知识库 Mock 网关 / Construct the knowledge Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    super(options)
  }

  /**
   * @brief 列出 Mock 知识来源 / List Mock knowledge sources.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 知识来源 / Mock knowledge sources.
   */
  async listKnowledgeSources(workspaceId: UiWorkspaceId): Promise<readonly UiKnowledgeSource[]> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || workspaceId !== MOCK_WORKSPACE_ID) {
      return []
    }

    return cloneMockValue(MOCK_KNOWLEDGE_SOURCES)
  }

  /**
   * @brief 获取 Mock 知识可见性设置 / Get Mock knowledge-visibility settings.
   * @param sourceId 知识来源 ID / Knowledge source ID.
   * @return Mock 可见性页面数据 / Mock visibility-page data.
   */
  async getKnowledgeVisibility(sourceId: UiKnowledgeSourceId): Promise<UiKnowledgeVisibilityModel> {
    const mode = await this.prepareMockRead()
    /** @brief 与路由来源 ID 匹配的 Mock 来源 / Mock source matching the route source ID. */
    const source = MOCK_KNOWLEDGE_SOURCES.find((candidate) => candidate.id === sourceId)

    if (mode === 'empty' || source === undefined) {
      return this.throwMockNotFound('knowledge visibility')
    }

    return cloneMockValue({
      source,
      availableAgentScopes: MOCK_KNOWLEDGE_VISIBILITY.availableAgentScopes
    })
  }
}
