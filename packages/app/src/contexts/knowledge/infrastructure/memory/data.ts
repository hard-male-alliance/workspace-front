/** @file Knowledge 限界上下文的确定性内存数据 / Deterministic in-memory data for the Knowledge bounded context. */

import type { UiKnowledgeSource, UiKnowledgeVisibilityPolicy } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Knowledge fixture 所属 Workspace / Workspace owning the Knowledge fixtures. */
export const MOCK_KNOWLEDGE_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Mock Resume KnowledgeSource identity / Mock Resume KnowledgeSource identity. */
export const MOCK_RESUME_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>(
  'knowledge_mock_resume_source'
)

/** @brief Mock Git KnowledgeSource identity / Mock Git KnowledgeSource identity. */
export const MOCK_GIT_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>(
  'knowledge_mock_git_source'
)

/** @brief Mock blog KnowledgeSource identity / Mock blog KnowledgeSource identity. */
export const MOCK_BLOG_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>(
  'knowledge_mock_blog_source'
)

/** @brief Mock file KnowledgeSource identity / Mock file KnowledgeSource identity. */
export const MOCK_FILE_KNOWLEDGE_SOURCE_ID = asUiOpaqueId<'knowledge-source'>(
  'knowledge_mock_file_source'
)

/** @brief 默认的完整 Mock 可见性策略 / Default complete Mock visibility policy. */
export const MOCK_DEFAULT_VISIBILITY_POLICY = {
  agentGrants: [
    {
      agentScope: 'resume_assistant',
      allowedOperations: ['retrieve', 'quote', 'summarize', 'derive'],
      effect: 'allow'
    },
    {
      agentScope: 'interview_agent',
      allowedOperations: ['retrieve', 'summarize', 'derive'],
      effect: 'allow'
    }
  ],
  allowExternalModelProcessing: false,
  allowedModelRegions: ['cn', 'private_deployment'],
  defaultEffect: 'deny',
  policyVersion: 3,
  retentionDays: null,
  sensitivity: 'confidential',
  sessionOverrideAllowed: true
} as const satisfies UiKnowledgeVisibilityPolicy

/** @brief Mock KnowledgeSource 列表 / Mock KnowledgeSource list. */
export const MOCK_KNOWLEDGE_SOURCES: readonly UiKnowledgeSource[] = [
  {
    createdAt: '2026-07-15T03:56:20.000Z',
    currentVersionId: asUiOpaqueId<'knowledge-source-version'>('knowledge_version_mock_resume_18'),
    enabled: true,
    id: MOCK_RESUME_KNOWLEDGE_SOURCE_ID,
    ingestion: {
      chunkCount: 18,
      documentCount: 1,
      lastProblem: null,
      lastSuccessAt: '2026-07-15T03:56:20.000Z',
      status: 'ready'
    },
    name: 'AI 平台工程师 · 中文简历',
    publicConfig: {
      resumeId: asUiOpaqueId<'resume'>('resume_mock_primary_document')
    },
    revision: 18,
    sourceType: 'resume',
    updatedAt: '2026-07-15T03:56:20.000Z',
    visibility: MOCK_DEFAULT_VISIBILITY_POLICY,
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
  },
  {
    createdAt: '2026-07-10T09:20:00.000Z',
    currentVersionId: asUiOpaqueId<'knowledge-source-version'>('knowledge_version_mock_git_7'),
    enabled: true,
    id: MOCK_GIT_KNOWLEDGE_SOURCE_ID,
    ingestion: {
      chunkCount: 327,
      documentCount: 46,
      lastProblem: null,
      lastSuccessAt: '2026-07-14T09:20:00.000Z',
      status: 'ready'
    },
    name: 'portfolio-engineering',
    publicConfig: {
      cloneUrl: 'https://github.com/klee-lab/portfolio-engineering',
      ref: 'main'
    },
    revision: 7,
    sourceType: 'git_repository',
    updatedAt: '2026-07-14T09:20:00.000Z',
    visibility: MOCK_DEFAULT_VISIBILITY_POLICY,
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
  },
  {
    createdAt: '2026-07-13T08:05:00.000Z',
    currentVersionId: null,
    enabled: true,
    id: MOCK_BLOG_KNOWLEDGE_SOURCE_ID,
    ingestion: {
      chunkCount: 94,
      documentCount: 12,
      lastProblem: null,
      lastSuccessAt: '2026-07-13T08:05:00.000Z',
      status: 'embedding'
    },
    name: '技术博客',
    publicConfig: {
      url: 'https://klee.example/blog/rss.xml'
    },
    revision: 4,
    sourceType: 'blog_feed',
    updatedAt: '2026-07-15T02:12:00.000Z',
    visibility: {
      ...MOCK_DEFAULT_VISIBILITY_POLICY,
      sensitivity: 'normal'
    },
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
  },
  {
    createdAt: '2026-07-12T11:40:00.000Z',
    currentVersionId: null,
    enabled: false,
    id: MOCK_FILE_KNOWLEDGE_SOURCE_ID,
    ingestion: {
      chunkCount: 0,
      documentCount: 0,
      lastProblem: {
        code: 'knowledge.embedding_failed',
        detail: null,
        errors: [],
        extensions: null,
        instance: null,
        requestId: asUiOpaqueId<'request'>('request_mock_knowledge_failure'),
        retryable: true,
        status: 503,
        title: 'Knowledge ingestion failed',
        type: 'https://api.hmalliances.org/problems/knowledge-ingestion'
      },
      lastSuccessAt: null,
      status: 'failed'
    },
    name: '旧版项目复盘.pdf',
    publicConfig: {
      filename: 'project-retrospective.pdf',
      mediaType: 'application/pdf'
    },
    revision: 2,
    sourceType: 'file',
    updatedAt: '2026-07-12T11:40:00.000Z',
    visibility: {
      ...MOCK_DEFAULT_VISIBILITY_POLICY,
      agentGrants: [],
      sensitivity: 'highly_confidential'
    },
    workspaceId: MOCK_KNOWLEDGE_WORKSPACE_ID
  }
]
