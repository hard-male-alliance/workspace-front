/** @file 模板页面的字段级本地草稿 / Field-level local drafts for the Template page. */

import type {
  UiJsonValue,
  UiPageInsets,
  UiPaletteIntent,
  UiResumePageIntent,
  UiResumeSectionId,
  UiResumeStyleIntent,
  UiSectionLayoutIntent,
  UiTypographyIntent
} from '../domain/document'
import { cloneUiJsonValue, uiJsonValuesEqual } from '../../../shared-kernel/json'

/** @brief 一个显式 Template setting 的草稿动作 / Draft action for one explicit Template setting. */
export type TemplateSettingDraftChange =
  | {
      /** @brief 显式保存该值 / Explicitly persist this value. */
      readonly kind: 'set'
      /** @brief 已由 manifest 控件约束的 JSON 值 / JSON value constrained by a manifest control. */
      readonly value: UiJsonValue
    }
  | {
      /** @brief 删除显式值并恢复 manifest default 投影 / Remove the explicit value and restore the manifest-default projection. */
      readonly kind: 'remove'
    }

/**
 * @brief 页面意图的字段级补丁 / Field-level patch for page intent.
 * @note margins 继续按边独立保存，避免修改 top 时冻结其他三边。 / Margins remain isolated by edge so editing top never freezes the other three edges.
 */
export type TemplatePageDraftPatch = Partial<Omit<UiResumePageIntent, 'margins'>> & {
  /** @brief 四向边距的按边补丁 / Edge-isolated margin patch. */
  readonly margins?: Partial<UiPageInsets>
}

/** @brief 字体意图的字段级补丁 / Field-level patch for typography intent. */
export type TemplateTypographyDraftPatch = Partial<UiTypographyIntent>

/** @brief 色板意图的字段级补丁 / Field-level patch for palette intent. */
export type TemplatePaletteDraftPatch = Partial<UiPaletteIntent>

/**
 * @brief 单个 section layout 的字段级补丁 / Field-level patch for one section layout.
 * @note sectionId 只作为外层稳定 key，不能被草稿叶字段改写。 / sectionId is only the stable outer key and cannot be rewritten by a draft leaf.
 */
export type TemplateSectionLayoutDraftPatch = Partial<Omit<UiSectionLayoutIntent, 'sectionId'>>

/** @brief 按 sectionId 隔离的 layout 稀疏补丁 / Sparse layout patches isolated by sectionId. */
export type TemplateSectionLayoutDraftPatches = Readonly<
  Record<string, TemplateSectionLayoutDraftPatch>
>

/**
 * @brief 一个不可变模板版本独享的稀疏样式草稿 / Sparse style draft owned by one immutable Template version.
 * @note 未出现的字段总是从最新服务端权威读取，避免权威恢复后用旧全量快照覆盖未编辑字段。 / Missing fields always come from latest server authority, preventing a stale full snapshot from overwriting unedited fields after authority recovery.
 */
export interface TemplateStyleDraftPatch {
  /** @brief 页面字段补丁 / Page-field patch. */
  readonly page?: TemplatePageDraftPatch
  /** @brief 字体字段补丁 / Typography-field patch. */
  readonly typography?: TemplateTypographyDraftPatch
  /** @brief 色板字段补丁 / Palette-field patch. */
  readonly palette?: TemplatePaletteDraftPatch
  /** @brief 整体密度补丁 / Overall-density patch. */
  readonly density?: number
  /** @brief 日期格式 token 补丁 / Date-format token patch. */
  readonly dateFormatToken?: string
  /** @brief 项目符号 token 补丁 / Bullet-style token patch. */
  readonly bulletStyleToken?: string
  /** @brief 按 sectionId 与叶字段保存的区段版式补丁 / Section-layout patches stored by sectionId and leaf field. */
  readonly sectionLayoutBySectionId?: TemplateSectionLayoutDraftPatches
  /** @brief 模板设置的显式 set/remove 动作 / Explicit set/remove actions for Template settings. */
  readonly templateSettings?: Readonly<Record<string, TemplateSettingDraftChange>>
}

/**
 * @brief 把 setting 动作叠加到目标模板的显式稀疏设置 / Apply setting actions to sparse explicit settings for the target Template.
 * @param baseSettings 最新权威设置；切换到其他模板时必须传空对象 / Latest authoritative settings, or an empty object when switching to another Template.
 * @param changes 目标模板版本独享的 setting 动作 / Setting actions owned by the target Template version.
 * @return 保留 dormant 值、尚未进行可见性过滤的独立草稿 / Independent draft retaining dormant values before visibility filtering.
 */
export function applyTemplateSettingDraft(
  baseSettings: Readonly<Record<string, UiJsonValue>>,
  changes: Readonly<Record<string, TemplateSettingDraftChange>> = {}
): Readonly<Record<string, UiJsonValue>> {
  /** @brief 不与权威对象共享引用的可变投影 / Mutable projection sharing no object with authority. */
  const next = cloneUiJsonValue(baseSettings) as Record<string, UiJsonValue>
  for (const [key, change] of Object.entries(changes)) {
    if (change.kind === 'remove') {
      delete next[key]
    } else {
      next[key] = cloneUiJsonValue(change.value)
    }
  }
  return next
}

/**
 * @brief 将目标模板的稀疏字段补丁合并到最新权威样式 / Merge a target-Template sparse patch onto latest authoritative style.
 * @param authority 最新服务端权威样式 / Latest server-authoritative style.
 * @param patch 目标模板版本独享的稀疏补丁 / Sparse patch owned by the target Template version.
 * @param targetIsAuthoritative 目标是否为权威当前固定模板 / Whether the target is the currently authoritative pinned Template.
 * @return 保留未编辑权威字段的完整样式命令值 / Complete style command value preserving unedited authoritative fields.
 */
export function applyTemplateStyleDraft(
  authority: UiResumeStyleIntent,
  patch: TemplateStyleDraftPatch,
  targetIsAuthoritative: boolean
): UiResumeStyleIntent {
  /** @brief 不含嵌套 margins 的页面叶字段 / Page leaves excluding nested margins. */
  const { margins, ...page } = patch.page ?? {}
  return {
    ...authority,
    ...(patch.bulletStyleToken === undefined ? {} : { bulletStyleToken: patch.bulletStyleToken }),
    ...(patch.dateFormatToken === undefined ? {} : { dateFormatToken: patch.dateFormatToken }),
    ...(patch.density === undefined ? {} : { density: patch.density }),
    page: {
      ...authority.page,
      ...page,
      margins: { ...authority.page.margins, ...margins }
    },
    palette: { ...authority.palette, ...patch.palette },
    sectionLayout: authority.sectionLayout.map((layout) => ({
      ...layout,
      ...patch.sectionLayoutBySectionId?.[layout.sectionId]
    })),
    templateSettings: applyTemplateSettingDraft(
      targetIsAuthoritative ? authority.templateSettings : {},
      patch.templateSettings
    ),
    typography: { ...authority.typography, ...patch.typography }
  }
}

/**
 * @brief 找出已失去权威 section 的本地 layout 补丁 / Find local layout patches whose authoritative section disappeared.
 * @param authority 最新服务端权威样式 / Latest server-authoritative style.
 * @param patch 当前模板版本的本地补丁 / Local patch for the current Template version.
 * @return 不能安全重放的 section IDs / Section IDs that cannot be replayed safely.
 * @note 调用方必须阻止提交；合并函数绝不会借草稿复活已删除 section。 / Callers must block submission; the merge function never resurrects a deleted section from a draft.
 */
export function getMissingTemplateSectionDraftIds(
  authority: UiResumeStyleIntent,
  patch: TemplateStyleDraftPatch
): readonly UiResumeSectionId[] {
  /** @brief 最新权威仍存在的 section IDs / Section IDs still present in latest authority. */
  const authoritativeIds = new Set(authority.sectionLayout.map((layout) => layout.sectionId))
  return Object.keys(patch.sectionLayoutBySectionId ?? {})
    .filter((sectionId) => !authoritativeIds.has(sectionId as UiResumeSectionId))
    .map((sectionId) => sectionId as UiResumeSectionId)
}

/**
 * @brief 冻结真正进入 command 的草稿叶字段 / Freeze only draft leaves that actually enter a command.
 * @param patch Apply 时的完整本地稀疏补丁 / Complete local sparse patch at Apply time.
 * @param confirmedSettingActionKeys 实际由 command 确认的 setting action keys；visible remove 也必须包含 / Setting-action keys actually confirmed by the command, including visible removes.
 * @return 可在命令确认后精确清理的补丁快照 / Patch snapshot safe to remove after exact command confirmation.
 * @note hidden setting 动作未进入信封，必须继续作为 dormant draft 保留。 / Hidden-setting actions do not enter the envelope and must remain as dormant drafts.
 */
export function createConfirmedTemplateStyleDraftPatch(
  patch: TemplateStyleDraftPatch,
  confirmedSettingActionKeys: ReadonlySet<string>
): TemplateStyleDraftPatch {
  /** @brief 与 React state 不共享引用的非 setting 字段快照 / Snapshot of non-setting fields sharing no references with React state. */
  const { templateSettings, ...styleFields } = cloneUiJsonValue(
    patch as unknown as UiJsonValue
  ) as unknown as TemplateStyleDraftPatch
  if (templateSettings === undefined) return styleFields
  /** @brief 实际进入 command 投影的 setting 动作 / Setting actions that actually entered the command projection. */
  const confirmedSettings = Object.fromEntries(
    Object.entries(templateSettings).filter(([key]) => confirmedSettingActionKeys.has(key))
  )
  return Object.keys(confirmedSettings).length === 0
    ? styleFields
    : { ...styleFields, templateSettings: confirmedSettings }
}

/**
 * @brief 判断一个模板版本是否存在任何显式本地补丁 / Determine whether a Template version owns any explicit local patch.
 * @param patch 候选稀疏补丁 / Candidate sparse patch.
 * @return 任一语义字段或 setting 被用户触及时为 true / True when the user touched any semantic field or setting.
 */
export function hasTemplateStyleDraftPatch(patch: TemplateStyleDraftPatch): boolean {
  return (
    (patch.page !== undefined && Object.keys(patch.page).length > 0) ||
    (patch.typography !== undefined && Object.keys(patch.typography).length > 0) ||
    (patch.palette !== undefined && Object.keys(patch.palette).length > 0) ||
    patch.density !== undefined ||
    patch.dateFormatToken !== undefined ||
    patch.bulletStyleToken !== undefined ||
    (patch.sectionLayoutBySectionId !== undefined &&
      Object.keys(patch.sectionLayoutBySectionId).length > 0) ||
    (patch.templateSettings !== undefined && Object.keys(patch.templateSettings).length > 0)
  )
}

/**
 * @brief 深比较两个仅含 JSON 值的草稿叶 / Deeply compare two draft leaves containing only JSON values.
 * @param left 左叶值 / Left leaf value.
 * @param right 右叶值 / Right leaf value.
 * @return JSON 结构与值均相同时为 true / True when JSON structure and values are equal.
 */
function templateDraftLeavesEqual(left: unknown, right: unknown): boolean {
  return uiJsonValuesEqual(left as UiJsonValue, right as UiJsonValue)
}

/**
 * @brief 设置一个稀疏叶；等于最新权威基线时删除该叶 / Set one sparse leaf, removing it when equal to latest authority baseline.
 * @param patch 当前同层稀疏对象 / Current sparse object at the same level.
 * @param field 目标叶字段 / Target leaf field.
 * @param value 用户最新值 / Latest user value.
 * @param baseline 最新权威基线值 / Latest authoritative baseline value.
 * @return 更新后的稀疏对象；无剩余叶时返回 undefined / Updated sparse object, or undefined when no leaves remain.
 */
export function setTemplateDraftLeaf<TObject extends object, TField extends keyof TObject>(
  patch: Partial<TObject> | undefined,
  field: TField,
  value: TObject[TField],
  baseline: TObject[TField]
): Partial<TObject> | undefined {
  /** @brief 不修改原对象的可变副本 / Mutable copy that leaves the original object untouched. */
  const next: Partial<TObject> = { ...patch }
  if (templateDraftLeavesEqual(value, baseline)) delete next[field]
  else {
    next[field] = cloneUiJsonValue(value as unknown as UiJsonValue) as TObject[TField]
  }
  return Object.keys(next).length === 0 ? undefined : next
}

/**
 * @brief 从一个稀疏对象删除已确认且仍相同的叶字段 / Remove confirmed leaves that are still equal from one sparse object.
 * @param current 当前本地稀疏对象 / Current local sparse object.
 * @param confirmed 冻结信封实际确认的稀疏对象 / Sparse object actually confirmed by the frozen envelope.
 * @return 仅保留未确认或确认后又变化的叶字段；空对象返回 undefined / Leaves not confirmed or changed after confirmation; undefined for an empty result.
 */
function subtractConfirmedLeaves<TObject extends object>(
  current: TObject | undefined,
  confirmed: TObject | undefined
): TObject | undefined {
  if (current === undefined) return undefined
  /** @brief 尚未被相同确认值覆盖的叶字段 / Leaves not covered by an equal confirmed value. */
  const remaining = Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) =>
        confirmed === undefined ||
        !Object.hasOwn(confirmed, key) ||
        !templateDraftLeavesEqual(value, (confirmed as Record<string, unknown>)[key])
    )
  )
  return Object.keys(remaining).length === 0 ? undefined : (remaining as TObject)
}

/**
 * @brief 从页面补丁递归删除已确认的 scalar 与 margin-edge 叶 / Recursively remove confirmed scalar and margin-edge leaves from a page patch.
 * @param current 当前页面补丁 / Current page patch.
 * @param confirmed command 已确认的页面补丁 / Page patch confirmed by the command.
 * @return 保留未确认叶的页面补丁；空结果返回 undefined / Page patch retaining unconfirmed leaves, or undefined when empty.
 */
function subtractConfirmedPage(
  current: TemplatePageDraftPatch | undefined,
  confirmed: TemplatePageDraftPatch | undefined
): TemplatePageDraftPatch | undefined {
  if (current === undefined) return undefined
  /** @brief 当前页面 scalar 叶 / Current page scalar leaves. */
  const { margins: currentMargins, ...currentPageLeaves } = current
  /** @brief 已确认页面 scalar 叶 / Confirmed page scalar leaves. */
  const { margins: confirmedMargins, ...confirmedPageLeaves } = confirmed ?? {}
  /** @brief 尚未确认的页面 scalar 叶 / Unconfirmed page scalar leaves. */
  const pageLeaves = subtractConfirmedLeaves(currentPageLeaves, confirmedPageLeaves)
  /** @brief 尚未确认的独立 margin edges / Unconfirmed isolated margin edges. */
  const margins = subtractConfirmedLeaves(currentMargins, confirmedMargins)
  if (pageLeaves === undefined && margins === undefined) return undefined
  return {
    ...pageLeaves,
    ...(margins === undefined ? {} : { margins })
  }
}

/**
 * @brief 从 sectionId/leaf 二级补丁删除已确认叶字段 / Remove confirmed leaves from a sectionId/leaf two-level patch.
 * @param current 当前 section layout 补丁 / Current section-layout patches.
 * @param confirmed 冻结信封实际确认的 section layout 补丁 / Section-layout patches actually confirmed by the frozen envelope.
 * @return 未确认的二级稀疏补丁；空结果返回 undefined / Unconfirmed two-level sparse patch, or undefined when empty.
 */
function subtractConfirmedSectionLayout(
  current: TemplateSectionLayoutDraftPatches | undefined,
  confirmed: TemplateSectionLayoutDraftPatches | undefined
): TemplateSectionLayoutDraftPatches | undefined {
  if (current === undefined) return undefined
  /** @brief 按 sectionId 保留的未确认叶字段 / Unconfirmed leaves retained by sectionId. */
  const remaining = Object.fromEntries(
    Object.entries(current).flatMap(([sectionId, sectionPatch]) => {
      /** @brief 当前 section 尚未确认的叶补丁 / Unconfirmed leaf patch for the current section. */
      const leaves = subtractConfirmedLeaves(sectionPatch, confirmed?.[sectionId])
      return leaves === undefined ? [] : [[sectionId, leaves]]
    })
  )
  return Object.keys(remaining).length === 0 ? undefined : remaining
}

/**
 * @brief 从当前草稿精确减去一个已确认 command 的叶字段 / Precisely subtract one confirmed command's leaves from the current draft.
 * @param current 当前目标模板草稿 / Current target-Template draft.
 * @param confirmed 冻结 command 实际携带并确认的草稿叶 / Draft leaves actually carried and confirmed by the frozen command.
 * @return 保留 hidden dormant 或确认后新变化叶字段的草稿 / Draft retaining hidden dormant or post-confirmation changes.
 */
function subtractConfirmedTemplateDraft(
  current: TemplateStyleDraftPatch,
  confirmed: TemplateStyleDraftPatch
): TemplateStyleDraftPatch {
  /** @brief 页面未确认叶字段 / Unconfirmed page leaves. */
  const page = subtractConfirmedPage(current.page, confirmed.page)
  /** @brief 字体未确认叶字段 / Unconfirmed typography leaves. */
  const typography = subtractConfirmedLeaves(current.typography, confirmed.typography)
  /** @brief 色板未确认叶字段 / Unconfirmed palette leaves. */
  const palette = subtractConfirmedLeaves(current.palette, confirmed.palette)
  /** @brief 区段版式未确认叶字段 / Unconfirmed section-layout leaves. */
  const sectionLayoutBySectionId = subtractConfirmedSectionLayout(
    current.sectionLayoutBySectionId,
    confirmed.sectionLayoutBySectionId
  )
  /** @brief Template setting 未确认动作 / Unconfirmed Template-setting actions. */
  const templateSettings = subtractConfirmedLeaves(
    current.templateSettings,
    confirmed.templateSettings
  )
  return {
    ...(current.density === undefined ||
    (confirmed.density !== undefined &&
      templateDraftLeavesEqual(current.density, confirmed.density))
      ? {}
      : { density: current.density }),
    ...(current.dateFormatToken === undefined ||
    (confirmed.dateFormatToken !== undefined &&
      templateDraftLeavesEqual(current.dateFormatToken, confirmed.dateFormatToken))
      ? {}
      : { dateFormatToken: current.dateFormatToken }),
    ...(current.bulletStyleToken === undefined ||
    (confirmed.bulletStyleToken !== undefined &&
      templateDraftLeavesEqual(current.bulletStyleToken, confirmed.bulletStyleToken))
      ? {}
      : { bulletStyleToken: current.bulletStyleToken }),
    ...(page === undefined ? {} : { page }),
    ...(typography === undefined ? {} : { typography }),
    ...(palette === undefined ? {} : { palette }),
    ...(sectionLayoutBySectionId === undefined ? {} : { sectionLayoutBySectionId }),
    ...(templateSettings === undefined ? {} : { templateSettings })
  }
}

/**
 * @brief 删除已被服务端确认且仍相同的模板草稿叶字段 / Remove Template-draft leaves confirmed by the service and still equal.
 * @param drafts 全部模板版本的草稿 map / Draft map for every Template version.
 * @param templateIdentity 已确认模板的复合身份 / Composite identity of the confirmed Template.
 * @param confirmedPatch 冻结 command 实际确认的叶字段 / Leaves actually confirmed by the frozen command.
 * @return 保留 dormant 与确认后变化字段的新 map / New map retaining dormant and post-confirmation changes.
 */
export function discardConfirmedTemplateDraft(
  drafts: ReadonlyMap<string, TemplateStyleDraftPatch>,
  templateIdentity: string,
  confirmedPatch: TemplateStyleDraftPatch
): ReadonlyMap<string, TemplateStyleDraftPatch> {
  /** @brief 可安全变更的新 map / Safely mutable new map. */
  const next = new Map(drafts)
  /** @brief 当前模板版本仍可能含 hidden dormant 动作 / Current Template version may still contain hidden dormant actions. */
  const current = next.get(templateIdentity)
  if (current === undefined) return next
  /** @brief 精确减去 command 叶字段后的剩余草稿 / Remaining draft after exact command-leaf subtraction. */
  const remaining = subtractConfirmedTemplateDraft(current, confirmedPatch)
  if (hasTemplateStyleDraftPatch(remaining)) next.set(templateIdentity, remaining)
  else next.delete(templateIdentity)
  return next
}
