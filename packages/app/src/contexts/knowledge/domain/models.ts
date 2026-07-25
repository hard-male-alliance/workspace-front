/** @file KnowledgeSource 权威领域模型 / Authoritative KnowledgeSource domain models. */

import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type {
  UiKnowledgeSourceId,
  UiOpaqueId,
  UiWorkspaceId
} from '../../../shared-kernel/identity'
import type { UiJsonObject } from '../../../shared-kernel/json'

/** @brief KnowledgeSource cursor 的名义类型 / Nominal KnowledgeSource cursor. */
export type UiKnowledgeSourceCursor = UiOpaqueId<'knowledge-source-cursor'>

/** @brief KnowledgeSourceVersion identity / KnowledgeSourceVersion identity. */
export type UiKnowledgeSourceVersionId = UiOpaqueId<'knowledge-source-version'>

/** @brief 单页 KnowledgeSource 的 API v2 上限 / API v2 ceiling for one KnowledgeSource page. */
export const UI_KNOWLEDGE_SOURCE_PAGE_LIMIT_MAX = 200

/** @brief 经契约边界约束的 KnowledgeSource 页大小 / Contract-bounded KnowledgeSource page size. */
export type UiKnowledgeSourcePageLimit = number & {
  /** @brief 页大小品牌 / Page-limit brand. */
  readonly __uiKnowledgeSourcePageLimitBrand: 'knowledge-source-page-limit'
}

/**
 * @brief 将服务端 cursor 提升为 KnowledgeSource cursor / Refine a server cursor into a KnowledgeSource cursor.
 * @param value 服务端签发的不透明 cursor / Opaque cursor issued by the service.
 * @return 绑定 KnowledgeSource 集合的 cursor / Cursor bound to the KnowledgeSource collection.
 */
export function asUiKnowledgeSourceCursor(value: string): UiKnowledgeSourceCursor {
  if ([...value].length < 1 || [...value].length > 2048) {
    throw new TypeError('A KnowledgeSource cursor must contain between 1 and 2048 characters.')
  }
  return value as UiKnowledgeSourceCursor
}

/**
 * @brief 构造受 API v2 约束的页大小 / Construct a page limit constrained by API v2.
 * @param value 候选页大小 / Candidate page limit.
 * @return 1 至 200 的名义页大小 / Nominal page limit from 1 through 200.
 */
export function asUiKnowledgeSourcePageLimit(value: number): UiKnowledgeSourcePageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_KNOWLEDGE_SOURCE_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `KnowledgeSource page limit must be an integer from 1 to ${UI_KNOWLEDGE_SOURCE_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiKnowledgeSourcePageLimit
}

/** @brief Knowledge 来源类型 / Knowledge-source type. */
export type UiKnowledgeSourceType =
  | 'blog_feed'
  | 'cloud_drive'
  | 'file'
  | 'git_repository'
  | 'manual_note'
  | 'resume'
  | 'url'
  | 'website'

/**
 * @brief 开放但格式稳定的 Agent scope / Open but format-stable Agent scope.
 * @note 可用 scope 的目录属于 Agent 能力，不由 KnowledgeSource 策略臆造 / The catalog of available scopes belongs to Agent capabilities and is never invented from a KnowledgeSource policy.
 */
export type UiKnowledgeAgentScope = string

/** @brief Knowledge 摄取状态机 / Knowledge-ingestion state machine. */
export type UiKnowledgeIngestionStatus =
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

/** @brief 可见性策略效果 / Visibility-policy effect. */
export type UiVisibilityEffect = 'allow' | 'deny'

/** @brief Knowledge 敏感等级 / Knowledge sensitivity level. */
export type UiKnowledgeSensitivity = 'confidential' | 'highly_confidential' | 'normal'

/** @brief Knowledge 策略可授权的操作 / Operations grantable by a Knowledge policy. */
export type UiKnowledgeOperation = 'derive' | 'quote' | 'retrieve' | 'summarize' | 'write_back'

/** @brief 模型处理允许的数据区域 / Data regions permitted for model processing. */
export type UiKnowledgeModelRegion = 'cn' | 'global' | 'private_deployment'

/** @brief Agent scope 的显式授权 / Explicit grant for one Agent scope. */
export interface UiAgentScopeGrant {
  /** @brief 开放枚举中的稳定 Agent scope code / Stable Agent-scope code from the open enum. */
  readonly agentScope: UiKnowledgeAgentScope
  /** @brief 明确允许或拒绝 / Explicit allow or deny effect. */
  readonly effect: UiVisibilityEffect
  /** @brief 至少一个且不重复的授权操作 / At least one unique granted operation. */
  readonly allowedOperations: readonly UiKnowledgeOperation[]
}

/**
 * @brief 完整 KnowledgeVisibilityPolicy / Complete KnowledgeVisibilityPolicy.
 * @note 这是服务端策略事实，不代表任何 Agent 的 effective access / This is a server policy fact and does not represent any Agent's effective access.
 */
export interface UiKnowledgeVisibilityPolicy {
  /** @brief 敏感等级 / Sensitivity level. */
  readonly sensitivity: UiKnowledgeSensitivity
  /** @brief 未匹配 grant 时的效果 / Effect when no grant matches. */
  readonly defaultEffect: UiVisibilityEffect
  /** @brief Agent scope 规则 / Agent-scope rules. */
  readonly agentGrants: readonly UiAgentScopeGrant[]
  /** @brief 是否允许 session 级覆盖 / Whether session-level overrides are allowed. */
  readonly sessionOverrideAllowed: boolean
  /** @brief 允许模型处理的数据区域 / Regions permitted for model processing. */
  readonly allowedModelRegions: readonly UiKnowledgeModelRegion[]
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allowExternalModelProcessing: boolean
  /** @brief 保留天数；null 表示未设置固定期限 / Retention days, or null without a fixed period. */
  readonly retentionDays: number | null
  /** @brief 策略领域版本 / Policy domain version. */
  readonly policyVersion: number
}

/**
 * @brief 不含 secret 的公开来源配置 / Secret-free public source configuration.
 * @note `ref` 保留 absent、null、value 三态 / `ref` preserves absent, null, and value as distinct states.
 */
export interface UiPublicKnowledgeSourceConfig {
  /** @brief 原文件名 / Original filename. */
  readonly filename?: string
  /** @brief 原媒体类型 / Original media type. */
  readonly mediaType?: string
  /** @brief 公开 HTTP(S) 来源 / Public HTTP(S) source. */
  readonly url?: string
  /** @brief 公开 Git clone URL / Public Git clone URL. */
  readonly cloneUrl?: string
  /** @brief Git ref 三态 / Tri-state Git ref. */
  readonly ref?: string | null
  /** @brief 关联 Resume identity / Related Resume identity. */
  readonly resumeId?: UiOpaqueId<'resume'>
}

/** @brief Problem 字段错误的低敏感结构 / Low-sensitivity structured Problem field error. */
export interface UiKnowledgeProblemFieldError {
  /** @brief JSON Pointer 或协议路径 / JSON Pointer or protocol path. */
  readonly pointer: string
  /** @brief 稳定字段错误 code / Stable field-error code. */
  readonly code: string
  /** @brief 可选本地化消息 key / Optional localization-message key. */
  readonly messageKey: string | null
  /** @brief 可选低敏感插值参数 / Optional low-sensitivity interpolation parameters. */
  readonly params: Readonly<Record<string, string | number | boolean | null>> | null
}

/** @brief 最近一次摄取失败的完整 RFC 9457 投影 / Complete RFC 9457 projection for the last ingestion failure. */
export interface UiKnowledgeProblem {
  /** @brief 可文档化 Problem 类型 / Documentable Problem type. */
  readonly type: string
  /** @brief 人类诊断标题；不得用于分支 / Human diagnostic title; never used for branching. */
  readonly title: string
  /** @brief HTTP 状态 / HTTP status. */
  readonly status: number
  /** @brief 稳定机器 code / Stable machine code. */
  readonly code: string
  /** @brief 请求关联 identity / Request-correlation identity. */
  readonly requestId: UiOpaqueId<'request'>
  /** @brief 服务端声明的可重试性 / Retryability declared by the service. */
  readonly retryable: boolean
  /** @brief 结构化字段错误 / Structured field errors. */
  readonly errors: readonly UiKnowledgeProblemFieldError[]
  /** @brief 可选人类诊断详情 / Optional human diagnostic detail. */
  readonly detail: string | null
  /** @brief 可选 Problem instance / Optional Problem instance. */
  readonly instance: string | null
  /** @brief 可选 namespaced extensions / Optional namespaced extensions. */
  readonly extensions: UiJsonObject | null
}

/** @brief Knowledge 当前摄取投影 / Current Knowledge-ingestion projection. */
export interface UiKnowledgeIngestionState {
  /** @brief 摄取状态 / Ingestion status. */
  readonly status: UiKnowledgeIngestionStatus
  /** @brief 已摄取文档数 / Number of ingested documents. */
  readonly documentCount: number
  /** @brief 已构建 chunk 数 / Number of constructed chunks. */
  readonly chunkCount: number
  /** @brief 最近成功时间 / Last successful time. */
  readonly lastSuccessAt: string | null
  /** @brief 最近结构化问题 / Last structured problem. */
  readonly lastProblem: UiKnowledgeProblem | null
}

/** @brief API v2 KnowledgeSource 的无损领域表示 / Lossless domain representation of an API v2 KnowledgeSource. */
export interface UiKnowledgeSource {
  /** @brief 来源 identity / Source identity. */
  readonly id: UiKnowledgeSourceId
  /** @brief 所属 Workspace / Owning Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 领域 revision / Domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updatedAt: string
  /** @brief 用户可见名称 / User-visible name. */
  readonly name: string
  /** @brief 来源类型 / Source type. */
  readonly sourceType: UiKnowledgeSourceType
  /** @brief 是否参与检索 / Whether the source participates in retrieval. */
  readonly enabled: boolean
  /** @brief 不含 secret 的公开配置 / Secret-free public configuration. */
  readonly publicConfig: UiPublicKnowledgeSourceConfig
  /** @brief 完整可见性与处理策略 / Complete visibility and processing policy. */
  readonly visibility: UiKnowledgeVisibilityPolicy
  /** @brief 当前摄取投影 / Current ingestion projection. */
  readonly ingestion: UiKnowledgeIngestionState
  /** @brief 当前完成版本 / Current completed version. */
  readonly currentVersionId: UiKnowledgeSourceVersionId | null
  /** @brief 可选 namespaced extensions / Optional namespaced extensions. */
  readonly extensions?: UiJsonObject
}

/**
 * @brief 带强 ETag 的 KnowledgeSource 权威 / KnowledgeSource authority carrying a strong ETag.
 * @note `concurrencyToken` 只能与同一表示原子保存并原样用于 If-Match / The concurrency token must stay paired with the same representation and be replayed verbatim as If-Match.
 */
export interface UiKnowledgeSourceAuthority {
  /** @brief 权威来源表示 / Authoritative source representation. */
  readonly source: UiKnowledgeSource
  /** @brief 与表示原子配对的强 ETag / Strong ETag atomically paired with the representation. */
  readonly concurrencyToken: UiConcurrencyToken
}

/** @brief Workspace-scoped KnowledgeSource cursor 页 / Workspace-scoped KnowledgeSource cursor page. */
export type UiKnowledgeSourcePage =
  | {
      /** @brief 当前页来源 / Current-page sources. */
      readonly items: readonly UiKnowledgeSource[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页 cursor / Cursor for the next page. */
      readonly nextCursor: UiKnowledgeSourceCursor
    }
  | {
      /** @brief 当前页来源 / Current-page sources. */
      readonly items: readonly UiKnowledgeSource[]
      /** @brief 已到末页 / Whether the terminal page was reached. */
      readonly hasMore: false
      /** @brief 末页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }
