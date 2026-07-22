/** @file Resume 与模板只读 HTTP Gateway / Read-only HTTP Gateway for Resume and templates. */

import type { ResumeGateway } from '../../application/gateway'
import {
  getResumeConflictStatus,
  ResumeOperationRejectedError,
  ResumeSnapshotConflictError
} from '../../application/errors'
import {
  getTemplateIdentity,
  loadTemplateCatalogWithPinnedVersion
} from '../../application/template-catalog'
import type {
  UiResumeCard,
  UiResumeEditorModel,
  UiResumeId,
  UiResumePdfArtifact,
  UiResumeRenderJob,
  UiStartResumePdfRenderInput,
  UiResumeSectionDeleteInput,
  UiResumeSectionsReorderInput,
  UiResumeSectionUpdateInput,
  UiResumeTemplateSelectionInput,
  UiResumeTemplateSettingsUpdateInput,
  UiTemplateManifest,
  UiTemplateId,
  UiTemplateSettingsModel
} from '../../domain/models'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import {
  HttpCommandOutcomeUnknownError,
  HttpContractError,
  parseStrongEntityTag,
  toHttpCommandOutcomeUnknownError
} from '../../../../infrastructure/http/http-client'
import { mapResumeDocumentDto, mapResumeStyleIntentToDto, mapTemplateManifestDto } from './mappers'
import {
  parseResumeDocumentDto,
  parseResumeListDto,
  parseResumeOperationBatchResultDto,
  parseResumeRenderJobDto,
  parseTemplateManifestDto,
  parseTemplateManifestListDto
} from './validators'
import type { RenderArtifactDto, ResumeDocumentDto, ResumeRenderJobDto } from './transport-types'

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

  async getTemplateManifest(
    templateId: UiTemplateId,
    version: string
  ): Promise<UiTemplateManifest> {
    /** @brief 按契约读取的精确模板响应 / Exact template response read through the contract route. */
    const response = await this.#client.getJson(
      `/resume-templates/${encodeURIComponent(templateId)}`,
      { query: { version } }
    )
    /** @brief 已完整校验的模板 DTO / Fully validated template DTO. */
    const dto = parseTemplateManifestDto(response.data)
    if (dto.id !== templateId || dto.template_version !== version) {
      throw new HttpContractError(
        'Backend returned a different template version than requested.',
        response.status
      )
    }
    return mapTemplateManifestDto(dto)
  }

  async listResumeCards(workspaceId: UiWorkspaceId): Promise<readonly UiResumeCard[]> {
    const documents = (await this.#listResumeDocuments()).filter(
      (document) => document.workspace_id === workspaceId
    )
    const locales = [...new Set(documents.map((document) => document.locale))]
    const manifests = (
      await Promise.all(locales.map((locale) => this.listTemplateManifests(locale)))
    ).flat()
    const names = new Map<string, string>(
      manifests.map((manifest) => [getTemplateIdentity(manifest), manifest.name] as const)
    )

    /** @brief 最新目录中缺失的固定历史模板 / Pinned historical templates absent from the latest catalogs. */
    const missingTemplates = new Map<string, ResumeDocumentDto['template']>()
    for (const document of documents) {
      /** @brief 当前 Resume 固定模板的复合键 / Composite key of the current Resume's pinned template. */
      const key = getTemplateIdentity({
        templateId: document.template.template_id as UiTemplateId,
        templateVersion: document.template.template_version
      })
      if (!names.has(key)) missingTemplates.set(key, document.template)
    }
    const historicalTemplates = await Promise.all(
      [...missingTemplates.values()].map((reference) =>
        this.getTemplateManifest(reference.template_id as UiTemplateId, reference.template_version)
      )
    )
    for (const template of historicalTemplates) {
      names.set(getTemplateIdentity(template), template.name)
    }

    return documents.map((dto) => {
      /** @brief 精确固定版本的权威模板名称 / Authoritative name of the exact pinned template version. */
      const templateName = names.get(
        getTemplateIdentity({
          templateId: dto.template.template_id as UiTemplateId,
          templateVersion: dto.template.template_version
        })
      )
      if (templateName === undefined) {
        throw new Error('The Resume pinned template is unavailable.')
      }
      return {
        id: mapResumeDocumentDto(dto).id,
        revision: dto.revision,
        templateName,
        title: dto.title,
        updatedAt: dto.updated_at
      }
    })
  }

  async getResumeEditor(resumeId: UiResumeId): Promise<UiResumeEditorModel> {
    const response = await this.#client.getJson(`/resumes/${encodeURIComponent(resumeId)}`)
    const dto = parseResumeDocumentDto(response.data)
    if (dto.id !== resumeId) {
      throw new HttpContractError(
        'Backend returned a different Resume than requested.',
        response.status
      )
    }
    this.#resumeById.set(dto.id, dto)
    const etag = response.headers.get('ETag')
    if (etag === null) this.#etagByResumeId.delete(dto.id)
    else {
      this.#etagByResumeId.set(
        dto.id,
        parseStrongEntityTag(etag, 'response.headers.ETag', response.status)
      )
    }
    return {
      resume: mapResumeDocumentDto(dto)
    }
  }

  async getTemplateSettings(resumeId: UiResumeId): Promise<UiTemplateSettingsModel> {
    const editor = await this.getResumeEditor(resumeId)
    const templates = await loadTemplateCatalogWithPinnedVersion(
      this,
      editor.resume.locale,
      editor.resume.template
    )
    const selectedIdentity = getTemplateIdentity(editor.resume.template)
    const selected = templates.find(
      (template) => getTemplateIdentity(template) === selectedIdentity
    )
    if (selected === undefined) {
      throw new Error('The Resume template is not available in the backend template catalog.')
    }
    return {
      availableTemplates: templates,
      resumeId,
      resumeRevision: editor.resume.revision,
      selectedTemplate: selected,
      styleIntent: editor.resume.styleIntent
    }
  }

  async startResumePdfRender(input: UiStartResumePdfRenderInput): Promise<UiResumeRenderJob> {
    /** @brief 是否已经收到服务端的成功响应 / Whether a successful service response has already arrived. */
    let responseReceived = false
    try {
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
        {
          expectedStatus: 202,
          idempotencyKey: input.commandId,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        }
      )
      responseReceived = true
      /** @brief 后端已接受的权威 Render Job / Authoritative Render Job accepted by the backend. */
      const job = parseResumeRenderJobDto(response.data)
      if (job.resume_id !== input.resumeId || job.resume_revision !== input.resumeRevision) {
        throw new HttpContractError(
          'Backend Render Job does not match the requested Resume revision.',
          response.status
        )
      }
      this.#client.assertResourceLocation(
        response,
        `/resume-render-jobs/${encodeURIComponent(job.id)}`
      )
      return this.#mapRenderJob(job)
    } catch (error: unknown) {
      if (responseReceived) throw toHttpCommandOutcomeUnknownError(error)
      throw error
    }
  }

  async getResumeRenderJob(
    jobId: UiResumeRenderJob['id'],
    signal?: AbortSignal
  ): Promise<UiResumeRenderJob> {
    const response = await this.#client.getJson(
      `/resume-render-jobs/${encodeURIComponent(jobId)}`,
      {
        diagnostics: 'suppress',
        ...(signal === undefined ? {} : { signal })
      }
    )
    /** @brief 已验证的轮询结果 / Validated polling result. */
    const job = parseResumeRenderJobDto(response.data)
    if (job.id !== jobId) {
      throw new HttpContractError(
        'Backend returned a different Resume Render Job than requested.',
        response.status
      )
    }
    return this.#mapRenderJob(job)
  }

  async updateResumeSection(input: UiResumeSectionUpdateInput): Promise<UiResumeEditorModel> {
    const target = { entity_type: 'section', section_id: input.sectionId }
    /** @brief 仅包含用户明确修改字段的 operation / Operations containing only fields explicitly changed by the user. */
    const operations: (Readonly<Record<string, unknown>> & { readonly operation_id: string })[] = []
    if (input.title !== undefined) {
      operations.push({
        field_path: ['title'],
        op: 'set_field',
        operation_id: this.#id('op'),
        target,
        value: input.title
      })
    }
    if (input.content !== undefined) {
      operations.push({
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
      })
    }
    if (operations.length === 0) {
      throw new Error('A Resume section update requires at least one explicitly changed field.')
    }
    return this.#applyOperations(input.resumeId, input.baseRevision, operations, input.signal)
  }

  async reorderResumeSections(input: UiResumeSectionsReorderInput): Promise<UiResumeEditorModel> {
    const snapshot = await this.#ensureWritableSnapshot(
      input.resumeId,
      input.baseRevision,
      input.signal
    )
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
      input.baseRevision,
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
      input.baseRevision,
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
    const snapshot = await this.#ensureWritableSnapshot(
      input.resumeId,
      input.baseRevision,
      input.signal
    )
    const templates = await loadTemplateCatalogWithPinnedVersion(this, snapshot.locale, {
      templateId: input.templateId,
      templateVersion: input.templateVersion
    })
    const requestedIdentity = getTemplateIdentity({
      templateId: input.templateId,
      templateVersion: input.templateVersion
    })
    const template = templates.find((item) => getTemplateIdentity(item) === requestedIdentity)
    if (template === undefined) {
      throw new Error('The selected Resume template is not available.')
    }
    return this.#applyOperations(
      input.resumeId,
      input.baseRevision,
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
      input.signal,
      { id: template.id, version: template.version }
    )
  }

  async updateTemplateSettings(
    input: UiResumeTemplateSettingsUpdateInput
  ): Promise<UiTemplateSettingsModel> {
    const snapshot = await this.#ensureWritableSnapshot(
      input.resumeId,
      input.baseRevision,
      input.signal
    )
    const templates = await loadTemplateCatalogWithPinnedVersion(this, snapshot.locale, {
      templateId: input.templateId,
      templateVersion: input.templateVersion
    })
    const requestedIdentity = getTemplateIdentity({
      templateId: input.templateId,
      templateVersion: input.templateVersion
    })
    const template = templates.find((item) => getTemplateIdentity(item) === requestedIdentity)
    if (template === undefined) {
      throw new Error('The selected Resume template is not available.')
    }
    if (!template.supportedPageSizes.includes(input.styleIntent.page.size)) {
      throw new Error('The selected Resume template does not support the requested page size.')
    }
    if (!template.fontFamilyTokens.includes(input.styleIntent.typography.fontFamilyToken)) {
      throw new Error('The selected Resume template does not support the requested font token.')
    }

    const editor = await this.#applyOperations(
      input.resumeId,
      input.baseRevision,
      [
        {
          op: 'set_template',
          operation_id: this.#id('op'),
          style_intent: mapResumeStyleIntentToDto(input.styleIntent),
          template: {
            template_id: template.id,
            template_version: template.version
          }
        }
      ],
      input.signal,
      { id: template.id, version: template.version }
    )
    return {
      availableTemplates: templates,
      resumeId: input.resumeId,
      resumeRevision: editor.resume.revision,
      selectedTemplate: template,
      styleIntent: editor.resume.styleIntent
    }
  }

  async #applyOperations(
    resumeId: UiResumeId,
    baseRevision: number,
    operations: readonly (Readonly<Record<string, unknown>> & { readonly operation_id: string })[],
    signal?: AbortSignal,
    expectedTemplate?: { readonly id: UiTemplateId; readonly version: string }
  ): Promise<UiResumeEditorModel> {
    await this.#ensureWritableSnapshot(resumeId, baseRevision, signal)
    const etag = this.#etagByResumeId.get(resumeId)
    if (etag === undefined) {
      throw new HttpContractError('Resume writes require an ETag from the backend.', 200)
    }
    const clientBatchId = this.#id('batch')
    /** @brief 是否已经收到服务端的成功批次响应 / Whether a successful batch response has already arrived. */
    let responseReceived = false
    try {
      const response = await this.#client.postJson(
        `/resumes/${encodeURIComponent(resumeId)}/operations`,
        {
          base_revision: baseRevision,
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
      responseReceived = true
      const result = parseResumeOperationBatchResultDto(response.data)
      /** @brief 本批请求发送的 operation ID / Operation IDs sent in this batch. */
      const requestedOperationIds = operations.map((operation) => operation.operation_id)
      /** @brief 后端批次结果返回的 operation ID / Operation IDs returned by the backend batch result. */
      const returnedOperationIds = result.results.map((operation) => operation.operation_id)
      /** @brief 去重后的请求 operation ID / Deduplicated requested operation IDs. */
      const requestedOperationIdSet = new Set(requestedOperationIds)
      /** @brief 去重后的返回 operation ID / Deduplicated returned operation IDs. */
      const returnedOperationIdSet = new Set(returnedOperationIds)
      if (
        result.resume_id !== resumeId ||
        result.previous_revision !== baseRevision ||
        requestedOperationIdSet.size !== requestedOperationIds.length ||
        returnedOperationIdSet.size !== returnedOperationIds.length ||
        returnedOperationIds.length !== requestedOperationIds.length ||
        requestedOperationIds.some((operationId) => !returnedOperationIdSet.has(operationId))
      ) {
        throw new HttpContractError(
          'Backend operation result does not match the requested Resume batch.',
          200
        )
      }
      if (
        result.normalized_document !== null &&
        (result.normalized_document.id !== resumeId ||
          result.normalized_document.revision !== result.new_revision)
      ) {
        throw new HttpContractError(
          'Backend normalized Resume does not match the operation result revision.',
          200
        )
      }
      /** @brief 当前批次的全部领域拒绝 / All domain rejections in the current batch. */
      const rejectedResults = result.results.filter((operation) => operation.status === 'rejected')
      /** @brief 优先需要权威重载的并发拒绝，否则取首个稳定拒绝 / Conflict rejection requiring authority reload first, otherwise the first stable rejection. */
      const rejected =
        rejectedResults.find(
          (operation) => operation.problem?.status === 409 || operation.problem?.status === 412
        ) ?? rejectedResults.at(0)
      if (rejected !== undefined) {
        throw new ResumeOperationRejectedError(rejected.problem)
      }
      this.#etagByResumeId.delete(resumeId)
      /** @brief 批次后的权威编辑器投影 / Authoritative editor projection after the batch. */
      let editor: UiResumeEditorModel
      if (result.normalized_document === null) {
        editor = await this.getResumeEditor(resumeId)
      } else {
        editor = this.#toEditor(result.normalized_document)
        this.#resumeById.set(resumeId, result.normalized_document)
      }
      if (
        expectedTemplate !== undefined &&
        (editor.resume.template.templateId !== expectedTemplate.id ||
          editor.resume.template.templateVersion !== expectedTemplate.version)
      ) {
        throw new HttpContractError(
          'Backend normalized Resume does not contain the requested template version.',
          200
        )
      }
      return editor
    } catch (error: unknown) {
      /** @brief 是否必须丢弃快照并通过显式权威读取恢复 / Whether the snapshot must be discarded and recovered through an explicit authoritative read. */
      const authorityReloadRequired =
        error instanceof ResumeOperationRejectedError ||
        error instanceof HttpCommandOutcomeUnknownError ||
        getResumeConflictStatus(error) !== null ||
        (responseReceived && !(error instanceof ResumeOperationRejectedError))
      if (authorityReloadRequired) {
        this.#resumeById.delete(resumeId)
        this.#etagByResumeId.delete(resumeId)
      }
      if (responseReceived && !(error instanceof ResumeOperationRejectedError)) {
        throw toHttpCommandOutcomeUnknownError(error)
      }
      throw error
    }
  }

  async #ensureWritableSnapshot(
    resumeId: UiResumeId,
    baseRevision: number,
    signal?: AbortSignal
  ): Promise<ResumeDocumentDto> {
    if (!this.#resumeById.has(resumeId) || !this.#etagByResumeId.has(resumeId)) {
      const response = await this.#client.getJson(
        `/resumes/${encodeURIComponent(resumeId)}`,
        signal === undefined ? {} : { signal }
      )
      const dto = parseResumeDocumentDto(response.data)
      if (dto.id !== resumeId) {
        throw new HttpContractError(
          'Backend returned a different Resume than requested for a write snapshot.',
          response.status
        )
      }
      this.#resumeById.set(dto.id, dto)
      const etag = response.headers.get('ETag')
      if (etag === null) this.#etagByResumeId.delete(dto.id)
      else {
        this.#etagByResumeId.set(
          dto.id,
          parseStrongEntityTag(etag, 'response.headers.ETag', response.status)
        )
      }
    }
    const snapshot = this.#resumeById.get(resumeId)
    if (snapshot === undefined) {
      throw new HttpContractError('Resume snapshot is unavailable for this write.', 200)
    }
    if (snapshot.revision !== baseRevision) {
      throw new ResumeSnapshotConflictError()
    }
    return snapshot
  }

  #toEditor(dto: ResumeDocumentDto): UiResumeEditorModel {
    return {
      resume: mapResumeDocumentDto(dto)
    }
  }

  #id(prefix: string): string {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }

  #mapArtifact(dto: RenderArtifactDto): UiResumePdfArtifact {
    return {
      contentUrl: this.#client.resolveArtifactUrl(dto.download_url, dto.id),
      createdAt: dto.created_at,
      id: asUiOpaqueId<'resume-pdf-artifact'>(dto.id),
      pageCount: dto.page_count,
      resumeId: asUiOpaqueId<'resume'>(dto.resume_id),
      resumeRevision: dto.resume_revision
    }
  }

  #mapRenderJob(dto: ResumeRenderJobDto): UiResumeRenderJob {
    /** @brief 当前客户端理解并可驱动状态机的 Render Job 状态 / Render Job statuses understood by this client state machine. */
    const knownStatuses = new Set<UiResumeRenderJob['status']>([
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'expired'
    ])
    return {
      artifacts: dto.artifacts
        .filter((artifact) => artifact.format === 'pdf')
        .map((artifact) => this.#mapArtifact(artifact)),
      id: asUiOpaqueId<'resume-render-job'>(dto.id),
      progressPercent: dto.progress.percent,
      resumeId: asUiOpaqueId<'resume'>(dto.resume_id),
      resumeRevision: dto.resume_revision,
      status: knownStatuses.has(dto.status as UiResumeRenderJob['status'])
        ? (dto.status as UiResumeRenderJob['status'])
        : 'unknown'
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
