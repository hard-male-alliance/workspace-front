/** @file Template 到 Resume 创建的领域语言 / Domain language for Template-to-Resume creation. */

import type { UiCommandId } from '../../../shared-kernel/command'
import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiWorkspaceId } from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'
import type { UiResumeId, UiTemplateReference } from './document'
import type { UiTemplateManifest } from './models'

/** @brief Template 目录 cursor 的名义类型品牌 / Nominal type brand for Template-catalog cursors. */
declare const resumeTemplateCursorBrand: unique symbol

/** @brief Template 目录的不透明分页 cursor / Opaque pagination cursor for the Template catalog. */
export type UiResumeTemplateCursor = string & {
  readonly [resumeTemplateCursorBrand]: 'resume-template-cursor'
}

/** @brief 单页 Template 目录最大条目数 / Maximum items in one Template-catalog page. */
export const UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX = 200

/** @brief Template 目录页大小的名义类型品牌 / Nominal type brand for Template-catalog page sizes. */
declare const resumeTemplatePageLimitBrand: unique symbol

/** @brief 经契约上限验证的 Template 目录页大小 / Template-catalog page size validated against the contract limit. */
export type UiResumeTemplatePageLimit = number & {
  readonly [resumeTemplatePageLimitBrand]: 'resume-template-page-limit'
}

/**
 * @brief 将有界字符串提升为 Template 目录 cursor / Refine a bounded string into a Template-catalog cursor.
 * @param value 服务端签发的不透明 cursor / Opaque cursor issued by the service.
 * @return 带 Template 目录语义的 cursor / Cursor carrying Template-catalog semantics.
 * @throws {TypeError} 当值不满足 API v2 的 1..2048 字符约束时抛出 / Thrown when the value violates the API v2 1..2048 character bound.
 */
export function asUiResumeTemplateCursor(value: string): UiResumeTemplateCursor {
  if (value.length < 1 || [...value].length > 2048) {
    throw new TypeError('A Resume Template cursor must contain between 1 and 2048 characters.')
  }
  return value as UiResumeTemplateCursor
}

/**
 * @brief 构造受 API v2 上限约束的 Template 目录页大小 / Construct a Template-catalog page size constrained by API v2.
 * @param value 候选页大小 / Candidate page size.
 * @return 1 至 200 之间的名义页大小 / Nominal page size between 1 and 200.
 * @throws {RangeError} 当值不是合法整数时抛出 / Thrown when the value is not a valid integer.
 */
export function asUiResumeTemplatePageLimit(value: number): UiResumeTemplatePageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `Resume Template page limit must be an integer from 1 to ${UI_RESUME_TEMPLATE_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiResumeTemplatePageLimit
}

/** @brief 读取一页全局公开 Template 的输入 / Input for reading one page of global public Templates. */
export interface UiResumeTemplatePageRead {
  /** @brief 首页为 null，后续页使用上页返回的 cursor / Null for the first page; later pages use the prior cursor. */
  readonly cursor: UiResumeTemplateCursor | null
  /** @brief 经契约约束的页大小 / Contract-constrained page size. */
  readonly limit: UiResumeTemplatePageLimit
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal: AbortSignal
}

/**
 * @brief 全局公开 Template 的 cursor 页 / Cursor page of global public Templates.
 * @note 判别联合排除 `hasMore` 与 `nextCursor` 的非法组合 / The discriminated union excludes illegal `hasMore` and `nextCursor` combinations.
 */
export type UiResumeTemplatePage =
  | {
      /** @brief 当前页 Template 清单 / Template manifests on the current page. */
      readonly items: readonly UiTemplateManifest[]
      /** @brief 仍有下一页 / Another page exists. */
      readonly hasMore: true
      /** @brief 下一页不透明 cursor / Opaque cursor for the next page. */
      readonly nextCursor: UiResumeTemplateCursor
    }
  | {
      /** @brief 当前页 Template 清单 / Template manifests on the current page. */
      readonly items: readonly UiTemplateManifest[]
      /** @brief 已到达末页 / The terminal page has been reached. */
      readonly hasMore: false
      /** @brief 末页没有下一页 cursor / A terminal page has no next cursor. */
      readonly nextCursor: null
    }

/**
 * @brief Template 对目标 Resume 内容语言的可选状态 / Selection state of a Template for the target Resume-content locale.
 * @note 不兼容项仍保留在目录中，使产品可以解释限制，而不是把真实能力静默隐藏 / Incompatible entries remain visible so the product can explain the constraint instead of silently hiding real capabilities.
 */
export type UiResumeCreationTemplateOption =
  | {
      /** @brief 当前 Template 可用于目标内容语言 / The Template can be used for the target content locale. */
      readonly kind: 'selectable'
      /** @brief 不可变 Template 清单 / Immutable Template manifest. */
      readonly template: UiTemplateManifest
    }
  | {
      /** @brief 当前 Template 不支持目标内容语言 / The Template does not support the target content locale. */
      readonly kind: 'unsupported-locale'
      /** @brief 不可变 Template 清单 / Immutable Template manifest. */
      readonly template: UiTemplateManifest
      /** @brief 被拒绝的目标内容语言 / Rejected target content locale. */
      readonly locale: UiContentLocale
    }

/**
 * @brief Resume 创建页的 Template 选项 cursor 页 / Cursor page of Template options for Resume creation.
 * @note 页边界与底层 TemplateList 完全一致 / Page boundaries exactly match the underlying TemplateList.
 */
export type UiResumeCreationTemplatePage =
  | {
      /** @brief 当前页创建选项 / Creation options on the current page. */
      readonly items: readonly UiResumeCreationTemplateOption[]
      /** @brief 仍有下一页 / Another page exists. */
      readonly hasMore: true
      /** @brief 下一页不透明 cursor / Opaque cursor for the next page. */
      readonly nextCursor: UiResumeTemplateCursor
    }
  | {
      /** @brief 当前页创建选项 / Creation options on the current page. */
      readonly items: readonly UiResumeCreationTemplateOption[]
      /** @brief 已到达末页 / The terminal page has been reached. */
      readonly hasMore: false
      /** @brief 末页没有下一页 cursor / A terminal page has no next cursor. */
      readonly nextCursor: null
    }

/** @brief Resume 创建页读取 Template 选项的输入 / Input for reading Template options on the Resume-creation page. */
export interface UiResumeCreationTemplatePageRead extends UiResumeTemplatePageRead {
  /** @brief 待创建 Resume 的内容语言 / Content locale of the Resume to be created. */
  readonly resumeLocale: UiContentLocale
}

/**
 * @brief 新 Resume 的内容来源 / Content source of a new Resume.
 * @note `new` 精确映射为省略 `clone_from_resume_id`；`clone` 映射为非 null ID / `new` maps exactly to omitting `clone_from_resume_id`; `clone` maps to a non-null ID.
 */
export type UiResumeCreationSource =
  | {
      /** @brief 创建不基于既有 Resume 的新文档 / Create a new document without an existing Resume source. */
      readonly kind: 'new'
    }
  | {
      /** @brief 从同一 Workspace 内的 Resume 克隆 / Clone from a Resume in the same Workspace. */
      readonly kind: 'clone'
      /** @brief 待克隆 Resume 的不透明 ID / Opaque ID of the Resume to clone. */
      readonly resumeId: UiResumeId
    }

/** @brief 从不可变 Template 创建 Resume 的命令 / Command for creating a Resume from an immutable Template. */
export interface UiCreateResumeFromTemplateCommand {
  /**
   * @brief 一次创建意图内保持稳定的命令 ID / Command ID stable within one creation intent.
   * @note Transport 必须将其原样映射为 `Idempotency-Key`；结果未知后的确认重试必须复用它 / Transport must map it verbatim to `Idempotency-Key`; confirmation retries after an unknown outcome must reuse it.
   */
  readonly creationAttemptId: UiCommandId
  /** @brief 授权路径所属的显式 Workspace / Explicit Workspace owning the authorization path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 新 Resume 标题 / Title of the new Resume. */
  readonly title: string
  /** @brief 新 Resume 内容语言 / Content locale of the new Resume. */
  readonly locale: UiContentLocale
  /** @brief 用户选择的不可变 Template 版本 / Immutable Template version selected by the user. */
  readonly template: UiTemplateReference
  /** @brief 新 Resume 的内容来源 / Content source of the new Resume. */
  readonly source: UiResumeCreationSource
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal: AbortSignal
}

/** @brief 创建用例确认的新 Resume 资源事实 / New-Resume resource facts confirmed by the creation use case. */
export interface UiCreatedResumeResource {
  /** @brief 新 Resume 身份 / New Resume identity. */
  readonly id: UiResumeId
  /** @brief 授权路径所属 Workspace / Workspace owning the authorization path. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 创建后的初始领域 revision / Initial domain revision after creation. */
  readonly revision: number
  /** @brief 服务端确认的标题 / Server-confirmed title. */
  readonly title: string
  /** @brief 服务端确认的内容语言 / Server-confirmed content locale. */
  readonly locale: UiContentLocale
  /** @brief 服务端确认的不可变 Template 引用 / Server-confirmed immutable Template reference. */
  readonly template: UiTemplateReference
  /** @brief 资源创建时刻 / Resource creation timestamp. */
  readonly createdAt: string
  /** @brief 资源最近更新时间 / Resource update timestamp. */
  readonly updatedAt: string
}

/**
 * @brief 已创建 Resume 的用例结果 / Use-case result for a created Resume.
 * @note 完整 SIR 必须由无损 Resume authority 表达；创建页只依赖这里的窄资源投影 / The complete SIR must use a lossless Resume authority; the creation page depends only on this narrow resource projection.
 */
export interface UiCreatedResume {
  /** @brief 服务端确认的新资源事实 / New-resource facts confirmed by the service. */
  readonly resource: UiCreatedResumeResource
  /**
   * @brief 与该表示原子配对的强 ETag / Strong ETag atomically paired with this representation.
   * @note 后续修改必须将其映射为 `If-Match`，不能从 revision 猜测 / Later mutations must map it to `If-Match`; it must never be inferred from revision.
   */
  readonly concurrencyToken: UiConcurrencyToken
}
