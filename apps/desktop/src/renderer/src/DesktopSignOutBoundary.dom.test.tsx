import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DesktopSignOutBoundary } from './DesktopSignOutBoundary'

afterEach(cleanup)

describe('DesktopSignOutBoundary', (): void => {
  it('清理期间立即锁定工作区且不提供提前返回入口', (): void => {
    render(<DesktopSignOutBoundary locale="zh-CN" mode="clearing" onRetry={vi.fn()} />)

    expect(screen.getByRole('main')).toHaveAttribute('lang', 'zh')
    expect(screen.getByRole('status')).toHaveTextContent('正在安全退出')
    expect(screen.getByRole('status')).toHaveTextContent('Access Token 已清除')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('持久清理失败时呈现阻断恢复并仅由用户重试', (): void => {
    /** @brief 重试动作 spy / Retry-action spy. */
    const onRetry = vi.fn()
    render(<DesktopSignOutBoundary locale="zh-CN" mode="locked" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('工作区已锁定')
    expect(screen.getByRole('alert')).toHaveTextContent('无法确认持久登录授权已持久删除')
    expect(onRetry).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '重试安全清理' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
