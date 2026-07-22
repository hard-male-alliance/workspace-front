/** @file Workspace 已冻结 HTTP 端点的传输 DTO / Transport DTOs for frozen Workspace HTTP endpoints. */

/** @brief Workspace DTO / Workspace DTO. */
export interface WorkspaceDto {
  /** @brief 工作区 ID / Workspace ID. */
  readonly id: string
  /** @brief 创建时间 / Creation timestamp. */
  readonly created_at: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updated_at: string
  /** @brief 资源修订号 / Resource revision. */
  readonly revision: number
  /** @brief 工作区名称 / Workspace name. */
  readonly name: string
  /** @brief 工作区 slug / Workspace slug. */
  readonly slug: string
  /** @brief 默认内容语言 / Default content locale. */
  readonly default_locale: string
  /** @brief IANA 时区 / IANA timezone. */
  readonly timezone: string
  /** @brief 套餐代码 / Plan code. */
  readonly plan: string
}
