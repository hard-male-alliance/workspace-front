/** @file 正式本地演示 adapter 的共享选项 / Shared options for production local-demo adapters. */

/** @brief 本地演示网关行为模式 / Local-demo gateway behavior mode. */
export type DemoGatewayMode = 'ready' | 'empty' | 'error'

/**
 * @brief 本地演示网关构造选项 / Local-demo gateway construction options.
 * @note 这些选项只控制当前进程内实例；不会启用持久化、后端同步或实时传输。 / These options only control the in-process instance; they do not enable persistence, backend synchronization, or realtime transport.
 */
export interface DemoGatewayOptions {
  /** @brief 返回演示数据、空数据或错误 / Return demo data, empty data, or an error. */
  readonly mode?: DemoGatewayMode
  /** @brief 模拟异步延迟（毫秒）/ Simulated async delay in milliseconds. */
  readonly delayMs?: number
}
