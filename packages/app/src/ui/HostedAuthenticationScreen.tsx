/** @file Web 与 Electron 共享的 hosted identity 入口 / Hosted-identity entry shared by Web and Electron. */

import { useState } from 'react'
import type {
  HostedAuthenticationFailureReason,
  HostedIdentityScreenHint
} from '@ai-job-workspace/platform'

import '../styles/shared-ui/hosted-authentication.css'

/** @brief Hosted authentication 页面属性 / Hosted-authentication screen properties. */
export interface HostedAuthenticationScreenProps {
  /** @brief 宿主确认的低基数失败原因 / Low-cardinality failure reason confirmed by the host. */
  readonly failureReason?: HostedAuthenticationFailureReason | undefined
  /** @brief 当前界面 locale / Current interface locale. */
  readonly locale: string
  /** @brief 发起 hosted authorization / Start hosted authorization. */
  readonly onAuthorize: (screenHint: HostedIdentityScreenHint) => Promise<void>
}

/** @brief 当前授权导航状态 / Current authorization-navigation state. */
type AuthorizationNavigationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly screenHint: HostedIdentityScreenHint }
  | { readonly kind: 'error' }

/**
 * @brief 呈现不处理凭证的共享 hosted identity 入口 / Present shared hosted-identity entry points that never handle credentials.
 * @param props locale、失败状态与授权动作 / Locale, failure state, and authorization action.
 * @return 登录、注册与恢复选择界面 / Sign-in, registration, and recovery choices.
 */
export function HostedAuthenticationScreen({
  failureReason,
  locale,
  onAuthorize
}: HostedAuthenticationScreenProps): React.JSX.Element {
  /** @brief 是否使用中文文案 / Whether to use Chinese copy. */
  const isChinese = locale.toLowerCase().startsWith('zh')
  /** @brief 当前授权导航状态 / Current authorization-navigation state. */
  const [navigation, setNavigation] = useState<AuthorizationNavigationState>({ kind: 'idle' })

  /**
   * @brief 发起一次 hosted identity 导航 / Start one hosted-identity navigation.
   * @param screenHint hosted 页面提示 / Hosted-page hint.
   */
  async function authorize(screenHint: HostedIdentityScreenHint): Promise<void> {
    if (navigation.kind === 'loading') return
    setNavigation({ kind: 'loading', screenHint })
    try {
      await onAuthorize(screenHint)
    } catch {
      setNavigation({ kind: 'error' })
    }
  }

  /** @brief 是否正在离开当前页面 / Whether navigation away from this page is in progress. */
  const isLoading = navigation.kind === 'loading'
  /** @brief 是否需要呈现可重试错误 / Whether a retryable error should be presented. */
  const visibleFailure = navigation.kind === 'error' ? ('failed' as const) : (failureReason ?? null)
  /** @brief 宿主是否明确禁用持久登录 / Whether the host explicitly disables persistent sign-in. */
  const isPersistentLoginUnsupported = visibleFailure === 'persistent-login-unsupported'

  return (
    <main className="aw-hosted-auth-shell">
      <section aria-labelledby="hosted-auth-title" className="aw-hosted-auth-card">
        <div aria-hidden="true" className="aw-hosted-auth-mark">
          I
        </div>
        <p className="aw-hosted-auth-eyebrow">Inkwell · Job Workspace</p>
        <h1 id="hosted-auth-title">
          {isChinese ? '继续你的求职工作区' : 'Continue to your job workspace'}
        </h1>
        <p className="aw-hosted-auth-description">
          {isChinese
            ? '登录由安全的身份服务完成；本页面不会接触你的密码、验证码或通行密钥。'
            : 'Sign-in is handled by the secure identity service. This page never handles your password, code, or passkey.'}
        </p>

        {visibleFailure !== null ? (
          <div className="aw-hosted-auth-error" role="alert">
            <strong>{isChinese ? '未能完成身份验证' : 'Authentication was not completed'}</strong>
            <span>
              {visibleFailure === 'persistent-login-unsupported'
                ? isChinese
                  ? '当前 Linux 桌面版无法证明持久登录凭据由系统密钥服务保护，因此已禁用桌面持久登录。请使用 Web 版或受支持的桌面系统。'
                  : 'Persistent desktop sign-in is disabled because this Linux host cannot prove that the system secret provider protects the credential. Use the Web app or a supported desktop system.'
                : visibleFailure === 'secure-storage-unavailable'
                  ? isChinese
                    ? '系统安全存储暂时不可用。请确认系统钥匙串或凭据服务可用后重试。'
                    : 'System secure storage is unavailable. Check the host keychain or credential service and try again.'
                  : visibleFailure === 'cancelled'
                    ? isChinese
                      ? '授权已取消。你可以随时重新开始。'
                      : 'Authorization was cancelled. You can start again at any time.'
                    : isChinese
                      ? '授权未完成或已过期。请重新开始。'
                      : 'Authorization was not completed or has expired. Start again.'}
            </span>
          </div>
        ) : null}

        <div className="aw-hosted-auth-actions">
          <button
            className="aw-hosted-auth-primary"
            disabled={isLoading || isPersistentLoginUnsupported}
            onClick={() => void authorize('login')}
            type="button"
          >
            {navigation.kind === 'loading' && navigation.screenHint === 'login'
              ? isChinese
                ? '正在前往登录…'
                : 'Opening sign in…'
              : isChinese
                ? '登录'
                : 'Sign in'}
          </button>
          <button
            className="aw-hosted-auth-secondary"
            disabled={isLoading || isPersistentLoginUnsupported}
            onClick={() => void authorize('signup')}
            type="button"
          >
            {isChinese ? '创建账户' : 'Create account'}
          </button>
        </div>
        <button
          className="aw-hosted-auth-recovery"
          disabled={isLoading || isPersistentLoginUnsupported}
          onClick={() => void authorize('recovery')}
          type="button"
        >
          {isChinese ? '无法登录？恢复账户' : 'Cannot sign in? Recover account'}
        </button>
      </section>
    </main>
  )
}
