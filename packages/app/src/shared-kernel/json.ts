/** @file 跨限界上下文的无损 JSON 语义 / Lossless JSON semantics shared across bounded contexts. */

/** @brief 可无损保留的 JSON 对象 / JSON object preserved losslessly. */
export interface UiJsonObject {
  /** @brief 任意 JSON 成员 / Arbitrary JSON member. */
  readonly [key: string]: UiJsonValue
}

/** @brief 可无损保留的 JSON 值 / JSON value preserved losslessly. */
export type UiJsonValue = boolean | number | string | null | readonly UiJsonValue[] | UiJsonObject

/** @brief JSON clone 内部可写容器 / Mutable container used internally by the JSON clone. */
type MutableUiJsonContainer = UiJsonValue[] | Record<string, UiJsonValue>

/** @brief 迭代 JSON clone 的一个容器任务 / One container task in the iterative JSON clone. */
interface UiJsonCloneTask {
  /** @brief 已验证只读源容器 / Validated read-only source container. */
  readonly source: readonly UiJsonValue[] | UiJsonObject
  /** @brief 接收独立节点的可写目标 / Mutable target receiving independent nodes. */
  readonly target: MutableUiJsonContainer
}

/**
 * @brief 判断严格 JSON 值是否为只读数组 / Determine whether a strict JSON value is a read-only array.
 * @param value 待判断的 JSON 值 / JSON value to inspect.
 * @return 数组时为 true / True for an array.
 */
function isUiJsonArray(value: UiJsonValue): value is readonly UiJsonValue[] {
  return Array.isArray(value)
}

/**
 * @brief 为 JSON 容器创建同形的独立可写容器 / Create an independent mutable container with the same JSON shape.
 * @param source 源 JSON 容器 / Source JSON container.
 * @return 新数组或无原型 object / A new array or prototype-free object.
 * @note 无原型 object 配合数据属性写入，避免 `__proto__` 触发原型 setter。 / A prototype-free object combined with data-property writes prevents `__proto__` from invoking a prototype setter.
 */
function createUiJsonCloneContainer(
  source: readonly UiJsonValue[] | UiJsonObject
): MutableUiJsonContainer {
  return isUiJsonArray(source) ? [] : (Object.create(null) as Record<string, UiJsonValue>)
}

/**
 * @brief 定义 JSON clone 的普通自有数据属性 / Define a normal own data property on a JSON clone.
 * @param target 目标容器 / Destination container.
 * @param key 数组 index 或对象 key / Array index or object key.
 * @param value 已复制 JSON 值 / Cloned JSON value.
 * @return 无返回值 / No return value.
 * @note 使用数据属性安全保留名为 `__proto__` 的合法 JSON key。 / A data property safely preserves a valid JSON key named `__proto__`.
 */
function defineUiJsonCloneValue(
  target: MutableUiJsonContainer,
  key: string | number,
  value: UiJsonValue
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

/**
 * @brief 复制一个 JSON 子节点并登记后续容器任务 / Clone one JSON child node and enqueue any container work.
 * @param item 源子节点 / Source child node.
 * @param target 接收副本的目标容器 / Destination container receiving the clone.
 * @param key 数组 index 或对象 key / Array index or object key.
 * @param pending 尚待展开的容器任务 / Container tasks awaiting expansion.
 * @return 无返回值 / No return value.
 */
function appendUiJsonCloneValue(
  item: UiJsonValue,
  target: MutableUiJsonContainer,
  key: string | number,
  pending: UiJsonCloneTask[]
): void {
  if (item === null || typeof item !== 'object') {
    defineUiJsonCloneValue(target, key, item)
    return
  }
  /** @brief 当前子节点的独立容器 / Independent container for the current child node. */
  const child = createUiJsonCloneContainer(item)
  defineUiJsonCloneValue(target, key, child)
  pending.push({ source: item, target: child })
}

/**
 * @brief 无调用栈递归地复制一个严格 JSON 值 / Clone a strict JSON value without call-stack recursion.
 * @param value 已由边界验证的只读 JSON 值 / Read-only JSON value already validated at the boundary.
 * @return 不共享数组或对象容器的 JSON 值 / JSON value sharing no array or object containers.
 */
export function cloneUiJsonValue<TValue extends UiJsonValue>(value: TValue): TValue {
  if (value === null || typeof value !== 'object') return value
  /** @brief 与根节点形状相同的独立目标 / Independent destination matching the root shape. */
  const root = createUiJsonCloneContainer(value)
  /** @brief 尚待复制子节点的容器任务 / Container tasks whose child nodes remain to be cloned. */
  const pending: UiJsonCloneTask[] = [{ source: value, target: root }]
  while (pending.length > 0) {
    /** @brief 当前容器任务 / Current container task. */
    const task = pending.pop()
    if (task === undefined) break
    if (isUiJsonArray(task.source)) {
      for (let index = 0; index < task.source.length; index += 1) {
        /** @brief 当前 dense 数组元素 / Current dense array element. */
        const item = task.source[index]
        if (item === undefined) {
          throw new TypeError('A UiJsonValue array must be dense and contain only JSON values.')
        }
        appendUiJsonCloneValue(item, task.target, index, pending)
      }
      continue
    }
    for (const key of Object.keys(task.source)) {
      /** @brief 当前 object 成员 / Current object member. */
      const item = task.source[key]
      if (item === undefined) {
        throw new TypeError('A UiJsonValue object must contain only JSON values.')
      }
      appendUiJsonCloneValue(item, task.target, key, pending)
    }
  }
  return root as TValue
}

/**
 * @brief 按 JSON 数据模型迭代比较两个值 / Iteratively compare two values under the JSON data model.
 * @param left 左值 / Left value.
 * @param right 右值 / Right value.
 * @return primitive、数组顺序与对象成员语义相等时为 true / True when primitives, array order, and object members are semantically equal.
 * @note JSON number 不区分 `-0` 与 `0`；迭代栈避免深层公开值耗尽 JavaScript 调用栈。 / JSON numbers do not distinguish `-0` from `0`; an iterative stack prevents deeply nested published values from exhausting the JavaScript call stack.
 */
export function uiJsonValuesEqual(left: UiJsonValue, right: UiJsonValue): boolean {
  /** @brief 待比较 JSON 节点对 / JSON node pairs awaiting comparison. */
  const pending: Array<readonly [UiJsonValue, UiJsonValue]> = [[left, right]]
  while (pending.length > 0) {
    /** @brief 当前 JSON 节点对 / Current JSON node pair. */
    const pair = pending.pop()
    if (pair === undefined) break
    /** @brief 当前左右节点 / Current left and right nodes. */
    const [leftValue, rightValue] = pair
    if (leftValue === rightValue) continue

    if (isUiJsonArray(leftValue)) {
      if (!isUiJsonArray(rightValue) || leftValue.length !== rightValue.length) return false
      for (let index = 0; index < leftValue.length; index += 1) {
        /** @brief 同一数组位置的左右 item / Left and right items at the same array position. */
        const leftItem = leftValue[index]
        const rightItem = rightValue[index]
        if (leftItem === undefined || rightItem === undefined) return false
        pending.push([leftItem, rightItem])
      }
      continue
    }
    if (isUiJsonArray(rightValue)) return false
    if (
      leftValue === null ||
      rightValue === null ||
      typeof leftValue !== 'object' ||
      typeof rightValue !== 'object'
    ) {
      return false
    }
    /** @brief 左对象 keys / Left-object keys. */
    const leftKeys = Object.keys(leftValue)
    /** @brief 右对象 keys / Right-object keys. */
    const rightKeys = Object.keys(rightValue)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.hasOwn(rightValue, key)) return false
      /** @brief 当前对象 key 的左右 JSON 值 / Left and right JSON values for the current object key. */
      const leftItem = leftValue[key]
      const rightItem = rightValue[key]
      if (leftItem === undefined || rightItem === undefined) return false
      pending.push([leftItem, rightItem])
    }
  }
  return true
}
