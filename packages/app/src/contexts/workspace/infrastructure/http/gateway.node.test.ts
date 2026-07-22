/** @file Workspace HTTP Gateway 契约测试 / Contract tests for the Workspace HTTP Gateway. */

import { describe, expect, it, vi } from 'vitest'

import { createHttpClient } from '../../../../infrastructure/http/http-client'
import { HttpWorkspaceGateway } from './gateway'
import { parseWorkspaceListDto } from './validators'

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
 * @brief 构造正式 Workspace DTO / Build a formal Workspace DTO.
 * @param id Workspace ID / Workspace ID.
 * @return Workspace JSON / Workspace JSON.
 */
function workspace(id = 'ws_primary'): Record<string, unknown> {
  return {
    created_at: '2026-07-01T00:00:00Z',
    default_locale: 'zh-SG',
    extensions: {},
    id,
    name: 'Klee 的职业实验室',
    plan: 'pro',
    revision: 4,
    slug: 'klee-career-lab',
    timezone: 'Asia/Singapore',
    updated_at: '2026-07-20T03:00:00Z'
  }
}

/**
 * @brief 构造单页契约响应 / Build a single-page contract response.
 * @param items 页面条目 / Page items.
 * @return 游标分页 JSON / Cursor-page JSON.
 */
function page(items: readonly unknown[]): Record<string, unknown> {
  return {
    items,
    page: { has_more: false, next_cursor: null, total_estimate: items.length }
  }
}

/**
 * @brief 构造按正式路径分发响应的 fetch / Build a fetch implementation dispatching formal paths.
 * @param overrides 路径响应覆盖 / Path response overrides.
 * @return 可断言 fetch mock / Assertable fetch mock.
 */
function workspaceFetch(
  overrides: Readonly<Record<string, unknown>> = {}
): ReturnType<typeof vi.fn<typeof fetch>> {
  /** @brief 默认正式路径响应 / Default formal-path responses. */
  const responses: Readonly<Record<string, unknown>> = {
    '/api/v1/workspaces': page([workspace('ws_other'), workspace()]),
    ...overrides
  }

  return vi.fn<typeof fetch>((input): Promise<Response> => {
    /** @brief 当前请求 URL / Current request URL. */
    const url = fetchUrl(input)
    /** @brief 当前路径的响应 JSON / Response JSON for the current path. */
    const response = responses[url.pathname]
    if (response === undefined) throw new Error(`Unexpected test request: ${url.pathname}`)
    return Promise.resolve(Response.json(response))
  })
}

describe('HttpWorkspaceGateway', (): void => {
  it('只读取并映射可访问 Workspace，保留服务端顺序', async (): Promise<void> => {
    /** @brief 路径分发 fetch / Path-dispatching fetch. */
    const fetchImpl = workspaceFetch()
    /** @brief 正式 Workspace Gateway / Production Workspace Gateway. */
    const gateway = new HttpWorkspaceGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    /** @brief 映射后的可访问 Workspace / Mapped accessible Workspaces. */
    const workspaces = await gateway.listAccessibleWorkspaces()

    expect(workspaces).toHaveLength(2)
    expect(workspaces[0]).toMatchObject({ id: 'ws_other' })
    expect(workspaces[1]).toEqual({
      id: 'ws_primary',
      locale: 'zh-SG',
      name: 'Klee 的职业实验室',
      plan: 'pro',
      slug: 'klee-career-lab',
      timezone: 'Asia/Singapore',
      updatedAt: '2026-07-20T03:00:00Z'
    })
    /** @brief 发出的请求 URL / Emitted request URLs. */
    const urls = fetchImpl.mock.calls.map(([input]) => fetchUrl(input).toString())
    expect(urls).toEqual(['http://127.0.0.1:8000/api/v1/workspaces?limit=200'])
    expect(urls.some((url) => url.includes('/members'))).toBe(false)
    for (const [, init] of fetchImpl.mock.calls) {
      /** @brief 当前请求头 / Current request headers. */
      const headers = init?.headers ?? {}
      expect(headers).not.toHaveProperty('X-Mock-Workspace-Id')
      expect(headers).not.toHaveProperty('X-AIWS-Workspace-Id')
    }
  })

  it('maps a future Workspace plan code to a safe unknown UI value', async (): Promise<void> => {
    /** @brief 返回未来套餐 code 的 fetch / Fetch implementation returning a future plan code. */
    const fetchImpl = workspaceFetch({
      '/api/v1/workspaces': page([{ ...workspace(), plan: 'trial' }])
    })
    /** @brief 正式 Workspace Gateway / Production Workspace Gateway. */
    const gateway = new HttpWorkspaceGateway(
      createHttpClient({ baseUrl: 'http://127.0.0.1:8000', fetchImpl })
    )

    await expect(gateway.listAccessibleWorkspaces()).resolves.toMatchObject([{ plan: 'unknown' }])
  })

  it.each([
    ['an undeclared resource property', { ...workspace(), internal_flag: true }],
    ['a malformed opaque ID', { ...workspace(), id: 'short' }],
    ['a fractional revision', { ...workspace(), revision: 1.5 }],
    ['an invalid timestamp', { ...workspace(), updated_at: 'yesterday' }],
    ['an invalid extension key', { ...workspace(), extensions: { '?private': true } }],
    ['a plan outside the open-enum code pattern', { ...workspace(), plan: 'Trial Plan' }]
  ])('rejects %s', (_label, candidate): void => {
    expect(() => parseWorkspaceListDto(page([candidate]))).toThrowError()
  })

  it('rejects CursorPage extras and fractional total estimates', (): void => {
    expect(() =>
      parseWorkspaceListDto({
        items: [],
        page: { has_more: false, internal: true, next_cursor: null }
      })
    ).toThrowError()
    expect(() =>
      parseWorkspaceListDto({
        items: [],
        page: { has_more: false, next_cursor: null, total_estimate: 0.5 }
      })
    ).toThrowError()
  })
})
