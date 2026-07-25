/** @file 渐进式 Resume Template 目录选择器 / Progressive Resume Template catalog picker. */

import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getTemplateIdentity } from '../../application/template-catalog'
import type { UiTemplateManifest } from '../../domain/models'
import { TemplatePreview } from './TemplatePreview'

/** @brief 纯展示的渐进模板目录参数 / Pure presentation properties for the progressive Template catalog. */
export interface TemplateCatalogPickerProps {
  /** @brief 目录或写入恢复期间是否锁定选择 / Whether selection is locked during catalog or write recovery. */
  readonly disabled: boolean
  /** @brief 保留本地字段草稿的复合模板身份 / Composite Template identities retaining local field drafts. */
  readonly draftIdentities: ReadonlySet<string>
  /** @brief 目录读取是否失败 / Whether catalog reading failed. */
  readonly hasError: boolean
  /** @brief 目录是否仍有后续页 / Whether the catalog has a subsequent page. */
  readonly hasMore: boolean
  /** @brief 是否正在读取一页 / Whether one page is being read. */
  readonly isLoading: boolean
  /** @brief 首页是否已经请求，用于避免把自动首页暴露为手动动作 / Whether the first page was requested, avoiding exposure of auto-first-page as a manual action. */
  readonly isFirstPageLoaded: boolean
  /** @brief 请求下一页的事件 / Event requesting the next page. */
  readonly onLoadNext: () => void
  /** @brief 重试当前目录页的事件 / Event retrying the current catalog page. */
  readonly onRetry: () => void
  /** @brief 显式选择不可变模板版本的事件 / Event explicitly selecting an immutable Template version. */
  readonly onSelect: (template: UiTemplateManifest) => void
  /** @brief 当前用户选中的复合身份 / Composite identity currently selected by the user. */
  readonly selectedIdentity: string
  /** @brief pinned-first 且按复合身份去重的模板 / Pinned-first Templates deduplicated by composite identity. */
  readonly templates: readonly UiTemplateManifest[]
}

/**
 * @brief 渲染 pinned-first、手动逐页前进的原生 radio 目录 / Render a pinned-first native-radio catalog advanced manually page by page.
 * @param props 目录快照、状态与用户事件 / Catalog snapshot, statuses, and user events.
 * @return 不发起读写的模板目录 / Template catalog that initiates no reads or writes itself.
 */
export function TemplateCatalogPicker({
  disabled,
  draftIdentities,
  hasError,
  hasMore,
  isFirstPageLoaded,
  isLoading,
  onLoadNext,
  onRetry,
  onSelect,
  selectedIdentity,
  templates
}: TemplateCatalogPickerProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="template-choice-title">
      <div className="aw-template-section-heading">
        <div>
          <h2 className="aw-card-title" id="template-choice-title">
            {t('template.otherTemplates', { defaultValue: '模板目录' })}
          </h2>
          <p className="aw-card-description">
            {t('template.choiceDescription', {
              defaultValue: '选择一个精确且不可变的模板版本；只有“应用模板与样式”会写入。'
            })}
          </p>
        </div>
        <span aria-live="polite" className="aw-status aw-status--active">
          {isLoading
            ? t('template.catalogLoadingProgressively', { defaultValue: '正在加载更多模板…' })
            : hasMore
              ? t('template.catalogHasMore', {
                  defaultValue: '已加载 {{count}} 个模板',
                  count: templates.length
                })
              : t('template.catalogComplete', { defaultValue: '目录已完整加载' })}
        </span>
      </div>
      <fieldset className="aw-template-list" disabled={disabled}>
        <legend className="aw-sr-only">
          {t('template.templateChoiceLegend', { defaultValue: '选择目标模板版本' })}
        </legend>
        {templates.map((template) => {
          /** @brief 当前 manifest 的不可变复合身份 / Immutable composite identity of this manifest. */
          const identity = getTemplateIdentity(template)
          /** @brief 当前 card 是否为用户选择的目标 / Whether this card is the user-selected target. */
          const selected = identity === selectedIdentity
          /** @brief radio 的可访问标签 / Accessible label for the radio. */
          const cardLabel = `${template.name} v${template.version}`
          return (
            <label
              aria-label={cardLabel}
              className={`aw-template-card ${selected ? 'aw-template-card--selected' : ''}`}
              key={identity}
            >
              <input
                aria-label={cardLabel}
                checked={selected}
                name="resume-template-version"
                onChange={(): void => onSelect(template)}
                type="radio"
                value={identity}
              />
              <TemplatePreview decorative template={template} />
              <span className="aw-template-card-copy">
                <span className="aw-template-card-title">
                  <strong>{template.name}</strong>
                  <span className="aw-chip">v{template.version}</span>
                </span>
                <span className="aw-card-description">
                  {template.description ??
                    t('template.noDescription', { defaultValue: '暂无说明' })}
                </span>
                <span className="aw-chip-row">
                  <span className="aw-chip">
                    {t('template.columns', {
                      count: template.capabilities.maxColumns,
                      defaultValue: '{{count}} 列'
                    })}
                  </span>
                  {selected ? (
                    <span className="aw-status aw-status--ready">
                      <Check aria-hidden="true" size={11} />
                      {t('template.selected', { defaultValue: '已选择' })}
                    </span>
                  ) : null}
                  {draftIdentities.has(identity) ? (
                    <span className="aw-status aw-status--active">
                      {t('template.draftRetained', { defaultValue: '有本地草稿' })}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {hasMore && isFirstPageLoaded && !hasError ? (
        <button
          className="aw-quiet-button aw-template-load-more"
          disabled={isLoading}
          onClick={onLoadNext}
          type="button"
        >
          {isLoading
            ? t('template.catalogLoadingProgressively', {
                defaultValue: '正在加载更多模板…'
              })
            : t('template.loadMore', { defaultValue: '加载更多模板' })}
        </button>
      ) : null}
      {hasError ? (
        <div className="aw-inline-error" role="status">
          <span>
            {t('template.catalogErrorNonBlocking', {
              defaultValue: '模板目录暂时无法继续加载；已选择的模板仍可编辑和应用。'
            })}
          </span>
          <button className="aw-quiet-button" onClick={onRetry} type="button">
            {t('common.retry', { defaultValue: '重试' })}
          </button>
        </div>
      ) : null}
    </section>
  )
}
