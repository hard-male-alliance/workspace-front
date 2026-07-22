import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HostStartupFailure } from './HostStartupFailure'

afterEach(cleanup)

describe('HostStartupFailure', () => {
  it('中文 locale 显示脱敏的部署建议并只在用户确认后重试', () => {
    /** @brief 重新加载动作 spy / Reload-action spy. */
    const onRetry = vi.fn()
    render(<HostStartupFailure locale="zh-CN" onRetry={onRetry} />)

    expect(screen.getByRole('main')).toHaveAttribute('lang', 'zh')
    expect(screen.getByRole('alert')).toHaveTextContent('应用暂时无法启动')
    expect(screen.getByRole('alert')).toHaveTextContent('请联系管理员检查部署配置')
    expect(screen.getByRole('alert')).not.toHaveTextContent('VITE_API_BASE_URL')
    expect(onRetry).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '重新加载应用' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('在 en-US 与未知 locale 下严格回退英文文案', () => {
    /** @brief 当前测试不关心的重新加载动作 / Reload action irrelevant to this test. */
    const onRetry = vi.fn()
    /** @brief 英文 locale 渲染结果 / Render result for an English locale. */
    const english = render(<HostStartupFailure locale="en-US" onRetry={onRetry} />)

    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('alert')).toHaveTextContent('The application cannot start')
    expect(screen.getByRole('button', { name: 'Reload application' })).toBeInTheDocument()
    english.unmount()

    render(<HostStartupFailure locale="fr-FR" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The application cannot start')
    expect(screen.queryByText('应用暂时无法启动')).not.toBeInTheDocument()
  })
})
