import { describe, expect, it } from 'vitest'

import {
  applyKnowledgeUsagePreset,
  createSafeKnowledgeVisibilityPolicy,
  shouldAutomaticallyIngestKnowledge
} from './VisibilityPolicyFields'

describe('Knowledge usage presets', (): void => {
  it('configures Interview retrieval and automatic ingestion without granting write-back', (): void => {
    /** @brief 仅用于模拟面试的完整来源策略 / Complete source policy used only for Interview. */
    const policy = applyKnowledgeUsagePreset(createSafeKnowledgeVisibilityPolicy(), 'interview')

    expect(policy.agentGrants).toEqual([
      {
        agentScope: 'interview_coach',
        allowedOperations: ['retrieve', 'quote', 'summarize', 'derive'],
        effect: 'allow'
      }
    ])
    expect(policy.allowExternalModelProcessing).toBe(true)
    expect(policy.sessionOverrideAllowed).toBe(true)
    expect(shouldAutomaticallyIngestKnowledge(policy)).toBe(true)
  })

  it('removes product grants and disables automatic ingestion for stored-only notes', (): void => {
    /** @brief 先配置两种 AI 用途的来源策略 / Source policy initially configured for both AI usages. */
    const shared = applyKnowledgeUsagePreset(
      createSafeKnowledgeVisibilityPolicy(),
      'resume_and_interview'
    )
    /** @brief 切回仅保存后的来源策略 / Source policy after switching back to stored-only. */
    const storedOnly = applyKnowledgeUsagePreset(shared, 'stored_only')

    expect(storedOnly.agentGrants).toEqual([])
    expect(storedOnly.allowExternalModelProcessing).toBe(false)
    expect(storedOnly.sessionOverrideAllowed).toBe(false)
    expect(shouldAutomaticallyIngestKnowledge(storedOnly)).toBe(false)
  })
})
