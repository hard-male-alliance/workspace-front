import { describe, expect, it, vi } from 'vitest'

import type { ApiV2Client } from '../http/client'
import { ApiV2ContractError } from '../http/errors'
import { readCanonicalExample } from '../test-support/contract.node-test-fixtures'
import { getWorkspaceArtifact, parseArtifact } from './artifact'

/** @brief canonical Artifact Workspace ID / Workspace ID of the canonical Artifact. */
const WORKSPACE_ID = 'ws_01K0EXAMPLE00000000000001'

/** @brief canonical Artifact ID / ID of the canonical Artifact. */
const ARTIFACT_ID = 'artifact_01K0EXAMPLE000000001'

/** @brief Artifact metadata 强 ETag / Strong ETag of the Artifact metadata. */
const ENTITY_TAG = '"artifact-metadata-1"'

/** @brief Artifact GET 响应 request ID / Request ID of the Artifact GET response. */
const REQUEST_ID = 'request_artifact_read_12345'

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

describe('API v2 Artifact metadata consumer', (): void => {
  it('decodes the canonical Artifact without losing integrity metadata', async (): Promise<void> => {
    /** @brief 唯一事实来源中的 Artifact / Artifact from the single source of truth. */
    const decoded = parseArtifact(await readCanonicalExample('resume_pdf_artifact'))

    expect(decoded).toMatchObject({
      id: ARTIFACT_ID,
      kind: 'resume_pdf',
      media_type: 'application/pdf',
      page_count: 2,
      size_bytes: 48_211,
      workspace_id: WORKSPACE_ID
    })
    expect(decoded.sha256).toHaveLength(64)
  })

  it.each([
    ['content_url', 'https://objects.example.invalid/file.pdf'],
    [
      'content_url',
      `https://api.hmalliances.org:8022/api/v2/workspaces/${WORKSPACE_ID}/artifacts/other_artifact_123456/content`
    ],
    ['media_type', 'application/pdf; charset=binary'],
    ['sha256', 'A'.repeat(64)],
    ['size_bytes', 1_073_741_825],
    ['kind', 'legacy_pdf']
  ])('rejects non-canonical %s metadata', async (field, value): Promise<void> => {
    /** @brief 含非法 metadata 的 Artifact / Artifact with invalid metadata. */
    const input = mutableRecord(await readCanonicalExample('resume_pdf_artifact'))
    input[field] = value

    expect(() => parseArtifact(input)).toThrow(ApiV2ContractError)
  })

  it('rejects unknown legacy download fields', async (): Promise<void> => {
    /** @brief 含额外签名 URL 的旧 Artifact / Old Artifact carrying an extra signed URL. */
    const input = mutableRecord(await readCanonicalExample('resume_pdf_artifact'))
    input.signed_download_url = 'https://objects.example.invalid/file.pdf'

    expect(() => parseArtifact(input)).toThrow(ApiV2ContractError)
  })

  it('reads metadata only through the Workspace-scoped v2 authority', async (): Promise<void> => {
    /** @brief canonical Artifact payload / Canonical Artifact payload. */
    const payload = await readCanonicalExample('resume_pdf_artifact')
    /** @brief 可观测 v2 GET / Observable v2 GET. */
    const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
      data: payload,
      headers: new Headers({ ETag: ENTITY_TAG, 'X-Request-Id': REQUEST_ID }),
      status: 200
    })

    await expect(
      getWorkspaceArtifact({ getJson }, { artifactId: ARTIFACT_ID, workspaceId: WORKSPACE_ID })
    ).resolves.toMatchObject({
      entityTag: ENTITY_TAG,
      requestId: REQUEST_ID,
      value: { id: ARTIFACT_ID, kind: 'resume_pdf' }
    })
    expect(getJson).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/artifacts/${ARTIFACT_ID}`, {
      expectedStatus: 200,
      maxResponseBytes: 512 * 1024
    })
  })

  it.each([null, 'W/"artifact-metadata-1"'])(
    'rejects an invalid metadata ETag (%s)',
    async (etag) => {
      /** @brief 组合可选 ETag 的响应头 / Response headers with an optional ETag. */
      const headers = new Headers({ 'X-Request-Id': REQUEST_ID })
      if (etag !== null) headers.set('ETag', etag)
      /** @brief 返回不可用校验器的 GET / GET returning an unusable validator. */
      const getJson = vi.fn<ApiV2Client['getJson']>().mockResolvedValue({
        data: await readCanonicalExample('resume_pdf_artifact'),
        headers,
        status: 200
      })

      await expect(
        getWorkspaceArtifact({ getJson }, { artifactId: ARTIFACT_ID, workspaceId: WORKSPACE_ID })
      ).rejects.toBeInstanceOf(ApiV2ContractError)
    }
  )
})
