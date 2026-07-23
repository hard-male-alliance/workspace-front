/** @file Resume 模板目录应用服务 / Resume template-catalog application services. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { asUiResumeTemplatePageLimit } from '../domain/creation'
import type { UiResumeTemplateCursor } from '../domain/creation'
import type { UiResumeEditorModel, UiResumeId, UiTemplateReference } from '../domain/document'
import type { UiTemplateManifest, UiTemplateSettingsModel } from '../domain/models'
import { assertResumeMatchesTemplateManifest } from '../domain/template-policy'
import type { ResumeGateway } from './gateway'
import type { ResumeTemplateCatalogPort } from './resume-creation'

/**
 * @brief 生成不可变模板身份 / Create an immutable template identity.
 * @param template 模板清单或引用 / Template manifest or reference.
 * @return 同时包含 ID 与版本的无歧义键 / Unambiguous key containing both ID and version.
 * @note JSON tuple 仅用于应用内身份比较，不是传输契约序列化 / The JSON tuple is only for application identity comparison, not transport serialization.
 */
export function getTemplateIdentity(template: UiTemplateManifest | UiTemplateReference): string {
  if ('templateId' in template) {
    return JSON.stringify([template.templateId, template.templateVersion])
  }
  return JSON.stringify([template.id, template.version])
}

/** @brief 渐进 Template 目录尚有一页可读取 / Progressive Template catalog with one next page to read. */
export interface ResumeTemplateCatalogContinuation {
  /** @brief 当前已按复合身份去重的模板 / Templates currently deduplicated by composite identity. */
  readonly templates: readonly UiTemplateManifest[]
  /** @brief 尚有目录页 / A catalog page remains available. */
  readonly hasMore: true
  /** @brief null 表示首页，否则为服务端 opaque cursor / Null denotes the first page; otherwise the server-issued opaque cursor. */
  readonly nextCursor: UiResumeTemplateCursor | null
  /** @brief 已请求 cursor，用于 fail-closed 循环检测 / Already requested cursors used for fail-closed loop detection. */
  readonly requestedCursors: readonly (UiResumeTemplateCursor | null)[]
}

/** @brief 已到达末页的渐进 Template 目录 / Progressive Template catalog that reached its terminal page. */
export interface ResumeTemplateCatalogComplete {
  /** @brief 最终按复合身份去重的模板 / Final Templates deduplicated by composite identity. */
  readonly templates: readonly UiTemplateManifest[]
  /** @brief 目录已完成 / The catalog is complete. */
  readonly hasMore: false
  /** @brief 末页不存在 cursor / A terminal page has no cursor. */
  readonly nextCursor: null
  /** @brief 已请求 cursor，用于诊断状态完整性 / Requested cursors preserving state integrity. */
  readonly requestedCursors: readonly (UiResumeTemplateCursor | null)[]
}

/** @brief 一次只读取一页的 Template 目录进度 / Template-catalog progress that reads exactly one page at a time. */
export type ResumeTemplateCatalogProgress =
  ResumeTemplateCatalogContinuation | ResumeTemplateCatalogComplete

/**
 * @brief Template 目录返回循环 cursor / The Template catalog returned a cursor loop.
 * @note 不把 opaque cursor 写入错误消息 / The opaque cursor is never included in the error message.
 */
export class ResumeTemplateCatalogCursorLoopError extends Error {
  /** @brief 稳定错误名称 / Stable error name. */
  override readonly name = 'ResumeTemplateCatalogCursorLoopError'

  constructor() {
    super('The Resume Template catalog repeated a pagination cursor.')
  }
}

/**
 * @brief 从精确资源路由读取 Resume 当前固定模板 / Read the Resume's pinned Template through the exact resource route.
 * @param catalog 全局公开 Template 目录端口 / Global public Template-catalog port.
 * @param pinnedReference Resume 当前固定的不可变引用 / Immutable reference currently pinned by the Resume.
 * @param signal 资源身份生命周期的取消信号 / Cancellation signal for the resource-identity lifecycle.
 * @return 身份与请求精确相同的不可变 manifest / Immutable manifest whose identity exactly matches the request.
 */
export async function loadPinnedResumeTemplate(
  catalog: ResumeTemplateCatalogPort,
  pinnedReference: UiTemplateReference,
  signal: AbortSignal
): Promise<UiTemplateManifest> {
  signal.throwIfAborted()
  /** @brief 从精确路由读取的固定版本 / Pinned version read from the exact route. */
  const pinnedTemplate = await catalog.getTemplate(pinnedReference, signal)
  signal.throwIfAborted()
  /** @brief Resume 当前模板的复合身份 / Composite identity of the Resume's current Template. */
  const pinnedIdentity = getTemplateIdentity(pinnedReference)
  if (getTemplateIdentity(pinnedTemplate) !== pinnedIdentity) {
    throw new Error('The Template catalog returned a different immutable version.')
  }
  return pinnedTemplate
}

/**
 * @brief 用已精确读取的固定模板创建渐进目录 / Create a progressive catalog from an exactly read pinned Template.
 * @param pinnedTemplate Resume 当前固定的精确 manifest / Exact manifest currently pinned by the Resume.
 * @return 下一步只会请求目录首页的初始状态 / Initial state whose next step requests only the first catalog page.
 */
export function createResumeTemplateCatalogProgress(
  pinnedTemplate: UiTemplateManifest
): ResumeTemplateCatalogContinuation {
  return {
    hasMore: true,
    nextCursor: null,
    requestedCursors: [],
    templates: [pinnedTemplate]
  }
}

/**
 * @brief 读取并合并恰好一页公开 Template 目录 / Read and merge exactly one public Template-catalog page.
 * @param catalog 全局公开 Template 目录端口 / Global public Template-catalog port.
 * @param progress 当前渐进目录状态 / Current progressive-catalog state.
 * @param signal 当前目录读取的取消信号 / Cancellation signal for the current catalog read.
 * @return 保持固定模板优先、复合身份去重且 cursor 前进的新状态 / New state preserving pinned-first order, composite-identity deduplication, and cursor progress.
 */
export async function loadNextResumeTemplateCatalogPage(
  catalog: ResumeTemplateCatalogPort,
  progress: ResumeTemplateCatalogContinuation,
  signal: AbortSignal
): Promise<ResumeTemplateCatalogProgress> {
  signal.throwIfAborted()
  /** @brief 本页请求 cursor / Cursor used by this page request. */
  const requestCursor = progress.nextCursor
  if (progress.requestedCursors.some((cursor) => cursor === requestCursor)) {
    throw new ResumeTemplateCatalogCursorLoopError()
  }
  /** @brief 恰好一个公开目录页 / Exactly one public-catalog page. */
  const page = await catalog.listTemplatePage({
    cursor: requestCursor,
    limit: asUiResumeTemplatePageLimit(50),
    signal
  })
  signal.throwIfAborted()
  /** @brief 包含本次 cursor 的不可变请求历史 / Immutable request history including this cursor. */
  const requestedCursors = [...progress.requestedCursors, requestCursor]
  if (page.hasMore && requestedCursors.some((cursor) => cursor === page.nextCursor)) {
    throw new ResumeTemplateCatalogCursorLoopError()
  }
  /** @brief 保留固定模板优先顺序的复合身份索引 / Composite-identity index preserving pinned-first order. */
  const templatesByIdentity = new Map<string, UiTemplateManifest>()
  for (const template of [...progress.templates, ...page.items]) {
    /** @brief 当前模板复合身份 / Composite identity of the current Template. */
    const identity = getTemplateIdentity(template)
    if (!templatesByIdentity.has(identity)) templatesByIdentity.set(identity, template)
  }
  /** @brief 合并后不共享容器的模板目录 / Merged Template catalog with an independent container. */
  const templates = [...templatesByIdentity.values()]
  return page.hasMore
    ? {
        hasMore: true,
        nextCursor: page.nextCursor,
        requestedCursors,
        templates
      }
    : { hasMore: false, nextCursor: null, requestedCursors, templates }
}

/**
 * @brief 从 Resume 权威与公开目录投影模板设置页 / Project a template-settings page from Resume authority and the public catalog.
 * @param editor 带强 ETag 的 Resume 权威 / Resume authority carrying a strong ETag.
 * @param templates 包含当前固定版本的目录 / Catalog containing the currently pinned version.
 * @return 不混入 transport 或展示默认值的设置页模型 / Settings-page model without transport or presentation defaults.
 */
export function projectResumeTemplateSettings(
  editor: UiResumeEditorModel,
  templates: readonly UiTemplateManifest[]
): UiTemplateSettingsModel {
  /** @brief Resume 精确固定的不可变 Template / Exact immutable Template pinned by the Resume. */
  const selectedTemplate = templates.find(
    (template) => getTemplateIdentity(template) === getTemplateIdentity(editor.resume.template)
  )
  if (selectedTemplate === undefined) {
    throw new Error('The Template catalog omitted the Resume pinned version.')
  }
  assertResumeMatchesTemplateManifest(editor.resume, selectedTemplate)
  return {
    availableTemplates: templates,
    concurrencyToken: editor.concurrencyToken,
    locale: editor.resume.locale,
    resumeId: editor.resume.id,
    resumeRevision: editor.resume.revision,
    selectedTemplate,
    sections: editor.resume.sections.map((section) => ({ id: section.id, kind: section.kind })),
    styleIntent: editor.resume.styleIntent,
    workspaceId: editor.resume.workspaceId
  }
}

/**
 * @brief 在一个取消边界内读取 Resume 权威与所需公开 Template / Read Resume authority and required public Templates within one cancellation boundary.
 * @param gateway Workspace-scoped Resume 端口 / Workspace-scoped Resume port.
 * @param catalog 全局公开 Template 目录 / Global public Template catalog.
 * @param workspaceId 显式授权 Workspace / Explicit authorization Workspace.
 * @param resumeId 目标 Resume / Target Resume.
 * @param signal 资源身份取消信号 / Resource-identity cancellation signal.
 * @return 与同一 Resume 权威配对的模板设置页 / Template-settings page paired with one Resume authority.
 */
export async function loadResumeTemplateSettings(
  gateway: ResumeGateway,
  catalog: ResumeTemplateCatalogPort,
  workspaceId: UiWorkspaceId,
  resumeId: UiResumeId,
  signal: AbortSignal
): Promise<UiTemplateSettingsModel> {
  signal.throwIfAborted()
  /** @brief 一次取消边界内的 Resume 权威 / Resume authority within one cancellation boundary. */
  const editor = await gateway.getResumeEditor(workspaceId, resumeId, signal)
  signal.throwIfAborted()
  /** @brief 必须先成功读取的精确固定版本 / Exact pinned version that must load first. */
  const pinnedTemplate = await loadPinnedResumeTemplate(catalog, editor.resume.template, signal)
  signal.throwIfAborted()
  return projectResumeTemplateSettings(editor, [pinnedTemplate])
}
