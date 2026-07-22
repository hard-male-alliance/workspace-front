import { ArrowRight, Clock3, LogOut, MessageSquareText, Mic, Radio, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAsyncResource, useInterviewGateway } from '../../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState, ResourceFailureMessage } from '../../../app/ResourceErrorState'
import { classifyResourceFailure, requiresAuthorityReload } from '../../../app/resource-errors'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import { LoadingState } from '../../../ui'
import type { UiInterviewRuntimeModel, UiTranscriptEntry } from '../domain/models'

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function InterviewMessage({ entry }: { readonly entry: UiTranscriptEntry }): React.JSX.Element {
  const { t } = useTranslation()
  const isInterviewer = entry.speaker === 'interviewer'

  return (
    <article className={`aw-interview-message aw-interview-message--${entry.speaker}`}>
      <div className="aw-interview-message-meta">
        <span className="aw-interview-speaker">
          {isInterviewer
            ? t('interviewRoom.interviewer', { defaultValue: 'AI 面试官' })
            : t('interviewRoom.candidate', { defaultValue: '你' })}
        </span>
        <span>{formatElapsed(Math.floor(entry.startMs / 1000))}</span>
      </div>
      <p>{entry.text}</p>
    </article>
  )
}

function InterviewRoom({ initialRuntime }: { readonly initialRuntime: UiInterviewRuntimeModel }) {
  const { t } = useTranslation()
  const interview = useInterviewGateway()
  const diagnostics = useDiagnostics()
  const navigate = useNavigate()
  const [runtime, setRuntime] = useState(initialRuntime)
  const [isSubmitting, setSubmitting] = useState(false)
  /** @brief 最近一次回答提交错误 / Latest answer-submission error. */
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [isExitOpen, setExitOpen] = useState(false)
  const [isEnding, setEnding] = useState(false)
  /** @brief 最近一次结束会话错误 / Latest session-end error. */
  const [exitError, setExitError] = useState<unknown>(null)
  /** @brief 是否正在重新读取权威会话状态 / Whether authoritative session state is being reloaded. */
  const [isReloadingAuthority, setReloadingAuthority] = useState(false)
  /** @brief 权威会话重新读取错误 / Authoritative-session reload error. */
  const [authorityReloadError, setAuthorityReloadError] = useState<unknown>(null)
  /** @brief 回答提交失败后是否必须重新读取权威会话 / Whether answer failure requires an authoritative session reload. */
  const submitAuthorityReloadRequired = submitError !== null && requiresAuthorityReload(submitError)
  /** @brief 结束会话失败后是否必须重新读取权威会话 / Whether end-session failure requires an authoritative session reload. */
  const exitAuthorityReloadRequired = exitError !== null && requiresAuthorityReload(exitError)
  /** @brief 回答结果是否仍无法由当前契约证明 / Whether the answer outcome remains unprovable under the current contract. */
  const submitOutcomeUnknown =
    submitError !== null && classifyResourceFailure(submitError).kind === 'outcome-unknown'
  /** @brief 结束结果是否仍无法由当前契约证明 / Whether the end-session outcome remains unprovable under the current contract. */
  const exitOutcomeUnknown =
    exitError !== null && classifyResourceFailure(exitError).kind === 'outcome-unknown'
  const isOvertime = runtime.elapsedSeconds > runtime.estimatedDurationMinutes * 60
  const isCompletionReady = runtime.phase === 'completion_ready'

  const submitAnswer = (): void => {
    if (
      isSubmitting ||
      submitAuthorityReloadRequired ||
      runtime.currentTranscript.trim().length === 0
    )
      return
    setSubmitting(true)
    setSubmitError(null)
    void runDiagnosticCommand(
      diagnostics,
      { operation: 'interview.answer_submit', scope: 'interview' },
      () => interview.submitInterviewAnswer(runtime.session.id)
    )
      .then((nextRuntime) => {
        setRuntime(nextRuntime)
        setSubmitting(false)
      })
      .catch((error: unknown) => {
        setSubmitError(error)
        setSubmitting(false)
      })
  }

  const statusLabel = isCompletionReady
    ? t('interviewRoom.completed', { defaultValue: 'AI 已完成本次面试' })
    : isSubmitting
      ? t('interviewRoom.submitting', { defaultValue: '正在提交回答' })
      : runtime.session.media.userAudio
        ? t('interviewRoom.listening', { defaultValue: '正在聆听' })
        : t('interviewRoom.active', { defaultValue: '面试进行中' })

  const confirmExit = (): void => {
    if (isEnding || exitAuthorityReloadRequired) return
    setEnding(true)
    setExitError(null)
    void interview
      .endInterview(runtime.session.id)
      .then(() => navigate('/interviews'))
      .catch((error: unknown) => {
        setExitError(error)
        setEnding(false)
      })
  }

  /**
   * @brief 在写结果需要确认时重新读取权威会话状态 / Reload authoritative session state when a write result needs confirmation.
   * @return 读取完成的 Promise / Promise fulfilled after the read settles.
   * @note 不会重放原回答或结束命令 / Never replays the original answer or session-end command.
   */
  const reloadAuthoritativeRuntime = async (): Promise<void> => {
    if (isReloadingAuthority) return
    setReloadingAuthority(true)
    setAuthorityReloadError(null)
    try {
      /** @brief 服务端重新读取的权威运行态 / Authoritative runtime re-read from the service. */
      const authoritativeRuntime = await interview.getInterviewRuntime(runtime.session.id)
      setRuntime(authoritativeRuntime)
      if (!submitOutcomeUnknown) setSubmitError(null)
      if (!exitOutcomeUnknown) setExitError(null)
    } catch (error: unknown) {
      setAuthorityReloadError(error)
    } finally {
      setReloadingAuthority(false)
    }
  }

  return (
    <div className="aw-page aw-interview-room-page">
      <header className="aw-interview-room-header">
        <div>
          <div className="aw-inline-actions">
            <span
              className={`aw-status ${isCompletionReady ? 'aw-status--ready' : 'aw-status--active'}`}
            >
              {statusLabel}
            </span>
          </div>
          <h1 className="aw-page-title">
            {t('interviewRoom.title', { defaultValue: '模拟面试进行中' })}
          </h1>
          <p className="aw-page-description">
            {runtime.session.jobTarget.title} · {runtime.scenario.name}
          </p>
        </div>
        <div className="aw-interview-room-tools">
          <div className={`aw-interview-timer ${isOvertime ? 'is-overtime' : ''}`}>
            <Clock3 aria-hidden="true" size={16} />
            <span>
              {formatElapsed(runtime.elapsedSeconds)} / {runtime.estimatedDurationMinutes}:00
            </span>
            {isOvertime ? (
              <strong>{t('interviewRoom.overtime', { defaultValue: '已超时' })}</strong>
            ) : null}
          </div>
          <button className="aw-quiet-button" onClick={() => setExitOpen(true)} type="button">
            <LogOut aria-hidden="true" size={15} />
            {t('interviewRoom.exit', { defaultValue: '退出本次练习' })}
          </button>
        </div>
      </header>

      <main
        className="aw-interview-conversation"
        aria-label={t('interviewRoom.conversation', { defaultValue: '面试对话' })}
      >
        <div className="aw-interview-conversation-inner">
          {runtime.transcript.map((entry) => (
            <InterviewMessage entry={entry} key={entry.id} />
          ))}
        </div>
      </main>

      <section className="aw-interview-answer" aria-labelledby="live-transcript-title">
        <div className="aw-interview-answer-status">
          <span className="aw-interview-mic">
            {runtime.session.media.userAudio ? (
              <Mic aria-hidden="true" size={17} />
            ) : (
              <MessageSquareText aria-hidden="true" size={17} />
            )}
          </span>
          <div>
            <h2 id="live-transcript-title">
              {isCompletionReady
                ? t('interviewRoom.interviewComplete', { defaultValue: '面试已经结束' })
                : runtime.session.media.userAudio
                  ? t('interviewRoom.liveTranscript', { defaultValue: '实时语音转写' })
                  : t('interviewRoom.liveResponse', { defaultValue: '实时回答' })}
            </h2>
            <p>
              {isCompletionReady
                ? t('interviewRoom.reviewReady', {
                    defaultValue: '对话已锁定，可以查看本次分析。'
                  })
                : runtime.session.media.userAudio
                  ? t('interviewRoom.readOnly', {
                      defaultValue: '持续监听中；转写只读，无法编辑或撤回。'
                    })
                  : t('interviewRoom.responseReadOnly', {
                      defaultValue: '实时回答内容只读，无法编辑或撤回。'
                    })}
            </p>
          </div>
        </div>
        <output className="aw-interview-live-transcript" aria-live="polite">
          {runtime.currentTranscript ||
            t('interviewRoom.transcriptLocked', { defaultValue: '本轮回答已提交。' })}
        </output>
        {submitError !== null ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('interviewRoom.submitError', {
                defaultValue: '当前回答尚未提交；转写内容仍保留在本页。'
              })}
            </strong>{' '}
            <ResourceFailureMessage error={submitError} />
            {submitAuthorityReloadRequired ? (
              <button
                className="aw-quiet-button"
                disabled={isReloadingAuthority}
                onClick={(): void => {
                  void reloadAuthoritativeRuntime()
                }}
                type="button"
              >
                {isReloadingAuthority
                  ? t('interviewRoom.reloadingSessionState', {
                      defaultValue: '正在重新加载会话状态…'
                    })
                  : t('interviewRoom.reloadSessionState', {
                      defaultValue: '重新加载会话状态'
                    })}
              </button>
            ) : null}
          </div>
        ) : null}
        {authorityReloadError !== null && submitAuthorityReloadRequired ? (
          <div className="aw-inline-error" role="alert">
            <strong>
              {t('interviewRoom.reloadSessionError', {
                defaultValue: '无法重新加载会话状态。'
              })}
            </strong>{' '}
            <ResourceFailureMessage error={authorityReloadError} />
          </div>
        ) : null}
        <div className="aw-interview-answer-actions">
          <span className="aw-interview-privacy">
            <Radio aria-hidden="true" size={13} />
            {runtime.session.media.userAudio
              ? t('interviewRoom.audioPolicy', {
                  defaultValue: '麦克风音频仅用于本次实时面试；保存范围由会话策略决定。'
                })
              : t('interviewRoom.audioDisabled', {
                  defaultValue: '本次会话未启用麦克风采集。'
                })}
          </span>
          {isCompletionReady ? (
            <Link className="aw-primary-button" to={`/interviews/${runtime.session.id}/summary`}>
              <Sparkles aria-hidden="true" size={16} />
              {t('interviewRoom.viewSummary', { defaultValue: '查看面试分析' })}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ) : (
            <button
              className="aw-primary-button"
              disabled={
                isSubmitting ||
                submitAuthorityReloadRequired ||
                runtime.currentTranscript.trim().length === 0
              }
              onClick={submitAnswer}
              type="button"
            >
              {runtime.session.media.userAudio ? (
                <Mic aria-hidden="true" size={16} />
              ) : (
                <MessageSquareText aria-hidden="true" size={16} />
              )}
              {isSubmitting
                ? t('interviewRoom.submitting', { defaultValue: '正在提交回答' })
                : runtime.session.media.userAudio
                  ? t('interviewRoom.submit', { defaultValue: '结束录音并提交' })
                  : t('interviewRoom.submitResponse', { defaultValue: '提交回答' })}
            </button>
          )}
        </div>
      </section>

      {isExitOpen ? (
        <div className="aw-dialog-backdrop" role="presentation">
          <div
            aria-modal="true"
            className="aw-dialog"
            role="dialog"
            aria-labelledby="exit-interview-title"
          >
            <h2 id="exit-interview-title">
              {t('interviewRoom.exitTitle', { defaultValue: '退出本次练习？' })}
            </h2>
            <p>
              {t('interviewRoom.exitDescription', {
                defaultValue: '确认后将请求服务器结束本次会话；收到确认后才会退出。'
              })}
            </p>
            {exitError !== null ? (
              <div className="aw-inline-error" role="alert">
                <strong>
                  {t('interviewRoom.exitError', {
                    defaultValue: '无法确认本次面试已经结束。'
                  })}
                </strong>{' '}
                <ResourceFailureMessage error={exitError} />
                {exitAuthorityReloadRequired ? (
                  <button
                    className="aw-quiet-button"
                    disabled={isReloadingAuthority}
                    onClick={(): void => {
                      void reloadAuthoritativeRuntime()
                    }}
                    type="button"
                  >
                    {isReloadingAuthority
                      ? t('interviewRoom.reloadingSessionState', {
                          defaultValue: '正在重新加载会话状态…'
                        })
                      : t('interviewRoom.reloadSessionState', {
                          defaultValue: '重新加载会话状态'
                        })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {authorityReloadError !== null && exitAuthorityReloadRequired ? (
              <div className="aw-inline-error" role="alert">
                <strong>
                  {t('interviewRoom.reloadSessionError', {
                    defaultValue: '无法重新加载会话状态。'
                  })}
                </strong>{' '}
                <ResourceFailureMessage error={authorityReloadError} />
              </div>
            ) : null}
            <div className="aw-inline-actions">
              <button
                className="aw-quiet-button"
                disabled={isEnding}
                onClick={() => setExitOpen(false)}
                type="button"
              >
                {t('common.continue', { defaultValue: '继续面试' })}
              </button>
              <button
                className="aw-danger-button"
                disabled={isEnding || exitAuthorityReloadRequired}
                onClick={confirmExit}
                type="button"
              >
                {isEnding
                  ? t('interviewRoom.exiting', { defaultValue: '正在结束…' })
                  : t('interviewRoom.confirmExit', { defaultValue: '确认退出' })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function InterviewRoomPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { sessionId = '' } = useParams()
  const interview = useInterviewGateway()
  const loadRuntime = useCallback(
    () => interview.getInterviewRuntime(asUiOpaqueId<'interview-session'>(sessionId)),
    [interview, sessionId]
  )
  const runtime = useAsyncResource('interview.runtime', loadRuntime, sessionId)

  if (runtime.status === 'loading')
    return (
      <div className="aw-page">
        <LoadingState label={t('interviewRoom.loading', { defaultValue: '正在准备模拟面试…' })} />
      </div>
    )
  if (runtime.status === 'error')
    return (
      <div className="aw-page">
        <ResourceErrorState
          error={runtime.error}
          onRetry={runtime.retry}
          title={t('interviewRoom.error', { defaultValue: '无法加载模拟面试' })}
        />
      </div>
    )
  return <InterviewRoom initialRuntime={runtime.data} key={sessionId} />
}
