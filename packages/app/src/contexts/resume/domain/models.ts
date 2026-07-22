/** @file Resume Authoring 领域投影 / Resume Authoring domain projections. */

import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiContentLocale } from '../../../shared-kernel/locale'
import type {
  UiJsonValue,
  UiResumeId,
  UiResumeOutputFormat,
  UiResumePageSize,
  UiResumeRichText,
  UiResumeSectionId,
  UiResumeStyleIntent,
  UiTemplateId
} from './document'

/** @brief Resume cursor 的名义类型品牌 / Nominal type brand for Resume cursors. */
declare const resumeCursorBrand: unique symbol

/**
 * @brief 服务端签发的不透明 Resume 分页游标 / Opaque Resume pagination cursor issued by the service.
 * @note 游标不是 offset、ID 或可由客户端解析的值 / A cursor is not an offset, an ID, or a client-decodable value.
 */
export type UiResumeCursor = string & { readonly [resumeCursorBrand]: 'resume-cursor' }

/**
 * @brief 将有界字符串提升为 Resume cursor / Refine a bounded string into a Resume cursor.
 * @param value 服务端返回的不透明游标 / Opaque cursor returned by the service.
 * @return 带 Resume 分页语义的游标 / Cursor carrying Resume pagination semantics.
 * @throws {TypeError} 当 cursor 为空或超过 API v2 上限时抛出 / Thrown when the cursor is empty or exceeds the API v2 limit.
 */
export function asUiResumeCursor(value: string): UiResumeCursor {
  if (value.length < 1 || [...value].length > 2048) {
    throw new TypeError('A Resume cursor must contain between 1 and 2048 characters.')
  }
  return value as UiResumeCursor
}

/** @brief Resume 列表单页最大条目数 / Maximum items in one Resume-list page. */
export const UI_RESUME_PAGE_LIMIT_MAX = 200

/** @brief Resume 页大小的名义类型品牌 / Nominal type brand for Resume page sizes. */
declare const resumePageLimitBrand: unique symbol

/** @brief 经验证的 Resume 列表页大小 / Validated Resume-list page size. */
export type UiResumePageLimit = number & { readonly [resumePageLimitBrand]: 'resume-page-limit' }

/**
 * @brief 构造受 API v2 上限约束的 Resume 页大小 / Construct a Resume page size constrained by the API v2 upper bound.
 * @param value 候选页大小 / Candidate page size.
 * @return 1 至 200 之间的名义页大小 / Nominal page size between 1 and 200.
 * @throws {RangeError} 当值不是合法整数时抛出 / Thrown when the value is not a valid integer.
 */
export function asUiResumePageLimit(value: number): UiResumePageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_RESUME_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `Resume page limit must be an integer from 1 to ${UI_RESUME_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiResumePageLimit
}

/**
 * @brief API v2 ResumeSummary 的产品领域投影 / Product-domain projection of API v2 ResumeSummary.
 * @note 保留 Resource 时间与 revision，避免列表卡片发明契约不存在的模板名 / Resource timestamps and revision are preserved; the card does not invent a template name absent from the contract.
 */
export interface UiResumeSummary {
  /** @brief 简历 ID / Resume ID. */
  readonly id: UiResumeId
  /** @brief 所属 Workspace ID / Owning Workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 内容语言 / Content locale. */
  readonly locale: UiContentLocale
  /** @brief 固定模板 ID / Pinned template ID. */
  readonly templateId: UiTemplateId
  /** @brief 固定的不可变模板版本 / Pinned immutable template version. */
  readonly templateVersion: string
  /** @brief 当前 revision / Current revision. */
  readonly revision: number
  /** @brief 创建时刻 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时刻 / Update timestamp. */
  readonly updatedAt: string
}

/**
 * @brief ResumeSummary 的 cursor 页 / Cursor page of Resume summaries.
 * @note 判别联合封闭 `hasMore` 与 `nextCursor` 的合法关系：有下页必须有 cursor，无下页必须为 null / The discriminated union closes the valid relation: more pages require a cursor; a terminal page requires null.
 */
export type UiResumeSummaryPage =
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeSummary[]
      /** @brief 仍有下一页 / Another page exists. */
      readonly hasMore: true
      /** @brief 下一页不透明游标 / Opaque cursor for the next page. */
      readonly nextCursor: UiResumeCursor
    }
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiResumeSummary[]
      /** @brief 已达末页 / The terminal page has been reached. */
      readonly hasMore: false
      /** @brief 末页不存在下一页游标 / A terminal page has no next cursor. */
      readonly nextCursor: null
    }

/** @brief 读取一页 ResumeSummary 的显式 Workspace 输入 / Explicit Workspace-scoped input for one ResumeSummary page read. */
export interface UiResumeSummaryPageRead {
  /** @brief 授权路径所属 Workspace / Workspace owning the authorization path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 首页为 null，后续页使用上页返回的游标 / Null for the first page; subsequent pages use the prior cursor. */
  readonly cursor: UiResumeCursor | null
  /** @brief 经契约约束的页大小 / Contract-constrained page size. */
  readonly limit: UiResumePageLimit
  /** @brief 资源身份变化时必须传递的取消信号 / Cancellation signal required when the resource identity changes. */
  readonly signal: AbortSignal
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
  readonly value: UiJsonValue
  /** @brief 本地化标签 key / Localized label key. */
  readonly labelKey: string
  /** @brief 可选本地化说明 key / Optional localized description key. */
  readonly descriptionKey: string | null
}

/** @brief 模板设置的条件可见性 / Conditional visibility for a template setting. */
export interface UiTemplateSettingVisibility {
  /** @brief 作为条件来源的设置 key / Setting key used as the condition source. */
  readonly key: string
  /** @brief 显示当前设置所需的精确语义值 / Exact semantic value required for visibility. */
  readonly equals: UiJsonValue
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
  readonly defaultValue: UiJsonValue
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
  /** @brief 可选的条件可见性规则 / Optional conditional-visibility rule. */
  readonly visibleWhen: UiTemplateSettingVisibility | null
}

/** @brief 模板语义区域 / Template semantic zone. */
export interface UiTemplateZone {
  /** @brief 区域 ID / Zone ID. */
  readonly id: string
  /** @brief 本地化标签 key / Localized label key. */
  readonly labelKey: string
  /** @brief 可放入的开放区段类型 code / Accepted open section-kind codes. */
  readonly acceptedSectionKinds: readonly string[]
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
 * @note 内容来源遵循 TemplateManifest 语义，仅包含当前界面实际使用的字段。 / Content follows TemplateManifest semantics and contains only fields used by the current UI.
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
  /** @brief 服务端发布的不可变模板预览 URL / Server-published preview URL for the immutable template. */
  readonly previewUrl: string | null
  /** @brief 支持的资源内容语言 / Supported resource-content locales. */
  readonly supportedLocales: readonly UiContentLocale[]
  /** @brief 支持页面规格 / Supported page sizes. */
  readonly supportedPageSizes: readonly UiResumePageSize[]
  /** @brief 支持的输出格式 / Supported output formats. */
  readonly supportedOutputFormats: readonly UiResumeOutputFormat[]
  /** @brief 支持的开放区段类型 code / Supported open section-kind codes. */
  readonly supportedSectionKinds: readonly string[]
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
  /** @brief 模板版本发布时间 / Template-version publication timestamp. */
  readonly publishedAt: string
}

/** @brief PDF Render artifact 展示模型 / PDF Render artifact display model. */
export interface UiResumePdfArtifact {
  /** @brief 产物下载 URL / Artifact download URL. */
  readonly contentUrl: string
  /** @brief 产物创建时间 / Artifact creation timestamp. */
  readonly createdAt: string
  /** @brief 产物身份 / Artifact identity. */
  readonly id: UiOpaqueId<'resume-pdf-artifact'>
  /** @brief PDF 页数（如果可用） / PDF page count when available. */
  readonly pageCount: number | null
  /** @brief 产物对应的 Resume 身份 / Resume identity represented by the artifact. */
  readonly resumeId: UiResumeId
  /** @brief 产物对应的 Resume revision / Resume revision represented by the artifact. */
  readonly resumeRevision: number
}

/** @brief Resume Render Job 状态 / Resume Render Job status. */
export type UiResumeRenderJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown'

/** @brief Resume Render Job 展示模型 / Resume Render Job display model. */
export interface UiResumeRenderJob {
  readonly id: UiOpaqueId<'resume-render-job'>
  readonly resumeId: UiResumeId
  readonly resumeRevision: number
  readonly status: UiResumeRenderJobStatus
  readonly progressPercent: number | null
  readonly artifacts: readonly UiResumePdfArtifact[]
}

/** @brief 启动 PDF preview Render Job 输入 / Start-PDF-preview input. */
export interface UiStartResumePdfRenderInput {
  /** @brief 一次用户生成意图内保持稳定的命令身份 / Command identity stable within one user render intent. */
  readonly commandId: UiCommandId
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标 Resume / Target Resume. */
  readonly resumeId: UiResumeId
  /** @brief 要渲染的领域 revision / Domain revision to render. */
  readonly resumeRevision: number
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 三类 section command 共享的权威快照 / Authority snapshot shared by the three section commands. */
interface UiResumeSectionMutationInput {
  /** @brief 一次用户意图及其安全重试内保持稳定的命令身份 / Command identity stable across one user intent and its safe retries. */
  readonly commandId: UiCommandId
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 与 baseRevision 同一权威表示的强 If-Match 令牌 / Strong If-Match token from the same authority as baseRevision. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 用户开始编辑时的权威 Resume revision / Authoritative Resume revision when the user began editing. */
  readonly baseRevision: number
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 至少修改标题或正文之一的 section patch / Section patch changing at least title or content. */
type UiResumeSectionTextPatch =
  | {
      /** @brief 用户确实修改的标题 / Title actually changed by the user. */
      readonly title: string
      /** @brief 同一意图中可选的完整富文本正文 / Optional complete rich text in the same intent. */
      readonly content?: UiResumeRichText
    }
  | {
      /** @brief 同一意图中可选的标题 / Optional title in the same intent. */
      readonly title?: string
      /** @brief 用户确实修改的完整富文本正文 / Complete rich text actually changed by the user. */
      readonly content: UiResumeRichText
    }

/** @brief 用户编辑简历板块的领域输入 / Domain input for a user-authored section edit. */
export type UiResumeSectionUpdateInput = UiResumeSectionMutationInput &
  UiResumeSectionTextPatch & {
    /** @brief 目标板块 / Target section. */
    readonly sectionId: UiResumeSectionId
  }

/** @brief 调整简历板块顺序的领域输入 / Domain input for reordering resume sections. */
export interface UiResumeSectionsReorderInput extends UiResumeSectionMutationInput {
  /** @brief 完整且有序的板块 ID / Complete ordered section IDs. */
  readonly orderedSectionIds: readonly UiResumeSectionId[]
}

/** @brief 删除简历板块的领域输入 / Domain input for deleting a resume section. */
export interface UiResumeSectionDeleteInput extends UiResumeSectionMutationInput {
  /** @brief 待删除板块 / Section to delete. */
  readonly sectionId: UiResumeSectionId
}

/** @brief 保存当前固定模板语义样式设置的领域输入 / Domain input for saving semantic style settings of the currently pinned template. */
export interface UiResumeTemplateSettingsUpdateInput {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标简历 / Target resume. */
  readonly resumeId: UiResumeId
  /** @brief 与 baseRevision 同一权威表示的强 If-Match 令牌 / Strong If-Match token from the same authority as baseRevision. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 用户编辑设置时的权威 Resume revision / Authoritative Resume revision when the user edited the settings. */
  readonly baseRevision: number
  /** @brief 当前固定模板；不得借此字段请求迁移 / Currently pinned template; this field must not request migration. */
  readonly templateId: UiTemplateId
  /** @brief 当前固定模板的不可变版本 / Immutable version of the currently pinned template. */
  readonly templateVersion: string
  /** @brief 完整且受模板约束的样式意图 / Complete template-constrained style intent. */
  readonly styleIntent: UiResumeStyleIntent
  /** @brief 可选取消信号 / Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 模板设置页数据模型 / Template-settings page data model. */
export interface UiTemplateSettingsModel {
  /** @brief 目标简历所属的显式 Workspace / Explicit Workspace owning the target Resume. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 目标简历 ID / Target resume ID. */
  readonly resumeId: UiResumeId
  /** @brief 当前设置所绑定的权威 Resume revision / Authoritative Resume revision to which these settings are bound. */
  readonly resumeRevision: number
  /** @brief 与 resumeRevision 原子配对的强 If-Match 令牌 / Strong If-Match token atomically paired with resumeRevision. */
  readonly concurrencyToken: UiConcurrencyToken
  /** @brief 当前选择的模板 / Currently selected template. */
  readonly selectedTemplate: UiTemplateManifest
  /** @brief 可通过显式 set_template operation 选择的不可变模板版本 / Immutable Template versions selectable through an explicit set_template operation. */
  readonly availableTemplates: readonly UiTemplateManifest[]
  /** @brief 语义样式意图 / Semantic style intent. */
  readonly styleIntent: UiResumeStyleIntent
}
