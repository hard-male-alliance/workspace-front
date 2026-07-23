import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { cancelWorkspaceJob, type JobCancellationHttpClient } from './cancel-job'

/** @brief canonical Job Workspace ID / Workspace ID of the canonical Job. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Job ID / ID of the canonical Job. */
const JOB_ID = 'job_01K0EXAMPLE0000000000001'

/** @brief 另一合法 Job ID / Another valid Job ID. */
const OTHER_JOB_ID = 'job_01K0OTHER000000000000001'

/** @brief cancellation 意图的稳定幂等键 / Stable idempotency key for the cancellation intent. */
const IDEMPOTENCY_KEY = 'cancel_job_intent_12345678'

/** @brief cancellation 前 Job 的强 ETag / Strong ETag of the Job before cancellation. */
const IF_MATCH = '"job-running-revision-2"'

/** @brief cancellation 后 Job 的强 ETag / Strong ETag of the Job after cancellation. */
const NEXT_ETAG = '"job-cancelled-revision-3"'

/** @brief cancellation 响应 request ID / Request ID of the cancellation response. */
const REQUEST_ID = 'request_job_cancel_1234567'

/**
 * @brief 构造有效 cancelled Job 响应 / Build a valid cancelled Job response.
 * @param overrides 需要覆盖的 Job 字段 / Job fields to override.
 * @return 已进入 cancelled 终态的 Job JSON / Job JSON in the cancelled terminal state.
 */
async function cancelledJob(
  overrides: Readonly<Record<string, unknown>> = {}
): Promise<Record<string, unknown>> {
  /** @brief canonical running Job 的可变副本 / Mutable copy of the canonical running Job. */
  const input = structuredClone(await readCanonicalExample('running_render_job')) as Record<
    string,
    unknown
  >
  return {
    ...input,
    finished_at: '2026-07-22T12:10:03Z',
    revision: 3,
    status: 'cancelled',
    updated_at: '2026-07-22T12:10:03Z',
    ...overrides
  }
}

/**
 * @brief 构造固定 updated-resource 响应的写端口 / Build a write port returning a fixed updated-resource response.
 * @param data 未解码响应 Job / Undecoded response Job.
 * @param entityTag 响应强 ETag / Strong response ETag.
 * @return 可观测 cancellation 端口 / Observable cancellation port.
 */
function cancellationClient(
  data: unknown,
  entityTag = NEXT_ETAG
): {
  readonly client: JobCancellationHttpClient
  readonly postEmpty: ReturnType<typeof vi.fn<JobCancellationHttpClient['postEmpty']>>
} {
  /** @brief 可观测空 POST / Observable empty POST. */
  const postEmpty = vi.fn<JobCancellationHttpClient['postEmpty']>().mockResolvedValue({
    data,
    metadata: { entityTag, location: null, requestId: REQUEST_ID },
    status: 200
  })
  return { client: { postEmpty }, postEmpty }
}

describe('API v2 Job cancellation consumer', (): void => {
  it('submits one bodyless idempotent, conditional updated-resource command', async (): Promise<void> => {
    /** @brief 返回 cancelled Job 的写端口 / Write port returning a cancelled Job. */
    const execution = cancellationClient(await cancelledJob())
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const signal = new AbortController().signal

    await expect(
      cancelWorkspaceJob(execution.client, {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: IF_MATCH,
        jobId: JOB_ID,
        signal,
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toMatchObject({
      entityTag: NEXT_ETAG,
      requestId: REQUEST_ID,
      value: { id: JOB_ID, revision: 3, status: 'cancelled' }
    })
    expect(execution.postEmpty).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}/cancellations`,
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: IF_MATCH,
        maxResponseBytes: 512 * 1024,
        signal,
        successKind: 'updated-resource'
      }
    )
  })

  it.each([
    { idempotencyKey: 'short', ifMatch: IF_MATCH },
    { idempotencyKey: IDEMPOTENCY_KEY, ifMatch: 'W/"weak"' }
  ])('rejects invalid write preconditions before dispatch %#', async (invalid): Promise<void> => {
    /** @brief 不应被调用的写端口 / Write port that must not be called. */
    const postEmpty = vi.fn<JobCancellationHttpClient['postEmpty']>()

    await expect(
      cancelWorkspaceJob(
        { postEmpty },
        {
          ...invalid,
          jobId: JOB_ID,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(postEmpty).not.toHaveBeenCalled()
  })

  it('does not dispatch an already aborted command', async (): Promise<void> => {
    /** @brief 已取消的 signal / Already aborted signal. */
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    /** @brief 不应被调用的写端口 / Write port that must not be called. */
    const postEmpty = vi.fn<JobCancellationHttpClient['postEmpty']>()

    await expect(
      cancelWorkspaceJob(
        { postEmpty },
        {
          idempotencyKey: IDEMPOTENCY_KEY,
          ifMatch: IF_MATCH,
          jobId: JOB_ID,
          signal: controller.signal,
          workspaceId: WORKSPACE_ID
        }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(postEmpty).not.toHaveBeenCalled()
  })

  it('preserves an unknown 200 outcome when the response Job differs from the command path', async (): Promise<void> => {
    /** @brief 返回其他 Job 的写端口 / Write port returning another Job. */
    const execution = cancellationClient(await cancelledJob({ id: OTHER_JOB_ID }))

    await expect(
      cancelWorkspaceJob(execution.client, {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: IF_MATCH,
        jobId: JOB_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: REQUEST_ID,
      status: 200
    })
  })

  it.each(['W/"weak-next"', 'not-an-etag'])(
    'preserves an unknown 200 outcome for an invalid response ETag (%s)',
    async (etag) => {
      /** @brief 返回非法校验器的写端口 / Write port returning an invalid validator. */
      const execution = cancellationClient(await cancelledJob(), etag)

      await expect(
        cancelWorkspaceJob(execution.client, {
          idempotencyKey: IDEMPOTENCY_KEY,
          ifMatch: IF_MATCH,
          jobId: JOB_ID,
          workspaceId: WORKSPACE_ID
        })
      ).rejects.toMatchObject({
        kind: 'contract',
        name: 'ApiV2WriteOutcomeUnknownError',
        requestId: REQUEST_ID,
        status: 200
      })
    }
  )

  it('preserves an unknown 200 outcome for a malformed response body', async (): Promise<void> => {
    /** @brief 返回非法 Job body 的写端口 / Write port returning an invalid Job body. */
    const execution = cancellationClient({ unexpected: true })

    await expect(
      cancelWorkspaceJob(execution.client, {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: IF_MATCH,
        jobId: JOB_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      problemCode: null,
      requestId: REQUEST_ID,
      status: 200
    })
  })
})
