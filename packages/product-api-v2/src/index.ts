/** @file API v2 防腐层公共入口 / Public entrypoint for the API v2 anti-corruption layer. */

export { API_V2_CONTROLLED_TEST_ORIGIN, API_V2_PRODUCTION_ORIGIN } from './origin'
export { createApiV2Client, createApiV2PublicClient } from './http/client'
export type { ApiV2AccessTokenRefreshRequest, ApiV2AuthenticationPort } from './http/authentication'
export type {
  ApiV2AcceptedResourceResponse,
  ApiV2AuthenticatedContentResponse,
  ApiV2AuthenticatedHeaderVisibility,
  ApiV2Client,
  ApiV2ClientOptions,
  ApiV2CreatedResourceResponse,
  ApiV2DeleteOptions,
  ApiV2GetOptions,
  ApiV2HttpClient,
  ApiV2JsonResponse,
  ApiV2LocatedWriteResponseMetadata,
  ApiV2NoContentResponse,
  ApiV2PatchJsonOptions,
  ApiV2PostEmptyOptions,
  ApiV2PostJsonOptions,
  ApiV2PostJsonResponse,
  ApiV2PostSuccessKind,
  ApiV2PostSuccessPolicy,
  ApiV2PublicClientOptions,
  ApiV2QueryValue,
  ApiV2TransportOptions,
  ApiV2ResultWriteJsonResponse,
  ApiV2ResultWriteResponseMetadata,
  ApiV2TransportProfile,
  ApiV2UpdatedWriteJsonResponse,
  ApiV2VersionedWriteResponseMetadata,
  ApiV2WriteClient,
  ApiV2WriteJsonResponse,
  ApiV2WriteResponseMetadata
} from './http/client'
export {
  ApiV2AuthenticationRequiredError,
  ApiV2ContractError,
  ApiV2NetworkError,
  ApiV2WriteOutcomeUnknownError
} from './http/errors'
export type { ApiV2NetworkErrorKind, ApiV2WriteOutcomeUnknownKind } from './http/errors'
export { ApiV2ProblemError } from './http/problem-error'
export { parseProblemDetails } from './http/problem'
export type { ProblemDetails, ProblemFieldError } from './http/problem'
export { getCurrentUser, parseCurrentUser } from './identity/current-user'
export type { CurrentUser, CurrentUserRepresentation } from './identity/current-user'
export { getWorkspaceJob, jobNeedsPolling, parseJob } from './jobs/job'
export type {
  CancelledJob,
  ExpiredJob,
  FailedJob,
  Job,
  JobFields,
  JobProgress,
  JobProgressUnit,
  JobReadRequest,
  JobRepresentation,
  PendingJob,
  QueuedJob,
  RunningJob,
  SucceededJob
} from './jobs/job'
export { listWorkspaceJobPage, parseJobList } from './jobs/job-collection'
export type { JobListPageRequest } from './jobs/job-collection'
export { cancelWorkspaceJob } from './jobs/cancel-job'
export type { CancelWorkspaceJobCommand, JobCancellationHttpClient } from './jobs/cancel-job'
export { parseAcceptedWorkspaceJob } from './jobs/accepted-job'
export type { AcceptedWorkspaceJobRepresentation } from './jobs/accepted-job'
export { getWorkspaceArtifact, artifactMediaType, parseArtifact } from './artifacts/artifact'
export type {
  Artifact,
  ArtifactKind,
  ArtifactReadRequest,
  ArtifactRepresentation
} from './artifacts/artifact'
export { listWorkspaceArtifactPage, parseArtifactList } from './artifacts/artifact-collection'
export type { ArtifactListPageRequest } from './artifacts/artifact-collection'
export { getWorkspaceArtifactContent } from './artifacts/artifact-content'
export type {
  ArtifactByteRange,
  ArtifactContent,
  ArtifactContentDisposition,
  ArtifactContentFields,
  ArtifactContentRange,
  ArtifactContentReadRequest,
  AuthenticatedArtifactContentClient,
  AuthenticatedArtifactContentOptions,
  CompleteArtifactContent,
  PartialArtifactContent
} from './artifacts/artifact-content'
export { getWorkspaceArtifactSourceMap, parsePdfSourceMap } from './artifacts/pdf-source-map'
export type {
  PdfRect,
  PdfSourceMap,
  PdfSourceMapReadRequest,
  PdfSourceNode
} from './artifacts/pdf-source-map'
export { parseResourceReference, resourceType } from './resources/resource-reference'
export type { ResourceReference } from './resources/resource-reference'
export {
  encodeCreateKnowledgeSourceRequest,
  encodeKnowledgeSourceInput,
  encodeUpdateKnowledgeSourceRequest,
  parseKnowledgeSource,
  parseKnowledgeSourceList,
  parseKnowledgeVisibilityPolicy,
  parsePublicKnowledgeSourceConfig
} from './knowledge/knowledge-source'
export type {
  AgentScopeGrant,
  CloudDriveSourceInput,
  CreateKnowledgeSourceRequest,
  FileSourceInput,
  GitSourceInput,
  KnowledgeAgentOperation,
  KnowledgeIngestionState,
  KnowledgeIngestionStatus,
  KnowledgeModelRegion,
  KnowledgePolicyEffect,
  KnowledgeSensitivity,
  KnowledgeSource,
  KnowledgeSourceInput,
  KnowledgeSourceType,
  KnowledgeVisibilityPolicy,
  ManualSourceInput,
  PublicKnowledgeSourceConfig,
  ResumeSourceInput,
  UpdateKnowledgeSourceRequest,
  UrlSourceInput
} from './knowledge/knowledge-source'
export {
  createWorkspaceKnowledgeSource,
  getWorkspaceKnowledgeSource,
  listWorkspaceKnowledgeSourcePage,
  updateWorkspaceKnowledgeSource
} from './knowledge/knowledge-source-client'
export type {
  CreatedKnowledgeSourceRepresentation,
  CreateWorkspaceKnowledgeSourceCommand,
  KnowledgeSourceCreationHttpClient,
  KnowledgeSourcePageRequest,
  KnowledgeSourceReadRequest,
  KnowledgeSourceRepresentation,
  KnowledgeSourceUpdateHttpClient,
  UpdateWorkspaceKnowledgeSourceCommand
} from './knowledge/knowledge-source-client'
export { listResumePage, parseResumeList } from './resume/resume-list'
export type { ResumeListPageRequest, ResumeSummary } from './resume/resume-list'
export {
  assertResumeMatchesTemplate,
  encodeCreateResumeRequest,
  parseResumeDocument
} from './resume/resume-document'
export type {
  ContactMethod,
  ContactMethodKind,
  CreateResumeRequest,
  DateRange,
  LinkTextMark,
  PageInsets,
  PaletteIntent,
  ResumeDocument,
  ResumeItem,
  ResumeItemKind,
  ResumePageIntent,
  ResumePageOrientation,
  ResumeProfile,
  ResumeSection,
  ResumeSectionKind,
  ResumeStyleIntent,
  RichText,
  SectionLayoutIntent,
  StyleTextMark,
  TextMark,
  TextMarkKind,
  TypographyIntent
} from './resume/resume-document'
export {
  assertTemplateSettingValue,
  parseColorValue,
  parseMeasurement,
  parseTemplateList,
  parseTemplateManifest,
  parseTemplateRef
} from './resume/template'
export type {
  ColorSpace,
  ColorValue,
  Measurement,
  MeasurementUnit,
  ResumeOutputFormat,
  ResumePageSize,
  TemplateCapabilities,
  TemplateList,
  TemplateManifest,
  TemplateRef,
  TemplateSettingChoice,
  TemplateSettingControl,
  TemplateSettingDefinition,
  TemplateSettingValueType,
  TemplateSettingVisibility,
  TemplateZone
} from './resume/template'
export { getResumeTemplate, listResumeTemplatePage } from './resume/template-catalog'
export type {
  ResumeTemplatePageRequest,
  ResumeTemplateReadRequest
} from './resume/template-catalog'
export { createWorkspaceResume } from './resume/create-resume'
export type {
  CreatedResumeRepresentation,
  CreateWorkspaceResumeCommand,
  ResumeCreationHttpClient
} from './resume/create-resume'
export { getWorkspaceResume } from './resume/get-resume'
export type { ResumeDocumentReadRequest, ResumeRepresentation } from './resume/get-resume'
export {
  getWorkspaceResumeRevision,
  listWorkspaceResumeRevisionPage,
  parseResumeRevision,
  parseResumeRevisionList,
  parseResumeRevisionSummary
} from './resume/revision-history'
export type {
  ResumeRevision,
  ResumeRevisionListPageRequest,
  ResumeRevisionReadRequest,
  ResumeRevisionSummary
} from './resume/revision-history'
export {
  applyResumeOperations,
  encodeResumeOperationBatch,
  parseResumeOperation,
  parseResumeOperationResult
} from './resume/operations'
export type {
  ApplyResumeOperationsCommand,
  MoveResumeEntityOperation,
  RemoveResumeEntityOperation,
  ResumeConflict,
  ResumeConflictStrategy,
  ResumeEntityKind,
  ResumeOperation,
  ResumeOperationBatch,
  ResumeOperationRepresentation,
  ResumeOperationsHttpClient,
  ResumeOperationResult,
  ResumeRenderHint,
  SetResumeFieldOperation,
  SetResumeTemplateOperation,
  UpsertResumeItemOperation,
  UpsertResumeSectionOperation
} from './resume/operations'
export {
  decideResumeProposal,
  encodeProposalDecisionRequest,
  getWorkspaceResumeProposal,
  listWorkspaceResumeProposalPage,
  parseResumeProposal,
  parseResumeProposalList
} from './resume/proposals'
export type {
  AcceptResumeProposalDecision,
  AcceptSelectedResumeProposalDecision,
  DecideResumeProposalCommand,
  PendingResumeProposal,
  ProposalDecisionRequest,
  RejectResumeProposalDecision,
  ResumeProposal,
  ResumeProposalDecisionHttpClient,
  ResumeProposalDecisionRepresentation,
  ResumeProposalListRequest,
  ResumeProposalReadRequest,
  ResumeProposalRepresentation,
  ResumeProposalStatus,
  TerminalResumeProposal,
  TerminalResumeProposalStatus
} from './resume/proposals'
export {
  createWorkspaceResumeImportJob,
  createWorkspaceResumeRenderJob,
  createWorkspaceResumeRestoreJob,
  encodeCreateResumeImportJobRequest,
  encodeCreateResumeRenderJobRequest,
  encodeCreateResumeRestoreJobRequest
} from './resume/job-commands'
export type {
  CreateResumeImportJobRequest,
  CreateResumeRenderJobRequest,
  CreateResumeRestoreJobRequest,
  CreateWorkspaceResumeImportJobCommand,
  CreateWorkspaceResumeRenderJobCommand,
  CreateWorkspaceResumeRestoreJobCommand,
  ResumeJobCommandHttpClient,
  ResumeRenderFormat,
  ResumeRenderMode
} from './resume/job-commands'
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
  createNativeAuthorizationRequest,
  createWebAuthorizationRequest,
  restoreWebAuthorizationTransaction,
  snapshotWebAuthorizationTransaction
} from './oauth/authorization'
export type {
  AuthorizationScreenHint,
  CreateNativeAuthorizationOptions,
  CreatePublicClientAuthorizationOptions,
  CreateWebAuthorizationOptions,
  NativeAuthorizationRequest,
  NativeAuthorizationTransaction,
  OfflineAccessConsent,
  PublicClientAuthorizationTransaction,
  WebAuthorizationRequest,
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
  validateRefreshIdTokenClaims,
  verifyRefreshIdToken,
  verifyIdToken
} from './oauth/id-token'
export type {
  IdTokenSignatureVerificationInput,
  IdTokenSignatureVerifier,
  RefreshIdTokenVerificationContext,
  VerifyRefreshIdTokenOptions,
  VerifiedIdTokenClaims
} from './oauth/id-token'
export { exchangeAuthorizationCode } from './oauth/token'
export type { AuthorizationCodeTokenResponse } from './oauth/token'
export {
  completeWebAuthorization,
  InMemoryWebTokenSession,
  invalidateWebTokenSessionAccessToken,
  logoutWebTokenSession,
  refreshWebTokenSession,
  refreshWebTokenSessionIfCurrent
} from './oauth/session'
export type {
  CompleteWebAuthorizationOptions,
  LogoutWebTokenSessionOptions,
  RefreshWebTokenSessionIfCurrentOptions,
  RefreshWebTokenSessionOptions
} from './oauth/session'
export { WebCryptoJwksIdTokenVerifier } from './oauth/webcrypto-jwks-verifier'
export type {
  SupportedIdTokenAlgorithm,
  WebCryptoJwksIdTokenVerifierOptions
} from './oauth/webcrypto-jwks-verifier'
