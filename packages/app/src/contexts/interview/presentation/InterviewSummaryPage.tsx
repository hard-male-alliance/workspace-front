import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Quote,
  RotateCcw,
  Target
} from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { useAsyncResource, useInterviewSummaryQuery } from '../../../app/AppData'
import type { InterviewSummaryQueryResult } from '../../../app/AppQueries'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { LoadingState } from '../../../ui'

function getDimensionLabel(
  dimensionId: string,
  translate: ReturnType<typeof useTranslation>['t']
): string {
  const labels: Readonly<Record<string, string>> = {
    rub_dim_problem_framing: translate('interviewSummary.relevance', {
      defaultValue: '内容相关性'
    }),
    rub_dim_reliability: translate('interviewSummary.structure', { defaultValue: '回答结构' }),
    rub_dim_architecture: translate('interviewSummary.depth', { defaultValue: '专业深度' }),
    rub_dim_evidence: translate('interviewSummary.evidenceDimension', {
      defaultValue: '案例与证据'
    }),
    rub_dim_communication: translate('interviewSummary.delivery', { defaultValue: '表达与节奏' })
  }
  return labels[dimensionId] ?? dimensionId
}

function InterviewSummary({
  data
}: {
  readonly data: InterviewSummaryQueryResult
}): React.JSX.Element {
  const { t } = useTranslation()
  const { details, report } = data

  return (
    <div className="aw-page aw-interview-summary-page">
      <header className="aw-summary-header">
        <div>
          <h1 className="aw-page-title">
            {t('interviewSummary.analysisTitle', { defaultValue: '面试分析' })}
          </h1>
          <p className="aw-page-description">
            {details.session.jobTarget.title} · {details.scenario.name}
          </p>
        </div>
        <div
          className="aw-summary-score"
          aria-label={t('interviewSummary.overallScore', { defaultValue: '总评分' })}
        >
          <strong>{report.overallScore ?? '—'}</strong>
          <span>/ 100</span>
        </div>
      </header>

      <section className="aw-summary-overview">
        <div>
          <span>{t('interviewSummary.duration', { defaultValue: '实际时长' })}</span>
          <strong>
            {details.durationMinutes} {t('common.minutes', { defaultValue: '分钟' })}
          </strong>
        </div>
        <div>
          <span>{t('interviewSummary.difficulty', { defaultValue: '难度' })}</span>
          <strong>
            {t(`interviewDifficulties.${details.scenario.difficulty}`, {
              defaultValue: details.scenario.difficulty
            })}
          </strong>
        </div>
        <div>
          <span>{t('interviewSummary.confidence', { defaultValue: '报告置信度' })}</span>
          <strong>{Math.round(report.overallConfidence * 100)}%</strong>
        </div>
        <p>{report.executiveSummary}</p>
      </section>

      <div className="aw-summary-main-grid">
        <section className="aw-summary-section">
          <div className="aw-section-heading">
            <div>
              <h2>{t('interviewSummary.dimensions', { defaultValue: '能力维度' })}</h2>
              <p>
                {t('interviewSummary.dimensionsDescription', {
                  defaultValue: '分数用于比较本次回答中的可观察表现。'
                })}
              </p>
            </div>
          </div>
          <div
            aria-label={t('interviewSummary.chartLabel', { defaultValue: '面试能力维度评分' })}
            className="aw-score-bars"
            role="img"
          >
            {report.rubricScores.map((score) => (
              <div className="aw-score-bar-row" key={score.dimensionId}>
                <div>
                  <span>{getDimensionLabel(score.dimensionId, t)}</span>
                  <strong>{score.score}</strong>
                </div>
                <div
                  aria-label={`${getDimensionLabel(score.dimensionId, t)} ${score.score}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={score.score}
                  className="aw-score-track"
                  role="progressbar"
                >
                  <span style={{ width: `${score.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="aw-summary-section aw-summary-highlights">
          <div>
            <h2>
              <CheckCircle2 aria-hidden="true" size={18} />
              {t('interviewSummary.strengths', { defaultValue: '做得好的地方' })}
            </h2>
            <ul>
              {report.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>
              <Target aria-hidden="true" size={18} />
              {t('interviewSummary.improvements', { defaultValue: '优先改进' })}
            </h2>
            <ul>
              {report.improvements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="aw-summary-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.evidence', { defaultValue: '评分证据' })}</h2>
            <p>
              {t('interviewSummary.evidenceDescription', {
                defaultValue: '展开查看对应回答片段和评分解释。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-evidence-list">
          {report.rubricScores.map((score) => (
            <details className="aw-evidence-item" key={score.dimensionId}>
              <summary>
                <span>{getDimensionLabel(score.dimensionId, t)}</span>
                <strong>{score.score}</strong>
              </summary>
              <p>{score.summary}</p>
              {score.evidence.map((evidence) => (
                <blockquote key={`${score.dimensionId}-${evidence.segmentId}`}>
                  <Quote aria-hidden="true" size={15} />
                  {evidence.quote ??
                    t('interviewSummary.noQuote', {
                      defaultValue: '该维度基于多个已确认转录片段。'
                    })}
                </blockquote>
              ))}
              {score.improvementActions.map((action) => (
                <p className="aw-evidence-action" key={action}>
                  {action}
                </p>
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className="aw-summary-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.nextPractice', { defaultValue: '下一次练习' })}</h2>
            <p>
              {t('interviewSummary.nextPracticeDescription', {
                defaultValue: '先完成最重要的三项动作，再开始下一轮。'
              })}
            </p>
          </div>
        </div>
        <ol className="aw-practice-list">
          {report.actionPlan.slice(0, 3).map((item, index) => (
            <li key={item.title}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.practice}</p>
                <small>{item.successCriterion}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="aw-summary-section aw-summary-knowledge">
        <BookOpenCheck aria-hidden="true" size={19} />
        <div>
          <h2>{t('interviewSummary.materials', { defaultValue: '当前工作区资料' })}</h2>
          <p>
            {t('interviewSummary.materialsNotice', {
              defaultValue:
                '以下为当前工作区的资料；当前报告契约不提供本次会话的资料范围或引用关系。'
            })}
          </p>
          <div className="aw-inline-actions">
            {data.knowledgeSources.map((source) => (
              <span className="aw-chip" key={source.id}>
                {source.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <p className="aw-summary-limitations">{report.limitations.join(' ')}</p>
      <footer className="aw-summary-actions">
        <Link className="aw-quiet-button" to="/interviews">
          <ArrowLeft aria-hidden="true" size={15} />
          {t('interviewSummary.back', { defaultValue: '返回面试记录' })}
        </Link>
        <Link className="aw-primary-button" to="/interviews/new">
          <RotateCcw aria-hidden="true" size={15} />
          {t('interviewSummary.practiceAgain', { defaultValue: '再练一次' })}
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </footer>
    </div>
  )
}

export function InterviewSummaryPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { sessionId = '' } = useParams()
  /** @brief 应用层聚合后的 Interview 总结查询 / Interview-summary query aggregated by the application layer. */
  const query = useInterviewSummaryQuery()
  const loadSummary = useCallback(
    () => query.load(asUiOpaqueId<'interview-session'>(sessionId)),
    [query, sessionId]
  )
  const summary = useAsyncResource('interview.summary', loadSummary, sessionId)

  if (summary.status === 'loading')
    return (
      <div className="aw-page">
        <LoadingState
          label={t('interviewSummary.loading', {
            defaultValue: '正在加载面试分析…'
          })}
        />
      </div>
    )
  if (summary.status === 'error')
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={summary.error}
          onRetry={summary.retry}
          title={t('interviewSummary.error', { defaultValue: '无法加载面试分析' })}
        />
      </div>
    )
  return <InterviewSummary data={summary.data} />
}
