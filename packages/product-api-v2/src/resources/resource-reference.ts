/** @file API v2 跨领域资源引用值对象 / API v2 cross-domain resource-reference value object. */

import { boundedInteger, boundedString, exactRecord, opaqueId } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'

/** @brief ResourceRef.resource_type 的冻结格式 / Frozen ResourceRef.resource_type format. */
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{2,100}$/u

/** @brief API v2 资源引用 / API v2 resource reference. */
export interface ResourceReference {
  /** @brief 服务器定义的稳定资源类型 / Stable server-defined resource type. */
  readonly resource_type: string
  /** @brief 不透明资源 ID / Opaque resource ID. */
  readonly id: string
  /** @brief 可选领域修订号；保留省略与 null 的区别 / Optional domain revision, preserving the distinction between omission and null. */
  readonly revision?: number | null
}

/**
 * @brief 校验稳定资源类型 / Validate a stable resource type.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证资源类型 / Validated resource type.
 */
export function resourceType(value: unknown, path: string): string {
  /** @brief 长度已验证的候选值 / Length-validated candidate. */
  const decoded = boundedString(value, path, 3, 101)
  if (!RESOURCE_TYPE_PATTERN.test(decoded)) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a stable resource type.`)
  }
  return decoded
}

/**
 * @brief 严格解码 ResourceRef / Strictly decode a ResourceRef.
 * @param value 未知资源引用 / Unknown resource reference.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无损的已验证引用 / Lossless validated reference.
 */
export function parseResourceReference(value: unknown, path: string): ResourceReference {
  /** @brief 精确 ResourceRef 对象 / Exact ResourceRef object. */
  const input = exactRecord(value, path, ['resource_type', 'id', 'revision'])
  /** @brief 引用的必需字段 / Required reference fields. */
  const required = {
    id: opaqueId(input.id, `${path}.id`),
    resource_type: resourceType(input.resource_type, `${path}.resource_type`)
  }
  if (!Object.hasOwn(input, 'revision')) return required
  return {
    ...required,
    revision:
      input.revision === null
        ? null
        : boundedInteger(input.revision, `${path}.revision`, 1, Number.MAX_SAFE_INTEGER)
  }
}
