/** @file Knowledge HTTP JSON 的运行时校验 / Runtime validation for Knowledge HTTP JSON. */

import {
  absoluteUri,
  array,
  boolean,
  boundedArray,
  boundedInteger,
  boundedString,
  exactRecord,
  extensions,
  nonNegativeInteger,
  opaqueId,
  parseCursorPage,
  positiveInteger,
  sha256,
  stableCode,
  string,
  timestamp,
  type PaginatedDto
} from '../../../../infrastructure/http/decoder'
import { HttpContractError, parseProblemDetails } from '../../../../infrastructure/http/http-client'
import { validateRichText } from '../../../../infrastructure/http/rich-text-validator'
import type { KnowledgeSourceDto } from './transport-types'

/** @brief KnowledgeSource config 的封闭判别值 / Closed KnowledgeSource-config discriminators. */
const SOURCE_CONFIG_TYPES = [
  'resume',
  'file',
  'url',
  'website',
  'blog_feed',
  'git_repository',
  'cloud_drive',
  'manual_note'
] as const

/** @brief 摄取状态的冻结枚举 / Frozen ingestion-status enum. */
const INGESTION_STATUSES = [
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
] as const

/**
 * @brief 断言字符串属于封闭枚举 / Assert that a string belongs to a closed enum.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param allowed 冻结枚举值 / Frozen enum values.
 * @return 已验证字符串 / Validated string.
 */
function closedEnum(value: unknown, path: string, allowed: readonly string[]): string {
  /** @brief 已解码字符串 / Decoded string. */
  const decoded = string(value, path)
  if (!allowed.includes(decoded)) {
    throw new HttpContractError(`Backend field ${path} contains an unsupported value.`, 200)
  }
  return decoded
}

/**
 * @brief 拒绝字符串数组中的重复值 / Reject duplicate values in a string array.
 * @param values 已解码字符串 / Decoded strings.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function requireUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new HttpContractError(`Backend field ${path} must contain unique items.`, 200)
  }
}

/**
 * @brief 校验有界字符串数组 / Validate an array of bounded strings.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目 / Minimum item count.
 * @param maximumItems 最大条目；null 表示 Schema 未设上限 / Maximum item count, or null without a schema limit.
 * @param maximumLength 单条字符串最大长度；null 表示 Schema 未设上限 / Maximum string length, or null without a schema limit.
 * @param unique 是否要求条目唯一 / Whether items must be unique.
 * @return 已验证字符串数组 / Validated string array.
 */
function boundedStrings(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number | null,
  maximumLength: number | null,
  unique: boolean
): readonly string[] {
  /** @brief 已解码原始数组 / Decoded raw array. */
  const input = array(value, path)
  if (input.length < minimumItems || (maximumItems !== null && input.length > maximumItems)) {
    throw new HttpContractError(`Backend field ${path} contains an invalid number of items.`, 200)
  }
  /** @brief 已验证字符串数组 / Validated string array. */
  const values = input.map((item, index): string =>
    maximumLength === null
      ? string(item, `${path}[${index}]`)
      : boundedString(item, `${path}[${index}]`, 0, maximumLength)
  )
  if (unique) requireUnique(values, path)
  return values
}

/**
 * @brief 校验可选可空 OpaqueId / Validate an optional nullable OpaqueId.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateNullableOpaqueId(value: unknown, path: string): void {
  if (value !== undefined && value !== null) opaqueId(value, path)
}

/**
 * @brief 校验可选可空有界字符串 / Validate an optional nullable bounded string.
 * @param value 未知输入 / Unknown input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param maximumLength 最大长度 / Maximum length.
 */
function validateNullableBoundedString(value: unknown, path: string, maximumLength: number): void {
  if (value !== undefined && value !== null) boundedString(value, path, 0, maximumLength)
}

/**
 * @brief 校验 KnowledgeSourceConfig 判别联合 / Validate the KnowledgeSourceConfig discriminated union.
 * @param value 未知 config / Unknown config.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 config 对象 / Validated config object.
 */
function parseSourceConfig(value: unknown, path: string): Readonly<Record<string, unknown>> {
  /** @brief 用于读取判别字段的对象 / Object used to read the discriminator. */
  const candidate = exactRecord(value, path, [
    'source_type',
    'resume_id',
    'revision_mode',
    'pinned_revision',
    'file_id',
    'filename',
    'content_type',
    'sha256',
    'url',
    'crawl_depth',
    'max_pages',
    'include_patterns',
    'exclude_patterns',
    'connection_id',
    'repository_url',
    'default_branch',
    'ref',
    'include_globs',
    'exclude_globs',
    'include_history',
    'provider',
    'root_id',
    'title',
    'content'
  ])
  /** @brief config 联合判别值 / Config union discriminator. */
  const sourceType = closedEnum(candidate.source_type, `${path}.source_type`, SOURCE_CONFIG_TYPES)

  if (sourceType === 'resume') {
    /** @brief 精确 Resume config / Exact Resume config. */
    const input = exactRecord(value, path, [
      'source_type',
      'resume_id',
      'revision_mode',
      'pinned_revision'
    ])
    opaqueId(input.resume_id, `${path}.resume_id`)
    closedEnum(input.revision_mode, `${path}.revision_mode`, ['latest', 'pinned'])
    if (input.pinned_revision !== undefined && input.pinned_revision !== null) {
      positiveInteger(input.pinned_revision, `${path}.pinned_revision`)
    }
    return input
  }

  if (sourceType === 'file') {
    /** @brief 精确 File config / Exact File config. */
    const input = exactRecord(value, path, [
      'source_type',
      'file_id',
      'filename',
      'content_type',
      'sha256'
    ])
    opaqueId(input.file_id, `${path}.file_id`)
    boundedString(input.filename, `${path}.filename`, 1, 1_024)
    boundedString(input.content_type, `${path}.content_type`, 1, 200)
    sha256(input.sha256, `${path}.sha256`)
    return input
  }

  if (sourceType === 'url' || sourceType === 'website' || sourceType === 'blog_feed') {
    /** @brief 精确 URL config / Exact URL config. */
    const input = exactRecord(value, path, [
      'source_type',
      'url',
      'crawl_depth',
      'max_pages',
      'include_patterns',
      'exclude_patterns',
      'connection_id'
    ])
    absoluteUri(input.url, `${path}.url`)
    boundedInteger(input.crawl_depth, `${path}.crawl_depth`, 0, 10)
    boundedInteger(input.max_pages, `${path}.max_pages`, 1, 100_000)
    if (input.include_patterns !== undefined) {
      boundedStrings(input.include_patterns, `${path}.include_patterns`, 0, 100, 1_000, false)
    }
    if (input.exclude_patterns !== undefined) {
      boundedStrings(input.exclude_patterns, `${path}.exclude_patterns`, 0, 100, 1_000, false)
    }
    validateNullableOpaqueId(input.connection_id, `${path}.connection_id`)
    return input
  }

  if (sourceType === 'git_repository') {
    /** @brief 精确 Git config / Exact Git config. */
    const input = exactRecord(value, path, [
      'source_type',
      'repository_url',
      'default_branch',
      'ref',
      'include_globs',
      'exclude_globs',
      'include_history',
      'connection_id'
    ])
    absoluteUri(input.repository_url, `${path}.repository_url`)
    validateNullableBoundedString(input.default_branch, `${path}.default_branch`, 300)
    validateNullableBoundedString(input.ref, `${path}.ref`, 300)
    if (input.include_globs !== undefined) {
      boundedStrings(input.include_globs, `${path}.include_globs`, 0, 500, 500, false)
    }
    if (input.exclude_globs !== undefined) {
      boundedStrings(input.exclude_globs, `${path}.exclude_globs`, 0, 500, 500, false)
    }
    boolean(input.include_history, `${path}.include_history`)
    validateNullableOpaqueId(input.connection_id, `${path}.connection_id`)
    return input
  }

  if (sourceType === 'cloud_drive') {
    /** @brief 精确 Cloud Drive config / Exact Cloud Drive config. */
    const input = exactRecord(value, path, [
      'source_type',
      'provider',
      'connection_id',
      'root_id',
      'include_globs',
      'exclude_globs'
    ])
    closedEnum(input.provider, `${path}.provider`, [
      'google_drive',
      'microsoft_onedrive',
      'dropbox',
      'other'
    ])
    opaqueId(input.connection_id, `${path}.connection_id`)
    validateNullableBoundedString(input.root_id, `${path}.root_id`, 2_000)
    if (input.include_globs !== undefined) {
      boundedStrings(input.include_globs, `${path}.include_globs`, 0, 500, 500, false)
    }
    if (input.exclude_globs !== undefined) {
      boundedStrings(input.exclude_globs, `${path}.exclude_globs`, 0, 500, 500, false)
    }
    return input
  }

  /** @brief 精确 Manual Note config / Exact Manual Note config. */
  const input = exactRecord(value, path, ['source_type', 'title', 'content'])
  boundedString(input.title, `${path}.title`, 1, 300)
  validateRichText(input.content, `${path}.content`)
  return input
}

/**
 * @brief 校验可选同步计划 / Validate an optional sync schedule.
 * @param value 未知同步计划 / Unknown sync schedule.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function validateSyncSchedule(value: unknown, path: string): void {
  if (value === undefined || value === null) return
  /** @brief 精确同步计划 / Exact sync schedule. */
  const input = exactRecord(value, path, ['mode', 'interval_minutes', 'cron', 'enabled'])
  closedEnum(input.mode, `${path}.mode`, ['manual', 'interval', 'cron', 'webhook'])
  if (input.interval_minutes !== undefined && input.interval_minutes !== null) {
    boundedInteger(input.interval_minutes, `${path}.interval_minutes`, 5, 525_600)
  }
  validateNullableBoundedString(input.cron, `${path}.cron`, 200)
  boolean(input.enabled, `${path}.enabled`)
}

/**
 * @brief 校验 KnowledgeSource / Validate a KnowledgeSource.
 * @param value 未知来源 / Unknown source.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证来源 DTO / Validated source DTO.
 */
function parseKnowledgeSource(value: unknown, path: string): KnowledgeSourceDto {
  /** @brief 精确 KnowledgeSource 对象 / Exact KnowledgeSource object. */
  const input = exactRecord(value, path, [
    'id',
    'created_at',
    'updated_at',
    'revision',
    'workspace_id',
    'name',
    'source_type',
    'config',
    'visibility',
    'ingestion',
    'sync_schedule',
    'enabled',
    'extensions'
  ])
  /** @brief 精确可见性策略 / Exact visibility policy. */
  const visibility = exactRecord(input.visibility, `${path}.visibility`, [
    'policy_version',
    'default_effect',
    'sensitivity',
    'agent_grants',
    'session_override_allowed',
    'allow_external_model_processing',
    'allowed_model_regions',
    'retention_days'
  ])
  /** @brief 已验证 Agent grants / Validated agent grants. */
  const agentGrants = boundedArray(
    visibility.agent_grants,
    `${path}.visibility.agent_grants`,
    0,
    100
  ).map((item, index) => {
    /** @brief 当前 grant 路径 / Current grant path. */
    const grantPath = `${path}.visibility.agent_grants[${index}]`
    /** @brief 精确 grant / Exact grant. */
    const grant = exactRecord(item, grantPath, ['agent_scope', 'effect', 'allowed_operations'])
    /** @brief 已验证操作列表 / Validated operation list. */
    const allowedOperations = boundedStrings(
      grant.allowed_operations,
      `${grantPath}.allowed_operations`,
      1,
      null,
      null,
      true
    )
    allowedOperations.forEach((operation, operationIndex): void => {
      closedEnum(operation, `${grantPath}.allowed_operations[${operationIndex}]`, [
        'retrieve',
        'quote',
        'summarize',
        'derive',
        'write_back'
      ])
    })
    return {
      agent_scope: stableCode(grant.agent_scope, `${grantPath}.agent_scope`),
      allowed_operations: allowedOperations,
      effect: closedEnum(grant.effect, `${grantPath}.effect`, ['allow', 'deny'])
    }
  })
  /** @brief 已验证模型区域 / Validated model regions. */
  const allowedModelRegions = boundedStrings(
    visibility.allowed_model_regions,
    `${path}.visibility.allowed_model_regions`,
    0,
    null,
    null,
    true
  )
  allowedModelRegions.forEach((region, index): void => {
    closedEnum(region, `${path}.visibility.allowed_model_regions[${index}]`, [
      'cn',
      'global',
      'private_deployment'
    ])
  })
  /** @brief 精确摄取状态 / Exact ingestion state. */
  const ingestion = exactRecord(input.ingestion, `${path}.ingestion`, [
    'status',
    'active_job_id',
    'indexed_version_id',
    'document_count',
    'chunk_count',
    'last_success_at',
    'last_error'
  ])
  validateNullableOpaqueId(ingestion.active_job_id, `${path}.ingestion.active_job_id`)
  validateNullableOpaqueId(ingestion.indexed_version_id, `${path}.ingestion.indexed_version_id`)
  if (ingestion.last_success_at !== undefined && ingestion.last_success_at !== null) {
    timestamp(ingestion.last_success_at, `${path}.ingestion.last_success_at`)
  }
  if (
    ingestion.last_error !== undefined &&
    ingestion.last_error !== null &&
    parseProblemDetails(ingestion.last_error) === null
  ) {
    throw new HttpContractError(
      `Backend field ${path}.ingestion.last_error must match ProblemDetails.`,
      200
    )
  }
  validateSyncSchedule(input.sync_schedule, `${path}.sync_schedule`)
  if (input.extensions !== undefined) extensions(input.extensions, `${path}.extensions`)

  return {
    config: parseSourceConfig(input.config, `${path}.config`),
    created_at: timestamp(input.created_at, `${path}.created_at`),
    enabled: boolean(input.enabled, `${path}.enabled`),
    id: opaqueId(input.id, `${path}.id`),
    ingestion: {
      chunk_count: nonNegativeInteger(ingestion.chunk_count, `${path}.ingestion.chunk_count`),
      document_count: nonNegativeInteger(
        ingestion.document_count,
        `${path}.ingestion.document_count`
      ),
      last_success_at:
        ingestion.last_success_at === undefined || ingestion.last_success_at === null
          ? null
          : timestamp(ingestion.last_success_at, `${path}.ingestion.last_success_at`),
      status: closedEnum(ingestion.status, `${path}.ingestion.status`, INGESTION_STATUSES)
    },
    name: boundedString(input.name, `${path}.name`, 1, 300),
    revision: positiveInteger(input.revision, `${path}.revision`),
    source_type: stableCode(input.source_type, `${path}.source_type`),
    updated_at: timestamp(input.updated_at, `${path}.updated_at`),
    visibility: {
      agent_grants: agentGrants,
      allow_external_model_processing: boolean(
        visibility.allow_external_model_processing,
        `${path}.visibility.allow_external_model_processing`
      ),
      allowed_model_regions: allowedModelRegions,
      default_effect: closedEnum(visibility.default_effect, `${path}.visibility.default_effect`, [
        'allow',
        'deny'
      ]),
      policy_version: positiveInteger(
        visibility.policy_version,
        `${path}.visibility.policy_version`
      ),
      retention_days:
        visibility.retention_days === undefined || visibility.retention_days === null
          ? null
          : boundedInteger(
              visibility.retention_days,
              `${path}.visibility.retention_days`,
              0,
              36_500
            ),
      sensitivity: closedEnum(visibility.sensitivity, `${path}.visibility.sensitivity`, [
        'normal',
        'confidential',
        'highly_confidential'
      ]),
      session_override_allowed: boolean(
        visibility.session_override_allowed,
        `${path}.visibility.session_override_allowed`
      )
    },
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/** @brief 校验单个 KnowledgeSource / Validate one KnowledgeSource. */
export function parseKnowledgeSourceDto(value: unknown): KnowledgeSourceDto {
  return parseKnowledgeSource(value, 'knowledgeSource')
}

/** @brief 校验 KnowledgeSource 列表 / Validate a KnowledgeSource list. */
export function parseKnowledgeSourceListDto(value: unknown): PaginatedDto<KnowledgeSourceDto> {
  /** @brief 精确列表响应 / Exact list response. */
  const input = exactRecord(value, 'response', ['items', 'page'])
  return {
    items: array(input.items, 'items').map((item, index) =>
      parseKnowledgeSource(item, `items[${index}]`)
    ),
    page: parseCursorPage(input.page)
  }
}
