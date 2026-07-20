import { ArrowRight, BookOpenText, BriefcaseBusiness, FileText, GraduationCap } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAppGateways, useAsyncResource } from '../../app/AppData'
import type { UiResumeCard, UiWorkspaceActivity, UiWorkspaceHomeModel } from '../../domain'
import { ErrorState, LoadingState } from '../../ui'

/**
 * @brief 格式化活动时间 / Format an activity timestamp.
 * @param timestamp ISO 时间戳 / ISO timestamp.
 * @param locale 界面语言 / UI locale.
 * @return 已本地化的短日期时间 / Localized short date-time text.
 */
function formatActivityTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

/**
 * @brief 为活动选择状态样式 / Select a status style for an activity.
 * @param activity 活动展示模型 / Activity display model.
 * @return 活动状态样式名称 / Activity status-style name.
 */
function getActivityTone(activity: UiWorkspaceActivity): string {
  return activity.kind === 'knowledge_indexed' ? 'aw-status--ready' : 'aw-status--active'
}

/**
 * @brief 工作区首页内容 / Workspace-home content.
 * @param props 首页数据 / Home-page data.
 * @return 以行动为中心的今日工作台 / Action-first daily workspace.
 */
function WorkspaceHomeContent({
  home,
  resumeCard
}: {
  readonly home: UiWorkspaceHomeModel
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
            {t('workspace.home.greeting', {
              defaultValue: '早上好，Klee。先完成最重要的一步，再处理其他任务。'
            })}
          </p>
        </div>
        <span className="aw-status aw-status--ready">
          {t('workspace.home.localWorkspace', { defaultValue: '本地演示工作区' })}
        </span>
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
                    defaultValue: '从项目经历开始，把成果写得更具体，再进入模拟面试。'
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
                      defaultValue: '等待正式创建协议接入'
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
                      defaultValue: '继续编辑内容与查看 Mock 预览'
                    })}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            )}
            <Link className="aw-action-row" to="/interviews/int_mock_system_design">
              <span className="aw-action-icon">
                <BriefcaseBusiness aria-hidden="true" size={18} />
              </span>
              <span className="aw-action-copy">
                <strong>
                  {t('workspace.home.practiceTitle', { defaultValue: '系统设计模拟面试' })}
                </strong>
                <small>
                  {t('workspace.home.practiceMeta', {
                    defaultValue: '保留当前音视频外观的文字 Mock 流程'
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
                {t('workspace.home.activityTitle', { defaultValue: '最近活动' })}
              </h2>
              <p>
                {t('workspace.home.activityDescription', {
                  defaultValue: '当前 Mock 工作区中已记录的操作。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-timeline">
            {home.recentActivities.map((activity) => (
              <div className="aw-timeline-item" key={activity.id}>
                <span aria-hidden="true" className="aw-timeline-dot" />
                <div className="aw-activity-copy">
                  <strong>{activity.title}</strong>
                  <span>{activity.description}</span>
                </div>
                <time
                  className={`aw-status ${getActivityTone(activity)}`}
                  dateTime={activity.occurredAt}
                >
                  {formatActivityTime(activity.occurredAt, i18n.language)}
                </time>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="aw-workbench-notice">
        <GraduationCap aria-hidden="true" size={15} />
        {t('workspace.home.mockNotice', {
          defaultValue: '当前为 v0.1 Mock 展示；不会向后端发送简历、媒体或知识数据。'
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
  /** @brief 工作区 gateway / Workspace gateway. */
  const { resume, workspace } = useAppGateways()
  /** @brief 稳定的首页加载器 / Stable home-data loader. */
  const loadHome = useCallback(async (): Promise<{
    readonly home: UiWorkspaceHomeModel
    readonly resumeCard: UiResumeCard | null
  }> => {
    /** @brief 可访问的工作区列表 / Accessible workspace list. */
    const workspaces = await workspace.listWorkspaces()
    /** @brief 当前演示工作区 / Current demo workspace. */
    const firstWorkspace = workspaces.at(0)

    if (firstWorkspace === undefined) {
      throw new Error('No workspace is available for the current user.')
    }

    const [home, resumeCards] = await Promise.all([
      workspace.getWorkspaceHome(firstWorkspace.id),
      resume.listResumeCards(firstWorkspace.id)
    ])
    const resumeCard =
      [...resumeCards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null
    return { home, resumeCard }
  }, [resume, workspace])
  /** @brief 首页异步资源 / Home async resource. */
  const home = useAsyncResource('workspace.home', loadHome)

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
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue: '演示数据暂时不可用。请重试，或返回工作台。'
          })}
          title={t('status.errorWorkspace', { defaultValue: '无法加载工作区' })}
        />
      </div>
    )
  }

  return <WorkspaceHomeContent home={home.data.home} resumeCard={home.data.resumeCard} />
}
