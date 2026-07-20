/** @file 已确认只读端点的 transport DTO / Transport DTOs for confirmed read endpoints. */

/** @brief 不透明游标分页元数据 / Opaque cursor page metadata. */
export interface CursorPageDto {
  readonly next_cursor: string | null
  readonly has_more: boolean
  readonly total_estimate: number | null
}

/** @brief 分页响应 / Paginated response. */
export interface PaginatedDto<TItem> {
  readonly items: readonly TItem[]
  readonly page: CursorPageDto
}

/** @brief 模板区域 DTO / Template-zone DTO. */
export interface TemplateZoneDto {
  readonly zone_id: string
  readonly label_key: string
  readonly accepted_section_kinds: readonly string[]
  readonly max_sections: number | null
}

/** @brief 模板设置选项 DTO / Template-setting choice DTO. */
export interface TemplateChoiceDto {
  readonly value: unknown
  readonly label_key: string
  readonly description_key: string | null
}

/** @brief 模板设置定义 DTO / Template-setting definition DTO. */
export interface TemplateSettingDefinitionDto {
  readonly key: string
  readonly label_key: string
  readonly description_key: string | null
  readonly value_type: string
  readonly default: unknown
  readonly minimum: number | null
  readonly maximum: number | null
  readonly choices: readonly TemplateChoiceDto[]
  readonly ui_control: string
  readonly group_key: string | null
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

/** @brief 简历联系信息 DTO / Resume contact DTO. */
export interface ResumeContactDto {
  readonly kind: string
  readonly label: string | null
  readonly value: string
  readonly is_public: boolean
}

/** @brief 简历多态条目的公共只读 DTO / Common read-only DTO for polymorphic Resume items. */
export interface ResumeItemDto {
  readonly item_id: string
  readonly item_kind: string
  readonly visible: boolean
  readonly tags: readonly string[]
  readonly raw: Readonly<Record<string, unknown>>
}

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
    readonly template_settings: Readonly<Record<string, unknown>>
  }
  readonly knowledge_source_id: string | null
}

/** @brief Resume operation 批次结果 DTO / Resume operation batch-result DTO. */
export interface ResumeOperationBatchResultDto {
  readonly resume_id: string
  readonly previous_revision: number
  readonly new_revision: number
  readonly results: readonly {
    readonly operation_id: string
    readonly status: 'applied' | 'deduplicated' | 'rebased' | 'rejected'
  }[]
  readonly normalized_document: ResumeDocumentDto | null
}

/** @brief Resume Proposal DTO / Resume Proposal DTO. */
export interface ResumeProposalDto {
  readonly id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly resume_id: string
  readonly base_revision: number
  readonly source_run_id: string
  readonly title: string
  readonly summary: RichTextDto | null
  readonly operations: readonly {
    readonly operation_id: string
    readonly op: string
  }[]
  readonly status:
    'pending' | 'accepted' | 'partially_accepted' | 'rejected' | 'expired' | 'conflicted'
  readonly expires_at: string | null
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
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  readonly progress: {
    readonly phase: string
    readonly completed_units: number
    readonly total_units: number | null
    readonly percent: number | null
  }
  readonly resume_id: string
  readonly resume_revision: number
  readonly artifacts: readonly RenderArtifactDto[]
  readonly diagnostic: string | null
}

/** @brief KnowledgeSource DTO / KnowledgeSource DTO. */
export interface KnowledgeSourceDto {
  readonly id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly workspace_id: string
  readonly name: string
  readonly source_type: string
  readonly config: Readonly<Record<string, unknown>>
  readonly enabled: boolean
  readonly visibility: {
    readonly policy_version: number
    readonly default_effect: string
    readonly sensitivity: string
    readonly agent_grants: readonly {
      readonly agent_scope: string
      readonly effect: string
      readonly allowed_operations: readonly string[]
    }[]
    readonly session_override_allowed: boolean
    readonly allow_external_model_processing: boolean
    readonly allowed_model_regions: readonly string[]
    readonly retention_days: number | null
  }
  readonly ingestion: {
    readonly status: string
    readonly document_count: number
    readonly chunk_count: number
    readonly last_success_at: string | null
  }
}

/** @brief Knowledge ingestion Job 的必要 ProblemDetails 投影 / Required ProblemDetails projection for ingestion jobs. */
export interface KnowledgeJobProblemDto {
  readonly code: string
  readonly detail: string | null
  readonly status: number
  readonly title: string
}

/** @brief Knowledge ingestion Job DTO / Knowledge ingestion Job DTO. */
export interface KnowledgeIngestionJobDto {
  readonly id: string
  readonly job_type: 'knowledge.ingest' | 'knowledge.sync' | 'knowledge.delete'
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  readonly progress: {
    readonly phase: string
    readonly completed_units: number
    readonly total_units: number | null
    readonly percent: number | null
  }
  readonly created_at: string
  readonly started_at: string | null
  readonly finished_at: string | null
  readonly expires_at: string | null
  readonly error: KnowledgeJobProblemDto | null
  readonly request_id: string | null
  readonly source_id: string
  readonly source_version_id: string | null
  readonly stats: {
    readonly documents: number
    readonly chunks: number
    readonly embedded_tokens: number
    readonly skipped: number
  }
}

/** @brief 临时直接上传响应 DTO / Temporary direct-upload response DTO. */
export interface KnowledgeFileUploadResponseDto {
  readonly source: KnowledgeSourceDto
  readonly ingestion_job: KnowledgeIngestionJobDto
}

/** @brief Knowledge citation locator DTO / Knowledge citation locator DTO. */
export interface KnowledgeCitationLocatorDto {
  readonly page: number | null
  readonly line_start: number | null
  readonly line_end: number | null
  readonly time_start_ms: number | null
  readonly time_end_ms: number | null
  readonly symbol: string | null
  readonly path: string | null
}

/** @brief Knowledge search result DTO / Knowledge search result DTO. */
export interface KnowledgeSearchResultDto {
  readonly result_id: string
  readonly citation: {
    readonly citation_id: string
    readonly source_id: string
    readonly source_version_id: string
    readonly title: string
    readonly uri: string | null
    readonly locator: KnowledgeCitationLocatorDto
    readonly quote: string | null
    readonly score: number | null
  }
  readonly text: string
  readonly score: number
  readonly metadata: Readonly<Record<string, unknown>>
}

/** @brief 当前路径级 Knowledge search wrapper DTO / Current path-level Knowledge search wrapper DTO. */
export interface KnowledgeSearchResponseDto {
  readonly items: readonly KnowledgeSearchResultDto[]
}
