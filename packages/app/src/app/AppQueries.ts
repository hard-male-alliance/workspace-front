/** @file 跨限界上下文的只读应用查询与反腐层 / Cross-context read application queries and anti-corruption layer. */

import type { AppGateways } from '../application'
import type {
  UiInterviewReport,
  UiInterviewRuntimeModel,
  UiInterviewSessionId,
  UiInterviewSetupModel,
  UiKnowledgeSource,
  UiResumeCard,
  UiWorkspaceHomeModel,
  UiWorkspaceId
} from '../published-language'

/** @brief Workspace gateway 发布的单个工作区投影 / One workspace projection published by the Workspace gateway. */
type CurrentWorkspace = Awaited<ReturnType<AppGateways['workspace']['listWorkspaces']>>[number]

/** @brief 当前工作区会话端口 / Current-workspace session port. */
export interface WorkspaceSession {
  /**
   * @brief 读取本次应用会话选中的工作区 / Read the workspace selected for this application session.
   * @return 当前工作区；无可访问工作区时为 undefined / Current workspace, or undefined when none is accessible.
   */
  readonly getCurrentWorkspace: () => Promise<CurrentWorkspace | undefined>
}

/** @brief Workspace 首页所需的跨上下文只读投影 / Cross-context read projection required by the Workspace home page. */
export interface WorkspaceHomeQueryResult {
  /** @brief Workspace 自有首页模型 / Workspace-owned home model. */
  readonly home: UiWorkspaceHomeModel
  /** @brief 最近完成的 Interview 会话 / Most recently completed Interview session. */
  readonly interviewSessionId: UiInterviewSessionId | null
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
  /** @brief Interview 自有运行时模型 / Interview-owned runtime model. */
  readonly runtime: UiInterviewRuntimeModel
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

/**
 * @brief 为应用生命周期创建单一工作区选择 / Create one workspace selection for the application lifecycle.
 * @param workspaceGateway Workspace 上下文端口 / Workspace context port.
 * @return 会合并并发读取、失败后允许重试的会话端口 / Session port that coalesces concurrent reads and permits retry after failure.
 */
export function createWorkspaceSession(
  workspaceGateway: AppGateways['workspace']
): WorkspaceSession {
  /** @brief 当前共享的工作区读取 / Current shared workspace read. */
  let currentWorkspaceRequest: Promise<CurrentWorkspace | undefined> | undefined

  /**
   * @brief 读取并缓存当前工作区 / Read and cache the current workspace.
   * @return 当前工作区引用 / Current workspace reference.
   */
  function getCurrentWorkspace(): Promise<CurrentWorkspace | undefined> {
    currentWorkspaceRequest ??= workspaceGateway
      .listWorkspaces()
      .then((workspaces) => workspaces.at(0))
      .catch((error: unknown): never => {
        currentWorkspaceRequest = undefined
        throw error
      })

    return currentWorkspaceRequest
  }

  return { getCurrentWorkspace }
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

      const [home, interviewHistory, resumeCards] = await Promise.all([
        gateways.workspace.getWorkspaceHome(currentWorkspace.id),
        gateways.interview.listCompletedInterviews(currentWorkspace.id),
        gateways.resume.listResumeCards(currentWorkspace.id)
      ])
      /** @brief 最近更新的 Resume 卡片 / Most recently updated Resume card. */
      const resumeCard =
        [...resumeCards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
        null
      /** @brief 最近完成的 Interview 会话 / Most recently completed Interview session. */
      const interviewSessionId = [...interviewHistory].sort((left, right) =>
        right.completedAt.localeCompare(left.completedAt)
      )[0]?.sessionId

      return { home, interviewSessionId: interviewSessionId ?? null, resumeCard }
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
      const [report, runtime] = await Promise.all([
        gateways.interview.getInterviewReport(sessionId),
        gateways.interview.getInterviewRuntime(sessionId)
      ])
      /** @brief 本次会话可用的 Knowledge 来源投影 / Knowledge source projections available to this session. */
      const knowledgeSources = await gateways.knowledge.listKnowledgeSources(
        runtime.session.workspaceId
      )
      return { knowledgeSources, report, runtime }
    }
  }

  return { interviewSetup, interviewSummary, workspaceHome }
}
