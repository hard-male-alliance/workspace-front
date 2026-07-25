/** @file Workspace-scoped InterviewReport API v2 消费者 / Workspace-scoped InterviewReport API v2 consumers. */

import { decodeAcknowledgedWrite } from '../http/acknowledged-write'
import type {
  ApiV2AcceptedResourceResponse,
  ApiV2Client,
  ApiV2PostJsonOptions
} from '../http/client'
import { idempotencyKey, opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  parseAcceptedWorkspaceJob,
  type AcceptedWorkspaceJobRepresentation
} from '../jobs/accepted-job'
import { JOB_MAX_RESPONSE_BYTES } from '../jobs/job'
import {
  encodeCreateInterviewReportJobRequest,
  parseInterviewReport,
  type CreateInterviewReportJobRequest,
  type InterviewReport
} from './report'

/** @brief InterviewReport Job 请求上限 / Request ceiling for an InterviewReport Job. */
const CREATE_INTERVIEW_REPORT_JOB_MAX_REQUEST_BYTES = 4 * 1024

/** @brief 单个 InterviewReport 响应上限 / Response ceiling for one InterviewReport. */
const INTERVIEW_REPORT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

/** @brief 单个 Report 读取请求 / Request to read one Report. */
export interface InterviewReportReadRequest {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Report identity / Report identity. */
  readonly reportId: string
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 带 HTTP 并发元数据的 Report 表示 / Report representation carrying HTTP concurrency metadata. */
export interface InterviewReportRepresentation {
  /** @brief 权威 Report / Authoritative Report. */
  readonly value: InterviewReport
  /** @brief 当前 Report 的强 ETag / Strong ETag of the current Report. */
  readonly entityTag: string
  /** @brief 服务端 request ID / Server request ID. */
  readonly requestId: string
}

/** @brief ReportJob 创建端点的最小 HTTP port / Minimal HTTP port for ReportJob creation. */
export interface InterviewReportJobHttpClient {
  /**
   * @brief 提交固定 202 的 ReportJob / Submit a ReportJob fixed to 202 semantics.
   * @param path v2 产品路径 / v2 product path.
   * @param body 严格 ReportJob payload / Strict ReportJob payload.
   * @param options 幂等、大小与取消策略 / Idempotency, size, and cancellation policy.
   * @return 带 ETag 与 Location 的 202 Job / 202 Job carrying ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'accepted-resource'>
  ) => Promise<ApiV2AcceptedResourceResponse>
}

/** @brief 创建 InterviewReport Job command / Command to create an InterviewReport Job. */
export interface CreateWorkspaceInterviewReportJobCommand {
  /** @brief 显式 Workspace 授权上下文 / Explicit Workspace authorization context. */
  readonly workspaceId: string
  /** @brief Session identity / Session identity. */
  readonly sessionId: string
  /** @brief 同一报告生成意图内稳定的幂等键 / Stable idempotency key for one report-generation intent. */
  readonly idempotencyKey: string
  /** @brief canonical ReportJob 请求 / Canonical ReportJob request. */
  readonly request: CreateInterviewReportJobRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 校验 ReportJob 指向 command Session / Validate that a ReportJob targets the command Session.
 * @param representation 已接受 Job / Accepted Job.
 * @param sessionId command Session identity / Session identity from the command.
 */
function assertReportJobSubject(
  representation: AcceptedWorkspaceJobRepresentation,
  sessionId: string
): void {
  if (
    representation.value.subject.resource_type !== 'interview_session' ||
    representation.value.subject.id !== sessionId
  ) {
    throw new ApiV2ContractError(
      'API v2 accepted an InterviewReport Job for a different or non-Session subject.'
    )
  }
}

/**
 * @brief 创建一个 InterviewReport Job / Create an InterviewReport Job.
 * @param client 固定 202 的 ReportJob port / ReportJob port fixed to 202.
 * @param command Workspace、Session、payload、幂等键与取消信号 / Workspace, Session, payload, idempotency key, and cancellation signal.
 * @return 可继续观察或取消的权威 Job / Authoritative Job that can be observed or cancelled.
 */
export async function createWorkspaceInterviewReportJob(
  client: InterviewReportJobHttpClient,
  command: CreateWorkspaceInterviewReportJobCommand
): Promise<AcceptedWorkspaceJobRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Session / Validated Session. */
  const sessionId = opaqueId(command.sessionId, 'request.session_id')
  /** @brief 严格 ReportJob 请求 / Strict ReportJob request. */
  const request = encodeCreateInterviewReportJobRequest(command.request)
  /** @brief 稳定幂等键 / Stable idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 202 transport 响应 / Transport response fixed to 202. */
  const response = await client.postJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-sessions/${encodeURIComponent(sessionId)}/report-jobs`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: CREATE_INTERVIEW_REPORT_JOB_MAX_REQUEST_BYTES,
      maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'accepted-resource'
    }
  )
  return decodeAcknowledgedWrite(response, 202, (): AcceptedWorkspaceJobRepresentation => {
    /** @brief 已接受 Job / Accepted Job. */
    const representation = parseAcceptedWorkspaceJob(response, workspaceId)
    assertReportJobSubject(representation, sessionId)
    return representation
  })
}

/**
 * @brief 读取一个权威 InterviewReport / Read one authoritative InterviewReport.
 * @param client v2-only Bearer read client / v2-only Bearer read client.
 * @param request Workspace、Report 与取消信号 / Workspace, Report, and cancellation signal.
 * @return Report、同响应强 ETag 与 request ID / Report, co-response strong ETag, and request ID.
 */
export async function getWorkspaceInterviewReport(
  client: ApiV2Client,
  request: InterviewReportReadRequest
): Promise<InterviewReportRepresentation> {
  /** @brief 已验证 Workspace / Validated Workspace. */
  const workspaceId = opaqueId(request.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Report / Validated Report. */
  const reportId = opaqueId(request.reportId, 'request.report_id')
  /** @brief 严格 200 响应 / Strict 200 response. */
  const response = await client.getJson(
    `/workspaces/${encodeURIComponent(workspaceId)}/interview-reports/${encodeURIComponent(reportId)}`,
    {
      expectedStatus: 200,
      maxResponseBytes: INTERVIEW_REPORT_MAX_RESPONSE_BYTES,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    }
  )
  /** @brief 已解码 Report / Decoded Report. */
  const value = parseInterviewReport(response.data)
  if (value.workspace_id !== workspaceId || value.id !== reportId) {
    throw new ApiV2ContractError(
      'API v2 returned an InterviewReport outside the requested Workspace or identity path.'
    )
  }
  return {
    entityTag: strongEntityTag(response.headers.get('ETag'), 'response.headers.ETag'),
    requestId: opaqueId(response.headers.get('X-Request-Id'), 'response.headers.X-Request-Id'),
    value
  }
}
