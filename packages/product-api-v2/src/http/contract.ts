/** @file API v2 JSON Schema 的小型严格解码原语 / Small strict decoding primitives for the API v2 JSON Schema. */

import { API_V2_CONTROLLED_TEST_ORIGIN } from '../origin'
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

/** @brief RFC 3986 绝对 URI 的原始 ASCII token 格式 / Raw ASCII-token format for an RFC 3986 absolute URI. */
const RFC3986_ABSOLUTE_URI_PATTERN =
  /^[A-Za-z][A-Za-z0-9+.-]*:(?:[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/u

/** @brief API v2 可无损表达的严格只读 JSON 值 / Strict read-only JSON value representable without loss by API v2. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

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
 * @brief 在 WHATWG 解析前验证绝对 URI 的 RFC 3986 原始语法 / Validate raw RFC 3986 syntax before WHATWG parsing an absolute URI.
 * @param value 已确认字符串 / Confirmed string.
 * @return 语法与结构均可接受时的 URL，否则为 null / Parsed URL when syntax and structure are acceptable, otherwise null.
 * @note 原始语法门禁阻止 WHATWG 静默修复反斜杠、Unicode IRI 与未转义字符。 / The raw-syntax gate prevents WHATWG from silently repairing backslashes, Unicode IRIs, and unescaped characters.
 */
function parseRfc3986AbsoluteUri(value: string): URL | null {
  if (!RFC3986_ABSOLUTE_URI_PATTERN.test(value) || value.indexOf('#') !== value.lastIndexOf('#')) {
    return null
  }
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * @brief 校验 HTTP(S) URI 具有非空原始 authority 且 bracket 不泄漏至后续组件 / Validate a non-empty raw authority and keep brackets out of later HTTP(S) components.
 * @param value 已通过原始 token 门禁的 URI / URI that passed the raw-token gate.
 * @param schemePrefix 精确的小写 scheme 与双斜杠前缀 / Exact lowercase scheme and double-slash prefix.
 * @return authority 与后续组件满足 RFC 3986 分界时为 true / True when authority and later components respect RFC 3986 boundaries.
 */
function hasValidNetworkAuthority(value: string, schemePrefix: 'http://' | 'https://'): boolean {
  if (!value.startsWith(schemePrefix)) return false
  /** @brief authority 后第一个 path、query 或 fragment 分隔符 / First path, query, or fragment delimiter after the authority. */
  const relativeBoundary = value.slice(schemePrefix.length).search(/[/?#]/u)
  /** @brief authority 的绝对结束 offset / Absolute end offset of the authority. */
  const authorityEnd =
    relativeBoundary === -1 ? value.length : schemePrefix.length + relativeBoundary
  /** @brief 原始 authority / Raw authority. */
  const authority = value.slice(schemePrefix.length, authorityEnd)
  /** @brief authority 后的原始组件 / Raw components following the authority. */
  const remainder = value.slice(authorityEnd)
  return authority.length > 0 && !remainder.includes('[') && !remainder.includes(']')
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
  /** @brief 通过 RFC 3986 原始门禁后的 WHATWG URL / WHATWG URL after the raw RFC 3986 gate. */
  const url = parseRfc3986AbsoluteUri(decoded)
  if (
    url === null ||
    !hasValidNetworkAuthority(decoded, 'https://') ||
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an HTTPS URL.`)
  }
  return decoded
}

/**
 * @brief 断言 API v2 NetworkUrl / Assert an API v2 NetworkUrl.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 HTTPS 或受控测试 HTTP URL / Validated HTTPS or controlled-test HTTP URL.
 */
export function networkUrl(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  /** @brief 通过 RFC 3986 原始门禁后的 WHATWG URL / WHATWG URL after the raw RFC 3986 gate. */
  const url = parseRfc3986AbsoluteUri(decoded)
  /** @brief 是否为不含凭证的 HTTPS URL / Whether this is a credential-free HTTPS URL. */
  const isHttps =
    url !== null &&
    hasValidNetworkAuthority(decoded, 'https://') &&
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === ''
  /** @brief 是否为唯一允许的测试 HTTP origin / Whether this is the sole permitted test HTTP origin. */
  const isControlledTestHttp =
    url !== null &&
    hasValidNetworkAuthority(decoded, 'http://') &&
    url.origin === API_V2_CONTROLLED_TEST_ORIGIN &&
    url.username === '' &&
    url.password === '' &&
    !decoded.includes('#') &&
    (decoded === API_V2_CONTROLLED_TEST_ORIGIN ||
      decoded.startsWith(`${API_V2_CONTROLLED_TEST_ORIGIN}/`))
  if (!isHttps && !isControlledTestHttp) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a permitted network URL.`)
  }
  return decoded
}

/**
 * @brief 断言 API v2 SafeLinkUrl / Assert an API v2 SafeLinkUrl.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证可显示链接 / Validated display-safe link.
 */
export function safeLinkUrl(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  /** @brief 通过 RFC 3986 原始门禁后的 WHATWG URL / WHATWG URL after the raw RFC 3986 gate. */
  const url = parseRfc3986AbsoluteUri(decoded)
  if (url === null || !/^(?:https?:\/\/|mailto:|tel:)/u.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a safe link URL.`)
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    /** @brief 当前网络 scheme 的精确原始前缀 / Exact raw prefix for the current network scheme. */
    const schemePrefix = url.protocol === 'https:' ? 'https://' : 'http://'
    if (
      !hasValidNetworkAuthority(decoded, schemePrefix) ||
      url.username !== '' ||
      url.password !== ''
    ) {
      throw new ApiV2ContractError(`API v2 field ${path} must be a safe link URL.`)
    }
  } else if (decoded.includes('[') || decoded.includes(']')) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a safe link URL.`)
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

/** @brief JSON decoder 内部可写数组 / Mutable array used only while decoding JSON. */
type MutableJsonArray = JsonValue[]

/** @brief JSON decoder 内部可写对象 / Mutable object used only while decoding JSON. */
type MutableJsonObject = Record<string, JsonValue>

/** @brief JSON decoder 的目标容器 / Destination container used by the JSON decoder. */
type JsonDecodeTarget = MutableJsonArray | MutableJsonObject | Record<'value', JsonValue>

/** @brief 待解码 JSON 节点任务 / Work item for a JSON node awaiting decoding. */
interface JsonNodeDecodeTask {
  /** @brief 任务判别值 / Task discriminator. */
  readonly kind: 'decode'
  /** @brief 未知源节点 / Unknown source node. */
  readonly source: unknown
  /** @brief 诊断字段路径 / Diagnostic field path. */
  readonly path: string
  /** @brief 接收已复制节点的目标 / Target receiving the copied node. */
  readonly target: JsonDecodeTarget
  /** @brief 目标属性 key / Target property key. */
  readonly key: string | number
}

/** @brief JSON DFS 离开容器任务 / Work item marking departure from a JSON DFS container. */
interface JsonContainerLeaveTask {
  /** @brief 任务判别值 / Task discriminator. */
  readonly kind: 'leave'
  /** @brief 已完成遍历的源容器 / Source container whose traversal is complete. */
  readonly source: object
}

/** @brief 迭代式 JSON decoder 任务联合 / Iterative JSON-decoder work union. */
type JsonDecodeTask = JsonNodeDecodeTask | JsonContainerLeaveTask

/** @brief JSON object 的已验证数据属性 / Validated data property of a JSON object. */
interface JsonDataProperty {
  /** @brief 属性 key / Property key. */
  readonly key: string
  /** @brief 属性值 / Property value. */
  readonly value: unknown
}

/**
 * @brief 定义普通可枚举 JSON 数据属性并安全保留 `__proto__` / Define a normal enumerable JSON data property while safely preserving `__proto__`.
 * @param target 目标容器 / Destination container.
 * @param key 目标属性 key / Destination property key.
 * @param value 已验证 JSON 值 / Validated JSON value.
 */
function defineJsonDataProperty(
  target: JsonDecodeTarget,
  key: string | number,
  value: JsonValue
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

/**
 * @brief 读取普通 JSON object 的所有数据属性而不执行 getter / Read every data property of a plain JSON object without invoking getters.
 * @param value 未知 object / Unknown object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证自有字符串数据属性 / Validated own string data properties.
 */
function jsonObjectDataProperties(value: object, path: string): readonly JsonDataProperty[] {
  /** @brief object 原型 / Object prototype. */
  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a plain JSON object.`)
  }
  /** @brief 源 object 的全部自有 keys / All own keys of the source object. */
  const ownKeys = Reflect.ownKeys(value)
  /** @brief 已验证数据属性 / Validated data properties. */
  const properties: JsonDataProperty[] = []
  for (const key of ownKeys) {
    if (typeof key !== 'string') {
      throw new ApiV2ContractError(`API v2 field ${path} must contain only JSON properties.`)
    }
    /** @brief 当前自有属性描述符 / Current own-property descriptor. */
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new ApiV2ContractError(
        `API v2 field ${path}.${key} must be an enumerable JSON data property.`
      )
    }
    properties.push({ key, value: descriptor.value })
  }
  return properties
}

/**
 * @brief 读取 dense 普通 JSON array 的所有数据元素 / Read every data element of a dense plain JSON array.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证数组元素 / Validated array elements.
 */
function jsonArrayDataItems(value: readonly unknown[], path: string): readonly unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a plain JSON array.`)
  }
  /** @brief 数组全部自有 keys / All own keys of the array. */
  const ownKeys = Reflect.ownKeys(value)
  for (const key of ownKeys) {
    if (key === 'length') continue
    if (
      typeof key !== 'string' ||
      !/^(?:0|[1-9]\d*)$/u.test(key) ||
      Number(key) >= value.length ||
      String(Number(key)) !== key
    ) {
      throw new ApiV2ContractError(`API v2 field ${path} must contain only JSON array indexes.`)
    }
  }
  /** @brief 已验证数组元素 / Validated array elements. */
  const items: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    /** @brief 当前数组 index 的自有属性描述符 / Own-property descriptor for the current array index. */
    const descriptor = Object.getOwnPropertyDescriptor(value, index)
    if (descriptor === undefined) {
      throw new ApiV2ContractError(`API v2 field ${path} must be a dense JSON array.`)
    }
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new ApiV2ContractError(
        `API v2 field ${path}[${index}] must be an enumerable JSON data property.`
      )
    }
    items.push(descriptor.value)
  }
  return items
}

/**
 * @brief 迭代式解码并深复制严格 JSON 值 / Iteratively decode and deep-copy a strict JSON value.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无 accessor、稀疏数组、循环引用或输入别名的只读 JSON tree / Read-only JSON tree without accessors, sparse arrays, cycles, or aliases to the input.
 */
export function jsonValue(value: unknown, path: string): JsonValue {
  /** @brief 根值接收器 / Root-value receiver. */
  const root = {} as Record<'value', JsonValue>
  /** @brief 当前 DFS 路径上的源容器 / Source containers on the active DFS path. */
  const activeContainers = new WeakSet<object>()
  /** @brief 显式 DFS 工作栈 / Explicit DFS work stack. */
  const tasks: JsonDecodeTask[] = [
    { key: 'value', kind: 'decode', path, source: value, target: root }
  ]

  while (tasks.length > 0) {
    /** @brief 当前 decoder 任务 / Current decoder task. */
    const task = tasks.pop()
    if (task === undefined) break
    if (task.kind === 'leave') {
      activeContainers.delete(task.source)
      continue
    }

    /** @brief 当前源节点 / Current source node. */
    const source = task.source
    if (
      source === null ||
      typeof source === 'string' ||
      typeof source === 'boolean' ||
      (typeof source === 'number' && Number.isFinite(source))
    ) {
      defineJsonDataProperty(task.target, task.key, source)
      continue
    }
    if (typeof source !== 'object') {
      throw new ApiV2ContractError(`API v2 field ${task.path} must be a JSON value.`)
    }
    if (activeContainers.has(source)) {
      throw new ApiV2ContractError(`API v2 field ${task.path} must be an acyclic JSON tree.`)
    }
    activeContainers.add(source)
    tasks.push({ kind: 'leave', source })

    if (Array.isArray(source)) {
      /** @brief 已验证源数组元素 / Validated source-array items. */
      const items = jsonArrayDataItems(source, task.path)
      /** @brief 不含输入别名的目标数组 / Destination array without aliases to the input. */
      const decoded: MutableJsonArray = new Array<JsonValue>(items.length)
      defineJsonDataProperty(task.target, task.key, decoded)
      for (let index = items.length - 1; index >= 0; index -= 1) {
        tasks.push({
          key: index,
          kind: 'decode',
          path: `${task.path}[${index}]`,
          source: items[index],
          target: decoded
        })
      }
      continue
    }

    /** @brief 已验证源 object 数据属性 / Validated source-object data properties. */
    const properties = jsonObjectDataProperties(source, task.path)
    /** @brief 不含输入别名的目标 object / Destination object without aliases to the input. */
    const decoded: MutableJsonObject = {}
    defineJsonDataProperty(task.target, task.key, decoded)
    for (let index = properties.length - 1; index >= 0; index -= 1) {
      /** @brief 当前待调度数据属性 / Current data property to schedule. */
      const property = properties[index]
      if (property === undefined) continue
      tasks.push({
        key: property.key,
        kind: 'decode',
        path: `${task.path}.${property.key}`,
        source: property.value,
        target: decoded
      })
    }
  }

  return root.value
}

/**
 * @brief 解码并深复制严格 JSON object / Decode and deep-copy a strict JSON object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 JSON map / Validated JSON map.
 */
export function jsonObject(value: unknown, path: string): Readonly<Record<string, JsonValue>> {
  /** @brief 已解码 JSON 值 / Decoded JSON value. */
  const decoded = jsonValue(value, path)
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an object.`)
  }
  return decoded as Readonly<Record<string, JsonValue>>
}

/**
 * @brief 解码 API v2 namespaced Extensions 对象 / Decode an API v2 namespaced Extensions object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已复制且验证的扩展对象 / Copied and validated extension object.
 */
export function extensions(value: unknown, path: string): Readonly<Record<string, JsonValue>> {
  /** @brief 已复制的严格 JSON object / Copied strict JSON object. */
  const decoded = jsonObject(value, path)
  /** @brief 扩展属性名 / Extension property names. */
  const keys = Object.keys(decoded)
  if (keys.length > 32 || !keys.every((key) => EXTENSION_KEY_PATTERN.test(key))) {
    throw new ApiV2ContractError(`API v2 field ${path} contains invalid extension names.`)
  }
  return decoded
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
