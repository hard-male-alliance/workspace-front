import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { getWorkspaceJob, jobNeedsPolling, parseJob } from './job'

/** @brief canonical Job Workspace ID / Workspace ID of the canonical Job. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Job ID / ID of the canonical Job. */
const JOB_ID = 'job_01K0EXAMPLE0000000000001'

/** @brief 另一合法 Workspace ID / Another valid Workspace ID. */
const OTHER_WORKSPACE_ID = 'ws_01K0OTHER000000000000001'

/** @brief Job 表示强 ETag / Strong ETag for the Job representation. */
const ENTITY_TAG = '"job-representation-2"'

/** @brief Job GET 响应 request ID / Request ID for the Job GET response. */
const REQUEST_ID = 'request_job_read_12345678'

/**
 * @brief 将 fixture 收窄为可变普通对象 / Narrow a fixture to a mutable plain object.
 * @param value 未知 fixture / Unknown fixture.
 * @return 可用于反例的深拷贝 / Deep copy suitable for negative cases.
 */
function mutableRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a record fixture.')
  }
  return structuredClone(value) as Record<string, unknown>
}

/**
 * @brief 构造 Job 内嵌 ProblemDetails / Build ProblemDetails embedded in a Job.
 * @return 完整失败诊断 / Complete failure diagnostic.
 */
function failedProblem(): Record<string, unknown> {
  return {
    code: 'job.render_failed',
    detail: 'The render worker failed.',
    errors: [],
    instance: `/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
    request_id: 'request_job_failure_123456',
    retryable: true,
    status: 500,
    title: 'Render failed',
    type: 'https://api.hmalliances.org:8022/problems/job/render-failed'
  }
}

describe('API v2 Job consumer', (): void => {
  it('decodes the canonical running Job and identifies it as pollable', async (): Promise<void> => {
    /** @brief 唯一事实来源中的 running Job / Running Job from the single source of truth. */
    const decoded = parseJob(await readCanonicalExample('running_render_job'))

    expect(decoded).toMatchObject({
      id: JOB_ID,
      kind: 'resume.render',
      status: 'running',
      workspace_id: WORKSPACE_ID
    })
    expect(jobNeedsPolling(decoded)).toBe(true)
  })

  it.each([
    { finished_at: null, problem: null, started_at: null, status: 'queued', polling: true },
    {
      finished_at: '2026-07-22T12:10:04Z',
      problem: null,
      started_at: '2026-07-22T12:10:01Z',
      status: 'succeeded',
      polling: false
    },
    {
      finished_at: '2026-07-22T12:10:04Z',
      problem: failedProblem(),
      started_at: '2026-07-22T12:10:01Z',
      status: 'failed',
      polling: false
    },
    {
      finished_at: '2026-07-22T12:10:04Z',
      problem: null,
      started_at: null,
      status: 'cancelled',
      polling: false
    },
    {
      finished_at: '2026-07-22T12:10:04Z',
      problem: null,
      started_at: null,
      status: 'expired',
      polling: false
    }
  ])('enforces and discriminates the $status lifecycle state', async (state): Promise<void> => {
    /** @brief 以 canonical Job 为基础的状态变体 / Lifecycle variant based on the canonical Job. */
    const input = mutableRecord(await readCanonicalExample('running_render_job'))
    Object.assign(input, state)
    delete input.polling

    /** @brief 已验证状态变体 / Validated lifecycle variant. */
    const decoded = parseJob(input)
    expect(decoded.status).toBe(state.status)
    expect(jobNeedsPolling(decoded)).toBe(state.polling)
  })

  it('rejects unknown fields and impossible progress', async (): Promise<void> => {
    /** @brief 携带旧字段的 Job / Job carrying an old field. */
    const oldShape = mutableRecord(await readCanonicalExample('running_render_job'))
    oldShape.output = { download_url: 'https://example.invalid/file' }
    /** @brief completed 超过 total 的 Job / Job whose completed amount exceeds total. */
    const impossibleProgress = mutableRecord(await readCanonicalExample('running_render_job'))
    impossibleProgress.progress = { completed: 5, phase: 'layout', total: 4, unit: 'steps' }

    expect(() => parseJob(oldShape)).toThrow(ApiV2ContractError)
    expect(() => parseJob(impossibleProgress)).toThrow(ApiV2ContractError)
  })

  it.each([
    { status: 'queued', started_at: '2026-07-22T12:10:01Z' },
    { status: 'running', started_at: null },
    { status: 'succeeded', started_at: null, finished_at: '2026-07-22T12:10:04Z' },
    {
      status: 'failed',
      started_at: '2026-07-22T12:10:01Z',
      finished_at: '2026-07-22T12:10:04Z',
      problem: null
    },
    {
      status: 'expired',
      started_at: '2026-07-22T12:10:01Z',
      finished_at: '2026-07-22T12:10:04Z'
    }
  ])('rejects an impossible $status lifecycle combination', async (override): Promise<void> => {
    /** @brief 含非法生命周期组合的 Job / Job with an invalid lifecycle combination. */
    const input = mutableRecord(await readCanonicalExample('running_render_job'))
    Object.assign(input, override)

    expect(() => parseJob(input)).toThrow(ApiV2ContractError)
  })

  it('reads one Job only from its Workspace-scoped v2 path', async (): Promise<void> => {
    /** @brief canonical Job payload / Canonical Job payload. */
    const payload = await readCanonicalExample('running_render_job')
    /** @brief 可观测的 v2 GET / Observable v2 GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: payload,
      headers: new Headers({ ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }),
      status: 200
    })
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const signal = new AbortController().signal

    await expect(
      getWorkspaceJob({ getJson }, { jobId: JOB_ID, signal, workspaceId: WORKSPACE_ID })
    ).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: { id: JOB_ID, status: 'running' }
    })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`, {
      expectedStatus: 200,
      maxResponseBytes: 512 * 1024,
      signal
    })
  })

  it('rejects a response whose authority or representation validators do not match', async (): Promise<void> => {
    /** @brief 错误 Workspace 权威的 Job / Job claiming a different Workspace authority. */
    const wrongAuthority = mutableRecord(await readCanonicalExample('running_render_job'))
    wrongAuthority.workspace_id = OTHER_WORKSPACE_ID
    /** @brief 返回不匹配 Job 的 GET / GET returning a mismatched Job. */
    const mismatchedGet = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: wrongAuthority,
      headers: new Headers({ ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }),
      status: 200
    })
    /** @brief 返回弱 ETag 的 GET / GET returning a weak ETag. */
    const weakValidatorGet = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: await readCanonicalExample('running_render_job'),
      headers: new Headers({ ETag: `W/${ENTITY_TAG}`, 'X-Request-Id': REQUEST_ID }),
      status: 200
    })

    await expect(
      getWorkspaceJob({ getJson: mismatchedGet }, { jobId: JOB_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    await expect(
      getWorkspaceJob({ getJson: weakValidatorGet }, { jobId: JOB_ID, workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })
})
