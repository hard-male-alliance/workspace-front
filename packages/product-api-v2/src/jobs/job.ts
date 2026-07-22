/** @file API v2 Workspace Job 领域投影与单项读取 / API v2 Workspace Job domain projection and single-resource read. */

import type { ApiV2Client } from '../http/client'
import {
  arrayBetween,
  boundedInteger,
  boundedString,
  closedStringEnum,
  exactRecord,
  opaqueId,
  parseResourceFields,
  record,
  strongEntityTag,
  timestamp,
  type ResourceFields
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseProblemDetails, type ProblemDetails } from '../http/problem'
import {
  parseResourceReference,
  resourceType,
  type ResourceReference
} from '../resources/resource-reference'

/** @brief 单个 Job JSON 响应的解码前字节上限 / Pre-decoding byte ceiling for one Job JSON response. */
export const JOB_MAX_RESPONSE_BYTES = 512 * 1024

/** @brief Job 进度单位 / Job progress unit. */
export type JobProgressUnit = 'bytes' | 'items' | 'pages' | 'steps' | 'unknown'

/** @brief Job 进度投影 / Job progress projection. */
export interface JobProgress {
  /** @brief 当前阶段 / Current phase. */
  readonly phase: string
  /** @brief 已完成数量 / Completed amount. */
  readonly completed: number
  /** @brief 总量；未知时为 null / Total amount, or null when unknown. */
  readonly total: number | null
  /** @brief 进度计量单位 / Progress measurement unit. */
  readonly unit: JobProgressUnit
}

/** @brief Job 跨状态公共字段 / Fields shared by every Job state. */
export interface JobFields extends ResourceFields {
  /** @brief 显式授权的 Workspace ID / Explicitly authorized Workspace ID. */
  readonly workspace_id: string
  /** @brief 领域 Job 种类 / Domain Job kind. */
  readonly kind: string
  /** @brief Job 操作的主体资源 / Subject resource operated on by the Job. */
  readonly subject: ResourceReference
  /** @brief 可选进度 / Optional progress. */
  readonly progress: JobProgress | null
  /** @brief 结果资源引用，不内嵌大对象 / Result resource references without embedded large objects. */
  readonly result_refs: readonly ResourceReference[]
}

/** @brief 等待执行的 Job / Job awaiting execution. */
export interface QueuedJob extends JobFields {
  readonly status: 'queued'
  readonly problem: null
  readonly started_at: null
  readonly finished_at: null
}

/** @brief 正在执行的 Job / Job currently executing. */
export interface RunningJob extends JobFields {
  readonly status: 'running'
  readonly problem: null
  readonly started_at: string
  readonly finished_at: null
}

/** @brief 成功完成的 Job / Successfully completed Job. */
export interface SucceededJob extends JobFields {
  readonly status: 'succeeded'
  readonly problem: null
  readonly started_at: string
  readonly finished_at: string
}

/** @brief 失败并携带结构化 Problem 的 Job / Failed Job carrying a structured Problem. */
export interface FailedJob extends JobFields {
  readonly status: 'failed'
  readonly problem: ProblemDetails
  readonly started_at: string
  readonly finished_at: string
}

/** @brief 在 queued 或 running 期间取消的 Job / Job cancelled while queued or running. */
export interface CancelledJob extends JobFields {
  readonly status: 'cancelled'
  readonly problem: ProblemDetails | null
  readonly started_at: string | null
  readonly finished_at: string
}

/** @brief 在开始前过期的 Job / Job that expired before starting. */
export interface ExpiredJob extends JobFields {
  readonly status: 'expired'
  readonly problem: ProblemDetails | null
  readonly started_at: null
  readonly finished_at: string
}

/** @brief Job 生命周期的判别联合 / Discriminated union of Job lifecycle states. */
export type Job = CancelledJob | ExpiredJob | FailedJob | QueuedJob | RunningJob | SucceededJob

/** @brief 需要继续轮询的非终态 Job / Non-terminal Job that still needs polling. */
export type PendingJob = QueuedJob | RunningJob

/** @brief Job 单项读取输入 / Input for reading one Job. */
export interface JobReadRequest {
  /** @brief 授权路径中的 Workspace ID / Workspace ID in the authorization path. */
  readonly workspaceId: string
  /** @brief 要读取的不透明 Job ID / Opaque Job ID to read. */
  readonly jobId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带 HTTP 表示元数据的权威 Job / Authoritative Job carrying HTTP representation metadata. */
export interface JobRepresentation {
  /** @brief 严格解码的 Job / Strictly decoded Job. */
  readonly value: Job
  /** @brief 后续取消 command 可用的强 ETag / Strong ETag usable by a later cancellation command. */
  readonly entityTag: string
  /** @brief 服务端确认的请求 ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/**
 * @brief 解码 JobProgress 并验证 completed 不超过 total / Decode JobProgress and ensure completed does not exceed total.
 * @param value 未知进度 / Unknown progress.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证进度 / Validated progress.
 */
function parseJobProgress(value: unknown, path: string): JobProgress {
  /** @brief 精确 JobProgress 对象 / Exact JobProgress object. */
  const input = exactRecord(value, path, ['phase', 'completed', 'total', 'unit'])
  /** @brief 已完成数量 / Completed amount. */
  const completed = boundedInteger(input.completed, `${path}.completed`, 0, Number.MAX_SAFE_INTEGER)
  /** @brief 可选总量 / Optional total amount. */
  const total =
    input.total === null
      ? null
      : boundedInteger(input.total, `${path}.total`, 0, Number.MAX_SAFE_INTEGER)
  if (total !== null && completed > total) {
    throw new ApiV2ContractError(`API v2 field ${path}.completed cannot exceed ${path}.total.`)
  }
  return {
    completed,
    phase: boundedString(input.phase, `${path}.phase`, 1, 80),
    total,
    unit: closedStringEnum(input.unit, `${path}.unit`, [
      'items',
      'bytes',
      'pages',
      'steps',
      'unknown'
    ])
  }
}

/**
 * @brief 解码嵌入 Job 的 ProblemDetails / Decode ProblemDetails embedded in a Job.
 * @param value 未知 Problem / Unknown Problem.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证 Problem / Validated Problem.
 */
function parseEmbeddedProblem(value: unknown, path: string): ProblemDetails {
  /** @brief 用于读取自声明 status 的 Problem 对象 / Problem object used to read its declared status. */
  const input = record(value, path)
  /** @brief Problem 声明的 HTTP status / HTTP status declared by the Problem. */
  const status = boundedInteger(input.status, `${path}.status`, 400, 599)
  return parseProblemDetails(value, status)
}

/**
 * @brief 解码可空 UTC timestamp / Decode a nullable UTC timestamp.
 * @param value 未知时间 / Unknown timestamp.
 * @param path 诊断字段路径 / Diagnostic field path.
 * @return 已验证时间或 null / Validated timestamp or null.
 */
function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : timestamp(value, path)
}

/**
 * @brief 严格解码 canonical Job 并执行状态不变量 / Strictly decode a canonical Job and enforce lifecycle invariants.
 * @param value 未知 Job / Unknown Job.
 * @return 已验证的判别联合 / Validated discriminated union.
 */
export function parseJob(value: unknown): Job {
  /** @brief 精确 Job 对象 / Exact Job object. */
  const input = exactRecord(value, 'job', [
    'id',
    'revision',
    'created_at',
    'updated_at',
    'workspace_id',
    'kind',
    'subject',
    'status',
    'progress',
    'result_refs',
    'problem',
    'started_at',
    'finished_at'
  ])
  /** @brief 未映射的结果引用 / Unmapped result references. */
  const resultRefs = arrayBetween(input.result_refs, 'job.result_refs', 0, 50)
  /** @brief 跨状态公共字段 / Fields shared across states. */
  const fields: JobFields = {
    ...parseResourceFields(input, 'job'),
    kind: resourceType(input.kind, 'job.kind'),
    progress: input.progress === null ? null : parseJobProgress(input.progress, 'job.progress'),
    result_refs: resultRefs.map((item, index) =>
      parseResourceReference(item, `job.result_refs[${index}]`)
    ),
    subject: parseResourceReference(input.subject, 'job.subject'),
    workspace_id: opaqueId(input.workspace_id, 'job.workspace_id')
  }
  /** @brief 已验证 Job 状态 / Validated Job status. */
  const status = closedStringEnum(input.status, 'job.status', [
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'expired'
  ])
  /** @brief 可空嵌入 Problem / Nullable embedded Problem. */
  const problem = input.problem === null ? null : parseEmbeddedProblem(input.problem, 'job.problem')
  /** @brief 可空开始时间 / Nullable start time. */
  const startedAt = nullableTimestamp(input.started_at, 'job.started_at')
  /** @brief 可空完成时间 / Nullable finish time. */
  const finishedAt = nullableTimestamp(input.finished_at, 'job.finished_at')

  switch (status) {
    case 'queued':
      if (problem !== null || startedAt !== null || finishedAt !== null) {
        throw new ApiV2ContractError('A queued API v2 Job cannot be started, finished, or failed.')
      }
      return { ...fields, finished_at: null, problem: null, started_at: null, status }
    case 'running':
      if (problem !== null || startedAt === null || finishedAt !== null) {
        throw new ApiV2ContractError(
          'A running API v2 Job requires started_at and forbids problem or finished_at.'
        )
      }
      return { ...fields, finished_at: null, problem: null, started_at: startedAt, status }
    case 'succeeded':
      if (problem !== null || startedAt === null || finishedAt === null) {
        throw new ApiV2ContractError(
          'A succeeded API v2 Job requires start and finish times and forbids problem.'
        )
      }
      return {
        ...fields,
        finished_at: finishedAt,
        problem: null,
        started_at: startedAt,
        status
      }
    case 'failed':
      if (problem === null || startedAt === null || finishedAt === null) {
        throw new ApiV2ContractError(
          'A failed API v2 Job requires start and finish times plus ProblemDetails.'
        )
      }
      return { ...fields, finished_at: finishedAt, problem, started_at: startedAt, status }
    case 'cancelled':
      if (finishedAt === null) {
        throw new ApiV2ContractError('A cancelled API v2 Job requires finished_at.')
      }
      return { ...fields, finished_at: finishedAt, problem, started_at: startedAt, status }
    case 'expired':
      if (startedAt !== null || finishedAt === null) {
        throw new ApiV2ContractError('An expired API v2 Job must finish without having started.')
      }
      return { ...fields, finished_at: finishedAt, problem, started_at: null, status }
  }
}

/**
 * @brief 判断 Job 是否仍需继续轮询 / Determine whether a Job still needs polling.
 * @param job 已验证 Job / Validated Job.
 * @return queued/running 时为 true，所有终态为 false / True for queued/running and false for every terminal state.
 */
export function jobNeedsPolling(job: Job): job is PendingJob {
  return job.status === 'queued' || job.status === 'running'
}

/**
 * @brief 读取 Workspace 下的一个权威 Job / Read one authoritative Job in a Workspace.
 * @param client v2-only Bearer 读取客户端 / v2-only Bearer read client.
 * @param request 显式 Workspace、Job identity 与取消信号 / Explicit Workspace and Job identities plus cancellation signal.
 * @return 同一 200 响应中的 Job、强 ETag 与 request ID / Job, strong ETag, and request ID from the same 200 response.
 */
export async function getWorkspaceJob(
  client: ApiV2Client,
  request: JobReadRequest
): Promise<JobRepresentation> {
  /** @brief 仅读取一次的 Workspace ID 候选值 / Workspace-ID candidate read exactly once. */
  const workspaceIdCandidate = request.workspaceId
  /** @brief 仅读取一次的 Job ID 候选值 / Job-ID candidate read exactly once. */
  const jobIdCandidate = request.jobId
  /** @brief 仅读取一次的取消信号 / Cancellation signal read exactly once. */
  const signal = request.signal
  /** @brief 已验证 Workspace ID / Validated Workspace ID. */
  const workspaceId = opaqueId(workspaceIdCandidate, 'request.workspace_id')
  /** @brief 已验证 Job ID / Validated Job ID. */
  const jobId = opaqueId(jobIdCandidate, 'request.job_id')
  /** @brief Workspace-scoped Job 路径 / Workspace-scoped Job path. */
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(jobId)}`
  /** @brief transport 严格验证的 200 JSON 响应 / 200 JSON response strictly validated by the transport. */
  const response = await client.getJson(path, {
    expectedStatus: 200,
    maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal })
  })
  /** @brief 已验证权威 Job / Validated authoritative Job. */
  const value = parseJob(response.data)
  if (value.workspace_id !== workspaceId || value.id !== jobId) {
    throw new ApiV2ContractError(
      'API v2 returned a Job whose Workspace or identity differs from the request path.'
    )
  }
  /** @brief 同一响应中的强 ETag / Strong ETag from the same response. */
  const entityTag = strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag')
  /** @brief 同一响应中的 request ID / Request ID from the same response. */
  const requestId = opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id')
  return { entityTag, requestId, value }
}
