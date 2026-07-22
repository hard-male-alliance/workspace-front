/** @file API v2 防腐层公共入口 / Public entrypoint for the API v2 anti-corruption layer. */

export { createApiV2Client } from './http/client'
export type {
  ApiV2Client,
  ApiV2ClientOptions,
  ApiV2GetOptions,
  ApiV2JsonResponse,
  ApiV2QueryValue,
  ApiV2TransportProfile
} from './http/client'
export {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError
} from './http/errors'
export type { ApiV2NetworkErrorKind } from './http/errors'
export { ApiV2ProblemError } from './http/problem-error'
export { parseProblemDetails } from './http/problem'
export type { ProblemDetails, ProblemFieldError } from './http/problem'
export { getCurrentUser, parseCurrentUser } from './identity/current-user'
export type { CurrentUser, CurrentUserRepresentation } from './identity/current-user'
export { listResumePage, parseResumeList } from './resume/resume-list'
export type {
  ResumeListPageRequest,
  ResumeSummary,
  ResumeTemplateReference
} from './resume/resume-list'
export { listWorkspaceAccessPage, parseWorkspaceList } from './workspace/workspace-access'
export type {
  Workspace,
  WorkspaceAccess,
  WorkspaceAccessPageRequest,
  WorkspaceDataRegion,
  WorkspacePlan,
  WorkspaceRole
} from './workspace/workspace-access'
export {
  createWebAuthorizationRequest,
  restoreWebAuthorizationTransaction,
  snapshotWebAuthorizationTransaction
} from './oauth/authorization'
export type {
  CreateWebAuthorizationOptions,
  OfflineAccessConsent,
  WebAuthorizationRequest,
  WebAuthorizationScreenHint,
  WebAuthorizationTransaction,
  WebAuthorizationTransactionSnapshot
} from './oauth/authorization'
export { parseAuthorizationCallback } from './oauth/callback'
export type { AuthorizationCodeResponse } from './oauth/callback'
export {
  API_V2_OAUTH_AUTHORIZATION_ENDPOINT,
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI,
  API_V2_OAUTH_REVOCATION_ENDPOINT,
  API_V2_OAUTH_TOKEN_ENDPOINT,
  API_V2_OAUTH_USERINFO_ENDPOINT,
  API_V2_OIDC_DISCOVERY_URL,
  fetchOidcDiscovery,
  parseOidcDiscovery
} from './oauth/discovery'
export type { OidcDiscoveryDocument } from './oauth/discovery'
export { OAuthAuthorizationResponseError, OAuthTokenResponseError } from './oauth/errors'
export {
  RejectingIdTokenSignatureVerifier,
  validateIdTokenClaims,
  verifyIdToken
} from './oauth/id-token'
export type {
  IdTokenSignatureVerificationInput,
  IdTokenSignatureVerifier,
  VerifiedIdTokenClaims
} from './oauth/id-token'
export { completeWebAuthorization, InMemoryWebTokenSession } from './oauth/session'
export type { CompleteWebAuthorizationOptions } from './oauth/session'
export { exchangeAuthorizationCode, parseAuthorizationCodeTokenResponse } from './oauth/token'
export type { AuthorizationCodeTokenResponse } from './oauth/token'
export { WebCryptoJwksIdTokenVerifier } from './oauth/webcrypto-jwks-verifier'
export type {
  SupportedIdTokenAlgorithm,
  WebCryptoJwksIdTokenVerifierOptions
} from './oauth/webcrypto-jwks-verifier'
