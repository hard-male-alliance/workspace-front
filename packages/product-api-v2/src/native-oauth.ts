/** @file Node/Electron native OAuth 的窄公共入口 / Narrow public entrypoint for Node/Electron native OAuth. */

export { createNativeAuthorizationRequest } from './oauth/authorization'
export type {
  AuthorizationScreenHint,
  CreateNativeAuthorizationOptions,
  NativeAuthorizationRequest,
  NativeAuthorizationTransaction,
  OfflineAccessConsent
} from './oauth/authorization'
export { parseAuthorizationCallback } from './oauth/callback'
export type { AuthorizationCodeResponse } from './oauth/callback'
export { OAuthAuthorizationResponseError } from './oauth/errors'
export { API_V2_OAUTH_AUTHORIZATION_ENDPOINT, API_V2_OAUTH_ISSUER } from './oauth/discovery'
export type { OidcDiscoveryDocument } from './oauth/discovery'
