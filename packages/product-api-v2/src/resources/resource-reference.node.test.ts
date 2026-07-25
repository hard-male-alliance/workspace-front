import { describe, expect, it } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import { parseResourceReference } from './resource-reference'

/** @brief 测试资源 ID / Resource ID used by tests. */
const RESOURCE_ID = 'resume_01K0EXAMPLE0000000001'

describe('API v2 ResourceReference consumer', (): void => {
  it('preserves the semantic difference between an omitted and null revision', (): void => {
    /** @brief 省略 revision 的引用 / Reference with an omitted revision. */
    const omitted = parseResourceReference({ id: RESOURCE_ID, resource_type: 'resume' }, 'subject')
    /** @brief 显式未锁定 revision 的引用 / Reference with an explicitly unpinned revision. */
    const nullable = parseResourceReference(
      { id: RESOURCE_ID, resource_type: 'resume', revision: null },
      'subject'
    )

    expect(Object.hasOwn(omitted, 'revision')).toBe(false)
    expect(nullable).toEqual({ id: RESOURCE_ID, resource_type: 'resume', revision: null })
  })

  it.each([
    { id: RESOURCE_ID, resource_type: 'Resume' },
    { id: RESOURCE_ID, resource_type: 'resume', revision: 0 },
    { id: RESOURCE_ID, resource_type: 'resume', revision: 1, legacy_type: 'cv' }
  ])('rejects a non-canonical reference %#', (input): void => {
    expect(() => parseResourceReference(input, 'subject')).toThrow(ApiV2ContractError)
  })
})
