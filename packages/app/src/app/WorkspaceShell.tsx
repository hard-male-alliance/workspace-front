import type { LucideIcon } from 'lucide-react'
import {
  BookOpenText,
  BriefcaseBusiness,
  Database,
  LayoutDashboard,
  Moon,
  Plus,
  Sun
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import type { RuntimeInfo } from '@ai-job-workspace/platform'

import { LoadingState } from '../ui'
import { useAsyncResource, useWorkspaceSession } from './AppData'
import { useDiagnostics } from './Diagnostics'
import { ResourceErrorState } from './ResourceErrorState'
import type { WorkspaceSessionAccess } from './session/workspace-session'

/** @brief 主导航项 / Primary navigation item. */
interface NavigationItem {
  /** @brief 导航路径 / Navigation path. */
  readonly to: string
  /** @brief 本地化 key / Localization key. */
  readonly labelKey: string
  /** @brief 默认文字 / Default label. */
  readonly defaultLabel: string
  /** @brief 图标组件 / Icon component. */
  readonly icon: LucideIcon
}

/** @brief 主导航配置 / Primary navigation configuration. */
const navigationItems: readonly NavigationItem[] = [
  {
    to: '/',
    labelKey: 'nav.workspace',
    defaultLabel: '工作台',
    icon: LayoutDashboard
  },
  {
    to: '/resumes',
    labelKey: 'nav.resume',
    defaultLabel: '简历',
    icon: BookOpenText
  },
  {
    to: '/interviews',
    labelKey: 'nav.interview',
    defaultLabel: '面试',
    icon: BriefcaseBusiness
  },
  {
    to: '/knowledge',
    labelKey: 'nav.knowledge',
    defaultLabel: '知识库',
    icon: Database
  }
]

/** @brief 可选界面主题 / Selectable interface theme. */
type ThemeMode = 'dark' | 'light'

/** @brief 本地主题偏好键 / Local theme-preference key. */
const THEME_STORAGE_KEY = 'inkwell-theme'

/** @brief 初始主题读取结果 / Result of reading the initial theme. */
interface InitialThemeResult {
  /** @brief 可用的初始主题 / Usable initial theme. */
  readonly theme: ThemeMode
  /** @brief 浏览器主题存储是否可访问 / Whether browser theme storage was accessible. */
  readonly storageAvailable: boolean
}

/** @brief WorkspaceAccess 追加页的界面状态 / UI state of the WorkspaceAccess append operation. */
type WorkspacePageLoadState = 'idle' | 'loading' | 'error'

/** @brief 绑定到选择修订号的本地 WorkspaceAccess 快照 / Local WorkspaceAccess snapshot bound to a selection revision. */
interface WorkspaceAccessOverride {
  /** @brief 快照所属的 Workspace 选择修订号 / Workspace-selection revision owning the snapshot. */
  readonly selectionRevision: number
  /** @brief 追加页面后的完整会话快照 / Complete session snapshot after appending a page. */
  readonly value: WorkspaceSessionAccess
}

/**
 * @brief 读取本地主题与存储可用性，未设置时固定使用深色 / Read the local theme and storage availability, defaulting to dark.
 * @return 初始主题与存储状态 / Initial theme and storage state.
 */
function readInitialTheme(): InitialThemeResult {
  if (typeof window === 'undefined') {
    return { storageAvailable: true, theme: 'dark' }
  }

  try {
    return {
      storageAvailable: true,
      theme: window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
    }
  } catch {
    return { storageAvailable: false, theme: 'dark' }
  }
}

/**
 * @brief 根据当前 URL 推导顶部路径名称 / Derive the top-bar breadcrumb from the current URL.
 * @param pathname 当前路由路径 / Current route pathname.
 * @return 用户可见的简短路径名称 / A short user-visible breadcrumb.
 */
function getBreadcrumbKey(pathname: string): string {
  if (pathname === '/interviews') {
    return 'breadcrumbs.interviewHub'
  }

  if (pathname === '/interviews/new') {
    return 'breadcrumbs.interviewSetup'
  }

  if (pathname.includes('/template')) {
    return 'breadcrumbs.templateSettings'
  }

  if (pathname === '/resumes/new') {
    return 'breadcrumbs.resumeCreation'
  }

  if (pathname.includes('/resumes/')) {
    return 'breadcrumbs.resumeEditor'
  }

  if (pathname.includes('/summary')) {
    return 'breadcrumbs.interviewSummary'
  }

  if (pathname.includes('/interviews/')) {
    return 'breadcrumbs.interviewRoom'
  }

  if (pathname.includes('/visibility')) {
    return 'breadcrumbs.visibility'
  }

  if (pathname.startsWith('/knowledge')) {
    return 'breadcrumbs.knowledge'
  }

  return 'breadcrumbs.workspace'
}

/**
 * @brief 从真实显示名称提取头像首字 / Extract an avatar initial from the real display name.
 * @param displayName 后端返回的显示名称 / Display name returned by the backend.
 * @return 第一个 Unicode 字符；空名称时为空串 / First Unicode character, or an empty string for an empty name.
 */
function getUserInitial(displayName: string): string {
  return Array.from(displayName.trim()).at(0) ?? ''
}

/** @brief 共享工作区页面框架属性 / Shared workspace-shell properties. */
export interface WorkspaceShellProps {
  /** @brief 由宿主组合根确认的运行时信息 / Runtime information confirmed by the host composition root. */
  readonly runtimeInfo: RuntimeInfo
}

/**
 * @brief 共享工作区页面框架 / Shared workspace page shell.
 * @param props 页面框架属性 / Shell properties.
 * @return 含导航、语言切换与路由出口的跨端框架 / Cross-platform shell with navigation, locale switcher and route outlet.
 * @note 桌面 renderer 与 Web 均复用此组件；不依赖 Electron、全局 bridge 或 Node.js API。
 */
export function WorkspaceShell({ runtimeInfo }: WorkspaceShellProps): React.JSX.Element {
  /** @brief i18n 翻译实例 / i18n translation instance. */
  const { i18n, t } = useTranslation()
  /** @brief 当前路由位置 / Current route location. */
  const location = useLocation()
  /** @brief 待切换到的 UI 语言 / UI locale to switch to. */
  const nextLocale = i18n.language === 'en-US' ? 'zh-SG' : 'en-US'
  /** @brief 应用诊断端口 / Application diagnostics port. */
  const diagnostics = useDiagnostics()
  /** @brief 应用生命周期内缓存的 Workspace 会话 / Workspace session cached for the application lifecycle. */
  const workspaceSession = useWorkspaceSession()
  /** @brief 当前 Workspace 选择修订号；变化时隔离并重载租户资源 / Current selection revision; changes isolate and reload tenant resources. */
  const workspaceSelectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 稳定的 Workspace 启动权威读取 / Stable Workspace bootstrap-authority read. */
  const loadWorkspaceAccess = useCallback(
    async (signal: AbortSignal): Promise<WorkspaceSessionAccess> => {
      /** @brief 会话中缓存或读取的 WorkspaceAccess 快照 / WorkspaceAccess snapshot cached or read by the session. */
      const access = await workspaceSession.getAccess()
      signal.throwIfAborted()
      return access
    },
    [workspaceSession]
  )
  /** @brief Shell 消费的真实当前用户与工作区状态 / Real current-user and Workspace state consumed by the shell. */
  const workspaceAccess = useAsyncResource(
    'workspace.session',
    loadWorkspaceAccess,
    workspaceSelectionRevision
  )
  /** @brief 主题存储的首次读取结果 / First theme-storage read result. */
  const [initialTheme] = useState<InitialThemeResult>(readInitialTheme)
  /** @brief 当前界面主题 / Current interface theme. */
  const [theme, setTheme] = useState<ThemeMode>(initialTheme.theme)
  /** @brief Workspace 选择失败的安全用户提示 / Safe user-facing Workspace-selection failure. */
  const [workspaceSelectionFailed, setWorkspaceSelectionFailed] = useState(false)
  /** @brief 当前 WorkspaceAccess 追加页状态 / Current WorkspaceAccess append-page state. */
  const [workspacePageLoadState, setWorkspacePageLoadState] =
    useState<WorkspacePageLoadState>('idle')
  /** @brief 不触发 Shell 全屏 loading 的追加页快照 / Append-page snapshot that avoids a full-shell loading transition. */
  const [workspaceAccessOverride, setWorkspaceAccessOverride] = useState<WorkspaceAccessOverride>()
  /** @brief 当前追加页请求的取消控制器 / Cancellation controller for the current append-page request. */
  const workspacePageController = useRef<AbortController | null>(null)

  /** @brief 当前 render 可见的 WorkspaceAccess 快照 / WorkspaceAccess snapshot visible in the current render. */
  const visibleWorkspaceAccess =
    workspaceAccess.status === 'ready'
      ? workspaceAccessOverride?.selectionRevision === workspaceSelectionRevision
        ? workspaceAccessOverride.value
        : workspaceAccess.data
      : undefined

  useEffect((): void => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect((): void => {
    if (!initialTheme.storageAvailable) {
      diagnostics.emit('preference.theme_storage_unavailable', {})
    }
  }, [diagnostics, initialTheme.storageAvailable])

  useEffect(
    (): (() => void) => (): void => {
      workspacePageController.current?.abort(
        new DOMException('Workspace shell was unmounted.', 'AbortError')
      )
    },
    []
  )

  /** @brief 使用服务端 cursor 追加下一页 WorkspaceAccess / Append the next WorkspaceAccess page with the server cursor. */
  const loadMoreWorkspaceAccesses = useCallback((): void => {
    if (
      visibleWorkspaceAccess === undefined ||
      !visibleWorkspaceAccess.hasMoreWorkspaces ||
      workspacePageLoadState === 'loading' ||
      workspacePageController.current !== null
    ) {
      return
    }

    /** @brief 本轮追加页请求控制器 / Controller for this append-page request. */
    const controller = new AbortController()
    workspacePageController.current = controller
    setWorkspacePageLoadState('loading')

    void workspaceSession
      .loadMoreWorkspaceAccesses(controller.signal)
      .then((value): void => {
        if (workspacePageController.current !== controller || controller.signal.aborted) return
        setWorkspaceAccessOverride({ selectionRevision: workspaceSelectionRevision, value })
        setWorkspacePageLoadState('idle')
      })
      .catch((): void => {
        if (workspacePageController.current !== controller || controller.signal.aborted) return
        setWorkspacePageLoadState('error')
      })
      .finally((): void => {
        if (workspacePageController.current === controller) {
          workspacePageController.current = null
        }
      })
  }, [visibleWorkspaceAccess, workspacePageLoadState, workspaceSelectionRevision, workspaceSession])

  /** @brief 当前追加页动作的本地化标签 / Localized label of the current append-page action. */
  const workspacePageActionLabel =
    workspacePageLoadState === 'loading'
      ? t('account.loadingMoreWorkspaces', { defaultValue: '正在加载更多工作区…' })
      : workspacePageLoadState === 'error'
        ? t('account.retryMoreWorkspaces', { defaultValue: '重试加载工作区' })
        : t('account.loadMoreWorkspaces', { defaultValue: '加载更多工作区' })

  /** @brief 切换并保存本地主题 / Toggle and persist the local theme. */
  const toggleTheme = (): void => {
    /** @brief 下一主题 / Next theme. */
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'

    setTheme(nextTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      diagnostics.emit('preference.theme_storage_unavailable', {})
    }
    diagnostics.emit('preference.theme_changed', { theme: nextTheme })
  }

  return (
    <div
      className="aw-shell"
      data-runtime-platform={runtimeInfo.platform}
      data-runtime-version={runtimeInfo.appVersion}
    >
      <aside aria-label={t('nav.primary', { defaultValue: '主导航' })} className="aw-sidebar">
        <Link
          aria-label={t('app.homeAria', { defaultValue: 'Inkwell 工作区首页' })}
          className="aw-brand"
          to="/"
        >
          <span aria-hidden="true" className="aw-brand-mark">
            墨
          </span>
          <span className="aw-brand-text">Inkwell</span>
        </Link>
        <div className="aw-sidebar-label">
          {t('nav.workspaceGroup', { defaultValue: '工作区' })}
        </div>
        <nav className="aw-sidebar-group">
          {navigationItems.map((item) => {
            /** @brief 导航图标组件 / Navigation icon component. */
            const Icon = item.icon
            return (
              <NavLink
                aria-label={t(item.labelKey, { defaultValue: item.defaultLabel })}
                className={({ isActive }): string =>
                  isActive ? 'aw-nav-link aw-nav-link--active' : 'aw-nav-link'
                }
                end={item.to === '/' || item.to === '/knowledge'}
                key={item.to}
                to={item.to}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={1.75} />
                <span>{t(item.labelKey, { defaultValue: item.defaultLabel })}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="aw-sidebar-spacer" />
        <div className="aw-account">
          <span aria-hidden="true" className="aw-avatar">
            {workspaceAccess.status === 'ready'
              ? getUserInitial(workspaceAccess.data.currentUser.displayName)
              : ''}
          </span>
          <div className="aw-account-copy">
            {workspaceAccess.status === 'loading' ? (
              <strong role="status">
                {t('account.loading', { defaultValue: '正在加载账户…' })}
              </strong>
            ) : workspaceAccess.status === 'error' ? (
              <strong>{t('account.unavailable', { defaultValue: '账户信息暂时不可用' })}</strong>
            ) : (
              <>
                <strong title={workspaceAccess.data.currentUser.displayName}>
                  {workspaceAccess.data.currentUser.displayName}
                </strong>
                {visibleWorkspaceAccess?.accesses.length === 0 ? (
                  <span>{t('account.noWorkspace', { defaultValue: '暂无可用工作区' })}</span>
                ) : visibleWorkspaceAccess?.currentWorkspaceAccess === undefined ? (
                  <span>{t('account.selectWorkspace', { defaultValue: '请选择工作区' })}</span>
                ) : (
                  <span title={visibleWorkspaceAccess.currentWorkspaceAccess.workspace.name}>
                    {visibleWorkspaceAccess.currentWorkspaceAccess.workspace.name}
                  </span>
                )}
                {visibleWorkspaceAccess?.currentWorkspaceAccess === undefined ? null : (
                  <span className="aw-workspace-access-brief">
                    {t(
                      `workspace.access.roles.${visibleWorkspaceAccess.currentWorkspaceAccess.role}`,
                      { defaultValue: visibleWorkspaceAccess.currentWorkspaceAccess.role }
                    )}{' '}
                    ·{' '}
                    {t(
                      `workspace.access.plans.${visibleWorkspaceAccess.currentWorkspaceAccess.workspace.plan}`,
                      { defaultValue: visibleWorkspaceAccess.currentWorkspaceAccess.workspace.plan }
                    )}{' '}
                    ·{' '}
                    {t(
                      `workspace.access.dataRegions.${visibleWorkspaceAccess.currentWorkspaceAccess.workspace.dataRegion}`,
                      {
                        defaultValue:
                          visibleWorkspaceAccess.currentWorkspaceAccess.workspace.dataRegion
                      }
                    )}
                  </span>
                )}
                {runtimeInfo.platform === 'electron' ? (
                  <span>{t('account.desktop', { defaultValue: '桌面版' })}</span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </aside>
      <main className="aw-main">
        <header className="aw-topbar">
          <span className="aw-breadcrumb">
            {t(getBreadcrumbKey(location.pathname), { defaultValue: 'Workspace' })}
          </span>
          <div className="aw-topbar-actions">
            {workspaceAccess.status === 'ready' && visibleWorkspaceAccess !== undefined ? (
              <div className="aw-workspace-controls">
                {visibleWorkspaceAccess.accesses.length === 0 ? null : (
                  <label className="aw-topbar-workspace-picker">
                    <span className="aw-sr-only">
                      {t('account.currentWorkspace', { defaultValue: '当前工作区' })}
                    </span>
                    <select
                      aria-label={t('account.currentWorkspace', { defaultValue: '当前工作区' })}
                      onChange={(event): void => {
                        /** @brief 用户显式选择的 Workspace ID / Workspace ID explicitly selected by the user. */
                        const workspaceId = event.currentTarget
                          .value as (typeof workspaceAccess.data.accesses)[number]['workspace']['id']
                        setWorkspaceSelectionFailed(false)
                        void workspaceSession.selectWorkspace(workspaceId).catch((): void => {
                          setWorkspaceSelectionFailed(true)
                        })
                      }}
                      value={visibleWorkspaceAccess.currentWorkspaceAccess?.workspace.id ?? ''}
                    >
                      <option disabled value="">
                        {t('account.selectWorkspace', { defaultValue: '请选择工作区' })}
                      </option>
                      {visibleWorkspaceAccess.accesses.map((access) => (
                        <option key={access.workspace.id} value={access.workspace.id}>
                          {access.workspace.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {visibleWorkspaceAccess.hasMoreWorkspaces ? (
                  <button
                    aria-busy={workspacePageLoadState === 'loading'}
                    aria-label={workspacePageActionLabel}
                    className="aw-workspace-load-more"
                    disabled={workspacePageLoadState === 'loading'}
                    onClick={loadMoreWorkspaceAccesses}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={14} />
                    <span>{workspacePageActionLabel}</span>
                  </button>
                ) : null}
                {workspaceSelectionFailed ? (
                  <span className="aw-sr-only" role="alert">
                    {t('account.workspaceSelectionFailed', {
                      defaultValue: '无法切换工作区，请刷新访问权限后重试。'
                    })}
                  </span>
                ) : null}
                {workspacePageLoadState === 'error' ? (
                  <span className="aw-workspace-page-error" role="alert">
                    {t('account.loadMoreWorkspacesError', {
                      defaultValue: '无法加载更多工作区，请重试。'
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              aria-describedby="workspace-feedback-unavailable"
              aria-disabled="true"
              className="aw-quiet-button aw-discoverable-disabled"
              title={t('topbar.feedbackUnavailable', {
                defaultValue: '反馈功能正在准备中，目前无法提交。'
              })}
              type="button"
            >
              {t('topbar.feedback', { defaultValue: '反馈' })}
            </button>
            <span className="aw-sr-only" id="workspace-feedback-unavailable">
              {t('topbar.feedbackUnavailable', {
                defaultValue: '反馈功能正在准备中，目前无法提交。'
              })}
            </span>
            <button
              aria-label={
                theme === 'dark'
                  ? t('topbar.switchToLight', { defaultValue: '切换为浅色主题' })
                  : t('topbar.switchToDark', { defaultValue: '切换为深色主题' })
              }
              className="aw-icon-button"
              onClick={toggleTheme}
              type="button"
            >
              {theme === 'dark' ? (
                <Sun aria-hidden="true" size={16} />
              ) : (
                <Moon aria-hidden="true" size={16} />
              )}
            </button>
            <button
              aria-label={t('topbar.changeLocale', { defaultValue: '切换界面语言' })}
              className="aw-locale-button"
              onClick={(): void => {
                void i18n.changeLanguage(nextLocale)
              }}
              type="button"
            >
              {nextLocale === 'en-US' ? 'EN' : '中文'}
            </button>
          </div>
        </header>
        {workspaceAccess.status === 'loading' ? (
          <div className="aw-page">
            <LoadingState
              label={t('status.loadingWorkspace', { defaultValue: '正在加载工作区…' })}
            />
          </div>
        ) : workspaceAccess.status === 'error' ? (
          <div className="aw-page">
            <ResourceErrorState
              error={workspaceAccess.error}
              onRetry={workspaceAccess.retry}
              title={t('status.errorWorkspace', { defaultValue: '无法加载工作区' })}
            />
          </div>
        ) : visibleWorkspaceAccess?.currentWorkspaceAccess === undefined ? (
          <div className="aw-page aw-empty-page">
            <h1 className="aw-page-title">
              {visibleWorkspaceAccess?.accesses.length === 0 &&
              !visibleWorkspaceAccess.hasMoreWorkspaces
                ? t('workspace.selection.noneTitle', { defaultValue: '没有可用工作区' })
                : t('workspace.selection.title', { defaultValue: '选择工作区' })}
            </h1>
            <p className="aw-page-description">
              {visibleWorkspaceAccess?.accesses.length === 0 &&
              !visibleWorkspaceAccess.hasMoreWorkspaces
                ? t('workspace.selection.noneDescription', {
                    defaultValue: '当前账户没有可访问的工作区，无法加载简历和其他工作区内容。'
                  })
                : t('workspace.selection.description', {
                    defaultValue:
                      '请先在账户区域选择已加载的工作区；如未看到目标工作区，请继续加载访问列表。'
                  })}
            </p>
          </div>
        ) : (
          <Outlet key={workspaceSelectionRevision} />
        )}
      </main>
    </div>
  )
}
