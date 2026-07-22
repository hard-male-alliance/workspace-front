import { describe, expect, it, vi } from 'vitest'

import { reportDesktopStartupFailure, selectDesktopStartupFailureCopy } from './startup-failure'

describe('reportDesktopStartupFailure', () => {
  it('在退出前显示中文可行动错误，且不向用户泄漏原始配置', () => {
    /** @brief 本地日志 spy / Local-log spy. */
    const logError = vi.fn()
    /** @brief 原生错误框 spy / Native-error-box spy. */
    const showErrorBox = vi.fn()
    /** @brief 进程退出 spy / Process-exit spy. */
    const exit = vi.fn()
    /** @brief 包含敏感值的原始启动错误 / Raw startup error containing a sensitive value. */
    const error = new Error('VITE_API_BASE_URL=https://secret.internal/private')
    /** @brief 中文宿主文案 / Chinese host copy. */
    const copy = selectDesktopStartupFailureCopy('zh-SG')

    reportDesktopStartupFailure(error, 'zh-SG', { exit, logError, showErrorBox })

    expect(logError).toHaveBeenCalledWith('Desktop application failed to start.', error)
    expect(showErrorBox).toHaveBeenCalledWith(copy.title, copy.content)
    expect(showErrorBox.mock.calls.flat().join(' ')).not.toContain('secret.internal')
    expect(exit).toHaveBeenCalledWith(1)
    expect(showErrorBox.mock.invocationCallOrder[0]).toBeLessThan(
      exit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
  })

  it('英文与未知 locale 都使用英文原生文案', () => {
    expect(selectDesktopStartupFailureCopy('en-US').title).toBe('AI Job Workspace could not start')
    expect(selectDesktopStartupFailureCopy('fr-FR')).toEqual(
      selectDesktopStartupFailureCopy('en-US')
    )
  })

  it('即使原生对话框失败也终止不完整应用', () => {
    /** @brief 强制失败的原生错误框 / Native error box forced to fail. */
    const showErrorBox = vi.fn((): never => {
      throw new Error('native dialog unavailable')
    })
    /** @brief 进程退出 spy / Process-exit spy. */
    const exit = vi.fn()

    expect(() =>
      reportDesktopStartupFailure(new Error('startup failed'), 'en-US', {
        exit,
        logError: vi.fn(),
        showErrorBox
      })
    ).toThrow('native dialog unavailable')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
