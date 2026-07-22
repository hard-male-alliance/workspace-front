/** @file Workspace 的内存 adapter / In-memory adapter for Workspace. */

import type { WorkspaceGateway } from '../../application/gateway'
import type { UiWorkspace } from '../../domain/models'
import {
  cloneMemoryValue,
  type InMemoryGatewayOptions,
  prepareMemoryRead
} from '../../../../infrastructure/memory'
import { DEMO_WORKSPACES } from './data'

/**
 * @brief Workspace 自动化测试内存适配器 / In-memory adapter for automated Workspace tests.
 * @note 仅从测试入口导出，不允许装配进产品运行时。 / Exported only from the testing entry point and forbidden from production composition.
 */
export class InMemoryWorkspaceGateway implements WorkspaceGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
  /**
   * @brief 构造 Workspace 内存测试网关 / Construct the Workspace in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.options = options
  }

  /**
   * @brief 读取 Workspace 测试 fixture / Read the Workspace test fixture.
   * @return 测试可访问 Workspace 投影 / Test accessible-Workspace projections.
   */
  async listAccessibleWorkspaces(): Promise<readonly UiWorkspace[]> {
    const mode = await prepareMemoryRead(this.options)
    /** @brief 防御性复制后的可访问 Workspace / Defensively copied accessible Workspaces. */
    const workspaces = cloneMemoryValue(DEMO_WORKSPACES)
    return mode === 'empty' ? [] : workspaces
  }
}
