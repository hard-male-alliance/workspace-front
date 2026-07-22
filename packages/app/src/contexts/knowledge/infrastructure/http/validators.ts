/** @file Knowledge HTTP JSON 的运行时校验 / Runtime validation for Knowledge HTTP JSON. */

import {
  array,
  boolean,
  nullableNumber,
  nullableString,
  number,
  parseCursorPage,
  record,
  string,
  stringArray,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import type { KnowledgeSourceDto } from './transport-types'

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
