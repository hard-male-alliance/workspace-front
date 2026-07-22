import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HostedAuthenticationScreen } from './HostedAuthenticationScreen'

/** @brief 测试授权动作 / Test authorization action. */
const authorize = (): Promise<void> => Promise.resolve()

describe('HostedAuthenticationScreen host-specific failures', (): void => {
  it('普通 Web/协议失败不会声称宿主使用系统安全存储', (): void => {
    /** @brief 普通失败页面 HTML / Generic-failure page HTML. */
    const html = renderToStaticMarkup(
      <HostedAuthenticationScreen failureReason="failed" locale="zh-CN" onAuthorize={authorize} />
    )

    expect(html).toContain('授权未完成或已过期')
    expect(html).not.toContain('系统安全存储')
    expect(html).not.toContain('钥匙串')
  })

  it('仅 secure-storage-unavailable 展示宿主凭据服务建议', (): void => {
    /** @brief 安全存储失败页面 HTML / Secure-storage-failure page HTML. */
    const html = renderToStaticMarkup(
      <HostedAuthenticationScreen
        failureReason="secure-storage-unavailable"
        locale="zh-CN"
        onAuthorize={authorize}
      />
    )

    expect(html).toContain('系统安全存储暂时不可用')
    expect(html).toContain('钥匙串')
  })

  it('Linux 持久登录不可证明时说明平台限制与替代入口', (): void => {
    /** @brief Linux 持久登录限制页 HTML / Linux persistent-login limitation page HTML. */
    const html = renderToStaticMarkup(
      <HostedAuthenticationScreen
        failureReason="persistent-login-unsupported"
        locale="zh-CN"
        onAuthorize={authorize}
      />
    )

    expect(html).toContain('Linux 桌面版')
    expect(html).toContain('已禁用桌面持久登录')
    expect(html).toContain('请使用 Web 版')
    expect(html.match(/disabled=""/gu)).toHaveLength(3)
    expect(html).not.toContain('系统安全存储暂时不可用')
  })
})
