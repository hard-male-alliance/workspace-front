/** @file Web API v2 认证组合边界测试 / Web API v2 authentication-composition boundary tests. */

import { describe, expect, it, vi } from 'vitest'
import {
  ApiV2AuthenticationRequiredError,
  InMemoryWebTokenSession
} from '@ai-job-workspace/product-api-v2'

import { createWebApiV2Authentication } from './web-authentication'

describe('createWebApiV2Authentication', (): void => {
  it('reports an unrecoverable empty session once without inventing credentials', async (): Promise<void> => {
    /** @brief 空的页面内存会话 / Empty current-page memory session. */
    const session = new InMemoryWebTokenSession()
    /** @brief 身份丢失通知 / Authentication-loss notification. */
    const onAuthenticationLost = vi.fn<(error: unknown) => void>()
    /** @brief 被测资源服务器认证端口 / Resource-server authentication port under test. */
    const authentication = createWebApiV2Authentication({ onAuthenticationLost, session })

    expect(authentication.getAccessToken()).toBeNull()
    await expect(
      authentication.refreshAccessToken({
        rejectedAccessToken: null,
        signal: new AbortController().signal
      })
    ).rejects.toBeInstanceOf(ApiV2AuthenticationRequiredError)

    authentication.invalidateAccessToken('access_token_that_cannot_have_been_sent_123456')
    expect(onAuthenticationLost).toHaveBeenCalledTimes(1)
    expect(onAuthenticationLost.mock.calls[0]?.[0]).toBeInstanceOf(ApiV2AuthenticationRequiredError)
  })
})
