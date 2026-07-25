/** @file KnowledgeSource 的可信内存 adapter / Trustworthy in-memory adapter for KnowledgeSource. */

import { ApiV2WriteOutcomeUnknownError } from '@ai-job-workspace/product-api-v2'

import type { KnowledgeGateway } from '../../application/gateway'
import type {
  UiCreateManualKnowledgeNoteCommand,
  UiKnowledgeSourcePageRead,
  UiKnowledgeSourceRead,
  UiUpdateKnowledgeSourceCommand
} from '../../application/commands'
import {
  asUiKnowledgeSourceCursor,
  type UiKnowledgeSource,
  type UiKnowledgeSourceAuthority,
  type UiKnowledgeSourcePage
} from '../../domain/models'
import {
  asUiConcurrencyToken,
  type UiConcurrencyToken
} from '../../../../shared-kernel/concurrency'
import { asUiOpaqueId, type UiKnowledgeSourceId } from '../../../../shared-kernel/identity'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import { MOCK_KNOWLEDGE_SOURCES, MOCK_KNOWLEDGE_WORKSPACE_ID } from './data'

/** @brief Knowledge 内存 adapter 的专用行为选项 / Knowledge-specific in-memory adapter behavior options. */
export interface InMemoryKnowledgeGatewayOptions extends InMemoryGatewayOptions {
  /**
   * @brief 首次成功创建后模拟一次结果未知 / Simulate one unknown outcome after the first successful creation.
   * @note 来源会先提交，再抛出未知结果；仅能用同一冻结命令确认重放 / The source is committed before the unknown outcome is thrown and can only be confirmed by replaying the same frozen command.
   */
  readonly createOutcomeUnknownOnce?: boolean
}

/** @brief 已缓存的手工笔记创建结果 / Cached manual-note creation result. */
interface CachedManualNoteCreation {
  /** @brief 与完整 wire intent 等价的稳定指纹 / Stable fingerprint equivalent to the complete wire intent. */
  readonly fingerprint: string
  /** @brief 首次确认的创建权威 / First confirmed creation authority. */
  readonly authority: UiKnowledgeSourceAuthority
}

/**
 * @brief 构造创建命令的确定性指纹 / Build a deterministic creation-command fingerprint.
 * @param command 不含 transport 细节的冻结命令 / Frozen command excluding transport details.
 * @return 与 Workspace path 和完整 payload 绑定的指纹 / Fingerprint bound to the Workspace path and complete payload.
 */
function creationFingerprint(command: UiCreateManualKnowledgeNoteCommand): string {
  return JSON.stringify({
    content: command.content,
    name: command.name,
    visibility: {
      agentGrants: command.visibility.agentGrants.map((grant) => ({
        agentScope: grant.agentScope,
        allowedOperations: [...grant.allowedOperations],
        effect: grant.effect
      })),
      allowExternalModelProcessing: command.visibility.allowExternalModelProcessing,
      allowedModelRegions: [...command.visibility.allowedModelRegions],
      defaultEffect: command.visibility.defaultEffect,
      policyVersion: command.visibility.policyVersion,
      retentionDays: command.visibility.retentionDays,
      sensitivity: command.visibility.sensitivity,
      sessionOverrideAllowed: command.visibility.sessionOverrideAllowed
    },
    workspaceId: command.workspaceId
  })
}

/**
 * @brief Knowledge 自动化测试内存适配器 / In-memory adapter for automated Knowledge tests.
 * @note 仅从 testing 入口导出；它按 Workspace 失败关闭，并实现真实的 ETag 与幂等重放边界 / Exported only from the testing entry point; it fails closed by Workspace and implements real ETag and idempotent-replay boundaries.
 */
export class InMemoryKnowledgeGateway implements KnowledgeGateway {
  /** @brief 确定性测试行为 / Deterministic test behavior. */
  readonly #options: InMemoryKnowledgeGatewayOptions

  /** @brief 当前实例拥有的可变来源 / Mutable sources owned by this instance. */
  readonly #sources: UiKnowledgeSource[]

  /** @brief 每个来源当前的强 ETag / Current strong ETag of every source. */
  readonly #entityTags = new Map<UiKnowledgeSourceId, UiConcurrencyToken>()

  /** @brief path-aware 幂等创建缓存 / Path-aware idempotent creation cache. */
  readonly #createdManualNotes = new Map<string, CachedManualNoteCreation>()

  /** @brief 新手工笔记的单调测试序号 / Monotonic test sequence for new manual notes. */
  #manualNoteSequence = 0

  /** @brief 是否仍需模拟一次提交后结果未知 / Whether one post-commit unknown outcome remains to be simulated. */
  #unknownCreationPending: boolean

  /**
   * @brief 构造 Knowledge 内存测试网关 / Construct the Knowledge in-memory test gateway.
   * @param options 确定性行为与可选未知结果注入 / Deterministic behavior and optional unknown-outcome injection.
   */
  constructor(options: InMemoryKnowledgeGatewayOptions = {}) {
    this.#options = options
    this.#sources = [...cloneMemoryValue(MOCK_KNOWLEDGE_SOURCES)]
    this.#unknownCreationPending = options.createOutcomeUnknownOnce === true
    for (const source of this.#sources) {
      this.#entityTags.set(source.id, this.#nextEntityTag(source.id, source.revision))
    }
  }

  /** @inheritdoc */
  async listKnowledgeSourcePage(input: UiKnowledgeSourcePageRead): Promise<UiKnowledgeSourcePage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.#options)
    input.signal.throwIfAborted()
    if (mode === 'empty') {
      return { hasMore: false, items: [], nextCursor: null }
    }
    if (input.workspaceId !== MOCK_KNOWLEDGE_WORKSPACE_ID) {
      return throwMemoryNotFound('Workspace')
    }

    /** @brief cursor 表示的来源 offset / Source offset represented by the cursor. */
    let offset = input.cursor === null ? 0 : -1
    if (input.cursor !== null) {
      for (let index = 0; index < this.#sources.length; index += 1) {
        if (asUiKnowledgeSourceCursor(`knowledge_source_cursor_${index}`) === input.cursor) {
          offset = index
          break
        }
      }
    }
    if (offset < 0) {
      throw new InMemoryGatewayError(
        'memory.not_found',
        'The in-memory KnowledgeSource cursor is not valid.'
      )
    }

    /** @brief 当前页来源副本 / Copies of the sources on the current page. */
    const items = cloneMemoryValue(this.#sources.slice(offset, offset + input.limit))
    /** @brief 下一页起点 / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < this.#sources.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiKnowledgeSourceCursor(`knowledge_source_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /** @inheritdoc */
  async getKnowledgeSource(input: UiKnowledgeSourceRead): Promise<UiKnowledgeSourceAuthority> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.#options)
    input.signal.throwIfAborted()
    if (mode === 'empty' || input.workspaceId !== MOCK_KNOWLEDGE_WORKSPACE_ID) {
      return throwMemoryNotFound('KnowledgeSource')
    }
    /** @brief 与 path identities 同时匹配的来源 / Source matching both path identities. */
    const source = this.#sources.find(
      (candidate) => candidate.workspaceId === input.workspaceId && candidate.id === input.sourceId
    )
    /** @brief 与来源当前表示配对的 ETag / ETag paired with the source's current representation. */
    const concurrencyToken = this.#entityTags.get(input.sourceId)
    if (source === undefined || concurrencyToken === undefined) {
      return throwMemoryNotFound('KnowledgeSource')
    }
    return cloneMemoryValue({ concurrencyToken, source })
  }

  /** @inheritdoc */
  async createManualKnowledgeNote(
    command: UiCreateManualKnowledgeNoteCommand
  ): Promise<UiKnowledgeSourceAuthority> {
    command.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.#options)
    command.signal?.throwIfAborted()
    if (mode === 'empty' || command.workspaceId !== MOCK_KNOWLEDGE_WORKSPACE_ID) {
      return throwMemoryNotFound('Workspace')
    }

    /** @brief 与 collection path 绑定的幂等缓存 key / Idempotency cache key bound to the collection path. */
    const cacheKey = JSON.stringify([command.workspaceId, command.commandId])
    /** @brief 不含 signal 的完整创建指纹 / Complete creation fingerprint excluding the signal. */
    const fingerprint = creationFingerprint(command)
    /** @brief 相同幂等键的既有创建 / Existing creation for the same idempotency key. */
    const cached = this.#createdManualNotes.get(cacheKey)
    if (cached !== undefined) {
      if (cached.fingerprint !== fingerprint) {
        throw new InMemoryGatewayError(
          'memory.idempotency_key_reused',
          'The in-memory KnowledgeSource creation key was reused with a different intent.'
        )
      }
      return cloneMemoryValue(cached.authority)
    }

    this.#manualNoteSequence += 1
    /** @brief 新来源 identity / Identity of the new source. */
    const sourceId = asUiOpaqueId<'knowledge-source'>(
      `knowledge_manual_note_${String(this.#manualNoteSequence).padStart(6, '0')}`
    )
    /** @brief 新建手工笔记来源 / Newly created manual-note source. */
    const source: UiKnowledgeSource = {
      createdAt: '2026-07-23T00:00:00.000Z',
      currentVersionId: null,
      enabled: true,
      id: sourceId,
      ingestion: {
        chunkCount: 0,
        documentCount: 0,
        lastProblem: null,
        lastSuccessAt: null,
        status: 'not_started'
      },
      name: command.name,
      publicConfig: {},
      revision: 1,
      sourceType: 'manual_note',
      updatedAt: '2026-07-23T00:00:00.000Z',
      visibility: cloneMemoryValue(command.visibility),
      workspaceId: command.workspaceId
    }
    /** @brief 创建表示的强 ETag / Strong ETag of the created representation. */
    const concurrencyToken = this.#nextEntityTag(source.id, source.revision)
    /** @brief 首次创建权威 / First creation authority. */
    const authority = { concurrencyToken, source }
    this.#sources.push(source)
    this.#entityTags.set(source.id, concurrencyToken)
    this.#createdManualNotes.set(cacheKey, {
      authority: cloneMemoryValue(authority),
      fingerprint
    })

    if (this.#unknownCreationPending) {
      this.#unknownCreationPending = false
      throw new ApiV2WriteOutcomeUnknownError('network')
    }
    return cloneMemoryValue(authority)
  }

  /** @inheritdoc */
  async updateKnowledgeSource(
    command: UiUpdateKnowledgeSourceCommand
  ): Promise<UiKnowledgeSourceAuthority> {
    command.signal?.throwIfAborted()
    const mode = await prepareMemoryRead(this.#options)
    command.signal?.throwIfAborted()
    if (mode === 'empty' || command.workspaceId !== MOCK_KNOWLEDGE_WORKSPACE_ID) {
      return throwMemoryNotFound('KnowledgeSource')
    }

    /** @brief path identities 匹配的来源位置 / Position of the source matching the path identities. */
    const sourceIndex = this.#sources.findIndex(
      (candidate) =>
        candidate.workspaceId === command.workspaceId && candidate.id === command.sourceId
    )
    if (sourceIndex < 0) return throwMemoryNotFound('KnowledgeSource')
    /** @brief 当前权威来源 / Current authoritative source. */
    const current = this.#sources[sourceIndex]!
    /** @brief 当前强 ETag / Current strong ETag. */
    const currentEntityTag = this.#entityTags.get(current.id)
    if (currentEntityTag === undefined || currentEntityTag !== command.concurrencyToken) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The in-memory KnowledgeSource representation is stale.'
      )
    }

    /** @brief 更新后的完整来源 / Complete updated source. */
    const updated: UiKnowledgeSource = {
      ...current,
      ...(command.patch.name === undefined ? {} : { name: command.patch.name }),
      ...(command.patch.visibility === undefined
        ? {}
        : { visibility: cloneMemoryValue(command.patch.visibility) }),
      revision: current.revision + 1,
      updatedAt: '2026-07-23T00:00:01.000Z'
    }
    /** @brief 更新后强 ETag / Strong ETag after the update. */
    const concurrencyToken = this.#nextEntityTag(updated.id, updated.revision)
    this.#sources[sourceIndex] = updated
    this.#entityTags.set(updated.id, concurrencyToken)
    return cloneMemoryValue({ concurrencyToken, source: updated })
  }

  /**
   * @brief 为当前内存表示构造强 ETag / Construct a strong ETag for the current in-memory representation.
   * @param sourceId 来源 identity / Source identity.
   * @param sequence 与当前表示绑定的单调序号 / Monotonic sequence bound to the current representation.
   * @return 可原样用于 If-Match 的强 ETag / Strong ETag safe to replay as If-Match.
   */
  #nextEntityTag(sourceId: UiKnowledgeSourceId, sequence: number): UiConcurrencyToken {
    return asUiConcurrencyToken(`"memory-${sourceId}-${String(sequence)}"`)
  }
}
