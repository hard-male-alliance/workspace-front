/** @file InterviewScenario API v2 wire 模型与严格 codec / InterviewScenario API v2 wire models and strict codecs. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  finiteNumber,
  jsonObject,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  patternedString,
  type CursorCollection,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { assertUniqueBy, assertUniqueStrings, parseInterviewLocale, parseStringArray } from './wire'

/** @brief Interview 类型 code 的冻结格式 / Frozen format for Interview-type codes. */
const INTERVIEW_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{2,100}$/u

/** @brief 浮点权重求和可接受的机器舍入误差 / Machine-rounding tolerance for floating-point weight sums. */
const WEIGHT_SUM_TOLERANCE = Number.EPSILON * 256

/** @brief Interview 难度 / Interview difficulty. */
export type InterviewDifficulty = 'adaptive' | 'advanced' | 'intermediate' | 'introductory'

/** @brief InterviewScenario 生命周期状态 / InterviewScenario lifecycle status. */
export type InterviewScenarioStatus = 'active' | 'archived' | 'draft'

/** @brief Rubric 分数范围 / Rubric score range. */
export interface ScoreScale {
  /** @brief 最小分 / Minimum score. */
  readonly minimum: number
  /** @brief 最大分 / Maximum score. */
  readonly maximum: number
  /** @brief 可选分数标签 / Optional score labels. */
  readonly labels?: Readonly<Record<string, string>>
}

/** @brief Rubric 的一个评分维度 / One scoring dimension in a rubric. */
export interface RubricDimension {
  /** @brief 稳定维度 identity / Stable dimension identity. */
  readonly dimension_id: string
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 评分说明 / Scoring description. */
  readonly description: string
  /** @brief 正权重 / Positive weight. */
  readonly weight: number
  /** @brief 可观察指标 / Observable indicators. */
  readonly observable_indicators: readonly string[]
  /** @brief 维度评分范围 / Dimension score range. */
  readonly scoring_scale: ScoreScale
}

/** @brief 创建 Scenario 时冻结的 Interview rubric / Interview rubric frozen when a Scenario is created. */
export interface InterviewRubric {
  /** @brief Rubric identity / Rubric identity. */
  readonly rubric_id: string
  /** @brief 不可变 rubric 版本 / Immutable rubric version. */
  readonly rubric_version: string
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 评分维度 / Scoring dimensions. */
  readonly dimensions: readonly RubricDimension[]
  /** @brief 总分范围 / Overall score range. */
  readonly overall_scale: ScoreScale
}

/** @brief InterviewScenario 的可创建字段 / Creatable fields of an InterviewScenario. */
export interface InterviewScenarioInput {
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 场景说明 / Scenario description. */
  readonly description: string
  /** @brief 面试 Locale / Interview Locale. */
  readonly locale: string
  /** @brief 开放但格式稳定的面试类型 / Open but format-stable Interview type. */
  readonly interview_type: string
  /** @brief 难度 / Difficulty. */
  readonly difficulty: InterviewDifficulty
  /** @brief 目标时长分钟数 / Target duration in minutes. */
  readonly duration_minutes: number
  /** @brief 目标问题数 / Target question count. */
  readonly target_question_count: number
  /** @brief 不重复的重点领域 / Unique focus areas. */
  readonly focus_areas: readonly string[]
  /** @brief 是否允许追问 / Whether follow-up questions are allowed. */
  readonly allow_followups: boolean
  /** @brief 是否允许用户打断 / Whether user barge-in is allowed. */
  readonly allow_barge_in: boolean
  /** @brief 冻结评分规则 / Frozen rubric. */
  readonly rubric: InterviewRubric
}

/** @brief API v2 InterviewScenario 权威表示 / Authoritative API v2 InterviewScenario representation. */
export interface InterviewScenario extends ResourceFields, InterviewScenarioInput {
  /** @brief 所属 Workspace identity / Owning Workspace identity. */
  readonly workspace_id: string
  /** @brief 生命周期状态 / Lifecycle status. */
  readonly status: InterviewScenarioStatus
}

/** @brief 创建 InterviewScenario 请求 / Request to create an InterviewScenario. */
export type CreateInterviewScenarioRequest = InterviewScenarioInput

/** @brief InterviewScenario 非空 merge patch / Non-empty InterviewScenario merge patch. */
export interface UpdateInterviewScenarioRequest {
  /** @brief 可选名称替换 / Optional name replacement. */
  readonly name?: string
  /** @brief 可选说明替换 / Optional description replacement. */
  readonly description?: string
  /** @brief 可选 Locale 替换 / Optional Locale replacement. */
  readonly locale?: string
  /** @brief 可选类型替换 / Optional type replacement. */
  readonly interview_type?: string
  /** @brief 可选难度替换 / Optional difficulty replacement. */
  readonly difficulty?: InterviewDifficulty
  /** @brief 可选时长替换 / Optional duration replacement. */
  readonly duration_minutes?: number
  /** @brief 可选问题数替换 / Optional question-count replacement. */
  readonly target_question_count?: number
  /** @brief 可选重点领域替换 / Optional focus-area replacement. */
  readonly focus_areas?: readonly string[]
  /** @brief 可选追问设置替换 / Optional follow-up replacement. */
  readonly allow_followups?: boolean
  /** @brief 可选打断设置替换 / Optional barge-in replacement. */
  readonly allow_barge_in?: boolean
  /** @brief 可选完整 rubric 替换 / Optional complete rubric replacement. */
  readonly rubric?: InterviewRubric
  /** @brief 可选状态迁移 / Optional status transition. */
  readonly status?: InterviewScenarioStatus
}

/**
 * @brief 解码可选 ScoreScale labels / Decode optional ScoreScale labels.
 * @param value 未知 labels / Unknown labels.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证字符串 map / Validated string map.
 */
function parseScoreLabels(value: unknown, path: string): Readonly<Record<string, string>> {
  /** @brief 严格 JSON map / Strict JSON map. */
  const input = jsonObject(value, path)
  /** @brief 标签 keys / Label keys. */
  const keys = Object.keys(input)
  if (keys.length > 20) {
    throw new ApiV2ContractError(`API v2 field ${path} must contain at most 20 properties.`)
  }
  /** @brief 已验证标签 map / Validated label map. */
  const labels: Record<string, string> = Object.create(null) as Record<string, string>
  for (const key of keys) {
    Object.defineProperty(labels, key, {
      configurable: true,
      enumerable: true,
      value: boundedString(input[key], `${path}.${key}`, 0, 200),
      writable: true
    })
  }
  return labels
}

/**
 * @brief 严格解码 ScoreScale 并校验非空区间 / Strictly decode a ScoreScale and validate a non-empty interval.
 * @param value 未知范围 / Unknown scale.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证范围 / Validated scale.
 */
export function parseScoreScale(value: unknown, path: string): ScoreScale {
  /** @brief 精确范围对象 / Exact scale object. */
  const input = exactRecord(value, path, ['minimum', 'maximum', 'labels'])
  /** @brief 最小分 / Minimum score. */
  const minimum = finiteNumber(input.minimum, `${path}.minimum`)
  /** @brief 最大分 / Maximum score. */
  const maximum = finiteNumber(input.maximum, `${path}.maximum`)
  if (minimum >= maximum) {
    throw new ApiV2ContractError(`API v2 field ${path}.minimum must be lower than ${path}.maximum.`)
  }
  /** @brief 必需范围字段 / Required scale fields. */
  const required = { maximum, minimum }
  return Object.hasOwn(input, 'labels')
    ? { ...required, labels: parseScoreLabels(input.labels, `${path}.labels`) }
    : required
}

/**
 * @brief 严格解码 RubricDimension / Strictly decode a RubricDimension.
 * @param value 未知维度 / Unknown dimension.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证维度 / Validated dimension.
 */
function parseRubricDimension(value: unknown, path: string): RubricDimension {
  /** @brief 精确维度对象 / Exact dimension object. */
  const input = exactRecord(value, path, [
    'dimension_id',
    'name',
    'description',
    'weight',
    'observable_indicators',
    'scoring_scale'
  ])
  /** @brief 有限权重 / Finite weight. */
  const weight = finiteNumber(input.weight, `${path}.weight`)
  if (weight <= 0 || weight > 1) {
    throw new ApiV2ContractError(
      `API v2 field ${path}.weight must be greater than zero and no greater than one.`
    )
  }
  return {
    description: boundedString(input.description, `${path}.description`, 1, 4000),
    dimension_id: opaqueId(input.dimension_id, `${path}.dimension_id`),
    name: boundedString(input.name, `${path}.name`, 1, 200),
    observable_indicators: parseStringArray(
      input.observable_indicators,
      `${path}.observable_indicators`,
      0,
      50,
      1,
      1000,
      false
    ),
    scoring_scale: parseScoreScale(input.scoring_scale, `${path}.scoring_scale`),
    weight
  }
}

/**
 * @brief 严格解码 InterviewRubric 及维度不变量 / Strictly decode an InterviewRubric and dimension invariants.
 * @param value 未知 rubric / Unknown rubric.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 rubric / Validated rubric.
 */
export function parseInterviewRubric(value: unknown, path = 'interview_rubric'): InterviewRubric {
  /** @brief 精确 rubric 对象 / Exact rubric object. */
  const input = exactRecord(value, path, [
    'rubric_id',
    'rubric_version',
    'name',
    'dimensions',
    'overall_scale'
  ])
  /** @brief 已解码维度 / Decoded dimensions. */
  const dimensions = arrayBetween(input.dimensions, `${path}.dimensions`, 1, 50).map(
    (item, index) => parseRubricDimension(item, `${path}.dimensions[${index}]`)
  )
  assertUniqueBy(dimensions, (dimension) => dimension.dimension_id, `${path}.dimensions`)
  /** @brief 维度权重总和 / Sum of dimension weights. */
  const weightSum = dimensions.reduce((total, dimension) => total + dimension.weight, 0)
  if (Math.abs(weightSum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new ApiV2ContractError(`API v2 field ${path}.dimensions weights must sum to one.`)
  }
  return {
    dimensions,
    name: boundedString(input.name, `${path}.name`, 1, 200),
    overall_scale: parseScoreScale(input.overall_scale, `${path}.overall_scale`),
    rubric_id: opaqueId(input.rubric_id, `${path}.rubric_id`),
    rubric_version: boundedString(input.rubric_version, `${path}.rubric_version`, 1, 80)
  }
}

/**
 * @brief 严格解码 Scenario 可创建字段 / Strictly decode creatable Scenario fields.
 * @param input 已确认对象 / Confirmed object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证字段 / Validated fields.
 */
function parseInterviewScenarioFields(
  input: Readonly<Record<string, unknown>>,
  path: string
): InterviewScenarioInput {
  /** @brief 已解码重点领域 / Decoded focus areas. */
  const focusAreas = parseStringArray(input.focus_areas, `${path}.focus_areas`, 0, 50, 1, 200, true)
  assertUniqueStrings(focusAreas, `${path}.focus_areas`)
  return {
    allow_barge_in: booleanValue(input.allow_barge_in, `${path}.allow_barge_in`),
    allow_followups: booleanValue(input.allow_followups, `${path}.allow_followups`),
    description: boundedString(input.description, `${path}.description`, 0, 4000),
    difficulty: closedStringEnum(input.difficulty, `${path}.difficulty`, [
      'introductory',
      'intermediate',
      'advanced',
      'adaptive'
    ]),
    duration_minutes: boundedInteger(input.duration_minutes, `${path}.duration_minutes`, 5, 240),
    focus_areas: focusAreas,
    interview_type: patternedString(
      input.interview_type,
      `${path}.interview_type`,
      3,
      101,
      INTERVIEW_TYPE_PATTERN
    ),
    locale: parseInterviewLocale(input.locale, `${path}.locale`),
    name: boundedString(input.name, `${path}.name`, 1, 200),
    rubric: parseInterviewRubric(input.rubric, `${path}.rubric`),
    target_question_count: boundedInteger(
      input.target_question_count,
      `${path}.target_question_count`,
      1,
      100
    )
  }
}

/**
 * @brief 严格编码 CreateInterviewScenarioRequest / Strictly encode a CreateInterviewScenarioRequest.
 * @param value 未验证请求 / Unvalidated request.
 * @return canonical 请求快照 / Canonical request snapshot.
 */
export function encodeCreateInterviewScenarioRequest(
  value: CreateInterviewScenarioRequest
): CreateInterviewScenarioRequest {
  /** @brief 精确创建对象 / Exact creation object. */
  const input = exactRecord(value, 'create_interview_scenario', [
    'name',
    'description',
    'locale',
    'interview_type',
    'difficulty',
    'duration_minutes',
    'target_question_count',
    'focus_areas',
    'allow_followups',
    'allow_barge_in',
    'rubric'
  ])
  return parseInterviewScenarioFields(input, 'create_interview_scenario')
}

/**
 * @brief 严格编码非空 Scenario merge patch / Strictly encode a non-empty Scenario merge patch.
 * @param value 未验证 patch / Unvalidated patch.
 * @return 仅含 canonical 字段并保留省略语义的 patch / Patch containing only canonical fields while preserving omission.
 */
export function encodeUpdateInterviewScenarioRequest(
  value: UpdateInterviewScenarioRequest
): UpdateInterviewScenarioRequest {
  /** @brief 精确 patch 对象 / Exact patch object. */
  const input = exactRecord(value, 'update_interview_scenario', [
    'name',
    'description',
    'locale',
    'interview_type',
    'difficulty',
    'duration_minutes',
    'target_question_count',
    'focus_areas',
    'allow_followups',
    'allow_barge_in',
    'rubric',
    'status'
  ])
  if (Object.keys(input).length === 0) {
    throw new ApiV2ContractError(
      'API v2 field update_interview_scenario must contain at least one property.'
    )
  }
  /** @brief 已验证 patch / Validated patch. */
  const patch: {
    name?: string
    description?: string
    locale?: string
    interview_type?: string
    difficulty?: InterviewDifficulty
    duration_minutes?: number
    target_question_count?: number
    focus_areas?: readonly string[]
    allow_followups?: boolean
    allow_barge_in?: boolean
    rubric?: InterviewRubric
    status?: InterviewScenarioStatus
  } = {}
  if (Object.hasOwn(input, 'name')) {
    patch.name = boundedString(input.name, 'update_interview_scenario.name', 1, 200)
  }
  if (Object.hasOwn(input, 'description')) {
    patch.description = boundedString(
      input.description,
      'update_interview_scenario.description',
      0,
      4000
    )
  }
  if (Object.hasOwn(input, 'locale')) {
    patch.locale = parseInterviewLocale(input.locale, 'update_interview_scenario.locale')
  }
  if (Object.hasOwn(input, 'interview_type')) {
    patch.interview_type = patternedString(
      input.interview_type,
      'update_interview_scenario.interview_type',
      3,
      101,
      INTERVIEW_TYPE_PATTERN
    )
  }
  if (Object.hasOwn(input, 'difficulty')) {
    patch.difficulty = closedStringEnum(input.difficulty, 'update_interview_scenario.difficulty', [
      'introductory',
      'intermediate',
      'advanced',
      'adaptive'
    ])
  }
  if (Object.hasOwn(input, 'duration_minutes')) {
    patch.duration_minutes = boundedInteger(
      input.duration_minutes,
      'update_interview_scenario.duration_minutes',
      5,
      240
    )
  }
  if (Object.hasOwn(input, 'target_question_count')) {
    patch.target_question_count = boundedInteger(
      input.target_question_count,
      'update_interview_scenario.target_question_count',
      1,
      100
    )
  }
  if (Object.hasOwn(input, 'focus_areas')) {
    patch.focus_areas = parseStringArray(
      input.focus_areas,
      'update_interview_scenario.focus_areas',
      0,
      50,
      1,
      200,
      true
    )
  }
  if (Object.hasOwn(input, 'allow_followups')) {
    patch.allow_followups = booleanValue(
      input.allow_followups,
      'update_interview_scenario.allow_followups'
    )
  }
  if (Object.hasOwn(input, 'allow_barge_in')) {
    patch.allow_barge_in = booleanValue(
      input.allow_barge_in,
      'update_interview_scenario.allow_barge_in'
    )
  }
  if (Object.hasOwn(input, 'rubric')) {
    patch.rubric = parseInterviewRubric(input.rubric, 'update_interview_scenario.rubric')
  }
  if (Object.hasOwn(input, 'status')) {
    patch.status = closedStringEnum(input.status, 'update_interview_scenario.status', [
      'draft',
      'active',
      'archived'
    ])
  }
  return patch
}

/**
 * @brief 严格解码 InterviewScenario / Strictly decode an InterviewScenario.
 * @param value 未知 Scenario / Unknown Scenario.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Scenario / Validated Scenario.
 */
export function parseInterviewScenario(
  value: unknown,
  path = 'interview_scenario'
): InterviewScenario {
  /** @brief 精确 Scenario 对象 / Exact Scenario object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'name',
    'description',
    'locale',
    'interview_type',
    'difficulty',
    'duration_minutes',
    'target_question_count',
    'focus_areas',
    'allow_followups',
    'allow_barge_in',
    'rubric',
    'status'
  ])
  return {
    ...parseResourceFields(input, path),
    ...parseInterviewScenarioFields(input, path),
    status: closedStringEnum(input.status, `${path}.status`, ['draft', 'active', 'archived']),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/**
 * @brief 严格解码 InterviewScenarioList / Strictly decode an InterviewScenarioList.
 * @param value 未知列表 / Unknown list.
 * @return 已验证 cursor 页 / Validated cursor page.
 */
export function parseInterviewScenarioList(value: unknown): CursorCollection<InterviewScenario> {
  /** @brief 精确列表对象 / Exact list object. */
  const input = exactRecord(value, 'interview_scenario_list', ['items', 'page'])
  /** @brief 已解码 Scenario / Decoded Scenarios. */
  const items = arrayBetween(input.items, 'interview_scenario_list.items', 0, 200).map(
    (item, index) => parseInterviewScenario(item, `interview_scenario_list.items[${index}]`)
  )
  assertUniqueBy(items, (scenario) => scenario.id, 'interview_scenario_list.items')
  return {
    items,
    page: parseCursorPage(input.page, 'interview_scenario_list.page')
  }
}
