/** @file WorkspaceAccess v2 应用端口 / WorkspaceAccess v2 application port. */

import type { UiWorkspaceAccessPage, UiWorkspaceCursor } from '../domain/models'

/** @brief 单页 WorkspaceAccess 查询 / One-page WorkspaceAccess query. */
export interface UiWorkspaceAccessPageRequest {
  /** @brief 首屏为 null，后续使用服务端返回的 cursor / null for the first page, then the server-returned cursor. */
  readonly cursor: UiWorkspaceCursor | null
  /** @brief 页大小，v2 闭区间为 1..200 / Page size in the v2 inclusive range 1..200. */
  readonly limit: number
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal: AbortSignal
}

/** @brief 当前 principal 的 WorkspaceAccess 分页读取端口 / Paginated WorkspaceAccess read port for the current principal. */
export interface WorkspaceGateway {
  /**
   * @brief 读取一页 WorkspaceAccess 权威 / Read one page of WorkspaceAccess authority.
   * @param request cursor、有限页大小与取消信号 / Cursor, bounded page size, and cancellation signal.
   * @return 保留 v2 Page 关系不变量的访问页 / Access page preserving the v2 Page relation invariant.
   */
  listWorkspaceAccessPage(request: UiWorkspaceAccessPageRequest): Promise<UiWorkspaceAccessPage>
}
