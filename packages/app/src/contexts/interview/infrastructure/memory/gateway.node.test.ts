/** @file Interview 内存 adapter 测试 / Interview in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { DEMO_INTERVIEW_SESSION_ID, DEMO_INTERVIEW_WORKSPACE_ID } from './data'
import { InMemoryInterviewGateway } from './gateway'

describe('InMemoryInterviewGateway', () => {
  it('lists only completed interviews with report summaries', async () => {
    const interviewGateway = new InMemoryInterviewGateway()

    const history = await interviewGateway.listCompletedInterviews(DEMO_INTERVIEW_WORKSPACE_ID)

    expect(history).not.toHaveLength(0)
    expect(history.every((item) => item.overallScore !== null)).toBe(true)
    expect(history.every((item) => item.completedAt.length > 0)).toBe(true)
  })

  it('creates an interview when no knowledge source is selected', async () => {
    const interviewGateway = new InMemoryInterviewGateway()
    const setup = await interviewGateway.getInterviewSetup(DEMO_INTERVIEW_WORKSPACE_ID)
    const scenario = setup.scenarios[0]

    if (scenario === undefined) {
      throw new Error('Expected at least one demo interview scenario.')
    }

    const result = await interviewGateway.createInterview({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      jobTarget: {
        title: 'Frontend Engineer',
        company: null,
        location: null,
        seniority: null,
        skills: []
      },
      knowledgeSourceIds: [],
      scenarioId: scenario.id
    })

    expect(result.sessionId).toBe(DEMO_INTERVIEW_SESSION_ID)
  })

  it('moves a submitted demo answer to the AI-controlled completion state', async () => {
    const interviewGateway = new InMemoryInterviewGateway()

    const before = await interviewGateway.getInterviewRuntime(DEMO_INTERVIEW_SESSION_ID)
    expect(before.phase).toBe('listening')
    expect(before.currentTranscript.length).toBeGreaterThan(0)

    const after = await interviewGateway.submitInterviewAnswer(DEMO_INTERVIEW_SESSION_ID)

    expect(after.phase).toBe('completion_ready')
    expect(after.currentTranscript).toBe('')
    expect(after.transcript.at(-1)?.speaker).toBe('interviewer')
  })
})
