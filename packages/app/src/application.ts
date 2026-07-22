/** @file 应用组合端口 / Application composition ports. */

import type { InterviewGateway } from './contexts/interview/application/gateway'
import type { IdentityGateway } from './contexts/identity/application/gateway'
import type { KnowledgeGateway } from './contexts/knowledge/application/gateway'
import type { ResumeGateway } from './contexts/resume/application/gateway'
import type { WorkspaceGateway } from './contexts/workspace/application/gateway'

export { createUiCommandId } from './shared-kernel/command'
export type { UiCommandId } from './shared-kernel/command'

/** @brief 产品应用依赖的上下文端口集合 / Context ports required by the product application. */
export interface AppGateways {
  /** @brief Identity 端口 / Identity port. */
  readonly identity: IdentityGateway
  /** @brief Workspace Experience 端口 / Workspace Experience port. */
  readonly workspace: WorkspaceGateway
  /** @brief Resume Authoring 端口 / Resume Authoring port. */
  readonly resume: ResumeGateway
  /** @brief Interview Practice 端口 / Interview Practice port. */
  readonly interview: InterviewGateway
  /** @brief Knowledge 端口 / Knowledge port. */
  readonly knowledge: KnowledgeGateway
}
