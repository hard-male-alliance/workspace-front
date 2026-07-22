import { describe, expect, it } from 'vitest'

import { HttpContractError } from './http-client'
import { integer, opaqueId } from './decoder'

describe('HTTP decoder primitives', (): void => {
  it('uses the shared frozen opaque-ID boundary', (): void => {
    expect(opaqueId('resume_12345678', 'resource.id')).toBe('resume_12345678')
    expect(() => opaqueId('short', 'resource.id')).toThrow(HttpContractError)
  })

  it('rejects integers that JavaScript cannot represent exactly', (): void => {
    expect(integer(Number.MAX_SAFE_INTEGER, 'resource.revision')).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => integer(Number.MAX_SAFE_INTEGER + 1, 'resource.revision')).toThrow(
      'must be an exactly representable integer'
    )
  })
})
