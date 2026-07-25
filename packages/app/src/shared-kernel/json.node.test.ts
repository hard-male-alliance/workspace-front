/** @file 共享严格 JSON 语义的 node 测试 / Node tests for shared strict-JSON semantics. */

import { describe, expect, it } from 'vitest'

import { cloneUiJsonValue, uiJsonValuesEqual, type UiJsonObject, type UiJsonValue } from './json'

describe('shared JSON semantics', () => {
  it('compares objects independently of key order and treats negative zero as JSON zero', () => {
    /** @brief 第一种成员顺序的 JSON 值 / JSON value with the first member order. */
    const left: UiJsonValue = { count: -0, nested: { enabled: true, label: 'stable' } }
    /** @brief 第二种成员顺序的 JSON 值 / JSON value with the second member order. */
    const right: UiJsonValue = { nested: { label: 'stable', enabled: true }, count: 0 }

    expect(uiJsonValuesEqual(left, right)).toBe(true)
    expect(uiJsonValuesEqual([1, 2], [2, 1])).toBe(false)
  })

  it('clones every container and safely preserves an own __proto__ member', () => {
    /** @brief 含合法 `__proto__` key 的严格 JSON object / Strict JSON object containing a valid `__proto__` key. */
    const source = JSON.parse(
      '{"__proto__":{"polluted":true},"nested":{"items":[{"value":1}]}}'
    ) as UiJsonObject
    /** @brief 不共享容器的 JSON 副本 / JSON clone sharing no containers. */
    const cloned = cloneUiJsonValue(source)
    /** @brief 源嵌套 object / Nested source object. */
    const sourceNested = source['nested'] as UiJsonObject
    /** @brief 副本嵌套 object / Nested cloned object. */
    const clonedNested = cloned['nested'] as UiJsonObject
    /** @brief 源嵌套数组 / Nested source array. */
    const sourceItems = sourceNested['items'] as readonly UiJsonValue[]
    /** @brief 副本嵌套数组 / Nested cloned array. */
    const clonedItems = clonedNested['items'] as readonly UiJsonValue[]
    /** @brief 源数组内 object / Object inside the source array. */
    const sourceItem = sourceItems[0] as UiJsonObject
    /** @brief 副本数组内 object / Object inside the cloned array. */
    const clonedItem = clonedItems[0] as UiJsonObject

    expect(cloned).not.toBe(source)
    expect(clonedNested).not.toBe(sourceNested)
    expect(clonedItems).not.toBe(sourceItems)
    expect(clonedItem).not.toBe(sourceItem)
    expect(Object.getPrototypeOf(cloned)).toBeNull()
    expect(Object.hasOwn(cloned, '__proto__')).toBe(true)
    expect(cloned['__proto__']).toEqual({ polluted: true })
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
    expect(uiJsonValuesEqual(source, cloned)).toBe(true)
  })

  it('clones and compares deeply nested values without using the JavaScript call stack', () => {
    /** @brief 足以超过递归实现调用栈的嵌套深度 / Nesting depth sufficient to exceed a recursive implementation's call stack. */
    const nestingDepth = 20_000
    /** @brief 第一棵深层 JSON 树 / First deeply nested JSON tree. */
    let left: UiJsonValue = 'leaf'
    /** @brief 结构相同但引用独立的第二棵深层 JSON 树 / Structurally equal but independently referenced second deep JSON tree. */
    let right: UiJsonValue = 'leaf'
    for (let depth = 0; depth < nestingDepth; depth += 1) {
      left = [left]
      right = [right]
    }

    /** @brief 第一棵树的无损深副本 / Lossless deep clone of the first tree. */
    const cloned = cloneUiJsonValue(left)
    /** @brief 根容器是否独立 / Whether the root container is independent. */
    const hasIndependentRoot = cloned !== left
    /** @brief 两棵独立树是否语义相等 / Whether the two independent trees are semantically equal. */
    const independentTreesEqual = uiJsonValuesEqual(left, right)
    /** @brief 原树与副本是否语义相等 / Whether the original and its clone are semantically equal. */
    const cloneMatchesSource = uiJsonValuesEqual(left, cloned)

    expect(hasIndependentRoot).toBe(true)
    expect(independentTreesEqual).toBe(true)
    expect(cloneMatchesSource).toBe(true)
  })
})
