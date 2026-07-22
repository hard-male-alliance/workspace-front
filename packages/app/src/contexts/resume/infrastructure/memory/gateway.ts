/** @file Resume 的内存 adapter / In-memory adapter for Resume. */

import type { ResumeGateway } from '../../application/gateway'
import type {
  ResumeCreationPort,
  ResumeTemplateCatalogPort
} from '../../application/resume-creation'
import {
  ResumeSnapshotConflictError,
  ResumeTemplateMigrationCapabilityError
} from '../../application/errors'
import { ResumeMutationLane } from '../../application/mutation-lane'
import {
  getTemplateIdentity,
  loadTemplateCatalogWithPinnedVersion
} from '../../application/template-catalog'
import type {
  UiResumeEditorModel,
  UiResumeId,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeSummaryPage,
  UiResumeSummaryPageRead,
  UiResumeTemplateSettingsUpdateInput,
  UiTemplateManifest,
  UiTemplateReference,
  UiTemplateSettingsModel,
  UiStartResumePdfRenderInput
} from '../../domain/models'
import { asUiResumeCursor } from '../../domain/models'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import {
  asUiResumeTemplateCursor,
  type UiCreateResumeFromTemplateCommand,
  type UiCreatedResume,
  type UiResumeTemplatePage,
  type UiResumeTemplatePageRead
} from '../../domain/creation'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import { asUiConcurrencyToken } from '../../../../shared-kernel/concurrency'
import {
  MOCK_RESUME_EDITOR,
  MOCK_RESUME_ID,
  MOCK_RESUME_SUMMARIES,
  MOCK_RESUME_WORKSPACE_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_TEMPLATE_MANIFEST_VERSIONS
} from './data'

/**
 * @brief Resume 自动化测试内存适配器 / In-memory adapter for automated Resume tests.
 * @note 仅从测试入口导出，不能代替 ResumeOperationBatch 或 Render Job 契约。 / Exported only from the testing entry point and cannot substitute for ResumeOperationBatch or Render Job contracts.
 */
export class InMemoryResumeGateway
  implements ResumeGateway, ResumeCreationPort, ResumeTemplateCatalogPort
{
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
  /** @brief 当前实例内的简历编辑器投影 / Resume-editor projection owned by this instance. */
  private editor: UiResumeEditorModel

  /** @brief 测试 adapter 中按聚合隔离的写通道 / Aggregate-scoped mutation lane in the test adapter. */
  private readonly mutationLane = new ResumeMutationLane()

  /** @brief 测试用 Render Jobs / Render Jobs used by automated tests. */
  private readonly renderJobs = new Map<string, UiResumeRenderJob>()

  /** @brief 按创建意图保存的幂等测试结果 / Idempotent test results stored by creation intent. */
  private readonly createdResumes = new Map<string, UiCreatedResume>()

  /** @brief 创建意图到规范输入的测试指纹 / Test fingerprints from creation intents to canonical inputs. */
  private readonly creationFingerprints = new Map<string, string>()

  /**
   * @brief 构造 Resume 内存测试网关 / Construct the Resume in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.options = options
    this.editor = cloneMemoryValue(MOCK_RESUME_EDITOR)
  }

  /**
   * @brief 读取一页 Mock ResumeSummary / Read one page of Mock Resume summaries.
   * @param input 显式 Workspace、cursor、limit 与取消信号 / Explicit Workspace, cursor, limit, and cancellation signal.
   * @return 符合 API v2 关系约束的 cursor 页 / Cursor page satisfying the API v2 relation constraint.
   */
  async listResumeSummariesPage(input: UiResumeSummaryPageRead): Promise<UiResumeSummaryPage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (mode === 'empty' || input.workspaceId !== MOCK_RESUME_WORKSPACE_ID) {
      return { hasMore: false, items: [], nextCursor: null }
    }

    /** @brief 当前 cursor 对应的起始位置 / Start offset represented by the current cursor. */
    const offset =
      input.cursor === null
        ? 0
        : MOCK_RESUME_SUMMARIES.findIndex(
            (_summary, index) => asUiResumeCursor(`resume_cursor_${index}`) === input.cursor
          )
    if (offset < 0) {
      throw new InMemoryGatewayError('memory.not_found', 'The Mock Resume cursor is not valid.')
    }

    /** @brief 当前页未共享引用的摘要 / Current-page summaries without shared references. */
    const items = cloneMemoryValue(MOCK_RESUME_SUMMARIES.slice(offset, offset + input.limit))
    /** @brief 下一页在固定排序中的起始位置 / Start offset of the next page in the fixed ordering. */
    const nextOffset = offset + items.length
    return nextOffset < MOCK_RESUME_SUMMARIES.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeCursor(`resume_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /**
   * @brief 读取一页 Mock 全局 Template / Read one page of the Mock global Template catalog.
   * @param input cursor、页大小与取消信号 / Cursor, page size, and cancellation signal.
   * @return 保留 cursor 关系的 Template 页 / Template page preserving the cursor relation.
   */
  async listTemplatePage(input: UiResumeTemplatePageRead): Promise<UiResumeTemplatePage> {
    input.signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    input.signal.throwIfAborted()
    if (mode === 'empty') return { hasMore: false, items: [], nextCursor: null }

    /** @brief 当前 Template cursor 对应的起始位置 / Start offset represented by the current Template cursor. */
    const offset =
      input.cursor === null
        ? 0
        : MOCK_TEMPLATE_MANIFESTS.findIndex(
            (_template, index) =>
              asUiResumeTemplateCursor(`template_cursor_${index}`) === input.cursor
          )
    if (offset < 0) {
      throw new InMemoryGatewayError('memory.not_found', 'The Mock Template cursor is not valid.')
    }

    /** @brief 当前页 Template / Templates in the current page. */
    const items = cloneMemoryValue(MOCK_TEMPLATE_MANIFESTS.slice(offset, offset + input.limit))
    /** @brief 下一页的起始位置 / Start offset of the next page. */
    const nextOffset = offset + items.length
    return nextOffset < MOCK_TEMPLATE_MANIFESTS.length
      ? {
          hasMore: true,
          items,
          nextCursor: asUiResumeTemplateCursor(`template_cursor_${nextOffset}`)
        }
      : { hasMore: false, items, nextCursor: null }
  }

  /**
   * @brief 读取精确 Mock Template 版本 / Read an exact Mock Template version.
   * @param reference 不可变 Template 引用 / Immutable Template reference.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 精确版本 Template / Exact-version Template.
   */
  async getTemplate(
    reference: UiTemplateReference,
    signal: AbortSignal
  ): Promise<UiTemplateManifest> {
    signal.throwIfAborted()
    const mode = await prepareMemoryRead(this.options)
    signal.throwIfAborted()
    if (mode === 'empty') return throwMemoryNotFound('resume template')
    /** @brief 由不可变身份命中的 Template / Template matched by immutable identity. */
    const template = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
      (candidate) =>
        candidate.id === reference.templateId && candidate.version === reference.templateVersion
    )
    return template === undefined
      ? throwMemoryNotFound('resume template')
      : cloneMemoryValue(template)
  }

  /**
   * @brief 以幂等测试语义创建 Mock Resume / Create a Mock Resume with idempotent test semantics.
   * @param command 已由应用用例验证的创建命令 / Creation command validated by the application use case.
   * @return 与强 ETag 配对的 Mock Resume / Mock Resume paired with a strong ETag.
   */
  async createResume(command: UiCreateResumeFromTemplateCommand): Promise<UiCreatedResume> {
    command.signal.throwIfAborted()
    await prepareMemoryRead(this.options)
    command.signal.throwIfAborted()
    /** @brief 在闭包外完成判别联合收窄的克隆来源 / Clone source narrowed outside callback boundaries. */
    const cloneResumeId = command.source.kind === 'clone' ? command.source.resumeId : null
    if (
      cloneResumeId !== null &&
      cloneResumeId !== MOCK_RESUME_ID &&
      ![...this.createdResumes.values()].some((created) => created.resource.id === cloneResumeId)
    ) {
      return throwMemoryNotFound('source resume')
    }

    /** @brief 不含运行时 signal 的规范创建指纹 / Canonical creation fingerprint without the runtime signal. */
    const fingerprint = JSON.stringify({
      locale: command.locale,
      source: command.source,
      template: command.template,
      title: command.title,
      workspaceId: command.workspaceId
    })
    /** @brief 相同幂等键的既有指纹 / Existing fingerprint for the same idempotency key. */
    const priorFingerprint = this.creationFingerprints.get(command.creationAttemptId)
    if (priorFingerprint !== undefined && priorFingerprint !== fingerprint) {
      throw new InMemoryGatewayError(
        'memory.conflict',
        'The Mock creation key was reused with a different command.'
      )
    }
    /** @brief 相同创建意图已经生成的结果 / Result already created for the same intent. */
    const priorResult = this.createdResumes.get(command.creationAttemptId)
    if (priorResult !== undefined) return cloneMemoryValue(priorResult)

    /** @brief 新建结果的单调测试序号 / Monotonic test sequence for the created result. */
    const sequence = this.createdResumes.size + 1
    /** @brief 首次创建并缓存的权威测试结果 / Authoritative test result created and cached once. */
    const result: UiCreatedResume = {
      concurrencyToken: asUiConcurrencyToken(`"resume-created-${sequence}"`),
      resource: {
        createdAt: '2026-07-23T00:00:00.000Z',
        id: asUiOpaqueId<'resume'>(`res_created_${sequence}`),
        locale: command.locale,
        revision: 1,
        template: command.template,
        title: command.title,
        updatedAt: '2026-07-23T00:00:00.000Z',
        workspaceId: command.workspaceId
      }
    }
    this.creationFingerprints.set(command.creationAttemptId, fingerprint)
    this.createdResumes.set(command.creationAttemptId, cloneMemoryValue(result))
    return cloneMemoryValue(result)
  }

  /**
   * @brief 获取 Mock 三栏简历编辑器 / Get the Mock three-pane resume editor.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 编辑器数据 / Mock editor data.
   */
  async getResumeEditor(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId
  ): Promise<UiResumeEditorModel> {
    const mode = await prepareMemoryRead(this.options)
    if (
      mode === 'empty' ||
      resumeId !== MOCK_RESUME_ID ||
      workspaceId !== MOCK_RESUME_WORKSPACE_ID
    ) {
      return throwMemoryNotFound('resume editor')
    }

    return cloneMemoryValue(this.editor)
  }

  async startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob> {
    await prepareMemoryRead(this.options)
    input.signal?.throwIfAborted()
    if (input.resumeId !== MOCK_RESUME_ID) return throwMemoryNotFound('resume editor')
    const job: UiResumeRenderJob = {
      artifacts: [],
      id: asUiOpaqueId<'resume-render-job'>(`render_mock_${input.resumeRevision}`),
      progressPercent: 0,
      resumeId: input.resumeId,
      resumeRevision: input.resumeRevision,
      status: 'queued'
    }
    this.renderJobs.set(job.id, job)
    return cloneMemoryValue(job)
  }

  async getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob> {
    await prepareMemoryRead(this.options)
    signal?.throwIfAborted()
    const job = this.renderJobs.get(jobId)
    if (job === undefined) return throwMemoryNotFound('resume render job')
    const artifact: UiResumePdfArtifact = {
      contentUrl: 'about:blank#mock-resume-pdf',
      createdAt: '2026-07-18T00:00:05.000Z',
      id: asUiOpaqueId<'resume-pdf-artifact'>(`artifact_mock_${job.resumeRevision}`),
      pageCount: 1,
      resumeId: job.resumeId,
      resumeRevision: job.resumeRevision
    }
    const completed: UiResumeRenderJob = {
      ...job,
      artifacts: [artifact],
      progressPercent: 100,
      status: 'succeeded'
    }
    this.renderJobs.set(jobId, completed)
    return cloneMemoryValue(completed)
  }

  /**
   * @brief 更新测试简历板块 / Update a test resume section.
   * @param input 板块编辑领域输入 / Section-edit domain input.
   * @return 最新编辑器 / Latest editor.
   */
  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    return this.mutationLane.run(input.resumeId, async () => {
      await prepareMemoryRead(this.options)
      if (input.resumeId !== MOCK_RESUME_ID) {
        return throwMemoryNotFound('resume editor')
      }
      this.assertBaseRevision(input.baseRevision)

      const sectionExists = this.editor.resume.sections.some(
        (section) => section.id === input.sectionId
      )
      if (!sectionExists) {
        return throwMemoryNotFound('resume section')
      }

      this.editor = {
        ...this.editor,
        resume: {
          ...this.editor.resume,
          revision: this.editor.resume.revision + 1,
          sections: this.editor.resume.sections.map((section) =>
            section.id === input.sectionId
              ? {
                  ...section,
                  ...(input.title === undefined ? {} : { title: input.title }),
                  ...(input.content === undefined ? {} : { contentPreview: input.content })
                }
              : section
          ),
          updatedAt: '2026-07-18T00:00:01.000Z'
        }
      }
      return cloneMemoryValue(this.editor)
    })
  }

  /** @brief 调整 Mock 简历板块顺序 / Reorder Mock resume sections. */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    return this.mutationLane.run(input.resumeId, async () => {
      await prepareMemoryRead(this.options)
      if (input.resumeId !== MOCK_RESUME_ID) {
        return throwMemoryNotFound('resume editor')
      }
      this.assertBaseRevision(input.baseRevision)

      const sectionById = new Map(
        this.editor.resume.sections.map((section) => [section.id, section])
      )
      const reorderedSections = input.orderedSectionIds.map((sectionId) =>
        sectionById.get(sectionId)
      )
      if (
        reorderedSections.length !== this.editor.resume.sections.length ||
        new Set(input.orderedSectionIds).size !== this.editor.resume.sections.length ||
        reorderedSections.some((section) => section === undefined)
      ) {
        throw new InMemoryGatewayError('memory.conflict', 'The Mock section order is incomplete.')
      }

      this.editor = {
        ...this.editor,
        resume: {
          ...this.editor.resume,
          revision: this.editor.resume.revision + 1,
          sections: reorderedSections.filter((section) => section !== undefined),
          updatedAt: '2026-07-18T00:00:02.000Z'
        }
      }
      return cloneMemoryValue(this.editor)
    })
  }

  /** @brief 删除 Mock 简历板块 / Delete a Mock resume section. */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    return this.mutationLane.run(input.resumeId, async () => {
      await prepareMemoryRead(this.options)
      if (input.resumeId !== MOCK_RESUME_ID) {
        return throwMemoryNotFound('resume editor')
      }
      this.assertBaseRevision(input.baseRevision)

      const remainingSections = this.editor.resume.sections.filter(
        (section) => section.id !== input.sectionId
      )
      if (remainingSections.length === this.editor.resume.sections.length) {
        return throwMemoryNotFound('resume section')
      }
      if (remainingSections.length === 0) {
        throw new InMemoryGatewayError(
          'memory.conflict',
          'A Mock resume must keep at least one section.'
        )
      }

      this.editor = {
        ...this.editor,
        resume: {
          ...this.editor.resume,
          revision: this.editor.resume.revision + 1,
          sections: remainingSections,
          updatedAt: '2026-07-18T00:00:03.000Z'
        }
      }
      return cloneMemoryValue(this.editor)
    })
  }

  /** @brief 在测试 adapter 中保存模板设置 / Save template settings in the testing adapter. */
  async updateTemplateSettings(
    input: UiResumeTemplateSettingsUpdateInput
  ): Promise<UiTemplateSettingsModel> {
    return this.mutationLane.run(input.resumeId, async () => {
      await prepareMemoryRead(this.options)
      if (input.resumeId !== MOCK_RESUME_ID) {
        return throwMemoryNotFound('template settings')
      }
      this.assertBaseRevision(input.baseRevision)
      if (
        this.editor.resume.template.templateId !== input.templateId ||
        this.editor.resume.template.templateVersion !== input.templateVersion
      ) {
        throw new ResumeTemplateMigrationCapabilityError()
      }
      const template = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
        (item) => item.id === input.templateId && item.version === input.templateVersion
      )
      if (template === undefined) {
        return throwMemoryNotFound('resume template')
      }
      this.editor = {
        ...this.editor,
        resume: {
          ...this.editor.resume,
          revision: this.editor.resume.revision + 1,
          styleIntent: input.styleIntent,
          updatedAt: '2026-07-18T00:00:05.000Z'
        }
      }
      /** @brief 最新目录与当前精确版本的合并结果 / Latest catalog merged with the exact current version. */
      const availableTemplates = MOCK_TEMPLATE_MANIFESTS.some(
        (item) => getTemplateIdentity(item) === getTemplateIdentity(template)
      )
        ? MOCK_TEMPLATE_MANIFESTS
        : [...MOCK_TEMPLATE_MANIFESTS, template]
      return {
        availableTemplates: cloneMemoryValue(availableTemplates),
        resumeId: input.resumeId,
        resumeRevision: this.editor.resume.revision,
        selectedTemplate: cloneMemoryValue(template),
        styleIntent: cloneMemoryValue(input.styleIntent),
        workspaceId: this.editor.resume.workspaceId
      }
    })
  }

  /**
   * @brief 列出支持指定语言的 Mock 模板 / List Mock templates supporting a locale.
   * @param locale 资源内容语言 / Resource-content locale.
   * @return Mock 模板清单 / Mock template manifests.
   */
  async listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty') {
      return []
    }

    const manifests = MOCK_TEMPLATE_MANIFESTS.filter((template) =>
      template.supportedLocales.includes(locale)
    )
    return cloneMemoryValue(manifests)
  }

  /**
   * @brief 获取精确 Mock 模板版本 / Get an exact Mock template version.
   * @param templateId 模板 ID / Template ID.
   * @param version 不可变模板版本 / Immutable template version.
   * @return 精确匹配的 Mock 模板 / Exact matching Mock template.
   */
  async getTemplateManifest(
    templateId: UiTemplateManifest['id'],
    version: string
  ): Promise<UiTemplateManifest> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty') {
      return throwMemoryNotFound('resume template')
    }
    /** @brief 由复合身份命中的 Mock 模板 / Mock template matched by composite identity. */
    const template = MOCK_TEMPLATE_MANIFEST_VERSIONS.find(
      (item) => item.id === templateId && item.version === version
    )
    if (template === undefined) {
      return throwMemoryNotFound('resume template')
    }
    return cloneMemoryValue(template)
  }

  /**
   * @brief 获取 Mock 模板设置页数据 / Get Mock template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 模板设置数据 / Mock template-settings data.
   */
  async getTemplateSettings(
    workspaceId: UiWorkspaceId,
    resumeId: UiResumeId
  ): Promise<UiTemplateSettingsModel> {
    const mode = await prepareMemoryRead(this.options)
    if (
      mode === 'empty' ||
      resumeId !== MOCK_RESUME_ID ||
      workspaceId !== MOCK_RESUME_WORKSPACE_ID
    ) {
      return throwMemoryNotFound('template settings')
    }

    const templates = await loadTemplateCatalogWithPinnedVersion(
      this,
      this.editor.resume.locale,
      this.editor.resume.template
    )
    const selectedIdentity = getTemplateIdentity(this.editor.resume.template)
    const selectedTemplate = templates.find(
      (template) => getTemplateIdentity(template) === selectedIdentity
    )
    if (selectedTemplate === undefined) {
      return throwMemoryNotFound('resume template')
    }
    return {
      availableTemplates: cloneMemoryValue(templates),
      resumeId,
      resumeRevision: this.editor.resume.revision,
      selectedTemplate: cloneMemoryValue(selectedTemplate),
      styleIntent: cloneMemoryValue(this.editor.resume.styleIntent),
      workspaceId: this.editor.resume.workspaceId
    }
  }

  /**
   * @brief 保证测试 mutation 仍绑定调用方读取的 Resume revision / Ensure a test mutation remains bound to the Resume revision read by its caller.
   * @param baseRevision 调用方编辑的基础 revision / Base revision edited by the caller.
   */
  private assertBaseRevision(baseRevision: number): void {
    if (baseRevision !== this.editor.resume.revision) throw new ResumeSnapshotConflictError()
  }
}
