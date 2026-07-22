/** @file 跨限界上下文的只读应用查询与反腐层 / Cross-context read application queries and anti-corruption layer. */

import type { AppGateways } from '../application'
import type {
  UiInterviewReport,
  UiInterviewHistoryItem,
  UiInterviewSessionDetails,
  UiInterviewSessionId,
  UiInterviewSetupModel,
  UiKnowledgeSource,
  UiResumeCard,
  UiWorkspaceId
} from '../published-language'
import type { WorkspaceSession } from './session/workspace-session'

/** @brief 当前 Workspace 会话返回的已选 Workspace / Selected Workspace returned by the current session. */
type CurrentWorkspace = NonNullable<Awaited<ReturnType<WorkspaceSession['getCurrentWorkspace']>>>

/** @brief 首页资源更新类别 / Workspace-home resource-update kind. */
export type WorkspaceRecentUpdateKind = 'resume' | 'interview' | 'knowledge'

/**
 * @brief 首页近期资源更新投影 / Recent resource-update projection for the home page.
 * @note 这是应用层从各上下文正式资源时间戳派生的读模型，不是服务端事件或审计记录。 / This is an application read model derived from formal resource timestamps across contexts, not a server event or audit record.
 */
export interface WorkspaceRecentUpdate {
  /** @brief 更新的稳定 UI 标识符 / Stable UI update identifier. */
  readonly id: string
  /** @brief 资源更新类别 / Resource-update kind. */
  readonly kind: WorkspaceRecentUpdateKind
  /** @brief 可选资源名称 / Optional resource name. */
  readonly subject: string | null
  /** @brief 资源更新时间 / Resource update time. */
  readonly updatedAt: string
}

/** @brief 跨上下文聚合的 Workspace 首页读模型 / Cross-context Workspace-home read model. */
export interface WorkspaceHomeModel {
  /** @brief 当前 Workspace / Current Workspace. */
  readonly workspace: CurrentWorkspace
  /** @brief Resume 数量 / Resume count. */
  readonly resumeCount: number
  /** @brief 就绪 KnowledgeSource 数量 / Ready KnowledgeSource count. */
  readonly readyKnowledgeSourceCount: number
  /** @brief 已完成 Interview 数量 / Completed Interview count. */
  readonly completedInterviewCount: number
  /** @brief 近期资源更新 / Recent resource updates. */
  readonly recentUpdates: readonly WorkspaceRecentUpdate[]
}

/** @brief Workspace 首页所需的跨上下文只读投影 / Cross-context read projection required by the Workspace home page. */
export interface WorkspaceHomeQueryResult {
  /** @brief 应用层跨上下文首页读模型 / Application-level cross-context home read model. */
  readonly home: WorkspaceHomeModel
  /** @brief 最近完成的 Interview / Most recently completed Interview. */
  readonly recentInterview: UiInterviewHistoryItem | null
  /** @brief 最近更新的 Resume 卡片 / Most recently updated Resume card. */
  readonly resumeCard: UiResumeCard | null
}

/** @brief Interview 配置页所需的跨上下文只读投影 / Cross-context read projection required by Interview setup. */
export interface InterviewSetupQueryResult {
  /** @brief 当前工作区 ID / Current workspace ID. */
  readonly workspaceId: UiWorkspaceId
  /** @brief Interview 自有配置模型 / Interview-owned setup model. */
  readonly setup: UiInterviewSetupModel
  /** @brief Knowledge 发布给 Interview 的来源投影 / Knowledge source projections published to Interview. */
  readonly knowledgeSources: readonly UiKnowledgeSource[]
}

/** @brief Interview 总结页所需的跨上下文只读投影 / Cross-context read projection required by Interview summary. */
export interface InterviewSummaryQueryResult {
  /** @brief Interview 自有报告 / Interview-owned report. */
  readonly report: UiInterviewReport
  /** @brief 可由 REST 权威资源还原的会话详情 / Session details reconstructed from authoritative REST resources. */
  readonly details: UiInterviewSessionDetails
  /** @brief Knowledge 发布给 Interview 的来源投影 / Knowledge source projections published to Interview. */
  readonly knowledgeSources: readonly UiKnowledgeSource[]
}

/** @brief Workspace 首页应用查询 / Workspace-home application query. */
export interface WorkspaceHomeQuery {
  /** @brief 加载聚合后的首页投影 / Load the aggregated home projection. */
  readonly load: () => Promise<WorkspaceHomeQueryResult>
}

/** @brief Interview 配置应用查询 / Interview-setup application query. */
export interface InterviewSetupQuery {
  /** @brief 加载配置与可选知识来源 / Load setup and selectable knowledge sources. */
  readonly load: () => Promise<InterviewSetupQueryResult>
}

/** @brief Interview 总结应用查询 / Interview-summary application query. */
export interface InterviewSummaryQuery {
  /**
   * @brief 加载总结与本次会话资料投影 / Load a summary and its session-material projection.
   * @param sessionId Interview 会话 ID / Interview session ID.
   * @return 聚合后的总结投影 / Aggregated summary projection.
   */
  readonly load: (sessionId: UiInterviewSessionId) => Promise<InterviewSummaryQueryResult>
}

/** @brief 仅向页面暴露的命名应用查询集合 / Named application queries exposed to pages. */
export interface AppQueries {
  /** @brief Workspace 首页查询 / Workspace-home query. */
  readonly workspaceHome: WorkspaceHomeQuery
  /** @brief Interview 配置查询 / Interview-setup query. */
  readonly interviewSetup: InterviewSetupQuery
  /** @brief Interview 总结查询 / Interview-summary query. */
  readonly interviewSummary: InterviewSummaryQuery
}

/** @brief Interview 历史端口的已解析列表类型 / Resolved list type of the Interview-history port. */
type InterviewHistory = Awaited<ReturnType<AppGateways['interview']['listCompletedInterviews']>>

/**
 * @brief 构造 Workspace 首页跨上下文读模型 / Build the cross-context Workspace-home read model.
 * @param workspace 当前 Workspace / Current Workspace.
 * @param resumeCards Resume 卡片 / Resume cards.
 * @param interviewHistory 已完成 Interview / Completed Interviews.
 * @param knowledgeSources KnowledgeSource 列表 / KnowledgeSource list.
 * @return 聚合后的首页模型 / Aggregated home model.
 */
function createWorkspaceHomeModel(
  workspace: CurrentWorkspace,
  resumeCards: readonly UiResumeCard[],
  interviewHistory: InterviewHistory,
  knowledgeSources: readonly UiKnowledgeSource[]
): WorkspaceHomeModel {
  /** @brief 已就绪 KnowledgeSource / Ready KnowledgeSources. */
  const readyKnowledgeSources = knowledgeSources.filter(
    (source) => source.ingestionStatus === 'ready'
  )
  /** @brief Resume 更新投影 / Resume update projections. */
  const resumeUpdates: readonly WorkspaceRecentUpdate[] = resumeCards.map((resume) => ({
    id: `resume:${resume.id}:${resume.updatedAt}`,
    kind: 'resume',
    subject: resume.title,
    updatedAt: resume.updatedAt
  }))
  /** @brief KnowledgeSource 更新投影 / KnowledgeSource update projections. */
  const knowledgeUpdates: readonly WorkspaceRecentUpdate[] = readyKnowledgeSources.map(
    (source) => ({
      id: `knowledge:${source.id}:${source.lastSuccessAt ?? source.updatedAt}`,
      kind: 'knowledge',
      subject: source.name,
      updatedAt: source.lastSuccessAt ?? source.updatedAt
    })
  )
  /** @brief Interview 更新投影 / Interview update projections. */
  const interviewUpdates: readonly WorkspaceRecentUpdate[] = interviewHistory.map((interview) => ({
    id: `interview:${interview.sessionId}:${interview.completedAt}`,
    kind: 'interview',
    subject: null,
    updatedAt: interview.completedAt
  }))
  /** @brief 按时间倒序的近期更新 / Recent updates sorted newest first. */
  const recentUpdates = [...resumeUpdates, ...knowledgeUpdates, ...interviewUpdates]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8)

  return {
    completedInterviewCount: interviewHistory.length,
    readyKnowledgeSourceCount: readyKnowledgeSources.length,
    recentUpdates,
    resumeCount: resumeCards.length,
    workspace
  }
}

/**
 * @brief 创建跨上下文只读应用查询 / Create cross-context read application queries.
 * @param gateways 各限界上下文公开的应用端口 / Application ports published by each bounded context.
 * @param workspaceSession 当前工作区会话 / Current-workspace session.
 * @return 隔离页面与跨上下文 gateway 编排的命名查询 / Named queries isolating pages from cross-context gateway orchestration.
 */
export function createAppQueries(
  gateways: AppGateways,
  workspaceSession: WorkspaceSession
): AppQueries {
  /** @brief Workspace 首页聚合查询 / Workspace-home aggregate query. */
  const workspaceHome: WorkspaceHomeQuery = {
    async load(): Promise<WorkspaceHomeQueryResult> {
      /** @brief 当前工作区 / Current workspace. */
      const currentWorkspace = await workspaceSession.getCurrentWorkspace()
      if (currentWorkspace === undefined) {
        throw new Error('No workspace is available for the current user.')
      }

      const [interviewHistory, resumeCards, knowledgeSources] = await Promise.all([
        gateways.interview.listCompletedInterviews(currentWorkspace.id),
        gateways.resume.listResumeCards(currentWorkspace.id),
        gateways.knowledge.listKnowledgeSources(currentWorkspace.id)
      ])
      /** @brief 跨上下文聚合的首页模型 / Cross-context aggregated home model. */
      const home = createWorkspaceHomeModel(
        currentWorkspace,
        resumeCards,
        interviewHistory,
        knowledgeSources
      )
      /** @brief 最近更新的 Resume 卡片 / Most recently updated Resume card. */
      const resumeCard =
        [...resumeCards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
        null
      /** @brief 最近完成的 Interview / Most recently completed Interview. */
      const recentInterview = [...interviewHistory].sort((left, right) =>
        right.completedAt.localeCompare(left.completedAt)
      )[0]

      return { home, recentInterview: recentInterview ?? null, resumeCard }
    }
  }

  /** @brief Interview 配置聚合查询 / Interview-setup aggregate query. */
  const interviewSetup: InterviewSetupQuery = {
    async load(): Promise<InterviewSetupQueryResult> {
      /** @brief 当前工作区 / Current workspace. */
      const currentWorkspace = await workspaceSession.getCurrentWorkspace()
      if (currentWorkspace === undefined) {
        throw new Error('No workspace is available for interview setup.')
      }

      const [setup, knowledgeSources] = await Promise.all([
        gateways.interview.getInterviewSetup(currentWorkspace.id),
        gateways.knowledge.listKnowledgeSources(currentWorkspace.id)
      ])
      return { knowledgeSources, setup, workspaceId: currentWorkspace.id }
    }
  }

  /** @brief Interview 总结聚合查询 / Interview-summary aggregate query. */
  const interviewSummary: InterviewSummaryQuery = {
    async load(sessionId): Promise<InterviewSummaryQueryResult> {
      const { details, report } = await gateways.interview.getInterviewSummary(sessionId)
      /** @brief 本次会话可用的 Knowledge 来源投影 / Knowledge source projections available to this session. */
      const knowledgeSources = await gateways.knowledge.listKnowledgeSources(
        details.session.workspaceId
      )
      return { details, knowledgeSources, report }
    }
  }

  return { interviewSetup, interviewSummary, workspaceHome }
}
