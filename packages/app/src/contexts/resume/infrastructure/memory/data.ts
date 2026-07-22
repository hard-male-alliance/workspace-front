/** @file Resume 限界上下文的确定性内存数据 / Deterministic in-memory data for the Resume bounded context. */

import {
  asUiResumePartialDate,
  type UiResumeDocument,
  type UiResumeEditorModel
} from '../../domain/document'
import type {
  UiResumeSummary,
  UiTemplateManifest,
  UiTemplateSettingsModel
} from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import { asUiConcurrencyToken } from '../../../../shared-kernel/concurrency'

/** @brief Resume fixture 所属工作区 ID / Workspace ID owned by Resume fixtures. */
export const MOCK_RESUME_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Mock 简历 ID / Mock resume ID. */
export const MOCK_RESUME_ID = asUiOpaqueId<'resume'>('res_mock_ai_platform')

/** @brief Mock 简历知识来源 ID / Mock resume knowledge-source ID. */
const MOCK_RESUME_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_resume')

/** @brief Mock 主模板 ID / Mock primary template ID. */
export const MOCK_DAWN_TEMPLATE_ID = asUiOpaqueId<'template'>('tpl_mock_dawn')

/** @brief Mock 备选模板 ID / Mock alternate template ID. */
export const MOCK_EDITORIAL_TEMPLATE_ID = asUiOpaqueId<'template'>('tpl_mock_editorial')
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
  previewUrl: 'https://api.hmalliances.org:8022/api/v2/resume-templates/tpl_mock_dawn/preview',
  supportedLocales: ['zh-SG', 'en-US'],
  supportedOutputFormats: ['pdf'],
  supportedPageSizes: ['A4', 'LETTER'],
  supportedSectionKinds: ['experience', 'education', 'projects', 'skills', 'custom'],
  zones: [
    {
      id: 'main',
      labelKey: 'template.zoneMain',
      acceptedSectionKinds: ['experience', 'education', 'projects', 'skills', 'custom'],
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
      groupKey: 'template.groups.header',
      visibleWhen: null
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
      groupKey: 'template.groups.appearance',
      visibleWhen: null
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
      groupKey: 'template.groups.appearance',
      visibleWhen: null
    }
  ],
  capabilities: {
    supportsPhoto: false,
    supportsSidebar: true,
    supportsCustomSections: true,
    supportsSourceMap: true,
    maxColumns: 2
  },
  publishedAt: '2026-07-01T00:00:00.000Z'
}

/** @brief Mock 备选模板清单 / Mock alternate template manifest. */
export const MOCK_EDITORIAL_TEMPLATE: UiTemplateManifest = {
  id: MOCK_EDITORIAL_TEMPLATE_ID,
  version: '1.0.0',
  name: 'Editorial',
  description: '强调项目叙事与阅读节奏的单栏模板。',
  previewUrl: 'https://api.hmalliances.org:8022/api/v2/resume-templates/tpl_mock_editorial/preview',
  supportedLocales: ['zh-SG', 'en-US'],
  supportedOutputFormats: ['pdf'],
  supportedPageSizes: ['A4', 'LETTER', 'LEGAL'],
  supportedSectionKinds: [
    'experience',
    'education',
    'projects',
    'skills',
    'publications',
    'custom'
  ],
  zones: [
    {
      id: 'main',
      labelKey: 'template.zoneMain',
      acceptedSectionKinds: [
        'experience',
        'education',
        'projects',
        'skills',
        'publications',
        'custom'
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
      groupKey: 'template.groups.appearance',
      visibleWhen: null
    }
  ],
  capabilities: {
    supportsPhoto: false,
    supportsSidebar: false,
    supportsCustomSections: false,
    supportsSourceMap: true,
    maxColumns: 1
  },
  publishedAt: '2026-07-02T00:00:00.000Z'
}

/** @brief 所有 Mock 模板清单 / All Mock template manifests. */
export const MOCK_TEMPLATE_MANIFESTS: readonly UiTemplateManifest[] = [
  MOCK_DAWN_TEMPLATE,
  MOCK_EDITORIAL_TEMPLATE
]

/** @brief 不再由最新目录列出的历史 Dawn 版本 / Historical Dawn version no longer listed by the latest catalog. */
export const MOCK_HISTORICAL_DAWN_TEMPLATE: UiTemplateManifest = {
  ...MOCK_DAWN_TEMPLATE,
  name: 'Dawn Legacy',
  version: '0.9.0'
}

/** @brief 精确版本资源路由可读取的全部 Mock 版本 / All Mock versions readable through the exact-version resource route. */
export const MOCK_TEMPLATE_MANIFEST_VERSIONS: readonly UiTemplateManifest[] = [
  ...MOCK_TEMPLATE_MANIFESTS,
  MOCK_HISTORICAL_DAWN_TEMPLATE
]

/** @brief 与 Mock Resume 初始表示原子配对的强 ETag / Strong ETag atomically paired with the initial Mock Resume representation. */
export const MOCK_RESUME_CONCURRENCY_TOKEN = asUiConcurrencyToken('"resume-memory-initial"')

/**
 * @brief 构造无 marks 的 Mock 富文本 / Build Mock rich text without marks.
 * @param text 纯文本正文 / Plain-text body.
 * @return 保留正式 RichText 结构的测试值 / Test value preserving the formal RichText shape.
 */
function richText(text: string): { readonly text: string; readonly marks: readonly [] } {
  return { marks: [], text }
}

/** @brief Mock 简历文档 / Mock resume document. */
export const MOCK_RESUME_DOCUMENT: UiResumeDocument = {
  id: MOCK_RESUME_ID,
  workspaceId: MOCK_RESUME_WORKSPACE_ID,
  createdAt: '2026-07-18T00:00:00.000Z',
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
    summary: richText('面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。'),
    contacts: [
      {
        id: asUiOpaqueId<'resume-contact'>('contact_mock_email'),
        kind: 'email',
        label: '邮箱',
        url: 'mailto:klee@example.com',
        value: 'klee@example.com'
      },
      {
        id: asUiOpaqueId<'resume-contact'>('contact_mock_github'),
        kind: 'github',
        label: 'GitHub',
        url: 'https://github.com/klee-lab',
        value: 'github.com/klee-lab'
      },
      {
        id: asUiOpaqueId<'resume-contact'>('contact_mock_location'),
        kind: 'location',
        label: '地点',
        url: null,
        value: 'Singapore'
      }
    ]
  },
  sections: [
    {
      id: MOCK_SUMMARY_SECTION_ID,
      kind: 'custom',
      title: '职业摘要',
      visible: true,
      content: richText(
        '面向生产环境构建可靠的 AI 平台与开发者工具，专注检索、推理编排和可观测性。'
      ),
      items: []
    },
    {
      id: MOCK_EXPERIENCE_SECTION_ID,
      kind: 'experience',
      title: '工作经历',
      visible: true,
      content: null,
      items: [
        {
          id: asUiOpaqueId<'resume-item'>('itm_mock_platform_engineer'),
          kind: 'experience',
          title: 'AI 平台工程师',
          subtitle: null,
          organization: 'Arcadia Systems',
          location: 'Singapore',
          dateRange: { end: 'present', start: asUiResumePartialDate('2023-03') },
          summary: null,
          highlights: [
            richText('设计多租户 Agent 运行时，将在线推理 p95 延迟降低 31%。'),
            richText('建立端到端可观测性与评估闭环，缩短生产问题定位时间。')
          ],
          skills: ['TypeScript', 'Python', 'Kubernetes'],
          tags: ['TypeScript', 'Python', 'Kubernetes'],
          url: null,
          visible: true
        },
        {
          id: asUiOpaqueId<'resume-item'>('itm_mock_backend_engineer'),
          kind: 'experience',
          title: '后端工程师',
          subtitle: null,
          organization: 'Northwind Labs',
          location: 'Shanghai',
          dateRange: {
            end: asUiResumePartialDate('2023-02'),
            start: asUiResumePartialDate('2020-07')
          },
          summary: null,
          highlights: [richText('负责高并发 API 网关与异步任务平台的演进。')],
          skills: ['Go', 'PostgreSQL'],
          tags: ['Go', 'PostgreSQL'],
          url: null,
          visible: true
        }
      ]
    },
    {
      id: MOCK_PROJECT_SECTION_ID,
      kind: 'projects',
      title: '代表项目',
      visible: true,
      content: null,
      items: [
        {
          id: asUiOpaqueId<'resume-item'>('itm_mock_resume_workspace'),
          kind: 'project',
          title: 'AI 求职 Workspace',
          subtitle: '个人项目',
          organization: null,
          location: null,
          dateRange: {
            end: asUiResumePartialDate('2026'),
            start: asUiResumePartialDate('2026')
          },
          summary: richText('面向求职全过程的本地优先 Workspace。'),
          highlights: [
            richText('以语义中间表示驱动简历编辑、PDF 渲染与 Agent proposal 审批。'),
            richText('设计默认拒绝的个人知识可见性模型。')
          ],
          skills: ['React', 'Electron', 'WebRTC'],
          tags: ['React', 'Electron', 'WebRTC'],
          url: 'https://example.com/klee/resume-workspace',
          visible: true
        }
      ]
    },
    {
      id: MOCK_SKILLS_SECTION_ID,
      kind: 'skills',
      title: '技能',
      visible: true,
      content: null,
      items: [
        {
          id: asUiOpaqueId<'resume-item'>('itm_mock_core_skills'),
          kind: 'skill_group',
          title: '核心能力',
          subtitle: null,
          organization: null,
          location: null,
          dateRange: null,
          summary: null,
          highlights: [
            richText('分布式系统'),
            richText('LLM 应用工程'),
            richText('数据与可观测性')
          ],
          skills: ['Python', 'TypeScript', 'React', 'PostgreSQL'],
          tags: ['Python', 'TypeScript', 'React', 'PostgreSQL'],
          url: null,
          visible: true
        }
      ]
    }
  ],
  styleIntent: {
    styleContractVersion: '1.0',
    extensions: {},
    page: {
      size: 'A4',
      customHeight: null,
      customWidth: null,
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

/** @brief Mock API v2 ResumeSummary 投影 / Mock API v2 ResumeSummary projections. */
export const MOCK_RESUME_SUMMARIES: readonly UiResumeSummary[] = [
  {
    createdAt: '2026-07-01T02:00:00.000Z',
    id: MOCK_RESUME_DOCUMENT.id,
    locale: MOCK_RESUME_DOCUMENT.locale,
    revision: MOCK_RESUME_DOCUMENT.revision,
    templateId: MOCK_RESUME_DOCUMENT.template.templateId,
    templateVersion: MOCK_RESUME_DOCUMENT.template.templateVersion,
    title: MOCK_RESUME_DOCUMENT.title,
    updatedAt: MOCK_RESUME_DOCUMENT.updatedAt,
    workspaceId: MOCK_RESUME_DOCUMENT.workspaceId
  },
  {
    createdAt: '2026-07-03T08:12:00.000Z',
    id: asUiOpaqueId<'resume'>('res_mock_english'),
    locale: 'en-US',
    revision: 7,
    templateId: MOCK_EDITORIAL_TEMPLATE.id,
    templateVersion: MOCK_EDITORIAL_TEMPLATE.version,
    title: 'AI Platform Engineer · EN',
    updatedAt: '2026-07-10T10:30:00.000Z',
    workspaceId: MOCK_RESUME_WORKSPACE_ID
  }
]

/** @brief Mock 简历编辑器数据 / Mock resume-editor data. */
export const MOCK_RESUME_EDITOR: UiResumeEditorModel = {
  concurrencyToken: MOCK_RESUME_CONCURRENCY_TOKEN,
  resume: MOCK_RESUME_DOCUMENT
}

/** @brief Mock 模板设置数据 / Mock template-settings data. */
export const MOCK_TEMPLATE_SETTINGS: UiTemplateSettingsModel = {
  concurrencyToken: MOCK_RESUME_CONCURRENCY_TOKEN,
  locale: MOCK_RESUME_DOCUMENT.locale,
  resumeId: MOCK_RESUME_ID,
  resumeRevision: MOCK_RESUME_DOCUMENT.revision,
  sections: MOCK_RESUME_DOCUMENT.sections.map((section) => ({
    id: section.id,
    kind: section.kind
  })),
  selectedTemplate: MOCK_DAWN_TEMPLATE,
  availableTemplates: MOCK_TEMPLATE_MANIFESTS,
  styleIntent: MOCK_RESUME_DOCUMENT.styleIntent,
  workspaceId: MOCK_RESUME_WORKSPACE_ID
}
