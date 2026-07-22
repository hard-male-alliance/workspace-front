import { ArrowRight, Clock3, LogOut, MessageSquareText, Mic, Radio, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAsyncResource, useInterviewGateway } from '../../../app/AppData'
import { runDiagnosticCommand, useDiagnostics } from '../../../app/Diagnostics'
import { ResourceErrorState } from '../../../app/ResourceErrorState'
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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isExitOpen, setExitOpen] = useState(false)
  const [isEnding, setEnding] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)
  const isOvertime = runtime.elapsedSeconds > runtime.estimatedDurationMinutes * 60
  const isCompletionReady = runtime.phase === 'completion_ready'

  const submitAnswer = (): void => {
    if (isSubmitting || runtime.currentTranscript.trim().length === 0) return
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
      .catch(() => {
        setSubmitError(
          t('interviewRoom.submitError', {
            defaultValue: '当前回答提交失败，转写内容仍已保留，请重试。'
          })
        )
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
    if (isEnding) return
    setEnding(true)
    setExitError(null)
    void interview
      .endInterview(runtime.session.id)
      .then(() => navigate('/interviews'))
      .catch(() => {
        setExitError(
          t('interviewRoom.exitError', {
            defaultValue: '未能结束本次面试，服务器没有确认退出。请保留当前页面并稍后重试。'
          })
        )
        setEnding(false)
      })
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
          <p className="aw-inline-error" role="alert">
            {submitError}
          </p>
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
              disabled={isSubmitting || runtime.currentTranscript.trim().length === 0}
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
              <p className="aw-inline-error" role="alert">
                {exitError}
              </p>
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
                disabled={isEnding}
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
