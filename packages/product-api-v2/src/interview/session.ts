/** @file InterviewSession、RealtimeConnection 与 Transcript API v2 wire 模型 / InterviewSession, RealtimeConnection, and Transcript API v2 wire models. */

import {
  arrayBetween,
  booleanValue,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  httpUrl,
  opaqueId,
  parseCursorPage,
  parseResourceFields,
  timestamp,
  type CursorCollection,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import type { ResourceReference } from '../resources/resource-reference'
import {
  absoluteUri,
  assertUniqueBy,
  assertUniqueStrings,
  parseInferenceIntent,
  parseInterviewLocale,
  parseKnowledgeSelection,
  parseNullableResourceReference,
  parseNullableString,
  parseNullableTimestamp,
  parseStringArray,
  realtimeUrl,
  type InferenceIntent,
  type KnowledgeSelection
} from './wire'

/** @brief InterviewSession 状态 / InterviewSession state. */
export type InterviewSessionStatus =
  'active' | 'cancelled' | 'completed' | 'connecting' | 'created' | 'ending' | 'failed'

/** @brief Avatar 输出模式 / Avatar output mode. */
export type InterviewAvatarOutputMode = 'audio_only' | 'client_render' | 'none' | 'server_video'

/** @brief 媒体 fallback transport / Media fallback transport. */
export type InterviewFallbackTransport = 'audio_only' | 'none' | 'websocket'

/** @brief Realtime transport / Realtime transport. */
export type InterviewRealtimeTransport = 'webrtc' | 'websocket'

/** @brief Transcript speaker / Transcript speaker. */
export type InterviewTranscriptSpeaker = 'candidate' | 'interviewer' | 'system'

/** @brief Interview 结束原因 / Interview end reason. */
export type InterviewEndReason = 'completed' | 'technical_failure' | 'user_cancelled'

/** @brief 面试职位目标 / Interview job target. */
export interface InterviewJobTarget {
  /** @brief 职位名称 / Job title. */
  readonly title: string
  /** @brief 公司；未知时为 null / Company, or null when unknown. */
  readonly company: string | null
  /** @brief 地点；未知时为 null / Location, or null when unknown. */
  readonly location: string | null
  /** @brief 职位描述；未知时为 null / Job description, or null when unknown. */
  readonly description: string | null
  /** @brief 来源 URL；未知时为 null / Source URL, or null when unknown. */
  readonly source_url: string | null
  /** @brief 职级；未知时为 null / Seniority, or null when unknown. */
  readonly seniority: string | null
  /** @brief 目标技能 / Target skills. */
  readonly skills: readonly string[]
}

/** @brief Interview Avatar 偏好 / Interview Avatar preferences. */
export interface InterviewAvatarPreferences {
  /** @brief 输出模式 / Output mode. */
  readonly output_mode: InterviewAvatarOutputMode
  /** @brief Avatar identity；未选择时为 null / Avatar identity, or null when unselected. */
  readonly avatar_id: string | null
  /** @brief Voice identity；未选择时为 null / Voice identity, or null when unselected. */
  readonly voice_id: string | null
  /** @brief 首选音频 codecs / Preferred audio codecs. */
  readonly preferred_audio_codecs: readonly string[]
  /** @brief 首选视频 codecs / Preferred video codecs. */
  readonly preferred_video_codecs: readonly string[]
  /** @brief 是否请求 viseme / Whether visemes are requested. */
  readonly include_visemes: boolean
  /** @brief 是否请求表情提示 / Whether expression cues are requested. */
  readonly include_expression_cues: boolean
}

/** @brief Interview 媒体偏好 / Interview media preferences. */
export interface InterviewMediaPreferences {
  /** @brief 是否采集用户音频 / Whether user audio is enabled. */
  readonly user_audio: boolean
  /** @brief 是否采集用户视频 / Whether user video is enabled. */
  readonly user_video: boolean
  /** @brief 是否允许屏幕共享 / Whether screen sharing is enabled. */
  readonly screen_share: boolean
  /** @brief 最大视频宽度 / Maximum video width. */
  readonly max_video_width: number
  /** @brief 最大视频高度 / Maximum video height. */
  readonly max_video_height: number
  /** @brief 最大视频帧率 / Maximum video frame rate. */
  readonly max_video_fps: number
  /** @brief Avatar 偏好 / Avatar preferences. */
  readonly avatar: InterviewAvatarPreferences
  /** @brief 媒体降级方式 / Media fallback mode. */
  readonly fallback_transport: InterviewFallbackTransport
}

/** @brief 可审计的录制与转录同意 / Auditable recording and transcript consent. */
export interface RecordingConsent {
  /** @brief 是否录制音频 / Whether audio is recorded. */
  readonly record_audio: boolean
  /** @brief 是否录制视频 / Whether video is recorded. */
  readonly record_video: boolean
  /** @brief 是否保存 transcript / Whether the transcript is stored. */
  readonly store_transcript: boolean
  /** @brief 保留天数 / Retention period in days. */
  readonly retention_days: number
  /** @brief 同意时间；不需要同意时可为 null / Consent time, nullable when no consent is needed. */
  readonly consented_at: string | null
  /** @brief 同意文本版本；不需要同意时可为 null / Consent-text version, nullable when no consent is needed. */
  readonly consent_version: string | null
}

/** @brief 创建持久 InterviewSession 的请求 / Request to create a persistent InterviewSession. */
export interface CreateInterviewSessionRequest {
  /** @brief Scenario identity / Scenario identity. */
  readonly scenario_id: string
  /** @brief 可选 Resume 引用 / Optional Resume reference. */
  readonly resume_ref: ResourceReference | null
  /** @brief 职位目标 / Job target. */
  readonly job_target: InterviewJobTarget
  /** @brief Knowledge 选择 / Knowledge selection. */
  readonly knowledge: KnowledgeSelection
  /** @brief 会话 Locale / Session Locale. */
  readonly locale: string
  /** @brief 媒体偏好 / Media preferences. */
  readonly media: InterviewMediaPreferences
  /** @brief 录制与转录同意 / Recording and transcript consent. */
  readonly recording: RecordingConsent
  /** @brief 推理意图 / Inference intent. */
  readonly inference: InferenceIntent
}

/** @brief API v2 InterviewSession 权威表示 / Authoritative API v2 InterviewSession representation. */
export interface InterviewSession extends ResourceFields {
  /** @brief 所属 Workspace identity / Owning Workspace identity. */
  readonly workspace_id: string
  /** @brief Scenario identity / Scenario identity. */
  readonly scenario_id: string
  /** @brief 创建时冻结的 Resume 引用 / Resume reference frozen at creation. */
  readonly resume_ref: ResourceReference | null
  /** @brief 创建时冻结的职位目标 / Job target frozen at creation. */
  readonly job_target: InterviewJobTarget
  /** @brief 持久状态 / Persistent state. */
  readonly status: InterviewSessionStatus
  /** @brief 会话 Locale / Session Locale. */
  readonly locale: string
  /** @brief 创建时冻结的媒体偏好 / Media preferences frozen at creation. */
  readonly media: InterviewMediaPreferences
  /** @brief 创建时冻结的同意记录 / Consent record frozen at creation. */
  readonly recording: RecordingConsent
  /** @brief 实际开始时间 / Actual start time. */
  readonly started_at: string | null
  /** @brief 实际结束时间 / Actual end time. */
  readonly ended_at: string | null
  /** @brief 当前权威报告 identity / Current authoritative report identity. */
  readonly report_id: string | null
}

/** @brief 创建 RealtimeConnection 请求 / Request to create a RealtimeConnection. */
export interface CreateRealtimeConnectionRequest {
  /** @brief 客户端支持的 transport / Transports supported by the client. */
  readonly supported_transports: readonly InterviewRealtimeTransport[]
  /** @brief 客户端音频 codecs / Client audio codecs. */
  readonly audio_codecs: readonly string[]
  /** @brief 客户端视频 codecs / Client video codecs. */
  readonly video_codecs: readonly string[]
}

/** @brief 短期 ICE server 凭据 / Short-lived ICE-server credentials. */
export interface InterviewIceServer {
  /** @brief STUN/TURN URI / STUN/TURN URIs. */
  readonly urls: readonly string[]
  /** @brief 可选临时用户名 / Optional ephemeral username. */
  readonly username: string | null
  /** @brief 可选临时 credential / Optional ephemeral credential. */
  readonly credential: string | null
}

/** @brief 单 Session、单 audience 的短期 Realtime 描述 / Short-lived, single-session, single-audience Realtime descriptor. */
export interface RealtimeConnection {
  /** @brief Connection identity / Connection identity. */
  readonly id: string
  /** @brief 绑定的 Session identity / Bound Session identity. */
  readonly session_id: string
  /** @brief 已选择 transport / Selected transport. */
  readonly transport: InterviewRealtimeTransport
  /** @brief Signaling URL / Signaling URL. */
  readonly signaling_url: string
  /** @brief 仅供该连接使用的短期 token / Ephemeral token scoped to this connection. */
  readonly ephemeral_token: string
  /** @brief ICE servers / ICE servers. */
  readonly ice_servers: readonly InterviewIceServer[]
  /** @brief 到期时间 / Expiration time. */
  readonly expires_at: string
  /** @brief 心跳周期毫秒数 / Heartbeat interval in milliseconds. */
  readonly heartbeat_interval_ms: number
}

/** @brief 结束 InterviewSession 请求 / Request to end an InterviewSession. */
export interface EndInterviewSessionRequest {
  /** @brief 结束原因 / End reason. */
  readonly reason: InterviewEndReason
}

/** @brief 一条权威 transcript segment / One authoritative transcript segment. */
export interface InterviewTranscriptSegment {
  /** @brief Segment identity / Segment identity. */
  readonly id: string
  /** @brief 发言角色 / Speaker role. */
  readonly speaker: InterviewTranscriptSpeaker
  /** @brief 起始偏移毫秒数 / Start offset in milliseconds. */
  readonly start_ms: number
  /** @brief 结束偏移毫秒数 / End offset in milliseconds. */
  readonly end_ms: number
  /** @brief Transcript 文本 / Transcript text. */
  readonly text: string
}

/**
 * @brief 严格解码 JobTarget / Strictly decode a JobTarget.
 * @param value 未知职位目标 / Unknown job target.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证职位目标 / Validated job target.
 */
export function parseInterviewJobTarget(
  value: unknown,
  path = 'interview_job_target'
): InterviewJobTarget {
  /** @brief 精确职位对象 / Exact job-target object. */
  const input = exactRecord(value, path, [
    'title',
    'company',
    'location',
    'description',
    'source_url',
    'seniority',
    'skills'
  ])
  return {
    company: parseNullableString(input.company, `${path}.company`, 0, 300),
    description: parseNullableString(input.description, `${path}.description`, 0, 100_000),
    location: parseNullableString(input.location, `${path}.location`, 0, 300),
    seniority: parseNullableString(input.seniority, `${path}.seniority`, 0, 100),
    skills: parseStringArray(input.skills, `${path}.skills`, 0, 200, 1, 100, false),
    source_url: input.source_url === null ? null : httpUrl(input.source_url, `${path}.source_url`),
    title: boundedString(input.title, `${path}.title`, 1, 300)
  }
}

/**
 * @brief 严格解码 InterviewAvatarPreferences / Strictly decode InterviewAvatarPreferences.
 * @param value 未知偏好 / Unknown preferences.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证偏好 / Validated preferences.
 */
export function parseInterviewAvatarPreferences(
  value: unknown,
  path = 'interview_avatar_preferences'
): InterviewAvatarPreferences {
  /** @brief 精确 Avatar 偏好 / Exact Avatar preferences. */
  const input = exactRecord(value, path, [
    'output_mode',
    'avatar_id',
    'voice_id',
    'preferred_audio_codecs',
    'preferred_video_codecs',
    'include_visemes',
    'include_expression_cues'
  ])
  return {
    avatar_id: parseNullableString(input.avatar_id, `${path}.avatar_id`, 0, 200),
    include_expression_cues: booleanValue(
      input.include_expression_cues,
      `${path}.include_expression_cues`
    ),
    include_visemes: booleanValue(input.include_visemes, `${path}.include_visemes`),
    output_mode: closedStringEnum(input.output_mode, `${path}.output_mode`, [
      'none',
      'audio_only',
      'client_render',
      'server_video'
    ]),
    preferred_audio_codecs: parseStringArray(
      input.preferred_audio_codecs,
      `${path}.preferred_audio_codecs`,
      0,
      20,
      0,
      80,
      true
    ),
    preferred_video_codecs: parseStringArray(
      input.preferred_video_codecs,
      `${path}.preferred_video_codecs`,
      0,
      20,
      0,
      80,
      true
    ),
    voice_id: parseNullableString(input.voice_id, `${path}.voice_id`, 0, 200)
  }
}

/**
 * @brief 严格解码 InterviewMediaPreferences / Strictly decode InterviewMediaPreferences.
 * @param value 未知偏好 / Unknown preferences.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证偏好 / Validated preferences.
 */
export function parseInterviewMediaPreferences(
  value: unknown,
  path = 'interview_media_preferences'
): InterviewMediaPreferences {
  /** @brief 精确媒体偏好 / Exact media preferences. */
  const input = exactRecord(value, path, [
    'user_audio',
    'user_video',
    'screen_share',
    'max_video_width',
    'max_video_height',
    'max_video_fps',
    'avatar',
    'fallback_transport'
  ])
  return {
    avatar: parseInterviewAvatarPreferences(input.avatar, `${path}.avatar`),
    fallback_transport: closedStringEnum(input.fallback_transport, `${path}.fallback_transport`, [
      'none',
      'audio_only',
      'websocket'
    ]),
    max_video_fps: boundedInteger(input.max_video_fps, `${path}.max_video_fps`, 1, 240),
    max_video_height: boundedInteger(input.max_video_height, `${path}.max_video_height`, 1, 4320),
    max_video_width: boundedInteger(input.max_video_width, `${path}.max_video_width`, 1, 7680),
    screen_share: booleanValue(input.screen_share, `${path}.screen_share`),
    user_audio: booleanValue(input.user_audio, `${path}.user_audio`),
    user_video: booleanValue(input.user_video, `${path}.user_video`)
  }
}

/**
 * @brief 严格解码 RecordingConsent 及条件同意约束 / Strictly decode RecordingConsent and conditional-consent constraints.
 * @param value 未知同意记录 / Unknown consent record.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证同意记录 / Validated consent record.
 */
export function parseRecordingConsent(
  value: unknown,
  path = 'recording_consent'
): RecordingConsent {
  /** @brief 精确同意对象 / Exact consent object. */
  const input = exactRecord(value, path, [
    'record_audio',
    'record_video',
    'store_transcript',
    'retention_days',
    'consented_at',
    'consent_version'
  ])
  /** @brief 是否录制音频 / Whether audio is recorded. */
  const recordAudio = booleanValue(input.record_audio, `${path}.record_audio`)
  /** @brief 是否录制视频 / Whether video is recorded. */
  const recordVideo = booleanValue(input.record_video, `${path}.record_video`)
  /** @brief 是否保存 transcript / Whether the transcript is stored. */
  const storeTranscript = booleanValue(input.store_transcript, `${path}.store_transcript`)
  /** @brief 同意时间 / Consent timestamp. */
  const consentedAt = parseNullableTimestamp(input.consented_at, `${path}.consented_at`)
  /** @brief 同意版本 / Consent version. */
  const consentVersion = parseNullableString(
    input.consent_version,
    `${path}.consent_version`,
    0,
    80
  )
  if (
    (recordAudio || recordVideo || storeTranscript) &&
    (consentedAt === null || consentVersion === null || consentVersion.length === 0)
  ) {
    throw new ApiV2ContractError(
      `API v2 field ${path} requires consented_at and a non-empty consent_version when recording or transcript storage is enabled.`
    )
  }
  return {
    consent_version: consentVersion,
    consented_at: consentedAt,
    record_audio: recordAudio,
    record_video: recordVideo,
    retention_days: boundedInteger(input.retention_days, `${path}.retention_days`, 0, 3650),
    store_transcript: storeTranscript
  }
}

/**
 * @brief 校验录制输入与媒体输入一致 / Validate that recording inputs are enabled in media preferences.
 * @param media 已验证媒体偏好 / Validated media preferences.
 * @param recording 已验证同意记录 / Validated consent record.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertRecordingMediaCompatibility(
  media: InterviewMediaPreferences,
  recording: RecordingConsent,
  path: string
): void {
  if (recording.record_audio && !media.user_audio) {
    throw new ApiV2ContractError(
      `API v2 field ${path}.media.user_audio must be enabled when audio recording is requested.`
    )
  }
  if (recording.record_video && !media.user_video) {
    throw new ApiV2ContractError(
      `API v2 field ${path}.media.user_video must be enabled when video recording is requested.`
    )
  }
}

/**
 * @brief 严格编码 CreateInterviewSessionRequest / Strictly encode a CreateInterviewSessionRequest.
 * @param value 未验证请求 / Unvalidated request.
 * @return canonical 请求快照 / Canonical request snapshot.
 */
export function encodeCreateInterviewSessionRequest(
  value: CreateInterviewSessionRequest
): CreateInterviewSessionRequest {
  /** @brief 精确创建请求 / Exact creation request. */
  const input = exactRecord(value, 'create_interview_session', [
    'scenario_id',
    'resume_ref',
    'job_target',
    'knowledge',
    'locale',
    'media',
    'recording',
    'inference'
  ])
  /** @brief 媒体偏好 / Media preferences. */
  const media = parseInterviewMediaPreferences(input.media, 'create_interview_session.media')
  /** @brief 同意记录 / Consent record. */
  const recording = parseRecordingConsent(input.recording, 'create_interview_session.recording')
  assertRecordingMediaCompatibility(media, recording, 'create_interview_session')
  return {
    inference: parseInferenceIntent(input.inference, 'create_interview_session.inference'),
    job_target: parseInterviewJobTarget(input.job_target, 'create_interview_session.job_target'),
    knowledge: parseKnowledgeSelection(input.knowledge, 'create_interview_session.knowledge'),
    locale: parseInterviewLocale(input.locale, 'create_interview_session.locale'),
    media,
    recording,
    resume_ref: parseNullableResourceReference(
      input.resume_ref,
      'create_interview_session.resume_ref'
    ),
    scenario_id: opaqueId(input.scenario_id, 'create_interview_session.scenario_id')
  }
}

/**
 * @brief 校验 Session 状态与时间字段关联 / Validate Session-state and timestamp associations.
 * @param status Session 状态 / Session state.
 * @param startedAt 开始时间 / Start time.
 * @param endedAt 结束时间 / End time.
 * @param reportId 报告 identity / Report identity.
 * @param path 诊断字段路径 / Diagnostic field path.
 */
function assertInterviewSessionState(
  status: InterviewSessionStatus,
  startedAt: string | null,
  endedAt: string | null,
  reportId: string | null,
  path: string
): void {
  if (
    (status === 'created' || status === 'connecting') &&
    (startedAt !== null || endedAt !== null)
  ) {
    throw new ApiV2ContractError(
      `API v2 field ${path} cannot have lifecycle timestamps before becoming active.`
    )
  }
  if ((status === 'active' || status === 'ending') && (startedAt === null || endedAt !== null)) {
    throw new ApiV2ContractError(
      `API v2 field ${path} requires only started_at while the session is active or ending.`
    )
  }
  if (status === 'completed' && (startedAt === null || endedAt === null)) {
    throw new ApiV2ContractError(
      `API v2 field ${path} requires started_at and ended_at when completed.`
    )
  }
  if ((status === 'failed' || status === 'cancelled') && endedAt === null) {
    throw new ApiV2ContractError(`API v2 field ${path} requires ended_at in a terminal state.`)
  }
  if (reportId !== null && status !== 'completed') {
    throw new ApiV2ContractError(
      `API v2 field ${path}.report_id is only valid for a completed session.`
    )
  }
  if (startedAt !== null && endedAt !== null) {
    /** @brief 可比较的开始 epoch / Comparable start epoch. */
    const startEpoch = Date.parse(startedAt)
    /** @brief 可比较的结束 epoch / Comparable end epoch. */
    const endEpoch = Date.parse(endedAt)
    if (Number.isFinite(startEpoch) && Number.isFinite(endEpoch) && startEpoch > endEpoch) {
      throw new ApiV2ContractError(
        `API v2 field ${path}.started_at cannot be later than ${path}.ended_at.`
      )
    }
  }
}

/**
 * @brief 严格解码 InterviewSession / Strictly decode an InterviewSession.
 * @param value 未知 Session / Unknown Session.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Session / Validated Session.
 */
export function parseInterviewSession(
  value: unknown,
  path = 'interview_session'
): InterviewSession {
  /** @brief 精确 Session 对象 / Exact Session object. */
  const input = exactRecord(value, path, [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'scenario_id',
    'resume_ref',
    'job_target',
    'status',
    'locale',
    'media',
    'recording',
    'started_at',
    'ended_at',
    'report_id'
  ])
  /** @brief 媒体偏好 / Media preferences. */
  const media = parseInterviewMediaPreferences(input.media, `${path}.media`)
  /** @brief 同意记录 / Consent record. */
  const recording = parseRecordingConsent(input.recording, `${path}.recording`)
  assertRecordingMediaCompatibility(media, recording, path)
  /** @brief Session 状态 / Session status. */
  const status = closedStringEnum(input.status, `${path}.status`, [
    'created',
    'connecting',
    'active',
    'ending',
    'completed',
    'failed',
    'cancelled'
  ])
  /** @brief 开始时间 / Start timestamp. */
  const startedAt = parseNullableTimestamp(input.started_at, `${path}.started_at`)
  /** @brief 结束时间 / End timestamp. */
  const endedAt = parseNullableTimestamp(input.ended_at, `${path}.ended_at`)
  /** @brief 报告 identity / Report identity. */
  const reportId = input.report_id === null ? null : opaqueId(input.report_id, `${path}.report_id`)
  assertInterviewSessionState(status, startedAt, endedAt, reportId, path)
  return {
    ...parseResourceFields(input, path),
    ended_at: endedAt,
    job_target: parseInterviewJobTarget(input.job_target, `${path}.job_target`),
    locale: parseInterviewLocale(input.locale, `${path}.locale`),
    media,
    recording,
    report_id: reportId,
    resume_ref: parseNullableResourceReference(input.resume_ref, `${path}.resume_ref`),
    scenario_id: opaqueId(input.scenario_id, `${path}.scenario_id`),
    started_at: startedAt,
    status,
    workspace_id: opaqueId(input.workspace_id, `${path}.workspace_id`)
  }
}

/**
 * @brief 严格解码 InterviewSessionList / Strictly decode an InterviewSessionList.
 * @param value 未知列表 / Unknown list.
 * @return 已验证 cursor 页 / Validated cursor page.
 */
export function parseInterviewSessionList(value: unknown): CursorCollection<InterviewSession> {
  /** @brief 精确列表 / Exact list. */
  const input = exactRecord(value, 'interview_session_list', ['items', 'page'])
  /** @brief 已解码 Session / Decoded Sessions. */
  const items = arrayBetween(input.items, 'interview_session_list.items', 0, 200).map(
    (item, index) => parseInterviewSession(item, `interview_session_list.items[${index}]`)
  )
  assertUniqueBy(items, (session) => session.id, 'interview_session_list.items')
  return {
    items,
    page: parseCursorPage(input.page, 'interview_session_list.page')
  }
}

/**
 * @brief 严格编码 CreateRealtimeConnectionRequest / Strictly encode a CreateRealtimeConnectionRequest.
 * @param value 未验证请求 / Unvalidated request.
 * @return canonical 请求快照 / Canonical request snapshot.
 */
export function encodeCreateRealtimeConnectionRequest(
  value: CreateRealtimeConnectionRequest
): CreateRealtimeConnectionRequest {
  /** @brief 精确请求 / Exact request. */
  const input = exactRecord(value, 'create_realtime_connection', [
    'supported_transports',
    'audio_codecs',
    'video_codecs'
  ])
  /** @brief 支持的 transport / Supported transports. */
  const supportedTransports = arrayBetween(
    input.supported_transports,
    'create_realtime_connection.supported_transports',
    1,
    2
  ).map((item, index) =>
    closedStringEnum(item, `create_realtime_connection.supported_transports[${index}]`, [
      'webrtc',
      'websocket'
    ])
  )
  assertUniqueStrings(supportedTransports, 'create_realtime_connection.supported_transports')
  return {
    audio_codecs: parseStringArray(
      input.audio_codecs,
      'create_realtime_connection.audio_codecs',
      0,
      Number.MAX_SAFE_INTEGER,
      0,
      80,
      true
    ),
    supported_transports: supportedTransports,
    video_codecs: parseStringArray(
      input.video_codecs,
      'create_realtime_connection.video_codecs',
      0,
      Number.MAX_SAFE_INTEGER,
      0,
      80,
      true
    )
  }
}

/**
 * @brief 严格解码 IceServer / Strictly decode an IceServer.
 * @param value 未知 ICE server / Unknown ICE server.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 ICE server / Validated ICE server.
 */
function parseInterviewIceServer(value: unknown, path: string): InterviewIceServer {
  /** @brief 精确 ICE server / Exact ICE server. */
  const input = exactRecord(value, path, ['urls', 'username', 'credential'])
  return {
    credential: parseNullableString(input.credential, `${path}.credential`, 0, 2048),
    urls: arrayBetween(input.urls, `${path}.urls`, 1, Number.MAX_SAFE_INTEGER).map((item, index) =>
      absoluteUri(item, `${path}.urls[${index}]`)
    ),
    username: parseNullableString(input.username, `${path}.username`, 0, 512)
  }
}

/**
 * @brief 严格解码 RealtimeConnection / Strictly decode a RealtimeConnection.
 * @param value 未知 Connection / Unknown Connection.
 * @return 已验证 Connection / Validated Connection.
 */
export function parseRealtimeConnection(value: unknown): RealtimeConnection {
  /** @brief 精确 Connection / Exact Connection. */
  const input = exactRecord(value, 'realtime_connection', [
    'id',
    'session_id',
    'transport',
    'signaling_url',
    'ephemeral_token',
    'ice_servers',
    'expires_at',
    'heartbeat_interval_ms'
  ])
  return {
    ephemeral_token: boundedString(
      input.ephemeral_token,
      'realtime_connection.ephemeral_token',
      20,
      8192
    ),
    expires_at: timestamp(input.expires_at, 'realtime_connection.expires_at'),
    heartbeat_interval_ms: boundedInteger(
      input.heartbeat_interval_ms,
      'realtime_connection.heartbeat_interval_ms',
      1000,
      120_000
    ),
    ice_servers: arrayBetween(input.ice_servers, 'realtime_connection.ice_servers', 0, 20).map(
      (item, index) => parseInterviewIceServer(item, `realtime_connection.ice_servers[${index}]`)
    ),
    id: opaqueId(input.id, 'realtime_connection.id'),
    session_id: opaqueId(input.session_id, 'realtime_connection.session_id'),
    signaling_url: realtimeUrl(input.signaling_url, 'realtime_connection.signaling_url'),
    transport: closedStringEnum(input.transport, 'realtime_connection.transport', [
      'webrtc',
      'websocket'
    ])
  }
}

/**
 * @brief 严格编码 EndInterviewSessionRequest / Strictly encode an EndInterviewSessionRequest.
 * @param value 未验证请求 / Unvalidated request.
 * @return canonical 请求 / Canonical request.
 */
export function encodeEndInterviewSessionRequest(
  value: EndInterviewSessionRequest
): EndInterviewSessionRequest {
  /** @brief 精确请求 / Exact request. */
  const input = exactRecord(value, 'end_interview_session', ['reason'])
  return {
    reason: closedStringEnum(input.reason, 'end_interview_session.reason', [
      'completed',
      'user_cancelled',
      'technical_failure'
    ])
  }
}

/**
 * @brief 严格解码 Transcript segment 并校验时间区间 / Strictly decode a Transcript segment and validate its time interval.
 * @param value 未知 segment / Unknown segment.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 segment / Validated segment.
 */
export function parseInterviewTranscriptSegment(
  value: unknown,
  path = 'interview_transcript_segment'
): InterviewTranscriptSegment {
  /** @brief 精确 segment / Exact segment. */
  const input = exactRecord(value, path, ['id', 'speaker', 'start_ms', 'end_ms', 'text'])
  /** @brief 开始偏移 / Start offset. */
  const startMs = boundedInteger(input.start_ms, `${path}.start_ms`, 0, Number.MAX_SAFE_INTEGER)
  /** @brief 结束偏移 / End offset. */
  const endMs = boundedInteger(input.end_ms, `${path}.end_ms`, 0, Number.MAX_SAFE_INTEGER)
  if (startMs > endMs) {
    throw new ApiV2ContractError(`API v2 field ${path}.start_ms cannot exceed ${path}.end_ms.`)
  }
  return {
    end_ms: endMs,
    id: opaqueId(input.id, `${path}.id`),
    speaker: closedStringEnum(input.speaker, `${path}.speaker`, [
      'interviewer',
      'candidate',
      'system'
    ]),
    start_ms: startMs,
    text: boundedString(input.text, `${path}.text`, 0, 20_000)
  }
}

/**
 * @brief 严格解码 InterviewTranscriptPage / Strictly decode an InterviewTranscriptPage.
 * @param value 未知 transcript 页 / Unknown transcript page.
 * @return 已验证 cursor 页 / Validated cursor page.
 */
export function parseInterviewTranscriptPage(
  value: unknown
): CursorCollection<InterviewTranscriptSegment> {
  /** @brief 精确页对象 / Exact page object. */
  const input = exactRecord(value, 'interview_transcript_page', ['items', 'page'])
  /** @brief 已解码 segments / Decoded segments. */
  const items = arrayBetween(input.items, 'interview_transcript_page.items', 0, 200).map(
    (item, index) =>
      parseInterviewTranscriptSegment(item, `interview_transcript_page.items[${index}]`)
  )
  assertUniqueBy(items, (segment) => segment.id, 'interview_transcript_page.items')
  return {
    items,
    page: parseCursorPage(input.page, 'interview_transcript_page.page')
  }
}
