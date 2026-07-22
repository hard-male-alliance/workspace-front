/** @file Resume API v2 wire 契约的严格解码原语 / Strict decoding primitives for Resume API v2 wire contracts. */

import { jsonObject, type JsonValue } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

export { jsonValue as parseResumeJsonValue } from '../http/contract'
export type { JsonValue as ResumeJsonValue } from '../http/contract'

/** @brief TemplateManifest key 的冻结格式 / Frozen TemplateManifest-key format. */
export const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,80}$/u

/** @brief TemplateManifest section kind 的冻结格式 / Frozen TemplateManifest section-kind format. */
export const TEMPLATE_SECTION_KIND_PATTERN = /^[a-z][a-z0-9_.-]{1,80}$/u

/**
 * @brief 解码可空字段 / Decode a nullable field.
 * @param value 未知输入 / Unknown input.
 * @param decoder 非空值 decoder / Decoder for a non-null value.
 * @return null 或已验证值 / Null or the validated value.
 */
export function nullable<TValue>(
  value: unknown,
  decoder: (candidate: unknown) => TValue
): TValue | null {
  return value === null ? null : decoder(value)
}

/**
 * @brief 解码最多包含指定属性数的 JSON object / Decode a JSON object with a property-count ceiling.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumProperties 最大属性数 / Maximum property count.
 * @return 已验证 JSON map / Validated JSON map.
 */
export function parseJsonMap(
  value: unknown,
  path: string,
  maximumProperties: number
): Readonly<Record<string, JsonValue>> {
  /** @brief 已复制的严格 JSON object / Copied strict JSON object. */
  const decoded = jsonObject(value, path)
  if (Object.keys(decoded).length > maximumProperties) {
    throw new ApiV2ContractError(
      `API v2 field ${path} must contain at most ${maximumProperties} properties.`
    )
  }
  return decoded
}

/**
 * @brief 断言字符串数组无重复 / Assert that a string array has no duplicates.
 * @param values 已解码字符串 / Decoded strings.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
export function assertUniqueStrings(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new ApiV2ContractError(`API v2 field ${path} must contain unique items.`)
  }
}

/**
 * @brief 断言对象身份 key 无重复 / Assert that object identity keys have no duplicates.
 * @param values 待检查对象 / Objects to inspect.
 * @param keyOf 身份 key 投影 / Identity-key projection.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
export function assertUniqueBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
  path: string
): void {
  /** @brief 已观察身份 keys / Identity keys already observed. */
  const seen = new Set<string>()
  for (const value of values) {
    /** @brief 当前身份 key / Current identity key. */
    const key = keyOf(value)
    if (seen.has(key)) {
      throw new ApiV2ContractError(`API v2 field ${path} contains duplicate identity ${key}.`)
    }
    seen.add(key)
  }
}

/**
 * @brief 判断严格 JSON 值是否为只读数组 / Determine whether a strict JSON value is a read-only array.
 * @param value 待判断 JSON 值 / JSON value to inspect.
 * @return 数组时为 true / True for an array.
 */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value)
}

/**
 * @brief 按 JSON 数据模型比较两个值 / Compare two values under the JSON data model.
 * @param left 左值 / Left value.
 * @param right 右值 / Right value.
 * @return JSON 结构和值相等时为 true / True when JSON structure and values are equal.
 */
export function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  /** @brief 待比较 JSON 节点对 / JSON node pairs awaiting comparison. */
  const pending: Array<readonly [JsonValue, JsonValue]> = [[left, right]]
  while (pending.length > 0) {
    /** @brief 当前 JSON 节点对 / Current JSON node pair. */
    const pair = pending.pop()
    if (pair === undefined) break
    /** @brief 当前左值 / Current left value. */
    const [leftValue, rightValue] = pair
    if (leftValue === rightValue) continue

    if (isJsonArray(leftValue)) {
      if (!isJsonArray(rightValue) || leftValue.length !== rightValue.length) return false
      for (let index = 0; index < leftValue.length; index += 1) {
        /** @brief 同一位置左侧 item / Left-side item at the current position. */
        const leftItem = leftValue[index]
        /** @brief 同一位置右侧 item / Right-side item at the current position. */
        const rightItem = rightValue[index]
        if (leftItem === undefined || rightItem === undefined) return false
        pending.push([leftItem, rightItem])
      }
      continue
    }
    if (isJsonArray(rightValue)) return false

    if (
      leftValue === null ||
      rightValue === null ||
      typeof leftValue !== 'object' ||
      typeof rightValue !== 'object'
    ) {
      return false
    }
    /** @brief 左对象 keys / Left object keys. */
    const leftKeys = Object.keys(leftValue)
    /** @brief 右对象 keys / Right object keys. */
    const rightKeys = Object.keys(rightValue)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.hasOwn(rightValue, key)) return false
      /** @brief 当前左属性值 / Current left property value. */
      const leftItem = leftValue[key]
      /** @brief 当前右属性值 / Current right property value. */
      const rightItem = rightValue[key]
      if (leftItem === undefined || rightItem === undefined) return false
      pending.push([leftItem, rightItem])
    }
  }
  return true
}
