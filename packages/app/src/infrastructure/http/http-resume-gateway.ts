/** @file Resume 与模板只读 HTTP Gateway / Read-only HTTP Gateway for Resume and templates. */

import type {
  ResumeGateway,
  UiContentLocale,
  UiResumeAssistantMessageInput,
  UiResumeAssistantTurnResult,
  UiResumeAssistantUndoInput,
  UiResumeAssistantUndoResult,
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumeProposal,
  UiResumeProposalDecisionInput,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiStartResumePdfRenderInput,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiTemplateManifest,
  UiTemplateSettingsModel,
  UiWorkspaceId
} from '../../domain'
import type { HttpClient } from './http-client'
import { HttpContractError } from './http-client'
import { mapResumeDocumentDto, mapTemplateManifestDto } from './mappers'
import {
  parseResumeDocumentDto,
  parseResumeListDto,
  parseResumeOperationBatchResultDto,
  parseResumeProposalDto,
  parseResumeProposalListDto,
  parseRenderArtifactListDto,
  parseResumeRenderJobDto,
  parseTemplateManifestListDto
} from './validators'
import type {
  RenderArtifactDto,
  ResumeDocumentDto,
  ResumeProposalDto,
  ResumeRenderJobDto
} from './transport-types'
import { asUiOpaqueId } from '../../domain'

/** @brief 第一阶段尚未接入的写能力错误 / Write capability not connected in phase one. */
export class HttpReadOnlyCapabilityError extends Error {
  override readonly name = 'HttpReadOnlyCapabilityError'

  constructor() {
    super('This Resume action is not connected to the backend in the current integration stage.')
  }
}

/** @brief Resume 与模板 HTTP Gateway / Resume and template HTTP Gateway. */
export class HttpResumeGateway implements ResumeGateway {
  readonly #client: HttpClient
  readonly #etagByResumeId = new Map<string, string>()
  readonly #resumeById = new Map<string, ResumeDocumentDto>()

  constructor(client: HttpClient) {
    this.#client = client
  }

  async listTemplateManifests(locale: UiContentLocale): Promise<readonly UiTemplateManifest[]> {
    const results: UiTemplateManifest[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    do {
      const response = await this.#client.getJson('/resume-templates', {
        query: { cursor, limit: 20, locale }
      })
      const page = parseTemplateManifestListDto(response.data)
      results.push(...page.items.map(mapTemplateManifestDto))
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new Error('Backend repeated a template pagination cursor.')
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)

    return results
  }

  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    void workspaceId
    const documents = await this.#listResumeDocuments()
    const locales = [...new Set(documents.map((document) => document.locale))]
    const manifests = (
      await Promise.all(locales.map((locale) => this.listTemplateManifests(locale)))
    ).flat()
    const names = new Map<string, string>(
      manifests.map((manifest) => [`${manifest.id}@${manifest.version}`, manifest.name] as const)
    )

    return documents.map((dto) => ({
      id: mapResumeDocumentDto(dto).id,
      revision: dto.revision,
      templateName:
        names.get(`${dto.template.template_id}@${dto.template.template_version}`) ??
        dto.template.template_id,
      title: dto.title,
      updatedAt: dto.updated_at
    }))
  }

  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const response = await this.#client.getJson(`/resumes/${encodeURIComponent(resumeId)}`)
    const dto = parseResumeDocumentDto(response.data)
    this.#resumeById.set(dto.id, dto)
    const etag = response.headers.get('ETag')
    if (etag !== null) this.#etagByResumeId.set(dto.id, etag)
    return {
      assistantMessages: [],
      preview: { diagnostic: null, pageCount: 0, renderedAt: null, state: 'ready' },
      resume: mapResumeDocumentDto(dto)
    }
  }

  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const editor = await this.getResumeEditor(resumeId)
    const templates = await this.listTemplateManifests(editor.resume.locale)
    const selected = templates.find(
      (template) =>
        template.id === editor.resume.template.templateId &&
        template.version === editor.resume.template.templateVersion
    )
    if (selected === undefined) {
      throw new Error('The Resume template is not available in the backend template catalog.')
    }
    return {
      availableTemplates: templates,
      resumeId,
      selectedTemplate: selected,
      styleIntent: editor.resume.styleIntent
    }
  }

  async listResumeProposals(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<readonly UiResumeProposal[]> {
    const results: UiResumeProposal[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    do {
      const response = await this.#client.getJson(
        `/resumes/${encodeURIComponent(resumeId)}/proposals`,
        {
          query: { cursor, limit: 20, status: 'pending' },
          ...(signal === undefined ? {} : { signal })
        }
      )
      const page = parseResumeProposalListDto(response.data)
      results.push(...page.items.map((proposal) => this.#mapProposal(proposal)))
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new Error('Backend repeated a Proposal pagination cursor.')
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)
    return results
  }

  async createResumeProposal(input: UiResumeAssistantMessageInput): Promise<UiResumeProposal> {
    const instruction = input.message.trim()
    if (instruction.length === 0) throw new Error('Resume Proposal instructions cannot be empty.')
    const idempotencyKey = this.#id('proposal')
    const response = await this.#client.postJson(
      `/resumes/${encodeURIComponent(input.resumeId)}/proposals`,
      {
        draft_text: null,
        field_path: ['summary'],
        instruction,
        render_hint: 'preview',
        source_ids: [],
        target: { entity_type: 'profile' },
        title: null
      },
      { idempotencyKey, ...(input.signal === undefined ? {} : { signal: input.signal }) }
    )
    return this.#mapProposal(parseResumeProposalDto(response.data))
  }

  async decideResumeProposal(input: UiResumeProposalDecisionInput): Promise<UiResumeProposal> {
    const idempotencyKey = this.#id('proposal-decision')
    const response = await this.#client.postJson(
      `/resume-proposals/${encodeURIComponent(input.proposalId)}/decisions`,
      {
        comment: null,
        conflict_strategy: 'reject',
        decision: input.decision === 'accept' ? 'accept_all' : 'reject',
        operation_ids: []
      },
      { idempotencyKey, ...(input.signal === undefined ? {} : { signal: input.signal }) }
    )
    return this.#mapProposal(parseResumeProposalDto(response.data))
  }

  async startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob> {
    const idempotencyKey = this.#id('render')
    const response = await this.#client.postJson(
      `/resumes/${encodeURIComponent(input.resumeId)}/render-jobs`,
      {
        formats: ['pdf'],
        include_accessibility_tree: false,
        include_source_map: true,
        locale: null,
        mode: 'preview',
        page_range: null,
        resume_revision: input.resumeRevision
      },
      { idempotencyKey, ...(input.signal === undefined ? {} : { signal: input.signal }) }
    )
    return this.#mapRenderJob(parseResumeRenderJobDto(response.data))
  }

  async getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob> {
    const response = await this.#client.getJson(
      `/resume-render-jobs/${encodeURIComponent(jobId)}`,
      signal === undefined ? {} : { signal }
    )
    return this.#mapRenderJob(parseResumeRenderJobDto(response.data))
  }

  async listResumePdfArtifacts(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<readonly UiResumePdfArtifact[]> {
    const results: UiResumePdfArtifact[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    do {
      const response = await this.#client.getJson(
        `/resumes/${encodeURIComponent(resumeId)}/render-artifacts`,
        { query: { cursor, limit: 20 }, ...(signal === undefined ? {} : { signal }) }
      )
      const page = parseRenderArtifactListDto(response.data)
      results.push(
        ...page.items
          .filter((artifact) => artifact.format === 'pdf')
          .map((artifact) => this.#mapArtifact(artifact))
      )
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new Error('Backend repeated a Render artifact pagination cursor.')
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)
    return results
  }

  sendAssistantMessage(input: UiResumeAssistantMessageInput): Promise<UiResumeAssistantTurnResult> {
    void input
    return Promise.reject(new HttpReadOnlyCapabilityError())
  }

  undoAssistantChange(input: UiResumeAssistantUndoInput): Promise<UiResumeAssistantUndoResult> {
    void input
    return Promise.reject(new HttpReadOnlyCapabilityError())
  }

  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    const target = { entity_type: 'section', section_id: input.sectionId }
    return this.#applyOperations(
      input.resumeId,
      [
        {
          field_path: ['title'],
          op: 'set_field',
          operation_id: this.#id('op'),
          target,
          value: input.title
        },
        {
          field_path: ['content'],
          op: 'set_field',
          operation_id: this.#id('op'),
          target,
          value: {
            blocks:
              input.content.length === 0
                ? []
                : [
                    {
                      block_id: this.#id('block'),
                      spans: [{ text: input.content }],
                      type: 'paragraph'
                    }
                  ],
            plain_text: input.content,
            schema_version: '1.0'
          }
        }
      ],
      input.signal
    )
  }

  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    const snapshot = await this.#ensureWritableSnapshot(input.resumeId, input.signal)
    const expected = new Set(snapshot.sections.map((section) => section.section_id))
    const received = new Set<string>(input.orderedSectionIds)
    if (
      expected.size !== received.size ||
      input.orderedSectionIds.length !== expected.size ||
      [...expected].some((sectionId) => !received.has(sectionId))
    ) {
      throw new Error('Resume section order must contain every current section exactly once.')
    }
    return this.#applyOperations(
      input.resumeId,
      input.orderedSectionIds.map((sectionId, index) => ({
        after_section_id: index === 0 ? null : input.orderedSectionIds[index - 1],
        op: 'move_section',
        operation_id: this.#id('op'),
        section_id: sectionId
      })),
      input.signal
    )
  }

  async deleteResumeSection(input: UiResumeSectionDeleteInput): Promise<UiResumeEditorModel> {
    return this.#applyOperations(
      input.resumeId,
      [
        {
          op: 'remove_section',
          operation_id: this.#id('op'),
          section_id: input.sectionId
        }
      ],
      input.signal
    )
  }

  async selectResumeTemplate(input: UiResumeTemplateSelectionInput): Promise<UiResumeEditorModel> {
    const snapshot = await this.#ensureWritableSnapshot(input.resumeId, input.signal)
    const templates = await this.listTemplateManifests(snapshot.locale)
    const template = templates.find((item) => item.id === input.templateId)
    if (template === undefined) {
      throw new Error('The selected Resume template is not available.')
    }
    return this.#applyOperations(
      input.resumeId,
      [
        {
          op: 'set_template',
          operation_id: this.#id('op'),
          template: {
            template_id: template.id,
            template_version: template.version
          }
        }
      ],
      input.signal
    )
  }

  async #applyOperations(
    resumeId: UiResumeId,
    operations: readonly Readonly<Record<string, unknown>>[],
    signal?: AbortSignal
  ): Promise<UiResumeEditorModel> {
    const snapshot = await this.#ensureWritableSnapshot(resumeId, signal)
    const etag = this.#etagByResumeId.get(resumeId)
    if (etag === undefined) {
      throw new HttpContractError('Resume writes require an ETag from the backend.', 200)
    }
    const clientBatchId = this.#id('batch')
    const response = await this.#client.postJson(
      `/resumes/${encodeURIComponent(resumeId)}/operations`,
      {
        base_revision: snapshot.revision,
        client_batch_id: clientBatchId,
        conflict_strategy: 'reject',
        operations,
        render_hint: 'preview'
      },
      {
        idempotencyKey: clientBatchId,
        ifMatch: etag,
        ...(signal === undefined ? {} : { signal })
      }
    )
    const result = parseResumeOperationBatchResultDto(response.data)
    if (result.resume_id !== resumeId || result.previous_revision !== snapshot.revision) {
      throw new HttpContractError(
        'Backend operation result does not match the requested Resume.',
        200
      )
    }
    this.#etagByResumeId.delete(resumeId)
    if (result.normalized_document === null) {
      return this.getResumeEditor(resumeId)
    }
    this.#resumeById.set(resumeId, result.normalized_document)
    return this.#toEditor(result.normalized_document)
  }

  async #ensureWritableSnapshot(
    resumeId: UiResumeId,
    signal?: AbortSignal
  ): Promise<ResumeDocumentDto> {
    if (!this.#resumeById.has(resumeId) || !this.#etagByResumeId.has(resumeId)) {
      const response = await this.#client.getJson(
        `/resumes/${encodeURIComponent(resumeId)}`,
        signal === undefined ? {} : { signal }
      )
      const dto = parseResumeDocumentDto(response.data)
      this.#resumeById.set(dto.id, dto)
      const etag = response.headers.get('ETag')
      if (etag !== null) this.#etagByResumeId.set(dto.id, etag)
    }
    const snapshot = this.#resumeById.get(resumeId)
    if (snapshot === undefined) {
      throw new HttpContractError('Resume snapshot is unavailable for this write.', 200)
    }
    return snapshot
  }

  #toEditor(dto: ResumeDocumentDto): UiResumeEditorModel {
    return {
      assistantMessages: [],
      preview: { diagnostic: null, pageCount: 0, renderedAt: null, state: 'ready' },
      resume: mapResumeDocumentDto(dto)
    }
  }

  #id(prefix: string): string {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }

  #mapProposal(dto: ResumeProposalDto): UiResumeProposal {
    return {
      baseRevision: dto.base_revision,
      changes: dto.operations.map((operation) => operation.op),
      createdAt: dto.created_at,
      id: asUiOpaqueId<'resume-proposal'>(dto.id),
      resumeId: asUiOpaqueId<'resume'>(dto.resume_id),
      status: dto.status,
      summary: dto.summary?.plain_text ?? null,
      title: dto.title
    }
  }

  #mapArtifact(dto: RenderArtifactDto): UiResumePdfArtifact {
    return {
      contentUrl: this.#client.resolveProductUrl(dto.download_url),
      createdAt: dto.created_at,
      id: asUiOpaqueId<'resume-pdf-artifact'>(dto.id),
      pageCount: dto.page_count,
      resumeId: asUiOpaqueId<'resume'>(dto.resume_id),
      resumeRevision: dto.resume_revision
    }
  }

  #mapRenderJob(dto: ResumeRenderJobDto): UiResumeRenderJob {
    return {
      artifacts: dto.artifacts
        .filter((artifact) => artifact.format === 'pdf')
        .map((artifact) => this.#mapArtifact(artifact)),
      diagnostic: dto.diagnostic,
      id: asUiOpaqueId<'resume-render-job'>(dto.id),
      progressPercent: dto.progress.percent,
      resumeId: asUiOpaqueId<'resume'>(dto.resume_id),
      resumeRevision: dto.resume_revision,
      status: dto.status
    }
  }

  async #listResumeDocuments(): Promise<readonly ReturnType<typeof parseResumeDocumentDto>[]> {
    const results: ReturnType<typeof parseResumeDocumentDto>[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    do {
      const response = await this.#client.getJson('/resumes', { query: { cursor, limit: 20 } })
      const page = parseResumeListDto(response.data)
      results.push(...page.items)
      cursor = page.page.next_cursor
      if (cursor !== null && seenCursors.has(cursor)) {
        throw new Error('Backend repeated a Resume pagination cursor.')
      }
      if (cursor !== null) seenCursors.add(cursor)
    } while (cursor !== null)
    return results
  }
}
