/** @file Resume 创建页的 Template 选项集合 / Template-option collection for Resume creation. */

import { FileText, ImageOff } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ResourceFailureMessage } from '../../../../app/ResourceErrorState'
import type { UiContentLocale } from '../../../../shared-kernel/locale'
import { EmptyState, LoadingState } from '../../../../ui'
import {
  loadResumeCreationTemplatePage,
  type ResumeTemplateCatalogPort
} from '../../application/resume-creation'
import type {
  UiResumeCreationTemplateOption,
  UiResumeCreationTemplatePage,
  UiResumeTemplateCursor
} from '../../domain/creation'
import type { UiTemplateManifest, UiTemplateReference } from '../../domain/models'
import {
  formatContentLocale,
  getTemplateKey,
  mergeTemplateOptions,
  RESUME_CREATION_TEMPLATE_PAGE_LIMIT
} from './creation-model'

/** @brief Template 后续页的独立状态 / Independent state for Template continuation pages. */
type TemplateContinuationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly cursor: UiResumeTemplateCursor }
  | {
      readonly status: 'error'
      readonly cursor: UiResumeTemplateCursor
      readonly error: unknown
      readonly retryable: boolean
    }

/** @brief Template 选项集合属性 / Properties for a collection of Template options. */
interface TemplateOptionCollectionProps {
  /** @brief 当前应用界面语言 / Current application-interface locale. */
  readonly applicationLocale: string
  /** @brief 权威首页 / Authoritative first page. */
  readonly initialPage: UiResumeCreationTemplatePage
  /** @brief 创建提交期间是否锁定目录交互 / Whether catalog interaction is locked during creation submission. */
  readonly interactionDisabled: boolean
  /** @brief 目标 Resume 内容语言 / Target Resume-content locale. */
  readonly resumeLocale: UiContentLocale
  /** @brief 当前选中的不可变 Template 引用 / Currently selected immutable Template reference. */
  readonly selectedTemplate: UiTemplateReference | null
  /** @brief Template 被用户选择时的回调 / Callback when a Template is selected by the user. */
  readonly onSelect: (template: UiTemplateManifest) => void
  /** @brief 全局不可变 Template 目录端口 / Global immutable Template-catalog port. */
  readonly catalog: ResumeTemplateCatalogPort
}

/** @brief 单个 Template radio 卡片属性 / Properties for one Template radio card. */
interface TemplateOptionCardProps {
  /** @brief 当前应用界面语言 / Current application-interface locale. */
  readonly applicationLocale: string
  /** @brief 是否因外层命令正在提交而锁定 / Whether the outer command currently locks interaction. */
  readonly interactionDisabled: boolean
  /** @brief 当前创建选项 / Current creation option. */
  readonly option: UiResumeCreationTemplateOption
  /** @brief 该不可变 Template 是否被选择 / Whether this immutable Template is selected. */
  readonly selected: boolean
  /** @brief 用户选择此 Template / Select this Template for the user. */
  readonly onSelect: (template: UiTemplateManifest) => void
}

/**
 * @brief Template cursor 不再前进时的安全本地错误 / Safe local error for a non-advancing Template cursor.
 * @note 该错误不包含 cursor 内容，避免把服务端签发值写入诊断或界面 / This error omits the cursor value so server-issued data never reaches diagnostics or UI.
 */
class ResumeTemplateCursorLoopError extends Error {
  override readonly name = 'ResumeTemplateCursorLoopError'

  /** @brief 构造不携带服务端值的分页错误 / Construct a pagination error without server values. */
  constructor() {
    super('The Resume Template cursor did not advance.')
  }
}

/**
 * @brief 呈现真实预览图或明确的无图状态 / Present a real preview image or an explicit unavailable-image state.
 * @param props Template 与替代文本 / Template and alternative text.
 * @return 不泄漏页面 referrer 的图片或无图 fallback / Image that leaks no page referrer, or a no-image fallback.
 */
function TemplatePreview({
  template
}: {
  readonly template: UiTemplateManifest
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前 preview URL 是否已由浏览器报告加载失败 / Whether the browser reported that the current preview URL failed to load. */
  const [failed, setFailed] = useState(false)

  if (template.previewUrl === null || failed) {
    return (
      <span className="aw-resume-create-template-preview aw-resume-create-template-preview--empty">
        <ImageOff aria-hidden="true" size={22} strokeWidth={1.6} />
        <span>{t('resume.creation.previewUnavailable', { defaultValue: '暂无模板预览' })}</span>
      </span>
    )
  }

  return (
    <span className="aw-resume-create-template-preview">
      <img
        alt={t('resume.creation.previewAlt', {
          defaultValue: '{{name}} 模板预览',
          name: template.name
        })}
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={template.previewUrl}
      />
    </span>
  )
}

/**
 * @brief 呈现原生 radio 语义的单个 Template 选项 / Present one Template option with native radio semantics.
 * @param props Template 选项、选择状态与回调 / Template option, selection state, and callback.
 * @return 可选或带明确 Locale 限制说明的 Template 卡片 / Selectable Template card or one with an explicit Locale limitation.
 */
function TemplateOptionCard({
  applicationLocale,
  interactionDisabled,
  onSelect,
  option,
  selected
}: TemplateOptionCardProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前 radio 的稳定 DOM ID / Stable DOM ID for this radio. */
  const inputId = useId()
  /** @brief 当前 radio 说明文字的稳定 DOM ID / Stable DOM ID for this radio description. */
  const descriptionId = `${inputId}-description`
  /** @brief 当前选项是否不能用于目标 Locale / Whether this option is unavailable for the target Locale. */
  const unsupported = option.kind === 'unsupported-locale'
  /** @brief radio 是否因能力或提交状态不可交互 / Whether the radio is unavailable due to capability or submission state. */
  const disabled = unsupported || interactionDisabled

  return (
    <li>
      <label
        aria-disabled={disabled ? 'true' : undefined}
        className={`aw-resume-create-template-card${selected ? ' aw-resume-create-template-card--selected' : ''}${unsupported ? ' aw-resume-create-template-card--unsupported' : ''}${interactionDisabled ? ' aw-resume-create-template-card--locked' : ''}`}
        htmlFor={inputId}
      >
        <input
          aria-describedby={descriptionId}
          checked={selected}
          disabled={disabled}
          id={inputId}
          name="resume-template"
          onChange={() => onSelect(option.template)}
          type="radio"
          value={getTemplateKey(option.template)}
        />
        <TemplatePreview template={option.template} />
        <span className="aw-resume-create-template-copy">
          <span className="aw-resume-create-template-heading">
            <strong>{option.template.name}</strong>
            <span>v{option.template.version}</span>
          </span>
          <span className="aw-resume-create-template-description" id={descriptionId}>
            {unsupported
              ? t('resume.creation.unsupportedLocale', {
                  defaultValue: '此模板不支持 {{locale}}，仍保留展示供你比较。',
                  locale: formatContentLocale(option.locale, applicationLocale)
                })
              : (option.template.description ??
                t('resume.creation.noTemplateDescription', {
                  defaultValue: '此模板暂未提供说明。'
                }))}
          </span>
          <span className="aw-resume-create-template-locales">
            {t('resume.creation.supportedLocales', {
              defaultValue: '支持：{{locales}}',
              locales: option.template.supportedLocales
                .map((locale) => formatContentLocale(locale, applicationLocale))
                .join('、')
            })}
          </span>
        </span>
      </label>
    </li>
  )
}

/**
 * @brief 呈现 Template 目录并安全追加 cursor 页 / Present the Template catalog and safely append cursor pages.
 * @param props 首页、Locale、选择状态与目录端口 / First page, Locale, selection state, and catalog port.
 * @return 原生 radio 选项、独立后续页状态与分页动作 / Native radio options, independent continuation state, and pagination action.
 */
export function TemplateOptionCollection({
  applicationLocale,
  catalog,
  initialPage,
  interactionDisabled,
  onSelect,
  resumeLocale,
  selectedTemplate
}: TemplateOptionCollectionProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 已按不可变身份去重的选项 / Options deduplicated by immutable identity. */
  const [options, setOptions] = useState<readonly UiResumeCreationTemplateOption[]>(
    initialPage.items
  )
  /** @brief 最近接受的 Page 关系 / Most recently accepted Page relation. */
  const [page, setPage] = useState<UiResumeCreationTemplatePage>(initialPage)
  /** @brief 首页错误之外的后续页状态 / Continuation state independent from first-page failures. */
  const [continuation, setContinuation] = useState<TemplateContinuationState>({ status: 'idle' })
  /** @brief 已被成功消费的 cursor 集合 / Cursors successfully consumed by this collection. */
  const consumedCursors = useRef(new Set<UiResumeTemplateCursor>())
  /** @brief 当前后续页请求控制器 / Current continuation-page request controller. */
  const continuationController = useRef<AbortController | null>(null)
  /** @brief 最近追加数量，供辅助技术播报 / Most recently appended count for assistive announcements. */
  const [appendedCount, setAppendedCount] = useState(0)

  useEffect(
    (): (() => void) => () => {
      continuationController.current?.abort(
        new DOMException('Resume Template catalog identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 加载当前 Page 声明的下一页 / Load the next page declared by the current Page. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (
      !page.hasMore ||
      interactionDisabled ||
      continuation.status === 'loading' ||
      continuationController.current !== null
    ) {
      return
    }

    /** @brief 与本次请求严格绑定的 cursor / Cursor strictly bound to this request. */
    const cursor = page.nextCursor
    if (consumedCursors.current.has(cursor)) {
      setContinuation({
        cursor,
        error: new ResumeTemplateCursorLoopError(),
        retryable: false,
        status: 'error'
      })
      return
    }

    /** @brief 本次后续页专属取消控制器 / Cancellation controller dedicated to this continuation page. */
    const controller = new AbortController()
    continuationController.current = controller
    setContinuation({ cursor, status: 'loading' })

    try {
      /** @brief 服务端返回的下一页创建选项 / Next creation-option page returned by the service. */
      const nextPage = await loadResumeCreationTemplatePage(catalog, {
        cursor,
        limit: RESUME_CREATION_TEMPLATE_PAGE_LIMIT,
        resumeLocale,
        signal: controller.signal
      })
      controller.signal.throwIfAborted()
      consumedCursors.current.add(cursor)

      /** @brief 追加后的不可变身份去重选项 / Immutable-identity-deduplicated options after append. */
      const merged = mergeTemplateOptions(options, nextPage.items)
      setAppendedCount(Math.max(0, merged.length - options.length))
      setOptions(merged)
      setPage(nextPage)

      if (nextPage.hasMore && consumedCursors.current.has(nextPage.nextCursor)) {
        setContinuation({
          cursor: nextPage.nextCursor,
          error: new ResumeTemplateCursorLoopError(),
          retryable: false,
          status: 'error'
        })
        return
      }
      setContinuation({ status: 'idle' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setContinuation({ cursor, error, retryable: true, status: 'error' })
      }
    } finally {
      if (continuationController.current === controller) continuationController.current = null
    }
  }, [catalog, continuation.status, interactionDisabled, options, page, resumeLocale])

  if (options.length === 0 && !page.hasMore) {
    return (
      <EmptyState
        className="aw-resume-create-template-empty"
        compact
        description={t('resume.creation.emptyTemplatesDescription', {
          defaultValue: '当前目录没有已发布模板，因此暂时无法创建简历。'
        })}
        title={t('resume.creation.emptyTemplatesTitle', { defaultValue: '没有可用模板' })}
        visual={<FileText aria-hidden="true" size={22} />}
      />
    )
  }

  return (
    <div className="aw-resume-create-template-results">
      <ul className="aw-resume-create-template-list" id="resume-create-template-options">
        {options.map((option) => (
          <TemplateOptionCard
            applicationLocale={applicationLocale}
            interactionDisabled={interactionDisabled}
            key={getTemplateKey(option.template)}
            onSelect={onSelect}
            option={option}
            selected={
              selectedTemplate !== null &&
              getTemplateKey(selectedTemplate) === getTemplateKey(option.template)
            }
          />
        ))}
      </ul>

      <p aria-live="polite" className="aw-sr-only">
        {appendedCount > 0
          ? t('resume.creation.templatesAppended', {
              count: appendedCount,
              defaultValue: '已加载 {{count}} 个模板'
            })
          : ''}
      </p>

      {continuation.status === 'error' ? (
        <div className="aw-resume-create-inline-error" role="alert">
          <div>
            <strong>
              {continuation.retryable
                ? t('resume.creation.loadMoreError', { defaultValue: '无法加载更多模板' })
                : t('resume.creation.cursorLoopError', {
                    defaultValue: '模板目录分页未能继续'
                  })}
            </strong>
            <p>
              {continuation.retryable ? (
                <ResourceFailureMessage error={continuation.error} />
              ) : (
                t('resume.creation.cursorLoopDescription', {
                  defaultValue: '服务返回了重复分页位置。为避免循环请求，已停止继续加载。'
                })
              )}
            </p>
          </div>
          {continuation.retryable ? (
            <button className="aw-quiet-button" onClick={() => void loadMore()} type="button">
              {t('common.retry', { defaultValue: '重试' })}
            </button>
          ) : null}
        </div>
      ) : null}

      {page.hasMore && !(continuation.status === 'error' && !continuation.retryable) ? (
        <div className="aw-resume-create-load-more">
          <button
            aria-controls="resume-create-template-options"
            className="aw-quiet-button"
            disabled={continuation.status === 'loading' || interactionDisabled}
            onClick={() => void loadMore()}
            type="button"
          >
            {continuation.status === 'loading' ? (
              <LoadingState
                label={t('resume.creation.loadingMore', {
                  defaultValue: '正在加载更多模板…'
                })}
              />
            ) : (
              t('resume.creation.loadMore', { defaultValue: '加载更多模板' })
            )}
          </button>
        </div>
      ) : options.length > 0 && continuation.status !== 'error' ? (
        <p className="aw-resume-create-catalog-end">
          {t('resume.creation.catalogEnd', { defaultValue: '已显示全部已发布模板' })}
        </p>
      ) : null}
    </div>
  )
}
