/** @file API v2 JSON Schema 的小型严格解码原语 / Small strict decoding primitives for the API v2 JSON Schema. */

import { ApiV2ContractError } from './errors'

/** @brief API v2 不透明 ID 的冻结格式 / Frozen API v2 opaque-ID format. */
const OPAQUE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{7,159}$/u

/** @brief API v2 Locale 的冻结格式 / Frozen API v2 Locale format. */
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** @brief API v2 稳定 code 的冻结格式 / Frozen API v2 stable-code format. */
const STABLE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{2,127}$/u

/** @brief API v2 RFC 3339 UTC 时间戳分组 / Capturing pattern for API v2 RFC 3339 UTC timestamps. */
const UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u

/** @brief API v2 扩展属性名格式 / API v2 extension-property-name format. */
const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9_-]*)+$/u

/** @brief API v2 分页元数据 / API v2 pagination metadata. */
export interface CursorPage {
  /** @brief 是否仍有下一页 / Whether another page exists. */
  readonly has_more: boolean
  /** @brief 下一页不透明游标 / Opaque cursor for the next page. */
  readonly next_cursor: string | null
}

/** @brief API v2 游标集合 / API v2 cursor collection. */
export interface CursorCollection<TItem> {
  /** @brief 当前页条目 / Items on the current page. */
  readonly items: readonly TItem[]
  /** @brief 当前页元数据 / Metadata for the current page. */
  readonly page: CursorPage
}

/** @brief API v2 持久资源公共字段 / Common fields of an API v2 persistent resource. */
export interface ResourceFields {
  /** @brief 资源 ID / Resource ID. */
  readonly id: string
  /** @brief 领域修订号 / Domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation time. */
  readonly created_at: string
  /** @brief 更新时间 / Update time. */
  readonly updated_at: string
}

/**
 * @brief 断言 HTTP entity-tag 为强校验器 / Assert an HTTP entity-tag is a strong validator.
 * @param value 未知 ETag header / Unknown ETag header.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 可用于 If-Match 的强 ETag / Strong ETag safe for If-Match.
 */
export function strongEntityTag(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.startsWith('W/') || value.length < 2) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a strong ETag.`)
  }
  if (value[0] !== '"' || value[value.length - 1] !== '"') {
    throw new ApiV2ContractError(`API v2 field ${path} must be a strong ETag.`)
  }
  for (let index = 1; index < value.length - 1; index += 1) {
    /** @brief 当前 entity-tag 字符码 / Current entity-tag character code. */
    const code = value.charCodeAt(index)
    if (code < 0x21 || code === 0x22 || code > 0xff) {
      throw new ApiV2ContractError(`API v2 field ${path} must be a strong ETag.`)
    }
  }
  return value
}

/**
 * @brief 按 JSON Schema 字符语义计算长度 / Count characters using JSON Schema string semantics.
 * @param value 待计数字符串 / String to count.
 * @return Unicode code point 数 / Unicode code-point count.
 */
function characterCount(value: string): number {
  return [...value].length
}

/**
 * @brief 断言未知值为无数组原型的普通 JSON 对象 / Assert that an unknown value is a non-array JSON object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已确认对象 / Confirmed object.
 */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an object.`)
  }
  return value as Record<string, unknown>
}

/**
 * @brief 拒绝稳定对象中的所有未知字段 / Reject every unknown field in a stable object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowedKeys Schema 明确允许的字段 / Fields explicitly allowed by the schema.
 * @return 不含额外字段的对象 / Object without additional fields.
 */
export function exactRecord(
  value: unknown,
  path: string,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  /** @brief 已确认对象 / Confirmed object. */
  const input = record(value, path)
  /** @brief 首个额外字段 / First additional field. */
  const unexpectedKey = Object.keys(input).find((key) => !allowedKeys.includes(key))
  if (unexpectedKey !== undefined) {
    throw new ApiV2ContractError(`API v2 field ${path}.${unexpectedKey} is not allowed.`)
  }
  return input
}

/**
 * @brief 断言未知值为字符串 / Assert that an unknown value is a string.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已确认字符串 / Confirmed string.
 */
export function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ApiV2ContractError(`API v2 field ${path} must be a string.`)
  }
  return value
}

/**
 * @brief 断言未知值为 Schema 字符串并校验长度 / Assert a schema string and validate its length.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumLength 最小字符数 / Minimum character count.
 * @param maximumLength 最大字符数 / Maximum character count.
 * @return 已验证字符串 / Validated string.
 */
export function boundedString(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  /** @brief 输入的 Unicode 字符数 / Unicode character count of the input. */
  const length = characterCount(decoded)
  if (length < minimumLength || length > maximumLength) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must contain between ${minimumLength} and ${maximumLength} characters.`
    )
  }
  return decoded
}

/**
 * @brief 断言未知值为布尔值 / Assert that an unknown value is boolean.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证布尔值 / Validated boolean.
 */
export function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiV2ContractError(`API v2 field ${path} must be a boolean.`)
  }
  return value
}

/**
 * @brief 断言未知值为安全整数并限制闭区间 / Assert a safe integer inside an inclusive range.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimum 最小值 / Minimum value.
 * @param maximum 最大值 / Maximum value.
 * @return 已验证整数 / Validated integer.
 */
export function boundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must be a safe integer between ${minimum} and ${maximum}.`
    )
  }
  return value as number
}

/**
 * @brief 断言未知值为数组并限制条目数 / Assert an array and constrain its item count.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @return 已验证数组 / Validated array.
 */
export function boundedArray(
  value: unknown,
  path: string,
  maximumItems: number
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must be an array with at most ${maximumItems} items.`
    )
  }
  return value
}

/**
 * @brief 断言字符串符合 API v2 OpaqueId / Assert that a string matches API v2 OpaqueId.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 ID / Validated ID.
 */
export function opaqueId(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 8, 160)
  if (!OPAQUE_ID_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an opaque ID.`)
  }
  return decoded
}

/**
 * @brief 断言字符串符合 API v2 Locale / Assert that a string matches API v2 Locale.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Locale / Validated Locale.
 */
export function locale(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 2, 35)
  if (!LOCALE_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a locale.`)
  }
  return decoded
}

/**
 * @brief 检查一个公历日期是否存在 / Check whether a Gregorian calendar date exists.
 * @param year 年 / Year.
 * @param month 月 / Month.
 * @param day 日 / Day.
 * @return 日期存在时为 true / True when the date exists.
 */
function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  /** @brief 当前年份是否为闰年 / Whether the year is a leap year. */
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  /** @brief 每月最大日数 / Maximum day count by month. */
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

/**
 * @brief 断言 API v2 Timestamp 为 Z 结尾的 RFC 3339 时间 / Assert an API v2 Z-terminated RFC 3339 timestamp.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证时间戳 / Validated timestamp.
 */
export function timestamp(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  /** @brief 时间戳结构分组 / Timestamp structural groups. */
  const match = UTC_TIMESTAMP_PATTERN.exec(decoded)
  if (match === null) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a UTC RFC 3339 timestamp.`)
  }
  /** @brief 十进制日期与时间字段 / Decimal date and time fields. */
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part))
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    !isCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a UTC RFC 3339 timestamp.`)
  }
  return decoded
}

/**
 * @brief 断言稳定机器 code / Assert a stable machine-readable code.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 code / Validated code.
 */
export function stableCode(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 3, 128)
  if (!STABLE_CODE_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a stable code.`)
  }
  return decoded
}

/**
 * @brief 断言绝对 HTTPS URL 且不含凭证 / Assert an absolute HTTPS URL without credentials.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 URL 字符串 / Validated URL string.
 */
export function httpsUrl(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  try {
    /** @brief WHATWG 解析后的 URL / URL parsed by WHATWG rules. */
    const url = new URL(decoded)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error()
  } catch {
    throw new ApiV2ContractError(`API v2 field ${path} must be an HTTPS URL.`)
  }
  return decoded
}

/**
 * @brief 断言 RFC 风格邮箱结构 / Assert an RFC-style email structure.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证邮箱 / Validated email.
 * @note 浏览器消费者只做结构和边界校验；服务端仍是邮箱可投递性的权威。 / The browser consumer validates structure and bounds only; the server remains authoritative for deliverability.
 */
export function email(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 3, 320)
  if (!/^[^\s@]+@[^\s@]+$/u.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an email address.`)
  }
  return decoded
}

/**
 * @brief 递归断言值属于 JSON 数据模型 / Recursively assert a value belongs to the JSON data model.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param depth 当前递归深度 / Current recursion depth.
 * @return 已验证 JSON 值 / Validated JSON value.
 */
export function jsonValue(value: unknown, path: string, depth = 0): unknown {
  if (depth > 64) throw new ApiV2ContractError(`API v2 field ${path} is nested too deeply.`)
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => jsonValue(item, `${path}[${index}]`, depth + 1))
    return value
  }
  /** @brief 待递归检查的 JSON 对象 / JSON object to inspect recursively. */
  const input = record(value, path)
  for (const [key, item] of Object.entries(input)) {
    jsonValue(item, `${path}.${key}`, depth + 1)
  }
  return value
}

/**
 * @brief 断言 API v2 namespaced Extensions 对象 / Assert an API v2 namespaced Extensions object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证扩展对象 / Validated extension object.
 */
export function extensions(value: unknown, path: string): Readonly<Record<string, unknown>> {
  /** @brief 待检查扩展对象 / Extension object to inspect. */
  const input = record(value, path)
  /** @brief 扩展属性名 / Extension property names. */
  const keys = Object.keys(input)
  if (keys.length > 32 || !keys.every((key) => EXTENSION_KEY_PATTERN.test(key))) {
    throw new ApiV2ContractError(`API v2 field ${path} contains invalid extension names.`)
  }
  for (const [key, item] of Object.entries(input)) jsonValue(item, `${path}.${key}`)
  return input
}

/**
 * @brief 解码持久资源的四个公共字段 / Decode the four common persistent-resource fields.
 * @param input 已确认对象 / Confirmed object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证资源字段 / Validated resource fields.
 */
export function parseResourceFields(
  input: Readonly<Record<string, unknown>>,
  path: string
): ResourceFields {
  return {
    created_at: timestamp(input.created_at, `${path}.created_at`),
    id: opaqueId(input.id, `${path}.id`),
    revision: boundedInteger(input.revision, `${path}.revision`, 1, Number.MAX_SAFE_INTEGER),
    updated_at: timestamp(input.updated_at, `${path}.updated_at`)
  }
}

/**
 * @brief 严格解码 v2 Page 并执行字段关联约束 / Strictly decode v2 Page and enforce its field relation.
 * @param value 未知分页对象 / Unknown page object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证分页元数据 / Validated page metadata.
 */
export function parseCursorPage(value: unknown, path = 'response.page'): CursorPage {
  /** @brief 精确分页对象 / Exact page object. */
  const input = exactRecord(value, path, ['next_cursor', 'has_more'])
  /** @brief 是否仍有下一页 / Whether another page exists. */
  const hasMore = booleanValue(input.has_more, `${path}.has_more`)
  /** @brief 下一页游标 / Next-page cursor. */
  const nextCursor =
    input.next_cursor === null
      ? null
      : boundedString(input.next_cursor, `${path}.next_cursor`, 1, 2048)
  if ((hasMore && nextCursor === null) || (!hasMore && nextCursor !== null)) {
    throw new ApiV2ContractError(
      `API v2 fields ${path}.has_more and ${path}.next_cursor are inconsistent.`
    )
  }
  return { has_more: hasMore, next_cursor: nextCursor }
}
