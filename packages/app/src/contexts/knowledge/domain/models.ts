/** @file Knowledge 领域投影 / Knowledge domain projections. */

import type { UiAgentScope } from '../../../shared-kernel/agent-scope'
import type { UiKnowledgeSourceId, UiWorkspaceId } from '../../../shared-kernel/identity'

/** @brief 知识来源类型 / Knowledge-source type. */
export type UiKnowledgeSourceType =
  | 'resume'
  | 'file'
  | 'url'
  | 'website'
  | 'blog_feed'
  | 'git_repository'
  | 'manual_note'
  | 'cloud_drive'

/** @brief 知识摄取状态 / Knowledge-ingestion status. */
export type UiKnowledgeIngestionStatus =
  | 'not_started'
  | 'queued'
  | 'fetching'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'stale'
  | 'failed'
  | 'deleted'

/** @brief 可见性策略效果 / Visibility-policy effect. */
export type UiVisibilityEffect = 'allow' | 'deny'

/** @brief 知识可见性敏感度 / Knowledge-visibility sensitivity. */
export type UiKnowledgeSensitivity = 'normal' | 'confidential' | 'highly_confidential'

/** @brief Agent 允许的知识操作 / Knowledge operations permitted to an agent. */
export type UiKnowledgeOperation = 'retrieve' | 'quote' | 'summarize' | 'derive' | 'write_back'

/** @brief Agent 作用域授权 / Agent-scope grant. */
export interface UiAgentScopeGrant {
  /** @brief Agent 作用域 / Agent scope. */
  readonly agentScope: UiAgentScope
  /** @brief 允许或拒绝 / Allow or deny effect. */
  readonly effect: UiVisibilityEffect
  /** @brief 获准操作 / Granted operations. */
  readonly allowedOperations: readonly UiKnowledgeOperation[]
}

/**
 * @brief 知识可见性策略展示模型 / Knowledge-visibility policy display model.
 * @note 语义遵从 KnowledgeVisibilityPolicy；默认拒绝仍由后端做最终 EffectiveAccess 判定。
 */
export interface UiKnowledgeVisibilityPolicy {
  /** @brief 策略版本 / Policy version. */
  readonly policyVersion: number
  /** @brief 默认效果 / Default effect. */
  readonly defaultEffect: UiVisibilityEffect
  /** @brief 敏感度 / Sensitivity. */
  readonly sensitivity: UiKnowledgeSensitivity
  /** @brief 按 Agent 作用域授权 / Grants by agent scope. */
  readonly agentGrants: readonly UiAgentScopeGrant[]
  /** @brief 是否允许会话级覆盖 / Whether session overrides are allowed. */
  readonly sessionOverrideAllowed: boolean
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allowExternalModelProcessing: boolean
  /** @brief 被允许的模型数据区域 / Allowed model-data regions. */
  readonly allowedModelRegions: readonly ('cn' | 'global' | 'private_deployment')[]
  /** @brief 保留期限（天）/ Retention period in days. */
  readonly retentionDays: number | null
}

/** @brief 知识来源展示模型 / Knowledge-source display model. */
export interface UiKnowledgeSource {
  /** @brief 来源 ID / Source ID. */
  readonly id: UiKnowledgeSourceId
  /** @brief 所属工作区 ID / Owning workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 来源名称 / Source name. */
  readonly name: string
  /** @brief 来源类型 / Source type. */
  readonly sourceType: UiKnowledgeSourceType
  /** @brief 可展示的来源出处 / Displayable source origin. */
  readonly originLabel: string
  /** @brief 摄取状态 / Ingestion status. */
  readonly ingestionStatus: UiKnowledgeIngestionStatus
  /** @brief 文档数 / Document count. */
  readonly documentCount: number
  /** @brief chunk 数 / Chunk count. */
  readonly chunkCount: number
  /** @brief 是否启用 / Whether enabled. */
  readonly enabled: boolean
  /** @brief 可见性策略 / Visibility policy. */
  readonly visibility: UiKnowledgeVisibilityPolicy
  /** @brief 最近成功索引时间 / Last successful indexing time. */
  readonly lastSuccessAt: string | null
  /** @brief 最近更新时间 / Last update time. */
  readonly updatedAt: string
}

/** @brief 知识可见性页面模型 / Knowledge-visibility page model. */
export interface UiKnowledgeVisibilityModel {
  /** @brief 目标知识来源 / Target knowledge source. */
  readonly source: UiKnowledgeSource
  /** @brief 可配置的 Agent 作用域 / Configurable agent scopes. */
  readonly availableAgentScopes: readonly UiAgentScope[]
}
