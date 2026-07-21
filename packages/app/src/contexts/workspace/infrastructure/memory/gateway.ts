/** @file Workspace 的内存 adapter / In-memory adapter for Workspace. */

import type { WorkspaceGateway } from '../../application/gateway'
import type { UiWorkspace, UiWorkspaceHomeModel } from '../../domain/models'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  type DemoGatewayOptions,
  prepareMemoryRead,
  throwMemoryNotFound
} from '../../../../infrastructure/memory'
import { DEMO_WORKSPACE_HOME, DEMO_WORKSPACE_ID, DEMO_WORKSPACES } from './data'

/**
 * @brief 工作区的本地演示适配器 / Local-demo adapter for Workspace.
 * @note 数据仅存在于当前 renderer 进程生命周期；它不持久化、不与后端同步，也不建立 realtime transport。 / Data lives only for the current renderer-process lifetime; it is not persisted or synchronized with a backend and establishes no realtime transport.
 */
export class DemoWorkspaceGateway implements WorkspaceGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: DemoGatewayOptions
  /**
   * @brief 构造工作区演示网关 / Construct the Workspace demo gateway.
   * @param options 演示行为选项 / Demo behavior options.
   */
  constructor(options: DemoGatewayOptions = {}) {
    this.options = options
  }

  /**
   * @brief 列出演示工作区 / List demo workspaces.
   * @return 演示工作区列表 / Demo workspace list.
   */
  async listWorkspaces(): Promise<readonly UiWorkspace[]> {
    const mode = await prepareMemoryRead(this.options)
    return mode === 'empty' ? [] : cloneMemoryValue(DEMO_WORKSPACES)
  }

  /**
   * @brief 获取演示工作区首页 / Get the demo workspace home.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return 演示首页数据 / Demo home data.
   */
  async getWorkspaceHome(workspaceId: UiWorkspaceId): Promise<UiWorkspaceHomeModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== DEMO_WORKSPACE_ID) {
      return throwMemoryNotFound('workspace')
    }

    return cloneMemoryValue(DEMO_WORKSPACE_HOME)
  }
}
