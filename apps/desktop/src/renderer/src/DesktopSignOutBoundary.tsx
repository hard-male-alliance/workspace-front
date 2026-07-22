/** @file Electron 登出期间的本地锁定边界 / Local lock boundary while Electron sign-out is being finalized. */

import type { DesktopSignOutBoundaryMode } from './desktop-sign-out'

/** @brief Electron 登出边界属性 / Electron sign-out boundary properties. */
export interface DesktopSignOutBoundaryProps {
  /** @brief 当前低基数阶段 / Current low-cardinality phase. */
  readonly mode: DesktopSignOutBoundaryMode
  /** @brief 宿主提供的 locale / Locale supplied by the host. */
  readonly locale: string
  /** @brief 用户显式重试持久清理 / Explicitly retry durable cleanup. */
  readonly onRetry: () => void
}

/** @brief 登出锁定页文案 / Sign-out lock-screen copy. */
interface DesktopSignOutBoundaryCopy {
  /** @brief 清理中说明 / Clearing-state explanation. */
  readonly clearingMessage: string
  /** @brief 清理中标题 / Clearing-state title. */
  readonly clearingTitle: string
  /** @brief 页面语言 / Page language. */
  readonly language: 'en' | 'zh'
  /** @brief 阻断说明 / Blocking explanation. */
  readonly lockedMessage: string
  /** @brief 阻断标题 / Blocking title. */
  readonly lockedTitle: string
  /** @brief 重试按钮 / Retry button label. */
  readonly retry: string
}

/** @brief 中英文登出锁定文案 / Chinese and English sign-out lock copy. */
const DESKTOP_SIGN_OUT_BOUNDARY_COPY: Readonly<
  Record<DesktopSignOutBoundaryCopy['language'], DesktopSignOutBoundaryCopy>
> = {
  en: {
    clearingMessage:
      'The Access Token has been removed from this window. The host is now deleting the persistent sign-in grant.',
    clearingTitle: 'Signing out securely',
    language: 'en',
    lockedMessage:
      'The Access Token has been removed, but the host could not confirm that the persistent sign-in grant was durably deleted. The workspace remains locked. Retry cleanup before continuing.',
    lockedTitle: 'Workspace locked',
    retry: 'Retry secure cleanup'
  },
  zh: {
    clearingMessage: '本窗口的 Access Token 已清除，宿主正在删除持久登录授权。',
    clearingTitle: '正在安全退出',
    language: 'zh',
    lockedMessage:
      '本窗口的 Access Token 已清除，但宿主无法确认持久登录授权已持久删除。工作区将保持锁定；请在继续前重试清理。',
    lockedTitle: '工作区已锁定',
    retry: '重试安全清理'
  }
}

/**
 * @brief 选择不依赖产品 i18n 容器的登出文案 / Select sign-out copy without depending on the product i18n container.
 * @param locale 宿主 locale / Host locale.
 * @return zh 前缀使用中文，其余回退英文 / Chinese for a zh prefix, otherwise English.
 */
function selectDesktopSignOutBoundaryCopy(locale: string): DesktopSignOutBoundaryCopy {
  return locale.trim().toLowerCase().startsWith('zh')
    ? DESKTOP_SIGN_OUT_BOUNDARY_COPY.zh
    : DESKTOP_SIGN_OUT_BOUNDARY_COPY.en
}

/**
 * @brief 在 renderer 凭据已清除后阻断产品并完成宿主登出 / Block the product after renderer credentials are cleared and finalize host sign-out.
 * @param props 阶段、locale 与重试动作 / Phase, locale, and retry action.
 * @return 可访问的登出锁定页 / Accessible sign-out lock screen.
 */
export function DesktopSignOutBoundary({
  locale,
  mode,
  onRetry
}: DesktopSignOutBoundaryProps): React.JSX.Element {
  /** @brief 已选择文案 / Selected copy. */
  const copy = selectDesktopSignOutBoundaryCopy(locale)
  /** @brief 当前标题 / Current title. */
  const title = mode === 'locked' ? copy.lockedTitle : copy.clearingTitle
  /** @brief 当前说明 / Current explanation. */
  const message = mode === 'locked' ? copy.lockedMessage : copy.clearingMessage

  return (
    <main className="aw-hosted-auth-shell" lang={copy.language}>
      <section
        aria-labelledby="desktop-sign-out-title"
        className="aw-hosted-auth-card"
        role={mode === 'locked' ? 'alert' : 'status'}
      >
        <div aria-hidden="true" className="aw-hosted-auth-mark">
          I
        </div>
        <p className="aw-hosted-auth-eyebrow">Inkwell · Job Workspace</p>
        <h1 id="desktop-sign-out-title">{title}</h1>
        <p className="aw-hosted-auth-description">{message}</p>
        {mode === 'locked' ? (
          <button className="aw-hosted-auth-primary" onClick={onRetry} type="button">
            {copy.retry}
          </button>
        ) : null}
      </section>
    </main>
  )
}
