import { ArrowLeft, BarChart3, BookMarked, CircleAlert, Clock3, Quote, Target } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
import { asUiOpaqueId } from '../../domain'
import type { UiActionPlanPriority, UiInterviewReport, UiInterviewRubricScore } from '../../domain'
import { ErrorState, LoadingState } from '../../ui'

/**
 * @brief 将评分维度 ID 转为可读标签 / Convert a rubric dimension ID into a readable label.
 * @param dimensionId 评分维度 ID / Rubric dimension ID.
 * @return 展示名称 / Display name.
 */
function getRubricLabelKey(dimensionId: string): string {
  /** @brief 评分维度翻译键表 / Rubric-dimension translation-key table. */
  const labelKeys: Readonly<Record<string, string>> = {
    rub_dim_problem_framing: 'report.dimensions.problemFraming',
    rub_dim_architecture: 'report.dimensions.architecture',
    rub_dim_communication: 'report.dimensions.communication',
    rub_dim_reliability: 'report.dimensions.reliability'
  }
  return labelKeys[dimensionId] ?? dimensionId
}

/**
 * @brief 格式化毫秒时长 / Format a duration in milliseconds.
 * @param milliseconds 时长（毫秒）/ Duration in milliseconds.
 * @return 分钟秒数或破折号 / Minute-second text or em dash.
 */
function formatDuration(milliseconds: number | null, translate: TFunction): string {
  if (milliseconds === null) {
    return '—'
  }

  /** @brief 完整秒数 / Whole seconds. */
  const totalSeconds = Math.round(milliseconds / 1_000)
  return translate('report.duration', {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
    defaultValue: `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
  })
}

/**
 * @brief 将行动计划优先级映射为本地化资源 key / Map an action-plan priority to a localization resource key.
 * @param priority 行动计划优先级 / Action-plan priority.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getPriorityLabelKey(priority: UiActionPlanPriority): string {
  /** @brief 优先级到资源 key 的映射 / Mapping from priority to resource key. */
  const labelKeys: Readonly<Record<UiActionPlanPriority, string>> = {
    high: 'report.priorities.high',
    medium: 'report.priorities.medium',
    low: 'report.priorities.low'
  }
  return labelKeys[priority]
}

/**
 * @brief 评分维度详情 / Rubric-dimension detail.
 * @param props 单个评分结果 / Single rubric score.
 * @return 含证据与改进动作的评分详情 / Score detail with evidence and improvement action.
 */
function RubricDetail({ score }: { readonly score: UiInterviewRubricScore }): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()

  return (
    <article className="aw-card aw-card-pad">
      <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 className="aw-card-title">
            {t(getRubricLabelKey(score.dimensionId), { defaultValue: score.dimensionId })}
          </h3>
          <p className="aw-card-description">{score.summary}</p>
        </div>
        <span className="aw-status aw-status--active">
          {t('report.confidence', { defaultValue: '置信度' })} {Math.round(score.confidence * 100)}%
        </span>
      </div>
      {score.evidence.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {score.evidence.map((evidence) => (
            <div className="aw-proposal-change" key={evidence.segmentId}>
              <Quote
                aria-hidden="true"
                size={13}
                style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
              />
              {evidence.quote ??
                t('report.transcriptFallback', {
                  segmentId: evidence.segmentId,
                  defaultValue: `转录片段 ${evidence.segmentId}`
                })}
            </div>
          ))}
        </div>
      ) : null}
      <p className="aw-setting-help" style={{ marginBottom: 0, marginTop: 10 }}>
        {score.improvementActions.join(' · ')}
      </p>
    </article>
  )
}

/**
 * @brief 已就绪的面试总结页面 / Ready interview-summary page.
 * @param props 面试报告 / Interview report.
 * @return 基于证据的面试总结 / Evidence-grounded interview summary.
 */
function InterviewSummaryContent({
  report
}: {
  readonly report: UiInterviewReport
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 总分显示文字 / Overall score display text. */
  const overallScoreLabel =
    report.overallScore === null ? '—' : String(Math.round(report.overallScore))
  /** @brief 是否已保存本地练习计划 / Whether the local practice plan was saved. */
  const [isPlanSaved, setPlanSaved] = useState(false)

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('report.evidenceBased', { defaultValue: '证据驱动的练习反馈' })}
          </p>
          <h1 className="aw-page-title">{t('report.title', { defaultValue: '面试总结' })}</h1>
          <p className="aw-page-description">
            {t('report.description', {
              defaultValue:
                '评分仅基于量表、确认的转录证据与可观察沟通行为；它不是人格或就业结果判断。'
            })}
          </p>
        </div>
        <div className="aw-inline-actions">
          <Link className="aw-quiet-button" to={`/interviews/${report.sessionId}`}>
            <ArrowLeft aria-hidden="true" size={15} />
            {t('common.back', { defaultValue: '返回面试' })}
          </Link>
          <button
            className="aw-primary-button"
            onClick={(): void => setPlanSaved(true)}
            type="button"
          >
            <BookMarked aria-hidden="true" size={15} />
            {t('report.savePlan', { defaultValue: '保存练习计划' })}
          </button>
        </div>
      </div>

      {isPlanSaved ? (
        <div aria-live="polite" className="aw-proposal" role="status" style={{ marginBottom: 18 }}>
          <p className="aw-proposal-title">
            <BookMarked
              aria-hidden="true"
              size={14}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('report.planSaved', { defaultValue: 'Practice plan saved to local demo state' })}
          </p>
          <p className="aw-muted" style={{ margin: 0 }}>
            {t('report.planSavedDescription', {
              defaultValue:
                'Nothing was written to a backend and no formal practice plan was created.'
            })}
          </p>
        </div>
      ) : null}

      <div className="aw-summary-layout">
        <div>
          <section className="aw-card aw-score-hero">
            <div
              aria-label={`${t('report.overallScore', { defaultValue: '总体得分' })} ${overallScoreLabel}`}
              className="aw-score-ring"
            >
              <div className="aw-score-ring-value">
                {overallScoreLabel}
                <span>{t('report.rawMockScore', { defaultValue: 'Mock 原始分数' })}</span>
              </div>
            </div>
            <div>
              <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h2 className="aw-card-title">
                    {t('report.overallScore', { defaultValue: '总体得分' })}
                  </h2>
                  <p className="aw-card-description">
                    {t('report.confidence', { defaultValue: '置信度' })}{' '}
                    {Math.round(report.overallConfidence * 100)}%
                  </p>
                </div>
                <span className="aw-status aw-status--ready">v{report.reportVersion}</span>
              </div>
              <p className="aw-page-description" style={{ marginBottom: 0 }}>
                {report.executiveSummary}
              </p>
            </div>
          </section>

          <section className="aw-card aw-rubric-list" style={{ marginTop: 18 }}>
            <div className="aw-inline-actions">
              <BarChart3 aria-hidden="true" color="#9a5938" size={18} />
              <div>
                <h2 className="aw-card-title">
                  {t('report.rubric', { defaultValue: '维度评分' })}
                </h2>
                <p className="aw-card-description">
                  {t('report.rubricDescription', {
                    defaultValue: '每项都标注了置信度与可检查证据。'
                  })}
                </p>
              </div>
            </div>
            {report.rubricScores.map((score) => (
              <div className="aw-rubric-row" key={score.dimensionId}>
                <span>
                  {t(getRubricLabelKey(score.dimensionId), { defaultValue: score.dimensionId })}
                </span>
                <span className="aw-muted">
                  {t('report.rawMockScore', { defaultValue: 'Mock 原始分数' })}
                </span>
                <strong>{score.score}</strong>
              </div>
            ))}
          </section>

          <section style={{ marginTop: 18 }}>
            <div className="aw-inline-actions" style={{ marginBottom: 11 }}>
              <Quote aria-hidden="true" color="#9a5938" size={18} />
              <div>
                <h2 className="aw-card-title">
                  {t('report.evidence', { defaultValue: '转录证据' })}
                </h2>
                <p className="aw-card-description">
                  {t('report.evidenceDescription', {
                    defaultValue: '结论可以回到具体的已确认片段复核。'
                  })}
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {report.rubricScores.map((score) => (
                <RubricDetail key={score.dimensionId} score={score} />
              ))}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', alignContent: 'start', gap: 18 }}>
          <section className="aw-card aw-card-pad">
            <h2 className="aw-card-title">
              {t('report.strengths', { defaultValue: '做得好的地方' })}
            </h2>
            <ul
              className="aw-paper"
              style={{
                width: 'auto',
                minHeight: 0,
                padding: '9px 0 0',
                boxShadow: 'none',
                background: 'transparent'
              }}
            >
              {report.strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          </section>
          <section className="aw-card aw-card-pad">
            <h2 className="aw-card-title">
              {t('report.improvements', { defaultValue: '下一步改进' })}
            </h2>
            <ul
              className="aw-paper"
              style={{
                width: 'auto',
                minHeight: 0,
                padding: '9px 0 0',
                boxShadow: 'none',
                background: 'transparent'
              }}
            >
              {report.improvements.map((improvement) => (
                <li key={improvement}>{improvement}</li>
              ))}
            </ul>
          </section>
          <section className="aw-card aw-card-pad">
            <div className="aw-inline-actions">
              <Clock3 aria-hidden="true" color="#9a5938" size={17} />
              <h2 className="aw-card-title">
                {t('report.communication', { defaultValue: '可观察沟通指标' })}
              </h2>
            </div>
            <div className="aw-list-row">
              <span className="aw-muted">
                {t('report.speakingTime', { defaultValue: '发言时长' })}
              </span>
              <strong>{formatDuration(report.communicationMetrics.speakingTimeMs, t)}</strong>
            </div>
            <div className="aw-list-row">
              <span className="aw-muted">
                {t('report.wordsPerMinute', { defaultValue: '每分钟词数' })}
              </span>
              <strong>{report.communicationMetrics.wordsPerMinute ?? '—'}</strong>
            </div>
            <div className="aw-list-row">
              <span className="aw-muted">{t('report.longPauses', { defaultValue: '长停顿' })}</span>
              <strong>{report.communicationMetrics.longPauseCount ?? '—'}</strong>
            </div>
            <p className="aw-setting-help" style={{ marginBottom: 0 }}>
              {report.communicationMetrics.notes.join(' ')}
            </p>
          </section>
        </aside>
      </div>

      <section className="aw-card aw-card-pad" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions">
          <Target aria-hidden="true" color="#9a5938" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('report.actionPlan', { defaultValue: '行动计划' })}
            </h2>
            <p className="aw-card-description">
              {t('report.actionPlanDescription', {
                defaultValue: '把建议转成可练习、可检查的下一步。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-action-plan" style={{ marginTop: 14 }}>
          {report.actionPlan.map((item) => (
            <article className="aw-action-item" key={item.title}>
              <span className={`aw-priority aw-priority--${item.priority}`} />
              <div>
                <span className="aw-chip">
                  {t(getPriorityLabelKey(item.priority), { defaultValue: item.priority })}
                </span>
                <h3 className="aw-card-title" style={{ marginTop: 8 }}>
                  {item.title}
                </h3>
                <p className="aw-card-description">{item.why}</p>
                <p className="aw-setting-help">
                  <strong>{t('report.practice', { defaultValue: '练习：' })}</strong>{' '}
                  {item.practice}
                </p>
                <p className="aw-setting-help">
                  <strong>{t('report.successCriterion', { defaultValue: '成功标准：' })}</strong>{' '}
                  {item.successCriterion}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="aw-card aw-card-pad" style={{ marginTop: 18 }}>
        <div className="aw-inline-actions">
          <CircleAlert aria-hidden="true" color="#9a6b27" size={18} />
          <div>
            <h2 className="aw-card-title">
              {t('report.limitations', { defaultValue: '局限性说明' })}
            </h2>
            <p className="aw-card-description">
              {t('report.limitationsDescription', {
                defaultValue: '请将这份结果当作练习反馈，而非确定性评价。'
              })}
            </p>
          </div>
        </div>
        <ul
          className="aw-paper"
          style={{
            width: 'auto',
            minHeight: 0,
            padding: '9px 0 0',
            boxShadow: 'none',
            background: 'transparent'
          }}
        >
          {report.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * @brief 面试总结路由页 / Interview-summary route page.
 * @return 含 loading、error 与报告内容的路由页 / Route page with loading, error, and report content.
 */
export function InterviewSummaryPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由参数 / Route parameters. */
  const { sessionId } = useParams()
  /** @brief 面试 gateway / Interview gateway. */
  const { interview } = useAppGateways()
  /** @brief 路由 ID 的不透明 UI 表达 / Opaque UI representation of route ID. */
  const requestedSessionId = useMemo(
    () => asUiOpaqueId<'interview-session'>(sessionId ?? ''),
    [sessionId]
  )
  /** @brief 稳定的报告加载器 / Stable report loader. */
  const loadReport = useCallback(async (): Promise<UiInterviewReport> => {
    if (sessionId === undefined) {
      throw new Error('An interview session identifier is required.')
    }

    return interview.getInterviewReport(requestedSessionId)
  }, [interview, requestedSessionId, sessionId])
  /** @brief 报告异步资源 / Report async resource. */
  const report = useAsyncResource(loadReport)

  if (report.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('status.loadingInterviewSummary', { defaultValue: '正在加载面试总结…' })}
        />
      </div>
    )
  }

  if (report.status === 'error') {
    return (
      <div className="aw-page">
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorInterviewSummary', { defaultValue: '无法加载面试总结' })}
        />
      </div>
    )
  }

  return <InterviewSummaryContent report={report.data} />
}
