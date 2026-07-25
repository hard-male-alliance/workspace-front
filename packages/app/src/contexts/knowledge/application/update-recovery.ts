/** @file KnowledgeSource 条件更新恢复决策 / Conditional KnowledgeSource update-recovery decisions. */

import type {
  UiAgentScopeGrant,
  UiKnowledgeSource,
  UiKnowledgeVisibilityPolicy
} from '../domain/models'
import type { UiKnowledgeSourcePatch } from './commands'

/** @brief 发生并发变化的用户可编辑字段 / User-editable fields changed concurrently. */
export type UiKnowledgeUpdateConflictField = 'name' | 'visibility'

/** @brief 条件更新重读后的安全恢复决策 / Safe recovery decision after rereading a conditional update. */
export type UiKnowledgeUpdateRecovery =
  | {
      /** @brief 最新权威已经反映冻结 patch / Latest authority already reflects the frozen patch. */
      readonly kind: 'confirmed'
    }
  | {
      /** @brief 触及字段未变化，可用新 ETag 自动重试一次 / Touched fields did not change; one automatic retry with the new ETag is safe. */
      readonly kind: 'safe-retry'
    }
  | {
      /** @brief 需要用户基于最新权威审阅草稿 / The user must review the draft against latest authority. */
      readonly kind: 'conflict'
      /** @brief 相对原 base 已改变的触及字段 / Touched fields changed relative to the original base. */
      readonly changedFields: readonly UiKnowledgeUpdateConflictField[]
    }

/** @brief Knowledge 更新恢复不变量错误 code / Knowledge update-recovery invariant error code. */
export type KnowledgeUpdateRecoveryErrorCode =
  'authority-identity-mismatch' | 'authority-revision-regressed'

/** @brief 不暴露资源数据的更新恢复错误 / Update-recovery error exposing no resource data. */
export class KnowledgeUpdateRecoveryError extends Error {
  /** @brief 稳定错误 code / Stable error code. */
  readonly code: KnowledgeUpdateRecoveryErrorCode

  /**
   * @brief 构造更新恢复不变量错误 / Construct an update-recovery invariant error.
   * @param code 稳定错误 code / Stable error code.
   */
  constructor(code: KnowledgeUpdateRecoveryErrorCode) {
    super(`KnowledgeSource update recovery rejected authority: ${code}.`)
    this.name = 'KnowledgeUpdateRecoveryError'
    this.code = code
  }
}

/**
 * @brief 比较两个唯一值集合 / Compare two unique-value sets.
 * @template TValue 集合元素 / Set element.
 * @param left 左集合 / Left set.
 * @param right 右集合 / Right set.
 * @return 成员完全相同时为 true / True when membership is identical.
 */
function uniqueSetsEqual<TValue>(left: readonly TValue[], right: readonly TValue[]): boolean {
  return (
    left.length === right.length &&
    left.every((candidate) => right.some((other) => Object.is(candidate, other)))
  )
}

/**
 * @brief 比较同一序位的 Agent grant / Compare Agent grants at the same sequence position.
 * @param left 左 grant / Left grant.
 * @param right 右 grant / Right grant.
 * @return scope、effect 与操作集合相同时为 true / True when scope, effect, and operation set are equal.
 */
function agentGrantsEqual(left: UiAgentScopeGrant, right: UiAgentScopeGrant): boolean {
  return (
    left.agentScope === right.agentScope &&
    left.effect === right.effect &&
    uniqueSetsEqual(left.allowedOperations, right.allowedOperations)
  )
}

/**
 * @brief 比较完整策略的 canonical 产品语义 / Compare canonical product semantics of complete policies.
 * @param left 左策略 / Left policy.
 * @param right 右策略 / Right policy.
 * @return 仅忽略 Schema 明确 uniqueItems 集合的顺序后相同时为 true / True when equal after ignoring order only for Schema-declared unique sets.
 * @note `agentGrants` 的规则顺序必须保留，重复 scope 不会被合并 / Agent-rule order is preserved and duplicate scopes are never merged.
 */
export function knowledgeVisibilityPoliciesEqual(
  left: UiKnowledgeVisibilityPolicy,
  right: UiKnowledgeVisibilityPolicy
): boolean {
  return (
    left.sensitivity === right.sensitivity &&
    left.defaultEffect === right.defaultEffect &&
    left.sessionOverrideAllowed === right.sessionOverrideAllowed &&
    left.allowExternalModelProcessing === right.allowExternalModelProcessing &&
    left.retentionDays === right.retentionDays &&
    left.policyVersion === right.policyVersion &&
    uniqueSetsEqual(left.allowedModelRegions, right.allowedModelRegions) &&
    left.agentGrants.length === right.agentGrants.length &&
    left.agentGrants.every((grant, index) => {
      /** @brief 右策略同一序位的规则 / Rule at the same position in the right policy. */
      const other = right.agentGrants[index]
      return other !== undefined && agentGrantsEqual(grant, other)
    })
  )
}

/**
 * @brief 判断权威来源是否已经反映冻结 patch / Determine whether authority already reflects a frozen patch.
 * @param source 最新权威来源 / Latest authoritative source.
 * @param patch 冻结的非空 patch / Frozen non-empty patch.
 * @return patch 的全部字段均匹配时为 true / True when every patch field matches.
 */
function sourceMatchesPatch(source: UiKnowledgeSource, patch: UiKnowledgeSourcePatch): boolean {
  return (
    (!('name' in patch) || patch.name === undefined || source.name === patch.name) &&
    (!('visibility' in patch) ||
      patch.visibility === undefined ||
      knowledgeVisibilityPoliciesEqual(source.visibility, patch.visibility))
  )
}

/**
 * @brief 对 PATCH 结果未知或 412 后的权威重读做安全决策 / Decide safe recovery after an unknown PATCH outcome or 412.
 * @param base 发出 PATCH 时的原权威来源 / Original authoritative source when PATCH was sent.
 * @param latest 重读得到的最新权威来源 / Latest authoritative source obtained by rereading.
 * @param patch 已发出的冻结 patch / Frozen patch that was sent.
 * @param automaticRetryAvailable 是否仍有一次自动安全重试预算 / Whether one automatic safe-retry budget remains.
 * @return 已确认、安全重试或人工冲突审阅 / Confirmed, safe retry, or manual conflict review.
 */
export function classifyKnowledgeUpdateRecovery(
  base: UiKnowledgeSource,
  latest: UiKnowledgeSource,
  patch: UiKnowledgeSourcePatch,
  automaticRetryAvailable: boolean
): UiKnowledgeUpdateRecovery {
  if (base.id !== latest.id || base.workspaceId !== latest.workspaceId) {
    throw new KnowledgeUpdateRecoveryError('authority-identity-mismatch')
  }
  if (latest.revision < base.revision) {
    throw new KnowledgeUpdateRecoveryError('authority-revision-regressed')
  }
  if (sourceMatchesPatch(latest, patch)) return { kind: 'confirmed' }

  /** @brief 本次 patch 触及且被其他位置改变的字段 / Fields touched by this patch and changed elsewhere. */
  const changedFields: UiKnowledgeUpdateConflictField[] = []
  if ('name' in patch && patch.name !== undefined && latest.name !== base.name) {
    changedFields.push('name')
  }
  if (
    'visibility' in patch &&
    patch.visibility !== undefined &&
    !knowledgeVisibilityPoliciesEqual(latest.visibility, base.visibility)
  ) {
    changedFields.push('visibility')
  }
  return changedFields.length === 0 && automaticRetryAvailable
    ? { kind: 'safe-retry' }
    : { changedFields, kind: 'conflict' }
}
