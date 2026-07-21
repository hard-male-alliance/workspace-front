/** @file Knowledge 限界上下文的确定性内存数据 / Deterministic in-memory data for the Knowledge bounded context. */

import type { UiKnowledgeSource, UiKnowledgeVisibilityModel } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Knowledge fixture 所属工作区 ID / Workspace ID owned by Knowledge fixtures. */
export const MOCK_KNOWLEDGE_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Mock 简历知识来源 ID / Mock resume knowledge-source ID. */
export const MOCK_RESUME_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_resume')
/** @brief Mock Git 知识来源 ID / Mock Git knowledge-source ID. */
export const MOCK_GIT_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_git')

/** @brief Mock 博客知识来源 ID / Mock blog knowledge-source ID. */
export const MOCK_BLOG_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_blog')

/** @brief Mock 文件知识来源 ID / Mock file knowledge-source ID. */
export const MOCK_FILE_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>('ks_mock_file')
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
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID,
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
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID,
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
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID,
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
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID,
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
