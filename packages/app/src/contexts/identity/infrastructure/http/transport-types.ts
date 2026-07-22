/** @file Identity v1 HTTP 传输 DTO / Identity v1 HTTP transport DTO. */

/** @brief 当前用户 DTO / Current-user DTO. */
export interface CurrentUserDto {
  /** @brief 用户 ID / User ID. */
  readonly id: string
  /** @brief 显示名称 / Display name. */
  readonly display_name: string
  /** @brief 用户界面语言 / User-interface locale. */
  readonly locale: string
  /** @brief IANA 时区 / IANA timezone. */
  readonly timezone: string
  /** @brief 创建时间 / Creation timestamp. */
  readonly created_at: string
  /** @brief 默认 Workspace ID / Default Workspace ID. */
  readonly default_workspace_id: string | null
}
