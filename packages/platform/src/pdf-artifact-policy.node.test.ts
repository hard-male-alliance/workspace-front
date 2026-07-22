import { describe, expect, it } from 'vitest'

import { MAX_PDF_ARTIFACT_BYTES } from './artifact-save'
import {
  ARTIFACT_EXPIRY_SAFETY_WINDOW_MS,
  classifyFetchDecodedContentEncoding,
  createArtifactMetadataUrl,
  getMediaTypeEssence,
  parseArtifactContentLength,
  parsePdfArtifactMetadata,
  validateArtifactContentUrl
} from './pdf-artifact-policy'

/** @brief 测试产品 API origin / Product API origin used by tests. */
const API_ORIGIN = 'https://api.example.test'

/** @brief 测试产物 ID / Artifact ID used by tests. */
const ARTIFACT_ID = 'artifact_12345678'

/** @brief 固定测试时钟 / Fixed test clock. */
const NOW = Date.parse('2026-07-22T01:00:00Z')

/**
 * @brief 构造符合冻结 Schema 的 PDF 元数据 / Build PDF metadata matching the frozen schema.
 * @param overrides 待替换字段 / Fields to override.
 * @return 完整 RenderArtifact JSON / Complete RenderArtifact JSON.
 */
function createMetadata(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  return {
    content_type: 'application/pdf',
    created_at: '2026-07-22T00:00:00Z',
    download_url: `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content?signature=current`,
    expires_at: '2026-07-23T00:00:00Z',
    format: 'pdf',
    id: ARTIFACT_ID,
    page_count: 1,
    resume_id: 'resume_12345678',
    resume_revision: 3,
    revision: 1,
    sha256: 'a'.repeat(64),
    size_bytes: 512,
    source_map_artifact_id: null,
    updated_at: '2026-07-22T00:00:00Z',
    ...overrides
  }
}

describe('PDF artifact URL policy', () => {
  it('由不透明 ID 构造元数据 URL，并允许同产物签名内容 URL', () => {
    expect(createArtifactMetadataUrl(ARTIFACT_ID, API_ORIGIN).href).toBe(
      `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}`
    )
    expect(
      validateArtifactContentUrl(
        `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content?signature=current`,
        API_ORIGIN,
        ARTIFACT_ID
      ).href
    ).toBe(`${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content?signature=current`)
  })

  it.each([
    'https://evil.example/api/v1/render-artifacts/artifact_12345678/content',
    `${API_ORIGIN}/api/v1/render-artifacts/artifact_87654321/content`,
    `${API_ORIGIN}/api/v1/render-artifacts/${ARTIFACT_ID}/content#fragment`,
    `${API_ORIGIN}/api/v1/render-artifacts\\${ARTIFACT_ID}\\content`
  ])('拒绝越过 origin、身份或路径边界的 URL：%s', (candidate) => {
    expect(() => validateArtifactContentUrl(candidate, API_ORIGIN, ARTIFACT_ID)).toThrow()
  })
})

describe('parsePdfArtifactMetadata', () => {
  it('一次校验 Schema、PDF MIME、大小、过期时间与下载身份', () => {
    /** @brief 共享策略解码结果 / Result decoded by the shared policy. */
    const artifact = parsePdfArtifactMetadata(createMetadata(), {
      apiOrigin: API_ORIGIN,
      artifactId: ARTIFACT_ID,
      nowMilliseconds: NOW
    })

    expect(artifact.metadata.id).toBe(ARTIFACT_ID)
    expect(artifact.metadata.content_type).toBe('application/pdf')
    expect(artifact.contentUrl.searchParams.get('signature')).toBe('current')
  })

  it.each([
    ['another artifact', { id: 'artifact_87654321' }],
    ['non-PDF MIME', { content_type: 'text/html' }],
    ['oversized artifact', { size_bytes: MAX_PDF_ARTIFACT_BYTES + 1 }],
    [
      'expiry safety boundary',
      { expires_at: new Date(NOW + ARTIFACT_EXPIRY_SAFETY_WINDOW_MS).toISOString() }
    ]
  ])('拒绝违反 PDF 宿主策略的元数据：%s', (_caseName, overrides) => {
    expect(() =>
      parsePdfArtifactMetadata(createMetadata(overrides), {
        apiOrigin: API_ORIGIN,
        artifactId: ARTIFACT_ID,
        nowMilliseconds: NOW
      })
    ).toThrow()
  })
})

describe('Fetch-decoded response policy', () => {
  it.each([
    [null, 'identity'],
    ['identity', 'identity'],
    ['gzip', 'compressed'],
    ['br, gzip', 'compressed'],
    ['zstd', 'compressed'],
    ['compress', 'invalid'],
    ['identity, gzip', 'invalid'],
    ['gzip,', 'invalid']
  ] as const)('分类 Content-Encoding %j 为 %s', (header, expected) => {
    expect(classifyFetchDecodedContentEncoding(header)).toBe(expected)
  })

  it('只在 identity 语义下提供严格 Content-Length 解码器', () => {
    expect(parseArtifactContentLength(null)).toBeNull()
    expect(parseArtifactContentLength('512')).toBe(512)
    expect(() => parseArtifactContentLength('5.12')).toThrow()
    expect(() => parseArtifactContentLength('01')).toThrow()
  })

  it('共享媒体类型 essence 去除参数并规范化大小写', () => {
    expect(getMediaTypeEssence('Application/PDF; charset=binary')).toBe('application/pdf')
    expect(getMediaTypeEssence(null)).toBeNull()
  })
})
