import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import {
  listWorkspaceArtifactPage,
  parseArtifactList,
  type ArtifactListPageRequest
} from './artifact-collection'

/** @brief canonical Artifact Workspace ID / Workspace ID of the canonical Artifact. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief 另一合法 Workspace ID / Another valid Workspace ID. */
const OTHER_WORKSPACE_ID = 'ws_01K0OTHER000000000000001'

/** @brief canonical Artifact subject ID / Subject ID of the canonical Artifact. */
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

describe('API v2 Artifact collection consumer', (): void => {
  it('strictly decodes one canonical Artifact cursor page', async (): Promise<void> => {
    /** @brief 含 canonical PDF Artifact 的第一页 / First page containing the canonical PDF Artifact. */
    const page = parseArtifactList({
      items: [await readCanonicalExample('resume_pdf_artifact')],
      page: { has_more: true, next_cursor: 'cursor_artifact_page_2_opaque' }
    })

    expect(page).toMatchObject({
      items: [{ kind: 'resume_pdf', media_type: 'application/pdf', workspace_id: WORKSPACE_ID }],
      page: { has_more: true, next_cursor: 'cursor_artifact_page_2_opaque' }
    })
  })

  it('rejects sparse items before Artifact mapping', (): void => {
    /** @brief 含一个空洞的非 JSON items 数组 / Non-JSON items array containing one hole. */
    const sparseItems = new Array<unknown>(1)

    expect(() =>
      parseArtifactList({
        items: sparseItems,
        page: { has_more: false, next_cursor: null }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('rejects unknown collection fields and inconsistent cursor metadata', async (): Promise<void> => {
    /** @brief canonical Artifact payload / Canonical Artifact payload. */
    const artifact = await readCanonicalExample('resume_pdf_artifact')

    expect(() =>
      parseArtifactList({
        items: [artifact],
        page: { has_more: false, next_cursor: null },
        total: 1
      })
    ).toThrow(ApiV2ContractError)
    expect(() =>
      parseArtifactList({
        items: [artifact],
        page: { has_more: true, next_cursor: null }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('rejects more than the schema maximum of 200 Artifacts', async (): Promise<void> => {
    /** @brief canonical Artifact payload / Canonical Artifact payload. */
    const artifact = await readCanonicalExample('resume_pdf_artifact')

    expect(() =>
      parseArtifactList({
        items: new Array<unknown>(201).fill(artifact),
        page: { has_more: false, next_cursor: null }
      })
    ).toThrow(ApiV2ContractError)
  })

  it('encodes canonical filters and keeps cursor opaque', async (): Promise<void> => {
    /** @brief ArtifactList 响应 / ArtifactList response. */
    const data = {
      items: [await readCanonicalExample('resume_pdf_artifact')],
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
      listWorkspaceArtifactPage(
        { getJson },
        {
          cursor: 'opaque_cursor_bound_to_artifact_filters',
          kind: 'resume_pdf',
          limit: 29,
          signal,
          subjectId: SUBJECT_ID,
          subjectType: 'resume',
          workspaceId: WORKSPACE_ID
        }
      )
    ).resolves.toMatchObject({ items: [{ kind: 'resume_pdf' }] })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/artifacts`, {
      expectedStatus: 200,
      maxResponseBytes: 16 * 1024 * 1024,
      query: {
        cursor: 'opaque_cursor_bound_to_artifact_filters',
        kind: 'resume_pdf',
        limit: 29,
        subject_id: SUBJECT_ID,
        subject_type: 'resume'
      },
      signal
    })
  })

  it('normalizes omitted filters without inventing total or ordering', async (): Promise<void> => {
    /** @brief 空 ArtifactList GET / Empty ArtifactList GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: { items: [], page: { has_more: false, next_cursor: null } },
      headers: new Headers(),
      status: 200
    })

    await listWorkspaceArtifactPage({ getJson }, { workspaceId: WORKSPACE_ID })

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

  it('rejects an Artifact from a different Workspace authority', async (): Promise<void> => {
    /** @brief 其他 Workspace 中自洽的 Artifact / Self-consistent Artifact in another Workspace. */
    const artifact = mutableRecord(await readCanonicalExample('resume_pdf_artifact'))
    artifact.workspace_id = OTHER_WORKSPACE_ID
    artifact.content_url = `https://api.hmalliances.org:8022/api/v2/workspaces/${OTHER_WORKSPACE_ID}/artifacts/artifact_01K0EXAMPLE000000001/content`
    /** @brief 返回跨 Workspace Artifact 的 GET / GET returning a cross-Workspace Artifact. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: { items: [artifact], page: { has_more: false, next_cursor: null } },
      headers: new Headers(),
      status: 200
    })

    await expect(
      listWorkspaceArtifactPage({ getJson }, { workspaceId: WORKSPACE_ID })
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    { cursor: '' },
    { kind: 'legacy_pdf' },
    { limit: 0 },
    { limit: 201 },
    { subjectId: 'short' },
    { subjectType: 'Resume' }
  ])('rejects an invalid filter before dispatch %#', async (override): Promise<void> => {
    /** @brief 不应被调用的 GET / GET that must not be called. */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    /** @brief 经过 runtime 反例构造的查询 / Query constructed as a runtime negative case. */
    const request = { workspaceId: WORKSPACE_ID, ...override } as ArtifactListPageRequest

    await expect(listWorkspaceArtifactPage({ getJson }, request)).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(getJson).not.toHaveBeenCalled()
  })
})
