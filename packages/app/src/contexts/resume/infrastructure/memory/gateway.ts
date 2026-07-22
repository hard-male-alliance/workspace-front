/** @file Resume 的内存 adapter / In-memory adapter for Resume. */

import type { ResumeGateway } from '../../application/gateway'
import type {
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiResumeTemplateSettingsUpdateInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiStartResumePdfRenderInput
} from '../../domain/models'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import {
  cloneMemoryValue,
  InMemoryGatewayError,
  prepareMemoryRead,
  throwMemoryNotFound,
  type InMemoryGatewayOptions
} from '../../../../infrastructure/memory'
import {
  MOCK_RESUME_CARDS,
  MOCK_RESUME_EDITOR,
  MOCK_RESUME_ID,
  MOCK_RESUME_WORKSPACE_ID,
  MOCK_TEMPLATE_MANIFESTS,
  MOCK_TEMPLATE_SETTINGS
} from './data'

/**
 * @brief Resume 自动化测试内存适配器 / In-memory adapter for automated Resume tests.
 * @note 仅从测试入口导出，不能代替 ResumeOperationBatch 或 Render Job 契约。 / Exported only from the testing entry point and cannot substitute for ResumeOperationBatch or Render Job contracts.
 */
export class InMemoryResumeGateway implements ResumeGateway {
  /** @brief 当前 adapter 的确定性行为选项 / Deterministic behavior options for this adapter. */
  private readonly options: InMemoryGatewayOptions
  /** @brief 当前实例内的简历编辑器投影 / Resume-editor projection owned by this instance. */
  private editor: UiResumeEditorModel

  /** @brief 测试用 Render Jobs / Render Jobs used by automated tests. */
  private readonly renderJobs = new Map<string, UiResumeRenderJob>()

  /**
   * @brief 构造 Resume 内存测试网关 / Construct the Resume in-memory test gateway.
   * @param options 确定性测试行为选项 / Deterministic test behavior options.
   */
  constructor(options: InMemoryGatewayOptions = {}) {
    this.options = options
    this.editor = cloneMemoryValue(MOCK_RESUME_EDITOR)
  }

  /**
   * @brief 列出 Mock 简历卡片 / List Mock resume cards.
   * @param workspaceId 工作区 ID / Workspace ID.
   * @return Mock 简历卡片 / Mock resume cards.
   */
  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || workspaceId !== MOCK_RESUME_WORKSPACE_ID) {
      return []
    }

    return cloneMemoryValue(MOCK_RESUME_CARDS)
  }

  /**
   * @brief 获取 Mock 三栏简历编辑器 / Get the Mock three-pane resume editor.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 编辑器数据 / Mock editor data.
   */
  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
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
      diagnostic: null,
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
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

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
            ? { ...section, title: input.title, contentPreview: input.content }
            : section
        ),
        updatedAt: '2026-07-18T00:00:01.000Z'
      }
    }
    return cloneMemoryValue(this.editor)
  }

  /** @brief 调整 Mock 简历板块顺序 / Reorder Mock resume sections. */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const sectionById = new Map(this.editor.resume.sections.map((section) => [section.id, section]))
    const reorderedSections = input.orderedSectionIds.map((sectionId) => sectionById.get(sectionId))
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
  }

  /** @brief 删除 Mock 简历板块 / Delete a Mock resume section. */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

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
  }

  /** @brief 切换 Mock 简历模板 / Select a Mock resume template. */
  async selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('resume editor')
    }

    const template = MOCK_TEMPLATE_MANIFESTS.find((item) => item.id === input.templateId)
    if (template === undefined) {
      return throwMemoryNotFound('resume template')
    }

    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        template: { templateId: template.id, templateVersion: template.version },
        updatedAt: '2026-07-18T00:00:04.000Z'
      }
    }
    return cloneMemoryValue(this.editor)
  }

  /** @brief 在测试 adapter 中保存模板设置 / Save template settings in the testing adapter. */
  async updateTemplateSettings(
    input: UiResumeTemplateSettingsUpdateInput
  ): Promise<UiTemplateSettingsModel> {
    await prepareMemoryRead(this.options)
    if (input.resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('template settings')
    }
    const template = MOCK_TEMPLATE_MANIFESTS.find((item) => item.id === input.templateId)
    if (template === undefined) {
      return throwMemoryNotFound('resume template')
    }
    this.editor = {
      ...this.editor,
      resume: {
        ...this.editor.resume,
        revision: this.editor.resume.revision + 1,
        styleIntent: input.styleIntent,
        template: { templateId: template.id, templateVersion: template.version },
        updatedAt: '2026-07-18T00:00:05.000Z'
      }
    }
    return {
      availableTemplates: cloneMemoryValue(MOCK_TEMPLATE_MANIFESTS),
      resumeId: input.resumeId,
      selectedTemplate: cloneMemoryValue(template),
      styleIntent: cloneMemoryValue(input.styleIntent)
    }
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
   * @brief 获取 Mock 模板设置页数据 / Get Mock template-settings page data.
   * @param resumeId 简历 ID / Resume ID.
   * @return Mock 模板设置数据 / Mock template-settings data.
   */
  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const mode = await prepareMemoryRead(this.options)
    if (mode === 'empty' || resumeId !== MOCK_RESUME_ID) {
      return throwMemoryNotFound('template settings')
    }

    const selectedTemplate = MOCK_TEMPLATE_MANIFESTS.find(
      (template) => template.id === this.editor.resume.template.templateId
    )
    if (selectedTemplate === undefined) {
      return throwMemoryNotFound('resume template')
    }
    return {
      availableTemplates: cloneMemoryValue(MOCK_TEMPLATE_SETTINGS.availableTemplates),
      resumeId,
      selectedTemplate: cloneMemoryValue(selectedTemplate),
      styleIntent: cloneMemoryValue(this.editor.resume.styleIntent)
    }
  }
}
