/** @file 跨宿主 hosted identity 入口语义 / Cross-host hosted-identity entry semantics. */

/** @brief Hosted identity 页面提示；只影响界面入口，不改变 OAuth 安全语义 / Hosted-identity screen hint that affects only the UI entry, never OAuth security semantics. */
export type HostedIdentityScreenHint = 'login' | 'recovery' | 'signup'

/** @brief 跨宿主 hosted authentication 的低基数失败原因 / Low-cardinality failure reason for hosted authentication across hosts. */
export type HostedAuthenticationFailureReason =
  'cancelled' | 'failed' | 'persistent-login-unsupported' | 'secure-storage-unavailable'
