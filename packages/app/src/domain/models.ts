/**
 * @file 共享页面领域投影 / Shared page-domain projections.
 * @remarks
 * 本文件仅定义 v0.1.0 前端展示与交互所需的稳定语义模型（UI projection），
 * 不是 HTTP DTO，也不替代 `contract/` 中的正式契约。
 */

/** @brief 前端支持的界面语言 / UI locales supported by the frontend. */
export const APP_LOCALES = ['zh-SG', 'en-US'] as const

/** @brief 前端支持的界面语言类型 / Type of frontend-supported UI locales. */
export type AppLocale = (typeof APP_LOCALES)[number]

/** @brief 前端默认界面语言 / Default frontend UI locale. */
export const DEFAULT_APP_LOCALE: AppLocale = 'zh-SG'

/**
 * @brief 资源内容语言 / Resource-content locale.
 * @note 对应 contract 的 BCP 47 Locale 语义；它与当前前端可翻译的 AppLocale 有意分离。
 */
export type UiContentLocale = string

/**
 * @brief 带语义品牌的不透明标识符 / Semantically branded opaque identifier.
 * @template TBrand 标识符类别 / Identifier category.
 * @note 此品牌只在前端类型系统中生效，绝不推断后端 ID 的格式或排序。
 */
export type UiOpaqueId<TBrand extends string> = string & {
  readonly __uiOpaqueIdBrand: TBrand
}

/** @brief 工作区标识符 / Workspace identifier. */
export type UiWorkspaceId = UiOpaqueId<'workspace'>

/** @brief 简历标识符 / Resume identifier. */
export type UiResumeId = UiOpaqueId<'resume'>

/** @brief 简历区段标识符 / Resume section identifier. */
export type UiResumeSectionId = UiOpaqueId<'resume-section'>

/** @brief 模板标识符 / Resume template identifier. */
export type UiTemplateId = UiOpaqueId<'template'>

/** @brief 面试场景标识符 / Interview scenario identifier. */
export type UiInterviewScenarioId = UiOpaqueId<'interview-scenario'>

/** @brief 面试会话标识符 / Interview session identifier. */
export type UiInterviewSessionId = UiOpaqueId<'interview-session'>

/** @brief 面试报告标识符 / Interview report identifier. */
export type UiInterviewReportId = UiOpaqueId<'interview-report'>

/** @brief 知识来源标识符 / Knowledge source identifier. */
export type UiKnowledgeSourceId = UiOpaqueId<'knowledge-source'>

/** @brief 知识摄取任务标识符 / Knowledge ingestion Job identifier. */
export type UiKnowledgeIngestionJobId = UiOpaqueId<'knowledge-ingestion-job'>

/** @brief Agent 作用域标识符 / Agent scope identifier. */
export type UiAgentScope =
  | 'resume_assistant'
  | 'job_fit_analyst'
  | 'interview_agent'
  | 'interview_reporter'
  | 'general_chat'
  | 'portfolio_assistant'

/**
 * @brief 将字符串显式标记为 UI 不透明 ID / Explicitly brand a string as a UI opaque ID.
 * @template TBrand 标识符类别 / Identifier category.
 * @param value 不透明字符串值 / Opaque string value.
 * @return 带前端语义品牌的标识符 / Frontend-semantically branded identifier.
 * @note 该函数不校验、解析或生成后端 ID。
 */
export const asUiOpaqueId = <TBrand extends string>(value: string): UiOpaqueId<TBrand> =>
  value as UiOpaqueId<TBrand>

/** @brief 工作区套餐 / Workspace plan. */
export type UiWorkspacePlan = 'free' | 'pro' | 'team' | 'enterprise'

/** @brief 工作区成员角色 / Workspace member role. */
export type UiWorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

/**
 * @brief 工作区展示模型 / Workspace display model.
 * @note 字段源自 Workspace 契约语义，但采用 camelCase 供 UI 使用；不是网络 DTO。
 */
export interface UiWorkspace {
  /** @brief 工作区 ID / Workspace ID. */
  readonly id: UiWorkspaceId
  /** @brief 工作区名称 / Workspace name. */
  readonly name: string
  /** @brief 人类可读 slug / Human-readable slug. */
  readonly slug: string
  /** @brief 当前 UI 用户的角色 / Current UI user's role. */
  readonly role: UiWorkspaceRole
  /** @brief 默认资源语言 / Default resource-content locale. */
  readonly locale: UiContentLocale
  /** @brief 时区 IANA 名称 / IANA timezone name. */
  readonly timezone: string
  /** @brief 产品套餐 / Product plan. */
  readonly plan: UiWorkspacePlan
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 首页活动类别 / Workspace-home activity kind. */
export type UiWorkspaceActivityKind =
  'resume_updated' | 'template_changed' | 'interview_completed' | 'knowledge_indexed'

/**
 * @brief 首页近期活动投影 / Recent activity projection for the home page.
 * @note 这是从资源、Job 与审计事件聚合出的前端模型，并非额外后端资源。
 */
export interface UiWorkspaceActivity {
  /** @brief 活动的稳定 UI 标识符 / Stable UI activity identifier. */
  readonly id: string
  /** @brief 活动类别 / Activity kind. */
  readonly kind: UiWorkspaceActivityKind
  /** @brief 活动标题 / Activity title. */
  readonly title: string
  /** @brief 可选的活动说明 / Optional activity description. */
  readonly description: string
  /** @brief 活动发生时间 / Activity occurrence time. */
  readonly occurredAt: string
}

/**
 * @brief 工作区首页展示模型 / Workspace-home display model.
 * @note 统计数字仅用于当前 v0.1.0 展示，不代表服务端聚合 API 的正式返回体。
 */
export interface UiWorkspaceHomeModel {
  /** @brief 当前工作区 / Current workspace. */
  readonly workspace: UiWorkspace
  /** @brief 简历数量 / Resume count. */
  readonly resumeCount: number
  /** @brief 就绪知识来源数量 / Ready knowledge-source count. */
  readonly readyKnowledgeSourceCount: number
  /** @brief 已完成面试数量 / Completed interview count. */
  readonly completedInterviewCount: number
  /** @brief 近期活动 / Recent activities. */
  readonly recentActivities: readonly UiWorkspaceActivity[]
}

/** @brief 简历区段种类 / Resume section kind. */
export type UiResumeSectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'publications'
  | 'awards'
  | 'certifications'
  | 'languages'
  | 'volunteer'
  | 'custom'

/** @brief 简历条目种类 / Resume item kind. */
export type UiResumeItemKind =
  | 'experience'
  | 'education'
  | 'project'
  | 'skill_group'
  | 'publication'
  | 'award'
  | 'certification'
  | 'language'
  | 'volunteer'
  | 'custom'

/**
 * @brief 简历条目的展示投影 / Display projection of a resume item.
 * @note 它统一了正式 ResumeItem 的多态条目，避免页面层依赖传输层的判别联合。
 */
export interface UiResumeItem {
  /** @brief 条目 ID / Item ID. */
  readonly id: string
  /** @brief 条目种类 / Item kind. */
  readonly kind: UiResumeItemKind
  /** @brief 主标题 / Primary title. */
  readonly title: string
  /** @brief 副标题 / Secondary title. */
  readonly subtitle: string | null
  /** @brief 日期展示文本 / Date display text. */
  readonly dateLabel: string | null
  /** @brief 位置展示文本 / Location display text. */
  readonly locationLabel: string | null
  /** @brief 语义要点 / Semantic bullet points. */
  readonly highlights: readonly string[]
  /** @brief 标签 / Tags. */
  readonly tags: readonly string[]
  /** @brief 是否在简历中显示 / Whether shown in the resume. */
  readonly visible: boolean
}

/**
 * @brief 简历区段展示投影 / Display projection of a resume section.
 * @note contentPreview 对应 SIR 中可选 RichText 的可渲染投影，不含 HTML 或 LaTeX。
 */
export interface UiResumeSection {
  /** @brief 区段 ID / Section ID. */
  readonly id: UiResumeSectionId
  /** @brief 区段类型 / Section kind. */
  readonly kind: UiResumeSectionKind
  /** @brief 区段标题 / Section title. */
  readonly title: string
  /** @brief 是否显示 / Whether visible. */
  readonly visible: boolean
  /** @brief 纯文本内容预览 / Plain-text content preview. */
  readonly contentPreview: string | null
  /** @brief 区段内条目 / Items in the section. */
  readonly items: readonly UiResumeItem[]
}

/** @brief 简历联系信息类别 / Resume contact kind. */
export type UiResumeContactKind =
  'email' | 'phone' | 'website' | 'linkedin' | 'github' | 'portfolio' | 'location' | 'other'

/** @brief 简历联系信息展示模型 / Resume-contact display model. */
export interface UiResumeContact {
  /** @brief 联系方式类别 / Contact kind. */
  readonly kind: UiResumeContactKind
  /** @brief 展示标签 / Display label. */
  readonly label: string
  /** @brief 联系方式值 / Contact value. */
  readonly value: string
}

/** @brief 简历个人资料展示模型 / Resume profile display model. */
export interface UiResumeProfile {
  /** @brief 姓名 / Full name. */
  readonly fullName: string
  /** @brief 职业标题 / Professional headline. */
  readonly headline: string | null
  /** @brief 个人摘要预览 / Summary preview. */
  readonly summary: string | null
  /** @brief 公开联系信息 / Public contacts. */
  readonly contacts: readonly UiResumeContact[]
}

/** @brief 简历页面大小 / Resume page size. */
export type UiResumePageSize = 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM'

/** @brief 简历页面方向 / Resume page orientation. */
export type UiResumePageOrientation = 'portrait' | 'landscape'

/** @brief 测量单位 / Measurement unit. */
export type UiMeasurementUnit = 'pt' | 'mm' | 'cm' | 'in'

/** @brief 语义测量值 / Semantic measurement value. */
export interface UiMeasurement {
  /** @brief 数值 / Numeric value. */
  readonly value: number
  /** @brief 单位 / Unit. */
  readonly unit: UiMeasurementUnit
}

/** @brief 页面边距 / Page edge insets. */
export interface UiPageInsets {
  /** @brief 上边距 / Top inset. */
  readonly top: UiMeasurement
  /** @brief 右边距 / Right inset. */
  readonly right: UiMeasurement
  /** @brief 下边距 / Bottom inset. */
  readonly bottom: UiMeasurement
  /** @brief 左边距 / Left inset. */
  readonly left: UiMeasurement
}

/** @brief 简历页面语义意图 / Resume-page semantic intent. */
export interface UiResumePageIntent {
  /** @brief 页面规格 / Page size. */
  readonly size: UiResumePageSize
  /** @brief 页面方向 / Page orientation. */
  readonly orientation: UiResumePageOrientation
  /** @brief 语义边距 / Semantic margins. */
  readonly margins: UiPageInsets
  /** @brief 最大页数 / Maximum page count. */
  readonly maxPages: number | null
  /** @brief 是否显示页码 / Whether page numbers are shown. */
  readonly showPageNumbers: boolean
}

/** @brief 字体语义意图 / Typography semantic intent. */
export interface UiTypographyIntent {
  /** @brief 模板公开的字体令牌 / Template-exposed font token. */
  readonly fontFamilyToken: string
  /** @brief 基础字号（pt）/ Base font size in points. */
  readonly baseSizePt: number
  /** @brief 行高 / Line height. */
  readonly lineHeight: number
  /** @brief 标题比例 / Heading scale. */
  readonly headingScale: number
  /** @brief 字距（em）/ Letter spacing in em. */
  readonly letterSpacingEm: number
}

/** @brief 颜色空间 / Color space. */
export type UiColorSpace = 'srgb_hex' | 'rgba'

/** @brief 语义颜色值 / Semantic color value. */
export interface UiColorValue {
  /** @brief 颜色空间 / Color space. */
  readonly space: UiColorSpace
  /** @brief 颜色字面值 / Color literal. */
  readonly value: string
}

/** @brief 简历色板语义意图 / Resume-palette semantic intent. */
export interface UiPaletteIntent {
  /** @brief 主色 / Primary color. */
  readonly primary: UiColorValue
  /** @brief 次色 / Secondary color. */
  readonly secondary: UiColorValue
  /** @brief 正文颜色 / Body-text color. */
  readonly text: UiColorValue
  /** @brief 弱化文本颜色 / Muted-text color. */
  readonly mutedText: UiColorValue
  /** @brief 背景颜色 / Background color. */
  readonly background: UiColorValue
}

/** @brief 区段版式语义意图 / Section-layout semantic intent. */
export interface UiSectionLayoutIntent {
  /** @brief 区段 ID / Section ID. */
  readonly sectionId: UiResumeSectionId
  /** @brief 模板定义的语义区域 / Template-defined semantic zone. */
  readonly zone: string
  /** @brief 是否尽量保持在同页 / Whether to keep together. */
  readonly keepTogether: boolean
  /** @brief 是否在前插入分页 / Whether to page break before. */
  readonly pageBreakBefore: boolean
  /** @brief 紧凑度 / Compactness. */
  readonly compactness: number
  /** @brief 可选标题样式令牌 / Optional heading-style token. */
  readonly headingStyleToken: string | null
}

/**
 * @brief 模板设置可表达的语义值 / Semantic values expressible by template settings.
 * @note color 与 measurement 保持结构化，避免将其降级为 CSS 或渲染器私有字符串。
 */
export type UiTemplateSettingValue = boolean | number | string | null | UiColorValue | UiMeasurement

/**
 * @brief 简历样式语义意图 / Resume-style semantic intent.
 * @note 与 ResumeStyleIntent 的语义一致，不携带 CSS、HTML、LaTeX 或字体文件路径。
 */
export interface UiResumeStyleIntent {
  /** @brief 样式契约版本 / Style contract version. */
  readonly styleContractVersion: '1.0'
  /** @brief 页面意图 / Page intent. */
  readonly page: UiResumePageIntent
  /** @brief 字体意图 / Typography intent. */
  readonly typography: UiTypographyIntent
  /** @brief 色板意图 / Palette intent. */
  readonly palette: UiPaletteIntent
  /** @brief 整体密度 / Overall density. */
  readonly density: number
  /** @brief 日期格式令牌 / Date-format token. */
  readonly dateFormatToken: string
  /** @brief 项目符号令牌 / Bullet-style token. */
  readonly bulletStyleToken: string
  /** @brief 区段布局意图 / Section-layout intents. */
  readonly sectionLayout: readonly UiSectionLayoutIntent[]
  /** @brief 受模板约束的设置值 / Template-constrained setting values. */
  readonly templateSettings: Readonly<Record<string, UiTemplateSettingValue>>
}

/** @brief 简历模板引用 / Resume template reference. */
export interface UiTemplateReference {
  /** @brief 模板 ID / Template ID. */
  readonly templateId: UiTemplateId
  /** @brief 不可变模板版本 / Immutable template version. */
  readonly templateVersion: string
}

/**
 * @brief 简历文档展示模型 / Resume-document display model.
 * @note 字段映射自 ResumeDocument 的语义中间表示（SIR），但不是其线上序列化形式。
 */
export interface UiResumeDocument {
  /** @brief 简历 ID / Resume ID. */
  readonly id: UiResumeId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 当前 revision / Current revision. */
  readonly revision: number
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 文档内容语言 / Document-content locale. */
  readonly locale: UiContentLocale
  /** @brief 模板引用 / Template reference. */
  readonly template: UiTemplateReference
  /** @brief 个人资料 / Personal profile. */
  readonly profile: UiResumeProfile
  /** @brief 语义区段 / Semantic sections. */
  readonly sections: readonly UiResumeSection[]
  /** @brief 无渲染器实现细节的版式意图 / Renderer-agnostic style intent. */
  readonly styleIntent: UiResumeStyleIntent
  /** @brief 自动关联的知识来源 ID / Automatically associated knowledge-source ID. */
  readonly knowledgeSourceId: UiKnowledgeSourceId | null
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 简历卡片模型 / Resume card model. */
export interface UiResumeCard {
  /** @brief 简历 ID / Resume ID. */
  readonly id: UiResumeId
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 模板名 / Template name. */
  readonly templateName: string
  /** @brief 当前 revision / Current revision. */
  readonly revision: number
  /** @brief 更新时刻 / Update time. */
  readonly updatedAt: string
}

/** @brief 模板设置控件类型 / Template-setting control type. */
export type UiTemplateSettingControl =
  'switch' | 'slider' | 'number' | 'select' | 'radio' | 'color' | 'measurement' | 'text'

/** @brief 模板设置值类型 / Template-setting value type. */
export type UiTemplateSettingValueType =
  'boolean' | 'integer' | 'number' | 'string' | 'choice' | 'color' | 'measurement'

/** @brief 模板设置选项 / Template-setting choice. */
export interface UiTemplateSettingChoice {
  /** @brief 选项值 / Choice value. */
  readonly value: UiTemplateSettingValue
  /** @brief 本地化标签 key / Localized label key. */
  readonly labelKey: string
  /** @brief 可选本地化说明 key / Optional localized description key. */
  readonly descriptionKey: string | null
}

/** @brief 模板设置定义 / Template-setting definition. */
export interface UiTemplateSettingDefinition {
  /** @brief 设置 key / Setting key. */
  readonly key: string
  /** @brief 本地化标签 key / Localized label key. */
  readonly labelKey: string
  /** @brief 可选本地化说明 key / Optional localized description key. */
  readonly descriptionKey: string | null
  /** @brief 值类型 / Value type. */
  readonly valueType: UiTemplateSettingValueType
  /** @brief 默认值 / Default value. */
  readonly defaultValue: UiTemplateSettingValue
  /** @brief 最小值 / Minimum value. */
  readonly minimum: number | null
  /** @brief 最大值 / Maximum value. */
  readonly maximum: number | null
  /** @brief 可选项 / Choices. */
  readonly choices: readonly UiTemplateSettingChoice[]
  /** @brief UI 控件类型 / UI control type. */
  readonly control: UiTemplateSettingControl
  /** @brief 可选设置组 key / Optional setting-group key. */
  readonly groupKey: string | null
}

/** @brief 模板语义区域 / Template semantic zone. */
export interface UiTemplateZone {
  /** @brief 区域 ID / Zone ID. */
  readonly id: string
  /** @brief 本地化标签 key / Localized label key. */
  readonly labelKey: string
  /** @brief 可放入的区段类型 / Accepted section kinds. */
  readonly acceptedSectionKinds: readonly UiResumeSectionKind[]
  /** @brief 最大区段数 / Maximum section count. */
  readonly maxSections: number | null
}

/** @brief 模板能力 / Template capabilities. */
export interface UiTemplateCapabilities {
  /** @brief 是否支持照片 / Whether photos are supported. */
  readonly supportsPhoto: boolean
  /** @brief 是否支持侧栏 / Whether a sidebar is supported. */
  readonly supportsSidebar: boolean
  /** @brief 是否支持自定义区段 / Whether custom sections are supported. */
  readonly supportsCustomSections: boolean
  /** @brief 是否支持 source map / Whether source maps are supported. */
  readonly supportsSourceMap: boolean
  /** @brief 最大列数 / Maximum column count. */
  readonly maxColumns: number
}

/**
 * @brief 模板展示模型 / Template display model.
 * @note 内容来源遵循 TemplateManifest 语义；previewAssetUrl 为可选展示资源，不是渲染器绑定。
 */
export interface UiTemplateManifest {
  /** @brief 模板 ID / Template ID. */
  readonly id: UiTemplateId
  /** @brief 不可变模板版本 / Immutable template version. */
  readonly version: string
  /** @brief 模板名称 / Template name. */
  readonly name: string
  /** @brief 模板说明 / Template description. */
  readonly description: string | null
  /** @brief 可选预览资源 URL / Optional preview asset URL. */
  readonly previewAssetUrl: string | null
  /** @brief 支持的资源内容语言 / Supported resource-content locales. */
  readonly supportedLocales: readonly UiContentLocale[]
  /** @brief 支持页面规格 / Supported page sizes. */
  readonly supportedPageSizes: readonly UiResumePageSize[]
  /** @brief 支持的区段类型 / Supported section kinds. */
  readonly supportedSectionKinds: readonly UiResumeSectionKind[]
  /** @brief 模板语义区域 / Template semantic zones. */
  readonly zones: readonly UiTemplateZone[]
  /** @brief 可用字体令牌 / Available font tokens. */
  readonly fontFamilyTokens: readonly string[]
  /** @brief 可用日期格式令牌 / Available date-format tokens. */
  readonly dateFormatTokens: readonly string[]
  /** @brief 可用项目符号令牌 / Available bullet-style tokens. */
  readonly bulletStyleTokens: readonly string[]
  /** @brief 设置定义 / Setting definitions. */
  readonly settings: readonly UiTemplateSettingDefinition[]
  /** @brief 模板能力 / Template capabilities. */
  readonly capabilities: UiTemplateCapabilities
}

/** @brief 简历助手消息角色 / Resume-assistant message role. */
export type UiResumeAssistantRole = 'user' | 'assistant'

/**
 * @brief 简历助手消息展示模型 / Resume-assistant message display model.
 * @note 这是 ChatMessage content-part 的扁平展示投影；引用和 proposal 不通过 Markdown 猜测。
 */
export interface UiResumeAssistantMessage {
  /** @brief 消息 ID / Message ID. */
  readonly id: string
  /** @brief 角色 / Role. */
  readonly role: UiResumeAssistantRole
  /** @brief 展示文本 / Display text. */
  readonly text: string
  /** @brief 发送时刻 / Creation time. */
  readonly createdAt: string
  /** @brief 是否为流式生成中的临时消息 / Whether the message is streaming. */
  readonly isStreaming: boolean
}

/** @brief 简历预览状态 / Resume-preview state. */
export type UiResumePreviewState = 'ready' | 'rendering' | 'failed'

/**
 * @brief 简历预览展示模型 / Resume-preview display model.
 * @note v0.1.0 使用语义占位预览；真实 PDF artifact/source map 的连接仍待后端确认。
 */
export interface UiResumePreviewModel {
  /** @brief 预览状态 / Preview state. */
  readonly state: UiResumePreviewState
  /** @brief 预览页数 / Preview page count. */
  readonly pageCount: number
  /** @brief 最近成功渲染时间 / Last successful render time. */
  readonly renderedAt: string | null
  /** @brief 可选的用户可见诊断 / Optional user-visible diagnostic. */
  readonly diagnostic: string | null
}

/** @brief PDF Render artifact 展示模型 / PDF Render artifact display model. */
export interface UiResumePdfArtifact {
  readonly id: UiOpaqueId<'resume-pdf-artifact'>
  readonly resumeId: UiResumeId
  readonly resumeRevision: number
  readonly contentUrl: string
  readonly pageCount: number | null
  readonly createdAt: string
}

/** @brief Resume Render Job 状态 / Resume Render Job status. */
export type UiResumeRenderJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'

/** @brief Resume Render Job 展示模型 / Resume Render Job display model. */
export interface UiResumeRenderJob {
  readonly id: UiOpaqueId<'resume-render-job'>
  readonly resumeId: UiResumeId
  readonly resumeRevision: number
  readonly status: UiResumeRenderJobStatus
  readonly progressPercent: number | null
  readonly artifacts: readonly UiResumePdfArtifact[]
  readonly diagnostic: string | null
}

/** @brief 启动 PDF preview Render Job 输入 / Start-PDF-preview input. */
export interface UiStartResumePdfRenderInput {
  readonly resumeId: UiResumeId
  readonly resumeRevision: number
  readonly signal?: AbortSignal
}

/** @brief 简历编辑器整页数据模型 / Resume-editor page data model. */
export interface UiResumeEditorModel {
  /** @brief 简历文档 / Resume document. */
  readonly resume: UiResumeDocument
  /** @brief 预览投影 / Preview projection. */
  readonly preview: UiResumePreviewModel
  /** @brief 助手对话 / Assistant conversation. */
  readonly assistantMessages: readonly UiResumeAssistantMessage[]
}

/** @brief 简历助手变更标识 / Resume-assistant change identifier. */
export type UiResumeAssistantChangeId = UiOpaqueId<'resume-assistant-change'>

/** @brief Resume Proposal 标识 / Resume Proposal identifier. */
export type UiResumeProposalId = UiOpaqueId<'resume-proposal'>

/** @brief Resume Proposal 状态 / Resume Proposal status. */
export type UiResumeProposalStatus =
  'pending' | 'accepted' | 'partially_accepted' | 'rejected' | 'expired' | 'conflicted'

/** @brief 待用户审批的结构化简历建议 / Structured Resume suggestion awaiting user approval. */
export interface UiResumeProposal {
  readonly id: UiResumeProposalId
  readonly resumeId: UiResumeId
  readonly baseRevision: number
  readonly title: string
  readonly summary: string | null
  readonly changes: readonly string[]
  readonly status: UiResumeProposalStatus
  readonly createdAt: string
}

/** @brief Proposal 接受或拒绝输入 / Proposal accept-or-reject input. */
export interface UiResumeProposalDecisionInput {
  readonly proposalId: UiResumeProposalId
  readonly decision: 'accept' | 'reject'
  readonly signal?: AbortSignal
}

/** @brief 向简历助手发送自然语言的领域输入 / Domain input for a resume-assistant message. */
export interface UiResumeAssistantMessageInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 用户自然语言 / User-authored natural language. */
  readonly message: string
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 简历助手一次响应的领域结果 / Domain result of one resume-assistant turn. */
export interface UiResumeAssistantTurnResult {
  /** @brief 最新编辑器投影 / Latest editor projection. */
  readonly editor: UiResumeEditorModel
  /** @brief 本次助手消息 / Assistant message for this turn. */
  readonly assistantMessage: UiResumeAssistantMessage
  /** @brief 可撤销变更标识；未修改简历时为空 / Undoable change ID, or null without a change. */
  readonly changeId: UiResumeAssistantChangeId | null
  /** @brief 当前结果是否可撤销 / Whether this result can currently be undone. */
  readonly canUndo: boolean
}

/** @brief 撤销简历助手变更的领域输入 / Domain input for undoing an assistant change. */
export interface UiResumeAssistantUndoInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 待撤销变更 / Change to undo. */
  readonly changeId: UiResumeAssistantChangeId
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 撤销简历助手变更的领域结果 / Domain result of undoing an assistant change. */
export interface UiResumeAssistantUndoResult {
  /** @brief 撤销后的编辑器投影 / Editor projection after undo. */
  readonly editor: UiResumeEditorModel
  /** @brief 撤销后是否仍可继续单步撤销 / Whether another single-step undo remains. */
  readonly canUndo: boolean
}

/** @brief 用户编辑简历板块的领域输入 / Domain input for a user-authored section edit. */
export interface UiResumeSectionUpdateInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 目标板块 / Target section. */
  readonly sectionId: UiResumeSectionId
  /** @brief 板块标题 / Section title. */
  readonly title: string
  /** @brief 纯文本正文 / Plain-text body. */
  readonly content: string
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 调整简历板块顺序的领域输入 / Domain input for reordering resume sections. */
export interface UiResumeSectionsReorderInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 完整且有序的板块 ID / Complete ordered section IDs. */
  readonly orderedSectionIds: readonly UiResumeSectionId[]
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 删除简历板块的领域输入 / Domain input for deleting a resume section. */
export interface UiResumeSectionDeleteInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 待删除板块 / Section to delete. */
  readonly sectionId: UiResumeSectionId
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 快速切换简历模板的领域输入 / Domain input for quick template selection. */
export interface UiResumeTemplateSelectionInput {
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 目标模板 / Target template. */
  readonly templateId: UiTemplateId
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 模板设置页数据模型 / Template-settings page data model. */
export interface UiTemplateSettingsModel {
  /** @brief 目标简历 ID / Target resume ID. */
  readonly resumeId: UiResumeId
  /** @brief 当前选择的模板 / Currently selected template. */
  readonly selectedTemplate: UiTemplateManifest
  /** @brief 可供迁移选择的模板 / Templates available for explicit migration. */
  readonly availableTemplates: readonly UiTemplateManifest[]
  /** @brief 语义样式意图 / Semantic style intent. */
  readonly styleIntent: UiResumeStyleIntent
}

/** @brief 面试类型 / Interview type. */
export type UiInterviewType =
  'behavioral' | 'technical' | 'system_design' | 'coding' | 'case' | 'hr' | 'mixed'

/** @brief 面试难度 / Interview difficulty. */
export type UiInterviewDifficulty = 'introductory' | 'standard' | 'advanced' | 'expert'

/** @brief 数字人输出模式 / Avatar output mode. */
export type UiAvatarOutputMode = 'server_video' | 'client_render' | 'audio_only'

/** @brief 面试会话状态 / Interview session status. */
export type UiInterviewSessionStatus =
  | 'created'
  | 'preparing'
  | 'ready'
  | 'connecting'
  | 'in_progress'
  | 'ending'
  | 'processing_report'
  | 'completed'
  | 'aborted'
  | 'failed'
  | 'expired'

/** @brief 面试评分维度 / Interview rubric dimension. */
export interface UiInterviewRubricDimension {
  /** @brief 维度 ID / Dimension ID. */
  readonly id: string
  /** @brief 维度名称 / Dimension name. */
  readonly name: string
  /** @brief 权重 / Weight. */
  readonly weight: number
  /** @brief 可观察指标 / Observable indicators. */
  readonly observableIndicators: readonly string[]
}

/** @brief 面试评分量表 / Interview evaluation rubric. */
export interface UiInterviewRubric {
  /** @brief 量表 ID / Rubric ID. */
  readonly id: string
  /** @brief 不可变版本 / Immutable version. */
  readonly version: string
  /** @brief 名称 / Name. */
  readonly name: string
  /** @brief 评分维度 / Dimensions. */
  readonly dimensions: readonly UiInterviewRubricDimension[]
  /** @brief 最低总分 / Overall minimum score. */
  readonly minimumScore: number
  /** @brief 最高总分 / Overall maximum score. */
  readonly maximumScore: number
}

/** @brief 面试场景展示模型 / Interview-scenario display model. */
export interface UiInterviewScenario {
  /** @brief 场景 ID / Scenario ID. */
  readonly id: UiInterviewScenarioId
  /** @brief 名称 / Name. */
  readonly name: string
  /** @brief 面试类型 / Interview type. */
  readonly interviewType: UiInterviewType
  /** @brief 难度 / Difficulty. */
  readonly difficulty: UiInterviewDifficulty
  /** @brief 时长（分钟）/ Duration in minutes. */
  readonly durationMinutes: number
  /** @brief 目标问题数 / Target question count. */
  readonly targetQuestionCount: number
  /** @brief 关注领域 / Focus areas. */
  readonly focusAreas: readonly string[]
  /** @brief 是否允许追问 / Whether follow-ups are allowed. */
  readonly allowFollowups: boolean
  /** @brief 是否允许打断 / Whether barge-in is allowed. */
  readonly allowBargeIn: boolean
  /** @brief 评估量表 / Evaluation rubric. */
  readonly rubric: UiInterviewRubric
}

/** @brief 职位目标展示模型 / Job-target display model. */
export interface UiJobTarget {
  /** @brief 职位名称 / Job title. */
  readonly title: string
  /** @brief 公司名称 / Company name. */
  readonly company: string | null
  /** @brief 工作地点 / Location. */
  readonly location: string | null
  /** @brief 级别 / Seniority. */
  readonly seniority: string | null
  /** @brief 目标技能 / Target skills. */
  readonly skills: readonly string[]
}

/** @brief 面试媒体偏好展示模型 / Interview-media preference display model. */
export interface UiInterviewMediaPreferences {
  /** @brief 是否采集用户音频 / Whether user audio is captured. */
  readonly userAudio: boolean
  /** @brief 是否采集用户视频 / Whether user video is captured. */
  readonly userVideo: boolean
  /** @brief 数字人输出模式 / Avatar output mode. */
  readonly avatarOutputMode: UiAvatarOutputMode
  /** @brief 媒体传输降级模式 / Fallback transport mode. */
  readonly fallbackTransport: 'websocket_binary' | 'audio_only' | 'none'
}

/** @brief 面试会话展示模型 / Interview-session display model. */
export interface UiInterviewSession {
  /** @brief 会话 ID / Session ID. */
  readonly id: UiInterviewSessionId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 面试场景 ID / Interview scenario ID. */
  readonly scenarioId: UiInterviewScenarioId | null
  /** @brief 会话状态 / Session status. */
  readonly status: UiInterviewSessionStatus
  /** @brief 目标职位 / Job target. */
  readonly jobTarget: UiJobTarget
  /** @brief 面试内容语言 / Interview-content locale. */
  readonly locale: UiContentLocale
  /** @brief 媒体偏好 / Media preferences. */
  readonly media: UiInterviewMediaPreferences
  /** @brief 开始时间 / Start time. */
  readonly startedAt: string | null
  /** @brief 结束时间 / End time. */
  readonly endedAt: string | null
  /** @brief 报告 ID / Report ID. */
  readonly reportId: UiInterviewReportId | null
}

/** @brief 转录说话人 / Transcript speaker. */
export type UiTranscriptSpeaker = 'candidate' | 'interviewer'

/** @brief 实时转录展示模型 / Realtime-transcript display model. */
export interface UiTranscriptEntry {
  /** @brief 转录片段 ID / Transcript-segment ID. */
  readonly id: string
  /** @brief 说话人 / Speaker. */
  readonly speaker: UiTranscriptSpeaker
  /** @brief 文本 / Text. */
  readonly text: string
  /** @brief 是否是最终转录 / Whether final. */
  readonly isFinal: boolean
  /** @brief 起始毫秒 / Start time in milliseconds. */
  readonly startMs: number
  /** @brief 结束毫秒 / End time in milliseconds. */
  readonly endMs: number
}

/**
 * @brief 模拟面试页面模型 / Mock-interview page model.
 * @note connectionState 仅为媒体 UI 状态，真实 RealtimeConnectionDescriptor 尚未接入。
 */
export interface UiLiveInterviewModel {
  /** @brief 会话 / Session. */
  readonly session: UiInterviewSession
  /** @brief 场景 / Scenario. */
  readonly scenario: UiInterviewScenario
  /** @brief 媒体连接状态 / Media connection state. */
  readonly connectionState: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  /** @brief 当前面试官文本 / Current interviewer text. */
  readonly interviewerText: string
  /** @brief 实时字幕 / Realtime transcript. */
  readonly transcript: readonly UiTranscriptEntry[]
}

/** @brief 已完成面试的历史列表投影 / Completed-interview history projection. */
export interface UiInterviewHistoryItem {
  /** @brief 面试会话 / Interview session. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 目标岗位 / Target job. */
  readonly jobTarget: UiJobTarget
  /** @brief 面试类型 / Interview type. */
  readonly interviewType: UiInterviewType
  /** @brief 面试难度 / Interview difficulty. */
  readonly difficulty: UiInterviewDifficulty
  /** @brief 完成时间 / Completion time. */
  readonly completedAt: string
  /** @brief 实际时长（分钟）/ Actual duration in minutes. */
  readonly durationMinutes: number
  /** @brief 总评分；未形成权威分数时为空 / Overall score, or null without an authoritative score. */
  readonly overallScore: number | null
}

/** @brief 新面试配置页投影 / New-interview setup projection. */
export interface UiInterviewSetupModel {
  /** @brief 可用场景 / Available scenarios. */
  readonly scenarios: readonly UiInterviewScenario[]
  /** @brief 已保存岗位目标 / Saved job targets. */
  readonly jobTargets: readonly UiJobTarget[]
}

/** @brief 创建面试的领域输入 / Domain input for creating an interview. */
export interface UiCreateInterviewInput {
  readonly workspaceId: UiWorkspaceId
  readonly jobTarget: UiJobTarget
  readonly interviewType: UiInterviewType
  readonly difficulty: UiInterviewDifficulty
  readonly durationMinutes: number
  readonly knowledgeSourceIds: readonly UiKnowledgeSourceId[]
  readonly focusPrompt: string | null
  readonly signal?: AbortSignal
}

/** @brief 创建面试的领域结果 / Domain result for creating an interview. */
export interface UiCreateInterviewResult {
  readonly sessionId: UiInterviewSessionId
}

/** @brief 正式面试页面阶段 / Live interview page phase. */
export type UiInterviewRuntimePhase =
  | 'interviewer_streaming'
  | 'listening'
  | 'submitting_answer'
  | 'thinking'
  | 'completion_ready'
  | 'connection_failed'

/** @brief 正式面试运行投影 / Live interview runtime projection. */
export interface UiInterviewRuntimeModel {
  readonly session: UiInterviewSession
  readonly scenario: UiInterviewScenario
  readonly phase: UiInterviewRuntimePhase
  readonly transcript: readonly UiTranscriptEntry[]
  readonly currentTranscript: string
  readonly elapsedSeconds: number
  readonly estimatedDurationMinutes: number
  readonly isMock: boolean
}

/** @brief 面试证据引用 / Interview evidence reference. */
export interface UiInterviewEvidence {
  /** @brief 转录片段 ID / Transcript-segment ID. */
  readonly segmentId: string
  /** @brief 起始毫秒 / Start time in milliseconds. */
  readonly startMs: number
  /** @brief 结束毫秒 / End time in milliseconds. */
  readonly endMs: number
  /** @brief 可选引文 / Optional quote. */
  readonly quote: string | null
}

/** @brief 面试评分结果 / Interview rubric-score result. */
export interface UiInterviewRubricScore {
  /** @brief 维度 ID / Dimension ID. */
  readonly dimensionId: string
  /** @brief 得分 / Score. */
  readonly score: number
  /** @brief 置信度 / Confidence. */
  readonly confidence: number
  /** @brief 摘要 / Summary. */
  readonly summary: string
  /** @brief 证据 / Evidence. */
  readonly evidence: readonly UiInterviewEvidence[]
  /** @brief 改进行动 / Improvement actions. */
  readonly improvementActions: readonly string[]
}

/** @brief 面试行动计划优先级 / Interview action-plan priority. */
export type UiActionPlanPriority = 'high' | 'medium' | 'low'

/** @brief 面试行动计划项 / Interview action-plan item. */
export interface UiInterviewActionPlanItem {
  /** @brief 优先级 / Priority. */
  readonly priority: UiActionPlanPriority
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 原因 / Why it matters. */
  readonly why: string
  /** @brief 练习方法 / Practice method. */
  readonly practice: string
  /** @brief 成功标准 / Success criterion. */
  readonly successCriterion: string
}

/** @brief 可观察沟通指标 / Observable communication metrics. */
export interface UiCommunicationMetrics {
  /** @brief 发言时长（毫秒）/ Speaking time in milliseconds. */
  readonly speakingTimeMs: number | null
  /** @brief 平均回答时长（毫秒）/ Average answer length in milliseconds. */
  readonly averageAnswerLengthMs: number | null
  /** @brief 每分钟词数 / Words per minute. */
  readonly wordsPerMinute: number | null
  /** @brief 填充词计数 / Filler-word count. */
  readonly fillerWordCount: number | null
  /** @brief 长停顿次数 / Long-pause count. */
  readonly longPauseCount: number | null
  /** @brief 打断次数 / Interruption count. */
  readonly interruptionCount: number | null
  /** @brief 仅基于可观察行为的备注 / Notes based only on observable behavior. */
  readonly notes: readonly string[]
}

/**
 * @brief 面试总结展示模型 / Interview-summary display model.
 * @note 严格限制为量表、转录证据与可观察沟通行为；不含受保护属性或人格推断。
 */
export interface UiInterviewReport {
  /** @brief 报告 ID / Report ID. */
  readonly id: UiInterviewReportId
  /** @brief 会话 ID / Session ID. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 报告版本 / Report version. */
  readonly reportVersion: string
  /** @brief 总分 / Overall score. */
  readonly overallScore: number | null
  /** @brief 总体置信度 / Overall confidence. */
  readonly overallConfidence: number
  /** @brief 执行摘要 / Executive summary. */
  readonly executiveSummary: string
  /** @brief 优势 / Strengths. */
  readonly strengths: readonly string[]
  /** @brief 改进方向 / Improvements. */
  readonly improvements: readonly string[]
  /** @brief 量表结果 / Rubric scores. */
  readonly rubricScores: readonly UiInterviewRubricScore[]
  /** @brief 可观察沟通指标 / Observable communication metrics. */
  readonly communicationMetrics: UiCommunicationMetrics
  /** @brief 行动计划 / Action plan. */
  readonly actionPlan: readonly UiInterviewActionPlanItem[]
  /** @brief 局限与低置信度声明 / Limitations and low-confidence statements. */
  readonly limitations: readonly string[]
  /** @brief 报告生成时间 / Report creation time. */
  readonly createdAt: string
}

/** @brief 知识来源类型 / Knowledge-source type. */
export type UiKnowledgeSourceType =
  | 'resume'
  | 'file'
  | 'url'
  | 'website'
  | 'blog_feed'
  | 'git_repository'
  | 'manual_note'
  | 'cloud_drive'

/** @brief 知识摄取状态 / Knowledge-ingestion status. */
export type UiKnowledgeIngestionStatus =
  | 'not_started'
  | 'queued'
  | 'fetching'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'stale'
  | 'failed'
  | 'deleted'

/** @brief 可见性策略效果 / Visibility-policy effect. */
export type UiVisibilityEffect = 'allow' | 'deny'

/** @brief 知识可见性敏感度 / Knowledge-visibility sensitivity. */
export type UiKnowledgeSensitivity = 'normal' | 'confidential' | 'highly_confidential'

/** @brief Agent 允许的知识操作 / Knowledge operations permitted to an agent. */
export type UiKnowledgeOperation = 'retrieve' | 'quote' | 'summarize' | 'derive' | 'write_back'

/** @brief Agent 作用域授权 / Agent-scope grant. */
export interface UiAgentScopeGrant {
  /** @brief Agent 作用域 / Agent scope. */
  readonly agentScope: UiAgentScope
  /** @brief 允许或拒绝 / Allow or deny effect. */
  readonly effect: UiVisibilityEffect
  /** @brief 获准操作 / Granted operations. */
  readonly allowedOperations: readonly UiKnowledgeOperation[]
}

/**
 * @brief 知识可见性策略展示模型 / Knowledge-visibility policy display model.
 * @note 语义遵从 KnowledgeVisibilityPolicy；默认拒绝仍由后端做最终 EffectiveAccess 判定。
 */
export interface UiKnowledgeVisibilityPolicy {
  /** @brief 策略版本 / Policy version. */
  readonly policyVersion: number
  /** @brief 默认效果 / Default effect. */
  readonly defaultEffect: UiVisibilityEffect
  /** @brief 敏感度 / Sensitivity. */
  readonly sensitivity: UiKnowledgeSensitivity
  /** @brief 按 Agent 作用域授权 / Grants by agent scope. */
  readonly agentGrants: readonly UiAgentScopeGrant[]
  /** @brief 是否允许会话级覆盖 / Whether session overrides are allowed. */
  readonly sessionOverrideAllowed: boolean
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allowExternalModelProcessing: boolean
  /** @brief 被允许的模型数据区域 / Allowed model-data regions. */
  readonly allowedModelRegions: readonly ('cn' | 'global' | 'private_deployment')[]
  /** @brief 保留期限（天）/ Retention period in days. */
  readonly retentionDays: number | null
}

/** @brief 知识来源展示模型 / Knowledge-source display model. */
export interface UiKnowledgeSource {
  /** @brief 来源 ID / Source ID. */
  readonly id: UiKnowledgeSourceId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 来源名称 / Source name. */
  readonly name: string
  /** @brief 来源类型 / Source type. */
  readonly sourceType: UiKnowledgeSourceType
  /** @brief 可展示的来源出处 / Displayable source origin. */
  readonly originLabel: string
  /** @brief 摄取状态 / Ingestion status. */
  readonly ingestionStatus: UiKnowledgeIngestionStatus
  /** @brief 文档数 / Document count. */
  readonly documentCount: number
  /** @brief chunk 数 / Chunk count. */
  readonly chunkCount: number
  /** @brief 是否启用 / Whether enabled. */
  readonly enabled: boolean
  /** @brief 可见性策略 / Visibility policy. */
  readonly visibility: UiKnowledgeVisibilityPolicy
  /** @brief 最近成功索引时间 / Last successful indexing time. */
  readonly lastSuccessAt: string | null
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 上传新知识文件的领域输入 / Domain input for uploading a new knowledge file. */
export interface UiKnowledgeUploadInput {
  readonly file: File
  readonly name?: string | undefined
  readonly signal?: AbortSignal | undefined
}

/** @brief 为已有来源上传新版本的领域输入 / Domain input for uploading a new source version. */
export interface UiKnowledgeVersionUploadInput {
  readonly sourceId: UiKnowledgeSourceId
  readonly file: File
  readonly signal?: AbortSignal | undefined
}

/** @brief 知识摄取任务状态 / Knowledge ingestion Job status. */
export type UiKnowledgeJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'

/** @brief 知识摄取任务展示模型 / Knowledge ingestion Job display model. */
export interface UiKnowledgeIngestionJob {
  readonly id: UiKnowledgeIngestionJobId
  readonly sourceId: UiKnowledgeSourceId
  readonly status: UiKnowledgeJobStatus
  readonly progressPercent: number | null
  readonly errorCode: string | null
  readonly errorDetail: string | null
}

/** @brief 文件上传被接受后的领域结果 / Domain result after a file upload is accepted. */
export interface UiKnowledgeUploadResult {
  readonly source: UiKnowledgeSource
  readonly ingestionJob: UiKnowledgeIngestionJob
}

/** @brief 知识搜索领域输入 / Knowledge search domain input. */
export interface UiKnowledgeSearchInput {
  readonly query: string
  readonly sourceIds: readonly UiKnowledgeSourceId[]
  readonly signal?: AbortSignal | undefined
}

/** @brief 知识搜索结果展示模型 / Knowledge search result display model. */
export interface UiKnowledgeSearchResult {
  readonly id: string
  readonly sourceId: UiKnowledgeSourceId
  readonly title: string
  readonly locatorLabel: string
  readonly quote: string | null
  readonly score: number
}

/** @brief 知识可见性页面模型 / Knowledge-visibility page model. */
export interface UiKnowledgeVisibilityModel {
  /** @brief 目标知识来源 / Target knowledge source. */
  readonly source: UiKnowledgeSource
  /** @brief 可配置的 Agent 作用域 / Configurable agent scopes. */
  readonly availableAgentScopes: readonly UiAgentScope[]
}
