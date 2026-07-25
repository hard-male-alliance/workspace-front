/** @file 乐观并发令牌测试 / Optimistic-concurrency token tests. */

import { describe, expect, it } from 'vitest'

import { asUiConcurrencyToken } from './concurrency'

describe('asUiConcurrencyToken', (): void => {
  it('preserves one strong entity-tag verbatim', (): void => {
    expect(asUiConcurrencyToken('"resume-revision-18"')).toBe('"resume-revision-18"')
  })

  it.each(['*', 'W/"weak"', '"one", "two"', '"control\ncharacter"', 'unquoted'])(
    'rejects an unsafe If-Match value: %s',
    (value): void => {
      expect(() => asUiConcurrencyToken(value)).toThrow(TypeError)
    }
  )
})
