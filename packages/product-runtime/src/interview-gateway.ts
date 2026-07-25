/** @file Interview API v2 生产运行时防腐层 / Production runtime ACL for Interview API v2. */

import {
  ApiV2ContractError,
  createWorkspaceInterviewRealtimeConnection,
  createWorkspaceInterviewReportJob,
  createWorkspaceInterviewScenario,
  createWorkspaceInterviewSession,
  endWorkspaceInterviewSession,
  getWorkspaceInterviewReport,
  getWorkspaceInterviewScenario,
  getWorkspaceInterviewSession,
  listWorkspaceInterviewScenarioPage,
  listWorkspaceInterviewSessionPage,
  listWorkspaceInterviewTranscriptPage,
  updateWorkspaceInterviewScenario,
  type ApiV2HttpClient,
  type CreateInterviewScenarioRequest,
  type CreateInterviewSessionRequest,
  type InterviewAvatarPreferences,
  type InterviewEvidence,
  type InterviewJobTarget,
  type InterviewMediaPreferences,
  type InterviewReport,
  type InterviewRubric,
  type InterviewScenario,
  type InterviewSession,
  type InterviewTranscriptSegment,
  type RealtimeConnection,
  type RecordingConsent,
  type ResourceReference,
  type ScoreScale,
  type UpdateInterviewScenarioRequest
} from '@ai-job-workspace/product-api-v2'
import {
  asUiConcurrencyToken,
  asUiInterviewScenarioCursor,
  asUiInterviewSessionCursor,
  asUiInterviewTranscriptCursor,
  asUiInterviewType,
  asUiOpaqueId,
  type InterviewGateway,
  type UiCreateInterviewSessionInput,
  type UiInterviewAvatarPreferences,
  type UiInterviewEvidenceClaim,
  type UiInterviewJobTarget,
  type UiInterviewMediaPreferences,
  type UiInterviewReport,
  type UiInterviewRubric,
  type UiInterviewScenario,
  type UiInterviewScenarioAuthority,
  type UiInterviewScenarioInput,
  type UiInterviewScenarioPatch,
  type UiInterviewScoreScale,
  type UiInterviewSession,
  type UiInterviewSessionAuthority,
  type UiInterviewTranscriptSegment,
  type UiRealtimeConnection,
  type UiResourceReference,
  type UiInterviewRecordingConsent
} from '@ai-job-workspace/app/application'

import { mapWorkspaceJobAuthority } from './api-v2-gateways'

/**
 * @brief 把协议 ResourceRef 无损映射到应用引用 / Losslessly map a protocol ResourceRef to an application reference.
 * @param source 已严格解码的协议引用 / Strictly decoded protocol reference.
 * @return 保留 revision 缺失、null 和整数三态的引用 / Reference preserving absent, null, and integer revision states.
 */
function mapResourceReference(source: ResourceReference): UiResourceReference {
  /** @brief 必需引用字段 / Required reference fields. */
  const required = { id: source.id, resourceType: source.resource_type }
  if (!Object.hasOwn(source, 'revision')) return required
  /** @brief wire 上显式存在的 revision / Revision explicitly present on the wire. */
  const revision = source.revision
  if (revision === undefined) {
    throw new ApiV2ContractError('An Interview ResourceRef cannot own an undefined revision.')
  }
  return { ...required, revision }
}

/**
 * @brief 把应用引用还原为协议 ResourceRef / Restore an application reference to a protocol ResourceRef.
 * @param source 冻结的应用引用 / Frozen application reference.
 * @return 保留 optional property presence 的协议引用 / Protocol reference preserving optional-property presence.
 */
function mapUiResourceReference(source: UiResourceReference): ResourceReference {
  /** @brief 必需引用字段 / Required reference fields. */
  const required = { id: source.id, resource_type: source.resourceType }
  if (!Object.hasOwn(source, 'revision')) return required
  /** @brief 应用快照中显式存在的 revision / Revision explicitly present in the application snapshot. */
  const revision = source.revision
  if (revision === undefined) {
    throw new ApiV2ContractError('A frozen Interview ResourceRef cannot own undefined.')
  }
  return { ...required, revision }
}

/**
 * @brief 映射分数范围并复制可选标签 / Map a score scale and copy optional labels.
 * @param source 已严格解码的协议范围 / Strictly decoded protocol scale.
 * @return 不共享 labels 的应用范围 / Application scale sharing no labels.
 */
function mapScoreScale(source: ScoreScale): UiInterviewScoreScale {
  /** @brief 必需范围字段 / Required scale fields. */
  const required = { maximum: source.maximum, minimum: source.minimum }
  return source.labels === undefined ? required : { ...required, labels: { ...source.labels } }
}

/**
 * @brief 把应用分数范围还原为协议范围 / Restore an application score scale to a protocol scale.
 * @param source 冻结应用范围 / Frozen application scale.
 * @return 保留 labels 省略语义的协议范围 / Protocol scale preserving labels omission.
 */
function mapUiScoreScale(source: UiInterviewScoreScale): ScoreScale {
  /** @brief 必需范围字段 / Required scale fields. */
  const required = { maximum: source.maximum, minimum: source.minimum }
  return source.labels === undefined ? required : { ...required, labels: { ...source.labels } }
}

/**
 * @brief 映射完整 Interview rubric / Map a complete Interview rubric.
 * @param source 已严格解码的协议 rubric / Strictly decoded protocol rubric.
 * @return 身份品牌化且不共享数组的应用 rubric / Application rubric with branded identities and no shared arrays.
 */
function mapInterviewRubric(source: InterviewRubric): UiInterviewRubric {
  return {
    dimensions: source.dimensions.map((dimension) => ({
      description: dimension.description,
      dimensionId: asUiOpaqueId<'interview-rubric-dimension'>(dimension.dimension_id),
      name: dimension.name,
      observableIndicators: [...dimension.observable_indicators],
      scoringScale: mapScoreScale(dimension.scoring_scale),
      weight: dimension.weight
    })),
    name: source.name,
    overallScale: mapScoreScale(source.overall_scale),
    rubricId: asUiOpaqueId<'interview-rubric'>(source.rubric_id),
    rubricVersion: source.rubric_version
  }
}

/**
 * @brief 把应用 rubric 还原为协议 rubric / Restore an application rubric to a protocol rubric.
 * @param source 冻结应用 rubric / Frozen application rubric.
 * @return 不共享数组的协议 rubric / Protocol rubric sharing no arrays.
 */
function mapUiInterviewRubric(source: UiInterviewRubric): InterviewRubric {
  return {
    dimensions: source.dimensions.map((dimension) => ({
      description: dimension.description,
      dimension_id: dimension.dimensionId,
      name: dimension.name,
      observable_indicators: [...dimension.observableIndicators],
      scoring_scale: mapUiScoreScale(dimension.scoringScale),
      weight: dimension.weight
    })),
    name: source.name,
    overall_scale: mapUiScoreScale(source.overallScale),
    rubric_id: source.rubricId,
    rubric_version: source.rubricVersion
  }
}

/**
 * @brief 映射 API v2 InterviewScenario / Map an API v2 InterviewScenario.
 * @param source 已严格解码的协议 Scenario / Strictly decoded protocol Scenario.
 * @return canonical 应用 Scenario / Canonical application Scenario.
 */
export function mapInterviewScenario(source: InterviewScenario): UiInterviewScenario {
  return {
    allowBargeIn: source.allow_barge_in,
    allowFollowups: source.allow_followups,
    createdAt: source.created_at,
    description: source.description,
    difficulty: source.difficulty,
    durationMinutes: source.duration_minutes,
    focusAreas: [...source.focus_areas],
    id: asUiOpaqueId<'interview-scenario'>(source.id),
    interviewType: asUiInterviewType(source.interview_type),
    locale: source.locale,
    name: source.name,
    revision: source.revision,
    rubric: mapInterviewRubric(source.rubric),
    status: source.status,
    targetQuestionCount: source.target_question_count,
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
}

/**
 * @brief 把应用 Scenario 输入还原为创建请求 / Restore application Scenario input to a creation request.
 * @param source 冻结创建输入 / Frozen creation input.
 * @return canonical snake_case 请求 / Canonical snake_case request.
 */
function mapUiScenarioInput(source: UiInterviewScenarioInput): CreateInterviewScenarioRequest {
  return {
    allow_barge_in: source.allowBargeIn,
    allow_followups: source.allowFollowups,
    description: source.description,
    difficulty: source.difficulty,
    duration_minutes: source.durationMinutes,
    focus_areas: [...source.focusAreas],
    interview_type: source.interviewType,
    locale: source.locale,
    name: source.name,
    rubric: mapUiInterviewRubric(source.rubric),
    target_question_count: source.targetQuestionCount
  }
}

/**
 * @brief 把最小应用 patch 还原为最小协议 patch / Restore a minimal application patch to a minimal protocol patch.
 * @param source 只含真实用户改动的 patch / Patch containing only actual user changes.
 * @return 严格保留字段省略的 snake_case patch / snake_case patch strictly preserving omitted fields.
 */
function mapUiScenarioPatch(source: UiInterviewScenarioPatch): UpdateInterviewScenarioRequest {
  if (Object.keys(source).some((key) => source[key as keyof typeof source] === undefined)) {
    throw new ApiV2ContractError(
      'A frozen InterviewScenario patch cannot contain an explicit undefined value.'
    )
  }
  return {
    ...(Object.hasOwn(source, 'allowBargeIn') ? { allow_barge_in: source.allowBargeIn } : {}),
    ...(Object.hasOwn(source, 'allowFollowups') ? { allow_followups: source.allowFollowups } : {}),
    ...(Object.hasOwn(source, 'description') ? { description: source.description } : {}),
    ...(Object.hasOwn(source, 'difficulty') ? { difficulty: source.difficulty } : {}),
    ...(Object.hasOwn(source, 'durationMinutes')
      ? { duration_minutes: source.durationMinutes }
      : {}),
    ...(Object.hasOwn(source, 'focusAreas')
      ? { focus_areas: [...(source.focusAreas as readonly string[])] }
      : {}),
    ...(Object.hasOwn(source, 'interviewType') ? { interview_type: source.interviewType } : {}),
    ...(Object.hasOwn(source, 'locale') ? { locale: source.locale } : {}),
    ...(Object.hasOwn(source, 'name') ? { name: source.name } : {}),
    ...(Object.hasOwn(source, 'rubric') && source.rubric !== undefined
      ? { rubric: mapUiInterviewRubric(source.rubric) }
      : {}),
    ...(Object.hasOwn(source, 'status') ? { status: source.status } : {}),
    ...(Object.hasOwn(source, 'targetQuestionCount')
      ? { target_question_count: source.targetQuestionCount }
      : {})
  }
}

/**
 * @brief 映射 Scenario 权威并核对 path identity / Map Scenario authority and verify path identity.
 * @param value 协议 Scenario / Protocol Scenario.
 * @param entityTag 同响应强 ETag / Strong ETag from the same response.
 * @param workspaceId 请求 Workspace / Requested Workspace.
 * @param scenarioId 可选请求 Scenario / Optional requested Scenario.
 * @return 可安全用于后续 If-Match 的应用权威 / Application authority safe for a later If-Match.
 */
function mapScenarioAuthority(
  value: InterviewScenario,
  entityTag: string,
  workspaceId: string,
  scenarioId?: string
): UiInterviewScenarioAuthority {
  /** @brief 已映射场景 / Mapped scenario. */
  const scenario = mapInterviewScenario(value)
  if (
    scenario.workspaceId !== workspaceId ||
    (scenarioId !== undefined && scenario.id !== scenarioId)
  ) {
    throw new ApiV2ContractError(
      'Interview runtime received a Scenario outside the requested Workspace or identity path.'
    )
  }
  return { concurrencyToken: asUiConcurrencyToken(entityTag), scenario }
}

/**
 * @brief 映射协议 JobTarget / Map a protocol JobTarget.
 * @param source 已严格解码的协议值 / Strictly decoded protocol value.
 * @return 不共享 skills 的应用值 / Application value sharing no skills.
 */
function mapJobTarget(source: InterviewJobTarget): UiInterviewJobTarget {
  return {
    company: source.company,
    description: source.description,
    location: source.location,
    seniority: source.seniority,
    skills: [...source.skills],
    sourceUrl: source.source_url,
    title: source.title
  }
}

/**
 * @brief 把应用 JobTarget 还原为协议值 / Restore an application JobTarget to a protocol value.
 * @param source 冻结应用值 / Frozen application value.
 * @return 不共享 skills 的协议值 / Protocol value sharing no skills.
 */
function mapUiJobTarget(source: UiInterviewJobTarget): InterviewJobTarget {
  return {
    company: source.company,
    description: source.description,
    location: source.location,
    seniority: source.seniority,
    skills: [...source.skills],
    source_url: source.sourceUrl,
    title: source.title
  }
}

/**
 * @brief 映射 Avatar 偏好 / Map Avatar preferences.
 * @param source 已严格解码的协议值 / Strictly decoded protocol value.
 * @return 不共享 codec 数组的应用值 / Application value sharing no codec arrays.
 */
function mapAvatar(source: InterviewAvatarPreferences): UiInterviewAvatarPreferences {
  return {
    avatarId: source.avatar_id,
    includeExpressionCues: source.include_expression_cues,
    includeVisemes: source.include_visemes,
    outputMode: source.output_mode,
    preferredAudioCodecs: [...source.preferred_audio_codecs],
    preferredVideoCodecs: [...source.preferred_video_codecs],
    voiceId: source.voice_id
  }
}

/**
 * @brief 把应用 Avatar 偏好还原为协议值 / Restore application Avatar preferences to a protocol value.
 * @param source 冻结应用值 / Frozen application value.
 * @return 不共享 codec 数组的协议值 / Protocol value sharing no codec arrays.
 */
function mapUiAvatar(source: UiInterviewAvatarPreferences): InterviewAvatarPreferences {
  return {
    avatar_id: source.avatarId,
    include_expression_cues: source.includeExpressionCues,
    include_visemes: source.includeVisemes,
    output_mode: source.outputMode,
    preferred_audio_codecs: [...source.preferredAudioCodecs],
    preferred_video_codecs: [...source.preferredVideoCodecs],
    voice_id: source.voiceId
  }
}

/**
 * @brief 映射完整媒体偏好 / Map complete media preferences.
 * @param source 已严格解码的协议值 / Strictly decoded protocol value.
 * @return canonical 应用值 / Canonical application value.
 */
function mapMedia(source: InterviewMediaPreferences): UiInterviewMediaPreferences {
  return {
    avatar: mapAvatar(source.avatar),
    fallbackTransport: source.fallback_transport,
    maxVideoFps: source.max_video_fps,
    maxVideoHeight: source.max_video_height,
    maxVideoWidth: source.max_video_width,
    screenShare: source.screen_share,
    userAudio: source.user_audio,
    userVideo: source.user_video
  }
}

/**
 * @brief 把应用媒体偏好还原为协议值 / Restore application media preferences to a protocol value.
 * @param source 冻结应用值 / Frozen application value.
 * @return canonical 协议值 / Canonical protocol value.
 */
function mapUiMedia(source: UiInterviewMediaPreferences): InterviewMediaPreferences {
  return {
    avatar: mapUiAvatar(source.avatar),
    fallback_transport: source.fallbackTransport,
    max_video_fps: source.maxVideoFps,
    max_video_height: source.maxVideoHeight,
    max_video_width: source.maxVideoWidth,
    screen_share: source.screenShare,
    user_audio: source.userAudio,
    user_video: source.userVideo
  }
}

/**
 * @brief 映射录制和保留同意 / Map recording and retention consent.
 * @param source 已严格解码的协议值 / Strictly decoded protocol value.
 * @return canonical 应用值 / Canonical application value.
 */
function mapRecording(source: RecordingConsent): UiInterviewRecordingConsent {
  return {
    consentVersion: source.consent_version,
    consentedAt: source.consented_at,
    recordAudio: source.record_audio,
    recordVideo: source.record_video,
    retentionDays: source.retention_days,
    storeTranscript: source.store_transcript
  }
}

/**
 * @brief 把应用录制同意还原为协议值 / Restore application recording consent to a protocol value.
 * @param source 冻结应用值 / Frozen application value.
 * @return canonical 协议值 / Canonical protocol value.
 */
function mapUiRecording(source: UiInterviewRecordingConsent): RecordingConsent {
  return {
    consent_version: source.consentVersion,
    consented_at: source.consentedAt,
    record_audio: source.recordAudio,
    record_video: source.recordVideo,
    retention_days: source.retentionDays,
    store_transcript: source.storeTranscript
  }
}

/**
 * @brief 映射 API v2 InterviewSession / Map an API v2 InterviewSession.
 * @param source 已严格解码的协议 Session / Strictly decoded protocol Session.
 * @return canonical 应用 Session / Canonical application Session.
 */
export function mapInterviewSession(source: InterviewSession): UiInterviewSession {
  return {
    createdAt: source.created_at,
    endedAt: source.ended_at,
    id: asUiOpaqueId<'interview-session'>(source.id),
    jobTarget: mapJobTarget(source.job_target),
    locale: source.locale,
    media: mapMedia(source.media),
    recording: mapRecording(source.recording),
    reportId: source.report_id === null ? null : asUiOpaqueId<'interview-report'>(source.report_id),
    resumeRef: source.resume_ref === null ? null : mapResourceReference(source.resume_ref),
    revision: source.revision,
    scenarioId: asUiOpaqueId<'interview-scenario'>(source.scenario_id),
    startedAt: source.started_at,
    status: source.status,
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
}

/**
 * @brief 映射 Session 权威并核对 path identity / Map Session authority and verify path identity.
 * @param value 协议 Session / Protocol Session.
 * @param entityTag 同响应强 ETag / Strong ETag from the same response.
 * @param workspaceId 请求 Workspace / Requested Workspace.
 * @param sessionId 可选请求 Session / Optional requested Session.
 * @return 可安全用于 EndRequest 的应用权威 / Application authority safe for an EndRequest.
 */
function mapSessionAuthority(
  value: InterviewSession,
  entityTag: string,
  workspaceId: string,
  sessionId?: string
): UiInterviewSessionAuthority {
  /** @brief 已映射会话 / Mapped session. */
  const session = mapInterviewSession(value)
  if (
    session.workspaceId !== workspaceId ||
    (sessionId !== undefined && session.id !== sessionId)
  ) {
    throw new ApiV2ContractError(
      'Interview runtime received a Session outside the requested Workspace or identity path.'
    )
  }
  return { concurrencyToken: asUiConcurrencyToken(entityTag), session }
}

/**
 * @brief 把完整 Session 创建输入还原为协议请求 / Restore complete Session creation input to a protocol request.
 * @param source 冻结应用输入 / Frozen application input.
 * @return 保留 ResourceRef optional revision 的 canonical 请求 / Canonical request preserving optional ResourceRef revision.
 */
function mapUiSessionInput(source: UiCreateInterviewSessionInput): CreateInterviewSessionRequest {
  return {
    inference: {
      allow_external_model_processing: source.inference.allowExternalModelProcessing,
      allow_provider_fallback: source.inference.allowProviderFallback,
      cost_tier: source.inference.costTier,
      data_region: source.inference.dataRegion,
      latency_budget_ms: source.inference.latencyBudgetMs,
      quality_tier: source.inference.qualityTier
    },
    job_target: mapUiJobTarget(source.jobTarget),
    knowledge: {
      agent_scope: source.knowledge.agentScope,
      exclude_source_ids: [...source.knowledge.excludeSourceIds],
      include_source_ids: [...source.knowledge.includeSourceIds],
      mode: source.knowledge.mode,
      pinned_versions: source.knowledge.pinnedVersions.map((pin) => ({
        source_id: pin.sourceId,
        version_id: pin.versionId
      }))
    },
    locale: source.locale,
    media: mapUiMedia(source.media),
    recording: mapUiRecording(source.recording),
    resume_ref: source.resumeRef === null ? null : mapUiResourceReference(source.resumeRef),
    scenario_id: source.scenarioId
  }
}

/**
 * @brief 映射短期 RealtimeConnection / Map a short-lived RealtimeConnection.
 * @param source 已严格解码的短期描述符 / Strictly decoded short-lived descriptor.
 * @param expectedSessionId 请求 Session identity / Requested Session identity.
 * @return 只返回给调用方、不在 adapter 中持久化的描述符 / Descriptor returned only to the caller and never persisted by the adapter.
 */
export function mapRealtimeConnection(
  source: RealtimeConnection,
  expectedSessionId: string
): UiRealtimeConnection {
  if (source.session_id !== expectedSessionId) {
    throw new ApiV2ContractError(
      'Interview runtime received a RealtimeConnection for another Session.'
    )
  }
  return {
    ephemeralToken: source.ephemeral_token,
    expiresAt: source.expires_at,
    heartbeatIntervalMs: source.heartbeat_interval_ms,
    iceServers: source.ice_servers.map((server) => ({
      credential: server.credential,
      urls: [...server.urls],
      username: server.username
    })),
    id: asUiOpaqueId<'interview-realtime-connection'>(source.id),
    sessionId: asUiOpaqueId<'interview-session'>(source.session_id),
    signalingUrl: source.signaling_url,
    transport: source.transport
  }
}

/**
 * @brief 映射持久化 transcript segment / Map a persisted transcript segment.
 * @param source 已严格解码的协议片段 / Strictly decoded protocol segment.
 * @return 包含 system speaker 的应用片段 / Application segment including the system speaker.
 */
export function mapInterviewTranscriptSegment(
  source: InterviewTranscriptSegment
): UiInterviewTranscriptSegment {
  return {
    endMs: source.end_ms,
    id: asUiOpaqueId<'interview-transcript-segment'>(source.id),
    speaker: source.speaker,
    startMs: source.start_ms,
    text: source.text
  }
}

/**
 * @brief 映射报告声明的证据引用 / Map an evidence reference claimed by a report.
 * @param source 已严格解码的协议引用 / Strictly decoded protocol reference.
 * @return 不附加 verified 标记的应用证据声明 / Application evidence claim without a verified marker.
 */
function mapEvidenceClaim(source: InterviewEvidence): UiInterviewEvidenceClaim {
  return {
    endMs: source.end_ms,
    quote: source.quote,
    segmentId: asUiOpaqueId<'interview-transcript-segment'>(source.segment_id),
    startMs: source.start_ms
  }
}

/**
 * @brief 映射 API v2 InterviewReport / Map an API v2 InterviewReport.
 * @param source 已严格解码的协议 Report / Strictly decoded protocol Report.
 * @return 保留 rubric、engine 和 generated provenance 的应用 Report / Application Report preserving rubric, engine, and generation provenance.
 */
export function mapInterviewReport(source: InterviewReport): UiInterviewReport {
  return {
    actionPlan: source.action_plan.map((item) => ({
      practice: item.practice,
      priority: item.priority,
      successCriterion: item.success_criterion,
      title: item.title,
      why: item.why
    })),
    communicationMetrics: {
      averageAnswerLengthMs: source.communication_metrics.average_answer_length_ms,
      fillerWordCount: source.communication_metrics.filler_word_count,
      interruptionCount: source.communication_metrics.interruption_count,
      longPauseCount: source.communication_metrics.long_pause_count,
      notes: [...source.communication_metrics.notes],
      speakingTimeMs: source.communication_metrics.speaking_time_ms,
      wordsPerMinute: source.communication_metrics.words_per_minute
    },
    createdAt: source.created_at,
    engineVersion: source.engine_version,
    executiveSummary: { plainText: source.executive_summary.plain_text },
    generatedAt: source.generated_at,
    id: asUiOpaqueId<'interview-report'>(source.id),
    improvements: source.improvements.map((item) => ({ plainText: item.plain_text })),
    limitations: [...source.limitations],
    overallConfidence: source.overall_confidence,
    overallScore: source.overall_score,
    reportVersion: source.report_version,
    revision: source.revision,
    rubricRef: { id: source.rubric_ref.id, version: source.rubric_ref.version },
    rubricScores: source.rubric_scores.map((score) => ({
      confidence: score.confidence,
      dimensionId: asUiOpaqueId<'interview-rubric-dimension'>(score.dimension_id),
      evidence: score.evidence.map(mapEvidenceClaim),
      improvementActions: [...score.improvement_actions],
      score: score.score,
      summary: { plainText: score.summary.plain_text }
    })),
    sessionId: asUiOpaqueId<'interview-session'>(source.session_id),
    strengths: source.strengths.map((item) => ({ plainText: item.plain_text })),
    updatedAt: source.updated_at,
    workspaceId: asUiOpaqueId<'workspace'>(source.workspace_id)
  }
}

/**
 * @brief 核对并映射一个 Interview 异步 Job / Verify and map one asynchronous Interview Job.
 * @param source 协议 Job 权威 / Protocol Job authority.
 * @param workspaceId 请求 Workspace / Requested Workspace.
 * @param sessionId 被操作 Session / Operated Session.
 * @return 通用 Workspace Job 权威 / Generic Workspace Job authority.
 */
function mapInterviewJob(
  source: Parameters<typeof mapWorkspaceJobAuthority>[0],
  workspaceId: string,
  sessionId: string
): ReturnType<typeof mapWorkspaceJobAuthority> {
  /** @brief 已映射 Job 权威 / Mapped Job authority. */
  const authority = mapWorkspaceJobAuthority(source)
  if (authority.job.workspaceId !== workspaceId || authority.job.subject.id !== sessionId) {
    throw new ApiV2ContractError(
      'Interview runtime received a Job outside the requested Workspace or Session.'
    )
  }
  return authority
}

/**
 * @brief 创建只使用 canonical API v2 的 Interview runtime gateway / Create an Interview runtime gateway using only canonical API v2.
 * @param client 已认证的 v2-only 产品 API client / Authenticated v2-only product API client.
 * @return 完整 12 用例 InterviewGateway / Complete 12-use-case InterviewGateway.
 */
export function createApiV2InterviewGateway(client: ApiV2HttpClient): InterviewGateway {
  return {
    async listInterviewScenarioPage(request) {
      /** @brief 已严格解码协议页 / Strictly decoded protocol page. */
      const page = await listWorkspaceInterviewScenarioPage(client, {
        cursor: request.cursor,
        limit: request.limit,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      /** @brief 当前页应用资源 / Application resources on the current page. */
      const items = page.items.map(mapInterviewScenario)
      if (items.some((scenario) => scenario.workspaceId !== request.workspaceId)) {
        throw new ApiV2ContractError(
          'Interview runtime received a Scenario collection outside the requested Workspace.'
        )
      }
      if (!page.page.has_more) {
        return { hasMore: false, items, nextCursor: null }
      }
      if (page.page.next_cursor === null) {
        throw new ApiV2ContractError('An InterviewScenario page with more items needs a cursor.')
      }
      return {
        hasMore: true,
        items,
        nextCursor: asUiInterviewScenarioCursor(page.page.next_cursor)
      }
    },

    async createInterviewScenario(command) {
      /** @brief 已确认创建表示 / Confirmed created representation. */
      const representation = await createWorkspaceInterviewScenario(client, {
        idempotencyKey: command.commandId,
        request: mapUiScenarioInput(command.input),
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapScenarioAuthority(
        representation.value,
        representation.entityTag,
        command.workspaceId
      )
    },

    async getInterviewScenario(request) {
      /** @brief 同响应 Scenario 与 ETag / Co-response Scenario and ETag. */
      const representation = await getWorkspaceInterviewScenario(client, {
        scenarioId: request.scenarioId,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      return mapScenarioAuthority(
        representation.value,
        representation.entityTag,
        request.workspaceId,
        request.scenarioId
      )
    },

    async updateInterviewScenario(command) {
      /** @brief 更新后 Scenario 与新 ETag / Updated Scenario and new ETag. */
      const representation = await updateWorkspaceInterviewScenario(client, {
        ifMatch: command.concurrencyToken,
        request: mapUiScenarioPatch(command.patch),
        scenarioId: command.scenarioId,
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapScenarioAuthority(
        representation.value,
        representation.entityTag,
        command.workspaceId,
        command.scenarioId
      )
    },

    async listInterviewSessionPage(request) {
      /** @brief 已严格解码协议页 / Strictly decoded protocol page. */
      const page = await listWorkspaceInterviewSessionPage(client, {
        cursor: request.cursor,
        limit: request.limit,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      /** @brief 当前页应用资源 / Application resources on the current page. */
      const items = page.items.map(mapInterviewSession)
      if (items.some((session) => session.workspaceId !== request.workspaceId)) {
        throw new ApiV2ContractError(
          'Interview runtime received a Session collection outside the requested Workspace.'
        )
      }
      if (!page.page.has_more) {
        return { hasMore: false, items, nextCursor: null }
      }
      if (page.page.next_cursor === null) {
        throw new ApiV2ContractError('An InterviewSession page with more items needs a cursor.')
      }
      return {
        hasMore: true,
        items,
        nextCursor: asUiInterviewSessionCursor(page.page.next_cursor)
      }
    },

    async createInterviewSession(command) {
      /** @brief 已确认创建表示 / Confirmed created representation. */
      const representation = await createWorkspaceInterviewSession(client, {
        idempotencyKey: command.commandId,
        request: mapUiSessionInput(command.input),
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapSessionAuthority(
        representation.value,
        representation.entityTag,
        command.workspaceId
      )
    },

    async getInterviewSession(request) {
      /** @brief 同响应 Session 与 ETag / Co-response Session and ETag. */
      const representation = await getWorkspaceInterviewSession(client, {
        sessionId: request.sessionId,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      return mapSessionAuthority(
        representation.value,
        representation.entityTag,
        request.workspaceId,
        request.sessionId
      )
    },

    async createRealtimeConnection(command) {
      /** @brief 短期连接表示 / Short-lived connection representation. */
      const representation = await createWorkspaceInterviewRealtimeConnection(client, {
        idempotencyKey: command.commandId,
        request: {
          audio_codecs: [...command.audioCodecs],
          supported_transports: [...command.supportedTransports],
          video_codecs: [...command.videoCodecs]
        },
        sessionId: command.sessionId,
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapRealtimeConnection(representation.value, command.sessionId)
    },

    async requestInterviewSessionEnd(command) {
      /** @brief 已接受 EndRequest Job / Accepted EndRequest Job. */
      const representation = await endWorkspaceInterviewSession(client, {
        idempotencyKey: command.commandId,
        ifMatch: command.concurrencyToken,
        request: { reason: command.reason },
        sessionId: command.sessionId,
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapInterviewJob(representation, command.workspaceId, command.sessionId)
    },

    async listInterviewTranscriptPage(request) {
      /** @brief 已严格解码 transcript 页 / Strictly decoded transcript page. */
      const page = await listWorkspaceInterviewTranscriptPage(client, {
        cursor: request.cursor,
        limit: request.limit,
        sessionId: request.sessionId,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      /** @brief 当前页应用片段 / Application segments on the current page. */
      const items = page.items.map(mapInterviewTranscriptSegment)
      if (!page.page.has_more) {
        return { hasMore: false, items, nextCursor: null }
      }
      if (page.page.next_cursor === null) {
        throw new ApiV2ContractError('An InterviewTranscript page with more items needs a cursor.')
      }
      return {
        hasMore: true,
        items,
        nextCursor: asUiInterviewTranscriptCursor(page.page.next_cursor)
      }
    },

    async createInterviewReportJob(command) {
      /** @brief 保留 rubricVersion 缺失语义的请求 / Request preserving rubricVersion omission. */
      const reportRequest =
        command.rubricVersion === undefined ? {} : { rubric_version: command.rubricVersion }
      /** @brief 已接受 ReportJob / Accepted ReportJob. */
      const representation = await createWorkspaceInterviewReportJob(client, {
        idempotencyKey: command.commandId,
        request: reportRequest,
        sessionId: command.sessionId,
        workspaceId: command.workspaceId,
        ...(command.signal === undefined ? {} : { signal: command.signal })
      })
      return mapInterviewJob(representation, command.workspaceId, command.sessionId)
    },

    async getInterviewReport(request) {
      /** @brief 同响应 Report 与 ETag / Co-response Report and ETag. */
      const representation = await getWorkspaceInterviewReport(client, {
        reportId: request.reportId,
        workspaceId: request.workspaceId,
        ...(request.signal === undefined ? {} : { signal: request.signal })
      })
      /** @brief 已映射 Report / Mapped Report. */
      const report = mapInterviewReport(representation.value)
      if (report.workspaceId !== request.workspaceId || report.id !== request.reportId) {
        throw new ApiV2ContractError(
          'Interview runtime received a Report outside the requested Workspace or identity path.'
        )
      }
      return report
    }
  }
}
