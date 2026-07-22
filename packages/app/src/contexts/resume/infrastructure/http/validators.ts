/** @file Resume HTTP JSON 的运行时校验 / Runtime validation for Resume HTTP JSON. */

import { parseRenderArtifactMetadata } from '@ai-job-workspace/platform'

import {
  absoluteUri,
  array,
  boolean,
  boundedString,
  exactRecord,
  extensions,
  integer,
  nonNegativeInteger,
  nullableNumber,
  nullableRecord,
  nullableString,
  number,
  opaqueId,
  parseCursorPage,
  positiveInteger,
  record,
  stableCode,
  string,
  stringArray,
  timestamp,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError, parseProblemDetails } from '../../../../infrastructure/http/http-client'
import type { UiTemplateSettingValue } from '../../domain/models'
import type {
  ColorValueDto,
  MeasurementDto,
  ResumeContactDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumeOperationBatchResultDto,
  ResumeOperationProblemDto,
  RenderArtifactDto,
  ResumeRenderJobDto,
  ResumeSectionDto,
  RichTextDto,
  TemplateChoiceDto,
  TemplateManifestDto,
  TemplateSettingDefinitionDto,
  TemplateSettingVisibilityDto,
  TemplateZoneDto
} from './transport-types'

/** @brief 模板区域 ID 格式 / Template-zone ID format. */
const TEMPLATE_ZONE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u

/** @brief Locale 的冻结结构格式 / Frozen structural format for a locale. */
const TEMPLATE_LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u

/** @brief 模板设置值类型 / Template-setting value types. */
const TEMPLATE_VALUE_TYPES = [
  'boolean',
  'integer',
  'number',
  'string',
  'choice',
  'color',
  'measurement'
] as const

/** @brief 模板设置控件类型 / Template-setting control types. */
const TEMPLATE_CONTROLS = [
  'switch',
  'slider',
  'number',
  'select',
  'radio',
  'color',
  'measurement',
  'text'
] as const

/** @brief 模板页面规格 / Template page sizes. */
const TEMPLATE_PAGE_SIZES = ['A4', 'LETTER', 'LEGAL', 'CUSTOM'] as const

/** @brief 模板输出格式 / Template output formats. */
const TEMPLATE_OUTPUT_FORMATS = ['pdf', 'png', 'html_snapshot', 'docx'] as const

/**
 * @brief 校验字符串符合指定格式 / Validate a string against a required format.
 * @param value 未受信任的字符串值 / Untrusted string value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param pattern 允许格式 / Allowed pattern.
 * @return 已验证字符串 / Validated string.
 */
function patternedString(value: unknown, path: string, pattern: RegExp): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!pattern.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} has an invalid format.`, 200)
  }
  return decoded
}

/**
 * @brief 校验字符串枚举 / Validate a string enum.
 * @param value 未受信任的 code / Untrusted code.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowed 允许的 code / Allowed codes.
 * @return 已验证 code / Validated code.
 */
function templateEnum<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[]
): TValue {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!allowed.includes(decoded as TValue)) {
    throw new HttpContractError(`Backend field ${path} has an unsupported value.`, 200)
  }
  return decoded as TValue
}

/**
 * @brief 校验模板清单中的字符串数组 / Validate a string array in a template manifest.
 * @param value 未受信任的数组 / Untrusted array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param options 数组与元素约束 / Array and item constraints.
 * @return 已验证字符串数组 / Validated string array.
 */
function templateStringArray(
  value: unknown,
  path: string,
  options: {
    readonly minimumItems?: number
    readonly maximumItems?: number
    readonly unique?: boolean
    readonly minimumLength?: number
    readonly maximumLength?: number
    readonly pattern?: RegExp
    readonly allowed?: readonly string[]
  } = {}
): readonly string[] {
  /** @brief 原始数组 / Raw array. */
  const values = array(value, path)
  if (options.minimumItems !== undefined && values.length < options.minimumItems) {
    throw new HttpContractError(
      `Backend field ${path} must contain at least ${options.minimumItems} item(s).`,
      200
    )
  }
  if (options.maximumItems !== undefined && values.length > options.maximumItems) {
    throw new HttpContractError(
      `Backend field ${path} must contain at most ${options.maximumItems} item(s).`,
      200
    )
  }

  /** @brief 已验证字符串数组 / Validated string array. */
  const decoded = values.map((item, index): string => {
    /** @brief 当前字符串元素路径 / Current string-item path. */
    const itemPath = `${path}[${index}]`
    /** @brief 当前已解码字符串 / Current decoded string. */
    const itemValue = boundedString(
      item,
      itemPath,
      options.minimumLength ?? 0,
      options.maximumLength ?? Number.MAX_SAFE_INTEGER
    )
    if (options.pattern !== undefined && !options.pattern.test(itemValue)) {
      throw new HttpContractError(`Backend field ${itemPath} has an invalid format.`, 200)
    }
    if (options.allowed !== undefined && !options.allowed.includes(itemValue)) {
      throw new HttpContractError(`Backend field ${itemPath} has an unsupported value.`, 200)
    }
    return itemValue
  })

  if (options.unique === true && new Set(decoded).size !== decoded.length) {
    throw new HttpContractError(`Backend field ${path} must contain unique items.`, 200)
  }
  return decoded
}

/**
 * @brief 校验数组最大元素数 / Validate an array's maximum item count.
 * @param value 未受信任的数组 / Untrusted array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumItems 最大元素数 / Maximum item count.
 * @return 已验证数组 / Validated array.
 */
function boundedArray(value: unknown, path: string, maximumItems: number): readonly unknown[] {
  /** @brief 已解码数组 / Decoded array. */
  const decoded = array(value, path)
  if (decoded.length > maximumItems) {
    throw new HttpContractError(
      `Backend field ${path} must contain at most ${maximumItems} item(s).`,
      200
    )
  }
  return decoded
}

/**
 * @brief 无损解码冻结 Schema 允许的任意 JSON 模板值 / Losslessly decode any JSON template value allowed by the frozen Schema.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 不含 undefined、非有限数或非 JSON 类型的递归值 / Recursive value without undefined, non-finite numbers, or non-JSON types.
 */
function parseTemplateJsonValue(value: unknown, path: string): UiTemplateSettingValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return number(value, path)
  if (Array.isArray(value)) {
    return value.map((item, index) => parseTemplateJsonValue(item, `${path}[${index}]`))
  }
  /** @brief 逐属性递归验证的 JSON 对象 / JSON object validated recursively property by property. */
  const input = record(value, path)
  return Object.fromEntries(
    Object.entries(input).map(([key, item]) => [
      key,
      parseTemplateJsonValue(item, `${path}.${key}`)
    ])
  )
}

/**
 * @brief 解析 operation 拒绝的安全稳定字段 / Parse safe stable fields of an operation rejection.
 * @param value 未受信任的 ProblemDetails / Untrusted ProblemDetails.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 不包含 title、detail 或违规值的投影 / Projection excluding title, detail, and rejected values.
 */
function parseResumeOperationProblem(value: unknown, path: string): ResumeOperationProblemDto {
  /** @brief 通过共享冻结 Schema 校验后的 ProblemDetails / ProblemDetails validated through the shared frozen schema. */
  const problem = parseProblemDetails(value)
  if (problem === null) {
    throw new HttpContractError(`Backend field ${path} must match ProblemDetails.`, 200)
  }
  return {
    code: problem.code,
    retryable: problem.retryable,
    status: problem.status
  }
}

/** @brief 校验模板区域 / Validate a template zone. */
function parseTemplateZone(value: unknown, path: string): TemplateZoneDto {
  /** @brief 不含契约外字段的模板区域 / Template zone without out-of-contract fields. */
  const input = exactRecord(value, path, [
    'zone_id',
    'label_key',
    'accepted_section_kinds',
    'max_sections'
  ])
  return {
    accepted_section_kinds: templateStringArray(
      input.accepted_section_kinds,
      `${path}.accepted_section_kinds`,
      { minimumItems: 1, unique: true }
    ),
    label_key: stableCode(input.label_key, `${path}.label_key`),
    max_sections:
      input.max_sections === null || input.max_sections === undefined
        ? null
        : positiveInteger(input.max_sections, `${path}.max_sections`),
    zone_id: patternedString(input.zone_id, `${path}.zone_id`, TEMPLATE_ZONE_ID_PATTERN)
  }
}

/** @brief 校验模板设置选项 / Validate a template-setting choice. */
function parseTemplateChoice(value: unknown, path: string): TemplateChoiceDto {
  /** @brief 不含契约外字段的模板选项 / Template choice without out-of-contract fields. */
  const input = exactRecord(value, path, ['value', 'label_key', 'description_key'])
  return {
    description_key:
      input.description_key === null || input.description_key === undefined
        ? null
        : stableCode(input.description_key, `${path}.description_key`),
    label_key: stableCode(input.label_key, `${path}.label_key`),
    value: parseTemplateJsonValue(input.value, `${path}.value`)
  }
}

/**
 * @brief 校验模板设置的条件可见性 / Validate conditional visibility for a template setting.
 * @param value 未受信任的可见性对象 / Untrusted visibility object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证可见性 DTO / Validated visibility DTO.
 */
function parseTemplateSettingVisibility(
  value: unknown,
  path: string
): TemplateSettingVisibilityDto {
  /** @brief 不含契约外字段的可见性对象 / Visibility object without out-of-contract fields. */
  const input = exactRecord(value, path, ['key', 'equals'])
  return {
    equals: parseTemplateJsonValue(input.equals, `${path}.equals`),
    key: string(input.key, `${path}.key`)
  }
}

/** @brief 校验模板设置定义 / Validate a template-setting definition. */
function parseTemplateSetting(value: unknown, path: string): TemplateSettingDefinitionDto {
  /** @brief 不含契约外字段的设置定义 / Setting definition without out-of-contract fields. */
  const input = exactRecord(value, path, [
    'key',
    'label_key',
    'description_key',
    'value_type',
    'default',
    'minimum',
    'maximum',
    'choices',
    'ui_control',
    'group_key',
    'visible_when'
  ])
  /** @brief 声明值类型 / Declared value type. */
  const valueType = templateEnum(input.value_type, `${path}.value_type`, TEMPLATE_VALUE_TYPES)
  /** @brief 声明 UI 控件 / Declared UI control. */
  const control = templateEnum(input.ui_control, `${path}.ui_control`, TEMPLATE_CONTROLS)

  /** @brief 最小语义值 / Minimum semantic value. */
  const minimum = nullableNumber(input.minimum, `${path}.minimum`)
  /** @brief 最大语义值 / Maximum semantic value. */
  const maximum = nullableNumber(input.maximum, `${path}.maximum`)

  /** @brief 已验证默认值 / Validated default value. */
  const defaultValue = parseTemplateJsonValue(input.default, `${path}.default`)

  /** @brief 已验证选项 / Validated choices. */
  const choices = boundedArray(input.choices ?? [], `${path}.choices`, 100).map((item, index) =>
    parseTemplateChoice(item, `${path}.choices[${index}]`)
  )

  return {
    choices,
    default: defaultValue,
    description_key:
      input.description_key === null || input.description_key === undefined
        ? null
        : stableCode(input.description_key, `${path}.description_key`),
    group_key:
      input.group_key === null || input.group_key === undefined
        ? null
        : stableCode(input.group_key, `${path}.group_key`),
    key: stableCode(input.key, `${path}.key`),
    label_key: stableCode(input.label_key, `${path}.label_key`),
    maximum,
    minimum,
    ui_control: control,
    value_type: valueType,
    visible_when:
      input.visible_when === null || input.visible_when === undefined
        ? null
        : parseTemplateSettingVisibility(input.visible_when, `${path}.visible_when`)
  }
}

/**
 * @brief 校验模板清单 / Validate a template manifest.
 * @param value 未受信任的模板数据 / Untrusted template data.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证的模板 DTO / Validated template DTO.
 */
export function parseTemplateManifestDto(value: unknown, path = 'response'): TemplateManifestDto {
  /** @brief 不含契约外字段的清单 / Manifest without out-of-contract fields. */
  const input = exactRecord(value, path, [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'template_version',
    'name',
    'description',
    'preview_asset_url',
    'supported_locales',
    'supported_page_sizes',
    'supported_output_formats',
    'supported_section_kinds',
    'zones',
    'font_family_tokens',
    'date_format_tokens',
    'bullet_style_tokens',
    'settings',
    'capabilities',
    'extensions'
  ])
  /** @brief 不含契约外字段的能力对象 / Capabilities object without out-of-contract fields. */
  const capabilities = exactRecord(input.capabilities, `${path}.capabilities`, [
    'supports_photo',
    'supports_sidebar',
    'supports_custom_sections',
    'supports_source_map',
    'max_columns'
  ])
  /** @brief 最大列数 / Maximum column count. */
  const maxColumns = integer(capabilities.max_columns, `${path}.capabilities.max_columns`)
  if (maxColumns < 1 || maxColumns > 4) {
    throw new HttpContractError(
      `Backend field ${path}.capabilities.max_columns must be between 1 and 4.`,
      200
    )
  }
  if (input.extensions !== undefined) {
    extensions(input.extensions, `${path}.extensions`)
  }

  /** @brief 模板设置数组 / Template-setting array. */
  const settings = boundedArray(input.settings, `${path}.settings`, 200)
  /** @brief 至少包含一个区域的数组 / Array containing at least one zone. */
  const zones = array(input.zones, `${path}.zones`)
  if (zones.length === 0) {
    throw new HttpContractError(`Backend field ${path}.zones must contain at least 1 item.`, 200)
  }
  return {
    bullet_style_tokens: templateStringArray(
      input.bullet_style_tokens,
      `${path}.bullet_style_tokens`,
      { maximumLength: 100, minimumItems: 1, minimumLength: 1, unique: true }
    ),
    capabilities: {
      max_columns: maxColumns,
      supports_custom_sections: boolean(
        capabilities.supports_custom_sections,
        `${path}.capabilities.supports_custom_sections`
      ),
      supports_photo: boolean(capabilities.supports_photo, `${path}.capabilities.supports_photo`),
      supports_sidebar: boolean(
        capabilities.supports_sidebar,
        `${path}.capabilities.supports_sidebar`
      ),
      supports_source_map: boolean(
        capabilities.supports_source_map,
        `${path}.capabilities.supports_source_map`
      )
    },
    created_at: timestamp(input.created_at, `${path}.created_at`),
    date_format_tokens: templateStringArray(
      input.date_format_tokens,
      `${path}.date_format_tokens`,
      { maximumLength: 100, minimumItems: 1, minimumLength: 1, unique: true }
    ),
    description:
      input.description === undefined
        ? null
        : input.description === null
          ? null
          : boundedString(input.description, `${path}.description`, 0, 2000),
    font_family_tokens: templateStringArray(
      input.font_family_tokens,
      `${path}.font_family_tokens`,
      { maximumLength: 100, minimumItems: 1, minimumLength: 1, unique: true }
    ),
    id: opaqueId(input.id, `${path}.id`),
    name: boundedString(input.name, `${path}.name`, 1, 200),
    preview_asset_url:
      input.preview_asset_url === undefined
        ? null
        : input.preview_asset_url === null
          ? null
          : absoluteUri(input.preview_asset_url, `${path}.preview_asset_url`),
    revision: positiveInteger(input.revision, `${path}.revision`),
    settings: settings.map((item, index) =>
      parseTemplateSetting(item, `${path}.settings[${index}]`)
    ),
    supported_locales: templateStringArray(input.supported_locales, `${path}.supported_locales`, {
      minimumItems: 1,
      pattern: TEMPLATE_LOCALE_PATTERN,
      unique: true
    }),
    supported_output_formats: templateStringArray(
      input.supported_output_formats,
      `${path}.supported_output_formats`,
      { allowed: TEMPLATE_OUTPUT_FORMATS, minimumItems: 1, unique: true }
    ),
    supported_page_sizes: templateStringArray(
      input.supported_page_sizes,
      `${path}.supported_page_sizes`,
      { allowed: TEMPLATE_PAGE_SIZES, minimumItems: 1, unique: true }
    ),
    supported_section_kinds: templateStringArray(
      input.supported_section_kinds,
      `${path}.supported_section_kinds`,
      { minimumItems: 1, unique: true }
    ),
    template_version: boundedString(input.template_version, `${path}.template_version`, 1, 128),
    updated_at: timestamp(input.updated_at, `${path}.updated_at`),
    zones: zones.map((item, index) => parseTemplateZone(item, `${path}.zones[${index}]`))
  }
}

/** @brief 校验模板目录响应 / Validate a template-catalog response. */
export function parseTemplateManifestListDto(value: unknown): PaginatedDto<TemplateManifestDto> {
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) =>
      parseTemplateManifestDto(item, `items[${index}]`)
    ),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验测量值 / Validate a measurement. */
function parseMeasurement(value: unknown, path: string): MeasurementDto {
  const input = record(value, path)
  return { unit: string(input.unit, `${path}.unit`), value: number(input.value, `${path}.value`) }
}

/**
 * @brief 校验可选测量值 / Validate an optional measurement.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 测量值或 null / Measurement or null.
 */
function nullableMeasurement(value: unknown, path: string): MeasurementDto | null {
  return value === null || value === undefined ? null : parseMeasurement(value, path)
}

/** @brief 校验颜色值 / Validate a color value. */
function parseColor(value: unknown, path: string): ColorValueDto {
  const input = record(value, path)
  return {
    space: string(input.space, `${path}.space`),
    value: string(input.value, `${path}.value`)
  }
}

/** @brief 校验富文本的页面所需投影 / Validate the page-required RichText projection. */
function parseRichText(value: unknown, path: string): RichTextDto {
  const input = record(value, path)
  array(input.blocks, `${path}.blocks`)
  return { plain_text: nullableString(input.plain_text, `${path}.plain_text`) }
}

/** @brief 校验联系信息 / Validate a contact method. */
function parseContact(value: unknown, path: string): ResumeContactDto {
  const input = record(value, path)
  string(input.contact_id, `${path}.contact_id`)
  return {
    is_public: boolean(input.is_public, `${path}.is_public`),
    kind: string(input.kind, `${path}.kind`),
    label: nullableString(input.label, `${path}.label`),
    value: string(input.value, `${path}.value`)
  }
}

/** @brief 校验多态简历条目的公共边界 / Validate the common boundary of a polymorphic Resume item. */
function parseResumeItem(value: unknown, path: string): ResumeItemDto {
  const input = record(value, path)
  return {
    item_id: string(input.item_id, `${path}.item_id`),
    item_kind: string(input.item_kind, `${path}.item_kind`),
    raw: input,
    tags: stringArray(input.tags ?? [], `${path}.tags`),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/** @brief 校验简历区段 / Validate a Resume section. */
function parseResumeSection(value: unknown, path: string): ResumeSectionDto {
  const input = record(value, path)
  const content = nullableRecord(input.content, `${path}.content`)
  return {
    content: content === null ? null : parseRichText(content, `${path}.content`),
    items: array(input.items, `${path}.items`).map((item, index) =>
      parseResumeItem(item, `${path}.items[${index}]`)
    ),
    kind: string(input.kind, `${path}.kind`),
    section_id: string(input.section_id, `${path}.section_id`),
    title: string(input.title, `${path}.title`),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/** @brief 校验 ResumeDocument / Validate a ResumeDocument. */
export function parseResumeDocumentDto(value: unknown): ResumeDocumentDto {
  const input = record(value, 'resume')
  const template = record(input.template, 'resume.template')
  const profile = record(input.profile, 'resume.profile')
  const style = record(input.style_intent, 'resume.style_intent')
  const page = record(style.page, 'resume.style_intent.page')
  const margins = record(page.margins, 'resume.style_intent.page.margins')
  const typography = record(style.typography, 'resume.style_intent.typography')
  const palette = record(style.palette, 'resume.style_intent.palette')
  const schemaVersion = string(input.schema_version, 'resume.schema_version')
  const styleVersion = string(
    style.style_contract_version,
    'resume.style_intent.style_contract_version'
  )
  if (schemaVersion !== '1.0' || styleVersion !== '1.0') {
    throw new HttpContractError('Backend ResumeDocument uses an unsupported schema version.', 200)
  }

  return {
    created_at: string(input.created_at, 'resume.created_at'),
    id: string(input.id, 'resume.id'),
    knowledge_source_id: nullableString(input.knowledge_source_id, 'resume.knowledge_source_id'),
    locale: string(input.locale, 'resume.locale'),
    profile: {
      contacts: array(profile.contacts, 'resume.profile.contacts').map((item, index) =>
        parseContact(item, `resume.profile.contacts[${index}]`)
      ),
      full_name: string(profile.full_name, 'resume.profile.full_name'),
      headline: nullableString(profile.headline, 'resume.profile.headline'),
      summary:
        nullableRecord(profile.summary, 'resume.profile.summary') === null
          ? null
          : parseRichText(profile.summary, 'resume.profile.summary')
    },
    revision: positiveInteger(input.revision, 'resume.revision'),
    schema_version: schemaVersion,
    sections: array(input.sections, 'resume.sections').map((item, index) =>
      parseResumeSection(item, `resume.sections[${index}]`)
    ),
    style_intent: {
      bullet_style_token: string(
        style.bullet_style_token,
        'resume.style_intent.bullet_style_token'
      ),
      date_format_token: string(style.date_format_token, 'resume.style_intent.date_format_token'),
      density: number(style.density, 'resume.style_intent.density'),
      extensions:
        style.extensions === undefined
          ? {}
          : extensions(style.extensions, 'resume.style_intent.extensions'),
      page: {
        custom_height: nullableMeasurement(
          page.custom_height,
          'resume.style_intent.page.custom_height'
        ),
        custom_width: nullableMeasurement(
          page.custom_width,
          'resume.style_intent.page.custom_width'
        ),
        margins: {
          bottom: parseMeasurement(margins.bottom, 'resume.style_intent.page.margins.bottom'),
          left: parseMeasurement(margins.left, 'resume.style_intent.page.margins.left'),
          right: parseMeasurement(margins.right, 'resume.style_intent.page.margins.right'),
          top: parseMeasurement(margins.top, 'resume.style_intent.page.margins.top')
        },
        max_pages: nullableNumber(page.max_pages, 'resume.style_intent.page.max_pages'),
        orientation: string(page.orientation, 'resume.style_intent.page.orientation'),
        show_page_numbers: boolean(
          page.show_page_numbers,
          'resume.style_intent.page.show_page_numbers'
        ),
        size: string(page.size, 'resume.style_intent.page.size')
      },
      palette: {
        background: parseColor(palette.background, 'resume.style_intent.palette.background'),
        muted_text: parseColor(palette.muted_text, 'resume.style_intent.palette.muted_text'),
        primary: parseColor(palette.primary, 'resume.style_intent.palette.primary'),
        secondary: parseColor(palette.secondary, 'resume.style_intent.palette.secondary'),
        text: parseColor(palette.text, 'resume.style_intent.palette.text')
      },
      section_layout: array(style.section_layout, 'resume.style_intent.section_layout').map(
        (item, index) => {
          const layout = record(item, `resume.style_intent.section_layout[${index}]`)
          return {
            compactness: number(
              layout.compactness,
              `resume.style_intent.section_layout[${index}].compactness`
            ),
            heading_style_token: nullableString(
              layout.heading_style_token,
              `resume.style_intent.section_layout[${index}].heading_style_token`
            ),
            keep_together: boolean(
              layout.keep_together,
              `resume.style_intent.section_layout[${index}].keep_together`
            ),
            page_break_before: boolean(
              layout.page_break_before,
              `resume.style_intent.section_layout[${index}].page_break_before`
            ),
            section_id: string(
              layout.section_id,
              `resume.style_intent.section_layout[${index}].section_id`
            ),
            zone: string(layout.zone, `resume.style_intent.section_layout[${index}].zone`)
          }
        }
      ),
      style_contract_version: styleVersion,
      template_settings: Object.fromEntries(
        Object.entries(
          record(style.template_settings, 'resume.style_intent.template_settings')
        ).map(([key, settingValue]) => [
          key,
          parseTemplateJsonValue(settingValue, `resume.style_intent.template_settings.${key}`)
        ])
      ),
      typography: {
        base_size_pt: number(
          typography.base_size_pt,
          'resume.style_intent.typography.base_size_pt'
        ),
        font_family_token: string(
          typography.font_family_token,
          'resume.style_intent.typography.font_family_token'
        ),
        heading_scale: number(
          typography.heading_scale,
          'resume.style_intent.typography.heading_scale'
        ),
        letter_spacing_em: number(
          typography.letter_spacing_em,
          'resume.style_intent.typography.letter_spacing_em'
        ),
        line_height: number(typography.line_height, 'resume.style_intent.typography.line_height')
      }
    },
    template: {
      template_id: string(template.template_id, 'resume.template.template_id'),
      template_version: string(template.template_version, 'resume.template.template_version')
    },
    title: string(input.title, 'resume.title'),
    updated_at: string(input.updated_at, 'resume.updated_at'),
    workspace_id: string(input.workspace_id, 'resume.workspace_id')
  }
}

/** @brief 校验 ResumeDocument 列表 / Validate a ResumeDocument list. */
export function parseResumeListDto(value: unknown): PaginatedDto<ResumeDocumentDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map((item) => parseResumeDocumentDto(item)),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验 Resume operation 批次结果 / Validate a Resume operation batch result. */
export function parseResumeOperationBatchResultDto(value: unknown): ResumeOperationBatchResultDto {
  const input = exactRecord(value, 'operationResult', [
    'resume_id',
    'previous_revision',
    'new_revision',
    'results',
    'normalized_document',
    'render_job'
  ])
  const normalized = nullableRecord(
    input.normalized_document,
    'operationResult.normalized_document'
  )
  const results = array(input.results, 'operationResult.results').map((item, index) => {
    const result = exactRecord(item, `operationResult.results[${index}]`, [
      'operation_id',
      'status',
      'problem'
    ])
    const status = string(result.status, `operationResult.results[${index}].status`)
    if (!['applied', 'deduplicated', 'rebased', 'rejected'].includes(status)) {
      throw new HttpContractError('Backend returned an unsupported operation status.', 200)
    }
    return {
      operation_id: opaqueId(result.operation_id, `operationResult.results[${index}].operation_id`),
      problem:
        result.problem === undefined || result.problem === null
          ? null
          : parseResumeOperationProblem(
              result.problem,
              `operationResult.results[${index}].problem`
            ),
      status: status as ResumeOperationBatchResultDto['results'][number]['status']
    }
  })
  if (results.length === 0) {
    throw new HttpContractError('Backend operation result must contain at least one result.', 200)
  }
  if (input.render_job !== undefined && input.render_job !== null) {
    record(input.render_job, 'operationResult.render_job')
  }
  return {
    new_revision: positiveInteger(input.new_revision, 'operationResult.new_revision'),
    normalized_document: normalized === null ? null : parseResumeDocumentDto(normalized),
    previous_revision: positiveInteger(
      input.previous_revision,
      'operationResult.previous_revision'
    ),
    results,
    resume_id: opaqueId(input.resume_id, 'operationResult.resume_id')
  }
}

/**
 * @brief 解析可选正整数 / Parse an optional positive integer.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 正整数或 null / Positive integer or null.
 */
function nullablePositiveInteger(value: unknown, path: string): number | null {
  return value === null || value === undefined ? null : positiveInteger(value, path)
}

/**
 * @brief 解析可选 RFC 3339 时间戳 / Parse an optional RFC 3339 timestamp.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 时间戳或 null / Timestamp or null.
 */
function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : timestamp(value, path)
}

/**
 * @brief 校验可选 Extensions bag / Validate an optional Extensions bag.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateOptionalExtensions(value: unknown, path: string): void {
  if (value !== undefined) extensions(value, path)
}

/**
 * @brief 校验冻结 LocalizedMessage / Validate a frozen LocalizedMessage.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateLocalizedMessage(value: unknown, path: string): void {
  const input = exactRecord(value, path, ['message_key', 'fallback_message', 'params'])
  stableCode(input.message_key, `${path}.message_key`)
  const fallbackMessage = string(input.fallback_message, `${path}.fallback_message`)
  if (fallbackMessage.length < 1 || fallbackMessage.length > 2_000) {
    throw new HttpContractError(`Backend field ${path}.fallback_message has invalid length.`, 200)
  }
  if (input.params !== undefined) record(input.params, `${path}.params`)
}

/**
 * @brief 校验一个 RenderDiagnostic / Validate one RenderDiagnostic.
 * @param value 未知诊断项 / Unknown diagnostic item.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateRenderDiagnostic(value: unknown, path: string): void {
  const input = exactRecord(value, path, [
    'severity',
    'code',
    'message',
    'node_ref',
    'field_path',
    'page',
    'suggested_operations'
  ])
  const severity = string(input.severity, `${path}.severity`)
  if (!['info', 'warning', 'error'].includes(severity)) {
    throw new HttpContractError(`Backend field ${path}.severity is unsupported.`, 200)
  }
  stableCode(input.code, `${path}.code`)
  validateLocalizedMessage(input.message, `${path}.message`)
  if (input.node_ref !== undefined && input.node_ref !== null) {
    const nodeRef = exactRecord(input.node_ref, `${path}.node_ref`, [
      'resource_type',
      'id',
      'revision'
    ])
    stableCode(nodeRef.resource_type, `${path}.node_ref.resource_type`)
    opaqueId(nodeRef.id, `${path}.node_ref.id`)
    nullablePositiveInteger(nodeRef.revision, `${path}.node_ref.revision`)
  }
  if (input.field_path !== undefined) {
    const fieldPath = stringArray(input.field_path, `${path}.field_path`)
    if (fieldPath.length > 20) {
      throw new HttpContractError(`Backend field ${path}.field_path is too long.`, 200)
    }
  }
  nullablePositiveInteger(input.page, `${path}.page`)
  if (input.suggested_operations !== undefined) {
    const operations = array(input.suggested_operations, `${path}.suggested_operations`)
    if (operations.length > 20) {
      throw new HttpContractError(`Backend field ${path}.suggested_operations is too long.`, 200)
    }
    operations.forEach((operation, index) => {
      record(operation, `${path}.suggested_operations[${index}]`)
    })
  }
}

/** @brief 校验 Render artifact / Validate a Render artifact. */
export function parseRenderArtifactDto(value: unknown): RenderArtifactDto {
  /** @brief 共享冻结契约解码后的产物元数据 / Artifact metadata decoded by the shared frozen-contract boundary. */
  let artifact: ReturnType<typeof parseRenderArtifactMetadata>
  try {
    artifact = parseRenderArtifactMetadata(value)
  } catch {
    throw new HttpContractError('Backend returned invalid RenderArtifact metadata.', 200)
  }

  /** @brief 不含参数且规范化大小写的 MIME essence / MIME essence without parameters and with normalized casing. */
  const contentTypeEssence = artifact.content_type.split(';', 1)[0]?.trim().toLowerCase()
  if (artifact.format === 'pdf' && contentTypeEssence !== 'application/pdf') {
    throw new HttpContractError(
      'Backend PDF artifact must declare the application/pdf media type.',
      200
    )
  }

  /** @brief 为现有 transport 投影将契约可选字段规范化为 null / Optional contract fields normalized to null for the existing transport projection. */
  const expiresAt = artifact.expires_at ?? null
  /** @brief 规范化后的可选页数 / Normalized optional page count. */
  const pageCount = artifact.page_count ?? null
  /** @brief 规范化后的可选 source-map 产物 ID / Normalized optional source-map artifact ID. */
  const sourceMapArtifactId = artifact.source_map_artifact_id ?? null

  return {
    content_type: artifact.content_type,
    created_at: artifact.created_at,
    download_url: artifact.download_url,
    expires_at: expiresAt,
    format: artifact.format,
    id: artifact.id,
    page_count: pageCount,
    resume_id: artifact.resume_id,
    resume_revision: artifact.resume_revision,
    revision: artifact.revision,
    sha256: artifact.sha256,
    size_bytes: artifact.size_bytes,
    source_map_artifact_id: sourceMapArtifactId,
    updated_at: artifact.updated_at
  }
}

/** @brief 校验 Resume Render Job / Validate a Resume Render Job. */
export function parseResumeRenderJobDto(value: unknown): ResumeRenderJobDto {
  const input = exactRecord(value, 'renderJob', [
    'id',
    'job_type',
    'status',
    'progress',
    'created_at',
    'started_at',
    'finished_at',
    'expires_at',
    'error',
    'request_id',
    'extensions',
    'resume_id',
    'resume_revision',
    'artifacts',
    'diagnostics'
  ])
  const progress = exactRecord(input.progress, 'renderJob.progress', [
    'phase',
    'completed_units',
    'total_units',
    'percent',
    'message'
  ])
  /** @brief 开放枚举约束下经过格式校验的 Render Job 状态 / Format-validated Render Job status under the open-enum contract. */
  const status = stableCode(input.status, 'renderJob.status')
  if (string(input.job_type, 'renderJob.job_type') !== 'resume.render') {
    throw new HttpContractError('Backend returned a non-Resume Render Job.', 200)
  }
  timestamp(input.created_at, 'renderJob.created_at')
  nullableTimestamp(input.started_at, 'renderJob.started_at')
  nullableTimestamp(input.finished_at, 'renderJob.finished_at')
  nullableTimestamp(input.expires_at, 'renderJob.expires_at')
  if (
    input.error !== undefined &&
    input.error !== null &&
    parseProblemDetails(input.error) === null
  ) {
    throw new HttpContractError('Backend renderJob.error must match ProblemDetails.', 200)
  }
  if (
    input.request_id !== undefined &&
    input.request_id !== null &&
    (typeof input.request_id !== 'string' ||
      input.request_id.length < 8 ||
      input.request_id.length > 128)
  ) {
    throw new HttpContractError('Backend renderJob.request_id has invalid length.', 200)
  }
  validateOptionalExtensions(input.extensions, 'renderJob.extensions')
  const diagnostics = array(input.diagnostics, 'renderJob.diagnostics')
  if (diagnostics.length > 1_000) {
    throw new HttpContractError('Backend renderJob.diagnostics is too long.', 200)
  }
  diagnostics.forEach((diagnostic, index) => {
    validateRenderDiagnostic(diagnostic, `renderJob.diagnostics[${index}]`)
  })
  const completedUnits = nonNegativeInteger(
    progress.completed_units,
    'renderJob.progress.completed_units'
  )
  const percent = nullableNumber(progress.percent, 'renderJob.progress.percent')
  if (percent !== null && (percent < 0 || percent > 100)) {
    throw new HttpContractError('Backend renderJob.progress.percent is out of range.', 200)
  }
  stableCode(progress.phase, 'renderJob.progress.phase')
  if (progress.message !== undefined && progress.message !== null) {
    validateLocalizedMessage(progress.message, 'renderJob.progress.message')
  }
  return {
    artifacts: array(input.artifacts, 'renderJob.artifacts').map(parseRenderArtifactDto),
    id: opaqueId(input.id, 'renderJob.id'),
    progress: {
      completed_units: completedUnits,
      percent,
      phase: string(progress.phase, 'renderJob.progress.phase'),
      total_units: nullablePositiveInteger(progress.total_units, 'renderJob.progress.total_units')
    },
    resume_id: opaqueId(input.resume_id, 'renderJob.resume_id'),
    resume_revision: positiveInteger(input.resume_revision, 'renderJob.resume_revision'),
    status
  }
}
