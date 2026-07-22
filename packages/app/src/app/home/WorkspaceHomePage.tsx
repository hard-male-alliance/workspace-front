import { ArrowRight, FileText, GraduationCap } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useWorkspaceHomeQuery } from '../AppData'
import type { WorkspaceHomeModel, WorkspaceRecentUpdate } from '../AppQueries'
import { ResourceErrorState } from '../ResourceErrorState'
import { LoadingState } from '../../ui'
import type { UiResumeSummary } from '../../published-language'

/**
 * @brief 格式化活动时间 / Format an activity timestamp.
 * @param timestamp ISO 时间戳 / ISO timestamp.
 * @param locale 界面语言 / UI locale.
 * @return 已本地化的短日期时间 / Localized short date-time text.
 */
function formatUpdateTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

/** @brief 本地化的资源更新文案 / Localized resource-update copy. */
interface RecentUpdateCopy {
  /** @brief 更新标题 / Update title. */
  readonly title: string
  /** @brief 更新说明 / Update description. */
  readonly description: string
}

/**
 * @brief 本地化资源更新投影 / Localize a resource-update projection.
 * @param update 资源更新投影 / Resource-update projection.
 * @param t 翻译函数 / Translation function.
 * @return 用户可读的更新文案 / User-readable update copy.
 */
function getUpdateCopy(update: WorkspaceRecentUpdate, t: TFunction): RecentUpdateCopy {
  return {
    description: t('workspace.home.resumeUpdateDescription', {
      defaultValue: '简历内容已同步至当前工作区。'
    }),
    title: t('workspace.home.resumeUpdateTitle', {
      defaultValue: '更新了 {{subject}}',
      subject: update.title
    })
  }
}

/**
 * @brief 工作区首页内容 / Workspace-home content.
 * @param props 首页数据 / Home-page data.
 * @return 以行动为中心的今日工作台 / Action-first daily workspace.
 */
function WorkspaceHomeContent({
  home,
  resumeSummary
}: {
  readonly home: WorkspaceHomeModel
  readonly resumeSummary: UiResumeSummary | null
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { i18n, t } = useTranslation()

  return (
    <div className="aw-page aw-workbench-page">
      <header className="aw-workbench-header">
        <div>
          <p className="aw-workbench-context">
            {t('workspace.home.context', { defaultValue: '个人求职准备 · 今日安排' })}
          </p>
          <h1 className="aw-page-title">
            {t('workspace.home.title', { defaultValue: '今日工作台' })}
          </h1>
          <p className="aw-page-description">
            {t('workspace.home.intro', {
              defaultValue: '先完成最重要的一步，再处理其他任务。'
            })}
          </p>
        </div>
        <div className="aw-workspace-authority-summary">
          <span className="aw-status aw-status--ready">{home.workspaceAccess.workspace.name}</span>
          <dl aria-label={t('workspace.access.title', { defaultValue: '工作区访问权限' })}>
            <div>
              <dt>{t('workspace.access.role', { defaultValue: '角色' })}</dt>
              <dd>
                {t(`workspace.access.roles.${home.workspaceAccess.role}`, {
                  defaultValue: home.workspaceAccess.role
                })}
              </dd>
            </div>
            <div>
              <dt>{t('workspace.access.plan', { defaultValue: '套餐' })}</dt>
              <dd>
                {t(`workspace.access.plans.${home.workspaceAccess.workspace.plan}`, {
                  defaultValue: home.workspaceAccess.workspace.plan
                })}
              </dd>
            </div>
            <div>
              <dt>{t('workspace.access.dataRegion', { defaultValue: '数据区域' })}</dt>
              <dd>
                {t(`workspace.access.dataRegions.${home.workspaceAccess.workspace.dataRegion}`, {
                  defaultValue: home.workspaceAccess.workspace.dataRegion
                })}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="aw-today-grid">
        <section aria-labelledby="workspace-focus-title" className="aw-focus-panel">
          <div className="aw-focus-copy">
            <h2 className="aw-focus-label" id="workspace-focus-title">
              {t('workspace.home.focusLabel', { defaultValue: '今日最重要的事' })}
            </h2>
            <h3>
              {resumeSummary?.title ??
                t('workspace.home.emptyResumeTitle', { defaultValue: '还没有可编辑的简历' })}
            </h3>
            <p>
              {resumeSummary === null
                ? t('workspace.home.emptyResumeDescription', {
                    defaultValue: '当前工作区还没有简历。创建功能开放前，你可以先查看其他内容。'
                  })
                : t('workspace.home.focusDescription', {
                    defaultValue: '从项目经历开始，把成果写得更具体，再进入面试练习。'
                  })}
            </p>
          </div>
          <div className="aw-focus-meta">
            {resumeSummary === null ? null : (
              <>
                <span>
                  <FileText aria-hidden="true" size={15} />
                  {resumeSummary.templateId} · {resumeSummary.templateVersion}
                </span>
                <Link className="aw-primary-button" to={`/resumes/${resumeSummary.id}/edit`}>
                  {t('workspace.home.continueEditing', { defaultValue: '继续编辑简历' })}
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="workspace-progress-title" className="aw-progress-panel">
          <div className="aw-section-heading">
            <div>
              <h2 id="workspace-progress-title">
                {t('workspace.home.progressTitle', { defaultValue: '本周进展' })}
              </h2>
              <p>
                {t('workspace.home.progressDescription', {
                  defaultValue: '仅汇总当前工作区已有数据。'
                })}
              </p>
            </div>
          </div>
          <dl className="aw-progress-list">
            <div>
              <dt>{t('workspace.home.resumeCount', { defaultValue: '简历' })}</dt>
              <dd>
                {home.resumeCount.value}
                {home.resumeCount.certainty === 'lower-bound' ? '+' : null}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="aw-workbench-grid">
        <section aria-labelledby="workspace-continue-title" className="aw-workbench-section">
          <div className="aw-section-heading">
            <div>
              <h2 id="workspace-continue-title">
                {t('workspace.home.continueTitle', { defaultValue: '继续处理' })}
              </h2>
              <p>
                {t('workspace.home.continueDescription', {
                  defaultValue: '从上次停下的位置继续，不需要重新寻找入口。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-action-list">
            {resumeSummary === null ? (
              <div className="aw-action-row">
                <span className="aw-action-icon">
                  <FileText aria-hidden="true" size={18} />
                </span>
                <span className="aw-action-copy">
                  <strong>
                    {t('workspace.home.emptyResumeTitle', { defaultValue: '还没有可编辑的简历' })}
                  </strong>
                  <small>
                    {t('workspace.home.emptyResumeAction', {
                      defaultValue: '当前工作区暂无可继续编辑的简历'
                    })}
                  </small>
                </span>
              </div>
            ) : (
              <Link className="aw-action-row" to={`/resumes/${resumeSummary.id}/edit`}>
                <span className="aw-action-icon">
                  <FileText aria-hidden="true" size={18} />
                </span>
                <span className="aw-action-copy">
                  <strong>{resumeSummary.title}</strong>
                  <small>
                    {t('workspace.home.resumeActionMeta', {
                      defaultValue: '继续编辑内容与生成 PDF 预览'
                    })}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="workspace-activity-title" className="aw-workbench-section">
          <div className="aw-section-heading">
            <div>
              <h2 id="workspace-activity-title">
                {t('workspace.home.updatesTitle', { defaultValue: '最近更新' })}
              </h2>
              <p>
                {t('workspace.home.updatesDescription', {
                  defaultValue: '根据当前工作区资源的更新时间汇总。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-timeline">
            {home.recentUpdates.length === 0 ? (
              <p className="aw-page-description">
                {t('workspace.home.emptyUpdates', {
                  defaultValue: '当前工作区还没有可显示的资源更新。'
                })}
              </p>
            ) : (
              home.recentUpdates.map((update) => {
                /** @brief 当前更新的本地化文案 / Localized copy for the current update. */
                const copy = getUpdateCopy(update, t)
                return (
                  <div className="aw-timeline-item" key={update.id}>
                    <span aria-hidden="true" className="aw-timeline-dot" />
                    <div className="aw-activity-copy">
                      <strong>{copy.title}</strong>
                      <span>{copy.description}</span>
                    </div>
                    <time className="aw-status aw-status--active" dateTime={update.updatedAt}>
                      {formatUpdateTime(update.updatedAt, i18n.language)}
                    </time>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      <p className="aw-workbench-notice">
        <GraduationCap aria-hidden="true" size={15} />
        {t('workspace.home.dataNotice', {
          defaultValue: '数据来自当前工作区，操作结果以服务端确认为准。'
        })}
      </p>
    </div>
  )
}

/**
 * @brief 工作区首页数据容器 / Workspace-home data container.
 * @return 包含 loading、error 与 ready 状态的首页 / Home page with loading, error, and ready states.
 */
export function WorkspaceHomePage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 应用层聚合后的 Workspace 首页查询 / Workspace-home query aggregated by the application layer. */
  const query = useWorkspaceHomeQuery()
  /** @brief 首页异步资源 / Home async resource. */
  const home = useAsyncResource('workspace.home', query.load)

  if (home.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingWorkspace', { defaultValue: '正在加载工作区…' })} />
      </div>
    )
  }

  if (home.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={home.error}
          onRetry={home.retry}
          title={t('status.errorWorkspace', { defaultValue: '无法加载工作区' })}
        />
      </div>
    )
  }

  return <WorkspaceHomeContent home={home.data.home} resumeSummary={home.data.resumeSummary} />
}
