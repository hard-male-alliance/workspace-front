/** @file Resume Template setting 的纯领域策略 / Pure domain policy for Resume Template settings. */

import type { UiJsonValue, UiMeasurement, UiResumeDocument, UiResumeStyleIntent } from './document'
import type {
  UiResumeTemplateSectionFact,
  UiTemplateManifest,
  UiTemplateSettingDefinition
} from './models'
import { cloneUiJsonValue, uiJsonValuesEqual } from '../../../shared-kernel/json'

/** @brief Template setting 策略拒绝原因 / Rejection reasons from the Template-setting policy. */
export type ResumeTemplateSettingPolicyCode =
  'hidden-setting' | 'invalid-setting-value' | 'unknown-setting'

/**
 * @brief Template setting 无法形成可信命令 / A Template setting cannot form a trustworthy command.
 * @note 错误只携带稳定 code 与 setting key，不复制潜在敏感值 / The error carries only a stable code and setting key, never the potentially sensitive value.
 */
export class ResumeTemplateSettingPolicyError extends Error {
  /** @brief 稳定错误名称 / Stable error name. */
  override readonly name = 'ResumeTemplateSettingPolicyError'
  /** @brief 稳定拒绝原因 / Stable rejection reason. */
  readonly code: ResumeTemplateSettingPolicyCode
  /** @brief 被拒绝的 setting key / Rejected setting key. */
  readonly settingKey: string

  /**
   * @brief 构造不泄漏 setting value 的领域错误 / Construct a domain error that does not disclose a setting value.
   * @param code 稳定拒绝原因 / Stable rejection reason.
   * @param settingKey 被拒绝的 setting key / Rejected setting key.
   */
  constructor(code: ResumeTemplateSettingPolicyCode, settingKey: string) {
    super(`Resume Template setting ${settingKey} was rejected by policy ${code}.`)
    this.code = code
    this.settingKey = settingKey
  }
}

/** @brief Resume 与固定 TemplateManifest 的不兼容原因 / Reasons a Resume is incompatible with its pinned TemplateManifest. */
export type ResumeTemplateCompatibilityCode =
  | 'invalid-density'
  | 'invalid-page-intent'
  | 'invalid-palette'
  | 'invalid-section-layout'
  | 'invalid-style-contract-version'
  | 'invalid-style-token'
  | 'invalid-typography'
  | 'template-identity-mismatch'
  | 'unsupported-bullet-token'
  | 'unsupported-date-token'
  | 'unsupported-font-token'
  | 'unsupported-locale'
  | 'unsupported-page-size'
  | 'unsupported-section-kind'
  | 'zone-section-limit'

/** @brief 校验模板兼容性所需的最小 Resume 事实 / Minimal Resume facts required for Template compatibility validation. */
export interface ResumeTemplateCompatibilityFacts {
  /** @brief Resume 内容语言 / Resume content locale. */
  readonly locale: string
  /** @brief 当前语义 section 身份与 kind / Current semantic section identities and kinds. */
  readonly sections: readonly UiResumeTemplateSectionFact[]
  /** @brief 待校验的完整样式意图 / Complete style intent to validate. */
  readonly styleIntent: UiResumeStyleIntent
}

/** @brief 一个可定位的模板兼容性问题 / One field-addressable Template compatibility issue. */
export interface ResumeTemplateCompatibilityIssue {
  /** @brief 稳定领域错误 code / Stable domain-error code. */
  readonly code: Exclude<ResumeTemplateCompatibilityCode, 'template-identity-mismatch'>
  /** @brief 面向领域模型的字段路径，不是 transport JSON Pointer / Domain-model field path, not a transport JSON Pointer. */
  readonly fieldPath: readonly string[]
}

/**
 * @brief Resume 权威无法由固定 TemplateManifest 安全解释 / Resume authority cannot be safely interpreted by its pinned TemplateManifest.
 * @note 错误只暴露稳定原因，不回显服务端内容 / The error exposes only a stable reason and never echoes server content.
 */
export class ResumeTemplateCompatibilityError extends Error {
  /** @brief 稳定错误名称 / Stable error name. */
  override readonly name = 'ResumeTemplateCompatibilityError'
  /** @brief 稳定不兼容原因 / Stable incompatibility reason. */
  readonly code: ResumeTemplateCompatibilityCode

  /**
   * @brief 构造模板兼容性错误 / Construct a Template-compatibility error.
   * @param code 稳定不兼容原因 / Stable incompatibility reason.
   */
  constructor(code: ResumeTemplateCompatibilityCode) {
    super(`Resume authority was rejected by Template compatibility policy ${code}.`)
    this.code = code
  }
}

/**
 * @brief 判断未知对象是否只有给定成员 / Determine whether an unknown object has exactly the given members.
 * @param value 候选对象 / Candidate object.
 * @param keys 允许且必须存在的成员 / Members that are both allowed and required.
 * @return 候选为精确普通 JSON 对象时为 true / True when the candidate is an exact plain JSON object.
 */
function hasExactKeys(
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  /** @brief 候选自有成员 / Candidate own members. */
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

/** @brief API v2 Measurement 允许的闭合单位 / Closed Measurement units allowed by API v2. */
const RESUME_MEASUREMENT_UNITS = ['pt', 'mm', 'cm', 'in', 'px', 'em', 'percent'] as const

/**
 * @brief 校验 measurement setting 的结构 / Validate the structure of a measurement setting.
 * @param value 候选 JSON 值 / Candidate JSON value.
 * @return 候选满足 API v2 Measurement 时为 true / True when the candidate satisfies API v2 Measurement.
 */
function isValidResumeMeasurement(value: unknown): value is UiMeasurement {
  return (
    hasExactKeys(value, ['unit', 'value']) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    typeof value.unit === 'string' &&
    RESUME_MEASUREMENT_UNITS.some((unit) => unit === value.unit)
  )
}

/**
 * @brief 校验 color setting 的结构 / Validate the structure of a color setting.
 * @param value 候选 JSON 值 / Candidate JSON value.
 * @return 候选满足 API v2 ColorValue 时为 true / True when the candidate satisfies API v2 ColorValue.
 */
function isValidResumeColor(value: unknown): boolean {
  return (
    hasExactKeys(value, ['space', 'value']) &&
    (value.space === 'srgb_hex' || value.space === 'rgba') &&
    typeof value.value === 'string' &&
    value.value.length >= 1 &&
    [...value.value].length <= 80
  )
}

/**
 * @brief 判断显式 setting 值是否满足 manifest 定义 / Determine whether an explicit setting value satisfies its manifest definition.
 * @param value 候选显式值 / Candidate explicit value.
 * @param definition 不可变 setting 定义 / Immutable setting definition.
 * @return 类型、范围与 choices 全部满足时为 true / True when type, range, and choices all match.
 */
export function isTemplateSettingValueValid(
  value: UiJsonValue,
  definition: UiTemplateSettingDefinition
): boolean {
  /** @brief 值是否满足声明类型 / Whether the value satisfies the declared type. */
  let matchesType = false
  switch (definition.valueType) {
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
      matchesType = definition.choices.some((choice) => uiJsonValuesEqual(choice.value, value))
      break
    case 'color':
      matchesType = isValidResumeColor(value)
      break
    case 'measurement':
      matchesType = isValidResumeMeasurement(value)
      break
  }
  if (!matchesType) return false
  if (typeof value !== 'number') return true
  return (
    (definition.minimum === null || value >= definition.minimum) &&
    (definition.maximum === null || value <= definition.maximum)
  )
}

/**
 * @brief 只读解析 setting 的有效值而不复制公开 JSON / Resolve a setting's effective value read-only without cloning published JSON.
 * @param definition setting 定义 / Setting definition.
 * @param explicitSettings 用户或服务端显式保存的稀疏值 / Sparse values explicitly saved by the user or server.
 * @return 显式值，缺失时返回 manifest 默认值 / Explicit value, or the manifest default when absent.
 * @note 仅供纯只读策略使用，避免每个 visible_when 依赖重复复制大型值。 / Intended only for pure read-only policy so each visible_when dependency does not repeatedly clone large values.
 */
function readEffectiveTemplateSettingValue(
  definition: UiTemplateSettingDefinition,
  explicitSettings: Readonly<Record<string, UiJsonValue>>
): UiJsonValue {
  /** @brief 显式值或不可变默认值 / Explicit value or immutable default. */
  const value = Object.hasOwn(explicitSettings, definition.key)
    ? explicitSettings[definition.key]
    : definition.defaultValue
  if (value === undefined) {
    throw new ResumeTemplateSettingPolicyError('invalid-setting-value', definition.key)
  }
  return value
}

/**
 * @brief 读取 setting 的独立有效显示值而不物化默认值 / Read an independent effective display value without materializing its default.
 * @param definition setting 定义 / Setting definition.
 * @param explicitSettings 用户或服务端显式保存的稀疏值 / Sparse values explicitly saved by the user or server.
 * @return 显式值，缺失时返回 manifest 默认值的独立副本 / Explicit value, or an independent copy of the manifest default when absent.
 */
export function getEffectiveTemplateSettingValue(
  definition: UiTemplateSettingDefinition,
  explicitSettings: Readonly<Record<string, UiJsonValue>>
): UiJsonValue {
  return cloneUiJsonValue(readEffectiveTemplateSettingValue(definition, explicitSettings))
}

/**
 * @brief 按精确 JSON 相等判断 setting 当前是否可见 / Determine current setting visibility using exact JSON equality.
 * @param setting 目标 setting 定义 / Target setting definition.
 * @param manifest 包含依赖定义的不可变 manifest / Immutable manifest containing dependency definitions.
 * @param explicitSettings 当前稀疏显式值 / Current sparse explicit values.
 * @return 无条件或条件精确成立时为 true / True when unconditional or when the condition matches exactly.
 */
export function isTemplateSettingVisible(
  setting: UiTemplateSettingDefinition,
  manifest: UiTemplateManifest,
  explicitSettings: Readonly<Record<string, UiJsonValue>>
): boolean {
  if (setting.visibleWhen === null) return true
  /** @brief 可见性依赖的 setting 定义 / Setting definition on which visibility depends. */
  const dependency = manifest.settings.find(
    (candidate) => candidate.key === setting.visibleWhen?.key
  )
  if (dependency === undefined || dependency.key === setting.key) {
    throw new ResumeTemplateSettingPolicyError('invalid-setting-value', setting.key)
  }
  /** @brief 依赖 setting 的有效值 / Effective value of the dependency setting. */
  const dependencyValue = readEffectiveTemplateSettingValue(dependency, explicitSettings)
  if (!isTemplateSettingValueValid(dependencyValue, dependency)) {
    throw new ResumeTemplateSettingPolicyError('invalid-setting-value', dependency.key)
  }
  return uiJsonValuesEqual(dependencyValue, setting.visibleWhen.equals)
}

/**
 * @brief 将模板草稿投影为可提交的稀疏 settings / Project a Template draft into sparse settings safe to submit.
 * @param manifest 目标不可变 TemplateManifest / Target immutable TemplateManifest.
 * @param draftSettings 以模板复合身份隔离的本地草稿 / Local draft isolated by the Template composite identity.
 * @return 仅含显式、合法且当前可见值的独立对象 / Independent object containing only explicit, valid, currently visible values.
 * @throws {ResumeTemplateSettingPolicyError} unknown 或可见且类型错误的草稿值不能形成命令 / Unknown or visible mistyped draft values cannot form a command.
 * @note 隐藏值留在调用方草稿中但不进入命令；默认值只用于显示与 visible_when，不写回服务端。 / Hidden values remain in caller-owned drafts but do not enter the command; defaults are used only for display and visible_when, never written back.
 */
export function projectVisibleTemplateSettings(
  manifest: UiTemplateManifest,
  draftSettings: Readonly<Record<string, UiJsonValue>>
): Readonly<Record<string, UiJsonValue>> {
  /** @brief manifest setting 索引 / Manifest-setting index. */
  const definitions = new Map(manifest.settings.map((setting) => [setting.key, setting]))
  for (const key of Object.keys(draftSettings)) {
    if (!definitions.has(key)) {
      throw new ResumeTemplateSettingPolicyError('unknown-setting', key)
    }
  }

  /** @brief 只含显式可见值的无原型 JSON 对象 / Prototype-free JSON object containing only explicit visible values. */
  const projected: Record<string, UiJsonValue> = Object.create(null) as Record<string, UiJsonValue>
  for (const setting of manifest.settings) {
    if (
      Object.hasOwn(draftSettings, setting.key) &&
      isTemplateSettingVisible(setting, manifest, draftSettings)
    ) {
      /** @brief 当前可见显式值 / Current visible explicit value. */
      const value = draftSettings[setting.key]
      if (value === undefined || !isTemplateSettingValueValid(value, setting)) {
        throw new ResumeTemplateSettingPolicyError('invalid-setting-value', setting.key)
      }
      projected[setting.key] = cloneUiJsonValue(value)
    }
  }
  return projected
}

/**
 * @brief 验证服务端权威 settings 未包含 unknown、隐藏或错误类型的值 / Validate that authoritative server settings contain no unknown, hidden, or mistyped value.
 * @param manifest Resume 固定的精确 TemplateManifest / Exact TemplateManifest pinned by the Resume.
 * @param authoritativeSettings 服务端返回的显式 settings / Explicit settings returned by the server.
 * @throws {ResumeTemplateSettingPolicyError} 权威无法按 manifest 安全解释 / The authority cannot be interpreted safely under the manifest.
 */
export function assertAuthoritativeTemplateSettings(
  manifest: UiTemplateManifest,
  authoritativeSettings: Readonly<Record<string, UiJsonValue>>
): void {
  /** @brief 投影后的可见显式值 / Projected visible explicit values. */
  const visible = projectVisibleTemplateSettings(manifest, authoritativeSettings)
  for (const key of Object.keys(authoritativeSettings)) {
    if (!Object.hasOwn(visible, key)) {
      throw new ResumeTemplateSettingPolicyError('hidden-setting', key)
    }
  }
}

/**
 * @brief 判断字符串的 Unicode code point 长度是否在边界内 / Determine whether a string's Unicode-code-point length is within bounds.
 * @param value 候选值 / Candidate value.
 * @param minimum 最小长度 / Minimum length.
 * @param maximum 最大长度 / Maximum length.
 * @return 候选为边界内字符串时为 true / True when the candidate is a string within the bounds.
 */
function isBoundedResumeString(value: unknown, minimum: number, maximum: number): value is string {
  if (typeof value !== 'string') return false
  /** @brief Unicode code point 数 / Unicode-code-point count. */
  const length = [...value].length
  return length >= minimum && length <= maximum
}

/**
 * @brief 收集完整样式与目标 TemplateManifest 的全部可判定问题 / Collect every decidable issue between a complete style and its target TemplateManifest.
 * @param facts 与同一 Resume 权威绑定的语言、sections 与候选样式 / Locale, sections, and candidate style bound to one Resume authority.
 * @param manifest 用户明确选择的精确不可变 manifest / Exact immutable manifest explicitly selected by the user.
 * @return 稳定 code 与领域字段路径组成的问题列表 / Issues expressed as stable codes and domain field paths.
 * @note 此函数不校验 template identity，也不判断 setting 的 visible_when；前者由聚合断言负责，后者由 setting policy 负责。 / This function validates neither Template identity nor setting visible_when; the aggregate assertion owns the former and the setting policy owns the latter.
 */
export function collectResumeTemplateCompatibilityIssues(
  facts: ResumeTemplateCompatibilityFacts,
  manifest: UiTemplateManifest
): readonly ResumeTemplateCompatibilityIssue[] {
  /** @brief 按稳定遍历顺序收集的问题 / Issues collected in stable traversal order. */
  const issues: ResumeTemplateCompatibilityIssue[] = []
  /** @brief 候选完整样式 / Candidate complete style. */
  const style = facts.styleIntent
  /** @brief 追加一个稳定问题 / Append one stable issue. */
  const addIssue = (
    code: ResumeTemplateCompatibilityIssue['code'],
    ...fieldPath: string[]
  ): void => {
    issues.push({ code, fieldPath })
  }

  if (style.styleContractVersion !== '1.0') {
    addIssue('invalid-style-contract-version', 'styleIntent', 'styleContractVersion')
  }
  if (
    !manifest.supportedLocales.some((locale) => locale.toLowerCase() === facts.locale.toLowerCase())
  ) {
    addIssue('unsupported-locale', 'locale')
  }
  if (!manifest.supportedPageSizes.includes(style.page.size)) {
    addIssue('unsupported-page-size', 'styleIntent', 'page', 'size')
  }
  if (style.page.customWidth !== null && !isValidResumeMeasurement(style.page.customWidth)) {
    addIssue('invalid-page-intent', 'styleIntent', 'page', 'customWidth')
  }
  if (style.page.customHeight !== null && !isValidResumeMeasurement(style.page.customHeight)) {
    addIssue('invalid-page-intent', 'styleIntent', 'page', 'customHeight')
  }
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    /** @brief 当前固定页面边的 measurement / Measurement for the current fixed page edge. */
    const measurement = style.page.margins[edge]
    if (!isValidResumeMeasurement(measurement)) {
      addIssue('invalid-page-intent', 'styleIntent', 'page', 'margins', edge)
    }
  }
  if (style.page.orientation !== 'portrait' && style.page.orientation !== 'landscape') {
    addIssue('invalid-page-intent', 'styleIntent', 'page', 'orientation')
  }
  if (
    style.page.maxPages !== null &&
    (!Number.isInteger(style.page.maxPages) || style.page.maxPages < 1 || style.page.maxPages > 100)
  ) {
    addIssue('invalid-page-intent', 'styleIntent', 'page', 'maxPages')
  }
  if (typeof style.page.showPageNumbers !== 'boolean') {
    addIssue('invalid-page-intent', 'styleIntent', 'page', 'showPageNumbers')
  }
  if (!isBoundedResumeString(style.typography.fontFamilyToken, 1, 120)) {
    addIssue('invalid-typography', 'styleIntent', 'typography', 'fontFamilyToken')
  } else if (!manifest.fontFamilyTokens.includes(style.typography.fontFamilyToken)) {
    addIssue('unsupported-font-token', 'styleIntent', 'typography', 'fontFamilyToken')
  }
  /** @brief Typography 数值字段及其闭区间 / Typography numeric fields and their closed ranges. */
  const typographyBounds = [
    ['baseSizePt', style.typography.baseSizePt, 5, 72],
    ['lineHeight', style.typography.lineHeight, 0.5, 5],
    ['headingScale', style.typography.headingScale, 0.5, 5],
    ['letterSpacingEm', style.typography.letterSpacingEm, -1, 2]
  ] as const
  for (const [field, value, minimum, maximum] of typographyBounds) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      addIssue('invalid-typography', 'styleIntent', 'typography', field)
    }
  }
  for (const field of ['primary', 'secondary', 'text', 'mutedText', 'background'] as const) {
    /** @brief 当前固定 palette 叶 / Current fixed palette leaf. */
    const color = style.palette[field]
    if (!isValidResumeColor(color)) {
      addIssue('invalid-palette', 'styleIntent', 'palette', field)
    }
  }
  if (!Number.isFinite(style.density) || style.density < 0 || style.density > 1) {
    addIssue('invalid-density', 'styleIntent', 'density')
  }
  if (!isBoundedResumeString(style.dateFormatToken, 1, 120)) {
    addIssue('invalid-style-token', 'styleIntent', 'dateFormatToken')
  } else if (!manifest.dateFormatTokens.includes(style.dateFormatToken)) {
    addIssue('unsupported-date-token', 'styleIntent', 'dateFormatToken')
  }
  if (!isBoundedResumeString(style.bulletStyleToken, 1, 120)) {
    addIssue('invalid-style-token', 'styleIntent', 'bulletStyleToken')
  } else if (!manifest.bulletStyleTokens.includes(style.bulletStyleToken)) {
    addIssue('unsupported-bullet-token', 'styleIntent', 'bulletStyleToken')
  }

  /** @brief Resume section identity 索引 / Resume-section identity index. */
  const sectionsById = new Map(facts.sections.map((section) => [section.id, section]))
  for (const section of facts.sections) {
    if (!manifest.supportedSectionKinds.includes(section.kind)) {
      addIssue('unsupported-section-kind', 'sections', section.id, 'kind')
    }
  }
  /** @brief Template zone identity 索引 / Template-zone identity index. */
  const zonesById = new Map(manifest.zones.map((zone) => [zone.id, zone]))
  /** @brief 每个 zone 的最终 section 使用数 / Final section usage count for each zone. */
  const zoneUsage = new Map<string, number>()
  if (style.sectionLayout.length > 100) {
    addIssue('invalid-section-layout', 'styleIntent', 'sectionLayout')
  }
  for (const layout of style.sectionLayout) {
    /** @brief 当前布局引用的 section / Section referenced by the current layout. */
    const section = sectionsById.get(layout.sectionId)
    /** @brief 当前布局引用的 zone / Zone referenced by the current layout. */
    const zone = zonesById.get(layout.zone)
    if (
      section === undefined ||
      zone === undefined ||
      !zone.acceptedSectionKinds.includes(section.kind) ||
      !isBoundedResumeString(layout.zone, 1, 80)
    ) {
      addIssue('invalid-section-layout', 'styleIntent', 'sectionLayout', layout.sectionId, 'zone')
    }
    if (typeof layout.keepTogether !== 'boolean') {
      addIssue(
        'invalid-section-layout',
        'styleIntent',
        'sectionLayout',
        layout.sectionId,
        'keepTogether'
      )
    }
    if (typeof layout.pageBreakBefore !== 'boolean') {
      addIssue(
        'invalid-section-layout',
        'styleIntent',
        'sectionLayout',
        layout.sectionId,
        'pageBreakBefore'
      )
    }
    if (!Number.isFinite(layout.compactness) || layout.compactness < 0 || layout.compactness > 1) {
      addIssue(
        'invalid-section-layout',
        'styleIntent',
        'sectionLayout',
        layout.sectionId,
        'compactness'
      )
    }
    if (
      layout.headingStyleToken !== null &&
      !isBoundedResumeString(layout.headingStyleToken, 0, 120)
    ) {
      addIssue(
        'invalid-section-layout',
        'styleIntent',
        'sectionLayout',
        layout.sectionId,
        'headingStyleToken'
      )
    }
    if (zone !== undefined) {
      zoneUsage.set(zone.id, (zoneUsage.get(zone.id) ?? 0) + 1)
    }
  }
  for (const zone of manifest.zones) {
    if (zone.maxSections !== null && (zoneUsage.get(zone.id) ?? 0) > zone.maxSections) {
      for (const layout of style.sectionLayout) {
        if (layout.zone === zone.id) {
          addIssue('zone-section-limit', 'styleIntent', 'sectionLayout', layout.sectionId, 'zone')
        }
      }
    }
  }
  return issues
}

/**
 * @brief 按 API v2 可判定不变量验证 Resume 与固定 manifest / Validate a Resume against its pinned manifest using every API v2 invariant decidable by the client.
 * @param resume 完整 Resume 权威 / Complete Resume authority.
 * @param manifest 从精确版本路由读取的不可变 manifest / Immutable manifest read from the exact-version route.
 * @throws {ResumeTemplateCompatibilityError} template identity、locale、style token、section 或 zone 不兼容 / Template identity, locale, style token, section, or zone is incompatible.
 * @throws {ResumeTemplateSettingPolicyError} setting 包含 unknown、隐藏或错误类型值 / A setting is unknown, hidden, or mistyped.
 * @note output format 属于 Render command 而非 ResumeDocument，必须由对应 Render 用例另行验证。 / Output format belongs to a Render command rather than ResumeDocument and must be validated by that Render use case.
 */
export function assertResumeMatchesTemplateManifest(
  resume: UiResumeDocument,
  manifest: UiTemplateManifest
): void {
  if (
    resume.template.templateId !== manifest.id ||
    resume.template.templateVersion !== manifest.version
  ) {
    throw new ResumeTemplateCompatibilityError('template-identity-mismatch')
  }
  /** @brief 同一纯策略收集的首个兼容性问题 / First compatibility issue collected by the shared pure policy. */
  const issue = collectResumeTemplateCompatibilityIssues(
    {
      locale: resume.locale,
      sections: resume.sections.map((section) => ({ id: section.id, kind: section.kind })),
      styleIntent: resume.styleIntent
    },
    manifest
  )[0]
  if (issue !== undefined) throw new ResumeTemplateCompatibilityError(issue.code)
  assertAuthoritativeTemplateSettings(manifest, resume.styleIntent.templateSettings)
}
