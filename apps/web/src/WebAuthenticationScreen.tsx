/** @file Web 登录、注册与恢复入口 / Web sign-in, registration, and recovery entry. */

import { useState } from 'react'
import type { WebAuthorizationScreenHint } from '@ai-job-workspace/product-api-v2'

import './web-auth.css'

/** @brief Web Authentication 页面属性 / Web Authentication screen properties. */
export interface WebAuthenticationScreenProps {
  /** @brief 上一次 callback 或协议失败 / Previous callback or protocol failure. */
  readonly error?: unknown
  /** @brief 当前界面 locale / Current interface locale. */
  readonly locale: string
  /** @brief 发起 hosted authorization / Start hosted authorization. */
  readonly onAuthorize: (screenHint: WebAuthorizationScreenHint) => Promise<void>
}

/** @brief 当前授权导航状态 / Current authorization-navigation state. */
type AuthorizationNavigationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly screenHint: WebAuthorizationScreenHint }
  | { readonly kind: 'error' }

/**
 * @brief 呈现不处理凭证的 hosted identity 入口 / Present hosted-identity entry points that never handle credentials.
 * @param props locale、失败状态与授权动作 / Locale, failure state, and authorization action.
 * @return 登录、注册与恢复选择界面 / Sign-in, registration, and recovery choices.
 */
export function WebAuthenticationScreen({
  error,
  locale,
  onAuthorize
}: WebAuthenticationScreenProps): React.JSX.Element {
  /** @brief 是否使用中文文案 / Whether to use Chinese copy. */
  const isChinese = locale.toLowerCase().startsWith('zh')
  /** @brief 当前授权导航状态 / Current authorization-navigation state. */
  const [navigation, setNavigation] = useState<AuthorizationNavigationState>({ kind: 'idle' })

  /** @brief 发起一次 hosted identity 导航 / Start one hosted-identity navigation. */
  async function authorize(screenHint: WebAuthorizationScreenHint): Promise<void> {
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
  const hasError = error !== undefined || navigation.kind === 'error'

  return (
    <main className="aw-web-auth-shell">
      <section aria-labelledby="web-auth-title" className="aw-web-auth-card">
        <div aria-hidden="true" className="aw-web-auth-mark">
          I
        </div>
        <p className="aw-web-auth-eyebrow">Inkwell · Job Workspace</p>
        <h1 id="web-auth-title">
          {isChinese ? '继续你的求职工作区' : 'Continue to your job workspace'}
        </h1>
        <p className="aw-web-auth-description">
          {isChinese
            ? '登录由安全的身份服务完成；本页面不会接触你的密码、验证码或通行密钥。'
            : 'Sign-in is handled by the secure identity service. This page never handles your password, code, or passkey.'}
        </p>

        {hasError ? (
          <div className="aw-web-auth-error" role="alert">
            <strong>{isChinese ? '未能完成身份验证' : 'Authentication was not completed'}</strong>
            <span>
              {isChinese
                ? '授权可能已过期、被取消或网络暂时不可用。请重新开始。'
                : 'The request may have expired, been cancelled, or hit a temporary network failure. Start again.'}
            </span>
          </div>
        ) : null}

        <div className="aw-web-auth-actions">
          <button
            className="aw-web-auth-primary"
            disabled={isLoading}
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
            className="aw-web-auth-secondary"
            disabled={isLoading}
            onClick={() => void authorize('signup')}
            type="button"
          >
            {isChinese ? '创建账户' : 'Create account'}
          </button>
        </div>
        <button
          className="aw-web-auth-recovery"
          disabled={isLoading}
          onClick={() => void authorize('recovery')}
          type="button"
        >
          {isChinese ? '无法登录？恢复账户' : 'Cannot sign in? Recover account'}
        </button>
      </section>
    </main>
  )
}
