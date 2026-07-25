/** @file Interview Report 可恢复产品流程测试 / Recoverable Interview Report product-process tests. */

import { ApiV2WriteOutcomeUnknownError } from '@ai-job-workspace/product-api-v2'
import { describe, expect, it, vi } from 'vitest'

import {
  asUiPrincipalSubject,
  type InterviewGateway,
  type UiInterviewReport,
  type UiInterviewReportId,
  type UiInterviewSessionAuthority,
  type UiInterviewSessionId,
  type UiInterviewSessionStatus,
  type UiWorkspaceJob,
  type UiWorkspaceJobAuthority,
  type WorkspaceOperationsGateway
} from '../application'
import type { UiConcurrencyToken } from '../shared-kernel/concurrency'
import { asUiOpaqueId } from '../shared-kernel/identity'
import {
  createInterviewReportProcess,
  INTERVIEW_REPORT_RECOVERY_TTL_MILLISECONDS,
  type InterviewReportRecoveryStorage,
  type InterviewReportScope
} from './InterviewReportProcess'

/** @brief 测试 Workspace / Workspace used by the tests. */
const WORKSPACE_ID = asUiOpaqueId<'workspace'>('workspace_interview_report_test')

/** @brief 测试 Session / Session used by the tests. */
const SESSION_ID = asUiOpaqueId<'interview-session'>('session_interview_report_test')

/** @brief 测试 Report / Report used by the tests. */
const REPORT_ID = asUiOpaqueId<'interview-report'>('report_interview_report_test')

/** @brief 测试 Job / Job used by the tests. */
const JOB_ID = asUiOpaqueId<'workspace-job'>('job_interview_report_test')

/** @brief 测试 scope / Scope used by the tests. */
const SCOPE: InterviewReportScope = {
  principalSubject: asUiPrincipalSubject('principal-interview-report-klee'),
  sessionId: SESSION_ID,
  workspaceId: WORKSPACE_ID
}

/** @brief 测试所需 Interview 端口 / Interview ports required by tests. */
type TestInterviewGateway = Pick<
  InterviewGateway,
  'createInterviewReportJob' | 'getInterviewReport' | 'getInterviewSession'
>

/** @brief 测试所需 Operations 端口 / Operations ports required by tests. */
type TestOperationsGateway = Pick<WorkspaceOperationsGateway, 'getJob'>

/** @brief 确定性、进程内的 Web Storage 替身 / Deterministic in-process Web Storage test double. */
class TestRecoveryStorage implements InterviewReportRecoveryStorage {
  /** @brief 当前字符串记录 / Current string records. */
  readonly values = new Map<string, string>()

  /** @inheritdoc */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  /** @inheritdoc */
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  /** @inheritdoc */
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

/**
 * @brief 构造只包含流程所需字段的 Session 权威 / Build Session authority containing the fields required by the process.
 * @param reportId 当前权威 reportId / Current authoritative reportId.
 * @param status 当前 Session 状态 / Current Session status.
 * @param overrides 可覆盖身份边界 / Optional identity-boundary overrides.
 * @return 可供流程读取的 Session 权威 / Session authority readable by the process.
 */
function sessionAuthority(
  reportId: UiInterviewReportId | null = null,
  status: UiInterviewSessionStatus = 'completed',
  overrides: {
    readonly sessionId?: UiInterviewSessionId
    readonly workspaceId?: typeof WORKSPACE_ID
  } = {}
): UiInterviewSessionAuthority {
  return {
    concurrencyToken: '"session-etag-1"' as UiConcurrencyToken,
    session: {
      id: overrides.sessionId ?? SESSION_ID,
      reportId,
      status,
      workspaceId: overrides.workspaceId ?? WORKSPACE_ID
    }
  } as UiInterviewSessionAuthority
}

/**
 * @brief 构造只包含跨资源核对字段的 Report / Build a Report containing cross-resource validation fields.
 * @param overrides 可覆盖报告边界 / Optional report-boundary overrides.
 * @return 可供流程核对的 Report / Report validatable by the process.
 */
function report(
  overrides: {
    readonly id?: UiInterviewReportId
    readonly sessionId?: UiInterviewSessionId
    readonly workspaceId?: typeof WORKSPACE_ID
  } = {}
): UiInterviewReport {
  return {
    id: overrides.id ?? REPORT_ID,
    sessionId: overrides.sessionId ?? SESSION_ID,
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID
  } as UiInterviewReport
}

/**
 * @brief 构造一个通用 Workspace Job 权威 / Build one generic Workspace Job authority.
 * @param status Job 状态 / Job status.
 * @param revision Job revision / Job revision.
 * @param overrides 可覆盖 scope 字段 / Optional scope-field overrides.
 * @return 可供状态机观察的 Job 权威 / Job authority observable by the state machine.
 */
function jobAuthority(
  status: UiWorkspaceJob['status'],
  revision: number,
  overrides: {
    readonly jobId?: typeof JOB_ID
    readonly sessionId?: UiInterviewSessionId
    readonly workspaceId?: typeof WORKSPACE_ID
  } = {}
): UiWorkspaceJobAuthority {
  /** @brief 所有状态共享的 Job 字段 / Job fields shared by every state. */
  const common = {
    createdAt: '2026-07-23T01:00:00Z',
    id: overrides.jobId ?? JOB_ID,
    kind: 'vendor.future-report-kind',
    progress: null,
    resultRefs: [],
    revision,
    subject: {
      id: overrides.sessionId ?? SESSION_ID,
      resourceType: 'vendor.future-session-type',
      revision: null
    },
    updatedAt: `2026-07-23T01:00:0${revision}Z`,
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID
  }
  /** @brief 与判别状态一致的 Job / Job consistent with its discriminant status. */
  const job =
    status === 'queued'
      ? { ...common, finishedAt: null, problem: null, startedAt: null, status }
      : status === 'running'
        ? {
            ...common,
            finishedAt: null,
            problem: null,
            startedAt: '2026-07-23T01:00:01Z',
            status
          }
        : status === 'succeeded'
          ? {
              ...common,
              finishedAt: '2026-07-23T01:00:03Z',
              problem: null,
              startedAt: '2026-07-23T01:00:01Z',
              status
            }
          : status === 'failed'
            ? {
                ...common,
                finishedAt: '2026-07-23T01:00:03Z',
                problem: {
                  code: 'interview.report_failed',
                  detail: null,
                  errors: [],
                  extensions: null,
                  instance: null,
                  requestId: 'request-interview-report-failed',
                  retryable: true,
                  status: 500,
                  title: 'Report failed',
                  type: 'https://api.example.test/problems/interview/report-failed'
                },
                startedAt: '2026-07-23T01:00:01Z',
                status
              }
            : status === 'expired'
              ? {
                  ...common,
                  finishedAt: '2026-07-23T01:00:03Z',
                  problem: null,
                  startedAt: null,
                  status
                }
              : {
                  ...common,
                  finishedAt: '2026-07-23T01:00:03Z',
                  problem: null,
                  startedAt: '2026-07-23T01:00:01Z',
                  status
                }
  return {
    concurrencyToken: `"job-etag-${revision}"` as UiConcurrencyToken,
    job,
    location: revision === 1 ? `/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}` : null,
    requestId: `request-interview-report-${revision}`
  }
}

/**
 * @brief 构造最小 Interview 测试端口 / Build the minimal Interview test port.
 * @param methods 三个方法的实现 / Implementations of the three methods.
 * @return 静态满足流程依赖的端口 / Port statically satisfying process dependencies.
 */
function interviewGateway(methods: TestInterviewGateway): TestInterviewGateway {
  return methods
}

/**
 * @brief 构造最小 Operations 测试端口 / Build the minimal Operations test port.
 * @param getJob Job 读取实现 / Job-read implementation.
 * @return 静态满足流程依赖的端口 / Port statically satisfying process dependencies.
 */
function operationsGateway(getJob: TestOperationsGateway['getJob']): TestOperationsGateway {
  return { getJob }
}

/** @brief Interview Report 产品流程的运行时安全测试 / Runtime-safety tests for the Interview Report product process. */
describe('createInterviewReportProcess', (): void => {
  it('freezes an unknown dispatch before POST and confirms it with the exact same command identity', async (): Promise<void> => {
    /** @brief 两次发送观察 / Two dispatch observations. */
    const createInterviewReportJob = vi
      .fn<TestInterviewGateway['createInterviewReportJob']>()
      .mockRejectedValueOnce(new ApiV2WriteOutcomeUnknownError('network'))
      .mockResolvedValueOnce(jobAuthority('succeeded', 1))
    /** @brief start、confirm 与发布读取序列 / Session reads for start, confirmation, and publication. */
    const getInterviewSession = vi
      .fn<TestInterviewGateway['getInterviewSession']>()
      .mockResolvedValueOnce(sessionAuthority())
      .mockResolvedValueOnce(sessionAuthority())
      .mockResolvedValueOnce(sessionAuthority(REPORT_ID))
    /** @brief 当前测试共享存储 / Storage shared by the current test. */
    const storage = new TestRecoveryStorage()
    /** @brief 固定时钟 / Fixed clock. */
    let nowMilliseconds = 1_000
    /** @brief 被测可恢复流程 / Recoverable process under test. */
    const process = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob,
        getInterviewReport: vi.fn().mockResolvedValue(report()),
        getInterviewSession
      }),
      now: (): number => nowMilliseconds,
      storage,
      waitForNextPoll: () => Promise.resolve(),
      workspaceOperations: operationsGateway(vi.fn())
    })

    const first = await process.start(SCOPE, new AbortController().signal)

    expect(first.status).toBe('confirmation-required')
    expect(createInterviewReportJob).toHaveBeenCalledOnce()
    /** @brief 首次发送的完整命令 / Complete command sent first. */
    const firstCommand = createInterviewReportJob.mock.calls[0]?.[0]
    expect(firstCommand).toBeDefined()
    expect(firstCommand).not.toHaveProperty('rubricVersion')
    expect(process.getRecovery(SCOPE)).toMatchObject({
      commandId: firstCommand?.commandId,
      status: 'confirmation-required'
    })
    expect(process.getRecovery({ ...SCOPE, principalSubject: asUiPrincipalSubject('other') })).toBe(
      null
    )
    expect([...storage.values.values()].join('')).not.toMatch(/rubric|reportId|engine|token/iu)

    const confirmed = await process.confirm(SCOPE, new AbortController().signal)

    expect(confirmed.status).toBe('ready')
    expect(createInterviewReportJob).toHaveBeenCalledTimes(2)
    /** @brief 确认时原样发送的命令 / Command replayed exactly on confirmation. */
    const confirmedCommand = createInterviewReportJob.mock.calls[1]?.[0]
    expect(confirmedCommand?.commandId).toBe(firstCommand?.commandId)
    expect(confirmedCommand).not.toHaveProperty('rubricVersion')
    expect(process.getRecovery(SCOPE)).toBeNull()

    nowMilliseconds += INTERVIEW_REPORT_RECOVERY_TTL_MILLISECONDS
    expect(process.getRecovery(SCOPE)).toBeNull()
  })

  it('persists an accepted job identity and resumes it read-only after a page reload', async (): Promise<void> => {
    /** @brief 两个流程实例共享的 sessionStorage 替身 / sessionStorage double shared by two process instances. */
    const storage = new TestRecoveryStorage()
    /** @brief 首次页面的取消器 / Abort controller for the first page. */
    const firstPage = new AbortController()
    /** @brief 首次页面只发送一次 POST / POST issued only by the first page. */
    const createInterviewReportJob = vi
      .fn<TestInterviewGateway['createInterviewReportJob']>()
      .mockResolvedValue(jobAuthority('queued', 1))
    /** @brief 首次页面流程 / First-page process. */
    const firstProcess = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob,
        getInterviewReport: vi.fn(),
        getInterviewSession: vi.fn().mockResolvedValue(sessionAuthority())
      }),
      now: () => 2_000,
      storage,
      waitForNextPoll: (_delay, signal) => Promise.reject(signal.reason as Error),
      workspaceOperations: operationsGateway(vi.fn())
    })

    await expect(
      firstProcess.start(SCOPE, firstPage.signal, (observation): void => {
        if (observation.status === 'job-accepted') {
          firstPage.abort(new DOMException('Page left.', 'AbortError'))
        }
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstProcess.getRecovery(SCOPE)).toMatchObject({
      jobId: JOB_ID,
      status: 'job-accepted'
    })

    /** @brief 重载后只读取得的终态 Job / Terminal Job read after reload. */
    const getJob = vi
      .fn<TestOperationsGateway['getJob']>()
      .mockResolvedValue(jobAuthority('succeeded', 3))
    /** @brief 重载后的流程实例 / Process instance after reload. */
    const reloadedProcess = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob: vi.fn(),
        getInterviewReport: vi.fn().mockResolvedValue(report()),
        getInterviewSession: vi
          .fn<TestInterviewGateway['getInterviewSession']>()
          .mockResolvedValueOnce(sessionAuthority())
          .mockResolvedValueOnce(sessionAuthority(REPORT_ID))
      }),
      now: () => 2_100,
      storage,
      waitForNextPoll: () => Promise.resolve(),
      workspaceOperations: operationsGateway(getJob)
    })

    const recovered = await reloadedProcess.recover(SCOPE, new AbortController().signal)

    expect(recovered.status).toBe('ready')
    expect(getJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, workspaceId: WORKSPACE_ID })
    )
    expect(createInterviewReportJob).toHaveBeenCalledOnce()
    expect(reloadedProcess.getRecovery(SCOPE)).toBeNull()
  })

  it('rejects a POST response whose Job subject escapes the requested Session without guessing open codes', async (): Promise<void> => {
    /** @brief 返回错误 subject 的 Interview 端口 / Interview port returning the wrong subject. */
    const interview = interviewGateway({
      createInterviewReportJob: vi
        .fn<TestInterviewGateway['createInterviewReportJob']>()
        .mockResolvedValue(
          jobAuthority('queued', 1, {
            sessionId: asUiOpaqueId<'interview-session'>('session_other')
          })
        ),
      getInterviewReport: vi.fn(),
      getInterviewSession: vi.fn().mockResolvedValue(sessionAuthority())
    })
    /** @brief 被测流程 / Process under test. */
    const process = createInterviewReportProcess({
      interview,
      now: () => 3_000,
      storage: new TestRecoveryStorage(),
      waitForNextPoll: () => Promise.resolve(),
      workspaceOperations: operationsGateway(vi.fn())
    })

    await expect(process.start(SCOPE, new AbortController().signal)).rejects.toMatchObject({
      code: 'job-subject-mismatch',
      name: 'InterviewReportProcessError'
    })
    expect(process.getRecovery(SCOPE)).toMatchObject({
      status: 'authority-review-required'
    })
  })

  it('rejects a regressing Job observation while retaining the accepted Job for safe recovery', async (): Promise<void> => {
    /** @brief queued → running → queued 的非法观察序列 / Invalid queued-to-running-to-queued observation sequence. */
    const getJob = vi
      .fn<TestOperationsGateway['getJob']>()
      .mockResolvedValueOnce(jobAuthority('running', 2))
      .mockResolvedValueOnce(jobAuthority('queued', 3))
    /** @brief 可检查保留记录的存储 / Storage whose retained record is inspected. */
    const storage = new TestRecoveryStorage()
    /** @brief 被测流程 / Process under test. */
    const process = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob: vi
          .fn<TestInterviewGateway['createInterviewReportJob']>()
          .mockResolvedValue(jobAuthority('queued', 1)),
        getInterviewReport: vi.fn(),
        getInterviewSession: vi.fn().mockResolvedValue(sessionAuthority())
      }),
      now: () => 4_000,
      storage,
      waitForNextPoll: () => Promise.resolve(),
      workspaceOperations: operationsGateway(getJob)
    })

    await expect(process.start(SCOPE, new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid-job-transition',
      name: 'InterviewReportProcessError'
    })
    expect(process.getRecovery(SCOPE)).toMatchObject({
      jobId: JOB_ID,
      status: 'job-accepted'
    })
  })

  it('keeps publishing state after Job success until Session authority exposes reportId', async (): Promise<void> => {
    /** @brief start 与两次发布读取 / Session reads for start and two publication attempts. */
    const getInterviewSession = vi
      .fn<TestInterviewGateway['getInterviewSession']>()
      .mockResolvedValueOnce(sessionAuthority())
      .mockResolvedValueOnce(sessionAuthority())
      .mockResolvedValueOnce(sessionAuthority(REPORT_ID))
    /** @brief 注入等待的调用观察 / Observation of injected waits. */
    const waitForNextPoll = vi.fn().mockResolvedValue(undefined)
    /** @brief 产品观察状态 / Product observation statuses. */
    const observations: string[] = []
    /** @brief 被测流程 / Process under test. */
    const process = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob: vi
          .fn<TestInterviewGateway['createInterviewReportJob']>()
          .mockResolvedValue(jobAuthority('succeeded', 1)),
        getInterviewReport: vi.fn().mockResolvedValue(report()),
        getInterviewSession
      }),
      now: () => 5_000,
      storage: new TestRecoveryStorage(),
      waitForNextPoll,
      workspaceOperations: operationsGateway(vi.fn())
    })

    const outcome = await process.start(
      SCOPE,
      new AbortController().signal,
      (observation): void => {
        observations.push(observation.status)
      }
    )

    expect(outcome.status).toBe('ready')
    expect(observations).toEqual(['job-accepted', 'report-publishing', 'ready'])
    expect(waitForNextPoll).toHaveBeenCalledOnce()
    expect(getInterviewSession).toHaveBeenCalledTimes(3)
  })

  it('fails closed when a completed Session publishes a Report for another Session', async (): Promise<void> => {
    /** @brief 返回错误 Session 关系的不可变报告 / Immutable report returning the wrong Session relationship. */
    const wrongReport = report({
      sessionId: asUiOpaqueId<'interview-session'>('session_wrong_report_owner')
    })
    /** @brief 被测流程 / Process under test. */
    const process = createInterviewReportProcess({
      interview: interviewGateway({
        createInterviewReportJob: vi.fn(),
        getInterviewReport: vi.fn().mockResolvedValue(wrongReport),
        getInterviewSession: vi.fn().mockResolvedValue(sessionAuthority(REPORT_ID))
      }),
      now: () => 6_000,
      storage: new TestRecoveryStorage(),
      waitForNextPoll: () => Promise.resolve(),
      workspaceOperations: operationsGateway(vi.fn())
    })

    await expect(process.recover(SCOPE, new AbortController().signal)).rejects.toMatchObject({
      code: 'report-session-mismatch',
      name: 'InterviewReportProcessError'
    })
  })
})
