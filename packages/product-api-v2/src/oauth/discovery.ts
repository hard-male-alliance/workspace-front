/** @file API v2 固定 issuer 的 OIDC Discovery 边界 / OIDC Discovery boundary for the API v2 fixed issuer. */

import { ApiV2ContractError, ApiV2NetworkError } from '../http/errors'
import { readBoundedJson } from '../http/bounded-json'
import { API_V2_PRODUCTION_ORIGIN } from '../origin'

/** @brief OIDC discovery 最大响应字节数 / Maximum OIDC discovery response bytes. */
const MAX_DISCOVERY_BYTES = 256 * 1024

/** @brief API STANDARD V2 冻结的 OAuth/OIDC issuer / OAuth/OIDC issuer frozen by API STANDARD V2. */
export const API_V2_OAUTH_ISSUER = API_V2_PRODUCTION_ORIGIN

/** @brief API STANDARD V2 冻结的 OIDC discovery URL / OIDC discovery URL frozen by API STANDARD V2. */
export const API_V2_OIDC_DISCOVERY_URL = `${API_V2_OAUTH_ISSUER}/.well-known/openid-configuration`

/** @brief API STANDARD V2 冻结的 Authorization Endpoint / Authorization Endpoint frozen by API STANDARD V2. */
export const API_V2_OAUTH_AUTHORIZATION_ENDPOINT = `${API_V2_OAUTH_ISSUER}/oauth/authorize`

/** @brief API STANDARD V2 冻结的 Token Endpoint / Token Endpoint frozen by API STANDARD V2. */
export const API_V2_OAUTH_TOKEN_ENDPOINT = `${API_V2_OAUTH_ISSUER}/oauth/token`

/** @brief API STANDARD V2 冻结的 JWKS URI / JWKS URI frozen by API STANDARD V2. */
export const API_V2_OAUTH_JWKS_URI = `${API_V2_OAUTH_ISSUER}/oauth/jwks`

/** @brief API STANDARD V2 冻结的撤销端点 / Revocation Endpoint frozen by API STANDARD V2. */
export const API_V2_OAUTH_REVOCATION_ENDPOINT = `${API_V2_OAUTH_ISSUER}/oauth/revoke`

/** @brief API STANDARD V2 冻结的 UserInfo Endpoint / UserInfo Endpoint frozen by API STANDARD V2. */
export const API_V2_OAUTH_USERINFO_ENDPOINT = `${API_V2_OAUTH_ISSUER}/userinfo`

/** @brief API v2 使用的最小可信 OIDC 元数据 / Minimum trusted OIDC metadata used by API v2. */
export interface OidcDiscoveryDocument {
  /** @brief 精确 issuer / Exact issuer. */
  readonly issuer: typeof API_V2_OAUTH_ISSUER
  /** @brief Hosted authorization endpoint / Hosted authorization endpoint. */
  readonly authorizationEndpoint: string
  /** @brief Form-encoded token endpoint / Form-encoded token endpoint. */
  readonly tokenEndpoint: string
  /** @brief Token revocation endpoint / Token revocation endpoint. */
  readonly revocationEndpoint: string
  /** @brief 动态发现的 JWKS endpoint / Dynamically discovered JWKS endpoint. */
  readonly jwksUri: string
  /** @brief 标准 OIDC UserInfo endpoint / Standard OIDC UserInfo endpoint. */
  readonly userinfoEndpoint: string
  /** @brief 服务端声明的 ID Token 签名算法 / ID Token signing algorithms declared by the server. */
  readonly idTokenSigningAlgorithms: readonly string[]
  /** @brief 服务端声明的 OAuth scopes / OAuth scopes declared by the server. */
  readonly scopesSupported: readonly string[]
}

/** @brief OIDC metadata 中必须精确出现的 endpoint / Endpoints that must occur exactly in OIDC metadata. */
const EXPECTED_ENDPOINTS = {
  authorization_endpoint: API_V2_OAUTH_AUTHORIZATION_ENDPOINT,
  jwks_uri: API_V2_OAUTH_JWKS_URI,
  revocation_endpoint: API_V2_OAUTH_REVOCATION_ENDPOINT,
  token_endpoint: API_V2_OAUTH_TOKEN_ENDPOINT,
  userinfo_endpoint: API_V2_OAUTH_USERINFO_ENDPOINT
} as const

/**
 * @brief 读取非空字符串 / Read a non-empty string.
 * @param value 未经信任的字段 / Untrusted field.
 * @param path 字段路径 / Field path.
 * @return 已校验字符串 / Validated string.
 */
function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiV2ContractError(`OIDC field ${path} must be a non-empty string.`)
  }
  return value
}

/**
 * @brief 读取无重复的非空字符串数组 / Read a unique array of non-empty strings.
 * @param value 未经信任的字段 / Untrusted field.
 * @param path 字段路径 / Field path.
 * @return 已校验字符串数组 / Validated string array.
 */
function uniqueStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiV2ContractError(`OIDC field ${path} must be a non-empty array.`)
  }
  /** @brief 已校验的数组 / Validated array. */
  const result = value.map((item, index) => nonEmptyString(item, `${path}[${index}]`))
  if (new Set(result).size !== result.length) {
    throw new ApiV2ContractError(`OIDC field ${path} must not contain duplicates.`)
  }
  return result
}

/**
 * @brief 断言 capability 数组含所需能力 / Assert that a capability array contains a required value.
 * @param values 服务端能力 / Server capabilities.
 * @param required 客户端要求的能力 / Capability required by the client.
 * @param path 字段路径 / Field path.
 */
function requireCapability(values: readonly string[], required: string, path: string): void {
  if (!values.includes(required)) {
    throw new ApiV2ContractError(`OIDC field ${path} must support ${required}.`)
  }
}

/**
 * @brief 严格解析并钉死 API v2 OIDC 能力 / Strictly parse and pin API v2 OIDC capabilities.
 * @param value 未经信任的 discovery JSON / Untrusted discovery JSON.
 * @return 可用于授权事务的可信元数据 / Trusted metadata usable by authorization transactions.
 * @note OIDC metadata 是可扩展注册表，因此未知扩展会被忽略；所有被消费字段均严格验证。 / OIDC metadata is an extensible registry, so unknown extensions are ignored while every consumed field is strictly validated.
 */
export function parseOidcDiscovery(value: unknown): OidcDiscoveryDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiV2ContractError('OIDC discovery document must be an object.')
  }
  /** @brief Discovery 字段对象 / Discovery field object. */
  const input = value as Record<string, unknown>
  if (input.issuer !== API_V2_OAUTH_ISSUER) {
    throw new ApiV2ContractError('OIDC discovery issuer does not match API STANDARD V2.')
  }
  for (const [field, expected] of Object.entries(EXPECTED_ENDPOINTS)) {
    if (input[field] !== expected) {
      throw new ApiV2ContractError(`OIDC field ${field} does not match API STANDARD V2.`)
    }
  }
  /** @brief 授权响应类型 / Supported authorization response types. */
  const responseTypes = uniqueStringArray(
    input.response_types_supported,
    'response_types_supported'
  )
  /** @brief 授权类型 / Supported grant types. */
  const grantTypes = uniqueStringArray(input.grant_types_supported, 'grant_types_supported')
  /** @brief PKCE 方法 / Supported PKCE methods. */
  const challengeMethods = uniqueStringArray(
    input.code_challenge_methods_supported,
    'code_challenge_methods_supported'
  )
  /** @brief Token endpoint 客户端认证方式 / Token endpoint client-authentication methods. */
  const tokenAuthMethods = uniqueStringArray(
    input.token_endpoint_auth_methods_supported,
    'token_endpoint_auth_methods_supported'
  )
  /** @brief OIDC scopes / OIDC scopes. */
  const scopes = uniqueStringArray(input.scopes_supported, 'scopes_supported')
  /** @brief OIDC subject 类型 / OIDC subject types. */
  const subjectTypes = uniqueStringArray(input.subject_types_supported, 'subject_types_supported')
  /** @brief ID Token 签名算法 / ID Token signing algorithms. */
  const algorithms = uniqueStringArray(
    input.id_token_signing_alg_values_supported,
    'id_token_signing_alg_values_supported'
  )
  requireCapability(responseTypes, 'code', 'response_types_supported')
  requireCapability(grantTypes, 'authorization_code', 'grant_types_supported')
  requireCapability(grantTypes, 'refresh_token', 'grant_types_supported')
  requireCapability(challengeMethods, 'S256', 'code_challenge_methods_supported')
  requireCapability(tokenAuthMethods, 'none', 'token_endpoint_auth_methods_supported')
  requireCapability(scopes, 'openid', 'scopes_supported')
  requireCapability(subjectTypes, 'public', 'subject_types_supported')
  if (responseTypes.length !== 1 || grantTypes.length !== 2 || challengeMethods.length !== 1) {
    throw new ApiV2ContractError(
      'OIDC discovery advertises a grant, response type, or PKCE method outside API STANDARD V2.'
    )
  }
  if (input.authorization_response_iss_parameter_supported !== true) {
    throw new ApiV2ContractError(
      'OIDC discovery must require the authorization-response iss parameter.'
    )
  }
  if (algorithms.includes('none') || algorithms.some((algorithm) => algorithm.startsWith('HS'))) {
    throw new ApiV2ContractError('OIDC discovery advertises an unsafe ID Token signing algorithm.')
  }
  return {
    authorizationEndpoint: EXPECTED_ENDPOINTS.authorization_endpoint,
    idTokenSigningAlgorithms: algorithms,
    issuer: API_V2_OAUTH_ISSUER,
    jwksUri: EXPECTED_ENDPOINTS.jwks_uri,
    revocationEndpoint: EXPECTED_ENDPOINTS.revocation_endpoint,
    scopesSupported: scopes,
    tokenEndpoint: EXPECTED_ENDPOINTS.token_endpoint,
    userinfoEndpoint: EXPECTED_ENDPOINTS.userinfo_endpoint
  }
}

/**
 * @brief 从冻结 HTTPS 地址获取并验证 OIDC discovery / Fetch and validate OIDC discovery from the frozen HTTPS address.
 * @param fetchImpl 可替换的 Fetch 实现 / Replaceable Fetch implementation.
 * @param signal 可选取消信号 / Optional cancellation signal.
 * @return 已验证 OIDC 元数据 / Validated OIDC metadata.
 */
export async function fetchOidcDiscovery(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<OidcDiscoveryDocument> {
  try {
    /** @brief 原始 discovery 响应 / Raw discovery response. */
    const response = await fetchImpl(API_V2_OIDC_DISCOVERY_URL, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      method: 'GET',
      redirect: 'error',
      signal: signal ?? null
    })
    /** @brief 响应 media type / Response media type. */
    const mediaType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (response.status !== 200 || mediaType !== 'application/json') {
      throw new ApiV2ContractError(
        'OIDC discovery must return 200 application/json.',
        response.status
      )
    }
    /** @brief 尚未验证的有界 discovery JSON / Bounded, unvalidated discovery JSON. */
    const data = await readBoundedJson(response, {
      context: 'OIDC discovery',
      maximumBytes: MAX_DISCOVERY_BYTES
    })
    return parseOidcDiscovery(data)
  } catch (error: unknown) {
    if (error instanceof ApiV2ContractError) throw error
    if (signal?.aborted === true) throw new ApiV2NetworkError('aborted')
    throw new ApiV2NetworkError('network')
  }
}
