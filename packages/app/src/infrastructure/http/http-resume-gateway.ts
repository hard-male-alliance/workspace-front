/** @file Resume HTTP Gateway / Resume HTTP gateway. */

import type { ResumeGateway } from '../../domain'
import type {
  UiContentLocale,
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiWorkspaceId
} from '../../domain'
import { asUiOpaqueId } from '../../domain'
import type { ApiClient, ApiResponse } from './api-client'
import type { CursorPageResponseDto, ResumeDocumentDto, TemplateManifestDto } from './dto'
import { mapResumeDocument, mapTemplateManifest } from './mappers'

/** @brief 已读取简历的并发元数据 / Concurrency metadata for a loaded Resume. */
interface ResumeState {
  readonly dto: ResumeDocumentDto
  readonly etag: string
}

/** @brief Resume 领域操作 / Resume domain operation. */
type ResumeOperation = Readonly<Record<string, unknown>>

/** @brief 生成一次性客户端标识 / Generate a one-use client identifier. */
const createClientId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

/** @brief 构造纯文本 RichText / Build a plain-text RichText value. */
function plainRichText(text: string): Readonly<Record<string, unknown>> | null {
  if (text.trim() === '') {
    return null
  }
  return {
    schema_version: '1.0',
    blocks: [
      {
        block_id: createClientId('block'),
        type: 'paragraph',
        spans: [{ text }]
      }
    ],
    plain_text: text
  }
}

/** @brief 通过正式 REST API 访问 Resume 与模板 / Access Resumes and templates via the formal REST API. */
export class HttpResumeGateway implements ResumeGateway {
  /** @brief 共享 API 客户端 / Shared API client. */
  private readonly api: ApiClient
  /** @brief Resume ID 到最近 ETag/DTO 的映射 / Latest ETag/DTO by Resume ID. */
  private readonly states = new Map<string, ResumeState>()
  /** @brief 最近读取的模板目录 / Most recently loaded template catalog. */
  private templates: readonly UiTemplateManifest[] = []

  /**
   * @brief 构造 Resume HTTP Gateway / Construct a Resume HTTP gateway.
   * @param api 共享 API 客户端 / Shared API client.
   */
  constructor(api: ApiClient) {
    this.api = api
  }

  /** @inheritdoc */
  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    void workspaceId
    const documents = await this.readAllPages<ResumeDocumentDto>('/resumes')
    if (this.templates.length === 0) {
      await this.listTemplateManifests('zh-CN')
    }
    return documents.map((document) => ({
      id: asUiOpaqueId<'resume'>(document.id),
      title: document.title,
      templateName:
        this.templates.find(
          (template) =>
            template.id === document.template.template_id &&
            template.version === document.template.template_version
        )?.name ?? document.template.template_id,
      revision: document.revision,
      updatedAt: document.updated_at
    }))
  }

  /** @inheritdoc */
  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const response = await this.api.request<ResumeDocumentDto>(
      `/resumes/${encodeURIComponent(resumeId)}`
    )
    const etag = response.headers.get('ETag')
    if (etag === null) {
      throw new Error('Resume response is missing the required ETag header.')
    }
    this.states.set(resumeId, { dto: response.data, etag })
    return this.toEditor(response.data)
  }

  /** @inheritdoc */
  async sendAssistantMessage(
    input: UiResumeAssistantMessageInput
  ): Promise<UiResumeAssistantTurnResult> {
    const message = input.message.trim()
    if (message === '') {
      throw new Error('Resume assistant message cannot be empty.')
    }
    const response = await this.api.request<Readonly<Record<string, unknown>>>(
      `/resumes/${encodeURIComponent(input.resumeId)}/proposals`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': createClientId('proposal') },
        body: { instruction: message, source_ids: [], render_hint: 'preview' },
        signal: input.signal
      }
    )
    const editor = await this.getResumeEditor(input.resumeId)
    return {
      editor,
      assistantMessage: {
        id: typeof response.data.id === 'string' ? response.data.id : createClientId('message'),
        role: 'assistant',
        text: '修改建议已创建；确认前不会改动简历。',
        createdAt:
          typeof response.data.created_at === 'string'
            ? response.data.created_at
            : new Date().toISOString(),
        isStreaming: false
      },
      changeId: null,
      canUndo: false
    }
  }

  /** @inheritdoc */
  undoAssistantChange(input: UiResumeAssistantUndoInput): Promise<UiResumeAssistantUndoResult> {
    void input
    return Promise.reject(
      new Error('Accepted Resume changes do not support undo; use an explicit revision restore.')
    )
  }

  /** @inheritdoc */
  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    const state = await this.requireState(input.resumeId)
    const section = state.dto.sections.find((item) => item.section_id === input.sectionId)
    if (section === undefined) {
      throw new Error('Resume section was not found.')
    }
    return this.applyOperations(
      input.resumeId,
      [
        {
          operation_id: createClientId('operation'),
          op: 'upsert_section',
          section: { ...section, title: input.title, content: plainRichText(input.content) }
        }
      ],
      input.signal
    )
  }

  /** @inheritdoc */
  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    const operations = input.orderedSectionIds.map((sectionId, index) => ({
      operation_id: createClientId('operation'),
      op: 'move_section',
      section_id: sectionId,
      after_section_id: index === 0 ? null : input.orderedSectionIds[index - 1]
    }))
    return this.applyOperations(input.resumeId, operations, input.signal)
  }

  /** @inheritdoc */
  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    return this.applyOperations(
      input.resumeId,
      [
        {
          operation_id: createClientId('operation'),
          op: 'remove_section',
          section_id: input.sectionId
        }
      ],
      input.signal
    )
  }

  /** @inheritdoc */
  async selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel> {
    if (this.templates.length === 0) {
      await this.listTemplateManifests('zh-CN')
    }
    const template = this.templates.find((candidate) => candidate.id === input.templateId)
    if (template === undefined) {
      throw new Error('Resume template was not found.')
    }
    return this.applyOperations(
      input.resumeId,
      [
        {
          operation_id: createClientId('operation'),
          op: 'set_template',
          template: { template_id: template.id, template_version: template.version }
        }
      ],
      input.signal
    )
  }

  /** @inheritdoc */
  async listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]> {
    const dtos = await this.readAllPages<TemplateManifestDto>('/resume-templates', { locale })
    this.templates = dtos.map(mapTemplateManifest)
    return this.templates
  }

  /** @inheritdoc */
  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const editor = await this.getResumeEditor(resumeId)
    const templates = await this.listTemplateManifests(editor.resume.locale)
    const selected = templates.find(
      (template) =>
        template.id === editor.resume.template.templateId &&
        template.version === editor.resume.template.templateVersion
    )
    if (selected === undefined) {
      throw new Error('The Resume references a template absent from the template catalog.')
    }
    return {
      resumeId,
      selectedTemplate: selected,
      availableTemplates: templates,
      styleIntent: editor.resume.styleIntent
    }
  }

  /** @brief 确保已读取 Resume 与 ETag / Ensure a Resume and ETag have been loaded. */
  private async requireState(resumeId: UiResumeId): Promise<ResumeState> {
    const state = this.states.get(resumeId)
    if (state !== undefined) {
      return state
    }
    await this.getResumeEditor(resumeId)
    return this.states.get(resumeId)!
  }

  /** @brief 提交一个原子 Resume 操作批次 / Submit one atomic Resume operation batch. */
  private async applyOperations(
    resumeId: UiResumeId,
    operations: readonly ResumeOperation[],
    signal?: AbortSignal
  ): Promise<UiResumeEditorModel> {
    const state = await this.requireState(resumeId)
    const batchId = createClientId('batch')
    await this.api.request(`/resumes/${encodeURIComponent(resumeId)}/operations`, {
      method: 'POST',
      headers: { 'Idempotency-Key': batchId, 'If-Match': state.etag },
      body: {
        client_batch_id: batchId,
        base_revision: state.dto.revision,
        conflict_strategy: 'reject',
        operations,
        render_hint: 'preview'
      },
      signal
    })
    return this.getResumeEditor(resumeId)
  }

  /** @brief 读取完整游标集合 / Read a complete cursor-paginated collection. */
  private async readAllPages<TItem>(
    path: `/${string}`,
    query: Readonly<Record<string, string>> = {}
  ): Promise<readonly TItem[]> {
    const items: TItem[] = []
    let cursor: string | null = null
    do {
      const response: ApiResponse<CursorPageResponseDto<TItem>> = await this.api.request(path, {
        query: { ...query, limit: 100, cursor }
      })
      items.push(...response.data.items)
      cursor = response.data.page.has_more ? response.data.page.next_cursor : null
    } while (cursor !== null)
    return items
  }

  /** @brief 构建编辑器投影 / Build an editor projection. */
  private toEditor(dto: ResumeDocumentDto): UiResumeEditorModel {
    return {
      resume: mapResumeDocument(dto),
      preview: { state: 'ready', pageCount: 1, renderedAt: null, diagnostic: null },
      assistantMessages: []
    }
  }
}
