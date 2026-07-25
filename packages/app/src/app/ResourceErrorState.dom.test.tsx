/** @file 安全资源错误呈现行为测试 / Safe resource-error presentation behaviour tests. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiV2ContractError,
  ApiV2ProblemError,
  ApiV2WriteOutcomeUnknownError
} from '@ai-job-workspace/product-api-v2'

import { appI18n, setAppLocale } from '../i18n'
import { ResourceErrorState } from './ResourceErrorState'

/** @brief 构造不应泄漏诊断文本的 ProblemDetails 错误 / Build a ProblemDetails error whose diagnostic text must not leak. */
function createProblem(status: number, retryable = false): ApiV2ProblemError {
  return new ApiV2ProblemError(
    {
      code: 'private.failure',
      detail: 'private detail at https://internal.example.test/config',
      errors: [],
      extensions: null,
      instance: null,
      request_id: 'req_safe_12345678',
      retryable,
      status,
      title: 'private backend title',
      type: 'https://api.hmalliances.org/problems/private-failure'
    },
    null
  )
}

/**
 * @brief 渲染共享错误边界 / Render the shared error boundary.
 * @param error 未知技术错误 / Unknown technical error.
 * @param onRetry 可观察的安全重试动作 / Observable safe retry action.
 * @return 无返回值 / No return value.
 */
function renderFailure(error: unknown, onRetry = vi.fn()): void {
  render(
    <I18nextProvider i18n={appI18n}>
      <ResourceErrorState error={error} onRetry={onRetry} title="安全操作失败" />
    </I18nextProvider>
  )
}

beforeEach(async (): Promise<void> => {
  await setAppLocale('zh-SG')
})

afterEach(async (): Promise<void> => {
  cleanup()
  await setAppLocale('zh-SG')
})

describe('ResourceErrorState', (): void => {
  it.each([
    [401, '此内容需要登录'],
    [403, '你没有访问这项内容的权限'],
    [404, '这项内容不存在'],
    [409, '内容已在其他位置更新'],
    [412, '内容已在其他位置更新'],
    [429, '请求过于频繁'],
    [503, '服务暂时繁忙或响应超时']
  ] as const)('presents HTTP %i as safe actionable copy', (status, expectedCopy): void => {
    renderFailure(createProblem(status, status === 429 || status === 503))

    /** @brief 动态错误应由辅助技术立即播报 / Dynamic error announced immediately to assistive technology. */
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(expectedCopy)
    expect(alert).toHaveTextContent('支持编号：req_safe_12345678')
    expect(alert).not.toHaveTextContent('private backend title')
    expect(alert).not.toHaveTextContent('private detail')
    expect(alert).not.toHaveTextContent('internal.example.test')
  })

  it.each([
    [new TypeError('GET https://private.example.test failed'), '无法连接到服务'],
    [new DOMException('private timeout detail', 'TimeoutError'), '服务暂时繁忙或响应超时'],
    [new ApiV2ContractError('private response body', 200), '服务返回了无法识别的数据'],
    [new ApiV2WriteOutcomeUnknownError('network'), '请求可能已被服务处理']
  ] as const)(
    'presents transport and contract failures without raw details',
    (error, expectedCopy) => {
      renderFailure(error)

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(expectedCopy)
      expect(alert).not.toHaveTextContent(/private|example\.test/u)
    }
  )

  it('uses authority reload instead of direct replay for a write conflict', (): void => {
    /** @brief 原写命令重放观察 / Original write-command replay observation. */
    const retry = vi.fn()
    /** @brief 权威读取观察 / Authoritative reload observation. */
    const reload = vi.fn()

    render(
      <I18nextProvider i18n={appI18n}>
        <ResourceErrorState
          error={createProblem(412, true)}
          onRetry={retry}
          recoveryAction={{ label: '重新加载最新数据', onInvoke: reload }}
          title="无法保存"
        />
      </I18nextProvider>
    )

    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新加载最新数据' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it('renders the same safe boundary in English', async (): Promise<void> => {
    await setAppLocale('en-US')
    renderFailure(createProblem(403))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('You do not have permission to access this content')
    expect(alert).toHaveTextContent('Support reference: req_safe_12345678')
    expect(alert).not.toHaveTextContent(/private|internal\.example/u)
  })
})
