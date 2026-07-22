/** @file knowledge 限界上下文公共入口 / knowledge bounded-context public entry. */

export type { UiKnowledgeSourceId } from '../../shared-kernel/identity'
export type {
  UiKnowledgeSourceType,
  UiKnowledgeIngestionStatus,
  UiVisibilityEffect,
  UiKnowledgeSensitivity,
  UiKnowledgeOperation,
  UiAgentScopeGrant,
  UiKnowledgeVisibilityPolicy,
  UiKnowledgeSource,
  UiKnowledgeVisibilityModel
} from './domain/models'
export type { KnowledgeGateway } from './application/gateway'
export { KnowledgePage } from './presentation/KnowledgePage'
export { KnowledgeVisibilityPage } from './presentation/KnowledgeVisibilityPage'
