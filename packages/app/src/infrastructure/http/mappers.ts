/** @file HTTP DTO 到 UI 投影的映射 / HTTP DTO-to-UI projection mapping. */

import type {
  UiAgentScope,
  UiKnowledgeIngestionStatus,
  UiKnowledgeSource,
  UiKnowledgeSourceType,
  UiResumeDocument,
  UiResumeItem,
  UiResumeSection,
  UiTemplateManifest,
  UiTemplateSettingValue
} from '../../domain'
import { asUiOpaqueId } from '../../domain'
import type { KnowledgeSourceDto, ResumeDocumentDto, TemplateManifestDto } from './dto'

/** @brief 将未知值视为对象 / Treat an unknown value as an object. */
const objectValue = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {}

/** @brief 将未知值视为对象数组 / Treat an unknown value as an object array. */
const objectArray = (value: unknown): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value) ? value.map(objectValue) : []

/** @brief 将未知值视为字符串数组 / Treat an unknown value as a string array. */
const stringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** @brief 读取可空字符串 / Read a nullable string. */
const nullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** @brief 读取字符串并提供默认值 / Read a string with a fallback. */
const stringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

/** @brief 从 RichText DTO 提取纯文本 / Extract plain text from a RichText DTO. */
function richText(value: unknown): string | null {
  const rich = objectValue(value)
  if (typeof rich.plain_text === 'string') {
    return rich.plain_text
  }
  const blocks = objectArray(rich.blocks)
  const text = blocks
    .flatMap((block) => {
      const paragraph = objectArray(block.spans).map((span) => stringValue(span.text))
      const list = objectArray(block.items).flatMap((item) =>
        objectArray(item.spans).map((span) => stringValue(span.text))
      )
      return [...paragraph, ...list]
    })
    .filter(Boolean)
    .join('\n')
    .trim()
  return text || null
}

/** @brief 映射简历条目 / Map a Resume item. */
function mapResumeItem(dto: Readonly<Record<string, unknown>>): UiResumeItem {
  const kind = typeof dto.item_kind === 'string' ? dto.item_kind : 'custom'
  const title =
    nullableString(dto.title) ??
    nullableString(dto.position) ??
    nullableString(dto.name) ??
    nullableString(dto.organization) ??
    nullableString(dto.institution) ??
    nullableString(dto.project_name) ??
    ''
  return {
    id: stringValue(dto.item_id),
    kind: kind as UiResumeItem['kind'],
    title,
    subtitle: nullableString(dto.subtitle ?? dto.company ?? dto.issuer),
    dateLabel: null,
    locationLabel: nullableString(dto.location),
    highlights: objectArray(dto.highlights)
      .map(richText)
      .filter((item): item is string => item !== null),
    tags: stringArray(dto.tags),
    visible: dto.visible !== false
  }
}

/** @brief 映射简历区段 / Map a Resume section. */
function mapResumeSection(dto: Readonly<Record<string, unknown>>): UiResumeSection {
  return {
    id: asUiOpaqueId<'resume-section'>(stringValue(dto.section_id)),
    kind: stringValue(dto.kind, 'custom') as UiResumeSection['kind'],
    title: stringValue(dto.title),
    visible: dto.visible !== false,
    contentPreview: richText(dto.content),
    items: objectArray(dto.items).map(mapResumeItem)
  }
}

/**
 * @brief 映射后端简历文档 / Map a backend Resume document.
 * @param dto 后端 DTO / Backend DTO.
 * @return UI 简历投影 / UI Resume projection.
 */
export function mapResumeDocument(dto: ResumeDocumentDto): UiResumeDocument {
  const profile = objectValue(dto.profile)
  const style = objectValue(dto.style_intent)
  const page = objectValue(style.page)
  const margins = objectValue(page.margins)
  const typography = objectValue(style.typography)
  const palette = objectValue(style.palette)
  const measurement = (value: unknown) => {
    const item = objectValue(value)
    return { value: Number(item.value ?? 0), unit: stringValue(item.unit, 'mm') as 'mm' }
  }
  const color = (value: unknown) => {
    const item = objectValue(value)
    return {
      space: stringValue(item.space, 'srgb_hex') as 'srgb_hex',
      value: stringValue(item.value, '#000000')
    }
  }
  return {
    id: asUiOpaqueId<'resume'>(dto.id),
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id),
    revision: dto.revision,
    title: dto.title,
    locale: dto.locale,
    template: {
      templateId: asUiOpaqueId<'template'>(dto.template.template_id),
      templateVersion: dto.template.template_version
    },
    profile: {
      fullName: stringValue(profile.full_name),
      headline: nullableString(profile.headline),
      summary: richText(profile.summary),
      contacts: objectArray(profile.contacts).map((contact) => ({
        kind: stringValue(contact.kind, 'other') as 'other',
        label: stringValue(contact.label),
        value: stringValue(contact.value)
      }))
    },
    sections: dto.sections.map(mapResumeSection),
    styleIntent: {
      styleContractVersion: '1.0',
      page: {
        size: stringValue(page.size, 'A4') as 'A4',
        orientation: stringValue(page.orientation, 'portrait') as 'portrait',
        margins: {
          top: measurement(margins.top),
          right: measurement(margins.right),
          bottom: measurement(margins.bottom),
          left: measurement(margins.left)
        },
        maxPages: typeof page.max_pages === 'number' ? page.max_pages : null,
        showPageNumbers: page.show_page_numbers === true
      },
      typography: {
        fontFamilyToken: stringValue(typography.font_family_token),
        baseSizePt: Number(typography.base_size_pt ?? 0),
        lineHeight: Number(typography.line_height ?? 0),
        headingScale: Number(typography.heading_scale ?? 0),
        letterSpacingEm: Number(typography.letter_spacing_em ?? 0)
      },
      palette: {
        primary: color(palette.primary),
        secondary: color(palette.secondary),
        text: color(palette.text),
        mutedText: color(palette.muted_text),
        background: color(palette.background)
      },
      density: Number(style.density ?? 0),
      dateFormatToken: stringValue(style.date_format_token),
      bulletStyleToken: stringValue(style.bullet_style_token),
      sectionLayout: objectArray(style.section_layout).map((layout) => ({
        sectionId: asUiOpaqueId<'resume-section'>(stringValue(layout.section_id)),
        zone: stringValue(layout.zone),
        keepTogether: layout.keep_together === true,
        pageBreakBefore: layout.page_break_before === true,
        compactness: Number(layout.compactness ?? 0),
        headingStyleToken: nullableString(layout.heading_style_token)
      })),
      templateSettings: objectValue(style.template_settings) as Readonly<
        Record<string, UiTemplateSettingValue>
      >
    },
    knowledgeSourceId:
      dto.knowledge_source_id == null
        ? null
        : asUiOpaqueId<'knowledge-source'>(dto.knowledge_source_id),
    updatedAt: dto.updated_at
  }
}

/** @brief 映射模板 Manifest / Map a template Manifest. */
export function mapTemplateManifest(dto: TemplateManifestDto): UiTemplateManifest {
  const capabilities = objectValue(dto.capabilities)
  return {
    id: asUiOpaqueId<'template'>(dto.id),
    version: dto.template_version,
    name: dto.name,
    description: nullableString(dto.description),
    previewAssetUrl: nullableString(dto.preview_asset_url),
    supportedLocales: stringArray(dto.supported_locales),
    supportedPageSizes: stringArray(
      dto.supported_page_sizes
    ) as UiTemplateManifest['supportedPageSizes'],
    supportedSectionKinds: stringArray(
      dto.supported_section_kinds
    ) as UiTemplateManifest['supportedSectionKinds'],
    zones: objectArray(dto.zones).map((zone) => ({
      id: stringValue(zone.zone_id),
      labelKey: stringValue(zone.label_key),
      acceptedSectionKinds: stringArray(
        zone.accepted_section_kinds
      ) as UiTemplateManifest['supportedSectionKinds'],
      maxSections: typeof zone.max_sections === 'number' ? zone.max_sections : null
    })),
    fontFamilyTokens: stringArray(dto.font_family_tokens),
    dateFormatTokens: stringArray(dto.date_format_tokens),
    bulletStyleTokens: stringArray(dto.bullet_style_tokens),
    settings: [],
    capabilities: {
      supportsPhoto: capabilities.supports_photo === true,
      supportsSidebar: capabilities.supports_sidebar === true,
      supportsCustomSections: capabilities.supports_custom_sections === true,
      supportsSourceMap: capabilities.supports_source_map === true,
      maxColumns: Number(capabilities.max_columns ?? 1)
    }
  }
}

/** @brief 映射知识来源 / Map a knowledge source. */
export function mapKnowledgeSource(dto: KnowledgeSourceDto): UiKnowledgeSource {
  const config = objectValue(dto.config)
  const ingestion = objectValue(dto.ingestion)
  const visibility = objectValue(dto.visibility)
  const sourceType = dto.source_type as UiKnowledgeSourceType
  const origin =
    nullableString(config.location) ??
    nullableString(config.url) ??
    nullableString(config.repository_url) ??
    nullableString(config.filename) ??
    dto.name
  return {
    id: asUiOpaqueId<'knowledge-source'>(dto.id),
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id),
    name: dto.name,
    sourceType,
    originLabel: origin,
    ingestionStatus: stringValue(ingestion.status, 'not_started') as UiKnowledgeIngestionStatus,
    documentCount: Number(ingestion.document_count ?? 0),
    chunkCount: Number(ingestion.chunk_count ?? 0),
    enabled: dto.enabled !== false,
    visibility: {
      policyVersion: Number(visibility.policy_version ?? 1),
      defaultEffect: visibility.default_effect === 'allow' ? 'allow' : 'deny',
      sensitivity: stringValue(visibility.sensitivity, 'confidential') as 'confidential',
      agentGrants: objectArray(visibility.agent_grants).map((grant) => ({
        agentScope: stringValue(grant.agent_scope) as UiAgentScope,
        effect: grant.effect === 'allow' ? 'allow' : 'deny',
        allowedOperations: stringArray(grant.allowed_operations) as never
      })),
      sessionOverrideAllowed: visibility.session_override_allowed === true,
      allowExternalModelProcessing: visibility.allow_external_model_processing === true,
      allowedModelRegions: stringArray(visibility.allowed_model_regions) as never,
      retentionDays:
        typeof visibility.retention_days === 'number' ? visibility.retention_days : null
    },
    lastSuccessAt: nullableString(ingestion.last_success_at),
    updatedAt: dto.updated_at
  }
}
