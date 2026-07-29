/** @file Hosted identity 入口界面测试 / Hosted-identity entry-screen tests. */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebAuthenticationScreen } from './WebAuthenticationScreen'

afterEach(cleanup)

describe('WebAuthenticationScreen', (): void => {
  it.each([
    ['登录', 'login'],
    ['创建账户', 'signup']
  ] as const)(
    'routes %s to the hosted %s authorization flow',
    async (buttonName, screenHint): Promise<void> => {
      /** @brief 授权动作 spy / Authorization-action spy. */
      const onAuthorize = vi.fn((): Promise<void> => Promise.resolve())
      /** @brief 用户交互驱动 / User interaction driver. */
      const user = userEvent.setup()

      render(<WebAuthenticationScreen locale="zh-CN" onAuthorize={onAuthorize} />)

      expect(screen.getByText(/不会接触你的密码、验证码或通行密钥/u)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: buttonName }))
      expect(onAuthorize).toHaveBeenCalledWith(screenHint)
    }
  )

  it('does not present the unavailable account recovery entry', (): void => {
    /** @brief 授权动作 spy / Authorization-action spy. */
    const onAuthorize = vi.fn((): Promise<void> => Promise.resolve())

    render(<WebAuthenticationScreen locale="zh-CN" onAuthorize={onAuthorize} />)

    expect(screen.queryByRole('button', { name: '无法登录？恢复账户' })).not.toBeInTheDocument()
  })

  it('presents a safe retry state without reflecting protocol error details', async (): Promise<void> => {
    /** @brief 失败的授权动作 / Failing authorization action. */
    const onAuthorize = vi.fn((): Promise<void> => Promise.reject(new Error('secret detail')))
    /** @brief 用户交互驱动 / User interaction driver. */
    const user = userEvent.setup()

    render(
      <WebAuthenticationScreen failureReason="failed" locale="en-US" onAuthorize={onAuthorize} />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication was not completed')
    expect(document.body).not.toHaveTextContent('secure storage')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onAuthorize).toHaveBeenCalledWith('signup')
    expect(await screen.findByRole('alert')).toHaveTextContent('Start again')
  })

  it('keeps retry actions available when the OAuth service cannot be reached', async (): Promise<void> => {
    /** @brief 脱敏的 discovery 网络失败 / Sanitized discovery network failure. */
    const networkFailure = Object.assign(new Error('socket closed'), {
      kind: 'network',
      name: 'ApiV2NetworkError'
    })
    /** @brief 连续失败的授权动作 / Repeatedly failing authorization action. */
    const onAuthorize = vi.fn((): Promise<void> => Promise.reject(networkFailure))
    /** @brief 用户交互驱动 / User interaction driver. */
    const user = userEvent.setup()

    render(<WebAuthenticationScreen locale="zh-CN" onAuthorize={onAuthorize} />)

    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('身份服务暂时无法连接')
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '创建账户' }))

    expect(onAuthorize).toHaveBeenNthCalledWith(1, 'login')
    expect(onAuthorize).toHaveBeenNthCalledWith(2, 'signup')
  })
})
