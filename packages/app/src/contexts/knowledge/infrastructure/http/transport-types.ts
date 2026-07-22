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
