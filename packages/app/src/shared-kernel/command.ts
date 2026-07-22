/** @file 跨限界上下文的前端命令身份 / Frontend command identity shared across bounded contexts. */

import { asUiOpaqueId, type UiOpaqueId } from './identity'

/** @brief 用户发起的一次稳定命令身份 / Stable identity for one user-issued command. */
export type UiCommandId = UiOpaqueId<'command'>

/**
 * @brief 为一次新的用户意图创建稳定命令身份 / Create a stable command identity for one new user intent.
 * @return 满足共享不透明标识格式的命令 ID / Command ID satisfying the shared opaque-identity format.
 * @note 同一命令的结果确认必须复用返回值；只有新的用户意图才能再次调用本函数。 / Outcome confirmation for the same command must reuse the returned value; call this function again only for a new user intent.
 */
export function createUiCommandId(): UiCommandId {
  return asUiOpaqueId<'command'>(`command_${globalThis.crypto.randomUUID()}`)
}
