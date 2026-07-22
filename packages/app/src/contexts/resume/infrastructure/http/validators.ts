/** @file Resume HTTP JSON 的运行时校验 / Runtime validation for Resume HTTP JSON. */

import {
  array,
  boolean,
  nullableNumber,
  nullableRecord,
  nullableString,
  number,
  parseCursorPage,
  record,
  string,
  stringArray,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type {
  ColorValueDto,
  MeasurementDto,
  ResumeContactDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumeOperationBatchResultDto,
  RenderArtifactDto,
  ResumeRenderJobDto,
  ResumeSectionDto,
  RichTextDto,
  TemplateChoiceDto,
  TemplateManifestDto,
  TemplateSettingDefinitionDto,
  TemplateZoneDto
} from './transport-types'

/** @brief 校验模板区域 / Validate a template zone. */
function parseTemplateZone(value: unknown, path: string): TemplateZoneDto {
  const input = record(value, path)
  return {
    accepted_section_kinds: stringArray(
      input.accepted_section_kinds,
      `${path}.accepted_section_kinds`
    ),
    label_key: string(input.label_key, `${path}.label_key`),
    max_sections: nullableNumber(input.max_sections, `${path}.max_sections`),
    zone_id: string(input.zone_id, `${path}.zone_id`)
  }
}

/** @brief 校验模板设置选项 / Validate a template-setting choice. */
function parseTemplateChoice(value: unknown, path: string): TemplateChoiceDto {
  const input = record(value, path)
  return {
    description_key: nullableString(input.description_key, `${path}.description_key`),
    label_key: string(input.label_key, `${path}.label_key`),
    value: input.value
  }
}

/** @brief 校验模板设置定义 / Validate a template-setting definition. */
function parseTemplateSetting(value: unknown, path: string): TemplateSettingDefinitionDto {
  const input = record(value, path)
  return {
    choices: array(input.choices ?? [], `${path}.choices`).map((item, index) =>
      parseTemplateChoice(item, `${path}.choices[${index}]`)
    ),
    default: input.default,
    description_key: nullableString(input.description_key, `${path}.description_key`),
    group_key: nullableString(input.group_key, `${path}.group_key`),
    key: string(input.key, `${path}.key`),
    label_key: string(input.label_key, `${path}.label_key`),
    maximum: nullableNumber(input.maximum, `${path}.maximum`),
    minimum: nullableNumber(input.minimum, `${path}.minimum`),
    ui_control: string(input.ui_control, `${path}.ui_control`),
    value_type: string(input.value_type, `${path}.value_type`)
  }
}

/** @brief 校验模板清单 / Validate a template manifest. */
function parseTemplateManifest(value: unknown, path: string): TemplateManifestDto {
  const input = record(value, path)
  const capabilities = record(input.capabilities, `${path}.capabilities`)
  return {
    bullet_style_tokens: stringArray(input.bullet_style_tokens, `${path}.bullet_style_tokens`),
    capabilities: {
      max_columns: number(capabilities.max_columns, `${path}.capabilities.max_columns`),
      supports_custom_sections: boolean(
        capabilities.supports_custom_sections,
        `${path}.capabilities.supports_custom_sections`
      ),
      supports_photo: boolean(capabilities.supports_photo, `${path}.capabilities.supports_photo`),
      supports_sidebar: boolean(
        capabilities.supports_sidebar,
        `${path}.capabilities.supports_sidebar`
      ),
      supports_source_map: boolean(
        capabilities.supports_source_map,
        `${path}.capabilities.supports_source_map`
      )
    },
    created_at: string(input.created_at, `${path}.created_at`),
    date_format_tokens: stringArray(input.date_format_tokens, `${path}.date_format_tokens`),
    description: nullableString(input.description, `${path}.description`),
    font_family_tokens: stringArray(input.font_family_tokens, `${path}.font_family_tokens`),
    id: string(input.id, `${path}.id`),
    name: string(input.name, `${path}.name`),
    preview_asset_url: nullableString(input.preview_asset_url, `${path}.preview_asset_url`),
    revision: number(input.revision, `${path}.revision`),
    settings: array(input.settings, `${path}.settings`).map((item, index) =>
      parseTemplateSetting(item, `${path}.settings[${index}]`)
    ),
    supported_locales: stringArray(input.supported_locales, `${path}.supported_locales`),
    supported_page_sizes: stringArray(input.supported_page_sizes, `${path}.supported_page_sizes`),
    supported_section_kinds: stringArray(
      input.supported_section_kinds,
      `${path}.supported_section_kinds`
    ),
    template_version: string(input.template_version, `${path}.template_version`),
    updated_at: string(input.updated_at, `${path}.updated_at`),
    zones: array(input.zones, `${path}.zones`).map((item, index) =>
      parseTemplateZone(item, `${path}.zones[${index}]`)
    )
  }
}

/** @brief 校验模板目录响应 / Validate a template-catalog response. */
export function parseTemplateManifestListDto(value: unknown): PaginatedDto<TemplateManifestDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map((item, index) =>
      parseTemplateManifest(item, `items[${index}]`)
    ),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验测量值 / Validate a measurement. */
function parseMeasurement(value: unknown, path: string): MeasurementDto {
  const input = record(value, path)
  return { unit: string(input.unit, `${path}.unit`), value: number(input.value, `${path}.value`) }
}

/** @brief 校验颜色值 / Validate a color value. */
function parseColor(value: unknown, path: string): ColorValueDto {
  const input = record(value, path)
  return {
    space: string(input.space, `${path}.space`),
    value: string(input.value, `${path}.value`)
  }
}

/** @brief 校验富文本的页面所需投影 / Validate the page-required RichText projection. */
function parseRichText(value: unknown, path: string): RichTextDto {
  const input = record(value, path)
  array(input.blocks, `${path}.blocks`)
  return { plain_text: nullableString(input.plain_text, `${path}.plain_text`) }
}

/** @brief 校验联系信息 / Validate a contact method. */
function parseContact(value: unknown, path: string): ResumeContactDto {
  const input = record(value, path)
  string(input.contact_id, `${path}.contact_id`)
  return {
    is_public: boolean(input.is_public, `${path}.is_public`),
    kind: string(input.kind, `${path}.kind`),
    label: nullableString(input.label, `${path}.label`),
    value: string(input.value, `${path}.value`)
  }
}

/** @brief 校验多态简历条目的公共边界 / Validate the common boundary of a polymorphic Resume item. */
function parseResumeItem(value: unknown, path: string): ResumeItemDto {
  const input = record(value, path)
  return {
    item_id: string(input.item_id, `${path}.item_id`),
    item_kind: string(input.item_kind, `${path}.item_kind`),
    raw: input,
    tags: stringArray(input.tags ?? [], `${path}.tags`),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/** @brief 校验简历区段 / Validate a Resume section. */
function parseResumeSection(value: unknown, path: string): ResumeSectionDto {
  const input = record(value, path)
  const content = nullableRecord(input.content, `${path}.content`)
  return {
    content: content === null ? null : parseRichText(content, `${path}.content`),
    items: array(input.items, `${path}.items`).map((item, index) =>
      parseResumeItem(item, `${path}.items[${index}]`)
    ),
    kind: string(input.kind, `${path}.kind`),
    section_id: string(input.section_id, `${path}.section_id`),
    title: string(input.title, `${path}.title`),
    visible: boolean(input.visible, `${path}.visible`)
  }
}

/** @brief 校验 ResumeDocument / Validate a ResumeDocument. */
export function parseResumeDocumentDto(value: unknown): ResumeDocumentDto {
  const input = record(value, 'resume')
  const template = record(input.template, 'resume.template')
  const profile = record(input.profile, 'resume.profile')
  const style = record(input.style_intent, 'resume.style_intent')
  const page = record(style.page, 'resume.style_intent.page')
  const margins = record(page.margins, 'resume.style_intent.page.margins')
  const typography = record(style.typography, 'resume.style_intent.typography')
  const palette = record(style.palette, 'resume.style_intent.palette')
  const schemaVersion = string(input.schema_version, 'resume.schema_version')
  const styleVersion = string(
    style.style_contract_version,
    'resume.style_intent.style_contract_version'
  )
  if (schemaVersion !== '1.0' || styleVersion !== '1.0') {
    throw new HttpContractError('Backend ResumeDocument uses an unsupported schema version.', 200)
  }

  return {
    created_at: string(input.created_at, 'resume.created_at'),
    id: string(input.id, 'resume.id'),
    knowledge_source_id: nullableString(input.knowledge_source_id, 'resume.knowledge_source_id'),
    locale: string(input.locale, 'resume.locale'),
    profile: {
      contacts: array(profile.contacts, 'resume.profile.contacts').map((item, index) =>
        parseContact(item, `resume.profile.contacts[${index}]`)
      ),
      full_name: string(profile.full_name, 'resume.profile.full_name'),
      headline: nullableString(profile.headline, 'resume.profile.headline'),
      summary:
        nullableRecord(profile.summary, 'resume.profile.summary') === null
          ? null
          : parseRichText(profile.summary, 'resume.profile.summary')
    },
    revision: number(input.revision, 'resume.revision'),
    schema_version: schemaVersion,
    sections: array(input.sections, 'resume.sections').map((item, index) =>
      parseResumeSection(item, `resume.sections[${index}]`)
    ),
    style_intent: {
      bullet_style_token: string(
        style.bullet_style_token,
        'resume.style_intent.bullet_style_token'
      ),
      date_format_token: string(style.date_format_token, 'resume.style_intent.date_format_token'),
      density: number(style.density, 'resume.style_intent.density'),
      page: {
        margins: {
          bottom: parseMeasurement(margins.bottom, 'resume.style_intent.page.margins.bottom'),
          left: parseMeasurement(margins.left, 'resume.style_intent.page.margins.left'),
          right: parseMeasurement(margins.right, 'resume.style_intent.page.margins.right'),
          top: parseMeasurement(margins.top, 'resume.style_intent.page.margins.top')
        },
        max_pages: nullableNumber(page.max_pages, 'resume.style_intent.page.max_pages'),
        orientation: string(page.orientation, 'resume.style_intent.page.orientation'),
        show_page_numbers: boolean(
          page.show_page_numbers,
          'resume.style_intent.page.show_page_numbers'
        ),
        size: string(page.size, 'resume.style_intent.page.size')
      },
      palette: {
        background: parseColor(palette.background, 'resume.style_intent.palette.background'),
        muted_text: parseColor(palette.muted_text, 'resume.style_intent.palette.muted_text'),
        primary: parseColor(palette.primary, 'resume.style_intent.palette.primary'),
        secondary: parseColor(palette.secondary, 'resume.style_intent.palette.secondary'),
        text: parseColor(palette.text, 'resume.style_intent.palette.text')
      },
      section_layout: array(style.section_layout, 'resume.style_intent.section_layout').map(
        (item, index) => {
          const layout = record(item, `resume.style_intent.section_layout[${index}]`)
          return {
            compactness: number(
              layout.compactness,
              `resume.style_intent.section_layout[${index}].compactness`
            ),
            heading_style_token: nullableString(
              layout.heading_style_token,
              `resume.style_intent.section_layout[${index}].heading_style_token`
            ),
            keep_together: boolean(
              layout.keep_together,
              `resume.style_intent.section_layout[${index}].keep_together`
            ),
            page_break_before: boolean(
              layout.page_break_before,
              `resume.style_intent.section_layout[${index}].page_break_before`
            ),
            section_id: string(
              layout.section_id,
              `resume.style_intent.section_layout[${index}].section_id`
            ),
            zone: string(layout.zone, `resume.style_intent.section_layout[${index}].zone`)
          }
        }
      ),
      style_contract_version: styleVersion,
      template_settings: record(style.template_settings, 'resume.style_intent.template_settings'),
      typography: {
        base_size_pt: number(
          typography.base_size_pt,
          'resume.style_intent.typography.base_size_pt'
        ),
        font_family_token: string(
          typography.font_family_token,
          'resume.style_intent.typography.font_family_token'
        ),
        heading_scale: number(
          typography.heading_scale,
          'resume.style_intent.typography.heading_scale'
        ),
        letter_spacing_em: number(
          typography.letter_spacing_em,
          'resume.style_intent.typography.letter_spacing_em'
        ),
        line_height: number(typography.line_height, 'resume.style_intent.typography.line_height')
      }
    },
    template: {
      template_id: string(template.template_id, 'resume.template.template_id'),
      template_version: string(template.template_version, 'resume.template.template_version')
    },
    title: string(input.title, 'resume.title'),
    updated_at: string(input.updated_at, 'resume.updated_at'),
    workspace_id: string(input.workspace_id, 'resume.workspace_id')
  }
}

/** @brief 校验 ResumeDocument 列表 / Validate a ResumeDocument list. */
export function parseResumeListDto(value: unknown): PaginatedDto<ResumeDocumentDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map((item) => parseResumeDocumentDto(item)),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验 Resume operation 批次结果 / Validate a Resume operation batch result. */
export function parseResumeOperationBatchResultDto(value: unknown): ResumeOperationBatchResultDto {
  const input = record(value, 'operationResult')
  const normalized = nullableRecord(
    input.normalized_document,
    'operationResult.normalized_document'
  )
  const results = array(input.results, 'operationResult.results').map((item, index) => {
    const result = record(item, `operationResult.results[${index}]`)
    const status = string(result.status, `operationResult.results[${index}].status`)
    if (!['applied', 'deduplicated', 'rebased', 'rejected'].includes(status)) {
      throw new HttpContractError('Backend returned an unsupported operation status.', 200)
    }
    return {
      operation_id: string(result.operation_id, `operationResult.results[${index}].operation_id`),
      status: status as ResumeOperationBatchResultDto['results'][number]['status']
    }
  })
  if (results.length === 0) {
    throw new HttpContractError('Backend operation result must contain at least one result.', 200)
  }
  return {
    new_revision: number(input.new_revision, 'operationResult.new_revision'),
    normalized_document: normalized === null ? null : parseResumeDocumentDto(normalized),
    previous_revision: number(input.previous_revision, 'operationResult.previous_revision'),
    results,
    resume_id: string(input.resume_id, 'operationResult.resume_id')
  }
}

/** @brief 校验 Render artifact / Validate a Render artifact. */
export function parseRenderArtifactDto(value: unknown): RenderArtifactDto {
  const input = record(value, 'artifact')
  return {
    content_type: string(input.content_type, 'artifact.content_type'),
    created_at: string(input.created_at, 'artifact.created_at'),
    download_url: string(input.download_url, 'artifact.download_url'),
    expires_at: nullableString(input.expires_at, 'artifact.expires_at'),
    format: string(input.format, 'artifact.format'),
    id: string(input.id, 'artifact.id'),
    page_count: nullableNumber(input.page_count, 'artifact.page_count'),
    resume_id: string(input.resume_id, 'artifact.resume_id'),
    resume_revision: number(input.resume_revision, 'artifact.resume_revision'),
    revision: number(input.revision, 'artifact.revision'),
    sha256: string(input.sha256, 'artifact.sha256'),
    size_bytes: number(input.size_bytes, 'artifact.size_bytes'),
    source_map_artifact_id: nullableString(
      input.source_map_artifact_id,
      'artifact.source_map_artifact_id'
    ),
    updated_at: string(input.updated_at, 'artifact.updated_at')
  }
}

/** @brief 校验 Resume Render Job / Validate a Resume Render Job. */
export function parseResumeRenderJobDto(value: unknown): ResumeRenderJobDto {
  const input = record(value, 'renderJob')
  const progress = record(input.progress, 'renderJob.progress')
  const status = string(input.status, 'renderJob.status')
  const statuses: readonly ResumeRenderJobDto['status'][] = [
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'expired'
  ]
  if (!statuses.includes(status as ResumeRenderJobDto['status'])) {
    throw new HttpContractError('Backend returned an unsupported Render Job status.', 200)
  }
  array(input.diagnostics, 'renderJob.diagnostics')
  nullableRecord(input.error, 'renderJob.error')
  return {
    artifacts: array(input.artifacts, 'renderJob.artifacts').map(parseRenderArtifactDto),
    diagnostic: null,
    id: string(input.id, 'renderJob.id'),
    progress: {
      completed_units: number(progress.completed_units, 'renderJob.progress.completed_units'),
      percent: nullableNumber(progress.percent, 'renderJob.progress.percent'),
      phase: string(progress.phase, 'renderJob.progress.phase'),
      total_units: nullableNumber(progress.total_units, 'renderJob.progress.total_units')
    },
    resume_id: string(input.resume_id, 'renderJob.resume_id'),
    resume_revision: number(input.resume_revision, 'renderJob.resume_revision'),
    status: status as ResumeRenderJobDto['status']
  }
}
