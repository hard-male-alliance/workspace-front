/** @file Web OAuth 授权导航协调器测试 / Web OAuth authorization-navigation coordinator tests. */

import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { WEB_OAUTH_SCOPES, type WebOAuthConfiguration } from './auth-config'
import {
  WEB_OAUTH_TRANSACTION_STORAGE_KEY,
  type OAuthTransactionStorage
} from './oauth-transaction'
import { beginWebAuthorization } from './web-oauth'

/** @brief 已注册的测试 Web OAuth 配置 / Registered Web OAuth configuration used by tests. */
const CONFIGURATION: WebOAuthConfiguration = {
  clientId: 'aiws-web-local',
  redirectUri: 'https://app.hmalliances.org/oauth/callback',
  scopes: WEB_OAUTH_SCOPES
}

/** @brief API v2 OIDC discovery 响应 / API v2 OIDC discovery response. */
const DISCOVERY = {
  authorization_endpoint: 'https://api.hmalliances.org:8022/oauth/authorize',
  authorization_response_iss_parameter_supported: true,
  code_challenge_methods_supported: ['S256'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  id_token_signing_alg_values_supported: ['ES256', 'RS256'],
  issuer: 'https://api.hmalliances.org:8022',
  jwks_uri: 'https://api.hmalliances.org:8022/oauth/jwks',
  response_types_supported: ['code'],
  revocation_endpoint: 'https://api.hmalliances.org:8022/oauth/revoke',
  scopes_supported: WEB_OAUTH_SCOPES,
  subject_types_supported: ['public'],
  token_endpoint: 'https://api.hmalliances.org:8022/oauth/token',
  token_endpoint_auth_methods_supported: ['none'],
  userinfo_endpoint: 'https://api.hmalliances.org:8022/userinfo'
} as const

/** @brief 可观察的当前 tab 存储 / Observable current-tab storage. */
class ObservableStorage implements OAuthTransactionStorage {
  /** @brief 存储内容 / Stored values. */
  readonly values = new Map<string, string>()
  /** @brief 写入发生时的事件顺序 / Event order at writes. */
  readonly events: string[]

  /**
   * @brief 创建可观察存储 / Create observable storage.
   * @param events 共享事件记录 / Shared event log.
   */
  constructor(events: string[]) {
    this.events = events
  }

  /** @brief 读取值 / Read a value. */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  /** @brief 删除值 / Remove a value. */
  removeItem(key: string): void {
    this.values.delete(key)
  }

  /** @brief 写入值 / Write a value. */
  setItem(key: string, value: string): void {
    this.events.push('persist')
    this.values.set(key, value)
  }
}

/**
 * @brief 构造严格 discovery HTTP 响应 / Construct a strict discovery HTTP response.
 * @return JSON discovery 响应 / JSON discovery response.
 */
function discoveryResponse(): Response {
  return new Response(JSON.stringify(DISCOVERY), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  })
}

describe('beginWebAuthorization', (): void => {
  it('discovers first, persists the one-time PKCE transaction, then navigates', async (): Promise<void> => {
    /** @brief 网络、存储与导航事件顺序 / Network, persistence, and navigation event order. */
    const events: string[] = []
    /** @brief 当前 tab 存储 / Current-tab storage. */
    const storage = new ObservableStorage(events)
    /** @brief discovery Fetch / Discovery fetch. */
    const fetchImpl = vi.fn<typeof fetch>((input, init): Promise<Response> => {
      events.push('discovery')
      expect(input).toBe('https://api.hmalliances.org:8022/.well-known/openid-configuration')
      expect(init).toMatchObject({
        cache: 'no-store',
        credentials: 'omit',
        method: 'GET',
        redirect: 'error'
      })
      return Promise.resolve(discoveryResponse())
    })
    /** @brief 顶层导航 spy / Top-level navigation spy. */
    const assign = vi.fn((destination: string | URL): void => {
      events.push('navigate')
      /** @brief Hosted authorize URL / Hosted authorization URL. */
      const url = new URL(destination)
      expect(url.origin).toBe('https://api.hmalliances.org:8022')
      expect(url.pathname).toBe('/oauth/authorize')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('client_id')).toBe(CONFIGURATION.clientId)
      expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURATION.redirectUri)
      expect(url.searchParams.get('scope')).toBe(WEB_OAUTH_SCOPES.join(' '))
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('screen_hint')).toBe('signup')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/u)
      expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    })

    await beginWebAuthorization(CONFIGURATION, 'signup', {
      crypto: webcrypto as unknown as Crypto,
      fetchImpl,
      location: {
        assign,
        origin: 'https://app.hmalliances.org',
        pathname: '/resumes',
        search: '?view=recent'
      },
      storage
    })

    expect(events).toEqual(['discovery', 'persist', 'navigate'])
    /** @brief 导航前保存的严格 envelope / Strict envelope persisted before navigation. */
    const envelope = JSON.parse(
      storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY) ?? 'null'
    ) as Record<string, unknown>
    expect(envelope).toMatchObject({ return_path: '/resumes?view=recent', version: 1 })
    expect(JSON.stringify(envelope)).not.toContain('access_token')
    expect(JSON.stringify(envelope)).not.toContain('refresh_token')
  })

  it('does not persist or navigate when discovery violates API STANDARD V2', async (): Promise<void> => {
    /** @brief 事件记录 / Event log. */
    const events: string[] = []
    /** @brief 当前 tab 存储 / Current-tab storage. */
    const storage = new ObservableStorage(events)
    /** @brief 导航 spy / Navigation spy. */
    const assign = vi.fn()

    await expect(
      beginWebAuthorization(CONFIGURATION, 'login', {
        crypto: webcrypto as unknown as Crypto,
        fetchImpl: (): Promise<Response> =>
          Promise.resolve(
            new Response(JSON.stringify({ ...DISCOVERY, issuer: 'https://evil.example' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200
            })
          ),
        location: {
          assign,
          origin: 'https://app.hmalliances.org',
          pathname: '/',
          search: ''
        },
        storage
      })
    ).rejects.toThrow('issuer does not match')
    expect(storage.getItem(WEB_OAUTH_TRANSACTION_STORAGE_KEY)).toBeNull()
    expect(assign).not.toHaveBeenCalled()
  })
})
