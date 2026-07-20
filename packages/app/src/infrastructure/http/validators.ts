/** @file 未知 HTTP JSON 的运行时校验 / Runtime validation for unknown HTTP JSON. */

import { HttpContractError } from './http-client'
import type {
  CursorPageDto,
  ColorValueDto,
  KnowledgeFileUploadResponseDto,
  KnowledgeIngestionJobDto,
  KnowledgeSearchResponseDto,
  KnowledgeSearchResultDto,
  KnowledgeSourceDto,
  MeasurementDto,
  PaginatedDto,
  ResumeContactDto,
  ResumeDocumentDto,
  ResumeItemDto,
  ResumeOperationBatchResultDto,
  ResumeProposalDto,
  RenderArtifactDto,
  ResumeRenderJobDto,
  ResumeSectionDto,
  RichTextDto,
  TemplateChoiceDto,
  TemplateManifestDto,
  TemplateSettingDefinitionDto,
  TemplateZoneDto
} from './transport-types'

/** @brief 断言对象 / Assert an object. */
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpContractError(`Backend field ${path} must be an object.`, 200)
  }
  return value as Record<string, unknown>
}

/** @brief 断言对象不含契约外字段 / Assert an object has no fields outside the contract. */
function exactRecord(
  value: unknown,
  path: string,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  const input = record(value, path)
  const unexpectedKey = Object.keys(input).find((key) => !allowedKeys.includes(key))
  if (unexpectedKey !== undefined) {
    throw new HttpContractError(`Backend field ${path}.${unexpectedKey} is not allowed.`, 200)
  }
  return input
}

/** @brief 断言字符串 / Assert a string. */
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new HttpContractError(`Backend field ${path} must be a string.`, 200)
  }
  return value
}

/** @brief 断言布尔值 / Assert a boolean. */
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpContractError(`Backend field ${path} must be a boolean.`, 200)
  }
  return value
}

/** @brief 断言有限数字 / Assert a finite number. */
function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpContractError(`Backend field ${path} must be a number.`, 200)
  }
  return value
}

/** @brief 断言数组 / Assert an array. */
function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpContractError(`Backend field ${path} must be an array.`, 200)
  }
  return value
}

/** @brief 读取 nullable string / Read a nullable string. */
function nullableString(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : string(value, path)
}

/** @brief 读取 nullable number / Read a nullable number. */
function nullableNumber(value: unknown, path: string): number | null {
  return value === null || value === undefined ? null : number(value, path)
}

/** @brief 读取 nullable object / Read a nullable object. */
function nullableRecord(value: unknown, path: string): Record<string, unknown> | null {
  return value === null || value === undefined ? null : record(value, path)
}

/** @brief 读取字符串数组 / Read a string array. */
function stringArray(value: unknown, path: string): readonly string[] {
  return array(value, path).map((item, index): string => string(item, `${path}[${index}]`))
}

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

/** @brief 校验分页元数据 / Validate cursor page metadata. */
function parseCursorPage(value: unknown): CursorPageDto {
  const input = record(value, 'page')
  const hasMore = boolean(input.has_more, 'page.has_more')
  const nextCursor = nullableString(input.next_cursor, 'page.next_cursor')
  if (hasMore && nextCursor === null) {
    throw new HttpContractError(
      'Backend page.next_cursor is required when page.has_more is true.',
      200
    )
  }
  return {
    has_more: hasMore,
    next_cursor: nextCursor,
    total_estimate: nullableNumber(input.total_estimate, 'page.total_estimate')
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

/** @brief 校验 Resume Proposal / Validate a Resume Proposal. */
export function parseResumeProposalDto(value: unknown): ResumeProposalDto {
  const input = record(value, 'proposal')
  const summary = nullableRecord(input.summary, 'proposal.summary')
  const status = string(input.status, 'proposal.status')
  const statuses: readonly ResumeProposalDto['status'][] = [
    'pending',
    'accepted',
    'partially_accepted',
    'rejected',
    'expired',
    'conflicted'
  ]
  if (!statuses.includes(status as ResumeProposalDto['status'])) {
    throw new HttpContractError('Backend returned an unsupported Proposal status.', 200)
  }
  const operations = array(input.operations, 'proposal.operations').map((item, index) => {
    const operation = record(item, `proposal.operations[${index}]`)
    return {
      op: string(operation.op, `proposal.operations[${index}].op`),
      operation_id: string(operation.operation_id, `proposal.operations[${index}].operation_id`)
    }
  })
  if (operations.length === 0) {
    throw new HttpContractError('Backend Proposal must contain at least one operation.', 200)
  }
  return {
    base_revision: number(input.base_revision, 'proposal.base_revision'),
    created_at: string(input.created_at, 'proposal.created_at'),
    expires_at: nullableString(input.expires_at, 'proposal.expires_at'),
    id: string(input.id, 'proposal.id'),
    operations,
    resume_id: string(input.resume_id, 'proposal.resume_id'),
    revision: number(input.revision, 'proposal.revision'),
    source_run_id: string(input.source_run_id, 'proposal.source_run_id'),
    status: status as ResumeProposalDto['status'],
    summary: summary === null ? null : parseRichText(summary, 'proposal.summary'),
    title: string(input.title, 'proposal.title'),
    updated_at: string(input.updated_at, 'proposal.updated_at')
  }
}

/** @brief 校验 Resume Proposal 分页 / Validate a Resume Proposal page. */
export function parseResumeProposalListDto(value: unknown): PaginatedDto<ResumeProposalDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map((item) => parseResumeProposalDto(item)),
    page: parseCursorPage(input.page)
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

/** @brief 校验 Render artifact 分页 / Validate a Render artifact page. */
export function parseRenderArtifactListDto(value: unknown): PaginatedDto<RenderArtifactDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map(parseRenderArtifactDto),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验 KnowledgeSource / Validate a KnowledgeSource. */
function parseKnowledgeSource(value: unknown, path: string): KnowledgeSourceDto {
  const input = record(value, path)
  const config = record(input.config, `${path}.config`)
  string(config.source_type, `${path}.config.source_type`)
  const visibility = record(input.visibility, `${path}.visibility`)
  const ingestion = record(input.ingestion, `${path}.ingestion`)
  return {
    config,
    created_at: string(input.created_at, `${path}.created_at`),
    enabled: boolean(input.enabled, `${path}.enabled`),
    id: string(input.id, `${path}.id`),
    ingestion: {
      chunk_count: number(ingestion.chunk_count, `${path}.ingestion.chunk_count`),
      document_count: number(ingestion.document_count, `${path}.ingestion.document_count`),
      last_success_at: nullableString(
        ingestion.last_success_at,
        `${path}.ingestion.last_success_at`
      ),
      status: string(ingestion.status, `${path}.ingestion.status`)
    },
    name: string(input.name, `${path}.name`),
    revision: number(input.revision, `${path}.revision`),
    source_type: string(input.source_type, `${path}.source_type`),
    updated_at: string(input.updated_at, `${path}.updated_at`),
    visibility: {
      agent_grants: array(visibility.agent_grants, `${path}.visibility.agent_grants`).map(
        (item, index) => {
          const grant = record(item, `${path}.visibility.agent_grants[${index}]`)
          return {
            agent_scope: string(
              grant.agent_scope,
              `${path}.visibility.agent_grants[${index}].agent_scope`
            ),
            allowed_operations: stringArray(
              grant.allowed_operations,
              `${path}.visibility.agent_grants[${index}].allowed_operations`
            ),
            effect: string(grant.effect, `${path}.visibility.agent_grants[${index}].effect`)
          }
        }
      ),
      allow_external_model_processing: boolean(
        visibility.allow_external_model_processing,
        `${path}.visibility.allow_external_model_processing`
      ),
      allowed_model_regions: stringArray(
        visibility.allowed_model_regions,
        `${path}.visibility.allowed_model_regions`
      ),
      default_effect: string(visibility.default_effect, `${path}.visibility.default_effect`),
      policy_version: number(visibility.policy_version, `${path}.visibility.policy_version`),
      retention_days: nullableNumber(
        visibility.retention_days,
        `${path}.visibility.retention_days`
      ),
      sensitivity: string(visibility.sensitivity, `${path}.visibility.sensitivity`),
      session_override_allowed: boolean(
        visibility.session_override_allowed,
        `${path}.visibility.session_override_allowed`
      )
    },
    workspace_id: string(input.workspace_id, `${path}.workspace_id`)
  }
}

/** @brief 校验单个 KnowledgeSource / Validate one KnowledgeSource. */
export function parseKnowledgeSourceDto(value: unknown): KnowledgeSourceDto {
  return parseKnowledgeSource(value, 'knowledgeSource')
}

/** @brief 校验 KnowledgeSource 列表 / Validate a KnowledgeSource list. */
export function parseKnowledgeSourceListDto(value: unknown): PaginatedDto<KnowledgeSourceDto> {
  const input = record(value, 'response')
  return {
    items: array(input.items, 'items').map((item, index) =>
      parseKnowledgeSource(item, `items[${index}]`)
    ),
    page: parseCursorPage(input.page)
  }
}

/** @brief 校验 Knowledge ingestion Job / Validate a Knowledge ingestion Job. */
export function parseKnowledgeIngestionJobDto(value: unknown): KnowledgeIngestionJobDto {
  const input = exactRecord(value, 'knowledgeJob', [
    'id',
    'job_type',
    'status',
    'progress',
    'created_at',
    'started_at',
    'finished_at',
    'expires_at',
    'error',
    'request_id',
    'extensions',
    'source_id',
    'source_version_id',
    'stats'
  ])
  const status = string(input.status, 'knowledgeJob.status')
  const statuses: readonly KnowledgeIngestionJobDto['status'][] = [
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'expired'
  ]
  if (!statuses.includes(status as KnowledgeIngestionJobDto['status'])) {
    throw new HttpContractError('Backend returned an unsupported Knowledge Job status.', 200)
  }
  const jobType = string(input.job_type, 'knowledgeJob.job_type')
  const jobTypes: readonly KnowledgeIngestionJobDto['job_type'][] = [
    'knowledge.ingest',
    'knowledge.sync',
    'knowledge.delete'
  ]
  if (!jobTypes.includes(jobType as KnowledgeIngestionJobDto['job_type'])) {
    throw new HttpContractError('Backend returned an unsupported Knowledge Job type.', 200)
  }
  const progress = exactRecord(input.progress, 'knowledgeJob.progress', [
    'phase',
    'completed_units',
    'total_units',
    'percent',
    'message'
  ])
  const stats = exactRecord(input.stats, 'knowledgeJob.stats', [
    'documents',
    'chunks',
    'embedded_tokens',
    'skipped'
  ])
  const errorInput = nullableRecord(input.error, 'knowledgeJob.error')
  return {
    created_at: string(input.created_at, 'knowledgeJob.created_at'),
    error:
      errorInput === null
        ? null
        : {
            code: string(errorInput.code, 'knowledgeJob.error.code'),
            detail: nullableString(errorInput.detail, 'knowledgeJob.error.detail'),
            status: number(errorInput.status, 'knowledgeJob.error.status'),
            title: string(errorInput.title, 'knowledgeJob.error.title')
          },
    expires_at: nullableString(input.expires_at, 'knowledgeJob.expires_at'),
    finished_at: nullableString(input.finished_at, 'knowledgeJob.finished_at'),
    id: string(input.id, 'knowledgeJob.id'),
    job_type: jobType as KnowledgeIngestionJobDto['job_type'],
    progress: {
      completed_units: number(progress.completed_units, 'knowledgeJob.progress.completed_units'),
      percent: nullableNumber(progress.percent, 'knowledgeJob.progress.percent'),
      phase: string(progress.phase, 'knowledgeJob.progress.phase'),
      total_units: nullableNumber(progress.total_units, 'knowledgeJob.progress.total_units')
    },
    request_id: nullableString(input.request_id, 'knowledgeJob.request_id'),
    source_id: string(input.source_id, 'knowledgeJob.source_id'),
    source_version_id: nullableString(input.source_version_id, 'knowledgeJob.source_version_id'),
    started_at: nullableString(input.started_at, 'knowledgeJob.started_at'),
    stats: {
      chunks: number(stats.chunks, 'knowledgeJob.stats.chunks'),
      documents: number(stats.documents, 'knowledgeJob.stats.documents'),
      embedded_tokens: number(stats.embedded_tokens, 'knowledgeJob.stats.embedded_tokens'),
      skipped: number(stats.skipped, 'knowledgeJob.stats.skipped')
    },
    status: status as KnowledgeIngestionJobDto['status']
  }
}

/** @brief 校验临时直接上传响应 / Validate a temporary direct-upload response. */
export function parseKnowledgeFileUploadResponseDto(
  value: unknown
): KnowledgeFileUploadResponseDto {
  const input = exactRecord(value, 'knowledgeUpload', ['source', 'ingestion_job'])
  return {
    ingestion_job: parseKnowledgeIngestionJobDto(input.ingestion_job),
    source: parseKnowledgeSource(input.source, 'knowledgeUpload.source')
  }
}

/** @brief 校验 Knowledge search result / Validate a Knowledge search result. */
function parseKnowledgeSearchResult(value: unknown, path: string): KnowledgeSearchResultDto {
  const input = exactRecord(value, path, ['result_id', 'citation', 'text', 'score', 'metadata'])
  const citation = exactRecord(input.citation, `${path}.citation`, [
    'citation_id',
    'source_id',
    'source_version_id',
    'title',
    'uri',
    'locator',
    'quote',
    'score'
  ])
  const locator = exactRecord(citation.locator, `${path}.citation.locator`, [
    'page',
    'line_start',
    'line_end',
    'time_start_ms',
    'time_end_ms',
    'symbol',
    'path'
  ])
  return {
    citation: {
      citation_id: string(citation.citation_id, `${path}.citation.citation_id`),
      locator: {
        line_end: nullableNumber(locator.line_end, `${path}.citation.locator.line_end`),
        line_start: nullableNumber(locator.line_start, `${path}.citation.locator.line_start`),
        page: nullableNumber(locator.page, `${path}.citation.locator.page`),
        path: nullableString(locator.path, `${path}.citation.locator.path`),
        symbol: nullableString(locator.symbol, `${path}.citation.locator.symbol`),
        time_end_ms: nullableNumber(locator.time_end_ms, `${path}.citation.locator.time_end_ms`),
        time_start_ms: nullableNumber(
          locator.time_start_ms,
          `${path}.citation.locator.time_start_ms`
        )
      },
      quote: nullableString(citation.quote, `${path}.citation.quote`),
      score: nullableNumber(citation.score, `${path}.citation.score`),
      source_id: string(citation.source_id, `${path}.citation.source_id`),
      source_version_id: string(citation.source_version_id, `${path}.citation.source_version_id`),
      title: string(citation.title, `${path}.citation.title`),
      uri: nullableString(citation.uri, `${path}.citation.uri`)
    },
    metadata: record(input.metadata, `${path}.metadata`),
    result_id: string(input.result_id, `${path}.result_id`),
    score: number(input.score, `${path}.score`),
    text: string(input.text, `${path}.text`)
  }
}

/** @brief 校验当前 Knowledge search wrapper / Validate the current Knowledge search wrapper. */
export function parseKnowledgeSearchResponseDto(value: unknown): KnowledgeSearchResponseDto {
  const input = exactRecord(value, 'knowledgeSearch', ['items'])
  return {
    items: array(input.items, 'knowledgeSearch.items').map((item, index) =>
      parseKnowledgeSearchResult(item, `knowledgeSearch.items[${index}]`)
    )
  }
}
