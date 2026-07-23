/** @file Resume 最终生成与导出的输出格式策略 / Output-format policy for Resume final generation and export. */

import type { UiResumeOutputFormat } from './document'
import type { UiResumeRenderFormat } from './models'

/** @brief 最终 Resume 可交付格式 / Deliverable formats for a final Resume. */
export type UiResumeDeliverableFormat = Extract<UiResumeRenderFormat, 'pdf' | 'docx'>

/** @brief 固定模板下可发起的最终生成与导出格式 / Final-generation and export formats available for one pinned Template. */
export interface ResumeRenderFormatAvailability {
  /** @brief 最终生成仅包含模板声明的 PDF/DOCX / Final generation contains only PDF/DOCX declared by the Template. */
  readonly finalFormats: readonly UiResumeDeliverableFormat[]
  /** @brief 导出始终包含语义 JSON，并附加模板声明的 PDF/DOCX / Export always contains semantic JSON plus Template-declared PDF/DOCX. */
  readonly exportFormats: readonly UiResumeRenderFormat[]
}

/** @brief 与 API v2 Render 和产品交付都相交的固定顺序格式 / Canonically ordered formats shared by API v2 Render and product delivery. */
const DELIVERABLE_FORMATS: readonly UiResumeDeliverableFormat[] = ['pdf', 'docx']

/**
 * @brief 从固定 TemplateManifest 推导最终生成与导出的闭合格式集合 / Derive closed final-generation and export format sets from a pinned TemplateManifest.
 * @param templateFormats 模板声明的输出格式；可能包含 API v2 Render 不接受的 PNG/HTML snapshot / Output formats declared by the Template, possibly including PNG/HTML snapshot unsupported by API v2 Render.
 * @return 使用稳定顺序、不会向 CreateRenderJob 泄漏 PNG/HTML 的产品格式集合 / Product format sets in stable order that never leak PNG/HTML to CreateRenderJob.
 * @note JSON 是 Resume 语义导出能力，不依赖模板渲染能力 / JSON is a semantic Resume export capability and does not depend on Template rendering capability.
 */
export function deriveResumeRenderFormatAvailability(
  templateFormats: readonly UiResumeOutputFormat[]
): ResumeRenderFormatAvailability {
  /** @brief 模板声明格式的集合投影 / Set projection of Template-declared formats. */
  const supported = new Set<UiResumeOutputFormat>(templateFormats)
  /** @brief 采用产品规范固定顺序的最终交付格式 / Final deliverable formats in product-canonical order. */
  const finalFormats = DELIVERABLE_FORMATS.filter((format) => supported.has(format))
  return {
    exportFormats: ['json', ...finalFormats],
    finalFormats
  }
}
