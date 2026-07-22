/** @file Knowledge transport DTO 到领域模型的映射 / Mapping Knowledge transport DTOs to domain models. */

import type { UiAgentScope } from '../../../../shared-kernel/agent-scope'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import type {
  UiKnowledgeIngestionStatus,
  UiKnowledgeOperation,
  UiKnowledgeSensitivity,
  UiKnowledgeSource,
  UiKnowledgeSourceType,
  UiVisibilityEffect
} from '../../domain/models'
import { HttpContractError } from '../../../../infrastructure/http/http-client'
import type { KnowledgeSourceDto } from './transport-types'

const knowledgeSourceTypes: readonly UiKnowledgeSourceType[] = [
  'resume',
  'file',
  'url',
  'website',
  'blog_feed',
  'git_repository',
  'manual_note',
  'cloud_drive'
]
const ingestionStatuses: readonly UiKnowledgeIngestionStatus[] = [
  'not_started',
  'queued',
  'fetching',
  'parsing',
  'chunking',
  'embedding',
  'ready',
  'stale',
  'failed',
  'deleted'
]
const visibilityEffects: readonly UiVisibilityEffect[] = ['allow', 'deny']
const sensitivities: readonly UiKnowledgeSensitivity[] = [
  'normal',
  'confidential',
  'highly_confidential'
]
const agentScopes: readonly UiAgentScope[] = [
  'resume_assistant',
  'job_fit_analyst',
  'interview_agent',
  'interview_reporter',
  'general_chat',
  'portfolio_assistant'
]
const knowledgeOperations: readonly UiKnowledgeOperation[] = [
  'retrieve',
  'quote',
  'summarize',
  'derive',
  'write_back'
]
const modelRegions = ['cn', 'global', 'private_deployment'] as const
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

/** @brief 从来源 config 选择可展示且不推测的出处 / Select a displayable origin without inventing one. */
function originLabel(dto: KnowledgeSourceDto): string {
  return (
    firstString(dto.config, [
      'resume_id',
      'filename',
      'url',
      'repository_url',
      'title',
      'root_id'
    ]) ?? dto.name
  )
}

/** @brief 映射 KnowledgeSource / Map a KnowledgeSource. */
export function mapKnowledgeSourceDto(dto: KnowledgeSourceDto): UiKnowledgeSource {
  return {
    chunkCount: dto.ingestion.chunk_count,
    documentCount: dto.ingestion.document_count,
    enabled: dto.enabled,
    id: asUiOpaqueId<'knowledge-source'>(dto.id),
    ingestionStatus: enumValue(dto.ingestion.status, ingestionStatuses, 'ingestion.status'),
    lastSuccessAt: dto.ingestion.last_success_at,
    name: dto.name,
    originLabel: originLabel(dto),
    sourceType: enumValue(dto.source_type, knowledgeSourceTypes, 'source_type'),
    updatedAt: dto.updated_at,
    visibility: {
      agentGrants: dto.visibility.agent_grants.map((grant, index) => ({
        agentScope: enumValue(
          grant.agent_scope,
          agentScopes,
          `visibility.agent_grants[${index}].agent_scope`
        ),
        allowedOperations: grant.allowed_operations.map((operation, operationIndex) =>
          enumValue(
            operation,
            knowledgeOperations,
            `visibility.agent_grants[${index}].allowed_operations[${operationIndex}]`
          )
        ),
        effect: enumValue(
          grant.effect,
          visibilityEffects,
          `visibility.agent_grants[${index}].effect`
        )
      })),
      allowExternalModelProcessing: dto.visibility.allow_external_model_processing,
      allowedModelRegions: dto.visibility.allowed_model_regions.map((region, index) =>
        enumValue(region, modelRegions, `visibility.allowed_model_regions[${index}]`)
      ),
      defaultEffect: enumValue(
        dto.visibility.default_effect,
        visibilityEffects,
        'visibility.default_effect'
      ),
      policyVersion: dto.visibility.policy_version,
      retentionDays: dto.visibility.retention_days,
      sensitivity: enumValue(dto.visibility.sensitivity, sensitivities, 'visibility.sensitivity'),
      sessionOverrideAllowed: dto.visibility.session_override_allowed
    },
    workspaceId: asUiOpaqueId<'workspace'>(dto.workspace_id)
  }
}
