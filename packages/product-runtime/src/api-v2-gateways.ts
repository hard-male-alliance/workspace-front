/** @file API v2 协议到应用领域的防腐层 / Anti-corruption layer from API v2 protocol to application domains. */

import {
  getCurrentUser,
  listResumePage,
  listWorkspaceAccessPage,
  type ApiV2Client,
  ApiV2ContractError,
  type CurrentUser,
  type ResumeSummary,
  type WorkspaceAccess
} from '@ai-job-workspace/product-api-v2'
import {
  asUiEmailAddress,
  asUiOAuthScope,
  asUiOpaqueId,
  asUiPrincipalSubject,
  asUiResumeCursor,
  asUiUserLocale,
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  type AppGateways,
  type UiCurrentUser,
  type UiResumeSummary,
  type UiResumeSummaryPage,
  type UiWorkspaceAccess,
  type UiWorkspaceAccessPage
} from '@ai-job-workspace/app/application'

/** @brief WorkspaceAccess 协议页 / Protocol page of WorkspaceAccess values. */
type ApiWorkspaceAccessPage = Awaited<ReturnType<typeof listWorkspaceAccessPage>>

/** @brief ResumeSummary 协议页 / Protocol page of ResumeSummary values. */
type ApiResumeSummaryPage = Awaited<ReturnType<typeof listResumePage>>

/**
 * @brief API v2 尚未接入某项产品能力 / A product capability has not yet been connected to API v2.
 * @note 该错误只表示前端 ACL 缺口，绝不触发 v1 或内存回退 / This error represents only a frontend ACL gap and never triggers v1 or in-memory fallback.
 */
export class ApiV2CapabilityUnavailableError extends Error {
  /** @brief 尚未接入的稳定能力名称 / Stable name of the unavailable capability. */
  readonly capability: string

  /**
   * @brief 构造显式能力缺口错误 / Construct an explicit capability-gap error.
   * @param capability 尚未接入的稳定能力名称 / Stable name of the unavailable capability.
   */
  constructor(capability: string) {
    super(`API v2 capability ${capability} is not connected by the frontend runtime.`)
    this.name = 'ApiV2CapabilityUnavailableError'
    this.capability = capability
  }
}

/**
 * @brief 构造永不回退的未接入异步操作 / Construct an unavailable async operation that never falls back.
 * @param capability 尚未接入的稳定能力名称 / Stable name of the unavailable capability.
 * @return 每次调用都拒绝的操作 / Operation that rejects on every invocation.
 */
function unavailableOperation(capability: string): () => Promise<never> {
  return (): Promise<never> => Promise.reject(new ApiV2CapabilityUnavailableError(capability))
}

/**
 * @brief 把 CurrentUser DTO 映射为 Identity 领域投影 / Map a CurrentUser DTO into the Identity domain projection.
 * @param source 已由 API v2 decoder 验证的 DTO / DTO validated by the API v2 decoder.
 * @return 不泄漏传输字段命名的当前用户 / Current user without transport-field naming leakage.
 */
export function mapCurrentUser(source: CurrentUser): UiCurrentUser {
  return {
    defaultWorkspaceId:
      source.default_workspace_id === null
        ? null
        : asUiOpaqueId<'workspace'>(source.default_workspace_id),
    displayName: source.display_name,
    email: asUiEmailAddress(source.email),
    emailVerified: source.email_verified,
    id: asUiOpaqueId<'user'>(source.id),
    locale: asUiUserLocale(source.locale),
    scopes: new Set(source.scopes.map(asUiOAuthScope)),
    subject: asUiPrincipalSubject(source.subject)
  }
}

/**
 * @brief 把 WorkspaceAccess DTO 映射为 Workspace 领域权威 / Map a WorkspaceAccess DTO into Workspace domain authority.
 * @param source 已由 API v2 decoder 验证的访问项 / Access item validated by the API v2 decoder.
 * @return 保留成员角色与数据驻留信息的访问权威 / Access authority preserving membership role and data residency.
 */
export function mapWorkspaceAccess(source: WorkspaceAccess): UiWorkspaceAccess {
  return {
    memberId: asUiOpaqueId<'workspace-member'>(source.member_id),
    role: source.role,
    workspace: {
      createdAt: asUiWorkspaceTimestamp(source.workspace.created_at),
      dataRegion: source.workspace.data_region,
      id: asUiOpaqueId<'workspace'>(source.workspace.id),
      name: source.workspace.name,
      plan: source.workspace.plan,
      revision: asUiWorkspaceRevision(source.workspace.revision),
      slug: asUiWorkspaceSlug(source.workspace.slug),
      updatedAt: asUiWorkspaceTimestamp(source.workspace.updated_at)
    }
  }
}

/**
 * @brief 把 WorkspaceAccess 协议页映射为封闭领域页 / Map a WorkspaceAccess protocol page into a closed domain page.
 * @param source 已验证的协议页 / Validated protocol page.
 * @return 以判别联合表达 cursor 关系的领域页 / Domain page expressing the cursor relation as a discriminated union.
 */
export function mapWorkspaceAccessPage(source: ApiWorkspaceAccessPage): UiWorkspaceAccessPage {
  /** @brief 已映射的访问项 / Mapped access items. */
  const items = source.items.map(mapWorkspaceAccess)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError('An API v2 Workspace page with more items must carry a cursor.')
  }
  return {
    hasMore: true,
    items,
    nextCursor: asUiWorkspaceCursor(source.page.next_cursor)
  }
}

/**
 * @brief 把 ResumeSummary DTO 映射为 Resume 目录投影 / Map a ResumeSummary DTO into the Resume-library projection.
 * @param source 已由 API v2 decoder 验证的摘要 / Summary validated by the API v2 decoder.
 * @return 不依赖完整文档或模板联表的领域摘要 / Domain summary independent of full documents or template joins.
 */
export function mapResumeSummary(source: ResumeSummary): UiResumeSummary {
  return {
    createdAt: source.created_at,
    id: asUiOpaqueId<'resume'>(source.id),
    locale: source.locale,
    revision: source.revision,
    templateId: asUiOpaqueId<'template'>(source.template.template_id),
    templateVersion: source.template.version,
    title: source.title,
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
}

/**
 * @brief 把 ResumeSummary 协议页映射为封闭领域页 / Map a ResumeSummary protocol page into a closed domain page.
 * @param source 已验证的协议页 / Validated protocol page.
 * @return 以判别联合表达 cursor 关系的领域页 / Domain page expressing the cursor relation as a discriminated union.
 */
export function mapResumeSummaryPage(source: ApiResumeSummaryPage): UiResumeSummaryPage {
  /** @brief 已映射的 Resume 摘要 / Mapped Resume summaries. */
  const items = source.items.map(mapResumeSummary)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError('An API v2 Resume page with more items must carry a cursor.')
  }
  return {
    hasMore: true,
    items,
    nextCursor: asUiResumeCursor(source.page.next_cursor)
  }
}

/**
 * @brief 创建 Identity 的 API v2 应用适配器 / Create the API v2 application adapter for Identity.
 * @param client v2-only Bearer 客户端 / v2-only Bearer client.
 * @return Identity 应用端口 / Identity application port.
 */
export function createApiV2IdentityGateway(client: ApiV2Client): AppGateways['identity'] {
  return {
    async loadCurrentUser(signal): Promise<UiCurrentUser> {
      /** @brief 带 HTTP 元数据的当前用户表示 / Current-user representation with HTTP metadata. */
      const representation = await getCurrentUser(client, signal)
      return mapCurrentUser(representation.value)
    }
  }
}

/**
 * @brief 创建 Workspace 的 API v2 应用适配器 / Create the API v2 application adapter for Workspace.
 * @param client v2-only Bearer 客户端 / v2-only Bearer client.
 * @return Workspace 应用端口 / Workspace application port.
 */
export function createApiV2WorkspaceGateway(client: ApiV2Client): AppGateways['workspace'] {
  return {
    async listWorkspaceAccessPage(request): Promise<UiWorkspaceAccessPage> {
      /** @brief 当前 WorkspaceAccess 协议页 / Current protocol page of WorkspaceAccess values. */
      const page = await listWorkspaceAccessPage(client, {
        cursor: request.cursor,
        limit: request.limit,
        signal: request.signal
      })
      return mapWorkspaceAccessPage(page)
    }
  }
}

/**
 * @brief 创建 Resume 的 API v2 应用适配器 / Create the API v2 application adapter for Resume.
 * @param client v2-only Bearer 客户端 / v2-only Bearer client.
 * @return Resume 应用端口；未接入操作显式失败 / Resume application port; unconnected operations fail explicitly.
 */
export function createApiV2ResumeGateway(client: ApiV2Client): AppGateways['resume'] {
  return {
    deleteResumeSection: unavailableOperation('resume.operations.delete-section'),
    getResumeEditor: unavailableOperation('resume.document.read'),
    getResumeRenderJob: unavailableOperation('jobs.read'),
    getTemplateManifest: unavailableOperation('resume-templates.read-one'),
    getTemplateSettings: unavailableOperation('resume.template-settings.read'),
    listTemplateManifests: unavailableOperation('resume-templates.list'),
    async listResumeSummariesPage(request): Promise<UiResumeSummaryPage> {
      /** @brief 当前 ResumeSummary 协议页 / Current protocol page of ResumeSummary values. */
      const page = await listResumePage(client, request.workspaceId, {
        cursor: request.cursor,
        limit: request.limit,
        signal: request.signal
      })
      return mapResumeSummaryPage(page)
    },
    reorderResumeSections: unavailableOperation('resume.operations.reorder-sections'),
    startResumePdfRender: unavailableOperation('resume.render-jobs.create'),
    updateResumeSection: unavailableOperation('resume.operations.update-section'),
    updateTemplateSettings: unavailableOperation('resume.operations.update-template-settings')
  }
}

/**
 * @brief 创建尚未接入 API v2 的 Interview 端口 / Create the Interview port not yet connected to API v2.
 * @return 所有操作都显式失败且不回退的端口 / Port whose operations fail explicitly without fallback.
 */
export function createUnavailableInterviewGateway(): AppGateways['interview'] {
  return {
    createInterview: unavailableOperation('interview-sessions.create'),
    endInterview: unavailableOperation('interview-sessions.end'),
    getInterviewRuntime: unavailableOperation('interview-sessions.read'),
    getInterviewSetup: unavailableOperation('interview-scenarios.setup'),
    getInterviewSummary: unavailableOperation('interview-reports.read'),
    listCompletedInterviews: unavailableOperation('interview-sessions.list-completed'),
    listInterviewScenarios: unavailableOperation('interview-scenarios.list'),
    submitInterviewAnswer: unavailableOperation('interview-sessions.submit-answer')
  }
}

/**
 * @brief 创建尚未接入 API v2 的 Knowledge 端口 / Create the Knowledge port not yet connected to API v2.
 * @return 所有操作都显式失败且不回退的端口 / Port whose operations fail explicitly without fallback.
 */
export function createUnavailableKnowledgeGateway(): AppGateways['knowledge'] {
  return {
    getKnowledgeVisibility: unavailableOperation('knowledge.visibility.read'),
    listKnowledgeSources: unavailableOperation('knowledge-sources.list'),
    updateKnowledgeVisibility: unavailableOperation('knowledge.visibility.update')
  }
}
