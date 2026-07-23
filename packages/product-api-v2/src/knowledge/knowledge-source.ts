/** @file KnowledgeSource API v2 wire 模型与严格 codec / KnowledgeSource API v2 wire models and strict codecs. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  extensions,
  httpUrl,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  patternedString,
  record,
  timestamp,
  type CursorCollection,
  type JsonValue,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseProblemDetails, type ProblemDetails } from '../http/problem'

/** @brief Agent scope code 的冻结格式 / Frozen Agent-scope code format. */
const AGENT_SCOPE_PATTERN = /^[a-z][a-z0-9_.-]{2,100}$/u

/** @brief Knowledge 来源类型 / Knowledge-source type. */
export type KnowledgeSourceType =
  | 'blog_feed'
  | 'cloud_drive'
  | 'file'
  | 'git_repository'
  | 'manual_note'
  | 'resume'
  | 'url'
  | 'website'

/** @brief Knowledge 策略可授权的 Agent 操作 / Agent operations grantable by a Knowledge policy. */
export type KnowledgeAgentOperation = 'derive' | 'quote' | 'retrieve' | 'summarize' | 'write_back'

/** @brief Knowledge 策略效果 / Knowledge-policy effect. */
export type KnowledgePolicyEffect = 'allow' | 'deny'

/** @brief Knowledge 敏感等级 / Knowledge sensitivity level. */
export type KnowledgeSensitivity = 'confidential' | 'highly_confidential' | 'normal'

/** @brief 允许执行模型处理的数据区域 / Data regions permitted for model processing. */
export type KnowledgeModelRegion = 'cn' | 'global' | 'private_deployment'

/** @brief Knowledge 摄取状态机 / Knowledge-ingestion state machine. */
export type KnowledgeIngestionStatus =
  | 'chunking'
  | 'deleted'
  | 'deleting'
  | 'embedding'
  | 'failed'
  | 'fetching'
  | 'not_started'
  | 'parsing'
  | 'queued'
  | 'ready'
  | 'stale'

/** @brief 面向一个 Agent scope 的 Knowledge 授权 / Knowledge grant for one Agent scope. */
export interface AgentScopeGrant {
  /** @brief 开放但格式稳定的 Agent scope / Open but format-stable Agent scope. */
  readonly agent_scope: string
  /** @brief 显式允许或拒绝 / Explicit allow or deny effect. */
  readonly effect: KnowledgePolicyEffect
  /** @brief 至少一个且不重复的允许操作 / At least one unique permitted operation. */
  readonly allowed_operations: readonly KnowledgeAgentOperation[]
}

/** @brief Knowledge 可见性与模型处理策略 / Knowledge visibility and model-processing policy. */
export interface KnowledgeVisibilityPolicy {
  /** @brief 敏感等级 / Sensitivity level. */
  readonly sensitivity: KnowledgeSensitivity
  /** @brief 没有匹配 grant 时的效果 / Effect when no grant matches. */
  readonly default_effect: KnowledgePolicyEffect
  /** @brief Agent scope 规则 / Agent-scope rules. */
  readonly agent_grants: readonly AgentScopeGrant[]
  /** @brief 是否允许 session 级覆盖 / Whether session-level overrides are allowed. */
  readonly session_override_allowed: boolean
  /** @brief 允许的模型处理区域 / Permitted model-processing regions. */
  readonly allowed_model_regions: readonly KnowledgeModelRegion[]
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allow_external_model_processing: boolean
  /** @brief 保留天数；null 表示策略未设固定期限 / Retention days, or null when no fixed period is set. */
  readonly retention_days: number | null
  /** @brief 策略领域版本 / Policy domain version. */
  readonly policy_version: number
}

/**
 * @brief 可安全公开的来源配置 / Publicly safe source configuration.
 * @note 每个字段都可能省略；`ref` 还可能显式为 null，codec 必须保留 absent、null 与 value 三态 / Every field may be omitted; `ref` may also explicitly be null, so the codec preserves absent, null, and value as three distinct states.
 */
export interface PublicKnowledgeSourceConfig {
  /** @brief 可选原文件名 / Optional original filename. */
  readonly filename?: string
  /** @brief 可选媒体类型 / Optional media type. */
  readonly media_type?: string
  /** @brief 可选公开 HTTP(S) 来源 URL / Optional public HTTP(S) source URL. */
  readonly url?: string
  /** @brief 可选公开 Git clone URL / Optional public Git clone URL. */
  readonly clone_url?: string
  /** @brief 可选 Git ref；省略与显式 null 语义不同 / Optional Git ref; omission and explicit null are distinct. */
  readonly ref?: string | null
  /** @brief 可选关联 Resume identity / Optional related Resume identity. */
  readonly resume_id?: string
}

/** @brief Knowledge 当前摄取投影 / Current Knowledge-ingestion projection. */
export interface KnowledgeIngestionState {
  /** @brief 摄取生命周期状态 / Ingestion lifecycle state. */
  readonly status: KnowledgeIngestionStatus
  /** @brief 已摄取文档数 / Number of ingested documents. */
  readonly document_count: number
  /** @brief 已构建 chunk 数 / Number of constructed chunks. */
  readonly chunk_count: number
  /** @brief 最近成功时间；尚未成功时为 null / Last successful time, or null before any success. */
  readonly last_success_at: string | null
  /** @brief 最近结构化问题；没有问题时为 null / Last structured problem, or null when none exists. */
  readonly last_problem: ProblemDetails | null
}

/** @brief API v2 KnowledgeSource 权威表示 / Authoritative API v2 KnowledgeSource representation. */
export interface KnowledgeSource extends ResourceFields {
  /** @brief 所属 Workspace identity / Owning Workspace identity. */
  readonly workspace_id: string
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 来源判别类型 / Source discriminator. */
  readonly source_type: KnowledgeSourceType
  /** @brief 是否参与产品检索 / Whether the source participates in product retrieval. */
  readonly enabled: boolean
  /** @brief 不含 secret 的公开配置 / Secret-free public configuration. */
  readonly public_config: PublicKnowledgeSourceConfig
  /** @brief 可见性与处理策略 / Visibility and processing policy. */
  readonly visibility: KnowledgeVisibilityPolicy
  /** @brief 当前摄取状态 / Current ingestion state. */
  readonly ingestion: KnowledgeIngestionState
  /** @brief 当前版本；来源尚无完成版本时为 null / Current version, or null before a version exists. */
  readonly current_version_id: string | null
  /** @brief 可选 namespaced 扩展；省略时保持省略 / Optional namespaced extensions, preserving omission. */
  readonly extensions?: Readonly<Record<string, JsonValue>>
}

/** @brief 文件来源创建输入 / File-source creation input. */
export interface FileSourceInput {
  /** @brief 固定文件判别值 / Fixed file discriminator. */
  readonly source_type: 'file'
  /** @brief 已完成上传会话 identity / Completed upload-session identity. */
  readonly upload_session_id: string
}

/** @brief URL、网站或 feed 来源创建输入 / URL, website, or feed source creation input. */
export interface UrlSourceInput {
  /** @brief 网络来源判别值 / Network-source discriminator. */
  readonly source_type: 'blog_feed' | 'url' | 'website'
  /** @brief 待服务端安全抓取的 HTTP(S) URL / HTTP(S) URL to be fetched safely by the server. */
  readonly url: string
}

/** @brief Git repository 来源创建输入 / Git-repository source creation input. */
export interface GitSourceInput {
  /** @brief 固定 Git 判别值 / Fixed Git discriminator. */
  readonly source_type: 'git_repository'
  /** @brief repository clone URL / Repository clone URL. */
  readonly clone_url: string
  /** @brief 可选固定 ref / Optional pinned ref. */
  readonly ref: string | null
  /** @brief include path 集合 / Include-path collection. */
  readonly include_paths: readonly string[]
  /** @brief exclude path 集合 / Exclude-path collection. */
  readonly exclude_paths: readonly string[]
  /** @brief 可选服务端 Connection 引用 / Optional server-side Connection reference. */
  readonly connection_id: string | null
}

/** @brief 手工笔记来源创建输入 / Manual-note source creation input. */
export interface ManualSourceInput {
  /** @brief 固定手工笔记判别值 / Fixed manual-note discriminator. */
  readonly source_type: 'manual_note'
  /** @brief 纯文本笔记内容 / Plain-text note content. */
  readonly content: string
}

/** @brief Resume 来源创建输入 / Resume-source creation input. */
export interface ResumeSourceInput {
  /** @brief 固定 Resume 判别值 / Fixed Resume discriminator. */
  readonly source_type: 'resume'
  /** @brief 关联 Resume identity / Related Resume identity. */
  readonly resume_id: string
}

/** @brief Cloud drive 来源创建输入 / Cloud-drive source creation input. */
export interface CloudDriveSourceInput {
  /** @brief 固定 cloud-drive 判别值 / Fixed cloud-drive discriminator. */
  readonly source_type: 'cloud_drive'
  /** @brief 服务端 Connection identity / Server-side Connection identity. */
  readonly connection_id: string
  /** @brief provider 内不透明 remote identity / Provider-opaque remote identity. */
  readonly remote_id: string
}

/** @brief KnowledgeSource 创建输入判别联合 / Discriminated union of KnowledgeSource creation inputs. */
export type KnowledgeSourceInput =
  | CloudDriveSourceInput
  | FileSourceInput
  | GitSourceInput
  | ManualSourceInput
  | ResumeSourceInput
  | UrlSourceInput

/** @brief 创建 KnowledgeSource 的严格请求 / Strict request for creating a KnowledgeSource. */
export interface CreateKnowledgeSourceRequest {
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 来源类型对应的创建输入 / Creation input matching the source type. */
  readonly input: KnowledgeSourceInput
  /** @brief 初始完整可见性策略 / Initial complete visibility policy. */
  readonly visibility: KnowledgeVisibilityPolicy
}

/** @brief 至少更新名称的 KnowledgeSource merge patch / KnowledgeSource merge patch updating at least the name. */
interface UpdateKnowledgeSourceNameRequest {
  /** @brief 新名称 / New name. */
  readonly name: string
  /** @brief 可选完整策略替换 / Optional complete policy replacement. */
  readonly visibility?: KnowledgeVisibilityPolicy
}

/** @brief 至少更新策略的 KnowledgeSource merge patch / KnowledgeSource merge patch updating at least the policy. */
interface UpdateKnowledgeSourceVisibilityRequest {
  /** @brief 未同时修改名称时保持省略 / Omitted when the name is not changed simultaneously. */
  readonly name?: never
  /** @brief 完整策略替换 / Complete policy replacement. */
  readonly visibility: KnowledgeVisibilityPolicy
}

/** @brief 非空 KnowledgeSource JSON Merge Patch / Non-empty KnowledgeSource JSON Merge Patch. */
export type UpdateKnowledgeSourceRequest =
  UpdateKnowledgeSourceNameRequest | UpdateKnowledgeSourceVisibilityRequest

/**
 * @brief 拒绝数组中的重复字符串 / Reject duplicate strings in an array.
 * @param values 已解码字符串 / Decoded strings.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertUniqueStrings(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new ApiV2ContractError(`API v2 field ${path} must contain unique items.`)
  }
}

/**
 * @brief 解码有界字符串数组 / Decode an array of bounded strings.
 * @param value 未知数组 / Unknown array.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @param minimumItems 最少条目数 / Minimum item count.
 * @param maximumItems 最大条目数 / Maximum item count.
 * @param maximumLength 单条最大字符数 / Maximum characters per item.
 * @return 已复制字符串数组 / Copied string array.
 */
function boundedStrings(
  value: unknown,
  path: string,
  minimumItems: number,
  maximumItems: number,
  maximumLength: number
): readonly string[] {
  return arrayBetween(value, path, minimumItems, maximumItems).map((item, index) =>
    boundedString(item, `${path}[${index}]`, 0, maximumLength)
  )
}

/**
 * @brief 严格解码 AgentScopeGrant / Strictly decode AgentScopeGrant.
 * @param value 未知 grant / Unknown grant.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 grant / Validated grant.
 */
function parseAgentScopeGrant(value: unknown, path: string): AgentScopeGrant {
  /** @brief 精确 grant 对象 / Exact grant object. */
  const input = exactRecord(value, path, ['agent_scope', 'effect', 'allowed_operations'])
  /** @brief 已验证操作集合 / Validated operation collection. */
  const allowedOperations = arrayBetween(
    input.allowed_operations,
    `${path}.allowed_operations`,
    1,
    5
  ).map((operation, index) =>
    closedStringEnum(operation, `${path}.allowed_operations[${index}]`, [
      'retrieve',
      'quote',
      'summarize',
      'derive',
      'write_back'
    ])
  )
  assertUniqueStrings(allowedOperations, `${path}.allowed_operations`)
  return {
    agent_scope: patternedString(
      input.agent_scope,
      `${path}.agent_scope`,
      3,
      101,
      AGENT_SCOPE_PATTERN
    ),
    allowed_operations: allowedOperations,
    effect: closedStringEnum(input.effect, `${path}.effect`, ['allow', 'deny'])
  }
}

/**
 * @brief 严格解码 KnowledgeVisibilityPolicy / Strictly decode KnowledgeVisibilityPolicy.
 * @param value 未知策略 / Unknown policy.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证完整策略 / Validated complete policy.
 */
export function parseKnowledgeVisibilityPolicy(
  value: unknown,
  path = 'knowledge_visibility'
): KnowledgeVisibilityPolicy {
  /** @brief 精确策略对象 / Exact policy object. */
  const input = exactRecord(value, path, [
    'sensitivity',
    'default_effect',
    'agent_grants',
    'session_override_allowed',
    'allowed_model_regions',
    'allow_external_model_processing',
    'retention_days',
    'policy_version'
  ])
  /** @brief 已验证模型区域 / Validated model regions. */
  const allowedModelRegions = arrayBetween(
    input.allowed_model_regions,
    `${path}.allowed_model_regions`,
    1,
    3
  ).map((region, index) =>
    closedStringEnum(region, `${path}.allowed_model_regions[${index}]`, [
      'cn',
      'global',
      'private_deployment'
    ])
  )
  assertUniqueStrings(allowedModelRegions, `${path}.allowed_model_regions`)
  return {
    agent_grants: arrayBetween(input.agent_grants, `${path}.agent_grants`, 0, 100).map(
      (grant, index) => parseAgentScopeGrant(grant, `${path}.agent_grants[${index}]`)
    ),
    allow_external_model_processing: booleanValue(
      input.allow_external_model_processing,
      `${path}.allow_external_model_processing`
    ),
    allowed_model_regions: allowedModelRegions,
    default_effect: closedStringEnum(input.default_effect, `${path}.default_effect`, [
      'allow',
      'deny'
    ]),
    policy_version: boundedInteger(
      input.policy_version,
      `${path}.policy_version`,
      1,
      Number.MAX_SAFE_INTEGER
    ),
    retention_days:
      input.retention_days === null
        ? null
        : boundedInteger(input.retention_days, `${path}.retention_days`, 1, 3650),
    sensitivity: closedStringEnum(input.sensitivity, `${path}.sensitivity`, [
      'normal',
      'confidential',
      'highly_confidential'
    ]),
    session_override_allowed: booleanValue(
      input.session_override_allowed,
      `${path}.session_override_allowed`
    )
  }
}

/**
 * @brief 严格解码公开来源配置并保留字段三态 / Strictly decode public source configuration while preserving field tri-state.
 * @param value 未知公开配置 / Unknown public configuration.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 无 secret 且无损的公开配置 / Secret-free and lossless public configuration.
 */
export function parsePublicKnowledgeSourceConfig(
  value: unknown,
  path = 'knowledge_source.public_config'
): PublicKnowledgeSourceConfig {
  /** @brief 精确公开配置 / Exact public configuration. */
  const input = exactRecord(value, path, [
    'filename',
    'media_type',
    'url',
    'clone_url',
    'ref',
    'resume_id'
  ])
  /** @brief 按存在性逐项构造的公开配置 / Public configuration constructed property-by-property by presence. */
  const output: {
    filename?: string
    media_type?: string
    url?: string
    clone_url?: string
    ref?: string | null
    resume_id?: string
  } = {}
  if (Object.hasOwn(input, 'filename')) {
    output.filename = boundedString(input.filename, `${path}.filename`, 0, 300)
  }
  if (Object.hasOwn(input, 'media_type')) {
    output.media_type = boundedString(input.media_type, `${path}.media_type`, 0, 200)
  }
  if (Object.hasOwn(input, 'url')) {
    output.url = httpUrl(input.url, `${path}.url`)
  }
  if (Object.hasOwn(input, 'clone_url')) {
    output.clone_url = httpUrl(input.clone_url, `${path}.clone_url`)
  }
  if (Object.hasOwn(input, 'ref')) {
    output.ref = input.ref === null ? null : boundedString(input.ref, `${path}.ref`, 0, 255)
  }
  if (Object.hasOwn(input, 'resume_id')) {
    output.resume_id = opaqueId(input.resume_id, `${path}.resume_id`)
  }
  return output
}

/**
 * @brief 解码嵌入资源的 RFC 9457 ProblemDetails / Decode RFC 9457 ProblemDetails embedded in a resource.
 * @param value 未知 Problem / Unknown Problem.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已严格验证 Problem / Strictly validated Problem.
 */
function parseEmbeddedProblem(value: unknown, path: string): ProblemDetails {
  /** @brief 用于取得声明状态的 Problem 对象 / Problem object used to obtain its declared status. */
  const input = record(value, path)
  /** @brief Problem 声明的 HTTP 状态 / HTTP status declared by the Problem. */
  const status = boundedInteger(input.status, `${path}.status`, 400, 599)
  return parseProblemDetails(value, status)
}

/**
 * @brief 严格解码 KnowledgeIngestionState / Strictly decode KnowledgeIngestionState.
 * @param value 未知摄取状态 / Unknown ingestion state.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证摄取状态 / Validated ingestion state.
 */
function parseKnowledgeIngestionState(value: unknown, path: string): KnowledgeIngestionState {
  /** @brief 精确摄取对象 / Exact ingestion object. */
  const input = exactRecord(value, path, [
    'status',
    'document_count',
    'chunk_count',
    'last_success_at',
    'last_problem'
  ])
  return {
    chunk_count: boundedInteger(
      input.chunk_count,
      `${path}.chunk_count`,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    document_count: boundedInteger(
      input.document_count,
      `${path}.document_count`,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    last_problem:
      input.last_problem === null
        ? null
        : parseEmbeddedProblem(input.last_problem, `${path}.last_problem`),
    last_success_at:
      input.last_success_at === null
        ? null
        : timestamp(input.last_success_at, `${path}.last_success_at`),
    status: closedStringEnum(input.status, `${path}.status`, [
      'not_started',
      'queued',
      'fetching',
      'parsing',
      'chunking',
      'embedding',
      'ready',
      'stale',
      'failed',
      'deleting',
      'deleted'
    ])
  }
}

/**
 * @brief 严格解码 KnowledgeSource / Strictly decode KnowledgeSource.
 * @param value 未知来源表示 / Unknown source representation.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证权威来源 / Validated authoritative source.
 */
export function parseKnowledgeSource(value: unknown, path = 'knowledge_source'): KnowledgeSource {
  /** @brief 精确 KnowledgeSource 对象 / Exact KnowledgeSource object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'name',
    'source_type',
    'enabled',
    'public_config',
    'visibility',
    'ingestion',
    'current_version_id',
    'extensions'
  ])
  /** @brief extensions 以外的必需来源字段 / Required source fields excluding extensions. */
  const fields = {
    ...parseResourceFields(input, path),
    current_version_id:
      input.current_version_id === null
        ? null
        : opaqueId(input.current_version_id, `${path}.current_version_id`),
    enabled: booleanValue(input.enabled, `${path}.enabled`),
    ingestion: parseKnowledgeIngestionState(input.ingestion, `${path}.ingestion`),
    name: boundedString(input.name, `${path}.name`, 1, 300),
    public_config: parsePublicKnowledgeSourceConfig(input.public_config, `${path}.public_config`),
    source_type: closedStringEnum(input.source_type, `${path}.source_type`, [
      'file',
      'url',
      'website',
      'blog_feed',
      'git_repository',
      'manual_note',
      'resume',
      'cloud_drive'
    ]),
    visibility: parseKnowledgeVisibilityPolicy(input.visibility, `${path}.visibility`),
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
  if (!Object.hasOwn(input, 'extensions')) return fields
  return { ...fields, extensions: extensions(input.extensions, `${path}.extensions`) }
}

/**
 * @brief 严格解码 KnowledgeSourceList / Strictly decode KnowledgeSourceList.
 * @param value 未知列表表示 / Unknown list representation.
 * @return 已验证 cursor 页 / Validated cursor page.
 */
export function parseKnowledgeSourceList(value: unknown): CursorCollection<KnowledgeSource> {
  /** @brief 精确列表对象 / Exact list object. */
  const input = exactRecord(value, 'knowledge_source_list', ['items', 'page'])
  return {
    items: arrayBetween(input.items, 'knowledge_source_list.items', 0, 200).map((item, index) =>
      parseKnowledgeSource(item, `knowledge_source_list.items[${index}]`)
    ),
    page: parseCursorPage(input.page, 'knowledge_source_list.page')
  }
}

/**
 * @brief 严格编码 KnowledgeSourceInput 判别联合 / Strictly encode the KnowledgeSourceInput discriminated union.
 * @param value 未验证来源输入 / Unvalidated source input.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 与 canonical Schema 精确一致的新输入 / New input exactly matching the canonical Schema.
 */
export function encodeKnowledgeSourceInput(
  value: KnowledgeSourceInput,
  path = 'create_knowledge_source.input'
): KnowledgeSourceInput {
  /** @brief 用于读取判别值的候选对象 / Candidate object used to read the discriminator. */
  const candidate = record(value, path)
  /** @brief 已验证来源判别值 / Validated source discriminator. */
  const sourceType = closedStringEnum(candidate.source_type, `${path}.source_type`, [
    'file',
    'url',
    'website',
    'blog_feed',
    'git_repository',
    'manual_note',
    'resume',
    'cloud_drive'
  ])
  switch (sourceType) {
    case 'file': {
      /** @brief 精确 file 输入 / Exact file input. */
      const input = exactRecord(value, path, ['source_type', 'upload_session_id'])
      return {
        source_type: sourceType,
        upload_session_id: opaqueId(input.upload_session_id, `${path}.upload_session_id`)
      }
    }
    case 'url':
    case 'website':
    case 'blog_feed': {
      /** @brief 精确网络输入 / Exact network input. */
      const input = exactRecord(value, path, ['source_type', 'url'])
      return { source_type: sourceType, url: httpUrl(input.url, `${path}.url`) }
    }
    case 'git_repository': {
      /** @brief 精确 Git 输入 / Exact Git input. */
      const input = exactRecord(value, path, [
        'source_type',
        'clone_url',
        'ref',
        'include_paths',
        'exclude_paths',
        'connection_id'
      ])
      return {
        clone_url: httpUrl(input.clone_url, `${path}.clone_url`),
        connection_id:
          input.connection_id === null
            ? null
            : opaqueId(input.connection_id, `${path}.connection_id`),
        exclude_paths: boundedStrings(input.exclude_paths, `${path}.exclude_paths`, 0, 100, 1000),
        include_paths: boundedStrings(input.include_paths, `${path}.include_paths`, 0, 100, 1000),
        ref: input.ref === null ? null : boundedString(input.ref, `${path}.ref`, 0, 255),
        source_type: sourceType
      }
    }
    case 'manual_note': {
      /** @brief 精确 manual-note 输入 / Exact manual-note input. */
      const input = exactRecord(value, path, ['source_type', 'content'])
      return {
        content: boundedString(input.content, `${path}.content`, 1, 200_000),
        source_type: sourceType
      }
    }
    case 'resume': {
      /** @brief 精确 Resume 输入 / Exact Resume input. */
      const input = exactRecord(value, path, ['source_type', 'resume_id'])
      return {
        resume_id: opaqueId(input.resume_id, `${path}.resume_id`),
        source_type: sourceType
      }
    }
    case 'cloud_drive': {
      /** @brief 精确 cloud-drive 输入 / Exact cloud-drive input. */
      const input = exactRecord(value, path, ['source_type', 'connection_id', 'remote_id'])
      return {
        connection_id: opaqueId(input.connection_id, `${path}.connection_id`),
        remote_id: boundedString(input.remote_id, `${path}.remote_id`, 1, 2000),
        source_type: sourceType
      }
    }
  }
}

/**
 * @brief 严格编码 CreateKnowledgeSourceRequest / Strictly encode CreateKnowledgeSourceRequest.
 * @param value 未验证创建请求 / Unvalidated creation request.
 * @return 与 canonical Schema 精确一致的新请求 / New request exactly matching the canonical Schema.
 */
export function encodeCreateKnowledgeSourceRequest(
  value: CreateKnowledgeSourceRequest
): CreateKnowledgeSourceRequest {
  /** @brief 精确创建请求 / Exact creation request. */
  const input = exactRecord(value, 'create_knowledge_source', ['name', 'input', 'visibility'])
  return {
    input: encodeKnowledgeSourceInput(
      input.input as KnowledgeSourceInput,
      'create_knowledge_source.input'
    ),
    name: boundedString(input.name, 'create_knowledge_source.name', 1, 300),
    visibility: parseKnowledgeVisibilityPolicy(
      input.visibility,
      'create_knowledge_source.visibility'
    )
  }
}

/**
 * @brief 严格编码非空 UpdateKnowledgeSourceRequest / Strictly encode a non-empty UpdateKnowledgeSourceRequest.
 * @param value 未验证 merge patch / Unvalidated merge patch.
 * @return 仅含 canonical v2 字段且保留省略语义的新 patch / New patch containing only canonical v2 fields while preserving omission.
 */
export function encodeUpdateKnowledgeSourceRequest(
  value: UpdateKnowledgeSourceRequest
): UpdateKnowledgeSourceRequest {
  /** @brief 精确 merge patch / Exact merge patch. */
  const input = exactRecord(value, 'update_knowledge_source', ['name', 'visibility'])
  /** @brief 是否显式携带名称 / Whether the patch explicitly carries a name. */
  const hasName = Object.hasOwn(input, 'name')
  /** @brief 是否显式携带策略 / Whether the patch explicitly carries a policy. */
  const hasVisibility = Object.hasOwn(input, 'visibility')
  if (!hasName && !hasVisibility) {
    throw new ApiV2ContractError(
      'API v2 field update_knowledge_source must contain at least one property.'
    )
  }
  if (hasName && hasVisibility) {
    return {
      name: boundedString(input.name, 'update_knowledge_source.name', 1, 300),
      visibility: parseKnowledgeVisibilityPolicy(
        input.visibility,
        'update_knowledge_source.visibility'
      )
    }
  }
  if (hasName) {
    return { name: boundedString(input.name, 'update_knowledge_source.name', 1, 300) }
  }
  return {
    visibility: parseKnowledgeVisibilityPolicy(
      input.visibility,
      'update_knowledge_source.visibility'
    )
  }
}
