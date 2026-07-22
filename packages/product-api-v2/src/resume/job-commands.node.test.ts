import { describe, expect, it, vi } from 'vitest'

import type { ApiV2AcceptedResourceResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import {
  createWorkspaceResumeImportJob,
  createWorkspaceResumeRenderJob,
  createWorkspaceResumeRestoreJob,
  encodeCreateResumeImportJobRequest,
  encodeCreateResumeRenderJobRequest,
  encodeCreateResumeRestoreJobRequest,
  type ResumeJobCommandHttpClient
} from './job-commands'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'workspace_01K0RESUMEJOBS000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0RESUMEJOBS000000001'

/** @brief 测试 UploadSession identity / Test UploadSession identity. */
const UPLOAD_SESSION_ID = 'upload_01K0RESUMEJOBS00000001'

/** @brief 测试 Job identity / Test Job identity. */
const JOB_ID = 'job_01K0RESUMEJOBS00000000001'

/** @brief 测试 Template identity / Test Template identity. */
const TEMPLATE_ID = 'template_01K0RESUMEJOBS000001'

/** @brief 测试幂等键 / Test idempotency key. */
const IDEMPOTENCY_KEY = 'resume-job-intent-01K0TEST'

/** @brief 测试 Job 强 ETag / Test strong Job ETag. */
const JOB_ETAG = '"job-revision-1"'

/** @brief 测试 request ID / Test request ID. */
const REQUEST_ID = 'request_resume_job_000000001'

/**
 * @brief 构造一个 queued Job / Build one queued Job.
 * @param subjectId Job subject identity / Job subject identity.
 * @param subjectRevision 可选 subject revision / Optional subject revision.
 * @param overrides 顶层覆盖字段 / Top-level override fields.
 * @return 满足 API v2 状态不变量的 Job JSON / Job JSON satisfying API v2 lifecycle invariants.
 */
function queuedJob(
  subjectId: string,
  subjectRevision?: number,
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    created_at: '2026-07-23T01:00:00Z',
    finished_at: null,
    id: JOB_ID,
    kind: 'resume.render',
    problem: null,
    progress: null,
    result_refs: [],
    revision: 1,
    started_at: null,
    status: 'queued',
    subject: {
      id: subjectId,
      resource_type: subjectId === UPLOAD_SESSION_ID ? 'upload_session' : 'resume',
      ...(subjectRevision === undefined ? {} : { revision: subjectRevision })
    },
    updated_at: '2026-07-23T01:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造固定 202 Job 响应 / Build a fixed 202 Job response.
 * @param data 响应 Job body / Response Job body.
 * @param location 可选 Location / Optional Location.
 * @return 带原子 Job metadata 的响应 / Response carrying atomic Job metadata.
 */
function acceptedResponse(
  data: unknown,
  location = `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`
): ApiV2AcceptedResourceResponse {
  return {
    data,
    metadata: { entityTag: JOB_ETAG, location, requestId: REQUEST_ID },
    status: 202
  }
}

/**
 * @brief 构造可观察的 Resume Job command client / Build an observable Resume Job command client.
 * @param response 固定 202 响应 / Fixed 202 response.
 * @return 仅实现 postJson 的结构端口 / Structural port implementing only postJson.
 */
function jobClient(response: ApiV2AcceptedResourceResponse): ResumeJobCommandHttpClient {
  return {
    postJson: vi.fn<ResumeJobCommandHttpClient['postJson']>().mockResolvedValue(response)
  }
}

describe('API v2 Resume Job commands', (): void => {
  it('strictly encodes import, restore, and render payloads', (): void => {
    expect(
      encodeCreateResumeImportJobRequest({
        locale: 'zh-CN',
        template: { template_id: TEMPLATE_ID, version: '2.0.0' },
        title: 'Klee Resume',
        upload_session_id: UPLOAD_SESSION_ID
      })
    ).toEqual({
      locale: 'zh-CN',
      template: { template_id: TEMPLATE_ID, version: '2.0.0' },
      title: 'Klee Resume',
      upload_session_id: UPLOAD_SESSION_ID
    })
    expect(encodeCreateResumeRestoreJobRequest({ source_revision: 4 })).toEqual({
      source_revision: 4
    })
    expect(
      encodeCreateResumeRenderJobRequest({
        formats: ['pdf', 'docx'],
        mode: 'export',
        resume_revision: 7
      })
    ).toEqual({ formats: ['pdf', 'docx'], mode: 'export', resume_revision: 7 })
  })

  it('rejects schema drift, duplicate formats, and invalid revisions', (): void => {
    expect(() =>
      encodeCreateResumeImportJobRequest({
        legacy_file_id: UPLOAD_SESSION_ID,
        locale: 'zh-CN',
        template: { template_id: TEMPLATE_ID, version: '2.0.0' },
        title: 'Klee Resume',
        upload_session_id: UPLOAD_SESSION_ID
      } as never)
    ).toThrow(ApiV2ContractError)
    expect(() =>
      encodeCreateResumeRenderJobRequest({
        formats: ['pdf', 'pdf'],
        mode: 'preview',
        resume_revision: 7
      })
    ).toThrow(/unique/u)
    expect(() => encodeCreateResumeRestoreJobRequest({ source_revision: 0 })).toThrow(
      ApiV2ContractError
    )
  })

  it('creates an import Job under the explicit Workspace without inventing an open subject type', async (): Promise<void> => {
    /** @brief 返回 import Job 的结构 client / Structural client returning an import Job. */
    const client = jobClient(acceptedResponse(queuedJob(UPLOAD_SESSION_ID)))
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const controller = new AbortController()

    await expect(
      createWorkspaceResumeImportJob(client, {
        idempotencyKey: IDEMPOTENCY_KEY,
        request: {
          locale: 'zh-CN',
          template: { template_id: TEMPLATE_ID, version: '2.0.0' },
          title: 'Klee Resume',
          upload_session_id: UPLOAD_SESSION_ID
        },
        signal: controller.signal,
        workspaceId: WORKSPACE_ID
      })
    ).resolves.toMatchObject({
      entityTag: JOB_ETAG,
      location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
      requestId: REQUEST_ID,
      value: { id: JOB_ID, workspace_id: WORKSPACE_ID }
    })
    expect(client.postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resume-import-jobs`,
      {
        locale: 'zh-CN',
        template: { template_id: TEMPLATE_ID, version: '2.0.0' },
        title: 'Klee Resume',
        upload_session_id: UPLOAD_SESSION_ID
      },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        maxRequestBytes: 64 * 1024,
        maxResponseBytes: 512 * 1024,
        signal: controller.signal,
        successKind: 'accepted-resource'
      }
    )
  })

  it('creates a restore Job with a strong If-Match precondition', async (): Promise<void> => {
    /** @brief 返回 restore Job 的结构 client / Structural client returning a restore Job. */
    const client = jobClient(acceptedResponse(queuedJob(RESUME_ID, 7)))

    await createWorkspaceResumeRestoreJob(client, {
      idempotencyKey: IDEMPOTENCY_KEY,
      ifMatch: '"resume-revision-7"',
      request: { source_revision: 4 },
      resumeId: RESUME_ID,
      workspaceId: WORKSPACE_ID
    })

    expect(client.postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/restore-jobs`,
      { source_revision: 4 },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: '"resume-revision-7"',
        maxRequestBytes: 4 * 1024,
        maxResponseBytes: 512 * 1024,
        successKind: 'accepted-resource'
      }
    )
  })

  it('creates a render Job for an exact Resume revision without an If-Match', async (): Promise<void> => {
    /** @brief 返回 render Job 的结构 client / Structural client returning a render Job. */
    const client = jobClient(acceptedResponse(queuedJob(RESUME_ID, 7)))

    await createWorkspaceResumeRenderJob(client, {
      idempotencyKey: IDEMPOTENCY_KEY,
      request: { formats: ['pdf'], mode: 'preview', resume_revision: 7 },
      resumeId: RESUME_ID,
      workspaceId: WORKSPACE_ID
    })

    expect(client.postJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/render-jobs`,
      { formats: ['pdf'], mode: 'preview', resume_revision: 7 },
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        maxRequestBytes: 4 * 1024,
        maxResponseBytes: 512 * 1024,
        successKind: 'accepted-resource'
      }
    )
  })

  it('rejects invalid command headers before dispatch', async (): Promise<void> => {
    /** @brief 不应被调用的结构 client / Structural client that must not be called. */
    const client = jobClient(acceptedResponse(queuedJob(RESUME_ID, 7)))

    await expect(
      createWorkspaceResumeRenderJob(client, {
        idempotencyKey: 'short',
        request: { formats: ['pdf'], mode: 'preview', resume_revision: 7 },
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toThrow(/Idempotency-Key/u)
    await expect(
      createWorkspaceResumeRestoreJob(client, {
        idempotencyKey: IDEMPOTENCY_KEY,
        ifMatch: 'W/"resume-revision-7"',
        request: { source_revision: 4 },
        resumeId: RESUME_ID,
        workspaceId: WORKSPACE_ID
      })
    ).rejects.toThrow(/strong ETag/u)
    expect(client.postJson).not.toHaveBeenCalled()
  })

  it('rejects cross-Workspace, cross-subject, cross-revision, and mismatched Location responses', async (): Promise<void> => {
    /** @brief 公共 render command / Shared render command. */
    const command = {
      idempotencyKey: IDEMPOTENCY_KEY,
      request: { formats: ['pdf'] as const, mode: 'preview' as const, resume_revision: 7 },
      resumeId: RESUME_ID,
      workspaceId: WORKSPACE_ID
    }

    await expect(
      createWorkspaceResumeRenderJob(
        jobClient(
          acceptedResponse(
            queuedJob(RESUME_ID, 7, { workspace_id: 'workspace_01K0OTHER0000000001' })
          )
        ),
        command
      )
    ).rejects.toThrow(/outside the Workspace/u)
    await expect(
      createWorkspaceResumeRenderJob(
        jobClient(acceptedResponse(queuedJob('resume_01K0OTHER0000000000001', 7))),
        command
      )
    ).rejects.toThrow(/subject different/u)
    await expect(
      createWorkspaceResumeRenderJob(jobClient(acceptedResponse(queuedJob(RESUME_ID, 8))), command)
    ).rejects.toThrow(/different Resume revision/u)
    await expect(
      createWorkspaceResumeRenderJob(
        jobClient(
          acceptedResponse(
            queuedJob(RESUME_ID, 7),
            `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/job_01K0OTHER0000000000001`
          )
        ),
        command
      )
    ).rejects.toThrow(/Location/u)
  })
})
