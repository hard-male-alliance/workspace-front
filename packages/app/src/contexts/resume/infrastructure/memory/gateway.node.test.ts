/** @file Resume 内存 adapter 测试 / Resume in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { InMemoryGatewayError } from '../../../../infrastructure/memory'
import { createUiCommandId } from '../../../../shared-kernel/command'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import { loadResumeTemplateSettings } from '../../application/template-catalog'
import { asUiResumeTemplatePageLimit } from '../../domain/creation'
import type { UiResumeEditorModel } from '../../domain/document'
import { asUiResumePageLimit } from '../../domain/models'
import {
  MOCK_EDITORIAL_TEMPLATE,
  MOCK_HISTORICAL_DAWN_TEMPLATE,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID
} from './data'
import { InMemoryResumeGateway } from './gateway'

/** @brief 不会取消的测试读取信号 / Test read signal that remains active. */
const ACTIVE_RESUME_READ_SIGNAL = new AbortController().signal

/**
 * @brief 通过正式分离端口读取模板设置页 / Read a template-settings page through the formally separated ports.
 * @param gateway 同时实现 Resume 与 Template 的内存 adapter / In-memory adapter implementing both Resume and Template ports.
 * @return 组合后的模板设置投影 / Composed template-settings projection.
 */
function readTemplateSettings(
  gateway: InMemoryResumeGateway
): ReturnType<typeof loadResumeTemplateSettings> {
  return loadResumeTemplateSettings(
    gateway,
    gateway,
    MOCK_RESUME_WORKSPACE_ID,
    MOCK_RESUME_ID,
    ACTIVE_RESUME_READ_SIGNAL
  )
}

describe('InMemoryResumeGateway', () => {
  it('makes the configured empty state explicit', async () => {
    const gateway = new InMemoryResumeGateway({ mode: 'empty' })

    await expect(
      gateway.listResumeSummariesPage({
        cursor: null,
        limit: asUiResumePageLimit(20),
        signal: new AbortController().signal,
        workspaceId: MOCK_RESUME_WORKSPACE_ID
      })
    ).resolves.toEqual({ hasMore: false, items: [], nextCursor: null })
    await expect(
      gateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_RESUME_READ_SIGNAL)
    ).rejects.toBeInstanceOf(InMemoryGatewayError)
  })

  it('cancels an in-flight editor read when its resource identity expires', async () => {
    /** @brief 带延迟以暴露取消窗口的内存网关 / Memory gateway with a delay exposing the cancellation window. */
    const gateway = new InMemoryResumeGateway({ delayMs: 5 })
    /** @brief 当前编辑器读取的取消控制器 / Cancellation controller for the current editor read. */
    const controller = new AbortController()
    /** @brief 尚在延迟窗口中的编辑器读取 / Editor read still inside the delay window. */
    const read = gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      controller.signal
    )

    controller.abort(new DOMException('Resume identity changed.', 'AbortError'))

    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('never exposes mutable Resume aggregate references across editor reads', async () => {
    /** @brief 独享内存状态的测试网关 / Test gateway owning isolated in-memory state. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 首次返回的深拷贝 / Deep clone returned by the first read. */
    const first = await gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 第二次返回的独立深拷贝 / Independent deep clone returned by the second read. */
    const second = await gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.resume).not.toBe(second.resume)
    expect(first.resume.profile).not.toBe(second.resume.profile)
    expect(first.resume.profile.contacts).not.toBe(second.resume.profile.contacts)
    expect(first.resume.sections).not.toBe(second.resume.sections)
    expect(first.resume.sections[0]).not.toBe(second.resume.sections[0])
    expect(first.resume.styleIntent).not.toBe(second.resume.styleIntent)
    expect(first.resume.styleIntent.extensions).not.toBe(second.resume.styleIntent.extensions)
    expect(first.resume.styleIntent.templateSettings).not.toBe(
      second.resume.styleIntent.templateSettings
    )
  })

  it('paginates Resume summaries with a closed cursor relation', async () => {
    /** @brief 独享 Resume 内存网关 / Dedicated Resume in-memory gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 可取消的测试读取 / Abortable test read. */
    const controller = new AbortController()
    /** @brief 只取一条的首页 / First page containing one item. */
    const firstPage = await resumeGateway.listResumeSummariesPage({
      cursor: null,
      limit: asUiResumePageLimit(1),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    expect(firstPage).toMatchObject({
      hasMore: true,
      items: [{ workspaceId: MOCK_RESUME_WORKSPACE_ID }]
    })
    if (!firstPage.hasMore) throw new Error('Expected the first Mock Resume page to continue.')

    /** @brief 使用服务端游标读取的末页 / Terminal page read with the service cursor. */
    const lastPage = await resumeGateway.listResumeSummariesPage({
      cursor: firstPage.nextCursor,
      limit: asUiResumePageLimit(1),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    expect(lastPage).toMatchObject({
      hasMore: false,
      items: [{ workspaceId: MOCK_RESUME_WORKSPACE_ID }],
      nextCursor: null
    })
    expect(new Set([...firstPage.items, ...lastPage.items].map((summary) => summary.id)).size).toBe(
      2
    )
  })

  it('honours an aborted Resume page read before publishing data', async () => {
    const resumeGateway = new InMemoryResumeGateway({ delayMs: 5 })
    const controller = new AbortController()
    const page = resumeGateway.listResumeSummariesPage({
      cursor: null,
      limit: asUiResumePageLimit(20),
      signal: controller.signal,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })

    controller.abort(new DOMException('Workspace changed.', 'AbortError'))

    await expect(page).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('implements the immutable Template catalog and idempotent Resume creation ports', async () => {
    /** @brief 同一测试共享的 Resume 能力适配器 / Resume capability adapter shared within this test. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 目录与创建共用的取消控制器 / Cancellation controller shared by catalog and creation calls. */
    const controller = new AbortController()
    /** @brief 只包含一个 Template 的首页 / First Template page containing one item. */
    const firstPage = await gateway.listTemplatePage({
      cursor: null,
      limit: asUiResumeTemplatePageLimit(1),
      signal: controller.signal
    })
    expect(firstPage).toMatchObject({ hasMore: true, items: [{ version: '1.0.0' }] })
    if (!firstPage.hasMore) throw new Error('Expected the Mock Template catalog to continue.')
    await expect(
      gateway.listTemplatePage({
        cursor: firstPage.nextCursor,
        limit: asUiResumeTemplatePageLimit(1),
        signal: controller.signal
      })
    ).resolves.toMatchObject({ hasMore: false, nextCursor: null })
    await expect(
      gateway.getTemplate(
        {
          templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
          templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
        },
        controller.signal
      )
    ).resolves.toEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)

    /** @brief 一次用户创建意图 / One user creation intent. */
    const creationAttemptId = createUiCommandId()
    /** @brief 首次创建命令 / Initial creation command. */
    const command = {
      creationAttemptId,
      locale: 'en-US',
      signal: controller.signal,
      source: { kind: 'new' } as const,
      template: {
        templateId: MOCK_EDITORIAL_TEMPLATE.id,
        templateVersion: MOCK_EDITORIAL_TEMPLATE.version
      },
      title: 'Idempotent creation test',
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    }
    /** @brief 首次创建结果 / First creation result. */
    const created = await gateway.createResume(command)
    await expect(gateway.createResume(command)).resolves.toEqual(created)
    await expect(
      gateway.createResume({ ...command, title: 'A different payload under the same key' })
    ).rejects.toBeInstanceOf(InMemoryGatewayError)
    expect(created).toMatchObject({
      resource: {
        locale: command.locale,
        template: command.template,
        title: command.title,
        workspaceId: command.workspaceId
      }
    })
  })

  it('keeps PDF rendering split into start and status recovery', async () => {
    const resumeGateway = new InMemoryResumeGateway()

    const started = await resumeGateway.startResumePdfRender({
      commandId: 'command_render_memory_test' as never,
      resumeId: MOCK_RESUME_ID,
      resumeRevision: 18,
      workspaceId: MOCK_RESUME_WORKSPACE_ID
    })
    const completed = await resumeGateway.getResumeRenderJob(started.id)

    expect(started.status).toBe('queued')
    expect(completed.status).toBe('succeeded')
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.artifacts[0]).toMatchObject({ id: 'artifact_mock_18' })
  })

  it('routes section structure and current-template settings through the resume gateway', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new InMemoryResumeGateway()
    /** @brief 初始编辑器 / Initial editor. */
    const initial = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 反向板块顺序 / Reversed section order. */
    const reversedSectionIds = initial.resume.sections.map((section) => section.id).reverse()

    const reordered = await resumeGateway.reorderResumeSections({
      baseRevision: initial.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: initial.concurrencyToken,
      resumeId: MOCK_RESUME_ID,
      orderedSectionIds: reversedSectionIds,
      workspaceId: initial.resume.workspaceId
    })
    expect(reordered.resume.sections.map((section) => section.id)).toEqual(reversedSectionIds)
    expect(reordered.concurrencyToken).not.toBe(initial.concurrencyToken)

    const sectionToDelete = reordered.resume.sections[0]
    if (sectionToDelete === undefined) {
      throw new Error('Expected the Mock resume to contain a section to delete.')
    }

    const deleted = await resumeGateway.deleteResumeSection({
      baseRevision: reordered.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: reordered.concurrencyToken,
      resumeId: MOCK_RESUME_ID,
      sectionId: sectionToDelete.id,
      workspaceId: reordered.resume.workspaceId
    })
    expect(deleted.resume.sections.some((section) => section.id === sectionToDelete.id)).toBe(false)

    /** @brief 删除后读取的当前固定模板设置 / Current pinned-template settings read after deletion. */
    const settings = await readTemplateSettings(resumeGateway)
    /** @brief 调用方仍可持有并尝试修改的样式 command 值 / Style command value that remains reachable and mutable by its caller. */
    const submittedStyleIntent = { ...settings.styleIntent, density: 0.75 }
    const saved = await resumeGateway.updateTemplateSettings({
      baseRevision: deleted.resume.revision,
      concurrencyToken: deleted.concurrencyToken,
      resumeId: MOCK_RESUME_ID,
      styleIntent: submittedStyleIntent,
      templateId: settings.selectedTemplate.id,
      templateVersion: settings.selectedTemplate.version,
      workspaceId: settings.workspaceId
    })
    expect(saved.resume.styleIntent.density).toBe(0.75)
    expect(saved.resume.template).toEqual({
      templateId: settings.selectedTemplate.id,
      templateVersion: settings.selectedTemplate.version
    })

    Object.defineProperty(submittedStyleIntent, 'density', { enumerable: true, value: 0.1 })
    await expect(
      resumeGateway.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
    ).resolves.toMatchObject({ resume: { styleIntent: { density: 0.75 } } })
  })

  it('binds every mutation to Workspace, revision, and an independently evolving strong ETag', async () => {
    /** @brief 独享并发状态的测试网关 / Test gateway owning isolated concurrency state. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 初始原子权威 / Initial atomic authority. */
    const initial = await gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 带完整条目结构的经历区段 / Experience section carrying the complete item structure. */
    const experience = initial.resume.sections.find((section) => section.kind === 'experience')
    if (experience === undefined) throw new Error('Expected an experience section fixture.')
    /** @brief 写入前的完整首条经历 / Complete first experience item before the write. */
    const originalItem = experience.items[0]
    if (originalItem === undefined) throw new Error('Expected an experience item fixture.')

    await expect(
      gateway.updateResumeSection({
        baseRevision: initial.resume.revision,
        commandId: createUiCommandId(),
        concurrencyToken: initial.concurrencyToken,
        content: { marks: [], text: '不得跨 Workspace 写入' },
        resumeId: initial.resume.id,
        sectionId: experience.id,
        workspaceId: asUiOpaqueId<'workspace'>('ws_other_tenant')
      })
    ).rejects.toBeInstanceOf(InMemoryGatewayError)

    /** @brief 一次合法写入后的新权威 / New authority after one valid write. */
    const updated = await gateway.updateResumeSection({
      baseRevision: initial.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: initial.concurrencyToken,
      content: {
        marks: [{ end: 2, kind: 'strong', start: 0 }],
        text: '新的经历导语'
      },
      resumeId: initial.resume.id,
      sectionId: experience.id,
      workspaceId: initial.resume.workspaceId
    })
    /** @brief 写入后仍保留的完整首条经历 / Complete first experience item preserved after the write. */
    const preservedItem = updated.resume.sections.find((section) => section.id === experience.id)
      ?.items[0]

    expect(updated.resume.revision).toBe(initial.resume.revision + 1)
    expect(updated.concurrencyToken).not.toBe(initial.concurrencyToken)
    expect(updated.concurrencyToken).not.toContain(String(updated.resume.revision))
    expect(
      updated.resume.sections.find((section) => section.id === experience.id)?.content
    ).toEqual({ marks: [{ end: 2, kind: 'strong', start: 0 }], text: '新的经历导语' })
    expect(preservedItem).toEqual(originalItem)

    await expect(
      gateway.updateResumeSection({
        baseRevision: updated.resume.revision,
        commandId: createUiCommandId(),
        concurrencyToken: initial.concurrencyToken,
        title: 'stale ETag',
        resumeId: updated.resume.id,
        sectionId: experience.id,
        workspaceId: updated.resume.workspaceId
      })
    ).rejects.toMatchObject({ name: 'ResumeSnapshotConflictError' })
    await expect(
      gateway.updateResumeSection({
        baseRevision: initial.resume.revision,
        commandId: createUiCommandId(),
        concurrencyToken: updated.concurrencyToken,
        title: 'stale revision',
        resumeId: updated.resume.id,
        sectionId: experience.id,
        workspaceId: updated.resume.workspaceId
      })
    ).rejects.toMatchObject({ name: 'ResumeSnapshotConflictError' })
  })

  it('replays the first confirmed section-command result and rejects key reuse with a different intent', async () => {
    /** @brief 独享幂等缓存的测试网关 / Test gateway owning an isolated idempotency cache. */
    const gateway = new InMemoryResumeGateway()
    /** @brief 首次 command 基于的权威 / Authority on which the first command is based. */
    const initial = await gateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    /** @brief 目标 section / Target section. */
    const section = initial.resume.sections[0]
    if (section === undefined) throw new Error('Expected a Resume section fixture.')
    /** @brief 首次执行与安全重放共享的 command / Command shared by first execution and safe replay. */
    const command = {
      baseRevision: initial.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: initial.concurrencyToken,
      resumeId: initial.resume.id,
      sectionId: section.id,
      title: '幂等确认标题',
      workspaceId: initial.resume.workspaceId
    } as const

    /** @brief 首次确认结果 / First confirmed result. */
    const first = await gateway.updateResumeSection(command)
    /** @brief 即使当前 revision 已前进仍应返回的首次结果 / First result replayed even after current revision advanced. */
    const replay = await gateway.updateResumeSection(command)

    expect(replay).toEqual(first)
    expect(replay).not.toBe(first)
    expect(replay.resume).not.toBe(first.resume)
    await expect(
      gateway.updateResumeSection({ ...command, title: '同 key 的不同意图' })
    ).rejects.toMatchObject({
      code: 'memory.idempotency_key_reused',
      name: 'InMemoryGatewayError'
    })
    await expect(
      gateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_RESUME_READ_SIGNAL)
    ).resolves.toEqual(first)
  })

  it.each(['update', 'reorder', 'delete'] as const)(
    'aborts a delayed %s command before mutating authority',
    async (kind): Promise<void> => {
      /** @brief 为当前 operation 独享状态的延迟网关 / Delayed gateway owning state for this operation. */
      const gateway = new InMemoryResumeGateway({ delayMs: 5 })
      /** @brief operation 前的权威 / Authority before the operation. */
      const initial = await gateway.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
      /** @brief 目标 section / Target section. */
      const section = initial.resume.sections[0]
      if (section === undefined) throw new Error('Expected a Resume section fixture.')
      /** @brief 暴露延迟窗口的取消控制器 / Cancellation controller exposing the delay window. */
      const controller = new AbortController()
      /** @brief 当前参数选择的待定 mutation / Pending mutation selected by the current parameter. */
      let mutation: Promise<UiResumeEditorModel>
      if (kind === 'update') {
        mutation = gateway.updateResumeSection({
          baseRevision: initial.resume.revision,
          commandId: createUiCommandId(),
          concurrencyToken: initial.concurrencyToken,
          resumeId: initial.resume.id,
          sectionId: section.id,
          signal: controller.signal,
          title: '不应提交的标题',
          workspaceId: initial.resume.workspaceId
        })
      } else if (kind === 'reorder') {
        mutation = gateway.reorderResumeSections({
          baseRevision: initial.resume.revision,
          commandId: createUiCommandId(),
          concurrencyToken: initial.concurrencyToken,
          orderedSectionIds: initial.resume.sections.map((item) => item.id).reverse(),
          resumeId: initial.resume.id,
          signal: controller.signal,
          workspaceId: initial.resume.workspaceId
        })
      } else {
        mutation = gateway.deleteResumeSection({
          baseRevision: initial.resume.revision,
          commandId: createUiCommandId(),
          concurrencyToken: initial.concurrencyToken,
          resumeId: initial.resume.id,
          sectionId: section.id,
          signal: controller.signal,
          workspaceId: initial.resume.workspaceId
        })
      }

      controller.abort(new DOMException('Resume route changed.', 'AbortError'))

      await expect(mutation).rejects.toMatchObject({ name: 'AbortError' })
      await expect(
        gateway.getResumeEditor(MOCK_RESUME_WORKSPACE_ID, MOCK_RESUME_ID, ACTIVE_RESUME_READ_SIGNAL)
      ).resolves.toEqual(initial)
    }
  )

  it('reads an exact historical template version omitted from the latest catalog', async () => {
    /** @brief 独享 Resume 内存网关 / Dedicated Resume in-memory gateway. */
    const resumeGateway = new InMemoryResumeGateway()

    const latest = await resumeGateway.listTemplatePage({
      cursor: null,
      limit: asUiResumeTemplatePageLimit(200),
      signal: ACTIVE_RESUME_READ_SIGNAL
    })
    expect(latest.items).not.toContainEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
    await expect(
      resumeGateway.getTemplate(
        {
          templateId: MOCK_HISTORICAL_DAWN_TEMPLATE.id,
          templateVersion: MOCK_HISTORICAL_DAWN_TEMPLATE.version
        },
        ACTIVE_RESUME_READ_SIGNAL
      )
    ).resolves.toEqual(MOCK_HISTORICAL_DAWN_TEMPLATE)
  })

  it('does not use template-settings persistence as an implicit migration command', async () => {
    const resumeGateway = new InMemoryResumeGateway()
    const settings = await readTemplateSettings(resumeGateway)

    await expect(
      resumeGateway.updateTemplateSettings({
        baseRevision: settings.resumeRevision,
        concurrencyToken: settings.concurrencyToken,
        resumeId: settings.resumeId,
        styleIntent: settings.styleIntent,
        templateId: MOCK_EDITORIAL_TEMPLATE.id,
        templateVersion: MOCK_EDITORIAL_TEMPLATE.version,
        workspaceId: settings.workspaceId
      })
    ).rejects.toMatchObject({ name: 'ResumeTemplateMigrationCapabilityError' })
    await expect(
      resumeGateway.getResumeEditor(
        MOCK_RESUME_WORKSPACE_ID,
        MOCK_RESUME_ID,
        ACTIVE_RESUME_READ_SIGNAL
      )
    ).resolves.toMatchObject({
      resume: {
        revision: settings.resumeRevision,
        template: {
          templateId: settings.selectedTemplate.id,
          templateVersion: settings.selectedTemplate.version
        }
      }
    })
  })

  it('rejects a second mutation while the same Resume aggregate lane is occupied', async () => {
    /** @brief 带确定性延迟以观察写通道的测试网关 / Test gateway with deterministic latency exposing the mutation lane. */
    const resumeGateway = new InMemoryResumeGateway({ delayMs: 10 })
    const editor = await resumeGateway.getResumeEditor(
      MOCK_RESUME_WORKSPACE_ID,
      MOCK_RESUME_ID,
      ACTIVE_RESUME_READ_SIGNAL
    )
    const firstSection = editor.resume.sections[0]
    if (firstSection === undefined) throw new Error('Expected a Resume section fixture.')

    /** @brief 占用唯一通道的首个写操作 / First mutation occupying the sole lane. */
    const firstMutation = resumeGateway.updateResumeSection({
      baseRevision: editor.resume.revision,
      commandId: createUiCommandId(),
      concurrencyToken: editor.concurrencyToken,
      content: { marks: [], text: '更新后的摘要' },
      resumeId: editor.resume.id,
      sectionId: firstSection.id,
      workspaceId: editor.resume.workspaceId
    })
    await expect(
      resumeGateway.deleteResumeSection({
        baseRevision: editor.resume.revision,
        commandId: createUiCommandId(),
        concurrencyToken: editor.concurrencyToken,
        resumeId: editor.resume.id,
        sectionId: firstSection.id,
        workspaceId: editor.resume.workspaceId
      })
    ).rejects.toMatchObject({ name: 'ResumeMutationInProgressError' })
    await expect(firstMutation).resolves.toMatchObject({ resume: { revision: 19 } })
  })
})
