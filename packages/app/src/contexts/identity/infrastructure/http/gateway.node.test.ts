/** @file Identity HTTP Gateway 契约测试 / Contract tests for the Identity HTTP Gateway. */

import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import { HttpIdentityGateway } from './gateway'
import { parseCurrentUserDto } from './validators'

/**
 * @brief 从 fetch 输入读取 URL / Read a URL from fetch input.
 * @param input fetch 输入 / Fetch input.
 * @return 绝对 URL / Absolute URL.
 */
function fetchUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === 'string') return new URL(input)
  if (input instanceof URL) return input
  return new URL(input.url)
}

/**
 * @brief 构造正式当前用户 DTO / Build a formal CurrentUser DTO.
 * @return 当前用户 JSON / Current-user JSON.
 */
function currentUser(): Record<string, unknown> {
  return {
    created_at: '2026-01-01T00:00:00Z',
    default_workspace_id: 'ws_primary',
    display_name: 'Ada Lovelace',
    email: null,
    id: 'user_ada',
    locale: 'zh-SG',
    timezone: 'Asia/Singapore'
  }
}

describe('HttpIdentityGateway', (): void => {
  it('只通过正式 v1 /me 路径映射当前用户', async (): Promise<void> => {
    /** @brief 返回当前用户的 fetch / Fetch implementation returning the current user. */
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(currentUser())))
    /** @brief 正式 Identity Gateway / Production Identity Gateway. */
    const gateway = new HttpIdentityGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.loadCurrentUser()).resolves.toEqual({
      defaultWorkspaceId: 'ws_primary',
      displayName: 'Ada Lovelace',
      id: 'user_ada',
      locale: 'zh-SG',
      timezone: 'Asia/Singapore'
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    /** @brief Identity 请求 URL / Identity request URL. */
    const [input, init] = fetchImpl.mock.calls[0] ?? []
    if (input === undefined) throw new Error('Identity request fixture was not called.')
    expect(fetchUrl(input).toString()).toBe('http://127.0.0.1:8000/api/v1/me')
    expect(init?.headers ?? {}).not.toHaveProperty('X-Mock-Workspace-Id')
    expect(init?.headers ?? {}).not.toHaveProperty('X-AIWS-Workspace-Id')
  })

  it('拒绝畸形身份字段与未声明字段', (): void => {
    expect(() =>
      parseCurrentUserDto({ ...currentUser(), default_workspace_id: 'bad' })
    ).toThrowError()
    expect(() => parseCurrentUserDto({ ...currentUser(), access_token: 'secret' })).toThrowError()
  })
})
