/** @file React 应用的诊断上下文、错误边界与生命周期监听 / Diagnostics context, error boundary, and lifecycle listeners for the React application. */

import { Component, createContext, useContext, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { classifyDiagnosticError } from '../observability'
import type { DiagnosticCommandOperation, DiagnosticRoute, Diagnostics } from '../observability'

/** @brief 可注入 Diagnostics 的 React 上下文 / React context for injectable Diagnostics. */
const DiagnosticsContext = createContext<Diagnostics | null>(null)

/** @brief 诊断上下文提供器属性 / Properties for the diagnostics context provider. */
export interface DiagnosticsProviderProps {
  /** @brief 由宿主组合根创建的诊断端口 / Diagnostics port created by host composition. */
  readonly diagnostics: Diagnostics
  /** @brief 需要使用诊断端口的应用子树 / Application subtree that uses the diagnostics port. */
  readonly children: ReactNode
}

/**
 * @brief 向共享应用树注入 Diagnostics / Inject Diagnostics into the shared application tree.
 * @param props 提供器属性 / Provider properties.
 * @return Diagnostics 上下文提供器 / Diagnostics context provider.
 */
export function DiagnosticsProvider({
  children,
  diagnostics
}: DiagnosticsProviderProps): React.JSX.Element {
  return <DiagnosticsContext.Provider value={diagnostics}>{children}</DiagnosticsContext.Provider>
}

/**
 * @brief 读取当前注入的 Diagnostics / Read the currently injected Diagnostics.
 * @return 当前应用的诊断端口 / Diagnostics port for the current application.
 * @throws 未被 DiagnosticsProvider 包裹时抛出错误 / Throws when not wrapped by DiagnosticsProvider.
 */
export function useDiagnostics(): Diagnostics {
  /** @brief 当前上下文中的诊断端口 / Diagnostics port in the current context. */
  const diagnostics = useContext(DiagnosticsContext)

  if (diagnostics === null) {
    throw new Error('Workspace pages require DiagnosticsProvider.')
  }

  return diagnostics
}

/** @brief 有类型的高价值用户命令描述 / Typed description of a high-value user command. */
export type DiagnosticCommand =
  | {
      readonly scope: 'interview'
      readonly operation: Extract<DiagnosticCommandOperation, `interview.${string}`>
    }
  | {
      readonly scope: 'knowledge'
      readonly operation: Extract<DiagnosticCommandOperation, `knowledge.${string}`>
    }
  | {
      readonly scope: 'resume'
      readonly operation: Extract<DiagnosticCommandOperation, `resume.${string}`>
    }

/**
 * @brief 读取用于命令耗时的单调时间 / Read monotonic time used for command durations.
 * @return 当前单调毫秒值 / Current monotonic millisecond value.
 */
function commandNowMilliseconds(): number {
  return globalThis.performance?.now() ?? Date.now()
}

/**
 * @brief 发射命令开始事件 / Emit a command-started event.
 * @param diagnostics 应用诊断端口 / Application diagnostics port.
 * @param command 已类型化命令 / Typed command.
 * @return 无返回值 / No return value.
 */
function emitCommandStarted(diagnostics: Diagnostics, command: DiagnosticCommand): void {
  if (command.scope === 'knowledge') {
    diagnostics.emit('knowledge.command_started', { operation: command.operation })
  }
}

/**
 * @brief 发射命令成功事件 / Emit a command-succeeded event.
 * @param diagnostics 应用诊断端口 / Application diagnostics port.
 * @param command 已类型化命令 / Typed command.
 * @param durationMilliseconds 已完成时长 / Completed duration in milliseconds.
 * @return 无返回值 / No return value.
 */
function emitCommandCompleted(
  diagnostics: Diagnostics,
  command: DiagnosticCommand,
  durationMilliseconds: number
): void {
  if (command.scope === 'interview') {
    diagnostics.emit('interview.command_completed', {
      duration_ms: durationMilliseconds,
      operation: command.operation
    })
    return
  }
  if (command.scope === 'knowledge') {
    diagnostics.emit('knowledge.command_completed', {
      duration_ms: durationMilliseconds,
      operation: command.operation
    })
    return
  }
  diagnostics.emit('resume.command_completed', {
    duration_ms: durationMilliseconds,
    operation: command.operation
  })
}

/**
 * @brief 发射命令失败事件 / Emit a command-failed event.
 * @param diagnostics 应用诊断端口 / Application diagnostics port.
 * @param command 已类型化命令 / Typed command.
 * @param durationMilliseconds 失败前的时长 / Duration before failure in milliseconds.
 * @param error 未知错误；只会转为稳定类别 / Unknown error; only converted to a stable category.
 * @return 无返回值 / No return value.
 */
function emitCommandFailed(
  diagnostics: Diagnostics,
  command: DiagnosticCommand,
  durationMilliseconds: number,
  error: unknown
): void {
  /** @brief 已脱敏错误类别 / Sanitized error category. */
  const errorKind = classifyDiagnosticError(error)

  if (errorKind === 'aborted') return
  if (command.scope === 'interview') {
    diagnostics.emit('interview.command_failed', {
      duration_ms: durationMilliseconds,
      error_kind: errorKind,
      operation: command.operation
    })
    return
  }
  if (command.scope === 'knowledge') {
    diagnostics.emit('knowledge.command_failed', {
      duration_ms: durationMilliseconds,
      error_kind: errorKind,
      operation: command.operation
    })
    return
  }
  diagnostics.emit('resume.command_failed', {
    duration_ms: durationMilliseconds,
    error_kind: errorKind,
    operation: command.operation
  })
}

/**
 * @brief 执行并记录高价值用户命令 / Execute and record a high-value user command.
 * @template TValue 命令成功返回类型 / Successful command return type.
 * @param diagnostics 应用诊断端口 / Application diagnostics port.
 * @param command 已类型化且不含用户内容的命令 / Typed command that contains no user content.
 * @param execute 实际业务操作 / Actual business operation.
 * @return 保留原始成功值或原始异常的 Promise / Promise preserving the original success value or exception.
 * @note 取消由底层 HTTP 单独记录为 expected control flow，不会被升级为用户命令错误。
 */
export async function runDiagnosticCommand<TValue>(
  diagnostics: Diagnostics,
  command: DiagnosticCommand,
  execute: () => Promise<TValue>
): Promise<TValue> {
  /** @brief 命令开始的单调时间 / Monotonic time at command start. */
  const startedAt = commandNowMilliseconds()
  emitCommandStarted(diagnostics, command)

  try {
    const result = await execute()
    emitCommandCompleted(
      diagnostics,
      command,
      Math.max(0, Math.round(commandNowMilliseconds() - startedAt))
    )
    return result
  } catch (error: unknown) {
    emitCommandFailed(
      diagnostics,
      command,
      Math.max(0, Math.round(commandNowMilliseconds() - startedAt)),
      error
    )
    throw error
  }
}

/**
 * @brief 将实际 URL 归一化为低基数路由分类 / Normalize an actual URL into a low-cardinality route category.
 * @param pathname 当前浏览器路径 / Current browser pathname.
 * @return 不含资源 ID 或 query 的稳定路由名 / Stable route name without resource IDs or query data.
 */
function getDiagnosticRoute(pathname: string): DiagnosticRoute {
  if (pathname === '/') return 'workspace.home'
  if (pathname === '/resumes') return 'resume.entry'
  if (pathname === '/resumes/new') return 'resume.creation'
  if (pathname.endsWith('/edit')) return 'resume.editor'
  if (pathname.endsWith('/export')) return 'resume.output'
  if (pathname.endsWith('/review')) return 'resume.review'
  if (pathname.endsWith('/template')) return 'resume.template_settings'
  if (pathname === '/interviews') return 'interview.history'
  if (pathname === '/interviews/new') return 'interview.setup'
  if (pathname.endsWith('/summary')) return 'interview.summary'
  if (pathname.startsWith('/interviews/')) return 'interview.room'
  if (pathname === '/knowledge') return 'knowledge.sources'
  if (pathname.endsWith('/visibility')) return 'knowledge.visibility'
  return 'unknown'
}

/**
 * @brief 记录一次已完成的路由变化 / Record one completed route transition.
 * @return 路由观测节点，不渲染 UI / Route-observation node that renders no UI.
 * @note 只写入归一化路由名，绝不记录真实 path 参数。
 */
export function DiagnosticsRouteObserver(): null {
  /** @brief 当前路由位置 / Current router location. */
  const location = useLocation()
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief 已归一化的安全路由名称 / Normalized safe route name. */
  const route = getDiagnosticRoute(location.pathname)

  useEffect((): void => {
    diagnostics.emit('app.route_changed', { route })
  }, [diagnostics, route])

  return null
}

/**
 * @brief 安装全局错误与页面隐藏 flush 监听器 / Install global error and page-hidden flush listeners.
 * @return 生命周期观测节点，不渲染 UI / Lifecycle-observation node that renders no UI.
 */
export function DiagnosticsRuntimeObserver(): null {
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()

  useEffect((): (() => void) => {
    /**
     * @brief 记录 window error，不传递原始错误文本 / Record a window error without passing raw error text.
     * @param event 浏览器错误事件 / Browser error event.
     * @return 无返回值 / No return value.
     */
    const handleWindowError = (event: ErrorEvent): void => {
      diagnostics.emit('runtime.unhandled_error', {
        error_kind: classifyDiagnosticError(event.error),
        source: 'window_error'
      })
    }

    /**
     * @brief 记录未处理 rejection，不传递原始 rejection / Record an unhandled rejection without passing it through.
     * @param event 浏览器未处理 rejection 事件 / Browser unhandled-rejection event.
     * @return 无返回值 / No return value.
     */
    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      diagnostics.emit('runtime.unhandled_error', {
        error_kind: classifyDiagnosticError(event.reason),
        source: 'unhandled_rejection'
      })
    }

    /**
     * @brief 在页面进入 hidden 时尝试 flush / Attempt a flush when the page becomes hidden.
     * @return 无返回值 / No return value.
     */
    const flushWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        void diagnostics.flush()
      }
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    document.addEventListener('visibilitychange', flushWhenHidden)

    return (): void => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [diagnostics])

  return null
}

/** @brief React 错误边界属性 / React error-boundary properties. */
interface DiagnosticsErrorBoundaryProps {
  /** @brief 遇到渲染错误时需要保护的子树 / Subtree to protect when a render error occurs. */
  readonly children: ReactNode
  /** @brief 将错误安全地写入诊断端口 / Diagnostics port used to safely record errors. */
  readonly diagnostics: Diagnostics
}

/** @brief React 错误边界内部状态 / Internal React error-boundary state. */
interface DiagnosticsErrorBoundaryState {
  /** @brief 子树是否已经发生不可恢复渲染错误 / Whether the subtree has encountered an unrecoverable render error. */
  readonly hasError: boolean
}

/**
 * @brief 捕获 React 渲染错误的边界 / Boundary that captures React render errors.
 * @note 远程诊断仅记录稳定错误类别；原始 error 与 component stack 永不导出。
 */
class DiagnosticsErrorBoundary extends Component<
  DiagnosticsErrorBoundaryProps,
  DiagnosticsErrorBoundaryState
> {
  /** @brief 边界初始状态 / Initial boundary state. */
  override state: DiagnosticsErrorBoundaryState = { hasError: false }

  /**
   * @brief 从渲染错误推导降级状态 / Derive fallback state from a render error.
   * @return 固定的降级状态 / Fixed fallback state.
   */
  static getDerivedStateFromError(): DiagnosticsErrorBoundaryState {
    return { hasError: true }
  }

  /**
   * @brief 记录已捕获的渲染错误 / Record a captured render error.
   * @param error 已捕获的错误 / Captured error.
   * @param _info React 组件栈信息；刻意不记录 / React component-stack information, intentionally not recorded.
   * @return 无返回值 / No return value.
   */
  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    void _info
    this.props.diagnostics.emit('runtime.unhandled_error', {
      error_kind:
        classifyDiagnosticError(error) === 'unknown'
          ? 'react_render'
          : classifyDiagnosticError(error),
      source: 'react_boundary'
    })
  }

  /**
   * @brief 渲染正常子树或无敏感回退 UI / Render the normal subtree or a non-sensitive fallback UI.
   * @return 正常子树或错误回退 / Normal subtree or error fallback.
   */
  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="aw-page" role="alert">
          <h1>应用界面暂时不可用</h1>
          <p>请刷新页面后重试。</p>
        </main>
      )
    }

    return this.props.children
  }
}

/**
 * @brief 将 React 错误边界绑定到当前 Diagnostics 上下文 / Bind a React error boundary to the current Diagnostics context.
 * @param props 需要保护的子树 / Subtree to protect.
 * @return 带当前 Diagnostics 的错误边界 / Error boundary with current Diagnostics.
 */
export function DiagnosticsBoundary({
  children
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  /** @brief 当前应用诊断端口 / Current application diagnostics port. */
  const diagnostics = useDiagnostics()

  return <DiagnosticsErrorBoundary diagnostics={diagnostics}>{children}</DiagnosticsErrorBoundary>
}
