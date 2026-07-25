/** @file Interview API v2 内存 adapter 测试 / Interview API v2 in-memory adapter tests. */

import { describe, expect, it } from 'vitest'

import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import {
  asUiInterviewPageLimit,
  asUiInterviewScenarioCursor,
  type UiCreateInterviewSessionInput
} from '../../domain/models'
import {
  DEMO_INTERVIEW_REPORT_ID,
  DEMO_INTERVIEW_SCENARIO_ID,
  DEMO_INTERVIEW_SESSION_ID,
  DEMO_INTERVIEW_WORKSPACE_ID,
  DEMO_LIVE_INTERVIEW_SESSION_ID,
  DEMO_SYSTEM_DESIGN_SCENARIO
} from './data'
import { InMemoryInterviewGateway } from './gateway'

/** @brief 测试命令身份 / Test command identity. */
const commandId = (value: string) => asUiOpaqueId<'command'>(value)

/** @brief canonical Session 创建输入 / Canonical Session-creation input. */
const SESSION_INPUT: UiCreateInterviewSessionInput = {
  scenarioId: DEMO_INTERVIEW_SCENARIO_ID,
  resumeRef: null,
  jobTarget: {
    title: 'Frontend Engineer',
    company: null,
    location: null,
    description: null,
    sourceUrl: null,
    seniority: null,
    skills: ['TypeScript']
  },
  knowledge: {
    mode: 'none',
    includeSourceIds: [],
    excludeSourceIds: [],
    pinnedVersions: [],
    agentScope: 'interview.coach'
  },
  locale: 'zh-CN',
  media: {
    userAudio: true,
    userVideo: false,
    screenShare: false,
    maxVideoWidth: 1280,
    maxVideoHeight: 720,
    maxVideoFps: 30,
    avatar: {
      outputMode: 'audio_only',
      avatarId: null,
      voiceId: 'voice_test',
      preferredAudioCodecs: ['opus'],
      preferredVideoCodecs: [],
      includeVisemes: false,
      includeExpressionCues: false
    },
    fallbackTransport: 'audio_only'
  },
  recording: {
    recordAudio: false,
    recordVideo: false,
    storeTranscript: false,
    retentionDays: 0,
    consentedAt: null,
    consentVersion: null
  },
  inference: {
    qualityTier: 'balanced',
    latencyBudgetMs: 10_000,
    costTier: 'standard',
    dataRegion: 'private_deployment',
    allowProviderFallback: false,
    allowExternalModelProcessing: false
  }
}

describe('InMemoryInterviewGateway', () => {
  it('preserves opaque scenario cursor relationships and rejects a foreign cursor', async () => {
    const gateway = new InMemoryInterviewGateway()
    const first = await gateway.listInterviewScenarioPage({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      cursor: null,
      limit: asUiInterviewPageLimit(1)
    })

    expect(first.hasMore).toBe(true)
    if (!first.hasMore) throw new Error('Expected a second scenario page.')

    const second = await gateway.listInterviewScenarioPage({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      cursor: first.nextCursor,
      limit: asUiInterviewPageLimit(1)
    })
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)

    await expect(
      gateway.listInterviewScenarioPage({
        workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
        cursor: asUiInterviewScenarioCursor('opaque cursor with spaces'),
        limit: asUiInterviewPageLimit(1)
      })
    ).rejects.toMatchObject({ code: 'memory.not_found' })
  })

  it('replays scenario creation exactly and applies only a conditional minimal patch', async () => {
    const gateway = new InMemoryInterviewGateway()
    const creation = {
      commandId: commandId('command_scenario_create_one'),
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      input: {
        name: '自适应面试',
        description: '根据已观察表现动态调整问题。',
        locale: DEMO_SYSTEM_DESIGN_SCENARIO.locale,
        interviewType: DEMO_SYSTEM_DESIGN_SCENARIO.interviewType,
        difficulty: 'adaptive' as const,
        durationMinutes: 45,
        targetQuestionCount: 6,
        focusAreas: ['问题界定'],
        allowFollowups: true,
        allowBargeIn: true,
        rubric: DEMO_SYSTEM_DESIGN_SCENARIO.rubric
      }
    }

    const created = await gateway.createInterviewScenario(creation)
    const replay = await gateway.createInterviewScenario(creation)
    expect(replay).toEqual(created)
    expect(created.scenario.status).toBe('draft')

    await expect(
      gateway.createInterviewScenario({
        ...creation,
        input: { ...creation.input, name: '复用 key 的另一请求' }
      })
    ).rejects.toMatchObject({ code: 'memory.idempotency_key_reused' })

    const updated = await gateway.updateInterviewScenario({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      scenarioId: created.scenario.id,
      concurrencyToken: created.concurrencyToken,
      patch: { name: '自适应系统设计面试' }
    })
    expect(updated.scenario.name).toBe('自适应系统设计面试')
    expect(updated.scenario.description).toBe(created.scenario.description)
    expect(updated.concurrencyToken).not.toBe(created.concurrencyToken)

    await expect(
      gateway.updateInterviewScenario({
        workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
        scenarioId: created.scenario.id,
        concurrencyToken: created.concurrencyToken,
        patch: { name: '基于旧表示覆盖' }
      })
    ).rejects.toMatchObject({ code: 'memory.conflict' })
  })

  it('creates a persistent Session idempotently without issuing a realtime descriptor', async () => {
    const gateway = new InMemoryInterviewGateway()
    const command = {
      commandId: commandId('command_session_create_one'),
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      input: SESSION_INPUT
    }

    const created = await gateway.createInterviewSession(command)
    const replay = await gateway.createInterviewSession(command)

    expect(replay).toEqual(created)
    expect(created.session).toMatchObject({
      status: 'created',
      startedAt: null,
      endedAt: null,
      reportId: null
    })
    expect('connection' in created.session).toBe(false)
  })

  it('fails closed when recording consent and enabled input media disagree', async () => {
    const gateway = new InMemoryInterviewGateway()

    await expect(
      gateway.createInterviewSession({
        commandId: commandId('command_session_invalid_consent'),
        workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
        input: {
          ...SESSION_INPUT,
          media: { ...SESSION_INPUT.media, userVideo: false },
          recording: {
            recordAudio: false,
            recordVideo: true,
            storeTranscript: false,
            retentionDays: 30,
            consentedAt: '2026-07-23T00:00:00.000Z',
            consentVersion: 'recording-v1'
          }
        }
      })
    ).rejects.toMatchObject({ code: 'memory.conflict' })
  })

  it('replays the exact short-lived realtime descriptor for one command identity', async () => {
    const gateway = new InMemoryInterviewGateway()
    const command = {
      commandId: commandId('command_connection_one'),
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_LIVE_INTERVIEW_SESSION_ID,
      supportedTransports: ['webrtc', 'websocket'] as const,
      audioCodecs: ['opus'],
      videoCodecs: ['VP9']
    }

    const connection = await gateway.createRealtimeConnection(command)
    const replay = await gateway.createRealtimeConnection(command)

    expect(replay).toEqual(connection)
    expect(connection).toMatchObject({
      sessionId: DEMO_LIVE_INTERVIEW_SESSION_ID,
      transport: 'webrtc'
    })
    expect(connection.ephemeralToken.length).toBeGreaterThanOrEqual(20)
  })

  it('returns a generic Workspace Job for a conditional end request', async () => {
    const gateway = new InMemoryInterviewGateway()
    const authority = await gateway.getInterviewSession({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_LIVE_INTERVIEW_SESSION_ID
    })
    const command = {
      commandId: commandId('command_end_one'),
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_LIVE_INTERVIEW_SESSION_ID,
      concurrencyToken: authority.concurrencyToken,
      reason: 'completed' as const
    }

    const job = await gateway.requestInterviewSessionEnd(command)
    const replay = await gateway.requestInterviewSessionEnd(command)
    const latest = await gateway.getInterviewSession({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_LIVE_INTERVIEW_SESSION_ID
    })

    expect(replay).toEqual(job)
    expect(job.job).toMatchObject({
      kind: 'interview.session.end',
      status: 'queued',
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID
    })
    expect(latest.session.status).toBe('ending')
    expect(latest.concurrencyToken).not.toBe(authority.concurrencyToken)
  })

  it('pages the authoritative transcript and retains the system speaker', async () => {
    const gateway = new InMemoryInterviewGateway()
    const first = await gateway.listInterviewTranscriptPage({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_INTERVIEW_SESSION_ID,
      cursor: null,
      limit: asUiInterviewPageLimit(1)
    })

    expect(first.items[0]?.speaker).toBe('system')
    expect(first.hasMore).toBe(true)
    if (!first.hasMore) throw new Error('Expected another transcript page.')

    const second = await gateway.listInterviewTranscriptPage({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_INTERVIEW_SESSION_ID,
      cursor: first.nextCursor,
      limit: asUiInterviewPageLimit(2)
    })
    expect(second.items.map((segment) => segment.speaker)).toEqual(['interviewer', 'candidate'])
  })

  it('keeps report-job rubric omission and report provenance as separate facts', async () => {
    const gateway = new InMemoryInterviewGateway()
    const command = {
      commandId: commandId('command_report_job_one'),
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      sessionId: DEMO_INTERVIEW_SESSION_ID
    }

    const job = await gateway.createInterviewReportJob(command)
    const replay = await gateway.createInterviewReportJob(command)
    const report = await gateway.getInterviewReport({
      workspaceId: DEMO_INTERVIEW_WORKSPACE_ID,
      reportId: DEMO_INTERVIEW_REPORT_ID
    })

    expect(replay).toEqual(job)
    expect(job.job.kind).toBe('interview.report.generate')
    expect(report.engineVersion).toBe('interview-evaluator-2026.07.1')
    expect(report.generatedAt).toBe('2026-07-15T04:02:00.000Z')
    expect(typeof report.rubricRef.id).toBe('string')
    expect(report.rubricRef.version).toBe('2026.07')
    expect(report.rubricScores[0]?.evidence[0]).not.toHaveProperty('verified')
  })
})
