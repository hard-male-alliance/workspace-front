/** @file WorkspaceAccess v2 的内存 adapter / In-memory adapter for WorkspaceAccess v2. */

import type { UiWorkspaceAccessPageRequest, WorkspaceGateway } from '../../application/gateway'
import type { UiWorkspaceAccessPage } from '../../domain/models'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  type InMemoryGatewayOptions,
  prepareMemoryRead
} from '../../../../infrastructure/memory'
import { DEMO_WORKSPACE_ACCESSES } from './data'

/**
 * @brief Workspace 自动化测试内存适配器 / In-memory Workspace adapter for automated tests.
 * @note 该 fixture 是一页有限集合；产品 ACL 必须保留真实 v2 cursor Page。 / This fixture is one bounded page; the product ACL must preserve real v2 cursor Pages.
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
   * @brief 读取一页 WorkspaceAccess fixture / Read one WorkspaceAccess fixture page.
   * @param request 首页请求与取消信号 / First-page request and cancellation signal.
   * @return 合法的 v2 末页 / Valid final v2 page.
   */
  async listWorkspaceAccessPage(
    request: UiWorkspaceAccessPageRequest
  ): Promise<UiWorkspaceAccessPage> {
    request.signal.throwIfAborted()
    if (request.limit < 1 || request.limit > 200 || !Number.isSafeInteger(request.limit)) {
      throw new RangeError('WorkspaceAccess page limit must be a safe integer between 1 and 200.')
    }
    if (request.cursor !== null) {
      throw new InMemoryGatewayError(
        'memory.not_found',
        'The in-memory Workspace cursor was not found.'
      )
    }

    /** @brief 当前确定性模式 / Current deterministic mode. */
    const mode = await prepareMemoryRead(this.options)
    request.signal.throwIfAborted()
    return {
      hasMore: false,
      items: mode === 'empty' ? [] : cloneMemoryValue(DEMO_WORKSPACE_ACCESSES),
      nextCursor: null
    }
  }
}
