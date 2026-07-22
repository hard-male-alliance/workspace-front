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
export { CurrentUserGateway, parseCurrentUser } from './identity/current-user'
export type { CurrentUser, CurrentUserRepresentation } from './identity/current-user'
export { ResumeListGateway, parseResumeList } from './resume/resume-list'
export type {
  ResumeListPageRequest,
  ResumeSummary,
  ResumeTemplateReference
} from './resume/resume-list'
export { WorkspaceAccessGateway, parseWorkspaceList } from './workspace/workspace-access'
export type {
  Workspace,
  WorkspaceAccess,
  WorkspaceAccessPageRequest,
  WorkspaceDataRegion,
  WorkspacePlan,
  WorkspaceRole
} from './workspace/workspace-access'
