/** @file 顶层 OAuth 跳转的一次性 sessionStorage 边界 / One-time sessionStorage boundary for top-level OAuth navigation. */

import {
  restoreWebAuthorizationTransaction,
  snapshotWebAuthorizationTransaction,
  type WebAuthorizationTransaction
} from '@ai-job-workspace/product-api-v2'

/** @brief 唯一未完成授权事务的固定键 / Fixed key for the sole pending authorization transaction. */
export const WEB_OAUTH_TRANSACTION_STORAGE_KEY = 'ai-job-workspace.oauth.transaction.v1'

/** @brief OAuth callback 的固定路径 / Frozen OAuth callback path. */
export const WEB_OAUTH_CALLBACK_PATH = '/oauth/callback'

/** @brief 事务存储所需最小接口 / Minimal interface required from transaction storage. */
export interface OAuthTransactionStorage {
  /** @brief 读取一个值 / Read a value. */
  readonly getItem: (key: string) => string | null
  /** @brief 删除一个值 / Remove a value. */
  readonly removeItem: (key: string) => void
  /** @brief 写入一个值 / Write a value. */
  readonly setItem: (key: string, value: string) => void
}

/** @brief callback 消毒所需 History 接口 / History interface required for callback sanitization. */
export interface OAuthCallbackHistory {
  /** @brief 原地替换敏感 callback URL / Replace the sensitive callback URL in place. */
  readonly replaceState: (data: unknown, unused: string, url?: string | URL | null) => void
}

/** @brief callback 消费所需 Location 投影 / Location projection required for callback consumption. */
export interface OAuthCallbackLocation {
  /** @brief 包含 code/state/iss 的原始绝对 URL / Original absolute URL containing code/state/iss. */
  readonly href: string
  /** @brief 当前 origin / Current origin. */
  readonly origin: string
  /** @brief 当前路径 / Current path. */
  readonly pathname: string
}

/** @brief 已消费的 OAuth callback / Consumed OAuth callback. */
export interface ConsumedWebOAuthCallback {
  /** @brief 仅在内存中交给协议层的原始 callback URL / Original callback URL passed only in memory to the protocol layer. */
  readonly callbackUrl: string
  /** @brief 严格恢复且重新登记的事务 / Strictly restored and re-registered transaction. */
  readonly transaction: WebAuthorizationTransaction
}

/**
 * @brief 校验同源应用内 return path / Validate a same-origin in-application return path.
 * @param value 未经信任的 path / Untrusted path.
 * @param applicationOrigin 当前应用 origin / Current application origin.
 * @return 不含 fragment 的规范化相对路径 / Normalized relative path without a fragment.
 */
function applicationReturnPath(value: unknown, applicationOrigin: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('#')
  ) {
    throw new Error('OAuth return path is invalid.')
  }
  /** @brief 解析后的同源 URL / Parsed same-origin URL. */
  const parsed = new URL(value, applicationOrigin)
  if (
    parsed.origin !== applicationOrigin ||
    parsed.pathname === WEB_OAUTH_CALLBACK_PATH ||
    `${parsed.pathname}${parsed.search}` !== value
  ) {
    throw new Error('OAuth return path escapes the application boundary.')
  }
  return value
}

/**
 * @brief 导航前保存无 token 的版本化事务 / Persist a versioned token-free transaction before navigation.
 * @param storage 当前 tab 的 sessionStorage / Current tab's sessionStorage.
 * @param transaction 协议层签发的事务 / Transaction issued by the protocol layer.
 * @param returnPath 成功后的应用内返回路径 / In-application return path after success.
 * @param applicationOrigin 当前应用 origin / Current application origin.
 */
export function persistWebOAuthTransaction(
  storage: OAuthTransactionStorage,
  transaction: WebAuthorizationTransaction,
  returnPath: string,
  applicationOrigin: string
): void {
  /** @brief 无 token 的严格快照 / Strict token-free snapshot. */
  const snapshot = snapshotWebAuthorizationTransaction(transaction)
  /** @brief 可序列化 envelope / Serializable envelope. */
  const envelope = {
    return_path: applicationReturnPath(returnPath, applicationOrigin),
    transaction: snapshot,
    version: 1
  }
  storage.setItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY, JSON.stringify(envelope))
}

/**
 * @brief 在任何异步工作或渲染前消费事务并清除 callback URL / Consume the transaction and scrub the callback URL before any async work or rendering.
 * @param location 当前 Location 投影 / Current Location projection.
 * @param history 当前 History / Current History.
 * @param storage 当前 tab 的 sessionStorage / Current tab's sessionStorage.
 * @param nowEpochSeconds 当前 epoch 秒 / Current epoch seconds.
 * @return 非 callback 页面为 null，否则返回一次性 callback / Null off callback pages, otherwise the one-time callback.
 */
export function consumeWebOAuthCallback(
  location: OAuthCallbackLocation,
  history: OAuthCallbackHistory,
  storage: OAuthTransactionStorage,
  nowEpochSeconds: number = Date.now() / 1000
): ConsumedWebOAuthCallback | null {
  if (location.pathname !== WEB_OAUTH_CALLBACK_PATH) return null
  /** @brief 含敏感参数、仅暂留内存的原始 URL / Original sensitive URL retained only in memory. */
  const callbackUrl = location.href
  /** @brief 存储的 envelope 文本 / Stored envelope text. */
  let serialized: string | null
  try {
    serialized = storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)
  } finally {
    try {
      storage.removeItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)
    } finally {
      history.replaceState(null, '', '/')
    }
  }
  if (serialized === null) throw new Error('OAuth callback has no pending transaction.')

  /** @brief 未经信任的 envelope JSON / Untrusted envelope JSON. */
  let value: unknown
  try {
    value = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('OAuth transaction storage contains malformed JSON.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('OAuth transaction storage must contain an object.')
  }
  /** @brief envelope 字段 / Envelope fields. */
  const envelope = value as Record<string, unknown>
  if (
    Object.keys(envelope).some(
      (key) => key !== 'version' && key !== 'return_path' && key !== 'transaction'
    ) ||
    envelope.version !== 1
  ) {
    throw new Error('OAuth transaction storage has an unsupported shape.')
  }
  /** @brief 已验证的应用内返回路径 / Validated in-application return path. */
  const returnPath = applicationReturnPath(envelope.return_path, location.origin)
  /** @brief 严格恢复的协议事务 / Strictly restored protocol transaction. */
  const transaction = restoreWebAuthorizationTransaction(envelope.transaction, nowEpochSeconds)
  history.replaceState(null, '', returnPath)
  return Object.freeze({ callbackUrl, transaction })
}
