/** @file Interview API v2 权威领域模型 / Authoritative Interview API v2 domain models. */

import type { UiConcurrencyToken } from '../../../shared-kernel/concurrency'
import type {
  UiKnowledgeSourceId,
  UiOpaqueId,
  UiWorkspaceId
} from '../../../shared-kernel/identity'
import type { UiContentLocale } from '../../../shared-kernel/locale'
import type { UiResourceReference } from '../../../shared-kernel/resource-reference'

/** @brief 面试场景身份 / Interview-scenario identity. */
export type UiInterviewScenarioId = UiOpaqueId<'interview-scenario'>

/** @brief 面试会话身份 / Interview-session identity. */
export type UiInterviewSessionId = UiOpaqueId<'interview-session'>

/** @brief 面试报告身份 / Interview-report identity. */
export type UiInterviewReportId = UiOpaqueId<'interview-report'>

/** @brief 实时连接身份 / Realtime-connection identity. */
export type UiRealtimeConnectionId = UiOpaqueId<'interview-realtime-connection'>

/** @brief 面试转录片段身份 / Interview-transcript-segment identity. */
export type UiInterviewTranscriptSegmentId = UiOpaqueId<'interview-transcript-segment'>

/** @brief 面试评分量表身份 / Interview-rubric identity. */
export type UiInterviewRubricId = UiOpaqueId<'interview-rubric'>

/** @brief 面试评分维度身份 / Interview-rubric-dimension identity. */
export type UiInterviewRubricDimensionId = UiOpaqueId<'interview-rubric-dimension'>

/** @brief KnowledgeSourceVersion 身份 / KnowledgeSourceVersion identity. */
export type UiInterviewKnowledgeVersionId = UiOpaqueId<'knowledge-source-version'>

/** @brief 场景页不透明 cursor / Opaque cursor for InterviewScenario pages. */
export type UiInterviewScenarioCursor = string & {
  /** @brief cursor 品牌；不施加资源 ID 语法 / Cursor brand imposing no resource-ID syntax. */
  readonly __uiInterviewScenarioCursorBrand: 'interview-scenario-cursor'
}

/** @brief 会话页不透明 cursor / Opaque cursor for InterviewSession pages. */
export type UiInterviewSessionCursor = string & {
  /** @brief cursor 品牌；不施加资源 ID 语法 / Cursor brand imposing no resource-ID syntax. */
  readonly __uiInterviewSessionCursorBrand: 'interview-session-cursor'
}

/** @brief 转录页不透明 cursor / Opaque cursor for InterviewTranscript pages. */
export type UiInterviewTranscriptCursor = string & {
  /** @brief cursor 品牌；不施加资源 ID 语法 / Cursor brand imposing no resource-ID syntax. */
  readonly __uiInterviewTranscriptCursorBrand: 'interview-transcript-cursor'
}

/** @brief Interview 集合单页最大条目数 / Maximum items in one Interview collection page. */
export const UI_INTERVIEW_PAGE_LIMIT_MAX = 200

/** @brief 受 API v2 约束的 Interview 页大小 / Interview page size constrained by API v2. */
export type UiInterviewPageLimit = number & {
  /** @brief 页大小品牌 / Page-limit brand. */
  readonly __uiInterviewPageLimitBrand: 'interview-page-limit'
}

/** @brief 开放但格式稳定的面试类型 / Open but format-stable Interview type. */
export type UiInterviewType = string & {
  /** @brief 面试类型品牌 / Interview-type brand. */
  readonly __uiInterviewTypeBrand: 'interview-type'
}

/**
 * @brief 校验并提升开放的面试类型 / Validate and refine an open Interview type.
 * @param value 服务端或用户输入的类型 code / Type code from the service or user input.
 * @return 保留未来服务端扩展的开放类型 / Open type preserving future server extensions.
 * @throws {TypeError} 当 code 不满足 canonical 格式时抛出 / Thrown when the code violates the canonical format.
 */
export function asUiInterviewType(value: string): UiInterviewType {
  if (!/^[a-z][a-z0-9_.-]{2,100}$/.test(value)) {
    throw new TypeError('An Interview type must satisfy the canonical open-code format.')
  }
  return value as UiInterviewType
}

/**
 * @brief 提升服务端签发的场景 cursor / Refine a server-issued scenario cursor.
 * @param value 不透明 cursor / Opaque cursor.
 * @return 只可用于场景集合的 cursor / Cursor usable only for the scenario collection.
 */
export function asUiInterviewScenarioCursor(value: string): UiInterviewScenarioCursor {
  assertCursor(value)
  return value as UiInterviewScenarioCursor
}

/**
 * @brief 提升服务端签发的会话 cursor / Refine a server-issued session cursor.
 * @param value 不透明 cursor / Opaque cursor.
 * @return 只可用于会话集合的 cursor / Cursor usable only for the session collection.
 */
export function asUiInterviewSessionCursor(value: string): UiInterviewSessionCursor {
  assertCursor(value)
  return value as UiInterviewSessionCursor
}

/**
 * @brief 提升服务端签发的转录 cursor / Refine a server-issued transcript cursor.
 * @param value 不透明 cursor / Opaque cursor.
 * @return 只可用于转录集合的 cursor / Cursor usable only for the transcript collection.
 */
export function asUiInterviewTranscriptCursor(value: string): UiInterviewTranscriptCursor {
  assertCursor(value)
  return value as UiInterviewTranscriptCursor
}

/**
 * @brief 构造受契约约束的 Interview 页大小 / Construct a contract-bounded Interview page size.
 * @param value 候选页大小 / Candidate page size.
 * @return 1 至 200 的名义页大小 / Nominal page size from 1 through 200.
 */
export function asUiInterviewPageLimit(value: number): UiInterviewPageLimit {
  if (!Number.isInteger(value) || value < 1 || value > UI_INTERVIEW_PAGE_LIMIT_MAX) {
    throw new RangeError(
      `Interview page limit must be an integer from 1 to ${UI_INTERVIEW_PAGE_LIMIT_MAX}.`
    )
  }
  return value as UiInterviewPageLimit
}

/**
 * @brief 校验 API v2 cursor 公共边界 / Validate the shared API v2 cursor boundary.
 * @param value 候选 cursor / Candidate cursor.
 */
function assertCursor(value: string): void {
  if ([...value].length < 1 || [...value].length > 2048) {
    throw new TypeError('An Interview cursor must contain between 1 and 2048 characters.')
  }
}

/** @brief canonical 面试难度 / Canonical Interview difficulty. */
export type UiInterviewDifficulty = 'introductory' | 'intermediate' | 'advanced' | 'adaptive'

/** @brief canonical 场景生命周期 / Canonical InterviewScenario lifecycle. */
export type UiInterviewScenarioStatus = 'draft' | 'active' | 'archived'

/** @brief canonical 会话生命周期 / Canonical InterviewSession lifecycle. */
export type UiInterviewSessionStatus =
  'created' | 'connecting' | 'active' | 'ending' | 'completed' | 'failed' | 'cancelled'

/** @brief 数字人输出模式 / Avatar output mode. */
export type UiInterviewAvatarOutputMode = 'none' | 'audio_only' | 'client_render' | 'server_video'

/** @brief 媒体降级传输 / Media fallback transport. */
export type UiInterviewFallbackTransport = 'none' | 'audio_only' | 'websocket'

/** @brief 实时连接传输 / Realtime-connection transport. */
export type UiInterviewRealtimeTransport = 'webrtc' | 'websocket'

/** @brief 会话结束原因 / Interview-session end reason. */
export type UiInterviewEndReason = 'completed' | 'user_cancelled' | 'technical_failure'

/** @brief 转录说话人 / Transcript speaker. */
export type UiInterviewTranscriptSpeaker = 'interviewer' | 'candidate' | 'system'

/** @brief 行动计划优先级 / Action-plan priority. */
export type UiInterviewActionPlanPriority = 'high' | 'medium' | 'low'

/** @brief Knowledge 选择模式 / Knowledge-selection mode. */
export type UiInterviewKnowledgeSelectionMode = 'none' | 'policy_default' | 'explicit'

/** @brief 推理质量档位 / Inference quality tier. */
export type UiInterviewInferenceQualityTier = 'fast' | 'balanced' | 'deep'

/** @brief 推理成本档位 / Inference cost tier. */
export type UiInterviewInferenceCostTier = 'economy' | 'standard' | 'premium'

/** @brief 模型处理数据区域 / Model-processing data region. */
export type UiInterviewInferenceDataRegion = 'cn' | 'global' | 'private_deployment'

/** @brief 数值评分范围 / Numeric score scale. */
export interface UiInterviewScoreScale {
  /** @brief 最小值 / Minimum value. */
  readonly minimum: number
  /** @brief 最大值 / Maximum value. */
  readonly maximum: number
  /** @brief 可选的数值到人类标签映射 / Optional numeric-to-human label mapping. */
  readonly labels?: Readonly<Record<string, string>>
}

/** @brief 面试评分维度 / Interview rubric dimension. */
export interface UiInterviewRubricDimension {
  /** @brief 维度身份 / Dimension identity. */
  readonly dimensionId: UiInterviewRubricDimensionId
  /** @brief 维度名称 / Dimension name. */
  readonly name: string
  /** @brief 维度说明 / Dimension description. */
  readonly description: string
  /** @brief 权重 / Weight. */
  readonly weight: number
  /** @brief 可观察指标 / Observable indicators. */
  readonly observableIndicators: readonly string[]
  /** @brief 该维度评分范围 / Score scale for the dimension. */
  readonly scoringScale: UiInterviewScoreScale
}

/** @brief 创建时冻结的面试评分量表 / Interview rubric frozen at creation time. */
export interface UiInterviewRubric {
  /** @brief 量表身份 / Rubric identity. */
  readonly rubricId: UiInterviewRubricId
  /** @brief 不可变量表版本 / Immutable rubric version. */
  readonly rubricVersion: string
  /** @brief 量表名称 / Rubric name. */
  readonly name: string
  /** @brief 唯一评分维度 / Unique rubric dimensions. */
  readonly dimensions: readonly UiInterviewRubricDimension[]
  /** @brief 总分范围 / Overall score scale. */
  readonly overallScale: UiInterviewScoreScale
}

/** @brief 场景创建与更新共享的完整输入 / Complete input shared by scenario creation and update. */
export interface UiInterviewScenarioInput {
  /** @brief 场景名称 / Scenario name. */
  readonly name: string
  /** @brief 场景说明 / Scenario description. */
  readonly description: string
  /** @brief 内容语言 / Content locale. */
  readonly locale: UiContentLocale
  /** @brief 开放的面试类型 code / Open Interview type code. */
  readonly interviewType: UiInterviewType
  /** @brief canonical 难度 / Canonical difficulty. */
  readonly difficulty: UiInterviewDifficulty
  /** @brief 目标时长（分钟）/ Target duration in minutes. */
  readonly durationMinutes: number
  /** @brief 目标问题数 / Target question count. */
  readonly targetQuestionCount: number
  /** @brief 唯一关注领域 / Unique focus areas. */
  readonly focusAreas: readonly string[]
  /** @brief 是否允许追问 / Whether follow-ups are allowed. */
  readonly allowFollowups: boolean
  /** @brief 是否允许打断 / Whether barge-in is allowed. */
  readonly allowBargeIn: boolean
  /** @brief 创建时冻结的量表 / Rubric frozen at creation time. */
  readonly rubric: UiInterviewRubric
}

/** @brief API v2 InterviewScenario 资源 / API v2 InterviewScenario resource. */
export interface UiInterviewScenario extends UiInterviewScenarioInput {
  /** @brief 场景身份 / Scenario identity. */
  readonly id: UiInterviewScenarioId
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 领域 revision / Domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updatedAt: string
  /** @brief 场景生命周期 / Scenario lifecycle. */
  readonly status: UiInterviewScenarioStatus
}

/**
 * @brief 与同一响应强 ETag 原子配对的场景权威 / Scenario authority atomically paired with a strong ETag.
 */
export interface UiInterviewScenarioAuthority {
  /** @brief 权威场景表示 / Authoritative scenario representation. */
  readonly scenario: UiInterviewScenario
  /** @brief 只能原样用于该场景 If-Match 的令牌 / Token replayable only as this scenario's If-Match. */
  readonly concurrencyToken: UiConcurrencyToken
}

/** @brief 保持 `hasMore` 与 cursor 关系的场景页 / Scenario page preserving the `hasMore`/cursor relation. */
export type UiInterviewScenarioPage =
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiInterviewScenario[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页 cursor / Next-page cursor. */
      readonly nextCursor: UiInterviewScenarioCursor
    }
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiInterviewScenario[]
      /** @brief 已到终页 / Whether the terminal page was reached. */
      readonly hasMore: false
      /** @brief 终页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }

/** @brief 面试职位目标 / Interview job target. */
export interface UiInterviewJobTarget {
  /** @brief 职位名称 / Job title. */
  readonly title: string
  /** @brief 公司 / Company. */
  readonly company: string | null
  /** @brief 地点 / Location. */
  readonly location: string | null
  /** @brief 完整职位说明 / Full job description. */
  readonly description: string | null
  /** @brief 来源 HTTP URL / Source HTTP URL. */
  readonly sourceUrl: string | null
  /** @brief 级别 / Seniority. */
  readonly seniority: string | null
  /** @brief 目标技能 / Target skills. */
  readonly skills: readonly string[]
}

/** @brief 数字人偏好 / Interview-avatar preferences. */
export interface UiInterviewAvatarPreferences {
  /** @brief 输出模式 / Output mode. */
  readonly outputMode: UiInterviewAvatarOutputMode
  /** @brief 可选数字人身份 / Optional avatar identity. */
  readonly avatarId: string | null
  /** @brief 可选语音身份 / Optional voice identity. */
  readonly voiceId: string | null
  /** @brief 首选音频 codec / Preferred audio codecs. */
  readonly preferredAudioCodecs: readonly string[]
  /** @brief 首选视频 codec / Preferred video codecs. */
  readonly preferredVideoCodecs: readonly string[]
  /** @brief 是否请求 viseme / Whether visemes are requested. */
  readonly includeVisemes: boolean
  /** @brief 是否请求表情 cue / Whether expression cues are requested. */
  readonly includeExpressionCues: boolean
}

/** @brief 会话媒体偏好 / Interview-session media preferences. */
export interface UiInterviewMediaPreferences {
  /** @brief 是否启用用户音频输入 / Whether user audio input is enabled. */
  readonly userAudio: boolean
  /** @brief 是否启用用户视频输入 / Whether user video input is enabled. */
  readonly userVideo: boolean
  /** @brief 是否启用屏幕共享 / Whether screen sharing is enabled. */
  readonly screenShare: boolean
  /** @brief 最大视频宽度 / Maximum video width. */
  readonly maxVideoWidth: number
  /** @brief 最大视频高度 / Maximum video height. */
  readonly maxVideoHeight: number
  /** @brief 最大视频帧率 / Maximum video frame rate. */
  readonly maxVideoFps: number
  /** @brief 数字人偏好 / Avatar preferences. */
  readonly avatar: UiInterviewAvatarPreferences
  /** @brief 媒体降级传输 / Media fallback transport. */
  readonly fallbackTransport: UiInterviewFallbackTransport
}

/** @brief 独立的录音、录像、转录同意事实 / Independent recording, video, and transcript consent facts. */
export interface UiInterviewRecordingConsent {
  /** @brief 是否录制音频 / Whether audio is recorded. */
  readonly recordAudio: boolean
  /** @brief 是否录制视频 / Whether video is recorded. */
  readonly recordVideo: boolean
  /** @brief 是否保存转录 / Whether the transcript is stored. */
  readonly storeTranscript: boolean
  /** @brief 保留天数 / Retention days. */
  readonly retentionDays: number
  /** @brief 同意时间；没有持久采集时可为空 / Consent timestamp, nullable without persistent capture. */
  readonly consentedAt: string | null
  /** @brief 同意文案版本；没有持久采集时可为空 / Consent-copy version, nullable without persistent capture. */
  readonly consentVersion: string | null
}

/** @brief 固定 KnowledgeSourceVersion / Pinned KnowledgeSourceVersion. */
export interface UiInterviewKnowledgeVersionPin {
  /** @brief KnowledgeSource 身份 / KnowledgeSource identity. */
  readonly sourceId: UiKnowledgeSourceId
  /** @brief KnowledgeSourceVersion 身份 / KnowledgeSourceVersion identity. */
  readonly versionId: UiInterviewKnowledgeVersionId
}

/** @brief 创建会话时的完整 Knowledge 选择 / Complete Knowledge selection for session creation. */
export interface UiInterviewKnowledgeSelection {
  /** @brief 选择模式 / Selection mode. */
  readonly mode: UiInterviewKnowledgeSelectionMode
  /** @brief 明确包含的来源 / Explicitly included sources. */
  readonly includeSourceIds: readonly UiKnowledgeSourceId[]
  /** @brief 明确排除的来源 / Explicitly excluded sources. */
  readonly excludeSourceIds: readonly UiKnowledgeSourceId[]
  /** @brief 固定的来源版本 / Pinned source versions. */
  readonly pinnedVersions: readonly UiInterviewKnowledgeVersionPin[]
  /** @brief 计算策略的 Agent scope / Agent scope used for policy evaluation. */
  readonly agentScope: string
}

/** @brief 创建会话时的推理意图 / Inference intent for session creation. */
export interface UiInterviewInferenceIntent {
  /** @brief 质量档位 / Quality tier. */
  readonly qualityTier: UiInterviewInferenceQualityTier
  /** @brief 延迟预算（毫秒）/ Latency budget in milliseconds. */
  readonly latencyBudgetMs: number | null
  /** @brief 成本档位 / Cost tier. */
  readonly costTier: UiInterviewInferenceCostTier
  /** @brief 数据区域 / Data region. */
  readonly dataRegion: UiInterviewInferenceDataRegion
  /** @brief 是否允许 provider fallback / Whether provider fallback is allowed. */
  readonly allowProviderFallback: boolean
  /** @brief 是否允许外部模型处理 / Whether external-model processing is allowed. */
  readonly allowExternalModelProcessing: boolean
}

/** @brief 创建 InterviewSession 的完整 canonical 输入 / Complete canonical input for creating an InterviewSession. */
export interface UiCreateInterviewSessionInput {
  /** @brief 已选择的场景 / Selected scenario. */
  readonly scenarioId: UiInterviewScenarioId
  /** @brief 可选 Resume 引用 / Optional Resume reference. */
  readonly resumeRef: UiResourceReference | null
  /** @brief 本次职位目标 / Job target for this session. */
  readonly jobTarget: UiInterviewJobTarget
  /** @brief Knowledge 选择 / Knowledge selection. */
  readonly knowledge: UiInterviewKnowledgeSelection
  /** @brief 面试内容语言 / Interview-content locale. */
  readonly locale: UiContentLocale
  /** @brief 媒体偏好 / Media preferences. */
  readonly media: UiInterviewMediaPreferences
  /** @brief 独立保留与同意事实 / Independent retention and consent facts. */
  readonly recording: UiInterviewRecordingConsent
  /** @brief 推理意图 / Inference intent. */
  readonly inference: UiInterviewInferenceIntent
}

/** @brief API v2 InterviewSession 资源 / API v2 InterviewSession resource. */
export interface UiInterviewSession {
  /** @brief 会话身份 / Session identity. */
  readonly id: UiInterviewSessionId
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 领域 revision / Domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updatedAt: string
  /** @brief 固定场景身份 / Pinned scenario identity. */
  readonly scenarioId: UiInterviewScenarioId
  /** @brief 可选 Resume 引用 / Optional Resume reference. */
  readonly resumeRef: UiResourceReference | null
  /** @brief 职位目标 / Job target. */
  readonly jobTarget: UiInterviewJobTarget
  /** @brief canonical 会话状态 / Canonical session status. */
  readonly status: UiInterviewSessionStatus
  /** @brief 面试内容语言 / Interview-content locale. */
  readonly locale: UiContentLocale
  /** @brief 媒体偏好 / Media preferences. */
  readonly media: UiInterviewMediaPreferences
  /** @brief 录制和保留同意 / Recording and retention consent. */
  readonly recording: UiInterviewRecordingConsent
  /** @brief 服务端确认的开始时间 / Server-confirmed start timestamp. */
  readonly startedAt: string | null
  /** @brief 服务端确认的结束时间 / Server-confirmed end timestamp. */
  readonly endedAt: string | null
  /** @brief 权威报告身份 / Authoritative report identity. */
  readonly reportId: UiInterviewReportId | null
}

/**
 * @brief 与同一响应强 ETag 原子配对的会话权威 / Session authority atomically paired with a strong ETag.
 */
export interface UiInterviewSessionAuthority {
  /** @brief 权威会话表示 / Authoritative session representation. */
  readonly session: UiInterviewSession
  /** @brief 只能原样用于该会话 If-Match 的令牌 / Token replayable only as this session's If-Match. */
  readonly concurrencyToken: UiConcurrencyToken
}

/** @brief 保持 `hasMore` 与 cursor 关系的会话页 / Session page preserving the `hasMore`/cursor relation. */
export type UiInterviewSessionPage =
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiInterviewSession[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页 cursor / Next-page cursor. */
      readonly nextCursor: UiInterviewSessionCursor
    }
  | {
      /** @brief 当前页条目 / Current-page items. */
      readonly items: readonly UiInterviewSession[]
      /** @brief 已到终页 / Whether the terminal page was reached. */
      readonly hasMore: false
      /** @brief 终页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }

/** @brief WebRTC ICE server 的短期凭据 / Short-lived credentials for one WebRTC ICE server. */
export interface UiInterviewIceServer {
  /** @brief ICE server URI 列表 / ICE-server URI list. */
  readonly urls: readonly string[]
  /** @brief 可选短期用户名 / Optional short-lived username. */
  readonly username: string | null
  /** @brief 可选短期 credential / Optional short-lived credential. */
  readonly credential: string | null
}

/**
 * @brief 短期、单会话实时连接描述符 / Short-lived, single-session realtime connection descriptor.
 * @note 这是 REST 签发结果，不定义 WebRTC/WS 帧协议 / This is a REST-issued result and does not define the WebRTC/WS frame protocol.
 */
export interface UiRealtimeConnection {
  /** @brief 连接身份 / Connection identity. */
  readonly id: UiRealtimeConnectionId
  /** @brief 唯一所属会话 / Sole owning session. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 已协商传输 / Negotiated transport. */
  readonly transport: UiInterviewRealtimeTransport
  /** @brief 受限 signaling URL / Constrained signaling URL. */
  readonly signalingUrl: string
  /** @brief 仅用于这次连接的短期 token / Ephemeral token scoped to this connection. */
  readonly ephemeralToken: string
  /** @brief WebRTC ICE server；WebSocket 时通常为空 / WebRTC ICE servers, commonly empty for WebSocket. */
  readonly iceServers: readonly UiInterviewIceServer[]
  /** @brief 描述符过期时间 / Descriptor expiration timestamp. */
  readonly expiresAt: string
  /** @brief 心跳间隔（毫秒）/ Heartbeat interval in milliseconds. */
  readonly heartbeatIntervalMs: number
}

/** @brief 已持久化的权威转录片段 / Persisted authoritative transcript segment. */
export interface UiInterviewTranscriptSegment {
  /** @brief 片段身份 / Segment identity. */
  readonly id: UiInterviewTranscriptSegmentId
  /** @brief 说话人，包括系统事件 / Speaker, including system events. */
  readonly speaker: UiInterviewTranscriptSpeaker
  /** @brief 起始毫秒 / Start time in milliseconds. */
  readonly startMs: number
  /** @brief 结束毫秒 / End time in milliseconds. */
  readonly endMs: number
  /** @brief 持久化文本 / Persisted text. */
  readonly text: string
}

/** @brief 保持 `hasMore` 与 cursor 关系的转录页 / Transcript page preserving the `hasMore`/cursor relation. */
export type UiInterviewTranscriptPage =
  | {
      /** @brief 当前页片段 / Current-page segments. */
      readonly items: readonly UiInterviewTranscriptSegment[]
      /** @brief 仍有下一页 / Whether another page exists. */
      readonly hasMore: true
      /** @brief 下一页 cursor / Next-page cursor. */
      readonly nextCursor: UiInterviewTranscriptCursor
    }
  | {
      /** @brief 当前页片段 / Current-page segments. */
      readonly items: readonly UiInterviewTranscriptSegment[]
      /** @brief 已到终页 / Whether the terminal page was reached. */
      readonly hasMore: false
      /** @brief 终页没有 cursor / A terminal page has no cursor. */
      readonly nextCursor: null
    }

/** @brief 只含纯文本的 Interview rich text / Interview rich text containing only plain text. */
export interface UiInterviewRichText {
  /** @brief 纯文本 / Plain text. */
  readonly plainText: string
}

/** @brief 版本化资源引用 / Versioned resource reference. */
export interface UiInterviewVersionedReference {
  /** @brief 资源身份 / Resource identity. */
  readonly id: string
  /** @brief 不可变版本 / Immutable version. */
  readonly version: string
}

/**
 * @brief 报告声明的转录证据引用 / Transcript-evidence reference claimed by a report.
 * @note 它不是“已验证证据”标记；产品若需验证，必须读取该 Session 的权威 transcript 后自行核对 / It is not a “verified evidence” marker; products must cross-check the authoritative transcript for the Session before making that claim.
 */
export interface UiInterviewEvidenceClaim {
  /** @brief 被报告引用的片段身份 / Segment identity referenced by the report. */
  readonly segmentId: UiInterviewTranscriptSegmentId
  /** @brief 报告声明的起始毫秒 / Start time claimed by the report. */
  readonly startMs: number
  /** @brief 报告声明的结束毫秒 / End time claimed by the report. */
  readonly endMs: number
  /** @brief 可选引文 / Optional quote. */
  readonly quote: string | null
}

/** @brief 单个 rubric 维度的报告分数 / Reported score for one rubric dimension. */
export interface UiInterviewRubricScore {
  /** @brief 被评分的维度身份 / Scored dimension identity. */
  readonly dimensionId: UiInterviewRubricDimensionId
  /** @brief 0–100 分数 / Score from 0 through 100. */
  readonly score: number
  /** @brief 0–1 置信度 / Confidence from 0 through 1. */
  readonly confidence: number
  /** @brief 评分摘要 / Score summary. */
  readonly summary: UiInterviewRichText
  /** @brief 报告声明的证据引用 / Evidence references claimed by the report. */
  readonly evidence: readonly UiInterviewEvidenceClaim[]
  /** @brief 改进行动 / Improvement actions. */
  readonly improvementActions: readonly string[]
}

/** @brief 可观察沟通指标 / Observable communication metrics. */
export interface UiInterviewCommunicationMetrics {
  /** @brief 发言时长（毫秒）/ Speaking time in milliseconds. */
  readonly speakingTimeMs: number | null
  /** @brief 平均回答长度（毫秒）/ Average answer length in milliseconds. */
  readonly averageAnswerLengthMs: number | null
  /** @brief 每分钟词数 / Words per minute. */
  readonly wordsPerMinute: number | null
  /** @brief 填充词数量 / Filler-word count. */
  readonly fillerWordCount: number | null
  /** @brief 长停顿数量 / Long-pause count. */
  readonly longPauseCount: number | null
  /** @brief 打断数量 / Interruption count. */
  readonly interruptionCount: number | null
  /** @brief 仅描述可观察行为的说明 / Notes limited to observable behavior. */
  readonly notes: readonly string[]
}

/** @brief 报告行动计划项 / Report action-plan item. */
export interface UiInterviewActionPlanItem {
  /** @brief 优先级 / Priority. */
  readonly priority: UiInterviewActionPlanPriority
  /** @brief 标题 / Title. */
  readonly title: string
  /** @brief 原因 / Why it matters. */
  readonly why: string
  /** @brief 练习方式 / Practice method. */
  readonly practice: string
  /** @brief 成功标准 / Success criterion. */
  readonly successCriterion: string
}

/**
 * @brief API v2 InterviewReport 权威资源 / Authoritative API v2 InterviewReport resource.
 * @note 报告保留 engine、generated 时间和 rubric 引用，不从当前场景倒推 / The report preserves its engine, generation time, and rubric reference without inferring them from the current scenario.
 */
export interface UiInterviewReport {
  /** @brief 报告身份 / Report identity. */
  readonly id: UiInterviewReportId
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: UiWorkspaceId
  /** @brief 领域 revision / Domain revision. */
  readonly revision: number
  /** @brief 创建时间 / Creation timestamp. */
  readonly createdAt: string
  /** @brief 更新时间 / Update timestamp. */
  readonly updatedAt: string
  /** @brief 唯一所属会话 / Sole owning session. */
  readonly sessionId: UiInterviewSessionId
  /** @brief 报告格式版本 / Report-format version. */
  readonly reportVersion: string
  /** @brief 创建时冻结的 rubric 引用 / Rubric reference frozen at creation. */
  readonly rubricRef: UiInterviewVersionedReference
  /** @brief 生成引擎版本 / Generation-engine version. */
  readonly engineVersion: string
  /** @brief 总分；证据不足时为空 / Overall score, nullable when evidence is insufficient. */
  readonly overallScore: number | null
  /** @brief 总体置信度 / Overall confidence. */
  readonly overallConfidence: number
  /** @brief 执行摘要 / Executive summary. */
  readonly executiveSummary: UiInterviewRichText
  /** @brief rubric 分数 / Rubric scores. */
  readonly rubricScores: readonly UiInterviewRubricScore[]
  /** @brief 优势 / Strengths. */
  readonly strengths: readonly UiInterviewRichText[]
  /** @brief 改进点 / Improvements. */
  readonly improvements: readonly UiInterviewRichText[]
  /** @brief 可观察沟通指标 / Observable communication metrics. */
  readonly communicationMetrics: UiInterviewCommunicationMetrics
  /** @brief 行动计划 / Action plan. */
  readonly actionPlan: readonly UiInterviewActionPlanItem[]
  /** @brief 限制与低置信度说明 / Limitations and low-confidence statements. */
  readonly limitations: readonly string[]
  /** @brief 报告生成时间 / Report generation timestamp. */
  readonly generatedAt: string
}
