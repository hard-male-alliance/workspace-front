import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppGateways } from '../application'
import { classifyDiagnosticError } from '../observability'
import type { DiagnosticResourceName } from '../observability'
import { useDiagnostics } from './Diagnostics'
import { createAppQueries, createWorkspaceSession } from './AppQueries'
import type { AppQueries, WorkspaceSession } from './AppQueries'

/** @brief Workspace gateway 依赖注入上下文 / Workspace-gateway dependency-injection context. */
const WorkspaceGatewayContext = createContext<AppGateways['workspace'] | null>(null)

/** @brief Resume gateway 依赖注入上下文 / Resume-gateway dependency-injection context. */
const ResumeGatewayContext = createContext<AppGateways['resume'] | null>(null)

/** @brief Interview gateway 依赖注入上下文 / Interview-gateway dependency-injection context. */
const InterviewGatewayContext = createContext<AppGateways['interview'] | null>(null)

/** @brief Knowledge gateway 依赖注入上下文 / Knowledge-gateway dependency-injection context. */
const KnowledgeGatewayContext = createContext<AppGateways['knowledge'] | null>(null)

/** @brief 当前工作区会话上下文 / Current-workspace session context. */
const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null)

/** @brief 跨上下文只读应用查询上下文 / Cross-context read application-query context. */
const AppQueriesContext = createContext<AppQueries | null>(null)

/** @brief 应用数据提供器属性 / App data-provider properties. */
export interface AppDataProviderProps {
  /** @brief 页面可使用的 gateway 集合 / Gateway collection accessible to pages. */
  readonly gateways: AppGateways
  /** @brief 使用数据依赖的子树 / Child tree that consumes data dependencies. */
  readonly children: ReactNode
}

/**
 * @brief 注入可替换的数据 gateway / Inject replaceable data gateways.
 * @param props 提供器属性 / Provider properties.
 * @return 数据依赖上下文提供器 / Data-dependency context provider.
 */
export function AppDataProvider({ children, gateways }: AppDataProviderProps): React.JSX.Element {
  /** @brief 在 provider 生命周期内稳定的当前工作区选择 / Current-workspace selection stable for the provider lifecycle. */
  const workspaceSession = useMemo(
    () => createWorkspaceSession(gateways.workspace),
    [gateways.workspace]
  )
  /** @brief 将跨上下文编排收敛在应用层的命名查询 / Named queries containing cross-context orchestration in the application layer. */
  const appQueries = useMemo(
    () => createAppQueries(gateways, workspaceSession),
    [gateways, workspaceSession]
  )

  return (
    <AppQueriesContext.Provider value={appQueries}>
      <WorkspaceGatewayContext.Provider value={gateways.workspace}>
        <ResumeGatewayContext.Provider value={gateways.resume}>
          <InterviewGatewayContext.Provider value={gateways.interview}>
            <KnowledgeGatewayContext.Provider value={gateways.knowledge}>
              <WorkspaceSessionContext.Provider value={workspaceSession}>
                {children}
              </WorkspaceSessionContext.Provider>
            </KnowledgeGatewayContext.Provider>
          </InterviewGatewayContext.Provider>
        </ResumeGatewayContext.Provider>
      </WorkspaceGatewayContext.Provider>
    </AppQueriesContext.Provider>
  )
}

/**
 * @brief 读取 Workspace 首页命名查询 / Read the named Workspace-home query.
 * @return 隔离页面与 Resume/Interview gateway 的应用查询 / Application query isolating the page from Resume and Interview gateways.
 */
export function useWorkspaceHomeQuery(): AppQueries['workspaceHome'] {
  /** @brief 当前应用查询集合 / Current application-query collection. */
  const queries = useContext(AppQueriesContext)
  if (queries === null) throw new Error('Workspace pages require AppDataProvider.')
  return queries.workspaceHome
}

/**
 * @brief 读取 Interview 配置命名查询 / Read the named Interview-setup query.
 * @return 隔离页面与 Knowledge gateway 的应用查询 / Application query isolating the page from the Knowledge gateway.
 */
export function useInterviewSetupQuery(): AppQueries['interviewSetup'] {
  /** @brief 当前应用查询集合 / Current application-query collection. */
  const queries = useContext(AppQueriesContext)
  if (queries === null) throw new Error('Interview pages require AppDataProvider.')
  return queries.interviewSetup
}

/**
 * @brief 读取 Interview 总结命名查询 / Read the named Interview-summary query.
 * @return 隔离页面与 Knowledge gateway 的应用查询 / Application query isolating the page from the Knowledge gateway.
 */
export function useInterviewSummaryQuery(): AppQueries['interviewSummary'] {
  /** @brief 当前应用查询集合 / Current application-query collection. */
  const queries = useContext(AppQueriesContext)
  if (queries === null) throw new Error('Interview pages require AppDataProvider.')
  return queries.interviewSummary
}

/**
 * @brief 读取 Workspace 上下文端口 / Read the Workspace context port.
 * @return 已注入的 Workspace gateway / Injected Workspace gateway.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useWorkspaceGateway(): AppGateways['workspace'] {
  /** @brief 当前 Workspace gateway / Current Workspace gateway. */
  const gateway = useContext(WorkspaceGatewayContext)

  if (gateway === null) throw new Error('Workspace pages require AppDataProvider.')
  return gateway
}

/**
 * @brief 读取 Resume 上下文端口 / Read the Resume context port.
 * @return 已注入的 Resume gateway / Injected Resume gateway.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeGateway(): AppGateways['resume'] {
  /** @brief 当前 Resume gateway / Current Resume gateway. */
  const gateway = useContext(ResumeGatewayContext)

  if (gateway === null) throw new Error('Resume pages require AppDataProvider.')
  return gateway
}

/**
 * @brief 读取 Interview 上下文端口 / Read the Interview context port.
 * @return 已注入的 Interview gateway / Injected Interview gateway.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useInterviewGateway(): AppGateways['interview'] {
  /** @brief 当前 Interview gateway / Current Interview gateway. */
  const gateway = useContext(InterviewGatewayContext)

  if (gateway === null) throw new Error('Interview pages require AppDataProvider.')
  return gateway
}

/**
 * @brief 读取 Knowledge 上下文端口 / Read the Knowledge context port.
 * @return 已注入的 Knowledge gateway / Injected Knowledge gateway.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useKnowledgeGateway(): AppGateways['knowledge'] {
  /** @brief 当前 Knowledge gateway / Current Knowledge gateway. */
  const gateway = useContext(KnowledgeGatewayContext)

  if (gateway === null) throw new Error('Knowledge pages require AppDataProvider.')
  return gateway
}

/**
 * @brief 读取应用会话的当前工作区端口 / Read the current-workspace port for this application session.
 * @return 稳定的当前工作区会话 / Stable current-workspace session.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useWorkspaceSession(): WorkspaceSession {
  /** @brief 当前工作区会话 / Current workspace session. */
  const session = useContext(WorkspaceSessionContext)

  if (session === null) throw new Error('Workspace pages require AppDataProvider.')
  return session
}

/** @brief 异步资源状态 / Async resource state. */
export type AsyncResource<TValue> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: TValue }
  | { readonly status: 'error'; readonly error: Error }

/**
 * @brief 读取单调时钟的毫秒值 / Read a monotonic clock value in milliseconds.
 * @return 适用于时长计算的当前毫秒值 / Current milliseconds suitable for duration calculations.
 */
function nowMilliseconds(): number {
  return globalThis.performance?.now() ?? Date.now()
}

/**
 * @brief 加载 gateway 返回的异步资源 / Load an asynchronous resource returned by a gateway.
 * @template TValue 成功资源类型 / Successful resource type.
 * @param load 稳定的异步加载函数 / Stable async loader function.
 * @return 加载中、成功或失败的资源状态 / Loading, ready, or failed resource state.
 * @note 调用方应以 useCallback 包装 load，避免无意重复请求。
 */
export function useAsyncResource<TValue>(
  resourceName: DiagnosticResourceName,
  load: () => Promise<TValue>
): AsyncResource<TValue> {
  /** @brief 资源当前状态 / Current resource state. */
  const [resource, setResource] = useState<AsyncResource<TValue>>({ status: 'loading' })
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()

  useEffect((): (() => void) => {
    /** @brief effect 是否仍然存活 / Whether the effect is still active. */
    let active = true
    /** @brief 资源读取的起始单调时间 / Monotonic start time for the resource read. */
    const startedAt = nowMilliseconds()

    void load()
      .then((data): void => {
        if (active) {
          setResource({ status: 'ready', data })
          diagnostics.emit('resource.load_completed', {
            duration_ms: Math.max(0, Math.round(nowMilliseconds() - startedAt)),
            resource: resourceName
          })
        }
      })
      .catch((reason: unknown): void => {
        if (active) {
          setResource({
            status: 'error',
            error: reason instanceof Error ? reason : new Error('Unable to load workspace data.')
          })
          diagnostics.emit('resource.load_failed', {
            duration_ms: Math.max(0, Math.round(nowMilliseconds() - startedAt)),
            error_kind: classifyDiagnosticError(reason),
            resource: resourceName
          })
        }
      })

    return (): void => {
      active = false
    }
  }, [diagnostics, load, resourceName])

  return resource
}
