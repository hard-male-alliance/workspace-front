import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from './AppData'
import type { AppGateways } from './AppData'
import { WorkspaceShell } from './WorkspaceShell'
import { appI18n, appI18nReady } from '../i18n'
import {
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from '../infrastructure/mock'
import { InterviewRoomPage } from '../features/interview/InterviewRoomPage'
import { InterviewSummaryPage } from '../features/interview/InterviewSummaryPage'
import { InterviewHubPage } from '../features/interview/InterviewHubPage'
import { InterviewSetupPage } from '../features/interview/InterviewSetupPage'
import { KnowledgePage } from '../features/knowledge/KnowledgePage'
import { KnowledgeVisibilityPage } from '../features/knowledge/KnowledgeVisibilityPage'
import { ResumeEditorPage } from '../features/resume/ResumeEditorPage'
import { TemplateSettingsPage } from '../features/resume/TemplateSettingsPage'
import { StateGalleryPage } from '../features/states/StateGalleryPage'
import { WorkspaceHomePage } from '../features/workspace/WorkspaceHomePage'
import { LoadingState } from '../ui'
import '../styles/app.css'

/**
 * @brief 创建默认的演示数据 gateway / Create the default demo data gateways.
 * @return 明确标注为 Mock 的 gateway 集合 / Gateway collection explicitly marked as Mock.
 * @note 真实 HTTP/SSE/WebRTC 适配器须在正式契约入口冻结后通过 props 注入；此函数不伪造 transport。
 */
function createMockGateways(): AppGateways {
  return {
    workspace: new MockWorkspaceGateway(),
    resume: new MockResumeGateway(),
    interview: new MockInterviewGateway(),
    knowledge: new MockKnowledgeGateway()
  }
}

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

/** @brief 共享工作区应用属性 / Shared workspace-app properties. */
export interface WorkspaceAppProps {
  /** @brief 可替换的数据 gateway；缺省时使用明确的 Mock 实现 / Replaceable data gateways; explicit Mocks are used by default. */
  readonly gateways?: AppGateways
  /** @brief 测试或嵌入场景中的初始路径 / Initial path for tests or embedding. */
  readonly initialPath?: string
}

/**
 * @brief 跨 Web 与 Electron renderer 的共享应用根 / Shared application root for Web and Electron renderer.
 * @param props 应用属性 / Application properties.
 * @return 完整的路由化 React 产品界面 / Complete routed React product UI.
 * @note Electron renderer 不直接访问 Node.js；所有平台能力需经窄 bridge 另行注入。
 */
export function WorkspaceApp({ gateways, initialPath }: WorkspaceAppProps): React.JSX.Element {
  /** @brief 当前运行时的数据 gateway / Data gateways for the current runtime. */
  const resolvedGateways = useMemo(() => gateways ?? createMockGateways(), [gateways])
  /** @brief 不依赖具体 router 的应用树 / Application tree independent of a concrete router. */
  const application = (
    <I18nBootstrap>
      <AppDataProvider gateways={resolvedGateways}>
        <Routes>
          <Route element={<WorkspaceShell />}>
            <Route element={<WorkspaceHomePage />} path="/" />
            <Route element={<ResumeEditorPage />} path="/resumes/:resumeId/edit" />
            <Route element={<TemplateSettingsPage />} path="/resumes/:resumeId/template" />
            <Route element={<InterviewHubPage />} path="/interviews" />
            <Route element={<InterviewSetupPage />} path="/interviews/new" />
            <Route element={<InterviewRoomPage />} path="/interviews/:sessionId" />
            <Route element={<InterviewSummaryPage />} path="/interviews/:sessionId/summary" />
            <Route element={<KnowledgePage />} path="/knowledge" />
            <Route element={<KnowledgeVisibilityPage />} path="/knowledge/:sourceId/visibility" />
            <Route element={<StateGalleryPage />} path="/states" />
          </Route>
          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </AppDataProvider>
    </I18nBootstrap>
  )

  if (initialPath !== undefined) {
    return <MemoryRouter initialEntries={[initialPath]}>{application}</MemoryRouter>
  }

  return <BrowserRouter>{application}</BrowserRouter>
}
