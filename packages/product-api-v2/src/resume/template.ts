/** @file API v2 Resume 模板 wire 模型与严格 decoder / API v2 Resume-template wire models and strict decoders. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  finiteNumber,
  locale,
  networkUrl,
  opaqueId,
  parseCursorPage,
  patternedString,
  timestamp,
  type CursorCollection
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  TEMPLATE_KEY_PATTERN,
  TEMPLATE_SECTION_KIND_PATTERN,
  assertUniqueBy,
  assertUniqueStrings,
  jsonValuesEqual,
  nullable,
  parseResumeJsonValue,
  type ResumeJsonValue
} from './wire-decoding'

/** @brief Resume 页面尺寸 / Resume page size. */
export type ResumePageSize = 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM'

/** @brief Resume 模板输出格式 / Resume-template output format. */
export type ResumeOutputFormat = 'pdf' | 'png' | 'html_snapshot' | 'docx'

/** @brief 模板 measurement 单位 / Template measurement unit. */
export type MeasurementUnit = 'pt' | 'mm' | 'cm' | 'in' | 'px' | 'em' | 'percent'

/** @brief API v2 measurement / API v2 measurement. */
export interface Measurement {
  /** @brief 有限数值 / Finite numeric value. */
  readonly value: number
  /** @brief measurement 单位 / Measurement unit. */
  readonly unit: MeasurementUnit
}

/** @brief API v2 color space / API v2 color space. */
export type ColorSpace = 'srgb_hex' | 'rgba'

/** @brief API v2 颜色值 / API v2 color value. */
export interface ColorValue {
  /** @brief 颜色空间 / Color space. */
  readonly space: ColorSpace
  /** @brief 模板解释的颜色字面值 / Template-interpreted color literal. */
  readonly value: string
}

/** @brief Resume 固定的不可变模板引用 / Immutable template reference pinned by a Resume. */
export interface TemplateRef {
  /** @brief 模板资源 ID / Template-resource ID. */
  readonly template_id: string
  /** @brief 不可变模板版本 / Immutable template version. */
  readonly version: string
}

/** @brief 模板 setting 值类型 / Template-setting value type. */
export type TemplateSettingValueType =
  'boolean' | 'integer' | 'number' | 'string' | 'choice' | 'color' | 'measurement'

/** @brief 模板 setting 控件类型 / Template-setting control type. */
export type TemplateSettingControl =
  'switch' | 'slider' | 'number' | 'select' | 'radio' | 'color' | 'measurement' | 'text'

/** @brief 模板 setting 选项 / Template-setting choice. */
export interface TemplateSettingChoice {
  /** @brief 选项 JSON 值 / Choice JSON value. */
  readonly value: ResumeJsonValue
  /** @brief 本地化标签 key / Localized label key. */
  readonly label_key: string
  /** @brief 可选本地化说明 key / Optional localized description key. */
  readonly description_key: string | null
}

/** @brief 模板 setting 条件可见性 / Conditional visibility of a template setting. */
export interface TemplateSettingVisibility {
  /** @brief 被引用的 setting key / Referenced setting key. */
  readonly key: string
  /** @brief 使当前 setting 可见的精确 JSON 值 / Exact JSON value making this setting visible. */
  readonly equals: ResumeJsonValue
}

/** @brief 模板 setting 定义 / Template-setting definition. */
export interface TemplateSettingDefinition {
  /** @brief 稳定 setting key / Stable setting key. */
  readonly key: string
  /** @brief 本地化标签 key / Localized label key. */
  readonly label_key: string
  /** @brief 可选本地化说明 key / Optional localized description key. */
  readonly description_key: string | null
  /** @brief 值类型 / Value type. */
  readonly value_type: TemplateSettingValueType
  /** @brief 默认值 / Default value. */
  readonly default: ResumeJsonValue
  /** @brief 可选数值下限 / Optional numeric lower bound. */
  readonly minimum: number | null
  /** @brief 可选数值上限 / Optional numeric upper bound. */
  readonly maximum: number | null
  /** @brief 可选值集合 / Choice collection. */
  readonly choices: readonly TemplateSettingChoice[]
  /** @brief 推荐 UI 控件 / Recommended UI control. */
  readonly control: TemplateSettingControl
  /** @brief 可选 setting group key / Optional setting-group key. */
  readonly group_key: string | null
  /** @brief 可选条件可见性 / Optional conditional visibility. */
  readonly visible_when: TemplateSettingVisibility | null
}

/** @brief 模板语义 zone / Template semantic zone. */
export interface TemplateZone {
  /** @brief 稳定 zone ID / Stable zone ID. */
  readonly id: string
  /** @brief 本地化标签 key / Localized label key. */
  readonly label_key: string
  /** @brief 可放置的 section kinds / Accepted section kinds. */
  readonly accepted_section_kinds: readonly string[]
  /** @brief 可选 section 数上限 / Optional section-count ceiling. */
  readonly max_sections: number | null
}

/** @brief 模板渲染能力 / Template rendering capabilities. */
export interface TemplateCapabilities {
  /** @brief 是否支持照片 / Whether photos are supported. */
  readonly supports_photo: boolean
  /** @brief 是否支持侧栏 / Whether a sidebar is supported. */
  readonly supports_sidebar: boolean
  /** @brief 是否支持自定义 sections / Whether custom sections are supported. */
  readonly supports_custom_sections: boolean
  /** @brief 是否支持 source map / Whether source maps are supported. */
  readonly supports_source_map: boolean
  /** @brief 最大列数 / Maximum column count. */
  readonly max_columns: number
}

/** @brief 完整且不可变的 API v2 模板清单 / Complete immutable API v2 template manifest. */
export interface TemplateManifest {
  /** @brief 模板 ID / Template ID. */
  readonly id: string
  /** @brief 不可变版本 / Immutable version. */
  readonly version: string
  /** @brief 展示名称 / Display name. */
  readonly name: string
  /** @brief 可选说明 / Optional description. */
  readonly description: string | null
  /** @brief 不可变预览 URL / Immutable preview URL. */
  readonly preview_url: string | null
  /** @brief 支持的 locales / Supported locales. */
  readonly supported_locales: readonly string[]
  /** @brief 支持的页面尺寸 / Supported page sizes. */
  readonly supported_page_sizes: readonly ResumePageSize[]
  /** @brief 支持的输出格式 / Supported output formats. */
  readonly supported_output_formats: readonly ResumeOutputFormat[]
  /** @brief 支持的 section kinds / Supported section kinds. */
  readonly supported_section_kinds: readonly string[]
  /** @brief 模板 zones / Template zones. */
  readonly zones: readonly TemplateZone[]
  /** @brief 字体 family tokens / Font-family tokens. */
  readonly font_family_tokens: readonly string[]
  /** @brief 日期格式 tokens / Date-format tokens. */
  readonly date_format_tokens: readonly string[]
  /** @brief bullet style tokens / Bullet-style tokens. */
  readonly bullet_style_tokens: readonly string[]
  /** @brief 模板能力 / Template capabilities. */
  readonly capabilities: TemplateCapabilities
  /** @brief 模板 settings / Template settings. */
  readonly settings: readonly TemplateSettingDefinition[]
  /** @brief 发布时间 / Publication timestamp. */
  readonly published_at: string
}

/** @brief API v2 模板 cursor 页 / API v2 template cursor page. */
export type TemplateList = CursorCollection<TemplateManifest>

/**
 * @brief 严格解码 TemplateRef / Strictly decode TemplateRef.
 * @param value 未知模板引用 / Unknown template reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证模板引用 / Validated template reference.
 */
export function parseTemplateRef(value: unknown, path = 'template_ref'): TemplateRef {
  /** @brief 精确模板引用对象 / Exact template-reference object. */
  const input = exactRecord(value, path, ['template_id', 'version'])
  return {
    template_id: opaqueId(input.template_id, `${path}.template_id`),
    version: boundedString(input.version, `${path}.version`, 1, 80)
  }
}

/**
 * @brief 严格解码 Measurement / Strictly decode Measurement.
 * @param value 未知 measurement / Unknown measurement.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 measurement / Validated measurement.
 */
export function parseMeasurement(value: unknown, path: string): Measurement {
  /** @brief 精确 measurement 对象 / Exact measurement object. */
  const input = exactRecord(value, path, ['value', 'unit'])
  return {
    unit: closedStringEnum(input.unit, `${path}.unit`, [
      'pt',
      'mm',
      'cm',
      'in',
      'px',
      'em',
      'percent'
    ]),
    value: finiteNumber(input.value, `${path}.value`)
  }
}

/**
 * @brief 严格解码 ColorValue / Strictly decode ColorValue.
 * @param value 未知颜色值 / Unknown color value.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证颜色值 / Validated color value.
 */
export function parseColorValue(value: unknown, path: string): ColorValue {
  /** @brief 精确颜色对象 / Exact color object. */
  const input = exactRecord(value, path, ['space', 'value'])
  return {
    space: closedStringEnum(input.space, `${path}.space`, ['srgb_hex', 'rgba']),
    value: boundedString(input.value, `${path}.value`, 1, 80)
  }
}

/**
 * @brief 严格解码 TemplateSettingChoice / Strictly decode TemplateSettingChoice.
 * @param value 未知选项 / Unknown choice.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证选项 / Validated choice.
 */
function parseTemplateSettingChoice(value: unknown, path: string): TemplateSettingChoice {
  /** @brief 精确选项对象 / Exact choice object. */
  const input = exactRecord(value, path, ['value', 'label_key', 'description_key'])
  return {
    description_key: nullable(input.description_key, (candidate) =>
      boundedString(candidate, `${path}.description_key`, 0, 200)
    ),
    label_key: boundedString(input.label_key, `${path}.label_key`, 1, 200),
    value: parseResumeJsonValue(input.value, `${path}.value`)
  }
}

/**
 * @brief 严格解码 TemplateSettingVisibility / Strictly decode TemplateSettingVisibility.
 * @param value 未知可见性条件 / Unknown visibility condition.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证可见性条件 / Validated visibility condition.
 */
function parseTemplateSettingVisibility(value: unknown, path: string): TemplateSettingVisibility {
  /** @brief 精确可见性对象 / Exact visibility object. */
  const input = exactRecord(value, path, ['key', 'equals'])
  return {
    equals: parseResumeJsonValue(input.equals, `${path}.equals`),
    key: patternedString(input.key, `${path}.key`, 2, 81, TEMPLATE_KEY_PATTERN)
  }
}

/**
 * @brief 断言 setting 值符合声明类型、范围和 choices / Assert a setting value matches its declared type, range, and choices.
 * @param value 已验证 JSON setting 值 / Validated JSON setting value.
 * @param definition setting 定义 / Setting definition.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
export function assertTemplateSettingValue(
  value: ResumeJsonValue,
  definition: TemplateSettingDefinition,
  path: string
): void {
  /** @brief 值是否匹配声明类型 / Whether the value matches the declared type. */
  let matchesType = false
  switch (definition.value_type) {
    case 'boolean':
      matchesType = typeof value === 'boolean'
      break
    case 'integer':
      matchesType = typeof value === 'number' && Number.isSafeInteger(value)
      break
    case 'number':
      matchesType = typeof value === 'number' && Number.isFinite(value)
      break
    case 'string':
      matchesType = typeof value === 'string'
      break
    case 'choice':
      matchesType = definition.choices.some((choice) => jsonValuesEqual(choice.value, value))
      break
    case 'color':
      try {
        parseColorValue(value, path)
        matchesType = true
      } catch (error) {
        if (!(error instanceof ApiV2ContractError)) throw error
      }
      break
    case 'measurement':
      try {
        parseMeasurement(value, path)
        matchesType = true
      } catch (error) {
        if (!(error instanceof ApiV2ContractError)) throw error
      }
      break
  }
  if (!matchesType) {
    throw new ApiV2ContractError(
      `API v2 field ${path} does not match setting ${definition.key} type ${definition.value_type}.`
    )
  }
  if (typeof value === 'number') {
    if (definition.minimum !== null && value < definition.minimum) {
      throw new ApiV2ContractError(
        `API v2 field ${path} is below setting ${definition.key} minimum.`
      )
    }
    if (definition.maximum !== null && value > definition.maximum) {
      throw new ApiV2ContractError(
        `API v2 field ${path} is above setting ${definition.key} maximum.`
      )
    }
  }
}

/**
 * @brief 严格解码 TemplateSettingDefinition / Strictly decode TemplateSettingDefinition.
 * @param value 未知 setting 定义 / Unknown setting definition.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 setting 定义 / Validated setting definition.
 */
function parseTemplateSettingDefinition(value: unknown, path: string): TemplateSettingDefinition {
  /** @brief 精确 setting 对象 / Exact setting object. */
  const input = exactRecord(value, path, [
    'key',
    'label_key',
    'description_key',
    'value_type',
    'default',
    'minimum',
    'maximum',
    'choices',
    'control',
    'group_key',
    'visible_when'
  ])
  /** @brief 未映射 choices / Unmapped choices. */
  const choiceInputs = arrayBetween(input.choices, `${path}.choices`, 0, 100)
  /** @brief 已验证 setting 定义 / Validated setting definition. */
  const definition: TemplateSettingDefinition = {
    choices: choiceInputs.map((choice, index) =>
      parseTemplateSettingChoice(choice, `${path}.choices[${index}]`)
    ),
    control: closedStringEnum(input.control, `${path}.control`, [
      'switch',
      'slider',
      'number',
      'select',
      'radio',
      'color',
      'measurement',
      'text'
    ]),
    default: parseResumeJsonValue(input.default, `${path}.default`),
    description_key: nullable(input.description_key, (candidate) =>
      boundedString(candidate, `${path}.description_key`, 0, 200)
    ),
    group_key: nullable(input.group_key, (candidate) =>
      boundedString(candidate, `${path}.group_key`, 0, 120)
    ),
    key: patternedString(input.key, `${path}.key`, 2, 81, TEMPLATE_KEY_PATTERN),
    label_key: boundedString(input.label_key, `${path}.label_key`, 1, 200),
    maximum: nullable(input.maximum, (candidate) => finiteNumber(candidate, `${path}.maximum`)),
    minimum: nullable(input.minimum, (candidate) => finiteNumber(candidate, `${path}.minimum`)),
    value_type: closedStringEnum(input.value_type, `${path}.value_type`, [
      'boolean',
      'integer',
      'number',
      'string',
      'choice',
      'color',
      'measurement'
    ]),
    visible_when: nullable(input.visible_when, (candidate) =>
      parseTemplateSettingVisibility(candidate, `${path}.visible_when`)
    )
  }
  if (
    definition.minimum !== null &&
    definition.maximum !== null &&
    definition.minimum > definition.maximum
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} has an inverted numeric range.`)
  }
  assertTemplateSettingValue(definition.default, definition, `${path}.default`)
  return definition
}

/**
 * @brief 严格解码 TemplateZone / Strictly decode TemplateZone.
 * @param value 未知 zone / Unknown zone.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 zone / Validated zone.
 */
function parseTemplateZone(value: unknown, path: string): TemplateZone {
  /** @brief 精确 zone 对象 / Exact zone object. */
  const input = exactRecord(value, path, [
    'id',
    'label_key',
    'accepted_section_kinds',
    'max_sections'
  ])
  /** @brief 未映射 section kinds / Unmapped section kinds. */
  const sectionKindInputs = arrayBetween(
    input.accepted_section_kinds,
    `${path}.accepted_section_kinds`,
    0,
    Number.MAX_SAFE_INTEGER
  )
  /** @brief 已验证 section kinds / Validated section kinds. */
  const sectionKinds = sectionKindInputs.map((kind, index) =>
    patternedString(
      kind,
      `${path}.accepted_section_kinds[${index}]`,
      2,
      81,
      TEMPLATE_SECTION_KIND_PATTERN
    )
  )
  assertUniqueStrings(sectionKinds, `${path}.accepted_section_kinds`)
  return {
    accepted_section_kinds: sectionKinds,
    id: patternedString(input.id, `${path}.id`, 2, 81, TEMPLATE_KEY_PATTERN),
    label_key: boundedString(input.label_key, `${path}.label_key`, 1, 200),
    max_sections: nullable(input.max_sections, (candidate) =>
      boundedInteger(candidate, `${path}.max_sections`, 1, 100)
    )
  }
}

/**
 * @brief 严格解码 TemplateCapabilities / Strictly decode TemplateCapabilities.
 * @param value 未知 capabilities / Unknown capabilities.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 capabilities / Validated capabilities.
 */
function parseTemplateCapabilities(value: unknown, path: string): TemplateCapabilities {
  /** @brief 精确 capabilities 对象 / Exact capabilities object. */
  const input = exactRecord(value, path, [
    'supports_photo',
    'supports_sidebar',
    'supports_custom_sections',
    'supports_source_map',
    'max_columns'
  ])
  return {
    max_columns: boundedInteger(input.max_columns, `${path}.max_columns`, 1, 12),
    supports_custom_sections: booleanValue(
      input.supports_custom_sections,
      `${path}.supports_custom_sections`
    ),
    supports_photo: booleanValue(input.supports_photo, `${path}.supports_photo`),
    supports_sidebar: booleanValue(input.supports_sidebar, `${path}.supports_sidebar`),
    supports_source_map: booleanValue(input.supports_source_map, `${path}.supports_source_map`)
  }
}

/**
 * @brief 解码唯一字符串数组 / Decode an array of unique strings.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最小条目数 / Minimum item count.
 * @param itemDecoder 单条字符串 decoder / Per-item string decoder.
 * @return 已验证唯一字符串数组 / Validated unique string array.
 */
function parseUniqueStrings<TValue extends string>(
  value: unknown,
  path: string,
  minimumItems: number,
  itemDecoder: (item: unknown, itemPath: string) => TValue
): readonly TValue[] {
  /** @brief 未映射数组 / Unmapped array. */
  const input = arrayBetween(value, path, minimumItems, Number.MAX_SAFE_INTEGER)
  /** @brief 已验证字符串 / Validated strings. */
  const decoded = input.map((item, index) => itemDecoder(item, `${path}[${index}]`))
  assertUniqueStrings(decoded, path)
  return decoded
}

/**
 * @brief 校验 TemplateManifest 内部引用和值约束 / Validate internal references and value constraints in TemplateManifest.
 * @param manifest 已按字段解码的清单 / Field-decoded manifest.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertManifestConsistency(manifest: TemplateManifest, path: string): void {
  assertUniqueBy(manifest.zones, (zone) => zone.id, `${path}.zones`)
  assertUniqueBy(manifest.settings, (setting) => setting.key, `${path}.settings`)
  /** @brief 支持的 section kind 集合 / Supported section-kind set. */
  const supportedKinds = new Set(manifest.supported_section_kinds)
  for (const zone of manifest.zones) {
    if (zone.accepted_section_kinds.some((kind) => !supportedKinds.has(kind))) {
      throw new ApiV2ContractError(
        `API v2 field ${path}.zones references an unsupported section kind.`
      )
    }
  }
  /** @brief setting 定义索引 / Setting-definition index. */
  const settingsByKey = new Map(manifest.settings.map((setting) => [setting.key, setting]))
  for (const setting of manifest.settings) {
    if (setting.visible_when === null) continue
    /** @brief 可见性依赖 setting / Visibility dependency setting. */
    const dependency = settingsByKey.get(setting.visible_when.key)
    if (dependency === undefined || dependency.key === setting.key) {
      throw new ApiV2ContractError(
        `API v2 field ${path}.settings contains an invalid visibility dependency.`
      )
    }
    assertTemplateSettingValue(
      setting.visible_when.equals,
      dependency,
      `${path}.settings[${setting.key}].visible_when.equals`
    )
  }
}

/**
 * @brief 严格解码完整 TemplateManifest / Strictly decode a complete TemplateManifest.
 * @param value 未知模板清单 / Unknown template manifest.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证模板清单 / Validated template manifest.
 */
export function parseTemplateManifest(
  value: unknown,
  path = 'template_manifest'
): TemplateManifest {
  /** @brief 精确模板清单对象 / Exact template-manifest object. */
  const input = exactRecord(value, path, [
    'id',
    'version',
    'name',
    'description',
    'preview_url',
    'supported_locales',
    'supported_page_sizes',
    'supported_output_formats',
    'supported_section_kinds',
    'zones',
    'font_family_tokens',
    'date_format_tokens',
    'bullet_style_tokens',
    'capabilities',
    'settings',
    'published_at'
  ])
  /** @brief 未映射 zones / Unmapped zones. */
  const zoneInputs = arrayBetween(input.zones, `${path}.zones`, 1, 20)
  /** @brief 未映射 settings / Unmapped settings. */
  const settingInputs = arrayBetween(input.settings, `${path}.settings`, 0, 100)
  /** @brief 已验证模板清单 / Validated template manifest. */
  const manifest: TemplateManifest = {
    bullet_style_tokens: parseUniqueStrings(
      input.bullet_style_tokens,
      `${path}.bullet_style_tokens`,
      1,
      (item, itemPath) => boundedString(item, itemPath, 0, 120)
    ),
    capabilities: parseTemplateCapabilities(input.capabilities, `${path}.capabilities`),
    date_format_tokens: parseUniqueStrings(
      input.date_format_tokens,
      `${path}.date_format_tokens`,
      1,
      (item, itemPath) => boundedString(item, itemPath, 0, 120)
    ),
    description: nullable(input.description, (candidate) =>
      boundedString(candidate, `${path}.description`, 0, 2000)
    ),
    font_family_tokens: parseUniqueStrings(
      input.font_family_tokens,
      `${path}.font_family_tokens`,
      1,
      (item, itemPath) => boundedString(item, itemPath, 0, 120)
    ),
    id: opaqueId(input.id, `${path}.id`),
    name: boundedString(input.name, `${path}.name`, 1, 200),
    preview_url: nullable(input.preview_url, (candidate) =>
      networkUrl(candidate, `${path}.preview_url`)
    ),
    published_at: timestamp(input.published_at, `${path}.published_at`),
    settings: settingInputs.map((setting, index) =>
      parseTemplateSettingDefinition(setting, `${path}.settings[${index}]`)
    ),
    supported_locales: parseUniqueStrings(
      input.supported_locales,
      `${path}.supported_locales`,
      1,
      (item, itemPath) => locale(item, itemPath)
    ),
    supported_output_formats: parseUniqueStrings(
      input.supported_output_formats,
      `${path}.supported_output_formats`,
      1,
      (item, itemPath) => closedStringEnum(item, itemPath, ['pdf', 'png', 'html_snapshot', 'docx'])
    ),
    supported_page_sizes: parseUniqueStrings(
      input.supported_page_sizes,
      `${path}.supported_page_sizes`,
      1,
      (item, itemPath) => closedStringEnum(item, itemPath, ['A4', 'LETTER', 'LEGAL', 'CUSTOM'])
    ),
    supported_section_kinds: parseUniqueStrings(
      input.supported_section_kinds,
      `${path}.supported_section_kinds`,
      0,
      (item, itemPath) => patternedString(item, itemPath, 2, 81, TEMPLATE_SECTION_KIND_PATTERN)
    ),
    version: boundedString(input.version, `${path}.version`, 1, 80),
    zones: zoneInputs.map((zone, index) => parseTemplateZone(zone, `${path}.zones[${index}]`))
  }
  assertManifestConsistency(manifest, path)
  return manifest
}

/**
 * @brief 严格解码 TemplateList 与分页联合约束 / Strictly decode TemplateList and its pagination relation.
 * @param value 未知模板列表 / Unknown template list.
 * @return 已验证模板 cursor 页 / Validated template cursor page.
 */
export function parseTemplateList(value: unknown): TemplateList {
  /** @brief 精确列表对象 / Exact list object. */
  const input = exactRecord(value, 'template_list', ['items', 'page'])
  /** @brief 未映射 manifests / Unmapped manifests. */
  const items = arrayBetween(input.items, 'template_list.items', 0, 200)
  return {
    items: items.map((item, index) => parseTemplateManifest(item, `template_list.items[${index}]`)),
    page: parseCursorPage(input.page, 'template_list.page')
  }
}
