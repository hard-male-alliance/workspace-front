/** @file Resume transport DTO 到领域模型的映射 / Mapping Resume transport DTOs to domain models. */

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import type {
  UiColorValue,
  UiMeasurement,
  UiResumeContactKind,
  UiResumeDocument,
  UiResumeItem,
  UiResumePageOrientation,
  UiResumePageSize,
  UiResumeStyleIntent,
  UiTemplateManifest,
  UiTemplateSettingControl,
  UiTemplateSettingValueType
} from '../../domain/models'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  ColorValueDto,
  MeasurementDto,
  ResumeDateRangeDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumePartialDateDto,
  RichTextDto,
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

/**
 * @brief 将不完整日期映射为稳定 ISO 风格展示 / Map a PartialDate to a stable ISO-style display.
 * @param dto 已验证不完整日期 / Validated partial date.
 * @return 不臆测缺失精度的日期文本 / Date text without inventing missing precision.
 */
function formatPartialDate(dto: ResumePartialDateDto): string {
  /** @brief 四位年份 / Four-digit year. */
  const year = String(dto.year).padStart(4, '0')
  if (dto.month === null) return year
  /** @brief 两位月份 / Two-digit month. */
  const month = String(dto.month).padStart(2, '0')
  if (dto.day === null) return `${year}-${month}`
  return `${year}-${month}-${String(dto.day).padStart(2, '0')}`
}

/**
 * @brief 映射两个可选日期端点 / Map two optional date endpoints.
 * @param start 起始日期 / Start date.
 * @param end 结束日期 / End date.
 * @return 日期范围文本或 null / Date-range text or null.
 */
function formatDateEndpoints(
  start: ResumePartialDateDto | null,
  end: ResumePartialDateDto | null
): string | null {
  /** @brief 已格式化起点 / Formatted start. */
  const startText = start === null ? null : formatPartialDate(start)
  /** @brief 已格式化终点 / Formatted end. */
  const endText = end === null ? null : formatPartialDate(end)
  return startText === null ? endText : endText === null ? startText : `${startText} – ${endText}`
}

/**
 * @brief 映射冻结 DateRange / Map a frozen DateRange.
 * @param dto 已验证日期范围或 null / Validated date range or null.
 * @return 优先使用服务端展示覆写的日期文本 / Date text preferring the server display override.
 */
function formatDateRange(dto: ResumeDateRangeDto | null): string | null {
  if (dto === null) return null
  if (dto.display_override !== null) return dto.display_override
  /** @brief 由结构化端点生成的回退文本 / Fallback text generated from structured endpoints. */
  const endpoints = formatDateEndpoints(dto.start, dto.end)
  return dto.is_current && dto.end === null && endpoints !== null ? `${endpoints} –` : endpoints
}

/**
 * @brief 提取非空 RichText 纯文本 / Extract non-empty RichText plain-text projections.
 * @param values 已验证 RichText 投影 / Validated RichText projections.
 * @return 非空文本列表 / Non-empty text list.
 */
function richTextHighlights(values: readonly (RichTextDto | null)[]): readonly string[] {
  return values.flatMap((value): readonly string[] =>
    value?.plain_text === null || value?.plain_text === undefined || value.plain_text.length === 0
      ? []
      : [value.plain_text]
  )
}

/**
 * @brief 去重且保持顺序地合并标签 / Merge tags uniquely while preserving order.
 * @param values 标签来源 / Tag sources.
 * @return 去重后的标签 / Deduplicated tags.
 */
function uniqueStrings(...values: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(values.flat())]
}

/** @brief 映射多态简历条目为统一 UI 投影 / Map a polymorphic Resume item to the unified UI projection. */
function mapResumeItem(dto: ResumeItemDto): UiResumeItem {
  /** @brief 所有 variant 共享的页面字段 / Page fields shared by every variant. */
  const common = {
    id: dto.item_id,
    kind: dto.item_kind,
    tags: dto.tags,
    visible: dto.visible
  } satisfies Pick<UiResumeItem, 'id' | 'kind' | 'tags' | 'visible'>

  switch (dto.item_kind) {
    case 'experience':
      return {
        ...common,
        dateLabel: formatDateRange(dto.date_range),
        highlights: richTextHighlights([dto.description, ...dto.highlights]),
        locationLabel: dto.location,
        subtitle: dto.organization,
        title: dto.position
      }
    case 'education': {
      /** @brief 学历与专业构成的主标题 / Primary title composed from degree and field of study. */
      const qualification = [dto.degree, dto.field_of_study].filter(
        (value): value is string => value !== null && value.length > 0
      )
      return {
        ...common,
        dateLabel: formatDateRange(dto.date_range),
        highlights: richTextHighlights([dto.description, ...dto.highlights]),
        locationLabel: dto.location,
        subtitle: qualification.length === 0 ? null : dto.institution,
        title: qualification.length === 0 ? dto.institution : qualification.join(' · ')
      }
    }
    case 'project':
      return {
        ...common,
        dateLabel: formatDateRange(dto.date_range),
        highlights: richTextHighlights([dto.description, ...dto.highlights]),
        locationLabel: null,
        subtitle: dto.role,
        tags: uniqueStrings(dto.tags, dto.technologies),
        title: dto.name
      }
    case 'skill_group':
      return {
        ...common,
        dateLabel: null,
        highlights: dto.skills,
        locationLabel: null,
        subtitle: dto.proficiency,
        title: dto.name
      }
    case 'publication':
      return {
        ...common,
        dateLabel: dto.published_at === null ? null : formatPartialDate(dto.published_at),
        highlights: richTextHighlights([dto.description]),
        locationLabel: null,
        subtitle: dto.publisher ?? (dto.authors.length === 0 ? null : dto.authors.join(', ')),
        title: dto.title
      }
    case 'award':
      return {
        ...common,
        dateLabel: dto.awarded_at === null ? null : formatPartialDate(dto.awarded_at),
        highlights: richTextHighlights([dto.description]),
        locationLabel: null,
        subtitle: dto.issuer,
        title: dto.title
      }
    case 'certification':
      return {
        ...common,
        dateLabel: formatDateEndpoints(dto.issued_at, dto.expires_at),
        highlights: dto.credential_id === null ? [] : [dto.credential_id],
        locationLabel: null,
        subtitle: dto.issuer,
        title: dto.name
      }
    case 'language':
      return {
        ...common,
        dateLabel: null,
        highlights: dto.certificate === null ? [] : [dto.certificate],
        locationLabel: null,
        subtitle: dto.proficiency,
        title: dto.language
      }
    case 'volunteer':
      return {
        ...common,
        dateLabel: formatDateRange(dto.date_range),
        highlights: richTextHighlights([dto.description, ...dto.highlights]),
        locationLabel: null,
        subtitle: dto.role === null ? null : dto.organization,
        title: dto.role ?? dto.organization
      }
    case 'custom':
      return {
        ...common,
        dateLabel: formatDateRange(dto.date_range),
        highlights: richTextHighlights([dto.content]),
        locationLabel: null,
        subtitle: dto.subtitle,
        title: dto.title ?? dto.item_id
      }
  }
}

/**
 * @brief 映射正式模板清单 / Map a formal template manifest.
 * @note preview_asset_url 在产品 origin allowlist 冻结前不会提升为可渲染 UI URL，页面明确展示本地版式示意。 / preview_asset_url is not promoted to a renderable UI URL until a product origin allowlist is frozen; the page explicitly presents a local layout illustration.
 */
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
    sections: dto.sections.map((section) => ({
      contentPreview: section.content?.plain_text ?? null,
      id: asUiOpaqueId<'resume-section'>(section.section_id),
      items: section.items.map(mapResumeItem),
      kind: section.kind,
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
