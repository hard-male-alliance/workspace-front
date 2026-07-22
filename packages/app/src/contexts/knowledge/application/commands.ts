/** @file Knowledge 应用用例输入 / Knowledge application use-case inputs. */

import type { UiKnowledgeSourceId } from '../../../shared-kernel/identity'
import type { UiKnowledgeVisibilityPolicy } from '../domain/models'

/** @brief 更新知识来源可见性策略的应用输入 / Application input for updating a knowledge-source visibility policy. */
export interface UiKnowledgeVisibilityUpdateInput {
  /** @brief 目标知识来源 / Target knowledge source. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief 用户确认后的完整策略 / Complete policy confirmed by the user. */
  readonly visibility: UiKnowledgeVisibilityPolicy
  /** @brief 请求取消信号 / Request cancellation signal. */
  readonly signal?: AbortSignal | undefined
}
