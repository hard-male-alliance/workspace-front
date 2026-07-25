/** @file Interview API v2 共享 wire 解码原语 / Shared wire-decoding primitives for Interview API v2. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  finiteNumber,
  locale,
  opaqueId,
  patternedString,
  timestamp
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseResourceReference, type ResourceReference } from '../resources/resource-reference'

/** @brief Interview 与 Agent 共用的 scope code 格式 / Scope-code format shared by Interview and Agent. */
const AGENT_SCOPE_PATTERN = /^[a-z][a-z0-9_.-]{2,100}$/u

/** @brief RFC 3986 绝对 URI 的 ASCII 结构 / ASCII structure of an RFC 3986 absolute URI. */
const ABSOLUTE_URI_PATTERN =
  /^[A-Za-z][A-Za-z0-9+.-]*:(?:[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/u

/** @brief 受控 Realtime 测试 origin / Controlled Realtime test origin. */
const REALTIME_TEST_ORIGIN = 'dev.hmalliances.org:9000'

/** @brief Knowledge 选择模式 / Knowledge-selection mode. */
export type KnowledgeSelectionMode = 'explicit' | 'none' | 'policy_default'

/** @brief 固定 Knowledge 版本 / Pinned Knowledge version. */
export interface KnowledgeVersionPin {
  /** @brief KnowledgeSource identity / KnowledgeSource identity. */
  readonly source_id: string
  /** @brief KnowledgeSourceVersion identity / KnowledgeSourceVersion identity. */
  readonly version_id: string
}

/** @brief Interview 创建时冻结的 Knowledge 选择 / Knowledge selection frozen at Interview creation. */
export interface KnowledgeSelection {
  /** @brief 选择模式 / Selection mode. */
  readonly mode: KnowledgeSelectionMode
  /** @brief 显式包含的来源 / Explicitly included sources. */
  readonly include_source_ids: readonly string[]
  /** @brief 显式排除的来源 / Explicitly excluded sources. */
  readonly exclude_source_ids: readonly string[]
  /** @brief 固定版本 / Pinned versions. */
  readonly pinned_versions: readonly KnowledgeVersionPin[]
  /** @brief 执行授权使用的 Agent scope / Agent scope used for execution authorization. */
  readonly agent_scope: string
}

/** @brief 推理质量层 / Inference quality tier. */
export type InferenceQualityTier = 'balanced' | 'deep' | 'fast'

/** @brief 推理成本层 / Inference cost tier. */
export type InferenceCostTier = 'economy' | 'premium' | 'standard'

/** @brief 推理数据区域 / Inference data region. */
export type InferenceDataRegion = 'cn' | 'global' | 'private_deployment'

/** @brief Interview 创建时冻结的推理意图 / Inference intent frozen at Interview creation. */
export interface InferenceIntent {
  /** @brief 质量层 / Quality tier. */
  readonly quality_tier: InferenceQualityTier
  /** @brief 延迟预算；null 表示未指定 / Latency budget, or null when unspecified. */
  readonly latency_budget_ms: number | null
  /** @brief 成本层 / Cost tier. */
  readonly cost_tier: InferenceCostTier
  /** @brief 数据处理区域 / Data-processing region. */
  readonly data_region: InferenceDataRegion
  /** @brief 是否允许 provider fallback / Whether provider fallback is allowed. */
  readonly allow_provider_fallback: boolean
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allow_external_model_processing: boolean
}

/** @brief 报告引用的不可变版本 / Immutable version referenced by a report. */
export interface VersionedReference {
  /** @brief 资源 identity / Resource identity. */
  readonly id: string
  /** @brief 不可变版本字符串 / Immutable version string. */
  readonly version: string
}

/**
 * @brief 拒绝字符串数组中的重复值 / Reject duplicate values in a string array.
 * @param values 已解码字符串 / Decoded strings.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
export function assertUniqueStrings(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new ApiV2ContractError(`API v2 field ${path} must contain unique items.`)
  }
}

/**
 * @brief 拒绝对象身份数组中的重复值 / Reject duplicate identities in an object array.
 * @template TValue 待检查对象类型 / Object type being checked.
 * @param values 已解码对象 / Decoded objects.
 * @param keyOf 身份投影 / Identity projection.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
export function assertUniqueBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
  path: string
): void {
  /** @brief 已观察身份 / Identities already observed. */
  const seen = new Set<string>()
  for (const value of values) {
    /** @brief 当前身份 / Current identity. */
    const key = keyOf(value)
    if (seen.has(key)) {
      throw new ApiV2ContractError(`API v2 field ${path} contains duplicate identity ${key}.`)
    }
    seen.add(key)
  }
}

/**
 * @brief 解码有界字符串数组 / Decode a bounded string array.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目 / Minimum item count.
 * @param maximumItems 最多条目 / Maximum item count.
 * @param minimumLength 单项最短字符数 / Minimum item character count.
 * @param maximumLength 单项最长字符数 / Maximum item character count.
 * @param unique 是否要求值唯一 / Whether values must be unique.
 * @return 已验证字符串快照 / Validated string snapshot.
 */
export function parseStringArray(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number,
  minimumLength: number,
  maximumLength: number,
  unique: boolean
): readonly string[] {
  /** @brief 已解码字符串 / Decoded strings. */
  const decoded = arrayBetween(value, path, minimumItems, maximumItems).map((item, index) =>
    boundedString(item, `${path}[${index}]`, minimumLength, maximumLength)
  )
  if (unique) assertUniqueStrings(decoded, path)
  return decoded
}

/**
 * @brief 严格解码 KnowledgeVersionPin / Strictly decode a KnowledgeVersionPin.
 * @param value 未知 pin / Unknown pin.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 pin / Validated pin.
 */
function parseKnowledgeVersionPin(value: unknown, path: string): KnowledgeVersionPin {
  /** @brief 精确 pin 对象 / Exact pin object. */
  const input = exactRecord(value, path, ['source_id', 'version_id'])
  return {
    source_id: opaqueId(input.source_id, `${path}.source_id`),
    version_id: opaqueId(input.version_id, `${path}.version_id`)
  }
}

/**
 * @brief 严格解码 KnowledgeSelection 及跨字段约束 / Strictly decode KnowledgeSelection and its cross-field constraints.
 * @param value 未知选择 / Unknown selection.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证选择 / Validated selection.
 */
export function parseKnowledgeSelection(
  value: unknown,
  path = 'knowledge_selection'
): KnowledgeSelection {
  /** @brief 精确选择对象 / Exact selection object. */
  const input = exactRecord(value, path, [
    'mode',
    'include_source_ids',
    'exclude_source_ids',
    'pinned_versions',
    'agent_scope'
  ])
  /** @brief 选择模式 / Selection mode. */
  const mode = closedStringEnum(input.mode, `${path}.mode`, ['none', 'policy_default', 'explicit'])
  /** @brief 显式包含 identity / Explicitly included identities. */
  const includeSourceIds = arrayBetween(
    input.include_source_ids,
    `${path}.include_source_ids`,
    0,
    200
  ).map((item, index) => opaqueId(item, `${path}.include_source_ids[${index}]`))
  /** @brief 显式排除 identity / Explicitly excluded identities. */
  const excludeSourceIds = arrayBetween(
    input.exclude_source_ids,
    `${path}.exclude_source_ids`,
    0,
    200
  ).map((item, index) => opaqueId(item, `${path}.exclude_source_ids[${index}]`))
  /** @brief 固定版本 / Pinned versions. */
  const pinnedVersions = arrayBetween(input.pinned_versions, `${path}.pinned_versions`, 0, 200).map(
    (item, index) => parseKnowledgeVersionPin(item, `${path}.pinned_versions[${index}]`)
  )
  assertUniqueStrings(includeSourceIds, `${path}.include_source_ids`)
  assertUniqueStrings(excludeSourceIds, `${path}.exclude_source_ids`)
  assertUniqueBy(pinnedVersions, (pin) => pin.source_id, `${path}.pinned_versions`)
  /** @brief 排除来源集合 / Excluded-source set. */
  const excluded = new Set(excludeSourceIds)
  if (includeSourceIds.some((sourceId) => excluded.has(sourceId))) {
    throw new ApiV2ContractError(
      `API v2 fields ${path}.include_source_ids and ${path}.exclude_source_ids must be disjoint.`
    )
  }
  if (
    mode === 'none' &&
    (includeSourceIds.length !== 0 || excludeSourceIds.length !== 0 || pinnedVersions.length !== 0)
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} cannot select sources in none mode.`)
  }
  if (mode === 'explicit' && includeSourceIds.length === 0) {
    throw new ApiV2ContractError(
      `API v2 field ${path}.include_source_ids cannot be empty in explicit mode.`
    )
  }
  return {
    agent_scope: patternedString(
      input.agent_scope,
      `${path}.agent_scope`,
      3,
      101,
      AGENT_SCOPE_PATTERN
    ),
    exclude_source_ids: excludeSourceIds,
    include_source_ids: includeSourceIds,
    mode,
    pinned_versions: pinnedVersions
  }
}

/**
 * @brief 严格解码 InferenceIntent / Strictly decode an InferenceIntent.
 * @param value 未知推理意图 / Unknown inference intent.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证推理意图 / Validated inference intent.
 */
export function parseInferenceIntent(value: unknown, path = 'inference_intent'): InferenceIntent {
  /** @brief 精确推理意图 / Exact inference intent. */
  const input = exactRecord(value, path, [
    'quality_tier',
    'latency_budget_ms',
    'cost_tier',
    'data_region',
    'allow_provider_fallback',
    'allow_external_model_processing'
  ])
  return {
    allow_external_model_processing: booleanValue(
      input.allow_external_model_processing,
      `${path}.allow_external_model_processing`
    ),
    allow_provider_fallback: booleanValue(
      input.allow_provider_fallback,
      `${path}.allow_provider_fallback`
    ),
    cost_tier: closedStringEnum(input.cost_tier, `${path}.cost_tier`, [
      'economy',
      'standard',
      'premium'
    ]),
    data_region: closedStringEnum(input.data_region, `${path}.data_region`, [
      'cn',
      'global',
      'private_deployment'
    ]),
    latency_budget_ms:
      input.latency_budget_ms === null
        ? null
        : boundedInteger(input.latency_budget_ms, `${path}.latency_budget_ms`, 100, 600_000),
    quality_tier: closedStringEnum(input.quality_tier, `${path}.quality_tier`, [
      'fast',
      'balanced',
      'deep'
    ])
  }
}

/**
 * @brief 严格解码 ResourceRef 或 null / Strictly decode a ResourceRef or null.
 * @param value 未知引用 / Unknown reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证引用或 null / Validated reference or null.
 */
export function parseNullableResourceReference(
  value: unknown,
  path: string
): ResourceReference | null {
  return value === null ? null : parseResourceReference(value, path)
}

/**
 * @brief 严格解码 VersionedRef / Strictly decode a VersionedRef.
 * @param value 未知引用 / Unknown reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证不可变版本引用 / Validated immutable version reference.
 */
export function parseVersionedReference(value: unknown, path: string): VersionedReference {
  /** @brief 精确版本引用 / Exact version reference. */
  const input = exactRecord(value, path, ['id', 'version'])
  return {
    id: opaqueId(input.id, `${path}.id`),
    version: boundedString(input.version, `${path}.version`, 1, 80)
  }
}

/**
 * @brief 严格解码可空时间戳 / Strictly decode a nullable timestamp.
 * @param value 未知时间 / Unknown timestamp.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return UTC 时间或 null / UTC time or null.
 */
export function parseNullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : timestamp(value, path)
}

/**
 * @brief 严格解码可空有界字符串 / Strictly decode a nullable bounded string.
 * @param value 未知字符串 / Unknown string.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumLength 最短字符数 / Minimum character count.
 * @param maximumLength 最长字符数 / Maximum character count.
 * @return 字符串或 null / String or null.
 */
export function parseNullableString(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): string | null {
  return value === null ? null : boundedString(value, path, minimumLength, maximumLength)
}

/**
 * @brief 严格解码可空非负数 / Strictly decode a nullable non-negative number.
 * @param value 未知数值 / Unknown number.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 非负有限数或 null / Non-negative finite number or null.
 */
export function parseNullableNonNegativeNumber(value: unknown, path: string): number | null {
  if (value === null) return null
  /** @brief 已确认有限数 / Confirmed finite number. */
  const decoded = finiteNumber(value, path)
  if (decoded < 0) {
    throw new ApiV2ContractError(`API v2 field ${path} must be non-negative.`)
  }
  return decoded
}

/**
 * @brief 严格解码可空非负整数 / Strictly decode a nullable non-negative integer.
 * @param value 未知数值 / Unknown number.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 非负安全整数或 null / Non-negative safe integer or null.
 */
export function parseNullableNonNegativeInteger(value: unknown, path: string): number | null {
  return value === null ? null : boundedInteger(value, path, 0, Number.MAX_SAFE_INTEGER)
}

/**
 * @brief 校验通用绝对 URI / Validate a generic absolute URI.
 * @param value 未知 URI / Unknown URI.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 未改写 URI / Unmodified URI.
 */
export function absoluteUri(value: unknown, path: string): string {
  /** @brief 有界 URI 字符串 / Bounded URI string. */
  const decoded = boundedString(value, path, 1, 2048)
  if (!ABSOLUTE_URI_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an absolute URI.`)
  }
  try {
    new URL(decoded)
  } catch {
    throw new ApiV2ContractError(`API v2 field ${path} must be an absolute URI.`)
  }
  return decoded
}

/**
 * @brief 校验生产或受控测试 Realtime URL / Validate a production or controlled-test Realtime URL.
 * @param value 未知 URL / Unknown URL.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 未改写 URL / Unmodified URL.
 */
export function realtimeUrl(value: unknown, path: string): string {
  /** @brief 有界 URL / Bounded URL. */
  const decoded = boundedString(value, path, 1, 8192)
  if (!ABSOLUTE_URI_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a permitted Realtime URL.`)
  }
  /** @brief 已解析 URL / Parsed URL. */
  let parsed: URL
  try {
    parsed = new URL(decoded)
  } catch {
    throw new ApiV2ContractError(`API v2 field ${path} must be a permitted Realtime URL.`)
  }
  /** @brief 生产安全 scheme / Production-safe scheme. */
  const isProduction =
    (decoded.startsWith('https://') || decoded.startsWith('wss://')) &&
    (parsed.protocol === 'https:' || parsed.protocol === 'wss:') &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.host.length > 0
  /** @brief 唯一允许的受控测试 URL / Sole allowed controlled-test URL. */
  const isControlledTest =
    (decoded.startsWith(`http://${REALTIME_TEST_ORIGIN}`) ||
      decoded.startsWith(`ws://${REALTIME_TEST_ORIGIN}`)) &&
    (parsed.protocol === 'http:' || parsed.protocol === 'ws:') &&
    parsed.host === REALTIME_TEST_ORIGIN &&
    parsed.username === '' &&
    parsed.password === ''
  if (!isProduction && !isControlledTest) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a permitted Realtime URL.`)
  }
  return decoded
}

/**
 * @brief 校验 Location 精确指向 command 创建的资源 / Validate that Location identifies the resource created by a command exactly.
 * @param location Transport 已验证同源的绝对 Location / Absolute same-origin Location validated by the transport.
 * @param expectedPath 响应 identities 唯一确定的 canonical path / Canonical path uniquely determined by response identities.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 未改写 Location / Unmodified Location.
 */
export function exactResourceLocation(
  location: unknown,
  expectedPath: string,
  path = 'response.headers.Location'
): string {
  if (typeof location !== 'string') {
    throw new ApiV2ContractError(`API v2 field ${path} must be an absolute resource URL.`)
  }
  /** @brief 已解析绝对 Location / Parsed absolute Location. */
  let parsed: URL
  try {
    parsed = new URL(location)
  } catch {
    throw new ApiV2ContractError(`API v2 field ${path} must be an absolute resource URL.`)
  }
  if (parsed.pathname !== expectedPath || parsed.search !== '' || parsed.hash !== '') {
    throw new ApiV2ContractError(
      `API v2 field ${path} does not identify the returned resource exactly.`
    )
  }
  return location
}

/**
 * @brief 比较两个已解码 wire 值的 JSON 语义 / Compare the JSON semantics of two decoded wire values.
 * @param left 左值 / Left value.
 * @param right 右值 / Right value.
 * @return 忽略对象属性顺序后结构和值相同时为 true / True when structure and values match while ignoring object-property order.
 */
export function wireValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => wireValuesEqual(item, right[index]))
  }
  /** @brief 左对象 / Left object. */
  const leftRecord = left as Readonly<Record<string, unknown>>
  /** @brief 右对象 / Right object. */
  const rightRecord = right as Readonly<Record<string, unknown>>
  /** @brief 左 keys / Left keys. */
  const leftKeys = Object.keys(leftRecord)
  /** @brief 右 keys / Right keys. */
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(rightRecord, key) && wireValuesEqual(leftRecord[key], rightRecord[key])
    )
  )
}

/**
 * @brief 解码 Locale 以供 Interview 模型复用 / Decode a Locale for reuse by Interview models.
 * @param value 未知 Locale / Unknown Locale.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Locale / Validated Locale.
 */
export function parseInterviewLocale(value: unknown, path: string): string {
  return locale(value, path)
}
