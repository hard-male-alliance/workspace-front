/** @file Resume 文档的纯展示选择器 / Pure presentation selectors for Resume documents. */

import type { UiResumeDateRange, UiResumeRichText } from '../domain/document'

/**
 * @brief 从富文本选择纯文本正文 / Select the plain-text body from rich text.
 * @param richText 权威富文本 / Authoritative rich text.
 * @return 不修改 marks 的纯文本展示值 / Plain-text display value without modifying marks.
 */
export function selectResumePlainText(richText: UiResumeRichText | null): string {
  return richText?.text ?? ''
}

/**
 * @brief 为展示选择保留 partial-date 精度的日期标签 / Select a date label preserving partial-date precision for display.
 * @param range 权威日期范围 / Authoritative date range.
 * @param presentLabel 本地化的 present 标签 / Localized label for present.
 * @return 可展示标签；两个边界均为空时为 null / Display label, or null when both bounds are absent.
 */
export function selectResumeDateLabel(
  range: UiResumeDateRange | null,
  presentLabel: string
): string | null {
  if (range === null || (range.start === null && range.end === null)) return null
  /** @brief 本地化后的结束边界 / End boundary after localization. */
  const end = range.end === 'present' ? presentLabel : range.end
  if (range.start === null) return end
  if (end === null) return range.start
  return `${range.start} — ${end}`
}
