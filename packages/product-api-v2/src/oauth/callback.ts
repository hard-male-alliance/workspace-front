/** @file OAuth 授权回调的混淆与 CSRF 防线 / Mix-up and CSRF defenses for OAuth authorization callbacks. */

import { ApiV2ContractError } from '../http/errors'
import {
  assertActiveWebAuthorizationTransaction,
  type WebAuthorizationTransaction
} from './authorization'
import { OAuthAuthorizationResponseError } from './errors'

/** @brief Authorization response 允许的动态参数 / Dynamic parameters allowed in an authorization response. */
const RESPONSE_PARAMETERS = new Set([
  'code',
  'error',
  'error_description',
  'error_uri',
  'iss',
  'state'
])

/** @brief OAuth error code 语法 / OAuth error-code syntax. */
const OAUTH_ERROR_PATTERN = /^[a-z][a-z0-9_]{2,80}$/u

/** @brief 已校验的一次性 authorization code / Validated one-time authorization code. */
export interface AuthorizationCodeResponse {
  /** @brief 一次性 code / One-time code. */
  readonly code: string
}

/**
 * @brief 使用固定工作量比较两个短关联值 / Compare two short correlation values with fixed work.
 * @param left 预期值 / Expected value.
 * @param right 实际值 / Actual value.
 * @return 是否相等 / Whether values match.
 */
function correlationMatches(left: string, right: string): boolean {
  /** @brief 两个值覆盖的最大长度 / Maximum length covered by both values. */
  const length = Math.max(left.length, right.length)
  /** @brief 累积差异，包含长度 / Accumulated difference including length. */
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

/**
 * @brief 读取恰好出现一次的回调参数 / Read a callback parameter occurring exactly once.
 * @param url 回调 URL / Callback URL.
 * @param name 参数名 / Parameter name.
 * @param required 是否必需 / Whether required.
 * @return 参数值或 null / Parameter value or null.
 */
function singleParameter(url: URL, name: string, required: boolean): string | null {
  /** @brief 同名参数值 / Values with the same name. */
  const values = url.searchParams.getAll(name)
  if (values.length > 1 || (required && values.length !== 1)) {
    throw new ApiV2ContractError(`OAuth callback parameter ${name} must occur exactly once.`)
  }
  return values[0] ?? null
}

/**
 * @brief 校验 callback 仍指向精确注册 redirect / Validate that the callback still targets the exact registered redirect.
 * @param callback 实际 callback / Actual callback.
 * @param redirect 注册 redirect / Registered redirect.
 */
function assertRedirectTarget(callback: URL, redirect: URL): void {
  if (
    callback.origin !== redirect.origin ||
    callback.pathname !== redirect.pathname ||
    callback.hash !== '' ||
    callback.username !== '' ||
    callback.password !== ''
  ) {
    throw new ApiV2ContractError('OAuth callback does not match the registered redirect URI.')
  }
  /** @brief 注册 URI 中固定 query 的多重集合 / Multiset of fixed query values in the registered URI. */
  const expectedStatic = new Map<string, readonly string[]>()
  for (const key of new Set(redirect.searchParams.keys())) {
    expectedStatic.set(key, redirect.searchParams.getAll(key))
  }
  for (const [key, values] of expectedStatic) {
    /** @brief callback 中的同名值 / Corresponding callback values. */
    const actualValues = callback.searchParams.getAll(key)
    if (
      actualValues.length !== values.length ||
      values.some((value, index) => actualValues[index] !== value)
    ) {
      throw new ApiV2ContractError('OAuth callback changed the registered redirect query.')
    }
  }
  for (const key of callback.searchParams.keys()) {
    if (!expectedStatic.has(key) && !RESPONSE_PARAMETERS.has(key)) {
      throw new ApiV2ContractError(`OAuth callback parameter ${key} is not allowed.`)
    }
  }
}

/**
 * @brief 解析回调并在错误分支之前校验 state 与 issuer / Parse a callback and validate state and issuer before its error branch.
 * @param callbackUrl 浏览器当前回调 URL / Browser's current callback URL.
 * @param transaction 内存中的原始授权事务 / Original in-memory authorization transaction.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @return 已校验 authorization code / Validated authorization code.
 */
export function parseAuthorizationCallback(
  callbackUrl: string,
  transaction: WebAuthorizationTransaction,
  nowEpochSeconds: number = Date.now() / 1000
): AuthorizationCodeResponse {
  assertActiveWebAuthorizationTransaction(transaction, nowEpochSeconds)
  /** @brief 实际 callback URL / Actual callback URL. */
  let callback: URL
  try {
    callback = new URL(callbackUrl)
  } catch {
    throw new ApiV2ContractError('OAuth callback URL is invalid.')
  }
  /** @brief 注册 redirect URL / Registered redirect URL. */
  const redirect = new URL(transaction.redirectUri)
  assertRedirectTarget(callback, redirect)
  /** @brief 返回的 state / Returned state. */
  const state = singleParameter(callback, 'state', true) ?? ''
  if (!correlationMatches(transaction.state, state)) {
    throw new ApiV2ContractError(
      'OAuth callback state does not match the authorization transaction.'
    )
  }
  /** @brief RFC 9207 issuer / RFC 9207 issuer. */
  const issuer = singleParameter(callback, 'iss', true) ?? ''
  if (!correlationMatches(transaction.issuer, issuer)) {
    throw new ApiV2ContractError(
      'OAuth callback issuer does not match the authorization transaction.'
    )
  }
  /** @brief OAuth error code / OAuth error code. */
  const error = singleParameter(callback, 'error', false)
  /** @brief Authorization code / Authorization code. */
  const code = singleParameter(callback, 'code', false)
  /** @brief 可选 error_description / Optional error_description. */
  const errorDescription = singleParameter(callback, 'error_description', false)
  /** @brief 可选 error_uri / Optional error_uri. */
  const errorUri = singleParameter(callback, 'error_uri', false)
  if (error !== null) {
    if (code !== null || !OAUTH_ERROR_PATTERN.test(error)) {
      throw new ApiV2ContractError('OAuth callback error response is malformed.')
    }
    if (errorDescription !== null && errorDescription.length > 1000) {
      throw new ApiV2ContractError('OAuth callback error_description is too long.')
    }
    if (errorUri !== null) {
      try {
        /** @brief 解析后的错误文档 URL / Parsed error-documentation URL. */
        const parsedErrorUri = new URL(errorUri)
        if (
          parsedErrorUri.protocol !== 'https:' ||
          parsedErrorUri.username !== '' ||
          parsedErrorUri.password !== ''
        ) {
          throw new Error()
        }
      } catch {
        throw new ApiV2ContractError('OAuth callback error_uri must be HTTPS.')
      }
    }
    throw new OAuthAuthorizationResponseError(error, errorDescription, errorUri)
  }
  if (
    code === null ||
    code.length === 0 ||
    code.length > 2048 ||
    errorDescription !== null ||
    errorUri !== null
  ) {
    throw new ApiV2ContractError('OAuth callback success response is malformed.')
  }
  return { code }
}
