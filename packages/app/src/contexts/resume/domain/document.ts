/** @file Resume 权威语义中间表示 / Authoritative Resume semantic intermediate representation. */

import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type {
  UiKnowledgeSourceId,
  UiOpaqueId,
  UiWorkspaceId
} from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief 可无损保留的 JSON 对象 / JSON object preserved losslessly. */
export interface UiJsonObject {
  /** @brief 任意 JSON 成员 / Arbitrary JSON member. */
  readonly [key: string]: UiJsonValue
}

/** @brief 可无损保留的 JSON 值 / JSON value preserved losslessly. */
export type UiJsonValue = boolean | number | string | null | readonly UiJsonValue[] | UiJsonObject

/** @brief 简历标识符 / Resume identifier. */
export type UiResumeId = UiOpaqueId<'resume'>

/** @brief 简历区段标识符 / Resume section identifier. */
export type UiResumeSectionId = UiOpaqueId<'resume-section'>

/** @brief 简历条目标识符 / Resume item identifier. */
export type UiResumeItemId = UiOpaqueId<'resume-item'>

/** @brief 简历联系方式标识符 / Resume contact-method identifier. */
export type UiResumeContactId = UiOpaqueId<'resume-contact'>

/** @brief 模板标识符 / Resume template identifier. */
export type UiTemplateId = UiOpaqueId<'template'>

/** @brief 已验证 partial calendar date 的名义类型品牌 / Nominal type brand for a validated partial calendar date. */
declare const resumePartialDateBrand: unique symbol

/**
 * @brief 保留原始精度的真实 partial calendar date / Real partial calendar date preserving its original precision.
 * @note 合法形态严格封闭为 YYYY、YYYY-MM 或 YYYY-MM-DD / Valid forms are closed to YYYY, YYYY-MM, or YYYY-MM-DD.
 */
export type UiResumePartialDate = string & {
  readonly [resumePartialDateBrand]: 'resume-partial-date'
}

/** @brief partial calendar date 的语法结构 / Syntactic structure of a partial calendar date. */
const RESUME_PARTIAL_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

/**
 * @brief 计算公历月份天数 / Calculate the number of days in a Gregorian month.
 * @param year 年 / Year.
 * @param month 月 / Month.
 * @return 当月天数 / Number of days in the month.
 */
function daysInResumeMonth(year: number, month: number): number {
  /** @brief 是否闰年 / Whether the year is a leap year. */
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

/**
 * @brief 将字符串收紧为真实 partial calendar date / Refine a string into a real partial calendar date.
 * @param value 候选日期 / Candidate date.
 * @return 保留输入精度的品牌日期 / Branded date preserving the input precision.
 * @throws {TypeError} 当值不符合协议日期语义时抛出 / Thrown when the value violates protocol date semantics.
 */
export function asUiResumePartialDate(value: string): UiResumePartialDate {
  /** @brief partial date 分组 / Partial-date groups. */
  const match = RESUME_PARTIAL_DATE_PATTERN.exec(value)
  if (match === null) {
    throw new TypeError('A Resume partial date must use YYYY, YYYY-MM, or YYYY-MM-DD.')
  }
  /** @brief 年 / Year. */
  const year = Number(match[1])
  /** @brief 可选月 / Optional month. */
  const month = match[2] === undefined ? null : Number(match[2])
  /** @brief 可选日 / Optional day. */
  const day = match[3] === undefined ? null : Number(match[3])
  if (
    year < 1 ||
    (month !== null && (month < 1 || month > 12)) ||
    (day !== null && month !== null && (day < 1 || day > daysInResumeMonth(year, month)))
  ) {
    throw new TypeError('A Resume partial date must describe a real calendar date.')
  }
  return value as UiResumePartialDate
}

/** @brief API v2 Resume 区段的封闭种类 / Closed API v2 Resume-section kinds. */
export type UiResumeSectionKind =
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

/** @brief API v2 Resume 条目的封闭种类 / Closed API v2 Resume-item kinds. */
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

/** @brief Resume 日期范围，保留原始 partial-date 精度 / Resume date range preserving original partial-date precision. */
export interface UiResumeDateRange {
  /** @brief 可选起始 partial date / Optional start partial date. */
  readonly start: UiResumePartialDate | null
  /** @brief 可选结束 partial date 或 present / Optional end partial date or present. */
  readonly end: UiResumePartialDate | 'present' | null
}

/** @brief Resume 富文本标记种类 / Resume rich-text mark kind. */
export type UiResumeTextMarkKind = 'strong' | 'emphasis' | 'link'

/** @brief 富文本标记的 Unicode code-point 区间 / Unicode code-point range of a rich-text mark. */
interface UiResumeTextMarkRange {
  /** @brief 起始 offset / Start offset. */
  readonly start: number
  /** @brief 结束 offset / End offset. */
  readonly end: number
}

/** @brief 携带安全链接的 link mark / Link mark carrying a safe URL. */
export interface UiResumeLinkTextMark extends UiResumeTextMarkRange {
  /** @brief link 判别值 / Link discriminator. */
  readonly kind: 'link'
  /** @brief 已由协议层验证的安全链接 / Safe link validated by the protocol layer. */
  readonly href: string
}

/** @brief 不携带非空 href 的样式 mark / Styling mark carrying no non-null href. */
export interface UiResumeStyleTextMark extends UiResumeTextMarkRange {
  /** @brief 非 link 样式种类 / Non-link styling kind. */
  readonly kind: Exclude<UiResumeTextMarkKind, 'link'>
  /** @brief wire 省略或显式 null 的 href / href omitted or explicitly null on the wire. */
  readonly href?: null
}

/** @brief 由 kind 封闭 href 不变量的富文本 mark / Rich-text mark whose href invariant is closed by kind. */
export type UiResumeTextMark = UiResumeLinkTextMark | UiResumeStyleTextMark

/** @brief Resume section title 的 Unicode code-point 上限 / Unicode code-point limit for a Resume section title. */
export const UI_RESUME_SECTION_TITLE_MAX_LENGTH = 120

/** @brief Resume RichText.text 的 Unicode code-point 上限 / Unicode code-point limit for Resume RichText.text. */
export const UI_RESUME_RICH_TEXT_MAX_LENGTH = 20_000

/** @brief 可编辑 Resume section 文本字段 / Editable Resume section text fields. */
export type UiResumeSectionTextField = 'content' | 'title'

/** @brief Resume section 本地文本边界违反 / Local text-boundary violation for a Resume section. */
export type UiResumeSectionTextViolation = 'content-too-long' | 'title-required' | 'title-too-long'

/**
 * @brief 按 JSON Schema code-point 语义检查 section 可编辑文本 / Check editable section text using JSON Schema code-point semantics.
 * @param field 目标语义字段 / Target semantic field.
 * @param value 用户草稿文本 / User draft text.
 * @return 边界违反，或 null / Boundary violation, or null.
 * @note 不使用 HTML maxLength，因为其按 UTF-16 code units 计数会误拒 emoji。 / HTML maxLength is not used because its UTF-16 code-unit counting can reject emoji incorrectly.
 */
export function getUiResumeSectionTextViolation(
  field: UiResumeSectionTextField,
  value: string
): UiResumeSectionTextViolation | null {
  /** @brief JSON Schema 使用的 Unicode code-point 长度 / Unicode code-point length used by JSON Schema. */
  const length = [...value].length
  if (field === 'title') {
    if (length === 0) return 'title-required'
    return length > UI_RESUME_SECTION_TITLE_MAX_LENGTH ? 'title-too-long' : null
  }
  return length > UI_RESUME_RICH_TEXT_MAX_LENGTH ? 'content-too-long' : null
}

/** @brief 无损 Resume 富文本 / Lossless Resume rich text. */
export interface UiResumeRichText {
  /** @brief 纯文本正文 / Plain-text body. */
  readonly text: string
  /** @brief 基于 Unicode code point 的语义 marks / Semantic marks based on Unicode code points. */
  readonly marks: readonly UiResumeTextMark[]
}

/**
 * @brief 在纯文本编辑后重定位富文本 marks / Rebase rich-text marks after a plain-text edit.
 * @param source 用户开始编辑时的完整富文本；null 表示原本无正文 / Complete rich text at edit start; null denotes absent body text.
 * @param nextText 纯文本控件产生的新正文 / New body produced by the plain-text control.
 * @return 使用 Unicode code-point offset 且保留可表达 marks 的完整富文本 / Complete rich text using Unicode code-point offsets and preserving representable marks.
 * @note 纯文本差异不能证明新文本继承了旧格式或 link；因此仅平移确定未受影响的 mark，任何可能触及编辑并集的 mark 均整体移除。这也保证编辑不会把合法的 1000 个 marks 扩张到 Schema 上限之外。 / A plain-text diff cannot prove that new text inherits old formatting or links, so only certainly unaffected marks are shifted and every mark possibly touching the edit union is removed wholesale. This also guarantees an edit cannot expand 1,000 valid marks beyond the Schema limit.
 */
export function replaceUiResumeRichTextText(
  source: UiResumeRichText | null,
  nextText: string
): UiResumeRichText {
  if (source === null) return { marks: [], text: nextText }
  /** @brief 原文本的 Unicode code points / Unicode code points in the original text. */
  const previousPoints = [...source.text]
  /** @brief 新文本的 Unicode code points / Unicode code points in the new text. */
  const nextPoints = [...nextText]
  if (source.text === nextText)
    return { marks: source.marks.map((mark) => ({ ...mark })), text: nextText }
  /** @brief 可能的公共前缀最大长度 / Maximum possible common-prefix length. */
  let maximumPrefixLength = 0
  while (
    maximumPrefixLength < previousPoints.length &&
    maximumPrefixLength < nextPoints.length &&
    previousPoints[maximumPrefixLength] === nextPoints[maximumPrefixLength]
  ) {
    maximumPrefixLength += 1
  }
  /** @brief 可能的公共后缀最大长度 / Maximum possible common-suffix length. */
  let maximumSuffixLength = 0
  while (
    maximumSuffixLength < previousPoints.length &&
    maximumSuffixLength < nextPoints.length &&
    previousPoints[previousPoints.length - maximumSuffixLength - 1] ===
      nextPoints[nextPoints.length - maximumSuffixLength - 1]
  ) {
    maximumSuffixLength += 1
  }
  /** @brief 任一最小连续替换可保留的最大文本长度 / Maximum text length preserved by any minimal contiguous replacement. */
  const maximumUnchanged = Math.min(
    maximumPrefixLength + maximumSuffixLength,
    previousPoints.length,
    nextPoints.length
  )
  /** @brief 所有最小替换可能触及的最早边界 / Earliest boundary touched by any minimal replacement. */
  const affectedStart = Math.max(0, maximumUnchanged - maximumSuffixLength)
  /** @brief 所有最小替换候选中的最晚前缀边界 / Latest prefix boundary among all minimal replacement candidates. */
  const latestAffectedPrefix = Math.min(maximumPrefixLength, maximumUnchanged)
  /** @brief 所有最小替换可能触及的最晚边界 / Latest boundary touched by any minimal replacement. */
  const affectedEnd = previousPoints.length - (maximumUnchanged - latestAffectedPrefix)
  /** @brief 替换造成的 code-point 长度差 / Code-point length delta caused by the replacement. */
  const delta = nextPoints.length - previousPoints.length

  /** @brief 与编辑区间完全相离、仍与旧文本有明确关联的 marks / Marks wholly disjoint from the edit and still provably associated with old text. */
  const marks = source.marks.flatMap((mark): readonly UiResumeTextMark[] => {
    if (mark.end <= affectedStart) return [{ ...mark }]
    if (mark.start >= affectedEnd) {
      return [{ ...mark, end: mark.end + delta, start: mark.start + delta }]
    }
    return []
  })
  return { marks, text: nextText }
}

/** @brief Resume 联系方式种类 / Resume contact-method kind. */
export type UiResumeContactKind =
  | 'email'
  | 'phone'
  | 'website'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'location'
  | 'other'
  | 'custom'

/** @brief 无损 Resume 联系方式 / Lossless Resume contact method. */
export interface UiResumeContact {
  /** @brief 稳定联系方式 ID / Stable contact-method ID. */
  readonly id: UiResumeContactId
  /** @brief 联系方式种类 / Contact-method kind. */
  readonly kind: UiResumeContactKind
  /** @brief 可选自定义标签 / Optional custom label. */
  readonly label: string | null
  /** @brief 展示值 / Display value. */
  readonly value: string
  /** @brief 可选安全链接 / Optional safe URL. */
  readonly url: string | null
}

/** @brief 无损 Resume 个人资料 / Lossless Resume profile. */
export interface UiResumeProfile {
  /** @brief 姓名 / Full name. */
  readonly fullName: string
  /** @brief 可选职业标题 / Optional professional headline. */
  readonly headline: string | null
  /** @brief 可选富文本摘要 / Optional rich-text summary. */
  readonly summary: UiResumeRichText | null
  /** @brief 稳定身份的联系方式 / Contact methods with stable identities. */
  readonly contacts: readonly UiResumeContact[]
}

/** @brief 无损规范化 Resume 条目 / Lossless normalized Resume item. */
export interface UiResumeItem {
  /** @brief 稳定条目 ID / Stable item ID. */
  readonly id: UiResumeItemId
  /** @brief 条目种类 / Item kind. */
  readonly kind: UiResumeItemKind
  /** @brief 可选标题 / Optional title. */
  readonly title: string | null
  /** @brief 可选副标题 / Optional subtitle. */
  readonly subtitle: string | null
  /** @brief 可选组织 / Optional organization. */
  readonly organization: string | null
  /** @brief 可选地点 / Optional location. */
  readonly location: string | null
  /** @brief 保留精度的可选日期范围 / Optional date range preserving precision. */
  readonly dateRange: UiResumeDateRange | null
  /** @brief 可选富文本摘要 / Optional rich-text summary. */
  readonly summary: UiResumeRichText | null
  /** @brief 富文本要点 / Rich-text highlights. */
  readonly highlights: readonly UiResumeRichText[]
  /** @brief 技能 / Skills. */
  readonly skills: readonly string[]
  /** @brief 唯一标签 / Unique tags. */
  readonly tags: readonly string[]
  /** @brief 是否展示 / Whether the item is visible. */
  readonly visible: boolean
  /** @brief 可选安全链接 / Optional safe URL. */
  readonly url: string | null
}

/** @brief 无损 Resume 区段 / Lossless Resume section. */
export interface UiResumeSection {
  /** @brief 稳定区段 ID / Stable section ID. */
  readonly id: UiResumeSectionId
  /** @brief 区段种类 / Section kind. */
  readonly kind: UiResumeSectionKind
  /** @brief 区段标题 / Section title. */
  readonly title: string
  /** @brief 是否展示 / Whether the section is visible. */
  readonly visible: boolean
  /** @brief 可选富文本正文 / Optional rich-text content. */
  readonly content: UiResumeRichText | null
  /** @brief 规范化条目 / Normalized items. */
  readonly items: readonly UiResumeItem[]
}

/** @brief 简历页面大小 / Resume page size. */
export type UiResumePageSize = 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM'

/** @brief 模板声明的输出格式 / Output format declared by a template. */
export type UiResumeOutputFormat = 'pdf' | 'png' | 'html_snapshot' | 'docx'

/** @brief 简历页面方向 / Resume page orientation. */
export type UiResumePageOrientation = 'portrait' | 'landscape'

/** @brief 测量单位 / Measurement unit. */
export type UiMeasurementUnit = 'pt' | 'mm' | 'cm' | 'in' | 'px' | 'em' | 'percent'

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
  /** @brief CUSTOM 页面宽度 / Custom width for a CUSTOM page. */
  readonly customWidth: UiMeasurement | null
  /** @brief CUSTOM 页面高度 / Custom height for a CUSTOM page. */
  readonly customHeight: UiMeasurement | null
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
 * @brief 简历样式语义意图 / Resume-style semantic intent.
 * @note 不携带 CSS、HTML、LaTeX 或字体文件路径 / Carries no CSS, HTML, LaTeX, or local font paths.
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
  /** @brief 受模板约束的 JSON 设置 / Template-constrained JSON settings. */
  readonly templateSettings: Readonly<Record<string, UiJsonValue>>
  /** @brief 原样保留的 namespaced JSON 扩展 / Namespaced JSON extensions preserved verbatim. */
  readonly extensions: Readonly<Record<string, UiJsonValue>>
}

/** @brief 简历模板引用 / Resume template reference. */
export interface UiTemplateReference {
  /** @brief 模板 ID / Template ID. */
  readonly templateId: UiTemplateId
  /** @brief 不可变模板版本 / Immutable template version. */
  readonly templateVersion: string
}

/**
 * @brief Resume 编辑与写入的完整权威 SIR / Complete authoritative SIR for Resume editing and writes.
 * @note 该模型只转换字段命名，不创建展示字段或丢弃 API v2 事实 / This model only changes field naming; it neither invents display fields nor drops API v2 facts.
 */
export interface UiResumeDocument {
  /** @brief 简历 ID / Resume ID. */
  readonly id: UiResumeId
  /** @brief 所属 Workspace ID / Owning Workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 当前领域 revision / Current domain revision. */
  readonly revision: number
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 文档内容语言 / Document-content locale. */
  readonly locale: UiContentLocale
  /** @brief 模板引用 / Template reference. */
  readonly template: UiTemplateReference
  /** @brief 完整个人资料 / Complete profile. */
  readonly profile: UiResumeProfile
  /** @brief 完整语义区段 / Complete semantic sections. */
  readonly sections: readonly UiResumeSection[]
  /** @brief 无渲染器实现细节的版式意图 / Renderer-agnostic style intent. */
  readonly styleIntent: UiResumeStyleIntent
  /** @brief 自动关联的 KnowledgeSource ID / Automatically associated KnowledgeSource ID. */
  readonly knowledgeSourceId: UiKnowledgeSourceId | null
  /** @brief 创建时刻 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 原子配对完整 Resume 与强并发令牌的编辑权威 / Editor authority atomically pairing a complete Resume with its strong concurrency token. */
export interface UiResumeEditorModel {
  /** @brief 完整权威 Resume SIR / Complete authoritative Resume SIR. */
  readonly resume: UiResumeDocument
  /** @brief 与当前表示原子配对、只能原样用于 If-Match 的强令牌 / Strong token atomically paired with the current representation and only replayable as If-Match. */
  readonly concurrencyToken: UiConcurrencyToken
}
