/** @file 共享 JSON Schema 格式的运行时谓词 / Runtime predicates for shared JSON Schema formats. */

/** @brief RFC 3339 date-time 的结构分组 / Structural groups of an RFC 3339 date-time. */
const RFC_3339_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u

/** @brief RFC 3986 绝对 URI 的 scheme 与其余部分 / Scheme and remainder of an RFC 3986 absolute URI. */
const ABSOLUTE_URI_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/u

/** @brief RFC 3986 pct-encoded 与 pchar 组成的路径 / Path composed from RFC 3986 pct-encoded and pchar tokens. */
const URI_PATH_PATTERN = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[0-9A-Fa-f]{2})*$/u

/** @brief RFC 3986 query/fragment 允许的字符 / Characters allowed by an RFC 3986 query or fragment. */
const URI_QUERY_OR_FRAGMENT_PATTERN = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*$/u

/** @brief RFC 3986 userinfo 允许的字符 / Characters allowed by RFC 3986 userinfo. */
const URI_USER_INFO_PATTERN = /^(?:[A-Za-z0-9._~!$&'()*+,;=:-]|%[0-9A-Fa-f]{2})*$/u

/** @brief RFC 3986 reg-name 允许的字符 / Characters allowed by an RFC 3986 reg-name. */
const URI_REGISTERED_NAME_PATTERN = /^(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/u

/** @brief RFC 3986 IPvFuture 字面量 / RFC 3986 IPvFuture literal. */
const URI_IP_V_FUTURE_PATTERN = /^v[0-9A-Fa-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/u

/**
 * @brief 检查公历日期是否存在 / Check whether a Gregorian calendar date exists.
 * @param year 年 / Year.
 * @param month 月 / Month.
 * @param day 日 / Day.
 * @return 日期存在时为 true / True when the date exists.
 */
function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  /** @brief 当前年份是否为闰年 / Whether the current year is a leap year. */
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  /** @brief 当前月份的最大日数 / Maximum day count for the current month. */
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

/**
 * @brief 判断字符串是否符合 RFC 3339 date-time / Determine whether a string matches RFC 3339 date-time.
 * @param value 待校验字符串 / String to validate.
 * @return 结构、日历和时区字段都合法时为 true / True when structure, calendar, and offset fields are valid.
 * @note RFC 3339 允许小写 t/z 与闰秒 60；不依赖 Date.parse，避免引擎将合法闰秒误判为无效。 / RFC 3339 permits lowercase t/z and leap-second 60; this avoids Date.parse, whose engines reject valid leap seconds.
 */
export function isRfc3339Timestamp(value: string): boolean {
  /** @brief 日期时间的结构匹配 / Structural date-time match. */
  const match = RFC_3339_DATE_TIME_PATTERN.exec(value)
  if (match === null) return false

  /** @brief 十进制日期、时间和 offset 字段 / Decimal date, time, and offset fields. */
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])

  return (
    isCalendarDate(year, month, day) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}

/**
 * @brief 将合法 RFC 3339 时间戳转换为 Unix epoch 毫秒 / Convert a valid RFC 3339 timestamp to Unix epoch milliseconds.
 * @param value 待解析时间戳 / Timestamp to parse.
 * @return 可表示的 epoch 毫秒；输入无效时为 null / Representable epoch milliseconds, or null for invalid input.
 * @note ECMAScript Date.parse 不接受闰秒；先将 `:60` 归一为 `:59`，解析后再加一秒。 / ECMAScript Date.parse rejects leap seconds; `:60` is normalized to `:59` and one second is added after parsing.
 */
export function parseRfc3339TimestampMilliseconds(value: string): number | null {
  /** @brief 已证明结构的 RFC 3339 分组 / RFC 3339 groups after structural validation. */
  const match = RFC_3339_DATE_TIME_PATTERN.exec(value)
  if (match === null || !isRfc3339Timestamp(value)) return null
  /** @brief 当前时间戳是否使用闰秒 / Whether the timestamp uses a leap second. */
  const hasLeapSecond = match[6] === '60'
  /** @brief 供 ECMAScript 引擎解析的等价时间戳 / Equivalent timestamp accepted by ECMAScript engines. */
  const normalized = value
    .replace('t', 'T')
    .replace(/z$/u, 'Z')
    .replace(/:60(?=(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/u, ':59')
  /** @brief 引擎解析的基础毫秒 / Base milliseconds parsed by the engine. */
  const milliseconds = Date.parse(normalized)
  if (!Number.isFinite(milliseconds)) return null
  return milliseconds + (hasLeapSecond ? 1_000 : 0)
}

/**
 * @brief 校验 RFC 3986 IP-literal / Validate an RFC 3986 IP-literal.
 * @param literal 不含方括号的字面量 / Literal without square brackets.
 * @return IPv6 或 IPvFuture 合法时为 true / True for a valid IPv6 or IPvFuture literal.
 */
function isUriIpLiteral(literal: string): boolean {
  if (URI_IP_V_FUTURE_PATTERN.test(literal)) return true
  try {
    /** @brief 用 WHATWG parser 仅验证 IPv6 host 语法的临时 URL / Temporary URL using the WHATWG parser only for IPv6 host syntax. */
    const parsed = new URL(`http://[${literal}]/`)
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
  } catch {
    return false
  }
}

/**
 * @brief 校验 RFC 3986 authority / Validate an RFC 3986 authority.
 * @param authority 不含 `//` 的 authority / Authority without the leading `//`.
 * @return userinfo、host 与 port 均合法时为 true / True when userinfo, host, and port are valid.
 */
function isUriAuthority(authority: string): boolean {
  /** @brief 可选 userinfo 的结束位置 / End position of optional userinfo. */
  const userInfoEnd = authority.lastIndexOf('@')
  if (userInfoEnd >= 0 && !URI_USER_INFO_PATTERN.test(authority.slice(0, userInfoEnd))) {
    return false
  }
  /** @brief 去除 userinfo 后的 host 与 port / Host and port after removing userinfo. */
  const hostAndPort = authority.slice(userInfoEnd + 1)

  if (hostAndPort.startsWith('[')) {
    /** @brief IP-literal 的右方括号 / Closing bracket of the IP-literal. */
    const closingBracket = hostAndPort.indexOf(']')
    if (closingBracket < 0) return false
    /** @brief IP-literal 后可选的 port / Optional port after the IP-literal. */
    const portSuffix = hostAndPort.slice(closingBracket + 1)
    return (
      isUriIpLiteral(hostAndPort.slice(1, closingBracket)) &&
      (portSuffix.length === 0 || /^:\d*$/u.test(portSuffix))
    )
  }

  if (hostAndPort.includes('[') || hostAndPort.includes(']')) return false
  /** @brief reg-name 与 port 的最后分隔位置 / Last separator between reg-name and port. */
  const portSeparator = hostAndPort.lastIndexOf(':')
  /** @brief 不含 port 的 reg-name / Registered name without a port. */
  const registeredName = portSeparator < 0 ? hostAndPort : hostAndPort.slice(0, portSeparator)
  /** @brief 可选十进制 port / Optional decimal port. */
  const port = portSeparator < 0 ? null : hostAndPort.slice(portSeparator + 1)
  return (
    !registeredName.includes(':') &&
    URI_REGISTERED_NAME_PATTERN.test(registeredName) &&
    (port === null || /^\d*$/u.test(port))
  )
}

/**
 * @brief 判断字符串是否为 RFC 3986 绝对 URI / Determine whether a string is an RFC 3986 absolute URI.
 * @param value 待校验字符串 / String to validate.
 * @return scheme、hier-part、query 与 fragment 均符合语法时为 true / True when scheme, hier-part, query, and fragment satisfy the grammar.
 * @note 这是 URI 而非 IRI 谓词；非 ASCII 字符必须 pct-encode。 / This validates URIs, not IRIs; non-ASCII characters must be percent-encoded.
 */
export function isAbsoluteUri(value: string): boolean {
  /** @brief scheme 与 scheme-specific 部分 / Scheme and scheme-specific remainder. */
  const match = ABSOLUTE_URI_PATTERN.exec(value)
  if (match === null) return false
  /** @brief scheme 之后的全部 URI 内容 / Complete URI content after the scheme. */
  const remainder = match[2] ?? ''
  /** @brief fragment 分隔位置 / Fragment delimiter position. */
  const fragmentStart = remainder.indexOf('#')
  if (fragmentStart >= 0 && remainder.indexOf('#', fragmentStart + 1) >= 0) return false
  /** @brief 不含 fragment 的 URI 部分 / URI portion without the fragment. */
  const beforeFragment = fragmentStart < 0 ? remainder : remainder.slice(0, fragmentStart)
  /** @brief 可选 fragment / Optional fragment. */
  const fragment = fragmentStart < 0 ? null : remainder.slice(fragmentStart + 1)
  if (fragment !== null && !URI_QUERY_OR_FRAGMENT_PATTERN.test(fragment)) return false

  /** @brief query 分隔位置 / Query delimiter position. */
  const queryStart = beforeFragment.indexOf('?')
  /** @brief 不含 query 的 hier-part / Hier-part without the query. */
  const hierarchy = queryStart < 0 ? beforeFragment : beforeFragment.slice(0, queryStart)
  /** @brief 可选 query / Optional query. */
  const query = queryStart < 0 ? null : beforeFragment.slice(queryStart + 1)
  if (query !== null && !URI_QUERY_OR_FRAGMENT_PATTERN.test(query)) return false

  if (hierarchy.startsWith('//')) {
    /** @brief authority 后首个 path 分隔符 / First path delimiter after the authority. */
    const pathStart = hierarchy.indexOf('/', 2)
    /** @brief URI authority / URI authority. */
    const authority = hierarchy.slice(2, pathStart < 0 ? undefined : pathStart)
    /** @brief authority 后的 path-abempty / Path-abempty following the authority. */
    const path = pathStart < 0 ? '' : hierarchy.slice(pathStart)
    return isUriAuthority(authority) && URI_PATH_PATTERN.test(path)
  }

  return URI_PATH_PATTERN.test(hierarchy)
}
