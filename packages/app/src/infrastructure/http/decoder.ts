/** @file 未知 HTTP JSON 的低级解码原语 / Low-level decoding primitives for unknown HTTP JSON. */

import { isAbsoluteUri, isRfc3339Timestamp } from '@ai-job-workspace/platform'

import { HttpContractError } from './http-client'

/** @brief 冻结契约的不透明 ID 格式 / Opaque-ID format from the frozen contract. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u

/** @brief 冻结契约的稳定 code 格式 / Stable-code format from the frozen contract. */
const STABLE_CODE_PATTERN = /^[a-z][a-z0-9_.-]*$/u

/** @brief Extensions 属性名格式 / Extensions property-name format. */
const EXTENSION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{2,127}$/u

/** @brief 不透明游标分页元数据 / Opaque cursor page metadata. */
export interface CursorPageDto {
  /** @brief 下一页的不透明游标 / Opaque cursor for the next page. */
  readonly next_cursor: string | null
  /** @brief 服务端是否仍有后续页面 / Whether the backend has another page. */
  readonly has_more: boolean
  /** @brief 可选的总数估算 / Optional estimated total. */
  readonly total_estimate: number | null
}

/** @brief 通用游标分页响应 / Generic cursor-paginated response. */
export interface PaginatedDto<TItem> {
  /** @brief 当前页面条目 / Items in the current page. */
  readonly items: readonly TItem[]
  /** @brief 当前页面元数据 / Metadata for the current page. */
  readonly page: CursorPageDto
}

/**
 * @brief 断言未知值为对象 / Assert that an unknown value is an object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码对象 / Decoded object.
 */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpContractError(`Backend field ${path} must be an object.`, 200)
  }
  return value as Record<string, unknown>
}

/**
 * @brief 断言对象不含契约外字段 / Assert that an object has no fields outside the contract.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowedKeys 允许的字段名 / Allowed field names.
 * @return 已解码对象 / Decoded object.
 */
export function exactRecord(
  value: unknown,
  path: string,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  const input = record(value, path)
  const unexpectedKey = Object.keys(input).find((key) => !allowedKeys.includes(key))
  if (unexpectedKey !== undefined) {
    throw new HttpContractError(`Backend field ${path}.${unexpectedKey} is not allowed.`, 200)
  }
  return input
}

/**
 * @brief 断言未知值为字符串 / Assert that an unknown value is a string.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码字符串 / Decoded string.
 */
export function string(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new HttpContractError(`Backend field ${path} must be a string.`, 200)
  }
  return value
}

/**
 * @brief 断言字符串长度位于冻结范围 / Assert that a string length is within frozen bounds.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumLength 最小长度 / Minimum length.
 * @param maximumLength 最大长度 / Maximum length.
 * @return 已验证字符串 / Validated string.
 */
export function boundedString(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  /** @brief JSON Schema 语义下的 Unicode 字符数 / Unicode character count under JSON Schema semantics. */
  const characterCount = [...decoded].length
  if (characterCount < minimumLength || characterCount > maximumLength) {
    throw new HttpContractError(
      `Backend field ${path} must contain between ${minimumLength} and ${maximumLength} characters.`,
      200
    )
  }
  return decoded
}

/**
 * @brief 断言未知值为布尔值 / Assert that an unknown value is a boolean.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码布尔值 / Decoded boolean.
 */
export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpContractError(`Backend field ${path} must be a boolean.`, 200)
  }
  return value
}

/**
 * @brief 断言未知值为有限数字 / Assert that an unknown value is a finite number.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码数字 / Decoded number.
 */
export function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpContractError(`Backend field ${path} must be a number.`, 200)
  }
  return value
}

/**
 * @brief 断言未知值为整数 / Assert that an unknown value is an integer.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码整数 / Decoded integer.
 */
export function integer(value: unknown, path: string): number {
  const decoded = number(value, path)
  if (!Number.isInteger(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be an integer.`, 200)
  }
  return decoded
}

/**
 * @brief 断言整数位于冻结闭区间 / Assert that an integer is within a frozen inclusive range.
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
  /** @brief 已解码整数 / Decoded integer. */
  const decoded = integer(value, path)
  if (decoded < minimum || decoded > maximum) {
    throw new HttpContractError(
      `Backend field ${path} must be between ${minimum} and ${maximum}.`,
      200
    )
  }
  return decoded
}

/**
 * @brief 断言数字位于冻结闭区间 / Assert that a number is within a frozen inclusive range.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimum 最小值 / Minimum value.
 * @param maximum 最大值 / Maximum value.
 * @return 已验证数字 / Validated number.
 */
export function boundedNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  /** @brief 已解码数字 / Decoded number. */
  const decoded = number(value, path)
  if (decoded < minimum || decoded > maximum) {
    throw new HttpContractError(
      `Backend field ${path} must be between ${minimum} and ${maximum}.`,
      200
    )
  }
  return decoded
}

/**
 * @brief 断言未知值为正整数 / Assert that an unknown value is a positive integer.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 大于等于 1 的整数 / Integer greater than or equal to one.
 */
export function positiveInteger(value: unknown, path: string): number {
  const decoded = integer(value, path)
  if (decoded < 1) {
    throw new HttpContractError(`Backend field ${path} must be at least 1.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为非负整数 / Assert that an unknown value is a non-negative integer.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 大于等于 0 的整数 / Integer greater than or equal to zero.
 */
export function nonNegativeInteger(value: unknown, path: string): number {
  const decoded = integer(value, path)
  if (decoded < 0) {
    throw new HttpContractError(`Backend field ${path} must be at least 0.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为冻结格式的不透明 ID / Assert that an unknown value is a frozen-format opaque ID.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证不透明 ID / Validated opaque ID.
 */
export function opaqueId(value: unknown, path: string): string {
  const decoded = string(value, path)
  if (!OPAQUE_ID_PATTERN.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be an opaque ID.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为稳定机器 code / Assert that an unknown value is a stable machine code.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 code / Validated code.
 */
export function stableCode(value: unknown, path: string): string {
  const decoded = string(value, path)
  if (!STABLE_CODE_PATTERN.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be a stable code.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为绝对 URI / Assert that an unknown value is an absolute URI.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 URI 字符串 / Validated URI string.
 */
export function absoluteUri(value: unknown, path: string): string {
  const decoded = string(value, path)
  if (!isAbsoluteUri(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be an absolute URI.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为 RFC 3339 时间戳 / Assert that an unknown value is an RFC 3339 timestamp.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证时间戳 / Validated timestamp.
 */
export function timestamp(value: unknown, path: string): string {
  const decoded = string(value, path)
  if (!isRfc3339Timestamp(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be an RFC 3339 timestamp.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为 SHA-256 十六进制摘要 / Assert that an unknown value is a hexadecimal SHA-256 digest.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证摘要 / Validated digest.
 */
export function sha256(value: unknown, path: string): string {
  const decoded = string(value, path)
  if (!/^[a-fA-F0-9]{64}$/u.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be a SHA-256 digest.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为合法 Extensions bag / Assert that an unknown value is a valid Extensions bag.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证扩展对象 / Validated extensions object.
 */
export function extensions(value: unknown, path: string): Record<string, unknown> {
  const decoded = record(value, path)
  if (!Object.keys(decoded).every((key) => EXTENSION_KEY_PATTERN.test(key))) {
    throw new HttpContractError(`Backend field ${path} contains an invalid extension key.`, 200)
  }
  return decoded
}

/**
 * @brief 断言未知值为数组 / Assert that an unknown value is an array.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已解码数组 / Decoded array.
 */
export function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpContractError(`Backend field ${path} must be an array.`, 200)
  }
  return value
}

/**
 * @brief 断言数组长度位于冻结范围 / Assert that an array length is within frozen bounds.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目数 / Minimum item count.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @return 已验证数组 / Validated array.
 */
export function boundedArray(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number
): readonly unknown[] {
  /** @brief 已解码数组 / Decoded array. */
  const decoded = array(value, path)
  if (decoded.length < minimumItems || decoded.length > maximumItems) {
    throw new HttpContractError(
      `Backend field ${path} must contain between ${minimumItems} and ${maximumItems} items.`,
      200
    )
  }
  return decoded
}

/**
 * @brief 解码可空字符串 / Decode a nullable string.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 字符串或 null / String or null.
 */
export function nullableString(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : string(value, path)
}

/**
 * @brief 解码可空数字 / Decode a nullable number.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 数字或 null / Number or null.
 */
export function nullableNumber(value: unknown, path: string): number | null {
  return value === null || value === undefined ? null : number(value, path)
}

/**
 * @brief 解码可空对象 / Decode a nullable object.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 对象或 null / Object or null.
 */
export function nullableRecord(value: unknown, path: string): Record<string, unknown> | null {
  return value === null || value === undefined ? null : record(value, path)
}

/**
 * @brief 解码字符串数组 / Decode an array of strings.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 字符串数组 / Array of strings.
 */
export function stringArray(value: unknown, path: string): readonly string[] {
  return array(value, path).map((item, index): string => string(item, `${path}[${index}]`))
}

/**
 * @brief 解码游标分页元数据 / Decode cursor-page metadata.
 * @param value 未知输入 / Unknown input.
 * @return 已验证分页元数据 / Validated page metadata.
 */
export function parseCursorPage(value: unknown): CursorPageDto {
  /** @brief 精确分页对象 / Exact pagination object. */
  const input = exactRecord(value, 'page', ['next_cursor', 'has_more', 'total_estimate'])
  const hasMore = boolean(input.has_more, 'page.has_more')
  /** @brief 可选的下一页游标 / Optional next-page cursor. */
  const nextCursor =
    input.next_cursor === null || input.next_cursor === undefined
      ? null
      : boundedString(input.next_cursor, 'page.next_cursor', 1, 2048)
  if (hasMore && nextCursor === null) {
    throw new HttpContractError(
      'Backend page.next_cursor is required when page.has_more is true.',
      200
    )
  }
  return {
    has_more: hasMore,
    next_cursor: nextCursor,
    total_estimate:
      input.total_estimate === null || input.total_estimate === undefined
        ? null
        : nonNegativeInteger(input.total_estimate, 'page.total_estimate')
  }
}
