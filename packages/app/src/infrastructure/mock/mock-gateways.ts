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
  AppLocale,
  UiInterviewReport,
  UiInterviewScenario,
  UiInterviewSessionId,
  UiKnowledgeSource,
  UiKnowledgeSourceId,
  UiKnowledgeVisibilityModel,
  UiLiveInterviewModel,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiWorkspace,
  UiWorkspaceHomeModel,
  UiWorkspaceId
} from '../../domain/models'
import {
  MOCK_INTERVIEW_REPORT,
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
export type MockGatewayErrorCode = 'mock.unavailable' | 'mock.not_found'

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
  /**
   * @brief 构造简历 Mock 网关 / Construct the resume Mock gateway.
   * @param options Mock 行为选项 / Mock behavior options.
   */
  constructor(options: MockGatewayOptions = {}) {
    super(options)
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

    return cloneMockValue(MOCK_RESUME_EDITOR)
  }

  /**
   * @brief 列出支持指定语言的 Mock 模板 / List Mock templates supporting a locale.
   * @param locale 界面语言 / UI locale.
   * @return Mock 模板清单 / Mock template manifests.
   */
  async listTemplateManifests(locale: AppLocale): Promise<readonly UiTemplateManifest[]> {
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
  async getKnowledgeVisibility(
    sourceId: UiKnowledgeSourceId
  ): Promise<UiKnowledgeVisibilityModel> {
    const mode = await this.prepareMockRead()
    if (mode === 'empty' || sourceId !== MOCK_KNOWLEDGE_VISIBILITY.source.id) {
      return this.throwMockNotFound('knowledge visibility')
    }

    return cloneMockValue(MOCK_KNOWLEDGE_VISIBILITY)
  }
}
