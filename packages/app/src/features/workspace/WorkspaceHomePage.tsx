import { ArrowRight, FileText, GraduationCap, Sparkles } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { UiWorkspaceActivity, UiWorkspaceHomeModel } from '../../domain'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
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
 * @return 已就绪的首页 / Ready home page.
 */
function WorkspaceHomeContent({
  home
}: {
  readonly home: UiWorkspaceHomeModel
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { i18n, t } = useTranslation()

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('workspace.home.eyebrow', { defaultValue: 'AI 求职工作台' })}
          </p>
          <h1 className="aw-page-title">
            {t('workspace.home.greeting', {
              defaultValue: '早上好，Klee。'
            })}
          </h1>
          <p className="aw-page-description">
            {t('workspace.home.description', {
              defaultValue: '把简历、练习和个人知识放在同一处，专注下一次更好的表达。'
            })}
          </p>
        </div>
        <div className="aw-inline-actions">
          <Link className="aw-primary-button" to="/resumes/res_mock_ai_platform/edit">
            <FileText aria-hidden="true" size={15} />
            {t('workspace.home.continueEditing', { defaultValue: '继续编辑简历' })}
          </Link>
        </div>
      </div>

      <div className="aw-overview-grid">
        <section aria-labelledby="workspace-progress-title" className="aw-card aw-card-pad">
          <h2 className="aw-card-title" id="workspace-progress-title">
            {t('workspace.home.progressTitle', { defaultValue: '本周进展' })}
          </h2>
          <p className="aw-card-description">
            {t('workspace.home.progressDescription', {
              defaultValue: '这是演示用工作区聚合；真实统计会在服务端契约冻结后接入。'
            })}
          </p>
          <div className="aw-stat-grid">
            <div className="aw-stat">
              <div className="aw-stat-value">{home.resumeCount}</div>
              <div className="aw-stat-label">
                {t('workspace.home.resumeCount', { defaultValue: '份简历' })}
              </div>
            </div>
            <div className="aw-stat">
              <div className="aw-stat-value">{home.completedInterviewCount}</div>
              <div className="aw-stat-label">
                {t('workspace.home.interviewCount', { defaultValue: '次已完成面试' })}
              </div>
            </div>
            <div className="aw-stat">
              <div className="aw-stat-value">{home.readyKnowledgeSourceCount}</div>
              <div className="aw-stat-label">
                {t('workspace.home.knowledgeCount', { defaultValue: '个已就绪知识源' })}
              </div>
            </div>
          </div>
          <div className="aw-continue-card aw-card">
            <span aria-hidden="true" className="aw-document-thumb" />
            <div>
              <p className="aw-list-row-title">
                {t('workspace.home.resumeTitle', { defaultValue: 'AI 平台工程师' })}
              </p>
              <p className="aw-list-row-meta">
                {t('workspace.home.resumeMeta', {
                  defaultValue: 'Modern 模板 · 语义修订 v18 · 刚刚保存'
                })}
              </p>
            </div>
            <Link className="aw-primary-button" to="/resumes/res_mock_ai_platform/edit">
              {t('common.open', { defaultValue: '打开' })}
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </section>

        <section aria-labelledby="workspace-next-title" className="aw-card aw-card-pad">
          <h2 className="aw-card-title" id="workspace-next-title">
            {t('workspace.home.nextTitle', { defaultValue: '下一步' })}
          </h2>
          <div className="aw-list-row">
            <div>
              <p className="aw-list-row-title">
                {t('workspace.home.practiceTitle', { defaultValue: '练习系统设计面试' })}
              </p>
              <p className="aw-list-row-meta">
                {t('workspace.home.practiceMeta', {
                  defaultValue: '30 分钟 · 可打断的数字人面试官'
                })}
              </p>
            </div>
            <Link className="aw-quiet-button" to="/interviews/int_mock_system_design">
              {t('common.start', { defaultValue: '开始' })}
            </Link>
          </div>
          <div className="aw-list-row">
            <div>
              <p className="aw-list-row-title">
                {t('workspace.home.visibilityTitle', { defaultValue: '检查知识可见性' })}
              </p>
              <p className="aw-list-row-meta">
                {t('workspace.home.visibilityMeta', { defaultValue: '简历以外的资料默认拒绝访问' })}
              </p>
            </div>
            <Link className="aw-quiet-button" to="/knowledge/ks_mock_resume/visibility">
              {t('common.review', { defaultValue: '查看' })}
            </Link>
          </div>
        </section>
      </div>

      <section
        aria-labelledby="workspace-activity-title"
        className="aw-card aw-card-pad"
        style={{ marginTop: 18 }}
      >
        <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="aw-card-title" id="workspace-activity-title">
              {t('workspace.home.activityTitle', { defaultValue: '最近活动' })}
            </h2>
            <p className="aw-card-description">
              {t('workspace.home.activityDescription', {
                defaultValue: '资源、面试和知识索引的可见轨迹。'
              })}
            </p>
          </div>
          <Sparkles aria-hidden="true" color="#9a5938" size={19} strokeWidth={1.6} />
        </div>
        <div className="aw-timeline">
          {home.recentActivities.map((activity) => (
            <div className="aw-timeline-item" key={activity.id}>
              <span aria-hidden="true" className="aw-timeline-dot" />
              <div className="aw-list-row" style={{ padding: 0, border: 0 }}>
                <div>
                  <p className="aw-list-row-title">{activity.title}</p>
                  <p className="aw-list-row-meta">{activity.description}</p>
                </div>
                <div className="aw-inline-actions">
                  <span className={`aw-status ${getActivityTone(activity)}`}>
                    {formatActivityTime(activity.occurredAt, i18n.language)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="aw-muted" style={{ margin: '18px 0 0' }}>
        <GraduationCap
          aria-hidden="true"
          size={14}
          style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
        />
        {t('workspace.home.mockNotice', {
          defaultValue: '当前为 v0.1 mock 展示；不会向后端发送任何简历、媒体或知识数据。'
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
  const { workspace } = useAppGateways()
  /** @brief 稳定的首页加载器 / Stable home-data loader. */
  const loadHome = useCallback(async (): Promise<UiWorkspaceHomeModel> => {
    /** @brief 可访问的工作区列表 / Accessible workspace list. */
    const workspaces = await workspace.listWorkspaces()
    /** @brief 当前演示工作区 / Current demo workspace. */
    const firstWorkspace = workspaces.at(0)

    if (firstWorkspace === undefined) {
      throw new Error('No workspace is available for the current user.')
    }

    return workspace.getWorkspaceHome(firstWorkspace.id)
  }, [workspace])
  /** @brief 首页异步资源 / Home async resource. */
  const home = useAsyncResource(loadHome)

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
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorWorkspace', { defaultValue: '无法加载工作区' })}
        />
      </div>
    )
  }

  return <WorkspaceHomeContent home={home.data} />
}
