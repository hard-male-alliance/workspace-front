/** @file Transport DTO 到现有 UI 模型的集中映射 / Central transport-to-UI mapping. */

import type { UiAgentScope } from '../../shared-kernel/agent-scope'
import { asUiOpaqueId } from '../../shared-kernel/identity'
import type {
  UiKnowledgeIngestionStatus,
  UiKnowledgeIngestionJob,
  UiKnowledgeOperation,
  UiKnowledgeSearchResult,
  UiKnowledgeSensitivity,
  UiKnowledgeSource,
  UiKnowledgeSourceType,
  UiVisibilityEffect
} from '../../contexts/knowledge/domain/models'
import type {
  UiColorValue,
  UiMeasurement,
  UiResumeContactKind,
  UiResumeDocument,
  UiResumeItem,
  UiResumeItemKind,
  UiResumePageOrientation,
  UiResumePageSize,
  UiResumeSectionKind,
  UiTemplateManifest,
  UiTemplateSettingControl,
  UiTemplateSettingValue,
  UiTemplateSettingValueType
} from '../../contexts/resume/domain/models'
import { HttpContractError } from './http-client'
import type {
  ColorValueDto,
  KnowledgeIngestionJobDto,
  KnowledgeSearchResultDto,
  KnowledgeSourceDto,
  MeasurementDto,
  ResumeDocumentDto,
  ResumeItemDto,
  TemplateManifestDto
} from './transport-types'

const sectionKinds: readonly UiResumeSectionKind[] = [
  'summary',
  'experience',
  'education',
  'projects',
  'skills',
  'publications',
  'awards',
  'certifications',
  'languages',
  'volunteer',
  'custom'
]
const pageSizes: readonly UiResumePageSize[] = ['A4', 'LETTER', 'LEGAL', 'CUSTOM']
const pageOrientations: readonly UiResumePageOrientation[] = ['portrait', 'landscape']
const contactKinds: readonly UiResumeContactKind[] = [
  'email',
  'phone',
  'website',
  'linkedin',
  'github',
  'portfolio',
  'location',
  'other'
]
const itemKinds: readonly UiResumeItemKind[] = [
  'experience',
  'education',
  'project',
  'skill_group',
  'publication',
  'award',
  'certification',
  'language',
  'volunteer',
  'custom'
]
const knowledgeSourceTypes: readonly UiKnowledgeSourceType[] = [
  'resume',
  'file',
  'url',
  'website',
  'blog_feed',
  'git_repository',
  'manual_note',
  'cloud_drive'
]
const ingestionStatuses: readonly UiKnowledgeIngestionStatus[] = [
  'not_started',
  'queued',
  'fetching',
  'parsing',
  'chunking',
  'embedding',
  'ready',
  'stale',
  'failed',
  'deleted'
]
const visibilityEffects: readonly UiVisibilityEffect[] = ['allow', 'deny']
const sensitivities: readonly UiKnowledgeSensitivity[] = [
  'normal',
  'confidential',
  'highly_confidential'
]
const agentScopes: readonly UiAgentScope[] = [
  'resume_assistant',
  'job_fit_analyst',
  'interview_agent',
  'interview_reporter',
  'general_chat',
  'portfolio_assistant'
]
const knowledgeOperations: readonly UiKnowledgeOperation[] = [
  'retrieve',
  'quote',
  'summarize',
  'derive',
  'write_back'
]
const modelRegions = ['cn', 'global', 'private_deployment'] as const
const settingControls: readonly UiTemplateSettingControl[] = [
  'switch',
  'slider',
  'number',
  'select',
  'radio',
  'color',
  'measurement',
  'text'
]
const settingValueTypes: readonly UiTemplateSettingValueType[] = [
  'boolean',
  'integer',
  'number',
  'string',
  'choice',
  'color',
  'measurement'
]

/** @brief 校验 mapper 使用的字符串枚举 / Validate a string enum used by a mapper. */
function enumValue<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  path: string
): TValue {
  if (!allowed.includes(value as TValue)) {
    throw new HttpContractError(`Backend field ${path} has an unsupported value.`, 200)
  }
  return value as TValue
}

/** @brief 映射模板设置值 / Map a template-setting value. */
function mapTemplateSettingValue(value: unknown, path: string): UiTemplateSettingValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const input = value as Record<string, unknown>
    if ((input.space === 'srgb_hex' || input.space === 'rgba') && typeof input.value === 'string') {
      return { space: input.space, value: input.value } satisfies UiColorValue
    }
    if (
      typeof input.value === 'number' &&
      (input.unit === 'pt' || input.unit === 'mm' || input.unit === 'cm' || input.unit === 'in')
    ) {
      return { unit: input.unit, value: input.value } satisfies UiMeasurement
    }
  }
  throw new HttpContractError(`Backend field ${path} is not a supported template value.`, 200)
}

/** @brief 映射测量值 / Map a measurement. */
function mapMeasurement(dto: MeasurementDto, path: string): UiMeasurement {
  if (dto.unit !== 'pt' && dto.unit !== 'mm' && dto.unit !== 'cm' && dto.unit !== 'in') {
    throw new HttpContractError(`Backend field ${path}.unit has an unsupported value.`, 200)
  }
  return { unit: dto.unit, value: dto.value }
}

/** @brief 映射颜色值 / Map a color value. */
function mapColor(dto: ColorValueDto, path: string): UiColorValue {
  if (dto.space !== 'srgb_hex' && dto.space !== 'rgba') {
    throw new HttpContractError(`Backend field ${path}.space has an unsupported value.`, 200)
  }
  return { space: dto.space, value: dto.value }
}

/** @brief 读取条目中的第一个字符串字段 / Read the first string field from an item. */
function firstString(
  raw: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/** @brief 映射多态简历条目为统一 UI 投影 / Map a polymorphic Resume item to the unified UI projection. */
function mapResumeItem(dto: ResumeItemDto, path: string): UiResumeItem {
  const kind = enumValue(dto.item_kind, itemKinds, `${path}.item_kind`)
  const title =
    firstString(dto.raw, ['position', 'degree', 'name', 'title', 'language', 'role']) ?? dto.item_id
  const subtitle = firstString(dto.raw, [
    'organization',
    'institution',
    'field_of_study',
    'issuer',
    'proficiency'
  ])
  const locationLabel = firstString(dto.raw, ['location'])
  const start = firstString(dto.raw, ['start_date', 'issued_at', 'publication_date'])
  const end = firstString(dto.raw, ['end_date', 'expires_at'])
  const highlightsValue = dto.raw.highlights
  const highlights = Array.isArray(highlightsValue)
    ? highlightsValue.flatMap((value): string[] => {
        if (typeof value === 'string') return [value]
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const plainText = (value as Record<string, unknown>).plain_text
          return typeof plainText === 'string' ? [plainText] : []
        }
        return []
      })
    : []

  return {
    dateLabel: start === null ? end : end === null ? start : `${start} – ${end}`,
    highlights,
    id: dto.item_id,
    kind,
    locationLabel,
    subtitle,
    tags: dto.tags,
    title,
    visible: dto.visible
  }
}

/** @brief 映射正式模板清单 / Map a formal template manifest. */
export function mapTemplateManifestDto(dto: TemplateManifestDto): UiTemplateManifest {
  return {
    bulletStyleTokens: dto.bullet_style_tokens,
    capabilities: {
      maxColumns: dto.capabilities.max_columns,
      supportsCustomSections: dto.capabilities.supports_custom_sections,
      supportsPhoto: dto.capabilities.supports_photo,
      supportsSidebar: dto.capabilities.supports_sidebar,
      supportsSourceMap: dto.capabilities.supports_source_map
    },
    dateFormatTokens: dto.date_format_tokens,
    description: dto.description,
    fontFamilyTokens: dto.font_family_tokens,
    id: asUiOpaqueId<'template'>(dto.id),
    name: dto.name,
    previewAssetUrl: null,
    settings: dto.settings.map((setting, index) => ({
      choices: setting.choices.map((choice, choiceIndex) => ({
        descriptionKey: choice.description_key,
        labelKey: choice.label_key,
        value: mapTemplateSettingValue(
          choice.value,
          `settings[${index}].choices[${choiceIndex}].value`
        )
      })),
      control: enumValue(setting.ui_control, settingControls, `settings[${index}].ui_control`),
      defaultValue: mapTemplateSettingValue(setting.default, `settings[${index}].default`),
      descriptionKey: setting.description_key,
      groupKey: setting.group_key,
      key: setting.key,
      labelKey: setting.label_key,
      maximum: setting.maximum,
      minimum: setting.minimum,
      valueType: enumValue(setting.value_type, settingValueTypes, `settings[${index}].value_type`)
    })),
    supportedLocales: dto.supported_locales,
    supportedPageSizes: dto.supported_page_sizes.map((value, index) =>
      enumValue(value, pageSizes, `supported_page_sizes[${index}]`)
    ),
    supportedSectionKinds: dto.supported_section_kinds.map((value, index) =>
      enumValue(value, sectionKinds, `supported_section_kinds[${index}]`)
    ),
    version: dto.template_version,
    zones: dto.zones.map((zone, index) => ({
      acceptedSectionKinds: zone.accepted_section_kinds.map((value, kindIndex) =>
        enumValue(value, sectionKinds, `zones[${index}].accepted_section_kinds[${kindIndex}]`)
      ),
      id: zone.zone_id,
      labelKey: zone.label_key,
      maxSections: zone.max_sections
    }))
  }
}

/** @brief 映射 ResumeDocument / Map a ResumeDocument. */
export function mapResumeDocumentDto(dto: ResumeDocumentDto): UiResumeDocument {
  return {
    id: asUiOpaqueId<'resume'>(dto.id),
    knowledgeSourceId:
      dto.knowledge_source_id === null
        ? null
        : asUiOpaqueId<'knowledge-source'>(dto.knowledge_source_id),
    locale: dto.locale,
    profile: {
      contacts: dto.profile.contacts
        .filter((contact) => contact.is_public)
        .map((contact, index) => ({
          kind: enumValue(contact.kind, contactKinds, `profile.contacts[${index}].kind`),
          label: contact.label ?? contact.kind,
          value: contact.value
        })),
      fullName: dto.profile.full_name,
      headline: dto.profile.headline,
      summary: dto.profile.summary?.plain_text ?? null
    },
    revision: dto.revision,
    sections: dto.sections.map((section, sectionIndex) => ({
      contentPreview: section.content?.plain_text ?? null,
      id: asUiOpaqueId<'resume-section'>(section.section_id),
      items: section.items.map((item, itemIndex) =>
        mapResumeItem(item, `sections[${sectionIndex}].items[${itemIndex}]`)
      ),
      kind: enumValue(section.kind, sectionKinds, `sections[${sectionIndex}].kind`),
      title: section.title,
      visible: section.visible
    })),
    styleIntent: {
      bulletStyleToken: dto.style_intent.bullet_style_token,
      dateFormatToken: dto.style_intent.date_format_token,
      density: dto.style_intent.density,
      page: {
        margins: {
          bottom: mapMeasurement(
            dto.style_intent.page.margins.bottom,
            'style_intent.page.margins.bottom'
          ),
          left: mapMeasurement(
            dto.style_intent.page.margins.left,
            'style_intent.page.margins.left'
          ),
          right: mapMeasurement(
            dto.style_intent.page.margins.right,
            'style_intent.page.margins.right'
          ),
          top: mapMeasurement(dto.style_intent.page.margins.top, 'style_intent.page.margins.top')
        },
        maxPages: dto.style_intent.page.max_pages,
        orientation: enumValue(
          dto.style_intent.page.orientation,
          pageOrientations,
          'style_intent.page.orientation'
        ),
        showPageNumbers: dto.style_intent.page.show_page_numbers,
        size: enumValue(dto.style_intent.page.size, pageSizes, 'style_intent.page.size')
      },
      palette: {
        background: mapColor(
          dto.style_intent.palette.background,
          'style_intent.palette.background'
        ),
        mutedText: mapColor(dto.style_intent.palette.muted_text, 'style_intent.palette.muted_text'),
        primary: mapColor(dto.style_intent.palette.primary, 'style_intent.palette.primary'),
        secondary: mapColor(dto.style_intent.palette.secondary, 'style_intent.palette.secondary'),
        text: mapColor(dto.style_intent.palette.text, 'style_intent.palette.text')
      },
      sectionLayout: dto.style_intent.section_layout.map((layout) => ({
        compactness: layout.compactness,
        headingStyleToken: layout.heading_style_token,
        keepTogether: layout.keep_together,
        pageBreakBefore: layout.page_break_before,
        sectionId: asUiOpaqueId<'resume-section'>(layout.section_id),
        zone: layout.zone
      })),
      styleContractVersion: '1.0',
      templateSettings: Object.fromEntries(
        Object.entries(dto.style_intent.template_settings).map(([key, value]) => [
          key,
          mapTemplateSettingValue(value, `style_intent.template_settings.${key}`)
        ])
      ),
      typography: {
        baseSizePt: dto.style_intent.typography.base_size_pt,
        fontFamilyToken: dto.style_intent.typography.font_family_token,
        headingScale: dto.style_intent.typography.heading_scale,
        letterSpacingEm: dto.style_intent.typography.letter_spacing_em,
        lineHeight: dto.style_intent.typography.line_height
      }
    },
    template: {
      templateId: asUiOpaqueId<'template'>(dto.template.template_id),
      templateVersion: dto.template.template_version
    },
    title: dto.title,
    updatedAt: dto.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id)
  }
}

/** @brief 从来源 config 选择可展示且不推测的出处 / Select a displayable origin without inventing one. */
function originLabel(dto: KnowledgeSourceDto): string {
  return (
    firstString(dto.config, [
      'resume_id',
      'filename',
      'url',
      'repository_url',
      'title',
      'root_id'
    ]) ?? dto.name
  )
}

/** @brief 映射 KnowledgeSource / Map a KnowledgeSource. */
export function mapKnowledgeSourceDto(dto: KnowledgeSourceDto): UiKnowledgeSource {
  return {
    chunkCount: dto.ingestion.chunk_count,
    documentCount: dto.ingestion.document_count,
    enabled: dto.enabled,
    id: asUiOpaqueId<'knowledge-source'>(dto.id),
    ingestionStatus: enumValue(dto.ingestion.status, ingestionStatuses, 'ingestion.status'),
    lastSuccessAt: dto.ingestion.last_success_at,
    name: dto.name,
    originLabel: originLabel(dto),
    sourceType: enumValue(dto.source_type, knowledgeSourceTypes, 'source_type'),
    updatedAt: dto.updated_at,
    visibility: {
      agentGrants: dto.visibility.agent_grants.map((grant, index) => ({
        agentScope: enumValue(
          grant.agent_scope,
          agentScopes,
          `visibility.agent_grants[${index}].agent_scope`
        ),
        allowedOperations: grant.allowed_operations.map((operation, operationIndex) =>
          enumValue(
            operation,
            knowledgeOperations,
            `visibility.agent_grants[${index}].allowed_operations[${operationIndex}]`
          )
        ),
        effect: enumValue(
          grant.effect,
          visibilityEffects,
          `visibility.agent_grants[${index}].effect`
        )
      })),
      allowExternalModelProcessing: dto.visibility.allow_external_model_processing,
      allowedModelRegions: dto.visibility.allowed_model_regions.map((region, index) =>
        enumValue(region, modelRegions, `visibility.allowed_model_regions[${index}]`)
      ),
      defaultEffect: enumValue(
        dto.visibility.default_effect,
        visibilityEffects,
        'visibility.default_effect'
      ),
      policyVersion: dto.visibility.policy_version,
      retentionDays: dto.visibility.retention_days,
      sensitivity: enumValue(dto.visibility.sensitivity, sensitivities, 'visibility.sensitivity'),
      sessionOverrideAllowed: dto.visibility.session_override_allowed
    },
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id)
  }
}

/** @brief 映射 Knowledge ingestion Job / Map a Knowledge ingestion Job. */
export function mapKnowledgeIngestionJobDto(
  dto: KnowledgeIngestionJobDto
): UiKnowledgeIngestionJob {
  return {
    errorCode: dto.error?.code ?? null,
    errorDetail: dto.error?.detail ?? null,
    id: asUiOpaqueId<'knowledge-ingestion-job'>(dto.id),
    progressPercent: dto.progress.percent,
    sourceId: asUiOpaqueId<'knowledge-source'>(dto.source_id),
    status: dto.status
  }
}

/** @brief 生成契约允许的安全引用位置文本 / Build a safe locator label from contract fields. */
function knowledgeLocatorLabel(dto: KnowledgeSearchResultDto): string {
  const { locator, title } = dto.citation
  if (locator.page !== null) return `${title} · page ${locator.page}`
  if (locator.symbol !== null) return `${title} · ${locator.symbol}`
  if (locator.line_start !== null) {
    const lineRange =
      locator.line_end === null || locator.line_end === locator.line_start
        ? `line ${locator.line_start}`
        : `lines ${locator.line_start}–${locator.line_end}`
    return `${locator.path ?? title} · ${lineRange}`
  }
  return locator.path ?? title
}

/** @brief 映射 Knowledge search result / Map a Knowledge search result. */
export function mapKnowledgeSearchResultDto(
  dto: KnowledgeSearchResultDto
): UiKnowledgeSearchResult {
  return {
    id: dto.result_id,
    locatorLabel: knowledgeLocatorLabel(dto),
    quote: dto.citation.quote,
    score: dto.score,
    sourceId: asUiOpaqueId<'knowledge-source'>(dto.citation.source_id),
    title: dto.citation.title
  }
}
