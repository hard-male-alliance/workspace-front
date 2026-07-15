/** @file 双语翻译资源 / Bilingual translation resources. */

/** @brief 简体中文（新加坡）翻译资源 / Simplified Chinese (Singapore) translation resources. */
export const zhSGTranslation = {
  app: {
    name: '求职工作台',
    tagline: '把准备、练习和复盘放在同一个工作流里。'
  },
  nav: {
    primary: '主导航',
    workspaceGroup: '工作区',
    workspace: '工作台',
    resume: '简历',
    resumes: '简历',
    interview: '模拟面试',
    knowledge: '个人知识库',
    settings: '设置',
    states: '界面状态'
  },
  account: {
    plan: '个人工作区'
  },
  topbar: {
    feedback: '反馈',
    changeLocale: '切换界面语言'
  },
  common: {
    open: '打开',
    start: '开始',
    review: '查看',
    back: '返回',
    cancel: '取消',
    close: '关闭',
    continue: '继续',
    edit: '编辑',
    save: '保存',
    retry: '重试',
    learnMore: '了解更多',
    updated: '已更新',
    loading: '正在加载…',
    error: '暂时无法加载',
    empty: '这里还没有内容',
    mockData: '演示数据',
    comingSoon: '即将支持'
  },
  status: {
    ready: '已就绪',
    rendering: '正在渲染',
    failed: '失败',
    queued: '排队中',
    embedding: '正在建立索引',
    inProgress: '进行中',
    completed: '已完成',
    connected: '已连接',
    reconnecting: '正在重连'
  },
  workspace: {
    title: '工作台',
    greeting: '今天想把哪一步准备得更扎实？',
    resumeCount: '份简历',
    knowledgeCount: '个已就绪知识来源',
    interviewCount: '次已完成面试',
    recentActivity: '近期活动',
    quickActions: '快速开始',
    createResume: '打开简历编辑器',
    startInterview: '开始一次模拟面试',
    addKnowledge: '添加个人知识',
    home: {
      eyebrow: 'AI 求职工作台',
      greeting: '早上好，Klee。',
      description: '把简历、练习和个人知识放在同一处，专注下一次更好的表达。',
      continueEditing: '继续编辑简历',
      progressTitle: '本周进展',
      progressDescription: '这是演示用工作区聚合；真实统计会在服务端契约冻结后接入。',
      resumeCount: '份简历',
      interviewCount: '次已完成面试',
      knowledgeCount: '个已就绪知识源',
      resumeTitle: 'AI 平台工程师',
      resumeMeta: 'Dawn 模板 · 语义修订 v18 · 刚刚保存',
      nextTitle: '下一步',
      practiceTitle: '练习系统设计面试',
      practiceMeta: '45 分钟 · 可打断的数字人面试官',
      visibilityTitle: '检查知识可见性',
      visibilityMeta: '简历以外的资料默认拒绝访问',
      activityTitle: '最近活动',
      activityDescription: '资源、面试和知识索引的可见轨迹。',
      mockNotice: '当前为 v0.1 Mock 展示；不会向后端发送任何简历、媒体或知识数据。'
    }
  },
  resume: {
    title: '简历编辑器',
    form: '内容',
    preview: '预览',
    assistant: '简历助手',
    previewReady: '预览已同步',
    previewRendering: '正在生成预览',
    templateSettings: '模板设置',
    revision: '版本 {{revision}}',
    knowledgeLinked: '此简历已自动加入个人知识库',
    askAssistant: '询问助手如何优化这份简历…',
    emptyResumes: '还没有简历。创建一份后，它会自动成为可配置的知识来源。'
  },
  template: {
    title: '模板与版式',
    currentTemplate: '当前模板',
    otherTemplates: '其他可选模板',
    semanticIntent: '语义样式意图',
    migrationHint: '切换模板会在后端以显式迁移任务完成，当前仅展示设置。',
    zones: {
      main: '主内容区',
      sidebar: '侧栏'
    },
    groups: {
      header: '页首',
      appearance: '外观'
    },
    settings: {
      showContactIcons: {
        label: '显示联系方式图标',
        description: '仅控制模板的语义展示选项。'
      },
      accentStyle: {
        label: '强调风格',
        description: '由模板解释为其自身的渲染结果。',
        warm: '暖棕',
        ink: '墨黑'
      },
      sectionSpacing: {
        label: '区段间距',
        description: '更高的值会给内容更多呼吸空间。'
      },
      showRule: {
        label: '显示分隔线',
        description: '在主要内容区之间显示克制的分隔线。'
      }
    }
  },
  interview: {
    title: '数字人模拟面试',
    selectScenario: '选择一个练习场景',
    targetRole: '目标岗位',
    duration: '{{minutes}} 分钟',
    liveTranscript: '实时字幕',
    interviewer: '面试官',
    candidate: '你',
    interrupt: '打断',
    endInterview: '结束面试',
    mediaNotice: '当前为演示状态；真实音视频会经 WebRTC 传输，控制事件独立处理。',
    emptyScenarios: '当前没有可用场景。'
  },
  report: {
    title: '面试总结',
    overallScore: '总体得分',
    confidence: '置信度',
    strengths: '做得好的地方',
    improvements: '下一步改进',
    rubric: '维度评分',
    communication: '可观察沟通指标',
    actionPlan: '行动计划',
    limitations: '局限性说明',
    evidence: '转录证据'
  },
  knowledge: {
    title: '个人记忆与知识库',
    addSource: '添加知识来源',
    source: '知识来源',
    sources: '个来源',
    indexed: '已索引',
    documents: '份文档',
    chunks: '个片段',
    resumeAutoSync: '简历会自动作为知识来源加入；删除简历后不会保留幽灵索引。',
    emptySources: '还没有知识来源。你可以添加博客、代码仓库或文件。',
    visibility: '可见性设置'
  },
  visibility: {
    title: 'Agent 可见性',
    defaultDeny: '默认拒绝',
    policyVersion: '策略版本 {{version}}',
    sessionOverride: '允许会话级选择',
    externalModel: '允许外部模型处理',
    allowedRegions: '允许的数据区域',
    operations: '允许的操作',
    retrieve: '检索',
    quote: '引用原文',
    summarize: '摘要',
    derive: '作为推理依据',
    writeBack: '写回来源',
    pendingNotice: '当前页面为只读 Mock；最终授权仍由后端按 EffectiveAccess 判定。'
  },
  states: {
    loadingTitle: '正在准备你的工作区',
    loadingBody: '请稍候，内容很快就会出现。',
    errorTitle: '这一步没有顺利完成',
    errorBody: '演示数据暂时不可用。请重试，或返回工作台。',
    emptyTitle: '从一个小动作开始',
    emptyBody: '添加内容后，AI 才能在明确授权的范围内提供帮助。'
  }
} as const

/** @brief 美式英语翻译资源 / American English translation resources. */
export const enUSTranslation = {
  app: {
    name: 'Career Workspace',
    tagline: 'Prepare, practise, and reflect in one workflow.'
  },
  nav: {
    primary: 'Primary navigation',
    workspaceGroup: 'Workspace',
    workspace: 'Workspace',
    resume: 'Resume',
    resumes: 'Resumes',
    interview: 'Mock interview',
    knowledge: 'Personal knowledge',
    settings: 'Settings',
    states: 'Interface states'
  },
  account: {
    plan: 'Personal workspace'
  },
  topbar: {
    feedback: 'Feedback',
    changeLocale: 'Change interface language'
  },
  common: {
    open: 'Open',
    start: 'Start',
    review: 'Review',
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    continue: 'Continue',
    edit: 'Edit',
    save: 'Save',
    retry: 'Try again',
    learnMore: 'Learn more',
    updated: 'Updated',
    loading: 'Loading…',
    error: 'Unable to load right now',
    empty: 'Nothing here yet',
    mockData: 'Demo data',
    comingSoon: 'Coming soon'
  },
  status: {
    ready: 'Ready',
    rendering: 'Rendering',
    failed: 'Failed',
    queued: 'Queued',
    embedding: 'Indexing',
    inProgress: 'In progress',
    completed: 'Completed',
    connected: 'Connected',
    reconnecting: 'Reconnecting'
  },
  workspace: {
    title: 'Workspace',
    greeting: 'What would you like to strengthen today?',
    resumeCount: 'resumes',
    knowledgeCount: 'ready knowledge sources',
    interviewCount: 'completed interviews',
    recentActivity: 'Recent activity',
    quickActions: 'Quick start',
    createResume: 'Open resume editor',
    startInterview: 'Start a mock interview',
    addKnowledge: 'Add personal knowledge',
    home: {
      eyebrow: 'AI career workspace',
      greeting: 'Good morning, Klee.',
      description: 'Keep resumes, practice, and personal knowledge in one place for your next better answer.',
      continueEditing: 'Continue editing resume',
      progressTitle: 'This week',
      progressDescription: 'This is a demo workspace aggregate; production metrics arrive after the service contract is frozen.',
      resumeCount: 'resumes',
      interviewCount: 'completed interviews',
      knowledgeCount: 'ready knowledge sources',
      resumeTitle: 'AI Platform Engineer',
      resumeMeta: 'Dawn template · semantic revision v18 · saved just now',
      nextTitle: 'Next steps',
      practiceTitle: 'Practise a system-design interview',
      practiceMeta: '45 min · interruptible avatar interviewer',
      visibilityTitle: 'Review knowledge visibility',
      visibilityMeta: 'Sources other than your resume are denied by default',
      activityTitle: 'Recent activity',
      activityDescription: 'A visible trail of resources, interviews, and knowledge indexing.',
      mockNotice: 'This is a v0.1 Mock experience; no resume, media, or knowledge data is sent to a backend.'
    }
  },
  resume: {
    title: 'Resume editor',
    form: 'Content',
    preview: 'Preview',
    assistant: 'Resume assistant',
    previewReady: 'Preview is in sync',
    previewRendering: 'Generating preview',
    templateSettings: 'Template settings',
    revision: 'Revision {{revision}}',
    knowledgeLinked: 'This resume is automatically included in your personal knowledge.',
    askAssistant: 'Ask how to improve this resume…',
    emptyResumes: 'No resumes yet. Once created, a resume becomes a configurable knowledge source.'
  },
  template: {
    title: 'Template & layout',
    currentTemplate: 'Current template',
    otherTemplates: 'Other templates',
    semanticIntent: 'Semantic style intent',
    migrationHint: 'Changing templates is an explicit backend migration job; this screen only shows settings.',
    zones: {
      main: 'Main content',
      sidebar: 'Sidebar'
    },
    groups: {
      header: 'Header',
      appearance: 'Appearance'
    },
    settings: {
      showContactIcons: {
        label: 'Show contact icons',
        description: 'Controls only a semantic template display option.'
      },
      accentStyle: {
        label: 'Accent style',
        description: 'The template interprets this into its own rendered result.',
        warm: 'Warm',
        ink: 'Ink'
      },
      sectionSpacing: {
        label: 'Section spacing',
        description: 'A larger value gives content more room to breathe.'
      },
      showRule: {
        label: 'Show rules',
        description: 'Show restrained dividers between primary content blocks.'
      }
    }
  },
  interview: {
    title: 'Avatar mock interview',
    selectScenario: 'Choose a practice scenario',
    targetRole: 'Target role',
    duration: '{{minutes}} min',
    liveTranscript: 'Live transcript',
    interviewer: 'Interviewer',
    candidate: 'You',
    interrupt: 'Interrupt',
    endInterview: 'End interview',
    mediaNotice: 'This is a demo state. Production A/V uses WebRTC, with control events handled separately.',
    emptyScenarios: 'No scenarios are available right now.'
  },
  report: {
    title: 'Interview summary',
    overallScore: 'Overall score',
    confidence: 'Confidence',
    strengths: 'What worked',
    improvements: 'What to improve',
    rubric: 'Rubric scores',
    communication: 'Observable communication metrics',
    actionPlan: 'Action plan',
    limitations: 'Limitations',
    evidence: 'Transcript evidence'
  },
  knowledge: {
    title: 'Personal memory & knowledge',
    addSource: 'Add source',
    source: 'Knowledge source',
    sources: 'sources',
    indexed: 'Indexed',
    documents: 'documents',
    chunks: 'chunks',
    resumeAutoSync: 'Resumes enter the knowledge base automatically; deleting one must not leave a ghost index.',
    emptySources: 'No knowledge sources yet. Add a blog, a repository, or a file.',
    visibility: 'Visibility settings'
  },
  visibility: {
    title: 'Agent visibility',
    defaultDeny: 'Default deny',
    policyVersion: 'Policy version {{version}}',
    sessionOverride: 'Allow session-level selection',
    externalModel: 'Allow external model processing',
    allowedRegions: 'Allowed data regions',
    operations: 'Allowed operations',
    retrieve: 'Retrieve',
    quote: 'Quote source',
    summarize: 'Summarise',
    derive: 'Use for reasoning',
    writeBack: 'Write back to source',
    pendingNotice: 'This is a read-only Mock. The backend makes the final EffectiveAccess decision.'
  },
  states: {
    loadingTitle: 'Preparing your workspace',
    loadingBody: 'One moment — your content will be here shortly.',
    errorTitle: 'That step did not complete',
    errorBody: 'Demo data is temporarily unavailable. Try again or return to the workspace.',
    emptyTitle: 'Start with one small step',
    emptyBody: 'After you add content, AI can help within the visibility you explicitly grant.'
  }
} as const

/** @brief i18next 资源字典 / i18next resource dictionary. */
export const appTranslationResources = {
  'zh-SG': { translation: zhSGTranslation },
  'en-US': { translation: enUSTranslation }
} as const
