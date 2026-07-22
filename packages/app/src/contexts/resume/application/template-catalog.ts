/** @file Resume 模板目录应用服务 / Resume template-catalog application service. */

import type { ResumeGateway } from './gateway'
import type { UiTemplateManifest, UiTemplateReference } from '../domain/models'
import type { UiContentLocale } from '../../../shared-kernel/locale'

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
 * @brief 列出最新可选模板并合并简历当前固定版本 / List latest selectable templates and merge the Resume's pinned version.
 * @param gateway Resume 应用端口 / Resume application port.
 * @param locale 模板目录语言 / Template-catalog locale.
 * @param pinnedReference 简历当前固定的模板引用 / Template reference currently pinned by the Resume.
 * @return 以复合身份去重后的模板目录 / Template catalog deduplicated by composite identity.
 * @note 列表端点可只返回最新版本；历史固定版本必须通过精确资源路由读取 / The list endpoint may expose only latest versions; a historical pinned version must be read through the exact-resource route.
 */
export async function loadTemplateCatalogWithPinnedVersion(
  gateway: ResumeGateway,
  locale: UiContentLocale,
  pinnedReference: UiTemplateReference
): Promise<readonly UiTemplateManifest[]> {
  /** @brief 最新可迁移模板目录 / Latest migratable template catalog. */
  const latestTemplates = await gateway.listTemplateManifests(locale)
  /** @brief 按复合身份保持首次出现顺序的目录 / Catalog retaining first-seen order by composite identity. */
  const templatesByIdentity = new Map<string, UiTemplateManifest>()
  for (const template of latestTemplates) {
    /** @brief 当前列表项的复合身份 / Composite identity of the current catalog item. */
    const identity = getTemplateIdentity(template)
    if (!templatesByIdentity.has(identity)) templatesByIdentity.set(identity, template)
  }
  /** @brief 简历当前模板的复合身份 / Composite identity of the Resume's current template. */
  const pinnedIdentity = getTemplateIdentity(pinnedReference)
  if (templatesByIdentity.has(pinnedIdentity)) {
    return [...templatesByIdentity.values()]
  }

  /** @brief 从精确资源路由恢复的历史清单 / Historical manifest recovered through the exact-resource route. */
  const pinnedTemplate = await gateway.getTemplateManifest(
    pinnedReference.templateId,
    pinnedReference.templateVersion
  )
  templatesByIdentity.set(pinnedIdentity, pinnedTemplate)
  return [...templatesByIdentity.values()]
}
