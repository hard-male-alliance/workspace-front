import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { CurrentUserGateway, parseCurrentUser } from './current-user'

/**
 * @brief 将测试 fixture 限定为普通对象 / Narrow a test fixture to a plain object.
 * @param value 未知 fixture / Unknown fixture.
 * @return 普通对象 / Plain object.
 */
function fixtureRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a record fixture.')
  }
  return value as Record<string, unknown>
}

describe('API v2 CurrentUser consumer', (): void => {
  it('decodes the canonical CurrentUser example without a copied fixture', async (): Promise<void> => {
    /** @brief 唯一事实来源中的 CurrentUser payload / CurrentUser payload from the single source of truth. */
    const payload = await readCanonicalExample('current_user')

    expect(parseCurrentUser(payload)).toMatchObject({
      default_workspace_id: 'ws_01K0EXAMPLE00000000000001',
      display_name: 'Klee',
      email_verified: true,
      locale: 'zh-CN',
      subject: 'oidc-subject-01K0EXAMPLE0001'
    })
  })

  it('rejects the old v1 timezone shape and missing OAuth principal fields', async (): Promise<void> => {
    /** @brief canonical CurrentUser 的可变测试副本 / Mutable test copy of canonical CurrentUser. */
    const input = { ...fixtureRecord(await readCanonicalExample('current_user')) }
    delete input.subject
    input.timezone = 'Asia/Shanghai'

    expect(() => parseCurrentUser(input)).toThrow(ApiV2ContractError)
  })

  it('reads only the dedicated /me authority through the v2 client', async (): Promise<void> => {
    /** @brief canonical CurrentUser payload / Canonical CurrentUser payload. */
    const payload = await readCanonicalExample('current_user')
    /** @brief 可观察的 v2 GET / Observable v2 GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: payload,
      headers: new Headers({ ETag: '"current-user-17"' }),
      status: 200
    })
    /** @brief 被测 CurrentUser Gateway / CurrentUser gateway under test. */
    const gateway = new CurrentUserGateway({ getJson })

    await expect(gateway.getCurrentUser()).resolves.toMatchObject({
      etag: '"current-user-17"',
      value: { display_name: 'Klee' }
    })
    expect(getJson).toHaveBeenCalledOnce()
    expect(getJson).toHaveBeenCalledWith('/me', { maxResponseBytes: 64 * 1024 })
  })

  it.each([null, 'W/"current-user-17"'])('rejects a missing or weak ETag (%s)', async (etag) => {
    /** @brief canonical CurrentUser payload / Canonical CurrentUser payload. */
    const payload = await readCanonicalExample('current_user')
    /** @brief 缺失或弱校验器响应 / Response with a missing or weak validator. */
    const headers = new Headers(etag === null ? {} : { ETag: etag })
    /** @brief 返回不合法表示元数据的 GET / GET returning invalid representation metadata. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: payload,
      headers,
      status: 200
    })

    await expect(new CurrentUserGateway({ getJson }).getCurrentUser()).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
  })
})
