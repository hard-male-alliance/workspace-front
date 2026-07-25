/** @file OAuth sessionStorage 一次性事务测试 / OAuth one-time sessionStorage transaction tests. */

import { describe, expect, it } from 'vitest'
import {
  createWebAuthorizationRequest,
  parseAuthorizationCallback,
  parseOidcDiscovery,
  type OidcDiscoveryDocument,
  type WebAuthorizationTransaction
} from '@ai-job-workspace/product-api-v2'

import {
  consumeWebOAuthCallback,
  persistWebOAuthTransaction,
  WEB_OAUTH_TRANSACTION_STORAGE_KEY,
  type OAuthTransactionStorage
} from './oauth-transaction'

/** @brief 固定测试时刻 / Fixed test time. */
const NOW = 1_800_000_000

/** @brief 仅测试使用的内存 sessionStorage / In-memory sessionStorage used only by tests. */
class MemoryTransactionStorage implements OAuthTransactionStorage {
  /** @brief 键值记录 / Key-value records. */
  private readonly records = new Map<string, string>()

  /** @brief 读取值 / Read a value. */
  getItem(key: string): string | null {
    return this.records.get(key) ?? null
  }

  /** @brief 删除值 / Remove a value. */
  removeItem(key: string): void {
    this.records.delete(key)
  }

  /** @brief 写入值 / Write a value. */
  setItem(key: string, value: string): void {
    this.records.set(key, value)
  }
}

/**
 * @brief 创建冻结 API v2 discovery / Create frozen API v2 discovery.
 * @return 已严格解析的 discovery / Strictly parsed discovery.
 */
function discovery(): OidcDiscoveryDocument {
  return parseOidcDiscovery({
    authorization_endpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    issuer: 'https://api.hmalliances.org:8022',
    jwks_uri: 'https://api.hmalliances.org:8022/oauth/jwks',
    response_types_supported: ['code'],
    revocation_endpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
    scopes_supported: [
      'openid',
      'profile',
      'offline_access',
      'workspace.read',
      'resume.read',
      'resume.write'
    ],
    subject_types_supported: ['public'],
    token_endpoint: 'https://api.hmalliances.org:8022/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
    userinfo_endpoint: 'https://api.hmalliances.org:8022/userinfo'
  })
}

/**
 * @brief 创建协议层签发的测试事务 / Create a protocol-issued test transaction.
 * @return 一次性事务 / One-time transaction.
 */
async function transaction(): Promise<WebAuthorizationTransaction> {
  return (
    await createWebAuthorizationRequest({
      clientId: 'workspace-web',
      discovery: discovery(),
      nowEpochSeconds: (): number => NOW,
      offlineAccessConsent: 'request',
      redirectUri: 'https://app.hmalliances.org/oauth/callback',
      scopes: [
        'openid',
        'profile',
        'offline_access',
        'workspace.read',
        'resume.read',
        'resume.write'
      ],
      screenHint: 'login'
    })
  ).transaction
}

/**
 * @brief 构造成功 callback URL / Construct a successful callback URL.
 * @param value 原授权事务 / Original authorization transaction.
 * @return 含 code/state/iss 的 URL / URL containing code/state/iss.
 */
function callbackUrl(value: WebAuthorizationTransaction): string {
  /** @brief callback URL / Callback URL. */
  const callback = new URL(value.redirectUri)
  callback.searchParams.set('code', 'authorization_code_example_1234567890')
  callback.searchParams.set('iss', value.issuer)
  callback.searchParams.set('state', value.state)
  return callback.toString()
}

describe('Web OAuth transaction storage', (): void => {
  it('consumes once, scrubs before returning, and restores a branded transaction', async (): Promise<void> => {
    /** @brief 原事务 / Original transaction. */
    const original = await transaction()
    /** @brief 当前 tab 存储 / Current-tab storage. */
    const storage = new MemoryTransactionStorage()
    persistWebOAuthTransaction(
      storage,
      original,
      '/resumes?view=recent',
      'https://app.hmalliances.org'
    )
    /** @brief 持久化文本 / Persisted text. */
    const serialized = storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)
    expect(serialized).not.toBeNull()
    expect(serialized).not.toContain('access_token')
    expect(serialized).not.toContain('refresh_token')
    /** @brief History 替换顺序 / History replacement order. */
    const replacements: string[] = []
    /** @brief 原始 callback / Original callback. */
    const href = callbackUrl(original)
    /** @brief 已消费 callback / Consumed callback. */
    const consumed = consumeWebOAuthCallback(
      { href, origin: 'https://app.hmalliances.org', pathname: '/oauth/callback' },
      {
        replaceState: (_data, _unused, url): void => {
          replacements.push(String(url))
        }
      },
      storage,
      NOW
    )
    expect(replacements).toEqual(['/', '/resumes?view=recent'])
    expect(storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)).toBeNull()
    expect(consumed).not.toBeNull()
    expect(parseAuthorizationCallback(consumed!.callbackUrl, consumed!.transaction, NOW)).toEqual({
      code: 'authorization_code_example_1234567890'
    })
  })

  it('scrubs the callback even when storage is missing or tampered', async (): Promise<void> => {
    /** @brief 原事务 / Original transaction. */
    const original = await transaction()
    /** @brief callback URL / Callback URL. */
    const href = callbackUrl(original)
    /** @brief 空存储 / Empty storage. */
    const storage = new MemoryTransactionStorage()
    /** @brief History 替换顺序 / History replacement order. */
    const replacements: string[] = []
    expect(() =>
      consumeWebOAuthCallback(
        { href, origin: 'https://app.hmalliances.org', pathname: '/oauth/callback' },
        {
          replaceState: (_data, _unused, url): void => {
            replacements.push(String(url))
          }
        },
        storage,
        NOW
      )
    ).toThrow('no pending transaction')
    expect(replacements).toEqual(['/'])

    persistWebOAuthTransaction(storage, original, '/', 'https://app.hmalliances.org')
    /** @brief 原 envelope / Original envelope. */
    const envelope = JSON.parse(
      storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY) ?? 'null'
    ) as Record<string, unknown>
    storage.setItem(
      WEB_OAUTH_TRANSACTION_STORAGE_KEY,
      JSON.stringify({ ...envelope, token_endpoint: 'https://evil.example/token' })
    )
    expect(() =>
      consumeWebOAuthCallback(
        { href, origin: 'https://app.hmalliances.org', pathname: '/oauth/callback' },
        { replaceState: (): void => undefined },
        storage,
        NOW
      )
    ).toThrow('unsupported shape')
    expect(storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)).toBeNull()
  })

  it('does not touch storage away from the callback path', (): void => {
    /** @brief 可观察存储 / Observable storage. */
    const storage = new MemoryTransactionStorage()
    expect(
      consumeWebOAuthCallback(
        {
          href: 'https://app.hmalliances.org/',
          origin: 'https://app.hmalliances.org',
          pathname: '/'
        },
        {
          replaceState: (): never => {
            throw new Error('must not replace history')
          }
        },
        storage,
        NOW
      )
    ).toBeNull()
  })
})
