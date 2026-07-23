import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client, ApiV2JsonResponse } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { listResumePage, parseResumeList } from './resume-list'

/** @brief 当前测试 Workspace / Workspace used by the current tests. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/**
 * @brief 构造最小合法 ResumeSummary / Build a minimal valid ResumeSummary.
 * @param workspaceId 摘要声明的 Workspace / Workspace declared by the summary.
 * @return API v2 ResumeSummary JSON / API v2 ResumeSummary JSON.
 */
function resumeSummary(workspaceId = WORKSPACE_ID): Record<string, unknown> {
  return {
    created_at: '2026-07-22T12:00:00Z',
    id: 'resume_01K0EXAMPLE000000000001',
    locale: 'zh-CN',
    revision: 17,
    template: {
      template_id: 'template_01K0EXAMPLE00000001',
      version: '2.4.0'
    },
    title: 'Klee Resume',
    updated_at: '2026-07-22T12:05:00Z',
    workspace_id: workspaceId
  }
}

/**
 * @brief 构造一个 ResumeList 页面 / Build one ResumeList page.
 * @param items 当前页条目 / Current-page items.
 * @return API v2 ResumeList JSON / API v2 ResumeList JSON.
 */
function resumePage(items: readonly unknown[]): Record<string, unknown> {
  return { items, page: { has_more: false, next_cursor: null } }
}

/**
 * @brief 构造伪 HTTP 响应 / Build a fake HTTP response.
 * @param data 响应 JSON / Response JSON.
 * @return Gateway 可消费的响应 / Response consumable by a gateway.
 */
function response(data: unknown): ApiV2JsonResponse {
  return { data, headers: new Headers(), status: 200 }
}

describe('API v2 ResumeList consumer', (): void => {
  it('decodes ResumeSummary rather than requiring a full v1 document', (): void => {
    expect(parseResumeList(resumePage([resumeSummary()]))).toMatchObject({
      items: [
        {
          revision: 17,
          template: { template_id: 'template_01K0EXAMPLE00000001', version: '2.4.0' },
          title: 'Klee Resume',
          workspace_id: WORKSPACE_ID
        }
      ],
      page: { has_more: false, next_cursor: null }
    })
  })

  it('rejects the v1 template_version spelling', (): void => {
    /** @brief v1 风格模板引用 / v1-style template reference. */
    const invalid = resumeSummary()
    invalid.template = {
      template_id: 'template_01K0EXAMPLE00000001',
      template_version: '2.4.0'
    }

    expect(() => parseResumeList(resumePage([invalid]))).toThrow(ApiV2ContractError)
  })

  it('uses the Workspace tenant path instead of a global collection plus filtering', async (): Promise<void> => {
    /** @brief 可观察的 v2 GET / Observable v2 GET. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(response(resumePage([resumeSummary()])))
    await expect(listResumePage({ getJson }, WORKSPACE_ID)).resolves.toMatchObject({
      items: [{ title: 'Klee Resume' }],
      page: { has_more: false, next_cursor: null }
    })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/resumes`, {
      maxResponseBytes: 512 * 1024,
      query: { cursor: null, limit: 50 }
    })
  })

  it('fails closed when any summary belongs to another Workspace', async (): Promise<void> => {
    /** @brief 返回跨 Workspace 数据的 GET / GET returning cross-Workspace data. */
    const getJson = vi
      .fn<ApiV2Client['getJson']>()
      .mockResolvedValue(response(resumePage([resumeSummary('ws_01K0OTHER000000000000001')])))
    await expect(listResumePage({ getJson }, WORKSPACE_ID)).rejects.toThrow('different Workspace')
    expect(getJson).toHaveBeenCalledOnce()
  })

  it('rejects an invalid Workspace ID before issuing a request', async (): Promise<void> => {
    /** @brief 不应调用的 v2 GET / v2 GET that must not be called. */
    const getJson = vi.fn<ApiV2Client['getJson']>()
    await expect(listResumePage({ getJson }, '../other')).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getJson).not.toHaveBeenCalled()
  })
})
