import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ArtifactSavePort, RuntimeInfo } from '@ai-job-workspace/platform'
import { AppDataProvider } from './AppData'
import type { AppGateways } from '../application'
import {
  DiagnosticsBoundary,
  DiagnosticsProvider,
  DiagnosticsRouteObserver,
  DiagnosticsRuntimeObserver
} from './Diagnostics'
import { WorkspaceShell } from './WorkspaceShell'
import { HostProvider } from './Host'
import type { Diagnostics } from '../observability'
import { appI18n, appI18nReady } from '../i18n'
import { WorkspaceHomePage } from '../contexts/workspace'
import { LoadingState } from '../ui'
import '../styles/app.css'

/** @brief 简历限界上下文的异步路由组件 / Async route component for the Resume bounded context. */
const ResumeRoutes = lazy(() => import('./routes/ResumeRoutes'))

/** @brief 面试限界上下文的异步路由组件 / Async route component for the Interview bounded context. */
const InterviewRoutes = lazy(() => import('./routes/InterviewRoutes'))

/** @brief 知识限界上下文的异步路由组件 / Async route component for the Knowledge bounded context. */
const KnowledgeRoutes = lazy(() => import('./routes/KnowledgeRoutes'))

/** @brief 内部状态样例的异步页面组件 / Async page component for the internal state gallery. */
const StateGalleryPage = lazy(() => import('../app-support/presentation/StateGalleryPage'))

/** @brief i18n 初始化边界属性 / i18n bootstrap-boundary properties. */
interface I18nBootstrapProps {
  /** @brief 等待 i18n 后渲染的子树 / Child tree rendered after i18n is ready. */
  readonly children: ReactNode
}

/**
 * @brief 等待共享 i18n 实例完成初始化 / Wait until the shared i18n instance finishes initialization.
 * @param props 边界属性 / Boundary properties.
 * @return i18n 就绪前的 loading 状态或子树 / Loading state before i18n readiness, otherwise the child tree.
 */
function I18nBootstrap({ children }: I18nBootstrapProps): React.JSX.Element {
  /** @brief i18n 是否已经就绪 / Whether i18n is already ready. */
  const [isReady, setReady] = useState(appI18n.isInitialized)

  useEffect((): (() => void) => {
    /** @brief effect 是否仍有效 / Whether the effect remains active. */
    let active = true

    void appI18nReady.then((): void => {
      if (active) {
        setReady(true)
      }
    })

    return (): void => {
      active = false
    }
  }, [])

  if (!isReady) {
    return (
      <div className="aw-page">
        <LoadingState
          label={appI18n.t('status.loadingInterface', {
            defaultValue: 'Loading interface language…'
          })}
        />
      </div>
    )
  }

  return <>{children}</>
}

/** @brief 路由异步加载边界属性 / Async route-loading boundary properties. */
interface RouteLoadingBoundaryProps {
  /** @brief 当前路由的异步内容 / Async content for the current route. */
  readonly children: ReactNode
}

/**
 * @brief 在保留应用外壳时播报路由加载状态 / Announce route loading while preserving the app shell.
 * @param props 异步路由边界属性 / Async route-boundary properties.
 * @return 带可访问加载后备的 Suspense 边界 / Suspense boundary with an accessible loading fallback.
 */
function RouteLoadingBoundary({ children }: RouteLoadingBoundaryProps): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="aw-page">
          <LoadingState
            label={appI18n.t('common.loading', {
              defaultValue: 'Loading…'
            })}
          />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

/** @brief 共享工作区应用属性 / Shared workspace-app properties. */
export interface WorkspaceAppProps {
  /** @brief 由宿主显式实现的产物保存端口 / Artifact-save port explicitly implemented by the host. */
  readonly artifactSave: ArtifactSavePort
  /** @brief 由运行时显式装配的数据 gateway / Data gateways explicitly composed by the runtime. */
  readonly gateways: AppGateways
  /** @brief 由运行时显式装配的结构化诊断端口 / Structured diagnostics port explicitly composed by the runtime. */
  readonly diagnostics: Diagnostics
  /** @brief 由宿主组合根确认的运行时信息 / Runtime information confirmed by the host composition root. */
  readonly runtimeInfo: RuntimeInfo
  /** @brief 测试或嵌入场景中的初始路径 / Initial path for tests or embedding. */
  readonly initialPath?: string
}

/**
 * @brief 跨 Web 与 Electron renderer 的共享应用根 / Shared application root for Web and Electron renderer.
 * @param props 应用属性 / Application properties.
 * @return 完整的路由化 React 产品界面 / Complete routed React product UI.
 * @note Electron renderer 不直接访问 Node.js；所有平台能力需经窄 bridge 另行注入。
 */
export function WorkspaceApp({
  artifactSave,
  diagnostics,
  gateways,
  initialPath,
  runtimeInfo
}: WorkspaceAppProps): React.JSX.Element {
  /** @brief 不依赖具体 router 的应用树 / Application tree independent of a concrete router. */
  const application = (
    <DiagnosticsProvider diagnostics={diagnostics}>
      <DiagnosticsBoundary>
        <DiagnosticsRuntimeObserver />
        <I18nBootstrap>
          <HostProvider artifactSave={artifactSave}>
            <AppDataProvider gateways={gateways}>
              <DiagnosticsRouteObserver />
              <Routes>
                <Route element={<WorkspaceShell runtimeInfo={runtimeInfo} />}>
                  <Route element={<WorkspaceHomePage />} path="/" />
                  <Route
                    element={
                      <RouteLoadingBoundary>
                        <ResumeRoutes />
                      </RouteLoadingBoundary>
                    }
                    path="/resumes/*"
                  />
                  <Route
                    element={
                      <RouteLoadingBoundary>
                        <InterviewRoutes />
                      </RouteLoadingBoundary>
                    }
                    path="/interviews/*"
                  />
                  <Route
                    element={
                      <RouteLoadingBoundary>
                        <KnowledgeRoutes />
                      </RouteLoadingBoundary>
                    }
                    path="/knowledge/*"
                  />
                  <Route
                    element={
                      <RouteLoadingBoundary>
                        <StateGalleryPage />
                      </RouteLoadingBoundary>
                    }
                    path="/states"
                  />
                </Route>
                <Route element={<Navigate replace to="/" />} path="*" />
              </Routes>
            </AppDataProvider>
          </HostProvider>
        </I18nBootstrap>
      </DiagnosticsBoundary>
    </DiagnosticsProvider>
  )

  if (initialPath !== undefined) {
    return <MemoryRouter initialEntries={[initialPath]}>{application}</MemoryRouter>
  }

  return <BrowserRouter>{application}</BrowserRouter>
}
