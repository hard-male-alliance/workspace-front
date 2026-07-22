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
  UiResumePdfArtifact,
  UiResumeRenderJobStatus,
  UiResumeRenderJob,
  UiStartResumePdfRenderInput,
  UiResumeSectionUpdateInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionDeleteInput,
  UiResumeTemplateSectionFact,
  UiResumeTemplateStyleCommand,
  UiTemplateSettingsModel
} from './domain/models'
export { asUiResumeCursor, asUiResumePageLimit, UI_RESUME_PAGE_LIMIT_MAX } from './domain/models'
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
export { TemplateSettingsPage } from './presentation/TemplateSettingsPage'
