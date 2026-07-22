import {
  ArrowLeft,
  Check,
  Columns2,
  Info,
  LayoutTemplate,
  Palette,
  SlidersHorizontal
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  useAsyncResource,
  useResumeGateway,
  useResumeTemplateCatalog,
  useWorkspaceSession
} from '../../../app/AppData'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { requiresAuthorityReload } from '../../../app/resource-errors'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { LoadingState } from '../../../ui'
import type {
  UiColorValue,
  UiJsonValue,
  UiMeasurement,
  UiMeasurementUnit,
  UiResumePageSize
} from '../domain/document'
import type {
  UiTemplateManifest,
  UiTemplateSettingDefinition,
  UiTemplateSettingsModel
} from '../domain/models'
import type { ResumeGateway } from '../application/gateway'
import type { ResumeTemplateCatalogPort } from '../application/resume-creation'
import { getResumeBatchConflict } from '../application/errors'
import {
  getTemplateIdentity,
  loadResumeTemplateSettings,
  projectResumeTemplateSettings
} from '../application/template-catalog'

/**
 * @brief 选择模板缩略图的样式 / Select a template-thumbnail style.
 * @param template 模板展示模型 / Template display model.
 * @return 对应视觉预览的 CSS 类名 / CSS class for its visual preview.
 */
function getTemplateThumbnailClass(template: UiTemplateManifest): string {
  if (template.capabilities.supportsSidebar) {
    return 'aw-template-thumbnail aw-template-thumbnail--sidebar'
  }

  return 'aw-template-thumbnail aw-template-thumbnail--compact'
}

/**
 * @brief 将任意 JSON 模板值规范化为稳定比较键 / Canonicalize any JSON template value into a stable comparison key.
 * @param value 模板设置值 / Template setting value.
 * @return 对象键顺序无关且保留 JSON 类型的键 / Key preserving JSON types independently of object-key order.
 * @note 该函数只服务本地控件匹配，不是传输序列化，也不会生成 CSS。
 */
function getTemplateSettingValueKey(value: UiJsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`
  if (typeof value === 'number') return `number:${JSON.stringify(value)}`
  if (typeof value === 'boolean') return `boolean:${value ? 'true' : 'false'}`
  if (Array.isArray(value)) {
    return `array:[${value.map(getTemplateSettingValueKey).join(',')}]`
  }
  /** @brief 已窄化为 JSON 对象的设置值 / Setting value narrowed to a JSON object. */
  const objectValue = value as Readonly<Record<string, UiJsonValue>>
  /** @brief 按字符串词典序稳定排列的对象成员 / Object members in stable string-lexicographic order. */
  const entries = Object.entries(objectValue).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )
  return `object:{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${getTemplateSettingValueKey(item)}`)
    .join(',')}}`
}

/**
 * @brief 生成语义模板值的只读展示文本 / Produce read-only display text for a semantic template value.
 * @param value 模板设置值 / Template setting value.
 * @return 面向用户的展示文本 / User-facing display text.
 */
function getTemplateSettingValueText(value: UiJsonValue): string {
  if (value === null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (isColorValue(value)) return value.value
  if (isMeasurementValue(value)) return `${value.value} ${value.unit}`
  return getTemplateSettingValueKey(value).replace(/^(?:array:|object:)/u, '')
}

/** @brief 模板设置草稿中由页面直接编辑的值 / Template-setting draft values directly edited by the page. */
interface TemplateSettingsDraft {
  /** @brief 目标模板的不可变身份 / Immutable target-template identity. */
  readonly templateIdentity: string
  /** @brief 页面规格 / Page size. */
  readonly pageSize: UiResumePageSize
  /** @brief 字体令牌 / Font-family token. */
  readonly fontFamilyToken: string
  /** @brief 内容密度 / Content density. */
  readonly density: number
  /** @brief 日期格式令牌 / Date-format token. */
  readonly dateFormatToken: string
  /** @brief 项目符号令牌 / Bullet-style token. */
  readonly bulletStyleToken: string
  /** @brief 模板自定义设置 / Template-defined settings. */
  readonly settings: Readonly<Record<string, UiJsonValue>>
}

/** @brief 受支持的测量单位 / Supported measurement units. */
const measurementUnitValues: readonly UiMeasurementUnit[] = [
  'pt',
  'mm',
  'cm',
  'in',
  'px',
  'em',
  'percent'
]

/** @brief 受支持的测量单位集合 / Supported measurement-unit set. */
const measurementUnits = new Set<UiMeasurementUnit>(measurementUnitValues)

/**
 * @brief 判断模板值是否为颜色值 / Determine whether a template value is a color value.
 * @param value 待检查值 / Value to inspect.
 * @return 值具有受支持颜色结构时为 true / True when the value has a supported color shape.
 */
function isColorValue(value: UiJsonValue | UiColorValue): value is UiColorValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  /** @brief 待识别的颜色对象 / Candidate color object. */
  const candidate = value as Readonly<Record<string, UiJsonValue>>
  if (!Object.keys(candidate).every((key) => key === 'space' || key === 'value')) return false
  if (candidate.space !== 'srgb_hex' && candidate.space !== 'rgba') return false
  return (
    typeof candidate.value === 'string' &&
    [...candidate.value].length >= 1 &&
    [...candidate.value].length <= 80
  )
}

/**
 * @brief 判断模板值是否为有限测量值 / Determine whether a template value is a finite measurement.
 * @param value 待检查值 / Value to inspect.
 * @return 值具有受支持测量结构时为 true / True when the value has a supported measurement shape.
 */
function isMeasurementValue(value: UiJsonValue | UiMeasurement): value is UiMeasurement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  /** @brief 待识别的测量对象 / Candidate measurement object. */
  const candidate = value as Readonly<Record<string, UiJsonValue>>
  return (
    Object.keys(candidate).every((key) => key === 'unit' || key === 'value') &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    typeof candidate.unit === 'string' &&
    measurementUnits.has(candidate.unit as UiMeasurementUnit)
  )
}

/**
 * @brief 判断一个设置定义当前是否可见 / Determine whether a setting definition is currently visible.
 * @param definition 设置定义 / Setting definition.
 * @param settings 当前完整设置值 / Current complete setting values.
 * @return 条件为空或精确匹配时为 true / True when no condition exists or its value matches exactly.
 */
function isTemplateSettingVisible(
  definition: UiTemplateSettingDefinition,
  settings: Readonly<Record<string, UiJsonValue>>
): boolean {
  if (definition.visibleWhen === null) return true
  /** @brief 条件来源设置的当前值 / Current value of the condition-source setting. */
  const conditionValue = settings[definition.visibleWhen.key]
  return (
    conditionValue !== undefined &&
    getTemplateSettingValueKey(conditionValue) ===
      getTemplateSettingValueKey(definition.visibleWhen.equals)
  )
}

/**
 * @brief 读取设置的当前值并保留合法 null / Read a setting's current value while preserving a valid null.
 * @param definition 设置定义 / Setting definition.
 * @param settings 当前设置值 / Current setting values.
 * @return 当前值或定义默认值 / Current value or the definition default.
 */
function getCurrentTemplateSettingValue(
  definition: UiTemplateSettingDefinition,
  settings: Readonly<Record<string, UiJsonValue>>
): UiJsonValue {
  /** @brief 可能缺失但可以为 null 的候选值 / Candidate value that may be absent but may validly be null. */
  const candidate = settings[definition.key]
  return candidate === undefined ? definition.defaultValue : candidate
}

/** @brief 一组具有相同语义 group key 的模板设置 / Template settings sharing one semantic group key. */
interface TemplateSettingGroup {
  /** @brief 可选本地化组 key / Optional localized group key. */
  readonly key: string | null
  /** @brief 保持清单顺序的设置定义 / Setting definitions preserving manifest order. */
  readonly definitions: readonly UiTemplateSettingDefinition[]
}

/**
 * @brief 按清单 group key 聚合当前可见设置 / Group currently visible settings by their manifest group key.
 * @param definitions 模板设置定义 / Template setting definitions.
 * @param settings 当前设置值 / Current setting values.
 * @return 首次出现顺序稳定的设置组 / Setting groups in stable first-occurrence order.
 */
function groupVisibleTemplateSettings(
  definitions: readonly UiTemplateSettingDefinition[],
  settings: Readonly<Record<string, UiJsonValue>>
): readonly TemplateSettingGroup[] {
  /** @brief 逐步构建且保持顺序的设置组 / Incrementally built ordered setting groups. */
  const groups: { key: string | null; definitions: UiTemplateSettingDefinition[] }[] = []
  for (const definition of definitions) {
    if (!isTemplateSettingVisible(definition, settings)) continue
    /** @brief 已存在的同名组 / Existing group with the same key. */
    const group = groups.find((candidate) => candidate.key === definition.groupKey)
    if (group === undefined) {
      groups.push({ definitions: [definition], key: definition.groupKey })
    } else {
      group.definitions.push(definition)
    }
  }
  return groups
}

/**
 * @brief 判断用户生成的值是否满足清单声明 / Check whether a user-generated value satisfies the manifest declaration.
 * @param definition 当前设置定义 / Current setting definition.
 * @param value 控件准备提交的值 / Value about to be committed by a control.
 * @return 值满足声明类型、离散选项与上下界时为 true / True when value type, choices, and bounds accept the value.
 */
function isTemplateSettingValueCompatible(
  definition: UiTemplateSettingDefinition,
  value: UiJsonValue
): boolean {
  /** @brief 值是否满足声明类型 / Whether the value satisfies the declared value type. */
  const matchesValueType =
    definition.valueType === 'boolean'
      ? typeof value === 'boolean'
      : definition.valueType === 'integer'
        ? typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
        : definition.valueType === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : definition.valueType === 'string'
            ? typeof value === 'string'
            : definition.valueType === 'choice'
              ? definition.choices.some(
                  (choice) =>
                    getTemplateSettingValueKey(choice.value) === getTemplateSettingValueKey(value)
                )
              : definition.valueType === 'color'
                ? isColorValue(value)
                : isMeasurementValue(value)

  if (!matchesValueType) return false

  if (
    (definition.valueType === 'choice' ||
      definition.control === 'select' ||
      definition.control === 'radio') &&
    !definition.choices.some(
      (choice) => getTemplateSettingValueKey(choice.value) === getTemplateSettingValueKey(value)
    )
  ) {
    return false
  }

  /** @brief 可应用上下界的数值 / Numeric value to which bounds apply. */
  const boundedValue =
    typeof value === 'number' ? value : isMeasurementValue(value) ? value.value : null

  return !(
    (definition.minimum !== null && boundedValue !== null && boundedValue < definition.minimum) ||
    (definition.maximum !== null && boundedValue !== null && boundedValue > definition.maximum)
  )
}

/**
 * @brief 仅为展示补齐 manifest 声明的默认值 / Fill manifest-declared defaults for presentation only.
 * @param template 目标模板 / Target template.
 * @param candidateSettings 权威值或本地草稿设置 / Authoritative or local-draft settings.
 * @return 只用于控件取值与可见性的有效设置 / Effective settings used only for control values and visibility.
 * @note 返回值不得反向写入权威 SIR，因为显式 default 与 omission 是不同事实。 / The result must never be written back to authoritative SIR because an explicit default and omission are distinct facts.
 */
function projectTemplateSettings(
  template: UiTemplateManifest,
  candidateSettings: Readonly<Record<string, UiJsonValue>>
): Readonly<Record<string, UiJsonValue>> {
  /** @brief 权威任意 JSON key 的浅复制 / Shallow copy preserving every authoritative arbitrary-JSON key. */
  const projected: Record<string, UiJsonValue> = { ...candidateSettings }
  /** @brief 已处理的 manifest key / Manifest keys already processed. */
  const declaredKeys = new Set<string>()
  for (const definition of template.settings) {
    if (declaredKeys.has(definition.key)) continue
    declaredKeys.add(definition.key)
    if (!Object.hasOwn(projected, definition.key)) {
      projected[definition.key] = definition.defaultValue
    }
  }
  return projected
}

/**
 * @brief 为 set_template 提交投影满足可见性的设置 / Project visibility-consistent settings for set_template submission.
 * @param template 目标不可变 Template / Target immutable Template.
 * @param draftSettings 保留 dormant 草稿与未声明 key 的本地设置 / Local settings preserving dormant drafts and undeclared keys.
 * @return 移除了当前不可见已声明 key，但保留未声明权威 key 的提交 map / Submission map without currently invisible declared keys while preserving undeclared authoritative keys.
 */
function projectSubmittedTemplateSettings(
  template: UiTemplateManifest,
  draftSettings: Readonly<Record<string, UiJsonValue>>
): Readonly<Record<string, UiJsonValue>> {
  /** @brief 只用于计算 visibleWhen 的有效值 / Effective values used only to evaluate visibleWhen. */
  const effectiveSettings = projectTemplateSettings(template, draftSettings)
  /** @brief 每个 key 第一个 manifest 定义 / First manifest definition for each key. */
  const definitionByKey = new Map<string, UiTemplateSettingDefinition>()
  for (const definition of template.settings) {
    if (!definitionByKey.has(definition.key)) definitionByKey.set(definition.key, definition)
  }
  return Object.fromEntries(
    Object.entries(draftSettings).filter(([key]) => {
      /** @brief 当前 key 的可选 manifest 定义 / Optional manifest definition for the current key. */
      const definition = definitionByKey.get(key)
      return definition === undefined || isTemplateSettingVisible(definition, effectiveSettings)
    })
  )
}

/**
 * @brief 比较草稿与权威模型中可编辑的模板意图 / Compare editable template intent between a draft and an authoritative model.
 * @param draft 本地模板设置草稿 / Local template-settings draft.
 * @param model 服务端权威模型 / Authoritative server model.
 * @return 权威模型已经确认同一意图时为 true / True when the authoritative model confirms the same intent.
 */
function doesTemplateDraftMatchModel(
  draft: TemplateSettingsDraft,
  model: UiTemplateSettingsModel
): boolean {
  /** @brief 权威目录中的草稿目标模板 / Draft target template in the authoritative catalog. */
  const template = model.availableTemplates.find(
    (candidate) => getTemplateIdentity(candidate) === draft.templateIdentity
  )
  if (
    template === undefined ||
    getTemplateIdentity(model.selectedTemplate) !== draft.templateIdentity
  ) {
    return false
  }

  return (
    draft.pageSize === model.styleIntent.page.size &&
    draft.fontFamilyToken === model.styleIntent.typography.fontFamilyToken &&
    draft.density === model.styleIntent.density &&
    draft.dateFormatToken === model.styleIntent.dateFormatToken &&
    draft.bulletStyleToken === model.styleIntent.bulletStyleToken &&
    getTemplateSettingValueKey(draft.settings) ===
      getTemplateSettingValueKey(model.styleIntent.templateSettings)
  )
}

/**
 * @brief 以可保留负号与小数中间态的原始字符串编辑 Measurement / Edit a Measurement through a raw string preserving negative-sign and decimal intermediate states.
 * @param props 清单定义、当前值与提交回调 / Manifest definition, current value, and commit callback.
 * @return 数值与单位组合控件 / Combined magnitude and unit controls.
 */
function MeasurementSettingControl({
  definition,
  disabled,
  label,
  onChange,
  value
}: {
  readonly definition: UiTemplateSettingDefinition
  readonly disabled: boolean
  readonly label: string
  readonly onChange: (value: UiJsonValue) => void
  readonly value: UiMeasurement
}): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 允许 `-`、空串与小数尾点的本地输入 / Local input allowing `-`, an empty string, and a trailing decimal point. */
  const [rawValue, setRawValue] = useState(String(value.value))

  /** @brief 在失焦时原子提交有限且受 manifest 约束的数值 / Atomically commit a finite manifest-compatible magnitude on blur. */
  const commitRawValue = (): void => {
    if (rawValue.trim().length === 0) {
      setRawValue(String(value.value))
      return
    }
    /** @brief 从原始输入解析的候选数值 / Candidate magnitude parsed from raw input. */
    const magnitude = Number(rawValue)
    /** @brief 保留原单位的候选 Measurement / Candidate Measurement preserving the original unit. */
    const candidate = { unit: value.unit, value: magnitude }
    if (Number.isFinite(magnitude) && isTemplateSettingValueCompatible(definition, candidate)) {
      onChange(candidate)
      return
    }
    setRawValue(String(value.value))
  }

  return (
    <div className="aw-inline-actions">
      <input
        aria-label={`${label} · ${t('template.measurementValue', { defaultValue: '数值' })}`}
        className="aw-text-input"
        disabled={disabled}
        inputMode="decimal"
        onBlur={commitRawValue}
        onChange={(event): void => setRawValue(event.currentTarget.value)}
        style={{ width: 100 }}
        type="text"
        value={rawValue}
      />
      <select
        aria-label={`${label} · ${t('template.measurementUnit', { defaultValue: '单位' })}`}
        className="aw-select"
        disabled={disabled}
        onChange={(event): void =>
          onChange({ ...value, unit: event.currentTarget.value as UiMeasurementUnit })
        }
        style={{ width: 90 }}
        value={value.unit}
      >
        {measurementUnitValues.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * @brief 根据设置类型渲染受约束的输入 / Render a constrained input based on a setting definition.
 * @param props 设置定义与当前值 / Setting definition and current value.
 * @return 只表达语义意图的输入控件 / Input control that expresses semantic intent only.
 */
function TemplateSettingControl({
  definition,
  disabled,
  value,
  onChange
}: {
  readonly definition: UiTemplateSettingDefinition
  readonly disabled: boolean
  readonly value: UiJsonValue
  readonly onChange: (value: UiJsonValue) => void
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 控件的本地化可访问名称 / Localized accessible name for the control. */
  const label = t(definition.labelKey, { defaultValue: definition.labelKey })
  /** @brief 当前值无法由声明控件安全编辑时的只读投影 / Read-only projection used when the declared control cannot safely edit the current value. */
  const readOnlyValue = (
    <output aria-label={label} className="aw-muted-copy">
      {getTemplateSettingValueText(value)}
    </output>
  )

  if (
    definition.control === 'switch' &&
    definition.valueType === 'boolean' &&
    typeof value === 'boolean'
  ) {
    return (
      <button
        aria-checked={value === true}
        aria-label={label}
        className="aw-switch"
        disabled={disabled}
        onClick={(): void => onChange(value !== true)}
        role="switch"
        type="button"
      />
    )
  }

  if (
    definition.control === 'slider' &&
    (definition.valueType === 'number' || definition.valueType === 'integer') &&
    typeof value === 'number' &&
    definition.minimum !== null &&
    definition.maximum !== null &&
    definition.minimum <= definition.maximum &&
    isTemplateSettingValueCompatible(definition, value)
  ) {
    /** @brief 当前滑块数值 / Current slider value. */
    return (
      <input
        aria-label={label}
        disabled={disabled}
        max={definition.maximum}
        min={definition.minimum}
        onChange={(event): void => {
          /** @brief 浏览器已解析的有限滑块值 / Finite slider value parsed by the browser. */
          const nextValue = event.currentTarget.valueAsNumber
          if (Number.isFinite(nextValue)) onChange(nextValue)
        }}
        step={definition.valueType === 'integer' ? 1 : 'any'}
        type="range"
        value={value}
      />
    )
  }

  if (
    (definition.control === 'number' || definition.control === 'slider') &&
    (definition.valueType === 'number' || definition.valueType === 'integer') &&
    typeof value === 'number' &&
    (definition.minimum === null ||
      definition.maximum === null ||
      definition.minimum <= definition.maximum) &&
    isTemplateSettingValueCompatible(definition, value)
  ) {
    return (
      <input
        aria-label={label}
        className="aw-text-input"
        disabled={disabled}
        max={definition.maximum ?? undefined}
        min={definition.minimum ?? undefined}
        onChange={(event): void => {
          /** @brief 浏览器已解析的有限数字 / Finite number parsed by the browser. */
          const nextValue = event.currentTarget.valueAsNumber
          if (Number.isFinite(nextValue)) onChange(nextValue)
        }}
        step={definition.valueType === 'integer' ? 1 : 'any'}
        style={{ width: 120 }}
        type="number"
        value={value}
      />
    )
  }

  if (definition.control === 'select' && definition.choices.length > 0) {
    /** @brief 当前值首次匹配的选项位置 / First choice index matching the current value. */
    const selectedIndex = definition.choices.findIndex(
      (choice) => getTemplateSettingValueKey(choice.value) === getTemplateSettingValueKey(value)
    )
    return (
      <select
        aria-label={label}
        className="aw-select"
        disabled={disabled}
        onChange={(event): void => {
          /** @brief 被选择的完整语义选项 / Selected full semantic choice. */
          const selectedChoice = definition.choices[Number(event.target.value)]

          if (
            selectedChoice !== undefined &&
            isTemplateSettingValueCompatible(definition, selectedChoice.value)
          ) {
            onChange(selectedChoice.value)
          }
        }}
        value={String(selectedIndex)}
      >
        {selectedIndex < 0 ? (
          <option value="-1">{getTemplateSettingValueText(value)}</option>
        ) : null}
        {definition.choices.map((choice, index) => {
          /** @brief 当前值第一次出现的位置 / First occurrence of the current choice value. */
          const firstEquivalentIndex = definition.choices.findIndex(
            (candidate) =>
              getTemplateSettingValueKey(candidate.value) ===
              getTemplateSettingValueKey(choice.value)
          )
          return (
            <option
              disabled={
                firstEquivalentIndex !== index ||
                !isTemplateSettingValueCompatible(definition, choice.value)
              }
              key={`${String(index)}:${getTemplateSettingValueKey(choice.value)}`}
              title={
                choice.descriptionKey === null
                  ? undefined
                  : t(choice.descriptionKey, { defaultValue: choice.descriptionKey })
              }
              value={String(index)}
            >
              {t(choice.labelKey, { defaultValue: choice.labelKey })}
            </option>
          )
        })}
      </select>
    )
  }

  if (definition.control === 'radio' && definition.choices.length > 0) {
    /** @brief 当前值首次匹配的选项位置 / First choice index matching the current value. */
    const selectedIndex = definition.choices.findIndex(
      (choice) => getTemplateSettingValueKey(choice.value) === getTemplateSettingValueKey(value)
    )
    return (
      <div aria-label={label} className="aw-chip-row" role="radiogroup">
        {selectedIndex < 0 ? (
          <span className="aw-muted-copy">{getTemplateSettingValueText(value)}</span>
        ) : null}
        {definition.choices.map((choice, index) => {
          /** @brief 当前选项的稳定值 key / Stable value key for the current choice. */
          const choiceKey = getTemplateSettingValueKey(choice.value)
          /** @brief 当前值第一次出现的位置 / First occurrence of the current choice value. */
          const firstEquivalentIndex = definition.choices.findIndex(
            (candidate) => getTemplateSettingValueKey(candidate.value) === choiceKey
          )
          /** @brief 可选选项说明 / Optional choice description. */
          const choiceDescription =
            choice.descriptionKey === null
              ? null
              : t(choice.descriptionKey, { defaultValue: choice.descriptionKey })
          return (
            <label className="aw-chip" key={`${String(index)}:${choiceKey}`}>
              <input
                checked={selectedIndex === index}
                disabled={
                  disabled ||
                  firstEquivalentIndex !== index ||
                  !isTemplateSettingValueCompatible(definition, choice.value)
                }
                name={`template-setting-${definition.key}`}
                onChange={(event): void => {
                  if (event.currentTarget.checked) onChange(choice.value)
                }}
                type="radio"
                value={String(index)}
              />
              {t(choice.labelKey, { defaultValue: choice.labelKey })}
              {choiceDescription === null ? null : (
                <span className="aw-sr-only"> — {choiceDescription}</span>
              )}
            </label>
          )
        })}
      </div>
    )
  }

  if (definition.control === 'color' && definition.valueType === 'color' && isColorValue(value)) {
    /** @brief 当前结构化颜色值 / Current structured color value. */
    const colorValue: UiColorValue = value
    /** @brief 原生颜色选择器能无损表达该值 / Whether the native color picker can express this value losslessly. */
    const useNativeColorPicker =
      colorValue.space === 'srgb_hex' && /^#[0-9A-Fa-f]{6}$/u.test(colorValue.value)
    return (
      <input
        aria-label={label}
        className="aw-text-input"
        disabled={disabled}
        onChange={(event): void => onChange({ ...colorValue, value: event.currentTarget.value })}
        style={{ width: useNativeColorPicker ? 54 : 180 }}
        type={useNativeColorPicker ? 'color' : 'text'}
        value={colorValue.value}
      />
    )
  }

  if (
    definition.control === 'measurement' &&
    definition.valueType === 'measurement' &&
    isMeasurementValue(value) &&
    isTemplateSettingValueCompatible(definition, value)
  ) {
    /** @brief 当前结构化测量值 / Current structured measurement value. */
    const measurementValue: UiMeasurement = value
    return (
      <MeasurementSettingControl
        definition={definition}
        disabled={disabled}
        key={`${definition.key}:${String(measurementValue.value)}:${measurementValue.unit}`}
        label={label}
        onChange={onChange}
        value={measurementValue}
      />
    )
  }

  if (
    definition.control === 'text' &&
    definition.valueType === 'string' &&
    typeof value === 'string'
  ) {
    return (
      <input
        aria-label={label}
        className="aw-text-input"
        disabled={disabled}
        onChange={(event): void => onChange(event.currentTarget.value)}
        type="text"
        value={value}
      />
    )
  }

  return readOnlyValue
}

/**
 * @brief 已就绪的模板设置页面 / Ready template-settings page.
 * @param props 模板设置数据 / Template-settings data.
 * @return 模板选择与语义意图设置页面 / Template selection and semantic-intent settings page.
 */
function TemplateSettingsContent({
  catalog,
  gateway,
  model
}: {
  readonly catalog: ResumeTemplateCatalogPort
  readonly gateway: ResumeGateway
  readonly model: UiTemplateSettingsModel
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 最近一次服务端确认的模板设置模型 / Latest server-confirmed template-settings model. */
  const [authoritativeModel, setAuthoritativeModel] = useState(model)
  /** @brief 权威值上叠加了用户显式修改的设置，不物化默认值 / Settings overlaying explicit user changes on authority without materializing defaults. */
  const [settings, setSettings] = useState<Readonly<Record<string, UiJsonValue>>>(() =>
    structuredClone(model.styleIntent.templateSettings)
  )
  /** @brief 页面规格的本地语义意图 / Local semantic intent for page size. */
  const [pageSize, setPageSize] = useState<UiResumePageSize>(model.styleIntent.page.size)
  /** @brief 字体令牌的本地语义意图 / Local semantic intent for font token. */
  const [fontFamilyToken, setFontFamilyToken] = useState(
    model.styleIntent.typography.fontFamilyToken
  )
  /** @brief 内容密度的本地语义意图 / Local semantic intent for content density. */
  const [density, setDensity] = useState(model.styleIntent.density)
  /** @brief 日期格式令牌的本地语义意图 / Local semantic intent for the date-format token. */
  const [dateFormatToken, setDateFormatToken] = useState(model.styleIntent.dateFormatToken)
  /** @brief 项目符号令牌的本地语义意图 / Local semantic intent for the bullet-style token. */
  const [bulletStyleToken, setBulletStyleToken] = useState(model.styleIntent.bulletStyleToken)
  /** @brief 保存状态 / Persistence state. */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  /** @brief 在 React 提交状态前也能原子阻止重复保存 / Atomically prevents duplicate saves before React commits state. */
  const savingRef = useRef(false)
  /** @brief 最近一次安全呈现的保存错误 / Latest save error to present safely. */
  const [saveError, setSaveError] = useState<unknown>(null)
  /** @brief 是否正在重新读取服务端权威设置 / Whether authoritative server settings are being reloaded. */
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief 当前权威重读独占的取消控制器 / Abort controller exclusively owned by the current authority reload. */
  const authorityReloadControllerRef = useRef<AbortController | null>(null)
  /** @brief 权威设置重新读取错误 / Authoritative-settings reload error. */
  const [authorityReloadError, setAuthorityReloadError] = useState<unknown>(null)
  /** @brief 已确认 200 batch conflict 携带的恢复事实 / Recovery facts carried by a confirmed 200 batch conflict. */
  const confirmedBatchConflict = saveError === null ? null : getResumeBatchConflict(saveError)
  /** @brief 是否必须先重新读取权威版本 / Whether the authoritative version must be reloaded first. */
  const authorityReloadRequired =
    saveError !== null && confirmedBatchConflict === null && requiresAuthorityReload(saveError)
  /** @brief 写响应待定或权威恢复前是否冻结编辑 / Whether editing is frozen while a write is pending or authority must be recovered. */
  const isWriteLocked = saveStatus === 'saving' || authorityReloadRequired

  useEffect(
    (): (() => void) => (): void => {
      authorityReloadControllerRef.current?.abort(
        new DOMException('Template settings unmounted.', 'AbortError')
      )
      authorityReloadControllerRef.current = null
    },
    []
  )
  /** @brief 当前展示的模板 / Currently displayed template. */
  const selectedTemplate = authoritativeModel.selectedTemplate
  /** @brief 只为控件展示物化默认值的有效设置 / Effective settings materializing defaults only for controls. */
  const effectiveSettings = projectTemplateSettings(selectedTemplate, settings)
  /** @brief 当前可见且按 manifest 语义分组的设置 / Currently visible settings grouped by manifest semantics. */
  const settingGroups = groupVisibleTemplateSettings(selectedTemplate.settings, effectiveSettings)
  /** @brief 当前页面可编辑字段组成的草稿 / Draft composed from the page's editable fields. */
  const draft = useMemo<TemplateSettingsDraft>(
    () => ({
      bulletStyleToken,
      dateFormatToken,
      density,
      fontFamilyToken,
      pageSize,
      settings,
      templateIdentity: getTemplateIdentity(selectedTemplate)
    }),
    [
      bulletStyleToken,
      dateFormatToken,
      density,
      fontFamilyToken,
      pageSize,
      selectedTemplate,
      settings
    ]
  )
  /** @brief 草稿是否不同于最近权威模型 / Whether the draft differs from the latest authoritative model. */
  const isDirty = !doesTemplateDraftMatchModel(draft, authoritativeModel)
  /** @brief 准备提交的完整语义样式意图 / Complete semantic-style intent prepared for submission. */
  const draftStyleIntent = useMemo(
    () => ({
      ...authoritativeModel.styleIntent,
      bulletStyleToken,
      dateFormatToken,
      density,
      page: { ...authoritativeModel.styleIntent.page, size: pageSize },
      templateSettings: projectSubmittedTemplateSettings(selectedTemplate, settings),
      typography: { ...authoritativeModel.styleIntent.typography, fontFamilyToken }
    }),
    [
      authoritativeModel.styleIntent,
      bulletStyleToken,
      dateFormatToken,
      density,
      fontFamilyToken,
      pageSize,
      selectedTemplate,
      settings
    ]
  )

  /**
   * @brief 更新单个待保存模板设置 / Update one pending template setting.
   * @param definition 模板设置定义 / Template setting definition.
   * @param value 新的受约束值 / New constrained value.
   * @return 无返回值 / No return value.
   */
  const updateSetting = (definition: UiTemplateSettingDefinition, value: UiJsonValue): void => {
    if (isWriteLocked || !isTemplateSettingValueCompatible(definition, value)) return
    setSaveStatus('idle')
    setSettings((currentSettings) => ({ ...currentSettings, [definition.key]: value }))
  }

  /**
   * @brief 通过正式 Resume operation 保存模板与样式 / Save template and style through a formal Resume operation.
   * @return 保存完成的 Promise / Promise completed after persistence.
   */
  const saveSettings = async (): Promise<void> => {
    if (savingRef.current || isWriteLocked || !isDirty) return
    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)
    try {
      /** @brief 后端返回且带新强 ETag 的 Resume 权威 / Resume authority returned by the backend with a new strong ETag. */
      const savedEditor = await gateway.updateTemplateSettings({
        baseRevision: authoritativeModel.resumeRevision,
        concurrencyToken: authoritativeModel.concurrencyToken,
        resumeId: authoritativeModel.resumeId,
        styleIntent: draftStyleIntent,
        templateId: selectedTemplate.id,
        templateVersion: selectedTemplate.version,
        workspaceId: authoritativeModel.workspaceId
      })
      /** @brief 用已加载公开目录组合的最新设置模型 / Latest settings model composed with the already loaded public catalog. */
      const saved = projectResumeTemplateSettings(
        savedEditor,
        authoritativeModel.availableTemplates
      )
      setAuthoritativeModel(saved)
      setSettings(structuredClone(saved.styleIntent.templateSettings))
      setPageSize(saved.styleIntent.page.size)
      setFontFamilyToken(saved.styleIntent.typography.fontFamilyToken)
      setDateFormatToken(saved.styleIntent.dateFormatToken)
      setBulletStyleToken(saved.styleIntent.bulletStyleToken)
      setDensity(saved.styleIntent.density)
      setSaveStatus('saved')
    } catch (error: unknown) {
      /** @brief 合法 200 conflict 中可直接采用的 Resume 权威 / Resume authority directly adoptable from a valid 200 conflict. */
      const batchConflict = getResumeBatchConflict(error)
      if (batchConflict !== null) {
        /** @brief 用已经加载的目录投影的新权威设置模型 / New authoritative settings model projected with the already-loaded catalog. */
        const recovered = projectResumeTemplateSettings(
          batchConflict.authoritativeEditor,
          authoritativeModel.availableTemplates
        )
        setAuthoritativeModel(recovered)
        setAuthorityReloadError(null)
        if (getTemplateIdentity(recovered.selectedTemplate) !== draft.templateIdentity) {
          setSettings(structuredClone(recovered.styleIntent.templateSettings))
          setPageSize(recovered.styleIntent.page.size)
          setFontFamilyToken(recovered.styleIntent.typography.fontFamilyToken)
          setDateFormatToken(recovered.styleIntent.dateFormatToken)
          setBulletStyleToken(recovered.styleIntent.bulletStyleToken)
          setDensity(recovered.styleIntent.density)
        }
      }
      setSaveError(error)
      setSaveStatus('error')
    } finally {
      savingRef.current = false
    }
  }

  /**
   * @brief 重新读取权威设置且尽可能保留尚未确认的本地草稿 / Reload authoritative settings while preserving the unconfirmed local draft whenever possible.
   * @return 读取完成的 Promise / Promise completed after the read.
   * @note 若服务端已移除本地选择的模板，草稿无法再表达，页面会回到新的权威值。 / If the service removed the locally selected template, the draft is no longer expressible and the page returns to the new authoritative values.
   */
  const reloadAuthoritativeSettings = useCallback(async (): Promise<void> => {
    authorityReloadControllerRef.current?.abort(
      new DOMException('A newer Template-settings reload superseded this request.', 'AbortError')
    )
    /** @brief 本次权威重读独占的取消控制器 / Abort controller exclusively owned by this authority reload. */
    const controller = new AbortController()
    authorityReloadControllerRef.current = controller
    setReloadingAuthority(true)
    setAuthorityReloadError(null)
    try {
      /** @brief 服务端当前权威模板设置 / Current authoritative template settings from the service. */
      const authoritative = await loadResumeTemplateSettings(
        gateway,
        catalog,
        model.workspaceId,
        model.resumeId,
        controller.signal
      )
      controller.signal.throwIfAborted()
      /** @brief 新目录中仍可表达本地草稿的模板 / Template in the new catalog that can still express the local draft. */
      const draftTemplate = authoritative.availableTemplates.find(
        (template) => getTemplateIdentity(template) === draft.templateIdentity
      )
      /** @brief 服务端是否仍固定在本地草稿对应的同一不可变模板 / Whether authority remains pinned to the exact immutable template represented by the draft. */
      const authorityStillMatchesDraft =
        getTemplateIdentity(authoritative.selectedTemplate) === draft.templateIdentity
      setAuthoritativeModel(authoritative)
      if (draftTemplate === undefined || !authorityStillMatchesDraft) {
        setSettings(structuredClone(authoritative.styleIntent.templateSettings))
        setPageSize(authoritative.styleIntent.page.size)
        setFontFamilyToken(authoritative.styleIntent.typography.fontFamilyToken)
        setDateFormatToken(authoritative.styleIntent.dateFormatToken)
        setBulletStyleToken(authoritative.styleIntent.bulletStyleToken)
        setDensity(authoritative.styleIntent.density)
        setSaveStatus('idle')
      } else if (doesTemplateDraftMatchModel(draft, authoritative)) {
        setSettings(structuredClone(authoritative.styleIntent.templateSettings))
        setPageSize(authoritative.styleIntent.page.size)
        setFontFamilyToken(authoritative.styleIntent.typography.fontFamilyToken)
        setDateFormatToken(authoritative.styleIntent.dateFormatToken)
        setBulletStyleToken(authoritative.styleIntent.bulletStyleToken)
        setDensity(authoritative.styleIntent.density)
        setSaveStatus('saved')
      } else {
        setSettings(structuredClone(draft.settings))
        setSaveStatus('idle')
      }
      setSaveError(null)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      setAuthorityReloadError(error)
    } finally {
      if (authorityReloadControllerRef.current === controller) {
        authorityReloadControllerRef.current = null
        setReloadingAuthority(false)
      }
    }
  }, [catalog, draft, gateway, model.resumeId, model.workspaceId])

  /**
   * @brief 根据失败类别选择安全恢复动作 / Choose a safe recovery action for the failure category.
   * @return 无返回值 / No return value.
   * @note 409/412 与未知写结果必须重新读取；已确认 200 batch conflict 已直接吸收权威，只能由用户显式产生新的保存意图。 / 409/412 and unknown outcomes require a reload; confirmed 200 batch conflicts already provide authority and can only be retried through a new explicit user intent.
   */
  const recoverFromSaveFailure = (): void => {
    if (authorityReloadRequired) {
      void reloadAuthoritativeSettings()
      return
    }
    void saveSettings()
  }

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('template.semanticIntent', { defaultValue: '后端无关的样式意图' })}
          </p>
          <h1 className="aw-page-title">{t('template.title', { defaultValue: '模板与版式' })}</h1>
          <p className="aw-page-description">
            {t('template.migrationHint', {
              defaultValue: '此页只表达模板能力和语义设置，绝不提交 CSS、HTML 或 LaTeX。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to={`/resumes/${model.resumeId}/edit`}>
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回编辑器' })}
        </Link>
      </div>

      <div className="aw-template-layout">
        <section aria-labelledby="template-choice-title">
          <div
            className="aw-inline-actions"
            style={{ justifyContent: 'space-between', marginBottom: 12 }}
          >
            <div>
              <h2 className="aw-card-title" id="template-choice-title">
                {t('template.otherTemplates', { defaultValue: '模板目录' })}
              </h2>
              <p className="aw-card-description">
                {t('template.choiceDescription', {
                  defaultValue: '其他模板目前仅供查看；你仍可调整当前模板的版式设置。'
                })}
              </p>
            </div>
            <span className="aw-status aw-status--active">
              {t('template.backendCatalog', { defaultValue: '已同步目录' })}
            </span>
          </div>
          <div className="aw-template-list">
            {authoritativeModel.availableTemplates.length === 0 ? (
              <div className="aw-template-empty">
                <LayoutTemplate aria-hidden="true" size={20} />
                <p>{t('template.empty', { defaultValue: '当前没有其他可用模板。' })}</p>
              </div>
            ) : null}
            {authoritativeModel.availableTemplates.map((template) => {
              /** @brief 当前模板是否被选择 / Whether this template is selected. */
              const isSelected =
                getTemplateIdentity(template) === getTemplateIdentity(selectedTemplate)
              return (
                <article
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={`${template.name} v${template.version}`}
                  className={`aw-template-card ${isSelected ? 'aw-template-card--selected' : ''}`}
                  key={getTemplateIdentity(template)}
                >
                  <span aria-hidden="true" className={getTemplateThumbnailClass(template)} />
                  <span>
                    <strong>{template.name}</strong>
                    <span
                      className="aw-card-description"
                      style={{ display: 'block', marginTop: 4 }}
                    >
                      {template.description ??
                        t('template.noDescription', { defaultValue: '暂无说明' })}
                    </span>
                    <span className="aw-template-fit">
                      {template.capabilities.supportsSidebar
                        ? t('template.fitStructured', {
                            defaultValue: '适合技能与经历并重的结构化简历'
                          })
                        : t('template.fitNarrative', {
                            defaultValue: '适合项目叙事与长内容阅读'
                          })}
                    </span>
                  </span>
                  <span className="aw-chip-row">
                    <span className="aw-chip">v{template.version}</span>
                    <span className="aw-chip">
                      {t('template.columns', {
                        count: template.capabilities.maxColumns,
                        defaultValue: `${template.capabilities.maxColumns} columns`
                      })}
                    </span>
                    <span className="aw-chip">
                      {t('template.layoutIllustration', {
                        defaultValue: '版式示意（非最终模板预览）'
                      })}
                    </span>
                  </span>
                  {isSelected ? (
                    <span className="aw-status aw-status--ready">
                      <Check aria-hidden="true" size={11} />
                      {t('template.selected', { defaultValue: '当前选择' })}
                    </span>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>

        <aside className="aw-card aw-settings-card">
          <span
            aria-hidden="true"
            className={`${getTemplateThumbnailClass(selectedTemplate)} aw-template-preview`}
          />
          <div className="aw-inline-actions">
            <LayoutTemplate aria-hidden="true" className="aw-accent-icon" size={17} />
            <div>
              <h2 className="aw-card-title">
                {t('template.currentTemplate', { defaultValue: '当前模板' })}
              </h2>
              <p className="aw-card-description">{selectedTemplate.name}</p>
              <span className="aw-setting-help">
                {t('template.layoutIllustration', {
                  defaultValue: '版式示意（非最终模板预览）'
                })}
              </span>
            </div>
          </div>
          <div className="aw-list-row" style={{ padding: '10px 0' }}>
            <span className="aw-muted">
              {t('template.capabilities', { defaultValue: '公开能力' })}
            </span>
            <div className="aw-chip-row">
              <span className="aw-chip">
                <Columns2 aria-hidden="true" size={12} style={{ marginRight: 4 }} />
                {t('template.columns', {
                  count: selectedTemplate.capabilities.maxColumns,
                  defaultValue: `${selectedTemplate.capabilities.maxColumns} columns`
                })}
              </span>
              {selectedTemplate.capabilities.supportsSourceMap ? (
                <span className="aw-chip">
                  {t('template.sourceMap', { defaultValue: 'Source map' })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="aw-list-row" style={{ padding: '10px 0' }}>
            <span className="aw-muted">{t('template.zones', { defaultValue: '语义区域' })}</span>
            <div className="aw-chip-row">
              {selectedTemplate.zones.map((zone) => (
                <span className="aw-chip" key={zone.id}>
                  {t(zone.labelKey, { defaultValue: zone.id })}
                </span>
              ))}
            </div>
          </div>
          <p className="aw-setting-help" style={{ margin: 0 }}>
            <Info
              aria-hidden="true"
              size={13}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('template.intentNotice', {
              defaultValue: '模板版本固定；迁移不会静默改变现有简历。'
            })}
          </p>
        </aside>
      </div>

      <section className="aw-card aw-settings-card" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions">
          <SlidersHorizontal aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.semanticIntent', { defaultValue: '语义样式意图' })}
            </h2>
            <p className="aw-card-description">
              {t('template.settingsDescription', {
                defaultValue: '控件由 TemplateManifest.settings 驱动，值受模板约束。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.pageSize', { defaultValue: '页面规格' })}
            </p>
            <p className="aw-setting-help">
              {pageSize} · {authoritativeModel.styleIntent.page.orientation}
            </p>
          </div>
          <select
            aria-label={t('template.pageSize', { defaultValue: '页面规格' })}
            className="aw-select"
            disabled={isWriteLocked}
            onChange={(event): void => {
              if (isWriteLocked) return
              setSaveStatus('idle')
              setPageSize(event.target.value as UiResumePageSize)
            }}
            style={{ width: 130 }}
            value={pageSize}
          >
            {selectedTemplate.supportedPageSizes.map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </div>
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.fontToken', { defaultValue: '字体令牌' })}
            </p>
            <p className="aw-setting-help">
              {t('template.fontTokenHelp', { defaultValue: '令牌由模板解释，不暴露字体路径。' })}
            </p>
          </div>
          <select
            aria-label={t('template.fontToken', { defaultValue: '字体令牌' })}
            className="aw-select"
            disabled={isWriteLocked}
            onChange={(event): void => {
              if (isWriteLocked) return
              setSaveStatus('idle')
              setFontFamilyToken(event.target.value)
            }}
            style={{ width: 150 }}
            value={fontFamilyToken}
          >
            {selectedTemplate.fontFamilyTokens.map((token) => (
              <option key={token}>{token}</option>
            ))}
          </select>
        </div>
        {settingGroups.map((group, groupIndex) => (
          <fieldset
            className="aw-template-setting-group"
            key={group.key ?? `ungrouped-${groupIndex}`}
          >
            <legend className="aw-sr-only">
              {group.key === null
                ? t('template.ungroupedSettings', { defaultValue: '模板设置' })
                : t(group.key, { defaultValue: group.key })}
            </legend>
            {group.definitions.map((definition, definitionIndex) => {
              /** @brief 当前设置值 / Current setting value. */
              const currentValue = getCurrentTemplateSettingValue(definition, effectiveSettings)
              return (
                <div
                  className="aw-setting-row"
                  key={`${definition.key}:${String(definitionIndex)}`}
                >
                  <div>
                    <p className="aw-setting-label">
                      {t(definition.labelKey, { defaultValue: definition.labelKey })}
                    </p>
                    {definition.descriptionKey !== null ? (
                      <p className="aw-setting-help">
                        {t(definition.descriptionKey, { defaultValue: definition.descriptionKey })}
                      </p>
                    ) : null}
                  </div>
                  <TemplateSettingControl
                    definition={definition}
                    disabled={isWriteLocked}
                    onChange={(value): void => updateSetting(definition, value)}
                    value={currentValue}
                  />
                </div>
              )
            })}
          </fieldset>
        ))}
        <div className="aw-setting-row">
          <div>
            <p className="aw-setting-label">
              {t('template.density', { defaultValue: '内容密度' })}
            </p>
            <p className="aw-setting-help">
              {t('template.densityHelp', { defaultValue: '0 到 1 的语义紧凑度。' })}
            </p>
          </div>
          <input
            aria-label={t('template.density', { defaultValue: '内容密度' })}
            disabled={isWriteLocked}
            max="1"
            min="0"
            step="0.05"
            type="range"
            onChange={(event): void => {
              if (isWriteLocked) return
              setSaveStatus('idle')
              setDensity(Number(event.target.value))
            }}
            value={density}
          />
        </div>
      </section>

      <section className="aw-card aw-card-pad" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
          <Palette aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.intentPayload', { defaultValue: '将要表达的意图' })}
            </h2>
            <p className="aw-card-description">
              {t('template.intentPayloadDescription', {
                defaultValue: '保存时仅提交与 ResumeStyleIntent 对齐的语义字段。'
              })}
            </p>
          </div>
          <button
            className="aw-primary-button"
            disabled={isWriteLocked || !isDirty}
            onClick={(): void => void saveSettings()}
            type="button"
          >
            {saveStatus === 'saving'
              ? t('template.saving', { defaultValue: '正在保存…' })
              : t('template.save', { defaultValue: '保存设置' })}
          </button>
        </div>
        <pre
          aria-label={t('template.intentPayloadAria', {
            defaultValue: 'ResumeStyleIntent 语义预览'
          })}
          className="aw-intent-preview"
        >
          {JSON.stringify(
            {
              style_contract_version: draftStyleIntent.styleContractVersion,
              template_id: selectedTemplate.id,
              template_version: selectedTemplate.version,
              page_size: draftStyleIntent.page.size,
              font_family_token: draftStyleIntent.typography.fontFamilyToken,
              density: draftStyleIntent.density,
              template_settings: draftStyleIntent.templateSettings
            },
            null,
            2
          )}
        </pre>
        {saveStatus === 'saved' ? (
          <p aria-live="polite" className="aw-setting-help" role="status">
            {t('template.saved', { defaultValue: '模板与样式设置已保存。' })}
          </p>
        ) : null}
        {saveStatus === 'error' && confirmedBatchConflict !== null ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('template.batchConflictNotApplied', {
                defaultValue: '服务端未应用这次模板设置。'
              })}
            </strong>{' '}
            <span>
              {t('template.batchConflictReview', {
                defaultValue: '已加载最新版本并保留仍可表达的草稿；请检查后重新确认保存。'
              })}
            </span>{' '}
            <button
              className="aw-quiet-button"
              onClick={(): void => void saveSettings()}
              type="button"
            >
              {t('template.reviewAndSaveAgain', { defaultValue: '检查后重新保存' })}
            </button>
          </div>
        ) : saveStatus === 'error' ? (
          <ResourceErrorState
            {...(authorityReloadRequired
              ? {
                  recoveryAction: {
                    label: t('resume.workspace.reloadAuthority', {
                      defaultValue: isReloadingAuthority ? '正在重新加载…' : '重新加载服务器版本'
                    }),
                    onInvoke: (): void => {
                      void reloadAuthoritativeSettings()
                    }
                  }
                }
              : {})}
            error={saveError}
            onRetry={recoverFromSaveFailure}
            title={t('template.saveFailed', { defaultValue: '无法保存模板设置' })}
          />
        ) : null}
        {saveStatus === 'error' && authorityReloadError !== null ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('resume.workspace.reloadAuthorityError', {
                defaultValue: '无法重新加载服务器版本。'
              })}
            </strong>{' '}
            <ResourceFailureMessage error={authorityReloadError} />
          </div>
        ) : null}
      </section>
    </div>
  )
}

/**
 * @brief 模板设置路由页 / Template-settings route page.
 * @return 含 loading、error 与模板设置的路由页 / Route page with loading, error, and template settings.
 */
export function TemplateSettingsPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由参数 / Route parameters. */
  const { resumeId } = useParams()
  /** @brief 简历 gateway / Resume gateway. */
  const resume = useResumeGateway()
  /** @brief 全局公开且不可变的 Template 目录 / Global public immutable Template catalog. */
  const templateCatalog = useResumeTemplateCatalog()
  /** @brief 当前显式 Workspace 选择 / Current explicit Workspace selection. */
  const { getCurrentWorkspace } = useWorkspaceSession()
  /** @brief 路由 ID 的不透明 UI 表达 / Opaque UI representation of route ID. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])
  /** @brief 稳定的模板设置加载器 / Stable template-settings loader. */
  const loadTemplateSettings = useCallback(
    async (signal: AbortSignal): Promise<UiTemplateSettingsModel> => {
      signal.throwIfAborted()
      if (resumeId === undefined) {
        throw new Error('A resume identifier is required to open template settings.')
      }

      const workspace = await getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) {
        throw new Error('A Workspace selection is required to open Resume template settings.')
      }
      return loadResumeTemplateSettings(
        resume,
        templateCatalog,
        workspace.id,
        requestedResumeId,
        signal
      )
    },
    [getCurrentWorkspace, requestedResumeId, resume, resumeId, templateCatalog]
  )
  /** @brief 模板设置异步资源 / Template-settings async resource. */
  const templateSettings = useAsyncResource(
    'resume.template_settings',
    loadTemplateSettings,
    requestedResumeId
  )

  if (templateSettings.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingTemplateSettings', { defaultValue: '正在加载模板设置…' })}
        />
      </div>
    )
  }

  if (templateSettings.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={templateSettings.error}
          onRetry={templateSettings.retry}
          title={t('status.errorTemplateSettings', { defaultValue: '无法加载模板设置' })}
        />
      </div>
    )
  }

  /** @brief 使本地草稿只属于精确 Resume 与固定模板身份 / Bind local drafts to the exact Resume and pinned-template identity. */
  const contentIdentity = JSON.stringify([
    templateSettings.data.resumeId,
    getTemplateIdentity(templateSettings.data.selectedTemplate)
  ])
  return (
    <TemplateSettingsContent
      catalog={templateCatalog}
      gateway={resume}
      key={contentIdentity}
      model={templateSettings.data}
    />
  )
}
