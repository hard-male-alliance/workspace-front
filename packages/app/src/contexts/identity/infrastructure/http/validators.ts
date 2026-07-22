/** @file Identity v1 HTTP JSON 的运行时校验 / Runtime validation for Identity v1 HTTP JSON. */

import {
  boundedString,
  exactRecord,
  opaqueId,
  string,
  timestamp
} from '../../../../infrastructure/http/decoder'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type { CurrentUserDto } from './transport-types'

/** @brief Locale 的冻结结构格式 / Frozen structural format for Locale. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u

/** @brief Email format 的保守结构校验 / Conservative structural validation for the email format. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u

/**
 * @brief 校验 Locale 结构 / Validate a Locale structure.
 * @param value 未知输入 / Unknown input.
 * @param path 字段路径 / Field path.
 * @return 已验证 Locale / Validated Locale.
 */
function locale(value: unknown, path: string): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!LOCALE_PATTERN.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be a locale code.`, 200)
  }
  return decoded
}

/**
 * @brief 校验可选邮箱字段 / Validate an optional email field.
 * @param value 未知邮箱 / Unknown email.
 * @param path 字段路径 / Field path.
 * @return 无返回值 / No return value.
 */
function validateNullableEmail(value: unknown, path: string): void {
  if (value === undefined || value === null) return
  /** @brief 已解码邮箱 / Decoded email. */
  const decoded = string(value, path)
  if (!EMAIL_PATTERN.test(decoded)) {
    throw new HttpContractError(`Backend field ${path} must be an email address.`, 200)
  }
}

/**
 * @brief 校验当前用户 / Validate the current user.
 * @param value 未知用户 JSON / Unknown user JSON.
 * @return 已验证用户 DTO / Validated user DTO.
 */
export function parseCurrentUserDto(value: unknown): CurrentUserDto {
  /** @brief 精确用户对象 / Exact user object. */
  const input = exactRecord(value, 'currentUser', [
    'id',
    'display_name',
    'email',
    'locale',
    'timezone',
    'default_workspace_id',
    'created_at'
  ])
  validateNullableEmail(input.email, 'currentUser.email')
  return {
    created_at: timestamp(input.created_at, 'currentUser.created_at'),
    default_workspace_id:
      input.default_workspace_id === undefined || input.default_workspace_id === null
        ? null
        : opaqueId(input.default_workspace_id, 'currentUser.default_workspace_id'),
    display_name: boundedString(input.display_name, 'currentUser.display_name', 1, 200),
    id: opaqueId(input.id, 'currentUser.id'),
    locale: locale(input.locale, 'currentUser.locale'),
    timezone: boundedString(input.timezone, 'currentUser.timezone', 1, 100)
  }
}
