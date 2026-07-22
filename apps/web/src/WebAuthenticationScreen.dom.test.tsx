/** @file Hosted identity 入口界面测试 / Hosted-identity entry-screen tests. */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebAuthenticationScreen } from './WebAuthenticationScreen'

afterEach(cleanup)

describe('WebAuthenticationScreen', (): void => {
  it.each([
    ['登录', 'login'],
    ['创建账户', 'signup'],
    ['无法登录？恢复账户', 'recovery']
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

  it('presents a safe retry state without reflecting protocol error details', async (): Promise<void> => {
    /** @brief 失败的授权动作 / Failing authorization action. */
    const onAuthorize = vi.fn((): Promise<void> => Promise.reject(new Error('secret detail')))
    /** @brief 用户交互驱动 / User interaction driver. */
    const user = userEvent.setup()

    render(
      <WebAuthenticationScreen
        error={new Error('authorization_code=must-not-render')}
        locale="en-US"
        onAuthorize={onAuthorize}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication was not completed')
    expect(document.body).not.toHaveTextContent('authorization_code=must-not-render')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onAuthorize).toHaveBeenCalledWith('signup')
    expect(await screen.findByRole('alert')).toHaveTextContent('Start again')
  })
})
