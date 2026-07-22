/** @file Resume 创建页的纯状态与映射 / Pure state and mappings for the Resume-creation page. */

import type { UiCommandId } from '../../../../shared-kernel/command'
import type { UiWorkspaceId } from '../../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import {
  asUiResumeTemplatePageLimit,
  type UiResumeCreationTemplateOption,
  type UiResumeCreationTemplatePage
} from '../../domain/creation'
import type { UiTemplateManifest, UiTemplateReference } from '../../domain/models'

/** @brief 创建页每次读取的 Template 数量 / Number of Templates read by each creation-page request. */
export const RESUME_CREATION_TEMPLATE_PAGE_LIMIT = asUiResumeTemplatePageLimit(24)

/** @brief API v2 Locale 的完整字段语法 / Complete API v2 Locale field syntax. */
const CONTENT_LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** @brief Resume 标题的 API v2 Unicode code-point 上限 / API v2 Unicode code-point limit for a Resume title. */
export const RESUME_TITLE_MAX_LENGTH = 300

/** @brief Template 首页资源结果 / First-page Template resource result. */
export type ResumeCreationTemplateAuthority =
  | {
      /** @brief 当前 Locale 仍未满足 API v2 字段语法 / The current Locale does not yet satisfy the API v2 field syntax. */
      readonly kind: 'invalid-locale'
    }
  | {
      /** @brief 已读取一页 Template 创建选项 / A page of Template creation options was loaded. */
      readonly kind: 'page'
      /** @brief 成功首页读取的单调代际 / Monotonic generation of a successful first-page read. */
      readonly generation: number
      /** @brief 当前权威首页 / Current authoritative first page. */
      readonly page: UiResumeCreationTemplatePage
    }

/** @brief Resume 创建提交状态 / Resume-creation submission state. */
export type ResumeCreationSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'error'; readonly error: unknown }

/** @brief 一次表单意图与稳定 Idempotency-Key 的绑定 / Binding between one form intent and a stable Idempotency-Key. */
export interface ResumeCreationAttempt {
  /** @brief 不含 signal 的规范表单指纹 / Canonical form fingerprint without a signal. */
  readonly fingerprint: string
  /** @brief 本意图的稳定命令 ID / Stable command ID for this intent. */
  readonly commandId: UiCommandId
}

/** @brief 绑定到一次 Template 首页权威的显式选择 / Explicit selection bound to one Template first-page authority. */
export interface ResumeTemplateSelection {
  /** @brief 选择所属的 Template 首页代际 / Template first-page generation owning the selection. */
  readonly generation: number
  /** @brief 用户选择的不可变 Template 引用 / Immutable Template reference selected by the user. */
  readonly template: UiTemplateReference
}

/**
 * @brief 判断字符串是否满足 API v2 Locale 约束 / Determine whether a string satisfies the API v2 Locale constraint.
 * @param value 已去除首尾空白的候选值 / Trimmed candidate value.
 * @return 长度和语法均合法时为 true / True when both length and syntax are valid.
 */
export function isContentLocale(value: string): value is UiContentLocale {
  return [...value].length >= 2 && [...value].length <= 35 && CONTENT_LOCALE_PATTERN.test(value)
}

/**
 * @brief 为不可变 Template 构造稳定界面键 / Construct a stable UI key for an immutable Template.
 * @param template Template 清单或引用 / Template manifest or reference.
 * @return 同时包含 ID 与精确版本的键 / Key containing both ID and exact version.
 */
export function getTemplateKey(template: UiTemplateManifest | UiTemplateReference): string {
  return 'id' in template
    ? JSON.stringify([template.id, template.version])
    : JSON.stringify([template.templateId, template.templateVersion])
}

/**
 * @brief 将 Template 清单投影为不可变引用 / Project a Template manifest to an immutable reference.
 * @param template 已验证 Template 清单 / Validated Template manifest.
 * @return 只含 ID 与精确版本的引用 / Reference containing only ID and exact version.
 */
export function toTemplateReference(template: UiTemplateManifest): UiTemplateReference {
  return { templateId: template.id, templateVersion: template.version }
}

/**
 * @brief 按不可变身份合并 Template 选项 / Merge Template options by immutable identity.
 * @param current 已接受的选项 / Already accepted options.
 * @param incoming 新页选项 / Options from the new page.
 * @return 保留首现顺序并以新投影替换重复项的集合 / Collection preserving first-seen order while replacing duplicates with newer projections.
 */
export function mergeTemplateOptions(
  current: readonly UiResumeCreationTemplateOption[],
  incoming: readonly UiResumeCreationTemplateOption[]
): readonly UiResumeCreationTemplateOption[] {
  /** @brief 不可变 Template 身份到选项的有序映射 / Ordered map from immutable Template identity to option. */
  const options = new Map(current.map((option) => [getTemplateKey(option.template), option]))
  for (const option of incoming) options.set(getTemplateKey(option.template), option)
  return [...options.values()]
}

/**
 * @brief 选取当前页第一个可用于目标 Locale 的 Template / Select the first Template usable for the target Locale.
 * @param page 当前 Template 创建选项页 / Current Template creation-option page.
 * @return 第一个可选 Template 的不可变引用，若无则为 null / Immutable reference of the first selectable Template, or null when absent.
 */
export function getInitialTemplate(page: UiResumeCreationTemplatePage): UiTemplateReference | null {
  /** @brief 当前页第一个可选项 / First selectable option on the current page. */
  const option = page.items.find((item) => item.kind === 'selectable')
  return option === undefined ? null : toTemplateReference(option.template)
}

/**
 * @brief 构造一次创建意图的稳定表单指纹 / Construct the stable form fingerprint for one creation intent.
 * @param workspaceId 显式 Workspace 路径参数 / Explicit Workspace path parameter.
 * @param title 即将提交的规范标题 / Canonical title about to be submitted.
 * @param locale 即将提交的内容语言 / Content locale about to be submitted.
 * @param template 选中的不可变 Template / Selected immutable Template.
 * @return 可与命令 ID 原子缓存的本地指纹 / Local fingerprint cacheable atomically with a command ID.
 */
export function createResumeCreationFingerprint(
  workspaceId: UiWorkspaceId,
  title: string,
  locale: UiContentLocale,
  template: UiTemplateReference
): string {
  return JSON.stringify([
    workspaceId,
    title,
    locale,
    template.templateId,
    template.templateVersion,
    'new'
  ])
}

/**
 * @brief 格式化内容语言供用户识别 / Format a content locale for user recognition.
 * @param contentLocale Resume 内容语言 / Resume-content locale.
 * @param applicationLocale 应用界面语言 / Application-interface locale.
 * @return 本地化语言名与原始 BCP 47 tag / Localized language name and original BCP 47 tag.
 */
export function formatContentLocale(contentLocale: string, applicationLocale: string): string {
  try {
    /** @brief 浏览器提供的语言显示名 / Browser-provided language display name. */
    const displayName = new Intl.DisplayNames([applicationLocale], { type: 'language' }).of(
      contentLocale
    )
    return displayName === undefined ? contentLocale : `${displayName} (${contentLocale})`
  } catch {
    return contentLocale
  }
}
