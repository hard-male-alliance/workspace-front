/**
 * @file 确定性 Mock 数据 / Deterministic Mock data.
 * @remarks
 * 所有数据仅用于 v0.1.0 页面验收，不代表服务端响应、真实用户资料或正式 API DTO。
 */

import {
  asUiOpaqueId,
  type UiInterviewReport,
  type UiInterviewScenario,
  type UiInterviewSession,
  type UiKnowledgeSource,
  type UiKnowledgeVisibilityModel,
  type UiLiveInterviewModel,
  type UiResumeCard,
  type UiResumeDocument,
  type UiResumeEditorModel,
  type UiTemplateManifest,
  type UiTemplateSettingsModel,
  type UiWorkspace,
  type UiWorkspaceHomeModel
} from '../../domain/models'

/** @brief Mock 工作区 ID / Mock workspace ID. */
export const MOCK_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Mock 简历 ID / Mock resume ID. */
export const MOCK_RESUME_ID = asUiOpaqueId<'resume'>('res_mock_ai_platform')

/** @brief Mock 简历知识来源 ID / Mock resume knowledge-source ID. */
export const MOCK_RESUME_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_resume')

/** @brief Mock 主模板 ID / Mock primary template ID. */
export const MOCK_DAWN_TEMPLATE_ID = asUiOpaqueId<'template'>('tpl_mock_dawn')

/** @brief Mock 备选模板 ID / Mock alternate template ID. */
export const MOCK_EDITORIAL_TEMPLATE_ID = asUiOpaqueId<'template'>('tpl_mock_editorial')

/** @brief Mock 面试场景 ID / Mock interview scenario ID. */
export const MOCK_INTERVIEW_SCENARIO_ID =
  asUiOpaqueId<'interview-scenario'>('scn_mock_system_design')

/** @brief Mock 面试会话 ID / Mock interview session ID. */
export const MOCK_INTERVIEW_SESSION_ID = asUiOpaqueId<'interview-session'>('int_mock_system_design')

/** @brief Mock 面试报告 ID / Mock interview report ID. */
export const MOCK_INTERVIEW_REPORT_ID = asUiOpaqueId<'interview-report'>('rpt_mock_system_design')

/** @brief Mock Git 知识来源 ID / Mock Git knowledge-source ID. */
export const MOCK_GIT_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_git')

/** @brief Mock 博客知识来源 ID / Mock blog knowledge-source ID. */
export const MOCK_BLOG_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_blog')

/** @brief Mock 文件知识来源 ID / Mock file knowledge-source ID. */
export const MOCK_FILE_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_file')

/** @brief 固定的 Mock 参考时间 / Fixed Mock reference time. */
export const MOCK_REFERENCE_TIME = '2026-07-15T04:10:00.000Z'

/** @brief Mock 工作区列表 / Mock workspace list. */
export const MOCK_WORKSPACES: readonly UiWorkspace[] = [
  {
    id: MOCK_WORKSPACE_ID,
    name: 'Klee 的职业实验室',
    slug: 'klee-career-lab',
    role: 'owner',
    locale: 'zh-SG',
    timezone: 'Asia/Singapore',
    plan: 'pro',
    updatedAt: '2026-07-15T03:56:00.000Z'
  }
]

/** @brief Mock 工作区首页数据 / Mock workspace-home data. */
export const MOCK_WORKSPACE_HOME: UiWorkspaceHomeModel = {
  workspace: MOCK_WORKSPACES[0]!,
  resumeCount: 2,
  readyKnowledgeSourceCount: 2,
  completedInterviewCount: 4,
  recentActivities: [
    {
      id: 'activity_resume',
      kind: 'resume_updated',
      title: '更新了 AI 平台工程师简历',
      description: '同步了最新项目经历与技能摘要。',
      occurredAt: '2026-07-15T03:56:00.000Z'
    },
    {
      id: 'activity_interview',
      kind: 'interview_completed',
      title: '完成系统设计模拟面试',
      description: '报告已生成，包含 3 个高优先级练习项。',
      occurredAt: '2026-07-14T14:30:00.000Z'
    },
    {
      id: 'activity_knowledge',
      kind: 'knowledge_indexed',
      title: '索引了 portfolio-engineering 仓库',
      description: 'Agent 可按可见性策略检索该知识来源。',
      occurredAt: '2026-07-14T09:20:00.000Z'
    }
  ]
}

/** @brief Mock 简历区段 ID：摘要 / Mock resume summary-section ID. */
export const MOCK_SUMMARY_SECTION_ID = asUiOpaqueId<'resume-section'>('sec_mock_summary')

/** @brief Mock 简历区段 ID：经历 / Mock resume experience-section ID. */
export const MOCK_EXPERIENCE_SECTION_ID = asUiOpaqueId<'resume-section'>('sec_mock_experience')

/** @brief Mock 简历区段 ID：项目 / Mock resume project-section ID. */
export const MOCK_PROJECT_SECTION_ID = asUiOpaqueId<'resume-section'>('sec_mock_projects')

/** @brief Mock 简历区段 ID：技能 / Mock resume skills-section ID. */
export const MOCK_SKILLS_SECTION_ID = asUiOpaqueId<'resume-section'>('sec_mock_skills')

/** @brief Mock 主模板清单 / Mock primary template manifest. */
export const MOCK_DAWN_TEMPLATE: UiTemplateManifest = {
  id: MOCK_DAWN_TEMPLATE_ID,
  version: '1.0.0',
  name: 'Dawn',
  description: '温暖、紧凑且适合技术求职的单栏模板。',
  previewAssetUrl: null,
  supportedLocales: ['zh-SG', 'en-US'],
  supportedPageSizes: ['A4', 'LETTER'],
  supportedSectionKinds: ['summary', 'experience', 'education', 'projects', 'skills', 'custom'],
  zones: [
    {
      id: 'main',
      labelKey: 'template.zoneMain',
      acceptedSectionKinds: ['summary', 'experience', 'education', 'projects', 'skills', 'custom'],
      maxSections: null
    },
    {
      id: 'sidebar',
      labelKey: 'template.zoneSidebar',
      acceptedSectionKinds: ['skills', 'languages', 'certifications', 'custom'],
      maxSections: 4
    }
  ],
  fontFamilyTokens: ['serif_editorial', 'sans_clean'],
  dateFormatTokens: ['yyyy_mm', 'mmm_yyyy'],
  bulletStyleTokens: ['disc', 'dash'],
  settings: [
    {
      key: 'show_contact_icons',
      labelKey: 'template.settings.showContactIcons.label',
      descriptionKey: 'template.settings.showContactIcons.description',
      valueType: 'boolean',
      defaultValue: true,
      minimum: null,
      maximum: null,
      choices: [],
      control: 'switch',
      groupKey: 'template.groups.header'
    },
    {
      key: 'accent_style',
      labelKey: 'template.settings.accentStyle.label',
      descriptionKey: 'template.settings.accentStyle.description',
      valueType: 'choice',
      defaultValue: 'warm',
      minimum: null,
      maximum: null,
      choices: [
        {
          value: 'warm',
          labelKey: 'template.settings.accentStyle.warm',
          descriptionKey: null
        },
        {
          value: 'ink',
          labelKey: 'template.settings.accentStyle.ink',
          descriptionKey: null
        }
      ],
      control: 'radio',
      groupKey: 'template.groups.appearance'
    },
    {
      key: 'section_spacing',
      labelKey: 'template.settings.sectionSpacing.label',
      descriptionKey: 'template.settings.sectionSpacing.description',
      valueType: 'number',
      defaultValue: 0.72,
      minimum: 0.4,
      maximum: 1,
      choices: [],
      control: 'slider',
      groupKey: 'template.groups.appearance'
    }
  ],
  capabilities: {
    supportsPhoto: false,
    supportsSidebar: true,
    supportsCustomSections: true,
    supportsSourceMap: true,
    maxColumns: 2
  }
}

/** @brief Mock 备选模板清单 / Mock alternate template manifest. */
export const MOCK_EDITORIAL_TEMPLATE: UiTemplateManifest = {
  id: MOCK_EDITORIAL_TEMPLATE_ID,
  version: '1.0.0',
  name: 'Editorial',
  description: '强调项目叙事与阅读节奏的单栏模板。',
  previewAssetUrl: null,
  supportedLocales: ['zh-SG', 'en-US'],
  supportedPageSizes: ['A4', 'LETTER', 'LEGAL'],
  supportedSectionKinds: [
    'summary',
    'experience',
    'education',
    'projects',
    'skills',
    'publications'
  ],
  zones: [
    {
      id: 'main',
      labelKey: 'template.zoneMain',
      acceptedSectionKinds: [
        'summary',
        'experience',
        'education',
        'projects',
        'skills',
        'publications'
      ],
      maxSections: null
    }
  ],
  fontFamilyTokens: ['serif_editorial', 'sans_clean'],
  dateFormatTokens: ['yyyy_mm', 'mmm_yyyy'],
  bulletStyleTokens: ['disc', 'dash'],
  settings: [
    {
      key: 'show_rule',
      labelKey: 'template.settings.showRule.label',
      descriptionKey: 'template.settings.showRule.description',
      valueType: 'boolean',
      defaultValue: true,
      minimum: null,
      maximum: null,
      choices: [],
      control: 'switch',
      groupKey: 'template.groups.appearance'
    }
  ],
  capabilities: {
    supportsPhoto: false,
    supportsSidebar: false,
    supportsCustomSections: false,
    supportsSourceMap: true,
    maxColumns: 1
  }
}

/** @brief 所有 Mock 模板清单 / All Mock template manifests. */
export const MOCK_TEMPLATE_MANIFESTS: readonly UiTemplateManifest[] = [
  MOCK_DAWN_TEMPLATE,
  MOCK_EDITORIAL_TEMPLATE
]

/** @brief Mock 简历文档 / Mock resume document. */
export const MOCK_RESUME_DOCUMENT: UiResumeDocument = {
  id: MOCK_RESUME_ID,
  workspaceId: MOCK_WORKSPACE_ID,
  revision: 18,
  title: 'AI 平台工程师 · 中文简历',
  locale: 'zh-SG',
  template: {
    templateId: MOCK_DAWN_TEMPLATE_ID,
    templateVersion: MOCK_DAWN_TEMPLATE.version
  },
  profile: {
    fullName: 'Klee Chen',
    headline: 'AI Platform Engineer · Distributed Systems',
    summary: '面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。',
    contacts: [
      { kind: 'email', label: '邮箱', value: 'klee@example.com' },
      { kind: 'github', label: 'GitHub', value: 'github.com/klee-lab' },
      { kind: 'location', label: '地点', value: 'Singapore' }
    ]
  },
  sections: [
    {
      id: MOCK_SUMMARY_SECTION_ID,
      kind: 'summary',
      title: '职业摘要',
      visible: true,
      contentPreview: '面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。',
      items: []
    },
    {
      id: MOCK_EXPERIENCE_SECTION_ID,
      kind: 'experience',
      title: '工作经历',
      visible: true,
      contentPreview: null,
      items: [
        {
          id: 'itm_mock_platform_engineer',
          kind: 'experience',
          title: 'AI 平台工程师',
          subtitle: 'Arcadia Systems',
          dateLabel: '2023.03 — 至今',
          locationLabel: 'Singapore',
          highlights: [
            '设计多租户 Agent 运行时，将在线推理 p95 延迟降低 31%。',
            '建立端到端可观测性与评估闭环，缩短生产问题定位时间。'
          ],
          tags: ['TypeScript', 'Python', 'Kubernetes'],
          visible: true
        },
        {
          id: 'itm_mock_backend_engineer',
          kind: 'experience',
          title: '后端工程师',
          subtitle: 'Northwind Labs',
          dateLabel: '2020.07 — 2023.02',
          locationLabel: 'Shanghai',
          highlights: ['负责高并发 API 网关与异步任务平台的演进。'],
          tags: ['Go', 'PostgreSQL'],
          visible: true
        }
      ]
    },
    {
      id: MOCK_PROJECT_SECTION_ID,
      kind: 'projects',
      title: '代表项目',
      visible: true,
      contentPreview: null,
      items: [
        {
          id: 'itm_mock_resume_workspace',
          kind: 'project',
          title: 'AI 求职 Workspace',
          subtitle: '个人项目',
          dateLabel: '2026',
          locationLabel: null,
          highlights: [
            '以语义中间表示驱动简历编辑、PDF 渲染与 Agent proposal 审批。',
            '设计默认拒绝的个人知识可见性模型。'
          ],
          tags: ['React', 'Electron', 'WebRTC'],
          visible: true
        }
      ]
    },
    {
      id: MOCK_SKILLS_SECTION_ID,
      kind: 'skills',
      title: '技能',
      visible: true,
      contentPreview: null,
      items: [
        {
          id: 'itm_mock_core_skills',
          kind: 'skill_group',
          title: '核心能力',
          subtitle: null,
          dateLabel: null,
          locationLabel: null,
          highlights: ['分布式系统', 'LLM 应用工程', '数据与可观测性'],
          tags: ['Python', 'TypeScript', 'React', 'PostgreSQL'],
          visible: true
        }
      ]
    }
  ],
  styleIntent: {
    styleContractVersion: '1.0',
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: {
        top: { value: 16, unit: 'mm' },
        right: { value: 16, unit: 'mm' },
        bottom: { value: 16, unit: 'mm' },
        left: { value: 16, unit: 'mm' }
      },
      maxPages: 2,
      showPageNumbers: false
    },
    typography: {
      fontFamilyToken: 'sans_clean',
      baseSizePt: 9.6,
      lineHeight: 1.33,
      headingScale: 1.42,
      letterSpacingEm: 0
    },
    palette: {
      primary: { space: 'srgb_hex', value: '#A36342' },
      secondary: { space: 'srgb_hex', value: '#D8B59B' },
      text: { space: 'srgb_hex', value: '#282522' },
      mutedText: { space: 'srgb_hex', value: '#6F6861' },
      background: { space: 'srgb_hex', value: '#FFFDF8' }
    },
    density: 0.67,
    dateFormatToken: 'yyyy_mm',
    bulletStyleToken: 'disc',
    sectionLayout: [
      {
        sectionId: MOCK_SUMMARY_SECTION_ID,
        zone: 'main',
        keepTogether: true,
        pageBreakBefore: false,
        compactness: 0.65,
        headingStyleToken: 'section_primary'
      },
      {
        sectionId: MOCK_EXPERIENCE_SECTION_ID,
        zone: 'main',
        keepTogether: false,
        pageBreakBefore: false,
        compactness: 0.72,
        headingStyleToken: 'section_primary'
      },
      {
        sectionId: MOCK_PROJECT_SECTION_ID,
        zone: 'main',
        keepTogether: false,
        pageBreakBefore: false,
        compactness: 0.68,
        headingStyleToken: 'section_primary'
      },
      {
        sectionId: MOCK_SKILLS_SECTION_ID,
        zone: 'sidebar',
        keepTogether: true,
        pageBreakBefore: false,
        compactness: 0.62,
        headingStyleToken: 'section_secondary'
      }
    ],
    templateSettings: {
      show_contact_icons: true,
      accent_style: 'warm',
      section_spacing: 0.72
    }
  },
  knowledgeSourceId: MOCK_RESUME_KNOWLEDGE_SOURCE_ID,
  updatedAt: '2026-07-15T03:56:00.000Z'
}

/** @brief Mock 简历卡片 / Mock resume cards. */
export const MOCK_RESUME_CARDS: readonly UiResumeCard[] = [
  {
    id: MOCK_RESUME_DOCUMENT.id,
    title: MOCK_RESUME_DOCUMENT.title,
    templateName: MOCK_DAWN_TEMPLATE.name,
    revision: MOCK_RESUME_DOCUMENT.revision,
    updatedAt: MOCK_RESUME_DOCUMENT.updatedAt
  },
  {
    id: asUiOpaqueId<'resume'>('res_mock_english'),
    title: 'AI Platform Engineer · EN',
    templateName: MOCK_EDITORIAL_TEMPLATE.name,
    revision: 7,
    updatedAt: '2026-07-10T10:30:00.000Z'
  }
]

/** @brief Mock 简历编辑器数据 / Mock resume-editor data. */
export const MOCK_RESUME_EDITOR: UiResumeEditorModel = {
  resume: MOCK_RESUME_DOCUMENT,
  preview: {
    state: 'ready',
    pageCount: 1,
    renderedAt: '2026-07-15T03:56:10.000Z',
    diagnostic: null
  },
  assistantMessages: [
    {
      id: 'msg_mock_user',
      role: 'user',
      text: '请检查这份简历是否凸显了 AI 平台工程的影响力。',
      createdAt: '2026-07-15T03:54:00.000Z',
      isStreaming: false
    },
    {
      id: 'msg_mock_assistant',
      role: 'assistant',
      text: '项目和指标已经很清晰。建议将第一段经历的技术选择与业务结果再紧密连接，并在摘要中补充目标岗位关键词。',
      createdAt: '2026-07-15T03:54:08.000Z',
      isStreaming: false
    }
  ]
}

/** @brief Mock 模板设置数据 / Mock template-settings data. */
export const MOCK_TEMPLATE_SETTINGS: UiTemplateSettingsModel = {
  resumeId: MOCK_RESUME_ID,
  selectedTemplate: MOCK_DAWN_TEMPLATE,
  availableTemplates: MOCK_TEMPLATE_MANIFESTS,
  styleIntent: MOCK_RESUME_DOCUMENT.styleIntent
}

/** @brief Mock 系统设计面试场景 / Mock system-design interview scenario. */
export const MOCK_SYSTEM_DESIGN_SCENARIO: UiInterviewScenario = {
  id: MOCK_INTERVIEW_SCENARIO_ID,
  name: 'AI 平台系统设计',
  interviewType: 'system_design',
  difficulty: 'advanced',
  durationMinutes: 45,
  targetQuestionCount: 5,
  focusAreas: ['需求澄清', '架构取舍', '可靠性', '可观测性'],
  allowFollowups: true,
  allowBargeIn: true,
  rubric: {
    id: 'rub_mock_system_design',
    version: '2026.07',
    name: '系统设计表现量表',
    dimensions: [
      {
        id: 'rub_dim_problem_framing',
        name: '问题界定',
        weight: 0.25,
        observableIndicators: ['主动澄清负载、用户与约束', '将目标转化为可验证的需求']
      },
      {
        id: 'rub_dim_architecture',
        name: '架构取舍',
        weight: 0.35,
        observableIndicators: ['解释关键组件职责', '明确一致性、成本与延迟取舍']
      },
      {
        id: 'rub_dim_communication',
        name: '表达与协作',
        weight: 0.2,
        observableIndicators: ['回答结构清晰', '及时校准面试官理解']
      },
      {
        id: 'rub_dim_reliability',
        name: '可靠性与演进',
        weight: 0.2,
        observableIndicators: ['覆盖故障场景', '提出可观测性和渐进迁移路径']
      }
    ],
    minimumScore: 0,
    maximumScore: 100
  }
}

/** @brief 所有 Mock 面试场景 / All Mock interview scenarios. */
export const MOCK_INTERVIEW_SCENARIOS: readonly UiInterviewScenario[] = [
  MOCK_SYSTEM_DESIGN_SCENARIO,
  {
    id: asUiOpaqueId<'interview-scenario'>('scn_mock_behavioral'),
    name: '行为面试：影响力与协作',
    interviewType: 'behavioral',
    difficulty: 'standard',
    durationMinutes: 30,
    targetQuestionCount: 4,
    focusAreas: ['STAR 叙事', '利益相关方协作', '复盘'],
    allowFollowups: true,
    allowBargeIn: true,
    rubric: MOCK_SYSTEM_DESIGN_SCENARIO.rubric
  }
]

/** @brief Mock 面试会话 / Mock interview session. */
export const MOCK_INTERVIEW_SESSION: UiInterviewSession = {
  id: MOCK_INTERVIEW_SESSION_ID,
  workspaceId: MOCK_WORKSPACE_ID,
  scenarioId: MOCK_INTERVIEW_SCENARIO_ID,
  status: 'in_progress',
  jobTarget: {
    title: 'AI Platform Engineer',
    company: 'Northstar AI',
    location: 'Singapore',
    seniority: 'senior',
    skills: ['Python', 'LLM', 'Distributed Systems']
  },
  locale: 'zh-SG',
  media: {
    userAudio: true,
    userVideo: true,
    avatarOutputMode: 'client_render',
    fallbackTransport: 'audio_only'
  },
  startedAt: '2026-07-15T03:20:00.000Z',
  endedAt: null,
  reportId: MOCK_INTERVIEW_REPORT_ID
}

/** @brief Mock 实时面试数据 / Mock live-interview data. */
export const MOCK_LIVE_INTERVIEW: UiLiveInterviewModel = {
  session: MOCK_INTERVIEW_SESSION,
  scenario: MOCK_SYSTEM_DESIGN_SCENARIO,
  connectionState: 'connected',
  interviewerText: '请从需求澄清开始，设计一个支持多团队协作的 Agent 评估平台。',
  transcript: [
    {
      id: 'seg_mock_interviewer_1',
      speaker: 'interviewer',
      text: '请从需求澄清开始，设计一个支持多团队协作的 Agent 评估平台。',
      isFinal: true,
      startMs: 0,
      endMs: 6200
    },
    {
      id: 'seg_mock_candidate_1',
      speaker: 'candidate',
      text: '我会先确认评估对象、并发规模、数据保留与可审计要求，然后从控制面和数据面拆分。',
      isFinal: true,
      startMs: 7200,
      endMs: 14600
    },
    {
      id: 'seg_mock_candidate_partial',
      speaker: 'candidate',
      text: '对于执行数据，我倾向于使用异步任务……',
      isFinal: false,
      startMs: 15000,
      endMs: 18200
    }
  ]
}

/** @brief Mock 面试总结 / Mock interview report. */
export const MOCK_INTERVIEW_REPORT: UiInterviewReport = {
  id: MOCK_INTERVIEW_REPORT_ID,
  sessionId: MOCK_INTERVIEW_SESSION_ID,
  reportVersion: '1.0.0-mock',
  overallScore: 82,
  overallConfidence: 0.78,
  executiveSummary:
    '你以需求澄清和控制面/数据面分层建立了稳健的答题骨架；下一步应更早量化容量假设，并把关键一致性取舍落到具体故障路径。',
  strengths: ['在回答开始阶段主动确认目标与约束。', '能将可观测性作为架构的一等需求。'],
  improvements: ['为关键容量假设给出数量级估算。', '用更明确的顺序说明降级、重试与幂等策略。'],
  rubricScores: [
    {
      dimensionId: 'rub_dim_problem_framing',
      score: 88,
      confidence: 0.85,
      summary: '需求澄清覆盖了用户、并发和数据保留约束。',
      evidence: [
        {
          segmentId: 'seg_mock_candidate_1',
          startMs: 7200,
          endMs: 11200,
          quote: '我会先确认评估对象、并发规模、数据保留与可审计要求。'
        }
      ],
      improvementActions: ['在澄清后立即写出 2–3 个可量化的 SLO。']
    },
    {
      dimensionId: 'rub_dim_architecture',
      score: 79,
      confidence: 0.73,
      summary: '分层方向正确，但容量、队列边界和一致性策略还可更具体。',
      evidence: [
        {
          segmentId: 'seg_mock_candidate_1',
          startMs: 11200,
          endMs: 14600,
          quote: '然后从控制面和数据面拆分。'
        }
      ],
      improvementActions: ['将异步任务、幂等键和重试边界明确画进架构图。']
    },
    {
      dimensionId: 'rub_dim_communication',
      score: 84,
      confidence: 0.76,
      summary: '表达有清晰结构，术语使用准确。',
      evidence: [],
      improvementActions: ['每完成一个模块后，用一句话确认面试官是否希望继续展开。']
    },
    {
      dimensionId: 'rub_dim_reliability',
      score: 77,
      confidence: 0.69,
      summary: '提到了可观测性，但还未完整覆盖背压和降级路径。',
      evidence: [],
      improvementActions: ['为每条关键链路列出超时、重试、降级与告警。']
    }
  ],
  communicationMetrics: {
    speakingTimeMs: 121000,
    averageAnswerLengthMs: 18400,
    wordsPerMinute: 168,
    fillerWordCount: 5,
    longPauseCount: 2,
    interruptionCount: 0,
    notes: ['指标仅描述已转录的面试行为，不推断人格、情绪或受保护属性。']
  },
  actionPlan: [
    {
      priority: 'high',
      title: '练习容量估算开场',
      why: '容量假设决定存储、队列和成本取舍是否可信。',
      practice: '为三个常见系统设计题各写 5 分钟容量估算，并在白板上复述。',
      successCriterion: '能在 90 秒内讲清楚 QPS、数据量和一个峰值假设。'
    },
    {
      priority: 'medium',
      title: '把故障路径讲成闭环',
      why: '可靠性回答需要可执行的检测、缓解和恢复链路。',
      practice: '为异步任务系统画出超时、幂等、死信队列和告警流。',
      successCriterion: '每个故障点都有明确 owner、监控信号与降级方式。'
    }
  ],
  limitations: [
    '该报告基于已确认的转录片段与量表，不应被视为对能力、人格或就业结果的确定性判断。',
    '部分实时回答仍处于 Mock 流式状态，相关结论置信度应保守解读。'
  ],
  createdAt: '2026-07-14T14:30:00.000Z'
}

/** @brief 默认的 Mock 知识可见性策略 / Default Mock knowledge-visibility policy. */
export const MOCK_DEFAULT_VISIBILITY_POLICY = {
  policyVersion: 3,
  defaultEffect: 'deny',
  sensitivity: 'confidential',
  agentGrants: [
    {
      agentScope: 'resume_assistant',
      effect: 'allow',
      allowedOperations: ['retrieve', 'quote', 'summarize', 'derive']
    },
    {
      agentScope: 'interview_agent',
      effect: 'allow',
      allowedOperations: ['retrieve', 'summarize', 'derive']
    }
  ],
  sessionOverrideAllowed: true,
  allowExternalModelProcessing: false,
  allowedModelRegions: ['cn', 'private_deployment'],
  retentionDays: null
} as const satisfies UiKnowledgeSource['visibility']

/** @brief Mock 知识来源列表 / Mock knowledge-source list. */
export const MOCK_KNOWLEDGE_SOURCES: readonly UiKnowledgeSource[] = [
  {
    id: MOCK_RESUME_KNOWLEDGE_SOURCE_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: 'AI 平台工程师 · 中文简历',
    sourceType: 'resume',
    originLabel: 'Resume revision 18 · 自动同步',
    ingestionStatus: 'ready',
    documentCount: 1,
    chunkCount: 18,
    enabled: true,
    visibility: MOCK_DEFAULT_VISIBILITY_POLICY,
    lastSuccessAt: '2026-07-15T03:56:20.000Z',
    updatedAt: '2026-07-15T03:56:20.000Z'
  },
  {
    id: MOCK_GIT_KNOWLEDGE_SOURCE_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: 'portfolio-engineering',
    sourceType: 'git_repository',
    originLabel: 'github.com/klee-lab/portfolio-engineering · main',
    ingestionStatus: 'ready',
    documentCount: 46,
    chunkCount: 327,
    enabled: true,
    visibility: MOCK_DEFAULT_VISIBILITY_POLICY,
    lastSuccessAt: '2026-07-14T09:20:00.000Z',
    updatedAt: '2026-07-14T09:20:00.000Z'
  },
  {
    id: MOCK_BLOG_KNOWLEDGE_SOURCE_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: '技术博客',
    sourceType: 'blog_feed',
    originLabel: 'klee.example/blog/rss.xml',
    ingestionStatus: 'embedding',
    documentCount: 12,
    chunkCount: 94,
    enabled: true,
    visibility: {
      ...MOCK_DEFAULT_VISIBILITY_POLICY,
      sensitivity: 'normal'
    },
    lastSuccessAt: '2026-07-13T08:05:00.000Z',
    updatedAt: '2026-07-15T02:12:00.000Z'
  },
  {
    id: MOCK_FILE_KNOWLEDGE_SOURCE_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    name: '旧版项目复盘.pdf',
    sourceType: 'file',
    originLabel: 'project-retrospective.pdf',
    ingestionStatus: 'failed',
    documentCount: 0,
    chunkCount: 0,
    enabled: false,
    visibility: {
      ...MOCK_DEFAULT_VISIBILITY_POLICY,
      sensitivity: 'highly_confidential',
      agentGrants: []
    },
    lastSuccessAt: null,
    updatedAt: '2026-07-12T11:40:00.000Z'
  }
]

/** @brief Mock 知识可见性页面数据 / Mock knowledge-visibility page data. */
export const MOCK_KNOWLEDGE_VISIBILITY: UiKnowledgeVisibilityModel = {
  source: MOCK_KNOWLEDGE_SOURCES[1]!,
  availableAgentScopes: [
    'resume_assistant',
    'job_fit_analyst',
    'interview_agent',
    'interview_reporter',
    'general_chat',
    'portfolio_assistant'
  ]
}
