/** @file Electron renderer 可见的封闭认证桥接契约 / Closed authentication bridge contract visible to the Electron renderer. */

import type { HostedAuthenticationFailureReason, HostedIdentityScreenHint } from './hosted-identity'

/** @brief renderer 内存可见的已认证会话 / Authenticated session visible only in renderer memory. */
export interface DesktopAuthenticatedSession {
  /** @brief 已认证判别字段 / Authenticated discriminator. */
  readonly kind: 'authenticated'
  /** @brief 只允许驻留 renderer 内存的短期 Access Token / Short-lived Access Token confined to renderer memory. */
  readonly accessToken: string
  /** @brief Access Token 到期 epoch 秒 / Access Token expiration in epoch seconds. */
  readonly expiresAtEpochSeconds: number
  /** @brief 已授予且无重复的 OAuth scopes / Granted, duplicate-free OAuth scopes. */
  readonly scopes: readonly string[]
  /** @brief 已验证 OIDC subject；不含个人资料 / Verified OIDC subject without profile data. */
  readonly subject: string
}

/** @brief renderer 可见的匿名会话 / Anonymous session visible to the renderer. */
export interface DesktopAnonymousSession {
  /** @brief 匿名判别字段 / Anonymous discriminator. */
  readonly kind: 'anonymous'
}

/** @brief Electron 认证会话投影；永不包含长期凭据 / Electron authentication projection that never contains long-lived credentials. */
export type DesktopAuthenticationSession = DesktopAuthenticatedSession | DesktopAnonymousSession

/** @brief 认证命令的低基数安全失败原因 / Low-cardinality safe failure reason for an authentication command. */
export type DesktopAuthenticationFailureReason = HostedAuthenticationFailureReason

/** @brief Electron 认证命令结果 / Electron authentication command result. */
export type DesktopAuthenticationResult =
  | { readonly kind: 'success'; readonly session: DesktopAuthenticationSession }
  | { readonly kind: 'failure'; readonly reason: DesktopAuthenticationFailureReason }

/** @brief Electron preload 暴露的封闭认证端口 / Closed authentication port exposed by the Electron preload. */
export interface DesktopAuthenticationBridge {
  /**
   * @brief 读取启动恢复后的会话投影 / Read the session projection after startup recovery.
   * @return 不含 Refresh Token 的会话结果 / Session result without a Refresh Token.
   */
  readonly getSession: () => Promise<DesktopAuthenticationResult>
  /**
   * @brief 通过系统浏览器发起一次授权 / Start one authorization in the system browser.
   * @param screenHint hosted identity 页面提示 / Hosted-identity screen hint.
   * @return 授权后的短期会话或安全失败 / Short-lived session after authorization, or a safe failure.
   */
  readonly authorize: (screenHint: HostedIdentityScreenHint) => Promise<DesktopAuthenticationResult>
  /**
   * @brief 按资源服务器观察条件刷新会话 / Refresh conditionally from a resource-server observation.
   * @param rejectedAccessToken 被拒绝的当前 token；无凭证时为 null / Rejected current token, or null when no credential was available.
   * @return 轮换后的短期会话或安全失败 / Rotated short-lived session, or a safe failure.
   */
  readonly refresh: (rejectedAccessToken: string | null) => Promise<DesktopAuthenticationResult>
  /**
   * @brief 本地登出并尽力撤销服务端凭据 / Sign out locally and best-effort revoke the server credential.
   * @return 匿名会话或本地清理失败 / Anonymous session, or a local-clearing failure.
   */
  readonly signOut: () => Promise<DesktopAuthenticationResult>
}

/** @brief 查询认证会话的 IPC 通道 / IPC channel for reading the authentication session. */
export const DESKTOP_AUTH_GET_SESSION_CHANNEL = 'authentication:get-session' as const

/** @brief 发起 native OAuth 的 IPC 通道 / IPC channel for starting native OAuth. */
export const DESKTOP_AUTH_AUTHORIZE_CHANNEL = 'authentication:authorize' as const

/** @brief 轮换 Refresh Token 的 IPC 通道 / IPC channel for rotating the Refresh Token. */
export const DESKTOP_AUTH_REFRESH_CHANNEL = 'authentication:refresh' as const

/** @brief 本地登出与尽力撤销的 IPC 通道 / IPC channel for local logout and best-effort revocation. */
export const DESKTOP_AUTH_SIGN_OUT_CHANNEL = 'authentication:sign-out' as const
