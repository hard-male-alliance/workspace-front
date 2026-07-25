/** @file Identity v2 内存 adapter 测试 / Identity v2 in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { InMemoryIdentityGateway } from './gateway'

describe('InMemoryIdentityGateway', (): void => {
  it('返回包含 principal 与 scopes 的防御性副本', async (): Promise<void> => {
    /** @brief Identity 演示网关 / Identity demo gateway. */
    const gateway = new InMemoryIdentityGateway()
    /** @brief 首次 Identity 读取 / First Identity read. */
    const firstRead = await gateway.loadCurrentUser(new AbortController().signal)
    /** @brief 第二次 Identity 读取 / Second Identity read. */
    const secondRead = await gateway.loadCurrentUser(new AbortController().signal)

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead.scopes).not.toBe(secondRead.scopes)
    expect(firstRead).toMatchObject({
      displayName: 'Klee',
      emailVerified: true,
      subject: 'oidc-subject-klee'
    })
    expect([...firstRead.scopes]).toEqual(['workspace.read', 'resume.read', 'resume.write'])
  })

  it('传播调用方取消信号', async (): Promise<void> => {
    /** @brief 已取消控制器 / Already-aborted controller. */
    const controller = new AbortController()
    controller.abort()

    await expect(
      new InMemoryIdentityGateway().loadCurrentUser(controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('显式暴露配置的错误状态', async (): Promise<void> => {
    /** @brief 明确失败的 Identity gateway / Explicitly failing Identity gateway. */
    const gateway = new InMemoryIdentityGateway({ mode: 'error' })

    await expect(gateway.loadCurrentUser(new AbortController().signal)).rejects.toBeInstanceOf(
      InMemoryGatewayError
    )
  })
})
