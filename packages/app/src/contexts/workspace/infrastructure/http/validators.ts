/** @file Workspace HTTP JSON 的运行时校验 / Runtime validation for Workspace HTTP JSON. */

import {
  array,
  exactRecord,
  nullableString,
  number,
  parseCursorPage,
  string,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type { CurrentUserDto, WorkspaceDto } from './transport-types'

/** @brief 已冻结的 Workspace 套餐代码 / Frozen Workspace plan codes. */
const WORKSPACE_PLANS: readonly WorkspaceDto['plan'][] = ['free', 'pro', 'team', 'enterprise']

/**
 * @brief 断言字符串属于有限契约集合 / Assert that a string belongs to a finite contract set.
 * @template TValue 字符串字面量类型 / String-literal type.
 * @param value 未知枚举值 / Unknown enum value.
 * @param path 字段路径 / Field path.
 * @param allowed 允许值 / Allowed values.
 * @return 已验证的枚举值 / Validated enum value.
 */
function enumeration<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[]
): TValue {
  /** @brief 已解码的字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!allowed.includes(decoded as TValue)) {
    throw new HttpContractError(`Backend field ${path} contains an unsupported value.`, 200)
  }
  return decoded as TValue
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
  return {
    created_at: string(input.created_at, `${path}.created_at`),
    default_locale: string(input.default_locale, `${path}.default_locale`),
    id: string(input.id, `${path}.id`),
    name: string(input.name, `${path}.name`),
    plan: enumeration(input.plan, `${path}.plan`, WORKSPACE_PLANS),
    revision: number(input.revision, `${path}.revision`),
    slug: string(input.slug, `${path}.slug`),
    timezone: string(input.timezone, `${path}.timezone`),
    updated_at: string(input.updated_at, `${path}.updated_at`)
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
  return {
    created_at: string(input.created_at, 'currentUser.created_at'),
    default_workspace_id:
      input.default_workspace_id === undefined
        ? null
        : nullableString(input.default_workspace_id, 'currentUser.default_workspace_id'),
    display_name: string(input.display_name, 'currentUser.display_name'),
    id: string(input.id, 'currentUser.id'),
    locale: string(input.locale, 'currentUser.locale'),
    timezone: string(input.timezone, 'currentUser.timezone')
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
