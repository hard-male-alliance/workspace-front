/** @file API v2 ResumeDocument wire 模型、请求 encoder 与严格 decoder / API v2 ResumeDocument wire models, request encoder, and strict decoder. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedNumber,
  boundedString,
  closedStringEnum,
  exactRecord,
  extensions,
  locale,
  opaqueId,
  parseResourceFields,
  safeLinkUrl,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  assertTemplateSettingValue,
  parseColorValue,
  parseMeasurement,
  parseTemplateRef,
  type ColorValue,
  type Measurement,
  type ResumePageSize,
  type TemplateManifest,
  type TemplateRef
} from './template'
import {
  assertUniqueBy,
  assertUniqueStrings,
  jsonValuesEqual,
  nullable,
  parseJsonMap,
  type ResumeJsonValue
} from './wire-decoding'

/** @brief Resume 日期范围 / Resume date range. */
export interface DateRange {
  /** @brief 可选起始 partial date / Optional start partial date. */
  readonly start: string | null
  /** @brief 可选结束 partial date 或 present / Optional end partial date or present. */
  readonly end: string | null
}

/** @brief RichText mark kind / RichText mark kind. */
export type TextMarkKind = 'strong' | 'emphasis' | 'link'

/** @brief RichText mark 的公共 code-point 区间 / Shared code-point range of a RichText mark. */
interface TextMarkRange {
  /** @brief Unicode code-point 起始 offset / Start offset in Unicode code points. */
  readonly start: number
  /** @brief Unicode code-point 结束 offset / End offset in Unicode code points. */
  readonly end: number
}

/** @brief 必须携带安全 href 的 link mark / Link mark that must carry a safe href. */
export interface LinkTextMark extends TextMarkRange {
  /** @brief link 判别值 / Link discriminator. */
  readonly kind: 'link'
  /** @brief 安全链接 URL / Safe link URL. */
  readonly href: string
}

/** @brief 不得携带非空 href 的样式 mark / Styling mark that cannot carry a non-null href. */
export interface StyleTextMark extends TextMarkRange {
  /** @brief 非 link 样式 kind / Non-link styling kind. */
  readonly kind: Exclude<TextMarkKind, 'link'>
  /** @brief wire 可省略或显式为 null 的 href / href that may be omitted or explicitly null on the wire. */
  readonly href?: null
}

/** @brief 由 kind 判别 href 不变量的 RichText mark / RichText mark whose href invariant is discriminated by kind. */
export type TextMark = LinkTextMark | StyleTextMark

/** @brief API v2 富文本 / API v2 rich text. */
export interface RichText {
  /** @brief 纯文本正文 / Plain-text body. */
  readonly text: string
  /** @brief 文本 marks / Text marks. */
  readonly marks: readonly TextMark[]
}

/** @brief Resume contact kind / Resume contact kind. */
export type ContactMethodKind =
  | 'email'
  | 'phone'
  | 'website'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'location'
  | 'other'
  | 'custom'

/** @brief Resume 联系方式 / Resume contact method. */
export interface ContactMethod {
  /** @brief 稳定 contact ID / Stable contact ID. */
  readonly id: string
  /** @brief contact kind / Contact kind. */
  readonly kind: ContactMethodKind
  /** @brief 可选 label / Optional label. */
  readonly label: string | null
  /** @brief 展示值 / Display value. */
  readonly value: string
  /** @brief 可选安全链接 / Optional safe link. */
  readonly url: string | null
}

/** @brief Resume profile / Resume profile. */
export interface ResumeProfile {
  /** @brief 姓名 / Full name. */
  readonly full_name: string
  /** @brief 可选 headline / Optional headline. */
  readonly headline: string | null
  /** @brief 可选摘要 / Optional summary. */
  readonly summary: RichText | null
  /** @brief 联系方式 / Contact methods. */
  readonly contacts: readonly ContactMethod[]
}

/** @brief Resume item kind / Resume item kind. */
export type ResumeItemKind =
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

/** @brief 规范化 Resume item / Normalized Resume item. */
export interface ResumeItem {
  /** @brief 稳定 item ID / Stable item ID. */
  readonly id: string
  /** @brief item kind / Item kind. */
  readonly kind: ResumeItemKind
  /** @brief 可选标题 / Optional title. */
  readonly title: string | null
  /** @brief 可选副标题 / Optional subtitle. */
  readonly subtitle: string | null
  /** @brief 可选组织 / Optional organization. */
  readonly organization: string | null
  /** @brief 可选地点 / Optional location. */
  readonly location: string | null
  /** @brief 可选日期范围 / Optional date range. */
  readonly date_range: DateRange | null
  /** @brief 可选摘要 / Optional summary. */
  readonly summary: RichText | null
  /** @brief highlights / Highlights. */
  readonly highlights: readonly RichText[]
  /** @brief skills / Skills. */
  readonly skills: readonly string[]
  /** @brief 唯一 tags / Unique tags. */
  readonly tags: readonly string[]
  /** @brief 是否展示 / Whether the item is visible. */
  readonly visible: boolean
  /** @brief 可选安全链接 / Optional safe link. */
  readonly url: string | null
}

/** @brief Resume section kind / Resume section kind. */
export type ResumeSectionKind =
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

/** @brief Resume section / Resume section. */
export interface ResumeSection {
  /** @brief 稳定 section ID / Stable section ID. */
  readonly id: string
  /** @brief section kind / Section kind. */
  readonly kind: ResumeSectionKind
  /** @brief section 标题 / Section title. */
  readonly title: string
  /** @brief 是否展示 / Whether the section is visible. */
  readonly visible: boolean
  /** @brief 可选 section 内容 / Optional section content. */
  readonly content: RichText | null
  /** @brief 规范化 items / Normalized items. */
  readonly items: readonly ResumeItem[]
}

/** @brief 页面四边 inset / Four page insets. */
export interface PageInsets {
  /** @brief 顶部 inset / Top inset. */
  readonly top: Measurement
  /** @brief 右侧 inset / Right inset. */
  readonly right: Measurement
  /** @brief 底部 inset / Bottom inset. */
  readonly bottom: Measurement
  /** @brief 左侧 inset / Left inset. */
  readonly left: Measurement
}

/** @brief Resume 页面方向 / Resume page orientation. */
export type ResumePageOrientation = 'portrait' | 'landscape'

/** @brief Resume 页面语义意图 / Resume-page semantic intent. */
export interface ResumePageIntent {
  /** @brief 页面尺寸 / Page size. */
  readonly size: ResumePageSize
  /** @brief CUSTOM 页面宽度 / CUSTOM page width. */
  readonly custom_width: Measurement | null
  /** @brief CUSTOM 页面高度 / CUSTOM page height. */
  readonly custom_height: Measurement | null
  /** @brief 页面方向 / Page orientation. */
  readonly orientation: ResumePageOrientation
  /** @brief 页面 margins / Page margins. */
  readonly margins: PageInsets
  /** @brief 可选最大页数 / Optional maximum page count. */
  readonly max_pages: number | null
  /** @brief 是否展示页码 / Whether page numbers are shown. */
  readonly show_page_numbers: boolean
}

/** @brief Resume 字体语义意图 / Resume typography semantic intent. */
export interface TypographyIntent {
  /** @brief 字体 family token / Font-family token. */
  readonly font_family_token: string
  /** @brief 基础字号 pt / Base font size in points. */
  readonly base_size_pt: number
  /** @brief 行高 / Line height. */
  readonly line_height: number
  /** @brief 标题缩放 / Heading scale. */
  readonly heading_scale: number
  /** @brief 字间距 em / Letter spacing in em. */
  readonly letter_spacing_em: number
}

/** @brief Resume 色板语义意图 / Resume palette semantic intent. */
export interface PaletteIntent {
  /** @brief 主色 / Primary color. */
  readonly primary: ColorValue
  /** @brief 次色 / Secondary color. */
  readonly secondary: ColorValue
  /** @brief 正文颜色 / Text color. */
  readonly text: ColorValue
  /** @brief 弱化文本颜色 / Muted-text color. */
  readonly muted_text: ColorValue
  /** @brief 背景颜色 / Background color. */
  readonly background: ColorValue
}

/** @brief Section 版式语义意图 / Section-layout semantic intent. */
export interface SectionLayoutIntent {
  /** @brief 被布局的 section ID / ID of the laid-out section. */
  readonly section_id: string
  /** @brief 模板 zone ID / Template-zone ID. */
  readonly zone: string
  /** @brief 是否尽量同页 / Whether to keep together. */
  readonly keep_together: boolean
  /** @brief 是否在此前分页 / Whether to break the page before this section. */
  readonly page_break_before: boolean
  /** @brief 紧凑度 / Compactness. */
  readonly compactness: number
  /** @brief 可选 heading style token / Optional heading-style token. */
  readonly heading_style_token: string | null
}

/** @brief Resume 样式语义意图 / Resume-style semantic intent. */
export interface ResumeStyleIntent {
  /** @brief 样式契约版本 / Style-contract version. */
  readonly style_contract_version: '1.0'
  /** @brief 页面意图 / Page intent. */
  readonly page: ResumePageIntent
  /** @brief 字体意图 / Typography intent. */
  readonly typography: TypographyIntent
  /** @brief 色板意图 / Palette intent. */
  readonly palette: PaletteIntent
  /** @brief 全局密度 / Global density. */
  readonly density: number
  /** @brief 日期格式 token / Date-format token. */
  readonly date_format_token: string
  /** @brief bullet style token / Bullet-style token. */
  readonly bullet_style_token: string
  /** @brief section 布局 / Section layouts. */
  readonly section_layout: readonly SectionLayoutIntent[]
  /** @brief 模板 setting 值 / Template-setting values. */
  readonly template_settings: Readonly<Record<string, ResumeJsonValue>>
  /** @brief namespaced extensions / Namespaced extensions. */
  readonly extensions: Readonly<Record<string, ResumeJsonValue>>
}

/** @brief 完整 API v2 ResumeDocument / Complete API v2 ResumeDocument. */
export interface ResumeDocument extends ResourceFields {
  /** @brief 所属 Workspace ID / Owning Workspace ID. */
  readonly workspace_id: string
  /** @brief Resume 标题 / Resume title. */
  readonly title: string
  /** @brief 内容 locale / Content locale. */
  readonly locale: string
  /** @brief Resume profile / Resume profile. */
  readonly profile: ResumeProfile
  /** @brief Resume sections / Resume sections. */
  readonly sections: readonly ResumeSection[]
  /** @brief 固定模板引用 / Pinned template reference. */
  readonly template: TemplateRef
  /** @brief 样式语义意图 / Style semantic intent. */
  readonly style: ResumeStyleIntent
  /** @brief 可选 KnowledgeSource ID / Optional KnowledgeSource ID. */
  readonly knowledge_source_id: string | null
}

/** @brief 创建 Resume 的 API v2 wire 请求 / API v2 wire request to create a Resume. */
export interface CreateResumeRequest {
  /** @brief Resume 标题 / Resume title. */
  readonly title: string
  /** @brief 内容 locale / Content locale. */
  readonly locale: string
  /** @brief 固定模板引用 / Pinned template reference. */
  readonly template: TemplateRef
  /** @brief 可选克隆来源；省略与显式 null 保持可区分 / Optional clone source; omission remains distinct from explicit null. */
  readonly clone_from_resume_id?: string | null
}

/** @brief partial date 正则分组 / Capturing pattern for partial dates. */
const PARTIAL_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u

/**
 * @brief 计算公历月份天数 / Calculate the number of days in a Gregorian month.
 * @param year 年 / Year.
 * @param month 月 / Month.
 * @return 当月天数 / Number of days in the month.
 */
function daysInMonth(year: number, month: number): number {
  /** @brief 是否闰年 / Whether the year is a leap year. */
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

/**
 * @brief 严格解码真实 partial calendar date / Strictly decode a real partial calendar date.
 * @param value 未知日期 / Unknown date.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowPresent 是否允许 present / Whether present is allowed.
 * @return 已验证 partial date / Validated partial date.
 */
function partialDate(value: unknown, path: string, allowPresent: boolean): string {
  if (allowPresent && value === 'present') return value
  if (typeof value !== 'string') {
    throw new ApiV2ContractError(`API v2 field ${path} must be a partial calendar date.`)
  }
  /** @brief partial date 分组 / Partial-date groups. */
  const match = PARTIAL_DATE_PATTERN.exec(value)
  if (match === null) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a partial calendar date.`)
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
    (day !== null && month !== null && (day < 1 || day > daysInMonth(year, month)))
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a real calendar date.`)
  }
  return value
}

/**
 * @brief 将 partial date 转为比较边界 / Convert a partial date into a comparison boundary.
 * @param value 已验证 partial date / Validated partial date.
 * @param upperBound 是否取该精度区间上界 / Whether to take the upper bound at this precision.
 * @return 可按字典序比较的 YYYY-MM-DD / Lexically comparable YYYY-MM-DD.
 */
function partialDateBoundary(value: string, upperBound: boolean): string {
  /** @brief partial date 分组 / Partial-date groups. */
  const match = PARTIAL_DATE_PATTERN.exec(value)
  if (match === null || match[1] === undefined) {
    throw new ApiV2ContractError('API v2 encountered an invalid decoded partial date.')
  }
  /** @brief 年 / Year. */
  const year = Number(match[1])
  /** @brief 月；缺失时按边界补齐 / Month, completed according to the requested boundary. */
  const month = match[2] === undefined ? (upperBound ? 12 : 1) : Number(match[2])
  /** @brief 日；缺失时按边界补齐 / Day, completed according to the requested boundary. */
  const day =
    match[3] === undefined ? (upperBound ? daysInMonth(year, month) : 1) : Number(match[3])
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * @brief 严格解码 DateRange 并拒绝倒序 / Strictly decode DateRange and reject reversed intervals.
 * @param value 未知日期范围 / Unknown date range.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证日期范围 / Validated date range.
 */
function parseDateRange(value: unknown, path: string): DateRange {
  /** @brief 精确日期范围对象 / Exact date-range object. */
  const input = exactRecord(value, path, ['start', 'end'])
  /** @brief 起始日期 / Start date. */
  const start = nullable(input.start, (candidate) => partialDate(candidate, `${path}.start`, false))
  /** @brief 结束日期 / End date. */
  const end = nullable(input.end, (candidate) => partialDate(candidate, `${path}.end`, true))
  if (
    start !== null &&
    end !== null &&
    end !== 'present' &&
    partialDateBoundary(start, false) > partialDateBoundary(end, true)
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} must not be a reversed date range.`)
  }
  return { end, start }
}

/**
 * @brief 严格解码 TextMark / Strictly decode TextMark.
 * @param value 未知 mark / Unknown mark.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param textLength 正文 Unicode code-point 数 / Body length in Unicode code points.
 * @return 已验证 mark / Validated mark.
 */
function parseTextMark(value: unknown, path: string, textLength: number): TextMark {
  /** @brief 精确 mark 对象 / Exact mark object. */
  const input = exactRecord(value, path, ['start', 'end', 'kind', 'href'])
  /** @brief mark kind / Mark kind. */
  const kind = closedStringEnum(input.kind, `${path}.kind`, ['strong', 'emphasis', 'link'])
  /** @brief 起始 offset / Start offset. */
  const start = boundedInteger(input.start, `${path}.start`, 0, Number.MAX_SAFE_INTEGER)
  /** @brief 结束 offset / End offset. */
  const end = boundedInteger(input.end, `${path}.end`, 1, Number.MAX_SAFE_INTEGER)
  if (start >= end || end > textLength) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must satisfy start < end <= RichText text length.`
    )
  }
  if (kind === 'link') {
    return { end, href: safeLinkUrl(input.href, `${path}.href`), kind, start }
  }
  if (input.href !== undefined && input.href !== null) {
    throw new ApiV2ContractError(`API v2 field ${path}.href must be null for a non-link mark.`)
  }
  return input.href === undefined ? { end, kind, start } : { end, href: null, kind, start }
}

/**
 * @brief 拒绝 crossing RichText marks，同时允许相离或嵌套 / Reject crossing RichText marks while allowing disjoint or nested marks.
 * @param marks 已验证 marks / Validated marks.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertMarksDoNotCross(marks: readonly TextMark[], path: string): void {
  /** @brief 按 start 升序、end 降序排列的 marks / Marks ordered by ascending start and descending end. */
  const ordered = [...marks].sort((left, right) => left.start - right.start || right.end - left.end)
  /** @brief 当前嵌套链的 end offsets / End offsets in the active nesting chain. */
  const activeEnds: number[] = []
  for (const mark of ordered) {
    while (activeEnds.length > 0 && mark.start >= (activeEnds.at(-1) ?? 0)) activeEnds.pop()
    /** @brief 最内层活动 mark 的 end / End of the innermost active mark. */
    const enclosingEnd = activeEnds.at(-1)
    if (enclosingEnd !== undefined && mark.end > enclosingEnd) {
      throw new ApiV2ContractError(`API v2 field ${path} contains illegally crossing marks.`)
    }
    activeEnds.push(mark.end)
  }
}

/**
 * @brief 严格解码 RichText / Strictly decode RichText.
 * @param value 未知富文本 / Unknown rich text.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证富文本 / Validated rich text.
 */
function parseRichText(value: unknown, path: string): RichText {
  /** @brief 精确 RichText 对象 / Exact RichText object. */
  const input = exactRecord(value, path, ['text', 'marks'])
  /** @brief 正文 / Text body. */
  const text = boundedString(input.text, `${path}.text`, 0, 20_000)
  /** @brief Unicode code-point 长度 / Unicode code-point length. */
  const textLength = [...text].length
  /** @brief 未映射 marks / Unmapped marks. */
  const markInputs = arrayBetween(input.marks, `${path}.marks`, 0, 1000)
  /** @brief 已验证 marks / Validated marks. */
  const marks = markInputs.map((mark, index) =>
    parseTextMark(mark, `${path}.marks[${index}]`, textLength)
  )
  assertMarksDoNotCross(marks, `${path}.marks`)
  return { marks, text }
}

/**
 * @brief 严格解码 ContactMethod / Strictly decode ContactMethod.
 * @param value 未知联系方式 / Unknown contact method.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证联系方式 / Validated contact method.
 */
function parseContactMethod(value: unknown, path: string): ContactMethod {
  /** @brief 精确 contact 对象 / Exact contact object. */
  const input = exactRecord(value, path, ['id', 'kind', 'label', 'value', 'url'])
  return {
    id: opaqueId(input.id, `${path}.id`),
    kind: closedStringEnum(input.kind, `${path}.kind`, [
      'email',
      'phone',
      'website',
      'linkedin',
      'github',
      'portfolio',
      'location',
      'other',
      'custom'
    ]),
    label: nullable(input.label, (candidate) => boundedString(candidate, `${path}.label`, 0, 80)),
    url: nullable(input.url, (candidate) => safeLinkUrl(candidate, `${path}.url`)),
    value: boundedString(input.value, `${path}.value`, 1, 500)
  }
}

/**
 * @brief 严格解码 ResumeProfile / Strictly decode ResumeProfile.
 * @param value 未知 profile / Unknown profile.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 profile / Validated profile.
 */
function parseResumeProfile(value: unknown, path: string): ResumeProfile {
  /** @brief 精确 profile 对象 / Exact profile object. */
  const input = exactRecord(value, path, ['full_name', 'headline', 'summary', 'contacts'])
  /** @brief 未映射 contacts / Unmapped contacts. */
  const contactInputs = arrayBetween(input.contacts, `${path}.contacts`, 0, 30)
  /** @brief 已验证 contacts / Validated contacts. */
  const contacts = contactInputs.map((contact, index) =>
    parseContactMethod(contact, `${path}.contacts[${index}]`)
  )
  assertUniqueBy(contacts, (contact) => contact.id, `${path}.contacts`)
  return {
    contacts,
    full_name: boundedString(input.full_name, `${path}.full_name`, 1, 200),
    headline: nullable(input.headline, (candidate) =>
      boundedString(candidate, `${path}.headline`, 0, 300)
    ),
    summary: nullable(input.summary, (candidate) => parseRichText(candidate, `${path}.summary`))
  }
}

/**
 * @brief 解码字符串数组 / Decode a bounded string array.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @param maximumLength 单条最大字符数 / Maximum characters per item.
 * @return 已验证字符串数组 / Validated string array.
 */
function parseStringArray(
  value: unknown,
  path: string,
  maximumItems: number,
  maximumLength: number
): readonly string[] {
  /** @brief 未映射数组 / Unmapped array. */
  const input = arrayBetween(value, path, 0, maximumItems)
  return input.map((item, index) => boundedString(item, `${path}[${index}]`, 1, maximumLength))
}

/**
 * @brief 严格解码 ResumeItem / Strictly decode ResumeItem.
 * @param value 未知 item / Unknown item.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 item / Validated item.
 */
export function parseResumeItem(value: unknown, path: string): ResumeItem {
  /** @brief 精确 item 对象 / Exact item object. */
  const input = exactRecord(value, path, [
    'id',
    'kind',
    'title',
    'subtitle',
    'organization',
    'location',
    'date_range',
    'summary',
    'highlights',
    'skills',
    'tags',
    'visible',
    'url'
  ])
  /** @brief 未映射 highlights / Unmapped highlights. */
  const highlightInputs = arrayBetween(input.highlights, `${path}.highlights`, 0, 100)
  /** @brief 已验证 tags / Validated tags. */
  const tags = parseStringArray(input.tags, `${path}.tags`, 100, 100)
  assertUniqueStrings(tags, `${path}.tags`)
  return {
    date_range: nullable(input.date_range, (candidate) =>
      parseDateRange(candidate, `${path}.date_range`)
    ),
    highlights: highlightInputs.map((highlight, index) =>
      parseRichText(highlight, `${path}.highlights[${index}]`)
    ),
    id: opaqueId(input.id, `${path}.id`),
    kind: closedStringEnum(input.kind, `${path}.kind`, [
      'experience',
      'education',
      'project',
      'skill_group',
      'publication',
      'award',
      'certification',
      'language',
      'volunteer',
      'custom'
    ]),
    location: nullable(input.location, (candidate) =>
      boundedString(candidate, `${path}.location`, 0, 300)
    ),
    organization: nullable(input.organization, (candidate) =>
      boundedString(candidate, `${path}.organization`, 0, 300)
    ),
    skills: parseStringArray(input.skills, `${path}.skills`, 200, 100),
    subtitle: nullable(input.subtitle, (candidate) =>
      boundedString(candidate, `${path}.subtitle`, 0, 300)
    ),
    summary: nullable(input.summary, (candidate) => parseRichText(candidate, `${path}.summary`)),
    tags,
    title: nullable(input.title, (candidate) => boundedString(candidate, `${path}.title`, 0, 300)),
    url: nullable(input.url, (candidate) => safeLinkUrl(candidate, `${path}.url`)),
    visible: booleanValue(input.visible, `${path}.visible`)
  }
}

/**
 * @brief 严格解码 ResumeSection / Strictly decode ResumeSection.
 * @param value 未知 section / Unknown section.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 section / Validated section.
 */
export function parseResumeSection(value: unknown, path: string): ResumeSection {
  /** @brief 精确 section 对象 / Exact section object. */
  const input = exactRecord(value, path, ['id', 'kind', 'title', 'visible', 'content', 'items'])
  /** @brief 未映射 items / Unmapped items. */
  const itemInputs = arrayBetween(input.items, `${path}.items`, 0, 1000)
  return {
    content: nullable(input.content, (candidate) => parseRichText(candidate, `${path}.content`)),
    id: opaqueId(input.id, `${path}.id`),
    items: itemInputs.map((item, index) => parseResumeItem(item, `${path}.items[${index}]`)),
    kind: closedStringEnum(input.kind, `${path}.kind`, [
      'experience',
      'education',
      'projects',
      'skills',
      'publications',
      'awards',
      'certifications',
      'languages',
      'volunteer',
      'custom'
    ]),
    title: boundedString(input.title, `${path}.title`, 1, 120),
    visible: booleanValue(input.visible, `${path}.visible`)
  }
}

/**
 * @brief 严格解码 PageInsets / Strictly decode PageInsets.
 * @param value 未知 insets / Unknown insets.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 insets / Validated insets.
 */
function parsePageInsets(value: unknown, path: string): PageInsets {
  /** @brief 精确 insets 对象 / Exact insets object. */
  const input = exactRecord(value, path, ['top', 'right', 'bottom', 'left'])
  return {
    bottom: parseMeasurement(input.bottom, `${path}.bottom`),
    left: parseMeasurement(input.left, `${path}.left`),
    right: parseMeasurement(input.right, `${path}.right`),
    top: parseMeasurement(input.top, `${path}.top`)
  }
}

/**
 * @brief 严格解码 ResumePageIntent / Strictly decode ResumePageIntent.
 * @param value 未知页面意图 / Unknown page intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证页面意图 / Validated page intent.
 */
function parseResumePageIntent(value: unknown, path: string): ResumePageIntent {
  /** @brief 精确页面对象 / Exact page object. */
  const input = exactRecord(value, path, [
    'size',
    'custom_width',
    'custom_height',
    'orientation',
    'margins',
    'max_pages',
    'show_page_numbers'
  ])
  /** @brief 页面尺寸 / Page size. */
  const size = closedStringEnum(input.size, `${path}.size`, ['A4', 'LETTER', 'LEGAL', 'CUSTOM'])
  /** @brief CUSTOM 宽度 / CUSTOM width. */
  const customWidth = nullable(input.custom_width, (candidate) =>
    parseMeasurement(candidate, `${path}.custom_width`)
  )
  /** @brief CUSTOM 高度 / CUSTOM height. */
  const customHeight = nullable(input.custom_height, (candidate) =>
    parseMeasurement(candidate, `${path}.custom_height`)
  )
  return {
    custom_height: customHeight,
    custom_width: customWidth,
    margins: parsePageInsets(input.margins, `${path}.margins`),
    max_pages: nullable(input.max_pages, (candidate) =>
      boundedInteger(candidate, `${path}.max_pages`, 1, 100)
    ),
    orientation: closedStringEnum(input.orientation, `${path}.orientation`, [
      'portrait',
      'landscape'
    ]),
    show_page_numbers: booleanValue(input.show_page_numbers, `${path}.show_page_numbers`),
    size
  }
}

/**
 * @brief 严格解码 TypographyIntent / Strictly decode TypographyIntent.
 * @param value 未知字体意图 / Unknown typography intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证字体意图 / Validated typography intent.
 */
function parseTypographyIntent(value: unknown, path: string): TypographyIntent {
  /** @brief 精确字体对象 / Exact typography object. */
  const input = exactRecord(value, path, [
    'font_family_token',
    'base_size_pt',
    'line_height',
    'heading_scale',
    'letter_spacing_em'
  ])
  return {
    base_size_pt: boundedNumber(input.base_size_pt, `${path}.base_size_pt`, 5, 72),
    font_family_token: boundedString(input.font_family_token, `${path}.font_family_token`, 1, 120),
    heading_scale: boundedNumber(input.heading_scale, `${path}.heading_scale`, 0.5, 5),
    letter_spacing_em: boundedNumber(input.letter_spacing_em, `${path}.letter_spacing_em`, -1, 2),
    line_height: boundedNumber(input.line_height, `${path}.line_height`, 0.5, 5)
  }
}

/**
 * @brief 严格解码 PaletteIntent / Strictly decode PaletteIntent.
 * @param value 未知色板意图 / Unknown palette intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证色板意图 / Validated palette intent.
 */
function parsePaletteIntent(value: unknown, path: string): PaletteIntent {
  /** @brief 精确色板对象 / Exact palette object. */
  const input = exactRecord(value, path, [
    'primary',
    'secondary',
    'text',
    'muted_text',
    'background'
  ])
  return {
    background: parseColorValue(input.background, `${path}.background`),
    muted_text: parseColorValue(input.muted_text, `${path}.muted_text`),
    primary: parseColorValue(input.primary, `${path}.primary`),
    secondary: parseColorValue(input.secondary, `${path}.secondary`),
    text: parseColorValue(input.text, `${path}.text`)
  }
}

/**
 * @brief 严格解码 SectionLayoutIntent / Strictly decode SectionLayoutIntent.
 * @param value 未知布局意图 / Unknown layout intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证布局意图 / Validated layout intent.
 */
function parseSectionLayoutIntent(value: unknown, path: string): SectionLayoutIntent {
  /** @brief 精确布局对象 / Exact layout object. */
  const input = exactRecord(value, path, [
    'section_id',
    'zone',
    'keep_together',
    'page_break_before',
    'compactness',
    'heading_style_token'
  ])
  return {
    compactness: boundedNumber(input.compactness, `${path}.compactness`, 0, 1),
    heading_style_token: nullable(input.heading_style_token, (candidate) =>
      boundedString(candidate, `${path}.heading_style_token`, 0, 120)
    ),
    keep_together: booleanValue(input.keep_together, `${path}.keep_together`),
    page_break_before: booleanValue(input.page_break_before, `${path}.page_break_before`),
    section_id: opaqueId(input.section_id, `${path}.section_id`),
    zone: boundedString(input.zone, `${path}.zone`, 1, 80)
  }
}

/**
 * @brief 严格解码 ResumeStyleIntent / Strictly decode ResumeStyleIntent.
 * @param value 未知样式意图 / Unknown style intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证样式意图 / Validated style intent.
 */
function parseResumeStyleIntent(value: unknown, path: string): ResumeStyleIntent {
  /** @brief 精确样式对象 / Exact style object. */
  const input = exactRecord(value, path, [
    'style_contract_version',
    'page',
    'typography',
    'palette',
    'density',
    'date_format_token',
    'bullet_style_token',
    'section_layout',
    'template_settings',
    'extensions'
  ])
  /** @brief 未映射 section layouts / Unmapped section layouts. */
  const layoutInputs = arrayBetween(input.section_layout, `${path}.section_layout`, 0, 100)
  /** @brief 已验证 section layouts / Validated section layouts. */
  const sectionLayout = layoutInputs.map((layout, index) =>
    parseSectionLayoutIntent(layout, `${path}.section_layout[${index}]`)
  )
  assertUniqueBy(sectionLayout, (layout) => layout.section_id, `${path}.section_layout`)
  return {
    bullet_style_token: boundedString(
      input.bullet_style_token,
      `${path}.bullet_style_token`,
      1,
      120
    ),
    date_format_token: boundedString(input.date_format_token, `${path}.date_format_token`, 1, 120),
    density: boundedNumber(input.density, `${path}.density`, 0, 1),
    extensions: extensions(input.extensions, `${path}.extensions`),
    page: parseResumePageIntent(input.page, `${path}.page`),
    palette: parsePaletteIntent(input.palette, `${path}.palette`),
    section_layout: sectionLayout,
    style_contract_version: closedStringEnum(
      input.style_contract_version,
      `${path}.style_contract_version`,
      ['1.0']
    ),
    template_settings: parseJsonMap(input.template_settings, `${path}.template_settings`, 100),
    typography: parseTypographyIntent(input.typography, `${path}.typography`)
  }
}

/**
 * @brief 校验 ResumeDocument 的实体 identity 与内部 style 引用 / Validate ResumeDocument entity identities and internal style references.
 * @param document 已按字段解码的 Resume / Field-decoded Resume.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertResumeDocumentConsistency(document: ResumeDocument, path: string): void {
  /** @brief 所有 section 与 item 共用的 identity 集合 / Shared identity set for all sections and items. */
  const entityIds = new Set<string>()
  for (const section of document.sections) {
    if (entityIds.has(section.id)) {
      throw new ApiV2ContractError(`API v2 field ${path}.sections contains a duplicate entity ID.`)
    }
    entityIds.add(section.id)
    for (const item of section.items) {
      if (entityIds.has(item.id)) {
        throw new ApiV2ContractError(
          `API v2 field ${path}.sections contains a duplicate entity ID.`
        )
      }
      entityIds.add(item.id)
    }
  }
  /** @brief Resume section IDs / Resume section IDs. */
  const sectionIds = new Set(document.sections.map((section) => section.id))
  if (document.style.section_layout.some((layout) => !sectionIds.has(layout.section_id))) {
    throw new ApiV2ContractError(
      `API v2 field ${path}.style.section_layout references an unknown section ID.`
    )
  }
}

/**
 * @brief 严格解码完整 ResumeDocument / Strictly decode a complete ResumeDocument.
 * @param value 未知 Resume document / Unknown Resume document.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 ResumeDocument / Validated ResumeDocument.
 */
export function parseResumeDocument(value: unknown, path = 'resume_document'): ResumeDocument {
  /** @brief 精确 ResumeDocument 对象 / Exact ResumeDocument object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'title',
    'locale',
    'profile',
    'sections',
    'template',
    'style',
    'knowledge_source_id'
  ])
  /** @brief 未映射 sections / Unmapped sections. */
  const sectionInputs = arrayBetween(input.sections, `${path}.sections`, 0, 100)
  /** @brief 已验证 ResumeDocument / Validated ResumeDocument. */
  const document: ResumeDocument = {
    ...parseResourceFields(input, path),
    knowledge_source_id: nullable(input.knowledge_source_id, (candidate) =>
      opaqueId(candidate, `${path}.knowledge_source_id`)
    ),
    locale: locale(input.locale, `${path}.locale`),
    profile: parseResumeProfile(input.profile, `${path}.profile`),
    sections: sectionInputs.map((section, index) =>
      parseResumeSection(section, `${path}.sections[${index}]`)
    ),
    style: parseResumeStyleIntent(input.style, `${path}.style`),
    template: parseTemplateRef(input.template, `${path}.template`),
    title: boundedString(input.title, `${path}.title`, 1, 300),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
  assertResumeDocumentConsistency(document, path)
  return document
}

/**
 * @brief 校验 ResumeDocument 与其固定 TemplateManifest 的兼容性 / Validate compatibility between a ResumeDocument and its pinned TemplateManifest.
 * @param document 已验证 ResumeDocument / Validated ResumeDocument.
 * @param manifest 已验证 TemplateManifest / Validated TemplateManifest.
 */
export function assertResumeMatchesTemplate(
  document: ResumeDocument,
  manifest: TemplateManifest
): void {
  if (
    document.template.template_id !== manifest.id ||
    document.template.version !== manifest.version
  ) {
    throw new ApiV2ContractError('API v2 Resume template identity does not match TemplateManifest.')
  }
  /** @brief BCP 47 大小写无关的目标 locale key / Case-insensitive BCP 47 key for the target locale. */
  const localeKey = document.locale.toLowerCase()
  if (
    !manifest.supported_locales.some(
      (supportedLocale) => supportedLocale.toLowerCase() === localeKey
    )
  ) {
    throw new ApiV2ContractError('API v2 Resume locale is not supported by TemplateManifest.')
  }
  if (!manifest.supported_page_sizes.includes(document.style.page.size)) {
    throw new ApiV2ContractError('API v2 Resume page size is not supported by TemplateManifest.')
  }
  if (!manifest.font_family_tokens.includes(document.style.typography.font_family_token)) {
    throw new ApiV2ContractError('API v2 Resume font token is not declared by TemplateManifest.')
  }
  if (!manifest.date_format_tokens.includes(document.style.date_format_token)) {
    throw new ApiV2ContractError('API v2 Resume date token is not declared by TemplateManifest.')
  }
  if (!manifest.bullet_style_tokens.includes(document.style.bullet_style_token)) {
    throw new ApiV2ContractError('API v2 Resume bullet token is not declared by TemplateManifest.')
  }
  /** @brief 模板支持的 section kinds / Section kinds supported by the template. */
  const supportedKinds = new Set(manifest.supported_section_kinds)
  if (document.sections.some((section) => !supportedKinds.has(section.kind))) {
    throw new ApiV2ContractError(
      'API v2 Resume contains a section kind unsupported by TemplateManifest.'
    )
  }
  /** @brief Resume section 索引 / Resume section index. */
  const sectionsById = new Map(document.sections.map((section) => [section.id, section]))
  /** @brief 模板 zone 索引 / Template-zone index. */
  const zonesById = new Map(manifest.zones.map((zone) => [zone.id, zone]))
  /** @brief 各 zone 已使用 section 数 / Section usage count by zone. */
  const zoneUsage = new Map<string, number>()
  for (const layout of document.style.section_layout) {
    /** @brief 当前布局 section / Section addressed by the current layout. */
    const section = sectionsById.get(layout.section_id)
    /** @brief 当前布局 zone / Zone addressed by the current layout. */
    const zone = zonesById.get(layout.zone)
    if (
      section === undefined ||
      zone === undefined ||
      !zone.accepted_section_kinds.includes(section.kind)
    ) {
      throw new ApiV2ContractError(
        'API v2 Resume section layout is incompatible with TemplateManifest.'
      )
    }
    /** @brief 更新后的 zone 使用数 / Updated zone usage count. */
    const count = (zoneUsage.get(zone.id) ?? 0) + 1
    if (zone.max_sections !== null && count > zone.max_sections) {
      throw new ApiV2ContractError('API v2 Resume exceeds a TemplateManifest zone section limit.')
    }
    zoneUsage.set(zone.id, count)
  }
  /** @brief 模板 setting 索引 / Template-setting index. */
  const settingsByKey = new Map(manifest.settings.map((setting) => [setting.key, setting]))
  for (const [key, value] of Object.entries(document.style.template_settings)) {
    /** @brief 当前 setting 定义 / Current setting definition. */
    const definition = settingsByKey.get(key)
    if (definition === undefined) {
      throw new ApiV2ContractError(`API v2 Resume template setting ${key} is not declared.`)
    }
    if (definition.visible_when !== null) {
      /** @brief 可见性依赖定义 / Visibility-dependency definition. */
      const dependency = settingsByKey.get(definition.visible_when.key)
      /** @brief 当前有效依赖值 / Current effective dependency value. */
      const dependencyValue = Object.hasOwn(
        document.style.template_settings,
        definition.visible_when.key
      )
        ? document.style.template_settings[definition.visible_when.key]
        : dependency?.default
      if (
        dependency === undefined ||
        dependencyValue === undefined ||
        !jsonValuesEqual(dependencyValue, definition.visible_when.equals)
      ) {
        throw new ApiV2ContractError(`API v2 Resume template setting ${key} is not visible.`)
      }
    }
    assertTemplateSettingValue(value, definition, `resume_document.style.template_settings.${key}`)
  }
}

/**
 * @brief 编码并严格校验 CreateResumeRequest / Encode and strictly validate CreateResumeRequest.
 * @param request 创建请求输入 / Create-request input.
 * @return 仅含 v2 wire keys、且精确保留 clone omission 的请求 / Request containing only v2 wire keys and preserving clone omission exactly.
 */
export function encodeCreateResumeRequest(request: CreateResumeRequest): CreateResumeRequest {
  /** @brief 精确请求对象 / Exact request object. */
  const input = exactRecord(request, 'create_resume_request', [
    'title',
    'locale',
    'template',
    'clone_from_resume_id'
  ])
  /** @brief 已验证公共请求字段 / Validated common request fields. */
  const encoded = {
    locale: locale(input.locale, 'create_resume_request.locale'),
    template: parseTemplateRef(input.template, 'create_resume_request.template'),
    title: boundedString(input.title, 'create_resume_request.title', 1, 300)
  }
  if (input.clone_from_resume_id === undefined) return encoded
  return {
    ...encoded,
    clone_from_resume_id: nullable(input.clone_from_resume_id, (candidate) =>
      opaqueId(candidate, 'create_resume_request.clone_from_resume_id')
    )
  }
}
