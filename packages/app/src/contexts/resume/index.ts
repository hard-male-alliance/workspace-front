/** @file resume 限界上下文公共入口 / resume bounded-context public entry. */

export type {
  UiResumeId,
  UiResumeSectionId,
  UiTemplateId,
  UiResumeSectionKind,
  UiResumeItemKind,
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
  UiTemplateSettingValue,
  UiResumeStyleIntent,
  UiTemplateReference,
  UiResumeDocument,
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
  UiResumeEditorModel,
  UiResumeSectionUpdateInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionDeleteInput,
  UiResumeTemplateSettingsUpdateInput,
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
export { ResumeCreationPage } from './presentation/ResumeCreationPage'
export { ResumeEditorPage } from './presentation/ResumeEditorPage'
export { ResumeListPage } from './presentation/ResumeListPage'
export { TemplateSettingsPage } from './presentation/TemplateSettingsPage'
