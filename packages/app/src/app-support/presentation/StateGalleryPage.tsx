import { CircleAlert, FilePlus2, LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, LoadingState } from '../../ui'

/**
 * @brief 空、加载、错误状态展示页 / Empty, loading, and error state gallery.
 * @return 可供验收的三类共享状态 / Three shared states available for acceptance.
 */
export function StateGalleryPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 错误状态是否已重新尝试 / Whether the error state was retried. */
  const [hasRetried, setRetried] = useState(false)

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">{t('states.eyebrow', { defaultValue: '共享 UI 状态' })}</p>
          <h1 className="aw-page-title">{t('states.title', { defaultValue: '空、加载与错误' })}</h1>
          <p className="aw-page-description">
            {t('states.description', {
              defaultValue:
                '每个数据页都可经相同的 mock gateway 进入这些状态；这里保留为可直接验收的视觉样例。'
            })}
          </p>
        </div>
        <span className="aw-status aw-status--active">
          {t('states.internalOnly', { defaultValue: '仅供开发与验收' })}
        </span>
      </div>
      <div className="aw-state-grid">
        <section className="aw-card" aria-labelledby="state-empty-title">
          <EmptyState
            action={
              <button className="aw-primary-button" type="button">
                <FilePlus2 aria-hidden="true" size={15} />
                {t('states.emptyAction', { defaultValue: '添加第一份内容' })}
              </button>
            }
            description={t('states.emptyBody', {
              defaultValue: '添加内容后，AI 才能在明确授权的范围内提供帮助。'
            })}
            title={t('states.emptyTitle', { defaultValue: '从一个小动作开始' })}
            titleId="state-empty-title"
            visual={<FilePlus2 aria-hidden="true" size={22} />}
          />
        </section>
        <section className="aw-card" aria-labelledby="state-loading-title">
          <div className="aw-loading-state aw-loading-state--page">
            <LoaderCircle aria-hidden="true" className="ui-spinner" size={22} />
            <h2 className="aw-card-title" id="state-loading-title">
              {t('states.loadingTitle', { defaultValue: '正在准备你的工作区' })}
            </h2>
            <p className="aw-card-description">
              {t('states.loadingBody', { defaultValue: '请稍候，内容很快就会出现。' })}
            </p>
            <LoadingState label={t('common.loading', { defaultValue: '正在加载…' })} />
            <div className="aw-skeleton" />
            <div className="aw-skeleton aw-skeleton--medium" />
            <div className="aw-skeleton aw-skeleton--short" />
          </div>
        </section>
        <section className="aw-card" aria-labelledby="state-error-title">
          <ErrorState
            action={
              <button
                className="aw-primary-button"
                onClick={(): void => setRetried(true)}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} />
                {hasRetried
                  ? t('states.retried', { defaultValue: '已重试（Mock）' })
                  : t('common.retry', { defaultValue: '重试' })}
              </button>
            }
            description={t('states.errorBody', {
              defaultValue: '演示数据暂时不可用。请重试，或返回工作台。'
            })}
            title={t('states.errorTitle', { defaultValue: '这一步没有顺利完成' })}
            titleId="state-error-title"
          />
          <p className="aw-setting-help" style={{ margin: '-8px 23px 23px' }}>
            <CircleAlert
              aria-hidden="true"
              size={13}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('states.errorHint', {
              defaultValue: '真实环境会显示 contract 的 ProblemDetails，而非 Mock 错误。'
            })}
          </p>
        </section>
      </div>
    </div>
  )
}
