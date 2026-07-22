import { describe, expect, it } from 'vitest'

import { API_V2_CONTROLLED_TEST_ORIGIN } from '../origin'
import {
  extensions,
  httpsUrl,
  jsonObject,
  jsonValue,
  networkUrl,
  record,
  safeLinkUrl,
  type JsonValue
} from './contract'
import { ApiV2ContractError } from './errors'

describe('API v2 strict JSON values', (): void => {
  it('deep-copies arbitrary own keys without invoking Object.prototype setters', (): void => {
    /** @brief 含特殊 own key 的 JSON.parse 结果 / JSON.parse result containing a special own key. */
    const input = JSON.parse('{"__proto__":{"safe":true},"nested":[{"value":1}]}') as unknown
    /** @brief 已复制 JSON 值 / Copied JSON value. */
    const decoded = jsonValue(input, 'fixture')
    /** @brief 已复制根 object / Copied root object. */
    const decodedRecord = record(decoded, 'decoded')

    expect(decoded).not.toBe(input)
    expect(Object.getPrototypeOf(decodedRecord)).toBe(Object.prototype)
    expect(Object.hasOwn(decodedRecord, '__proto__')).toBe(true)
    expect(JSON.stringify(decoded)).toBe('{"__proto__":{"safe":true},"nested":[{"value":1}]}')
  })

  it('copies repeated source references into an alias-free JSON tree', (): void => {
    /** @brief 被两个属性复用的源 object / Source object shared by two properties. */
    const shared = { value: 1 }
    /** @brief 已复制 JSON map / Copied JSON map. */
    const decoded = jsonObject({ left: shared, right: shared }, 'fixture')
    /** @brief 左侧复制值 / Left copied value. */
    const left = record(decoded.left, 'decoded.left')
    /** @brief 右侧复制值 / Right copied value. */
    const right = record(decoded.right, 'decoded.right')

    expect(left).not.toBe(shared)
    expect(right).not.toBe(shared)
    expect(left).not.toBe(right)
    expect(left).toEqual(right)
  })

  it('decodes well beyond the former recursive depth without using the call stack', (): void => {
    /** @brief 测试嵌套深度 / Test nesting depth. */
    const depth = 4096
    /** @brief 逐层构造的深 JSON tree / Deep JSON tree built one level at a time. */
    let input: unknown = 'leaf'
    for (let index = 0; index < depth; index += 1) input = [input]

    /** @brief 已迭代解码的深 JSON tree / Iteratively decoded deep JSON tree. */
    let current: JsonValue = jsonValue(input, 'fixture')
    for (let index = 0; index < depth; index += 1) {
      if (!Array.isArray(current)) throw new Error('Expected a decoded JSON array.')
      /** @brief 当前深度的唯一子节点 / Sole child at the current depth. */
      const child = current[0] as JsonValue | undefined
      if (child === undefined) throw new Error('Expected a dense decoded JSON array.')
      current = child
    }
    expect(current).toBe('leaf')
  })

  it('rejects sparse arrays, accessors, cycles, exotic objects, and non-JSON primitives', (): void => {
    /** @brief 稀疏数组 / Sparse array. */
    const sparse = new Array<unknown>(1)
    /** @brief 含 accessor index 的数组 / Array containing an accessor index. */
    const accessorArray: unknown[] = [0]
    /** @brief 数组 getter 是否被意外执行 / Whether the array getter was unexpectedly invoked. */
    let arrayGetterInvoked = false
    Object.defineProperty(accessorArray, 0, {
      enumerable: true,
      get: (): number => {
        arrayGetterInvoked = true
        return 0
      }
    })
    /** @brief 自引用数组 / Self-referential array. */
    const cycleArray: unknown[] = []
    cycleArray.push(cycleArray)
    /** @brief 含 accessor 的 object / Object containing an accessor. */
    const accessor: Record<string, unknown> = {}
    /** @brief getter 是否被意外执行 / Whether the getter was unexpectedly invoked. */
    let getterInvoked = false
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get: (): string => {
        getterInvoked = true
        return 'secret'
      }
    })
    /** @brief 自引用 object / Self-referential object. */
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle

    expect(() => jsonValue(sparse, 'sparse')).toThrow(/dense JSON array/u)
    expect(() => jsonValue(accessorArray, 'accessor_array')).toThrow(/data property/u)
    expect(arrayGetterInvoked).toBe(false)
    expect(() => jsonValue(cycleArray, 'cycle_array')).toThrow(/acyclic JSON tree/u)
    expect(() => jsonValue(accessor, 'accessor')).toThrow(/data property/u)
    expect(getterInvoked).toBe(false)
    expect(() => jsonValue(cycle, 'cycle')).toThrow(/acyclic JSON tree/u)
    expect(() => jsonValue(new Date(0), 'date')).toThrow(/plain JSON object/u)
    expect(() => jsonValue(Number.NaN, 'nan')).toThrow(ApiV2ContractError)
    expect(() => jsonValue(undefined, 'undefined')).toThrow(ApiV2ContractError)
    expect(() => jsonValue(1n, 'bigint')).toThrow(ApiV2ContractError)
  })

  it('reuses the strict copier for namespaced Extensions', (): void => {
    /** @brief 含嵌套特殊 key 的 Extensions / Extensions containing a nested special key. */
    const input = JSON.parse('{"com.example.meta":{"__proto__":"kept"}}') as unknown
    /** @brief 已验证扩展 map / Validated extension map. */
    const decoded = extensions(input, 'extensions')
    /** @brief 已复制嵌套扩展值 / Copied nested extension value. */
    const nested = record(decoded['com.example.meta'], 'extensions.com.example.meta')

    expect(Object.hasOwn(nested, '__proto__')).toBe(true)
    expect(nested['__proto__']).toBe('kept')
    expect(decoded).not.toBe(input)
  })
})

describe('API v2 RFC 3986 URL primitives', (): void => {
  it('accepts frozen HTTPS, controlled HTTP, mailto, and tel forms', (): void => {
    expect(httpsUrl('https://example.com/problem/type', 'url')).toBe(
      'https://example.com/problem/type'
    )
    expect(networkUrl('https://cdn.example.com/template.png', 'url')).toBe(
      'https://cdn.example.com/template.png'
    )
    expect(networkUrl(`${API_V2_CONTROLLED_TEST_ORIGIN}/template.png`, 'url')).toBe(
      `${API_V2_CONTROLLED_TEST_ORIGIN}/template.png`
    )
    expect(safeLinkUrl('mailto:klee@example.com', 'url')).toBe('mailto:klee@example.com')
    expect(safeLinkUrl('tel:+6512345678', 'url')).toBe('tel:+6512345678')
  })

  it('rejects invalid raw URI text before WHATWG can normalize it', (): void => {
    /** @brief WHATWG 会静默修复但 RFC 3986 不接受的 URI / URIs WHATWG silently repairs but RFC 3986 does not accept. */
    const invalidUris = [
      'https://example.com/{raw}',
      'https://例子.测试/path',
      'https://example.com\\admin',
      'https:///example.com/path',
      'https://example.com/[raw]',
      'https://example.com/%broken',
      'HTTPS://example.com/path'
    ]
    for (const invalidUri of invalidUris) {
      expect(() => httpsUrl(invalidUri, 'url')).toThrow(ApiV2ContractError)
    }
  })

  it('keeps NetworkUrl and SafeLinkUrl scheme policies after raw validation', (): void => {
    expect(() => networkUrl('http://example.com/template.png', 'url')).toThrow(/network URL/u)
    expect(() => networkUrl(`${API_V2_CONTROLLED_TEST_ORIGIN}/preview#fragment`, 'url')).toThrow(
      /network URL/u
    )
    expect(() => networkUrl(`${API_V2_CONTROLLED_TEST_ORIGIN}/preview#`, 'url')).toThrow(
      /network URL/u
    )
    expect(() => safeLinkUrl('javascript:alert(1)', 'url')).toThrow(/safe link URL/u)
    expect(() => safeLinkUrl('https://user:secret@example.com/', 'url')).toThrow(/safe link URL/u)
  })
})
