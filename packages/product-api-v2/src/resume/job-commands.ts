/** @file API v2 Resume import、restore 与 render Job commands / API v2 Resume import, restore, and render Job commands. */

import type { ApiV2AcceptedResourceResponse, ApiV2PostJsonOptions } from '../http/client'
import {
  boundedInteger,
  boundedString,
  exactRecord,
  idempotencyKey,
  locale,
  opaqueId,
  strongEntityTag
} from '../http/contract'
import { ApiV2ContractError } from '../http/errors'
import {
  parseAcceptedWorkspaceJob,
  type AcceptedWorkspaceJobRepresentation
} from '../jobs/accepted-job'
import { JOB_MAX_RESPONSE_BYTES } from '../jobs/job'
import { parseTemplateRef, type TemplateRef } from './template'
import { arrayBetween, assertUniqueStrings, enumValue } from './wire-decoding'

/** @brief Resume import Job 请求上限 / Resume import Job request ceiling. */
const RESUME_IMPORT_JOB_MAX_REQUEST_BYTES = 64 * 1024

/** @brief Resume restore Job 请求上限 / Resume restore Job request ceiling. */
const RESUME_RESTORE_JOB_MAX_REQUEST_BYTES = 4 * 1024

/** @brief Resume render Job 请求上限 / Resume render Job request ceiling. */
const RESUME_RENDER_JOB_MAX_REQUEST_BYTES = 4 * 1024

/** @brief Resume render 意图 / Resume render intent. */
export type ResumeRenderMode = 'export' | 'final' | 'preview'

/** @brief Resume render 可请求的产物格式 / Artifact formats requestable from a Resume render. */
export type ResumeRenderFormat = 'docx' | 'json' | 'pdf'

/** @brief 创建 Resume import Job 的严格 payload / Strict payload for creating a Resume import Job. */
export interface CreateResumeImportJobRequest {
  /** @brief 已完成的上传会话 identity / Completed upload-session identity. */
  readonly upload_session_id: string
  /** @brief 新 Resume 标题 / New Resume title. */
  readonly title: string
  /** @brief 新 Resume 内容 Locale / New Resume content Locale. */
  readonly locale: string
  /** @brief 固定的不可变模板版本 / Pinned immutable Template version. */
  readonly template: TemplateRef
}

/** @brief 创建 Resume restore Job 的严格 payload / Strict payload for creating a Resume restore Job. */
export interface CreateResumeRestoreJobRequest {
  /** @brief 要恢复的不可变历史 revision / Immutable historical revision to restore. */
  readonly source_revision: number
}

/** @brief 创建 Resume render Job 的严格 payload / Strict payload for creating a Resume render Job. */
export interface CreateResumeRenderJobRequest {
  /** @brief 要渲染的精确 Resume revision / Exact Resume revision to render. */
  readonly resume_revision: number
  /** @brief preview、final 或 export 意图 / Preview, final, or export intent. */
  readonly mode: ResumeRenderMode
  /** @brief 至少一种且不重复的产物格式 / At least one unique artifact format. */
  readonly formats: readonly ResumeRenderFormat[]
}

/** @brief Resume Job 创建端点所需的最小 202 HTTP 能力 / Minimal 202 HTTP capability required by Resume Job creation endpoints. */
export interface ResumeJobCommandHttpClient {
  /**
   * @brief 提交固定 accepted-resource 语义的 JSON command / Submit a JSON command fixed to accepted-resource semantics.
   * @param path 相对 Product API path / Relative Product API path.
   * @param body 已严格编码的 command / Strictly encoded command.
   * @param options 幂等、可选并发、大小与取消策略 / Idempotency, optional concurrency, size, and cancellation policy.
   * @return 带强 ETag 与 Location 的 202 Job / 202 Job carrying a strong ETag and Location.
   */
  readonly postJson: (
    path: string,
    body: unknown,
    options: ApiV2PostJsonOptions<'accepted-resource'>
  ) => Promise<ApiV2AcceptedResourceResponse>
}

/** @brief 创建 Resume import Job 的 command / Command for creating a Resume import Job. */
export interface CreateWorkspaceResumeImportJobCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 同一导入意图内稳定的幂等键 / Idempotency key stable within one import intent. */
  readonly idempotencyKey: string
  /** @brief 严格 import payload / Strict import payload. */
  readonly request: CreateResumeImportJobRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 创建 Resume restore Job 的 command / Command for creating a Resume restore Job. */
export interface CreateWorkspaceResumeRestoreJobCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 要恢复的 Resume identity / Resume identity to restore. */
  readonly resumeId: string
  /** @brief 同一恢复意图内稳定的幂等键 / Idempotency key stable within one restore intent. */
  readonly idempotencyKey: string
  /** @brief 当前 Resume 表示的强并发校验器 / Strong concurrency validator of the current Resume representation. */
  readonly ifMatch: string
  /** @brief 严格 restore payload / Strict restore payload. */
  readonly request: CreateResumeRestoreJobRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/** @brief 创建 Resume render Job 的 command / Command for creating a Resume render Job. */
export interface CreateWorkspaceResumeRenderJobCommand {
  /** @brief 显式授权 Workspace / Explicit authorization Workspace. */
  readonly workspaceId: string
  /** @brief 要渲染的 Resume identity / Resume identity to render. */
  readonly resumeId: string
  /** @brief 同一渲染意图内稳定的幂等键 / Idempotency key stable within one render intent. */
  readonly idempotencyKey: string
  /** @brief 严格 render payload / Strict render payload. */
  readonly request: CreateResumeRenderJobRequest
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  readonly signal?: AbortSignal
}

/**
 * @brief 严格编码 Resume import Job payload / Strictly encode a Resume import Job payload.
 * @param value 未验证 payload / Unvalidated payload.
 * @return 与发布 Schema 精确一致的新值 / New value matching the published Schema exactly.
 */
export function encodeCreateResumeImportJobRequest(
  value: CreateResumeImportJobRequest
): CreateResumeImportJobRequest {
  /** @brief 精确 payload 对象 / Exact payload object. */
  const input = exactRecord(value, 'resume_import_job_request', [
    'upload_session_id',
    'title',
    'locale',
    'template'
  ])
  return {
    locale: locale(input.locale, 'resume_import_job_request.locale'),
    template: parseTemplateRef(input.template, 'resume_import_job_request.template'),
    title: boundedString(input.title, 'resume_import_job_request.title', 1, 300),
    upload_session_id: opaqueId(
      input.upload_session_id,
      'resume_import_job_request.upload_session_id'
    )
  }
}

/**
 * @brief 严格编码 Resume restore Job payload / Strictly encode a Resume restore Job payload.
 * @param value 未验证 payload / Unvalidated payload.
 * @return 与发布 Schema 精确一致的新值 / New value matching the published Schema exactly.
 */
export function encodeCreateResumeRestoreJobRequest(
  value: CreateResumeRestoreJobRequest
): CreateResumeRestoreJobRequest {
  /** @brief 精确 payload 对象 / Exact payload object. */
  const input = exactRecord(value, 'resume_restore_job_request', ['source_revision'])
  return {
    source_revision: boundedInteger(
      input.source_revision,
      'resume_restore_job_request.source_revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

/**
 * @brief 严格编码 Resume render Job payload / Strictly encode a Resume render Job payload.
 * @param value 未验证 payload / Unvalidated payload.
 * @return 与发布 Schema 精确一致且格式唯一的新值 / New Schema-exact value with unique formats.
 */
export function encodeCreateResumeRenderJobRequest(
  value: CreateResumeRenderJobRequest
): CreateResumeRenderJobRequest {
  /** @brief 精确 payload 对象 / Exact payload object. */
  const input = exactRecord(value, 'resume_render_job_request', [
    'resume_revision',
    'mode',
    'formats'
  ])
  /** @brief 已验证的产物格式 / Validated artifact formats. */
  const formats = arrayBetween(input.formats, 'resume_render_job_request.formats', 1, 3).map(
    (format, index) =>
      enumValue(format, `resume_render_job_request.formats[${index}]`, ['pdf', 'json', 'docx'])
  )
  assertUniqueStrings(formats, 'resume_render_job_request.formats')
  return {
    formats,
    mode: enumValue(input.mode, 'resume_render_job_request.mode', ['preview', 'final', 'export']),
    resume_revision: boundedInteger(
      input.resume_revision,
      'resume_render_job_request.resume_revision',
      1,
      Number.MAX_SAFE_INTEGER
    )
  }
}

/**
 * @brief 校验 Resume Job 的 subject identity / Validate the subject identity of a Resume Job.
 * @param representation 已接受的 Job 表示 / Accepted Job representation.
 * @param expectedId command 指向的 subject identity / Subject identity targeted by the command.
 * @param expectedRevision 可选的精确 subject revision / Optional exact subject revision.
 */
function assertResumeJobSubject(
  representation: AcceptedWorkspaceJobRepresentation,
  expectedId: string,
  expectedRevision?: number
): void {
  if (representation.value.subject.id !== expectedId) {
    throw new ApiV2ContractError(
      'API v2 accepted a Resume Job for a subject different from the submitted command.'
    )
  }
  if (
    expectedRevision !== undefined &&
    representation.value.subject.revision !== expectedRevision
  ) {
    throw new ApiV2ContractError(
      'API v2 accepted a Resume render Job for a different Resume revision.'
    )
  }
}

/**
 * @brief 创建一个 Workspace-scoped Resume import Job / Create one Workspace-scoped Resume import Job.
 * @param client 固定 202 的 Resume Job 写端口 / Resume Job write port fixed to 202.
 * @param command Workspace、payload、幂等键与取消信号 / Workspace, payload, idempotency key, and cancellation signal.
 * @return 可继续读取或取消的权威 Job / Authoritative Job that can subsequently be read or cancelled.
 */
export async function createWorkspaceResumeImportJob(
  client: ResumeJobCommandHttpClient,
  command: CreateWorkspaceResumeImportJobCommand
): Promise<AcceptedWorkspaceJobRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已严格编码的 import payload / Strictly encoded import payload. */
  const request = encodeCreateResumeImportJobRequest(command.request)
  /** @brief 已验证幂等键 / Validated idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 202 的 transport 响应 / Transport response fixed to 202. */
  const response = await client.postJson(`/workspaces/${workspaceId}/resume-import-jobs`, request, {
    idempotencyKey: validatedIdempotencyKey,
    maxRequestBytes: RESUME_IMPORT_JOB_MAX_REQUEST_BYTES,
    maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
    ...(signal === undefined ? {} : { signal }),
    successKind: 'accepted-resource'
  })
  /** @brief 已接受的权威 Job / Authoritative accepted Job. */
  return parseAcceptedWorkspaceJob(response, workspaceId)
}

/**
 * @brief 创建一个并发安全的 Resume restore Job / Create one concurrency-safe Resume restore Job.
 * @param client 固定 202 的 Resume Job 写端口 / Resume Job write port fixed to 202.
 * @param command Workspace、Resume、source revision 与前置条件 / Workspace, Resume, source revision, and precondition.
 * @return 可继续读取或取消的权威 Job / Authoritative Job that can subsequently be read or cancelled.
 */
export async function createWorkspaceResumeRestoreJob(
  client: ResumeJobCommandHttpClient,
  command: CreateWorkspaceResumeRestoreJobCommand
): Promise<AcceptedWorkspaceJobRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(command.resumeId, 'request.resume_id')
  /** @brief 已严格编码的 restore payload / Strictly encoded restore payload. */
  const request = encodeCreateResumeRestoreJobRequest(command.request)
  /** @brief 已验证幂等键 / Validated idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 已验证强并发前置条件 / Validated strong concurrency precondition. */
  const ifMatch = strongEntityTag(command.ifMatch, 'request.if_match')
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 202 的 transport 响应 / Transport response fixed to 202. */
  const response = await client.postJson(
    `/workspaces/${workspaceId}/resumes/${resumeId}/restore-jobs`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      ifMatch,
      maxRequestBytes: RESUME_RESTORE_JOB_MAX_REQUEST_BYTES,
      maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'accepted-resource'
    }
  )
  /** @brief 已接受的权威 Job / Authoritative accepted Job. */
  const representation = parseAcceptedWorkspaceJob(response, workspaceId)
  assertResumeJobSubject(representation, resumeId)
  return representation
}

/**
 * @brief 创建一个精确 revision 的 Resume render Job / Create one Resume render Job for an exact revision.
 * @param client 固定 202 的 Resume Job 写端口 / Resume Job write port fixed to 202.
 * @param command Workspace、Resume、render payload 与幂等键 / Workspace, Resume, render payload, and idempotency key.
 * @return 可继续读取或取消的权威 Job / Authoritative Job that can subsequently be read or cancelled.
 */
export async function createWorkspaceResumeRenderJob(
  client: ResumeJobCommandHttpClient,
  command: CreateWorkspaceResumeRenderJobCommand
): Promise<AcceptedWorkspaceJobRepresentation> {
  /** @brief 已验证 Workspace identity / Validated Workspace identity. */
  const workspaceId = opaqueId(command.workspaceId, 'request.workspace_id')
  /** @brief 已验证 Resume identity / Validated Resume identity. */
  const resumeId = opaqueId(command.resumeId, 'request.resume_id')
  /** @brief 已严格编码的 render payload / Strictly encoded render payload. */
  const request = encodeCreateResumeRenderJobRequest(command.request)
  /** @brief 已验证幂等键 / Validated idempotency key. */
  const validatedIdempotencyKey = idempotencyKey(command.idempotencyKey)
  /** @brief 调用方取消信号 / Caller cancellation signal. */
  const signal = command.signal
  signal?.throwIfAborted()
  /** @brief 固定 202 的 transport 响应 / Transport response fixed to 202. */
  const response = await client.postJson(
    `/workspaces/${workspaceId}/resumes/${resumeId}/render-jobs`,
    request,
    {
      idempotencyKey: validatedIdempotencyKey,
      maxRequestBytes: RESUME_RENDER_JOB_MAX_REQUEST_BYTES,
      maxResponseBytes: JOB_MAX_RESPONSE_BYTES,
      ...(signal === undefined ? {} : { signal }),
      successKind: 'accepted-resource'
    }
  )
  /** @brief 已接受的权威 Job / Authoritative accepted Job. */
  const representation = parseAcceptedWorkspaceJob(response, workspaceId)
  assertResumeJobSubject(representation, resumeId, request.resume_revision)
  return representation
}
