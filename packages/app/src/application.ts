/** @file 应用组合端口 / Application composition ports. */

import type { InterviewGateway, KnowledgeGateway, ResumeGateway, WorkspaceGateway } from './domain'

/** @brief 产品应用依赖的上下文端口集合 / Context ports required by the product application. */
export interface AppGateways {
  /** @brief Workspace Experience 端口 / Workspace Experience port. */
  readonly workspace: WorkspaceGateway
  /** @brief Resume Authoring 端口 / Resume Authoring port. */
  readonly resume: ResumeGateway
  /** @brief Interview Practice 端口 / Interview Practice port. */
  readonly interview: InterviewGateway
  /** @brief Knowledge 端口 / Knowledge port. */
  readonly knowledge: KnowledgeGateway
}
