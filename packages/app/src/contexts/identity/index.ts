/** @file Identity 限界上下文公共入口 / Identity bounded-context public entry. */

export type { IdentityGateway } from './application/gateway'
export {
  asUiEmailAddress,
  asUiOAuthScope,
  asUiPrincipalSubject,
  asUiUserLocale
} from './domain/models'
export type {
  UiCurrentUser,
  UiCurrentUserId,
  UiEmailAddress,
  UiOAuthScope,
  UiPrincipalSubject,
  UiUserLocale
} from './domain/models'
