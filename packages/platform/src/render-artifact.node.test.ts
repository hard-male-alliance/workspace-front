import { describe, expect, it } from 'vitest'

import { parseRenderArtifactMetadata } from './render-artifact'

/** @brief 完整且符合冻结 Schema 的产物 / Complete artifact matching the frozen schema. */
const validArtifact = {
  id: 'artifact_123',
  created_at: '2026-07-22T08:00:00Z',
  updated_at: '2026-07-22T08:01:00.123+08:00',
  revision: 1,
  resume_id: 'resume_123',
  resume_revision: 4,
  format: 'pdf',
  content_type: 'application/pdf',
  size_bytes: 4,
  sha256: 'A'.repeat(64),
  download_url:
    'https://api.example.test/api/v1/render-artifacts/artifact_123/content?signature=abc%20def',
  expires_at: '2026-07-22T09:00:00Z',
  page_count: 2,
  source_map_artifact_id: 'artifact_map_123',
  extensions: { 'com.example.trace': { enabled: true } }
} as const

describe('parseRenderArtifactMetadata', () => {
  it('精确投影完整冻结结构并规范化 SHA-256 大小写', () => {
    expect(parseRenderArtifactMetadata(validArtifact)).toEqual({
      ...validArtifact,
      sha256: 'a'.repeat(64)
    })
  })

  it('保留合法缺省字段与显式 null 的区别', () => {
    /** @brief 仅含必需字段的产物 / Artifact containing required fields only. */
    const requiredOnly: Record<string, unknown> = { ...validArtifact }
    delete requiredOnly.expires_at
    delete requiredOnly.extensions
    delete requiredOnly.page_count
    delete requiredOnly.source_map_artifact_id
    expect(parseRenderArtifactMetadata(requiredOnly)).toEqual({
      ...requiredOnly,
      sha256: 'a'.repeat(64)
    })
    expect(
      parseRenderArtifactMetadata({
        ...requiredOnly,
        expires_at: null,
        page_count: null,
        source_map_artifact_id: null
      })
    ).toMatchObject({
      expires_at: null,
      page_count: null,
      source_map_artifact_id: null
    })
  })

  it('接受 RFC 3339 允许的小写 t/z 与闰秒', () => {
    const result = parseRenderArtifactMetadata({
      ...validArtifact,
      created_at: '2026-07-22t08:00:00z',
      updated_at: '2016-12-31T23:59:60Z'
    })

    expect(result.created_at).toBe('2026-07-22t08:00:00z')
    expect(result.updated_at).toBe('2016-12-31T23:59:60Z')
  })

  it.each([
    null,
    [],
    { ...validArtifact, hidden: true },
    { ...validArtifact, id: 'short' },
    { ...validArtifact, created_at: '2026-02-30T00:00:00Z' },
    { ...validArtifact, revision: 0 },
    { ...validArtifact, resume_revision: 1.5 },
    { ...validArtifact, format: 'future_format' },
    { ...validArtifact, content_type: '' },
    { ...validArtifact, size_bytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...validArtifact, sha256: 'g'.repeat(64) },
    { ...validArtifact, download_url: '/relative/content' },
    { ...validArtifact, download_url: 'https://api.example.test/a b' },
    { ...validArtifact, download_url: 'https://api.example.test/path[0]' },
    { ...validArtifact, download_url: 'https://api.example.test/path#one#two' },
    { ...validArtifact, download_url: 'https://api.example.test/{artifact}' },
    { ...validArtifact, download_url: 'https://api.example.test/content?signature=%zz' },
    { ...validArtifact, expires_at: undefined },
    { ...validArtifact, page_count: 0 },
    { ...validArtifact, source_map_artifact_id: 'short' },
    { ...validArtifact, extensions: { _private: true } }
  ])('拒绝非冻结 RenderArtifact：%o', (artifact) => {
    expect(() => parseRenderArtifactMetadata(artifact)).toThrow()
  })
})
