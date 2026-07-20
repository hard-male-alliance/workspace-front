/** @file 跨 renderer 的诊断接收器 endpoint 解析 / Cross-renderer diagnostics receiver endpoint resolution. */

/** @brief 固定的前端诊断批量上传路径 / Fixed frontend-diagnostics batch upload path. */
export const FRONTEND_DIAGNOSTICS_BATCH_PATH = '/api/v1/frontend-diagnostics/batches'

/** @brief 不泄漏配置原文的诊断配置错误类别 / Diagnostics configuration errors without raw configuration text. */
export type DiagnosticsConfigurationErrorReason =
  'invalid_host' | 'invalid_port' | 'invalid_protocol' | 'insecure_protocol' | 'partial'

/** @brief 宿主环境中独立提供的诊断 endpoint 字段 / Separately supplied diagnostics endpoint fields from a host environment. */
export interface DiagnosticsEndpointEnvironment {
  /** @brief 诊断接收器主机名 / Diagnostics receiver hostname. */
  readonly hostname?: string | undefined
  /** @brief 诊断接收器 TCP 端口 / Diagnostics receiver TCP port. */
  readonly port?: string | undefined
  /** @brief 诊断接收器 HTTP(S) 协议 / Diagnostics receiver HTTP(S) protocol. */
  readonly protocol?: string | undefined
}

/** @brief 没有任何诊断 endpoint 配置 / No diagnostics endpoint configuration exists. */
export interface DisabledDiagnosticsEndpointConfiguration {
  /** @brief 关闭判别值 / Disabled discriminator. */
  readonly kind: 'disabled'
}

/** @brief endpoint 配置存在但不安全 / Endpoint configuration exists but is unsafe. */
export interface InvalidDiagnosticsEndpointConfiguration {
  /** @brief 无效判别值 / Invalid discriminator. */
  readonly kind: 'invalid'
  /** @brief 不含原始环境文本的归类原因 / Classified reason without raw environment text. */
  readonly reason: DiagnosticsConfigurationErrorReason
}

/** @brief 经严格验证的诊断 endpoint / Strictly validated diagnostics endpoint. */
export interface EnabledDiagnosticsEndpointConfiguration {
  /** @brief 已启用判别值 / Enabled discriminator. */
  readonly kind: 'enabled'
  /** @brief 可写入 CSP connect-src 的规范化 origin / Normalized origin suitable for CSP connect-src. */
  readonly origin: string
  /** @brief 固定且版本化的批量上传 endpoint / Fixed and versioned batch-upload endpoint. */
  readonly endpoint: string
}

/** @brief 诊断 endpoint 的显式三态解析结果 / Explicit three-state diagnostics endpoint resolution. */
export type DiagnosticsEndpointConfiguration =
  | DisabledDiagnosticsEndpointConfiguration
  | InvalidDiagnosticsEndpointConfiguration
  | EnabledDiagnosticsEndpointConfiguration

/**
 * @brief 判断环境文本是否是非空值 / Determine whether an environment text value is non-empty.
 * @param value 候选环境文本 / Candidate environment text.
 * @return 去空白后仍非空时为 true / True when non-empty after trimming.
 */
function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0
}

/**
 * @brief 校验一个显式 TCP 端口 / Validate one explicit TCP port.
 * @param value 未经信任的端口文本 / Untrusted port text.
 * @return 范围为 1..65535 的端口时为 true / True for a port in the range 1..65535.
 */
function isValidPort(value: string): boolean {
  return /^\d+$/u.test(value) && Number(value) >= 1 && Number(value) <= 65_535
}

/**
 * @brief 解析受限的 HTTP(S) 协议 / Resolve a restricted HTTP(S) protocol.
 * @param value 未经信任的协议文本 / Untrusted protocol text.
 * @return 规范化协议；不支持时为 undefined / Normalized protocol, or undefined when unsupported.
 */
function resolveProtocol(value: string | undefined): 'http' | 'https' | undefined {
  /** @brief 去空白和尾部冒号后的协议 / Protocol after trimming whitespace and a trailing colon. */
  const protocol = (value?.trim() || 'https').replace(/:$/u, '').toLowerCase()
  return protocol === 'http' || protocol === 'https' ? protocol : undefined
}

/**
 * @brief 判断 hostname 是否是受 CSP3 支持的 IPv4 字面量 / Determine whether a hostname is a CSP3-supported IPv4 literal.
 * @param hostname URL 规范化后的 hostname / URL-normalized hostname.
 * @return 仅为 127.0.0.1 时返回 true / True only for 127.0.0.1.
 * @note CSP3 仅保证 127.0.0.1 这个 IP source 能匹配；其他 IP 与 IPv6 配置一律 fail-closed。
 */
function isSupportedIpLiteral(hostname: string): boolean {
  return hostname === '127.0.0.1'
}

/**
 * @brief 判断 hostname 能否安全写入 CSP host-source / Determine whether a hostname can be safely written as a CSP host source.
 * @param hostname URL 规范化后的 hostname / URL-normalized hostname.
 * @return DNS/punycode hostname 或受支持 loopback IP 时返回 true / True for DNS/punycode hostnames or the supported loopback IP.
 * @note 拒绝 IPv6、非 loopback IPv4、通配符与 CSP 分隔符；URL 会先将 IDN 规范化为 punycode。
 */
function isCspSafeHostname(hostname: string): boolean {
  if (isSupportedIpLiteral(hostname)) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.startsWith('[')) return false

  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/iu.test(
    hostname
  )
}

/**
 * @brief 判断原始 hostname 字段是否试图重写 URL/CSP 结构 / Determine whether a raw hostname field attempts to rewrite URL/CSP structure.
 * @param hostname 尚未交给 URL 解析器的 hostname 字段 / Hostname field before URL parsing.
 * @return 包含结构分隔符或空白时为 true / True when structural separators or whitespace are present.
 * @note 该检查补足 WHATWG URL 对空 userinfo 的规范化：例如 `@host` 不能被静默视为 `host`。
 */
function hasUnsafeRawHostnameSyntax(hostname: string): boolean {
  return /[\s\\/@?#;,]/u.test(hostname)
}

/**
 * @brief 判断 HTTP 诊断 origin 是否是明确 loopback 开发目标 / Determine whether an HTTP diagnostics origin is an explicit loopback development target.
 * @param origin 已验证的 HTTP(S) origin / Validated HTTP(S) origin.
 * @return hostname 为 localhost 或 127.0.0.1 时为 true / True when the hostname is localhost or 127.0.0.1.
 */
function isLoopbackDevelopmentOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * @brief 将完整 URL 校验并规范化为可安全嵌入 CSP 的 HTTP(S) origin / Validate and normalize a full URL to a CSP-safe HTTP(S) origin.
 * @param value 未经信任的完整 origin 文本 / Untrusted full origin text.
 * @return 可安全写入 connect-src 的规范化 origin；无效时为 undefined / Normalized origin safe for connect-src, or undefined when invalid.
 */
export function resolveCspSafeHttpOrigin(value: string): string | undefined {
  try {
    /** @brief WHATWG URL 解析结果 / WHATWG URL parsing result. */
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      !isCspSafeHostname(url.hostname)
    ) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * @brief 用分离字段构造严格 HTTP(S) origin / Construct a strict HTTP(S) origin from separate fields.
 * @param protocol 已验证的协议 / Validated protocol.
 * @param hostname 未经信任 hostname / Untrusted hostname.
 * @param port 已验证 TCP 端口 / Validated TCP port.
 * @return 已规范化 origin；不安全时为 undefined / Normalized origin, or undefined when unsafe.
 */
function resolveOrigin(
  protocol: 'http' | 'https',
  hostname: string,
  port: string
): string | undefined {
  if (hasUnsafeRawHostnameSyntax(hostname)) return undefined

  /** @brief 根据独立字段构造的 URL / URL constructed from independent fields. */
  const candidate = `${protocol}://${hostname}:${port}`
  const origin = resolveCspSafeHttpOrigin(candidate)
  if (origin === undefined) return undefined
  return new URL(origin).protocol === `${protocol}:` ? origin : undefined
}

/**
 * @brief 解析独立配置字段中的可选诊断 endpoint / Resolve an optional diagnostics endpoint from separate configuration fields.
 * @param environment 未经信任的宿主环境值 / Untrusted host-environment values.
 * @return disabled、invalid 或带固定 endpoint 的 enabled / disabled, invalid, or enabled with a fixed endpoint.
 * @note 绝不回退到产品 API；诊断配置错误不能阻断产品启动。
 */
export function resolveDiagnosticsEndpointConfiguration(
  environment: DiagnosticsEndpointEnvironment
): DiagnosticsEndpointConfiguration {
  /** @brief 去外侧空白后的 hostname / Hostname after trimming outer whitespace. */
  const hostname = environment.hostname?.trim()
  /** @brief 去外侧空白后的端口 / Port after trimming outer whitespace. */
  const port = environment.port?.trim()
  /** @brief 是否至少出现过一个配置字段 / Whether at least one configuration field was supplied. */
  const hasAnyValue = hasValue(hostname) || hasValue(port) || hasValue(environment.protocol)

  if (!hasAnyValue) return { kind: 'disabled' }
  if (!hasValue(hostname) || !hasValue(port)) return { kind: 'invalid', reason: 'partial' }
  if (!isValidPort(port)) return { kind: 'invalid', reason: 'invalid_port' }

  /** @brief 受 allowlist 约束的协议 / Protocol constrained by an allowlist. */
  const protocol = resolveProtocol(environment.protocol)
  if (protocol === undefined) return { kind: 'invalid', reason: 'invalid_protocol' }

  /** @brief 完整 URL 结构校验后的 origin / Origin after complete URL-structure validation. */
  const origin = resolveOrigin(protocol, hostname, port)
  if (origin === undefined) return { kind: 'invalid', reason: 'invalid_host' }
  if (protocol === 'http' && !isLoopbackDevelopmentOrigin(origin)) {
    return { kind: 'invalid', reason: 'insecure_protocol' }
  }

  return {
    endpoint: new URL(FRONTEND_DIAGNOSTICS_BATCH_PATH, origin).toString(),
    kind: 'enabled',
    origin
  }
}
