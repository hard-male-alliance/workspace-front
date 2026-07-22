/** @file Identity 限界上下文的 v2 领域投影 / v2 domain projections for the Identity bounded context. */

import type { UiOpaqueId, UiWorkspaceId } from '../../../shared-kernel/identity'

/** @brief 当前用户资源标识符 / Current-user resource identifier. */
export type UiCurrentUserId = UiOpaqueId<'user'>

/** @brief 固定 OIDC issuer 下的 principal subject / Principal subject beneath the fixed OIDC issuer. */
export type UiPrincipalSubject = string & {
  /** @brief principal subject 品牌 / Principal-subject brand. */
  readonly __uiIdentityBrand: 'principal-subject'
}

/** @brief 已验证邮箱地址 / Validated email address. */
export type UiEmailAddress = string & {
  /** @brief 邮箱地址品牌 / Email-address brand. */
  readonly __uiIdentityBrand: 'email-address'
}

/** @brief 已验证用户界面 Locale / Validated user-interface locale. */
export type UiUserLocale = string & {
  /** @brief 用户 Locale 品牌 / User-locale brand. */
  readonly __uiIdentityBrand: 'user-locale'
}

/** @brief 当前 token 授予的 OAuth scope / OAuth scope granted to the current token. */
export type UiOAuthScope = string & {
  /** @brief OAuth scope 品牌 / OAuth-scope brand. */
  readonly __uiIdentityBrand: 'oauth-scope'
}

/** @brief OIDC subject 的 v2 长度约束 / v2 length constraint for an OIDC subject. */
const SUBJECT_MAX_LENGTH = 255

/** @brief 邮箱地址的 v2 最大长度 / v2 maximum length for an email address. */
const EMAIL_MAX_LENGTH = 320

/** @brief v2 Locale 格式 / v2 Locale format. */
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** @brief v2 OAuth scope 格式 / v2 OAuth-scope format. */
const OAUTH_SCOPE_PATTERN = /^[a-z][a-z0-9_.:-]+$/u

/**
 * @brief 将已验证字符串提升为 principal subject / Refine a validated string into a principal subject.
 * @param value 固定 issuer 下的 OIDC subject / OIDC subject beneath the fixed issuer.
 * @return 带 Identity 语义品牌的 subject / Subject branded with Identity semantics.
 * @throws {TypeError} 当值违反 v2 subject 约束时抛出 / Thrown when the value violates v2 subject constraints.
 */
export function asUiPrincipalSubject(value: string): UiPrincipalSubject {
  if (value.length < 1 || [...value].length > SUBJECT_MAX_LENGTH) {
    throw new TypeError('A principal subject must contain between 1 and 255 characters.')
  }
  return value as UiPrincipalSubject
}

/**
 * @brief 将已验证字符串提升为邮箱地址 / Refine a validated string into an email address.
 * @param value 邮箱字符串 / Email string.
 * @return 带 Identity 语义品牌的邮箱 / Email branded with Identity semantics.
 * @throws {TypeError} 当值明显不符合 v2 email 约束时抛出 / Thrown when the value plainly violates v2 email constraints.
 * @note 完整 email format 校验属于 API v2 ACL；此处只维护应用领域所需的不变量。 / Full email-format validation belongs to the API v2 ACL; this function keeps only application-domain invariants.
 */
export function asUiEmailAddress(value: string): UiEmailAddress {
  if (value.length < 3 || [...value].length > EMAIL_MAX_LENGTH || !/^\S+@\S+$/u.test(value)) {
    throw new TypeError(
      'An email address must be non-empty, bounded, and contain one address separator.'
    )
  }
  return value as UiEmailAddress
}

/**
 * @brief 将已验证字符串提升为用户 Locale / Refine a validated string into a user locale.
 * @param value BCP 47 风格的 v2 Locale / BCP-47-shaped v2 locale.
 * @return 带 Identity 语义品牌的 Locale / Locale branded with Identity semantics.
 * @throws {TypeError} 当值违反冻结格式时抛出 / Thrown when the value violates the frozen format.
 */
export function asUiUserLocale(value: string): UiUserLocale {
  if (!LOCALE_PATTERN.test(value))
    throw new TypeError('A user locale must match the API v2 Locale format.')
  return value as UiUserLocale
}

/**
 * @brief 将已验证字符串提升为 OAuth scope / Refine a validated string into an OAuth scope.
 * @param value scope 字符串 / Scope string.
 * @return 带 Identity 语义品牌的 scope / Scope branded with Identity semantics.
 * @throws {TypeError} 当值违反 v2 scope 格式时抛出 / Thrown when the value violates the v2 scope format.
 */
export function asUiOAuthScope(value: string): UiOAuthScope {
  if (!OAUTH_SCOPE_PATTERN.test(value))
    throw new TypeError('An OAuth scope must match the API v2 scope format.')
  return value as UiOAuthScope
}

/**
 * @brief 当前已认证用户的 v2 领域投影 / v2 domain projection of the current authenticated user.
 * @note scopes 使用集合表达 Schema 的 uniqueItems 语义。 / scopes uses a set to express the Schema uniqueItems semantics.
 */
export interface UiCurrentUser {
  /** @brief 用户资源 ID / User-resource ID. */
  readonly id: UiCurrentUserId
  /** @brief 固定 issuer 下稳定的 principal subject / Stable principal subject beneath the fixed issuer. */
  readonly subject: UiPrincipalSubject
  /** @brief 当前账户邮箱 / Current account email. */
  readonly email: UiEmailAddress
  /** @brief 邮箱是否已验证 / Whether the email is verified. */
  readonly emailVerified: boolean
  /** @brief 用户显示名称 / User display name. */
  readonly displayName: string
  /** @brief 用户界面 Locale / User-interface locale. */
  readonly locale: UiUserLocale
  /** @brief 默认 Workspace 界面偏好 / Default-Workspace UI preference. */
  readonly defaultWorkspaceId: UiWorkspaceId | null
  /** @brief 当前 token 授予的唯一 scopes / Unique scopes granted to the current token. */
  readonly scopes: ReadonlySet<UiOAuthScope>
}
