import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { listWorkspaceJobPage, parseJobList, type JobListPageRequest } from './job-collection'

/** @brief canonical Job Workspace ID / Workspace ID of the canonical Job. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief 另一合法 Workspace ID / Another valid Workspace ID. */
const OTHER_WORKSPACE_ID = 'ws_01K0OTHER000000000000001'

/** @brief canonical Job subject ID / Subject ID of the canonical Job. */
const SUBJECT_ID = 'resume_01K0EXAMPLE0000000001'

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

describe('API v2 Job collection consumer', (): void => {
  it('strictly decodes one canonical Job cursor page', async (): Promise<void> => {
    /** @brief 含 canonical running Job 的第一页 / First page containing the canonical running Job. */
    const page = parseJobList({
      items: [await readCanonicalExample('running_render_job')],
      page: { has_more: true, next_cursor: 'cursor_job_page_2_opaque' }
    })

    expect(page).toMatchObject({
      items: [{ kind: 'resume.render', status: 'running', workspace_id: WORKSPACE_ID }],
      page: { has_more: true, next_cursor: 'cursor_job_page_2_opaque' }
    })
  })

  it('rejects unknown collection fields and inconsistent cursor metadata', async (): Promise<void> => {
    /** @brief canonical Job payload / Canonical Job payload. */
    const job = await readCanonicalExample('running_render_job')

    expect(() =>
      parseJobList({
        items: [job],
        page: { has_more: false, next_cursor: null },
        total: 1
      })
    ).toThrow(ApiV2ContractError)
    expect(() =>
      parseJobList({
        items: [job],
        page: { has_more: false, next_cursor: 'must-be-null' }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('rejects more than the schema maximum of 200 Jobs', async (): Promise<void> => {
    /** @brief canonical Job payload / Canonical Job payload. */
    const job = await readCanonicalExample('running_render_job')

    expect(() =>
      parseJobList({
        items: new Array<unknown>(201).fill(job),
        page: { has_more: false, next_cursor: null }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('encodes canonical filters and keeps cursor opaque', async (): Promise<void> => {
    /** @brief JobList 响应 / JobList response. */
    const data = {
      items: [await readCanonicalExample('running_render_job')],
      page: { has_more: false, next_cursor: null }
    }
    /** @brief 可观测 v2 GET / Observable v2 GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data,
      headers: new Headers(),
      status: 200
    })
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const signal = new AbortController().signal

    await expect(
      listWorkspaceJobPage(
        { getJson },
        {
          cursor: 'opaque_cursor_bound_to_filters',
          kind: 'resume.render',
          limit: 37,
          signal,
          subjectId: SUBJECT_ID,
          subjectType: 'resume',
          workspaceId: WORKSPACE_ID
        }
      )
    ).resolves.toMatchObject({ items: [{ status: 'running' }] })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/jobs`, {
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      query: {
        cursor: 'opaque_cursor_bound_to_filters',
        kind: 'resume.render',
        limit: 37,
        subject_id: SUBJECT_ID,
        subject_type: 'resume'
      },
      signal
    })
  })

  it('normalizes omitted pagination and filters without inventing a total', async (): Promise<void> => {
    /** @brief 空 JobList GET / Empty JobList GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: { items: [], page: { has_more: false, next_cursor: null } },
      headers: new Headers(),
      status: 200
    })

    await listWorkspaceJobPage({ getJson }, { workspaceId: WORKSPACE_ID })

    expect(getJson).toHaveBeenCalledWith(expect.any(String), {
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      query: {
        cursor: null,
        kind: null,
        limit: 50,
        subject_id: null,
        subject_type: null
      }
    })
  })

  it('rejects a Job from a different Workspace authority', async (): Promise<void> => {
    /** @brief 声称属于其他 Workspace 的 Job / Job claiming another Workspace. */
    const job = mutableRecord(await readCanonicalExample('running_render_job'))
    job.workspace_id = OTHER_WORKSPACE_ID
    /** @brief 返回跨 Workspace Job 的 GET / GET returning a cross-Workspace Job. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: { items: [job], page: { has_more: false, next_cursor: null } },
      headers: new Headers(),
      status: 200
    })

    await expect(
      listWorkspaceJobPage({ getJson }, { workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    { cursor: '' },
    { kind: 'Resume.Render' },
    { limit: 0 },
    { limit: 201 },
    { subjectId: 'short' },
    { subjectType: 'Resume' }
  ])('rejects an invalid filter before dispatch %#', async (override): Promise<void> => {
    /** @brief 不应被调用的 GET / GET that must not be called. */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    /** @brief 合并的非法查询 / Merged invalid query. */
    const request: JobListPageRequest = { workspaceId: WORKSPACE_ID, ...override }

    await expect(listWorkspaceJobPage({ getJson }, request)).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(getJson).not.toHaveBeenCalled()
  })
})
