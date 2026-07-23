/** @file KnowledgeSource 内存 adapter 运行时测试 / Runtime tests for the KnowledgeSource in-memory adapter. */

import { describe, expect, it } from 'vitest'

import type { UiCreateManualKnowledgeNoteCommand } from '../../application/commands'
import { asUiKnowledgeSourcePageLimit } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import {
  MOCK_DEFAULT_VISIBILITY_POLICY,
  MOCK_KNOWLEDGE_SOURCES,
  MOCK_KNOWLEDGE_WORKSPACE_ID
} from './data'
import { InMemoryKnowledgeGateway } from './gateway'

/** @brief 构造测试手工笔记命令 / Build a test manual-note command. */
function manualNoteCommand(): UiCreateManualKnowledgeNoteCommand {
  return {
    commandId: asUiOpaqueId<'command'>('command_knowledge_manual_note_000001'),
    content: 'Safety means nothing bad happens; liveness means something good eventually happens.',
    name: 'Distributed systems notes',
    visibility: MOCK_DEFAULT_VISIBILITY_POLICY,
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
  }
}

describe('InMemoryKnowledgeGateway runtime boundaries', (): void => {
  it('preserves cursor pagination without crossing the requested Workspace', async (): Promise<void> => {
    const gateway = new InMemoryKnowledgeGateway()
    const signal = new AbortController().signal
    const first = await gateway.listKnowledgeSourcePage({
      cursor: null,
      limit: asUiKnowledgeSourcePageLimit(2),
      signal,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })

    expect(first).toMatchObject({
      hasMore: true,
      items: MOCK_KNOWLEDGE_SOURCES.slice(0, 2)
    })
    if (!first.hasMore) throw new Error('Expected another KnowledgeSource page.')
    await expect(
      gateway.listKnowledgeSourcePage({
        cursor: first.nextCursor,
        limit: asUiKnowledgeSourcePageLimit(2),
        signal,
        workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
      })
    ).resolves.toMatchObject({
      items: MOCK_KNOWLEDGE_SOURCES.slice(2, 4)
    })

    await expect(
      gateway.listKnowledgeSourcePage({
        cursor: null,
        limit: asUiKnowledgeSourcePageLimit(200),
        signal,
        workspaceId: asUiOpaqueId<'workspace'>('workspace_other_tenant_000001')
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
  })

  it('fails closed for cross-Workspace read and mutation paths', async (): Promise<void> => {
    const gateway = new InMemoryKnowledgeGateway()
    const signal = new AbortController().signal
    const sourceId = MOCK_KNOWLEDGE_SOURCES[0]!.id
    const otherWorkspace = asUiOpaqueId<'workspace'>('workspace_other_tenant_000001')

    await expect(
      gateway.getKnowledgeSource({
        signal,
        sourceId,
        workspaceId: otherWorkspace
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
    await expect(
      gateway.createManualKnowledgeNote({
        ...manualNoteCommand(),
        workspaceId: otherWorkspace
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
    await expect(
      gateway.updateKnowledgeSource({
        concurrencyToken: asUiOpaqueId<'concurrency-token'>('"untrusted"') as never,
        patch: { name: 'Cross-tenant rename' },
        sourceId,
        workspaceId: otherWorkspace
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
  })

  it('pairs every read with a strong ETag and rejects stale If-Match updates', async (): Promise<void> => {
    const gateway = new InMemoryKnowledgeGateway()
    const signal = new AbortController().signal
    const sourceId = MOCK_KNOWLEDGE_SOURCES[1]!.id
    const first = await gateway.getKnowledgeSource({
      signal,
      sourceId,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })

    expect(first.concurrencyToken).toMatch(/^"[^"]+"$/u)
    const updated = await gateway.updateKnowledgeSource({
      concurrencyToken: first.concurrencyToken,
      patch: {
        name: 'portfolio-engineering-v2',
        visibility: {
          ...first.source.visibility,
          sessionOverrideAllowed: false
        }
      },
      sourceId,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })
    expect(updated.source).toMatchObject({
      name: 'portfolio-engineering-v2',
      revision: first.source.revision + 1,
      visibility: { sessionOverrideAllowed: false }
    })
    expect(updated.concurrencyToken).not.toBe(first.concurrencyToken)

    await expect(
      gateway.updateKnowledgeSource({
        concurrencyToken: first.concurrencyToken,
        patch: { name: 'stale update' },
        sourceId,
        workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
      })
    ).rejects.toMatchObject({ code: 'memory.conflict' })
  })

  it('commits an unknown creation once and confirms it only by exact command replay', async (): Promise<void> => {
    const gateway = new InMemoryKnowledgeGateway({ createOutcomeUnknownOnce: true })
    const command = manualNoteCommand()

    await expect(gateway.createManualKnowledgeNote(command)).rejects.toMatchObject({
      kind: 'network',
      name: 'ApiV2WriteOutcomeUnknownError'
    })
    const replay = await gateway.createManualKnowledgeNote(command)
    const replayAgain = await gateway.createManualKnowledgeNote(command)

    expect(replay).toEqual(replayAgain)
    expect(replay).not.toBe(replayAgain)
    expect(replay.source.sourceType).toBe('manual_note')
    await expect(
      gateway.createManualKnowledgeNote({
        ...command,
        content: 'A changed payload is a new intent.'
      })
    ).rejects.toMatchObject({ code: 'memory.idempotency_key_reused' })

    const all = await gateway.listKnowledgeSourcePage({
      cursor: null,
      limit: asUiKnowledgeSourcePageLimit(200),
      signal: new AbortController().signal,
      workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
    })
    expect(all.items.filter((source) => source.id === replay.source.id)).toHaveLength(1)
  })
})
