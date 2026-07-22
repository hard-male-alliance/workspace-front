import { describe, expect, it, vi } from 'vitest'

import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { parseArtifact, type Artifact } from './artifact'
import {
  getWorkspaceArtifactContent,
  type AuthenticatedArtifactContentClient
} from './artifact-content'

/** @brief canonical Artifact Workspace ID / Workspace ID of the canonical Artifact. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Artifact ID / ID of the canonical Artifact. */
const ARTIFACT_ID = 'artifact_01K0EXAMPLE000000001'

/** @brief Artifact content 强 ETag / Strong ETag for Artifact content. */
const CONTENT_ETAG = '"artifact-content-sha256-v1"'

/** @brief Artifact content 响应 request ID / Request ID for Artifact content responses. */
const REQUEST_ID = 'request_artifact_bytes_1234'

/**
 * @brief 构造四字节的已验证 Artifact metadata / Build validated metadata for a four-byte Artifact.
 * @return 与 canonical identity 一致的 Artifact / Artifact retaining canonical identity.
 */
async function fourByteArtifact(): Promise<Artifact> {
  /** @brief canonical Artifact 的可变拷贝 / Mutable copy of the canonical Artifact. */
  const input = structuredClone(await readCanonicalExample('resume_pdf_artifact')) as Record<
    string,
    unknown
  >
  input.size_bytes = 4
  return parseArtifact(input)
}

/**
 * @brief 构造完整或部分 content 响应 / Build a complete or partial content response.
 * @param status HTTP 成功状态 / HTTP success status.
 * @param body 响应字节 / Response bytes.
 * @param overrides 响应头覆盖 / Response-header overrides.
 * @return 未消费 fetch Response / Unconsumed fetch Response.
 */
function contentResponse(
  status: 200 | 206,
  body: Uint8Array | null,
  overrides: Readonly<Record<string, string | null>> = {}
): Response {
  /** @brief 基础安全响应头 / Baseline safe response headers. */
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'Content-Length': String(body?.byteLength ?? 0),
    'Content-Type': 'application/pdf',
    ETag: CONTENT_ETAG,
    'X-Request-Id': REQUEST_ID
  })
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name)
    else headers.set(name, value)
  }
  /** @brief 脱离任何 SharedArrayBuffer 的 fetch body / Fetch body detached from any SharedArrayBuffer. */
  const responseBody = body === null ? null : Uint8Array.from(body).buffer
  return new Response(responseBody, { headers, status })
}

describe('API v2 Artifact content consumer', (): void => {
  it('returns a complete authenticated stream without exposing the protected URL', async (): Promise<void> => {
    /** @brief 受保护 content transport / Protected content transport. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, new Uint8Array([1, 2, 3, 4])))
    /** @brief 完整 content 读取结果 / Complete-content read result. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    expect(result).toMatchObject({
      acceptsByteRanges: true,
      completeSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      disposition: 'inline',
      entityTag: CONTENT_ETAG,
      expectedByteLength: 4,
      kind: 'complete',
      mediaType: 'application/pdf',
      requestId: REQUEST_ID,
      status: 200
    })
    expect(result.body).toBeInstanceOf(ReadableStream)
    expect(getAuthenticatedContent).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: null, range: null }
    )
  })

  it('keeps an exact 206 response in the partial branch', async (): Promise<void> => {
    /** @brief 返回合法部分内容的 transport / Transport returning valid partial content. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([2, 3]), { 'Content-Range': 'bytes 1-2/4' })
      )
    /** @brief 部分 content 读取结果 / Partial-content read result. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      {
        artifact: await fourByteArtifact(),
        ifRange: CONTENT_ETAG,
        range: { endByteInclusive: 2, startByte: 1 }
      }
    )

    expect(result).toMatchObject({
      contentRange: { completeSizeBytes: 4, endByteInclusive: 2, startByte: 1 },
      expectedByteLength: 2,
      kind: 'partial',
      status: 206
    })
    expect('completeSha256' in result).toBe(false)
    expect(getAuthenticatedContent).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}/content`,
      { ifRange: CONTENT_ETAG, range: 'bytes=1-2' }
    )
  })

  it('resolves an open-ended Range against authoritative metadata', async (): Promise<void> => {
    /** @brief 返回 open-ended 区间的 transport / Transport returning an open-ended selection. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([3, 4]), { 'Content-Range': 'bytes 2-3/4' })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact(), range: { startByte: 2 } }
      )
    ).resolves.toMatchObject({
      contentRange: { completeSizeBytes: 4, endByteInclusive: 3, startByte: 2 },
      kind: 'partial'
    })
    expect(getAuthenticatedContent).toHaveBeenCalledWith(expect.any(String), {
      ifRange: null,
      range: 'bytes=2-'
    })
  })

  it('keeps an RFC 9110 If-Range fallback as a validated complete response', async (): Promise<void> => {
    /** @brief If-Range 不匹配后返回完整新表示的 transport / Transport returning a complete new representation after an If-Range mismatch. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(200, new Uint8Array([1, 2, 3, 4]), {
          ETag: '"artifact-content-sha256-v2"'
        })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          ifRange: CONTENT_ETAG,
          range: { endByteInclusive: 2, startByte: 1 }
        }
      )
    ).resolves.toMatchObject({
      entityTag: '"artifact-content-sha256-v2"',
      expectedByteLength: 4,
      kind: 'complete',
      status: 200
    })
  })

  it.each([
    ['unsolicited 206', 206, { 'Content-Range': 'bytes 0-3/4' }, {}],
    [
      'mismatched Content-Range start',
      206,
      { 'Content-Length': '2', 'Content-Range': 'bytes 0-1/4' },
      { range: { endByteInclusive: 2, startByte: 1 } }
    ],
    [
      'mismatched Content-Range total',
      206,
      { 'Content-Length': '2', 'Content-Range': 'bytes 1-2/5' },
      { range: { endByteInclusive: 2, startByte: 1 } }
    ]
  ])('rejects %s', async (_name, status, headerOverrides, requestOverrides): Promise<void> => {
    /** @brief 为状态反例生成的字节 / Bytes generated for a status negative case. */
    const bytes = status === 200 ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([2, 3])
    /** @brief 返回非法响应的 transport / Transport returning an invalid response. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(status as 200 | 206, bytes, headerOverrides))

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact(), ...requestOverrides }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    ['wrong media type', { 'Content-Type': 'application/octet-stream' }],
    ['wrong length', { 'Content-Length': '3' }],
    ['weak ETag', { ETag: `W/${CONTENT_ETAG}` }],
    ['missing disposition', { 'Content-Disposition': null }],
    [
      'duplicate disposition parameters',
      { 'Content-Disposition': 'attachment; filename=a.pdf; FILENAME=b.pdf' }
    ],
    ['unexpected Content-Range', { 'Content-Range': 'bytes 0-3/4' }]
  ])('rejects a complete response with %s', async (_name, overrides): Promise<void> => {
    /** @brief 返回 header 反例的 transport / Transport returning a header negative case. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, new Uint8Array([1, 2, 3, 4]), overrides))

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects a 206 representation whose ETag differs from If-Range', async (): Promise<void> => {
    /** @brief 返回不同 content validator 的 transport / Transport returning a different content validator. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(
        contentResponse(206, new Uint8Array([2, 3]), {
          'Content-Range': 'bytes 1-2/4',
          ETag: '"different-artifact-representation"'
        })
      )

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          ifRange: CONTENT_ETAG,
          range: { endByteInclusive: 2, startByte: 1 }
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it('rejects an out-of-bounds request before dispatch', async (): Promise<void> => {
    /** @brief 不应被调用的 transport / Transport that must not be called. */
    const getAuthenticatedContent =
      vi.fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        {
          artifact: await fourByteArtifact(),
          range: { endByteInclusive: 4, startByte: 1 }
        }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
    expect(getAuthenticatedContent).not.toHaveBeenCalled()
  })

  it('rejects a consumed response body before handing out its stream', async (): Promise<void> => {
    /** @brief 即将被预先消费的响应 / Response that will be consumed in advance. */
    const response = contentResponse(200, new Uint8Array([1, 2, 3, 4]))
    await response.arrayBuffer()
    /** @brief 返回已消费 body 的 transport / Transport returning an already consumed body. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(response)

    await expect(
      getWorkspaceArtifactContent(
        { getAuthenticatedContent },
        { artifact: await fourByteArtifact() }
      )
    ).rejects.toBeInstanceOf(ApiV2ContractError)
  })

  it.each([
    ['shorter', new Uint8Array([1, 2, 3])],
    ['longer', new Uint8Array([1, 2, 3, 4, 5])]
  ])('fails the stream when the actual body is %s than metadata', async (_name, bytes) => {
    /** @brief 返回无 Content-Length 字节反例的 transport / Transport returning a byte-count negative case without Content-Length. */
    const getAuthenticatedContent = vi
      .fn<AuthenticatedArtifactContentClient['getAuthenticatedContent']>()
      .mockResolvedValue(contentResponse(200, bytes, { 'Content-Length': null }))
    /** @brief 头部验证成功后的计数 stream / Counting stream after header validation succeeds. */
    const result = await getWorkspaceArtifactContent(
      { getAuthenticatedContent },
      { artifact: await fourByteArtifact() }
    )

    expect(result.body).not.toBeNull()
    await expect(new Response(result.body).arrayBuffer()).rejects.toBeInstanceOf(ApiV2ContractError)
  })
})
