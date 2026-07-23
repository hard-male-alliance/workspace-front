/** @file 自动化测试内存 adapter 的确定性原语 / Deterministic primitives for automated-test in-memory adapters. */

/** @brief 内存测试网关行为模式 / In-memory test-gateway behavior mode. */
export type InMemoryGatewayMode = 'ready' | 'empty' | 'error'

/**
 * @brief 内存测试网关构造选项 / In-memory test-gateway construction options.
 * @note 仅用于自动化测试；不提供产品持久化、后端同步或实时传输。 / Used only by automated tests; it provides no product persistence, backend synchronization, or realtime transport.
 */
export interface InMemoryGatewayOptions {
  /** @brief 返回 fixture、空数据或错误 / Return fixtures, empty data, or an error. */
  readonly mode?: InMemoryGatewayMode
  /** @brief 模拟异步延迟（毫秒）/ Simulated asynchronous delay in milliseconds. */
  readonly delayMs?: number
}

/** @brief 内存 adapter 错误码 / In-memory adapter error code. */
export type InMemoryGatewayErrorCode =
  'memory.unavailable' | 'memory.not_found' | 'memory.conflict' | 'memory.idempotency_key_reused'

/** @brief 内存 adapter 的确定性错误 / Deterministic in-memory adapter error. */
export class InMemoryGatewayError extends Error {
  /** @brief 内存 adapter 错误码 / In-memory adapter error code. */
  readonly code: InMemoryGatewayErrorCode

  /**
   * @brief 构造内存 adapter 错误 / Construct an in-memory adapter error.
   * @param code 错误码 / Error code.
   * @param message 错误说明 / Error message.
   */
  constructor(code: InMemoryGatewayErrorCode, message: string) {
    super(message)
    this.name = 'InMemoryGatewayError'
    this.code = code
  }
}

/**
 * @brief 深拷贝确定性内存数据 / Deep-clone deterministic in-memory data.
 * @template TValue 要拷贝的值类型 / Value type to clone.
 * @param value 原始内存数据 / Source in-memory data.
 * @return 不共享引用的副本 / Copy without shared references.
 */
export function cloneMemoryValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

/**
 * @brief 在读取数据前应用内存 adapter 行为 / Apply in-memory adapter behavior before reading data.
 * @param options 当前 adapter 的行为选项 / Behavior options for the current adapter.
 * @return 当前模式 / Current mode.
 * @throws {InMemoryGatewayError} 当模式为 error 时抛出。
 */
export async function prepareMemoryRead(
  options: InMemoryGatewayOptions
): Promise<InMemoryGatewayMode> {
  const delayMs = options.delayMs ?? 0
  if (delayMs > 0) {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, delayMs)
    })
  }

  const mode = options.mode ?? 'ready'
  if (mode === 'error') {
    throw new InMemoryGatewayError('memory.unavailable', 'In-memory gateway is configured to fail.')
  }
  return mode
}

/**
 * @brief 构造并抛出内存资源未找到错误 / Construct and throw an in-memory not-found error.
 * @param resourceName 资源说明 / Resource description.
 * @return 此函数不会返回 / This function never returns.
 * @throws {InMemoryGatewayError} 始终抛出未找到错误。
 */
export function throwMemoryNotFound(resourceName: string): never {
  throw new InMemoryGatewayError('memory.not_found', `In-memory ${resourceName} was not found.`)
}
