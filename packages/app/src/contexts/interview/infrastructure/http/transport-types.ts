/** @file Interview 已冻结 REST 端点的 transport DTO / Transport DTOs for confirmed Interview REST endpoints. */

/** @brief Interview 富文本的纯文本投影 / Plain-text projection of Interview rich text. */
export interface InterviewRichTextDto {
  /** @brief 可供当前 UI 展示的语义文本 / Semantic text displayable by the current UI. */
  readonly plain_text: string
}

/** @brief 目标岗位 DTO / Job-target DTO. */
export interface InterviewJobTargetDto {
  readonly title: string
  readonly company: string | null
  readonly location: string | null
  readonly seniority: string | null
  readonly skills: readonly string[]
}

/** @brief 评估量表维度 DTO / Evaluation-rubric dimension DTO. */
export interface InterviewRubricDimensionDto {
  readonly dimension_id: string
  readonly name: string
  readonly weight: number
  readonly observable_indicators: readonly string[]
  readonly scoring_scale: {
    readonly minimum: number
    readonly maximum: number
    readonly labels: Readonly<Record<string, string>>
  }
}

/** @brief 评估量表 DTO / Evaluation-rubric DTO. */
export interface InterviewRubricDto {
  readonly rubric_id: string
  readonly rubric_version: string
  readonly name: string
  readonly dimensions: readonly InterviewRubricDimensionDto[]
  readonly overall_scale: {
    readonly minimum: number
    readonly maximum: number
  }
}

/** @brief Interview 场景 DTO / Interview-scenario DTO. */
export interface InterviewScenarioDto {
  readonly id: string
  readonly workspace_id: string
  readonly name: string
  readonly interview_type: string
  readonly difficulty: string
  readonly duration_minutes: number
  readonly target_question_count: number
  readonly focus_areas: readonly string[]
  readonly allow_followups: boolean
  readonly allow_barge_in: boolean
  readonly rubric: InterviewRubricDto
}

/** @brief Interview 媒体偏好 DTO / Interview-media-preferences DTO. */
export interface InterviewMediaPreferencesDto {
  readonly user_audio: boolean
  readonly user_video: boolean
  readonly screen_share: boolean
  readonly max_video_width: number
  readonly max_video_height: number
  readonly max_video_fps: number
  readonly avatar: {
    readonly output_mode: string
    readonly avatar_id: string | null
    readonly voice_id: string | null
    readonly preferred_audio_codecs: readonly string[]
    readonly preferred_video_codecs: readonly string[]
    readonly include_visemes: boolean
    readonly include_expression_cues: boolean
  }
  readonly fallback_transport: string
}

/** @brief Interview 会话 DTO / Interview-session DTO. */
export interface InterviewSessionDto {
  readonly id: string
  readonly workspace_id: string
  readonly scenario_id: string | null
  readonly status: string
  readonly job_target: InterviewJobTargetDto
  readonly locale: string
  readonly media: InterviewMediaPreferencesDto
  readonly started_at: string | null
  readonly ended_at: string | null
  readonly report_id: string | null
}

/** @brief Interview 报告证据 DTO / Interview-report evidence DTO. */
export interface InterviewEvidenceDto {
  readonly segment_id: string
  readonly start_ms: number
  readonly end_ms: number
  readonly quote: string | null
}

/** @brief Interview 量表得分 DTO / Interview rubric-score DTO. */
export interface InterviewRubricScoreDto {
  readonly dimension_id: string
  readonly score: number
  readonly confidence: number
  readonly summary: InterviewRichTextDto
  readonly evidence: readonly InterviewEvidenceDto[]
  readonly improvement_actions: readonly string[]
}

/** @brief Interview 报告 DTO / Interview-report DTO. */
export interface InterviewReportDto {
  readonly id: string
  readonly session_id: string
  readonly report_version: string
  readonly rubric_ref: {
    readonly id: string
    readonly version: string
  }
  readonly overall_score: number | null
  readonly overall_confidence: number
  readonly executive_summary: InterviewRichTextDto
  readonly strengths: readonly InterviewRichTextDto[]
  readonly improvements: readonly InterviewRichTextDto[]
  readonly rubric_scores: readonly InterviewRubricScoreDto[]
  readonly communication_metrics: {
    readonly speaking_time_ms: number | null
    readonly average_answer_length_ms: number | null
    readonly words_per_minute: number | null
    readonly filler_word_count: number | null
    readonly long_pause_count: number | null
    readonly interruption_count: number | null
    readonly notes: readonly string[]
  }
  readonly action_plan: readonly {
    readonly priority: string
    readonly title: string
    readonly why: string
    readonly practice: string
    readonly success_criterion: string
  }[]
  readonly limitations: readonly string[]
  readonly created_at: string
}

/** @brief 创建 Interview 会话的已冻结请求 DTO / Confirmed request DTO for creating an Interview session. */
export interface InterviewSessionCreateRequestDto {
  readonly workspace_id: string
  readonly scenario_id: string
  readonly resume_ref: null
  readonly job_target: {
    readonly title: string
    readonly company: string | null
    readonly location: string | null
    readonly description: null
    readonly source_url: null
    readonly seniority: string | null
    readonly skills: readonly string[]
  }
  readonly knowledge: {
    readonly mode: 'explicit' | 'none'
    readonly include_source_ids: readonly string[]
    readonly exclude_source_ids: readonly string[]
    readonly pinned_versions: readonly never[]
    readonly agent_scope: 'interview_agent'
  }
  readonly locale: string
  readonly media: InterviewMediaPreferencesDto
  readonly recording: {
    readonly record_audio: boolean
    readonly record_video: boolean
    readonly store_transcript: boolean
    readonly retention_days: number
    readonly user_consent_at: string | null
    readonly consent_version: string | null
  }
  readonly inference: {
    readonly quality_tier: 'fast' | 'balanced' | 'deep'
    readonly latency_budget_ms: number | null
    readonly cost_tier: 'economy' | 'standard' | 'premium'
    readonly data_region: 'cn' | 'global' | 'private_deployment'
    readonly allow_provider_fallback: boolean
    readonly allow_external_model_processing: boolean
  }
  readonly client_capabilities: {
    readonly platform: 'web' | 'electron'
    readonly webrtc: boolean
    readonly websocket_binary: boolean
    readonly supported_audio_codecs: readonly string[]
    readonly supported_video_codecs: readonly string[]
  }
  readonly extensions: Readonly<Record<string, unknown>>
}
