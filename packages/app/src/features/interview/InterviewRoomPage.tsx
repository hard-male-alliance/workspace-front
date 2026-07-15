import {
  Camera,
  Clock3,
  FileAudio,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  Video,
  Volume2
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAppGateways, useAsyncResource } from '../../app/AppData'
import { asUiOpaqueId } from '../../domain'
import type { UiAvatarOutputMode, UiLiveInterviewModel, UiTranscriptEntry } from '../../domain'
import { ErrorState, LoadingState } from '../../ui'

/** @brief 本地媒体控制反馈类别 / Local media-control feedback kind. */
type LocalInterviewControlNotice = 'reconnect' | 'screen_share' | null

/**
 * @brief 将连接状态映射为本地化资源 key / Map a connection state to a localization resource key.
 * @param connectionState 面试媒体连接状态 / Interview media connection state.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getConnectionStateLabelKey(
  connectionState: UiLiveInterviewModel['connectionState']
): string {
  /** @brief 连接状态到资源 key 的映射 / Mapping from connection state to resource key. */
  const labelKeys: Readonly<Record<UiLiveInterviewModel['connectionState'], string>> = {
    idle: 'interview.connectionStates.idle',
    connecting: 'interview.connectionStates.connecting',
    connected: 'interview.connectionStates.connected',
    reconnecting: 'interview.connectionStates.reconnecting',
    failed: 'interview.connectionStates.failed'
  }
  return labelKeys[connectionState]
}

/**
 * @brief 将数字人输出模式映射为本地化资源 key / Map an avatar output mode to a localization resource key.
 * @param avatarOutputMode 数字人输出模式 / Avatar output mode.
 * @return 对应的 i18n key / Corresponding i18n key.
 */
function getAvatarOutputModeLabelKey(avatarOutputMode: UiAvatarOutputMode): string {
  /** @brief 输出模式到资源 key 的映射 / Mapping from output mode to resource key. */
  const labelKeys: Readonly<Record<UiAvatarOutputMode, string>> = {
    server_video: 'interview.avatarOutputModes.serverVideo',
    client_render: 'interview.avatarOutputModes.clientRender',
    audio_only: 'interview.avatarOutputModes.audioOnly'
  }
  return labelKeys[avatarOutputMode]
}

/**
 * @brief 格式化转录时间 / Format a transcript timestamp.
 * @param milliseconds 片段开始毫秒 / Segment start milliseconds.
 * @return 分秒格式的时间 / Minute-second formatted time.
 */
function formatTranscriptTime(milliseconds: number): string {
  /** @brief 完整秒数 / Whole seconds. */
  const totalSeconds = Math.floor(milliseconds / 1_000)
  /** @brief 分钟数 / Minute count. */
  const minutes = Math.floor(totalSeconds / 60)
  /** @brief 剩余秒数 / Remaining seconds. */
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * @brief 渲染一行实时转录 / Render one live-transcript row.
 * @param props 转录条目 / Transcript entry.
 * @return 语义化转录行 / Semantic transcript row.
 */
function TranscriptLine({ entry }: { readonly entry: UiTranscriptEntry }): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 说话人标签 / Speaker label. */
  const speakerLabel =
    entry.speaker === 'interviewer'
      ? t('interview.interviewer', { defaultValue: '面试官' })
      : t('interview.candidate', { defaultValue: '你' })

  return (
    <div className="aw-transcript-line">
      <span className="aw-transcript-time">{formatTranscriptTime(entry.startMs)}</span>
      <div>
        <p className="aw-list-row-title">
          {speakerLabel}{' '}
          {!entry.isFinal ? (
            <span className="aw-chip">{t('interview.live', { defaultValue: 'Live' })}</span>
          ) : null}
        </p>
        <p className="aw-list-row-meta">{entry.text}</p>
      </div>
    </div>
  )
}

/**
 * @brief 已就绪的模拟面试房间 / Ready mock-interview room.
 * @param props 实时面试模型 / Live-interview model.
 * @return 数字人与字幕并列的面试房间 / Interview room with avatar and transcript.
 */
function InterviewRoomContent({
  liveInterview
}: {
  readonly liveInterview: UiLiveInterviewModel
}): React.JSX.Element {
  /** @brief 翻译函数 / Translation function. */
  const { t } = useTranslation()
  /** @brief 麦克风是否静音 / Whether the microphone is muted. */
  const [isMuted, setMuted] = useState(false)
  /** @brief 摄像头是否关闭 / Whether the camera is off. */
  const [isCameraOff, setCameraOff] = useState(false)
  /** @brief 用户是否确认结束 / Whether the user has confirmed ending. */
  const [hasEnded, setEnded] = useState(false)
  /** @brief 最近一次本地媒体控制反馈 / Most recent local media-control feedback. */
  const [localControlNotice, setLocalControlNotice] = useState<LocalInterviewControlNotice>(null)
  /** @brief 连接状态的翻译 / Localized connection state. */
  const connectionLabel = t(getConnectionStateLabelKey(liveInterview.connectionState), {
    defaultValue: liveInterview.connectionState
  })
  /** @brief 数字人输出模式的翻译 / Localized avatar output mode. */
  const avatarOutputModeLabel = t(
    getAvatarOutputModeLabelKey(liveInterview.session.media.avatarOutputMode),
    { defaultValue: liveInterview.session.media.avatarOutputMode }
  )
  /** @brief 本地控制反馈文字 / Local-control feedback text. */
  const localControlNoticeLabel =
    localControlNotice === 'screen_share'
      ? t('interview.screenShareRequested', {
          defaultValue: 'Local screen-share request recorded (Mock; no media was captured or sent).'
        })
      : localControlNotice === 'reconnect'
        ? t('interview.reconnectRequested', {
            defaultValue:
              'Local reconnect request recorded (Mock; no network connection was created).'
          })
        : null

  return (
    <div className="aw-page">
      <div className="aw-page-header">
        <div>
          <p className="aw-eyebrow">
            {t('interview.liveMode', { defaultValue: '全双工练习模式' })}
          </p>
          <h1 className="aw-page-title">
            {t('interview.title', { defaultValue: '数字人模拟面试' })}
          </h1>
          <p className="aw-page-description">
            {liveInterview.scenario.name} · {liveInterview.session.jobTarget.title} ·{' '}
            {liveInterview.scenario.durationMinutes}{' '}
            {t('interview.minutes', { defaultValue: '分钟' })}
          </p>
        </div>
        <div className="aw-inline-actions">
          <span
            className={`aw-status ${liveInterview.connectionState === 'connected' ? 'aw-status--ready' : 'aw-status--active'}`}
          >
            {connectionLabel}
          </span>
          <Link className="aw-quiet-button" to={`/interviews/${liveInterview.session.id}/summary`}>
            {t('interview.viewMockReport', { defaultValue: '查看 Mock 总结' })}
          </Link>
        </div>
      </div>

      <div className="aw-interview-grid">
        <section
          aria-label={t('interview.stageAria', { defaultValue: 'Avatar interview stage' })}
          className="aw-stage"
        >
          <div aria-hidden="true" className="aw-stage-backdrop" />
          <span className="aw-stage-label">
            <Video
              aria-hidden="true"
              size={12}
              style={{ marginRight: 4, verticalAlign: 'text-bottom' }}
            />
            {t('interview.interviewer', { defaultValue: '面试官' })}
          </span>
          <div aria-hidden="true" className="aw-avatar-figure">
            <div className="aw-avatar-body" />
            <div className="aw-avatar-neck" />
            <div className="aw-avatar-head" />
            <div className="aw-avatar-hair" />
          </div>
          <div
            aria-label={t('interview.candidatePreview', {
              defaultValue: 'Candidate camera preview (Mock)'
            })}
            className="aw-self-preview"
          />
          <span className="aw-stage-pill">
            <Volume2
              aria-hidden="true"
              size={12}
              style={{ marginRight: 4, verticalAlign: 'text-bottom' }}
            />
            {avatarOutputModeLabel}
          </span>
          <div className="aw-stage-controls">
            <button
              aria-label={
                isMuted
                  ? t('interview.unmuteMicrophone', { defaultValue: 'Turn on microphone' })
                  : t('interview.muteMicrophone', { defaultValue: 'Mute microphone' })
              }
              className="aw-stage-control"
              onClick={(): void => setMuted((value) => !value)}
              type="button"
            >
              {isMuted ? (
                <MicOff aria-hidden="true" size={17} />
              ) : (
                <Mic aria-hidden="true" size={17} />
              )}
            </button>
            <button
              aria-label={
                isCameraOff
                  ? t('interview.enableCamera', { defaultValue: 'Turn on camera' })
                  : t('interview.disableCamera', { defaultValue: 'Turn off camera' })
              }
              className="aw-stage-control"
              onClick={(): void => setCameraOff((value) => !value)}
              type="button"
            >
              {isCameraOff ? (
                <Camera aria-hidden="true" size={17} />
              ) : (
                <Video aria-hidden="true" size={17} />
              )}
            </button>
            <button
              aria-label={t('interview.shareScreen', { defaultValue: 'Share screen (Mock)' })}
              className="aw-stage-control"
              onClick={(): void => setLocalControlNotice('screen_share')}
              type="button"
            >
              <MonitorUp aria-hidden="true" size={17} />
            </button>
            {hasEnded ? (
              <Link
                className="aw-stage-control aw-stage-control--end"
                to={`/interviews/${liveInterview.session.id}/summary`}
              >
                <FileAudio aria-hidden="true" size={15} />
                {t('interview.openSummary', { defaultValue: '打开总结' })}
              </Link>
            ) : (
              <button
                className="aw-stage-control aw-stage-control--end"
                onClick={(): void => setEnded(true)}
                type="button"
              >
                <PhoneOff aria-hidden="true" size={15} />
                {t('interview.endInterview', { defaultValue: '结束面试' })}
              </button>
            )}
          </div>
          {localControlNoticeLabel !== null ? (
            <p aria-live="polite" className="aw-stage-notice" role="status">
              {localControlNoticeLabel}
            </p>
          ) : null}
        </section>

        <aside className="aw-card aw-preflight" aria-labelledby="interview-context-title">
          <div>
            <h2 className="aw-card-title" id="interview-context-title">
              {t('interview.practiceContext', { defaultValue: '练习上下文' })}
            </h2>
            <p className="aw-card-description">
              {t('interview.contextDescription', {
                defaultValue: '媒体状态与 Agent 可见数据在正式接入时会独立于会话状态管理。'
              })}
            </p>
          </div>
          <div className="aw-preflight-item">
            <span className="aw-muted">{t('interview.scenario', { defaultValue: '场景' })}</span>
            <strong>{liveInterview.scenario.name}</strong>
          </div>
          <div className="aw-preflight-item">
            <span className="aw-muted">
              {t('interview.targetRole', { defaultValue: '目标岗位' })}
            </span>
            <strong>{liveInterview.session.jobTarget.title}</strong>
          </div>
          <div className="aw-preflight-item">
            <span className="aw-muted">
              {t('interview.duration', { defaultValue: '预计时长' })}
            </span>
            <strong>
              <Clock3
                aria-hidden="true"
                size={13}
                style={{ marginRight: 4, verticalAlign: 'text-bottom' }}
              />
              {liveInterview.scenario.durationMinutes}{' '}
              {t('interview.minutes', { defaultValue: 'min' })}
            </strong>
          </div>
          <div className="aw-preflight-item">
            <span className="aw-muted">
              {t('interview.bargeIn', { defaultValue: '可打断数字人' })}
            </span>
            <span
              className={`aw-status ${liveInterview.scenario.allowBargeIn ? 'aw-status--ready' : ''}`}
            >
              {liveInterview.scenario.allowBargeIn
                ? t('interview.enabled', { defaultValue: 'Enabled' })
                : t('interview.disabled', { defaultValue: 'Disabled' })}
            </span>
          </div>
          <div className="aw-preflight-item">
            <span className="aw-muted">
              {t('interview.connection', { defaultValue: '媒体连接' })}
            </span>
            <span className="aw-status aw-status--ready">{connectionLabel}</span>
          </div>
          <p className="aw-setting-help" style={{ margin: 0 }}>
            <ShieldCheck
              aria-hidden="true"
              size={13}
              style={{ marginRight: 5, verticalAlign: 'text-bottom' }}
            />
            {t('interview.mediaNotice', {
              defaultValue: '当前为演示状态；真实音视频会经 WebRTC 传输，控制事件独立处理。'
            })}
          </p>
        </aside>
      </div>

      <section aria-labelledby="live-transcript-title" className="aw-card aw-transcript">
        <div className="aw-inline-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="aw-card-title" id="live-transcript-title">
              {t('interview.liveTranscript', { defaultValue: '实时字幕' })}
            </h2>
            <p className="aw-card-description">{liveInterview.interviewerText}</p>
          </div>
          <button
            aria-label={t('interview.reconnect', { defaultValue: 'Reconnect (Mock)' })}
            className="aw-icon-button"
            onClick={(): void => setLocalControlNotice('reconnect')}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} />
          </button>
        </div>
        <div>
          {liveInterview.transcript.map((entry) => (
            <TranscriptLine entry={entry} key={entry.id} />
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * @brief 模拟面试房间路由页 / Mock-interview room route page.
 * @return 含 loading、error 与面试房间的路由页 / Route page with loading, error, and interview room.
 */
export function InterviewRoomPage(): React.JSX.Element {
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
  /** @brief 稳定的实时面试加载器 / Stable live-interview loader. */
  const loadLiveInterview = useCallback(async (): Promise<UiLiveInterviewModel> => {
    if (sessionId === undefined) {
      throw new Error('An interview session identifier is required.')
    }

    return interview.getLiveInterview(requestedSessionId)
  }, [interview, requestedSessionId, sessionId])
  /** @brief 面试房间异步资源 / Interview-room async resource. */
  const liveInterview = useAsyncResource(loadLiveInterview)

  if (liveInterview.status === 'loading') {
    return (
      <div className="aw-page">
        <LoadingState label={t('status.loadingInterview', { defaultValue: '正在加载模拟面试…' })} />
      </div>
    )
  }

  if (liveInterview.status === 'error') {
    return (
      <div className="aw-page">
        <ErrorState
          description={t('status.errorDescription', {
            defaultValue:
              'Demo data is temporarily unavailable. Try again or return to the workspace.'
          })}
          title={t('status.errorInterview', { defaultValue: '无法加载模拟面试' })}
        />
      </div>
    )
  }

  return <InterviewRoomContent liveInterview={liveInterview.data} />
}
