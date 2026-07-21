/** @file Knowledge 已确认端点的 transport DTO / Transport DTOs for confirmed Knowledge endpoints. */

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
