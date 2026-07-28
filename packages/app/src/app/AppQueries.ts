/** @file 跨限界上下文的只读应用查询与反腐层 / Cross-context read application queries and anti-corruption layer. */

import type { AppGateways } from '../application'
import type { UiResumeSummary } from '../published-language'
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

/** @brief Workspace 首页应用查询 / Workspace-home application query. */
export interface WorkspaceHomeQuery {
  /**
   * @brief 加载聚合后的首页投影 / Load the aggregated home projection.
   * @param signal 页面资源身份拥有的取消信号 / Cancellation signal owned by the page-resource identity.
   * @return 聚合后的首页投影 / Aggregated home projection.
   */
  readonly load: (signal: AbortSignal) => Promise<WorkspaceHomeQueryResult>
}

/** @brief 面试设置页可选择的已授权知识材料投影 / Authorized knowledge material selectable by Interview setup. */
export interface InterviewKnowledgeMaterial {
  /** @brief 用于 Session 显式授权的 KnowledgeSource identity / KnowledgeSource identity retained for the Session grant. */
  readonly id: Awaited<
    ReturnType<AppGateways['knowledge']['listKnowledgeSourcePage']>
  >['items'][number]['id']
  /** @brief 用户可见名称 / User-facing source name. */
  readonly name: string
  /** @brief 供设置页说明来源种类的稳定代码 / Stable source-kind code shown by setup. */
  readonly sourceType: Awaited<
    ReturnType<AppGateways['knowledge']['listKnowledgeSourcePage']>
  >['items'][number]['sourceType']
}

/** @brief Interview 设置页跨 Knowledge 上下文的只读反腐查询 / Interview-setup read query across Knowledge. */
export interface InterviewSetupQuery {
  /** @brief 读取可授权给 interview_coach 的当前材料 / Read current materials grantable to interview_coach. */
  readonly listKnowledgeMaterials: (
    workspaceId: Parameters<AppGateways['knowledge']['listKnowledgeSourcePage']>[0]['workspaceId'],
    signal: AbortSignal
  ) => Promise<readonly InterviewKnowledgeMaterial[]>
}

/** @brief 仅向页面暴露的命名应用查询集合 / Named application queries exposed to pages. */
export interface AppQueries {
  /** @brief Interview 设置查询 / Interview-setup query. */
  readonly interviewSetup: InterviewSetupQuery
  /** @brief Workspace 首页查询 / Workspace-home query. */
  readonly workspaceHome: WorkspaceHomeQuery
}

/** @brief 面试知识检索的当前 scope 与只读兼容别名 / Current scope and read-only compatibility alias for Interview knowledge retrieval. */
const INTERVIEW_KNOWLEDGE_AGENT_SCOPES = new Set(['interview_coach', 'interview_agent'])

/**
 * @brief 判断策略是否允许面试助手检索来源 / Decide whether a policy allows the Interview coach to retrieve a source.
 * @param policy KnowledgeSource 的完整可见性策略 / Complete visibility policy of the KnowledgeSource.
 * @return 当前或旧版面试 scope 具有有效 retrieve 权限时为 true / True when the current or legacy Interview scope has effective retrieve access.
 * @note 与后端 fail-closed 规则一致：retrieve deny 优先，存在同 scope 的非 retrieve grant 时不回退 default effect。
 * / Mirrors the backend fail-closed rule: retrieve deny wins, and a non-retrieve grant for the same scope prevents default fallback.
 */
function allowsInterviewKnowledgeRetrieval(
  policy: Awaited<
    ReturnType<AppGateways['knowledge']['listKnowledgeSourcePage']>
  >['items'][number]['visibility']
): boolean {
  /** @brief 当前与兼容 scope 的全部规则 / All rules for current and compatible scopes. */
  const scopeGrants = policy.agentGrants.filter((grant) =>
    INTERVIEW_KNOWLEDGE_AGENT_SCOPES.has(grant.agentScope)
  )
  /** @brief 仅控制检索操作的规则 / Rules governing only the retrieve operation. */
  const retrievalGrants = scopeGrants.filter((grant) =>
    grant.allowedOperations.includes('retrieve')
  )
  if (retrievalGrants.some((grant) => grant.effect === 'deny')) return false
  if (retrievalGrants.some((grant) => grant.effect === 'allow')) return true
  return scopeGrants.length === 0 && policy.defaultEffect === 'allow'
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
  /** @brief KnowledgeSource API v2 最大分页数量 / KnowledgeSource API v2 maximum page size. */
  const knowledgePageLimit = 200 as Parameters<
    AppGateways['knowledge']['listKnowledgeSourcePage']
  >[0]['limit']
  /** @brief 只向 Interview 展示层返回最小投影的查询 / Query returning only a minimal Interview projection. */
  const interviewSetup: InterviewSetupQuery = {
    async listKnowledgeMaterials(workspaceId, signal) {
      const materials: InterviewKnowledgeMaterial[] = []
      let cursor: Parameters<AppGateways['knowledge']['listKnowledgeSourcePage']>[0]['cursor'] =
        null
      for (;;) {
        const page = await gateways.knowledge.listKnowledgeSourcePage({
          cursor,
          limit: knowledgePageLimit,
          signal,
          workspaceId
        })
        signal.throwIfAborted()
        for (const source of page.items) {
          if (
            source.enabled &&
            source.ingestion.status === 'ready' &&
            source.currentVersionId !== null &&
            source.visibility.allowedModelRegions.includes('global') &&
            source.visibility.allowExternalModelProcessing &&
            allowsInterviewKnowledgeRetrieval(source.visibility)
          ) {
            materials.push({ id: source.id, name: source.name, sourceType: source.sourceType })
          }
        }
        if (!page.hasMore) break
        cursor = page.nextCursor
      }
      return materials
    }
  }

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

  return { interviewSetup, workspaceHome }
}
