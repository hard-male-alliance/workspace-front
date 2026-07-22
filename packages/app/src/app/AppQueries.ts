/** @file 跨限界上下文的只读应用查询与反腐层 / Cross-context read application queries and anti-corruption layer. */

import type { AppGateways } from '../application'
import type {
  UiInterviewReport,
  UiInterviewSessionDetails,
  UiInterviewSessionId,
  UiInterviewSetupModel,
  UiKnowledgeSource,
  UiResumeSummary,
  UiWorkspaceId
} from '../published-language'
import type { WorkspaceSession } from './session/workspace-session'

/** @brief 当前 Workspace 会话返回的已选访问权威 / Selected access authority returned by the current session. */
type CurrentWorkspaceAccess = NonNullable<
  Awaited<ReturnType<WorkspaceSession['getAccess']>>['currentWorkspaceAccess']
>

/** @brief 首页一次读取采用 API v2 集合上限 / A home-page read uses the API v2 collection maximum. */
const HOME_RESUME_PAGE_LIMIT = 200 as Parameters<
  AppGateways['resume']['listResumeSummariesPage']
>[0]['limit']

/**
 * @brief 首页近期 Resume 更新投影 / Recent Resume-update projection for the home page.
 * @note 这是从正式 ResumeSummary 时间戳派生的读模型，不是服务端事件或审计记录。 / This read model is derived from formal ResumeSummary timestamps, not a server event or audit record.
 */
export interface WorkspaceRecentUpdate {
  /** @brief 更新的稳定 UI 标识符 / Stable UI update identifier. */
  readonly id: string
  /** @brief Resume 标题 / Resume title. */
  readonly title: string
  /** @brief 资源更新时间 / Resource update time. */
  readonly updatedAt: string
}

/** @brief 跨上下文聚合的 Workspace 首页读模型 / Cross-context Workspace-home read model. */
export interface WorkspaceHomeModel {
  /** @brief 当前 WorkspaceAccess 权威 / Current WorkspaceAccess authority. */
  readonly workspaceAccess: CurrentWorkspaceAccess
  /** @brief 首页可证明的 Resume 数量 / Resume count provable from the first page. */
  readonly resumeCount:
    | { readonly certainty: 'exact'; readonly value: number }
    | { readonly certainty: 'lower-bound'; readonly value: number }
  /** @brief 近期 Resume 更新 / Recent Resume updates. */
  readonly recentUpdates: readonly WorkspaceRecentUpdate[]
}

/** @brief Workspace 首页所需的跨上下文只读投影 / Cross-context read projection required by the Workspace home page. */
export interface WorkspaceHomeQueryResult {
  /** @brief 应用层跨上下文首页读模型 / Application-level cross-context home read model. */
  readonly home: WorkspaceHomeModel
  /** @brief 当前已加载页中最近更新的 Resume 摘要 / Most recently updated Resume summary in the loaded page. */
  readonly resumeSummary: UiResumeSummary | null
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
  /**
   * @brief 加载聚合后的首页投影 / Load the aggregated home projection.
   * @param signal 页面资源身份拥有的取消信号 / Cancellation signal owned by the page-resource identity.
   * @return 聚合后的首页投影 / Aggregated home projection.
   */
  readonly load: (signal: AbortSignal) => Promise<WorkspaceHomeQueryResult>
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

/**
 * @brief 构造仅依赖已接通 v2 能力的 Workspace 首页读模型 / Build the Workspace-home read model from connected v2 capabilities only.
 * @param workspaceAccess 当前 WorkspaceAccess 权威 / Current WorkspaceAccess authority.
 * @param resumeSummaries 首页加载的 ResumeSummary / Resume summaries loaded for the home page.
 * @param hasMoreResumes 是否还有未加载 Resume / Whether more Resume resources remain unloaded.
 * @return 聚合后的首页模型 / Aggregated home model.
 */
function createWorkspaceHomeModel(
  workspaceAccess: CurrentWorkspaceAccess,
  resumeSummaries: readonly UiResumeSummary[],
  hasMoreResumes: boolean
): WorkspaceHomeModel {
  /** @brief Resume 更新投影 / Resume update projections. */
  const resumeUpdates: readonly WorkspaceRecentUpdate[] = resumeSummaries.map((resume) => ({
    id: `resume:${resume.id}:${resume.updatedAt}`,
    title: resume.title,
    updatedAt: resume.updatedAt
  }))
  /** @brief 按时间倒序的近期更新 / Recent updates sorted newest first. */
  const recentUpdates = [...resumeUpdates]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8)

  return {
    recentUpdates,
    resumeCount: hasMoreResumes
      ? { certainty: 'lower-bound', value: resumeSummaries.length }
      : { certainty: 'exact', value: resumeSummaries.length },
    workspaceAccess
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
    async load(signal): Promise<WorkspaceHomeQueryResult> {
      /** @brief 当前会话访问权威 / Current session-access authority. */
      const sessionAccess = await workspaceSession.getAccess()
      signal.throwIfAborted()
      /** @brief 当前显式选择的 WorkspaceAccess / Explicitly selected current WorkspaceAccess. */
      const currentWorkspaceAccess = sessionAccess.currentWorkspaceAccess
      if (currentWorkspaceAccess === undefined) {
        throw new Error('No workspace is available for the current user.')
      }

      /** @brief 当前授权路径中的 Workspace ID / Workspace ID in the current authorization path. */
      const workspaceId = currentWorkspaceAccess.workspace.id
      /** @brief 当前已接通 v2 能力返回的 ResumeSummary 首页 / First ResumeSummary page from the connected v2 capability. */
      const resumePage = await gateways.resume.listResumeSummariesPage({
        cursor: null,
        limit: HOME_RESUME_PAGE_LIMIT,
        signal,
        workspaceId
      })
      signal.throwIfAborted()
      /** @brief 仅由可用 v2 能力构造的首页模型 / Home model built only from available v2 capabilities. */
      const home = createWorkspaceHomeModel(
        currentWorkspaceAccess,
        resumePage.items,
        resumePage.hasMore
      )
      /** @brief 当前页最近更新的 Resume 摘要 / Most recently updated Resume summary in the current page. */
      const resumeSummary =
        [...resumePage.items].sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt)
        )[0] ?? null
      return { home, resumeSummary }
    }
  }

  /** @brief Interview 配置聚合查询 / Interview-setup aggregate query. */
  const interviewSetup: InterviewSetupQuery = {
    async load(): Promise<InterviewSetupQueryResult> {
      /** @brief 当前显式选择的 WorkspaceAccess / Explicitly selected current WorkspaceAccess. */
      const currentWorkspaceAccess = (await workspaceSession.getAccess()).currentWorkspaceAccess
      if (currentWorkspaceAccess === undefined) {
        throw new Error('No workspace is available for interview setup.')
      }

      /** @brief 当前授权路径中的 Workspace ID / Workspace ID in the current authorization path. */
      const workspaceId = currentWorkspaceAccess.workspace.id
      const [setup, knowledgeSources] = await Promise.all([
        gateways.interview.getInterviewSetup(workspaceId),
        gateways.knowledge.listKnowledgeSources(workspaceId)
      ])
      return { knowledgeSources, setup, workspaceId }
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
