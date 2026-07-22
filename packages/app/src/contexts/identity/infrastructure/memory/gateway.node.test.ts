/** @file Identity 内存 adapter 测试 / Identity in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { InMemoryIdentityGateway } from './gateway'

describe('InMemoryIdentityGateway', (): void => {
  it('返回当前用户的防御性副本', async (): Promise<void> => {
    /** @brief Identity 演示网关 / Identity demo gateway. */
    const gateway = new InMemoryIdentityGateway()
    /** @brief 首次 Identity 读取 / First Identity read. */
    const firstRead = await gateway.loadCurrentUser()
    /** @brief 第二次 Identity 读取 / Second Identity read. */
    const secondRead = await gateway.loadCurrentUser()

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead.displayName).toBe('Klee')
    expect(secondRead.displayName).toBe('Klee')
  })

  it('显式暴露配置的错误状态', async (): Promise<void> => {
    /** @brief 明确失败的 Identity gateway / Explicitly failing Identity gateway. */
    const gateway = new InMemoryIdentityGateway({ mode: 'error' })

    await expect(gateway.loadCurrentUser()).rejects.toBeInstanceOf(InMemoryGatewayError)
  })
})
