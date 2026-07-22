/** @file API v2 WorkspaceAccess 集合消费者 / API v2 WorkspaceAccess collection consumer. */

import type { ApiV2Client } from '../http/client'
import {
  boundedArray,
  boundedInteger,
  boundedString,
  exactRecord,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  type CursorCollection,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

/** @brief Workspace 套餐 / Workspace plan. */
export type WorkspacePlan = 'personal' | 'team' | 'enterprise'

/** @brief Workspace 数据区域 / Workspace data region. */
export type WorkspaceDataRegion = 'cn' | 'global' | 'private_deployment'

/** @brief Workspace 成员角色 / Workspace membership role. */
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

/** @brief API v2 Workspace 资源 / API v2 Workspace resource. */
export interface Workspace extends ResourceFields {
  /** @brief Workspace 名称 / Workspace name. */
  readonly name: string
  /** @brief 人类可读 slug / Human-readable slug. */
  readonly slug: string
  /** @brief 产品套餐 / Product plan. */
  readonly plan: WorkspacePlan
  /** @brief 数据驻留区域 / Data-residency region. */
  readonly data_region: WorkspaceDataRegion
}

/** @brief 当前 principal 的单项 Workspace 访问权威 / One Workspace-access authority for the current principal. */
export interface WorkspaceAccess {
  /** @brief 可访问 Workspace / Accessible Workspace. */
  readonly workspace: Workspace
  /** @brief 当前成员记录 ID / Current membership-record ID. */
  readonly member_id: string
  /** @brief 当前成员角色 / Current membership role. */
  readonly role: WorkspaceRole
}

/** @brief WorkspaceAccess 单页查询 / One-page WorkspaceAccess query. */
export interface WorkspaceAccessPageRequest {
  /** @brief 前一页返回的不透明 cursor / Opaque cursor returned by the previous page. */
  readonly cursor?: string | null
  /** @brief 每页条目数，默认 50 / Items per page, defaulting to 50. */
  readonly limit?: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief Workspace slug 的冻结格式 / Frozen Workspace-slug format. */
const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u

/**
 * @brief 断言字符串属于闭合枚举 / Assert that a string belongs to a closed enum.
 * @template TValue 枚举值类型 / Enum-value type.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowed 允许值 / Allowed values.
 * @return 已验证枚举值 / Validated enum value.
 */
function closedEnum<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[]
): TValue {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 1, 100)
  if (!allowed.includes(decoded as TValue)) {
    throw new ApiV2ContractError(`API v2 field ${path} contains an unknown enum value.`)
  }
  return decoded as TValue
}

/**
 * @brief 严格解码 Workspace / Strictly decode Workspace.
 * @param value 未知 Workspace / Unknown Workspace.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Workspace / Validated Workspace.
 */
function parseWorkspace(value: unknown, path: string): Workspace {
  /** @brief 精确 Workspace 对象 / Exact Workspace object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'name',
    'slug',
    'plan',
    'data_region'
  ])
  /** @brief 已验证 slug / Validated slug. */
  const slug = boundedString(input.slug, `${path}.slug`, 1, 63)
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) {
    throw new ApiV2ContractError(`API v2 field ${path}.slug has an invalid format.`)
  }
  return {
    ...parseResourceFields(input, path),
    data_region: closedEnum(input.data_region, `${path}.data_region`, [
      'cn',
      'global',
      'private_deployment'
    ]),
    name: boundedString(input.name, `${path}.name`, 1, 120),
    plan: closedEnum(input.plan, `${path}.plan`, ['personal', 'team', 'enterprise']),
    slug
  }
}

/**
 * @brief 严格解码 WorkspaceAccess / Strictly decode WorkspaceAccess.
 * @param value 未知访问项 / Unknown access item.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证访问项 / Validated access item.
 */
function parseWorkspaceAccess(value: unknown, path: string): WorkspaceAccess {
  /** @brief 精确 WorkspaceAccess 对象 / Exact WorkspaceAccess object. */
  const input = exactRecord(value, path, ['workspace', 'member_id', 'role'])
  return {
    member_id: opaqueId(input.member_id, `${path}.member_id`),
    role: closedEnum(input.role, `${path}.role`, ['owner', 'admin', 'editor', 'viewer']),
    workspace: parseWorkspace(input.workspace, `${path}.workspace`)
  }
}

/**
 * @brief 严格解码 WorkspaceList / Strictly decode WorkspaceList.
 * @param value 未知列表响应 / Unknown list response.
 * @return 已验证列表页面 / Validated list page.
 */
export function parseWorkspaceList(value: unknown): CursorCollection<WorkspaceAccess> {
  /** @brief 精确集合对象 / Exact collection object. */
  const input = exactRecord(value, 'workspace_list', ['items', 'page'])
  /** @brief 未映射访问项 / Unmapped access items. */
  const items = boundedArray(input.items, 'workspace_list.items', 200)
  return {
    items: items.map((item, index) => parseWorkspaceAccess(item, `workspace_list.items[${index}]`)),
    page: parseCursorPage(input.page, 'workspace_list.page')
  }
}

/**
 * @brief 读取当前 principal 的一页 WorkspaceAccess / Read one WorkspaceAccess page for the current principal.
 * @param client v2-only Bearer 客户端 / v2-only Bearer client.
 * @param request opaque cursor、limit 与取消信号 / Opaque cursor, limit, and cancellation signal.
 * @return 服务端授权的访问页 / Access page authorized by the server.
 */
export async function listWorkspaceAccessPage(
  client: ApiV2Client,
  request: WorkspaceAccessPageRequest = {}
): Promise<CursorCollection<WorkspaceAccess>> {
  /** @brief 已验证页大小 / Validated page size. */
  const limit =
    request.limit === undefined ? 50 : boundedInteger(request.limit, 'request.limit', 1, 200)
  /** @brief 已验证 cursor / Validated cursor. */
  const cursor =
    request.cursor === undefined || request.cursor === null
      ? null
      : boundedString(request.cursor, 'request.cursor', 1, 2048)
  /** @brief 当前 WorkspaceList 页响应 / Current WorkspaceList page response. */
  const response = await client.getJson('/workspaces', {
    maxResponseBytes: 512 * 1024,
    query: { cursor, limit },
    ...(request.signal === undefined ? {} : { signal: request.signal })
  })
  return parseWorkspaceList(response.data)
}
