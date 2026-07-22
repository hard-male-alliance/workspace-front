/** @file 前端命令身份测试 / Frontend command-identity tests. */

import { describe, expect, it } from 'vitest'

import { createUiCommandId } from './command'

describe('createUiCommandId', (): void => {
  it('creates distinct values inside the shared opaque-identity boundary', (): void => {
    /** @brief 首个用户命令身份 / First user-command identity. */
    const first = createUiCommandId()
    /** @brief 第二个独立用户命令身份 / Second independent user-command identity. */
    const second = createUiCommandId()

    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u)
    expect(second).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u)
    expect(second).not.toBe(first)
  })
})
