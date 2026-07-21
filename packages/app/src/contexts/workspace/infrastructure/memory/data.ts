/** @file Workspace 限界上下文的确定性内存数据 / Deterministic in-memory data for the Workspace bounded context. */

import type { UiWorkspace, UiWorkspaceHomeModel } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'

/** @brief Demo 工作区 ID / Demo workspace ID. */
export const DEMO_WORKSPACE_ID = asUiOpaqueId<'workspace'>('ws_mock_klee_career_lab')

/** @brief Demo 工作区列表 / Demo workspace list. */
export const DEMO_WORKSPACES: readonly UiWorkspace[] = [
  {
    id: DEMO_WORKSPACE_ID,
    name: 'Klee 的职业实验室',
    slug: 'klee-career-lab',
    role: 'owner',
    locale: 'zh-SG',
    timezone: 'Asia/Singapore',
    plan: 'pro',
    updatedAt: '2026-07-15T03:56:00.000Z'
  }
]

/** @brief Demo 工作区首页数据 / Demo workspace-home data. */
export const DEMO_WORKSPACE_HOME: UiWorkspaceHomeModel = {
  workspace: DEMO_WORKSPACES[0]!,
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
