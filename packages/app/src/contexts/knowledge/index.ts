/** @file knowledge 限界上下文公共入口 / knowledge bounded-context public entry. */

export type { UiKnowledgeSourceId } from '../../shared-kernel/identity'
export {
  asUiKnowledgeSourceCursor,
  asUiKnowledgeSourcePageLimit,
  UI_KNOWLEDGE_SOURCE_PAGE_LIMIT_MAX
} from './domain/models'
export type {
  UiAgentScopeGrant,
  UiKnowledgeAgentScope,
  UiKnowledgeIngestionState,
  UiKnowledgeIngestionStatus,
  UiKnowledgeModelRegion,
  UiKnowledgeOperation,
  UiKnowledgeProblem,
  UiKnowledgeProblemFieldError,
  UiKnowledgeSensitivity,
  UiKnowledgeSource,
  UiKnowledgeSourceAuthority,
  UiKnowledgeSourceCursor,
  UiKnowledgeSourcePage,
  UiKnowledgeSourcePageLimit,
  UiKnowledgeSourceType,
  UiKnowledgeSourceVersionId,
  UiKnowledgeVisibilityPolicy,
  UiPublicKnowledgeSourceConfig,
  UiVisibilityEffect
} from './domain/models'
export type {
  UiCreateManualKnowledgeNoteCommand,
  UiKnowledgeSourcePageRead,
  UiKnowledgeSourcePatch,
  UiKnowledgeSourceRead,
  UiUpdateKnowledgeSourceCommand
} from './application/commands'
export type { KnowledgeGateway } from './application/gateway'
export {
  createKnowledgeManualNoteCreationProcess,
  KnowledgeManualNoteCreationProcessError
} from './application/manual-note-creation'
export type {
  KnowledgeManualNoteCreationProcess,
  KnowledgeManualNoteCreationProcessErrorCode,
  UiKnowledgeCreateAuthorityReviewReason,
  UiKnowledgeCreateRecoveryMode,
  UiKnowledgeCreationScope,
  UiManualKnowledgeNoteDraft,
  UiPendingManualKnowledgeNoteCreation
} from './application/manual-note-creation'
export {
  classifyKnowledgeUpdateRecovery,
  KnowledgeUpdateRecoveryError,
  knowledgeVisibilityPoliciesEqual
} from './application/update-recovery'
export type {
  KnowledgeUpdateRecoveryErrorCode,
  UiKnowledgeUpdateConflictField,
  UiKnowledgeUpdateRecovery
} from './application/update-recovery'
export { KnowledgePage } from './presentation/KnowledgePage'
export { KnowledgeSourceDetailPage } from './presentation/KnowledgeSourceDetailPage'
export { KnowledgeSourceEditPage } from './presentation/KnowledgeSourceEditPage'
export { ManualNoteCreatePage } from './presentation/ManualNoteCreatePage'
