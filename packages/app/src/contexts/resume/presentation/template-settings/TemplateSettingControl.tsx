/** @file TemplateManifest 驱动的受约束表单控件 / TemplateManifest-driven constrained form controls. */

import { useTranslation } from 'react-i18next'
import { uiJsonValuesEqual } from '../../../../shared-kernel/json'
import type {
  UiColorValue,
  UiJsonValue,
  UiMeasurement,
  UiMeasurementUnit
} from '../../domain/document'
import type { UiTemplateSettingDefinition } from '../../domain/models'
import { isTemplateSettingValueValid } from '../../domain/template-policy'

/** @brief 浏览器可表达的 Measurement 单位 / Measurement units expressible by browser controls. */
const measurementUnits: readonly UiMeasurementUnit[] = [
  'pt',
  'mm',
  'cm',
  'in',
  'px',
  'em',
  'percent'
]

/** @brief Manifest setting 控件参数 / Manifest setting-control properties. */
export interface TemplateSettingControlProps {
  /** @brief Manifest 发布的 setting 定义 / Setting definition published by the manifest. */
  readonly definition: UiTemplateSettingDefinition
  /** @brief 是否禁止用户编辑 / Whether user editing is disabled. */
  readonly disabled: boolean
  /** @brief 合法显式值变更回调 / Valid explicit-value change callback. */
  readonly onChange: (value: UiJsonValue) => void
  /** @brief 当前有效值，可能来自 manifest default / Current effective value, possibly from the manifest default. */
  readonly value: UiJsonValue
}

/**
 * @brief 渲染一个由 TemplateManifest 声明的 setting 控件 / Render one setting control declared by TemplateManifest.
 * @param props 定义、有效值、锁状态与显式变更回调 / Definition, effective value, lock state, and explicit-change callback.
 * @return 不发明 setting 语义的受约束原生控件 / A constrained native control inventing no setting semantics.
 */
export function TemplateSettingControl({
  definition,
  disabled,
  onChange,
  value
}: TemplateSettingControlProps): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 本地化可访问标签 / Localized accessible label. */
  const label = t(definition.labelKey, { defaultValue: definition.labelKey })
  if (!isTemplateSettingValueValid(value, definition)) {
    return <output aria-label={label}>{t('template.invalidSettingValue')}</output>
  }
  if (definition.control === 'switch' && typeof value === 'boolean') {
    return (
      <button
        aria-checked={value}
        aria-label={label}
        className="aw-switch"
        disabled={disabled}
        onClick={(): void => onChange(!value)}
        role="switch"
        type="button"
      />
    )
  }
  if (
    (definition.control === 'select' || definition.control === 'radio') &&
    definition.choices.length > 0
  ) {
    /** @brief 当前值对应的 choice index / Choice index corresponding to the current value. */
    const selectedIndex = definition.choices.findIndex((choice) =>
      uiJsonValuesEqual(choice.value, value)
    )
    if (definition.control === 'select') {
      return (
        <select
          aria-label={label}
          className="aw-select"
          disabled={disabled}
          onChange={(event): void => {
            /** @brief 用户选择的完整 choice / Complete choice selected by the user. */
            const choice = definition.choices[Number(event.currentTarget.value)]
            if (choice !== undefined) onChange(choice.value)
          }}
          value={String(selectedIndex)}
        >
          {definition.choices.map((choice, index) => (
            <option key={`${definition.key}:${String(index)}`} value={String(index)}>
              {t(choice.labelKey, { defaultValue: choice.labelKey })}
            </option>
          ))}
        </select>
      )
    }
    return (
      <fieldset className="aw-native-radio-group" disabled={disabled}>
        <legend className="aw-sr-only">{label}</legend>
        {definition.choices.map((choice, index) => (
          <label className="aw-chip" key={`${definition.key}:${String(index)}`}>
            <input
              checked={selectedIndex === index}
              name={`template-setting-${definition.key}`}
              onChange={(): void => onChange(choice.value)}
              type="radio"
            />
            {t(choice.labelKey, { defaultValue: choice.labelKey })}
          </label>
        ))}
      </fieldset>
    )
  }
  if (
    (definition.control === 'number' || definition.control === 'slider') &&
    typeof value === 'number'
  ) {
    return (
      <input
        aria-label={label}
        className={definition.control === 'number' ? 'aw-text-input' : undefined}
        disabled={disabled}
        max={definition.maximum ?? undefined}
        min={definition.minimum ?? undefined}
        onChange={(event): void => {
          /** @brief 浏览器解析的有限数值 / Finite number parsed by the browser. */
          const next = event.currentTarget.valueAsNumber
          if (Number.isFinite(next)) onChange(next)
        }}
        step={definition.valueType === 'integer' ? 1 : 'any'}
        type={definition.control === 'slider' ? 'range' : 'number'}
        value={value}
      />
    )
  }
  if (definition.control === 'color' && definition.valueType === 'color') {
    /** @brief 领域策略已验证的结构化颜色 / Structured color already validated by the domain policy. */
    const color = value as unknown as UiColorValue
    /** @brief 原生 color input 能否无损表达该颜色 / Whether a native color input can losslessly express the color. */
    const nativeColor = color.space === 'srgb_hex' && /^#[0-9A-Fa-f]{6}$/u.test(color.value)
    return (
      <input
        aria-label={label}
        className="aw-text-input"
        disabled={disabled}
        onChange={(event): void => {
          /** @brief 保留 color space 的新 JSON ColorValue / New JSON ColorValue preserving its color space. */
          const nextValue: UiJsonValue = {
            space: color.space,
            value: event.currentTarget.value
          }
          onChange(nextValue)
        }}
        type={nativeColor ? 'color' : 'text'}
        value={color.value}
      />
    )
  }
  if (definition.control === 'measurement' && definition.valueType === 'measurement') {
    /** @brief 领域策略已验证的结构化 Measurement / Structured Measurement already validated by the domain policy. */
    const measurement = value as unknown as UiMeasurement
    return (
      <span className="aw-inline-actions">
        <input
          aria-label={`${label} · ${t('template.measurementValue')}`}
          className="aw-text-input"
          disabled={disabled}
          onChange={(event): void => {
            /** @brief 浏览器解析的 Measurement 数值 / Measurement magnitude parsed by the browser. */
            const next = event.currentTarget.valueAsNumber
            if (Number.isFinite(next)) {
              /** @brief 保留单位的新 JSON Measurement / New JSON Measurement preserving the unit. */
              const nextValue: UiJsonValue = { unit: measurement.unit, value: next }
              onChange(nextValue)
            }
          }}
          type="number"
          value={measurement.value}
        />
        <select
          aria-label={`${label} · ${t('template.measurementUnit')}`}
          className="aw-select"
          disabled={disabled}
          onChange={(event): void => {
            /** @brief 保留 magnitude 的新 JSON Measurement / New JSON Measurement preserving the magnitude. */
            const nextValue: UiJsonValue = {
              unit: event.currentTarget.value as UiMeasurementUnit,
              value: measurement.value
            }
            onChange(nextValue)
          }}
          value={measurement.unit}
        >
          {measurementUnits.map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
      </span>
    )
  }
  if (definition.control === 'text' && typeof value === 'string') {
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
  return <output aria-label={label}>{t('template.invalidSettingValue')}</output>
}

/** @brief 受支持值集合约束的 selector 参数 / Supported-value-constrained selector properties. */
export interface SupportedValueSelectProps {
  /** @brief 是否禁止用户编辑 / Whether user editing is disabled. */
  readonly disabled: boolean
  /** @brief 本地化可访问标签 / Localized accessible label. */
  readonly label: string
  /** @brief 上层完整领域策略是否判定该字段无效 / Whether the complete domain policy marks this field invalid. */
  readonly invalid?: boolean
  /** @brief 显式变更回调 / Explicit-change callback. */
  readonly onChange: (value: string) => void
  /** @brief 目标 manifest 发布的支持值 / Supported values published by the target manifest. */
  readonly options: readonly string[]
  /** @brief 当前值，即使已不受目标支持也必须保留 / Current value, retained even when unsupported by the target. */
  readonly value: string
}

/**
 * @brief 渲染一个不会把不支持值静默改成首项的 token selector / Render a token selector that never silently chooses the first supported value.
 * @param props 标签、当前值、支持值、锁状态与变更回调 / Label, current value, supported values, lock state, and change callback.
 * @return 保留不支持值为显式占位项的原生 select / Native select preserving an unsupported value as an explicit placeholder.
 */
export function SupportedValueSelect({
  disabled,
  invalid = false,
  label,
  onChange,
  options,
  value
}: SupportedValueSelectProps): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 当前值是否由目标模板支持 / Whether the target Template supports the current value. */
  const supported = options.includes(value)
  return (
    <select
      aria-invalid={!supported || invalid}
      aria-label={label}
      className="aw-select"
      disabled={disabled}
      onChange={(event): void => onChange(event.currentTarget.value)}
      value={value}
    >
      {!supported ? (
        <option value={value}>
          {t('template.unsupportedCurrentValue', {
            defaultValue: '{{value}}（目标模板不支持）',
            value
          })}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  )
}
