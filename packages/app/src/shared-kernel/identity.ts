/** @file 跨上下文不透明标识符 / Cross-context opaque identities. */

/**
 * @brief 带语义品牌的不透明标识符 / Semantically branded opaque identifier.
 * @template TBrand 标识符类别 / Identifier category.
 * @note 此品牌只在前端类型系统中生效，绝不推断后端 ID 的格式或排序。
 */
export type UiOpaqueId<TBrand extends string> = string & {
  readonly __uiOpaqueIdBrand: TBrand
}

/** @brief 工作区标识符 / Workspace identifier. */
export type UiWorkspaceId = UiOpaqueId<'workspace'>

/** @brief 跨上下文知识来源标识符 / Cross-context Knowledge source identifier. */
export type UiKnowledgeSourceId = UiOpaqueId<'knowledge-source'>

/**
 * @brief 将字符串显式标记为 UI 不透明 ID / Explicitly brand a string as a UI opaque ID.
 * @template TBrand 标识符类别 / Identifier category.
 * @param value 不透明字符串值 / Opaque string value.
 * @return 带前端语义品牌的标识符 / Frontend-semantically branded identifier.
 * @note 该函数不校验、解析或生成后端 ID。
 */
export const asUiOpaqueId = <TBrand extends string>(value: string): UiOpaqueId<TBrand> =>
  value as UiOpaqueId<TBrand>
