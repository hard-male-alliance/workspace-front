/** @file Knowledge HTTP JSON 的运行时校验 / Runtime validation for Knowledge HTTP JSON. */

import {
  array,
  boolean,
  exactRecord,
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
  KnowledgeFileUploadResponseDto,
  KnowledgeIngestionJobDto,
  KnowledgeSearchResponseDto,
  KnowledgeSearchResultDto,
  KnowledgeSourceDto
} from './transport-types'

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
