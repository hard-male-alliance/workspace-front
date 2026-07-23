/** @file 跨限界上下文的资源引用 / Cross-bounded-context resource references. */

/**
 * @brief API v2 通用 ResourceRef 的应用投影 / Application projection of the API v2 generic ResourceRef.
 * @note `resourceType` 是服务端开放 code；`revision` 保留 wire 上缺失、null 与整数三种语义。 / `resourceType` is an open server code; `revision` preserves the wire distinction among absent, null, and integer values.
 */
export interface UiResourceReference {
  /** @brief 稳定资源类型 code / Stable resource-type code. */
  readonly resourceType: string
  /** @brief 不透明资源身份 / Opaque resource identity. */
  readonly id: string
  /** @brief 可选领域 revision；保留缺失与 null 的区别 / Optional domain revision, preserving absence versus null. */
  readonly revision?: number | null
}
