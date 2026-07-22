/** @file Identity v2 的内存 adapter / In-memory adapter for Identity v2. */

import type { IdentityGateway } from '../../application/gateway'
import type { UiCurrentUser } from '../../domain/models'
import {
  cloneMemoryValue,
  type InMemoryGatewayOptions,
  prepareMemoryRead
} from '../../../../infrastructure/memory'
import { DEMO_CURRENT_USER } from './data'

/**
 * @brief Identity 自动化测试内存适配器 / In-memory Identity adapter for automated tests.
 * @note 仅从测试入口导出，不允许装配进产品运行时。 / Exported only from the testing entry point and forbidden from production composition.
 */
export class InMemoryIdentityGateway implements IdentityGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions

  /**
   * @brief 构造 Identity 内存测试网关 / Construct the Identity in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.options = options
  }

  /**
   * @brief 读取当前 v2 principal fixture / Read the current v2-principal fixture.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 当前用户的防御性副本 / Defensive copy of the current user.
   */
  async loadCurrentUser(signal: AbortSignal): Promise<UiCurrentUser> {
    signal.throwIfAborted()
    await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    return cloneMemoryValue(DEMO_CURRENT_USER)
  }
}
