/** @file Workspace HTTP JSON 的运行时校验 / Runtime validation for Workspace HTTP JSON. */

import {
  array,
  boundedString,
  exactRecord,
  extensions,
  opaqueId,
  parseCursorPage,
  positiveInteger,
  stableCode,
  string,
  timestamp,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type { CurrentUserDto, WorkspaceDto } from './transport-types'

/** @brief Locale 的冻结结构格式 / Frozen structural format for Locale. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u

/** @brief Workspace slug 的冻结格式 / Frozen Workspace-slug format. */
const WORKSPACE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/u

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
 * @brief 校验 Workspace 资源 / Validate a Workspace resource.
 * @param value 未知 Workspace JSON / Unknown Workspace JSON.
 * @param path 字段路径 / Field path.
 * @return 已验证 Workspace DTO / Validated Workspace DTO.
 */
function parseWorkspace(value: unknown, path: string): WorkspaceDto {
  /** @brief 精确 Workspace 对象 / Exact Workspace object. */
  const input = exactRecord(value, path, [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'name',
    'slug',
    'default_locale',
    'timezone',
    'plan',
    'extensions'
  ])
  /** @brief 已验证 slug / Validated slug. */
  const slug = string(input.slug, `${path}.slug`)
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) {
    throw new HttpContractError(`Backend field ${path}.slug has an invalid format.`, 200)
  }
  if (input.extensions !== undefined) extensions(input.extensions, `${path}.extensions`)
  return {
    created_at: timestamp(input.created_at, `${path}.created_at`),
    default_locale: locale(input.default_locale, `${path}.default_locale`),
    id: opaqueId(input.id, `${path}.id`),
    name: boundedString(input.name, `${path}.name`, 1, 200),
    plan: stableCode(input.plan, `${path}.plan`),
    revision: positiveInteger(input.revision, `${path}.revision`),
    slug,
    timezone: boundedString(input.timezone, `${path}.timezone`, 1, 100),
    updated_at: timestamp(input.updated_at, `${path}.updated_at`)
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

/**
 * @brief 校验 Workspace 列表 / Validate a Workspace list.
 * @param value 未知列表 JSON / Unknown list JSON.
 * @return 已验证分页 DTO / Validated paginated DTO.
 */
export function parseWorkspaceListDto(value: unknown): PaginatedDto<WorkspaceDto> {
  /** @brief 列表响应对象 / List-response object. */
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) =>
      parseWorkspace(item, `items[${index}]`)
    ),
    page: parseCursorPage(input.page)
  }
}
