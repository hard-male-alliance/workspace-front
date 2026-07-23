/** @file resume 限界上下文公共入口 / resume bounded-context public entry. */

export type {
  UiResumeId,
  UiResumeSectionId,
  UiResumeItemId,
  UiResumeContactId,
  UiTemplateId,
  UiResumeSectionKind,
  UiResumeItemKind,
  UiResumePartialDate,
  UiResumeDateRange,
  UiResumeTextMarkKind,
  UiResumeLinkTextMark,
  UiResumeStyleTextMark,
  UiResumeTextMark,
  UiResumeRichText,
  UiResumeItem,
  UiResumeSection,
  UiResumeContactKind,
  UiResumeContact,
  UiResumeProfile,
  UiResumePageSize,
  UiResumeOutputFormat,
  UiResumePageOrientation,
  UiMeasurementUnit,
  UiMeasurement,
  UiPageInsets,
  UiResumePageIntent,
  UiTypographyIntent,
  UiColorSpace,
  UiColorValue,
  UiPaletteIntent,
  UiSectionLayoutIntent,
  UiJsonValue,
  UiResumeStyleIntent,
  UiTemplateReference,
  UiResumeDocument,
  UiResumeEditorModel
} from './domain/document'
export { asUiResumePartialDate, replaceUiResumeRichTextText } from './domain/document'
export type {
  UiResumeCursor,
  UiResumePageLimit,
  UiResumeSummary,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiTemplateSettingControl,
  UiTemplateSettingValueType,
  UiTemplateSettingChoice,
  UiTemplateSettingVisibility,
  UiTemplateSettingDefinition,
  UiTemplateZone,
  UiTemplateCapabilities,
  UiTemplateManifest,
  UiResumeRenderMode,
  UiResumeRenderFormat,
  UiStartResumeRenderInput,
  UiResumeSectionUpdateInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionDeleteInput,
  UiResumeTemplateSectionFact,
  UiResumeTemplateStyleCommand,
  UiTemplateSettingsModel
} from './domain/models'
export { asUiResumeCursor, asUiResumePageLimit, UI_RESUME_PAGE_LIMIT_MAX } from './domain/models'
export { deriveResumeRenderFormatAvailability } from './domain/render-policy'
export type {
  ResumeRenderFormatAvailability,
  UiResumeDeliverableFormat
} from './domain/render-policy'
export {
  asUiResumeTemplateCursor,
  asUiResumeTemplatePageLimit,
  UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX
} from './domain/creation'
export type {
  UiResumeTemplateCursor,
  UiResumeTemplatePageLimit,
  UiResumeTemplatePageRead,
  UiResumeTemplatePage,
  UiResumeCreationTemplateOption,
  UiResumeCreationTemplatePage,
  UiResumeCreationTemplatePageRead,
  UiResumeCreationSource,
  UiCreateResumeFromTemplateCommand,
  UiCreatedResume,
  UiCreatedResumeResource
} from './domain/creation'
export type { ResumeGateway } from './application/gateway'
export type { ResumeReviewPort } from './application/review'
export {
  asUiResumeProposalCursor,
  asUiResumeReviewPageLimit,
  asUiResumeRevisionCursor,
  groupUiResumeProposalOperations,
  UI_RESUME_REVIEW_PAGE_LIMIT_MAX
} from './domain/review'
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
} from './domain/review'
export {
  createResumeFromTemplate,
  loadResumeCreationTemplatePage,
  ResumeCreationError,
  supportsResumeLocale
} from './application/resume-creation'
export type {
  ResumeCreationFailure,
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from './application/resume-creation'
export {
  getResumeBatchConflict,
  getResumeIdempotencyConflict,
  ResumeBatchConflictError
} from './application/errors'
export type { ResumeBatchConflict, ResumeBatchConflictRecovery } from './application/errors'
export { ResumeCreationPage } from './presentation/ResumeCreationPage'
export { ResumeEditorPage } from './presentation/ResumeEditorPage'
export { ResumeListPage } from './presentation/ResumeListPage'
export { ResumeReviewPage } from './presentation/ResumeReviewPage'
export { TemplateSettingsPage } from './presentation/TemplateSettingsPage'
