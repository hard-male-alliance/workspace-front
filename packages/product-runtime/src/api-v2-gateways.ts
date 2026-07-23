/** @file API v2 协议到应用领域的防腐层 / Anti-corruption layer from API v2 protocol to application domains. */

import {
  applyResumeOperations,
  cancelWorkspaceJob,
  createWorkspaceResume,
  createWorkspaceResumeRenderJob,
  getCurrentUser,
  getWorkspaceArtifact,
  getWorkspaceArtifactContent,
  getWorkspaceJob,
  getWorkspaceResume,
  getResumeTemplate,
  listWorkspaceArtifactPage,
  listWorkspaceJobPage,
  listResumePage,
  listResumeTemplatePage,
  listWorkspaceAccessPage,
  type ApiV2Client,
  type ApiV2HttpClient,
  ApiV2ContractError,
  ApiV2WriteOutcomeUnknownError,
  type CurrentUser,
  type ColorValue,
  type Artifact,
  type Job,
  type Measurement,
  type ProblemDetails,
  type ResourceReference,
  type ResumeDocument,
  type ResumeStyleIntent,
  type ResumeCreationHttpClient,
  type ResumeOperation,
  type ResumeOperationBatch,
  type ResumeOperationsHttpClient,
  type ResumeJobCommandHttpClient,
  type ResumeSummary,
  type RichText,
  type TextMark,
  type TemplateList,
  type TemplateManifest,
  type WorkspaceAccess
} from '@ai-job-workspace/product-api-v2'
import {
  asUiConcurrencyToken,
  asUiEmailAddress,
  asUiOAuthScope,
  asUiOpaqueId,
  asUiResumePartialDate,
  asUiPrincipalSubject,
  asUiResumeCursor,
  asUiResumeTemplateCursor,
  asUiWorkspaceOperationsCursor,
  asUiUserLocale,
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp,
  cloneUiJsonValue,
  ResumeBatchConflictError,
  uiWorkspaceArtifactsEqual,
  uiJsonValuesEqual,
  type AppGateways,
  type UiCreatedResumeResource,
  type UiColorValue,
  type UiCurrentUser,
  type UiJsonObject,
  type UiJsonValue,
  type UiMeasurement,
  type UiResumeDocument,
  type UiResumeEditorModel,
  type UiResumeRichText,
  type UiResumeStyleIntent,
  type UiResumeTextMark,
  type UiResumeSummary,
  type UiResumeSummaryPage,
  type UiResumeTemplatePage,
  type UiTemplateManifest,
  type UiWorkspaceAccess,
  type UiWorkspaceAccessPage,
  type UiWorkspaceArtifact,
  type UiWorkspaceArtifactAuthority,
  type UiWorkspaceArtifactContent,
  type UiWorkspaceArtifactPage,
  type UiWorkspaceJob,
  type UiWorkspaceJobAuthority,
  type UiWorkspaceJobPage,
  type UiWorkspaceOperationProblem,
  type UiWorkspaceResourceRef
} from '@ai-job-workspace/app/application'

/** @brief WorkspaceAccess 协议页 / Protocol page of WorkspaceAccess values. */
type ApiWorkspaceAccessPage = Awaited<ReturnType<typeof listWorkspaceAccessPage>>

/** @brief ResumeSummary 协议页 / Protocol page of ResumeSummary values. */
type ApiResumeSummaryPage = Awaited<ReturnType<typeof listResumePage>>

/** @brief Resume Template 协议页 / Protocol page of Resume Templates. */
type ApiResumeTemplatePage = TemplateList

/** @brief 可映射为应用 Job 权威的协议表示 / Protocol representation mappable to an application Job authority. */
interface ApiWorkspaceJobAuthoritySource {
  readonly value: Job
  readonly entityTag: string
  readonly requestId: string
  readonly location?: string
}

/**
 * @brief 把协议 ResourceRef 无损映射为 camelCase 值对象 / Losslessly map a protocol ResourceRef into a camelCase value object.
 * @param source 已严格解码的资源引用 / Strictly decoded resource reference.
 * @return 保留 revision 缺失与 null 区别的领域引用 / Domain reference preserving absent versus null revision.
 */
export function mapWorkspaceResourceRef(source: ResourceReference): UiWorkspaceResourceRef {
  /** @brief 不含可选 revision 的必需字段 / Required fields without the optional revision. */
  const required = { id: source.id, resourceType: source.resource_type }
  if (!Object.hasOwn(source, 'revision')) return required
  /** @brief 已由协议 decoder 保证存在的 revision / Revision whose presence was guaranteed by the protocol decoder. */
  const revision = source.revision
  if (revision === undefined) {
    throw new ApiV2ContractError('An API v2 ResourceRef cannot own an undefined revision.')
  }
  return { ...required, revision }
}

/**
 * @brief 把协议 ProblemDetails 映射为安全 camelCase 投影 / Map protocol ProblemDetails into a safe camelCase projection.
 * @param source 已严格解码的问题详情 / Strictly decoded problem details.
 * @return 不共享可变容器的问题投影 / Problem projection sharing no mutable containers.
 */
export function mapWorkspaceOperationProblem(source: ProblemDetails): UiWorkspaceOperationProblem {
  return {
    code: source.code,
    detail: source.detail,
    errors: source.errors.map((error) => ({
      code: error.code,
      messageKey: error.message_key,
      params: error.params === null ? null : Object.fromEntries(Object.entries(error.params)),
      pointer: error.pointer
    })),
    extensions:
      source.extensions === null ? null : cloneUiJsonValue(source.extensions as UiJsonObject),
    instance: source.instance,
    requestId: source.request_id,
    retryable: source.retryable,
    status: source.status,
    title: source.title,
    type: source.type
  }
}

/**
 * @brief 把 API v2 Job 映射为闭合 camelCase 生命周期 / Map an API v2 Job into the closed camelCase lifecycle.
 * @param source 已严格解码的协议 Job / Strictly decoded protocol Job.
 * @return 保留开放 kind、主体、结果、进度与时间的领域 Job / Domain Job preserving open kind, subject, results, progress, and timestamps.
 */
export function mapWorkspaceJob(source: Job): UiWorkspaceJob {
  /** @brief 跨状态公共字段 / Fields shared across lifecycle states. */
  const fields = {
    createdAt: source.created_at,
    id: asUiOpaqueId<'workspace-job'>(source.id),
    kind: source.kind,
    progress:
      source.progress === null
        ? null
        : {
            completed: source.progress.completed,
            phase: source.progress.phase,
            total: source.progress.total,
            unit: source.progress.unit
          },
    resultRefs: source.result_refs.map(mapWorkspaceResourceRef),
    revision: source.revision,
    subject: mapWorkspaceResourceRef(source.subject),
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
  switch (source.status) {
    case 'queued':
      return { ...fields, finishedAt: null, problem: null, startedAt: null, status: source.status }
    case 'running':
      return {
        ...fields,
        finishedAt: null,
        problem: null,
        startedAt: source.started_at,
        status: source.status
      }
    case 'succeeded':
      return {
        ...fields,
        finishedAt: source.finished_at,
        problem: null,
        startedAt: source.started_at,
        status: source.status
      }
    case 'failed':
      return {
        ...fields,
        finishedAt: source.finished_at,
        problem: mapWorkspaceOperationProblem(source.problem),
        startedAt: source.started_at,
        status: source.status
      }
    case 'cancelled':
      return {
        ...fields,
        finishedAt: source.finished_at,
        problem: source.problem === null ? null : mapWorkspaceOperationProblem(source.problem),
        startedAt: source.started_at,
        status: source.status
      }
    case 'expired':
      return {
        ...fields,
        finishedAt: source.finished_at,
        problem: source.problem === null ? null : mapWorkspaceOperationProblem(source.problem),
        startedAt: null,
        status: source.status
      }
  }
}

/**
 * @brief 把协议 Job 表示映射为应用权威 / Map a protocol Job representation into application authority.
 * @param source 同一响应中的 Job、ETag、request ID 与可选 Location / Job, ETag, request ID, and optional Location from one response.
 * @return 可安全读取或取消的 Job 权威 / Job authority safe to read or cancel.
 */
export function mapWorkspaceJobAuthority(
  source: ApiWorkspaceJobAuthoritySource
): UiWorkspaceJobAuthority {
  return {
    concurrencyToken: asUiConcurrencyToken(source.entityTag),
    job: mapWorkspaceJob(source.value),
    location: source.location ?? null,
    requestId: source.requestId
  }
}

/**
 * @brief 把协议 Job cursor 页映射为封闭领域页 / Map a protocol Job cursor page into a closed domain page.
 * @param source 已严格解码的协议页 / Strictly decoded protocol page.
 * @return 保持 hasMore/cursor 关系的 Job 页 / Job page preserving the hasMore/cursor relation.
 */
export function mapWorkspaceJobPage(
  source: Awaited<ReturnType<typeof listWorkspaceJobPage>>
): UiWorkspaceJobPage {
  /** @brief 当前页领域 Job / Domain Jobs on the current page. */
  const items = source.items.map(mapWorkspaceJob)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError('An API v2 Job page with more items must carry a cursor.')
  }
  return {
    hasMore: true,
    items,
    nextCursor: asUiWorkspaceOperationsCursor(source.page.next_cursor)
  }
}

/**
 * @brief 把 Artifact DTO 映射为不暴露 content URL 的领域 metadata / Map an Artifact DTO into domain metadata without exposing its content URL.
 * @param source 已严格解码的 Artifact / Strictly decoded Artifact.
 * @return camelCase Artifact metadata / camelCase Artifact metadata.
 */
export function mapWorkspaceArtifact(source: Artifact): UiWorkspaceArtifact {
  return {
    createdAt: source.created_at,
    expiresAt: source.expires_at,
    id: asUiOpaqueId<'workspace-artifact'>(source.id),
    kind: source.kind,
    mediaType: source.media_type,
    pageCount: source.page_count,
    revision: source.revision,
    sha256: source.sha256,
    sizeBytes: source.size_bytes,
    subject: mapWorkspaceResourceRef(source.subject),
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
}

/**
 * @brief 把协议 Artifact 表示映射为应用权威 / Map a protocol Artifact representation into application authority.
 * @param source 同一响应中的 metadata、ETag 与 request ID / Metadata, ETag, and request ID from one response.
 * @return 不暴露 content URL 的 Artifact 权威 / Artifact authority without an exposed content URL.
 */
export function mapWorkspaceArtifactAuthority(source: {
  readonly value: Artifact
  readonly entityTag: string
  readonly requestId: string
}): UiWorkspaceArtifactAuthority {
  return {
    artifact: mapWorkspaceArtifact(source.value),
    concurrencyToken: asUiConcurrencyToken(source.entityTag),
    requestId: source.requestId
  }
}

/**
 * @brief 把协议 Artifact cursor 页映射为封闭领域页 / Map a protocol Artifact cursor page into a closed domain page.
 * @param source 已严格解码的协议页 / Strictly decoded protocol page.
 * @return 保持 hasMore/cursor 关系的 Artifact 页 / Artifact page preserving the hasMore/cursor relation.
 */
export function mapWorkspaceArtifactPage(
  source: Awaited<ReturnType<typeof listWorkspaceArtifactPage>>
): UiWorkspaceArtifactPage {
  /** @brief 当前页 Artifact metadata / Artifact metadata on the current page. */
  const items = source.items.map(mapWorkspaceArtifact)
  if (!source.page.has_more) return { hasMore: false, items, nextCursor: null }
  if (source.page.next_cursor === null) {
    throw new ApiV2ContractError('An API v2 Artifact page with more items must carry a cursor.')
  }
  return {
    hasMore: true,
    items,
    nextCursor: asUiWorkspaceOperationsCursor(source.page.next_cursor)
  }
}

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
 * @brief 映射一个无损 RichText mark / Map one lossless RichText mark.
 * @param source 已由协议层验证的 mark / Mark validated by the protocol layer.
 * @return 保留 href 判别关系与 omission 的 camelCase mark / camelCase mark preserving href discrimination and omission.
 */
function mapResumeTextMark(source: TextMark): UiResumeTextMark {
  if (source.kind === 'link') {
    return { end: source.end, href: source.href, kind: source.kind, start: source.start }
  }
  return source.href === undefined
    ? { end: source.end, kind: source.kind, start: source.start }
    : { end: source.end, href: null, kind: source.kind, start: source.start }
}

/**
 * @brief 把 camelCase 领域 mark 无损映射回 API v2 wire mark / Losslessly map a camelCase domain mark back to an API v2 wire mark.
 * @param source 已由 Resume 领域持有的完整 mark / Complete mark held by the Resume domain.
 * @return 不共享引用且保留 link href 与 null/omission 差异的 wire mark / Wire mark sharing no references and preserving link href plus null/omission distinctions.
 */
export function mapUiResumeTextMarkToApiV2(source: UiResumeTextMark): TextMark {
  if (source.kind === 'link') {
    return { end: source.end, href: source.href, kind: source.kind, start: source.start }
  }
  return source.href === undefined
    ? { end: source.end, kind: source.kind, start: source.start }
    : { end: source.end, href: null, kind: source.kind, start: source.start }
}

/**
 * @brief 映射无损 Resume RichText / Map lossless Resume RichText.
 * @param source 已由协议层验证的富文本 / Rich text validated by the protocol layer.
 * @return 保留正文和全部 marks 的领域富文本 / Domain rich text preserving the body and every mark.
 */
function mapResumeRichText(source: RichText): UiResumeRichText {
  return { marks: source.marks.map(mapResumeTextMark), text: source.text }
}

/**
 * @brief 把领域 RichText 无损映射回 API v2 wire DTO / Losslessly map domain RichText back to an API v2 wire DTO.
 * @param source 完整 camelCase 富文本 / Complete camelCase rich text.
 * @return 保留 Unicode 文本、code-point offsets、marks 与链接的独立 DTO / Independent DTO preserving Unicode text, code-point offsets, marks, and links.
 */
export function mapUiResumeRichTextToApiV2(source: UiResumeRichText): RichText {
  return { marks: source.marks.map(mapUiResumeTextMarkToApiV2), text: source.text }
}

/**
 * @brief 把 RichText DTO 收紧为 set_field 可发送的严格 JSON 值 / Narrow a RichText DTO to a strict JSON value sendable by set_field.
 * @param source 完整领域富文本 / Complete domain rich text.
 * @return 只含 canonical RichText wire 字段的 JSON / JSON containing only canonical RichText wire fields.
 */
function encodeUiResumeRichTextValue(source: UiResumeRichText): UiJsonValue {
  /** @brief 无损 wire RichText / Lossless wire RichText. */
  const wire = mapUiResumeRichTextToApiV2(source)
  return {
    marks: wire.marks.map((mark) =>
      mark.kind === 'link'
        ? { end: mark.end, href: mark.href, kind: mark.kind, start: mark.start }
        : mark.href === undefined
          ? { end: mark.end, kind: mark.kind, start: mark.start }
          : { end: mark.end, href: null, kind: mark.kind, start: mark.start }
    ),
    text: wire.text
  }
}

/**
 * @brief 映射语义测量值 / Map a semantic measurement.
 * @param source 已验证 measurement / Validated measurement.
 * @return camelCase 领域 measurement / camelCase domain measurement.
 */
function mapMeasurement(source: Measurement): UiMeasurement {
  return { unit: source.unit, value: source.value }
}

/**
 * @brief 映射语义颜色值 / Map a semantic color value.
 * @param source 已验证颜色 / Validated color.
 * @return camelCase 领域颜色 / camelCase domain color.
 */
function mapColorValue(source: ColorValue): UiColorValue {
  return { space: source.space, value: source.value }
}

/**
 * @brief 把领域 measurement 映射回 API v2 wire 值 / Map a domain measurement back to an API v2 wire value.
 * @param source 领域 measurement / Domain measurement.
 * @return 不共享引用的 wire measurement / Wire measurement sharing no references.
 */
function mapUiMeasurementToApiV2(source: UiMeasurement): Measurement {
  return { unit: source.unit, value: source.value }
}

/**
 * @brief 把领域颜色映射回 API v2 wire 值 / Map a domain color back to an API v2 wire value.
 * @param source 领域颜色 / Domain color.
 * @return 不共享引用的 wire color / Wire color sharing no references.
 */
function mapUiColorValueToApiV2(source: UiColorValue): ColorValue {
  return { space: source.space, value: source.value }
}

/**
 * @brief 把完整领域样式无损映射回 API v2 ResumeStyleIntent / Losslessly map complete domain style back to API v2 ResumeStyleIntent.
 * @param source 完整 camelCase 样式意图 / Complete camelCase style intent.
 * @return 只含 canonical wire 字段且不共享引用的样式 / Style containing only canonical wire fields and sharing no references.
 */
export function mapUiResumeStyleIntentToApiV2(source: UiResumeStyleIntent): ResumeStyleIntent {
  return {
    bullet_style_token: source.bulletStyleToken,
    date_format_token: source.dateFormatToken,
    density: source.density,
    extensions: cloneUiJsonValue(source.extensions),
    page: {
      custom_height:
        source.page.customHeight === null
          ? null
          : mapUiMeasurementToApiV2(source.page.customHeight),
      custom_width:
        source.page.customWidth === null ? null : mapUiMeasurementToApiV2(source.page.customWidth),
      margins: {
        bottom: mapUiMeasurementToApiV2(source.page.margins.bottom),
        left: mapUiMeasurementToApiV2(source.page.margins.left),
        right: mapUiMeasurementToApiV2(source.page.margins.right),
        top: mapUiMeasurementToApiV2(source.page.margins.top)
      },
      max_pages: source.page.maxPages,
      orientation: source.page.orientation,
      show_page_numbers: source.page.showPageNumbers,
      size: source.page.size
    },
    palette: {
      background: mapUiColorValueToApiV2(source.palette.background),
      muted_text: mapUiColorValueToApiV2(source.palette.mutedText),
      primary: mapUiColorValueToApiV2(source.palette.primary),
      secondary: mapUiColorValueToApiV2(source.palette.secondary),
      text: mapUiColorValueToApiV2(source.palette.text)
    },
    section_layout: source.sectionLayout.map((layout) => ({
      compactness: layout.compactness,
      heading_style_token: layout.headingStyleToken,
      keep_together: layout.keepTogether,
      page_break_before: layout.pageBreakBefore,
      section_id: layout.sectionId,
      zone: layout.zone
    })),
    style_contract_version: source.styleContractVersion,
    template_settings: cloneUiJsonValue(source.templateSettings),
    typography: {
      base_size_pt: source.typography.baseSizePt,
      font_family_token: source.typography.fontFamilyToken,
      heading_scale: source.typography.headingScale,
      letter_spacing_em: source.typography.letterSpacingEm,
      line_height: source.typography.lineHeight
    }
  }
}

/**
 * @brief 克隆已由 API v2 decoder 验证的 JSON map / Clone a JSON map validated by the API v2 decoder.
 * @param source 已验证 JSON map / Validated JSON map.
 * @return 不与 transport DTO 共享引用的 JSON map / JSON map sharing no references with the transport DTO.
 */
function cloneJsonMap(
  source: Readonly<Record<string, UiJsonValue>>
): Readonly<Record<string, UiJsonValue>> {
  return cloneUiJsonValue(source)
}

/**
 * @brief 把完整 ResumeDocument DTO 无损映射为 camelCase 编辑权威 / Losslessly map a complete ResumeDocument DTO into camelCase editor authority.
 * @param source 已由 API v2 decoder 完整验证的 SIR / Complete SIR validated by the API v2 decoder.
 * @return 不含展示派生字段且保留所有语义事实的领域文档 / Domain document preserving every semantic fact without derived display fields.
 */
export function mapResumeDocument(source: ResumeDocument): UiResumeDocument {
  return {
    createdAt: source.created_at,
    id: asUiOpaqueId<'resume'>(source.id),
    knowledgeSourceId:
      source.knowledge_source_id === null
        ? null
        : asUiOpaqueId<'knowledge-source'>(source.knowledge_source_id),
    locale: source.locale,
    profile: {
      contacts: source.profile.contacts.map((contact) => ({
        id: asUiOpaqueId<'resume-contact'>(contact.id),
        kind: contact.kind,
        label: contact.label,
        url: contact.url,
        value: contact.value
      })),
      fullName: source.profile.full_name,
      headline: source.profile.headline,
      summary: source.profile.summary === null ? null : mapResumeRichText(source.profile.summary)
    },
    revision: source.revision,
    sections: source.sections.map((section) => ({
      content: section.content === null ? null : mapResumeRichText(section.content),
      id: asUiOpaqueId<'resume-section'>(section.id),
      items: section.items.map((item) => ({
        dateRange:
          item.date_range === null
            ? null
            : {
                end:
                  item.date_range.end === null || item.date_range.end === 'present'
                    ? item.date_range.end
                    : asUiResumePartialDate(item.date_range.end),
                start:
                  item.date_range.start === null
                    ? null
                    : asUiResumePartialDate(item.date_range.start)
              },
        highlights: item.highlights.map(mapResumeRichText),
        id: asUiOpaqueId<'resume-item'>(item.id),
        kind: item.kind,
        location: item.location,
        organization: item.organization,
        skills: [...item.skills],
        subtitle: item.subtitle,
        summary: item.summary === null ? null : mapResumeRichText(item.summary),
        tags: [...item.tags],
        title: item.title,
        url: item.url,
        visible: item.visible
      })),
      kind: section.kind,
      title: section.title,
      visible: section.visible
    })),
    styleIntent: {
      bulletStyleToken: source.style.bullet_style_token,
      dateFormatToken: source.style.date_format_token,
      density: source.style.density,
      extensions: cloneJsonMap(source.style.extensions),
      page: {
        customHeight:
          source.style.page.custom_height === null
            ? null
            : mapMeasurement(source.style.page.custom_height),
        customWidth:
          source.style.page.custom_width === null
            ? null
            : mapMeasurement(source.style.page.custom_width),
        margins: {
          bottom: mapMeasurement(source.style.page.margins.bottom),
          left: mapMeasurement(source.style.page.margins.left),
          right: mapMeasurement(source.style.page.margins.right),
          top: mapMeasurement(source.style.page.margins.top)
        },
        maxPages: source.style.page.max_pages,
        orientation: source.style.page.orientation,
        showPageNumbers: source.style.page.show_page_numbers,
        size: source.style.page.size
      },
      palette: {
        background: mapColorValue(source.style.palette.background),
        mutedText: mapColorValue(source.style.palette.muted_text),
        primary: mapColorValue(source.style.palette.primary),
        secondary: mapColorValue(source.style.palette.secondary),
        text: mapColorValue(source.style.palette.text)
      },
      sectionLayout: source.style.section_layout.map((layout) => ({
        compactness: layout.compactness,
        headingStyleToken: layout.heading_style_token,
        keepTogether: layout.keep_together,
        pageBreakBefore: layout.page_break_before,
        sectionId: asUiOpaqueId<'resume-section'>(layout.section_id),
        zone: layout.zone
      })),
      styleContractVersion: source.style.style_contract_version,
      templateSettings: cloneJsonMap(source.style.template_settings),
      typography: {
        baseSizePt: source.style.typography.base_size_pt,
        fontFamilyToken: source.style.typography.font_family_token,
        headingScale: source.style.typography.heading_scale,
        letterSpacingEm: source.style.typography.letter_spacing_em,
        lineHeight: source.style.typography.line_height
      }
    },
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
        value: cloneUiJsonValue(choice.value)
      })),
      control: setting.control,
      defaultValue: cloneUiJsonValue(setting.default),
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
              equals: cloneUiJsonValue(setting.visible_when.equals),
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
 * @brief 创建 Workspace Operations 的 API v2 应用适配器 / Create the API v2 application adapter for Workspace Operations.
 * @param client 具备读取、写入与受保护 content stream 的 v2-only 客户端 / v2-only client supporting reads, writes, and protected content streams.
 * @return 通用 Job、Artifact metadata 与完整 content 端口 / Generic Job, Artifact metadata, and complete-content port.
 */
export function createApiV2WorkspaceOperationsGateway(
  client: ApiV2HttpClient
): AppGateways['workspaceOperations'] {
  return {
    async cancelJob(command): Promise<UiWorkspaceJobAuthority> {
      /** @brief 取消后的权威协议 Job / Authoritative protocol Job after cancellation. */
      const authority = await cancelWorkspaceJob(client, {
        idempotencyKey: command.commandId,
        ifMatch: command.concurrencyToken,
        jobId: command.jobId,
        ...(command.signal === undefined ? {} : { signal: command.signal }),
        workspaceId: command.workspaceId
      })
      return mapWorkspaceJobAuthority(authority)
    },
    async getArtifact(request): Promise<UiWorkspaceArtifactAuthority> {
      /** @brief 带 metadata ETag 的协议 Artifact / Protocol Artifact carrying its metadata ETag. */
      const authority = await getWorkspaceArtifact(client, {
        artifactId: request.artifactId,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        workspaceId: request.workspaceId
      })
      return mapWorkspaceArtifactAuthority(authority)
    },
    async getJob(request): Promise<UiWorkspaceJobAuthority> {
      /** @brief 带强 ETag 的协议 Job / Protocol Job carrying its strong ETag. */
      const authority = await getWorkspaceJob(client, {
        jobId: request.jobId,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        workspaceId: request.workspaceId
      })
      return mapWorkspaceJobAuthority(authority)
    },
    async listArtifactsPage(request): Promise<UiWorkspaceArtifactPage> {
      /** @brief 已验证的协议 Artifact 页 / Validated protocol Artifact page. */
      const page = await listWorkspaceArtifactPage(client, {
        cursor: request.cursor,
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        limit: request.limit,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.subjectId === undefined ? {} : { subjectId: request.subjectId }),
        ...(request.subjectType === undefined ? {} : { subjectType: request.subjectType }),
        workspaceId: request.workspaceId
      })
      /** @brief 应用模型中的 Artifact 页 / Artifact page in the application model. */
      const mapped = mapWorkspaceArtifactPage(page)
      if (
        mapped.items.some(
          (artifact) =>
            artifact.workspaceId !== request.workspaceId ||
            (request.kind !== undefined &&
              request.kind !== null &&
              artifact.kind !== request.kind) ||
            (request.subjectType !== undefined &&
              request.subjectType !== null &&
              artifact.subject.resourceType !== request.subjectType) ||
            (request.subjectId !== undefined &&
              request.subjectId !== null &&
              artifact.subject.id !== request.subjectId)
        )
      ) {
        throw new ApiV2ContractError(
          'An API v2 Artifact collection item escaped its Workspace or requested filters.'
        )
      }
      return mapped
    },
    async listJobsPage(request): Promise<UiWorkspaceJobPage> {
      /** @brief 已验证的协议 Job 页 / Validated protocol Job page. */
      const page = await listWorkspaceJobPage(client, {
        cursor: request.cursor,
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        limit: request.limit,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.subjectId === undefined ? {} : { subjectId: request.subjectId }),
        ...(request.subjectType === undefined ? {} : { subjectType: request.subjectType }),
        workspaceId: request.workspaceId
      })
      /** @brief 应用模型中的 Job 页 / Job page in the application model. */
      const mapped = mapWorkspaceJobPage(page)
      if (
        mapped.items.some(
          (job) =>
            job.workspaceId !== request.workspaceId ||
            (request.kind !== undefined && request.kind !== null && job.kind !== request.kind) ||
            (request.subjectType !== undefined &&
              request.subjectType !== null &&
              job.subject.resourceType !== request.subjectType) ||
            (request.subjectId !== undefined &&
              request.subjectId !== null &&
              job.subject.id !== request.subjectId)
        )
      ) {
        throw new ApiV2ContractError(
          'An API v2 Job collection item escaped its Workspace or requested filters.'
        )
      }
      return mapped
    },
    async readArtifactContent(request): Promise<UiWorkspaceArtifactContent> {
      /** @brief 调用方已核对且仅读取一次的 metadata 快照 / Caller-validated metadata snapshot read exactly once. */
      const expectedArtifact = request.artifact
      /** @brief 临近内容读取重新取得的权威 metadata / Authoritative metadata re-fetched immediately before content read. */
      const metadata = await getWorkspaceArtifact(client, {
        artifactId: expectedArtifact.id,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        workspaceId: expectedArtifact.workspaceId
      })
      /** @brief 重新映射后用于防止 metadata/content 检查时使用时竞态的快照 / Remapped snapshot preventing metadata/content time-of-check-to-time-of-use drift. */
      const currentArtifact = mapWorkspaceArtifact(metadata.value)
      if (!uiWorkspaceArtifactsEqual(expectedArtifact, currentArtifact)) {
        throw new ApiV2ContractError(
          'API v2 Artifact metadata changed before its protected content was opened.'
        )
      }
      /** @brief 使用 canonical metadata 发起的受保护完整内容读取 / Protected complete-content read using canonical metadata. */
      const content = await getWorkspaceArtifactContent(client, {
        artifact: metadata.value,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      if (content.kind !== 'complete') {
        throw new ApiV2ContractError(
          'A complete Workspace Artifact read cannot return a partial representation.'
        )
      }
      return {
        acceptsByteRanges: content.acceptsByteRanges,
        body: content.body,
        byteLength: content.expectedByteLength,
        disposition: content.disposition,
        entityTag: asUiConcurrencyToken(content.entityTag),
        mediaType: content.mediaType,
        requestId: content.requestId
      }
    }
  }
}

/** @brief Resume command 的公共权威输入 / Shared authority input for a Resume command. */
interface ResumeCommandAuthority {
  /** @brief 同一用户意图及其安全重试内稳定的命令身份 / Command identity stable within one user intent and its safe retries. */
  readonly commandId: string
  /** @brief Workspace 授权路径 / Workspace authorization path. */
  readonly workspaceId: string
  /** @brief 目标 Resume / Target Resume. */
  readonly resumeId: string
  /** @brief 用户意图基于的领域 revision / Domain revision on which the user intent is based. */
  readonly baseRevision: number
  /** @brief 与 baseRevision 同一表示读取的强 ETag / Strong ETag read from the same representation as baseRevision. */
  readonly concurrencyToken: string
}

/**
 * @brief 从稳定 command identity 派生唯一且可重试的 operation identity / Derive a unique retry-stable operation identity from a stable command identity.
 * @param commandId 用户意图身份 / User-intent identity.
 * @param suffix batch 内唯一的固定后缀 / Fixed suffix unique within the batch.
 * @return 满足 OpaqueId 上限的 operation identity / Operation identity within the OpaqueId limit.
 */
function resumeOperationId(commandId: string, suffix: string): string {
  return `${commandId}_${suffix}`
}

/** @brief 当前 Resume 用例可明确证明的写后条件 / Postcondition explicitly provable by the current Resume use case. */
type ResumeCommandPostcondition = (document: ResumeDocument) => boolean

/**
 * @brief 精确比较两个已验证 RichText marks / Exactly compare two validated RichText marks.
 * @param left 左 mark / Left mark.
 * @param right 右 mark / Right mark.
 * @return kind、区间与 href omission 均相同时为 true / True when kind, range, and href omission all match.
 */
function resumeTextMarksEqual(left: TextMark, right: TextMark): boolean {
  if (left.kind !== right.kind || left.start !== right.start || left.end !== right.end) return false
  if (left.kind === 'link' || right.kind === 'link') {
    return left.kind === 'link' && right.kind === 'link' && left.href === right.href
  }
  return Object.hasOwn(left, 'href') === Object.hasOwn(right, 'href') && left.href === right.href
}

/**
 * @brief 精确比较完整 RichText / Exactly compare complete RichText values.
 * @param left 权威响应中的 RichText / RichText from the authoritative response.
 * @param right 当前命令要求的 RichText / RichText required by the current command.
 * @return 文本和有序 marks 全部相同时为 true / True when text and ordered marks all match.
 */
function resumeRichTextsEqual(left: RichText | null, right: RichText): boolean {
  return (
    left !== null &&
    left.text === right.text &&
    left.marks.length === right.marks.length &&
    left.marks.every((mark, index) => {
      /** @brief 同一位置的预期 mark / Expected mark at the same position. */
      const expected = right.marks[index]
      return expected !== undefined && resumeTextMarksEqual(mark, expected)
    })
  )
}

/**
 * @brief 原子提交 Resume operations 并映射权威结果 / Atomically submit Resume operations and map the authoritative result.
 * @param client API v2 Resume operations 写端口 / API v2 Resume-operations write port.
 * @param command 同一权威表示与稳定用户意图 / Same authoritative representation and stable user intent.
 * @param signal 当前调用生命周期的可选取消信号 / Optional cancellation signal for the current call lifecycle.
 * @param operations 至少一个语义 operation / At least one semantic operation.
 * @param conflictStrategy 与产品意图匹配的并发策略 / Concurrency strategy matching the product intent.
 * @param postcondition 当前产品用例可明确验证的写后条件 / Postcondition explicitly verifiable by the current product use case.
 * @return 新强 ETag 与完整权威 Resume 组成的编辑器 / Editor composed of the new strong ETag and complete authoritative Resume.
 * @throws {ResumeBatchConflictError} 合法 200 结果原子拒绝了全部 operations / Thrown when a valid 200 result atomically rejected every operation.
 * @throws {ApiV2WriteOutcomeUnknownError} 已确认成功的结果未反映当前明确产品意图 / Thrown when an acknowledged success does not reflect the explicit product intent.
 */
async function applyResumeCommand(
  client: ResumeOperationsHttpClient,
  command: ResumeCommandAuthority,
  signal: AbortSignal | undefined,
  operations: readonly ResumeOperation[],
  conflictStrategy: ResumeOperationBatch['conflict_strategy'],
  postcondition: ResumeCommandPostcondition
): Promise<UiResumeEditorModel> {
  /** @brief 协议层严格验证并与 path/batch 核对后的结果 / Result strictly validated and correlated with path and batch by the protocol layer. */
  const representation = await applyResumeOperations(client, {
    batch: {
      base_revision: command.baseRevision,
      client_batch_id: command.commandId,
      conflict_strategy: conflictStrategy,
      operations,
      // Section 写入不得制造无人观察的 Render Job；显式 PDF 渲染进程统一拥有 preview。
      // Section writes must not create an unobserved Render Job; the explicit PDF-render process owns previews.
      render_hint: 'none'
    },
    idempotencyKey: command.commandId,
    ifMatch: command.concurrencyToken,
    resumeId: command.resumeId,
    ...(signal === undefined ? {} : { signal }),
    workspaceId: command.workspaceId
  })
  /** @brief 与 batch 结果原子配对的新编辑权威 / New editor authority atomically paired with the batch result. */
  const authoritativeEditor: UiResumeEditorModel = {
    concurrencyToken: asUiConcurrencyToken(representation.entityTag),
    resume: mapResumeDocument(representation.value.resume)
  }
  if (representation.value.conflicts.length > 0) {
    throw new ResumeBatchConflictError(
      authoritativeEditor,
      representation.value.conflicts.map((conflict) => ({
        code: conflict.code,
        entityId: conflict.entity_id,
        fieldPath: [...conflict.field_path],
        operationId: conflict.operation_id
      }))
    )
  }
  if (!postcondition(representation.value.resume)) {
    throw new ApiV2WriteOutcomeUnknownError('contract', 200, null, representation.requestId)
  }
  return authoritativeEditor
}

/**
 * @brief 为模板与完整样式生成确定性原子 operations / Create deterministic atomic operations for a Template and complete style.
 * @param commandId 用户模板样式意图的稳定身份 / Stable identity of the user's Template-style intent.
 * @param resumeId 接收顶层 style fields 的 Resume entity identity / Resume entity identity receiving top-level style fields.
 * @param targetTemplate 目标不可变 Template / Target immutable Template.
 * @param style 完整 API v2 wire 样式 / Complete API v2 wire style.
 * @return set_template 与固定顺序 style leaf operations / set_template and fixed-order style-leaf operations.
 * @note style_contract_version 是固定协议判别值；template_settings 只由 set_template 原子设置，二者不会产生重复 set_field。 / style_contract_version is a fixed protocol discriminator; template_settings is set atomically only by set_template, so neither creates a duplicate set_field.
 */
function createResumeTemplateStyleOperations(
  commandId: string,
  resumeId: string,
  targetTemplate: { readonly templateId: string; readonly templateVersion: string },
  style: ResumeStyleIntent
): readonly ResumeOperation[] {
  return [
    {
      op: 'set_template',
      operation_id: resumeOperationId(commandId, 'template'),
      settings: cloneUiJsonValue(style.template_settings),
      template: {
        template_id: targetTemplate.templateId,
        version: targetTemplate.templateVersion
      }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'size'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_size'),
      value: style.page.size
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'custom_width'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_custom_width'),
      value:
        style.page.custom_width === null
          ? null
          : { unit: style.page.custom_width.unit, value: style.page.custom_width.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'custom_height'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_custom_height'),
      value:
        style.page.custom_height === null
          ? null
          : { unit: style.page.custom_height.unit, value: style.page.custom_height.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'orientation'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_orientation'),
      value: style.page.orientation
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'margins', 'top'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_margin_top'),
      value: { unit: style.page.margins.top.unit, value: style.page.margins.top.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'margins', 'right'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_margin_right'),
      value: { unit: style.page.margins.right.unit, value: style.page.margins.right.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'margins', 'bottom'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_margin_bottom'),
      value: { unit: style.page.margins.bottom.unit, value: style.page.margins.bottom.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'margins', 'left'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_margin_left'),
      value: { unit: style.page.margins.left.unit, value: style.page.margins.left.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'max_pages'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_max_pages'),
      value: style.page.max_pages
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'page', 'show_page_numbers'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_page_show_numbers'),
      value: style.page.show_page_numbers
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'typography', 'font_family_token'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_type_font'),
      value: style.typography.font_family_token
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'typography', 'base_size_pt'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_type_size'),
      value: style.typography.base_size_pt
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'typography', 'line_height'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_type_line_height'),
      value: style.typography.line_height
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'typography', 'heading_scale'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_type_heading_scale'),
      value: style.typography.heading_scale
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'typography', 'letter_spacing_em'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_type_letter_spacing'),
      value: style.typography.letter_spacing_em
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'palette', 'primary'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_color_primary'),
      value: { space: style.palette.primary.space, value: style.palette.primary.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'palette', 'secondary'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_color_secondary'),
      value: { space: style.palette.secondary.space, value: style.palette.secondary.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'palette', 'text'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_color_text'),
      value: { space: style.palette.text.space, value: style.palette.text.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'palette', 'muted_text'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_color_muted_text'),
      value: { space: style.palette.muted_text.space, value: style.palette.muted_text.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'palette', 'background'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_color_background'),
      value: { space: style.palette.background.space, value: style.palette.background.value }
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'density'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_density'),
      value: style.density
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'date_format_token'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_date_format'),
      value: style.date_format_token
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'bullet_style_token'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_bullet'),
      value: style.bullet_style_token
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'section_layout'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_section_layout'),
      value: style.section_layout.map((layout) => ({
        compactness: layout.compactness,
        heading_style_token: layout.heading_style_token,
        keep_together: layout.keep_together,
        page_break_before: layout.page_break_before,
        section_id: layout.section_id,
        zone: layout.zone
      }))
    },
    {
      entity_id: resumeId,
      field_path: ['style', 'extensions'],
      op: 'set_field',
      operation_id: resumeOperationId(commandId, 'style_extensions'),
      value: style.extensions
    }
  ]
}

/**
 * @brief 创建 Resume 的 API v2 应用适配器 / Create the API v2 application adapter for Resume.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param operationsClient v2-only Resume operations 写端口 / v2-only Resume-operations write port.
 * @param jobClient v2-only Resume Job command 写端口 / v2-only Resume Job-command write port.
 * @return Resume Authoring 与 Render command 应用端口 / Resume Authoring and Render-command application port.
 */
export function createApiV2ResumeGateway(
  client: ApiV2Client,
  operationsClient: ResumeOperationsHttpClient,
  jobClient: ResumeJobCommandHttpClient
): AppGateways['resume'] {
  return {
    async deleteResumeSection(input): Promise<UiResumeEditorModel> {
      return applyResumeCommand(
        operationsClient,
        input,
        input.signal,
        [
          {
            entity_id: input.sectionId,
            entity_kind: 'section',
            op: 'remove_entity',
            operation_id: resumeOperationId(input.commandId, 'remove')
          }
        ],
        'reject',
        (document) => !document.sections.some((section) => section.id === input.sectionId)
      )
    },
    async getResumeEditor(workspaceId, resumeId, signal): Promise<UiResumeEditorModel> {
      /** @brief 带强 ETag 的完整协议表示 / Complete protocol representation carrying a strong ETag. */
      const representation = await getWorkspaceResume(client, { resumeId, signal, workspaceId })
      return {
        concurrencyToken: asUiConcurrencyToken(representation.entityTag),
        resume: mapResumeDocument(representation.value)
      }
    },
    async listResumeSummariesPage(request): Promise<UiResumeSummaryPage> {
      /** @brief 当前 ResumeSummary 协议页 / Current protocol page of ResumeSummary values. */
      const page = await listResumePage(client, request.workspaceId, {
        cursor: request.cursor,
        limit: request.limit,
        signal: request.signal
      })
      return mapResumeSummaryPage(page)
    },
    async reorderResumeSections(input): Promise<UiResumeEditorModel> {
      /** @brief 按完整目标顺序从首位开始重建的 move operations / Move operations rebuilding the complete target order from the first position. */
      const operations = input.orderedSectionIds.map((sectionId, index): ResumeOperation => ({
        after_id: input.orderedSectionIds[index - 1] ?? null,
        entity_id: sectionId,
        entity_kind: 'section',
        op: 'move_entity',
        operation_id: resumeOperationId(input.commandId, `move_${index}`),
        parent_id: null
      }))
      return applyResumeCommand(
        operationsClient,
        input,
        input.signal,
        operations,
        'reject',
        (document) =>
          document.sections.length === input.orderedSectionIds.length &&
          document.sections.every((section, index) => section.id === input.orderedSectionIds[index])
      )
    },
    async startResumeRender(input): Promise<UiWorkspaceJobAuthority> {
      /** @brief API v2 接受的 Render Job 权威 / Render Job authority accepted by API v2. */
      const authority = await createWorkspaceResumeRenderJob(jobClient, {
        idempotencyKey: input.commandId,
        request: {
          formats: input.formats,
          mode: input.mode,
          resume_revision: input.resumeRevision
        },
        resumeId: input.resumeId,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        workspaceId: input.workspaceId
      })
      if (
        authority.value.kind !== 'resume.render' ||
        authority.value.workspace_id !== input.workspaceId ||
        authority.value.subject.resource_type !== 'resume' ||
        authority.value.subject.id !== input.resumeId ||
        (authority.value.subject.revision !== undefined &&
          authority.value.subject.revision !== null &&
          authority.value.subject.revision !== input.resumeRevision)
      ) {
        throw new ApiV2WriteOutcomeUnknownError('contract', 202, null, authority.requestId)
      }
      return mapWorkspaceJobAuthority(authority)
    },
    async updateResumeSection(input): Promise<UiResumeEditorModel> {
      /** @brief 字段级意图使用稳定 entity identity，可由服务端仅在安全时 rebase / Field-level intents use stable entity identity and may be rebased only when safe by the service. */
      const operations: ResumeOperation[] = []
      /** @brief 当前命令要求的完整 wire RichText / Complete wire RichText required by the current command. */
      const expectedContent =
        input.content === undefined ? undefined : mapUiResumeRichTextToApiV2(input.content)
      if (input.title !== undefined) {
        operations.push({
          entity_id: input.sectionId,
          field_path: ['title'],
          op: 'set_field',
          operation_id: resumeOperationId(input.commandId, 'title'),
          value: input.title
        })
      }
      if (input.content !== undefined) {
        operations.push({
          entity_id: input.sectionId,
          field_path: ['content'],
          op: 'set_field',
          operation_id: resumeOperationId(input.commandId, 'content'),
          value: encodeUiResumeRichTextValue(input.content)
        })
      }
      return applyResumeCommand(
        operationsClient,
        input,
        input.signal,
        operations,
        'rebase_if_safe',
        (document) => {
          /** @brief 写后权威 section / Authoritative section after the write. */
          const section = document.sections.find((candidate) => candidate.id === input.sectionId)
          return (
            section !== undefined &&
            (input.title === undefined || section.title === input.title) &&
            (expectedContent === undefined ||
              resumeRichTextsEqual(section.content, expectedContent))
          )
        }
      )
    },
    async updateResumeTemplateAndStyle(command, signal): Promise<UiResumeEditorModel> {
      /** @brief 完整目标 wire 样式；同一冻结 command 每次映射结果相同 / Complete target wire style; the same frozen command maps identically on every attempt. */
      const expectedStyle = mapUiResumeStyleIntentToApiV2(command.styleIntent)
      /** @brief set_template 与确定性 style leaf operations / set_template and deterministic style-leaf operations. */
      const operations = createResumeTemplateStyleOperations(
        command.commandId,
        command.resumeId,
        command.targetTemplate,
        expectedStyle
      )
      return applyResumeCommand(
        operationsClient,
        command,
        signal,
        operations,
        'reject',
        (document) =>
          document.template.template_id === command.targetTemplate.templateId &&
          document.template.version === command.targetTemplate.templateVersion &&
          uiJsonValuesEqual(
            document.style as unknown as UiJsonValue,
            expectedStyle as unknown as UiJsonValue
          )
      )
    }
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
