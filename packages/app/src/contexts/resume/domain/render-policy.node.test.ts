/** @file Resume 输出格式领域策略测试 / Resume output-format domain-policy tests. */

import { describe, expect, it } from 'vitest'

import { deriveResumeRenderFormatAvailability } from './render-policy'

describe('deriveResumeRenderFormatAvailability', (): void => {
  it('intersects final output with PDF/DOCX and always exposes semantic JSON export', (): void => {
    expect(deriveResumeRenderFormatAvailability(['html_snapshot', 'docx', 'png', 'pdf'])).toEqual({
      exportFormats: ['json', 'pdf', 'docx'],
      finalFormats: ['pdf', 'docx']
    })
  })

  it('does not send Template-only PNG or HTML snapshot formats to API v2 Render', (): void => {
    expect(deriveResumeRenderFormatAvailability(['png', 'html_snapshot'])).toEqual({
      exportFormats: ['json'],
      finalFormats: []
    })
  })

  it('canonicalizes duplicate or reordered Template facts into replay-stable requests', (): void => {
    expect(deriveResumeRenderFormatAvailability(['docx', 'pdf', 'docx'])).toEqual({
      exportFormats: ['json', 'pdf', 'docx'],
      finalFormats: ['pdf', 'docx']
    })
  })
})
