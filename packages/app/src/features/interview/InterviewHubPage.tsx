import { ArrowRight, CalendarDays, Clock3, Plus } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAppGateways, useAsyncResource } from '../../app/AppData'
import type { UiInterviewHistoryItem } from '../../domain'
import { EmptyState, ErrorState, LoadingState } from '../../ui'

function formatCompletedAt(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function InterviewHistory({ items }: { readonly items: readonly UiInterviewHistoryItem[] }) {
  const { i18n, t } = useTranslation()

  if (items.length === 0) {
    return (
      <EmptyState
        action={
          <Link className="aw-primary-button" to="/interviews/new">
            {t('interviewHub.emptyAction', { defaultValue: '开始第一次模拟面试' })}
          </Link>
        }
        description={t('interviewHub.emptyDescription', {
          defaultValue: '完成一次模拟面试后，分析总结会出现在这里。'
        })}
        title={t('interviewHub.emptyTitle', { defaultValue: '还没有已完成的面试' })}
        visual={<CalendarDays aria-hidden="true" size={22} />}
      />
    )
  }

  return (
    <div className="aw-interview-history" role="list">
      <div aria-hidden="true" className="aw-interview-history-head">
        <span>{t('interviewSetup.targetRole', { defaultValue: '目标岗位' })}</span>
        <span>{t('interviewSetup.type', { defaultValue: '面试类型' })}</span>
        <span>{t('interviewHub.completedAt', { defaultValue: '完成时间' })}</span>
        <span>{t('interviewHub.actualDuration', { defaultValue: '实际时长' })}</span>
        <span>{t('interviewHub.score', { defaultValue: '总评分' })}</span>
      </div>
      {items.map((item) => (
        <Link
          className="aw-interview-history-row"
          key={item.sessionId}
          role="listitem"
          to={`/interviews/${item.sessionId}/summary`}
        >
          <span className="aw-interview-history-role">
            <strong>{item.jobTarget.title}</strong>
            <small>
              {item.jobTarget.company ?? t('common.notSet', { defaultValue: '未设置公司' })}
            </small>
          </span>
          <span>
            {t(`interviewTypes.${item.interviewType}`, { defaultValue: item.interviewType })}
          </span>
          <span>{formatCompletedAt(item.completedAt, i18n.language)}</span>
          <span className="aw-interview-history-duration">
            <Clock3 aria-hidden="true" size={14} />
            {t('common.minutesValue', {
              count: item.durationMinutes,
              defaultValue: `${item.durationMinutes} 分钟`
            })}
          </span>
          <span className="aw-interview-history-score">
            {item.overallScore ?? '—'}
            <ArrowRight aria-hidden="true" size={15} />
          </span>
        </Link>
      ))}
    </div>
  )
}

export function InterviewHubPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { interview, workspace } = useAppGateways()
  const loadHistory = useCallback(async () => {
    const currentWorkspace = (await workspace.listWorkspaces()).at(0)
    if (currentWorkspace === undefined) {
      throw new Error('No workspace is available for interview history.')
    }
    return interview.listCompletedInterviews(currentWorkspace.id)
  }, [interview, workspace])
  const history = useAsyncResource('interview.history', loadHistory)

  return (
    <div className="aw-page aw-interview-hub">
      <div className="aw-interview-hero">
        <div>
          <h1 className="aw-page-title">{t('interviewHub.title', { defaultValue: '模拟面试' })}</h1>
          <p className="aw-page-description">
            {t('interviewHub.description', {
              defaultValue: '用真实表达完成一次练习，再从对话证据中找到下一步。'
            })}
          </p>
        </div>
        <Link className="aw-primary-button" to="/interviews/new">
          <Plus aria-hidden="true" size={16} />
          {t('interviewHub.start', { defaultValue: '开始新面试' })}
        </Link>
      </div>

      <section aria-labelledby="interview-history-title" className="aw-interview-history-section">
        <div className="aw-section-heading">
          <div>
            <h2 id="interview-history-title">
              {t('interviewHub.history', { defaultValue: '历史面试' })}
            </h2>
            <p>
              {t('interviewHub.historyDescription', {
                defaultValue: '只展示已完成并生成总结的面试。'
              })}
            </p>
          </div>
          {history.status === 'ready' ? (
            <span className="aw-status">
              {t('interviewHub.completedCount', {
                count: history.data.length,
                defaultValue: `${history.data.length} 次已完成`
              })}
            </span>
          ) : null}
        </div>
        {history.status === 'loading' ? (
          <LoadingState label={t('interviewHub.loading', { defaultValue: '正在加载面试记录…' })} />
        ) : history.status === 'error' ? (
          <ErrorState
            description={t('interviewHub.errorDescription', {
              defaultValue: '面试记录暂时不可用，请稍后重试。'
            })}
            title={t('interviewHub.error', { defaultValue: '无法加载面试记录' })}
          />
        ) : (
          <InterviewHistory items={history.data} />
        )}
      </section>
    </div>
  )
}
