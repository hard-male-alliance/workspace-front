/** @file API v2 RFC 9457 ProblemDetails 严格解码 / Strict API v2 RFC 9457 ProblemDetails decoding. */

import {
  booleanValue,
  boundedArray,
  boundedInteger,
  boundedString,
  exactRecord,
  extensions,
  httpsUrl,
  opaqueId,
  record,
  stableCode
} from './contract'
import { ApiV2ContractError } from './errors'

/** @brief URI-reference 允许的 RFC 3986 ASCII 字符 / RFC 3986 ASCII characters permitted in a URI-reference. */
const URI_REFERENCE_PATTERN = /^(?:[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/u

/** @brief ProblemFieldError 的客户端只读投影 / Client read projection of ProblemFieldError. */
export interface ProblemFieldError {
  /** @brief JSON Pointer 或协议字段路径 / JSON Pointer or protocol-field path. */
  readonly pointer: string
  /** @brief 稳定字段错误 code / Stable field-error code. */
  readonly code: string
  /** @brief 可选本地化消息键 / Optional localization message key. */
  readonly message_key: string | null
  /** @brief 可选低敏感插值参数 / Optional low-sensitivity interpolation parameters. */
  readonly params: Readonly<Record<string, string | number | boolean | null>> | null
}

/** @brief API v2 ProblemDetails 的完整已验证投影 / Complete validated API v2 ProblemDetails projection. */
export interface ProblemDetails {
  /** @brief 可文档化 HTTPS Problem 类型 / Documentable HTTPS Problem type. */
  readonly type: string
  /** @brief 人类诊断标题；客户端不得据此决策 / Human diagnostic title; clients must not branch on it. */
  readonly title: string
  /** @brief HTTP 状态 / HTTP status. */
  readonly status: number
  /** @brief 稳定机器 code / Stable machine-readable code. */
  readonly code: string
  /** @brief 请求关联 ID / Request-correlation ID. */
  readonly request_id: string
  /** @brief 服务端声明的可重试性 / Retryability declared by the server. */
  readonly retryable: boolean
  /** @brief 结构化字段错误 / Structured field errors. */
  readonly errors: readonly ProblemFieldError[]
  /** @brief 可选人类诊断详情 / Optional human diagnostic detail. */
  readonly detail: string | null
  /** @brief 可选问题实例 URI-reference / Optional problem-instance URI-reference. */
  readonly instance: string | null
  /** @brief 可选 namespaced 扩展 / Optional namespaced extensions. */
  readonly extensions: Readonly<Record<string, unknown>> | null
}

/**
 * @brief 校验 URI-reference / Validate an RFC 3986 URI-reference.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 URI-reference / Validated URI-reference.
 */
function uriReference(value: unknown, path: string): string {
  /** @brief 已确认字符串 / Confirmed string. */
  const decoded = boundedString(value, path, 0, 2048)
  if (!URI_REFERENCE_PATTERN.test(decoded) || decoded.indexOf('#') !== decoded.lastIndexOf('#')) {
    throw new ApiV2ContractError(`API v2 field ${path} must be a URI-reference.`)
  }
  try {
    new URL(decoded, 'https://contract.invalid/')
  } catch {
    throw new ApiV2ContractError(`API v2 field ${path} must be a URI-reference.`)
  }
  return decoded
}

/**
 * @brief 解码 ProblemFieldError.params / Decode ProblemFieldError.params.
 * @param value 未知参数对象 / Unknown params object.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 primitive 参数 / Validated primitive parameters.
 */
function parseProblemParameters(
  value: unknown,
  path: string
): Readonly<Record<string, string | number | boolean | null>> {
  /** @brief 待检查参数对象 / Parameter object to inspect. */
  const input = record(value, path)
  if (Object.keys(input).length > 20) {
    throw new ApiV2ContractError(`API v2 field ${path} has too many properties.`)
  }
  /** @brief 已验证参数投影 / Validated parameter projection. */
  const parsed: Record<string, string | number | boolean | null> = {}
  for (const [key, item] of Object.entries(input)) {
    if (
      item !== null &&
      typeof item !== 'string' &&
      typeof item !== 'boolean' &&
      !(typeof item === 'number' && Number.isFinite(item))
    ) {
      throw new ApiV2ContractError(`API v2 field ${path}.${key} must be a primitive value.`)
    }
    parsed[key] = item
  }
  return parsed
}

/**
 * @brief 解码单个 ProblemFieldError / Decode one ProblemFieldError.
 * @param value 未知字段错误 / Unknown field error.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证字段错误 / Validated field error.
 */
function parseProblemFieldError(value: unknown, path: string): ProblemFieldError {
  /** @brief 精确字段错误对象 / Exact field-error object. */
  const input = exactRecord(value, path, ['pointer', 'code', 'message_key', 'params'])
  return {
    code: stableCode(input.code, `${path}.code`),
    message_key:
      input.message_key === undefined || input.message_key === null
        ? null
        : boundedString(input.message_key, `${path}.message_key`, 0, 200),
    params:
      input.params === undefined ? null : parseProblemParameters(input.params, `${path}.params`),
    pointer: boundedString(input.pointer, `${path}.pointer`, 0, 1024)
  }
}

/**
 * @brief 严格解析 API v2 ProblemDetails / Strictly parse API v2 ProblemDetails.
 * @param value 未经信任的响应 JSON / Untrusted response JSON.
 * @param responseStatus 实际 HTTP 响应状态 / Actual HTTP response status.
 * @return 已完整验证的 Problem / Fully validated Problem.
 * @throws ApiV2ContractError 响应不是唯一 v2 Problem 形状时抛出 / Thrown when the response is not the sole v2 Problem shape.
 */
export function parseProblemDetails(value: unknown, responseStatus: number): ProblemDetails {
  /** @brief 精确 Problem 对象 / Exact Problem object. */
  const input = exactRecord(value, 'problem', [
    'type',
    'title',
    'status',
    'detail',
    'instance',
    'code',
    'request_id',
    'retryable',
    'errors',
    'extensions'
  ])
  /** @brief Problem 声明的 HTTP 状态 / HTTP status declared by the Problem. */
  const status = boundedInteger(input.status, 'problem.status', 400, 599)
  if (status !== responseStatus) {
    throw new ApiV2ContractError(
      'API v2 problem.status must equal the HTTP response status.',
      responseStatus
    )
  }
  /** @brief 未映射的字段错误数组 / Unmapped field-error array. */
  const errors = boundedArray(input.errors, 'problem.errors', 100)
  return {
    code: stableCode(input.code, 'problem.code'),
    detail:
      input.detail === undefined || input.detail === null
        ? null
        : boundedString(input.detail, 'problem.detail', 0, 2000),
    errors: errors.map((error, index) => parseProblemFieldError(error, `problem.errors[${index}]`)),
    extensions:
      input.extensions === undefined ? null : extensions(input.extensions, 'problem.extensions'),
    instance:
      input.instance === undefined || input.instance === null
        ? null
        : uriReference(input.instance, 'problem.instance'),
    request_id: opaqueId(input.request_id, 'problem.request_id'),
    retryable: booleanValue(input.retryable, 'problem.retryable'),
    status,
    title: boundedString(input.title, 'problem.title', 1, 200),
    type: httpsUrl(input.type, 'problem.type')
  }
}
