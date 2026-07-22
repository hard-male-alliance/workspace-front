/** @file API v2 Job 并发安全取消 command / API v2 concurrency-safe Job cancellation command. */

import type { ApiV2PostEmptyOptions, ApiV2UpdatedWriteJsonResponse } from '../http/client'
import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import { idempotencyKey, opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { JOB_MAX_RESPONSE_BYTES, parseJob, type JobRepresentation } from './job'

/** @brief Job cancellation 所需的最小写端口 / Minimal write port required by Job cancellation. */
export interface JobCancellationHttpClient {
  /**
   * @brief 提交无 body 且固定为 200 updated-resource 的 cancellation / Submit a bodyless cancellation fixed to 200 updated-resource semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param options 幂等、并发、字节与取消策略 / Idempotency, concurrency, byte, and cancellation policy.
   * @return 带强 ETag 的权威 Job / Authoritative Job carrying a strong ETag.
   */
  readonly postEmpty: (
    path: string,
    options: ApiV2PostEmptyOptions<'updated-resource'>
  ) => Promise<ApiV2UpdatedWriteJsonResponse>
}

/** @brief 取消一个 Job 的完整 command / Complete command for cancelling one Job. */
export interface CancelWorkspaceJobCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 路径中的 Job identity / Job identity in the path. */
  readonly jobId: string
  /** @brief 同一取消意图中稳定的幂等键 / Idempotency key stable within the same cancellation intent. */
  readonly idempotencyKey: string
  /** @brief 当前 Job 表示的强 ETag / Strong ETag of the current Job representation. */
  readonly ifMatch: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 幂等且并发安全地提交一次 Job cancellation / Submit one idempotent, concurrency-safe Job cancellation.
 * @param client 固定 updated-resource 语义的窄写端口 / Narrow write port fixed to updated-resource semantics.
 * @param command Workspace、Job、幂等键与强并发前置条件 / Workspace, Job, idempotency key, and strong concurrency precondition.
 * @return 与路径 identity 一致的权威 Job 与新 ETag / Authoritative Job and new ETag matching the path identity.
 */
export async function cancelWorkspaceJob(
  client: JobCancellationHttpClient,
  command: CancelWorkspaceJobCommand
): Promise<JobRepresentation> {
  /** @brief 只读取一次的 Workspace ID / Workspace ID read exactly once. */
  const workspaceIdCandidate = command.workspaceId
  /** @brief 只读取一次的 Job ID / Job ID read exactly once. */
  const jobIdCandidate = command.jobId
  /** @brief 只读取一次的幂等键 / Idempotency key read exactly once. */
  const idempotencyKeyCandidate = command.idempotencyKey
  /** @brief 只读取一次的 If-Match / If-Match read exactly once. */
  const ifMatchCandidate = command.ifMatch
  /** @brief 只读取一次的取消信号 / Abort signal read exactly once. */
  const signal = command.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 Job ID / Validated Job ID. */
  const jobId = opaqueId(jobIdCandidate, 'request.job_id')
  /** @brief 已验证稳定幂等键 / Validated stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(idempotencyKeyCandidate)
  /** @brief 已验证强并发校验器 / Validated strong concurrency validator. */
  const ifMatch = strongEntityTag(ifMatchCandidate, 'request.headers.If-Match')
  signal?.throwIfAborted()
  /** @brief Workspace-scoped Job cancellation path / Workspace-scoped Job cancellation path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(jobId)}/cancellations`
  /** @brief 固定 200 updated-resource 的空 command 响应 / Empty-command response fixed to 200 updated-resource semantics. */
  const response = await client.postEmpty(path, {
    idempotencyKey: validatedIdempotencyKey,
    ifMatch,
    maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal }),
    successKind: 'updated-resource'
  })
  return decodeAcknowledgedWrite(response, 200, (): JobRepresentation => {
    /** @brief 严格解码的权威 Job / Strictly decoded authoritative Job. */
    const value = parseJob(response.data)
    if (value.workspace_id !== workspaceId || value.id !== jobId) {
      throw new ApiV2ContractError(
        'API v2 returned a cancellation Job whose Workspace or identity differs from the command path.'
      )
    }
    return {
      entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
      requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
      value
    }
  })
}
