/** @file Mock 网关测试 / Mock gateway tests. */

import { describe, expect, it } from 'vitest'

import {
  MOCK_INTERVIEW_SESSION_ID,
  MOCK_KNOWLEDGE_VISIBILITY,
  MOCK_RESUME_ID,
  MOCK_WORKSPACE_ID
} from './mock-data'
import {
  MockGatewayError,
  MockInterviewGateway,
  MockKnowledgeGateway,
  MockResumeGateway,
  MockWorkspaceGateway
} from './mock-gateways'

describe('Mock gateways', () => {
  it('returns deterministic editor, interview, and visibility projections', async () => {
    /** @brief 简历 Mock 网关 / Resume Mock gateway. */
    const resumeGateway = new MockResumeGateway()
    /** @brief 面试 Mock 网关 / Interview Mock gateway. */
    const interviewGateway = new MockInterviewGateway()
    /** @brief 知识 Mock 网关 / Knowledge Mock gateway. */
    const knowledgeGateway = new MockKnowledgeGateway()

    /** @brief 编辑器投影 / Editor projection. */
    const editor = await resumeGateway.getResumeEditor(MOCK_RESUME_ID)
    /** @brief 实时面试投影 / Live-interview projection. */
    const interview = await interviewGateway.getLiveInterview(MOCK_INTERVIEW_SESSION_ID)
    /** @brief 可见性投影 / Visibility projection. */
    const visibility = await knowledgeGateway.getKnowledgeVisibility(
      MOCK_KNOWLEDGE_VISIBILITY.source.id
    )

    expect(editor.resume.revision).toBe(18)
    expect(editor.preview.state).toBe('ready')
    expect(interview.connectionState).toBe('connected')
    expect(visibility.source.visibility.defaultEffect).toBe('deny')
  })

  it('returns defensive copies instead of fixture references', async () => {
    /** @brief 工作区 Mock 网关 / Workspace Mock gateway. */
    const workspaceGateway = new MockWorkspaceGateway()
    /** @brief 首次工作区列表 / First workspace list. */
    const firstRead = await workspaceGateway.listWorkspaces()
    /** @brief 第二次工作区列表 / Second workspace list. */
    const secondRead = await workspaceGateway.listWorkspaces()

    expect(firstRead).not.toBe(secondRead)
    expect(firstRead[0]).not.toBe(secondRead[0])
  })

  it('makes empty and error states explicit for page-state testing', async () => {
    /** @brief 空态简历 Mock 网关 / Empty-state resume Mock gateway. */
    const emptyGateway = new MockResumeGateway({ mode: 'empty' })
    /** @brief 错误态工作区 Mock 网关 / Error-state workspace Mock gateway. */
    const failingGateway = new MockWorkspaceGateway({ mode: 'error' })

    await expect(emptyGateway.listResumeCards(MOCK_WORKSPACE_ID)).resolves.toEqual([])
    await expect(emptyGateway.getResumeEditor(MOCK_RESUME_ID)).rejects.toBeInstanceOf(MockGatewayError)
    await expect(failingGateway.getWorkspaceHome(MOCK_WORKSPACE_ID)).rejects.toMatchObject({
      code: 'mock.unavailable'
    })
  })
})
