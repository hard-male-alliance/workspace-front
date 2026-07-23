import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client, ApiV2JsonResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import {
  getWorkspaceResumeRevision,
  listWorkspaceResumeRevisionPage,
  parseResumeRevision,
  parseResumeRevisionList
} from './revision-history'

/** @brief 测试 Workspace identity / Test Workspace identity. */
const WORKSPACE_ID = 'workspace_01K0HISTORY00000001'

/** @brief 测试 Resume identity / Test Resume identity. */
const RESUME_ID = 'resume_01K0HISTORY00000000001'

/** @brief 另一个 Resume identity / Another Resume identity. */
const OTHER_RESUME_ID = 'resume_01K0OTHER0000000000001'

/** @brief 测试 Template identity / Test Template identity. */
const TEMPLATE_ID = 'template_01K0HISTORY0000001'

/** @brief 测试 revision / Test revision. */
const REVISION = 37

/**
 * @brief 构造合法历史 ResumeDocument / Build a valid historical ResumeDocument.
 * @param overrides 当前用例覆盖的顶层字段 / Top-level fields overridden by the current case.
 * @return 完整且无损的 SIR JSON / Complete lossless SIR JSON.
 */
function resumeDocument(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  /** @brief 测试 measurement / Test measurement. */
  const measurement = { unit: 'mm', value: 12 }
  /** @brief 测试 color / Test color. */
  const color = { space: 'srgb_hex', value: '#112233' }
  return {
    created_at: '2026-07-20T10:00:00Z',
    id: RESUME_ID,
    knowledge_source_id: null,
    locale: 'zh-CN',
    profile: {
      contacts: [
        {
          id: 'contact_01K0HISTORY000000001',
          kind: 'website',
          label: '作品集',
          url: 'https://klee.example/',
          value: 'klee.example'
        }
      ],
      full_name: 'Klee',
      headline: 'Computer Scientist',
      summary: { marks: [], text: 'Historical authority' }
    },
    revision: REVISION,
    sections: [],
    style: {
      bullet_style_token: 'disc',
      date_format_token: 'iso',
      density: 0.5,
      extensions: { 'org.hmalliances.history': { immutable: true } },
      page: {
        custom_height: null,
        custom_width: null,
        margins: {
          bottom: measurement,
          left: measurement,
          right: measurement,
          top: measurement
        },
        max_pages: null,
        orientation: 'portrait',
        show_page_numbers: false,
        size: 'A4'
      },
      palette: {
        background: color,
        muted_text: color,
        primary: color,
        secondary: color,
        text: color
      },
      section_layout: [],
      style_contract_version: '1.0',
      template_settings: {},
      typography: {
        base_size_pt: 10,
        font_family_token: 'inter',
        heading_scale: 1.2,
        letter_spacing_em: 0,
        line_height: 1.4
      }
    },
    template: { template_id: TEMPLATE_ID, version: '2.4.0' },
    title: 'Klee Resume',
    updated_at: '2026-07-22T10:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides
  }
}

/**
 * @brief 构造合法 revision summary / Build a valid revision summary.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return ResumeRevisionSummary JSON / ResumeRevisionSummary JSON.
 */
function revisionSummary(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    created_at: '2026-07-22T10:00:00Z',
    created_by: { id: 'user_01K0HISTORY000000000001', resource_type: 'user' },
    resume_id: RESUME_ID,
    revision: REVISION,
    ...overrides
  }
}

/**
 * @brief 构造合法完整 revision / Build a valid complete revision.
 * @param overrides 当前用例覆盖字段 / Fields overridden by the current case.
 * @return ResumeRevision JSON / ResumeRevision JSON.
 */
function revisionResource(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return { ...revisionSummary(), document: resumeDocument(), ...overrides }
}

/**
 * @brief 构造结构型 GET response / Build a structural GET response.
 * @param data 待领域解码数据 / Data awaiting domain decoding.
 * @return 固定 200 JSON response / Fixed 200 JSON response.
 */
function getResponse(data: unknown): ApiV2JsonResponse {
  return {
    data,
    headers: new Headers({ 'X-Request-Id': 'req_revision_history_123456' }),
    status: 200
  }
}

describe('API v2 Resume revision history', (): void => {
  it('reads a cursor page from the exact explicit-Workspace path', async (): Promise<void> => {
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const controller = new AbortController()
    /** @brief 返回下一页的结构型 client / Structural client returning a next page. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(
      getResponse({
        items: [revisionSummary()],
        page: { has_more: true, next_cursor: 'cursor_revision_next' }
      })
    )

    await expect(
      listWorkspaceResumeRevisionPage({ getJson }, WORKSPACE_ID, RESUME_ID, {
        cursor: 'cursor_revision_current',
        limit: 25,
        signal: controller.signal
      })
    ).resolves.toEqual({
      items: [revisionSummary()],
      page: { has_more: true, next_cursor: 'cursor_revision_next' }
    })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/revisions`,
      {
        expectedStatus: 200,
        maxResponseBytes: 512 * 1024,
        query: { cursor: 'cursor_revision_current', limit: 25 },
        signal: controller.signal
      }
    )
  })

  it('uses frozen pagination defaults without inventing a total count', async (): Promise<void> => {
    /** @brief 返回空终页的结构型 client / Structural client returning an empty terminal page. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse({ items: [], page: { has_more: false, next_cursor: null } }))

    await listWorkspaceResumeRevisionPage({ getJson }, WORKSPACE_ID, RESUME_ID)

    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/revisions`,
      {
        expectedStatus: 200,
        maxResponseBytes: 512 * 1024,
        query: { cursor: null, limit: 50 }
      }
    )
  })

  it('rejects duplicate or cross-Resume summaries', async (): Promise<void> => {
    /** @brief 依次返回重复与跨资源条目的 client / Client returning duplicate then cross-resource items. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValueOnce(
        getResponse({
          items: [revisionSummary(), revisionSummary()],
          page: { has_more: false, next_cursor: null }
        })
      )
      .mockResolvedValueOnce(
        getResponse({
          items: [revisionSummary({ resume_id: OTHER_RESUME_ID })],
          page: { has_more: false, next_cursor: null }
        })
      )

    await expect(
      listWorkspaceResumeRevisionPage({ getJson }, WORKSPACE_ID, RESUME_ID)
    ).rejects.toThrow(/duplicate/u)
    await expect(
      listWorkspaceResumeRevisionPage({ getJson }, WORKSPACE_ID, RESUME_ID)
    ).rejects.toThrow(/outside the requested Resume/u)
  })

  it('reads one immutable revision and preserves the complete historical SIR', async (): Promise<void> => {
    /** @brief 固定完整 revision 查询 / Fixed complete-revision query. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(getResponse(revisionResource()))

    await expect(
      getWorkspaceResumeRevision(
        { getJson },
        { resumeId: RESUME_ID, revision: REVISION, workspaceId: WORKSPACE_ID }
      )
    ).resolves.toEqual(revisionResource())
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/resumes/${RESUME_ID}/revisions/${REVISION}`,
      { expectedStatus: 200, maxResponseBytes: 16 * 1024 * 1024 }
    )
  })

  it.each([
    ['envelope Resume', revisionResource({ resume_id: OTHER_RESUME_ID })],
    ['requested revision', revisionResource({ revision: REVISION + 1 })],
    [
      'document Workspace',
      revisionResource({
        document: resumeDocument({ workspace_id: 'workspace_01K0OTHER000000001' })
      })
    ],
    ['document Resume', revisionResource({ document: resumeDocument({ id: OTHER_RESUME_ID }) })],
    [
      'document revision',
      revisionResource({ document: resumeDocument({ revision: REVISION - 1 }) })
    ]
  ])('fails closed for a mismatched %s identity', async (_label, payload): Promise<void> => {
    /** @brief 返回身份错配 revision 的 client / Client returning an identity-mismatched revision. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue(getResponse(payload))

    await expect(
      getWorkspaceResumeRevision(
        { getJson },
        { resumeId: RESUME_ID, revision: REVISION, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toThrow(/identities differ/u)
  })

  it.each([
    ['Workspace identity', { resumeId: RESUME_ID, revision: REVISION, workspaceId: 'bad/id' }],
    ['Resume identity', { resumeId: '../escape', revision: REVISION, workspaceId: WORKSPACE_ID }],
    ['revision', { resumeId: RESUME_ID, revision: 0, workspaceId: WORKSPACE_ID }]
  ])('rejects an invalid %s before dispatch', async (_label, request): Promise<void> => {
    /** @brief 不应执行的 GET / GET that must not execute. */
    const getJson = vi.fn<ApiV2Client['getJson']>()

    await expect(getWorkspaceResumeRevision({ getJson }, request)).rejects.toBeInstanceOf(
      ApiV2ContractError
    )
    expect(getJson).not.toHaveBeenCalled()
  })

  it('rejects unknown stable-object fields and malformed nested SIR', (): void => {
    expect(() => parseResumeRevision({ ...revisionResource(), legacy_html: '<p>no</p>' })).toThrow(
      ApiV2ContractError
    )
    expect(() =>
      parseResumeRevision(
        revisionResource({ document: resumeDocument({ locale: 'not_a_locale' }) })
      )
    ).toThrow(ApiV2ContractError)
  })

  it('preserves optional ResourceRef revision omission while enforcing exact list shape', (): void => {
    expect(
      parseResumeRevisionList({
        items: [revisionSummary()],
        page: { has_more: false, next_cursor: null }
      }).items[0]?.created_by
    ).toEqual({ id: 'user_01K0HISTORY000000000001', resource_type: 'user' })
    expect(() =>
      parseResumeRevisionList({
        items: [revisionSummary()],
        page: { has_more: false, next_cursor: null },
        total: 1
      })
    ).toThrow(ApiV2ContractError)
  })
})
