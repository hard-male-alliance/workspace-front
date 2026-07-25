import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Quote,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Target
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import {
  useAsyncResource,
  useInterviewGateway,
  useInterviewReportProcess,
  useWorkspaceSession
} from '../../../app/AppData'
import type {
  InterviewReportObservation,
  InterviewReportRecovery
} from '../../../app/InterviewReportProcess'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { asUiOpaqueId, type UiWorkspaceId } from '../../../shared-kernel/identity'
import { EmptyState, LoadingState } from '../../../ui'
import type { UiPrincipalSubject } from '../../identity'
import type { InterviewGateway } from '../application/gateway'
import {
  asUiInterviewPageLimit,
  type UiInterviewEvidenceClaim,
  type UiInterviewReport,
  type UiInterviewRubricDimension,
  type UiInterviewScenario,
  type UiInterviewSessionAuthority,
  type UiInterviewSessionId,
  type UiInterviewTranscriptCursor,
  type UiInterviewTranscriptPage,
  type UiInterviewTranscriptSegment
} from '../domain/models'

/** @brief Transcript 每次读取的固定页大小 / Fixed page size for Transcript reads. */
const INTERVIEW_TRANSCRIPT_PAGE_LIMIT = asUiInterviewPageLimit(50)

/** @brief Session 路由加载后的完整权威 / Complete authority loaded for a Session route. */
interface InterviewSessionRouteAuthority {
  /** @brief 当前 principal subject，用于写恢复隔离 / Current principal subject for write-recovery isolation. */
  readonly principalSubject: UiPrincipalSubject
  /** @brief 当前场景 / Current Scenario resource. */
  readonly scenario: UiInterviewScenario
  /** @brief 当前 Session 与强 ETag / Current Session and strong ETag. */
  readonly sessionAuthority: UiInterviewSessionAuthority
  /** @brief 显式授权 Workspace / Explicitly authorized Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief Workspace 展示名 / Workspace display name. */
  readonly workspaceName: string
}

/** @brief Report 生成面板状态 / Report-generation panel state. */
type ReportGenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'working'; readonly phase: InterviewReportObservation['status'] }
  | {
      readonly status: 'confirmation-required'
      readonly recovery: Extract<
        InterviewReportRecovery,
        { readonly status: 'confirmation-required' }
      >
    }
  | { readonly status: 'authority-review-required' }
  | { readonly status: 'job-terminal'; readonly jobStatus: string }
  | { readonly status: 'error'; readonly error: unknown }

/** @brief Transcript 后续页状态 / Transcript-continuation state. */
type TranscriptContinuation =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly cursor: UiInterviewTranscriptCursor }
  | {
      readonly status: 'error'
      readonly cursor: UiInterviewTranscriptCursor
      readonly error: unknown
    }

/** @brief 一个报告证据声明的客户端核验结果 / Client verification result for one report evidence claim. */
type EvidenceVerification =
  | { readonly status: 'confirmed'; readonly segment: UiInterviewTranscriptSegment }
  | { readonly status: 'pending' }
  | { readonly status: 'missing' }
  | { readonly status: 'invalid-range'; readonly segment: UiInterviewTranscriptSegment }

/**
 * @brief 格式化服务端时间 / Format a server timestamp.
 * @param value ISO 时间 / ISO timestamp.
 * @param locale 当前界面语言 / Current UI locale.
 * @return 本地化日期时间 / Localized date and time.
 */
function formatTimestamp(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

/**
 * @brief 格式化毫秒偏移 / Format a millisecond offset.
 * @param milliseconds 非负毫秒 / Non-negative milliseconds.
 * @return `mm:ss` 展示 / `mm:ss` display.
 */
function formatOffset(milliseconds: number): string {
  /** @brief 取整后的总秒数 / Whole elapsed seconds. */
  const seconds = Math.floor(milliseconds / 1000)
  /** @brief 分钟部分 / Minute component. */
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * @brief 核验 Evidence 是否引用当前已加载 Transcript / Verify whether Evidence references the loaded Transcript.
 * @param claim 报告中的声明 / Claim from the report.
 * @param segments 已加载的权威片段 / Loaded authoritative segments.
 * @param hasMore 是否仍有未加载片段 / Whether unloaded segments remain.
 * @return 不把 quote 当作证明的四态结果 / Four-state result that never treats the quote as proof.
 */
function verifyEvidence(
  claim: UiInterviewEvidenceClaim,
  segments: readonly UiInterviewTranscriptSegment[],
  hasMore: boolean
): EvidenceVerification {
  /** @brief 相同 segment identity 的权威片段 / Authoritative segment with the same identity. */
  const segment = segments.find((candidate) => candidate.id === claim.segmentId)
  if (segment === undefined) return hasMore ? { status: 'pending' } : { status: 'missing' }
  return claim.startMs >= segment.startMs && claim.endMs <= segment.endMs
    ? { segment, status: 'confirmed' }
    : { segment, status: 'invalid-range' }
}

/**
 * @brief 合并 Transcript 页并按 segment identity 去重 / Merge Transcript pages and deduplicate by segment identity.
 * @param current 已接受片段 / Accepted segments.
 * @param incoming 后续页片段 / Segments from a following page.
 * @return 保留首次顺序、较新投影覆盖重复项的列表 / Ordered list where newer projections replace duplicates.
 */
function mergeTranscript(
  current: readonly UiInterviewTranscriptSegment[],
  incoming: readonly UiInterviewTranscriptSegment[]
): readonly UiInterviewTranscriptSegment[] {
  /** @brief 保持首次插入顺序的片段 map / Segment map preserving first insertion order. */
  const byId = new Map(current.map((segment) => [segment.id, segment]))
  for (const segment of incoming) byId.set(segment.id, segment)
  return [...byId.values()]
}

/**
 * @brief 在 Report 引用与当前 Scenario rubric 完全匹配时返回维度 / Return a dimension only when Report and current Scenario rubric match exactly.
 * @param report 权威报告 / Authoritative Report.
 * @param scenario 当前场景 / Current Scenario.
 * @param dimensionId 报告维度身份 / Report dimension identity.
 * @return 可用于命名和量表的维度，否则为 null / Dimension usable for naming and scale, or null.
 */
function matchingDimension(
  report: UiInterviewReport,
  scenario: UiInterviewScenario,
  dimensionId: string
): UiInterviewRubricDimension | null {
  if (
    report.rubricRef.id !== scenario.rubric.rubricId ||
    report.rubricRef.version !== scenario.rubric.rubricVersion
  ) {
    return null
  }
  return (
    scenario.rubric.dimensions.find((dimension) => dimension.dimensionId === dimensionId) ?? null
  )
}

/**
 * @brief 把分数与可证明的量表一起展示 / Display a score with a provable scale.
 * @param score 分数 / Score.
 * @param minimum 可选量表最小值 / Optional scale minimum.
 * @param maximum 可选量表最大值 / Optional scale maximum.
 * @return 紧凑分数字符串 / Compact score string.
 */
function formatScore(score: number | null, minimum?: number, maximum?: number): string {
  if (score === null) return '—'
  if (minimum === undefined || maximum === undefined) return String(score)
  return minimum === 0 ? `${score} / ${maximum}` : `${score} [${minimum}–${maximum}]`
}

/** @brief 报告正文属性 / Report-body properties. */
interface InterviewReportBodyProps {
  /** @brief 权威报告 / Authoritative Report. */
  readonly report: UiInterviewReport
  /** @brief 当前场景 / Current Scenario. */
  readonly scenario: UiInterviewScenario
}

/**
 * @brief 呈现不依赖 Transcript 的报告主体 / Present the Report body independently from Transcript.
 * @param props 报告与场景 / Report and Scenario.
 * @return 总览、评分、沟通指标与行动计划 / Overview, scores, communication metrics, and action plan.
 */
function InterviewReportBody({ report, scenario }: InterviewReportBodyProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 当前 Scenario 是否仍提供报告冻结 rubric / Whether the current Scenario still provides the Report's frozen rubric. */
  const rubricMatches =
    report.rubricRef.id === scenario.rubric.rubricId &&
    report.rubricRef.version === scenario.rubric.rubricVersion
  /** @brief 可证明的 overall scale / Provable overall scale. */
  const overallScale = rubricMatches ? scenario.rubric.overallScale : null

  return (
    <>
      <section className="aw-summary-overview">
        <div>
          <span>{t('interviewSummary.overallScore', { defaultValue: '总评分' })}</span>
          <strong>
            {formatScore(report.overallScore, overallScale?.minimum, overallScale?.maximum)}
          </strong>
        </div>
        <div>
          <span>{t('interviewSummary.confidence', { defaultValue: '报告置信度' })}</span>
          <strong>{Math.round(report.overallConfidence * 100)}%</strong>
        </div>
        <div>
          <span>{t('interviewSummary.generatedAt', { defaultValue: '生成版本' })}</span>
          <strong>{report.reportVersion}</strong>
        </div>
        <p>{report.executiveSummary.plainText}</p>
      </section>

      {!rubricMatches ? (
        <p className="aw-inline-warning" role="status">
          {t('interviewSummary.rubricUnavailable', {
            defaultValue:
              '当前场景已不再携带本报告冻结的量表版本；以下保留报告原始分数，但不补猜维度名称或量表。'
          })}
        </p>
      ) : null}

      <div className="aw-summary-main-grid">
        <section className="aw-summary-section">
          <div className="aw-section-heading">
            <div>
              <h2>{t('interviewSummary.dimensions', { defaultValue: '能力维度' })}</h2>
              <p>
                {t('interviewSummary.dimensionsDescription', {
                  defaultValue: '分数只描述本次可观察表现。'
                })}
              </p>
            </div>
          </div>
          <div className="aw-score-bars">
            {report.rubricScores.map((score) => {
              /** @brief 与冻结引用匹配的维度 / Dimension matching the frozen reference. */
              const dimension = matchingDimension(report, scenario, score.dimensionId)
              return (
                <article className="aw-score-bar-row" key={score.dimensionId}>
                  <div>
                    <span>{dimension?.name ?? score.dimensionId}</span>
                    <strong>
                      {formatScore(
                        score.score,
                        dimension?.scoringScale.minimum,
                        dimension?.scoringScale.maximum
                      )}
                    </strong>
                  </div>
                  <p>{score.summary.plainText}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="aw-summary-section aw-summary-highlights">
          <div>
            <h2>
              <CheckCircle2 aria-hidden="true" size={18} />
              {t('interviewSummary.strengths', { defaultValue: '做得好的地方' })}
            </h2>
            <ul>
              {report.strengths.map((item, index) => (
                <li key={`${index}:${item.plainText}`}>{item.plainText}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>
              <Target aria-hidden="true" size={18} />
              {t('interviewSummary.improvements', { defaultValue: '优先改进' })}
            </h2>
            <ul>
              {report.improvements.map((item, index) => (
                <li key={`${index}:${item.plainText}`}>{item.plainText}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="aw-summary-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.communication', { defaultValue: '可观察沟通指标' })}</h2>
            <p>
              {t('interviewSummary.communicationDescription', {
                defaultValue: '这些指标描述转录行为，不推断人格或受保护属性。'
              })}
            </p>
          </div>
        </div>
        <dl className="aw-interview-metrics">
          <div>
            <dt>{t('interviewSummary.wordsPerMinute', { defaultValue: '每分钟词数' })}</dt>
            <dd>{report.communicationMetrics.wordsPerMinute ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('interviewSummary.fillerWords', { defaultValue: '填充词' })}</dt>
            <dd>{report.communicationMetrics.fillerWordCount ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('interviewSummary.longPauses', { defaultValue: '长停顿' })}</dt>
            <dd>{report.communicationMetrics.longPauseCount ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('interviewSummary.interruptions', { defaultValue: '打断次数' })}</dt>
            <dd>{report.communicationMetrics.interruptionCount ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="aw-summary-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.nextPractice', { defaultValue: '下一次练习' })}</h2>
          </div>
        </div>
        <ol className="aw-practice-list">
          {report.actionPlan.map((item, index) => (
            <li key={`${item.priority}:${item.title}`}>
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
    </>
  )
}

/** @brief 已加载 Transcript 与 Evidence 属性 / Loaded Transcript-and-Evidence properties. */
interface LoadedTranscriptEvidenceProps {
  /** @brief Interview REST 端口 / Interview REST port. */
  readonly gateway: InterviewGateway
  /** @brief 初始 Transcript 页 / Initial Transcript page. */
  readonly initialPage: UiInterviewTranscriptPage
  /** @brief 权威报告 / Authoritative Report. */
  readonly report: UiInterviewReport
  /** @brief 当前场景 / Current Scenario. */
  readonly scenario: UiInterviewScenario
  /** @brief Session identity / Session identity. */
  readonly sessionId: UiInterviewSessionId
  /** @brief Workspace identity / Workspace identity. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 呈现并增量核验 Transcript evidence / Present and incrementally verify Transcript evidence.
 * @param props 初始页、报告与资源 identities / Initial page, report, and resource identities.
 * @return 保留后续页失败内容的 evidence 与 transcript / Evidence and transcript preserving content across continuation failures.
 */
function LoadedTranscriptEvidence({
  gateway,
  initialPage,
  report,
  scenario,
  sessionId,
  workspaceId
}: LoadedTranscriptEvidenceProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 已加载片段 / Loaded segments. */
  const [segments, setSegments] = useState<readonly UiInterviewTranscriptSegment[]>(
    initialPage.items
  )
  /** @brief 当前分页关系 / Current page relation. */
  const [page, setPage] = useState<UiInterviewTranscriptPage>(initialPage)
  /** @brief 后续页状态 / Continuation-page state. */
  const [continuation, setContinuation] = useState<TranscriptContinuation>({ status: 'idle' })
  /** @brief 当前后续页请求 / Current continuation request. */
  const controllerRef = useRef<AbortController | null>(null)
  /** @brief 已消费 cursor / Consumed cursors. */
  const consumedCursors = useRef(new Set<UiInterviewTranscriptCursor>())

  useEffect(
    (): (() => void) => () => {
      controllerRef.current?.abort(
        new DOMException('Interview transcript identity changed.', 'AbortError')
      )
    },
    []
  )

  /** @brief 加载或精确重试下一页 Transcript / Load or exactly retry the next Transcript page. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!page.hasMore || continuation.status === 'loading' || controllerRef.current !== null) return
    /** @brief 本次请求 cursor / Cursor for this request. */
    const cursor = page.nextCursor
    /** @brief 本次请求控制器 / Controller for this request. */
    const controller = new AbortController()
    controllerRef.current = controller
    setContinuation({ cursor, status: 'loading' })
    try {
      /** @brief 后续 Transcript 页 / Following Transcript page. */
      const nextPage = await gateway.listInterviewTranscriptPage({
        cursor,
        limit: INTERVIEW_TRANSCRIPT_PAGE_LIMIT,
        sessionId,
        signal: controller.signal,
        workspaceId
      })
      if (
        consumedCursors.current.has(cursor) ||
        (nextPage.hasMore &&
          (nextPage.nextCursor === cursor || consumedCursors.current.has(nextPage.nextCursor)))
      ) {
        throw new Error('The Interview transcript pagination cursor did not advance.')
      }
      consumedCursors.current.add(cursor)
      setSegments((current) => mergeTranscript(current, nextPage.items))
      setPage(nextPage)
      setContinuation({ status: 'idle' })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setContinuation({ cursor, error, status: 'error' })
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [continuation.status, gateway, page, sessionId, workspaceId])

  return (
    <>
      <section className="aw-summary-section">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.evidence', { defaultValue: '评分证据' })}</h2>
            <p>
              {t('interviewSummary.evidenceDescription', {
                defaultValue: '报告摘录必须定位到本 Session 的真实转录，才标记为已核验。'
              })}
            </p>
          </div>
        </div>
        <div className="aw-evidence-list">
          {report.rubricScores.map((score) => {
            /** @brief 可安全展示的维度名称 / Safely displayable dimension name. */
            const dimension = matchingDimension(report, scenario, score.dimensionId)
            return (
              <details className="aw-evidence-item" key={score.dimensionId}>
                <summary>
                  <span>{dimension?.name ?? score.dimensionId}</span>
                  <strong>{score.evidence.length}</strong>
                </summary>
                <p>{score.summary.plainText}</p>
                {score.evidence.map((claim) => {
                  /** @brief 当前加载范围中的核验结果 / Verification result in the loaded range. */
                  const verification = verifyEvidence(claim, segments, page.hasMore)
                  return (
                    <article
                      className={`aw-evidence-claim aw-evidence-claim--${verification.status}`}
                      key={`${score.dimensionId}:${claim.segmentId}:${claim.startMs}`}
                    >
                      {claim.quote !== null ? (
                        <blockquote>
                          <Quote aria-hidden="true" size={15} />
                          <span>
                            <small>
                              {t('interviewSummary.reportQuote', {
                                defaultValue: '报告摘录（不是核验证明）'
                              })}
                            </small>
                            {claim.quote}
                          </span>
                        </blockquote>
                      ) : null}
                      {verification.status === 'confirmed' ? (
                        <button
                          className="aw-quiet-button"
                          onClick={(): void => {
                            /** @brief 对应权威 Transcript DOM 节点 / Corresponding authoritative Transcript DOM node. */
                            const target = document.getElementById(
                              `interview-transcript-${verification.segment.id}`
                            )
                            target?.focus()
                            target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }}
                          type="button"
                        >
                          <CheckCircle2 aria-hidden="true" size={14} />
                          {t('interviewSummary.evidenceConfirmed', {
                            defaultValue: '已在转录中定位'
                          })}
                        </button>
                      ) : verification.status === 'pending' ? (
                        <span className="aw-status">
                          {t('interviewSummary.evidencePending', {
                            defaultValue: '继续加载转录以核验'
                          })}
                        </span>
                      ) : (
                        <span className="aw-inline-warning" role="status">
                          <ShieldAlert aria-hidden="true" size={14} />
                          {verification.status === 'missing'
                            ? t('interviewSummary.evidenceMissing', {
                                defaultValue: '完整转录中未找到该片段，证据未核验'
                              })
                            : t('interviewSummary.evidenceRangeInvalid', {
                                defaultValue: '证据时间超出真实片段范围，证据未核验'
                              })}
                        </span>
                      )}
                    </article>
                  )
                })}
              </details>
            )
          })}
        </div>
      </section>

      <section className="aw-summary-section" id="interview-transcript">
        <div className="aw-section-heading">
          <div>
            <h2>{t('interviewSummary.transcript', { defaultValue: '面试转录' })}</h2>
            <p>
              {t('interviewSummary.transcriptDescription', {
                defaultValue: '这里展示 Session 的权威持久片段，包括系统事件。'
              })}
            </p>
          </div>
        </div>
        <ol className="aw-interview-transcript-list">
          {segments.map((segment) => (
            <li
              className={`aw-interview-transcript-segment aw-interview-transcript-segment--${segment.speaker}`}
              id={`interview-transcript-${segment.id}`}
              key={segment.id}
              tabIndex={-1}
            >
              <div>
                <strong>
                  {t(`interviewTranscript.speaker.${segment.speaker}`, {
                    defaultValue:
                      segment.speaker === 'candidate'
                        ? '你'
                        : segment.speaker === 'interviewer'
                          ? '面试官'
                          : '系统'
                  })}
                </strong>
                <time>
                  {formatOffset(segment.startMs)}–{formatOffset(segment.endMs)}
                </time>
              </div>
              <p>{segment.text}</p>
            </li>
          ))}
        </ol>
        {continuation.status === 'error' ? (
          <div className="aw-inline-error" role="alert">
            <ResourceFailureMessage error={continuation.error} />
            <button className="aw-quiet-button" onClick={() => void loadMore()} type="button">
              {t('common.retry', { defaultValue: '重试' })}
            </button>
          </div>
        ) : null}
        {page.hasMore ? (
          <button
            className="aw-quiet-button"
            disabled={continuation.status === 'loading'}
            onClick={() => void loadMore()}
            type="button"
          >
            {continuation.status === 'loading'
              ? t('interviewSummary.loadingMoreTranscript', {
                  defaultValue: '正在加载更多转录…'
                })
              : t('interviewSummary.loadMoreTranscript', { defaultValue: '加载更多转录' })}
          </button>
        ) : (
          <p className="aw-interview-transcript-end">
            {t('interviewSummary.transcriptEnd', { defaultValue: '已加载完整转录' })}
          </p>
        )}
      </section>
    </>
  )
}

/** @brief 报告与 Transcript 属性 / Report-and-Transcript properties. */
interface InterviewReportExperienceProps {
  /** @brief Interview REST 端口 / Interview REST port. */
  readonly gateway: InterviewGateway
  /** @brief 权威报告 ID / Authoritative Report ID. */
  readonly reportId: NonNullable<
    InterviewSessionRouteAuthority['sessionAuthority']['session']['reportId']
  >
  /** @brief 当前场景 / Current Scenario. */
  readonly scenario: UiInterviewScenario
  /** @brief 当前 Session authority / Current Session authority. */
  readonly sessionAuthority: UiInterviewSessionAuthority
  /** @brief Workspace identity / Workspace identity. */
  readonly workspaceId: UiWorkspaceId
}

/**
 * @brief 独立加载 Report，并让 Transcript 失败不阻塞报告主体 / Load Report independently so Transcript failures do not block the report body.
 * @param props Report、Session 与端口 / Report, Session, and port.
 * @return 报告主体与可选证据核验 / Report body and optional evidence verification.
 */
function InterviewReportExperience({
  gateway,
  reportId,
  scenario,
  sessionAuthority,
  workspaceId
}: InterviewReportExperienceProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 权威 Session / Authoritative Session. */
  const session = sessionAuthority.session
  /** @brief 读取并交叉核对 Report / Read and cross-check the Report. */
  const loadReport = useCallback(
    async (signal: AbortSignal): Promise<UiInterviewReport> => {
      /** @brief API v2 Report / API v2 Report. */
      const report = await gateway.getInterviewReport({
        reportId,
        signal,
        workspaceId
      })
      if (
        report.id !== reportId ||
        report.workspaceId !== workspaceId ||
        report.sessionId !== session.id
      ) {
        throw new Error('The Interview Report does not belong to this Session.')
      }
      return report
    },
    [gateway, reportId, session.id, workspaceId]
  )
  /** @brief 报告异步资源 / Asynchronous Report resource. */
  const report = useAsyncResource('interview.summary', loadReport, reportId)

  if (report.status === 'loading') {
    return (
      <LoadingState label={t('interviewSummary.loading', { defaultValue: '正在加载面试报告…' })} />
    )
  }
  if (report.status === 'error') {
    return (
      <ResourceErrorState
        error={report.error}
        onRetry={report.retry}
        title={t('interviewSummary.error', { defaultValue: '无法加载面试报告' })}
      />
    )
  }

  return (
    <>
      <InterviewReportBody report={report.data} scenario={scenario} />
      {session.recording.storeTranscript ? (
        <PersistedTranscriptEvidence
          gateway={gateway}
          report={report.data}
          scenario={scenario}
          sessionId={session.id}
          workspaceId={workspaceId}
        />
      ) : (
        <section className="aw-summary-section">
          <h2>{t('interviewSummary.evidence', { defaultValue: '评分证据' })}</h2>
          <p className="aw-inline-warning" role="status">
            {t('interviewSummary.transcriptNotStored', {
              defaultValue: '本次会话未保存文字转录，因此报告证据无法逐条核验。'
            })}
          </p>
        </section>
      )}
      {report.data.limitations.length > 0 ? (
        <section className="aw-summary-section aw-summary-limitations">
          <h2>{t('interviewSummary.limitations', { defaultValue: '报告限制' })}</h2>
          <ul>
            {report.data.limitations.map((item, index) => (
              <li key={`${index}:${item}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** @brief 持久 Transcript Evidence 属性 / Persisted Transcript Evidence properties. */
type PersistedTranscriptEvidenceProps = Omit<LoadedTranscriptEvidenceProps, 'initialPage'>

/**
 * @brief 读取 Transcript 首页而不阻塞 Report / Read the first Transcript page without blocking the Report.
 * @param props 报告、场景与资源 identities / Report, Scenario, and resource identities.
 * @return Transcript 加载、错误或可增量核验状态 / Transcript loading, error, or incrementally verifiable state.
 */
function PersistedTranscriptEvidence(props: PersistedTranscriptEvidenceProps): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 读取 Transcript 首页 / Read the first Transcript page. */
  const loadTranscript = useCallback(
    (signal: AbortSignal) =>
      props.gateway.listInterviewTranscriptPage({
        cursor: null,
        limit: INTERVIEW_TRANSCRIPT_PAGE_LIMIT,
        sessionId: props.sessionId,
        signal,
        workspaceId: props.workspaceId
      }),
    [props.gateway, props.sessionId, props.workspaceId]
  )
  /** @brief Transcript 首页异步资源 / Asynchronous first Transcript page. */
  const transcript = useAsyncResource(
    'interview.summary',
    loadTranscript,
    `${props.workspaceId}:${props.sessionId}`
  )

  if (transcript.status === 'loading') {
    return (
      <section className="aw-summary-section">
        <LoadingState
          label={t('interviewSummary.transcriptLoading', {
            defaultValue: '正在加载转录以核验证据…'
          })}
        />
      </section>
    )
  }
  if (transcript.status === 'error') {
    return (
      <section className="aw-summary-section">
        <ResourceErrorState
          error={transcript.error}
          onRetry={transcript.retry}
          title={t('interviewSummary.transcriptError', {
            defaultValue: '报告已就绪，但转录暂时无法加载'
          })}
        />
      </section>
    )
  }
  return (
    <LoadedTranscriptEvidence
      {...props}
      initialPage={transcript.data}
      key={`${props.sessionId}:${transcript.data.nextCursor ?? 'end'}`}
    />
  )
}

/**
 * @brief 驱动可恢复的 Report Job 并呈现明确恢复动作 / Drive a recoverable Report Job and present explicit recovery actions.
 * @param props 当前 Session scope 与权威刷新动作 / Current Session scope and authority refresh action.
 * @return 不会静默重放未知 POST 的报告生成面板 / Report-generation panel that never silently replays an indeterminate POST.
 */
function ReportGenerationPanel({
  authority,
  onReady
}: {
  readonly authority: InterviewSessionRouteAuthority
  readonly onReady: () => void
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 应用级可恢复报告流程 / Application-level recoverable report process. */
  const process = useInterviewReportProcess()
  /** @brief 当前稳定流程 scope / Current stable process scope. */
  const scope = useMemo(
    () =>
      ({
        principalSubject: authority.principalSubject,
        sessionId: authority.sessionAuthority.session.id,
        workspaceId: authority.workspaceId
      }) as const,
    [authority.principalSubject, authority.sessionAuthority.session.id, authority.workspaceId]
  )
  /** @brief 当前页面可见流程状态 / Current page-visible process state. */
  const [state, setState] = useState<ReportGenerationState>(() => {
    /** @brief 当前 scope 的无秘密恢复事实 / Secret-free recovery fact for the current scope. */
    const recovery = process.getRecovery(scope)
    if (recovery?.status === 'confirmation-required') {
      return { recovery, status: 'confirmation-required' }
    }
    if (recovery?.status === 'authority-review-required') {
      return { status: 'authority-review-required' }
    }
    return recovery?.status === 'job-accepted'
      ? { phase: 'job-accepted', status: 'working' }
      : { status: 'idle' }
  })
  /** @brief 当前运行的请求控制器 / Controller for the currently running request. */
  const requestRef = useRef<AbortController | null>(null)
  /** @brief 确认冷却到期触发器 / Confirmation-cooldown expiry trigger. */
  const [clock, setClock] = useState(() => Date.now())

  /**
   * @brief 将流程结果投影到页面状态 / Project a process outcome into page state.
   * @param outcome 已核验流程结果 / Validated process outcome.
   */
  const acceptOutcome = useCallback(
    (outcome: Awaited<ReturnType<(typeof process)['start']>>): void => {
      if (outcome.status === 'ready') {
        onReady()
        return
      }
      if (outcome.status === 'confirmation-required') {
        setState({ recovery: outcome.recovery, status: 'confirmation-required' })
        return
      }
      if (outcome.status === 'authority-review-required') {
        setState({ status: 'authority-review-required' })
        return
      }
      if (outcome.status === 'job-terminal') {
        setState({ jobStatus: outcome.authority.job.status, status: 'job-terminal' })
        return
      }
      setState({ status: 'idle' })
    },
    [onReady]
  )

  /**
   * @brief 执行一个显式流程动作 / Execute one explicit process action.
   * @param action 新建、只读恢复或用户确认 / Start, read-only recovery, or user confirmation.
   */
  const run = useCallback(
    (action: 'start' | 'recover' | 'confirm'): void => {
      requestRef.current?.abort()
      /** @brief 本次动作的生命周期 / Lifecycle for this action. */
      const controller = new AbortController()
      requestRef.current = controller
      setState({ phase: 'job-accepted', status: 'working' })
      void process[action](scope, controller.signal, (observation): void => {
        setState({ phase: observation.status, status: 'working' })
      })
        .then(acceptOutcome)
        .catch((error: unknown): void => {
          if (!controller.signal.aborted) setState({ error, status: 'error' })
        })
    },
    [acceptOutcome, process, scope]
  )

  useEffect(() => {
    /** @brief 首次挂载时的恢复事实 / Recovery fact on first mount. */
    const recovery = process.getRecovery(scope)
    if (recovery?.status === 'job-accepted') {
      /** @brief 页面重载后的只读恢复控制器 / Read-only recovery controller after page reload. */
      const controller = new AbortController()
      requestRef.current = controller
      void process
        .recover(scope, controller.signal, (observation): void => {
          setState({ phase: observation.status, status: 'working' })
        })
        .then(acceptOutcome)
        .catch((error: unknown): void => {
          if (!controller.signal.aborted) setState({ error, status: 'error' })
        })
    }
    return (): void => {
      requestRef.current?.abort()
    }
  }, [acceptOutcome, process, scope])

  useEffect(() => {
    if (
      state.status !== 'confirmation-required' ||
      state.recovery.confirmAfterMilliseconds === null
    ) {
      return
    }
    /** @brief 距离允许确认的剩余时间 / Remaining time until confirmation is allowed. */
    const delay = Math.max(0, state.recovery.confirmAfterMilliseconds - Date.now())
    if (delay === 0) return
    /** @brief 到期后启用确认按钮的计时器 / Timer enabling the confirmation button at expiry. */
    const timer = globalThis.setTimeout(() => setClock(Date.now()), delay)
    return (): void => globalThis.clearTimeout(timer)
  }, [state])

  /** @brief 未知写入是否已经允许确认 / Whether the indeterminate write may now be confirmed. */
  const confirmationReady =
    state.status !== 'confirmation-required' ||
    state.recovery.confirmAfterMilliseconds === null ||
    state.recovery.confirmAfterMilliseconds <= clock

  return (
    <section className="aw-summary-section aw-interview-report-pending">
      <Target aria-hidden="true" size={22} />
      <div>
        <h2>{t('interviewSession.reportPending', { defaultValue: '报告尚未生成' })}</h2>
        {state.status === 'working' ? (
          <LoadingState
            label={
              state.phase === 'report-publishing'
                ? t('interviewSession.reportPublishing', { defaultValue: '正在发布报告…' })
                : t('interviewSession.reportGenerating', { defaultValue: '正在生成报告…' })
            }
          />
        ) : (
          <>
            <p>
              {state.status === 'confirmation-required'
                ? t('interviewSession.reportConfirmDescription', {
                    defaultValue:
                      '上一次请求的结果未知。确认后将使用完全相同的请求标识重试，不会创建新的意图。'
                  })
                : state.status === 'authority-review-required'
                  ? t('interviewSession.reportAuthorityReview', {
                      defaultValue:
                        '旧请求不能安全重放。请只刷新服务端权威状态；如果报告已经发布，页面会自动显示。'
                    })
                  : state.status === 'job-terminal'
                    ? t('interviewSession.reportTerminal', {
                        defaultValue: '报告任务已结束但未产出报告（状态：{{status}}）。',
                        status: state.jobStatus
                      })
                    : t('interviewSession.reportPendingDescription', {
                        defaultValue: '会话已完成，可以启动一次可恢复的报告生成任务。'
                      })}
            </p>
            {state.status === 'error' ? (
              <p role="alert">
                <ResourceFailureMessage error={state.error} />
              </p>
            ) : null}
            {state.status === 'confirmation-required' ? (
              <button
                className="aw-primary-button"
                disabled={!confirmationReady}
                onClick={() => run('confirm')}
                type="button"
              >
                {confirmationReady
                  ? t('interviewSession.confirmReportRetry', {
                      defaultValue: '确认原样重试'
                    })
                  : t('interviewSession.confirmReportWait', { defaultValue: '稍后可确认' })}
              </button>
            ) : state.status === 'authority-review-required' ? (
              <button className="aw-quiet-button" onClick={() => run('recover')} type="button">
                <RefreshCw aria-hidden="true" size={15} />
                {t('interviewSession.reviewAuthority', { defaultValue: '刷新权威状态' })}
              </button>
            ) : (
              <button className="aw-primary-button" onClick={() => run('start')} type="button">
                <Target aria-hidden="true" size={15} />
                {state.status === 'job-terminal'
                  ? t('interviewSession.restartReport', { defaultValue: '重新生成报告' })
                  : t('interviewSession.generateReport', { defaultValue: '生成报告' })}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * @brief 呈现一个 Session 的权威生命周期 / Present the authoritative lifecycle of one Session.
 * @param props 路由权威与刷新动作 / Route authority and refresh action.
 * @return Session 状态、可选 Report 与 Transcript / Session state, optional Report, and Transcript.
 */
function InterviewSessionExperience({
  authority,
  onRefresh
}: {
  readonly authority: InterviewSessionRouteAuthority
  readonly onRefresh: () => void
}): React.JSX.Element {
  /** @brief 当前界面语言与翻译函数 / Current UI locale and translation function. */
  const { i18n, t } = useTranslation()
  /** @brief Interview REST 端口 / Interview REST port. */
  const gateway = useInterviewGateway()
  /** @brief 权威 Session / Authoritative Session. */
  const session = authority.sessionAuthority.session
  /** @brief 状态展示文案 / Status display copy. */
  const statusLabel = t(`interviewSession.status.${session.status}`, {
    defaultValue:
      {
        active: '进行中',
        cancelled: '已取消',
        completed: '已完成',
        connecting: '连接中',
        created: '已创建',
        ending: '正在结束',
        failed: '失败'
      }[session.status] ?? session.status
  })

  return (
    <div className="aw-page aw-interview-summary-page">
      <header className="aw-summary-header">
        <div>
          <p className="aw-eyebrow">{authority.workspaceName}</p>
          <span className={`aw-status aw-status--interview-${session.status}`}>{statusLabel}</span>
          <h1 className="aw-page-title">{session.jobTarget.title}</h1>
          <p className="aw-page-description">
            {authority.scenario.name}
            {session.jobTarget.company === null ? '' : ` · ${session.jobTarget.company}`}
          </p>
        </div>
        <button className="aw-quiet-button" onClick={onRefresh} type="button">
          <RefreshCw aria-hidden="true" size={15} />
          {t('interviewSession.refresh', { defaultValue: '刷新会话状态' })}
        </button>
      </header>

      <section className="aw-interview-session-facts">
        <div>
          <Clock3 aria-hidden="true" size={16} />
          <span>{t('interviewSession.createdAt', { defaultValue: '创建时间' })}</span>
          <time dateTime={session.createdAt}>
            {formatTimestamp(session.createdAt, i18n.language)}
          </time>
        </div>
        <div>
          <FileText aria-hidden="true" size={16} />
          <span>{t('interviewSession.transcriptPolicy', { defaultValue: '文字转录' })}</span>
          <strong>
            {session.recording.storeTranscript
              ? t('interviewSession.transcriptStored', {
                  defaultValue: '保存 {{days}} 天',
                  days: session.recording.retentionDays
                })
              : t('interviewSession.transcriptNotStored', { defaultValue: '不保存' })}
          </strong>
        </div>
      </section>

      {session.reportId !== null ? (
        <InterviewReportExperience
          gateway={gateway}
          reportId={session.reportId}
          scenario={authority.scenario}
          sessionAuthority={authority.sessionAuthority}
          workspaceId={authority.workspaceId}
        />
      ) : session.status === 'completed' ? (
        <ReportGenerationPanel authority={authority} onReady={onRefresh} />
      ) : session.status === 'ending' ? (
        <section className="aw-summary-section">
          <LoadingState
            label={t('interviewSession.ending', { defaultValue: '服务端正在结束会话…' })}
          />
        </section>
      ) : session.status === 'failed' || session.status === 'cancelled' ? (
        <EmptyState
          action={
            <Link className="aw-primary-button" to="/interviews/new">
              <RotateCcw aria-hidden="true" size={15} />
              {t('interviewSession.newPractice', { defaultValue: '创建新练习' })}
            </Link>
          }
          description={t('interviewSession.terminalDescription', {
            defaultValue: '该会话没有可生成的报告。你可以返回记录或创建新练习。'
          })}
          title={statusLabel}
          visual={<ShieldAlert aria-hidden="true" size={22} />}
        />
      ) : (
        <section className="aw-summary-section">
          <h2>{t('interviewSession.notCompleted', { defaultValue: '会话尚未完成' })}</h2>
          <p>
            {t('interviewSession.realtimeBoundary', {
              defaultValue:
                '当前页面只展示持久 Session 权威；未冻结的 realtime 帧协议不会在浏览器里伪造。'
            })}
          </p>
        </section>
      )}

      <footer className="aw-summary-actions">
        <Link className="aw-quiet-button" to="/interviews">
          <ArrowLeft aria-hidden="true" size={15} />
          {t('interviewSession.back', { defaultValue: '返回会话记录' })}
        </Link>
        <Link className="aw-primary-button" to="/interviews/new">
          <RotateCcw aria-hidden="true" size={15} />
          {t('interviewSession.newPractice', { defaultValue: '创建新练习' })}
        </Link>
      </footer>
    </div>
  )
}

/**
 * @brief 统一的 Interview Session 生命周期路由页 / Unified Interview Session lifecycle route page.
 * @return 从 Session 状态到 Report/Transcript 的单一页面 / One page spanning Session state through Report and Transcript.
 */
export function InterviewRoomPage(): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 路由 Session identity / Session identity from the route. */
  const { sessionId = '' } = useParams()
  /** @brief Interview REST 端口 / Interview REST port. */
  const gateway = useInterviewGateway()
  /** @brief Workspace 会话 / Workspace session. */
  const workspaceSession = useWorkspaceSession()
  /** @brief Workspace 选择修订 / Workspace-selection revision. */
  const selectionRevision = useSyncExternalStore(
    workspaceSession.subscribe,
    workspaceSession.getSelectionRevision,
    workspaceSession.getSelectionRevision
  )
  /** @brief 路由中的品牌化 Session ID / Branded Session ID from the route. */
  const requestedSessionId = asUiOpaqueId<'interview-session'>(sessionId)
  /** @brief 读取 Session、Scenario 与 principal 权威 / Read Session, Scenario, and principal authority. */
  const loadSession = useCallback(
    async (signal: AbortSignal): Promise<InterviewSessionRouteAuthority> => {
      /** @brief 当前 Workspace 访问权威 / Current Workspace access authority. */
      const access = await workspaceSession.getAccess()
      signal.throwIfAborted()
      if (workspaceSession.getSelectionRevision() !== selectionRevision) {
        throw new DOMException('Workspace selection changed.', 'AbortError')
      }
      /** @brief 当前 Workspace / Current Workspace. */
      const current = access.currentWorkspaceAccess
      if (current === undefined) throw new Error('No Workspace is available for this Session.')
      /** @brief Session 与强 ETag / Session and strong ETag. */
      const sessionAuthority = await gateway.getInterviewSession({
        sessionId: requestedSessionId,
        signal,
        workspaceId: current.workspace.id
      })
      /** @brief Session 引用的当前 Scenario / Current Scenario referenced by the Session. */
      const scenarioAuthority = await gateway.getInterviewScenario({
        scenarioId: sessionAuthority.session.scenarioId,
        signal,
        workspaceId: current.workspace.id
      })
      signal.throwIfAborted()
      return {
        principalSubject: access.currentUser.subject,
        scenario: scenarioAuthority.scenario,
        sessionAuthority,
        workspaceId: current.workspace.id,
        workspaceName: current.workspace.name
      }
    },
    [gateway, requestedSessionId, selectionRevision, workspaceSession]
  )
  /** @brief Session 路由异步权威 / Asynchronous Session-route authority. */
  const authority = useAsyncResource(
    'interview.runtime',
    loadSession,
    `${selectionRevision}:${sessionId}`
  )

  if (authority.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState
          label={t('interviewSession.loading', { defaultValue: '正在加载面试会话…' })}
        />
      </div>
    )
  }
  if (authority.status === 'error') {
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={authority.error}
          onRetry={authority.retry}
          title={t('interviewSession.error', { defaultValue: '无法加载面试会话' })}
        />
      </div>
    )
  }
  return (
    <InterviewSessionExperience
      authority={authority.data}
      key={`${authority.data.workspaceId}:${authority.data.sessionAuthority.session.id}:${authority.data.sessionAuthority.session.revision}`}
      onRefresh={authority.retry}
    />
  )
}
