/** @file API v2 Workspace Operations 运行时 ACL 测试 / API v2 Workspace Operations runtime ACL tests. */

import { describe, expect, it, vi } from 'vitest'

import {
  asUiOpaqueId,
  asUiWorkspaceOperationsPageLimit,
  createUiCommandId
} from '@ai-job-workspace/app/application'
import {
  ApiV2ContractError,
  type ApiV2HttpClient,
  type ApiV2JsonResponse,
  type ResumeJobCommandHttpClient,
  type ResumeOperationsHttpClient
} from '@ai-job-workspace/product-api-v2'

import {
  createApiV2ResumeGateway,
  createApiV2WorkspaceOperationsGateway,
  mapWorkspaceJob
} from './api-v2-gateways'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'ws_01K0OPERATIONS000000000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0OPERATIONS000000001'

/** @brief 测试 Job identity / Test Job identity. */
const JOB_ID = 'job_01K0OPERATIONS00000000001'

/** @brief 测试 Artifact identity / Test Artifact identity. */
const ARTIFACT_ID = 'artifact_01K0OPERATIONS0000001'

/** @brief 测试 PDF bytes / Test PDF bytes. */
const PDF_BYTES = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
)

/** @brief queued Resume Render Job wire fixture / Wire fixture for a queued Resume Render Job. */
const QUEUED_JOB = {
  created_at: '2026-07-23T00:00:00Z',
  finished_at: null,
  id: JOB_ID,
  kind: 'resume.render',
  problem: null,
  progress: { completed: 0, phase: 'queued', total: 2, unit: 'steps' },
  result_refs: [],
  revision: 1,
  started_at: null,
  status: 'queued',
  subject: { id: RESUME_ID, resource_type: 'resume', revision: 18 },
  updated_at: '2026-07-23T00:00:00Z',
  workspace_id: WORKSPACE_ID
} as const

/** @brief cancelled Resume Render Job wire fixture / Wire fixture for a cancelled Resume Render Job. */
const CANCELLED_JOB = {
  ...QUEUED_JOB,
  finished_at: '2026-07-23T00:00:02Z',
  progress: { completed: 0, phase: 'cancelled', total: 2, unit: 'steps' },
  revision: 2,
  status: 'cancelled',
  updated_at: '2026-07-23T00:00:02Z'
} as const

/** @brief Resume PDF Artifact wire fixture / Wire fixture for a Resume PDF Artifact. */
const PDF_ARTIFACT = {
  content_url: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
  created_at: '2026-07-23T00:00:03Z',
  expires_at: null,
  id: ARTIFACT_ID,
  kind: 'resume_pdf',
  media_type: 'application/pdf',
  page_count: 1,
  revision: 1,
  sha256: 'd7dd0115be8b79ae057b3f6ca0fcee578085ba6919dcb70e8643a2aff537d9b5',
  size_bytes: PDF_BYTES.byteLength,
  subject: { id: RESUME_ID, resource_type: 'resume', revision: 18 },
  updated_at: '2026-07-23T00:00:03Z',
  workspace_id: WORKSPACE_ID
} as const

/**
 * @brief 创建严格单项 JSON 响应 / Create a strict single-resource JSON response.
 * @param data 响应 JSON / Response JSON.
 * @param entityTag 强 ETag / Strong ETag.
 * @param requestId 服务端请求 ID / Server request ID.
 * @return API v2 JSON 响应 / API v2 JSON response.
 */
function resourceJson(data: unknown, entityTag: string, requestId: string): ApiV2JsonResponse {
  return {
    data,
    headers: new Headers({ ETag: entityTag, 'X-Request-Id': requestId }),
    status: 200
  }
}

describe('API v2 Workspace Operations ACL', (): void => {
  it('保留开放 Job kind 与失败 Problem 的完整安全结构', (): void => {
    /** @brief 失败 Job 的完整 wire fixture / Complete wire fixture for a failed Job. */
    const failed = {
      ...QUEUED_JOB,
      finished_at: '2026-07-23T00:00:04Z',
      kind: 'knowledge.reindex',
      problem: {
        code: 'knowledge.index_failed',
        detail: 'diagnostic detail',
        errors: [
          {
            code: 'field.invalid',
            message_key: 'knowledge.field.invalid',
            params: { attempt: 2 },
            pointer: '/source'
          }
        ],
        extensions: { 'com.example.trace': 'trace-1' },
        instance: '/problems/instance-1',
        request_id: 'request_problem_operations_001',
        retryable: true,
        status: 503,
        title: 'Index failed',
        type: 'https://api.hmalliances.org:8022/problems/knowledge/index-failed'
      },
      revision: 3,
      started_at: '2026-07-23T00:00:01Z',
      status: 'failed',
      updated_at: '2026-07-23T00:00:04Z'
    } as const

    expect(mapWorkspaceJob(failed)).toMatchObject({
      kind: 'knowledge.reindex',
      problem: {
        code: 'knowledge.index_failed',
        errors: [{ messageKey: 'knowledge.field.invalid', params: { attempt: 2 } }],
        requestId: 'request_problem_operations_001',
        retryable: true
      },
      status: 'failed'
    })
  })

  it('连接 Job/Artifact 单项、列表、取消与完整 Bearer content stream', async (): Promise<void> => {
    /** @brief JSON GET 调用观察 / JSON GET call observation. */
    const getJson = vi.fn((path: string): Promise<ApiV2JsonResponse> => {
      if (path === `/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`) {
        return Promise.resolve(resourceJson(QUEUED_JOB, '"job-etag-1"', 'request_job_read_0001'))
      }
      if (path === `/workspaces/${WORKSPACE_ID}/jobs`) {
        return Promise.resolve({
          data: { items: [QUEUED_JOB], page: { has_more: false, next_cursor: null } },
          headers: new Headers(),
          status: 200
        })
      }
      if (path === `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}`) {
        return Promise.resolve(
          resourceJson(PDF_ARTIFACT, '"artifact-metadata-etag-1"', 'request_artifact_read_0001')
        )
      }
      if (path === `/workspaces/${WORKSPACE_ID}/artifacts`) {
        return Promise.resolve({
          data: { items: [PDF_ARTIFACT], page: { has_more: false, next_cursor: null } },
          headers: new Headers(),
          status: 200
        })
      }
      return Promise.reject(new Error(`Unexpected API v2 GET path: ${path}`))
    })
    /** @brief Job cancellation 写调用观察 / Job-cancellation write-call observation. */
    const postEmpty = vi.fn(() =>
      Promise.resolve({
        data: CANCELLED_JOB,
        metadata: {
          entityTag: '"job-etag-2"',
          location: null,
          requestId: 'request_job_cancel_0001'
        },
        status: 200
      })
    )
    /** @brief 受保护 content GET 调用观察 / Protected-content GET call observation. */
    const getAuthenticatedContent = vi.fn(() =>
      Promise.resolve(
        new Response(PDF_BYTES.slice().buffer, {
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Disposition': 'inline',
            'Content-Length': String(PDF_BYTES.byteLength),
            'Content-Type': 'application/pdf',
            ETag: '"artifact-content-etag-1"',
            'X-Request-Id': 'request_artifact_content_0001'
          },
          status: 200
        })
      )
    )
    /** @brief 仅当前测试会调用的最小完整 client / Minimal complete client used only by this test. */
    const client = {
      getAuthenticatedContent,
      getJson,
      postEmpty
    } as unknown as ApiV2HttpClient
    /** @brief Workspace Operations 应用 ACL / Workspace Operations application ACL. */
    const gateway = createApiV2WorkspaceOperationsGateway(client)
    /** @brief 品牌化 Workspace identity / Branded Workspace identity. */
    const workspaceId = asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    /** @brief 品牌化 Job identity / Branded Job identity. */
    const jobId = asUiOpaqueId<'workspace-job'>(JOB_ID)
    /** @brief 品牌化 Artifact identity / Branded Artifact identity. */
    const artifactId = asUiOpaqueId<'workspace-artifact'>(ARTIFACT_ID)

    const job = await gateway.getJob({ jobId, workspaceId })
    const jobs = await gateway.listJobsPage({
      cursor: null,
      kind: 'resume.render',
      limit: asUiWorkspaceOperationsPageLimit(25),
      subjectId: RESUME_ID,
      subjectType: 'resume',
      workspaceId
    })
    const cancelled = await gateway.cancelJob({
      commandId: createUiCommandId(),
      concurrencyToken: job.concurrencyToken,
      jobId,
      workspaceId
    })
    const artifact = await gateway.getArtifact({ artifactId, workspaceId })
    const artifacts = await gateway.listArtifactsPage({
      cursor: null,
      kind: 'resume_pdf',
      limit: asUiWorkspaceOperationsPageLimit(25),
      subjectId: RESUME_ID,
      subjectType: 'resume',
      workspaceId
    })
    const content = await gateway.readArtifactContent({ artifact: artifact.artifact })
    /** @brief 为触发 EOF digest 校验而消费的完整 bytes / Complete bytes consumed to trigger the EOF digest check. */
    const consumed = new Uint8Array(await new Response(content.body).arrayBuffer())

    expect(job).toMatchObject({
      concurrencyToken: '"job-etag-1"',
      job: { id: JOB_ID, kind: 'resume.render', status: 'queued' },
      location: null,
      requestId: 'request_job_read_0001'
    })
    expect(jobs).toMatchObject({ hasMore: false, items: [{ id: JOB_ID }], nextCursor: null })
    expect(cancelled).toMatchObject({
      concurrencyToken: '"job-etag-2"',
      job: { status: 'cancelled' },
      requestId: 'request_job_cancel_0001'
    })
    expect(artifact.artifact).not.toHaveProperty('contentUrl')
    expect(artifact).toMatchObject({
      artifact: { id: ARTIFACT_ID, mediaType: 'application/pdf', sizeBytes: PDF_BYTES.byteLength },
      concurrencyToken: '"artifact-metadata-etag-1"'
    })
    expect(artifacts).toMatchObject({
      hasMore: false,
      items: [{ id: ARTIFACT_ID, kind: 'resume_pdf' }],
      nextCursor: null
    })
    expect(content).toMatchObject({
      acceptsByteRanges: true,
      byteLength: PDF_BYTES.byteLength,
      entityTag: '"artifact-content-etag-1"',
      mediaType: 'application/pdf'
    })
    expect(consumed).toEqual(PDF_BYTES)
    expect(postEmpty).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}/cancellations`,
      expect.objectContaining({ ifMatch: '"job-etag-1"', successKind: 'updated-resource' })
    )
    expect(getAuthenticatedContent).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      expect.objectContaining({ maxResponseBytes: PDF_BYTES.byteLength, range: null })
    )
  })

  it('拒绝 expected Artifact metadata 漂移且不打开受保护 content', async (): Promise<void> => {
    /** @brief metadata 读取序号 / Metadata-read ordinal. */
    let metadataReads = 0
    /** @brief 首次返回 expected 快照、随后返回漂移快照的 JSON GET / JSON GET returning the expected snapshot first and a drifted snapshot afterward. */
    const getJson = vi.fn((path: string): Promise<ApiV2JsonResponse> => {
      if (path !== `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}`) {
        return Promise.reject(new Error(`Unexpected API v2 GET path: ${path}`))
      }
      metadataReads += 1
      return Promise.resolve(
        resourceJson(
          metadataReads === 1
            ? PDF_ARTIFACT
            : {
                ...PDF_ARTIFACT,
                revision: 2,
                sha256: 'a'.repeat(64),
                updated_at: '2026-07-23T00:00:04Z'
              },
          `"artifact-metadata-etag-${metadataReads}"`,
          `request_artifact_read_000${metadataReads}`
        )
      )
    })
    /** @brief metadata 漂移后绝不能调用的受保护内容端口 / Protected-content port that must never run after metadata drift. */
    const getAuthenticatedContent = vi.fn(() =>
      Promise.reject(new Error('Protected Artifact content was opened after metadata drift.'))
    )
    /** @brief 本测试所需最小 API v2 client / Minimal API v2 client required by this test. */
    const client = { getAuthenticatedContent, getJson } as unknown as ApiV2HttpClient
    /** @brief Workspace Operations 应用 ACL / Workspace Operations application ACL. */
    const gateway = createApiV2WorkspaceOperationsGateway(client)
    /** @brief 品牌化 Workspace identity / Branded Workspace identity. */
    const workspaceId = asUiOpaqueId<'workspace'>(WORKSPACE_ID)
    /** @brief 品牌化 Artifact identity / Branded Artifact identity. */
    const artifactId = asUiOpaqueId<'workspace-artifact'>(ARTIFACT_ID)
    /** @brief 调用方持有的 expected metadata 快照 / Expected metadata snapshot held by the caller. */
    const expected = await gateway.getArtifact({ artifactId, workspaceId })

    await expect(
      gateway.readArtifactContent({ artifact: expected.artifact })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getJson).toHaveBeenCalledTimes(2)
    expect(getAuthenticatedContent).not.toHaveBeenCalled()
  })

  it('启动通用 Render payload 并对 202 Job kind/subject/revision 做后置校验', async (): Promise<void> => {
    /** @brief 被 Render command 观察的 payload / Render payload observed by the command port. */
    let observedBody: unknown
    /** @brief 接受 Resume Render Job 的写端口 / Write port accepting a Resume Render Job. */
    const renderClient: ResumeJobCommandHttpClient = {
      postJson(
        _path,
        body
      ): Promise<{
        readonly data: unknown
        readonly metadata: {
          readonly entityTag: string
          readonly location: string
          readonly requestId: string
        }
        readonly status: 202
      }> {
        observedBody = body
        return Promise.resolve({
          data: QUEUED_JOB,
          metadata: {
            entityTag: '"job-etag-1"',
            location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
            requestId: 'request_render_accept_0001'
          },
          status: 202
        })
      }
    }
    /** @brief 本测试不会触发的 Resume operations 端口 / Resume-operations port not invoked by this test. */
    const operationsClient: ResumeOperationsHttpClient = {
      postJson: (): Promise<never> => Promise.reject(new Error('Unexpected Resume operation.'))
    }
    /** @brief Resume 应用 ACL / Resume application ACL. */
    const gateway = createApiV2ResumeGateway(
      { getJson: (): Promise<never> => Promise.reject(new Error('Unexpected Resume read.')) },
      operationsClient,
      renderClient
    )

    await expect(
      gateway.startResumeRender({
        commandId: createUiCommandId(),
        formats: ['pdf', 'json'],
        mode: 'export',
        resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
        resumeRevision: 18,
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).resolves.toMatchObject({
      concurrencyToken: '"job-etag-1"',
      job: { kind: 'resume.render', status: 'queued' },
      requestId: 'request_render_accept_0001'
    })
    expect(observedBody).toEqual({
      formats: ['pdf', 'json'],
      mode: 'export',
      resume_revision: 18
    })

    /** @brief 返回错误开放 kind 的已确认 202 写端口 / Acknowledged 202 write port returning the wrong open kind. */
    const wrongKindClient: ResumeJobCommandHttpClient = {
      postJson: () =>
        Promise.resolve({
          data: { ...QUEUED_JOB, kind: 'resume.restore' },
          metadata: {
            entityTag: '"job-etag-1"',
            location: `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/jobs/${JOB_ID}`,
            requestId: 'request_render_wrong_kind_0001'
          },
          status: 202
        })
    }
    /** @brief 使用错误 kind 端口的 Resume ACL / Resume ACL using the wrong-kind port. */
    const wrongKindGateway = createApiV2ResumeGateway(
      { getJson: (): Promise<never> => Promise.reject(new Error('Unexpected Resume read.')) },
      operationsClient,
      wrongKindClient
    )

    await expect(
      wrongKindGateway.startResumeRender({
        commandId: createUiCommandId(),
        formats: ['pdf'],
        mode: 'preview',
        resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
        resumeRevision: 18,
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).rejects.toMatchObject({
      kind: 'contract',
      name: 'ApiV2WriteOutcomeUnknownError',
      requestId: 'request_render_wrong_kind_0001',
      status: 202
    })
  })

  it('在 dispatch 前拒绝重复 Render formats', async (): Promise<void> => {
    /** @brief 不应被重复格式请求调用的 Job 端口 / Job port that a duplicate-format request must not call. */
    const postJson = vi.fn(() => Promise.reject(new Error('Duplicate formats were dispatched.')))
    /** @brief Resume ACL / Resume ACL. */
    const gateway = createApiV2ResumeGateway(
      { getJson: (): Promise<never> => Promise.reject(new Error('Unexpected Resume read.')) },
      {
        postJson: (): Promise<never> => Promise.reject(new Error('Unexpected Resume operation.'))
      },
      { postJson }
    )

    await expect(
      gateway.startResumeRender({
        commandId: createUiCommandId(),
        formats: ['pdf', 'pdf'],
        mode: 'preview',
        resumeId: asUiOpaqueId<'resume'>(RESUME_ID),
        resumeRevision: 18,
        workspaceId: asUiOpaqueId<'workspace'>(WORKSPACE_ID)
      })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(postJson).not.toHaveBeenCalled()
  })
})
