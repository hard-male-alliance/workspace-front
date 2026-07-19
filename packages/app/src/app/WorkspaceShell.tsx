import type { LucideIcon } from 'lucide-react'
import { BookOpenText, BriefcaseBusiness, Database, LayoutDashboard, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useRuntimeInfo } from './runtime'

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

/**
 * @brief 读取本地主题，未设置时固定使用深色 / Read the local theme, defaulting to dark.
 * @return 当前可用主题 / Current usable theme.
 */
function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
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

  if (pathname.startsWith('/states')) {
    return 'breadcrumbs.states'
  }

  return 'breadcrumbs.workspace'
}

/**
 * @brief 共享工作区页面框架 / Shared workspace page shell.
 * @return 含导航、语言切换与路由出口的跨端框架 / Cross-platform shell with navigation, locale switcher and route outlet.
 * @note 桌面 renderer 与 Web 均复用此组件；不依赖 Electron 或 Node.js API。
 */
export function WorkspaceShell(): React.JSX.Element {
  /** @brief i18n 翻译实例 / i18n translation instance. */
  const { i18n, t } = useTranslation()
  /** @brief 当前路由位置 / Current route location. */
  const location = useLocation()
  /** @brief 待切换到的 UI 语言 / UI locale to switch to. */
  const nextLocale = i18n.language === 'en-US' ? 'zh-SG' : 'en-US'
  /** @brief 当前 renderer 已确认的宿主信息 / Host information confirmed for the current renderer. */
  const runtimeInfo = useRuntimeInfo()
  /** @brief 当前界面主题 / Current interface theme. */
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme)

  useEffect((): void => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  /** @brief 切换并保存本地主题 / Toggle and persist the local theme. */
  const toggleTheme = (): void => {
    /** @brief 下一主题 / Next theme. */
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'

    setTheme(nextTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Storage can be unavailable in privacy-restricted renderers; the in-memory theme still works.
    }
  }

  return (
    <div
      className="aw-shell"
      data-runtime-platform={runtimeInfo?.platform ?? 'loading'}
      data-runtime-version={runtimeInfo?.appVersion ?? ''}
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
            K
          </span>
          <div>
            <strong>Klee</strong>
            <br />
            <span>
              {t('account.plan', { defaultValue: '个人工作区' })}
              {runtimeInfo?.platform === 'electron'
                ? ` · ${t('account.desktop', { defaultValue: '桌面版' })}`
                : ''}
            </span>
          </div>
        </div>
      </aside>
      <main className="aw-main">
        <header className="aw-topbar">
          <span className="aw-breadcrumb">
            {t(getBreadcrumbKey(location.pathname), { defaultValue: 'Workspace' })}
          </span>
          <div className="aw-topbar-actions">
            <button className="aw-quiet-button" type="button">
              {t('topbar.feedback', { defaultValue: '反馈' })}
            </button>
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
        <Outlet />
      </main>
    </div>
  )
}
