/** @file API v2 协议到应用领域的防腐层 / Anti-corruption layer from API v2 protocol to application domains. */

import {
  createWorkspaceResume,
  getCurrentUser,
  getResumeTemplate,
  listResumePage,
  listResumeTemplatePage,
  listWorkspaceAccessPage,
  type ApiV2Client,
  ApiV2ContractError,
  type CurrentUser,
  type ResumeDocument,
  type ResumeCreationHttpClient,
  type ResumeSummary,
  type TemplateList,
  type TemplateManifest,
  type WorkspaceAccess
} from '@ai-job-workspace/product-api-v2'
import {
  asUiConcurrencyToken,
  asUiEmailAddress,
  asUiOAuthScope,
  asUiOpaqueId,
  asUiPrincipalSubject,
  asUiResumeCursor,
  asUiResumeTemplateCursor,
  asUiUserLocale,
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  type AppGateways,
  type UiCreatedResumeResource,
  type UiCurrentUser,
  type UiResumeSummary,
  type UiResumeSummaryPage,
  type UiResumeTemplatePage,
  type UiTemplateManifest,
  type UiWorkspaceAccess,
  type UiWorkspaceAccessPage
} from '@ai-job-workspace/app/application'

/** @brief WorkspaceAccess 协议页 / Protocol page of WorkspaceAccess values. */
type ApiWorkspaceAccessPage = Awaited<ReturnType<typeof listWorkspaceAccessPage>>

/** @brief ResumeSummary 协议页 / Protocol page of ResumeSummary values. */
type ApiResumeSummaryPage = Awaited<ReturnType<typeof listResumePage>>

/** @brief Resume Template 协议页 / Protocol page of Resume Templates. */
type ApiResumeTemplatePage = TemplateList

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
 * @brief 把创建响应中的完整 SIR 投影为创建用例资源事实 / Project the complete SIR in a creation response into creation-use-case resource facts.
 * @param source 已严格解码的完整 ResumeDocument / Strictly decoded complete ResumeDocument.
 * @return 不冒充编辑权威的窄创建结果 / Narrow creation result that does not pretend to be editor authority.
 */
export function mapCreatedResumeResource(source: ResumeDocument): UiCreatedResumeResource {
  return {
    createdAt: source.created_at,
    id: asUiOpaqueId<'resume'>(source.id),
    locale: source.locale,
    revision: source.revision,
    template: {
      templateId: asUiOpaqueId<'template'>(source.template.template_id),
      templateVersion: source.template.version
    },
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
 * @brief 把不可变 TemplateManifest 映射为 Resume 领域清单 / Map an immutable TemplateManifest into the Resume-domain manifest.
 * @param source 已严格解码的协议清单 / Strictly decoded protocol manifest.
 * @return 不泄漏 snake_case 且保留全部产品所需能力的清单 / Manifest without snake_case leakage and preserving all product-required capabilities.
 */
export function mapTemplateManifest(source: TemplateManifest): UiTemplateManifest {
  return {
    bulletStyleTokens: [...source.bullet_style_tokens],
    capabilities: {
      maxColumns: source.capabilities.max_columns,
      supportsCustomSections: source.capabilities.supports_custom_sections,
      supportsPhoto: source.capabilities.supports_photo,
      supportsSidebar: source.capabilities.supports_sidebar,
      supportsSourceMap: source.capabilities.supports_source_map
    },
    dateFormatTokens: [...source.date_format_tokens],
    description: source.description,
    fontFamilyTokens: [...source.font_family_tokens],
    id: asUiOpaqueId<'template'>(source.id),
    name: source.name,
    previewUrl: source.preview_url,
    publishedAt: source.published_at,
    settings: source.settings.map((setting) => ({
      choices: setting.choices.map((choice) => ({
        descriptionKey: choice.description_key,
        labelKey: choice.label_key,
        value: structuredClone(choice.value)
      })),
      control: setting.control,
      defaultValue: structuredClone(setting.default),
      descriptionKey: setting.description_key,
      groupKey: setting.group_key,
      key: setting.key,
      labelKey: setting.label_key,
      maximum: setting.maximum,
      minimum: setting.minimum,
      valueType: setting.value_type,
      visibleWhen:
        setting.visible_when === null
          ? null
          : {
              equals: structuredClone(setting.visible_when.equals),
              key: setting.visible_when.key
            }
    })),
    supportedLocales: [...source.supported_locales],
    supportedOutputFormats: [...source.supported_output_formats],
    supportedPageSizes: [...source.supported_page_sizes],
    supportedSectionKinds: [...source.supported_section_kinds],
    version: source.version,
    zones: source.zones.map((zone) => ({
      acceptedSectionKinds: [...zone.accepted_section_kinds],
      id: zone.id,
      labelKey: zone.label_key,
      maxSections: zone.max_sections
    }))
  }
}

/**
 * @brief 把 Template 协议页映射为封闭的领域 cursor 页 / Map a Template protocol page into a closed domain cursor page.
 * @param source 已验证的 TemplateList / Validated TemplateList.
 * @return hasMore 与 nextCursor 不会矛盾的领域页 / Domain page whose hasMore and nextCursor cannot contradict.
 */
export function mapResumeTemplatePage(source: ApiResumeTemplatePage): UiResumeTemplatePage {
  /** @brief 已映射的不可变 Template 清单 / Mapped immutable Template manifests. */
  const items = source.items.map(mapTemplateManifest)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError(
      'An API v2 Resume Template page with more items must carry a cursor.'
    )
  }
  return {
    hasMore: true,
    items,
    nextCursor: asUiResumeTemplateCursor(source.page.next_cursor)
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
 * @brief 创建 Workspace-scoped Resume 的 API v2 适配器 / Create the API v2 adapter for Workspace-scoped Resume creation.
 * @param client 具备严格 201 写语义的 Bearer client / Bearer client with strict 201 write semantics.
 * @return 将稳定用户意图原样映射为 Idempotency-Key 的创建端口 / Creation port mapping a stable user intent verbatim to Idempotency-Key.
 */
export function createApiV2ResumeCreationGateway(
  client: ResumeCreationHttpClient
): AppGateways['resumeCreation'] {
  return {
    async createResume(command) {
      /** @brief 经协议层确认的创建表示 / Creation representation confirmed by the protocol layer. */
      const representation = await createWorkspaceResume(client, {
        idempotencyKey: command.creationAttemptId,
        request: {
          ...(command.source.kind === 'clone'
            ? { clone_from_resume_id: command.source.resumeId }
            : {}),
          locale: command.locale,
          template: {
            template_id: command.template.templateId,
            version: command.template.templateVersion
          },
          title: command.title
        },
        signal: command.signal,
        workspaceId: command.workspaceId
      })
      return {
        concurrencyToken: asUiConcurrencyToken(representation.entityTag),
        resource: mapCreatedResumeResource(representation.value)
      }
    }
  }
}

/**
 * @brief 创建全局公开且不可变的 API v2 Template 目录适配器 / Create the global public immutable API v2 Template-catalog adapter.
 * @param client 不携带 Bearer 的公开 API v2 读取客户端 / Public API v2 read client that carries no Bearer token.
 * @return 保留精确版本与 cursor 关系的 Template 目录端口 / Template-catalog port preserving exact versions and cursor relations.
 */
export function createApiV2ResumeTemplateCatalog(
  client: ApiV2Client
): AppGateways['resumeTemplates'] {
  return {
    async getTemplate(reference, signal): Promise<UiTemplateManifest> {
      /** @brief 精确版本的协议 Template / Exact-version protocol Template. */
      const template = await getResumeTemplate(client, {
        signal,
        template_id: reference.templateId,
        version: reference.templateVersion
      })
      return mapTemplateManifest(template)
    },
    async listTemplatePage(request): Promise<UiResumeTemplatePage> {
      /** @brief 当前协议 Template 页 / Current protocol Template page. */
      const page = await listResumeTemplatePage(client, {
        cursor: request.cursor,
        limit: request.limit,
        signal: request.signal
      })
      return mapResumeTemplatePage(page)
    }
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
