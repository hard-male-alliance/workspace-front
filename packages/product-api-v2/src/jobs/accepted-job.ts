/** @file API v2 已接受 Workspace Job 的公共响应边界 / Shared response boundary for accepted API v2 Workspace Jobs. */

import type { ApiV2AcceptedResourceResponse } from '../http/client'
import { opaqueId, strongEntityTag } from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import { parseJob, type Job } from './job'

/** @brief 202 接受后可继续观察的 Workspace Job 表示 / Observable Workspace Job representation after a 202 acceptance. */
export interface AcceptedWorkspaceJobRepresentation {
  /** @brief 已严格解码的当前 Job 状态 / Strictly decoded current Job state. */
  readonly value: Job
  /** @brief Job 后续取消所需的强校验器 / Strong validator required by a later Job cancellation. */
  readonly entityTag: string
  /** @brief Job 的规范绝对 Location / Canonical absolute Location of the Job. */
  readonly location: string
  /** @brief 服务端确认的 request ID / Request ID confirmed by the service. */
  readonly requestId: string
}

/**
 * @brief 校验 202 Location 精确标识已返回的 Workspace Job / Validate that a 202 Location identifies the returned Workspace Job exactly.
 * @param location Transport 已验证的绝对同源 Location / Absolute same-origin Location validated by the transport.
 * @param workspaceId Job 所属 Workspace / Workspace owning the Job.
 * @param jobId 已返回 Job identity / Returned Job identity.
 * @return 未改写的规范 Location / Unmodified canonical Location.
 */
function acceptedJobLocation(location: string, workspaceId: string, jobId: string): string {
  /** @brief 已解析的绝对 Location / Parsed absolute Location. */
  let parsed: URL
  try {
    parsed = new URL(location)
  } catch {
    throw new ApiV2ContractError('API v2 accepted Job returned an invalid absolute Location.')
  }
  /** @brief 由响应 identities 唯一确定的 Job 路径 / Job path uniquely determined by response identities. */
  const expectedPath = `/api/v2/workspaces/${workspaceId}/jobs/${jobId}`
  if (parsed.pathname !== expectedPath || parsed.search !== '' || parsed.hash !== '') {
    throw new ApiV2ContractError(
      'API v2 accepted Job Location does not identify the returned Workspace Job exactly.'
    )
  }
  return location
}

/**
 * @brief 解码 202 接受的权威 Workspace Job 与原子 HTTP 元数据 / Decode an authoritative accepted Workspace Job and its atomic HTTP metadata.
 * @param response 固定 202、ETag、Location 的 transport 响应 / Transport response fixed to 202, ETag, and Location.
 * @param expectedWorkspaceId command 授权路径中的 Workspace / Workspace in the command authorization path.
 * @return 严格 Job、强 ETag、Location 与 request ID / Strict Job, strong ETag, Location, and request ID.
 */
export function parseAcceptedWorkspaceJob(
  response: ApiV2AcceptedResourceResponse,
  expectedWorkspaceId: string
): AcceptedWorkspaceJobRepresentation {
  /** @brief 已验证的 command Workspace identity / Validated command Workspace identity. */
  const workspaceId = opaqueId(expectedWorkspaceId, 'request.workspace_id')
  /** @brief 已严格解码的 Job / Strictly decoded Job. */
  const value = parseJob(response.data)
  if (value.workspace_id !== workspaceId) {
    throw new ApiV2ContractError(
      'API v2 accepted a Job outside the Workspace used by the command path.'
    )
  }
  return {
    entityTag: strongEntityTag(response.metadata.entityTag, 'response.headers.ETag'),
    location: acceptedJobLocation(response.metadata.location, workspaceId, value.id),
    requestId: opaqueId(response.metadata.requestId, 'response.headers.X-Request-Id'),
    value
  }
}
