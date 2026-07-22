/** @file Resume transport DTO 到领域模型的映射 / Mapping Resume transport DTOs to domain models. */

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
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
  UiResumeStyleIntent,
  UiTemplateManifest,
  UiTemplateSettingControl,
  UiTemplateSettingValueType
} from '../../domain/models'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  ColorValueDto,
  MeasurementDto,
  ResumeDocumentDto,
  ResumeItemDto,
  TemplateManifestDto
} from './transport-types'

/** @brief 契约允许的模板输出格式 / Template output formats allowed by the contract. */
const outputFormats = ['pdf', 'png', 'html_snapshot', 'docx'] as const

/**
 * @brief 将领域样式意图映射为正式 transport DTO / Map domain style intent to the formal transport DTO.
 * @param intent 完整领域样式意图 / Complete domain style intent.
 * @return 仅包含契约语义字段的 ResumeStyleIntent / ResumeStyleIntent containing only contract semantic fields.
 */
export function mapResumeStyleIntentToDto(
  intent: UiResumeStyleIntent
): ResumeDocumentDto['style_intent'] {
  return {
    bullet_style_token: intent.bulletStyleToken,
    date_format_token: intent.dateFormatToken,
    density: intent.density,
    extensions: intent.extensions,
    page: {
      custom_height: intent.page.customHeight,
      custom_width: intent.page.customWidth,
      margins: intent.page.margins,
      max_pages: intent.page.maxPages,
      orientation: intent.page.orientation,
      show_page_numbers: intent.page.showPageNumbers,
      size: intent.page.size
    },
    palette: {
      background: intent.palette.background,
      muted_text: intent.palette.mutedText,
      primary: intent.palette.primary,
      secondary: intent.palette.secondary,
      text: intent.palette.text
    },
    section_layout: intent.sectionLayout.map((layout) => ({
      compactness: layout.compactness,
      heading_style_token: layout.headingStyleToken,
      keep_together: layout.keepTogether,
      page_break_before: layout.pageBreakBefore,
      section_id: layout.sectionId,
      zone: layout.zone
    })),
    style_contract_version: intent.styleContractVersion,
    template_settings: intent.templateSettings,
    typography: {
      base_size_pt: intent.typography.baseSizePt,
      font_family_token: intent.typography.fontFamilyToken,
      heading_scale: intent.typography.headingScale,
      letter_spacing_em: intent.typography.letterSpacingEm,
      line_height: intent.typography.lineHeight
    }
  }
}

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

/** @brief 映射测量值 / Map a measurement. */
function mapMeasurement(dto: MeasurementDto, path: string): UiMeasurement {
  if (
    dto.unit !== 'pt' &&
    dto.unit !== 'mm' &&
    dto.unit !== 'cm' &&
    dto.unit !== 'in' &&
    dto.unit !== 'px' &&
    dto.unit !== 'em' &&
    dto.unit !== 'percent'
  ) {
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
    settings: dto.settings.map((setting, index) => ({
      choices: setting.choices.map((choice) => ({
        descriptionKey: choice.description_key,
        labelKey: choice.label_key,
        value: choice.value
      })),
      control: enumValue(setting.ui_control, settingControls, `settings[${index}].ui_control`),
      defaultValue: setting.default,
      descriptionKey: setting.description_key,
      groupKey: setting.group_key,
      key: setting.key,
      labelKey: setting.label_key,
      maximum: setting.maximum,
      minimum: setting.minimum,
      valueType: enumValue(setting.value_type, settingValueTypes, `settings[${index}].value_type`),
      visibleWhen:
        setting.visible_when === null
          ? null
          : {
              equals: setting.visible_when.equals,
              key: setting.visible_when.key
            }
    })),
    supportedLocales: dto.supported_locales,
    supportedOutputFormats: dto.supported_output_formats.map((value, index) =>
      enumValue(value, outputFormats, `supported_output_formats[${index}]`)
    ),
    supportedPageSizes: dto.supported_page_sizes.map((value, index) =>
      enumValue(value, pageSizes, `supported_page_sizes[${index}]`)
    ),
    supportedSectionKinds: dto.supported_section_kinds,
    version: dto.template_version,
    zones: dto.zones.map((zone) => ({
      acceptedSectionKinds: zone.accepted_section_kinds,
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
      extensions: dto.style_intent.extensions,
      page: {
        customHeight:
          dto.style_intent.page.custom_height === null
            ? null
            : mapMeasurement(
                dto.style_intent.page.custom_height,
                'style_intent.page.custom_height'
              ),
        customWidth:
          dto.style_intent.page.custom_width === null
            ? null
            : mapMeasurement(dto.style_intent.page.custom_width, 'style_intent.page.custom_width'),
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
      templateSettings: dto.style_intent.template_settings,
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
