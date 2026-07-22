/** @file 跨限界上下文查询使用的已发布只读语言 / Published read-only language used by cross-context queries. */

export type {
  UiInterviewReport,
  UiInterviewSessionDetails,
  UiInterviewSessionId,
  UiInterviewSetupModel
} from './contexts/interview/domain/models'
export type { UiKnowledgeSource } from './contexts/knowledge/domain/models'
export type { UiResumeSummary } from './contexts/resume/domain/models'
export type { UiCurrentUser } from './contexts/identity/domain/models'
export type { UiWorkspaceId } from './shared-kernel/identity'
