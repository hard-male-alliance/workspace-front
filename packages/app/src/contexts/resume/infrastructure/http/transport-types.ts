/** @file Resume 已确认端点的 transport DTO / Transport DTOs for confirmed Resume endpoints. */

import type { UiTemplateSettingValue } from '../../domain/models'

/** @brief 模板区域 DTO / Template-zone DTO. */
export interface TemplateZoneDto {
  readonly zone_id: string
  readonly label_key: string
  readonly accepted_section_kinds: readonly string[]
  readonly max_sections: number | null
}

/** @brief 模板设置选项 DTO / Template-setting choice DTO. */
export interface TemplateChoiceDto {
  readonly value: UiTemplateSettingValue
  readonly label_key: string
  readonly description_key: string | null
}

/** @brief 模板设置的条件可见性 DTO / Conditional-visibility DTO for a template setting. */
export interface TemplateSettingVisibilityDto {
  readonly key: string
  readonly equals: UiTemplateSettingValue
}

/** @brief 模板设置定义 DTO / Template-setting definition DTO. */
export interface TemplateSettingDefinitionDto {
  readonly key: string
  readonly label_key: string
  readonly description_key: string | null
  readonly value_type: string
  readonly default: UiTemplateSettingValue
  readonly minimum: number | null
  readonly maximum: number | null
  readonly choices: readonly TemplateChoiceDto[]
  readonly ui_control: string
  readonly group_key: string | null
  readonly visible_when: TemplateSettingVisibilityDto | null
}

/** @brief 模板清单 DTO / Template-manifest DTO. */
export interface TemplateManifestDto {
  readonly id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly template_version: string
  readonly name: string
  readonly description: string | null
  readonly preview_asset_url: string | null
  readonly supported_locales: readonly string[]
  readonly supported_page_sizes: readonly string[]
  readonly supported_output_formats: readonly string[]
  readonly supported_section_kinds: readonly string[]
  readonly zones: readonly TemplateZoneDto[]
  readonly font_family_tokens: readonly string[]
  readonly date_format_tokens: readonly string[]
  readonly bullet_style_tokens: readonly string[]
  readonly settings: readonly TemplateSettingDefinitionDto[]
  readonly capabilities: {
    readonly supports_photo: boolean
    readonly supports_sidebar: boolean
    readonly supports_custom_sections: boolean
    readonly supports_source_map: boolean
    readonly max_columns: number
  }
}

/** @brief 富文本的只读投影 DTO / Read-only RichText projection DTO. */
export interface RichTextDto {
  readonly plain_text: string | null
}

/** @brief 不完整日期 DTO / Partial-date DTO. */
export interface ResumePartialDateDto {
  readonly year: number
  readonly month: number | null
  readonly day: number | null
  /** @brief 契约允许未来扩展的日期精度 code / Open date-precision code allowed by the contract. */
  readonly precision: string
}

/** @brief 日期范围 DTO / Date-range DTO. */
export interface ResumeDateRangeDto {
  readonly start: ResumePartialDateDto | null
  readonly end: ResumePartialDateDto | null
  readonly is_current: boolean
  readonly display_override: string | null
}

/** @brief 简历联系信息 DTO / Resume contact DTO. */
export interface ResumeContactDto {
  readonly kind: string
  readonly label: string | null
  readonly value: string
  readonly is_public: boolean
}

/** @brief 简历条目公共 DTO 字段 / Common Resume-item DTO fields. */
interface ResumeItemBaseDto {
  readonly item_id: string
  readonly visible: boolean
  readonly tags: readonly string[]
}

/** @brief 工作经历条目 DTO / Experience-item DTO. */
export interface ResumeExperienceItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'experience'
  readonly organization: string
  readonly position: string
  readonly location: string | null
  readonly date_range: ResumeDateRangeDto
  readonly description: RichTextDto | null
  readonly highlights: readonly RichTextDto[]
}

/** @brief 教育经历条目 DTO / Education-item DTO. */
export interface ResumeEducationItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'education'
  readonly institution: string
  readonly degree: string | null
  readonly field_of_study: string | null
  readonly location: string | null
  readonly date_range: ResumeDateRangeDto
  readonly score: string | null
  readonly description: RichTextDto | null
  readonly highlights: readonly RichTextDto[]
}

/** @brief 项目条目 DTO / Project-item DTO. */
export interface ResumeProjectItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'project'
  readonly name: string
  readonly role: string | null
  readonly date_range: ResumeDateRangeDto | null
  readonly description: RichTextDto | null
  readonly highlights: readonly RichTextDto[]
  readonly technologies: readonly string[]
}

/** @brief 技能组条目 DTO / Skill-group-item DTO. */
export interface ResumeSkillGroupItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'skill_group'
  readonly name: string
  readonly skills: readonly string[]
  readonly proficiency: string | null
}

/** @brief 出版物条目 DTO / Publication-item DTO. */
export interface ResumePublicationItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'publication'
  readonly title: string
  readonly publisher: string | null
  readonly authors: readonly string[]
  readonly published_at: ResumePartialDateDto | null
  readonly description: RichTextDto | null
}

/** @brief 奖项条目 DTO / Award-item DTO. */
export interface ResumeAwardItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'award'
  readonly title: string
  readonly issuer: string | null
  readonly awarded_at: ResumePartialDateDto | null
  readonly description: RichTextDto | null
}

/** @brief 认证条目 DTO / Certification-item DTO. */
export interface ResumeCertificationItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'certification'
  readonly name: string
  readonly issuer: string | null
  readonly issued_at: ResumePartialDateDto | null
  readonly expires_at: ResumePartialDateDto | null
  readonly credential_id: string | null
}

/** @brief 语言条目 DTO / Language-item DTO. */
export interface ResumeLanguageItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'language'
  readonly language: string
  readonly proficiency: string
  readonly certificate: string | null
}

/** @brief 志愿经历条目 DTO / Volunteer-item DTO. */
export interface ResumeVolunteerItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'volunteer'
  readonly organization: string
  readonly role: string | null
  readonly date_range: ResumeDateRangeDto | null
  readonly description: RichTextDto | null
  readonly highlights: readonly RichTextDto[]
}

/** @brief 自定义简历条目 DTO / Custom Resume-item DTO. */
export interface ResumeCustomItemDto extends ResumeItemBaseDto {
  readonly item_kind: 'custom'
  readonly title: string | null
  readonly subtitle: string | null
  readonly date_range: ResumeDateRangeDto | null
  readonly content: RichTextDto
}

/** @brief 按 item_kind 判别的冻结 ResumeItem 联合 / Frozen ResumeItem union discriminated by item_kind. */
export type ResumeItemDto =
  | ResumeExperienceItemDto
  | ResumeEducationItemDto
  | ResumeProjectItemDto
  | ResumeSkillGroupItemDto
  | ResumePublicationItemDto
  | ResumeAwardItemDto
  | ResumeCertificationItemDto
  | ResumeLanguageItemDto
  | ResumeVolunteerItemDto
  | ResumeCustomItemDto

/** @brief 简历区段 DTO / Resume-section DTO. */
export interface ResumeSectionDto {
  readonly section_id: string
  readonly kind: string
  readonly title: string
  readonly visible: boolean
  readonly content: RichTextDto | null
  readonly items: readonly ResumeItemDto[]
}

/** @brief 测量值 DTO / Measurement DTO. */
export interface MeasurementDto {
  readonly value: number
  readonly unit: string
}

/** @brief 颜色值 DTO / Color-value DTO. */
export interface ColorValueDto {
  readonly space: string
  readonly value: string
}

/** @brief ResumeDocument DTO / ResumeDocument DTO. */
export interface ResumeDocumentDto {
  readonly id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly schema_version: '1.0'
  readonly workspace_id: string
  readonly title: string
  readonly locale: string
  readonly template: {
    readonly template_id: string
    readonly template_version: string
  }
  readonly profile: {
    readonly full_name: string
    readonly headline: string | null
    readonly contacts: readonly ResumeContactDto[]
    readonly summary: RichTextDto | null
  }
  readonly sections: readonly ResumeSectionDto[]
  readonly style_intent: {
    readonly style_contract_version: '1.0'
    readonly page: {
      readonly size: string
      readonly custom_width: MeasurementDto | null
      readonly custom_height: MeasurementDto | null
      readonly orientation: string
      readonly margins: {
        readonly top: MeasurementDto
        readonly right: MeasurementDto
        readonly bottom: MeasurementDto
        readonly left: MeasurementDto
      }
      readonly max_pages: number | null
      readonly show_page_numbers: boolean
    }
    readonly typography: {
      readonly font_family_token: string
      readonly base_size_pt: number
      readonly line_height: number
      readonly heading_scale: number
      readonly letter_spacing_em: number
    }
    readonly palette: {
      readonly primary: ColorValueDto
      readonly secondary: ColorValueDto
      readonly text: ColorValueDto
      readonly muted_text: ColorValueDto
      readonly background: ColorValueDto
    }
    readonly density: number
    readonly date_format_token: string
    readonly bullet_style_token: string
    readonly section_layout: readonly {
      readonly section_id: string
      readonly zone: string
      readonly keep_together: boolean
      readonly page_break_before: boolean
      readonly compactness: number
      readonly heading_style_token: string | null
    }[]
    readonly template_settings: Readonly<Record<string, UiTemplateSettingValue>>
    readonly extensions: Readonly<Record<string, unknown>>
  }
  readonly knowledge_source_id: string | null
}

/** @brief Resume operation 拒绝的安全 ProblemDetails 投影 / Safe ProblemDetails projection for a Resume-operation rejection. */
export interface ResumeOperationProblemDto {
  readonly code: string
  readonly retryable: boolean
  readonly status: number
}

/** @brief Resume operation 批次结果 DTO / Resume operation batch-result DTO. */
export interface ResumeOperationBatchResultDto {
  readonly resume_id: string
  readonly previous_revision: number
  readonly new_revision: number
  readonly results: readonly {
    readonly operation_id: string
    readonly status: 'applied' | 'deduplicated' | 'rebased' | 'rejected'
    readonly problem: ResumeOperationProblemDto | null
  }[]
  readonly normalized_document: ResumeDocumentDto | null
}

/** @brief Render artifact DTO / Render artifact DTO. */
export interface RenderArtifactDto {
  readonly id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly resume_id: string
  readonly resume_revision: number
  readonly format: string
  readonly content_type: string
  readonly size_bytes: number
  readonly sha256: string
  readonly download_url: string
  readonly expires_at: string | null
  readonly page_count: number | null
  readonly source_map_artifact_id: string | null
}

/** @brief Resume Render Job DTO / Resume Render Job DTO. */
export interface ResumeRenderJobDto {
  readonly id: string
  /** @brief 契约允许服务端新增的开放状态 code / Open status code that the contract permits providers to extend. */
  readonly status: string
  readonly progress: {
    readonly phase: string
    readonly completed_units: number
    readonly total_units: number | null
    readonly percent: number | null
  }
  readonly resume_id: string
  readonly resume_revision: number
  readonly artifacts: readonly RenderArtifactDto[]
}
