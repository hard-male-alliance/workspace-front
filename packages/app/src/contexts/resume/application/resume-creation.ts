/** @file API v2 Template 到 Resume 创建用例 / API v2 Template-to-Resume creation use case. */

import type {
  UiCreateResumeFromTemplateCommand,
  UiCreatedResume,
  UiResumeCreationTemplatePage,
  UiResumeCreationTemplatePageRead,
  UiResumeTemplatePage,
  UiResumeTemplatePageRead
} from '../domain/creation'
import type { UiTemplateManifest, UiTemplateReference } from '../domain/models'
import { asUiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type { UiContentLocale } from '../../../shared-kernel/locale'

/** @brief API v2 Idempotency-Key 的完整语法 / Complete API v2 Idempotency-Key syntax. */
const CREATION_ATTEMPT_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/u

/** @brief API v2 Locale 的语法 / API v2 Locale syntax. */
const CONTENT_LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** @brief Resume 创建失败的稳定本地模型 / Stable local failure model for Resume creation. */
export type ResumeCreationFailure =
  | {
      /** @brief 创建命令字段不满足冻结契约 / A creation-command field violates the frozen contract. */
      readonly kind: 'invalid-input'
      /** @brief 无效字段 / Invalid field. */
      readonly field: 'creation-attempt-id' | 'title' | 'locale'
    }
  | {
      /** @brief 所选 Template 不支持目标 Resume 内容语言 / The selected Template does not support the target Resume-content locale. */
      readonly kind: 'unsupported-template-locale'
      /** @brief 被拒绝的内容语言 / Rejected content locale. */
      readonly locale: UiContentLocale
      /** @brief 被拒绝的不可变 Template 引用 / Rejected immutable Template reference. */
      readonly template: UiTemplateReference
    }
  | {
      /** @brief Template 端口违反精确版本读取承诺 / The Template port violated its exact-version read promise. */
      readonly kind: 'invalid-template-result'
    }
  | {
      /** @brief Resume 创建端口返回了越过命令边界的表示 / The Resume-creation port returned a representation outside the command boundary. */
      readonly kind: 'invalid-creation-result'
      /** @brief 与命令不一致的权威字段 / Authoritative field inconsistent with the command. */
      readonly field:
        'identity' | 'workspace' | 'title' | 'locale' | 'template' | 'concurrency-token'
    }

/**
 * @brief Resume 创建用例的安全本地错误 / Safe local error for the Resume-creation use case.
 * @note 网络与 RFC 9457 拒绝仍由 adapter 错误表达；本类只表示本地输入、产品策略或端口不变量 / Network and RFC 9457 rejections remain adapter errors; this class only represents local input, product policy, or port invariants.
 */
export class ResumeCreationError extends Error {
  /** @brief 可由产品安全分支处理的失败事实 / Failure fact safe for product branching. */
  readonly failure: ResumeCreationFailure

  /**
   * @brief 构造不包含服务端文本的创建错误 / Construct a creation error without server-provided text.
   * @param failure 稳定失败事实 / Stable failure fact.
   */
  constructor(failure: ResumeCreationFailure) {
    super(`Resume creation failed local validation: ${failure.kind}.`)
    this.name = 'ResumeCreationError'
    this.failure = failure
  }
}

/** @brief 全局公开且不可变的 Resume Template 目录端口 / Port for the global public immutable Resume Template catalog. */
export interface ResumeTemplateCatalogPort {
  /**
   * @brief 读取一页已发布 Template / Read one page of published Templates.
   * @param input cursor、页大小与取消信号 / Cursor, page size, and cancellation signal.
   * @return 保留 TemplateList cursor 关系的目录页 / Catalog page preserving the TemplateList cursor relation.
   */
  listTemplatePage(input: UiResumeTemplatePageRead): Promise<UiResumeTemplatePage>

  /**
   * @brief 读取精确的不可变 Template 版本 / Read an exact immutable Template version.
   * @param reference Template ID 与不可变版本 / Template ID and immutable version.
   * @param signal 调用方取消信号 / Caller cancellation signal.
   * @return 身份与请求精确一致的 Template / Template whose identity exactly matches the request.
   */
  getTemplate(reference: UiTemplateReference, signal: AbortSignal): Promise<UiTemplateManifest>
}

/** @brief Workspace-scoped Resume 创建端口 / Workspace-scoped Resume-creation port. */
export interface ResumeCreationPort {
  /**
   * @brief 提交已验证的 Resume 创建命令 / Submit a validated Resume-creation command.
   * @param command 显式 Workspace、不可变 Template 与稳定创建尝试 ID / Explicit Workspace, immutable Template, and stable creation-attempt ID.
   * @return 与强 ETag 原子配对的新 Resume / New Resume atomically paired with its strong ETag.
   */
  createResume(command: UiCreateResumeFromTemplateCommand): Promise<UiCreatedResume>
}

/**
 * @brief 判断 Template 是否精确支持目标 BCP 47 内容语言 / Determine whether a Template exactly supports a target BCP 47 content locale.
 * @param template 不可变 Template 清单 / Immutable Template manifest.
 * @param locale 目标 Resume 内容语言 / Target Resume-content locale.
 * @return 忽略 BCP 47 大小写差异后的精确匹配结果 / Exact match after ignoring BCP 47 casing differences.
 * @note 不擅自进行语言降级；例如 `zh` 不等同于 `zh-SG` / No language fallback is invented; for example, `zh` is not equivalent to `zh-SG`.
 */
export function supportsResumeLocale(
  template: UiTemplateManifest,
  locale: UiContentLocale
): boolean {
  /** @brief BCP 47 大小写无关比较键 / Case-insensitive BCP 47 comparison key. */
  const localeKey = locale.toLowerCase()
  return template.supportedLocales.some(
    (supportedLocale) => supportedLocale.toLowerCase() === localeKey
  )
}

/**
 * @brief 加载 Resume 创建页的一页 Template 选项 / Load one page of Template options for Resume creation.
 * @param catalog 全局 Template 目录端口 / Global Template-catalog port.
 * @param input 分页输入与目标 Resume 内容语言 / Pagination input and target Resume-content locale.
 * @return 保留所有真实 Template 并显式标出语言不兼容项的页面 / Page retaining every real Template and explicitly marking locale-incompatible entries.
 */
export async function loadResumeCreationTemplatePage(
  catalog: ResumeTemplateCatalogPort,
  input: UiResumeCreationTemplatePageRead
): Promise<UiResumeCreationTemplatePage> {
  input.signal.throwIfAborted()
  assertContentLocale(input.resumeLocale)
  /** @brief 未经创建策略投影的 Template 页 / Template page before creation-policy projection. */
  const page = await catalog.listTemplatePage({
    cursor: input.cursor,
    limit: input.limit,
    signal: input.signal
  })
  input.signal.throwIfAborted()
  /** @brief 保留目录顺序的创建选项 / Creation options preserving catalog order. */
  const items = page.items.map((template) =>
    supportsResumeLocale(template, input.resumeLocale)
      ? ({ kind: 'selectable', template } as const)
      : ({ kind: 'unsupported-locale', locale: input.resumeLocale, template } as const)
  )

  return page.hasMore
    ? { hasMore: true, items, nextCursor: page.nextCursor }
    : { hasMore: false, items, nextCursor: null }
}

/**
 * @brief 从精确不可变 Template 创建 Workspace Resume / Create a Workspace Resume from an exact immutable Template.
 * @param catalog 全局 Template 目录端口 / Global Template-catalog port.
 * @param creation Workspace-scoped Resume 创建端口 / Workspace-scoped Resume-creation port.
 * @param command 用户确认的一次创建命令 / One user-confirmed creation command.
 * @return 与强 ETag 原子配对的权威 Resume / Authoritative Resume atomically paired with its strong ETag.
 * @throws {ResumeCreationError} 输入、Template 能力或端口结果违反本地不变量时抛出 / Thrown when input, Template capability, or port output violates a local invariant.
 */
export async function createResumeFromTemplate(
  catalog: ResumeTemplateCatalogPort,
  creation: ResumeCreationPort,
  command: UiCreateResumeFromTemplateCommand
): Promise<UiCreatedResume> {
  command.signal.throwIfAborted()
  assertCreationCommand(command)

  /** @brief 为本次创建重新确认的精确不可变 Template / Exact immutable Template reconfirmed for this creation. */
  const template = await catalog.getTemplate(command.template, command.signal)
  command.signal.throwIfAborted()
  if (!sameTemplateIdentity(template, command.template)) {
    throw new ResumeCreationError({ kind: 'invalid-template-result' })
  }
  if (!supportsResumeLocale(template, command.locale)) {
    throw new ResumeCreationError({
      kind: 'unsupported-template-locale',
      locale: command.locale,
      template: command.template
    })
  }

  /** @brief 服务端确认的创建结果 / Creation result confirmed by the service. */
  const result = await creation.createResume(command)
  assertCreationResult(command, result)
  return result
}

/**
 * @brief 校验 Resume 创建命令的冻结输入边界 / Validate the frozen input boundary of a Resume-creation command.
 * @param command 待校验命令 / Command to validate.
 */
function assertCreationCommand(command: UiCreateResumeFromTemplateCommand): void {
  if (!CREATION_ATTEMPT_PATTERN.test(command.creationAttemptId)) {
    throw new ResumeCreationError({ kind: 'invalid-input', field: 'creation-attempt-id' })
  }
  /** @brief JSON Schema maxLength 所使用的 Unicode code-point 数 / Unicode code-point count used by JSON Schema maxLength. */
  const titleLength = [...command.title].length
  if (titleLength < 1 || titleLength > 300) {
    throw new ResumeCreationError({ kind: 'invalid-input', field: 'title' })
  }
  assertContentLocale(command.locale)
}

/**
 * @brief 校验 Resume 内容语言的冻结 Schema 边界 / Validate the frozen Schema boundary of a Resume-content locale.
 * @param locale 待校验 BCP 47 标签 / BCP 47 tag to validate.
 */
function assertContentLocale(locale: UiContentLocale): void {
  /** @brief 内容语言的 Unicode code-point 数 / Unicode code-point count of the content locale. */
  const localeLength = [...locale].length
  if (localeLength < 2 || localeLength > 35 || !CONTENT_LOCALE_PATTERN.test(locale)) {
    throw new ResumeCreationError({ kind: 'invalid-input', field: 'locale' })
  }
}

/**
 * @brief 比较 TemplateManifest 与 TemplateRef 的不可变身份 / Compare immutable identity between TemplateManifest and TemplateRef.
 * @param manifest Template 清单 / Template manifest.
 * @param reference Template 引用 / Template reference.
 * @return ID 与版本都相同时为 true / True when both ID and version match.
 */
function sameTemplateIdentity(
  manifest: UiTemplateManifest | UiTemplateReference,
  reference: UiTemplateReference
): boolean {
  if ('templateId' in manifest) {
    return (
      manifest.templateId === reference.templateId &&
      manifest.templateVersion === reference.templateVersion
    )
  }
  return manifest.id === reference.templateId && manifest.version === reference.templateVersion
}

/**
 * @brief 校验创建结果仍位于命令授权与资源边界内 / Validate that a creation result remains within the command's authority and resource boundary.
 * @param command 已提交命令 / Submitted command.
 * @param result 创建端口结果 / Creation-port result.
 */
function assertCreationResult(
  command: UiCreateResumeFromTemplateCommand,
  result: UiCreatedResume
): void {
  try {
    asUiConcurrencyToken(result.concurrencyToken)
  } catch {
    throw new ResumeCreationError({
      field: 'concurrency-token',
      kind: 'invalid-creation-result'
    })
  }
  if (command.source.kind === 'clone' && result.resume.id === command.source.resumeId) {
    throw new ResumeCreationError({ kind: 'invalid-creation-result', field: 'identity' })
  }
  if (result.resume.workspaceId !== command.workspaceId) {
    throw new ResumeCreationError({ kind: 'invalid-creation-result', field: 'workspace' })
  }
  if (result.resume.title !== command.title) {
    throw new ResumeCreationError({ kind: 'invalid-creation-result', field: 'title' })
  }
  if (result.resume.locale.toLowerCase() !== command.locale.toLowerCase()) {
    throw new ResumeCreationError({ kind: 'invalid-creation-result', field: 'locale' })
  }
  if (!sameTemplateIdentity(result.resume.template, command.template)) {
    throw new ResumeCreationError({ kind: 'invalid-creation-result', field: 'template' })
  }
}
