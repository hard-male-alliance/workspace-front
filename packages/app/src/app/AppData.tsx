import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createKnowledgeManualNoteCreationProcess,
  type AppGateways,
  type KnowledgeManualNoteCreationProcess
} from '../application'
import { classifyDiagnosticError } from '../observability'
import type { DiagnosticResourceName } from '../observability'
import { useDiagnostics } from './Diagnostics'
import { createAppProcesses, type AppProcesses } from './AppProcesses'
import { createAppQueries, type AppQueries } from './AppQueries'
import {
  createInterviewReportProcess,
  type InterviewReportProcess,
  type InterviewReportRecoveryStorage
} from './InterviewReportProcess'
import { createWorkspaceSession, type WorkspaceSession } from './session/workspace-session'

/** @brief Resume gateway 依赖注入上下文 / Resume-gateway dependency-injection context. */
const ResumeGatewayContext = createContext<AppGateways['resume'] | null>(null)

/** @brief Resume 审阅端口依赖注入上下文 / Resume-review port dependency-injection context. */
const ResumeReviewContext = createContext<AppGateways['resumeReview'] | null>(null)

/** @brief Resume 创建端口依赖注入上下文 / Resume-creation port dependency-injection context. */
const ResumeCreationContext = createContext<AppGateways['resumeCreation'] | null>(null)

/** @brief 全局 Resume Template 目录依赖注入上下文 / Global Resume Template-catalog dependency-injection context. */
const ResumeTemplateCatalogContext = createContext<AppGateways['resumeTemplates'] | null>(null)

/** @brief Interview gateway 依赖注入上下文 / Interview-gateway dependency-injection context. */
const InterviewGatewayContext = createContext<AppGateways['interview'] | null>(null)

/** @brief 可恢复 Interview Report 产品流程上下文 / Recoverable Interview Report product-process context. */
const InterviewReportProcessContext = createContext<InterviewReportProcess | null>(null)

/** @brief Knowledge gateway 依赖注入上下文 / Knowledge-gateway dependency-injection context. */
const KnowledgeGatewayContext = createContext<AppGateways['knowledge'] | null>(null)

/** @brief 手工笔记创建恢复流程上下文 / Manual-note creation-recovery process context. */
const KnowledgeManualNoteCreationContext = createContext<KnowledgeManualNoteCreationProcess | null>(
  null
)

/** @brief 当前工作区会话上下文 / Current-workspace session context. */
const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null)

/** @brief 跨上下文只读应用查询上下文 / Cross-context read application-query context. */
const AppQueriesContext = createContext<AppQueries | null>(null)

/** @brief 跨上下文命名产品流程上下文 / Cross-context named product-process context. */
const AppProcessesContext = createContext<AppProcesses | null>(null)

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
    () => createWorkspaceSession(gateways.identity, gateways.workspace),
    [gateways.identity, gateways.workspace]
  )
  /** @brief 将跨上下文编排收敛在应用层的命名查询 / Named queries containing cross-context orchestration in the application layer. */
  const appQueries = useMemo(
    () => createAppQueries(gateways, workspaceSession),
    [gateways, workspaceSession]
  )
  /** @brief 将跨上下文写入与异步观察收敛在应用层的命名流程 / Named processes containing cross-context writes and asynchronous observation in the application layer. */
  const appProcesses = useMemo(() => createAppProcesses(gateways), [gateways])
  /** @brief 在 provider 生命周期内保存冻结正文与幂等 identity 的 Knowledge 创建流程 / Knowledge creation process retaining the frozen body and idempotency identity for the provider lifecycle. */
  const knowledgeManualNoteCreation = useMemo(
    () => createKnowledgeManualNoteCreationProcess(gateways.knowledge),
    [gateways.knowledge]
  )
  /** @brief 当前宿主可用的 sessionStorage 兼容恢复端口 / SessionStorage-compatible recovery port available in the current host. */
  const interviewReportStorage = useMemo<InterviewReportRecoveryStorage>(() => {
    try {
      if (typeof globalThis.sessionStorage !== 'undefined') return globalThis.sessionStorage
    } catch {
      // 受限宿主会使用仅限本进程生命周期的恢复记录。
      // Restricted hosts use recovery records limited to this process lifetime.
    }
    /** @brief 无 DOM 宿主中的进程内恢复记录 / Process-local recovery records in a host without DOM storage. */
    const records = new Map<string, string>()
    return {
      getItem: (key): string | null => records.get(key) ?? null,
      removeItem: (key): void => {
        records.delete(key)
      },
      setItem: (key, value): void => {
        records.set(key, value)
      }
    }
  }, [])
  /** @brief 跨页面保留幂等 identity 与已知 Job 的 Report 流程 / Report process retaining idempotency identity and known Job across pages. */
  const interviewReportProcess = useMemo(
    () =>
      createInterviewReportProcess({
        interview: gateways.interview,
        storage: interviewReportStorage,
        workspaceOperations: gateways.workspaceOperations
      }),
    [gateways.interview, gateways.workspaceOperations, interviewReportStorage]
  )

  return (
    <AppProcessesContext.Provider value={appProcesses}>
      <AppQueriesContext.Provider value={appQueries}>
        <ResumeGatewayContext.Provider value={gateways.resume}>
          <ResumeReviewContext.Provider value={gateways.resumeReview}>
            <ResumeCreationContext.Provider value={gateways.resumeCreation}>
              <ResumeTemplateCatalogContext.Provider value={gateways.resumeTemplates}>
                <InterviewGatewayContext.Provider value={gateways.interview}>
                  <InterviewReportProcessContext.Provider value={interviewReportProcess}>
                    <KnowledgeGatewayContext.Provider value={gateways.knowledge}>
                      <KnowledgeManualNoteCreationContext.Provider
                        value={knowledgeManualNoteCreation}
                      >
                        <WorkspaceSessionContext.Provider value={workspaceSession}>
                          {children}
                        </WorkspaceSessionContext.Provider>
                      </KnowledgeManualNoteCreationContext.Provider>
                    </KnowledgeGatewayContext.Provider>
                  </InterviewReportProcessContext.Provider>
                </InterviewGatewayContext.Provider>
              </ResumeTemplateCatalogContext.Provider>
            </ResumeCreationContext.Provider>
          </ResumeReviewContext.Provider>
        </ResumeGatewayContext.Provider>
      </AppQueriesContext.Provider>
    </AppProcessesContext.Provider>
  )
}

/**
 * @brief 读取 Resume Render 命名产品流程 / Read the named Resume-render product process.
 * @return 隔离 Resume 页面与通用 Job/Artifact gateway 的跨上下文流程 / Cross-context process isolating Resume presentation from generic Job/Artifact gateways.
 * @throws 未被 AppDataProvider 包裹时抛出 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeRenderProcess(): AppProcesses['resumeRender'] {
  /** @brief 当前应用流程集合 / Current application-process collection. */
  const processes = useContext(AppProcessesContext)
  if (processes === null) throw new Error('Resume pages require AppDataProvider.')
  return processes.resumeRender
}

/**
 * @brief 读取 Resume 历史恢复命名产品流程 / Read the named Resume history-restore product process.
 * @return 隔离页面与通用 Job gateway 的恢复流程 / Restore process isolating the page from the generic Job gateway.
 * @throws 未被 AppDataProvider 包裹时抛出 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeRestoreProcess(): AppProcesses['resumeRestore'] {
  /** @brief 当前应用流程集合 / Current application-process collection. */
  const processes = useContext(AppProcessesContext)
  if (processes === null) throw new Error('Resume pages require AppDataProvider.')
  return processes.resumeRestore
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
 * @brief 读取 Resume 历史与建议审阅端口 / Read the Resume history and proposal-review port.
 * @return 已注入的 Resume 审阅端口 / Injected Resume-review port.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeReview(): AppGateways['resumeReview'] {
  /** @brief 当前 Resume 审阅端口 / Current Resume-review port. */
  const review = useContext(ResumeReviewContext)
  if (review === null) throw new Error('Resume review requires AppDataProvider.')
  return review
}

/**
 * @brief 读取 Workspace-scoped Resume 创建端口 / Read the Workspace-scoped Resume-creation port.
 * @return 已注入的 Resume 创建端口 / Injected Resume-creation port.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeCreation(): AppGateways['resumeCreation'] {
  /** @brief 当前 Resume 创建端口 / Current Resume-creation port. */
  const creation = useContext(ResumeCreationContext)
  if (creation === null) throw new Error('Resume creation requires AppDataProvider.')
  return creation
}

/**
 * @brief 读取全局不可变 Resume Template 目录 / Read the global immutable Resume Template catalog.
 * @return 已注入的 Template 目录端口 / Injected Template-catalog port.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useResumeTemplateCatalog(): AppGateways['resumeTemplates'] {
  /** @brief 当前 Template 目录端口 / Current Template-catalog port. */
  const catalog = useContext(ResumeTemplateCatalogContext)
  if (catalog === null) throw new Error('Resume Templates require AppDataProvider.')
  return catalog
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
 * @brief 读取可恢复的 Interview Report 产品流程 / Read the recoverable Interview Report product process.
 * @return 跨 Interview 与通用 Job 的命名流程 / Named process spanning Interview and generic Jobs.
 * @throws 未被 AppDataProvider 包裹时抛出 / Throws when not wrapped by AppDataProvider.
 */
export function useInterviewReportProcess(): InterviewReportProcess {
  /** @brief 当前 Report 流程 / Current Report process. */
  const process = useContext(InterviewReportProcessContext)
  if (process === null) throw new Error('Interview Report generation requires AppDataProvider.')
  return process
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
 * @brief 读取手工笔记 KnowledgeSource 创建恢复流程 / Read the manual-note KnowledgeSource creation-recovery process.
 * @return 在页面卸载后仍保留冻结命令的进程内流程 / In-process flow retaining the frozen command after page unmount.
 * @throws 未被 AppDataProvider 包裹时抛出错误 / Throws when not wrapped by AppDataProvider.
 */
export function useKnowledgeManualNoteCreation(): KnowledgeManualNoteCreationProcess {
  /** @brief 当前 Knowledge 创建流程 / Current Knowledge creation process. */
  const process = useContext(KnowledgeManualNoteCreationContext)
  if (process === null) throw new Error('Knowledge creation requires AppDataProvider.')
  return process
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
type AsyncResourceState<TValue> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: TValue }
  | { readonly status: 'error'; readonly error: Error }

/** @brief 可取消的异步资源加载器 / Abortable asynchronous-resource loader. */
export type AsyncResourceLoader<TValue> = (signal: AbortSignal) => Promise<TValue>

/** @brief 绑定到一次资源身份与加载尝试的异步快照 / Async snapshot bound to one resource identity and load attempt. */
interface AsyncResourceSnapshot<TValue> {
  /** @brief 触发当前快照的尝试序号 / Attempt sequence that produced this snapshot. */
  readonly attempt: number
  /** @brief 触发当前快照的加载函数 / Loader that produced this snapshot. */
  readonly load: AsyncResourceLoader<TValue>
  /** @brief 调用方声明的资源身份 / Resource identity declared by the caller. */
  readonly resourceKey: unknown
  /** @brief 当前身份与尝试对应的异步状态 / Async state for the bound identity and attempt. */
  readonly state: AsyncResourceState<TValue>
}

/** @brief 带稳定重试动作的异步资源 / Asynchronous resource with a stable retry action. */
export type AsyncResource<TValue> = AsyncResourceState<TValue> & {
  /** @brief 原地重新执行资源加载 / Retry resource loading in place. */
  readonly retry: () => void
}

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
 * @param load 稳定且接受取消信号的异步加载函数 / Stable async loader accepting a cancellation signal.
 * @param resourceKey 可选的领域资源身份；变化时当前 render 立即进入 loading / Optional domain resource identity; a change makes the current render loading immediately.
 * @return 加载中、成功或失败的资源状态 / Loading, ready, or failed resource state.
 * @note 调用方应以 useCallback 包装 load，避免无意重复请求。
 */
export function useAsyncResource<TValue>(
  resourceName: DiagnosticResourceName,
  load: AsyncResourceLoader<TValue>,
  resourceKey?: string | number
): AsyncResource<TValue> {
  /** @brief 未显式传入领域 key 时以稳定加载函数作为资源身份 / Stable loader used as the resource identity when no domain key is supplied. */
  const currentResourceKey = resourceKey ?? load
  /** @brief 用户触发的加载尝试序号 / User-triggered load-attempt sequence. */
  const [attempt, setAttempt] = useState(0)
  /** @brief 只属于一个资源身份和一次尝试的已提交快照 / Committed snapshot belonging to one resource identity and attempt. */
  const [snapshot, setSnapshot] = useState<AsyncResourceSnapshot<TValue>>(() => ({
    attempt,
    load,
    resourceKey: currentResourceKey,
    state: { status: 'loading' }
  }))
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief 以新 loading 状态开始下一次尝试 / Start the next attempt from a fresh loading state. */
  const retry = useCallback((): void => {
    setAttempt((currentAttempt) => currentAttempt + 1)
  }, [])
  /** @brief 当前 render 是否仍对应已提交快照 / Whether the current render still represents the committed snapshot. */
  const snapshotIsCurrent =
    snapshot.attempt === attempt &&
    snapshot.load === load &&
    Object.is(snapshot.resourceKey, currentResourceKey)
  useEffect((): (() => void) => {
    /** @brief effect 是否仍然存活 / Whether the effect is still active. */
    let active = true
    /** @brief 当前资源身份独占的取消控制器 / Abort controller owned by the current resource identity. */
    const controller = new AbortController()
    /** @brief 资源读取的起始单调时间 / Monotonic start time for the resource read. */
    const startedAt = nowMilliseconds()

    void Promise.resolve()
      .then(() => load(controller.signal))
      .then((data): void => {
        if (active) {
          setSnapshot({
            attempt,
            load,
            resourceKey: currentResourceKey,
            state: { status: 'ready', data }
          })
          diagnostics.emit('resource.load_completed', {
            duration_ms: Math.max(0, Math.round(nowMilliseconds() - startedAt)),
            resource: resourceName
          })
        }
      })
      .catch((reason: unknown): void => {
        if (active) {
          setSnapshot({
            attempt,
            load,
            resourceKey: currentResourceKey,
            state: {
              status: 'error',
              error: reason instanceof Error ? reason : new Error('Unable to load workspace data.')
            }
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
      controller.abort(new DOMException('Resource identity changed.', 'AbortError'))
    }
  }, [attempt, currentResourceKey, diagnostics, load, resourceName])

  if (!snapshotIsCurrent) return { retry, status: 'loading' }
  return { ...snapshot.state, retry }
}
