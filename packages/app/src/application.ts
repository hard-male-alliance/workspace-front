/** @file 应用组合端口 / Application composition ports. */

import type { InterviewGateway } from './contexts/interview/application/gateway'
import type { IdentityGateway } from './contexts/identity/application/gateway'
import type { KnowledgeGateway } from './contexts/knowledge/application/gateway'
import type { ResumeGateway } from './contexts/resume/application/gateway'
import type { ResumeReviewPort } from './contexts/resume/application/review'
import type {
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from './contexts/resume/application/resume-creation'
import type { WorkspaceGateway } from './contexts/workspace/application/gateway'
import type { WorkspaceOperationsGateway } from './contexts/workspace-operations/application/gateway'

export { createUiCommandId } from './shared-kernel/command'
export type { UiCommandId } from './shared-kernel/command'
export { asUiConcurrencyToken } from './shared-kernel/concurrency'
export type { UiConcurrencyToken } from './shared-kernel/concurrency'
export { asUiOpaqueId } from './shared-kernel/identity'
export type { UiOpaqueId, UiWorkspaceId } from './shared-kernel/identity'
export type { UiResourceReference } from './shared-kernel/resource-reference'
export type { UiContentLocale } from './shared-kernel/locale'
export { cloneUiJsonValue, uiJsonValuesEqual } from './shared-kernel/json'
export {
  asUiEmailAddress,
  asUiOAuthScope,
  asUiPrincipalSubject,
  asUiUserLocale
} from './contexts/identity/domain/models'
export type {
  UiCurrentUser,
  UiCurrentUserId,
  UiEmailAddress,
  UiOAuthScope,
  UiPrincipalSubject,
  UiUserLocale
} from './contexts/identity/domain/models'
export {
  asUiWorkspaceCursor,
  asUiWorkspaceRevision,
  asUiWorkspaceSlug,
  asUiWorkspaceTimestamp
} from './contexts/workspace/domain/models'
export type {
  UiWorkspace,
  UiWorkspaceAccess,
  UiWorkspaceAccessPage,
  UiWorkspaceCursor,
  UiWorkspaceMemberId
} from './contexts/workspace/domain/models'
export { asUiResumeCursor, asUiResumePageLimit } from './contexts/resume/domain/models'
export type {
  UiResumeCursor,
  UiResumeRenderFormat,
  UiResumeRenderMode,
  UiStartResumeRenderInput,
  UiResumeTemplateSectionFact,
  UiResumeTemplateStyleCommand,
  UiResumeSummary,
  UiResumeSummaryPage,
  UiTemplateManifest
} from './contexts/resume/domain/models'
export { deriveResumeRenderFormatAvailability } from './contexts/resume/domain/render-policy'
export type {
  ResumeRenderFormatAvailability,
  UiResumeDeliverableFormat
} from './contexts/resume/domain/render-policy'
export type {
  UiColorValue,
  UiJsonObject,
  UiJsonValue,
  UiMeasurement,
  UiResumeDocument,
  UiResumeEditorModel,
  UiResumeId,
  UiResumePartialDate,
  UiResumeRichText,
  UiResumeStyleIntent,
  UiResumeTextMark,
  UiTemplateReference
} from './contexts/resume/domain/document'
export { asUiResumePartialDate } from './contexts/resume/domain/document'
export {
  asUiResumeProposalCursor,
  asUiResumeReviewPageLimit,
  asUiResumeRevisionCursor,
  groupUiResumeProposalOperations,
  UI_RESUME_REVIEW_PAGE_LIMIT_MAX
} from './contexts/resume/domain/review'
export type {
  UiDecideResumeProposalCommand,
  UiPendingResumeProposal,
  UiResumeProposal,
  UiResumeProposalAuthority,
  UiResumeProposalConflict,
  UiResumeProposalCursor,
  UiResumeProposalDecision,
  UiResumeProposalDecisionResult,
  UiResumeProposalId,
  UiResumeProposalOperation,
  UiResumeProposalOperationGroup,
  UiResumeProposalOperationId,
  UiResumeProposalPage,
  UiResumeProposalPageRead,
  UiResumeProposalStatus,
  UiResumeReviewPageLimit,
  UiResumeRevision,
  UiResumeRevisionCursor,
  UiResumeRevisionPage,
  UiResumeRevisionPageRead,
  UiResumeRevisionSummary,
  UiStartResumeRestoreInput,
  UiTerminalResumeProposal
} from './contexts/resume/domain/review'
export type { ResumeReviewPort } from './contexts/resume/application/review'
export {
  asUiResumeTemplateCursor,
  asUiResumeTemplatePageLimit,
  UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX
} from './contexts/resume/domain/creation'
export type {
  UiCreateResumeFromTemplateCommand,
  UiCreatedResume,
  UiCreatedResumeResource,
  UiResumeCreationSource,
  UiResumeCreationTemplateOption,
  UiResumeCreationTemplatePage,
  UiResumeCreationTemplatePageRead,
  UiResumeTemplateCursor,
  UiResumeTemplatePage,
  UiResumeTemplatePageLimit,
  UiResumeTemplatePageRead
} from './contexts/resume/domain/creation'
export {
  createResumeFromTemplate,
  loadResumeCreationTemplatePage,
  ResumeCreationError,
  supportsResumeLocale
} from './contexts/resume/application/resume-creation'
export type {
  ResumeCreationFailure,
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from './contexts/resume/application/resume-creation'
export {
  getResumeBatchConflict,
  ResumeBatchConflictError
} from './contexts/resume/application/errors'
export {
  asUiWorkspaceOperationsCursor,
  asUiWorkspaceOperationsPageLimit,
  uiWorkspaceArtifactsEqual,
  UI_WORKSPACE_OPERATIONS_PAGE_LIMIT_MAX
} from './contexts/workspace-operations/domain/models'
export type {
  UiWorkspaceArtifact,
  UiWorkspaceArtifactAuthority,
  UiWorkspaceArtifactContent,
  UiWorkspaceArtifactId,
  UiWorkspaceArtifactKind,
  UiWorkspaceArtifactPage,
  UiWorkspaceJob,
  UiWorkspaceJobAuthority,
  UiWorkspaceJobId,
  UiWorkspaceJobPage,
  UiWorkspaceJobProgress,
  UiWorkspaceJobProgressUnit,
  UiWorkspaceOperationProblem,
  UiWorkspaceOperationProblemFieldError,
  UiWorkspaceOperationsCursor,
  UiWorkspaceOperationsPageLimit,
  UiWorkspaceResourceRef
} from './contexts/workspace-operations/domain/models'
export type {
  UiWorkspaceArtifactPageRead,
  UiWorkspaceArtifactRead,
  UiWorkspaceJobCancellation,
  UiWorkspaceJobPageRead,
  UiWorkspaceJobRead,
  WorkspaceOperationsGateway
} from './contexts/workspace-operations/application/gateway'
export type {
  ResumeBatchConflict,
  ResumeBatchConflictRecovery
} from './contexts/resume/application/errors'

/** @brief 产品应用依赖的上下文端口集合 / Context ports required by the product application. */
export interface AppGateways {
  /** @brief Identity 端口 / Identity port. */
  readonly identity: IdentityGateway
  /** @brief Workspace Experience 端口 / Workspace Experience port. */
  readonly workspace: WorkspaceGateway
  /** @brief Workspace 通用 Job 与 Artifact 端口 / Generic Workspace Job and Artifact port. */
  readonly workspaceOperations: WorkspaceOperationsGateway
  /** @brief Resume Authoring 端口 / Resume Authoring port. */
  readonly resume: ResumeGateway
  /** @brief Resume 历史、建议审阅与恢复端口 / Resume history, proposal-review, and restore port. */
  readonly resumeReview: ResumeReviewPort
  /** @brief Workspace-scoped Resume 创建端口 / Workspace-scoped Resume-creation port. */
  readonly resumeCreation: ResumeCreationPort
  /** @brief 全局不可变 Resume Template 目录端口 / Global immutable Resume Template-catalog port. */
  readonly resumeTemplates: ResumeTemplateCatalogPort
  /** @brief Interview Practice 端口 / Interview Practice port. */
  readonly interview: InterviewGateway
  /** @brief Knowledge 端口 / Knowledge port. */
  readonly knowledge: KnowledgeGateway
}
