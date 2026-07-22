/** @file Resume 模板目录应用服务 / Resume template-catalog application services. */

import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import { asUiResumeTemplatePageLimit } from '../domain/creation'
import type { UiResumeEditorModel, UiResumeId, UiTemplateReference } from '../domain/document'
import type { UiTemplateManifest, UiTemplateSettingsModel } from '../domain/models'
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

/**
 * @brief 列出全部已发布模板并合并 Resume 当前固定版本 / List all published Templates and merge the Resume's pinned version.
 * @param catalog 全局公开 Template 目录端口 / Global public Template-catalog port.
 * @param pinnedReference Resume 当前固定的模板引用 / Template reference currently pinned by the Resume.
 * @param signal 资源身份生命周期的取消信号 / Cancellation signal for the resource-identity lifecycle.
 * @return 以复合身份去重且包含固定版本的目录 / Catalog deduplicated by composite identity and containing the pinned version.
 * @note 列表端点可只返回最新版本；历史固定版本必须通过精确资源路由读取 / The list endpoint may expose only latest versions; a historical pinned version is read through the exact-resource route.
 */
export async function loadTemplateCatalogWithPinnedVersion(
  catalog: ResumeTemplateCatalogPort,
  pinnedReference: UiTemplateReference,
  signal: AbortSignal
): Promise<readonly UiTemplateManifest[]> {
  /** @brief 按复合身份保持首次出现顺序的目录 / Catalog retaining first-seen order by composite identity. */
  const templatesByIdentity = new Map<string, UiTemplateManifest>()
  /** @brief 已消费 cursor，防止坏端口形成循环 / Consumed cursors preventing a broken port from creating a loop. */
  const consumedCursors = new Set<string>()
  /** @brief 当前公开目录 cursor / Current public-catalog cursor. */
  let cursor = null

  while (true) {
    signal.throwIfAborted()
    /** @brief 当前一页公开 Template / Current page of public Templates. */
    const page = await catalog.listTemplatePage({
      cursor,
      limit: asUiResumeTemplatePageLimit(200),
      signal
    })
    signal.throwIfAborted()
    for (const template of page.items) {
      /** @brief 当前列表项的复合身份 / Composite identity of the current catalog item. */
      const identity = getTemplateIdentity(template)
      if (!templatesByIdentity.has(identity)) templatesByIdentity.set(identity, template)
    }
    if (!page.hasMore) break
    if (consumedCursors.has(page.nextCursor)) {
      throw new Error('The Template catalog repeated a pagination cursor.')
    }
    consumedCursors.add(page.nextCursor)
    cursor = page.nextCursor
  }

  /** @brief Resume 当前模板的复合身份 / Composite identity of the Resume's current Template. */
  const pinnedIdentity = getTemplateIdentity(pinnedReference)
  if (templatesByIdentity.has(pinnedIdentity)) return [...templatesByIdentity.values()]

  /** @brief 从精确资源路由恢复的历史清单 / Historical manifest recovered through the exact-resource route. */
  const pinnedTemplate = await catalog.getTemplate(pinnedReference, signal)
  signal.throwIfAborted()
  if (getTemplateIdentity(pinnedTemplate) !== pinnedIdentity) {
    throw new Error('The Template catalog returned a different immutable version.')
  }
  templatesByIdentity.set(pinnedIdentity, pinnedTemplate)
  return [...templatesByIdentity.values()]
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
  return {
    availableTemplates: templates,
    concurrencyToken: editor.concurrencyToken,
    resumeId: editor.resume.id,
    resumeRevision: editor.resume.revision,
    selectedTemplate,
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
  /** @brief 包含当前固定版本的公开目录 / Public catalog containing the pinned version. */
  const templates = await loadTemplateCatalogWithPinnedVersion(
    catalog,
    editor.resume.template,
    signal
  )
  signal.throwIfAborted()
  return projectResumeTemplateSettings(editor, templates)
}
