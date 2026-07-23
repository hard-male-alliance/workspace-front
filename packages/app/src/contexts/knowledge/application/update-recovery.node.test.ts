/** @file KnowledgeSource 条件更新恢复决策测试 / Conditional KnowledgeSource update-recovery decision tests. */

import { describe, expect, it } from 'vitest'

import { asUiOpaqueId } from '../../../shared-kernel/identity'
import type { UiKnowledgeSource, UiKnowledgeVisibilityPolicy } from '../domain/models'
import {
  classifyKnowledgeUpdateRecovery,
  KnowledgeUpdateRecoveryError,
  knowledgeVisibilityPoliciesEqual
} from './update-recovery'

/** @brief 测试完整策略 / Complete policy used by tests. */
const POLICY: UiKnowledgeVisibilityPolicy = {
  agentGrants: [
    {
      agentScope: 'resume_assistant',
      allowedOperations: ['retrieve', 'quote'],
      effect: 'allow'
    },
    {
      agentScope: 'resume_assistant',
      allowedOperations: ['write_back'],
      effect: 'deny'
    }
  ],
  allowExternalModelProcessing: false,
  allowedModelRegions: ['cn', 'private_deployment'],
  defaultEffect: 'deny',
  policyVersion: 3,
  retentionDays: 365,
  sensitivity: 'confidential',
  sessionOverrideAllowed: false
}

/** @brief 测试权威来源 / Authoritative source used by tests. */
const SOURCE: UiKnowledgeSource = {
  createdAt: '2026-07-23T00:00:00Z',
  currentVersionId: null,
  enabled: true,
  id: asUiOpaqueId<'knowledge-source'>('knowledge_source_recovery_test'),
  ingestion: {
    chunkCount: 10,
    documentCount: 2,
    lastProblem: null,
    lastSuccessAt: '2026-07-23T01:00:00Z',
    status: 'ready'
  },
  name: 'Runtime notes',
  publicConfig: {},
  revision: 4,
  sourceType: 'manual_note',
  updatedAt: '2026-07-23T01:00:00Z',
  visibility: POLICY,
  workspaceId: asUiOpaqueId<'workspace'>('workspace_knowledge_recovery_test')
}

describe('KnowledgeSource update recovery', (): void => {
  it('treats a matching reread as confirmation without replay', (): void => {
    expect(
      classifyKnowledgeUpdateRecovery(
        SOURCE,
        { ...SOURCE, name: 'Safer runtime notes', revision: 5 },
        { name: 'Safer runtime notes' },
        true
      )
    ).toEqual({ kind: 'confirmed' })
  })

  it('allows one retry when only an unrelated ingestion field changed', (): void => {
    expect(
      classifyKnowledgeUpdateRecovery(
        SOURCE,
        {
          ...SOURCE,
          ingestion: { ...SOURCE.ingestion, chunkCount: 11 },
          revision: 5
        },
        { name: 'Safer runtime notes' },
        true
      )
    ).toEqual({ kind: 'safe-retry' })
  })

  it('requires manual review when a touched field changed concurrently', (): void => {
    expect(
      classifyKnowledgeUpdateRecovery(
        SOURCE,
        { ...SOURCE, name: 'Remote name', revision: 5 },
        { name: 'Local name' },
        true
      )
    ).toEqual({ changedFields: ['name'], kind: 'conflict' })
  })

  it('requires review after the single automatic retry budget is exhausted', (): void => {
    expect(
      classifyKnowledgeUpdateRecovery(
        SOURCE,
        { ...SOURCE, revision: 6, updatedAt: '2026-07-23T02:00:00Z' },
        { name: 'Local name' },
        false
      )
    ).toEqual({ changedFields: [], kind: 'conflict' })
  })

  it('preserves Agent grant order while treating declared operation and region sets as unordered', (): void => {
    /** @brief 只重排 Schema uniqueItems 集合的策略 / Policy reordering only Schema uniqueItems sets. */
    const reorderedSets: UiKnowledgeVisibilityPolicy = {
      ...POLICY,
      agentGrants: [
        {
          ...POLICY.agentGrants[0]!,
          allowedOperations: ['quote', 'retrieve']
        },
        POLICY.agentGrants[1]!
      ],
      allowedModelRegions: ['private_deployment', 'cn']
    }
    expect(knowledgeVisibilityPoliciesEqual(POLICY, reorderedSets)).toBe(true)
    expect(
      knowledgeVisibilityPoliciesEqual(POLICY, {
        ...POLICY,
        agentGrants: [...POLICY.agentGrants].reverse()
      })
    ).toBe(false)
  })

  it('fails closed when the reread authority belongs to another source', (): void => {
    expect(() =>
      classifyKnowledgeUpdateRecovery(
        SOURCE,
        {
          ...SOURCE,
          id: asUiOpaqueId<'knowledge-source'>('knowledge_source_other_authority')
        },
        { name: 'Local name' },
        true
      )
    ).toThrow(new KnowledgeUpdateRecoveryError('authority-identity-mismatch'))
  })
})
