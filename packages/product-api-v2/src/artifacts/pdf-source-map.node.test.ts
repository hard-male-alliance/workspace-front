import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { getWorkspaceArtifactSourceMap, parsePdfSourceMap } from './pdf-source-map'

/** @brief source-map Workspace ID / Workspace ID used by source-map tests. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief source-map Artifact ID / Artifact ID used by source-map tests. */
const ARTIFACT_ID = 'artifact_01K0EXAMPLE000000001'

/** @brief source-map Resume ID / Resume ID used by source-map tests. */
const RESUME_ID = 'resume_01K0EXAMPLE0000000001'

/** @brief source-map entity ID / Entity ID used by source-map tests. */
const ENTITY_ID = 'section_01K0EXAMPLE000000001'

/**
 * @brief 构造 Schema 合法 PdfSourceMap / Build a schema-valid PdfSourceMap.
 * @param overrides 覆盖的顶层字段 / Top-level fields to override.
 * @return 含一个多矩形 node 的 source-map JSON / Source-map JSON with one multi-rectangle node.
 */
function sourceMap(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    artifact_id: ARTIFACT_ID,
    nodes: [
      {
        entity_id: ENTITY_ID,
        field_path: ['content', 'text'],
        page: 2,
        rects: [
          { height: 12.5, unit: 'pt', width: 100, x: -2.25, y: 40 },
          { height: 0, unit: 'pt', width: 25.5, x: 98, y: -0 }
        ]
      }
    ],
    resume_id: RESUME_ID,
    resume_revision: 18,
    ...overrides
  }
}

describe('API v2 PDF source-map consumer', (): void => {
  it('losslessly decodes coordinates, field paths, and pinned Resume revision', (): void => {
    /** @brief 已验证 source map / Validated source map. */
    const decoded = parsePdfSourceMap(sourceMap())

    expect(decoded).toMatchObject({
      artifact_id: ARTIFACT_ID,
      nodes: [
        {
          entity_id: ENTITY_ID,
          field_path: ['content', 'text'],
          page: 2,
          rects: [
            { height: 12.5, unit: 'pt', width: 100, x: -2.25, y: 40 },
            { height: 0, unit: 'pt', width: 25.5, x: 98, y: -0 }
          ]
        }
      ],
      resume_id: RESUME_ID,
      resume_revision: 18
    })
  })

  it('accepts the schema-defined empty nodes and field_path collections', (): void => {
    /** @brief 空 field_path 但含必需 rect 的 node / Node with an empty field_path and required rectangle. */
    const node = {
      entity_id: ENTITY_ID,
      field_path: [],
      page: 1,
      rects: [{ height: 0, unit: 'pt', width: 0, x: 0, y: 0 }]
    }

    expect(parsePdfSourceMap(sourceMap({ nodes: [] })).nodes).toEqual([])
    expect(parsePdfSourceMap(sourceMap({ nodes: [node] })).nodes[0]?.field_path).toEqual([])
  })

  it.each([
    ['wrong unit', { height: 1, unit: 'px', width: 1, x: 0, y: 0 }],
    ['negative width', { height: 1, unit: 'pt', width: -1, x: 0, y: 0 }],
    ['non-finite x', { height: 1, unit: 'pt', width: 1, x: Number.NaN, y: 0 }]
  ])('rejects a rectangle with %s', (_name, rect): void => {
    /** @brief 含非法矩形的 node / Node carrying an invalid rectangle. */
    const node = {
      entity_id: ENTITY_ID,
      field_path: ['content'],
      page: 1,
      rects: [rect]
    }

    expect(() => parsePdfSourceMap(sourceMap({ nodes: [node] }))).toThrow(ApiV2ContractError)
  })

  it('rejects empty rects, oversized field paths, and unknown fields', (): void => {
    /** @brief 不含矩形的 node / Node without a rectangle. */
    const emptyRects = {
      entity_id: ENTITY_ID,
      field_path: [],
      page: 1,
      rects: []
    }
    /** @brief 超过 20 段 field path 的 node / Node whose field path exceeds 20 segments. */
    const oversizedPath = {
      entity_id: ENTITY_ID,
      field_path: new Array<string>(21).fill('segment'),
      page: 1,
      rects: [{ height: 1, unit: 'pt', width: 1, x: 0, y: 0 }]
    }
    /** @brief 含未发布 total_pages 字段的 source map / Source map carrying an unpublished total_pages field. */
    const unknownField = sourceMap({ total_pages: 2 })

    expect(() => parsePdfSourceMap(sourceMap({ nodes: [emptyRects] }))).toThrow(ApiV2ContractError)
    expect(() => parsePdfSourceMap(sourceMap({ nodes: [oversizedPath] }))).toThrow(
      ApiV2ContractError
    )
    expect(() => parsePdfSourceMap(unknownField)).toThrow(ApiV2ContractError)
  })

  it('rejects more than 10000 nodes and sparse arrays', (): void => {
    /** @brief 最小合法 node / Minimal valid node. */
    const node = {
      entity_id: ENTITY_ID,
      field_path: [],
      page: 1,
      rects: [{ height: 1, unit: 'pt', width: 1, x: 0, y: 0 }]
    }
    /** @brief 稀疏 nodes 数组 / Sparse nodes array. */
    const sparseNodes = new Array<unknown>(1)

    expect(() =>
      parsePdfSourceMap(sourceMap({ nodes: new Array<unknown>(10_001).fill(node) }))
    ).toThrow(ApiV2ContractError)
    expect(() => parsePdfSourceMap(sourceMap({ nodes: sparseNodes }))).toThrow(ApiV2ContractError)
  })

  it('reads only the source map belonging to the path Artifact', async (): Promise<void> => {
    /** @brief 可观测 source-map GET / Observable source-map GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: sourceMap(),
      headers: new Headers(),
      status: 200
    })
    /** @brief 调用方取消信号 / Caller cancellation signal. */
    const signal = new AbortController().signal

    await expect(
      getWorkspaceArtifactSourceMap(
        { getJson },
        { artifactId: ARTIFACT_ID, signal, workspaceId: WORKSPACE_ID }
      )
    ).resolves.toMatchObject({ artifact_id: ARTIFACT_ID, resume_revision: 18 })
    expect(getJson).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/source-map`,
      { expectedStatus: 200, maxResponseBytes: 16 * 1024 * 1024, signal }
    )
  })

  it('rejects a source map for another Artifact identity', async (): Promise<void> => {
    /** @brief 返回其他 Artifact source map 的 GET / GET returning another Artifact source map. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: sourceMap({ artifact_id: 'artifact_01K0OTHER00000000001' }),
      headers: new Headers(),
      status: 200
    })

    await expect(
      getWorkspaceArtifactSourceMap(
        { getJson },
        { artifactId: ARTIFACT_ID, workspaceId: WORKSPACE_ID }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })
})
