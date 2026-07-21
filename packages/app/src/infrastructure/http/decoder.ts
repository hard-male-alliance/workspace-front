/** @file 未知 HTTP JSON 的低级解码原语 / Low-level decoding primitives for unknown HTTP JSON. */

import { HttpContractError } from './http-client'

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
  const input = record(value, 'page')
  const hasMore = boolean(input.has_more, 'page.has_more')
  const nextCursor = nullableString(input.next_cursor, 'page.next_cursor')
  if (hasMore && nextCursor === null) {
    throw new HttpContractError(
      'Backend page.next_cursor is required when page.has_more is true.',
      200
    )
  }
  return {
    has_more: hasMore,
    next_cursor: nextCursor,
    total_estimate: nullableNumber(input.total_estimate, 'page.total_estimate')
  }
}
