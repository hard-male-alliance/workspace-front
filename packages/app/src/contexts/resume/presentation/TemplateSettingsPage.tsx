/** @file API v2 Resume 模板与语义样式产品页 / API v2 Resume Template and semantic-style product page. */

import {
  ArrowLeft,
  Check,
  Columns2,
  Info,
  LayoutTemplate,
  Palette,
  RotateCcw,
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
import { useUnsavedChanges } from '../../../app/UnsavedChanges'
import { classifyResourceFailure } from '../../../app/resource-errors'
import { createUiCommandId } from '../../../shared-kernel/command'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { cloneUiJsonValue, uiJsonValuesEqual } from '../../../shared-kernel/json'
import { nextDeadlineTimerDelayMilliseconds } from '../../../shared-kernel/polling'
import { LoadingState } from '../../../ui'
import {
  getResumeBatchConflict,
  getResumeCommandRetryAfterMilliseconds,
  getResumeConflictStatus,
  getResumeIdempotencyConflict,
  isResumeCommandDefinitivelyRejected,
  isResumeUnreplayableContractResponse
} from '../application/errors'
import type { ResumeGateway } from '../application/gateway'
import type { ResumeTemplateCatalogPort } from '../application/resume-creation'
import {
  createResumeTemplateCatalogProgress,
  getTemplateIdentity,
  loadNextResumeTemplateCatalogPage,
  loadPinnedResumeTemplate,
  loadResumeTemplateSettings,
  projectResumeTemplateSettings,
  type ResumeTemplateCatalogProgress
} from '../application/template-catalog'
import type {
  UiJsonValue,
  UiMeasurement,
  UiMeasurementUnit,
  UiResumeEditorModel,
  UiResumePageOrientation,
  UiResumePageSize,
  UiResumeStyleIntent
} from '../domain/document'
import type {
  UiResumeTemplateStyleCommand,
  UiTemplateManifest,
  UiTemplateSettingDefinition,
  UiTemplateSettingsModel
} from '../domain/models'
import {
  collectResumeTemplateCompatibilityIssues,
  getEffectiveTemplateSettingValue,
  isTemplateSettingValueValid,
  isTemplateSettingVisible,
  projectVisibleTemplateSettings,
  ResumeTemplateSettingPolicyError
} from '../domain/template-policy'
import {
  applyTemplateStyleDraft,
  createConfirmedTemplateStyleDraftPatch,
  discardConfirmedTemplateDraft,
  getMissingTemplateSectionDraftIds,
  hasTemplateStyleDraftPatch,
  setTemplateDraftLeaf,
  type TemplateSettingDraftChange,
  type TemplateStyleDraftPatch
} from './template-style-draft'
import { TemplateCatalogPicker } from './template-settings/TemplateCatalogPicker'
import { TemplatePreview } from './template-settings/TemplatePreview'
import {
  SupportedValueSelect,
  TemplateSettingControl
} from './template-settings/TemplateSettingControl'

/** @brief 任何模板版本尚无用户字段补丁时复用的只读空对象 / Shared read-only empty object for a Template version without user field patches. */
const EMPTY_TEMPLATE_STYLE_PATCH: TemplateStyleDraftPatch = Object.freeze({})

/** @brief API v2 Measurement 的封闭单位 / Closed API v2 Measurement units. */
const MEASUREMENT_UNITS: readonly UiMeasurementUnit[] = [
  'pt',
  'mm',
  'cm',
  'in',
  'px',
  'em',
  'percent'
]

/**
 * @brief 按 API v2 schema 校验 measurement 或允许的 null / Validate a measurement or permitted null against API v2 schema.
 * @param value 候选 measurement / Candidate measurement.
 * @param nullable 此字段是否允许 null / Whether this field permits null.
 * @return 数值有限且单位封闭，或合法 null 时为 true / True for a finite value with a closed unit, or a permitted null.
 */
function isValidMeasurement(value: UiMeasurement | null, nullable: boolean): boolean {
  return (
    (value === null && nullable) ||
    (value !== null && Number.isFinite(value.value) && MEASUREMENT_UNITS.includes(value.unit))
  )
}

/**
 * @brief 替换或删除 Template style 草稿的一层 branch / Replace or remove one branch of a Template-style draft.
 * @param patch 当前完整草稿 / Current complete draft.
 * @param branch 目标 branch / Target branch.
 * @param value 新 branch；undefined 表示无剩余叶 / New branch, or undefined when no leaves remain.
 * @return 已清理空 branch 的新草稿 / New draft with empty branches pruned.
 */
function replaceTemplateDraftBranch<TBranch extends keyof TemplateStyleDraftPatch>(
  patch: TemplateStyleDraftPatch,
  branch: TBranch,
  value: TemplateStyleDraftPatch[TBranch] | undefined
): TemplateStyleDraftPatch {
  /** @brief 不修改旧草稿的可变顶层副本 / Mutable top-level copy that leaves the old draft untouched. */
  const next: Record<string, unknown> = { ...patch }
  if (value === undefined) delete next[branch]
  else next[branch] = value
  return next
}

/** @brief 一个无损 Measurement 编辑器的属性 / Props for one lossless Measurement editor. */
interface MeasurementFieldProps {
  /** @brief 是否冻结编辑 / Whether editing is locked. */
  readonly disabled: boolean
  /** @brief 字段组标签 / Field-group label. */
  readonly label: string
  /** @brief 完整领域策略是否判定该字段无效 / Whether the complete domain policy marks this field invalid. */
  readonly invalid?: boolean
  /** @brief 此 measurement 是否允许 null / Whether this measurement permits null. */
  readonly nullable: boolean
  /** @brief 提交结构化 measurement 或 null 的回调 / Callback committing a structured measurement or null. */
  readonly onChange: (value: UiMeasurement | null) => void
  /** @brief 单位 selector 的可访问标签 / Accessible label for the unit selector. */
  readonly unitLabel: string
  /** @brief 当前完整值 / Current complete value. */
  readonly value: UiMeasurement | null
  /** @brief 数值 input 的可访问标签 / Accessible label for the numeric input. */
  readonly valueLabel: string
}

/**
 * @brief 编辑 API v2 Measurement，同时保持 value/unit 原子配对 / Edit an API v2 Measurement while keeping value/unit atomically paired.
 * @param props 字段标签、值、nullable 语义与变更回调 / Field labels, value, nullable semantics, and change callback.
 * @return 有限数值 input 与封闭单位 selector / Finite-number input and closed-unit selector.
 */
function MeasurementField({
  disabled,
  invalid = false,
  label,
  nullable,
  onChange,
  unitLabel,
  value,
  valueLabel
}: MeasurementFieldProps): React.JSX.Element {
  /** @brief null 值第一次录入时使用的显式 UI 单位 / Explicit UI unit used for the first entry from null. */
  const effectiveUnit = value?.unit ?? 'mm'
  /** @brief 当前值是否满足 schema / Whether the current value satisfies the schema. */
  const isValid = isValidMeasurement(value, nullable)
  return (
    <fieldset className="aw-template-measurement">
      <legend>{label}</legend>
      <div className="aw-template-measurement-fields">
        <input
          aria-invalid={!isValid || invalid}
          aria-label={valueLabel}
          className="aw-text-input"
          disabled={disabled}
          onChange={(event): void => {
            if (event.currentTarget.value === '' && nullable) {
              onChange(null)
              return
            }
            /** @brief 浏览器解析的候选有限数值 / Candidate finite number parsed by the browser. */
            const nextValue = event.currentTarget.valueAsNumber
            if (Number.isFinite(nextValue)) onChange({ unit: effectiveUnit, value: nextValue })
          }}
          step="any"
          type="number"
          value={value?.value ?? ''}
        />
        <select
          aria-label={unitLabel}
          className="aw-select"
          disabled={disabled || value === null}
          onChange={(event): void => {
            if (value === null) return
            onChange({ ...value, unit: event.currentTarget.value as UiMeasurementUnit })
          }}
          value={effectiveUnit}
        >
          {MEASUREMENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}

/**
 * @brief 在事件与异步回调中读取墙钟毫秒 / Read wall-clock milliseconds in events and asynchronous callbacks.
 * @return 当前 Unix epoch 毫秒 / Current Unix-epoch milliseconds.
 */
function readWallClockMilliseconds(): number {
  return Date.now()
}

/** @brief 模板保存命令及其精确确认范围 / Template-save command and its exact confirmation scope. */
interface TemplateCommandAttempt {
  /** @brief 冻结 authority、payload 与 command identity 的完整命令 / Complete command freezing authority, payload, and command identity. */
  readonly command: UiResumeTemplateStyleCommand
  /** @brief 此 command 真正携带的本地草稿叶快照 / Snapshot of local draft leaves actually carried by this command. */
  readonly confirmedDraftPatch: TemplateStyleDraftPatch
}

/** @brief 模板写入后的页面级恢复状态 / Page-level recovery state after a Template write. */
type TemplateAuthorityRecovery =
  | {
      /** @brief 原 command 的提交结果未知 / The original command outcome is unknown. */
      readonly kind: 'outcome-unknown'
      /** @brief 必须原样确认的冻结信封 / Frozen envelope that must be confirmed verbatim. */
      readonly attempt: TemplateCommandAttempt
      /** @brief Retry-After 允许下一次确认的最早时刻 / Earliest confirmation time allowed by Retry-After. */
      readonly confirmNotBefore: number | null
    }
  | {
      /** @brief 必须先重新读取权威 / Authority must be read before another write. */
      readonly kind: 'authority-required'
      /** @brief 需要权威读取的稳定原因 / Stable reason requiring authority. */
      readonly reason:
        | 'abandoned-confirmation'
        | 'idempotency-key-reused'
        | 'invalid-response'
        | 'terminal-rejection'
        | 'conflict'
    }
  | {
      /** @brief 200 batch conflict 已确认整个命令未应用 / A 200 batch conflict confirmed that the command was not applied. */
      readonly kind: 'rejected'
    }

/** @brief 按 manifest group key 聚合的一组可见设置 / Visible settings grouped by manifest group key. */
interface TemplateSettingGroup {
  /** @brief 可选本地化 group key / Optional localized group key. */
  readonly key: string | null
  /** @brief 保持 manifest 顺序的定义 / Definitions preserving manifest order. */
  readonly definitions: readonly UiTemplateSettingDefinition[]
}

/**
 * @brief 按 manifest 顺序聚合可见设置 / Group visible settings in manifest order.
 * @param template 目标不可变 manifest / Target immutable manifest.
 * @param settings 保留 dormant 值的显式稀疏设置 / Sparse explicit settings retaining dormant values.
 * @return 首次出现顺序稳定的设置组 / Setting groups in stable first-occurrence order.
 */
function groupVisibleSettings(
  template: UiTemplateManifest,
  settings: Readonly<Record<string, UiJsonValue>>
): readonly TemplateSettingGroup[] {
  /** @brief 按首次出现顺序构建的可变 groups / Mutable groups built in first-occurrence order. */
  const groups: { key: string | null; definitions: UiTemplateSettingDefinition[] }[] = []
  for (const definition of template.settings) {
    if (!isTemplateSettingVisible(definition, template, settings)) continue
    /** @brief 已存在的同名 group / Existing group with the same key. */
    const group = groups.find((candidate) => candidate.key === definition.groupKey)
    if (group === undefined) groups.push({ definitions: [definition], key: definition.groupKey })
    else group.definitions.push(definition)
  }
  return groups
}

/**
 * @brief 合并 Template manifest 并按复合身份保持首次出现顺序 / Merge Template manifests by composite identity while preserving first-seen order.
 * @param existing 现有目录 / Existing catalog.
 * @param appended 新发现 manifest / Newly discovered manifests.
 * @return 不含复合身份重复项的新数组 / New array without duplicate composite identities.
 */
function mergeTemplates(
  existing: readonly UiTemplateManifest[],
  appended: readonly UiTemplateManifest[]
): readonly UiTemplateManifest[] {
  /** @brief 复合身份索引 / Composite-identity index. */
  const byIdentity = new Map<string, UiTemplateManifest>()
  for (const template of [...existing, ...appended]) {
    /** @brief 当前 manifest 的不可变身份 / Immutable identity of the current manifest. */
    const identity = getTemplateIdentity(template)
    if (!byIdentity.has(identity)) byIdentity.set(identity, template)
  }
  return [...byIdentity.values()]
}

/**
 * @brief 向渐进目录合并一个精确固定 manifest / Merge an exactly pinned manifest into progressive catalog state.
 * @param progress 当前渐进目录 / Current progressive catalog.
 * @param template 精确 manifest / Exact manifest.
 * @return 保留 cursor 状态的新进度 / New progress preserving cursor state.
 */
function mergeTemplateIntoProgress(
  progress: ResumeTemplateCatalogProgress,
  template: UiTemplateManifest
): ResumeTemplateCatalogProgress {
  return { ...progress, templates: mergeTemplates(progress.templates, [template]) }
}

/**
 * @brief 比较一个冻结命令是否已被权威完整确认 / Compare whether authority fully confirms a frozen command.
 * @param attempt 冻结命令 / Frozen command.
 * @param model 最新权威模型 / Latest authoritative model.
 * @return 模板身份与完整样式均相同时为 true / True when Template identity and complete style both match.
 */
function doesAuthorityConfirmAttempt(
  attempt: TemplateCommandAttempt,
  model: UiTemplateSettingsModel
): boolean {
  return (
    getTemplateIdentity(attempt.command.targetTemplate) ===
      getTemplateIdentity(model.selectedTemplate) &&
    uiJsonValuesEqual(
      attempt.command.styleIntent as unknown as UiJsonValue,
      model.styleIntent as unknown as UiJsonValue
    )
  )
}

/**
 * @brief 判断冻结信封是否精确表达当前权威与完整意图 / Determine whether a frozen envelope exactly expresses the current authority and complete intent.
 * @param attempt 候选冻结信封 / Candidate frozen envelope.
 * @param model 当前命令权威 / Current command authority.
 * @param targetTemplate 当前目标不可变模板 / Current target immutable Template.
 * @param styleIntent 当前完整语义样式 / Current complete semantic style.
 * @return 权威约束、目标模板与 JSON 样式均相同时为 true / True when authority constraints, target Template, and JSON style all match.
 */
function doesAttemptMatchIntent(
  attempt: TemplateCommandAttempt,
  model: UiTemplateSettingsModel,
  targetTemplate: UiTemplateManifest,
  styleIntent: UiResumeStyleIntent
): boolean {
  return (
    attempt.command.workspaceId === model.workspaceId &&
    attempt.command.resumeId === model.resumeId &&
    attempt.command.baseRevision === model.resumeRevision &&
    attempt.command.concurrencyToken === model.concurrencyToken &&
    attempt.command.targetTemplate.templateId === targetTemplate.id &&
    attempt.command.targetTemplate.templateVersion === targetTemplate.version &&
    uiJsonValuesEqual(
      attempt.command.styleIntent as unknown as UiJsonValue,
      styleIntent as unknown as UiJsonValue
    )
  )
}

/**
 * @brief 已就绪的模板与样式产品页面 / Ready Template-and-style product page.
 * @param props Resume gateway、公开目录与 pinned-first 初始模型 / Resume gateway, public catalog, and pinned-first initial model.
 * @return 模板选择、完整语义样式与安全写恢复流程 / Template selection, complete semantic style, and safe write recovery flow.
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
  const { t } = useTranslation()
  /** @brief 最近一次服务端确认的 Resume 权威 / Latest server-confirmed Resume authority. */
  const [authority, setAuthority] = useState(model)
  /** @brief pinned-first 且每次推进一页的公开目录 / Pinned-first public catalog progressing one page at a time. */
  const [catalogProgress, setCatalogProgress] = useState<ResumeTemplateCatalogProgress>(() =>
    createResumeTemplateCatalogProgress(model.selectedTemplate)
  )
  /** @brief 异步回调读取最新目录而不捕获陈旧 state / Latest catalog state available to asynchronous callbacks. */
  const catalogProgressRef = useRef(catalogProgress)
  /** @brief 用户当前明确选择的模板复合身份 / Composite identity of the Template explicitly selected by the user. */
  const [targetIdentity, setTargetIdentity] = useState(getTemplateIdentity(model.selectedTemplate))
  /** @brief 以 `id+version` 隔离的字段级本地草稿 / Field-level local drafts isolated by `id+version`. */
  const [drafts, setDrafts] = useState<ReadonlyMap<string, TemplateStyleDraftPatch>>(
    () => new Map()
  )
  /** @brief 保存状态 / Save status. */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  /** @brief 普通、可安全展示的保存失败 / Ordinary save failure safe to classify for display. */
  const [saveError, setSaveError] = useState<unknown>(null)
  /** @brief 需要 exact confirm 或权威读取的写恢复状态 / Write recovery requiring exact confirmation or authority read. */
  const [recovery, setRecovery] = useState<TemplateAuthorityRecovery | null>(null)
  /** @brief 恢复动作自身的安全错误 / Safe failure from a recovery action itself. */
  const [recoveryError, setRecoveryError] = useState<unknown>(null)
  /** @brief 渐进目录读取失败；不阻止 pinned 模板编辑 / Progressive-catalog failure that does not block pinned-Template editing. */
  const [catalogError, setCatalogError] = useState<unknown>(null)
  /** @brief 是否正在读取一页目录 / Whether one catalog page is being read. */
  const [isLoadingCatalog, setLoadingCatalog] = useState(false)
  /** @brief 是否正在读取 Resume 权威 / Whether Resume authority is being read. */
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief Retry-After 到期后驱动确认按钮重新启用的页面时钟 / Page clock re-enabling confirmation after Retry-After. */
  const [confirmationClock, setConfirmationClock] = useState(0)
  /** @brief React state 提交前同步关闭重复写入 / Synchronous duplicate-write guard preceding React state commits. */
  const writeInFlightRef = useRef(false)
  /** @brief 当前目录请求控制器 / Current catalog-request controller. */
  const catalogControllerRef = useRef<AbortController | null>(null)
  /** @brief 当前写请求控制器；signal 不进入 command envelope / Current write-request controller; its signal never enters the command envelope. */
  const writeControllerRef = useRef<AbortController | null>(null)
  /** @brief 当前权威读取控制器 / Current authority-read controller. */
  const authorityControllerRef = useRef<AbortController | null>(null)
  /** @brief 普通重试与未知结果确认必须复用的冻结信封 / Frozen envelope reused by ordinary retries and unknown-outcome confirmation. */
  const attemptRef = useRef<TemplateCommandAttempt | null>(null)
  /** @brief 禁止 transport replay、但仍须由 GET 语义对账的旧信封 / Old envelope forbidden from transport replay but still requiring semantic GET reconciliation. */
  const reconciliationAttemptRef = useRef<TemplateCommandAttempt | null>(null)

  useEffect((): void => {
    catalogProgressRef.current = catalogProgress
  }, [catalogProgress])

  /** @brief 当前公开目录中的目标模板 / Target Template in the current public catalog. */
  const targetTemplate =
    catalogProgress.templates.find(
      (template) => getTemplateIdentity(template) === targetIdentity
    ) ?? authority.selectedTemplate
  /** @brief 服务端当前固定模板身份 / Composite identity currently pinned by the service. */
  const authorityTemplateIdentity = getTemplateIdentity(authority.selectedTemplate)
  /** @brief 目标是否仍是服务端当前固定模板 / Whether target remains the server-pinned Template. */
  const targetIsAuthoritative = targetIdentity === authorityTemplateIdentity
  /** @brief 目标模板独享的稀疏补丁 / Sparse patch owned by the target Template. */
  const targetPatch = useMemo(
    () => drafts.get(targetIdentity) ?? EMPTY_TEMPLATE_STYLE_PATCH,
    [drafts, targetIdentity]
  )
  /** @brief 尚未按 visible_when 过滤的完整本地样式 / Complete local style before visible_when filtering. */
  const unprojectedStyle = useMemo(
    () => applyTemplateStyleDraft(authority.styleIntent, targetPatch, targetIsAuthoritative),
    [authority.styleIntent, targetIsAuthoritative, targetPatch]
  )
  /** @brief 最新权威中已不存在、因而绝不能由草稿复活的 section IDs / Section IDs absent from latest authority and therefore never resurrected from drafts. */
  const missingSectionDraftIds = useMemo(
    () => getMissingTemplateSectionDraftIds(authority.styleIntent, targetPatch),
    [authority.styleIntent, targetPatch]
  )
  /** @brief setting policy 错误会阻止形成命令 / Setting-policy failure preventing command creation. */
  let settingPolicyError: ResumeTemplateSettingPolicyError | null = null
  /** @brief 可提交的完整语义样式 / Complete semantic style safe to submit. */
  let commandStyleIntent: UiResumeStyleIntent | null = null
  /** @brief 当前可见 setting groups / Currently visible setting groups. */
  let settingGroups: readonly TemplateSettingGroup[] = []
  try {
    commandStyleIntent = {
      ...unprojectedStyle,
      templateSettings: projectVisibleTemplateSettings(
        targetTemplate,
        unprojectedStyle.templateSettings
      )
    }
    settingGroups = groupVisibleSettings(targetTemplate, unprojectedStyle.templateSettings)
  } catch (error: unknown) {
    if (error instanceof ResumeTemplateSettingPolicyError) settingPolicyError = error
    else throw error
  }
  /** @brief 同一权威中的 section kind 索引 / Section-kind index from the same authority. */
  const sectionKindById = new Map(authority.sections.map((section) => [section.id, section.kind]))
  /** @brief 领域层统一收集的完整样式兼容问题 / Complete style-compatibility issues collected by the domain policy. */
  const compatibilityIssues = collectResumeTemplateCompatibilityIssues(
    {
      locale: authority.locale,
      sections: authority.sections.map((section) => ({ id: section.id, kind: section.kind })),
      styleIntent: unprojectedStyle
    },
    targetTemplate
  )
  /** @brief 判断领域 collector 是否精确定位到一个样式叶 / Determine whether the domain collector precisely addresses one style leaf. */
  const hasCompatibilityIssue = (...fieldPath: string[]): boolean =>
    compatibilityIssues.some(
      (issue) =>
        issue.fieldPath.length === fieldPath.length &&
        issue.fieldPath.every((segment, index) => segment === fieldPath[index])
    )
  /** @brief 判断 section card 是否包含可定位问题 / Determine whether a section card contains an addressed issue. */
  const hasSectionCompatibilityIssue = (sectionId: string): boolean =>
    compatibilityIssues.some(
      (issue) =>
        issue.fieldPath[0] === 'styleIntent' &&
        issue.fieldPath[1] === 'sectionLayout' &&
        issue.fieldPath[2] === sectionId
    )
  /** @brief 当前目标是否形成了需要显式 Apply 的意图 / Whether the active target formed an intent requiring explicit Apply. */
  const activeTargetDirty =
    targetIdentity !== authorityTemplateIdentity || hasTemplateStyleDraftPatch(targetPatch)
  /** @brief 其他模板版本是否仍保留 dormant 草稿 / Whether other Template versions still retain dormant drafts. */
  const hasDormantDrafts = [...drafts.entries()].some(
    ([identity, patch]) => identity !== targetIdentity && hasTemplateStyleDraftPatch(patch)
  )
  /** @brief 保留字段草稿的模板复合身份 / Composite Template identities retaining field drafts. */
  const draftIdentities = useMemo(
    () =>
      new Set(
        [...drafts.entries()]
          .filter(([, patch]) => hasTemplateStyleDraftPatch(patch))
          .map(([identity]) => identity)
      ),
    [drafts]
  )
  /** @brief 页面任一模板是否有未应用意图 / Whether any Template on the page has unapplied intent. */
  const hasAnyUnsavedIntent = activeTargetDirty || hasDormantDrafts
  /** @brief 恢复或写入期间是否冻结所有编辑 / Whether recovery or a write freezes all editing. */
  const isWriteLocked = recovery !== null || saveStatus === 'saving' || isReloadingAuthority
  useUnsavedChanges(
    `resume.template-style:${authority.resumeId}`,
    hasAnyUnsavedIntent || recovery !== null || saveStatus === 'saving' || isReloadingAuthority
  )
  /** @brief 当前是否仍受 Retry-After 限制 / Whether Retry-After still limits confirmation. */
  const isConfirmationCoolingDown =
    recovery?.kind === 'outcome-unknown' &&
    recovery.confirmNotBefore !== null &&
    confirmationClock < recovery.confirmNotBefore
  /** @brief 是否能形成一个合法 Apply 命令 / Whether a valid Apply command can be formed. */
  const canApply =
    activeTargetDirty &&
    !isWriteLocked &&
    commandStyleIntent !== null &&
    settingPolicyError === null &&
    missingSectionDraftIds.length === 0 &&
    compatibilityIssues.length === 0

  useEffect(
    (): (() => void) => (): void => {
      catalogControllerRef.current?.abort(
        new DOMException('Template settings unmounted.', 'AbortError')
      )
      writeControllerRef.current?.abort(
        new DOMException('Template settings unmounted.', 'AbortError')
      )
      authorityControllerRef.current?.abort(
        new DOMException('Template settings unmounted.', 'AbortError')
      )
    },
    []
  )

  useEffect((): (() => void) | undefined => {
    if (recovery?.kind !== 'outcome-unknown' || recovery.confirmNotBefore === null) {
      return undefined
    }
    if (confirmationClock >= recovery.confirmNotBefore) return undefined
    /** @brief 受宿主上限约束的下一段冷却等待 / Next cooldown segment bounded by the host limit. */
    const delayMilliseconds = nextDeadlineTimerDelayMilliseconds(recovery.confirmNotBefore)
    if (delayMilliseconds === null) return undefined
    /** @brief 浏览器上限内的冷却计时器 / Cooldown timer within the browser limit. */
    const timer = window.setTimeout(
      (): void => setConfirmationClock(Math.max(Date.now(), recovery.confirmNotBefore ?? 0)),
      delayMilliseconds
    )
    return (): void => window.clearTimeout(timer)
  }, [confirmationClock, recovery])

  /**
   * @brief 读取并呈现恰好一页公开目录 / Read and present exactly one public-catalog page.
   * @return 本页读取结束后的 Promise / Promise completed after this page read.
   */
  const loadNextCatalogPage = useCallback(async (): Promise<void> => {
    /** @brief 调用时的目录进度 / Catalog progress at invocation time. */
    const current = catalogProgressRef.current
    if (!current.hasMore || catalogControllerRef.current !== null) return
    /** @brief 本页独占的取消控制器 / Abort controller exclusively owned by this page. */
    const controller = new AbortController()
    catalogControllerRef.current = controller
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      /** @brief 合并恰好一页后的目录 / Catalog after exactly one merged page. */
      const next = await loadNextResumeTemplateCatalogPage(catalog, current, controller.signal)
      controller.signal.throwIfAborted()
      catalogProgressRef.current = next
      setCatalogProgress(next)
    } catch (error: unknown) {
      if (!controller.signal.aborted) setCatalogError(error)
    } finally {
      if (catalogControllerRef.current === controller) catalogControllerRef.current = null
      if (!controller.signal.aborted) setLoadingCatalog(false)
    }
  }, [catalog])

  useEffect((): void => {
    if (
      catalogProgress.hasMore &&
      catalogProgress.requestedCursors.length === 0 &&
      catalogError === null &&
      !isLoadingCatalog
    ) {
      void loadNextCatalogPage()
    }
  }, [catalogError, catalogProgress, isLoadingCatalog, loadNextCatalogPage])

  /**
   * @brief 修改目标模板独享的稀疏补丁 / Modify the sparse patch owned by the target Template.
   * @param update 纯补丁转换 / Pure patch transformation.
   * @return 无返回值 / No return value.
   */
  const updateTargetPatch = (
    update: (patch: TemplateStyleDraftPatch) => TemplateStyleDraftPatch
  ): void => {
    if (isWriteLocked) return
    attemptRef.current = null
    reconciliationAttemptRef.current = null
    setSaveStatus('idle')
    setSaveError(null)
    setRecoveryError(null)
    setDrafts((current) => {
      /** @brief 不修改旧 state 的新 map / New map that does not mutate old state. */
      const next = new Map(current)
      /** @brief 转换后的目标补丁 / Transformed target patch. */
      const patch = update(current.get(targetIdentity) ?? {})
      if (hasTemplateStyleDraftPatch(patch)) next.set(targetIdentity, patch)
      else next.delete(targetIdentity)
      return next
    })
  }

  /**
   * @brief 更新一个显式 Template setting，并保留其他模板的 dormant 草稿 / Update one explicit Template setting while retaining dormant drafts for every other Template.
   * @param definition manifest setting 定义 / Manifest setting definition.
   * @param value 控件生成的合法值 / Valid value generated by the control.
   * @return 无返回值 / No return value.
   */
  const updateSetting = (definition: UiTemplateSettingDefinition, value: UiJsonValue): void => {
    if (!isTemplateSettingValueValid(value, definition)) return
    updateTargetPatch((patch) => {
      /** @brief 当前 setting 动作 map / Current setting-change map. */
      const changes = { ...patch.templateSettings }
      /** @brief 当前目标的基础显式值 / Base explicit value for the current target. */
      const baseValue = targetIsAuthoritative
        ? authority.styleIntent.templateSettings[definition.key]
        : undefined
      if (baseValue !== undefined && uiJsonValuesEqual(baseValue, value)) {
        delete changes[definition.key]
      } else {
        changes[definition.key] = { kind: 'set', value: cloneUiJsonValue(value) }
      }
      return { ...patch, templateSettings: changes }
    })
  }

  /**
   * @brief 删除 setting 的显式值并恢复 manifest default 投影 / Remove a setting's explicit value and restore its manifest-default projection.
   * @param definition 要恢复默认的 setting / Setting whose default should be restored.
   * @return 无返回值 / No return value.
   */
  const restoreSettingDefault = (definition: UiTemplateSettingDefinition): void => {
    updateTargetPatch((patch) => {
      /** @brief 当前 setting 动作 map / Current setting-change map. */
      const changes: Record<string, TemplateSettingDraftChange> = { ...patch.templateSettings }
      if (
        targetIsAuthoritative &&
        Object.hasOwn(authority.styleIntent.templateSettings, definition.key)
      ) {
        changes[definition.key] = { kind: 'remove' }
      } else {
        delete changes[definition.key]
      }
      return { ...patch, templateSettings: changes }
    })
  }

  /**
   * @brief 将带新 pinned manifest 的 Resume 权威投影到页面 / Project Resume authority after ensuring its pinned manifest.
   * @param editor 完整 Resume 权威 / Complete Resume authority.
   * @param signal 当前恢复生命周期 / Current recovery lifecycle.
   * @return 含现有渐进目录的模板设置模型 / Template-settings model containing the existing progressive catalog.
   */
  const projectAuthority = useCallback(
    async (editor: UiResumeEditorModel, signal: AbortSignal): Promise<UiTemplateSettingsModel> => {
      /** @brief 新权威固定模板身份 / Pinned-Template identity in the new authority. */
      const pinnedIdentity = getTemplateIdentity(editor.resume.template)
      /** @brief 目录 cache 中的精确 pinned manifest / Exact pinned manifest in the catalog cache. */
      let pinned = catalogProgressRef.current.templates.find(
        (template) => getTemplateIdentity(template) === pinnedIdentity
      )
      if (pinned === undefined) {
        pinned = await loadPinnedResumeTemplate(catalog, editor.resume.template, signal)
        signal.throwIfAborted()
        /** @brief 合并 cache miss manifest 后的目录 / Catalog after merging the cache-miss manifest. */
        const merged = mergeTemplateIntoProgress(catalogProgressRef.current, pinned)
        catalogProgressRef.current = merged
        setCatalogProgress(merged)
      }
      /** @brief 合并目录后投影的权威模型 / Authority projected after catalog merge. */
      const projected = projectResumeTemplateSettings(editor, [pinned])
      return { ...projected, availableTemplates: catalogProgressRef.current.templates }
    },
    [catalog]
  )

  /**
   * @brief 吸收已确认成功的最新权威并清除该模板的已确认草稿 / Adopt confirmed authority and clear the confirmed draft for that Template.
   * @param editor gateway 返回的完整权威 / Complete authority returned by the gateway.
   * @param attempt 已被确认的冻结命令 / Frozen command that was confirmed.
   * @param signal 当前写生命周期 / Current write lifecycle.
   * @return 权威吸收完成的 Promise / Promise completed after authority adoption.
   */
  const adoptSuccessfulAuthority = async (
    editor: UiResumeEditorModel,
    attempt: TemplateCommandAttempt,
    signal: AbortSignal
  ): Promise<void> => {
    /** @brief 经精确 pinned manifest 验证的新模型 / New model verified with the exact pinned manifest. */
    const saved = await projectAuthority(editor, signal)
    signal.throwIfAborted()
    /** @brief 服务端确认的目标身份 / Target identity confirmed by the service. */
    const confirmedIdentity = getTemplateIdentity(saved.selectedTemplate)
    setAuthority(saved)
    setTargetIdentity(confirmedIdentity)
    setDrafts((current) =>
      discardConfirmedTemplateDraft(current, confirmedIdentity, attempt.confirmedDraftPatch)
    )
    if (attemptRef.current === attempt) attemptRef.current = null
    reconciliationAttemptRef.current = null
    setRecovery(null)
    setRecoveryError(null)
    setSaveError(null)
    setSaveStatus('saved')
  }

  /**
   * @brief 按 API v2 语义处置一次模板写错误 / Handle one Template-write error using API v2 semantics.
   * @param error gateway 返回的未知错误 / Unknown error returned by the gateway.
   * @param attempt 发生错误的冻结信封 / Frozen envelope whose invocation failed.
   * @param signal 当前写生命周期 / Current write lifecycle.
   * @return 错误分类与必要权威吸收结束后的 Promise / Promise completed after classification and any required authority adoption.
   */
  const handleWriteError = async (
    error: unknown,
    attempt: TemplateCommandAttempt,
    signal: AbortSignal
  ): Promise<void> => {
    /** @brief 与 revision 无关的幂等冲突 / Idempotency conflict unrelated to Resume revision. */
    const idempotency = getResumeIdempotencyConflict(error)
    if (idempotency === 'in-progress') {
      /** @brief 已验证 Retry-After 延迟 / Validated Retry-After delay. */
      const retryAfter = getResumeCommandRetryAfterMilliseconds(error)
      /** @brief 当前页面时刻 / Current page time. */
      const now = readWallClockMilliseconds()
      setConfirmationClock(now)
      setRecovery({
        attempt,
        confirmNotBefore: retryAfter === null ? null : now + retryAfter,
        kind: 'outcome-unknown'
      })
      setSaveStatus('error')
      return
    }
    if (idempotency === 'key-reused') {
      if (attemptRef.current === attempt) attemptRef.current = null
      setRecovery({ kind: 'authority-required', reason: 'idempotency-key-reused' })
      setSaveStatus('error')
      return
    }
    if (isResumeUnreplayableContractResponse(error)) {
      if (attemptRef.current === attempt) attemptRef.current = null
      reconciliationAttemptRef.current = attempt
      setRecovery({ kind: 'authority-required', reason: 'invalid-response' })
      setSaveStatus('error')
      return
    }
    if (getResumeConflictStatus(error) !== null) {
      if (attemptRef.current === attempt) attemptRef.current = null
      setRecovery({ kind: 'authority-required', reason: 'conflict' })
      setSaveStatus('error')
      return
    }
    if (classifyResourceFailure(error).kind === 'outcome-unknown') {
      setConfirmationClock(readWallClockMilliseconds())
      setRecovery({ attempt, confirmNotBefore: null, kind: 'outcome-unknown' })
      setSaveStatus('error')
      return
    }
    /** @brief 合法 200 conflict 中原子携带的完整权威 / Complete authority atomically carried by a valid 200 conflict. */
    const batchConflict = getResumeBatchConflict(error)
    if (batchConflict !== null) {
      if (attemptRef.current === attempt) attemptRef.current = null
      /** @brief 以 exact pinned manifest 验证的 conflict 权威 / Conflict authority verified by exact pinned manifest. */
      const recovered = await projectAuthority(batchConflict.authoritativeEditor, signal)
      signal.throwIfAborted()
      setAuthority(recovered)
      setRecovery({ kind: 'rejected' })
      setSaveStatus('error')
      return
    }
    if (isResumeCommandDefinitivelyRejected(error)) {
      if (attemptRef.current === attempt) attemptRef.current = null
      setRecovery({ kind: 'authority-required', reason: 'terminal-rejection' })
      setSaveStatus('error')
      return
    }
    setSaveError(error)
    setSaveStatus('error')
  }

  /**
   * @brief 执行或原样确认一个冻结模板命令 / Execute or exactly confirm one frozen Template command.
   * @param attempt 完整冻结信封 / Complete frozen envelope.
   * @return 请求与状态收敛后的 Promise / Promise completed after request and state convergence.
   */
  const runAttempt = async (attempt: TemplateCommandAttempt): Promise<void> => {
    if (writeInFlightRef.current) return
    writeInFlightRef.current = true
    /** @brief 本次调用独享、且不属于信封的取消控制器 / Per-invocation abort controller excluded from the envelope. */
    const controller = new AbortController()
    writeControllerRef.current = controller
    setSaveStatus('saving')
    setSaveError(null)
    setRecoveryError(null)
    try {
      /** @brief 新强 ETag 与完整 Resume 权威 / Complete Resume authority with a new strong ETag. */
      const editor = await gateway.updateResumeTemplateAndStyle(attempt.command, controller.signal)
      controller.signal.throwIfAborted()
      await adoptSuccessfulAuthority(editor, attempt, controller.signal)
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        try {
          await handleWriteError(error, attempt, controller.signal)
        } catch (recoveryFailure: unknown) {
          if (!controller.signal.aborted) {
            setRecoveryError(recoveryFailure)
            setRecovery({ kind: 'authority-required', reason: 'conflict' })
            setSaveStatus('error')
          }
        }
      }
    } finally {
      if (writeControllerRef.current === controller) writeControllerRef.current = null
      writeInFlightRef.current = false
    }
  }

  /**
   * @brief 冻结并提交当前显式 Apply 意图 / Freeze and submit the current explicit Apply intent.
   * @return 无返回值 / No return value.
   */
  const applyTemplateAndStyle = (): void => {
    if (!canApply || commandStyleIntent === null) return
    /** @brief 依据目标 manifest 与 effective settings 实际进入 command 语义的 setting actions / Setting actions actually entering command semantics according to target manifest and effective settings. */
    const confirmedSettingActionKeys = new Set(
      Object.keys(targetPatch.templateSettings ?? {}).filter((key) =>
        settingGroups.some((group) =>
          group.definitions.some((definition) => definition.key === key)
        )
      )
    )
    /** @brief 同意图普通重试复用，其他情况创建的新冻结信封 / Frozen envelope reused for the same ordinary retry or newly created otherwise. */
    const attempt =
      attemptRef.current !== null &&
      doesAttemptMatchIntent(attemptRef.current, authority, targetTemplate, commandStyleIntent)
        ? attemptRef.current
        : {
            command: {
              baseRevision: authority.resumeRevision,
              commandId: createUiCommandId(),
              concurrencyToken: authority.concurrencyToken,
              resumeId: authority.resumeId,
              styleIntent: cloneUiJsonValue(
                commandStyleIntent as unknown as UiJsonValue
              ) as unknown as UiResumeStyleIntent,
              targetTemplate: {
                templateId: targetTemplate.id,
                templateVersion: targetTemplate.version
              },
              workspaceId: authority.workspaceId
            },
            confirmedDraftPatch: createConfirmedTemplateStyleDraftPatch(
              targetPatch,
              confirmedSettingActionKeys
            )
          }
    attemptRef.current = attempt
    void runAttempt(attempt)
  }

  /**
   * @brief 原样确认结果未知的旧命令 / Confirm an unknown old command verbatim.
   * @return 无返回值 / No return value.
   */
  const confirmUnknownCommand = (): void => {
    if (recovery?.kind !== 'outcome-unknown' || isConfirmationCoolingDown) return
    void runAttempt(recovery.attempt)
  }

  /**
   * @brief 重新读取 Resume 与精确 pinned manifest，同时仅重放本地字段补丁 / Reload Resume plus exact pinned manifest while replaying only local field patches.
   * @return 权威读取结束的 Promise / Promise completed after authority read.
   */
  const reloadAuthority = useCallback(async (): Promise<void> => {
    if (authorityControllerRef.current !== null) return
    /** @brief 本次权威读取独占控制器 / Controller exclusively owned by this authority read. */
    const controller = new AbortController()
    authorityControllerRef.current = controller
    setReloadingAuthority(true)
    setRecoveryError(null)
    try {
      /** @brief Resume authority 与 exact pinned manifest / Resume authority and exact pinned manifest. */
      const reloaded = await loadResumeTemplateSettings(
        gateway,
        catalog,
        authority.workspaceId,
        authority.resumeId,
        controller.signal
      )
      controller.signal.throwIfAborted()
      /** @brief 将新 pinned manifest 合并到现有渐进目录 / Progressive catalog merged with the new pinned manifest. */
      const mergedProgress = mergeTemplateIntoProgress(
        catalogProgressRef.current,
        reloaded.selectedTemplate
      )
      catalogProgressRef.current = mergedProgress
      setCatalogProgress(mergedProgress)
      /** @brief 配对现有目录的新权威模型 / New authority paired with the existing catalog. */
      const nextAuthority = { ...reloaded, availableTemplates: mergedProgress.templates }
      /** @brief GET 可完整确认的旧命令 / Old command fully confirmed by the GET. */
      const confirmedAttempt = reconciliationAttemptRef.current
      setAuthority(nextAuthority)
      if (
        confirmedAttempt !== null &&
        doesAuthorityConfirmAttempt(confirmedAttempt, nextAuthority)
      ) {
        /** @brief GET 已确认的目标模板身份 / Target identity confirmed by GET. */
        const confirmedIdentity = getTemplateIdentity(confirmedAttempt.command.targetTemplate)
        setDrafts((current) =>
          discardConfirmedTemplateDraft(
            current,
            confirmedIdentity,
            confirmedAttempt.confirmedDraftPatch
          )
        )
        setTargetIdentity(confirmedIdentity)
        setSaveStatus('saved')
      } else {
        setSaveStatus('idle')
      }
      reconciliationAttemptRef.current = null
      attemptRef.current = null
      setRecovery(null)
      setSaveError(null)
    } catch (error: unknown) {
      if (!controller.signal.aborted) setRecoveryError(error)
    } finally {
      if (authorityControllerRef.current === controller) authorityControllerRef.current = null
      if (!controller.signal.aborted) setReloadingAuthority(false)
    }
  }, [authority.resumeId, authority.workspaceId, catalog, gateway])

  /**
   * @brief 明确放弃旧 command identity，保留草稿并读取权威 / Explicitly abandon the old command identity, retain drafts, and read authority.
   * @return 无返回值 / No return value.
   */
  const abandonConfirmationAndReload = (): void => {
    if (recovery?.kind !== 'outcome-unknown' || writeInFlightRef.current) return
    if (attemptRef.current === recovery.attempt) attemptRef.current = null
    reconciliationAttemptRef.current = recovery.attempt
    setRecovery({ kind: 'authority-required', reason: 'abandoned-confirmation' })
    void reloadAuthority()
  }

  /**
   * @brief 设置当前目标模板而不发起任何写操作 / Select the current target Template without issuing a write.
   * @param template 用户选择的不可变 manifest / Immutable manifest selected by the user.
   * @return 无返回值 / No return value.
   */
  const selectTargetTemplate = (template: UiTemplateManifest): void => {
    if (isWriteLocked) return
    attemptRef.current = null
    reconciliationAttemptRef.current = null
    setTargetIdentity(getTemplateIdentity(template))
    setSaveStatus('idle')
    setSaveError(null)
  }

  /**
   * @brief 更新 page intent 的一个字段 / Update one page-intent field.
   * @param field page 字段 / Page field.
   * @param value 新字段值 / New field value.
   * @return 无返回值 / No return value.
   */
  const updatePageField = <TField extends Exclude<keyof UiResumeStyleIntent['page'], 'margins'>>(
    field: TField,
    value: UiResumeStyleIntent['page'][TField]
  ): void => {
    updateTargetPatch((patch) =>
      replaceTemplateDraftBranch(
        patch,
        'page',
        setTemplateDraftLeaf<TemplateStyleDraftPatch['page'] & object, TField>(
          patch.page,
          field,
          value as (TemplateStyleDraftPatch['page'] & object)[TField],
          authority.styleIntent.page[field] as (TemplateStyleDraftPatch['page'] & object)[TField]
        )
      )
    )
  }

  /**
   * @brief 只更新一个页面边距，不冻结其他三边权威 / Update one page margin without freezing authority for the other three edges.
   * @param edge 页面边 / Page edge.
   * @param value 新 measurement / New measurement.
   * @return 无返回值 / No return value.
   */
  const updatePageMargin = (
    edge: keyof UiResumeStyleIntent['page']['margins'],
    value: UiMeasurement
  ): void => {
    updateTargetPatch((patch) => {
      /** @brief 与权威相等即删除目标 edge 的边距补丁 / Margin patch with the target edge removed when equal to authority. */
      const margins = setTemplateDraftLeaf<UiResumeStyleIntent['page']['margins'], typeof edge>(
        patch.page?.margins,
        edge,
        value,
        authority.styleIntent.page.margins[edge]
      )
      /** @brief 不修改旧 page branch 的新副本 / New copy leaving the old page branch untouched. */
      const page: Record<string, unknown> = { ...patch.page }
      if (margins === undefined) delete page.margins
      else page.margins = margins
      return replaceTemplateDraftBranch(
        patch,
        'page',
        Object.keys(page).length === 0 ? undefined : page
      )
    })
  }

  /**
   * @brief 更新 typography intent 的一个字段 / Update one typography-intent field.
   * @param field typography 字段 / Typography field.
   * @param value 新字段值 / New field value.
   * @return 无返回值 / No return value.
   */
  const updateTypographyField = <TField extends keyof UiResumeStyleIntent['typography']>(
    field: TField,
    value: UiResumeStyleIntent['typography'][TField]
  ): void => {
    updateTargetPatch((patch) =>
      replaceTemplateDraftBranch(
        patch,
        'typography',
        setTemplateDraftLeaf<UiResumeStyleIntent['typography'], TField>(
          patch.typography,
          field,
          value,
          authority.styleIntent.typography[field]
        )
      )
    )
  }

  /**
   * @brief 更新 palette intent 的一个字段 / Update one palette-intent field.
   * @param field palette 字段 / Palette field.
   * @param value 新结构化颜色 / New structured color.
   * @return 无返回值 / No return value.
   */
  const updatePaletteField = <TField extends keyof UiResumeStyleIntent['palette']>(
    field: TField,
    value: UiResumeStyleIntent['palette'][TField]
  ): void => {
    updateTargetPatch((patch) =>
      replaceTemplateDraftBranch(
        patch,
        'palette',
        setTemplateDraftLeaf<UiResumeStyleIntent['palette'], TField>(
          patch.palette,
          field,
          value,
          authority.styleIntent.palette[field]
        )
      )
    )
  }

  /**
   * @brief 更新 ResumeStyleIntent 的顶层 scalar，并在撤回时清除补丁 / Update a top-level ResumeStyleIntent scalar and prune the patch when reverted.
   * @param field 可编辑顶层 scalar 字段 / Editable top-level scalar field.
   * @param value 新 scalar 值 / New scalar value.
   * @return 无返回值 / No return value.
   */
  const updateStyleScalar = <TField extends 'bulletStyleToken' | 'dateFormatToken' | 'density'>(
    field: TField,
    value: UiResumeStyleIntent[TField]
  ): void => {
    updateTargetPatch(
      (patch) =>
        setTemplateDraftLeaf<
          Pick<UiResumeStyleIntent, 'bulletStyleToken' | 'dateFormatToken' | 'density'>,
          TField
        >(patch, field, value, authority.styleIntent[field]) ?? {}
    )
  }

  /**
   * @brief 更新一个 section layout 叶字段 / Update one section-layout leaf field.
   * @param sectionId 目标 section identity / Target section identity.
   * @param field layout 叶字段 / Layout leaf field.
   * @param value 新叶值 / New leaf value.
   * @return 无返回值 / No return value.
   */
  const updateSectionLayoutField = <
    TField extends Exclude<keyof UiResumeStyleIntent['sectionLayout'][number], 'sectionId'>
  >(
    sectionId: UiResumeStyleIntent['sectionLayout'][number]['sectionId'],
    field: TField,
    value: UiResumeStyleIntent['sectionLayout'][number][TField]
  ): void => {
    updateTargetPatch((patch) => {
      /** @brief 最新权威中的同一 section layout / Same section layout in latest authority. */
      const baseline = authority.styleIntent.sectionLayout.find(
        (layout) => layout.sectionId === sectionId
      )
      if (baseline === undefined) return patch
      /** @brief 删除已撤回叶后的 section 补丁 / Section patch after pruning a reverted leaf. */
      const sectionPatch = setTemplateDraftLeaf<
        UiResumeStyleIntent['sectionLayout'][number],
        TField
      >(patch.sectionLayoutBySectionId?.[sectionId], field, value, baseline[field])
      /** @brief 不修改旧 map 的 section 补丁副本 / Section-patch map copy leaving the old map untouched. */
      const sections: Record<
        string,
        NonNullable<TemplateStyleDraftPatch['sectionLayoutBySectionId']>[string]
      > = { ...patch.sectionLayoutBySectionId }
      if (sectionPatch === undefined) delete sections[sectionId]
      else sections[sectionId] = sectionPatch
      return replaceTemplateDraftBranch(
        patch,
        'sectionLayoutBySectionId',
        Object.keys(sections).length === 0 ? undefined : sections
      )
    })
  }

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('template.semanticIntent', { defaultValue: '语义样式意图' })}
          </p>
          <h1 className="aw-page-title">{t('template.title', { defaultValue: '模板与版式' })}</h1>
          <p className="aw-page-description">
            {t('template.applyDescription', {
              defaultValue: '选择精确模板版本、调整语义样式，然后一次性应用到简历。'
            })}
          </p>
        </div>
        <Link className="aw-quiet-button" to={`/resumes/${authority.resumeId}/edit`}>
          <ArrowLeft aria-hidden="true" size={15} />
          {t('common.back', { defaultValue: '返回编辑器' })}
        </Link>
      </div>

      <div className="aw-template-layout">
        <TemplateCatalogPicker
          disabled={isWriteLocked}
          draftIdentities={draftIdentities}
          hasError={catalogError !== null}
          hasMore={catalogProgress.hasMore}
          isFirstPageLoaded={catalogProgress.requestedCursors.length > 0}
          isLoading={isLoadingCatalog}
          onLoadNext={(): void => void loadNextCatalogPage()}
          onRetry={(): void => void loadNextCatalogPage()}
          onSelect={selectTargetTemplate}
          selectedIdentity={targetIdentity}
          templates={catalogProgress.templates}
        />

        <aside className="aw-card aw-settings-card">
          <TemplatePreview className="aw-template-preview" template={targetTemplate} />
          <div className="aw-inline-actions">
            <LayoutTemplate aria-hidden="true" className="aw-accent-icon" size={17} />
            <div>
              <h2 className="aw-card-title">{targetTemplate.name}</h2>
              <p className="aw-card-description">v{targetTemplate.version}</p>
            </div>
          </div>
          <div className="aw-list-row">
            <span className="aw-muted">
              {t('template.capabilities', { defaultValue: '公开能力' })}
            </span>
            <div className="aw-chip-row">
              <span className="aw-chip">
                <Columns2 aria-hidden="true" size={12} />
                {t('template.columns', { count: targetTemplate.capabilities.maxColumns })}
              </span>
              {targetTemplate.supportedOutputFormats.map((format) => (
                <span className="aw-chip" key={format}>
                  {format}
                </span>
              ))}
            </div>
          </div>
          <p className="aw-setting-help">
            <Info aria-hidden="true" size={13} />{' '}
            {t('template.atomicApplyNotice', {
              defaultValue: '模板版本和完整样式通过一个 API v2 原子批次应用。'
            })}
          </p>
        </aside>
      </div>

      <section className="aw-card aw-settings-card aw-template-style-panel">
        <div className="aw-inline-actions">
          <SlidersHorizontal aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.styleTitle', { defaultValue: '页面与排版' })}
            </h2>
            <p className="aw-card-description">
              {t('template.settingsDescription', {
                defaultValue: '未修改字段始终合并最新权威；目标不支持的值必须显式修正。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-template-setting-grid">
          <label className="aw-template-field">
            <span>{t('template.pageSize', { defaultValue: '页面规格' })}</span>
            <SupportedValueSelect
              disabled={isWriteLocked}
              invalid={hasCompatibilityIssue('styleIntent', 'page', 'size')}
              label={t('template.pageSize')}
              onChange={(value): void => updatePageField('size', value as UiResumePageSize)}
              options={targetTemplate.supportedPageSizes}
              value={unprojectedStyle.page.size}
            />
          </label>
          <label className="aw-template-field">
            <span>{t('template.orientation', { defaultValue: '页面方向' })}</span>
            <select
              aria-invalid={hasCompatibilityIssue('styleIntent', 'page', 'orientation')}
              aria-label={t('template.orientation', { defaultValue: '页面方向' })}
              className="aw-select"
              disabled={isWriteLocked}
              onChange={(event): void =>
                updatePageField('orientation', event.currentTarget.value as UiResumePageOrientation)
              }
              value={unprojectedStyle.page.orientation}
            >
              <option value="portrait">{t('template.portrait', { defaultValue: '纵向' })}</option>
              <option value="landscape">{t('template.landscape', { defaultValue: '横向' })}</option>
            </select>
          </label>
          {unprojectedStyle.page.size === 'CUSTOM' ? (
            <>
              {(
                [
                  ['customWidth', 'template.customWidth'],
                  ['customHeight', 'template.customHeight']
                ] as const
              ).map(([field, labelKey]) => {
                /** @brief 当前 CUSTOM dimension 的本地化标签 / Localized label for the current CUSTOM dimension. */
                const label = t(labelKey)
                return (
                  <MeasurementField
                    disabled={isWriteLocked}
                    invalid={hasCompatibilityIssue('styleIntent', 'page', field)}
                    key={field}
                    label={label}
                    nullable
                    onChange={(measurement): void => updatePageField(field, measurement)}
                    unitLabel={t('template.measurementUnitFor', {
                      field: label
                    })}
                    value={unprojectedStyle.page[field]}
                    valueLabel={t('template.measurementValueFor', {
                      field: label
                    })}
                  />
                )
              })}
            </>
          ) : null}
          {(
            [
              ['top', 'template.marginTop'],
              ['right', 'template.marginRight'],
              ['bottom', 'template.marginBottom'],
              ['left', 'template.marginLeft']
            ] as const
          ).map(([edge, labelKey]) => {
            /** @brief 当前页面边距的本地化标签 / Localized label for the current page margin. */
            const label = t(labelKey)
            return (
              <MeasurementField
                disabled={isWriteLocked}
                invalid={hasCompatibilityIssue('styleIntent', 'page', 'margins', edge)}
                key={edge}
                label={label}
                nullable={false}
                onChange={(measurement): void => {
                  if (measurement !== null) updatePageMargin(edge, measurement)
                }}
                unitLabel={t('template.measurementUnitFor', { field: label })}
                value={unprojectedStyle.page.margins[edge]}
                valueLabel={t('template.measurementValueFor', { field: label })}
              />
            )
          })}
          <label className="aw-template-field">
            <span>{t('template.fontToken', { defaultValue: '字体令牌' })}</span>
            <SupportedValueSelect
              disabled={isWriteLocked}
              invalid={hasCompatibilityIssue('styleIntent', 'typography', 'fontFamilyToken')}
              label={t('template.fontToken')}
              onChange={(value): void => updateTypographyField('fontFamilyToken', value)}
              options={targetTemplate.fontFamilyTokens}
              value={unprojectedStyle.typography.fontFamilyToken}
            />
          </label>
          <label className="aw-template-field">
            <span>{t('template.dateFormatToken', { defaultValue: '日期格式' })}</span>
            <SupportedValueSelect
              disabled={isWriteLocked}
              invalid={hasCompatibilityIssue('styleIntent', 'dateFormatToken')}
              label={t('template.dateFormatToken')}
              onChange={(value): void => updateStyleScalar('dateFormatToken', value)}
              options={targetTemplate.dateFormatTokens}
              value={unprojectedStyle.dateFormatToken}
            />
          </label>
          <label className="aw-template-field">
            <span>{t('template.bulletStyleToken', { defaultValue: '项目符号' })}</span>
            <SupportedValueSelect
              disabled={isWriteLocked}
              invalid={hasCompatibilityIssue('styleIntent', 'bulletStyleToken')}
              label={t('template.bulletStyleToken')}
              onChange={(value): void => updateStyleScalar('bulletStyleToken', value)}
              options={targetTemplate.bulletStyleTokens}
              value={unprojectedStyle.bulletStyleToken}
            />
          </label>
          <label className="aw-template-field">
            <span>{t('template.density', { defaultValue: '内容密度' })}</span>
            <input
              aria-invalid={hasCompatibilityIssue('styleIntent', 'density')}
              aria-label={t('template.density')}
              disabled={isWriteLocked}
              max="1"
              min="0"
              onChange={(event): void =>
                updateStyleScalar('density', event.currentTarget.valueAsNumber)
              }
              step="0.05"
              type="range"
              value={unprojectedStyle.density}
            />
          </label>
        </div>
      </section>

      <section className="aw-card aw-settings-card aw-template-style-panel">
        <div className="aw-inline-actions">
          <Palette aria-hidden="true" className="aw-accent-icon" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('template.detailedStyleTitle', { defaultValue: '细节样式' })}
            </h2>
            <p className="aw-card-description">
              {t('template.detailedStyleDescription', {
                defaultValue: '这些值保持 ResumeStyleIntent 的结构化语义，不提交 CSS。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-template-setting-grid">
          {(
            [
              ['baseSizePt', 'template.baseSize', 5, 72, 0.25],
              ['lineHeight', 'template.lineHeight', 0.5, 5, 0.05],
              ['headingScale', 'template.headingScale', 0.5, 5, 0.05],
              ['letterSpacingEm', 'template.letterSpacing', -1, 2, 0.01]
            ] as const
          ).map(([field, labelKey, minimum, maximum, step]) => (
            <label className="aw-template-field" key={field}>
              <span>{t(labelKey)}</span>
              <input
                aria-invalid={hasCompatibilityIssue('styleIntent', 'typography', field)}
                aria-label={t(labelKey)}
                className="aw-text-input"
                disabled={isWriteLocked}
                max={maximum}
                min={minimum}
                onChange={(event): void => {
                  /** @brief 浏览器解析的 typography 数值 / Typography value parsed by the browser. */
                  const value = event.currentTarget.valueAsNumber
                  if (Number.isFinite(value)) updateTypographyField(field, value)
                }}
                step={step}
                type="number"
                value={unprojectedStyle.typography[field]}
              />
            </label>
          ))}
          {(
            [
              ['primary', 'template.palettePrimary'],
              ['secondary', 'template.paletteSecondary'],
              ['text', 'template.paletteText'],
              ['mutedText', 'template.paletteMutedText'],
              ['background', 'template.paletteBackground']
            ] as const
          ).map(([field, labelKey]) => {
            /** @brief 当前结构化 palette 颜色 / Current structured palette color. */
            const color = unprojectedStyle.palette[field]
            /** @brief 原生 color input 是否无损 / Whether a native color input is lossless. */
            const nativeColor = color.space === 'srgb_hex' && /^#[0-9A-Fa-f]{6}$/u.test(color.value)
            return (
              <fieldset className="aw-template-palette-field" key={field}>
                <legend>{t(labelKey)}</legend>
                <div className="aw-template-palette-fields">
                  <select
                    aria-invalid={hasCompatibilityIssue('styleIntent', 'palette', field)}
                    aria-label={t('template.paletteSpaceFor', { field: t(labelKey) })}
                    className="aw-select"
                    disabled={isWriteLocked}
                    onChange={(event): void =>
                      updatePaletteField(field, {
                        ...color,
                        space: event.currentTarget
                          .value as UiResumeStyleIntent['palette'][typeof field]['space']
                      })
                    }
                    value={color.space}
                  >
                    <option value="srgb_hex">srgb_hex</option>
                    <option value="rgba">rgba</option>
                  </select>
                  <input
                    aria-invalid={hasCompatibilityIssue('styleIntent', 'palette', field)}
                    aria-label={t(labelKey)}
                    className="aw-text-input"
                    disabled={isWriteLocked}
                    maxLength={80}
                    onChange={(event): void =>
                      updatePaletteField(field, { ...color, value: event.currentTarget.value })
                    }
                    type={nativeColor ? 'color' : 'text'}
                    value={color.value}
                  />
                </div>
              </fieldset>
            )
          })}
          <label className="aw-template-field aw-template-field--checkbox">
            <input
              aria-invalid={hasCompatibilityIssue('styleIntent', 'page', 'showPageNumbers')}
              checked={unprojectedStyle.page.showPageNumbers}
              disabled={isWriteLocked}
              onChange={(event): void =>
                updatePageField('showPageNumbers', event.currentTarget.checked)
              }
              type="checkbox"
            />
            <span>{t('template.showPageNumbers', { defaultValue: '显示页码' })}</span>
          </label>
          <label className="aw-template-field">
            <span>{t('template.maxPages', { defaultValue: '最大页数' })}</span>
            <input
              aria-invalid={hasCompatibilityIssue('styleIntent', 'page', 'maxPages')}
              aria-label={t('template.maxPages')}
              className="aw-text-input"
              disabled={isWriteLocked}
              max="100"
              min="1"
              onChange={(event): void => {
                /** @brief 空值表示不限制页数 / Empty input denotes no page limit. */
                const value = event.currentTarget.value
                updatePageField('maxPages', value === '' ? null : Number(value))
              }}
              type="number"
              value={unprojectedStyle.page.maxPages ?? ''}
            />
          </label>
        </div>
      </section>

      {unprojectedStyle.sectionLayout.length > 0 ? (
        <section className="aw-card aw-settings-card aw-template-style-panel">
          <div>
            <h2 className="aw-card-title">
              {t('template.sectionZones', { defaultValue: '区段语义区域' })}
            </h2>
            <p className="aw-card-description">
              {t('template.sectionZonesDescription', {
                defaultValue: '切换模板时，不支持的区域不会被静默替换。'
              })}
            </p>
          </div>
          <div className="aw-section-layout-list">
            {unprojectedStyle.sectionLayout.map((layout) => (
              <fieldset
                aria-invalid={hasSectionCompatibilityIssue(layout.sectionId)}
                className="aw-section-layout-card"
                key={layout.sectionId}
              >
                <legend>{layout.sectionId}</legend>
                <div className="aw-template-setting-grid">
                  <label className="aw-template-field">
                    <span>
                      {t('template.sectionZoneFor', {
                        defaultValue: '{{sectionId}} 的区域',
                        sectionId: layout.sectionId
                      })}
                    </span>
                    <SupportedValueSelect
                      disabled={isWriteLocked}
                      invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'zone'
                      )}
                      label={t('template.sectionZoneFor', {
                        defaultValue: '{{sectionId}} 的区域',
                        sectionId: layout.sectionId
                      })}
                      onChange={(zone): void =>
                        updateSectionLayoutField(layout.sectionId, 'zone', zone)
                      }
                      options={targetTemplate.zones
                        .filter((zone) => {
                          /** @brief 当前 section 的开放 kind / Open kind of the current section. */
                          const sectionKind = sectionKindById.get(layout.sectionId)
                          return (
                            sectionKind !== undefined &&
                            zone.acceptedSectionKinds.includes(sectionKind)
                          )
                        })
                        .map((zone) => zone.id)}
                      value={layout.zone}
                    />
                  </label>
                  <label className="aw-template-field aw-template-field--checkbox">
                    <input
                      aria-invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'keepTogether'
                      )}
                      checked={layout.keepTogether}
                      disabled={isWriteLocked}
                      onChange={(event): void =>
                        updateSectionLayoutField(
                          layout.sectionId,
                          'keepTogether',
                          event.currentTarget.checked
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {t('template.sectionKeepTogetherFor', {
                        sectionId: layout.sectionId
                      })}
                    </span>
                  </label>
                  <label className="aw-template-field aw-template-field--checkbox">
                    <input
                      aria-invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'pageBreakBefore'
                      )}
                      checked={layout.pageBreakBefore}
                      disabled={isWriteLocked}
                      onChange={(event): void =>
                        updateSectionLayoutField(
                          layout.sectionId,
                          'pageBreakBefore',
                          event.currentTarget.checked
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {t('template.sectionPageBreakBeforeFor', {
                        sectionId: layout.sectionId
                      })}
                    </span>
                  </label>
                  <label className="aw-template-field aw-template-field--checkbox">
                    <input
                      aria-invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'headingStyleToken'
                      )}
                      checked={layout.headingStyleToken !== null}
                      disabled={isWriteLocked}
                      onChange={(event): void =>
                        updateSectionLayoutField(
                          layout.sectionId,
                          'headingStyleToken',
                          event.currentTarget.checked ? '' : null
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {t('template.sectionHeadingStyleEnabledFor', {
                        sectionId: layout.sectionId
                      })}
                    </span>
                  </label>
                  <label className="aw-template-field">
                    <span>
                      {t('template.sectionCompactnessFor', {
                        sectionId: layout.sectionId
                      })}
                    </span>
                    <input
                      aria-invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'compactness'
                      )}
                      aria-label={t('template.sectionCompactnessFor', {
                        sectionId: layout.sectionId
                      })}
                      className="aw-text-input"
                      disabled={isWriteLocked}
                      max="1"
                      min="0"
                      onChange={(event): void => {
                        /** @brief 浏览器解析的 section compactness / Section compactness parsed by the browser. */
                        const compactness = event.currentTarget.valueAsNumber
                        if (Number.isFinite(compactness)) {
                          updateSectionLayoutField(layout.sectionId, 'compactness', compactness)
                        }
                      }}
                      step="0.05"
                      type="number"
                      value={layout.compactness}
                    />
                  </label>
                  <label className="aw-template-field">
                    <span>
                      {t('template.sectionHeadingStyleFor', {
                        sectionId: layout.sectionId
                      })}
                    </span>
                    <input
                      aria-invalid={hasCompatibilityIssue(
                        'styleIntent',
                        'sectionLayout',
                        layout.sectionId,
                        'headingStyleToken'
                      )}
                      aria-label={t('template.sectionHeadingStyleFor', {
                        sectionId: layout.sectionId
                      })}
                      className="aw-text-input"
                      disabled={isWriteLocked || layout.headingStyleToken === null}
                      maxLength={120}
                      onChange={(event): void =>
                        updateSectionLayoutField(
                          layout.sectionId,
                          'headingStyleToken',
                          event.currentTarget.value
                        )
                      }
                      type="text"
                      value={layout.headingStyleToken ?? ''}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      ) : null}

      <section className="aw-card aw-settings-card aw-template-style-panel">
        <div>
          <h2 className="aw-card-title">
            {t('template.customSettingsTitle', { defaultValue: '模板专属设置' })}
          </h2>
          <p className="aw-card-description">
            {t('template.customSettingsDescription', {
              defaultValue: '默认值仅用于显示；隐藏值保留在本地草稿，但不会提交。'
            })}
          </p>
        </div>
        {settingGroups.length === 0 ? (
          <p className="aw-muted-copy">
            {t('template.noCustomSettings', { defaultValue: '此模板没有额外设置。' })}
          </p>
        ) : null}
        {settingGroups.map((group, groupIndex) => (
          <fieldset className="aw-template-setting-group" key={group.key ?? `group-${groupIndex}`}>
            <legend>
              {group.key === null
                ? t('template.ungroupedSettings', { defaultValue: '模板设置' })
                : t(group.key, { defaultValue: group.key })}
            </legend>
            {group.definitions.map((definition) => {
              /** @brief 默认投影或当前显式值 / Default projection or current explicit value. */
              const value = getEffectiveTemplateSettingValue(
                definition,
                unprojectedStyle.templateSettings
              )
              /** @brief 当前 setting 是否存在显式值 / Whether this setting currently has an explicit value. */
              const explicit = Object.hasOwn(unprojectedStyle.templateSettings, definition.key)
              return (
                <div className="aw-setting-row" key={definition.key}>
                  <div>
                    <p className="aw-setting-label">
                      {t(definition.labelKey, { defaultValue: definition.labelKey })}
                    </p>
                    {definition.descriptionKey === null ? null : (
                      <p className="aw-setting-help">
                        {t(definition.descriptionKey, { defaultValue: definition.descriptionKey })}
                      </p>
                    )}
                  </div>
                  <div className="aw-template-setting-action">
                    <TemplateSettingControl
                      definition={definition}
                      disabled={isWriteLocked}
                      onChange={(next): void => updateSetting(definition, next)}
                      value={value}
                    />
                    {explicit ? (
                      <button
                        aria-label={t('template.restoreSettingDefault', {
                          defaultValue: '恢复 {{label}} 的默认值',
                          label: t(definition.labelKey, { defaultValue: definition.labelKey })
                        })}
                        className="aw-icon-button"
                        disabled={isWriteLocked}
                        onClick={(): void => restoreSettingDefault(definition)}
                        title={t('template.restoreDefault', { defaultValue: '恢复默认值' })}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </fieldset>
        ))}
      </section>

      {missingSectionDraftIds.length > 0 ? (
        <div className="aw-inline-error" role="alert">
          <strong>{t('template.missingSectionDraftTitle')}</strong>{' '}
          <span>
            {t('template.missingSectionDraftDescription', {
              sectionIds: missingSectionDraftIds.join(', ')
            })}
          </span>
        </div>
      ) : null}
      {compatibilityIssues.length > 0 ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('template.unsupportedStyleTitle', { defaultValue: '当前样式无法安全应用' })}
          </strong>{' '}
          <span>
            {t('template.unsupportedStyleDescription', {
              defaultValue: '请修正不满足 API v2 或目标模板约束的值；系统不会替你猜测。'
            })}
          </span>
        </div>
      ) : null}
      {settingPolicyError !== null ? (
        <div className="aw-inline-error" role="alert">
          <strong>
            {t('template.settingPolicyErrorTitle', { defaultValue: '模板设置无法安全应用' })}
          </strong>{' '}
          <span>
            {t('template.settingPolicyErrorDescription', {
              defaultValue: '设置 {{key}} 与目标 manifest 不一致，请恢复默认值或重新选择模板。',
              key: settingPolicyError.settingKey
            })}
          </span>
        </div>
      ) : null}

      {recovery === null ? null : (
        <div className="aw-inline-error aw-template-recovery" role="alert">
          <div>
            <strong>
              {recovery.kind === 'outcome-unknown'
                ? t('template.outcomeUnknownTitle', { defaultValue: '应用结果待确认' })
                : recovery.kind === 'rejected'
                  ? t('template.operationRejectedTitle', { defaultValue: '服务端未应用这次修改' })
                  : t('template.authorityRequiredTitle', { defaultValue: '需要读取服务器版本' })}
            </strong>
            <p>
              {recovery.kind === 'outcome-unknown'
                ? t('template.outcomeUnknownDescription', {
                    defaultValue: '可以原样确认同一命令，或放弃旧命令标识并读取权威版本。'
                  })
                : recovery.kind === 'rejected'
                  ? t('template.operationRejectedDescription', {
                      defaultValue: '已吸收响应中的最新权威，并保留字段级草稿供你检查。'
                    })
                  : t(`template.authorityReason.${recovery.reason}`, {
                      defaultValue: '必须读取最新权威后，才能创建新的应用命令。'
                    })}
            </p>
          </div>
          <button
            className="aw-quiet-button"
            disabled={
              recovery.kind === 'outcome-unknown'
                ? saveStatus === 'saving' || isConfirmationCoolingDown
                : recovery.kind !== 'rejected' && isReloadingAuthority
            }
            onClick={(): void => {
              if (recovery.kind === 'outcome-unknown') confirmUnknownCommand()
              else if (recovery.kind === 'rejected') setRecovery(null)
              else void reloadAuthority()
            }}
            type="button"
          >
            {recovery.kind === 'outcome-unknown'
              ? isConfirmationCoolingDown
                ? t('template.waitingToConfirm', { defaultValue: '等待服务端允许确认…' })
                : t('template.confirmCommand', { defaultValue: '确认上次应用结果' })
              : recovery.kind === 'rejected'
                ? t('template.reviewDraft', { defaultValue: '检查保留的草稿' })
                : isReloadingAuthority
                  ? t('resume.workspace.reloadingAuthority')
                  : t('resume.workspace.reloadAuthority')}
          </button>
          {recovery.kind === 'outcome-unknown' ? (
            <button
              className="aw-quiet-button"
              disabled={saveStatus === 'saving' || isReloadingAuthority}
              onClick={abandonConfirmationAndReload}
              type="button"
            >
              {t('template.abandonAndReload', { defaultValue: '放弃确认并读取服务器版本' })}
            </button>
          ) : null}
          {recoveryError !== null ? (
            <span>
              <strong>
                {t('template.recoveryFailed', { defaultValue: '恢复操作尚未完成。' })}
              </strong>{' '}
              <ResourceFailureMessage error={recoveryError} />
            </span>
          ) : null}
        </div>
      )}

      {saveError !== null && recovery === null ? (
        <ResourceErrorState
          error={saveError}
          onRetry={applyTemplateAndStyle}
          title={t('template.saveFailed', { defaultValue: '无法应用模板与样式' })}
        />
      ) : null}

      <section className="aw-card aw-template-apply-bar">
        <div>
          <strong>
            {hasAnyUnsavedIntent
              ? hasDormantDrafts && !activeTargetDirty
                ? t('template.dormantUnsavedChanges', {
                    defaultValue: '其他模板版本仍有尚未应用的本地草稿'
                  })
                : t('template.unsavedChanges', {
                    defaultValue: '有尚未应用的模板或样式修改'
                  })
              : t('template.noUnsavedChanges', { defaultValue: '模板与样式已与服务器一致' })}
          </strong>
          <p className="aw-card-description">
            {t('template.explicitApplyNotice', {
              defaultValue: '此页是模板与样式唯一的显式写入口。'
            })}
          </p>
        </div>
        <button
          className="aw-primary-button"
          disabled={!canApply}
          onClick={applyTemplateAndStyle}
          type="button"
        >
          {saveStatus === 'saving'
            ? t('template.saving', { defaultValue: '正在应用…' })
            : t('template.apply', { defaultValue: '应用模板与样式' })}
        </button>
        {saveStatus === 'saved' ? (
          <span aria-live="polite" className="aw-status aw-status--ready" role="status">
            <Check aria-hidden="true" size={12} />
            {t('template.saved', { defaultValue: '模板与样式已应用。' })}
          </span>
        ) : null}
      </section>
    </div>
  )
}

/**
 * @brief 模板设置路由页 / Template-settings route page.
 * @return pinned exact manifest 就绪后立即呈现、目录后台渐进加载的页面 / Page rendered as soon as the exact pinned manifest is ready while the catalog loads progressively.
 */
export function TemplateSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  /** @brief 路由 Resume identity / Resume identity from the route. */
  const { resumeId } = useParams()
  /** @brief Resume command/query gateway / Resume command/query gateway. */
  const resume = useResumeGateway()
  /** @brief 全局公开 Template 目录 / Global public Template catalog. */
  const templateCatalog = useResumeTemplateCatalog()
  /** @brief 当前显式 Workspace session / Current explicit Workspace session. */
  const { getCurrentWorkspace } = useWorkspaceSession()
  /** @brief 名义化路由 Resume identity / Nominal route Resume identity. */
  const requestedResumeId = useMemo(() => asUiOpaqueId<'resume'>(resumeId ?? ''), [resumeId])
  /** @brief 先 Resume authority、再 exact pinned manifest 的加载器 / Loader reading Resume authority and then its exact pinned manifest. */
  const loadTemplateSettings = useCallback(
    async (signal: AbortSignal): Promise<UiTemplateSettingsModel> => {
      signal.throwIfAborted()
      if (resumeId === undefined) throw new Error('A Resume identifier is required.')
      /** @brief 当前显式 Workspace / Current explicit Workspace. */
      const workspace = await getCurrentWorkspace()
      signal.throwIfAborted()
      if (workspace === undefined) throw new Error('A Workspace selection is required.')
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
  /** @brief pinned-first 页面资源 / Pinned-first page resource. */
  const settings = useAsyncResource(
    'resume.template_settings',
    loadTemplateSettings,
    requestedResumeId
  )

  if (settings.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingTemplateSettings')} />
      </div>
    )
  }
  if (settings.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={settings.error}
          onRetry={settings.retry}
          title={t('status.errorTemplateSettings')}
        />
      </div>
    )
  }
  /** @brief 草稿只属于精确 Resume 和初始 pinned 身份 / Drafts belong only to the exact Resume and initial pinned identity. */
  const contentIdentity = JSON.stringify([
    settings.data.resumeId,
    getTemplateIdentity(settings.data.selectedTemplate)
  ])
  return (
    <TemplateSettingsContent
      catalog={templateCatalog}
      gateway={resume}
      key={contentIdentity}
      model={settings.data}
    />
  )
}
