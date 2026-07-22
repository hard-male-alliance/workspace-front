/** @file API v2 CurrentUser 资源消费者 / API v2 CurrentUser resource consumer. */

import type { ApiV2Client } from '../http/client'
import {
  booleanValue,
  boundedArray,
  boundedString,
  email,
  exactRecord,
  locale,
  opaqueId,
  parseResourceFields,
  strongEntityTag,
  stringValue,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

/** @brief OAuth scope 的 v2 冻结格式 / Frozen v2 OAuth-scope format. */
const SCOPE_PATTERN = /^[a-z][a-z0-9_.:-]+$/u

/** @brief 当前 OAuth principal 的 v2 产品投影 / v2 product projection of the current OAuth principal. */
export interface CurrentUser extends ResourceFields {
  /** @brief 固定 issuer 下的 OIDC subject / OIDC subject beneath the fixed issuer. */
  readonly subject: string
  /** @brief 当前账户邮箱 / Current account email. */
  readonly email: string
  /** @brief 邮箱是否已验证 / Whether the email is verified. */
  readonly email_verified: boolean
  /** @brief 用户显示名称 / User display name. */
  readonly display_name: string
  /** @brief 用户界面 Locale / User-interface locale. */
  readonly locale: string
  /** @brief 默认 Workspace 界面偏好 / Default-Workspace UI preference. */
  readonly default_workspace_id: string | null
  /** @brief 当前 token 授予的 scopes / Scopes granted to the current token. */
  readonly scopes: readonly string[]
}

/** @brief 带强 ETag 的 CurrentUser HTTP 表示 / CurrentUser HTTP representation with a strong ETag. */
export interface CurrentUserRepresentation {
  /** @brief 已验证当前用户资源 / Validated current-user resource. */
  readonly value: CurrentUser
  /** @brief 后续 PATCH 使用的强 If-Match 校验器 / Strong validator for a later PATCH If-Match. */
  readonly etag: string
}

/**
 * @brief 解码一个 OAuth scope / Decode one OAuth scope.
 * @param value 未知 scope / Unknown scope.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 scope / Validated scope.
 */
function scope(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = stringValue(value, path)
  if (!SCOPE_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be an OAuth scope.`)
  }
  return decoded
}

/**
 * @brief 严格解码 CurrentUser / Strictly decode CurrentUser.
 * @param value 未经信任的 `/me` JSON / Untrusted `/me` JSON.
 * @return 已验证 CurrentUser / Validated CurrentUser.
 */
export function parseCurrentUser(value: unknown): CurrentUser {
  /** @brief 精确 CurrentUser 对象 / Exact CurrentUser object. */
  const input = exactRecord(value, 'current_user', [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'subject',
    'email',
    'email_verified',
    'display_name',
    'locale',
    'default_workspace_id',
    'scopes'
  ])
  /** @brief 未映射 scopes / Unmapped scopes. */
  const rawScopes = boundedArray(input.scopes, 'current_user.scopes', Number.MAX_SAFE_INTEGER)
  /** @brief 已验证 scopes / Validated scopes. */
  const scopes = rawScopes.map((item, index) => scope(item, `current_user.scopes[${index}]`))
  if (new Set(scopes).size !== scopes.length) {
    throw new ApiV2ContractError('API v2 field current_user.scopes must contain unique items.')
  }
  return {
    ...parseResourceFields(input, 'current_user'),
    default_workspace_id:
      input.default_workspace_id === null
        ? null
        : opaqueId(input.default_workspace_id, 'current_user.default_workspace_id'),
    display_name: boundedString(input.display_name, 'current_user.display_name', 1, 120),
    email: email(input.email, 'current_user.email'),
    email_verified: booleanValue(input.email_verified, 'current_user.email_verified'),
    locale: locale(input.locale, 'current_user.locale'),
    scopes,
    subject: boundedString(input.subject, 'current_user.subject', 1, 255)
  }
}

/** @brief v2 CurrentUser 读取 Gateway / v2 CurrentUser read gateway. */
export class CurrentUserGateway {
  /** @brief API v2 HTTP 边界 / API v2 HTTP boundary. */
  readonly #client: ApiV2Client

  /**
   * @brief 构造 CurrentUser Gateway / Construct the CurrentUser gateway.
   * @param client v2-only Bearer 客户端 / v2-only Bearer client.
   */
  constructor(client: ApiV2Client) {
    this.#client = client
  }

  /**
   * @brief 读取当前用户权威资源 / Read the authoritative current-user resource.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 当前 OAuth principal 与强 ETag / Current OAuth principal and its strong ETag.
   */
  async getCurrentUser(signal?: AbortSignal): Promise<CurrentUserRepresentation> {
    /** @brief `/me` 原始响应 / Raw `/me` response. */
    const response = await this.#client.getJson('/me', {
      maxResponseBytes: 64 * 1024,
      ...(signal === undefined ? {} : { signal })
    })
    return {
      etag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
      value: parseCurrentUser(response.data)
    }
  }
}
