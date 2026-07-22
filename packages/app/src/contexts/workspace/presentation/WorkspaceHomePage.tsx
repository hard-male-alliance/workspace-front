import { ArrowRight, BookOpenText, BriefcaseBusiness, FileText, GraduationCap } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAsyncResource, useWorkspaceHomeQuery } from '../../../app/AppData'
import type { WorkspaceHomeModel, WorkspaceRecentUpdate } from '../../../app/AppQueries'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { LoadingState } from '../../../ui'
import type { UiInterviewHistoryItem } from '../../interview'
import type { UiResumeCard } from '../../resume'

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

/**
 * @brief 为资源更新选择状态样式 / Select a status style for a resource update.
 * @param update 资源更新投影 / Resource-update projection.
 * @return 更新状态样式名称 / Update status-style name.
 */
function getUpdateTone(update: WorkspaceRecentUpdate): string {
  return update.kind === 'knowledge' ? 'aw-status--ready' : 'aw-status--active'
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
  /** @brief 后端资源名称；缺失时使用中性名称 / Backend resource name, or a neutral name when absent. */
  const subject =
    update.subject ?? t('workspace.home.unnamedResource', { defaultValue: '未命名资源' })

  switch (update.kind) {
    case 'resume':
      return {
        description: t('workspace.home.resumeUpdateDescription', {
          defaultValue: '简历内容已同步至当前工作区。'
        }),
        title: t('workspace.home.resumeUpdateTitle', {
          defaultValue: '更新了 {{subject}}',
          subject
        })
      }
    case 'knowledge':
      return {
        description: t('workspace.home.knowledgeUpdateDescription', {
          defaultValue: '知识来源已完成索引。'
        }),
        title: t('workspace.home.knowledgeUpdateTitle', {
          defaultValue: '索引了 {{subject}}',
          subject
        })
      }
    case 'interview':
      return {
        description: t('workspace.home.interviewUpdateDescription', {
          defaultValue: '面试会话已完成。'
        }),
        title: t('workspace.home.interviewUpdateTitle', {
          defaultValue: '完成了一次面试练习'
        })
      }
  }
}

/**
 * @brief 工作区首页内容 / Workspace-home content.
 * @param props 首页数据 / Home-page data.
 * @return 以行动为中心的今日工作台 / Action-first daily workspace.
 */
function WorkspaceHomeContent({
  home,
  recentInterview,
  resumeCard
}: {
  readonly home: WorkspaceHomeModel
  readonly recentInterview: UiInterviewHistoryItem | null
  readonly resumeCard: UiResumeCard | null
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
        <span className="aw-status aw-status--ready">{home.workspace.name}</span>
      </header>

      <div className="aw-today-grid">
        <section aria-labelledby="workspace-focus-title" className="aw-focus-panel">
          <div className="aw-focus-copy">
            <h2 className="aw-focus-label" id="workspace-focus-title">
              {t('workspace.home.focusLabel', { defaultValue: '今日最重要的事' })}
            </h2>
            <h3>
              {resumeCard?.title ??
                t('workspace.home.emptyResumeTitle', { defaultValue: '还没有可编辑的简历' })}
            </h3>
            <p>
              {resumeCard === null
                ? t('workspace.home.emptyResumeDescription', {
                    defaultValue: '后端当前没有返回简历，创建协议冻结后可从这里开始。'
                  })
                : t('workspace.home.focusDescription', {
                    defaultValue: '从项目经历开始，把成果写得更具体，再进入面试练习。'
                  })}
            </p>
          </div>
          <div className="aw-focus-meta">
            {resumeCard === null ? null : (
              <>
                <span>
                  <FileText aria-hidden="true" size={15} />
                  {resumeCard.templateName} · v{resumeCard.revision}
                </span>
                <Link className="aw-primary-button" to={`/resumes/${resumeCard.id}/edit`}>
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
              <dd>{home.resumeCount}</dd>
            </div>
            <div>
              <dt>{t('workspace.home.interviewCount', { defaultValue: '已完成面试' })}</dt>
              <dd>{home.completedInterviewCount}</dd>
            </div>
            <div>
              <dt>{t('workspace.home.knowledgeCount', { defaultValue: '已就绪知识源' })}</dt>
              <dd>{home.readyKnowledgeSourceCount}</dd>
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
            {resumeCard === null ? (
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
              <Link className="aw-action-row" to={`/resumes/${resumeCard.id}/edit`}>
                <span className="aw-action-icon">
                  <FileText aria-hidden="true" size={18} />
                </span>
                <span className="aw-action-copy">
                  <strong>{resumeCard.title}</strong>
                  <small>
                    {t('workspace.home.resumeActionMeta', {
                      defaultValue: '继续编辑内容与生成 PDF 预览'
                    })}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            )}
            <Link
              className="aw-action-row"
              to={
                recentInterview?.overallScore === null || recentInterview === null
                  ? '/interviews'
                  : `/interviews/${recentInterview.sessionId}/summary`
              }
            >
              <span className="aw-action-icon">
                <BriefcaseBusiness aria-hidden="true" size={18} />
              </span>
              <span className="aw-action-copy">
                <strong>
                  {recentInterview?.jobTarget.title ??
                    t('workspace.home.practiceTitle', { defaultValue: '开始一次面试练习' })}
                </strong>
                <small>
                  {t('workspace.home.practiceSummary', {
                    defaultValue: '继续准备或查看最近的面试记录'
                  })}
                </small>
              </span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link className="aw-action-row" to="/knowledge">
              <span className="aw-action-icon">
                <BookOpenText aria-hidden="true" size={18} />
              </span>
              <span className="aw-action-copy">
                <strong>
                  {t('workspace.home.knowledgeTitle', { defaultValue: '个人知识库' })}
                </strong>
                <small>
                  {t('workspace.home.knowledgeMeta', {
                    count: home.readyKnowledgeSourceCount,
                    defaultValue: `${home.readyKnowledgeSourceCount} 个知识源已就绪`
                  })}
                </small>
              </span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
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
                    <time
                      className={`aw-status ${getUpdateTone(update)}`}
                      dateTime={update.updatedAt}
                    >
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

  return (
    <WorkspaceHomeContent
      home={home.data.home}
      recentInterview={home.data.recentInterview}
      resumeCard={home.data.resumeCard}
    />
  )
}
