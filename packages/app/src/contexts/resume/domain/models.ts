/** @file Resume Authoring 领域投影 / Resume Authoring domain projections. */

import type {
  UiKnowledgeSourceId,
  UiOpaqueId,
  UiWorkspaceId
} from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief 简历标识符 / Resume identifier. */
export type UiResumeId = UiOpaqueId<'resume'>

/** @brief 简历区段标识符 / Resume section identifier. */
export type UiResumeSectionId = UiOpaqueId<'resume-section'>

/** @brief 模板标识符 / Resume template identifier. */
export type UiTemplateId = UiOpaqueId<'template'>

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
