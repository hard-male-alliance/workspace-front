/** @file Resume HTTP JSON 的运行时校验 / Runtime validation for Resume HTTP JSON. */

import { parseRenderArtifactMetadata } from '@ai-job-workspace/platform'

import {
  absoluteUri,
  array,
  boolean,
  boundedArray,
  boundedInteger,
  boundedNumber,
  boundedString,
  exactRecord,
  extensions,
  integer,
  nonNegativeInteger,
  nullableNumber,
  nullableRecord,
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
import { validateRichText } from '../../../../infrastructure/http/rich-text-validator'
import type { UiTemplateSettingValue } from '../../domain/models'
import type {
  ColorValueDto,
  MeasurementDto,
  ResumeContactDto,
  ResumeDateRangeDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumeOperationBatchResultDto,
  ResumeOperationProblemDto,
  ResumePartialDateDto,
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

/** @brief Resume 测量单位 / Resume measurement units. */
const RESUME_MEASUREMENT_UNITS = ['pt', 'mm', 'cm', 'in', 'px', 'em', 'percent'] as const

/** @brief Resume 联系信息类别 / Resume contact kinds. */
const RESUME_CONTACT_KINDS = [
  'email',
  'phone',
  'website',
  'linkedin',
  'github',
  'portfolio',
  'location',
  'other'
] as const

/** @brief Resume 条目类别 / Resume item kinds. */
const RESUME_ITEM_KINDS = [
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
] as const

/** @brief Resume operation 的冻结判别值 / Frozen discriminants for Resume operations. */
const RESUME_OPERATION_KINDS = [
  'set_template',
  'upsert_section',
  'remove_section',
  'move_section',
  'upsert_item',
  'remove_item',
  'move_item',
  'set_field',
  'set_style_intent',
  'replace_document'
] as const

/** @brief set_field 目标实体的冻结枚举 / Frozen target-entity enum for set_field. */
const RESUME_ENTITY_TYPES = ['resume', 'profile', 'section', 'item'] as const

/** @brief set_field 路径段格式 / set_field path-segment format. */
const RESUME_FIELD_SEGMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** @brief Resume 颜色字面值格式 / Resume color-literal format. */
const RESUME_COLOR_PATTERN = /^(?:#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|rgba\([^)]+\))$/u

/**
 * @brief 解析可空且有界的字符串 / Parse a nullable bounded string.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumLength 最小字符数 / Minimum character count.
 * @param maximumLength 最大字符数 / Maximum character count.
 * @return 有界字符串或 null / Bounded string or null.
 */
function nullableBoundedString(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): string | null {
  return value === null || value === undefined
    ? null
    : boundedString(value, path, minimumLength, maximumLength)
}

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
 * @brief 无损解码冻结 Schema 允许的任意 JSON 模板值 / Losslessly decode any JSON template value allowed by the frozen Schema.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 不含 undefined、非有限数或非 JSON 类型的递归值 / Recursive value without undefined, non-finite numbers, or non-JSON types.
 */
function parseTemplateJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object> = new WeakSet<object>()
): UiTemplateSettingValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return number(value, path)
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new HttpContractError(`Backend field ${path} must be acyclic JSON.`, 200)
    }
    /** @brief 数组自身属性必须与 JSON.parse 产物一致 / Array own properties must match a JSON.parse product. */
    const ownKeys = Reflect.ownKeys(value)
    if (
      ownKeys.length !== value.length + 1 ||
      ownKeys.some(
        (key) =>
          key !== 'length' &&
          (typeof key !== 'string' ||
            !/^(?:0|[1-9][0-9]*)$/u.test(key) ||
            Number(key) >= value.length)
      )
    ) {
      throw new HttpContractError(`Backend field ${path} must be a dense JSON array.`, 200)
    }
    ancestors.add(value)
    try {
      return value.map((item, index) =>
        parseTemplateJsonValue(item, `${path}[${index}]`, ancestors)
      )
    } finally {
      ancestors.delete(value)
    }
  }
  /** @brief 逐属性递归验证的 JSON 对象 / JSON object validated recursively property by property. */
  const input = record(value, path)
  /** @brief JSON 对象只允许普通或无原型对象 / JSON objects permit only ordinary or null prototypes. */
  const prototype = Object.getPrototypeOf(input) as object | null
  if (prototype !== Object.prototype && prototype !== null) {
    throw new HttpContractError(`Backend field ${path} must be a JSON object.`, 200)
  }
  if (ancestors.has(input)) {
    throw new HttpContractError(`Backend field ${path} must be acyclic JSON.`, 200)
  }
  /** @brief JSON.parse 产物只含可枚举字符串数据属性 / JSON.parse products contain enumerable string data properties only. */
  const ownKeys = Reflect.ownKeys(input)
  /** @brief 对象自身属性描述符 / Object-own property descriptors. */
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    ownKeys.some((key) => {
      if (typeof key !== 'string') return true
      /** @brief 当前字符串属性描述符 / Current string-property descriptor. */
      const descriptor = descriptors[key]
      return descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)
    })
  ) {
    throw new HttpContractError(`Backend field ${path} must contain JSON properties only.`, 200)
  }
  ancestors.add(input)
  try {
    return Object.fromEntries(
      Object.entries(input).map(([key, item]) => [
        key,
        parseTemplateJsonValue(item, `${path}.${key}`, ancestors)
      ])
    )
  } finally {
    ancestors.delete(input)
  }
}

/**
 * @brief 校验并无损投影 Extensions 的任意 JSON 值 / Validate and losslessly project arbitrary JSON values in Extensions.
 * @param value 未受信任的扩展对象 / Untrusted extension object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 键和值均符合冻结契约的扩展对象 / Extension object whose keys and values satisfy the frozen contract.
 */
function parseJsonExtensions(
  value: unknown,
  path: string
): Readonly<Record<string, UiTemplateSettingValue>> {
  /** @brief 已校验命名空间键的扩展对象 / Extension object with validated namespaced keys. */
  const input = extensions(value, path)
  return Object.fromEntries(
    Object.entries(input).map(([key, item]) => [
      key,
      parseTemplateJsonValue(item, `${path}.${key}`)
    ])
  )
}

/**
 * @brief 校验并无损投影开放 JSON 对象 / Validate and losslessly project an open JSON object.
 * @param value 未受信任对象 / Untrusted object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 仅含合法 JSON 值的对象 / Object containing only valid JSON values.
 */
function parseOpenJsonObject(
  value: unknown,
  path: string
): Readonly<Record<string, UiTemplateSettingValue>> {
  /** @brief 由 object Schema 约束的输入 / Input constrained by an object Schema. */
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
  const choices = boundedArray(
    input.choices === undefined ? [] : input.choices,
    `${path}.choices`,
    0,
    100
  ).map((item, index) => parseTemplateChoice(item, `${path}.choices[${index}]`))

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
  const settings = boundedArray(input.settings, `${path}.settings`, 0, 200)
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
  const input = exactRecord(value, path, ['value', 'unit'])
  return {
    unit: templateEnum(input.unit, `${path}.unit`, RESUME_MEASUREMENT_UNITS),
    value: boundedNumber(input.value, `${path}.value`, 0, Number.MAX_VALUE)
  }
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
  const input = exactRecord(value, path, ['space', 'value'])
  return {
    space: templateEnum(input.space, `${path}.space`, ['srgb_hex', 'rgba'] as const),
    value: patternedString(input.value, `${path}.value`, RESUME_COLOR_PATTERN)
  }
}

/** @brief ResumeItem 的公共字段名 / Common ResumeItem field names. */
const RESUME_ITEM_COMMON_KEYS = ['item_id', 'visible', 'links', 'tags', 'extensions'] as const

/** @brief 技能熟练度枚举 / Skill-proficiency enum. */
const SKILL_PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert', 'native'] as const

/** @brief 语言熟练度枚举 / Language-proficiency enum. */
const LANGUAGE_PROFICIENCIES = [
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native'
] as const

/** @brief 校验富文本并提取安全纯文本投影 / Validate RichText and extract its safe plain-text projection. */
function parseRichText(value: unknown, path: string): RichTextDto {
  return { plain_text: validateRichText(value, path) }
}

/**
 * @brief 校验可选 RichText / Validate optional RichText.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 富文本投影或 null / RichText projection or null.
 */
function parseNullableRichText(value: unknown, path: string): RichTextDto | null {
  return value === null || value === undefined ? null : parseRichText(value, path)
}

/**
 * @brief 校验 RichText 数组 / Validate an array of RichText values.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @return 已验证富文本投影 / Validated RichText projections.
 */
function parseRichTextArray(
  value: unknown,
  path: string,
  maximumItems: number
): readonly RichTextDto[] {
  return boundedArray(value === undefined ? [] : value, path, 0, maximumItems).map((item, index) =>
    parseRichText(item, `${path}[${index}]`)
  )
}

/**
 * @brief 校验不完整日期 / Validate a PartialDate.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证日期 / Validated partial date.
 */
function parsePartialDate(value: unknown, path: string): ResumePartialDateDto {
  /** @brief 精确日期对象 / Exact date object. */
  const input = exactRecord(value, path, ['year', 'month', 'day', 'precision'])
  return {
    day:
      input.day === null || input.day === undefined
        ? null
        : boundedInteger(input.day, `${path}.day`, 1, 31),
    month:
      input.month === null || input.month === undefined
        ? null
        : boundedInteger(input.month, `${path}.month`, 1, 12),
    precision: stableCode(input.precision, `${path}.precision`),
    year: boundedInteger(input.year, `${path}.year`, 1900, 2200)
  }
}

/**
 * @brief 校验可选不完整日期 / Validate an optional PartialDate.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证日期或 null / Validated partial date or null.
 */
function parseNullablePartialDate(value: unknown, path: string): ResumePartialDateDto | null {
  return value === null || value === undefined ? null : parsePartialDate(value, path)
}

/**
 * @brief 校验日期范围 / Validate a DateRange.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证日期范围 / Validated date range.
 */
function parseDateRange(value: unknown, path: string): ResumeDateRangeDto {
  /** @brief 精确日期范围对象 / Exact date-range object. */
  const input = exactRecord(value, path, ['start', 'end', 'is_current', 'display_override'])
  return {
    display_override: nullableBoundedString(
      input.display_override,
      `${path}.display_override`,
      0,
      100
    ),
    end: parseNullablePartialDate(input.end, `${path}.end`),
    is_current: boolean(input.is_current, `${path}.is_current`),
    start: parseNullablePartialDate(input.start, `${path}.start`)
  }
}

/**
 * @brief 校验可选日期范围 / Validate an optional DateRange.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证日期范围或 null / Validated date range or null.
 */
function parseNullableDateRange(value: unknown, path: string): ResumeDateRangeDto | null {
  return value === null || value === undefined ? null : parseDateRange(value, path)
}

/**
 * @brief 校验 ResumeItem 链接 / Validate a ResumeItem Link.
 * @param value 未受信任值 / Untrusted value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateResumeLink(value: unknown, path: string): void {
  /** @brief 精确链接对象 / Exact link object. */
  const input = exactRecord(value, path, ['label', 'url', 'kind'])
  nullableBoundedString(input.label, `${path}.label`, 0, 200)
  absoluteUri(input.url, `${path}.url`)
  stableCode(input.kind, `${path}.kind`)
}

/**
 * @brief 校验条目公共字段 / Validate common item fields.
 * @param input 已按具体 variant 限定字段的对象 / Object whose keys were constrained by its concrete variant.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 页面所需公共 DTO 字段 / Common DTO fields required by the page.
 */
function parseResumeItemBase(
  input: Record<string, unknown>,
  path: string
): Pick<ResumeItemDto, 'item_id' | 'visible' | 'tags'> {
  boundedArray(input.links === undefined ? [] : input.links, `${path}.links`, 0, 20).forEach(
    (link, index) => {
      validateResumeLink(link, `${path}.links[${index}]`)
    }
  )
  if (input.extensions !== undefined) parseJsonExtensions(input.extensions, `${path}.extensions`)
  return {
    item_id: opaqueId(input.item_id, `${path}.item_id`),
    tags: templateStringArray(input.tags === undefined ? [] : input.tags, `${path}.tags`, {
      maximumItems: 50,
      maximumLength: 100,
      unique: true
    }),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/** @brief 校验联系信息 / Validate a contact method. */
function parseContact(value: unknown, path: string): ResumeContactDto {
  const input = exactRecord(value, path, [
    'contact_id',
    'kind',
    'label',
    'value',
    'url',
    'is_public'
  ])
  opaqueId(input.contact_id, `${path}.contact_id`)
  if (input.url !== undefined && input.url !== null) absoluteUri(input.url, `${path}.url`)
  return {
    is_public: boolean(input.is_public, `${path}.is_public`),
    kind: templateEnum(input.kind, `${path}.kind`, RESUME_CONTACT_KINDS),
    label: nullableBoundedString(input.label, `${path}.label`, 0, 100),
    value: boundedString(input.value, `${path}.value`, 1, 500)
  }
}

/** @brief 按 item_kind 严格校验多态简历条目 / Strictly validate a polymorphic Resume item by item_kind. */
function parseResumeItem(value: unknown, path: string): ResumeItemDto {
  /** @brief 仅用于读取判别字段的输入 / Input used only to read the discriminator. */
  const discriminated = record(value, path)
  /** @brief 由冻结 oneOf 封闭的条目类别 / Item kind closed by the frozen oneOf. */
  const itemKind = templateEnum(discriminated.item_kind, `${path}.item_kind`, RESUME_ITEM_KINDS)

  if (itemKind === 'experience') {
    /** @brief 精确工作经历对象 / Exact experience object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'organization',
      'position',
      'location',
      'date_range',
      'description',
      'highlights'
    ])
    return {
      ...parseResumeItemBase(input, path),
      date_range: parseDateRange(input.date_range, `${path}.date_range`),
      description: parseNullableRichText(input.description, `${path}.description`),
      highlights: parseRichTextArray(input.highlights, `${path}.highlights`, 50),
      item_kind: 'experience',
      location: nullableBoundedString(input.location, `${path}.location`, 0, 200),
      organization: boundedString(input.organization, `${path}.organization`, 1, 300),
      position: boundedString(input.position, `${path}.position`, 1, 300)
    }
  }

  if (itemKind === 'education') {
    /** @brief 精确教育经历对象 / Exact education object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'institution',
      'degree',
      'field_of_study',
      'location',
      'date_range',
      'score',
      'description',
      'highlights'
    ])
    return {
      ...parseResumeItemBase(input, path),
      date_range: parseDateRange(input.date_range, `${path}.date_range`),
      degree: nullableBoundedString(input.degree, `${path}.degree`, 0, 300),
      description: parseNullableRichText(input.description, `${path}.description`),
      field_of_study: nullableBoundedString(input.field_of_study, `${path}.field_of_study`, 0, 300),
      highlights: parseRichTextArray(input.highlights, `${path}.highlights`, 30),
      institution: boundedString(input.institution, `${path}.institution`, 1, 300),
      item_kind: 'education',
      location: nullableBoundedString(input.location, `${path}.location`, 0, 200),
      score: nullableBoundedString(input.score, `${path}.score`, 0, 100)
    }
  }

  if (itemKind === 'project') {
    /** @brief 精确项目对象 / Exact project object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'name',
      'role',
      'date_range',
      'description',
      'highlights',
      'technologies'
    ])
    return {
      ...parseResumeItemBase(input, path),
      date_range: parseNullableDateRange(input.date_range, `${path}.date_range`),
      description: parseNullableRichText(input.description, `${path}.description`),
      highlights: parseRichTextArray(input.highlights, `${path}.highlights`, 50),
      item_kind: 'project',
      name: boundedString(input.name, `${path}.name`, 1, 300),
      role: nullableBoundedString(input.role, `${path}.role`, 0, 200),
      technologies: templateStringArray(
        input.technologies === undefined ? [] : input.technologies,
        `${path}.technologies`,
        {
          maximumItems: 100,
          maximumLength: 100,
          unique: true
        }
      )
    }
  }

  if (itemKind === 'skill_group') {
    /** @brief 精确技能组对象 / Exact skill-group object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'name',
      'skills',
      'proficiency'
    ])
    return {
      ...parseResumeItemBase(input, path),
      item_kind: 'skill_group',
      name: boundedString(input.name, `${path}.name`, 1, 200),
      proficiency:
        input.proficiency === null || input.proficiency === undefined
          ? null
          : templateEnum(input.proficiency, `${path}.proficiency`, SKILL_PROFICIENCIES),
      skills: templateStringArray(input.skills, `${path}.skills`, {
        maximumItems: 200,
        maximumLength: 100,
        minimumItems: 1,
        minimumLength: 1,
        unique: true
      })
    }
  }

  if (itemKind === 'publication') {
    /** @brief 精确出版物对象 / Exact publication object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'title',
      'publisher',
      'authors',
      'published_at',
      'description'
    ])
    return {
      ...parseResumeItemBase(input, path),
      authors: templateStringArray(input.authors, `${path}.authors`, {
        maximumItems: 100,
        maximumLength: 200
      }),
      description: parseNullableRichText(input.description, `${path}.description`),
      item_kind: 'publication',
      published_at: parseNullablePartialDate(input.published_at, `${path}.published_at`),
      publisher: nullableBoundedString(input.publisher, `${path}.publisher`, 0, 300),
      title: boundedString(input.title, `${path}.title`, 1, 500)
    }
  }

  if (itemKind === 'award') {
    /** @brief 精确奖项对象 / Exact award object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'title',
      'issuer',
      'awarded_at',
      'description'
    ])
    return {
      ...parseResumeItemBase(input, path),
      awarded_at: parseNullablePartialDate(input.awarded_at, `${path}.awarded_at`),
      description: parseNullableRichText(input.description, `${path}.description`),
      issuer: nullableBoundedString(input.issuer, `${path}.issuer`, 0, 300),
      item_kind: 'award',
      title: boundedString(input.title, `${path}.title`, 1, 300)
    }
  }

  if (itemKind === 'certification') {
    /** @brief 精确认证对象 / Exact certification object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'name',
      'issuer',
      'issued_at',
      'expires_at',
      'credential_id'
    ])
    return {
      ...parseResumeItemBase(input, path),
      credential_id: nullableBoundedString(input.credential_id, `${path}.credential_id`, 0, 300),
      expires_at: parseNullablePartialDate(input.expires_at, `${path}.expires_at`),
      issued_at: parseNullablePartialDate(input.issued_at, `${path}.issued_at`),
      issuer: nullableBoundedString(input.issuer, `${path}.issuer`, 0, 300),
      item_kind: 'certification',
      name: boundedString(input.name, `${path}.name`, 1, 300)
    }
  }

  if (itemKind === 'language') {
    /** @brief 精确语言对象 / Exact language object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'language',
      'proficiency',
      'certificate'
    ])
    return {
      ...parseResumeItemBase(input, path),
      certificate: nullableBoundedString(input.certificate, `${path}.certificate`, 0, 200),
      item_kind: 'language',
      language: boundedString(input.language, `${path}.language`, 1, 100),
      proficiency: templateEnum(input.proficiency, `${path}.proficiency`, LANGUAGE_PROFICIENCIES)
    }
  }

  if (itemKind === 'volunteer') {
    /** @brief 精确志愿经历对象 / Exact volunteer object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'organization',
      'role',
      'date_range',
      'description',
      'highlights'
    ])
    return {
      ...parseResumeItemBase(input, path),
      date_range: parseNullableDateRange(input.date_range, `${path}.date_range`),
      description: parseNullableRichText(input.description, `${path}.description`),
      highlights: parseRichTextArray(input.highlights, `${path}.highlights`, 30),
      item_kind: 'volunteer',
      organization: boundedString(input.organization, `${path}.organization`, 1, 300),
      role: nullableBoundedString(input.role, `${path}.role`, 0, 300)
    }
  }

  if (itemKind === 'custom') {
    /** @brief 精确自定义条目对象 / Exact custom-item object. */
    const input = exactRecord(value, path, [
      ...RESUME_ITEM_COMMON_KEYS,
      'item_kind',
      'title',
      'subtitle',
      'date_range',
      'content',
      'data'
    ])
    if (input.data !== undefined) parseOpenJsonObject(input.data, `${path}.data`)
    return {
      ...parseResumeItemBase(input, path),
      content: parseRichText(input.content, `${path}.content`),
      date_range: parseNullableDateRange(input.date_range, `${path}.date_range`),
      item_kind: 'custom',
      subtitle: nullableBoundedString(input.subtitle, `${path}.subtitle`, 0, 300),
      title: nullableBoundedString(input.title, `${path}.title`, 0, 300)
    }
  }

  throw new HttpContractError(`Backend field ${path}.item_kind is unsupported.`, 200)
}

/** @brief 校验简历区段 / Validate a Resume section. */
function parseResumeSection(value: unknown, path: string): ResumeSectionDto {
  /** @brief 仅包含冻结 ResumeSection 字段的输入 / Input containing only frozen ResumeSection fields. */
  const input = exactRecord(value, path, [
    'section_id',
    'kind',
    'title',
    'visible',
    'content',
    'items',
    'extensions'
  ])
  const content = nullableRecord(input.content, `${path}.content`)
  /** @brief 受契约上限约束的区段条目 / Section items constrained by the contract maximum. */
  const items = boundedArray(input.items, `${path}.items`, 0, 500)
  if (input.extensions !== undefined) parseJsonExtensions(input.extensions, `${path}.extensions`)
  return {
    content: content === null ? null : parseRichText(content, `${path}.content`),
    items: items.map((item, index) => parseResumeItem(item, `${path}.items[${index}]`)),
    kind: stableCode(input.kind, `${path}.kind`),
    section_id: opaqueId(input.section_id, `${path}.section_id`),
    title: boundedString(input.title, `${path}.title`, 1, 200),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/**
 * @brief 校验冻结 TemplateRef / Validate a frozen TemplateRef.
 * @param value 未受信任模板引用 / Untrusted template reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证模板引用 / Validated template reference.
 */
function parseResumeTemplateRef(value: unknown, path: string): ResumeDocumentDto['template'] {
  /** @brief 不含契约外字段的模板引用 / Template reference without out-of-contract fields. */
  const input = exactRecord(value, path, ['template_id', 'template_version'])
  return {
    template_id: opaqueId(input.template_id, `${path}.template_id`),
    template_version: boundedString(input.template_version, `${path}.template_version`, 1, 128)
  }
}

/**
 * @brief 校验冻结 ResumeStyleIntent / Validate a frozen ResumeStyleIntent.
 * @param value 未受信任样式意图 / Untrusted style intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证样式意图 / Validated style intent.
 */
function parseResumeStyleIntent(value: unknown, path: string): ResumeDocumentDto['style_intent'] {
  /** @brief 不含契约外字段的样式意图 / Style intent without out-of-contract fields. */
  const style = exactRecord(value, path, [
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
  /** @brief 精确页面意图 / Exact page intent. */
  const page = exactRecord(style.page, `${path}.page`, [
    'size',
    'custom_width',
    'custom_height',
    'orientation',
    'margins',
    'max_pages',
    'show_page_numbers'
  ])
  /** @brief 精确页面边距 / Exact page margins. */
  const margins = exactRecord(page.margins, `${path}.page.margins`, [
    'top',
    'right',
    'bottom',
    'left'
  ])
  /** @brief 精确排版意图 / Exact typography intent. */
  const typography = exactRecord(style.typography, `${path}.typography`, [
    'font_family_token',
    'base_size_pt',
    'line_height',
    'heading_scale',
    'letter_spacing_em'
  ])
  /** @brief 精确调色板意图 / Exact palette intent. */
  const palette = exactRecord(style.palette, `${path}.palette`, [
    'primary',
    'secondary',
    'text',
    'muted_text',
    'background'
  ])
  /** @brief 由 const 封闭的样式契约版本 / Style-contract version closed by const. */
  const styleVersion = string(style.style_contract_version, `${path}.style_contract_version`)
  if (styleVersion !== '1.0') {
    throw new HttpContractError(`Backend field ${path}.style_contract_version is unsupported.`, 200)
  }

  return {
    bullet_style_token: boundedString(
      style.bullet_style_token,
      `${path}.bullet_style_token`,
      1,
      100
    ),
    date_format_token: boundedString(style.date_format_token, `${path}.date_format_token`, 1, 100),
    density: boundedNumber(style.density, `${path}.density`, 0, 1),
    extensions:
      style.extensions === undefined
        ? {}
        : parseJsonExtensions(style.extensions, `${path}.extensions`),
    page: {
      custom_height: nullableMeasurement(page.custom_height, `${path}.page.custom_height`),
      custom_width: nullableMeasurement(page.custom_width, `${path}.page.custom_width`),
      margins: {
        bottom: parseMeasurement(margins.bottom, `${path}.page.margins.bottom`),
        left: parseMeasurement(margins.left, `${path}.page.margins.left`),
        right: parseMeasurement(margins.right, `${path}.page.margins.right`),
        top: parseMeasurement(margins.top, `${path}.page.margins.top`)
      },
      max_pages:
        page.max_pages === null || page.max_pages === undefined
          ? null
          : boundedInteger(page.max_pages, `${path}.page.max_pages`, 1, 20),
      orientation: templateEnum(page.orientation, `${path}.page.orientation`, [
        'portrait',
        'landscape'
      ] as const),
      show_page_numbers: boolean(page.show_page_numbers, `${path}.page.show_page_numbers`),
      size: templateEnum(page.size, `${path}.page.size`, TEMPLATE_PAGE_SIZES)
    },
    palette: {
      background: parseColor(palette.background, `${path}.palette.background`),
      muted_text: parseColor(palette.muted_text, `${path}.palette.muted_text`),
      primary: parseColor(palette.primary, `${path}.palette.primary`),
      secondary: parseColor(palette.secondary, `${path}.palette.secondary`),
      text: parseColor(palette.text, `${path}.palette.text`)
    },
    section_layout: boundedArray(style.section_layout, `${path}.section_layout`, 0, 100).map(
      (item, index) => {
        /** @brief 精确区段布局意图 / Exact section-layout intent. */
        const layout = exactRecord(item, `${path}.section_layout[${index}]`, [
          'section_id',
          'zone',
          'keep_together',
          'page_break_before',
          'compactness',
          'heading_style_token'
        ])
        return {
          compactness: boundedNumber(
            layout.compactness,
            `${path}.section_layout[${index}].compactness`,
            0,
            1
          ),
          heading_style_token: nullableBoundedString(
            layout.heading_style_token,
            `${path}.section_layout[${index}].heading_style_token`,
            0,
            100
          ),
          keep_together: boolean(
            layout.keep_together,
            `${path}.section_layout[${index}].keep_together`
          ),
          page_break_before: boolean(
            layout.page_break_before,
            `${path}.section_layout[${index}].page_break_before`
          ),
          section_id: opaqueId(layout.section_id, `${path}.section_layout[${index}].section_id`),
          zone: patternedString(
            layout.zone,
            `${path}.section_layout[${index}].zone`,
            TEMPLATE_ZONE_ID_PATTERN
          )
        }
      }
    ),
    style_contract_version: styleVersion,
    template_settings: Object.fromEntries(
      Object.entries(record(style.template_settings, `${path}.template_settings`)).map(
        ([key, settingValue]) => [
          key,
          parseTemplateJsonValue(settingValue, `${path}.template_settings.${key}`)
        ]
      )
    ),
    typography: {
      base_size_pt: boundedNumber(
        typography.base_size_pt,
        `${path}.typography.base_size_pt`,
        6,
        24
      ),
      font_family_token: boundedString(
        typography.font_family_token,
        `${path}.typography.font_family_token`,
        1,
        100
      ),
      heading_scale: boundedNumber(
        typography.heading_scale,
        `${path}.typography.heading_scale`,
        0.8,
        3
      ),
      letter_spacing_em: boundedNumber(
        typography.letter_spacing_em,
        `${path}.typography.letter_spacing_em`,
        -0.2,
        1
      ),
      line_height: boundedNumber(typography.line_height, `${path}.typography.line_height`, 0.8, 3)
    }
  }
}

/** @brief 校验 ResumeDocument / Validate a ResumeDocument. */
export function parseResumeDocumentDto(value: unknown): ResumeDocumentDto {
  const input = exactRecord(value, 'resume', [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'schema_version',
    'workspace_id',
    'title',
    'locale',
    'template',
    'profile',
    'sections',
    'style_intent',
    'knowledge_source_id',
    'extensions'
  ])
  const profile = exactRecord(input.profile, 'resume.profile', [
    'full_name',
    'headline',
    'pronouns',
    'photo_asset_id',
    'contacts',
    'summary'
  ])
  const schemaVersion = string(input.schema_version, 'resume.schema_version')
  if (schemaVersion !== '1.0') {
    throw new HttpContractError('Backend ResumeDocument uses an unsupported schema version.', 200)
  }
  if (input.extensions !== undefined) parseJsonExtensions(input.extensions, 'resume.extensions')
  if (profile.pronouns !== undefined) {
    nullableBoundedString(profile.pronouns, 'resume.profile.pronouns', 0, 100)
  }
  if (profile.photo_asset_id !== undefined && profile.photo_asset_id !== null) {
    opaqueId(profile.photo_asset_id, 'resume.profile.photo_asset_id')
  }

  /** @brief 受冻结 ResumeDocument 边界约束的区段 / Sections constrained by the frozen ResumeDocument bounds. */
  const sections = boundedArray(input.sections, 'resume.sections', 1, 100)

  return {
    created_at: timestamp(input.created_at, 'resume.created_at'),
    id: opaqueId(input.id, 'resume.id'),
    knowledge_source_id:
      input.knowledge_source_id === null || input.knowledge_source_id === undefined
        ? null
        : opaqueId(input.knowledge_source_id, 'resume.knowledge_source_id'),
    locale: patternedString(input.locale, 'resume.locale', TEMPLATE_LOCALE_PATTERN),
    profile: {
      contacts: boundedArray(profile.contacts, 'resume.profile.contacts', 0, 30).map(
        (item, index) => parseContact(item, `resume.profile.contacts[${index}]`)
      ),
      full_name: boundedString(profile.full_name, 'resume.profile.full_name', 1, 200),
      headline: nullableBoundedString(profile.headline, 'resume.profile.headline', 0, 300),
      summary:
        nullableRecord(profile.summary, 'resume.profile.summary') === null
          ? null
          : parseRichText(profile.summary, 'resume.profile.summary')
    },
    revision: positiveInteger(input.revision, 'resume.revision'),
    schema_version: schemaVersion,
    sections: sections.map((item, index) => parseResumeSection(item, `resume.sections[${index}]`)),
    style_intent: parseResumeStyleIntent(input.style_intent, 'resume.style_intent'),
    template: parseResumeTemplateRef(input.template, 'resume.template'),
    title: boundedString(input.title, 'resume.title', 1, 300),
    updated_at: timestamp(input.updated_at, 'resume.updated_at'),
    workspace_id: opaqueId(input.workspace_id, 'resume.workspace_id')
  }
}

/** @brief 校验 ResumeDocument 列表 / Validate a ResumeDocument list. */
export function parseResumeListDto(value: unknown): PaginatedDto<ResumeDocumentDto> {
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item) => parseResumeDocumentDto(item)),
    page: parseCursorPage(input.page)
  }
}

/**
 * @brief 严格校验 operation result 中的通用 Job / Strictly validate the generic Job in an operation result.
 * @param value 未受信任 Job / Untrusted Job.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateJob(value: unknown, path: string): void {
  /** @brief 精确通用 Job 对象 / Exact generic Job object. */
  const input = exactRecord(value, path, [
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
    'extensions'
  ])
  /** @brief 精确 Job 进度对象 / Exact Job-progress object. */
  const progress = exactRecord(input.progress, `${path}.progress`, [
    'phase',
    'completed_units',
    'total_units',
    'percent',
    'message'
  ])

  opaqueId(input.id, `${path}.id`)
  stableCode(input.job_type, `${path}.job_type`)
  stableCode(input.status, `${path}.status`)
  timestamp(input.created_at, `${path}.created_at`)
  nullableTimestamp(input.started_at, `${path}.started_at`)
  nullableTimestamp(input.finished_at, `${path}.finished_at`)
  nullableTimestamp(input.expires_at, `${path}.expires_at`)
  if (
    input.error !== undefined &&
    input.error !== null &&
    parseProblemDetails(input.error) === null
  ) {
    throw new HttpContractError(`Backend field ${path}.error must match ProblemDetails.`, 200)
  }
  if (input.request_id !== undefined && input.request_id !== null) {
    boundedString(input.request_id, `${path}.request_id`, 8, 128)
  }
  validateOptionalExtensions(input.extensions, `${path}.extensions`)

  stableCode(progress.phase, `${path}.progress.phase`)
  nonNegativeInteger(progress.completed_units, `${path}.progress.completed_units`)
  nullablePositiveInteger(progress.total_units, `${path}.progress.total_units`)
  if (progress.percent !== undefined && progress.percent !== null) {
    boundedNumber(progress.percent, `${path}.progress.percent`, 0, 100)
  }
  if (progress.message !== undefined && progress.message !== null) {
    validateLocalizedMessage(progress.message, `${path}.progress.message`)
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
    validateJob(input.render_job, 'operationResult.render_job')
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
 * @brief 判断对象是否显式携带字段 / Determine whether an object explicitly carries a field.
 * @param input 待检查对象 / Object to inspect.
 * @param key 字段名 / Field name.
 * @return 字段是否为自身属性 / Whether the field is an own property.
 */
function hasOwnField(input: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

/**
 * @brief 校验可省略、显式可空的不透明 ID / Validate an omittable, explicitly nullable opaque ID.
 * @param input 包含字段的对象 / Object containing the field.
 * @param key 字段名 / Field name.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateOptionalNullableOpaqueId(
  input: Readonly<Record<string, unknown>>,
  key: string,
  path: string
): void {
  if (!hasOwnField(input, key) || input[key] === null) return
  opaqueId(input[key], path)
}

/**
 * @brief 校验 ResumeOperation 公共字段 / Validate common ResumeOperation fields.
 * @param input 已由具体分支限制字段集的 operation / Operation whose keys are constrained by its concrete branch.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateResumeOperationBase(input: Readonly<Record<string, unknown>>, path: string): void {
  opaqueId(input.operation_id, `${path}.operation_id`)
  if (hasOwnField(input, 'extensions')) {
    parseJsonExtensions(input.extensions, `${path}.extensions`)
  }
}

/**
 * @brief 按冻结 oneOf 完整校验 ResumeOperation / Fully validate a ResumeOperation against the frozen oneOf.
 * @param value 未受信任 operation / Untrusted operation.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无返回值 / No return value.
 */
function validateResumeOperation(value: unknown, path: string): void {
  /** @brief 仅用于读取封闭判别字段的 operation / Operation used only to read the closed discriminator. */
  const discriminated = record(value, path)
  /** @brief 由 oneOf 中 const 集合封闭的 operation 类型 / Operation type closed by the oneOf const set. */
  const operationKind = templateEnum(discriminated.op, `${path}.op`, RESUME_OPERATION_KINDS)

  if (operationKind === 'set_template') {
    /** @brief 精确 set_template 分支 / Exact set_template branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'template',
      'style_intent',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    parseResumeTemplateRef(input.template, `${path}.template`)
    if (hasOwnField(input, 'style_intent') && input.style_intent !== null) {
      parseResumeStyleIntent(input.style_intent, `${path}.style_intent`)
    }
    return
  }

  if (operationKind === 'upsert_section') {
    /** @brief 精确 upsert_section 分支 / Exact upsert_section branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'section',
      'after_section_id',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    parseResumeSection(input.section, `${path}.section`)
    validateOptionalNullableOpaqueId(input, 'after_section_id', `${path}.after_section_id`)
    return
  }

  if (operationKind === 'remove_section') {
    /** @brief 精确 remove_section 分支 / Exact remove_section branch. */
    const input = exactRecord(value, path, ['operation_id', 'op', 'section_id', 'extensions'])
    validateResumeOperationBase(input, path)
    opaqueId(input.section_id, `${path}.section_id`)
    return
  }

  if (operationKind === 'move_section') {
    /** @brief 精确 move_section 分支 / Exact move_section branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'section_id',
      'after_section_id',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    opaqueId(input.section_id, `${path}.section_id`)
    validateOptionalNullableOpaqueId(input, 'after_section_id', `${path}.after_section_id`)
    return
  }

  if (operationKind === 'upsert_item') {
    /** @brief 精确 upsert_item 分支 / Exact upsert_item branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'section_id',
      'item',
      'after_item_id',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    opaqueId(input.section_id, `${path}.section_id`)
    parseResumeItem(input.item, `${path}.item`)
    validateOptionalNullableOpaqueId(input, 'after_item_id', `${path}.after_item_id`)
    return
  }

  if (operationKind === 'remove_item') {
    /** @brief 精确 remove_item 分支 / Exact remove_item branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'section_id',
      'item_id',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    opaqueId(input.section_id, `${path}.section_id`)
    opaqueId(input.item_id, `${path}.item_id`)
    return
  }

  if (operationKind === 'move_item') {
    /** @brief 精确 move_item 分支 / Exact move_item branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'from_section_id',
      'to_section_id',
      'item_id',
      'after_item_id',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    opaqueId(input.from_section_id, `${path}.from_section_id`)
    opaqueId(input.to_section_id, `${path}.to_section_id`)
    opaqueId(input.item_id, `${path}.item_id`)
    validateOptionalNullableOpaqueId(input, 'after_item_id', `${path}.after_item_id`)
    return
  }

  if (operationKind === 'set_field') {
    /** @brief 精确 set_field 分支 / Exact set_field branch. */
    const input = exactRecord(value, path, [
      'operation_id',
      'op',
      'target',
      'field_path',
      'value',
      'extensions'
    ])
    validateResumeOperationBase(input, path)
    /** @brief 精确 EntityTarget / Exact EntityTarget. */
    const target = exactRecord(input.target, `${path}.target`, [
      'entity_type',
      'section_id',
      'item_id'
    ])
    templateEnum(target.entity_type, `${path}.target.entity_type`, RESUME_ENTITY_TYPES)
    validateOptionalNullableOpaqueId(target, 'section_id', `${path}.target.section_id`)
    validateOptionalNullableOpaqueId(target, 'item_id', `${path}.target.item_id`)
    boundedArray(input.field_path, `${path}.field_path`, 1, 20).forEach((segment, index) => {
      patternedString(segment, `${path}.field_path[${index}]`, RESUME_FIELD_SEGMENT_PATTERN)
    })
    if (!hasOwnField(input, 'value')) {
      throw new HttpContractError(`Backend field ${path}.value is required.`, 200)
    }
    parseTemplateJsonValue(input.value, `${path}.value`)
    return
  }

  if (operationKind === 'set_style_intent') {
    /** @brief 精确 set_style_intent 分支 / Exact set_style_intent branch. */
    const input = exactRecord(value, path, ['operation_id', 'op', 'style_intent', 'extensions'])
    validateResumeOperationBase(input, path)
    parseResumeStyleIntent(input.style_intent, `${path}.style_intent`)
    return
  }

  if (operationKind === 'replace_document') {
    /** @brief 精确 replace_document 分支 / Exact replace_document branch. */
    const input = exactRecord(value, path, ['operation_id', 'op', 'document', 'extensions'])
    validateResumeOperationBase(input, path)
    parseResumeDocumentDto(input.document)
    return
  }

  throw new HttpContractError(`Backend field ${path}.op is unsupported.`, 200)
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
    /** @brief 受冻结上限约束的建议 operations / Suggested operations constrained by the frozen bound. */
    const operations = boundedArray(
      input.suggested_operations,
      `${path}.suggested_operations`,
      0,
      20
    )
    operations.forEach((operation, index) => {
      validateResumeOperation(operation, `${path}.suggested_operations[${index}]`)
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
